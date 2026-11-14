// Usage statistics in workerd (spec §7.6, ADR 0147): the beat and its
// validation, the write budget, online now, the public numbers, the flags,
// the cron's sample, roll-up and pruning, and the rate limit.
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Beat } from '../../shared/cloud/api.ts';
import worker from '../index.ts';
import { handle } from '../router.ts';
import type { Env } from '../runtime.ts';
import { DAILY_CRON, SAMPLE_CRON, onlineNow, publicStats, recordBeat, runCron } from '../stats.ts';
import { T, at, count, db, device, emptyTables, envWith, realEnv } from './helpers.ts';

const NOW = T('2026-11-14T12:00:00Z');

function beatOf(over: Partial<Beat> = {}): Beat {
  return { device: device(), version: '0.9.3', type: 'desktop', browser: 'firefox', state: 'menu', ...over };
}

/** A beat through the router (no rate limiter unless the env has one). */
function post(body: unknown, opts: { env?: Env; now?: number; raw?: boolean; headers?: Record<string, string> } = {}): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: opts.raw ? (body as BodyInit) : JSON.stringify(body),
  };
  return handle(new Request('https://example.test/api/beat', init), opts.env ?? envWith({ BEAT_LIMITER: undefined }), at(opts.now ?? NOW));
}

function get(path: string, env: Env = realEnv, now = NOW): Promise<Response> {
  return handle(new Request(`https://example.test${path}`), env, at(now));
}

beforeEach(emptyTables);

