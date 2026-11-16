// The admin's audit log (spec §7.9, ADR 0154, ADR 0157 "The audit log
// cannot be changed afterwards"): table `admin_log`
// (worker/migrations/0005_share.sql, 0007_admin_panel.sql).
//
//   - Every entry goes in through `sealedBatch`, in the same transaction
//     as the action it records. Nothing in the Worker updates or deletes
//     an entry (a test greps the source for it), and the database's
//     triggers refuse both.
//   - Each entry is sealed: `mac` = HMAC-SHA-256 under `logKey` (derived
//     from the secret AUTH_PEPPER, label `wc-admin-log`) of the entry's
//     fields with `prev`, the `mac` of the entry before it. A trigger
//     refuses an insert whose `prev` is not the newest entry's `mac`; when
//     two actions race, the later batch rolls back whole and is tried
//     again with the new head (up to RETRIES times).
//   - `GET /api/admin/log` checks the whole chain: a row changed or removed
//     from the console (with the triggers dropped) no longer matches.
import { ADMIN_LOG_BROKEN_SHOWN, ADMIN_LOG_PAGE, type AdminLogChain, type AdminLogKind, type AdminLogPage, type AdminLogRow } from '../shared/cloud/api.ts';
import { hmacKey, hmacWith, sha256, toB64url, utf8 } from './bytes.ts';
import type { D1, D1Result, D1Statement, Env } from './runtime.ts';

/** Tries after the first when the chain moved under a batch. */
export const RETRIES = 3;

/** What an entry says. */
export interface LogLine {
  ts: number;
  who: string;
  action: string;
  target: string;
  note: string;
}

/** A row of `admin_log` as stored. */
export interface LogRecord extends LogLine {
  id: number;
  prev: string | null;
  mac: string | null;
}

const keys = new Map<string, Promise<CryptoKey>>();

/** Whether the log has a secret key: AUTH_PEPPER of 16 characters or more. */
export function isKeyed(env: Pick<Env, 'AUTH_PEPPER'>): boolean {
  return (env.AUTH_PEPPER ?? '').length >= 16;
}

/**
 * The log's key: HMAC(AUTH_PEPPER, 'wc-admin-log'), so the pepper itself
 * never keys two things. Without a pepper of 16 characters (a local
 * Worker) SHA-256 of the label, as `whoOf` does: such a seal shows order
 * and accidents, not tampering, and the check says `unkeyed`.
 */
function logKey(env: Pick<Env, 'AUTH_PEPPER'>): Promise<CryptoKey> {
  const id = isKeyed(env) ? (env.AUTH_PEPPER ?? '') : '';
  let k = keys.get(id);
  if (!k) {
    k = (async () => {
      const raw = id ? await hmacWith(await hmacKey(utf8(id)), 'wc-admin-log') : await sha256(utf8('wc-admin-log'));
      return hmacKey(raw);
    })();
    keys.set(id, k);
  }
  return k;
}

/** The seal of an entry after `prev`: the fields as a JSON array (no separator can be forged inside a note). */
async function sealOf(key: CryptoKey, prev: string | null, line: LogLine): Promise<string> {
  return toB64url(await hmacWith(key, JSON.stringify([prev ?? '', line.ts, line.who, line.action, line.target, line.note])));
}

/** The seal of `line` after `prev` (tests, and the chain's check). */
export async function macOf(env: Pick<Env, 'AUTH_PEPPER'>, prev: string | null, line: LogLine): Promise<string> {
  return sealOf(await logKey(env), prev, line);
}

/** The newest entry's seal (null for none, or an unsealed one). */
async function head(db: D1): Promise<string | null> {
  const row = await db.prepare('SELECT mac FROM admin_log ORDER BY id DESC LIMIT 1').first<{ mac: string | null }>();
  return row?.mac ?? null;
}

function chainMoved(e: unknown): boolean {
  return /admin_log_chain/.test(String(e instanceof Error ? e.message : e));
}

/**
 * Runs `build(entry)` as one batch, `entry` being the sealed insert of
 * `line`. `guard` (an SQL condition whose placeholders start at ?8, with
 * its `binds`) makes the entry hold only while it is true (the account
 * delete's). When the chain moved between the read of its head and the
 * batch, the batch rolled back whole: it is built again on the new head,
 * up to RETRIES more times; then the error is thrown.
 */
