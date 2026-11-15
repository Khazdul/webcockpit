// Published runs (spec §7.7, ADR 0154 "The Worker"; the contract is "Share
// links" in shared/cloud/api.ts). Behind the flag `share`.
//
//   POST   /api/u/pub               meta + payload → PubWritten
//   GET    /api/u/pub               the account's published runs
//   GET    /api/u/pub/<id>          the sender's own run as PubMeta (also a hidden one)
//   GET    /api/u/pub/<id>/payload  its payload (also a hidden one)
//   PATCH  /api/u/pub/<id>          title, description, listed (stage 65)
//   DELETE /api/u/pub/<id>          removes it (a tombstone; the link answers 410)
//   GET    /api/pub/<id>            the public meta
//   GET    /api/pub/<id>/payload    the public payload
//   POST   /api/pub/<id>/view       counts a view, once per device and per hashed address a UTC day
//   GET    /api/pub/<id>/comments   the comments (stage 65, worker/community.ts; flag `gallery`)
//
// Stage 65 (ADR 0155): listing (`listed`, `listed_at` set once, at most
// `listingsPerDay` first listings a UTC day, held in the statement), the
// stars and comments on the metas (with `gallery` on), what is new on the
// sender's runs (`MyPub.news`), and a tombstone takes the run's votes and
// comments with it.
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
  NEWS_MAX,
  type PayloadTooLarge,
  PUB_DESCRIPTION_MAX,
  PUB_ID_PATTERN,
  PUB_META_MAX_BYTES,
  PUB_TITLE_MAX,
  PUB_KEY_PATTERN,
  type PubMeta,
  type PubMetaIn,
  type PubQuota,
  type PubWritten,
} from '../shared/cloud/api.ts';
import { isCleanText, isPublicText } from '../shared/cloud/text.ts';
import { type AccountRow, hasKeys, limitsOf, prefsOf } from './accounts.ts';
import { addressKey, viewAddressKey } from './address.ts';
import { addressHash } from './attempts.ts';
import { utf8 } from './bytes.ts';
import { randomBytes } from './bytes.ts';
import { commentsGet } from './community.ts';
import { flags } from './flags.ts';
import { lengthOf, storeStream, type Stored } from './runs.ts';
import { DAY_MS, type D1, type D1Statement, type Deps, type Env, type R2, type R2Body, dayStart, error, json, utcDay } from './runtime.ts';
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

// --- Text (ADR 0154: Unicode text, NFC, no control characters but `\n` in a description; shared/cloud/text.ts) ---

/** `v` when it is text of `min`–`max` characters (code points) by the rules, else null. */
export function textOf(v: unknown, min: number, max: number, o: { newlines?: boolean; trimmed?: boolean } = {}): string | null {
  if (typeof v !== 'string' || v.length > max * 2 + 8) return null;
  if (!isCleanText(v, o.newlines === true)) return null;
  if (o.trimmed && v.trim() !== v) return null;
  const n = [...v].length;
  return n >= min && n <= max ? v : null;
}

export const titleOf = (v: unknown): string | null => textOf(v, 1, PUB_TITLE_MAX, { trimmed: true });
export const descriptionOf = (v: unknown): string | null => textOf(v, 0, PUB_DESCRIPTION_MAX, { newlines: true });

/**
 * A listed run's texts by the free public text rules (review fix S3: New,
 * Top, the Hall of Fame and the run of the day show them to everyone): the
 * title and the character on one line, the description with its line
 * breaks; an empty description or character is allowed as before.
 */
export function listedTextOk(m: { title: string; description: string; character: string }): boolean {
  return (
    isPublicText(m.title, { newlines: 0 }) &&
    (m.description === '' || isPublicText(m.description, { newlines: PUB_DESCRIPTION_MAX })) &&
    (m.character === '' || isPublicText(m.character, { newlines: 0 }))
  );
}

