// Published runs (spec §7.7, ADR 0154 "The Worker"; the contract is "Share
// links" in shared/cloud/api.ts). Behind the flag `share`.
//
//   POST   /api/u/pub               meta + payload → PubWritten
//   GET    /api/u/pub               the account's published runs
//   GET    /api/u/pub/<id>          the sender's own run as PubMeta (also a hidden one)
//   GET    /api/u/pub/<id>/payload  its payload (also a hidden one)
//   PATCH  /api/u/pub/<id>          title, description
//   DELETE /api/u/pub/<id>          removes it (a tombstone; the link answers 410)
//   GET    /api/pub/<id>            the public meta
//   GET    /api/pub/<id>/payload    the public payload
//   POST   /api/pub/<id>/view       counts a view, once per device and UTC day
//
// `/api/u/pub*` is reached through worker/auth.ts (the flag `accounts`, the
// limits, the CSRF rule, the session); the flag `share` is checked there.
// `/api/pub/*` is public and reached from worker/router.ts. The session
// cookie's path is `/api/u`, so the public paths never see who asks: the
// sender's view of a hidden run is `GET /api/u/pub/<id>`.
//
// A payload lives in R2 (`FILES`) under `pub/<id>`, stored byte for byte:
// the Worker never decompresses or parses it (ADR 0154).
//
// A POST keeps the count honest without a transaction over R2 (as
// worker/runs.ts reserves room, ADR 0153):
//
//   1. Reserve, in one batch: a `pending` row under a fresh id, made only
//      while the account's `pub_count` is under its `sharedRuns`, and
//      `pub_count + 1`, `pub_bytes + bytes` only when that row was made.
//      Two parallel posts never pass the limit together. An id that meets
//      an existing row fails the batch (nothing applied): a new id is drawn.
//   2. Stream the payload to R2 through a FixedLengthStream of its length.
//   3. The row to `active`, only while it is still `pending` (Delete
//      account turns it to a tombstone meanwhile: the object goes again,
//      401).
//
// When step 2 fails before R2 stored anything, the row goes and the count
// is given back (503). When R2 stored something that cannot be trusted, the
// object is deleted, the row becomes a tombstone with its bytes (so the
// daily cron deletes the object again if that delete failed) and the count
// is given back (503). An isolate killed between 1 and 3 leaves a pending
// row: the daily cron gives its count back after an hour (`sweepPubs`).
//
// Removing a run (its sender, the admin, Delete account) makes the row a
// tombstone and gives the count back in one batch, then deletes the object;
// a tombstone keeps `bytes` until R2 confirms the delete, and the cron
// deletes what is left.
import {
  type MyPub,
  type PayloadTooLarge,
  PUB_DESCRIPTION_MAX,
  PUB_ID_PATTERN,
  PUB_META_MAX_BYTES,
  PUB_TITLE_MAX,
  type PubMeta,
  type PubMetaIn,
  type PubQuota,
  type PubWritten,
} from '../shared/cloud/api.ts';
import { type AccountRow, hasKeys, limitsOf, prefsOf } from './accounts.ts';
import { addressKey } from './address.ts';
import { randomBytes } from './bytes.ts';
import { flags } from './flags.ts';
import { lengthOf, storeStream, type Stored } from './runs.ts';
import { DAY_MS, type D1, type D1Statement, type Deps, type Env, type R2, type R2Body, error, json, utcDay } from './runtime.ts';
import type { Authed } from './sessions.ts';
import { UUID, readCapped } from './stats.ts';

/** What a handler here uses of auth.ts's context. */
export interface PubCtx {
  request: Request;
  env: Env;
  url: URL;
  deps: Deps;
  db: D1;
  now: number;
  auth: Authed | null;
}

type Handler = (c: PubCtx) => Promise<Response>;

// --- Bounds ---

/** The longest meta JSON a POST may carry (100 + 500 characters, escaped, and the rest). */
export const META_MAX_BYTES = PUB_META_MAX_BYTES;
/** The longest character name. */
export const CHARACTER_MAX = 40;
/** The highest level. */
export const LEVEL_MAX = 1000;
/** The longest played length, seconds (31 days). */
export const LENGTH_MAX_S = 31 * 86_400;
/** A draw that meets an existing id is tried again this many times. */
const ID_TRIES = 5;
/** A `pending` row this old is left behind by an isolate that died (the cron gives its count back). */
export const PENDING_STALE_MS = 60 * 60_000;

