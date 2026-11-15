// The community (spec §7.8, §7.10, ADR 0155; the contract is "The
// community" in shared/cloud/api.ts). Behind the flags `share` and
// `gallery`; Random Runes behind `runes` as well.
//
//   GET    /api/gallery?sort=&period=&page=&by=   the list (public, cached 60 s)
//   GET    /api/community                     the Hall of Fame boxes (public, cached 60 s)
//   GET    /api/runes                         the board (public, cached 60 s; `runes`)
//   GET    /api/pub/<id>/comments?before=     a run's comments, newest page first (public; reached through worker/pub.ts)
//   GET|PUT|DELETE /api/u/pub/<id>/vote      one's vote
//   POST   /api/u/pub/<id>/comments           a comment
//   DELETE /api/u/comments/<id>               the writer's or the run's sender's
//   POST   /api/u/runes                       a note (`runes`)
//   DELETE /api/u/runes/<id>                  the writer's own (`runes`)
//   GET    /api/u/community/news              the counts of the menu and the owner row
//   POST   /api/u/community/seen              the account's seen times
//
// `/api/u/*` is reached through worker/auth.ts (the flag `accounts`, the
// limits, the CSRF rule, the session; the flags here are checked there).
//
// Every limit is held inside the statement that writes (a count in the
// INSERT's WHERE), so parallel requests never pass it, and every sum is
// `x = x ± ?` in the batch that writes the vote, so parallel votes never
// lose one. A vote's statements share one guard that the batch's own
// writes cannot change (it counts the account's other votes), so the three
// statements of a vote either all apply or none does.
import {
  type CommentPage,
  type CommentWritten,
  type CommunityBoxes,
  type CommunityNews,
  DAY_RUN_DESCRIPTION_MAX,
  type DayRun,
  type CommunitySeen,
  COMMENT_CURSOR_PATTERN,
  COMMENT_MAX,
  COMMENT_NEWLINES_MAX,
  COMMENTS_PAGE_SIZE,
  COMMENTS_PER_RUN,
  COMMUNITY_CACHE_SECONDS,
  COMMUNITY_ID_PATTERN,
  COUNTER_RUNS,
  GALLERY_PAGE_SIZE,
  GALLERY_PAGES_MAX,
  GALLERY_PERIOD_DAYS,
  GALLERY_PERIODS,
  GALLERY_SORTS,
  type GalleryPage,
  type GalleryPeriod,
  type GalleryRow,
  type GallerySort,
  HALL_OF_FAME_SIZE,
  NEWS_MAX,
  NOTE_DAYS,
  NOTE_MAX,
  type NoteWritten,
  PUB_ID_PATTERN,
  RANKING_AGE_DAYS,
  RUNES_SHOWN,
  type RunesBoard,
  type Stars,
  TOP_PRIOR_MEAN,
  TOP_PRIOR_VOTES,
  type VoteAnswer,
  NAME_PATTERN,
} from '../shared/cloud/api.ts';
import { isPublicText } from '../shared/cloud/text.ts';
import { hasKeys, limitsOf } from './accounts.ts';
import { addressKey } from './address.ts';
import { hmacKey, hmacWith, sha256, toB64url, utf8 } from './bytes.ts';
import { flags } from './flags.ts';
import { readMume } from './mume.ts';
import { type PubCtx, type PubRowState, newPubId, stateAnswer } from './pub.ts';
import { DAY_MS, type D1, type D1Statement, type Deps, type Env, dayStart, error, json, utcDay } from './runtime.ts';
import type { Authed } from './sessions.ts';
import { readCapped } from './stats.ts';

export const HOUR_MS = 3_600_000;
/** The largest body of a comment or a note (1 000 code points of 4 bytes, escaped). */
const MAX_TEXT_BYTES = 16_384;
const MAX_SMALL_BYTES = 512;
/** A fresh id that meets an existing one is drawn again this many times. */
const ID_TRIES = 5;

const EMPTY_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const done = (): Response => new Response(null, { status: 204, headers: EMPTY_HEADERS });
const notFound = (): Response => error('not_found', 404);
const badRequest = (): Response => error('bad_request', 400);
const PUBLIC_CACHE = { 'Cache-Control': `public, max-age=${COMMUNITY_CACHE_SECONDS}` };

async function bodyOf(request: Request, max: number, required: string[], optional: string[] = []): Promise<Record<string, unknown> | null> {
  const text = await readCapped(request, max);
  let b: unknown = null;
  try {
    b = text === null ? null : JSON.parse(text);
  } catch {
    b = null;
  }
  return hasKeys(b, required, optional) ? b : null;
}

/** Free public text of 1–`max` code points, trimmed, by the rules (shared/cloud/text.ts), or null (400 bad_text). */
export function publicTextOf(v: unknown, max: number, newlines: number): string | null {
  if (typeof v !== 'string' || v.length > max * 2 + 8 || v.trim() !== v) return null;
  const n = [...v].length;
  return n >= 1 && n <= max && isPublicText(v, { newlines }) ? v : null;
}

// --- The cache (ADR 0155: 60 s per normalised variant) ---

/**
 * The answer kept under `key` (a normalised URL) in the Cache API, or
 * `make()`'s, stored when it is a 200. Without a cache (Deps.cache: the
 * static server, the tests), or with one that fails, `make()` answers.
 */
