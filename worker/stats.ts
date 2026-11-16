// Usage statistics on the server (spec §7.6, ADR 0147): the beat, online
// now, the 5-minute sample, the daily roll-up and pruning, and the admin
// page's numbers. Tables: worker/migrations/0001_usage_statistics.sql.
//
// Nothing here stores or logs an address: the rate limit (router.ts) uses
// it in passing.
import {
  type AdminDailyMetric,
  type AdminDay,
  type AdminGraphDay,
  type AdminGraphRange,
  type AdminGraphs,
  type AdminSplit,
  type AdminStats,
  BEAT_MINUTES,
  BEAT_STATES,
  BROWSERS,
  type Beat,
  type BeatState,
  DEVICE_TYPES,
  ONLINE_MINUTES,
  type PublicStats,
} from '../shared/cloud/api.ts';
import { pruneAttempts } from './attempts.ts';
import { adminFlags } from './flags.ts';
import { flushReportMail } from './mail.ts';
import { refreshMume } from './mume.ts';
import { DAY_MS, type D1, type Deps, type Env, dayStart, utcDay } from './runtime.ts';
import { sweepCommunity } from './community.ts';
import { sweepPubs } from './pub.ts';
import { sweepPrefixes } from './runs.ts';
import { pruneSessions } from './sessions.ts';

// --- The beat ---

/** The largest beat body accepted. A real one is about 150 bytes. */
export const MAX_BEAT_BYTES = 512;
/** The longest version string accepted. */
export const MAX_VERSION_LENGTH = 32;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** `0.9.3`, `1.0.0-rc.1`: three numbers and an optional short pre-release tag. */
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z][0-9A-Za-z.-]{0,15})?$/;
const BEAT_KEYS = ['browser', 'device', 'state', 'type', 'version'];

function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

/**
 * A beat from a parsed body, or null when anything is off: not an object,
 * a missing or extra field, a field of the wrong type or outside its list.
 * The device id is a UUID (lowercase, as `crypto.randomUUID()` makes it).
 */
export function parseBeat(body: unknown): Beat | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const keys = Object.keys(b).sort();
  if (keys.length !== BEAT_KEYS.length || keys.some((k, i) => k !== BEAT_KEYS[i])) return null;
  const { device, version, type, browser, state } = b;
  if (typeof device !== 'string' || !UUID.test(device)) return null;
  if (typeof version !== 'string' || version.length > MAX_VERSION_LENGTH || !VERSION.test(version)) return null;
  if (!oneOf(DEVICE_TYPES, type) || !oneOf(BROWSERS, browser) || !oneOf(BEAT_STATES, state)) return null;
  return { device, version, type, browser, state };
}

/**
 * The body as text, or null when it is longer than `max` bytes (by its
 * Content-Length or by what arrives) or not UTF-8. Reads no more than
 * `max` + one chunk.
 */
export async function readCapped(request: Request, max: number): Promise<string | null> {
  const all = await readBytesCapped(request, max);
  if (all === null) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(all);
  } catch {
    return null;
  }
}

/**
 * The body's bytes, or null when it is longer than `max` bytes (by its
 * Content-Length or by what arrives). Reads no more than `max` + one chunk.
 */
export async function readBytesCapped(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = request.headers.get('content-length');
  if (declared !== null && !(Number(declared) <= max)) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return all;
}

/**
 * The presence upsert: the only row an ordinary beat writes. `beats` and
 * `play_beats` count the beats of the UTC day `day`; the first beat of a
 * new day moves them to `prev_*` and starts again at 1 (SQLite evaluates
 * every SET expression against the old row). RETURNING `beats` tells the
 * caller whether this was the device's first beat of the day.
 */
