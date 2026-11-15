// The run bodies (spec §7.5, ADR 0153 "The Worker"; the contract is "Runs
// in the cloud" in shared/cloud/api.ts). Reached through worker/auth.ts,
// so every request has passed the flag `accounts`, the limits, the CSRF
// rule and the session; the flag `runs` is checked there too.
//
//   PUT    /api/u/runs/<id>     body = the blob; Content-Length required
//   GET    /api/u/runs/<id>     the blob
//   DELETE /api/u/runs/<id>     removes it
//   GET    /api/u/runs          every body of the account, the usage, the limits
//
// A body lives in R2 (`FILES`) under `u/<account id>/<id>`; D1 keeps
// `run_body` (its size) and `account.run_bytes` (worker/migrations/0004_runs.sql).
// The server never reads a body.
//
// A PUT keeps the counter honest without a transaction over R2:
//
//   1. Reserve: `run_bytes += grow` only while that stays within the
//      account's `runBytes` (one conditional UPDATE, so two parallel PUTs
//      never pass the limit together). `grow` is the new size less the
//      stored body's, and never below 0: a PUT that does not grow is never
//      refused, and a shrink frees its room only once it is stored.
//   2. Stream the body to R2 through a FixedLengthStream of the declared
//      length (R2 needs it known; a body that is short or long fails), and
//      check the stored size.
//   3. One batch: the counter takes the reservation back and adds the new
//      size less what `run_body` holds at that moment, and `run_body` is
//      written. So the counter ends exactly at the sum of `run_body`, also
//      when two PUTs of one id raced.
//
// When step 2 fails before R2 stored anything, the reservation is given
// back and the answer is 503. When R2 stored an object that cannot be
// trusted (its size is not the declared one, or the put ended but the
// request's stream failed), the object goes with its row and its bytes
// (503 too: the client puts again). When the account was deleted
// meanwhile, the object is removed again (and the prefix's sweep row,
// worker/migrations/0004_runs.sql, catches what that misses).
//
// 4. A DELETE of the same id may have removed the object between steps 2
//    and 3 (and its row before step 3 wrote it again): the object is
//    looked for once more, and when it is gone its row and bytes go too
//    (503: the client puts again). So `run_body` never names a body R2
//    does not hold, and `run_bytes` stays their sum.
import { type RunBodyList, type RunBodyWritten, type RunQuota, type RunTooLarge, SYNC_ID_PATTERN } from '../shared/cloud/api.ts';
import { type AccountRow, limitsOf, usageOf } from './accounts.ts';
import type { D1, Deps, Env, R2, R2Head } from './runtime.ts';
import { API_HEADERS, DAY_MS, error, json } from './runtime.ts';
import type { Authed } from './sessions.ts';

/** What a handler here uses of auth.ts's context. */
export interface RunsCtx {
  request: Request;
  env: Env;
  url: URL;
  deps: Deps;
  db: D1;
  now: number;
  auth: Authed | null;
}

type Handler = (c: RunsCtx) => Promise<Response>;

const LIST_PATH = '/api/u/runs';
const BODY_PREFIX = '/api/u/runs/';

export function isRunsPath(path: string): boolean {
  return path === LIST_PATH || path.startsWith(BODY_PREFIX);
}

const ROUTES: Record<string, Record<string, Handler>> = {
  [LIST_PATH]: { GET: list },
  [BODY_PREFIX]: { PUT: put, GET: get, DELETE: remove },
};

/** The route of a runs path, or undefined (404). */
export function runsRoute(path: string): Record<string, Handler> | undefined {
  if (path === LIST_PATH) return ROUTES[LIST_PATH];
  if (path.startsWith(BODY_PREFIX) && path.length > BODY_PREFIX.length) return ROUTES[BODY_PREFIX];
  return undefined;
}

/** The R2 prefix of an account's objects. */
export const prefixOf = (accountId: string): string => `u/${accountId}/`;
const keyOf = (accountId: string, id: string): string => `${prefixOf(accountId)}${id}`;