export async function sealedBatch<T = Record<string, unknown>>(
  env: Pick<Env, 'AUTH_PEPPER'>,
  db: D1,
  line: LogLine,
  build: (entry: D1Statement) => D1Statement[],
  guard?: { where: string; binds: unknown[] },
): Promise<D1Result<T>[]> {
  const key = await logKey(env);
  for (let attempt = 0; ; attempt++) {
    const prev = await head(db);
    const mac = await sealOf(key, prev, line);
    const entry = db
      .prepare(`INSERT INTO admin_log (ts, who, action, target, note, prev, mac) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7${guard ? ` WHERE ${guard.where}` : ''}`)
      .bind(line.ts, line.who, line.action, line.target, line.note, prev, mac, ...(guard?.binds ?? []));
    try {
      return await db.batch<T>(build(entry));
    } catch (e) {
      if (attempt >= RETRIES || !chainMoved(e)) throw e;
    }
  }
}

/** An entry on its own (with nothing else in its batch). */
export async function logOnly(env: Pick<Env, 'AUTH_PEPPER'>, db: D1, line: LogLine): Promise<void> {
  await sealedBatch(env, db, line, (entry) => [entry]);
}

// --- Reading it ---

export type ChainState = AdminLogChain;

/**
 * The chain's check over every row, oldest first (review fixes S2, S3).
 * Rows up to `legacy` (written before migration 0007) without a seal are
 * "not sealed"; every other row must be sealed, name the row before as its
 * `prev` (null after the unsealed ones) and carry the seal of its fields.
 * Each row that does not is broken: a row changed at its own id, a row
 * removed at the next one, a seal removed at its row. The check goes on
 * after a break, anchored on each row's stored seal, so a later change
 * shows even when an older one does. (The tail cut off cannot be seen
 * here: the page shows the head and the count, ADR 0157.)
 */
export async function verifyChain(env: Pick<Env, 'AUTH_PEPPER'>, rows: LogRecord[], legacy: number): Promise<ChainState> {
  const key = await logKey(env);
  let sealed = 0;
  let unsealed = 0;
  const broken: number[] = [];
  let brokenCount = 0;
  const brk = (id: number): void => {
    brokenCount++;
    if (broken.length < ADMIN_LOG_BROKEN_SHOWN) broken.push(id);
  };
  let before: string | null = null;
  for (const r of rows) {
    if (r.mac === null) {
      if (r.id <= legacy) unsealed++;
      else brk(r.id);
      before = null;
      continue;
    }
    sealed++;
    if ((r.prev ?? null) !== before || (await sealOf(key, r.prev, r)) !== r.mac) brk(r.id);
    before = r.mac;
  }
  const last = rows.at(-1);
  const state = brokenCount ? 'broken' : isKeyed(env) ? 'intact' : 'unkeyed';
  return { state, sealed, unsealed, brokenAt: broken[0] ?? null, broken, brokenCount, head: (last?.mac ?? '').slice(0, 12) };
}

/** The actions of a kind of the Log view's filter. */
export function kindOf(action: string): AdminLogKind | null {
  if (/^(pub|comment|note)\./.test(action)) return 'moderation';
  if (action === 'account.limits' || action === 'limits.default') return 'limits';
  if (action.startsWith('account.')) return 'accounts';
  if (action.startsWith('flag.')) return 'flags';
  return null;
}

export function rowOf(r: LogRecord): AdminLogRow {
  return { id: r.id, ts: r.ts, action: r.action, target: r.target, note: r.note, by: r.who.slice(0, 8), sealed: r.mac !== null };
}

export const LOG_COLUMNS = 'id, ts, who, action, target, note, prev, mac';

/**
 * `GET /api/admin/log?before=&kind=&q=`: every row is read once (the
 * chain's check needs them all; the log grows by the admin's hand, a few
 * rows a day), then filtered and cut here. `total` counts the entries the
 * filter matches. The Log view's read; it does not poll.
 */
export async function logPage(env: Pick<Env, 'AUTH_PEPPER'>, db: D1, o: { before: number | null; kind: AdminLogKind | null; q: string }): Promise<AdminLogPage> {
  const [all, meta] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT ${LOG_COLUMNS} FROM admin_log ORDER BY id`),
    // Where the chain starts (migration 0007; a missing row reads 0, so every unsealed entry is broken).
    db.prepare('SELECT MAX(legacy_max) AS n FROM admin_log_meta'),
  ]);
  const results = (all?.results ?? []) as unknown as LogRecord[];
  const chain = await verifyChain(env, results, Number(meta?.results[0]?.n ?? 0));
  const q = o.q.toLowerCase();
  const matching = results.filter((r) => (!o.kind || kindOf(r.action) === o.kind) && (!q || r.target.toLowerCase().includes(q))).reverse();
  const from = o.before === null ? matching : matching.filter((r) => r.id < o.before!);
  const page = from.slice(0, ADMIN_LOG_PAGE);
  const more = from.length > page.length;
  return { entries: page.map(rowOf), next: more ? (page.at(-1)?.id ?? null) : null, total: matching.length, chain };
}