describe('POST /api/beat', () => {
  it('answers 204 and upserts one presence row per device', async () => {
    const b = beatOf({ state: 'playing', type: 'phone', browser: 'safari' });
    const res = await post(b);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(res.headers.get('cache-control')).toBe('no-store');
    await post({ ...b, state: 'menu' }, { now: NOW + 5 * 60_000 });
    await post({ ...b, state: 'replay' }, { now: NOW + 10 * 60_000 });
    expect(await count('presence')).toBe(1);
    const row = await db.prepare('SELECT * FROM presence').first();
    expect(row).toMatchObject({
      device: b.device,
      first_seen: NOW,
      last_seen: NOW + 10 * 60_000,
      state: 'replay',
      type: 'phone',
      browser: 'safari',
      version: '0.9.3',
      day: '2026-11-14',
      beats: 3,
      play_beats: 1,
    });
    // Nothing but the five fields and the counters is stored.
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ['beats', 'browser', 'day', 'device', 'first_seen', 'last_seen', 'play_beats', 'prev_beats', 'prev_day', 'prev_play_beats', 'state', 'type', 'version'].sort(),
    );
  });

  it('writes device_day once per device and UTC day', async () => {
    const b = beatOf();
    await post(b, { now: T('2026-11-14T10:00:00Z') });
    await post(b, { now: T('2026-11-14T23:59:59Z') });
    expect(await count('device_day')).toBe(1);
    await post(b, { now: T('2026-11-15T00:00:01Z') });
    await post(b, { now: T('2026-11-15T08:00:00Z') });
    const { results } = await db.prepare('SELECT day FROM device_day ORDER BY day').all<{ day: string }>();
    expect(results.map((r) => r.day)).toEqual(['2026-11-14', '2026-11-15']);
    // The first beat of the new day moved the old day's counts aside.
    expect(await db.prepare('SELECT day, beats, prev_day, prev_beats FROM presence').first()).toEqual({
      day: '2026-11-15',
      beats: 2,
      prev_day: '2026-11-14',
      prev_beats: 2,
    });
  });

  it('an ordinary beat writes one row; a first beat of the day two', async () => {
    const b = beatOf();
    // New device: the presence insert and its device_day row.
    expect(await recordBeat(db, b, NOW)).toBe(2);
    // The same day again: the upsert alone.
    expect(await recordBeat(db, { ...b, state: 'playing' }, NOW + 300_000)).toBe(1);
    expect(await recordBeat(db, b, NOW + 600_000)).toBe(1);
    // The next day: the upsert and the new day's device_day row.
    expect(await recordBeat(db, b, NOW + 86_400_000)).toBe(2);
    expect(await count('presence')).toBe(1);
    expect(await count('device_day')).toBe(2);
  });

  it('answers 400 bad_request to every malformed beat', async () => {
    const good = beatOf();
    const bad: [string, unknown][] = [
      ['null', null],
      ['an array', [good]],
      ['a string', 'beat'],
      ['a missing field', { device: good.device, version: good.version, type: good.type, browser: good.browser }],
      ['an extra field', { ...good, name: 'Gandalf' }],
      ['device not a UUID', { ...good, device: 'abc' }],
      ['device uppercase', { ...good, device: 'ABCDEF00-0000-4000-8000-000000000001' }],
      ['device a number', { ...good, device: 1 }],
      ['version not semver', { ...good, version: '0.9' }],
      ['version with words', { ...good, version: 'latest' }],
      ['version too long', { ...good, version: `1.2.3-${'a'.repeat(30)}` }],
      ['version a number', { ...good, version: 93 }],
      ['type unknown', { ...good, type: 'tv' }],
      ['browser unknown', { ...good, browser: 'opera' }],
      ['state unknown', { ...good, state: 'idle' }],
      ['state in capitals', { ...good, state: 'MENU' }],
      ['an inherited name', { ...good, type: 'constructor' }],
    ];
    for (const [what, body] of bad) {
      const res = await post(body);
      expect(res.status, what).toBe(400);
      expect(await res.json(), what).toEqual({ error: 'bad_request' });
    }
    for (const [what, raw] of [
      ['not JSON', '{device:'],
      ['empty', ''],
      ['too large', JSON.stringify({ ...good, pad: 'x'.repeat(600) })],
      ['not UTF-8', new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])],
    ] as [string, BodyInit][]) {
      const res = await post(raw, { raw: true });
      expect(res.status, what).toBe(400);
    }
    expect(await count('presence')).toBe(0);
  });

  it('accepts every listed type, browser and state and a pre-release version', async () => {
    for (const type of ['desktop', 'tablet', 'phone'] as const)
      for (const browser of ['firefox', 'chrome', 'safari', 'edge', 'samsung', 'other'] as const)
        for (const state of ['menu', 'playing', 'replay'] as const) expect((await post(beatOf({ type, browser, state }))).status).toBe(204);
    expect((await post(beatOf({ version: '1.0.0-rc.1' }))).status).toBe(204);
  });

  it('answers 404 not_found when stats is off, 503 unavailable without a database', async () => {
    const off = envWith({ FLAG_STATS: false, BEAT_LIMITER: undefined });
    const res = await post(beatOf(), { env: off });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
    const none = await post(beatOf(), { env: envWith({ DB: undefined, BEAT_LIMITER: undefined }) });
    expect(none.status).toBe(503);
    expect(await none.json()).toEqual({ error: 'unavailable' });
    expect(await count('presence')).toBe(0);
  });

  it('is rate limited by address (429 rate_limited), through the real binding', async () => {
    const post = (ip: string) =>
      exports.default.fetch('https://example.test/api/beat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify(beatOf()),
      });
    // The test Worker's limit is 5 a minute (worker/test/wrangler.jsonc).
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await post('192.0.2.77')).status);
    expect(statuses.slice(0, 5)).toEqual([204, 204, 204, 204, 204]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    const res = await post('192.0.2.77');
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    // Another address is not held back.
    expect((await post('192.0.2.78')).status).toBe(204);
  });

  it('only POST', async () => {
    const res = await get('/api/beat');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});