export async function cached(deps: Deps, key: string, make: () => Promise<Response>): Promise<Response> {
  const cache = deps.cache;
  if (!cache) return make();
  const req = new Request(key, { method: 'GET' });
  try {
    const hit = await cache.match(req);
    if (hit) return hit;
  } catch {
    // A cache that fails is no cache.
  }
  const res = await make();
  if (res.status === 200) {
    try {
      await cache.put(req, res.clone());
    } catch {
      // Not kept: the next request reads the database again.
    }
  }
  return res;
}

// --- Rows of the lists ---

interface ListRow {
  id: string;
  title: string;
  sender: string;
  character: string;
  level: number | null;
  length_s: number;
  listed_at: number;
  views: number;
  vote_sum: number;
  vote_count: number;
  comment_count: number;
}

const LIST_COLUMNS = 'p.id, p.title, a.name AS sender, p.character, p.level, p.length_s, p.listed_at, p.views, p.vote_sum, p.vote_count, p.comment_count';
/** The runs the lists show. */
const LISTED = "p.state = 'active' AND p.listed = 1";

function galleryRow(r: ListRow): GalleryRow {
  const out: GalleryRow = {
    id: r.id,
    title: r.title,
    sender: r.sender,
    character: r.character,
    lengthS: r.length_s,
    listedAt: r.listed_at,
    views: r.views,
    stars: { sum: r.vote_sum, count: r.vote_count },
    comments: r.comment_count,
  };
  if (r.level !== null) out.level = r.level;
  return out;
}

/** Top's prior mean `m` (ADR 0148): over every ranking vote on listed active runs. */
const MEAN = `(SELECT CASE WHEN SUM(q.top_count) > 0 THEN CAST(SUM(q.top_sum) AS REAL) / SUM(q.top_count) ELSE ${TOP_PRIOR_MEAN}.0 END
               FROM publication q WHERE q.state = 'active' AND q.listed = 1)`;

const ORDER: Record<GallerySort, string> = {
  top: `(${TOP_PRIOR_VOTES}.0 * m.mean + p.top_sum) / (${TOP_PRIOR_VOTES} + p.top_count) DESC, p.top_count DESC, p.listed_at DESC, p.id`,
  new: 'p.listed_at DESC, p.id',
  watched: 'p.views DESC, p.listed_at DESC, p.id',
  comments: 'p.comment_count DESC, p.listed_at DESC, p.id',
  length: 'p.length_s DESC, p.listed_at DESC, p.id',
};

/**
 * Listed active runs, listed at or after `since`, in `sort`'s order; only
 * the account `by` (its id) when it is given.
 */
function listRowsQuery(db: D1, sort: GallerySort, since: number, limit: number, offset: number, by: string | null = null): D1Statement {
  const mean = sort === 'top' ? `, (SELECT ${MEAN} AS mean) m` : '';
  return db
    .prepare(
      `SELECT ${LIST_COLUMNS} FROM publication p JOIN account a ON a.id = p.account${mean}
       WHERE ${LISTED} AND p.listed_at >= ?1 AND (?4 IS NULL OR p.account = ?4) ORDER BY ${ORDER[sort]} LIMIT ?2 OFFSET ?3`,
    )
    .bind(since, limit, offset, by);
}

/** How many runs `listRows` can reach (the pager's "of N", cut to GALLERY_PAGE_SIZE × GALLERY_PAGES_MAX by the caller). */
function countRowsQuery(db: D1, since: number, by: string | null): D1Statement {
  return db.prepare(`SELECT COUNT(*) AS n FROM publication p WHERE ${LISTED} AND p.listed_at >= ?1 AND (?2 IS NULL OR p.account = ?2)`).bind(since, by);
}

// --- Public paths ---

const PUBLIC_PATHS = new Set(['/api/gallery', '/api/community', '/api/runes']);

export function isCommunityPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path);
}

/** Every public community path: the flags, the method, the general limit by address, the database. */
export async function communityPublic(request: Request, env: Env, url: URL, deps: Deps): Promise<Response> {
  const now = deps.now();
  const path = url.pathname;
  const on = await flags(env, now);
  if (!on.share || !on.gallery || (path === '/api/runes' && !on.runes)) return notFound();
  const head = request.method === 'HEAD';
  if (!head && request.method !== 'GET') return error('method_not_allowed', 405, { Allow: 'GET' });
  const address = addressKey(request.headers.get('cf-connecting-ip'));
  if (env.API_LIMITER && !(await env.API_LIMITER.limit({ key: `a|${address}` })).success) return error('rate_limited', 429);
  const db = env.DB;
  if (!db) return error('unavailable', 503);
  try {
    const res =
      path === '/api/gallery'
        ? await gallery(db, url, deps, now)
        : path === '/api/community'
          ? await cached(deps, `${url.origin}/api/community`, () => boxes(env, db, now))
          : await cached(deps, `${url.origin}/api/runes`, () => runes(db, now));
    return head ? new Response(null, { status: res.status, headers: res.headers }) : res;
  } catch {
    return error('unavailable', 503);
  }
}

function oneOf<T extends string>(list: readonly T[], v: string | null, fallback: T): T | null {
  if (v === null) return fallback;
  return (list as readonly string[]).includes(v) ? (v as T) : null;
}

/**
 * The list's parameters, normalised (defaults filled, unknown parameters
 * dropped), or null (400). `by` is never refused: the name's lowercase
 * when it is a valid name, else `''`, which matches no account (an empty
 * list, as for an unknown name).
 */
