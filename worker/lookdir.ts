// The directory of shared looks (stage 80 part E, spec §7.14, ADR 0173; the
// contract is "Shared looks" in shared/cloud/api.ts). Table `look_dir`
// (worker/migrations/0009_looks.sql): one row per character name with the
// race and subrace kinds, the sex and a library token. Nothing in it is free
// text, so the directory cannot carry a message or a link.
//
//   PUT    /api/look         {key, name, race, subrace, sex, token}   logged out
//   DELETE /api/look         {key}                                    logged out
//   PUT    /api/u/look       {name, race, subrace, sex, token}        the account (worker/auth.ts)
//   DELETE /api/u/look                                                the account
//   POST   /api/look/find    {names}                                  anonymous
//
// The public routes are JSON with `X-WC: 1` and the site's own Origin (the
// view route's rule, worker/pub.ts), sent with `credentials: 'omit'`; the
// account's go through accountApi with the session.
//
// The owner of a row is HMAC(AUTH_PEPPER, "wc-look|d|" + key) logged out and
// HMAC(AUTH_PEPPER, "wc-look|a|" + account id) logged in. The first reporter
// owns a name; another owner's report is refused (409 `look_owned`) while the
// row is fresher than LOOK_OWNED_DAYS, and may take a staler one over. An
// owner holds at most LOOK_NAMES_PER_OWNER names (409 `too_many_names`).
// Without the pepper the writes answer 503 `looks_not_configured`.
//
// Limits: a report (PUT or DELETE) counts against LOOK_REPORTS_PER_HOUR per
// owner and per address (hashed under the day's pepper), in the `attempt`
// table (worker/attempts.ts; its daily prune removes them); `find` against
// the binding LOOK_LIMITER per address. Nothing here logs a body, a name or
// an address, and `find` keeps no trace of who asked for whom.
import {
  LOOK_FIND_MAX,
  LOOK_KEEP_DAYS,
  LOOK_KEY_PATTERN,
  LOOK_MAX_BODY_BYTES,
  LOOK_NAMES_PER_OWNER,
  LOOK_NAME_PATTERN,
  LOOK_OWNED_DAYS,
  LOOK_RACES,
  LOOK_REPORTS_PER_HOUR,
  LOOK_SEXES,
  LOOK_SUBRACES,
  type LookFindAnswer,
  type LookRow,
} from '../shared/cloud/api.ts';
import { LOOK_TOKEN_IDS } from '../shared/cloud/look-tokens.ts';
import { hasKeys } from './accounts.ts';
import { addressKey } from './address.ts';
import { HOUR_MS, addressHash } from './attempts.ts';
import { hmac, toB64url, utf8 } from './bytes.ts';
import { flags } from './flags.ts';
import { DAY_MS, type D1, type Deps, type Env, error, isOneOf, json } from './runtime.ts';
import type { Authed } from './sessions.ts';
import { readCapped } from './stats.ts';

export const LOOK_PATH = '/api/look';
export const LOOK_FIND_PATH = '/api/look/find';
export const LOOK_USER_PATH = '/api/u/look';

/** The shortest AUTH_PEPPER that counts as set (auth.ts MIN_PEPPER_LENGTH). */
const MIN_PEPPER = 16;
const TOKENS = new Set(LOOK_TOKEN_IDS);
const NO_CONTENT = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const empty = (): Response => new Response(null, { status: 204, headers: NO_CONTENT });
const badRequest = (): Response => error('bad_request', 400);

export function isLookPublicPath(path: string): boolean {
  return path === LOOK_PATH || path === LOOK_FIND_PATH;
}

/** The owner of an account's rows (also what deleting the account removes, worker/deletion.ts). */
export async function accountLookOwner(pepper: string, accountId: string): Promise<string> {
  return toB64url(await hmac(utf8(pepper), `wc-look|a|${accountId}`));
}

async function keyLookOwner(pepper: string, key: string): Promise<string> {
  return toB64url(await hmac(utf8(pepper), `wc-look|d|${key}`));
}