/** The id of a body path, or null (400). */
function idOf(c: RunsCtx): string | null {
  const id = c.url.pathname.slice(BODY_PREFIX.length);
  return SYNC_ID_PATTERN.test(id) ? id : null;
}

type UsageRow = Pick<AccountRow, 'item_count' | 'item_bytes' | 'run_bytes'>;

const USAGE_SQL = 'SELECT item_count, item_bytes, run_bytes FROM account WHERE id = ?1';

/** The FixedLengthStream of the Workers runtime (absent under Node, where the bytes are read first). */
type FixedLength = new (length: number) => { readable: ReadableStream; writable: WritableStream };
const FixedLengthStream = (globalThis as { FixedLengthStream?: FixedLength }).FixedLengthStream;

// --- PUT /api/u/runs/<id> ---

/** `Content-Length` as a whole number, `null` when it is missing, NaN when it is not one. */
function lengthOf(request: Request): number | null {
  const v = request.headers.get('content-length');
  if (v === null) return null;
  return /^\d{1,15}$/.test(v.trim()) ? Number(v.trim()) : Number.NaN;
}

async function put(c: RunsCtx): Promise<Response> {
  const { account } = c.auth as Authed;
  const id = idOf(c);
  if (id === null) return error('bad_request', 400);
  const type = (c.request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/octet-stream') return error('bad_request', 400);
  const size = lengthOf(c.request);
  if (size === null) return error('length_required', 411);
  if (Number.isNaN(size) || size === 0 || !c.request.body) return error('bad_request', 400);
  const limits = limitsOf(account, c.env);
  if (size > limits.runMaxBytes) return json({ error: 'run_too_large', limit: limits.runMaxBytes } satisfies RunTooLarge, 413);
  const bucket = c.env.FILES;
  if (!bucket) return error('unavailable', 503);

  // 1. Reserve the room.
  const old = await c.db.prepare('SELECT size FROM run_body WHERE account = ?1 AND id = ?2').bind(account.id, id).first<{ size: number }>();
  const grow = Math.max(size - (old?.size ?? 0), 0);
  if (grow > 0) {
    const reserved = await c.db
      .prepare('UPDATE account SET run_bytes = run_bytes + ?2 WHERE id = ?1 AND run_bytes + ?2 <= ?3')
      .bind(account.id, grow, limits.runBytes)
      .run();
    if (reserved.meta.changes !== 1) {
      const cur = await c.db.prepare(USAGE_SQL).bind(account.id).first<UsageRow>();
      // The account was deleted while this request ran.
      if (!cur) return error('unauthorized', 401);
      return json({ error: 'quota', used: cur.run_bytes, limit: limits.runBytes, size } satisfies RunQuota, 413);
    }
  }
  const giveBack = async (): Promise<void> => {
    if (grow > 0) await c.db.prepare('UPDATE account SET run_bytes = run_bytes - ?2 WHERE id = ?1').bind(account.id, grow).run();
  };

  // 2. The body to R2.
  const key = keyOf(account.id, id);
  let stored: Stored;
  try {
    stored = await store(bucket, key, c.request, size);
  } catch {
    stored = null;
  }
  if (stored === null || stored === 'untrusted' || stored.size !== size) {
    // R2 put is atomic: a failed one leaves the old body (if any) as it
    // was. An object stored that is not trusted (another size, which a
    // FixedLengthStream should never let by, or a stream that failed after
    // the put ended) replaced the old body: it is removed with its row.
    if (stored !== null) await dropBody(c, bucket, account.id, id, grow).catch(() => {});
    else await giveBack().catch(() => {});
    return error('unavailable', 503);
  }

  // 3. The row, and the counter made exact. When the batch fails (it is
  // one transaction, so nothing of it applied) the reservation goes back;
  // the object stays until the client's retry writes it again.
  let results: Awaited<ReturnType<D1['batch']>>;
  try {
    results = await c.db.batch<UsageRow>([
    c.db
      .prepare('UPDATE account SET run_bytes = run_bytes - ?2 + ?3 - COALESCE((SELECT size FROM run_body WHERE account = ?1 AND id = ?4), 0) WHERE id = ?1')
      .bind(account.id, grow, size, id),
    c.db
      .prepare(
        `INSERT INTO run_body (account, id, size, created) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM account WHERE id = ?1)
         ON CONFLICT (account, id) DO UPDATE SET size = excluded.size, created = excluded.created`,
      )
      .bind(account.id, id, size, c.now),
    c.db.prepare(USAGE_SQL).bind(account.id),
    ]);
  } catch {
    await giveBack().catch(() => {});
    return error('unavailable', 503);
  }
  const after = results[2]?.results[0] as UsageRow | undefined;
  if (results[1]?.meta.changes !== 1 || !after) {
    // The account was deleted while the body was uploaded.
    await bucket.delete(key).catch(() => {});
    return error('unauthorized', 401);
  }

  // 4. A DELETE that raced this PUT: the object gone, the row written again.
  let there: R2Head | null;
  try {
    there = await bucket.head(key);
  } catch {
    // R2 cannot say: the row stays (the client's check of the bodies finds a body that is gone).
    return json({ size, usage: usageOf(after) } satisfies RunBodyWritten);
  }
  if (!there) {
    await dropRow(c, account.id, id).catch(() => {});
    return error('unavailable', 503);
  }
  return json({ size, usage: usageOf(after) } satisfies RunBodyWritten);
}

/** What `store` came to: the stored head; null when nothing was stored; `untrusted` when R2 stored an object from a stream that failed. */
type Stored = R2Head | { size: number } | 'untrusted' | null;

/** Streams the request's body to R2 as exactly `size` bytes (see `Stored`). Throws when R2 fails, or the stream before R2 stored anything. */
async function store(bucket: R2, key: string, request: Request, size: number): Promise<Stored> {
  const options = { httpMetadata: { contentType: 'application/octet-stream' } };
  if (FixedLengthStream && request.body) {
    const fixed = new FixedLengthStream(size);
    // A short (or long) body fails the pipe and with it the put. A put
    // that fails on its own stops the pipe (nothing reads it any more).
    const stop = new AbortController();
    const pump = request.body.pipeTo(fixed.writable, { signal: stop.signal }).then(
      () => null,
      (e: unknown) => e ?? new Error('pipe failed'),
    );
    let head: R2Head | null;
    try {
      head = await bucket.put(key, fixed.readable, options);
    } catch (e) {
      stop.abort();
      fixed.readable.cancel().catch(() => {});
      throw e;
    }
    // R2 took the object, but the stream failed: what it holds cannot be trusted.
    const failed = await pump;
    if (failed !== null) return head ? 'untrusted' : null;
    return head;
  }
  // No FixedLengthStream (a host that is not workerd): the bytes first.
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length !== size) return null;
  return bucket.put(key, bytes, options);
}