export function galleryParams(url: URL): { sort: GallerySort; period: GalleryPeriod; page: number; by?: string } | null {
  const sort = oneOf(GALLERY_SORTS, url.searchParams.get('sort'), 'new');
  const period = oneOf(GALLERY_PERIODS, url.searchParams.get('period'), 'all');
  const p = url.searchParams.get('page') ?? '1';
  const page = /^[1-9]\d{0,2}$/.test(p) ? Number(p) : 0;
  if (!sort || !period || page < 1 || page > GALLERY_PAGES_MAX) return null;
  const by = url.searchParams.get('by');
  if (by === null) return { sort, period, page };
  return { sort, period, page, by: NAME_PATTERN.test(by) ? by.toLowerCase() : '' };
}

async function gallery(db: D1, url: URL, deps: Deps, now: number): Promise<Response> {
  const q = galleryParams(url);
  if (!q) return badRequest();
  const empty = (): Response => json({ sort: q.sort, period: q.period, page: q.page, rows: [], more: false, total: 0, time: now } satisfies GalleryPage, 200, PUBLIC_CACHE);
  // A sender's list (review fix S9): the name first, one indexed lookup; an
  // unknown (or deleted) name is an empty page, without the list's queries
  // and without a cache entry of its own, so made-up names cost little.
  let by: string | null = null;
  if (q.by !== undefined) {
    const row = q.by === '' ? null : await db.prepare('SELECT id FROM account WHERE name_key = ?1').bind(q.by).first<{ id: string }>();
    if (!row) return empty();
    by = row.id;
  }
  const byPart = q.by === undefined ? '' : `&by=${encodeURIComponent(q.by)}`;
  return cached(deps, `${url.origin}/api/gallery?sort=${q.sort}&period=${q.period}&page=${q.page}${byPart}`, async () => {
    const days = GALLERY_PERIOD_DAYS[q.period];
    const since = days === null ? 0 : now - days * DAY_MS;
    const [list, count] = await db.batch<Record<string, unknown>>([
      listRowsQuery(db, q.sort, since, GALLERY_PAGE_SIZE + 1, (q.page - 1) * GALLERY_PAGE_SIZE, by),
      countRowsQuery(db, since, by),
    ]);
    const rows = ((list?.results ?? []) as unknown as ListRow[]).map(galleryRow);
    const more = rows.length > GALLERY_PAGE_SIZE && q.page < GALLERY_PAGES_MAX;
    const total = Math.min(Number(count?.results[0]?.n ?? 0), GALLERY_PAGE_SIZE * GALLERY_PAGES_MAX);
    const answer: GalleryPage = { sort: q.sort, period: q.period, page: q.page, rows: rows.slice(0, GALLERY_PAGE_SIZE), more, total, time: now };
    return json(answer, 200, PUBLIC_CACHE);
  });
}

/**
 * The run of the day `day`: among the runs listed before the day began, the
 * one whose id has the smallest HMAC-SHA-256 under AUTH_PEPPER and the day
 * (fixed for the day, not guessable ahead). Without the secret (a host
 * without it) a SHA-256, which is only fixed.
 */
async function runOfDay(env: Env, ids: { id: string }[], day: string): Promise<string | null> {
  const pepper = env.AUTH_PEPPER ?? '';
  // The key once per request, not once per run (review fix CR5).
  const key = pepper.length >= 16 ? await hmacKey(utf8(pepper)) : null;
  let best: string | null = null;
  let bestMac = '';
  for (const r of ids) {
    const text = `wc-day-run|${day}|${r.id}`;
    const mac = toB64url(key ? await hmacWith(key, text) : await sha256(utf8(text)));
    if (best === null || mac < bestMac) {
      best = r.id;
      bestMac = mac;
    }
  }
  return best;
}

/** The run of the day's row with its description cut to DAY_RUN_DESCRIPTION_MAX code points; null when it is gone. */
async function dayRun(db: D1, id: string | null): Promise<DayRun | null> {
  if (id === null) return null;
  const r = await db
    .prepare(`SELECT ${LIST_COLUMNS}, p.description FROM publication p JOIN account a ON a.id = p.account WHERE ${LISTED} AND p.id = ?1`)
    .bind(id)
    .first<ListRow & { description: string }>();
  return r ? { ...galleryRow(r), description: [...r.description].slice(0, DAY_RUN_DESCRIPTION_MAX).join('') } : null;
}

async function boxes(env: Env, db: D1, now: number): Promise<Response> {
  const day = utcDay(now);
  // The independent reads in one batch (review fix CR5): the runs the run
  // of the day is drawn from (listed before the day began) and the Hall of
  // Fame; MUME's boxes beside it (readMume keeps its own failure apart).
  const [[ids, hall], mume] = await Promise.all([
    db.batch<Record<string, unknown>>([
      db.prepare(`SELECT p.id FROM publication p WHERE ${LISTED} AND p.listed_at < ?1`).bind(dayStart(day)),
      listRowsQuery(db, 'top', 0, HALL_OF_FAME_SIZE, 0),
    ]),
    readMume(db, now),
  ]);
  const answer: CommunityBoxes = {
    hallOfFame: ((hall?.results ?? []) as unknown as ListRow[]).map(galleryRow),
    today: await dayRun(db, await runOfDay(env, (ids?.results ?? []) as { id: string }[], day)),
    time: now,
  };
  if (mume) answer.mume = mume;
  return json(answer, 200, PUBLIC_CACHE);
}