// --- Text (ADR 0154: Unicode text, NFC, no control characters but `\n` in a description) ---

/**
 * Control characters (C0, DEL, C1), lone surrogates, and the bidi
 * embeddings, overrides and isolates (U+202A–U+202E, U+2066–U+2069), which
 * could make a title read as something else around it.
 */
const FORBIDDEN = /[\p{Cc}\p{Cs}‪-‮⁦-⁩]/u;

/** `v` when it is text of `min`–`max` characters (code points) by the rules, else null. */
export function textOf(v: unknown, min: number, max: number, o: { newlines?: boolean; trimmed?: boolean } = {}): string | null {
  if (typeof v !== 'string' || v.length > max * 2 + 8) return null;
  if (v.normalize('NFC') !== v) return null;
  if (FORBIDDEN.test(o.newlines ? v.replace(/\n/g, '') : v)) return null;
  if (o.trimmed && v.trim() !== v) return null;
  const n = [...v].length;
  return n >= min && n <= max ? v : null;
}

export const titleOf = (v: unknown): string | null => textOf(v, 1, PUB_TITLE_MAX, { trimmed: true });
export const descriptionOf = (v: unknown): string | null => textOf(v, 0, PUB_DESCRIPTION_MAX, { newlines: true });

/** The meta of a POST, checked, or null (400). */
export function metaOf(v: unknown): PubMetaIn | null {
  if (!hasKeys(v, ['title', 'description', 'character', 'lengthS', 'listed'], ['level'])) return null;
  const title = titleOf(v.title);
  const description = descriptionOf(v.description);
  const character = textOf(v.character, 0, CHARACTER_MAX, { trimmed: true });
  if (title === null || description === null || character === null) return null;
  if (v.listed !== false) return null;
  const { lengthS, level } = v;
  if (typeof lengthS !== 'number' || !Number.isFinite(lengthS) || lengthS < 0 || lengthS > LENGTH_MAX_S) return null;
  if (level !== undefined && (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > LEVEL_MAX)) return null;
  const meta: PubMetaIn = { title, description, character, lengthS, listed: false };
  if (level !== undefined) meta.level = level;
  return meta;
}

// --- Rows ---

export type PubRowState = 'pending' | 'active' | 'hidden' | 'removed';

export interface PubRow {
  id: string;
  account: string;
  title: string;
  description: string;
  character: string;
  level: number | null;
  length_s: number;
  bytes: number;
  listed: number;
  state: PubRowState;
  hidden_reason: string | null;
  created: number;
  updated: number;
  views: number;
}

export const PUB_COLUMNS = 'id, account, title, description, character, level, length_s, bytes, listed, state, hidden_reason, created, updated, views';
const P_COLUMNS = PUB_COLUMNS.split(', ')
  .map((c) => `p.${c}`)
  .join(', ');

/** What a tombstone keeps: no text. `bytes` stays until R2 confirms the object is gone. */
export const TOMBSTONE_SET = "state = 'removed', title = '', description = '', character = '', level = NULL, hidden_reason = NULL, listed = 0";
/** The states of a run that has its payload and counts against `sharedRuns` (besides `pending`). */
export const LIVE = "('active', 'hidden')";

export const keyOf = (id: string): string => `pub/${id}`;

export function myPub(r: PubRow): MyPub {
  const out: MyPub = {
    id: r.id,
    title: r.title,
    description: r.description,
    character: r.character,
    lengthS: r.length_s,
    listed: r.listed !== 0,
    state: r.state === 'hidden' ? 'hidden' : 'active',
    created: r.created,
    updated: r.updated,
    views: r.views,
    bytes: r.bytes,
  };
  if (r.level !== null) out.level = r.level;
  return out;
}

export function pubMeta(r: PubRow, sender: string): PubMeta {
  const out: PubMeta = {
    id: r.id,
    title: r.title,
    description: r.description,
    sender,
    character: r.character,
    lengthS: r.length_s,
    created: r.created,
    views: r.views,
    bytes: r.bytes,
  };
  if (r.level !== null) out.level = r.level;
  if (r.state === 'hidden') out.hidden = true;
  return out;
}