/** The meta of a POST, checked, or null (400). */
export function metaOf(v: unknown, gallery = false): PubMetaIn | null {
  if (!hasKeys(v, ['title', 'description', 'character', 'lengthS', 'listed'], ['level', 'key'])) return null;
  const title = titleOf(v.title);
  const description = descriptionOf(v.description);
  const character = textOf(v.character, 0, CHARACTER_MAX, { trimmed: true });
  if (title === null || description === null || character === null) return null;
  // Hall of Fame (stage 65): `true` only with the flag `gallery` on.
  if (v.listed !== false && !(v.listed === true && gallery)) return null;
  const { lengthS, level } = v;
  // Whole seconds (review fix CR4: the client's reader wants a whole number).
  if (typeof lengthS !== 'number' || !Number.isInteger(lengthS) || lengthS < 0 || lengthS > LENGTH_MAX_S) return null;
  if (level !== undefined && (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > LEVEL_MAX)) return null;
  if (v.key !== undefined && (typeof v.key !== 'string' || !PUB_KEY_PATTERN.test(v.key))) return null;
  const meta: PubMetaIn = { title, description, character, lengthS, listed: v.listed === true };
  if (level !== undefined) meta.level = level;
  if (v.key !== undefined) meta.key = v.key;
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
  listed_at: number | null;
  vote_sum: number;
  vote_count: number;
  comment_count: number;
}

/** What is new on one of the sender's runs (`MyPub.news`), when the query asked for it. */
export interface NewsCols {
  new_votes?: number;
  new_comments?: number;
}

export const PUB_COLUMNS =
  'id, account, title, description, character, level, length_s, bytes, listed, state, hidden_reason, created, updated, views, listed_at, vote_sum, vote_count, comment_count';
const P_COLUMNS = PUB_COLUMNS.split(', ')
  .map((c) => `p.${c}`)
  .join(', ');

/**
 * What a tombstone keeps: no text, no idempotency key (a POST with it makes
 * a new run). `bytes` stays until R2 confirms the object is gone.
 */
export const TOMBSTONE_SET =
  "state = 'removed', title = '', description = '', character = '', level = NULL, hidden_reason = NULL, listed = 0, pub_key = NULL, vote_sum = 0, vote_count = 0, top_sum = 0, top_count = 0, comment_count = 0";
/** The states of a run that has its payload and counts against `sharedRuns` (besides `pending`). */
export const LIVE = "('active', 'hidden')";

export const keyOf = (id: string): string => `pub/${id}`;

/**
 * The columns of what is new on the sender's runs since its reactions
 * time: `acc` and `seen` are the placeholders of the account's id and of
 * that time. Votes by their last change, visible comments; never the
 * sender's own (a sender cannot vote on its own run). Each capped.
 */
export function newsColumns(acc: string, seen: string): string {
  return `MIN(${NEWS_MAX}, (SELECT COUNT(*) FROM vote v WHERE v.publication = publication.id AND v.updated > ${seen} AND v.account <> ${acc})) AS new_votes,
          MIN(${NEWS_MAX}, (SELECT COUNT(*) FROM comment c WHERE c.publication = publication.id AND c.created > ${seen} AND c.account <> ${acc}
            AND c.state = 'active' AND EXISTS (SELECT 1 FROM account w WHERE w.id = c.account AND w.state = 'active'))) AS new_comments`;
}

export function myPub(r: PubRow & NewsCols): MyPub {
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
    stars: { sum: r.vote_sum, count: r.vote_count },
    comments: r.comment_count,
    news: { votes: r.new_votes ?? 0, comments: r.new_comments ?? 0 },
  };
  if (r.level !== null) out.level = r.level;
  if (r.listed_at !== null) out.listedAt = r.listed_at;
  return out;
}

/** The meta of a run; with `gallery` on it carries `listed`, the stars and the comments (stage 65). */
export function pubMeta(r: PubRow, sender: string, gallery = false): PubMeta {
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
  if (gallery) {
    out.listed = r.listed !== 0;
    out.stars = { sum: r.vote_sum, count: r.vote_count };
    out.comments = r.comment_count;
  }
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
 * their reports handled, and deletes their votes and comments (stage 65).
 * For the caller's batch.
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
    // Stage 65: the run's votes and comments go with it (the comments' reports handled).
    db.prepare(`DELETE FROM vote WHERE publication IN (${sel}) AND ?1 IS NOT NULL`).bind(now, ...binds),
    db.prepare(`UPDATE report SET handled = ?1 WHERE handled = 0 AND kind = 'comment' AND target IN (SELECT id FROM comment WHERE publication IN (${sel}))`).bind(now, ...binds),
    db.prepare(`DELETE FROM comment WHERE publication IN (${sel}) AND ?1 IS NOT NULL`).bind(now, ...binds),
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
    .prepare(`SELECT ${PUB_COLUMNS}, ${newsColumns('?1', '?2')} FROM publication WHERE account = ?1 AND state IN ${LIVE} ORDER BY created DESC, id`)
    .bind(account.id, account.reactions_seen)
    .all<PubRow & NewsCols>();
  return json({ pubs: results.map(myPub) } satisfies { pubs: MyPub[] });
}