async function runes(db: D1, now: number): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT n.id, a.name AS writer, n.text, n.created FROM note n JOIN account a ON a.id = n.account
       WHERE n.state = 'active' AND a.state = 'active' AND n.created > ?1 ORDER BY n.created DESC, n.id DESC LIMIT ?2`,
    )
    .bind(now - NOTE_DAYS * DAY_MS, RUNES_SHOWN)
    .all<{ id: string; writer: string; text: string; created: number }>();
  return json({ notes: results, time: now } satisfies RunesBoard, 200, PUBLIC_CACHE);
}

/**
 * `GET /api/pub/<id>/comments[?before=<created>.<id>]`, or `?page=N|last`
 * of clients before review fix CR1 (worker/pub.ts has checked the flags,
 * the limit and the id).
 */
export async function commentsGet(db: D1, id: string, url: URL): Promise<Response> {
  const p = url.searchParams.get('page');
  const b = url.searchParams.get('before');
  if (p !== null && b !== null) return badRequest();
  if (p !== null && p !== 'last' && !/^[1-9]\d{0,5}$/.test(p)) return badRequest();
  const cursor = b === null ? null : COMMENT_CURSOR_PATTERN.exec(b);
  if (b !== null && !cursor) return badRequest();
  const row = await db.prepare('SELECT state, comment_count FROM publication WHERE id = ?1').bind(id).first<{ state: PubRowState; comment_count: number }>();
  const refused = stateAnswer(row);
  if (refused || !row) return refused ?? notFound();
  const total = row.comment_count;
  const pages = Math.max(1, Math.ceil(total / COMMENTS_PAGE_SIZE));
  const page = p === null ? null : p === 'last' ? pages : Number(p);
  // Newest first from the cursor (or from the newest end, `pages - page` pages
  // in), one more than a page to know whether older ones are left.
  const offset = page === null ? 0 : Math.max(0, pages - page) * COMMENTS_PAGE_SIZE;
  const { results } =
    page !== null && page > pages
      ? { results: [] }
      : await db
          .prepare(
            `SELECT c.id, a.name AS writer, c.text, c.created FROM comment c JOIN account a ON a.id = c.account
             WHERE c.publication = ?1 AND c.state = 'active' AND a.state = 'active'
             AND (?2 IS NULL OR c.created < ?2 OR (c.created = ?2 AND c.id < ?3))
             ORDER BY c.created DESC, c.id DESC LIMIT ?4 OFFSET ?5`,
          )
          .bind(id, cursor ? Number(cursor[1]) : null, cursor ? cursor[2] : null, COMMENTS_PAGE_SIZE + 1, offset)
          .all<{ id: string; writer: string; text: string; created: number }>();
  const more = results.length > COMMENTS_PAGE_SIZE;
  const comments = results.slice(0, COMMENTS_PAGE_SIZE).reverse();
  const answer: CommentPage = { comments, total, more };
  const oldest = comments[0];
  if (more && oldest) answer.before = `${oldest.created}.${oldest.id}`;
  if (page !== null) {
    answer.page = page;
    answer.pages = pages;
  }
  return json(answer);
}

// --- /api/u/* ---

type Handler = (c: PubCtx) => Promise<Response>;

const PUB_PREFIX = '/api/u/pub/';
const COMMENTS_PREFIX = '/api/u/comments/';
const RUNES_PATH = '/api/u/runes';
const NEWS_PATH = '/api/u/community/news';
const SEEN_PATH = '/api/u/community/seen';

/** A community path under `/api/u/`, the flag it needs beside `share` and `gallery`, and its route; undefined when it is none. */
export function communityUserRoute(path: string): { runes: boolean; route: Record<string, Handler> | undefined } | undefined {
  if (path.startsWith(PUB_PREFIX)) {
    const rest = path.slice(PUB_PREFIX.length);
    if (/^[^/]+\/vote$/.test(rest)) return { runes: false, route: { GET: voteGet, PUT: votePut, DELETE: voteDelete } };
    if (/^[^/]+\/comments$/.test(rest)) return { runes: false, route: { POST: commentPost } };
    return undefined;
  }
  if (path.startsWith(COMMENTS_PREFIX)) return { runes: false, route: /^[^/]+$/.test(path.slice(COMMENTS_PREFIX.length)) ? { DELETE: commentDelete } : undefined };
  if (path === RUNES_PATH) return { runes: true, route: { POST: notePost } };
  if (path.startsWith(`${RUNES_PATH}/`)) return { runes: true, route: /^[^/]+$/.test(path.slice(RUNES_PATH.length + 1)) ? { DELETE: noteDelete } : undefined };
  if (path === NEWS_PATH) return { runes: false, route: { GET: news } };
  if (path === SEEN_PATH) return { runes: false, route: { POST: seen } };
  return undefined;
}

function pubIdOf(c: PubCtx): string | null {
  const id = c.url.pathname.slice(PUB_PREFIX.length).split('/')[0] ?? '';
  return PUB_ID_PATTERN.test(id) ? id : null;
}

function lastIdOf(c: PubCtx): string | null {
  const id = c.url.pathname.split('/').at(-1) ?? '';
  return COMMUNITY_ID_PATTERN.test(id) ? id : null;
}

const me = (c: PubCtx): Authed['account'] => (c.auth as Authed).account;
const suspended = (c: PubCtx): boolean => me(c).state === 'suspended';

// --- Votes ---

async function starsOf(db: D1, id: string, account: string): Promise<VoteAnswer> {
  const [p, v] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT vote_sum, vote_count FROM publication WHERE id = ?1').bind(id),
    db.prepare('SELECT stars FROM vote WHERE publication = ?1 AND account = ?2').bind(id, account),
  ]);
  return answerOf(p?.results[0], v?.results[0]);
}

function answerOf(p: Record<string, unknown> | undefined, v: Record<string, unknown> | undefined): VoteAnswer {
  const stars: Stars = { sum: Number(p?.vote_sum ?? 0), count: Number(p?.vote_count ?? 0) };
  return { stars, mine: v ? Number(v.stars) : null };
}

async function pubState(db: D1, id: string): Promise<{ account: string; state: PubRowState } | null> {
  return db.prepare('SELECT account, state FROM publication WHERE id = ?1').bind(id).first<{ account: string; state: PubRowState }>();
}

async function voteGet(c: PubCtx): Promise<Response> {
  const id = pubIdOf(c);
  const row = id ? await pubState(c.db, id) : null;
  if (!id || row?.state !== 'active') return notFound();
  return json(await starsOf(c.db, id, me(c).id));
}

/** The old vote's share of the sums, as SET expressions (`sign` `-`) or the new one's (`+`, from ?3 and ?5). */
const OLD = (col: string): string => `(SELECT ${col} FROM vote WHERE publication = ?1 AND account = ?2)`;

async function votePut(c: PubCtx): Promise<Response> {
  const account = me(c);
  const id = pubIdOf(c);
  if (!id) return notFound();
  if (suspended(c)) return error('suspended', 403);
  const b = await bodyOf(c.request, MAX_SMALL_BYTES, ['stars']);
  if (!b || typeof b.stars !== 'number' || !Number.isInteger(b.stars) || b.stars < 1 || b.stars > 5) return badRequest();
  const row = await pubState(c.db, id);
  if (row?.state !== 'active') return notFound();
  if (row.account === account.id) return error('own', 403);
  const limits = limitsOf(account, c.env);
  // The vote ranks (moves Top) only when the account is RANKING_AGE_DAYS old now (ADR 0155).
  const ranks = c.now - account.created >= RANKING_AGE_DAYS * DAY_MS ? 1 : 0;
  // The guard: the account active, the run active and another's, and the
  // account's *other* votes of the last hour under the limit. None of the
  // three statements changes it, so they all apply or none does.
  const guard = `EXISTS (SELECT 1 FROM account WHERE id = ?2 AND state = 'active')
    AND EXISTS (SELECT 1 FROM publication WHERE id = ?1 AND state = 'active' AND account <> ?2)
    AND (SELECT COUNT(*) FROM vote WHERE account = ?2 AND updated > ?6 AND publication <> ?1) < ?7`;
  const binds = [id, account.id, b.stars, c.now, ranks, c.now - HOUR_MS, limits.votesPerHour];
  const results = await c.db.batch<Record<string, unknown>>([
    c.db
      .prepare(
        `UPDATE publication SET
           vote_sum = vote_sum - COALESCE(${OLD('stars')}, 0), vote_count = vote_count - (SELECT COUNT(*) FROM vote WHERE publication = ?1 AND account = ?2),
           top_sum = top_sum - COALESCE(${OLD('stars * ranks')}, 0), top_count = top_count - COALESCE(${OLD('ranks')}, 0)
         WHERE id = ?1 AND ${guard} AND ?3 IS NOT NULL AND ?4 IS NOT NULL AND ?5 IS NOT NULL`,
      )
      .bind(...binds),
    c.db
      .prepare(
        `INSERT INTO vote (publication, account, stars, created, updated, ranks) SELECT ?1, ?2, ?3, ?4, ?4, ?5 WHERE ${guard}
         ON CONFLICT (publication, account) DO UPDATE SET stars = excluded.stars, updated = excluded.updated, ranks = excluded.ranks`,
      )
      .bind(...binds),
    c.db
      .prepare(
        `UPDATE publication SET vote_sum = vote_sum + ?3, vote_count = vote_count + 1, top_sum = top_sum + ?3 * ?5, top_count = top_count + ?5
         WHERE id = ?1 AND ${guard} AND ?4 IS NOT NULL`,
      )
      .bind(...binds),
    c.db.prepare('SELECT vote_sum, vote_count FROM publication WHERE id = ?1').bind(id),
    c.db.prepare('SELECT stars FROM vote WHERE publication = ?1 AND account = ?2').bind(id, account.id),
  ]);
  if (results[1]?.meta.changes !== 1) {
    const now = await pubState(c.db, id);
    if (now?.state !== 'active') return notFound();
    const still = await c.db.prepare('SELECT state FROM account WHERE id = ?1').bind(account.id).first<{ state: string }>();
    if (!still) return error('unauthorized', 401);
    if (still.state === 'suspended') return error('suspended', 403);
    return error('too_many', 429);
  }
  return json(answerOf(results[3]?.results[0], results[4]?.results[0]));
}

async function voteDelete(c: PubCtx): Promise<Response> {
  const account = me(c);
  const id = pubIdOf(c);
  if (!id) return notFound();
  if (suspended(c)) return error('suspended', 403);
  const row = await pubState(c.db, id);
  if (row?.state !== 'active' && row?.state !== 'hidden') return notFound();
  // Only an active account's vote is in the sums (a suspended one's are out).
  const live = `EXISTS (SELECT 1 FROM account WHERE id = ?2 AND state = 'active') AND EXISTS (SELECT 1 FROM vote WHERE publication = ?1 AND account = ?2)`;
  const results = await c.db.batch<Record<string, unknown>>([
    c.db
      .prepare(
        `UPDATE publication SET vote_sum = vote_sum - ${OLD('stars')}, vote_count = vote_count - 1,
           top_sum = top_sum - ${OLD('stars * ranks')}, top_count = top_count - ${OLD('ranks')}
         WHERE id = ?1 AND ${live}`,
      )
      .bind(id, account.id),
    c.db.prepare(`DELETE FROM vote WHERE publication = ?1 AND account = ?2 AND EXISTS (SELECT 1 FROM account WHERE id = ?2 AND state = 'active')`).bind(id, account.id),
    c.db.prepare('SELECT vote_sum, vote_count FROM publication WHERE id = ?1').bind(id),
  ]);
  return json(answerOf(results[2]?.results[0], undefined));
}

/**
 * The statement that moves the votes of the account `?1` out of (`-`) or
 * back into (`+`) both sums of every run it voted on, only while `when`
 * (a condition with the caller's placeholders) holds: suspension, Restore
 * and deletion (ADR 0155).
 */
export function moveVotes(db: D1, sign: '+' | '-', when: string, binds: unknown[]): D1Statement {
  const mine = (col: string): string => `(SELECT ${col} FROM vote v WHERE v.publication = publication.id AND v.account = ?1)`;
  return db
    .prepare(
      `UPDATE publication SET vote_sum = vote_sum ${sign} ${mine('v.stars')}, vote_count = vote_count ${sign} 1,
         top_sum = top_sum ${sign} ${mine('v.stars * v.ranks')}, top_count = top_count ${sign} ${mine('v.ranks')}
       WHERE state <> 'removed' AND id IN (SELECT publication FROM vote WHERE account = ?1) AND (${when})`,
    )
    .bind(...binds);
}

/**
 * A comment counts in its run's `comment_count` (and is shown) only while
 * it is active and its writer is (review fix S8): the condition on a
 * comment row `c`.
 */
export const COUNTED = `c.state = 'active' AND EXISTS (SELECT 1 FROM account w WHERE w.id = c.account AND w.state = 'active')`;

/**
 * Suspend (`suspended`) or Restore (`active`): the votes and the
 * `comment_count` of the account's visible comments move with the state,
 * only on a change (moderation.ts; review fix S8 for the comments).
 */
export function stateChange(db: D1, accountId: string, state: 'active' | 'suspended'): D1Statement[] {
  const from = state === 'suspended' ? 'active' : 'suspended';
  const sign = state === 'suspended' ? '-' : '+';
  return [
    moveVotes(db, sign, `(SELECT state FROM account WHERE id = ?1) = ?2`, [accountId, from]),
    db
      .prepare(
        `UPDATE publication SET comment_count = comment_count ${sign} (SELECT COUNT(*) FROM comment c WHERE c.publication = publication.id AND c.account = ?1 AND c.state = 'active')
         WHERE id IN (SELECT publication FROM comment WHERE account = ?1 AND state = 'active') AND (SELECT state FROM account WHERE id = ?1) = ?2`,
      )
      .bind(accountId, from),
    db.prepare('UPDATE account SET state = ?2 WHERE id = ?1').bind(accountId, state),
  ];
}

/**
 * Delete account's part (worker/deletion.ts): the account's votes out of
 * the sums (unless it is suspended: they are out already) and deleted, its
 * comments (`comment_count` adjusted) and notes deleted, the reports on
 * them handled. `still` is the deletion's guard, with ?1 the account and
 * ?2 its hash; ?3 is the time.
 */
export function deletionStatements(db: D1, still: string, accountId: string, hash: string, now: number): D1Statement[] {
  const b = [accountId, hash, now];
  return [
    moveVotes(db, '-', `${still} AND (SELECT state FROM account WHERE id = ?1) <> 'suspended' AND ?3 IS NOT NULL`, b),
    db.prepare(`DELETE FROM vote WHERE account = ?1 AND ${still}`).bind(accountId, hash),
    db
      .prepare(
        `UPDATE publication SET comment_count = comment_count - (SELECT COUNT(*) FROM comment c WHERE c.publication = publication.id AND c.account = ?1 AND c.state = 'active')
         WHERE id IN (SELECT publication FROM comment WHERE account = ?1 AND state = 'active') AND ${still} AND (SELECT state FROM account WHERE id = ?1) <> 'suspended'`,
      )
      .bind(accountId, hash),
    db
      .prepare(
        `UPDATE report SET handled = ?3 WHERE handled = 0 AND ${still}
         AND ((kind = 'comment' AND target IN (SELECT id FROM comment WHERE account = ?1)) OR (kind = 'note' AND target IN (SELECT id FROM note WHERE account = ?1)))`,
      )
      .bind(...b),
    db.prepare(`DELETE FROM comment WHERE account = ?1 AND ${still}`).bind(accountId, hash),
    db.prepare(`DELETE FROM note WHERE account = ?1 AND ${still}`).bind(accountId, hash),
  ];
}

// --- Comments ---

/** Draws ids until an insert does not meet an existing one; the insert's results. */
async function withFreshId<T>(attempt: (id: string) => Promise<T>): Promise<{ id: string; result: T } | null> {
  for (let i = 0; i < ID_TRIES; i++) {
    const id = newPubId();
    try {
      return { id, result: await attempt(id) };
    } catch (e) {
      if (!/UNIQUE|constraint/i.test(String(e instanceof Error ? e.message : e))) throw e;
    }
  }
  return null;
}

async function commentPost(c: PubCtx): Promise<Response> {
  const account = me(c);
  const pub = pubIdOf(c);
  if (!pub) return notFound();
  if (suspended(c)) return error('suspended', 403);
  const b = await bodyOf(c.request, MAX_TEXT_BYTES, ['text']);
  if (!b) return badRequest();
  const text = publicTextOf(b.text, COMMENT_MAX, COMMENT_NEWLINES_MAX);
  if (text === null) return error('bad_text', 400);
  const row = await pubState(c.db, pub);
  if (row?.state !== 'active') return notFound();
  const limits = limitsOf(account, c.env);
  // The limits in the insert: the account active, the run active, its
  // visible comments under COMMENTS_PER_RUN, the account's comments of the
  // last hour (removed ones too) under `commentsPerHour`.
  const made = await withFreshId((id) =>
    c.db.batch([
      c.db
        .prepare(
          `INSERT INTO comment (id, publication, account, text, created) SELECT ?1, ?2, ?3, ?4, ?5
           WHERE EXISTS (SELECT 1 FROM account WHERE id = ?3 AND state = 'active')
           AND (SELECT comment_count FROM publication WHERE id = ?2 AND state = 'active') < ?6
           AND (SELECT COUNT(*) FROM comment WHERE account = ?3 AND created > ?7) < ?8`,
        )
        .bind(id, pub, account.id, text, c.now, COMMENTS_PER_RUN, c.now - HOUR_MS, limits.commentsPerHour),
      c.db.prepare('UPDATE publication SET comment_count = comment_count + 1 WHERE id = ?2 AND EXISTS (SELECT 1 FROM comment WHERE id = ?1)').bind(id, pub),
    ]),
  );
  if (!made) return error('unavailable', 503);
  if (made.result[0]?.meta.changes !== 1) {
    const now = await c.db.prepare('SELECT state, comment_count FROM publication WHERE id = ?1').bind(pub).first<{ state: string; comment_count: number }>();
    if (now?.state !== 'active') return notFound();
    if (now.comment_count >= COMMENTS_PER_RUN) return error('full', 409);
    return error('too_many', 429);
  }
  return json({ comment: { id: made.id, writer: account.name, text, created: c.now } } satisfies CommentWritten);
}

async function commentDelete(c: PubCtx): Promise<Response> {
  const account = me(c);
  const id = lastIdOf(c);
  if (!id) return notFound();
  const row = await c.db
    .prepare('SELECT c.account, c.state, p.account AS owner FROM comment c LEFT JOIN publication p ON p.id = c.publication WHERE c.id = ?1')
    .bind(id)
    .first<{ account: string; state: string; owner: string | null }>();
  if (!row || (row.account !== account.id && row.owner !== account.id)) return notFound();
  // Hidden after reports or by the admin: it stays, with its reports open,
  // until the admin has looked (review fix S7).
  if (row.state === 'hidden') return error('hidden', 403);
  // Removed already: done (a retry after a lost answer).
  if (row.state !== 'removed') await c.db.batch(removeComment(c.db, id, c.now));
  return done();
}

/**
 * A comment removed by its writer or the run's sender: the count first
 * (only an active one counts), its reports handled, then the row without
 * its text (kept an hour for the hourly limit; the daily cron deletes it).
 * Only while it is active: one hidden meanwhile keeps its text and its
 * reports for the admin (review fix S7).
 */
function removeComment(db: D1, id: string, now: number): D1Statement[] {
  const active = `EXISTS (SELECT 1 FROM comment WHERE id = ?1 AND state = 'active')`;
  return [
    db.prepare(`UPDATE publication SET comment_count = comment_count - 1 WHERE id = (SELECT c.publication FROM comment c WHERE c.id = ?1 AND ${COUNTED})`).bind(id),
    db.prepare(`UPDATE report SET handled = ?2 WHERE handled = 0 AND kind = 'comment' AND target = ?1 AND ${active}`).bind(id, now),
    db.prepare(`UPDATE comment SET state = 'removed', text = '', hidden_reason = NULL WHERE id = ?1 AND state = 'active'`).bind(id),
  ];
}

// --- Notes (Random Runes) ---

async function notePost(c: PubCtx): Promise<Response> {
  const account = me(c);
  if (suspended(c)) return error('suspended', 403);
  const b = await bodyOf(c.request, MAX_TEXT_BYTES, ['text']);
  if (!b) return badRequest();
  const text = publicTextOf(b.text, NOTE_MAX, 0);
  if (text === null) return error('bad_text', 400);
  const limits = limitsOf(account, c.env);
  const made = await withFreshId((id) =>
    c.db
      .prepare(
        `INSERT INTO note (id, account, text, created) SELECT ?1, ?2, ?3, ?4
         WHERE EXISTS (SELECT 1 FROM account WHERE id = ?2 AND state = 'active')
         AND (SELECT COUNT(*) FROM note WHERE account = ?2 AND created >= ?5) < ?6`,
      )
      .bind(id, account.id, text, c.now, dayStart(utcDay(c.now)), limits.notesPerDay)
      .run(),
  );
  if (!made) return error('unavailable', 503);
  if (made.result.meta.changes !== 1) {
    const still = await c.db.prepare('SELECT state FROM account WHERE id = ?1').bind(account.id).first<{ state: string }>();
    if (!still) return error('unauthorized', 401);
    return still.state === 'suspended' ? error('suspended', 403) : error('too_many', 429);
  }
  return json({ note: { id: made.id, writer: account.name, text, created: c.now } } satisfies NoteWritten);
}

async function noteDelete(c: PubCtx): Promise<Response> {
  const account = me(c);
  const id = lastIdOf(c);
  if (!id) return notFound();
  const row = await c.db.prepare('SELECT state FROM note WHERE id = ?1 AND account = ?2').bind(id, account.id).first<{ state: string }>();
  if (!row) return notFound();
  // Hidden: it stays for the admin with its reports open (review fix S7).
  if (row.state === 'hidden') return error('hidden', 403);
  if (row.state !== 'removed') {
    // The row stays, without its text, until the day's limit has passed (the daily cron). Only while active (S7).
    const active = `EXISTS (SELECT 1 FROM note WHERE id = ?1 AND state = 'active')`;
    await c.db.batch([
      c.db.prepare(`UPDATE report SET handled = ?2 WHERE handled = 0 AND kind = 'note' AND target = ?1 AND ${active}`).bind(id, c.now),
      c.db.prepare(`UPDATE note SET state = 'removed', text = '', hidden_reason = NULL WHERE id = ?1 AND state = 'active'`).bind(id),
    ]);
  }
  return done();
}

// --- The counters ---

async function news(c: PubCtx): Promise<Response> {
  const account = me(c);
  const runs = `FROM publication p WHERE ${LISTED} AND p.listed_at > ?2 AND p.account <> ?1`;
  const votes = `FROM vote v JOIN publication p ON p.id = v.publication WHERE p.account = ?1 AND p.state = 'active' AND v.updated > ?3 AND v.account <> ?1`;
  const comments = `FROM comment c JOIN publication p ON p.id = c.publication WHERE p.account = ?1 AND p.state = 'active' AND ${COUNTED} AND c.created > ?3 AND c.account <> ?1`;
  const row = await c.db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM (SELECT 1 ${runs} LIMIT ?4)) AS runs, (SELECT MAX(p.listed_at) ${runs}) AS newest_run,
              (SELECT COUNT(*) FROM (SELECT 1 ${votes} LIMIT ?4)) AS votes, (SELECT MAX(v.updated) ${votes}) AS newest_vote,
              (SELECT COUNT(*) FROM (SELECT 1 ${comments} LIMIT ?4)) AS comments, (SELECT MAX(c.created) ${comments}) AS newest_comment`,
    )
    .bind(account.id, account.gallery_seen, account.reactions_seen, NEWS_MAX)
    .first<{ runs: number; newest_run: number | null; votes: number; newest_vote: number | null; comments: number; newest_comment: number | null }>();
  const r = row ?? { runs: 0, newest_run: null, votes: 0, newest_vote: null, comments: 0, newest_comment: null };
  const newestReaction = r.newest_vote === null ? r.newest_comment : r.newest_comment === null ? r.newest_vote : Math.max(r.newest_vote, r.newest_comment);
  return json({ runs: r.runs, reactions: Math.min(NEWS_MAX, r.votes + r.comments), newestRun: r.newest_run, newestReaction } satisfies CommunityNews);
}

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