/** A row with its sender's name (empty when the account is gone), or null. */
export async function pubWithSender(db: D1, id: string): Promise<(PubRow & { sender: string | null }) | null> {
  return db
    .prepare(`SELECT ${P_COLUMNS}, a.name AS sender FROM publication p LEFT JOIN account a ON a.id = p.account WHERE p.id = ?1`)
    .bind(id)
    .first<PubRow & { sender: string | null }>();
}

/** The answer for a row that is not `active`, or null when it is: 404 unknown (or pending), 410 removed, 451 hidden. */
export function stateAnswer(r: Pick<PubRow, 'state'> | null): Response | null {
  if (!r || r.state === 'pending') return error('not_found', 404);
  if (r.state === 'removed') return error('gone', 410);
  if (r.state === 'hidden') return error('hidden', 451);
  return null;
}

/** A new id: 12 characters of [A-Za-z0-9], uniform (rejection of bytes ≥ 248). */
export function newPubId(): string {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  while (out.length < 12) {
    for (const b of randomBytes(16)) {
      if (b < 248 && out.length < 12) out += ALPHABET[b % 62];
    }
  }
  return out;
}

/** The headers of a payload answer. `cache`: the public one may be kept by the browser (the cut is frozen). */
export function payloadResponse(obj: R2Body, cache: 'public' | 'none'): Response {
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(obj.size),
      'Cache-Control': cache === 'public' ? 'private, max-age=604800, immutable' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'attachment',
    },
  });
}

/**
 * The statements that make the live runs `where` selects (a condition on
 * `publication`'s columns, placeholders from ?2 with `binds`; ?1 is the
 * time) tombstones and give their count and bytes back to their accounts:
 * the account first (it reads the rows' bytes), then the rows. Also marks
 * their reports handled. For the caller's batch.
 */
export function tombstones(db: D1, now: number, where: string, binds: unknown[]): D1Statement[] {
  const sel = `SELECT id FROM publication WHERE state IN ${LIVE} AND (${where})`;
  return [
    db
      .prepare(
        `UPDATE account SET
           pub_count = pub_count - (SELECT COUNT(*) FROM publication q WHERE q.account = account.id AND q.state IN ${LIVE} AND q.id IN (${sel})),
           pub_bytes = pub_bytes - (SELECT COALESCE(SUM(bytes), 0) FROM publication q WHERE q.account = account.id AND q.state IN ${LIVE} AND q.id IN (${sel}))
         WHERE id IN (SELECT account FROM publication WHERE state IN ${LIVE} AND (${where}))`,
      )
      .bind(now, ...binds),
    db.prepare(`UPDATE report SET handled = ?1 WHERE handled = 0 AND kind = 'run' AND target IN (${sel})`).bind(now, ...binds),
    db.prepare(`UPDATE publication SET ${TOMBSTONE_SET}, updated = ?1 WHERE state IN ${LIVE} AND (${where})`).bind(now, ...binds),
  ];
}

/** Deletes the payloads of tombstones and, when R2 confirms, sets their `bytes` to 0. Never throws: the cron tries again. */
export async function dropObjects(env: Env, ids: string[]): Promise<void> {
  const bucket = env.FILES;
  const db = env.DB;
  if (!bucket || !db) return;
  for (let i = 0; i < ids.length; i += 1000) {
    const part = ids.slice(i, i + 1000);
    try {
      await bucket.delete(part.map(keyOf));
      await db.prepare(`UPDATE publication SET bytes = 0 WHERE state = 'removed' AND id IN (SELECT value FROM json_each(?1))`).bind(JSON.stringify(part)).run();
    } catch {
      // The cron deletes them later.
    }
  }
}

// --- /api/u/pub* ---

const LIST_PATH = '/api/u/pub';
const ONE_PREFIX = '/api/u/pub/';
export const REPORT_PATH = '/api/u/report';

export function isPubPath(path: string): boolean {
  return path === LIST_PATH || path.startsWith(ONE_PREFIX);
}

const ROUTES: Record<'list' | 'one' | 'payload', Record<string, Handler>> = {
  list: { GET: list, POST: create },
  one: { GET: mine, PATCH: patch, DELETE: remove },
  payload: { GET: minePayload },
};