async function mine(c: PubCtx): Promise<Response> {
  const id = idOf(c);
  if (!id) return notFound();
  const row = await ownLive(c, id);
  if (!row) return notFound();
  return json(pubMeta(row, (c.auth as Authed).account.name, (await flags(c.env, c.now)).gallery));
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
  if (!hasKeys(b, [], ['title', 'description', 'listed']) || Object.keys(b).length === 0) return badRequest();
  const title = b.title === undefined ? undefined : titleOf(b.title);
  const description = b.description === undefined ? undefined : descriptionOf(b.description);
  if (title === null || description === null) return badRequest();
  // Hall of Fame (stage 65): listing needs the flag `gallery`; unlisting is always allowed.
  if (b.listed !== undefined && typeof b.listed !== 'boolean') return badRequest();
  if (b.listed === true && !(await flags(c.env, c.now)).gallery) return badRequest();
  const listed = b.listed === undefined ? null : b.listed ? 1 : 0;
  const limits = limitsOf(account, c.env);
  // A hidden run keeps the words it was reported for until the admin has
  // looked (review fix S7): the queue shows what the reporters saw.
  const now = await ownLive(c, id);
  if (now?.state === 'hidden') return error('hidden', 403);
  // A run listed after the change, whose texts change or which is listed
  // now: its texts by the free public text rules (review fix S3).
  if (now && (listed ?? now.listed) === 1 && (listed === 1 || title !== undefined || description !== undefined)) {
    if (!listedTextOk({ title: title ?? now.title, description: description ?? now.description, character: now.character })) return error('bad_text', 400);
  }
  // A first listing (no `listed_at` yet) only while the account's first
  // listings today are under `listingsPerDay`: in the statement, so two at
  // once cannot both be the eleventh. Listing again keeps `listed_at`.
  const [updated, read] = await c.db.batch<PubRow & NewsCols>([
    c.db
      .prepare(
        `UPDATE publication SET title = COALESCE(?3, title), description = COALESCE(?4, description),
           listed = COALESCE(?6, listed), listed_at = CASE WHEN ?6 = 1 THEN COALESCE(listed_at, ?5) ELSE listed_at END, updated = ?5
         WHERE id = ?1 AND account = ?2 AND state = 'active'
         AND (?6 IS NOT 1 OR listed_at IS NOT NULL OR (SELECT COUNT(*) FROM publication q WHERE q.account = ?2 AND q.listed_at >= ?7) < ?8)`,
      )
      .bind(id, account.id, title ?? null, description ?? null, c.now, listed, dayStart(utcDay(c.now)), limits.listingsPerDay),
    c.db
      .prepare(`SELECT ${PUB_COLUMNS}, ${newsColumns('?2', '?3')} FROM publication WHERE id = ?1 AND account = ?2 AND state IN ${LIVE}`)
      .bind(id, account.id, account.reactions_seen),
  ]);
  const row = read?.results[0];
  if (updated?.meta.changes !== 1 && row?.state === 'active' && listed === 1) return error('too_many', 429);
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
  const gallery = (await flags(c.env, c.now)).gallery;
  let meta: PubMetaIn | null;
  try {
    meta = metaOf(JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(metaBytes)), gallery);
  } catch {
    meta = null;
  }
  if (!meta) return fail(badRequest());
  if (meta.listed && !listedTextOk(meta)) return fail(error('bad_text', 400));
  const bytes = total - 4 - metaLength;
  if (bytes > limits.payloadMaxBytes) return fail(tooLarge());
  const magic = await body.peek(2);
  if (!magic || magic[0] !== 0x1f || magic[1] !== 0x8b) return fail(badRequest());

  // A repeated POST (the dialog's Try again after a lost answer, review fix
  // CR3): the run its key made, not another one. Before the count, so a
  // retry at the limit still gets its run.
  const byKey = async (): Promise<Response | null> => {
    if (meta.key === undefined) return null;
    const row = await c.db
      .prepare(`SELECT ${PUB_COLUMNS}, ${newsColumns('?1', '?3')} FROM publication WHERE account = ?1 AND pub_key = ?2`)
      .bind(account.id, meta.key, account.reactions_seen)
      .first<PubRow & NewsCols>();
    if (!row) return null;
    // Still on its way to R2 (the first request is running): no second copy.
    if (row.state === 'pending') return error('unavailable', 503);
    return json({ pub: myPub(row) } satisfies PubWritten);
  };
  const repeated = await byKey();
  if (repeated) return fail(repeated);

  // 1. Reserve the count under a fresh id (and, for a listed run, one of
  // the day's first listings: stage 65, held in the same insert).
  const today = dayStart(utcDay(c.now));
  const listed = meta.listed ? 1 : 0;
  let id = '';
  let made = false;
  for (let tries = 0; tries < ID_TRIES && !made; tries++) {
    id = newPubId();
    try {
      const results = await c.db.batch([
        c.db
          .prepare(
            `INSERT INTO publication (id, account, title, description, character, level, length_s, bytes, listed, listed_at, state, created, updated, pub_key)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?12, CASE WHEN ?12 = 1 THEN ?9 END, 'pending', ?9, ?9, ?11
             WHERE (SELECT pub_count FROM account WHERE id = ?2) < ?10
             AND (?12 = 0 OR (SELECT COUNT(*) FROM publication WHERE account = ?2 AND listed_at >= ?13) < ?14)`,
          )
          .bind(id, account.id, meta.title, meta.description, meta.character, meta.level ?? null, meta.lengthS, bytes, c.now, limits.sharedRuns, meta.key ?? null, listed, today, limits.listingsPerDay),
        c.db
          .prepare(
            `UPDATE account SET pub_count = pub_count + 1, pub_bytes = pub_bytes + ?3
             WHERE id = ?1 AND EXISTS (SELECT 1 FROM publication WHERE id = ?2 AND account = ?1 AND state = 'pending')`,
          )
          .bind(account.id, id, bytes),
      ]);
      if (results[0]?.meta.changes !== 1) {
        const still = await c.db.prepare('SELECT pub_count FROM account WHERE id = ?1').bind(account.id).first<{ pub_count: number }>();
        // The account was deleted while this request ran.
        if (!still) return fail(error('unauthorized', 401));
        if (still.pub_count >= limits.sharedRuns) return fail(json({ error: 'pub_quota', limit: limits.sharedRuns } satisfies PubQuota, 413));
        // Room for the run, so it was the day's listings.
        return fail(error('too_many', 429));
      }
      made = true;
    } catch (e) {
      // The id is taken (the batch is one transaction: nothing applied): draw
      // again; or a parallel POST with the same key made its row first.
      if (!/UNIQUE|constraint/i.test(String(e instanceof Error ? e.message : e))) throw e;
      const same = await byKey();
      if (same) return fail(same);
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
  const [done, read] = await c.db.batch<PubRow & NewsCols>([
    c.db.prepare(`UPDATE publication SET state = 'active', updated = ?2 WHERE id = ?1 AND state = 'pending'`).bind(id, c.now),
    c.db.prepare(`SELECT ${PUB_COLUMNS}, ${newsColumns('?2', '?3')} FROM publication WHERE id = ?1`).bind(id, account.id, account.reactions_seen),
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
  const on = await flags(env, now);
  if (!on.share) return notFound();
  const rest = url.pathname.slice(PUBLIC_PREFIX.length);
  const m = /^([^/]+)(\/payload|\/view|\/comments)?$/.exec(rest);
  if (!m) return notFound();
  const part = m[2] ?? '';
  // The comments (stage 65) are the flag `gallery`'s.
  if (part === '/comments' && !on.gallery) return notFound();
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
    const res = part === '/comments' ? await commentsGet(db, id, url) : await publicAnswer(request, env, db, id, part, now, on.gallery);
    return head ? new Response(null, { status: res.status, headers: res.headers }) : res;
  } catch {
    return error('unavailable', 503);
  }
}

async function publicAnswer(request: Request, env: Env, db: D1, id: string, part: string, now: number, gallery: boolean): Promise<Response> {
  if (part === '/view') {
    // Only the watch page counts a view (review fix S5): JSON with `X-WC: 1`
    // and the site's own Origin, which a page of another site cannot send
    // without a preflight that gets no CORS answer.
    const type = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
    // (auth.ts `sameSite`, written out: auth.ts imports this module.)
    const sameSite = request.headers.get('x-wc') === '1' && request.headers.get('origin') === new URL(request.url).origin;
    if (type !== 'application/json' || !sameSite) return error('forbidden', 403);
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
    // Stage 65 (ADR 0155): the device id is the client's own, so a view also
    // needs the address (hashed under the day's pepper; an IPv6 /56 is one)
    // not to have viewed the run today: a second row keyed `a:<hash>`.
    // Without the pepper (a host without the secrets) the device alone counts.
    const pepper = env.AUTH_PEPPER ?? '';
    // Review fix S4: the address as its IPv6 /56 here (one customer's), not the limiters' /64.
    const viewer = viewAddressKey(request.headers.get('cf-connecting-ip'));
    const byAddress = pepper.length >= 16 ? `a:${await addressHash(utf8(pepper), viewer, now)}` : b.device;
    // The count grows only with new (pub, device, day) and (pub, address,
    // day) rows: the check and the inserts in one transaction.
    const live = `EXISTS (SELECT 1 FROM publication WHERE id = ?1 AND state = 'active')`;
    await db.batch([
      db
        .prepare(
          `UPDATE publication SET views = views + 1 WHERE id = ?1 AND state = 'active'
           AND NOT EXISTS (SELECT 1 FROM pub_view WHERE pub = ?1 AND day = ?3 AND device IN (?2, ?4))`,
        )
        .bind(id, b.device, day, byAddress),
      db.prepare(`INSERT OR IGNORE INTO pub_view (pub, device, day) SELECT ?1, ?2, ?3 WHERE ${live}`).bind(id, b.device, day),
      db.prepare(`INSERT OR IGNORE INTO pub_view (pub, device, day) SELECT ?1, ?2, ?3 WHERE ${live}`).bind(id, byAddress, day),
    ]);
    return new Response(null, { status: 204, headers: EMPTY_HEADERS });
  }
  const row = await pubWithSender(db, id);
  const refused = stateAnswer(row);
  if (refused || !row) return refused ?? notFound();
  if (part === '') return json(pubMeta(row, row.sender ?? '', gallery));
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
 * The daily cron's part: views older than two days go; `pending` rows left
 * by an isolate that died an hour ago become tombstones and give their
 * count back (one batch for all of them), and their objects go; tombstones
 * whose object may still be in R2 have it deleted, once they are an hour
 * old: Delete account turns an upload's `pending` row into a tombstone
 * while its object may still be on its way to R2 (review fix CR7), so a
 * fresh tombstone is left to its upload's own clean-up until then.
 */
export async function sweepPubs(env: Env, now: number): Promise<void> {
  const db = env.DB;
  if (!db) return;
  await db.prepare('DELETE FROM pub_view WHERE day < ?1').bind(utcDay(now - KEEP_VIEWS_DAYS * DAY_MS)).run();
  const { results: stale } = await db
    .prepare(`SELECT id FROM publication WHERE state = 'pending' AND updated <= ?1 LIMIT ?2`)
    .bind(now - PENDING_STALE_MS, SWEEP_PER_RUN)
    .all<{ id: string }>();
  if (stale.length > 0) {
    const ids = JSON.stringify(stale.map((r) => r.id));
    const these = `state = 'pending' AND id IN (SELECT value FROM json_each(?1))`;
    const mine = `q.account = account.id AND q.state = 'pending' AND q.id IN (SELECT value FROM json_each(?1))`;
    await db.batch([
      db
        .prepare(
          `UPDATE account SET
             pub_count = pub_count - (SELECT COUNT(*) FROM publication q WHERE ${mine}),
             pub_bytes = pub_bytes - (SELECT COALESCE(SUM(q.bytes), 0) FROM publication q WHERE ${mine})
           WHERE id IN (SELECT account FROM publication WHERE ${these})`,
        )
        .bind(ids),
      db.prepare(`UPDATE publication SET ${TOMBSTONE_SET}, updated = ?2 WHERE ${these}`).bind(ids, now),
    ]);
    await dropObjects(env, stale.map((r) => r.id));
  }
  const { results: left } = await db
    .prepare(`SELECT id FROM publication WHERE state = 'removed' AND bytes > 0 AND updated <= ?1 LIMIT ?2`)
    .bind(now - PENDING_STALE_MS, SWEEP_PER_RUN)
    .all<{ id: string }>();
  await dropObjects(env, left.map((r) => r.id));
}