const UPSERT = `
INSERT INTO presence (device, first_seen, last_seen, state, type, browser, version, day, beats, play_beats)
VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8)
ON CONFLICT (device) DO UPDATE SET
  last_seen = excluded.last_seen,
  state = excluded.state,
  type = excluded.type,
  browser = excluded.browser,
  version = excluded.version,
  prev_day = CASE WHEN day = excluded.day THEN prev_day ELSE day END,
  prev_beats = CASE WHEN day = excluded.day THEN prev_beats ELSE beats END,
  prev_play_beats = CASE WHEN day = excluded.day THEN prev_play_beats ELSE play_beats END,
  beats = CASE WHEN day = excluded.day THEN beats + 1 ELSE 1 END,
  play_beats = CASE WHEN day = excluded.day THEN play_beats + excluded.play_beats ELSE excluded.play_beats END,
  day = excluded.day
RETURNING beats`;

/**
 * Records a beat: one upsert of the device's `presence` row and, on its
 * first beat of the UTC day only, one `device_day` row (INSERT OR IGNORE,
 * so two tabs racing at midnight still make one). Returns the rows written
 * as D1 reports them.
 */
export async function recordBeat(db: D1, beat: Beat, now: number): Promise<number> {
  const day = utcDay(now);
  const res = await db
    .prepare(UPSERT)
    .bind(beat.device, now, beat.state, beat.type, beat.browser, beat.version, day, beat.state === 'playing' ? 1 : 0)
    .run<{ beats: number }>();
  let written = res.meta.rows_written ?? 0;
  if (res.results[0]?.beats === 1) {
    const dd = await db.prepare('INSERT OR IGNORE INTO device_day (day, device) VALUES (?1, ?2)').bind(day, beat.device).run();
    written += dd.meta.rows_written ?? 0;
  }
  return written;
}

// --- Online now ---

export type Online = { total: number } & Record<BeatState, number>;

/** Devices seen in the last ONLINE_MINUTES (the boundary included), by state. */
export async function onlineNow(db: D1, now: number): Promise<Online> {
  const { results } = await db
    .prepare('SELECT state, COUNT(*) AS n FROM presence WHERE last_seen >= ?1 GROUP BY state')
    .bind(now - ONLINE_MINUTES * 60_000)
    .all<{ state: string; n: number }>();
  const out: Online = { total: 0, menu: 0, playing: 0, replay: 0 };
  for (const r of results) {
    if ((BEAT_STATES as readonly string[]).includes(r.state)) out[r.state as BeatState] = r.n;
    out.total += r.n;
  }
  return out;
}

/** A sample older than this is not used for the public count (the cron is not running). */
export const SAMPLE_FRESH_MS = 2 * BEAT_MINUTES * 60_000;

/**
 * `GET /api/stats/public`: the newest cron sample when it is fresh (one row
 * read, however many devices there are), else counted live (a scan of
 * `presence`: local development, or a cron that has stopped).
 */
export async function publicStats(db: D1, now: number): Promise<PublicStats> {
  const s = await db.prepare('SELECT ts, online, playing FROM stat_sample ORDER BY ts DESC LIMIT 1').first<{ ts: number; online: number; playing: number }>();
  if (s && s.ts <= now && now - s.ts <= SAMPLE_FRESH_MS) return { online: s.online, playing: s.playing };
  const o = await onlineNow(db, now);
  return { online: o.total, playing: o.playing };
}

// --- Cron ---

/** The cron expressions of wrangler.jsonc (`triggers.crons`). */
export const SAMPLE_CRON = '*/5 * * * *';
export const DAILY_CRON = '10 0 * * *';

/** Kept: samples 90 days; device_day and idle presence 35 days (ADR 0147). */
export const KEEP_SAMPLES_DAYS = 90;
export const KEEP_DEVICES_DAYS = 35;

/** The 5-minute sample of online now. Run again for the same time, it replaces its row. */
export async function sample(db: D1, now: number): Promise<void> {
  const o = await onlineNow(db, now);
  await db.prepare('INSERT OR REPLACE INTO stat_sample (ts, online, playing) VALUES (?1, ?2, ?3)').bind(now, o.total, o.playing).run();
}

