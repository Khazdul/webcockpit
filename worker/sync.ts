// The sync endpoints (spec §7.4, ADR 0146 and its addendum; the contract is
// the "Sync" part of shared/cloud/api.ts). Reached through worker/auth.ts,
// so every request has passed the flag `accounts`, the limits, the CSRF
// rule and the session; the flag `sync` is checked there too.
//
//   GET    /api/u/sync/changes?since=&limit=     the items written after `since`
//   PUT    /api/u/sync/items/<kind>/<id>         body = the blob; If-Match: <rev>
//   DELETE /api/u/sync/items/<kind>/<id>         a tombstone; If-Match: <rev>
//
// Table `item` and the account's `seq`, `item_count`, `item_bytes`:
// worker/migrations/0003_sync.sql. The server never reads a blob.
//
// A write is one D1 batch (one transaction): the item, guarded by its rev
// still being the one the client named and by the account's limits, takes
// `account.seq + 1`; the account's counters follow only when the item now
// holds exactly that write. So `seq` grows by one per write, strictly, and
// the usage counters never drift. A batch that did not apply (a race with
// another write) is decided again from a fresh read.
//
// Limits (the account's, AccountLimits): one blob at most `itemMaxBytes`
// (413 `item_too_large`); the live items' bytes at most `itemBytes` (413
// `storage_full`); live items at most `items` (413 `too_many_items`).
// Tombstones count against neither: a delete, and a write that does not
// grow, are always let through.
import {
  type AccountLimits,
  SYNC_ID_PATTERN,
  SYNC_KINDS,
  SYNC_KINDS_OPEN,
  type SyncChanges,
  type SyncConflict,
  type SyncItem,
  type SyncKind,
  type SyncUsage,
  type SyncWritten,
} from '../shared/cloud/api.ts';
import { limitsOf } from './accounts.ts';
import { toB64url } from './bytes.ts';
import type { D1, Deps } from './runtime.ts';
import { error, json } from './runtime.ts';
import type { Authed } from './sessions.ts';
import { readBytesCapped } from './stats.ts';

/** What a handler here uses of auth.ts's context. */
export interface SyncCtx {
  request: Request;
  url: URL;
  deps: Deps;
  db: D1;
  now: number;
  auth: Authed | null;
}

type Handler = (c: SyncCtx) => Promise<Response>;

const CHANGES_PATH = '/api/u/sync/changes';
const ITEMS_PREFIX = '/api/u/sync/items/';

/** The most items one `changes` answer holds, and its default. */
export const CHANGES_MAX_ITEMS = 500;
/**
 * The most blob bytes one `changes` answer holds (base64url makes them a
 * third more): an answer stops before the item that would pass it, but
 * always has at least one item. With the default limits (2 MB in all) a
 * full pull is one answer.
 */
export const CHANGES_MAX_BYTES = 4 * 1024 * 1024;
/** Rounds of read and write before a write that keeps losing races gives up (503). */
const WRITE_ROUNDS = 3;

export function isSyncPath(path: string): boolean {
  return path === '/api/u/sync' || path.startsWith('/api/u/sync/');
}

const ROUTES: Record<string, Record<string, Handler>> = {
  [CHANGES_PATH]: { GET: changes },
  [ITEMS_PREFIX]: { PUT: put, DELETE: remove },
};

/** The route of a sync path, or undefined (404). */
export function syncRoute(path: string): Record<string, Handler> | undefined {
  if (path === CHANGES_PATH) return ROUTES[CHANGES_PATH];
  if (path.startsWith(ITEMS_PREFIX) && path.length > ITEMS_PREFIX.length) return ROUTES[ITEMS_PREFIX];
  return undefined;
}

// --- Reading what a request names ---

interface Target {
  kind: SyncKind;
  id: string;
}

/** The kind and id of an items path, or the answer: 400 for an unknown kind or a bad id, 403 `kind_closed` for a kind not open yet. */
function targetOf(path: string): Target | Response {
  const parts = path.slice(ITEMS_PREFIX.length).split('/');
  const [kind, id] = parts;
  if (parts.length !== 2 || kind === undefined || id === undefined) return error('bad_request', 400);
  if (!(SYNC_KINDS as readonly string[]).includes(kind)) return error('bad_request', 400);
  if (!SYNC_ID_PATTERN.test(id)) return error('bad_request', 400);
  if (!SYNC_KINDS_OPEN.includes(kind as SyncKind)) return error('kind_closed', 403);
  return { kind: kind as SyncKind, id };
}