/** The route of a pub path, or undefined (404). */
export function pubRoute(path: string): Record<string, Handler> | undefined {
  if (path === LIST_PATH) return ROUTES.list;
  if (!path.startsWith(ONE_PREFIX)) return undefined;
  const rest = path.slice(ONE_PREFIX.length);
  if (/^[^/]+$/.test(rest)) return ROUTES.one;
  if (/^[^/]+\/payload$/.test(rest)) return ROUTES.payload;
  return undefined;
}

/** The id in a `/api/u/pub/<id>[/payload]` path, or null (404). */
function idOf(c: PubCtx): string | null {
  const id = c.url.pathname.slice(ONE_PREFIX.length).split('/')[0] ?? '';
  return PUB_ID_PATTERN.test(id) ? id : null;
}

const notFound = (): Response => error('not_found', 404);
const badRequest = (): Response => error('bad_request', 400);

function suspended(account: AccountRow): boolean {
  return account.state === 'suspended';
}

/** The account's own run that has its payload (active or hidden), or null. */
async function ownLive(c: PubCtx, id: string): Promise<PubRow | null> {
  const { account } = c.auth as Authed;
  return c.db.prepare(`SELECT ${PUB_COLUMNS} FROM publication WHERE id = ?1 AND account = ?2 AND state IN ${LIVE}`).bind(id, account.id).first<PubRow>();
}

async function list(c: PubCtx): Promise<Response> {
  const { account } = c.auth as Authed;
  const { results } = await c.db
    .prepare(`SELECT ${PUB_COLUMNS} FROM publication WHERE account = ?1 AND state IN ${LIVE} ORDER BY created DESC, id`)
    .bind(account.id)
    .all<PubRow>();
  return json({ pubs: results.map(myPub) } satisfies { pubs: MyPub[] });
}

async function mine(c: PubCtx): Promise<Response> {
  const id = idOf(c);
  if (!id) return notFound();
  const row = await ownLive(c, id);
  if (!row) return notFound();
  return json(pubMeta(row, (c.auth as Authed).account.name));
}

async function minePayload(c: PubCtx): Promise<Response> {
  const id = idOf(c);
  if (!id) return notFound();
  const bucket = c.env.FILES;
  if (!bucket) return error('unavailable', 503);
  if (!(await ownLive(c, id))) return notFound();
  const obj = await bucket.get(keyOf(id));
  return obj ? payloadResponse(obj, 'none') : error('unavailable', 503);
}

async function patch(c: PubCtx): Promise<Response> {
  const { account } = c.auth as Authed;
  const id = idOf(c);
  if (!id) return notFound();
  if (suspended(account)) return error('suspended', 403);
  const text = await readCapped(c.request, META_MAX_BYTES);
  let b: unknown = null;
  try {
    b = text === null ? null : JSON.parse(text);
  } catch {
    b = null;
  }
  // `listed` is refused until stage 65: an unknown key here.
  if (!hasKeys(b, [], ['title', 'description']) || Object.keys(b).length === 0) return badRequest();
  const title = b.title === undefined ? undefined : titleOf(b.title);
  const description = b.description === undefined ? undefined : descriptionOf(b.description);
  if (title === null || description === null) return badRequest();
  const [updated, read] = await c.db.batch<PubRow>([
    c.db
      .prepare(`UPDATE publication SET title = COALESCE(?3, title), description = COALESCE(?4, description), updated = ?5 WHERE id = ?1 AND account = ?2 AND state IN ${LIVE}`)
      .bind(id, account.id, title ?? null, description ?? null, c.now),
    c.db.prepare(`SELECT ${PUB_COLUMNS} FROM publication WHERE id = ?1 AND account = ?2 AND state IN ${LIVE}`).bind(id, account.id),
  ]);
  const row = read?.results[0];
  if (updated?.meta.changes !== 1 || !row) return notFound();
  return json({ pub: myPub(row) } satisfies PubWritten);
}