/** A report's row, checked field by field (null: not one). */
export function reportOf(b: Record<string, unknown>): ({ name: string } & LookRow) | null {
  const { name, race, subrace, sex, token } = b;
  if (typeof name !== 'string' || !LOOK_NAME_PATTERN.test(name)) return null;
  if (race !== null && !isOneOf(LOOK_RACES, race)) return null;
  if (subrace !== null && (typeof subrace !== 'string' || !Object.hasOwn(LOOK_SUBRACES, subrace))) return null;
  // A subrace only beside its own race (src/gmcp/race.ts reads it so).
  if (subrace !== null && LOOK_SUBRACES[subrace as keyof typeof LOOK_SUBRACES] !== race) return null;
  if (sex !== null && !isOneOf(LOOK_SEXES, sex)) return null;
  if (token !== null && (typeof token !== 'string' || !TOKENS.has(token))) return null;
  return { name: name.toLowerCase(), race, subrace: subrace as LookRow['subrace'], sex, token };
}

/** The body as an object with exactly `keys`, or null. */
async function bodyWith(request: Request, keys: readonly string[]): Promise<Record<string, unknown> | null> {
  const text = await readCapped(request, LOOK_MAX_BODY_BYTES);
  let v: unknown = null;
  try {
    v = text === null ? null : JSON.parse(text);
  } catch {
    v = null;
  }
  return hasKeys(v, keys) ? v : null;
}

const REPORT_KEYS = ['name', 'race', 'subrace', 'sex', 'token'] as const;

/**
 * Counts one report against a counter of the `attempt` table (a window of an
 * hour from its first try) and says whether it is within the limit.
 */