async function seen(c: PubCtx): Promise<Response> {
  const account = me(c);
  const b = await bodyOf(c.request, MAX_SMALL_BYTES, [], ['gallery', 'reactions']);
  if (!b || Object.keys(b).length === 0) return badRequest();
  if ((b.gallery !== undefined && !whole(b.gallery)) || (b.reactions !== undefined && !whole(b.reactions))) return badRequest();
  // max(old, min(t, now)) for each one given.
  const [, read] = await c.db.batch<{ gallery_seen: number; reactions_seen: number }>([
    c.db
      .prepare(
        `UPDATE account SET gallery_seen = CASE WHEN ?2 IS NULL THEN gallery_seen ELSE MAX(gallery_seen, MIN(?2, ?4)) END,
           reactions_seen = CASE WHEN ?3 IS NULL THEN reactions_seen ELSE MAX(reactions_seen, MIN(?3, ?4)) END
         WHERE id = ?1`,
      )
      .bind(account.id, b.gallery ?? null, b.reactions ?? null, c.now),
    c.db.prepare('SELECT gallery_seen, reactions_seen FROM account WHERE id = ?1').bind(account.id),
  ]);
  const row = read?.results[0];
  if (!row) return error('unauthorized', 401);
  return json({ gallery: row.gallery_seen, reactions: row.reactions_seen } satisfies CommunitySeen);
}