async function remove(c: PubCtx): Promise<Response> {
  const { account } = c.auth as Authed;
  const id = idOf(c);
  if (!id) return notFound();
  const row = await c.db.prepare('SELECT state FROM publication WHERE id = ?1 AND account = ?2').bind(id, account.id).first<{ state: PubRowState }>();
  if (!row || row.state === 'pending') return notFound();
  // A tombstone already: done (a retry after a lost answer).
  if (row.state !== 'removed') {
    await c.db.batch(tombstones(c.db, c.now, 'id = ?2 AND account = ?3', [id, account.id]));
    await dropObjects(c.env, [id]);
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

// --- POST /api/u/pub ---

/** Reads a body's first bytes, then hands the rest on as a stream. */
class BodyReader {
  private buf = new Uint8Array(0);
  private ended = false;
  // A plain field, not a parameter property: scripts/static-server.ts runs
  // the router under Node's type stripping, which has no parameter properties.
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  constructor(reader: ReadableStreamDefaultReader<Uint8Array>) {
    this.reader = reader;
  }

  private async fill(n: number): Promise<boolean> {
    while (this.buf.length < n && !this.ended) {
      const { value, done } = await this.reader.read();
      if (done) this.ended = true;
      else if (value && value.length > 0) {
        const next = new Uint8Array(this.buf.length + value.length);
        next.set(this.buf);
        next.set(value, this.buf.length);
        this.buf = next;
      }
    }
    return this.buf.length >= n;
  }

  /** The next `n` bytes, or null when the body ends first. */
  async take(n: number): Promise<Uint8Array | null> {
    if (!(await this.fill(n))) return null;
    const out = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return out;
  }

  /** The next `n` bytes without taking them, or null when the body ends first. */
  async peek(n: number): Promise<Uint8Array | null> {
    return (await this.fill(n)) ? this.buf.slice(0, n) : null;
  }

  /** What is left: the bytes read ahead, then the rest of the body. */
  rest(): ReadableStream<Uint8Array> {
    let first: Uint8Array | null = this.buf.length > 0 ? this.buf : null;
    const reader = this.reader;
    const ended = this.ended;
    return new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        if (first) {
          ctrl.enqueue(first);
          first = null;
          return;
        }
        if (ended) {
          ctrl.close();
          return;
        }
        const { value, done } = await reader.read();
        if (done) ctrl.close();
        else if (value) ctrl.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
  }

  cancel(): void {
    this.reader.cancel().catch(() => {});
  }
}

async function create(c: PubCtx): Promise<Response> {
  const { account } = c.auth as Authed;
  const type = (c.request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/octet-stream') return badRequest();
  const total = lengthOf(c.request);
  if (total === null) return error('length_required', 411);
  if (Number.isNaN(total) || total < 4 || !c.request.body) return badRequest();
  if (suspended(account)) return error('suspended', 403);
  if (!prefsOf(account).rulesAccepted) return error('rules', 403);
  const limits = limitsOf(account, c.env);
  const tooLarge = (): Response => json({ error: 'payload_too_large', limit: limits.payloadMaxBytes } satisfies PayloadTooLarge, 413);
  if (total > 4 + META_MAX_BYTES + limits.payloadMaxBytes) return tooLarge();
  const bucket = c.env.FILES;
  if (!bucket) return error('unavailable', 503);

  const body = new BodyReader(c.request.body.getReader());
  const fail = (res: Response): Response => {
    body.cancel();
    return res;
  };
  const prefix = await body.take(4);
  if (!prefix) return fail(badRequest());
  const metaLength = new DataView(prefix.buffer, prefix.byteOffset, 4).getUint32(0);
  if (metaLength === 0 || metaLength > META_MAX_BYTES || 4 + metaLength >= total) return fail(badRequest());
  const metaBytes = await body.take(metaLength);
  if (!metaBytes) return fail(badRequest());
  let meta: PubMetaIn | null;
  try {
    meta = metaOf(JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(metaBytes)));
  } catch {
    meta = null;
  }
  if (!meta) return fail(badRequest());
  const bytes = total - 4 - metaLength;
  if (bytes > limits.payloadMaxBytes) return fail(tooLarge());
  const magic = await body.peek(2);
  if (!magic || magic[0] !== 0x1f || magic[1] !== 0x8b) return fail(badRequest());

  // 1. Reserve the count under a fresh id.
  let id = '';
  let made = false;
  for (let tries = 0; tries < ID_TRIES && !made; tries++) {
    id = newPubId();
    try {
      const results = await c.db.batch([
        c.db
          .prepare(
            `INSERT INTO publication (id, account, title, description, character, level, length_s, bytes, listed, state, created, updated)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 'pending', ?9, ?9
             WHERE (SELECT pub_count FROM account WHERE id = ?2) < ?10`,
          )
          .bind(id, account.id, meta.title, meta.description, meta.character, meta.level ?? null, meta.lengthS, bytes, c.now, limits.sharedRuns),
        c.db
          .prepare(
            `UPDATE account SET pub_count = pub_count + 1, pub_bytes = pub_bytes + ?3
             WHERE id = ?1 AND EXISTS (SELECT 1 FROM publication WHERE id = ?2 AND account = ?1 AND state = 'pending')`,
          )
          .bind(account.id, id, bytes),
      ]);
      if (results[0]?.meta.changes !== 1) {
        const still = await c.db.prepare('SELECT 1 AS x FROM account WHERE id = ?1').bind(account.id).first();
        // The account was deleted while this request ran.
        if (!still) return fail(error('unauthorized', 401));
        return fail(json({ error: 'pub_quota', limit: limits.sharedRuns } satisfies PubQuota, 413));
      }
      made = true;
    } catch (e) {
      // The id is taken (the batch is one transaction: nothing applied): draw again.
      if (!/UNIQUE|constraint/i.test(String(e instanceof Error ? e.message : e))) throw e;
    }
  }
  if (!made) return fail(error('unavailable', 503));
  const giveBack = (tombstone: boolean): Promise<unknown> =>
    c.db.batch([
      c.db
        .prepare(
          `UPDATE account SET pub_count = pub_count - 1, pub_bytes = pub_bytes - ?3
           WHERE id = ?1 AND EXISTS (SELECT 1 FROM publication WHERE id = ?2 AND state = 'pending')`,
        )
        .bind(account.id, id, bytes),
      tombstone
        ? c.db.prepare(`UPDATE publication SET ${TOMBSTONE_SET}, updated = ?2 WHERE id = ?1 AND state = 'pending'`).bind(id, c.now)
        : c.db.prepare(`DELETE FROM publication WHERE id = ?1 AND state = 'pending'`).bind(id),
    ]);

  // 2. The payload to R2.
  const key = keyOf(id);
  let stored: Stored;
  try {
    stored = await storeStream(bucket, key, body.rest(), bytes);
  } catch {
    stored = null;
  }
  if (stored === null || stored === 'untrusted' || stored.size !== bytes) {
    if (stored === null) {
      await giveBack(false).catch(() => {});
    } else {
      // Something is stored that cannot be trusted: a tombstone with its
      // bytes, so the cron deletes the object if this delete fails.
      await giveBack(true).catch(() => {});
      await dropObjects(c.env, [id]);
    }
    return error('unavailable', 503);
  }

  // 3. Live, only while still pending.
  const [done, read] = await c.db.batch<PubRow>([
    c.db.prepare(`UPDATE publication SET state = 'active', updated = ?2 WHERE id = ?1 AND state = 'pending'`).bind(id, c.now),
    c.db.prepare(`SELECT ${PUB_COLUMNS} FROM publication WHERE id = ?1`).bind(id),
  ]);
  const row = read?.results[0];
  if (done?.meta.changes !== 1 || !row || row.state !== 'active') {
    // Delete account made it a tombstone while the payload was uploaded.
    await dropObjects(c.env, [id]);
    return error('unauthorized', 401);
  }
  return json({ pub: myPub(row) } satisfies PubWritten);
}

// --- /api/pub/* (public) ---

const PUBLIC_PREFIX = '/api/pub/';

export function isPublicPubPath(path: string): boolean {
  return path.startsWith(PUBLIC_PREFIX);
}

const EMPTY_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

/** Every request under `/api/pub/`: the flag `share`, the general limit by address, the route, the database. */
export async function publicPub(request: Request, env: Env, url: URL, deps: Deps): Promise<Response> {
  const now = deps.now();
  if (!(await flags(env, now)).share) return notFound();
  const rest = url.pathname.slice(PUBLIC_PREFIX.length);
  const m = /^([^/]+)(\/payload|\/view)?$/.exec(rest);
  if (!m) return notFound();
  const part = m[2] ?? '';
  const allowed = part === '/view' ? 'POST' : 'GET';
  const head = request.method === 'HEAD';
  const method = head ? 'GET' : request.method;
  if (method !== allowed) return error('method_not_allowed', 405, { Allow: allowed });
  const address = addressKey(request.headers.get('cf-connecting-ip'));
  if (env.API_LIMITER && !(await env.API_LIMITER.limit({ key: `a|${address}` })).success) return error('rate_limited', 429);
  if (part === '/view' && env.BEAT_LIMITER && !(await env.BEAT_LIMITER.limit({ key: address })).success) return error('rate_limited', 429);
  const id = m[1] as string;
  if (!PUB_ID_PATTERN.test(id)) return notFound();
  const db = env.DB;
  if (!db) return error('unavailable', 503);
  try {
    const res = await publicAnswer(request, env, db, id, part, now);
    return head ? new Response(null, { status: res.status, headers: res.headers }) : res;
  } catch {
    return error('unavailable', 503);
  }
}

async function publicAnswer(request: Request, env: Env, db: D1, id: string, part: string, now: number): Promise<Response> {
  if (part === '/view') {
    const text = await readCapped(request, 256);
    let b: unknown = null;
    try {
      b = text === null ? null : JSON.parse(text);
    } catch {
      b = null;
    }
    if (!hasKeys(b, ['device']) || typeof b.device !== 'string' || !UUID.test(b.device)) return badRequest();
    const row = await db.prepare('SELECT state FROM publication WHERE id = ?1').bind(id).first<{ state: PubRowState }>();
    const refused = stateAnswer(row);
    if (refused) return refused;
    const day = utcDay(now);
    // The count grows only with a new (pub, device, day) row: the check and
    // the insert in one transaction.
    await db.batch([
      db
        .prepare(
          `UPDATE publication SET views = views + 1 WHERE id = ?1 AND state = 'active'
           AND NOT EXISTS (SELECT 1 FROM pub_view WHERE pub = ?1 AND device = ?2 AND day = ?3)`,
        )
        .bind(id, b.device, day),
      db
        .prepare(`INSERT OR IGNORE INTO pub_view (pub, device, day) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM publication WHERE id = ?1 AND state = 'active')`)
        .bind(id, b.device, day),
    ]);
    return new Response(null, { status: 204, headers: EMPTY_HEADERS });
  }
  const row = await pubWithSender(db, id);
  const refused = stateAnswer(row);
  if (refused || !row) return refused ?? notFound();
  if (part === '') return json(pubMeta(row, row.sender ?? ''));
  const bucket = env.FILES;
  if (!bucket) return error('unavailable', 503);
  const obj = await bucket.get(keyOf(id));
  return obj ? payloadResponse(obj, 'public') : error('unavailable', 503);
}

// --- The daily cron ---

/** Rows one cron run looks at, per part. */
const SWEEP_PER_RUN = 500;
/** Views are kept this long (only today's are needed: once per device and UTC day). */
export const KEEP_VIEWS_DAYS = 2;

/**
 * The daily cron's part: views older than two days go; a `pending` row left
 * by an isolate that died an hour ago becomes a tombstone and gives its
 * count back; tombstones whose object may still be in R2 have it deleted.
 */
export async function sweepPubs(env: Env, now: number): Promise<void> {
  const db = env.DB;
  if (!db) return;
  await db.prepare('DELETE FROM pub_view WHERE day < ?1').bind(utcDay(now - KEEP_VIEWS_DAYS * DAY_MS)).run();
  const { results: stale } = await db
    .prepare(`SELECT id, account, bytes FROM publication WHERE state = 'pending' AND updated <= ?1 LIMIT ?2`)
    .bind(now - PENDING_STALE_MS, SWEEP_PER_RUN)
    .all<{ id: string; account: string; bytes: number }>();
  for (const p of stale) {
    await db.batch([
      db
        .prepare(
          `UPDATE account SET pub_count = pub_count - 1, pub_bytes = pub_bytes - ?3
           WHERE id = ?1 AND EXISTS (SELECT 1 FROM publication WHERE id = ?2 AND state = 'pending')`,
        )
        .bind(p.account, p.id, p.bytes),
      db.prepare(`UPDATE publication SET ${TOMBSTONE_SET}, updated = ?2 WHERE id = ?1 AND state = 'pending'`).bind(p.id, now),
    ]);
  }
  const { results: left } = await db
    .prepare(`SELECT id FROM publication WHERE state = 'removed' AND bytes > 0 LIMIT ?1`)
    .bind(SWEEP_PER_RUN)
    .all<{ id: string }>();
  await dropObjects(env, left.map((r) => r.id));
}