/** The SUM over presence of a day's beats (`col` = beats or play_beats), wherever the row keeps them. */
function sumBeats(col: 'beats' | 'play_beats'): string {
  return `SUM(CASE WHEN day = ?1 THEN ${col} WHEN prev_day = ?1 THEN prev_${col} ELSE 0 END)`;
}

interface DayFigures {
  devices: number;
  newDevices: number;
  peakOnline: number;
  peakPlaying: number;
  samples: number;
  beats: number;
  playBeats: number;
}

/** A day's figures, read from device_day, presence and stat_sample in one batch. */
async function dayFigures(db: D1, day: string): Promise<DayFigures> {
  const start = dayStart(day);
  const [dd, fresh, peak, beats] = await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM device_day WHERE day = ?1').bind(day),
    db.prepare('SELECT COUNT(*) AS n FROM presence WHERE first_seen >= ?1 AND first_seen < ?2').bind(start, start + DAY_MS),
    db
      .prepare('SELECT COUNT(*) AS n, MAX(online) AS online, MAX(playing) AS playing FROM stat_sample WHERE ts >= ?1 AND ts < ?2')
      .bind(start, start + DAY_MS),
    db.prepare(`SELECT ${sumBeats('beats')} AS beats, ${sumBeats('play_beats')} AS play FROM presence`).bind(day),
  ]);
  const row = (r: (typeof dd) | undefined): Record<string, unknown> => (r?.results[0] as Record<string, unknown> | undefined) ?? {};
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  return {
    devices: num(row(dd).n),
    newDevices: num(row(fresh).n),
    samples: num(row(peak).n),
    peakOnline: num(row(peak).online),
    peakPlaying: num(row(peak).playing),
    beats: num(row(beats).beats),
    playBeats: num(row(beats).play),
  };
}

/** The splits of a day's devices by type, browser and version (as their presence rows say now). */
async function daySplits(db: D1, day: string): Promise<Record<'type' | 'browser' | 'version', AdminSplit>> {
  const q = (col: string) =>
    db
      .prepare(`SELECT p.${col} AS key, COUNT(*) AS n FROM device_day d JOIN presence p ON p.device = d.device WHERE d.day = ?1 GROUP BY p.${col}`)
      .bind(day);
  const [type, browser, version] = await db.batch<{ key: string; n: number }>([q('type'), q('browser'), q('version')]);
  const split = (r: typeof type): AdminSplit => Object.fromEntries((r?.results ?? []).map((x) => [x.key, x.n]));
  return { type: split(type), browser: split(browser), version: split(version) };
}

/** The `stat_daily` metrics of a plain number (key ''). */
const DAILY_METRICS = ['devices', 'new_devices', 'peak_online', 'peak_playing', 'play_minutes', 'beats'] as const;

/**
 * Stage 66's metrics (ADR 0157 "Graph data"): the devices of the 7 and 30
 * days up to the day, new accounts, the storage totals (as they are when
 * read: at the roll-up, a few minutes after the day), and the day's
 * sharing. Migration 0007 backfilled what the tables still knew.
 */
export const PANEL_METRICS = [
  'devices_7d',
  'devices_30d',
  'new_accounts',
  'accounts',
  'item_bytes',
  'run_bytes',
  'pub_bytes',
  'pubs_new',
  'listed_new',
  'votes',
  'comments',
  'notes',
  'reports',
  'views',
] as const;
type PanelMetric = (typeof PANEL_METRICS)[number];