// --- GET /api/stats/public's `listed` ---

/** The `listed_at` of the COUNTER_RUNS newest active listed runs, newest first. */
export async function listedTimes(db: D1): Promise<number[]> {
  const { results } = await db.prepare(`SELECT p.listed_at FROM publication p WHERE ${LISTED} ORDER BY p.listed_at DESC LIMIT ?1`).bind(COUNTER_RUNS).all<{ listed_at: number }>();
  return results.map((r) => r.listed_at);
}

// --- The daily cron ---

/**
 * Notes older than NOTE_DAYS go (their reports handled), except hidden ones
 * still in the admin's queue; rows without text that only held a limit go
 * once it has passed: a removed comment after an hour, a removed note after
 * its UTC day.
 */
export async function sweepCommunity(env: Env, now: number): Promise<void> {
  const db = env.DB;
  if (!db) return;
  const old = `created <= ?1 AND NOT (state = 'hidden' AND EXISTS (SELECT 1 FROM report r WHERE r.kind = 'note' AND r.target = note.id AND r.handled = 0))`;
  const cut = now - NOTE_DAYS * DAY_MS;
  await db.batch([
    db.prepare(`UPDATE report SET handled = ?2 WHERE handled = 0 AND kind = 'note' AND target IN (SELECT id FROM note WHERE ${old})`).bind(cut, now),
    db.prepare(`DELETE FROM note WHERE ${old}`).bind(cut),
    db.prepare(`DELETE FROM note WHERE state = 'removed' AND created < ?1`).bind(dayStart(utcDay(now))),
    db.prepare(`DELETE FROM comment WHERE state = 'removed' AND created <= ?1`).bind(now - HOUR_MS),
  ]);
}