describe('online now and GET /api/stats/public', () => {
  it('counts devices seen in the last 6 minutes, the boundary included', async () => {
    await recordBeat(db, beatOf({ state: 'playing' }), NOW - 6 * 60_000);
    await recordBeat(db, beatOf({ state: 'menu' }), NOW - 60_000);
    await recordBeat(db, beatOf({ state: 'replay' }), NOW);
    await recordBeat(db, beatOf({ state: 'playing' }), NOW - 6 * 60_000 - 1);
    expect(await onlineNow(db, NOW)).toEqual({ total: 3, menu: 1, playing: 1, replay: 1 });
    expect(await publicStats(db, NOW)).toEqual({ online: 3, playing: 1 });
  });

  it('answers the newest sample when fresh, else counts live', async () => {
    await recordBeat(db, beatOf({ state: 'playing' }), NOW);
    await db.prepare('INSERT INTO stat_sample (ts, online, playing) VALUES (?1, 40, 12)').bind(NOW - 4 * 60_000).run();
    expect(await publicStats(db, NOW)).toEqual({ online: 40, playing: 12 });
    // Twelve minutes later the sample is stale and the device has gone.
    expect(await publicStats(db, NOW + 12 * 60_000)).toEqual({ online: 0, playing: 0 });
  });

  it('is public, cached a minute, and 404 when stats is off', async () => {
    await recordBeat(db, beatOf({ state: 'playing' }), NOW);
    const res = await get('/api/stats/public');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await res.json()).toEqual({ online: 1, playing: 1 });
    const off = await get('/api/stats/public', envWith({ FLAG_STATS: false }));
    expect(off.status).toBe(404);
    expect(await off.json()).toEqual({ error: 'not_found' });
  });
});

describe('flags and GET /api/config', () => {
  it('the var is the default; a flag row overrides it', async () => {
    const off = envWith({ FLAG_STATS: false });
    expect(await (await get('/api/config', off)).json()).toEqual({ flags: { stats: false } });
    expect(await (await get('/api/config', realEnv)).json()).toEqual({ flags: { stats: true } });
    expect(await (await get('/api/config', envWith({ FLAG_STATS: 'on' }))).json()).toEqual({ flags: { stats: true } });

    await db.prepare("INSERT INTO flag (name, value) VALUES ('stats', 1)").run();
    // A later clock than the cached read: the row is read again.
    const later = NOW + 60_000;
    expect(await (await get('/api/config', off, later)).json()).toEqual({ flags: { stats: true } });
    expect((await post(beatOf(), { env: envWith({ FLAG_STATS: false, BEAT_LIMITER: undefined }), now: later })).status).toBe(204);

    await db.prepare("UPDATE flag SET value = 0 WHERE name = 'stats'").run();
    const later2 = later + 60_000;
    expect(await (await get('/api/config', realEnv, later2)).json()).toEqual({ flags: { stats: false } });
    // Unknown rows are ignored.
    await db.prepare("INSERT INTO flag (name, value) VALUES ('nope', 1)").run();
    expect(await (await get('/api/config', realEnv, later2 + 60_000)).json()).toEqual({ flags: { stats: false } });
  });

  it('without a database (the static server) the flags are the vars, or off', async () => {
    const res = await get('/api/config', { ASSETS: realEnv.ASSETS });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ flags: { stats: false } });
    expect((await get('/api/stats/public', { ASSETS: realEnv.ASSETS })).status).toBe(404);
    expect((await post(beatOf(), { env: { ASSETS: realEnv.ASSETS } })).status).toBe(503);
  });
});