/** Stage 66's metrics of a day, in one batch (scans of small tables: once a day, and live for today on /admin's graphs). */
async function panelFigures(db: D1, day: string): Promise<Record<PanelMetric, number>> {
  const start = dayStart(day);
  const [counts, totals] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT (SELECT COUNT(DISTINCT device) FROM device_day WHERE day > ?1 AND day <= ?2) AS devices_7d,
                (SELECT COUNT(DISTINCT device) FROM device_day WHERE day > ?3 AND day <= ?2) AS devices_30d,
                (SELECT COUNT(*) FROM account WHERE created >= ?4 AND created < ?5) AS new_accounts,
                (SELECT COUNT(*) FROM publication WHERE state <> 'pending' AND created >= ?4 AND created < ?5) AS pubs_new,
                (SELECT COUNT(*) FROM publication WHERE listed_at >= ?4 AND listed_at < ?5) AS listed_new,
                (SELECT COUNT(*) FROM vote WHERE updated >= ?4 AND updated < ?5) AS votes,
                (SELECT COUNT(*) FROM comment WHERE created >= ?4 AND created < ?5) AS comments,
                (SELECT COUNT(*) FROM note WHERE created >= ?4 AND created < ?5) AS notes,
                (SELECT COUNT(*) FROM report WHERE created >= ?4 AND created < ?5) AS reports,
                (SELECT COUNT(*) FROM pub_view WHERE day = ?2) AS views`,
      )
      .bind(utcDay(start - 7 * DAY_MS), day, utcDay(start - 30 * DAY_MS), start, start + DAY_MS),
    db.prepare(
      `SELECT COUNT(*) AS accounts, COALESCE(SUM(item_bytes), 0) AS item_bytes, COALESCE(SUM(run_bytes), 0) AS run_bytes, COALESCE(SUM(pub_bytes), 0) AS pub_bytes FROM account`,
    ),
  ]);
  const row = { ...(counts?.results[0] ?? {}), ...(totals?.results[0] ?? {}) };
  const out = {} as Record<PanelMetric, number>;
  for (const m of PANEL_METRICS) out[m] = Number(row[m] ?? 0);
  return out;
}

/**
 * The roll-up of one UTC day into `stat_daily`. Idempotent: the day's rows
 * are replaced in one transaction, so running it twice (or again after a
 * failure) leaves the same rows. Returns the rows it wrote.
 */
export async function rollUp(db: D1, day: string): Promise<number> {
  const f = await dayFigures(db, day);
  const s = await daySplits(db, day);
  const panel = await panelFigures(db, day);
  const plain: Record<(typeof DAILY_METRICS)[number] | PanelMetric, number> = {
    ...panel,
    devices: f.devices,
    new_devices: f.newDevices,
    peak_online: f.peakOnline,
    peak_playing: f.peakPlaying,
    play_minutes: f.playBeats * BEAT_MINUTES,
    beats: f.beats,
  };
  const rows: [string, string, number][] = Object.entries(plain).map(([m, v]) => [m, '', v]);
  for (const metric of ['type', 'browser', 'version'] as const) for (const [k, v] of Object.entries(s[metric])) rows.push([metric, k, v]);
  const insert = 'INSERT INTO stat_daily (day, metric, key, value) VALUES (?1, ?2, ?3, ?4)';
  await db.batch([db.prepare('DELETE FROM stat_daily WHERE day = ?1').bind(day), ...rows.map(([m, k, v]) => db.prepare(insert).bind(day, m, k, v))]);
  return rows.length;
}

/** Drops samples older than 90 days, and device days and idle devices older than 35. */
export async function prune(db: D1, now: number): Promise<void> {
  const devices = now - KEEP_DEVICES_DAYS * DAY_MS;
  await db.batch([
    db.prepare('DELETE FROM stat_sample WHERE ts < ?1').bind(now - KEEP_SAMPLES_DAYS * DAY_MS),
    db.prepare('DELETE FROM device_day WHERE day < ?1').bind(utcDay(devices)),
    db.prepare('DELETE FROM presence WHERE last_seen < ?1').bind(devices),
  ]);
}

/**
 * The Worker's `scheduled` handler: the sample every 5 minutes; at 00:10
 * UTC the roll-up of the previous day, then pruning, and the accounts'
 * own pruning (stale attempt counters, expired sessions: spec §7.10),
 * the deleted accounts' R2 prefixes, and the published runs' part (old
 * views, pending rows left behind, tombstones' objects: worker/pub.ts),
 * which runs whether or not the statistics' part failed. Every 5 minutes
 * also the reports' collected mail of an hour that has ended past the
 * cap (worker/mail.ts; `deps` gives it the EmailMessage). Nothing without
 * a database.
 */
export async function runCron(env: Env, cron: string, time: number, deps?: Deps): Promise<void> {
  const db = env.DB;
  if (!db) return;
  if (cron === DAILY_CRON) {
    try {
      await rollUp(db, utcDay(time - DAY_MS));
      await prune(db, time);
    } finally {
      await pruneAttempts(db, time);
      await pruneSessions(db, time);
      await sweepPrefixes(env, time);
      await sweepPubs(env, time);
      await sweepCommunity(env, time);
    }
  } else {
    try {
      await sample(db, time);
    } finally {
      try {
        // The collected mail of an hour past the reports' mail cap (worker/mail.ts).
        if (deps) await flushReportMail(env, deps, time);
      } finally {
        // MUME's lists and player count, every 15 minutes (worker/mume.ts;
        // skips while mume_cache does not exist, never throws).
        if (deps) await refreshMume(deps, db, time);
      }
    }
  }
}

// --- The admin page's numbers ---

/** The free plan's daily limits (Workers and D1, 2026). */
export const FREE_LIMITS = { requests: 100_000, rowsWritten: 100_000, rowsRead: 5_000_000 };

const EMPTY_DAY = (day: string): AdminDay => ({ day, devices: 0, newDevices: 0, peakOnline: 0, peakPlaying: 0, playMinutes: 0, beats: 0 });

/** `GET /api/admin/stats`. */
export async function adminStats(env: Env, db: D1, now: number): Promise<AdminStats> {
  const today = utcDay(now);
  const online = await onlineNow(db, now);
  const f = await dayFigures(db, today);
  const since = utcDay(now - 30 * DAY_MS);
  const [daily, week, month, presence, latest, yesterday] = await db.batch([
    db.prepare("SELECT day, metric, value FROM stat_daily WHERE day >= ?1 AND day < ?2 AND key = ''").bind(since, today),
    db.prepare('SELECT COUNT(DISTINCT device) AS n FROM device_day WHERE day >= ?1').bind(utcDay(now - 6 * DAY_MS)),
    db.prepare('SELECT COUNT(DISTINCT device) AS n FROM device_day WHERE day >= ?1').bind(utcDay(now - 29 * DAY_MS)),
    db.prepare('SELECT COUNT(*) AS n FROM presence'),
    db.prepare("SELECT MAX(day) AS day FROM stat_daily WHERE metric = 'type'"),
    db.prepare('SELECT COUNT(*) AS n FROM stat_daily WHERE day = ?1').bind(utcDay(now - DAY_MS)),
  ]);
  const first = (r: typeof week | undefined, k: string): unknown => (r?.results[0] as Record<string, unknown> | undefined)?.[k];
  const n = (v: unknown): number => (typeof v === 'number' ? v : 0);

  const byDay = new Map<string, AdminDay>();
  const field: Record<string, keyof AdminDay> = {
    devices: 'devices',
    new_devices: 'newDevices',
    peak_online: 'peakOnline',
    peak_playing: 'peakPlaying',
    play_minutes: 'playMinutes',
    beats: 'beats',
  };
  for (const r of (daily?.results ?? []) as { day: string; metric: string; value: number }[]) {
    const d = byDay.get(r.day) ?? EMPTY_DAY(r.day);
    const k = field[r.metric];
    if (k && k !== 'day') d[k] = r.value;
    byDay.set(r.day, d);
  }
  const days = [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1));

  const splitDay = first(latest, 'day');
  const split = typeof splitDay === 'string' ? await rolledSplit(db, splitDay) : null;

  // The estimate (ADR 0147, addendum): what we count ourselves.
  //   requests: every beat, plus at most about one /api/config or
  //     /api/stats/public per beat (both are fetched once per page load,
  //     and every page load beats), plus the cron runs. Static files are
  //     free and not counted.
  //   rows written: a row per beat, a device_day row per device of the
  //     day, a row per sample, and yesterday's roll-up rows.
  //   rows read: about two per beat (the upsert and the config or stats
  //     answer) plus one scan of presence per sample.
  const rolled = n(first(yesterday, 'n'));
  const presenceRows = n(first(presence, 'n'));
  const usage = {
    requests: f.beats * 2 + f.samples + (rolled ? 1 : 0),
    rowsWritten: f.beats + f.devices + f.samples + rolled,
    rowsRead: f.beats * 2 + f.samples * presenceRows,
    limits: FREE_LIMITS,
  };

  return {
    now,
    online,
    today: {
      day: today,
      devices: f.devices,
      newDevices: f.newDevices,
      peakOnline: Math.max(f.peakOnline, online.total),
      peakPlaying: Math.max(f.peakPlaying, online.playing),
      playMinutes: f.playBeats * BEAT_MINUTES,
      beats: f.beats,
    },
    days,
    weekly: n(first(week, 'n')),
    monthly: n(first(month, 'n')),
    split,
    usage,
    flags: await adminFlags(env, now),
  };
}

async function rolledSplit(db: D1, day: string): Promise<NonNullable<AdminStats['split']>> {
  const { results } = await db
    .prepare("SELECT metric, key, value FROM stat_daily WHERE day = ?1 AND metric IN ('type', 'browser', 'version')")
    .bind(day)
    .all<{ metric: 'type' | 'browser' | 'version'; key: string; value: number }>();
  const out = { day, type: {} as AdminSplit, browser: {} as AdminSplit, version: {} as AdminSplit };
  for (const r of results) out[r.metric][r.key] = r.value;
  return out;
}

// --- The admin panel's graphs (stage 66, ADR 0157 "Graph data") ---

/** Per range: how far back the online graph reaches, its bucket in minutes, and the days shown (null: all). */
export const GRAPH_RANGES: Record<AdminGraphRange, { ms: number | null; bucket: number; days: number | null }> = {
  '24h': { ms: DAY_MS, bucket: 5, days: 2 },
  '7d': { ms: 7 * DAY_MS, bucket: 30, days: 7 },
  '30d': { ms: 30 * DAY_MS, bucket: 60, days: 30 },
  '90d': { ms: 90 * DAY_MS, bucket: 180, days: 90 },
  all: { ms: null, bucket: 1440, days: null },
};

const GRAPH_METRICS: ReadonlySet<string> = new Set<AdminDailyMetric>([...DAILY_METRICS, ...PANEL_METRICS]);
const SPLITS = ['type', 'browser', 'version'] as const;

/**
 * `GET /api/admin/graphs?range=`: the rolled-up days of the range from
 * `stat_daily` (at most one row per day and metric) and today read live;
 * online from `stat_sample`, the highest per bucket (at most 25 920 rows
 * for 90 days), or for `all` the days' peaks. Four batches at once, no
 * query per row.
 */
export async function adminGraphs(db: D1, range: AdminGraphRange, now: number): Promise<AdminGraphs> {
  const r = GRAPH_RANGES[range];
  const today = utcDay(now);
  const since = r.days === null ? '' : utcDay(now - (r.days - 1) * DAY_MS);
  const bucketMs = r.bucket * 60_000;
  // The range's batch and today's three reads go out at once (review fix CR5): none needs another's answer.
  const [[online, daily, splits, largest, sharing], f, live, todaySplit] = await Promise.all([
    db.batch<Record<string, unknown>>([
    r.ms === null
      ? db.prepare(
          `SELECT day, MAX(CASE WHEN metric = 'peak_online' THEN value END) AS online, MAX(CASE WHEN metric = 'peak_playing' THEN value END) AS playing
           FROM stat_daily WHERE metric IN ('peak_online', 'peak_playing') AND key = '' AND day < ?1 GROUP BY day ORDER BY day`,
        ).bind(today)
      : db
          // (The bucket cast: a bound number may arrive as REAL, and the division must be whole.)
          .prepare(
            'SELECT (ts / CAST(?2 AS INTEGER)) * CAST(?2 AS INTEGER) AS ts, MAX(online) AS online, MAX(playing) AS playing FROM stat_sample WHERE ts > ?1 AND ts <= ?3 GROUP BY ts / CAST(?2 AS INTEGER) ORDER BY 1',
          )
          .bind(now - r.ms, bucketMs, now),
    db.prepare("SELECT day, metric, value FROM stat_daily WHERE day >= ?1 AND day < ?2 AND key = '' ORDER BY day").bind(since, today),
    db.prepare("SELECT metric, key, SUM(value) AS n FROM stat_daily WHERE day >= ?1 AND day < ?2 AND metric IN ('type', 'browser', 'version') GROUP BY metric, key").bind(since, today),
    db.prepare('SELECT name, item_bytes, run_bytes, pub_bytes FROM account WHERE item_bytes + run_bytes + pub_bytes > 0 ORDER BY item_bytes + run_bytes + pub_bytes DESC, name_key LIMIT 10'),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM publication WHERE state IN ('active', 'hidden')) AS pubs,
              (SELECT COUNT(*) FROM publication WHERE state = 'active' AND listed = 1) AS listed,
              (SELECT COUNT(*) FROM publication WHERE state = 'hidden') AS hidden,
              (SELECT COUNT(*) FROM vote) AS votes,
              (SELECT COUNT(*) FROM comment WHERE state = 'active') AS comments,
              (SELECT COUNT(*) FROM note WHERE state = 'active') AS notes,
              (SELECT COUNT(*) FROM report WHERE handled = 0) AS open_reports`,
    ),
    ]),
    // Today, live.
    dayFigures(db, today),
    panelFigures(db, today),
    daySplits(db, today),
  ]);
  const n = (v: unknown): number => Number(v ?? 0);

  const points = (online?.results ?? []).map((p) => ({ ts: typeof p.day === 'string' ? dayStart(p.day) : n(p.ts), online: n(p.online), playing: n(p.playing) }));
  if (r.ms === null && f.samples > 0) points.push({ ts: dayStart(today), online: f.peakOnline, playing: f.peakPlaying });

  const byDay = new Map<string, AdminGraphDay>();
  for (const row of daily?.results ?? []) {
    const day = String(row.day);
    const metric = String(row.metric);
    if (!GRAPH_METRICS.has(metric)) continue;
    const d = byDay.get(day) ?? { day, final: true, m: {} };
    d.m[metric as AdminDailyMetric] = n(row.value);
    byDay.set(day, d);
  }
  const days = [...byDay.values()];
  days.push({
    day: today,
    final: false,
    m: {
      devices: f.devices,
      new_devices: f.newDevices,
      peak_online: f.peakOnline,
      peak_playing: f.peakPlaying,
      play_minutes: f.playBeats * BEAT_MINUTES,
      beats: f.beats,
      ...live,
    },
  });

  const split: AdminGraphs['split'] = { type: {}, browser: {}, version: {} };
  for (const row of splits?.results ?? []) {
    const m = row.metric as (typeof SPLITS)[number];
    if (SPLITS.includes(m)) split[m][String(row.key)] = n(row.n);
  }
  for (const m of SPLITS) for (const [k, v] of Object.entries(todaySplit[m])) split[m][k] = (split[m][k] ?? 0) + v;

  const sh = sharing?.results[0] ?? {};
  return {
    range,
    now,
    bucketMinutes: r.bucket,
    online: points,
    days,
    split,
    storage: { accounts: live.accounts, itemBytes: live.item_bytes, runBytes: live.run_bytes, pubBytes: live.pub_bytes },
    largest: (largest?.results ?? []).map((a) => ({ name: String(a.name), itemBytes: n(a.item_bytes), runBytes: n(a.run_bytes), pubBytes: n(a.pub_bytes) })),
    sharing: { pubs: n(sh.pubs), listed: n(sh.listed), hidden: n(sh.hidden), votes: n(sh.votes), comments: n(sh.comments), notes: n(sh.notes), openReports: n(sh.open_reports) },
  };
}