/** Removes a body: the object, then its row and its bytes (and `alsoBack`, a reservation still held). */
async function dropBody(c: RunsCtx, bucket: R2, accountId: string, id: string, alsoBack = 0): Promise<UsageRow | null> {
  await bucket.delete(keyOf(accountId, id));
  return dropRow(c, accountId, id, alsoBack);
}

/** Removes a body's row and its bytes (and `alsoBack`) in one batch; the usage after. */
async function dropRow(c: RunsCtx, accountId: string, id: string, alsoBack = 0): Promise<UsageRow | null> {
  const results = await c.db.batch<UsageRow>([
    c.db
      .prepare('UPDATE account SET run_bytes = run_bytes - ?3 - COALESCE((SELECT size FROM run_body WHERE account = ?1 AND id = ?2), 0) WHERE id = ?1')
      .bind(accountId, id, alsoBack),
    c.db.prepare('DELETE FROM run_body WHERE account = ?1 AND id = ?2').bind(accountId, id),
    c.db.prepare(USAGE_SQL).bind(accountId),
  ]);
  return results[2]?.results[0] ?? null;
}

// --- GET and DELETE /api/u/runs/<id> ---

async function get(c: RunsCtx): Promise<Response> {
  const { account } = c.auth as Authed;
  const id = idOf(c);
  if (id === null) return error('bad_request', 400);
  const bucket = c.env.FILES;
  if (!bucket) return error('unavailable', 503);
  const obj = await bucket.get(keyOf(account.id, id));
  if (!obj) return error('not_found', 404);
  return new Response(obj.body, {
    headers: {
      ...API_HEADERS,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(obj.size),
    },
  });
}