/** `If-Match: <rev>` (a whole number; quotes as an ETag has them are allowed), or the answer: 428 when it is missing, 400 when it is not a rev. */
function baseOf(request: Request): number | Response {
  const v = request.headers.get('if-match');
  if (v === null) return error('if_match_required', 428);
  const m = /^"?(\d{1,15})"?$/.exec(v.trim());
  return m ? Number(m[1]) : error('bad_request', 400);
}

/** A query parameter as a whole number ≥ 0, `fallback` when absent, null when it is something else. */
function whole(url: URL, name: string, fallback: number): number | null {
  const v = url.searchParams.get(name);
  if (v === null) return fallback;
  return /^\d{1,15}$/.test(v) ? Number(v) : null;
}

// --- Rows ---

interface ItemRow {
  kind: SyncKind;
  id: string;
  rev: number;
  seq: number;
  deleted: number;
  size: number;
  updated: number;
  blob: ArrayBuffer | number[] | null;
}

interface UsageRow {
  seq: number;
  item_count: number;
  item_bytes: number;
}

const ITEM_COLUMNS = 'kind, id, rev, seq, deleted, size, updated, blob';

function itemOf(r: ItemRow): SyncItem {
  const out: SyncItem = { kind: r.kind, id: r.id, rev: r.rev, seq: r.seq, deleted: r.deleted !== 0, size: r.size, updated: r.updated };
  // D1 hands a BLOB back as an ArrayBuffer (or, in older runtimes, an array of numbers).
  if (r.deleted === 0 && r.blob !== null) out.blob = toB64url(new Uint8Array(r.blob));
  return out;
}

const usageOf = (r: UsageRow): SyncUsage => ({ items: r.item_count, itemBytes: r.item_bytes });

// --- GET /api/u/sync/changes ---

async function changes(c: SyncCtx): Promise<Response> {
  const { account } = c.auth as Authed;
  const since = whole(c.url, 'since', 0);
  const asked = whole(c.url, 'limit', CHANGES_MAX_ITEMS);
  if (since === null || asked === null || asked < 1) return error('bad_request', 400);
  const limit = Math.min(asked, CHANGES_MAX_ITEMS);
  // One statement, so one snapshot: the next `limit + 1` items after the
  // cursor (the one beyond says whether there is more), cut where the
  // blobs would pass CHANGES_MAX_BYTES (never before the first).
  const { results } = await c.db
    .prepare(
      `WITH page AS (
         SELECT kind, id, seq, ROW_NUMBER() OVER (ORDER BY seq) AS n, SUM(size) OVER (ORDER BY seq ROWS UNBOUNDED PRECEDING) AS upto
         FROM item WHERE account = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3
       )
       SELECT i.kind, i.id, i.rev, i.seq, i.deleted, i.size, i.updated, i.blob, (SELECT COUNT(*) FROM page) AS total
       FROM page p JOIN item i ON i.account = ?1 AND i.kind = p.kind AND i.id = p.id
       WHERE p.n <= ?4 AND (p.n = 1 OR p.upto <= ?5)
       ORDER BY i.seq`,
    )
    .bind(account.id, since, limit + 1, limit, CHANGES_MAX_BYTES)
    .all<ItemRow & { total: number }>();
  const items = results.map(itemOf);
  const answer: SyncChanges = {
    items,
    cursor: items.at(-1)?.seq ?? since,
    more: (results[0]?.total ?? 0) > items.length,
    usage: { items: account.item_count, itemBytes: account.item_bytes },
    limits: limitsOf(account),
  };
  return json(answer);
}

// --- PUT and DELETE /api/u/sync/items/<kind>/<id> ---