describe('cron: sample, roll-up, pruning', () => {
  const DAY = '2026-11-10';
  const at10 = T(`${DAY}T10:00:00Z`);
  const next = T('2026-11-11T00:05:00Z');
  const rollTime = T('2026-11-11T00:10:00Z');

  async function daily(day: string): Promise<Record<string, number>> {
    const { results } = await db.prepare('SELECT metric, key, value FROM stat_daily WHERE day = ?1').bind(day).all<{ metric: string; key: string; value: number }>();
    return Object.fromEntries(results.map((r) => [r.key ? `${r.metric}:${r.key}` : r.metric, r.value]));
  }

  it('samples online now every 5 minutes', async () => {
    await recordBeat(db, beatOf({ state: 'playing' }), at10 - 60_000);
    await recordBeat(db, beatOf({ state: 'menu' }), at10 - 60_000);
    await runCron(realEnv, SAMPLE_CRON, at10);
    await runCron(realEnv, SAMPLE_CRON, at10 + 5 * 60_000);
    const { results } = await db.prepare('SELECT ts, online, playing FROM stat_sample ORDER BY ts').all();
    expect(results).toEqual([
      { ts: at10, online: 2, playing: 1 },
      { ts: at10 + 5 * 60_000, online: 2, playing: 1 },
    ]);
  });

  it('rolls up the previous day at 00:10, idempotently', async () => {
    const a = beatOf({ type: 'desktop', browser: 'firefox', version: '0.9.3' });
    const b = beatOf({ type: 'phone', browser: 'safari', version: '0.9.2' });
    // A device seen the day before is not new on DAY.
    const old = beatOf({ type: 'desktop', browser: 'chrome', version: '0.9.3' });
    await recordBeat(db, old, T('2026-11-09T20:00:00Z'));
    for (let i = 0; i < 3; i++) await recordBeat(db, { ...a, state: 'playing' }, at10 + i * 300_000);
    await recordBeat(db, b, at10);
    await recordBeat(db, old, at10 + 3_600_000);
    await runCron(realEnv, SAMPLE_CRON, at10 + 120_000);
    // After midnight a beats again (its DAY counts move aside) and a new device appears.
    await recordBeat(db, { ...a, state: 'menu' }, next);
    await recordBeat(db, beatOf(), next);

    await runCron(realEnv, DAILY_CRON, rollTime);
    const first = await daily(DAY);
    expect(first).toEqual({
      devices: 3,
      new_devices: 2,
      peak_online: 3,
      peak_playing: 1,
      play_minutes: 15,
      beats: 5,
      'type:desktop': 2,
      'type:phone': 1,
      'browser:firefox': 1,
      'browser:safari': 1,
      'browser:chrome': 1,
      'version:0.9.3': 2,
      'version:0.9.2': 1,
    });
    const rows = await count('stat_daily');
    await runCron(realEnv, DAILY_CRON, rollTime);
    expect(await daily(DAY)).toEqual(first);
    expect(await count('stat_daily')).toBe(rows);
  });

  it('prunes samples after 90 days, device days and idle devices after 35', async () => {
    const now = rollTime;
    const day = 86_400_000;
    await db.batch([
      db.prepare('INSERT INTO stat_sample (ts, online, playing) VALUES (?1, 1, 0)').bind(now - 91 * day),
      db.prepare('INSERT INTO stat_sample (ts, online, playing) VALUES (?1, 1, 0)').bind(now - 89 * day),
      db.prepare('INSERT INTO device_day (day, device) VALUES (?1, ?2)').bind('2026-10-06', 'x'),
      db.prepare('INSERT INTO device_day (day, device) VALUES (?1, ?2)').bind('2026-10-08', 'y'),
    ]);
    const idle = beatOf();
    const kept = beatOf();
    await recordBeat(db, idle, now - 36 * day);
    await recordBeat(db, kept, now - 34 * day);
    await db.prepare('DELETE FROM device_day WHERE device IN (?1, ?2)').bind(idle.device, kept.device).run();

    await runCron(realEnv, DAILY_CRON, now);
    expect((await db.prepare('SELECT ts FROM stat_sample').all<{ ts: number }>()).results.map((r) => r.ts)).toEqual([now - 89 * day]);
    expect((await db.prepare('SELECT day FROM device_day').all<{ day: string }>()).results.map((r) => r.day)).toEqual(['2026-10-08']);
    expect((await db.prepare('SELECT device FROM presence').all<{ device: string }>()).results.map((r) => r.device)).toEqual([kept.device]);
  });

  it('does nothing without a database', async () => {
    await expect(runCron({ ASSETS: realEnv.ASSETS }, DAILY_CRON, rollTime)).resolves.toBeUndefined();
  });

  it('the scheduled handler runs the cron', async () => {
    await recordBeat(db, beatOf(), at10);
    const ctx = createExecutionContext();
    worker.scheduled(createScheduledController({ cron: SAMPLE_CRON, scheduledTime: at10 + 60_000 }), realEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(await count('stat_sample')).toBe(1);
  });
});