async function within(db: D1, key: string, now: number): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO attempt (key, start, count, until) VALUES (?1, ?2, 1, 0)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN ?2 - start >= ?3 THEN 1 ELSE count + 1 END,
         start = CASE WHEN ?2 - start >= ?3 THEN ?2 ELSE start END
       RETURNING count`,
    )
    .bind(key, now, HOUR_MS)
    .first<{ count: number }>();
  return (row?.count ?? 0) <= LOOK_REPORTS_PER_HOUR;
}

/** Both counters of a report: the owner's and the address's (hashed under the day's pepper). */
async function reportAllowed(db: D1, pepper: string, owner: string, address: string, now: number): Promise<boolean> {
  const byOwner = await within(db, `look-o|${owner}`, now);
  const byAddress = await within(db, `look-a|${await addressHash(utf8(pepper), address, now)}`, now);
  return byOwner && byAddress;
}

/** Writes `row` for `owner` by the owner rule (see the file header). */
async function store(db: D1, owner: string, row: { name: string } & LookRow, now: number): Promise<Response> {
  const res = await db
    .prepare(
      `INSERT INTO look_dir (name, race, subrace, sex, token, owner, updated)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
       WHERE EXISTS (SELECT 1 FROM look_dir WHERE name = ?1 AND owner = ?6)
          OR (SELECT COUNT(*) FROM look_dir WHERE owner = ?6) < ?9
       ON CONFLICT (name) DO UPDATE SET
         race = excluded.race, subrace = excluded.subrace, sex = excluded.sex, token = excluded.token,
         owner = excluded.owner, updated = excluded.updated
       WHERE look_dir.owner = excluded.owner OR look_dir.updated <= ?8`,
    )
    .bind(row.name, row.race, row.subrace, row.sex, row.token, owner, now, now - LOOK_OWNED_DAYS * DAY_MS, LOOK_NAMES_PER_OWNER)
    .run();
  if ((res.meta.changes ?? 0) > 0) return empty();
  const held = await db.prepare('SELECT owner, updated FROM look_dir WHERE name = ?1').bind(row.name).first<{ owner: string; updated: number }>();
  if (held && held.owner !== owner && held.updated > now - LOOK_OWNED_DAYS * DAY_MS) return error('look_owned', 409);
  return error('too_many_names', 409);
}

async function forget(db: D1, owner: string): Promise<Response> {
  await db.prepare('DELETE FROM look_dir WHERE owner = ?1').bind(owner).run();
  return empty();
}

// --- The public routes ---

const PUBLIC_METHODS: Record<string, readonly string[]> = { [LOOK_PATH]: ['PUT', 'DELETE'], [LOOK_FIND_PATH]: ['POST'] };

/** Every request of `/api/look` and `/api/look/find`. */
export async function lookPublic(request: Request, env: Env, url: URL, deps: Deps): Promise<Response> {
  const now = deps.now();
  if (!(await flags(env, now)).looks) return error('not_found', 404);
  const path = url.pathname;
  const allowed = PUBLIC_METHODS[path] ?? [];
  if (!allowed.includes(request.method)) return error('method_not_allowed', 405, { Allow: allowed.join(', ') });
  // JSON with `X-WC: 1` and the site's own Origin (auth.ts `sameSite`, written out: auth.ts imports this module).
  const type = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  const sameSite = request.headers.get('x-wc') === '1' && request.headers.get('origin') === url.origin;
  if (type !== 'application/json' || !sameSite) return error('forbidden', 403);
  const address = addressKey(request.headers.get('cf-connecting-ip'));
  if (env.API_LIMITER && !(await env.API_LIMITER.limit({ key: `a|${address}` })).success) return error('rate_limited', 429);
  try {
    if (path === LOOK_FIND_PATH) {
      if (env.LOOK_LIMITER && !(await env.LOOK_LIMITER.limit({ key: address })).success) return error('rate_limited', 429);
      const db = env.DB;
      if (!db) return error('unavailable', 503);
      return await find(request, db);
    }
    const pepper = env.AUTH_PEPPER ?? '';
    if (pepper.length < MIN_PEPPER) return error('looks_not_configured', 503);
    const db = env.DB;
    if (!db) return error('unavailable', 503);
    const b = await bodyWith(request, request.method === 'PUT' ? ['key', ...REPORT_KEYS] : ['key']);
    if (!b || typeof b.key !== 'string' || !LOOK_KEY_PATTERN.test(b.key)) return badRequest();
    const row = request.method === 'PUT' ? reportOf(b) : null;
    if (request.method === 'PUT' && !row) return badRequest();
    const owner = await keyLookOwner(pepper, b.key);
    if (!(await reportAllowed(db, pepper, owner, address, now))) return error('rate_limited', 429);
    return row ? await store(db, owner, row, now) : await forget(db, owner);
  } catch {
    // A failing database. Nothing of the request is logged.
    return error('unavailable', 503);
  }
}

async function find(request: Request, db: D1): Promise<Response> {
  const b = await bodyWith(request, ['names']);
  const raw = b?.names;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > LOOK_FIND_MAX) return badRequest();
  if (!raw.every((n): n is string => typeof n === 'string' && LOOK_NAME_PATTERN.test(n))) return badRequest();
  const names = [...new Set(raw.map((n) => n.toLowerCase()))];
  const { results } = await db
    .prepare('SELECT name, race, subrace, sex, token FROM look_dir WHERE name IN (SELECT value FROM json_each(?1))')
    .bind(JSON.stringify(names))
    .all<{ name: string } & LookRow>();
  const looks: LookFindAnswer['looks'] = {};
  for (const r of results) looks[r.name] = { race: r.race, subrace: r.subrace, sex: r.sex, token: r.token };
  return json({ looks } satisfies LookFindAnswer);
}

// --- /api/u/look (through worker/auth.ts) ---

/** What a handler here uses of auth.ts's context. */
export interface LookCtx {
  request: Request;
  env: Env;
  db: D1;
  now: number;
  address: string;
  auth: Authed | null;
}

async function userPut(c: LookCtx): Promise<Response> {
  const b = await bodyWith(c.request, REPORT_KEYS);
  const row = b ? reportOf(b) : null;
  if (!row) return badRequest();
  const pepper = c.env.AUTH_PEPPER ?? '';
  const owner = await accountLookOwner(pepper, (c.auth as Authed).account.id);
  if (!(await reportAllowed(c.db, pepper, owner, c.address, c.now))) return error('rate_limited', 429);
  return store(c.db, owner, row, c.now);
}

async function userDelete(c: LookCtx): Promise<Response> {
  const pepper = c.env.AUTH_PEPPER ?? '';
  const owner = await accountLookOwner(pepper, (c.auth as Authed).account.id);
  if (!(await reportAllowed(c.db, pepper, owner, c.address, c.now))) return error('rate_limited', 429);
  return forget(c.db, owner);
}

/** `/api/u/look`'s methods (auth.ts checks the flag `looks` before it). */
export const LOOK_USER_ROUTE: Record<string, (c: LookCtx) => Promise<Response>> = { PUT: userPut, DELETE: userDelete };

// --- The daily cron ---

/** Rows not refreshed for LOOK_KEEP_DAYS go. */
export async function pruneLookDir(db: D1, now: number): Promise<void> {
  await db.prepare('DELETE FROM look_dir WHERE updated < ?1').bind(now - LOOK_KEEP_DAYS * DAY_MS).run();
}