async function put(c: SyncCtx): Promise<Response> {
  const target = targetOf(c.url.pathname);
  if (target instanceof Response) return target;
  const base = baseOf(c.request);
  if (base instanceof Response) return base;
  const type = (c.request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/octet-stream') return error('bad_request', 400);
  const limits = limitsOf((c.auth as Authed).account);
  const blob = await readBytesCapped(c.request, limits.itemMaxBytes);
  if (blob === null) return error('item_too_large', 413);
  if (blob.length === 0) return error('bad_request', 400);
  return write(c, target, base, blob, limits);
}

async function remove(c: SyncCtx): Promise<Response> {
  const target = targetOf(c.url.pathname);
  if (target instanceof Response) return target;
  const base = baseOf(c.request);
  if (base instanceof Response) return base;
  return write(c, target, base, null, limitsOf((c.auth as Authed).account));
}

/**
 * Writes `blob` (null: a tombstone) over the item at rev `base`.
 *
 *   200 SyncWritten          written
 *   409 SyncConflict         the item is not at `base`
 *   404 not_found            `base` names an item that does not exist, or a
 *                            delete of an item that never was
 *   413 too_many_items, storage_full
 *
 * A delete of an item that is already a tombstone at `base` writes
 * nothing and answers its rev and seq as they are.
 */
async function write(c: SyncCtx, t: Target, base: number, blob: Uint8Array<ArrayBuffer> | null, limits: AccountLimits): Promise<Response> {
  const accountId = (c.auth as Authed).account.id;
  for (let round = 0; round < WRITE_ROUNDS; round++) {
    const [curRes, accRes] = await c.db.batch<Record<string, unknown>>([
      c.db.prepare(`SELECT ${ITEM_COLUMNS} FROM item WHERE account = ?1 AND kind = ?2 AND id = ?3`).bind(accountId, t.kind, t.id),
      c.db.prepare('SELECT seq, item_count, item_bytes FROM account WHERE id = ?1').bind(accountId),
    ]);
    const cur = (curRes?.results[0] ?? null) as ItemRow | null;
    const acc = (accRes?.results[0] ?? null) as UsageRow | null;
    // The account was deleted while this request ran.
    if (!acc) return error('unauthorized', 401);
    if (!cur && base !== 0) return error('not_found', 404);
    if (cur && cur.rev !== base) return json({ error: 'conflict', current: itemOf(cur) } satisfies SyncConflict, 409);
    if (blob === null) {
      if (!cur) return error('not_found', 404);
      if (cur.deleted !== 0) return json({ rev: cur.rev, seq: cur.seq, usage: usageOf(acc) } satisfies SyncWritten);
    }

    const live = cur !== null && cur.deleted === 0;
    const size = blob?.length ?? 0;
    const dCount = (blob ? 1 : 0) - (live ? 1 : 0);
    const dBytes = size - (live ? cur.size : 0);
    if (dCount > 0 && acc.item_count + dCount > limits.items) return error('too_many_items', 413);
    if (dBytes > 0 && acc.item_bytes + dBytes > limits.itemBytes) return error('storage_full', 413);

    const rev = base + 1;
    const results = await c.db.batch<UsageRow>([
      // The item, only while it is still at `base` and the account's
      // counters still leave room (the check above, again, in the
      // transaction).
      c.db
        .prepare(
          `INSERT INTO item (account, kind, id, rev, seq, deleted, size, updated, blob)
           SELECT ?1, ?2, ?3, ?4, a.seq + 1, ?5, ?6, ?7, ?8 FROM account a
           WHERE a.id = ?1
             AND COALESCE((SELECT rev FROM item WHERE account = ?1 AND kind = ?2 AND id = ?3), 0) = ?9
             AND (?10 <= 0 OR a.item_count + ?10 <= ?11)
             AND (?12 <= 0 OR a.item_bytes + ?12 <= ?13)
           ON CONFLICT (account, kind, id) DO UPDATE SET
             rev = excluded.rev, seq = excluded.seq, deleted = excluded.deleted,
             size = excluded.size, updated = excluded.updated, blob = excluded.blob`,
        )
        .bind(accountId, t.kind, t.id, rev, blob ? 0 : 1, size, c.now, blob, base, dCount, limits.items, dBytes, limits.itemBytes),
      // The account's counter and usage, only when the item holds exactly
      // this write (its rev, and the seq the account is about to have).
      c.db
        .prepare(
          `UPDATE account SET seq = seq + 1, item_count = item_count + ?2, item_bytes = item_bytes + ?3
           WHERE id = ?1 AND EXISTS (SELECT 1 FROM item WHERE account = ?1 AND kind = ?4 AND id = ?5 AND rev = ?6 AND seq = account.seq + 1)`,
        )
        .bind(accountId, dCount, dBytes, t.kind, t.id, rev),
      c.db.prepare('SELECT seq, item_count, item_bytes FROM account WHERE id = ?1').bind(accountId),
    ]);
    const after = results[2]?.results[0];
    if (results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 && after) {
      return json({ rev, seq: after.seq, usage: usageOf(after) } satisfies SyncWritten);
    }
    // Another write came between the read and the batch: decide again.
  }
  return error('unavailable', 503);
}