async function remove(c: RunsCtx): Promise<Response> {
  const { account } = c.auth as Authed;
  const id = idOf(c);
  if (id === null) return error('bad_request', 400);
  const bucket = c.env.FILES;
  if (!bucket) return error('unavailable', 503);
  // The object first: when R2 fails nothing has changed (503), and the
  // client deletes again.
  const after = await dropBody(c, bucket, account.id, id);
  if (!after) return error('unauthorized', 401);
  return json({ size: 0, usage: usageOf(after) } satisfies RunBodyWritten);
}

// --- GET /api/u/runs ---

async function list(c: RunsCtx): Promise<Response> {
  const { account } = c.auth as Authed;
  const [bodies, usage] = await c.db.batch<Record<string, unknown>>([
    c.db.prepare('SELECT id, size, created FROM run_body WHERE account = ?1 ORDER BY created, id').bind(account.id),
    c.db.prepare(USAGE_SQL).bind(account.id),
  ]);
  const row = usage?.results[0] as UsageRow | undefined;
  if (!row) return error('unauthorized', 401);
  const answer: RunBodyList = {
    bodies: (bodies?.results ?? []) as RunBodyList['bodies'],
    usage: usageOf(row),
    limits: limitsOf(account, c.env),
  };
  return json(answer);
}

// --- Emptying a deleted account's prefix ---

/** The most keys one R2 delete takes, and one list page. */
const R2_BATCH = 1000;

/** Deletes every object under `prefix`, a list page (≤ 1000) at a time. Throws when R2 fails. */
export async function emptyPrefix(bucket: R2, prefix: string): Promise<number> {
  let deleted = 0;
  for (;;) {
    // Always the first page: what was deleted is no longer listed.
    const page = await bucket.list({ prefix, limit: R2_BATCH });
    const keys = page.objects.map((o) => o.key);
    if (keys.length > 0) await bucket.delete(keys);
    deleted += keys.length;
    if (!page.truncated || keys.length === 0) return deleted;
  }
}

/** A prefix's sweep row is kept this long before the cron empties it once more and removes it. */
export const SWEEP_AFTER_MS = DAY_MS / 24;
/** Prefixes one cron run empties. */
const SWEEP_PER_RUN = 50;

/**
 * The daily cron's part: empties the R2 prefixes of accounts deleted at
 * least SWEEP_AFTER_MS ago once more (an upload that raced the delete, an
 * R2 failure half-way through it), and forgets each that is then empty.
 * A prefix that fails stays for the next run.
 */
export async function sweepPrefixes(env: Env, now: number): Promise<void> {
  const db = env.DB;
  const bucket = env.FILES;
  if (!db || !bucket) return;
  const { results } = await db.prepare('SELECT prefix FROM r2_sweep WHERE at <= ?1 ORDER BY at LIMIT ?2').bind(now - SWEEP_AFTER_MS, SWEEP_PER_RUN).all<{ prefix: string }>();
  for (const { prefix } of results) {
    try {
      await emptyPrefix(bucket, prefix);
      await db.prepare('DELETE FROM r2_sweep WHERE prefix = ?1').bind(prefix).run();
    } catch {
      // R2 failed: the row stays for tomorrow.
    }
  }
}
