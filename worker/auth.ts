// The account endpoints (spec §7.2, §7.10, ADR 0145; the contract is the
// API table of docs/stages/60-accounts.md):
//
//   GET    /api/auth/params?name=          salt and KDF (a stable fake for a name without an account)
//   POST   /api/auth/register              a new account and its first session
//   POST   /api/auth/login                 a session and the wrapped root key
//   POST   /api/auth/recover               with the recovery code: the wrap, then a new password
//   POST   /api/u/auth/logout              ends this session
//   GET    /api/u/account                  the account as its owner sees it, and the password wrap
//   POST   /api/u/account/password         a new password (the old one proves it)
//   POST   /api/u/account/recovery         a new recovery code
//   DELETE /api/u/account/sessions/<id>    ends a session; `others`: all but this one
//   PATCH  /api/u/account/prefs            the sharing rules ticked (one way); `galleryNotice` ignored (stage 65)
//   DELETE /api/u/account                  removes the account, its items, run bodies and published runs; its name stays reserved
//   GET    /api/u/sync/changes, PUT and DELETE /api/u/sync/items/<kind>/<id>
//                                          the sync (worker/sync.ts; flag `sync` as well)
//   GET    /api/u/runs, PUT, GET and DELETE /api/u/runs/<id>
//                                          the run bodies (worker/runs.ts; flag `runs` as well)
//   /api/u/pub*, POST /api/u/report        published runs and reports (worker/pub.ts,
//                                          worker/reports.ts; flag `share` as well)
//   /api/u/pub/<id>/vote|comments, /api/u/comments/<id>, /api/u/runes[/<id>],
//   /api/u/community/news|seen             the community (worker/community.ts; flags
//                                          `share` and `gallery`, Random Runes `runes` too)
//
// The server never sees a password or a key that opens data. The browser
// sends `authKey` (and `recoveryAuth`), derived from the password (the
// recovery code); the Worker stores and compares their SHA-256.
//
// Every request passes, in this order: the flag `accounts` (off: 404), the
// general rate limit, the route and method, the CSRF rule for anything
// that is not a GET (`X-WC: 1` and the site's own `Origin`), the tight
// limit on login, recover and register, the secrets
// (503 `accounts_not_configured`), the database, and under `/api/u/` the
// session (401 `unauthorized`, or `session_ended` with the reason when the
// server removed the session: sessions.ts). Nothing here logs: no body,
// name, token or address.
//
// "No such name" and "wrong password" are one answer: both run the same
// statements, count on the same per-name counter (keyed by an HMAC of the
// name), and meet the same Turnstile and lock stages.
import {
  type AccountAnswer,
  type AuthParams,
  DEFAULT_KDF,
  LOGIN_LOCK_AFTER,
  LOGIN_TURNSTILE_AFTER,
  type LockedError,
  type LoginAnswer,
  OTHER_SESSIONS,
  type PrefsAnswer,
  REGISTER_PER_DAY,
  REGISTER_PER_HOUR,
  RECOVER_TICKET_SECONDS,
  type RecoverAnswer,
  type SessionEnded,
} from '../shared/cloud/api.ts';
import {
  type AccountRow,
  BUILTIN_RESERVED,
  PASSWORD_KEYS,
  accountByKey,
  accountView,
  hasKeys,
  keyHashOf,
  labelOf,
  nameOf,
  passwordOf,
  prefsOf,
  storedKdf,
  wrapOf,
} from './accounts.ts';
import { addressKey } from './address.ts';
import { GUESS_WINDOW_MS, type GuessKind, HOUR_MS, addressCounters, countRegistration, nameCounter, peek, reserveGuess, takeBack } from './attempts.ts';
import { fromB64url, hmac, randomBytes, sameText, toB64url, utf8 } from './bytes.ts';
import { flags } from './flags.ts';
import { DAY_MS, type D1, type Deps, type Env, error, json, publicChange } from './runtime.ts';
import { loadLimitDefaults } from './limits.ts';
import { type Authed, SESSION_ID, authenticate, clearedCookie, ended, hasSessionCookie, newSession, sessionToken, tokenHash } from './sessions.ts';
import { communityUserRoute } from './community.ts';
import { afterDeletion, deletedBy, deletionBatch } from './deletion.ts';
import { REPORT_PATH, isPubPath, pubRoute } from './pub.ts';
import { report } from './reports.ts';
import { isRunsPath, runsRoute } from './runs.ts';
import { readCapped } from './stats.ts';
import { isSyncPath, syncRoute } from './sync.ts';
import { isToken, verifyTurnstile } from './turnstile.ts';

/** The largest body accepted: a registration with a full-length Turnstile token is about 2.6 kB. */
export const MAX_ACCOUNT_BYTES = 4096;
/** The shortest AUTH_PEPPER that counts as set. */
export const MIN_PEPPER_LENGTH = 16;
/** The longest `name` that `params` answers for. */
const MAX_PARAMS_NAME = 64;

/** What a hash is compared with when there is no account: nothing hashes to it, and the answer does not depend on it. */
const NO_HASH = toB64url(new Uint8Array(32));

export function isAccountPath(path: string): boolean {
  return path.startsWith('/api/auth/') || path.startsWith('/api/u/');
}

/** What a handler gets: the request, and everything the checks before it established. */
interface Ctx {
  request: Request;
  env: Env;
  url: URL;
  deps: Deps;
  db: D1;
  now: number;
  /** AUTH_PEPPER's bytes. */
  pepper: Uint8Array<ArrayBuffer>;
  /** The caller's address as a key (address.ts) of counters (hashed) and of the rate limits; never stored. */
  address: string;
  /** Under `/api/u/`: the session and its account. */
  auth: Authed | null;
}

type Handler = (c: Ctx) => Promise<Response>;

const SECURE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function empty(extra: Record<string, string> = {}): Response {
  return new Response(null, { status: 204, headers: { ...SECURE_HEADERS, ...extra } });
}

const badRequest = (): Response => error('bad_request', 400);
const locked = (seconds: number): Response =>
  json({ error: 'locked', retryAfter: seconds } satisfies LockedError, 429, { 'Retry-After': String(seconds) });

/** The body as an object with exactly the keys `required` and perhaps some of `optional`, or null. */
async function body(request: Request, required: readonly string[], optional: readonly string[] = []): Promise<Record<string, unknown> | null> {
  const text = await readCapped(request, MAX_ACCOUNT_BYTES);
  if (text === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  return hasKeys(v, required, optional) ? v : null;
}

/** A Turnstile token checked with Cloudflare: null when it passed, else the answer. */
async function turnstile(c: Ctx, token: string): Promise<Response | null> {
  const result = await verifyTurnstile(c.env, c.deps, token);
  if (result === 'ok') return null;
  return result === 'fail' ? error('turnstile', 403) : error('unavailable', 503);
}

/**
 * One guess at a name's password or recovery code, counted before it is
 * looked at (attempts.ts). The callers read the counter first, so that a
 * locked name costs no write. Returns the answer when the guess may not
 * be evaluated, else the count including this guess.
 */
async function guess(c: Ctx, key: string): Promise<Response | number> {
  const counter = await reserveGuess(c.db, key, c.now);
  // The guess that reaches the limit is still looked at; those after it are not.
  if (counter.count > LOGIN_LOCK_AFTER && counter.lockedFor > 0) return locked(counter.lockedFor);
  return counter.count;
}

async function counterKey(c: Ctx, kind: GuessKind, nameKey: string): Promise<string> {
  return nameCounter(c.pepper, kind, nameKey);
}

// --- The recovery ticket ---
//
// What the first recover call hands to the second: proof that this name's
// recovery code was shown, with Turnstile, within the last 15 minutes.
// Stateless: 8 bytes of expiry (ms, big-endian) and
// HMAC-SHA-256(AUTH_PEPPER, "wc-recover-ticket|name_key|expiry|recovery_hash"),
// together base64url. It dies with the recovery code it was made for.

const TICKET_BYTES = 8 + 32;

async function ticketMac(c: Ctx, nameKey: string, recoveryHash: string, expires: number): Promise<Uint8Array<ArrayBuffer>> {
  return hmac(c.pepper, `wc-recover-ticket|${nameKey}|${expires}|${recoveryHash}`);
}

async function ticketFor(c: Ctx, nameKey: string, recoveryHash: string, expires: number): Promise<string> {
  const out = new Uint8Array(TICKET_BYTES);
  new DataView(out.buffer).setBigUint64(0, BigInt(expires));
  out.set(await ticketMac(c, nameKey, recoveryHash, expires), 8);
  return toB64url(out);
}

/** True for an unexpired ticket of this name and recovery hash. The MAC is compared in constant time, whatever the rest says. */
async function ticketHolds(c: Ctx, ticket: string, nameKey: string, recoveryHash: string): Promise<boolean> {
  const bytes = fromB64url(ticket);
  const shaped = bytes !== null && bytes.length === TICKET_BYTES;
  const raw = shaped ? bytes : new Uint8Array(TICKET_BYTES);
  const expires = Number(new DataView(raw.buffer).getBigUint64(0));
  const safe = Number.isSafeInteger(expires) ? expires : 0;
  const same = sameText(toB64url(await ticketMac(c, nameKey, recoveryHash, safe)), toB64url(raw.slice(8)));
  return shaped && same && safe > c.now && safe <= c.now + RECOVER_TICKET_SECONDS * 1000;
}

// --- /api/auth/* ---

async function params(c: Ctx): Promise<Response> {
  const name = c.url.searchParams.get('name');
  if (name === null || name === '' || name.length > MAX_PARAMS_NAME) return badRequest();
  const key = name.toLowerCase();
  // Both the lookup and the fake are made for every name, so the work is the same.
  const row = await accountByKey(c.db, key);
  const fake = toB64url((await hmac(c.pepper, `wc-fake-salt|${key}`)).slice(0, 16));
  const answer: AuthParams = row ? { salt: row.salt, kdf: storedKdf(row) } : { salt: fake, kdf: { ...DEFAULT_KDF } };
  return json(answer);
}

async function register(c: Ctx): Promise<Response> {
  const b = await body(c.request, ['name', 'recoveryAuth', 'wrapRc', 'label', 'turnstile', ...PASSWORD_KEYS]);
  if (!b) return badRequest();
  const name = nameOf(b.name);
  const password = await passwordOf(b);
  const recoveryHash = await keyHashOf(b.recoveryAuth);
  const wrapRc = wrapOf(b.wrapRc);
  const label = labelOf(b.label);
  if (!name || !password || !recoveryHash || !wrapRc || label === null || !isToken(b.turnstile)) return badRequest();

  const counters = await addressCounters(c.pepper, c.address, c.now);
  const [hour] = await peek(c.db, [counters.hour], c.now, HOUR_MS);
  const [day] = await peek(c.db, [counters.day], c.now, DAY_MS);
  if ((hour?.count ?? 0) >= REGISTER_PER_HOUR || (day?.count ?? 0) >= REGISTER_PER_DAY) return error('rate_limited', 429);

  const failed = await turnstile(c, b.turnstile);
  if (failed) return failed;
  if (BUILTIN_RESERVED.has(name.key)) return error('name_taken', 409);

  const id = toB64url(randomBytes(16));
  const session = await newSession(c.db, id, label, c.now);
  let made: number;
  try {
    // One transaction. The UNIQUE index on name_key decides between two
    // registrations of a name; the session and the address's counters
    // follow only when the account row was made.
    const results = await c.db.batch([
      c.db
        .prepare(
          `INSERT INTO account (id, name, name_key, created, last_seen, salt, kdf, auth_hash, recovery_hash, wrap_pw, wrap_rc)
           SELECT ?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8, ?9, ?10
           WHERE NOT EXISTS (SELECT 1 FROM reserved_name WHERE name_key = ?3)`,
        )
        .bind(id, name.name, name.key, c.now, password.salt, password.kdf, password.authHash, recoveryHash, password.wrapPw, wrapRc),
      session.insert,
      countRegistration(c.db, counters.hour, c.now, HOUR_MS, id),
      countRegistration(c.db, counters.day, c.now, DAY_MS, id),
    ]);
    made = results[0]?.meta.changes ?? 0;
  } catch (e) {
    if (/UNIQUE/i.test(String(e instanceof Error ? e.message : e))) return error('name_taken', 409);
    throw e;
  }
  if (made !== 1) return error('name_taken', 409);
  const row = await accountByKey(c.db, name.key);
  if (!row) return error('unavailable', 503);
  return json({ account: await accountView(c.db, c.env, row, session.idHash, c.now) } satisfies AccountAnswer, 201, { 'Set-Cookie': session.cookie });
}

async function login(c: Ctx): Promise<Response> {
  const b = await body(c.request, ['name', 'authKey', 'label'], ['turnstile']);
  if (!b) return badRequest();
  const name = nameOf(b.name);
  const hash = await keyHashOf(b.authKey);
  const label = labelOf(b.label);
  if (!name || !hash || label === null || (b.turnstile !== undefined && !isToken(b.turnstile))) return badRequest();

  const key = await counterKey(c, 'login', name.key);
  const [before] = await peek(c.db, [key], c.now, GUESS_WINDOW_MS);
  if (before && before.lockedFor > 0) return locked(before.lockedFor);
  // From the fourth try in the window, a Turnstile token comes first.
  const proven = (before?.count ?? 0) >= LOGIN_TURNSTILE_AFTER;
  if (proven) {
    if (b.turnstile === undefined) return error('turnstile_required', 403);
    const failed = await turnstile(c, b.turnstile);
    if (failed) return failed;
  }
  const n = await guess(c, key);
  if (typeof n !== 'number') return n;
  // Guesses that raced each other past the read above.
  if (n > LOGIN_TURNSTILE_AFTER && !proven) return error('turnstile_required', 403);

  const row = await accountByKey(c.db, name.key);
  const same = sameText(row?.auth_hash ?? NO_HASH, hash);
  if (!row || !same) return error('invalid_login', 401);

  const session = await newSession(c.db, row.id, label, c.now);
  // The success takes its own try back; the failures before it stay counted.
  const [inserted] = await c.db.batch([
    session.insert,
    takeBack(c.db, key, n),
    c.db.prepare('UPDATE account SET last_seen = ?2 WHERE id = ?1').bind(row.id, c.now),
  ]);
  // The account was deleted between the two statements.
  if (inserted?.meta.changes !== 1) return error('invalid_login', 401);
  const answer: LoginAnswer = { account: await accountView(c.db, c.env, row, session.idHash, c.now), wrapPw: row.wrap_pw };
  return json(answer, 200, { 'Set-Cookie': session.cookie });
}

async function recover(c: Ctx): Promise<Response> {
  const b = await body(c.request, ['name', 'recoveryAuth'], ['turnstile', 'set', 'label', 'ticket']);
  if (!b) return badRequest();
  const name = nameOf(b.name);
  const hash = await keyHashOf(b.recoveryAuth);
  if (!name || !hash) return badRequest();
  // Two calls: the first has a Turnstile token and nothing else; the
  // second has `set`, `label` and the ticket the first one answered.
  const first = b.turnstile !== undefined;
  let password = null;
  let label: string | null = null;
  if (first) {
    if (b.set !== undefined || b.label !== undefined || b.ticket !== undefined || !isToken(b.turnstile)) return badRequest();
  } else {
    password = hasKeys(b.set, PASSWORD_KEYS) ? await passwordOf(b.set) : null;
    label = labelOf(b.label);
    if (!password || label === null || typeof b.ticket !== 'string' || b.ticket.length > 100) return badRequest();
    // Without the ticket of a first call (which passed Turnstile) for
    // this name, the second call is not a try at all: nothing is counted
    // or written, so it cannot be used to lock a name or to guess.
    const known = await accountByKey(c.db, name.key);
    const holds = await ticketHolds(c, b.ticket, name.key, known?.recovery_hash ?? NO_HASH);
    if (!holds || !known) return error('invalid_recovery', 401);
  }

  const key = await counterKey(c, 'recover', name.key);
  const [before] = await peek(c.db, [key], c.now, GUESS_WINDOW_MS);
  if (before && before.lockedFor > 0) return locked(before.lockedFor);
  if (first) {
    const failed = await turnstile(c, b.turnstile as string);
    if (failed) return failed;
  }
  const n = await guess(c, key);
  if (typeof n !== 'number') return n;

  const row = await accountByKey(c.db, name.key);
  const same = sameText(row?.recovery_hash ?? NO_HASH, hash);
  if (!row || !same) return error('invalid_recovery', 401);

  if (!password || label === null) {
    await takeBack(c.db, key, n).run();
    const ticket = await ticketFor(c, name.key, row.recovery_hash, c.now + RECOVER_TICKET_SECONDS * 1000);
    return json({ wrapRc: row.wrap_rc, ticket } satisfies RecoverAnswer);
  }
  // The new password, every older session ended, a new one made.
  const session = await newSession(c.db, row.id, label, c.now);
  const [updated] = await c.db.batch([
    c.db
      .prepare('UPDATE account SET salt = ?2, kdf = ?3, auth_hash = ?4, wrap_pw = ?5, last_seen = ?6 WHERE id = ?1')
      .bind(row.id, password.salt, password.kdf, password.authHash, password.wrapPw, c.now),
    ...ended(c.db, 'account = ?1', [row.id], 'recovered', c.now),
    session.insert,
    takeBack(c.db, key, n),
  ]);
  // The account was deleted between the two statements.
  if (updated?.meta.changes !== 1) return error('invalid_recovery', 401);
  const fresh = await accountByKey(c.db, name.key);
  if (!fresh) return error('invalid_recovery', 401);
  return json({ account: await accountView(c.db, c.env, fresh, session.idHash, c.now) } satisfies AccountAnswer, 200, { 'Set-Cookie': session.cookie });
}

// --- /api/u/* (c.auth is set) ---

/**
 * The password asked for again (change password, new recovery code,
 * delete): a wrong `authKey` counts on the name's login counter, and a
 * locked name answers `locked` here too. Returns the answer when the
 * request may not go on, else the hash that was proven (the callers'
 * statements change the account only while it still holds: the row was
 * read before the counting) and `done`, which takes the try back once
 * the change is made.
 */
async function passwordAgain(c: Ctx, account: AccountRow, authKey: unknown): Promise<Response | { hash: string; done: () => Promise<void> }> {
  const hash = await keyHashOf(authKey);
  if (!hash) return badRequest();
  const key = await counterKey(c, 'login', account.name_key);
  const [before] = await peek(c.db, [key], c.now, GUESS_WINDOW_MS);
  if (before && before.lockedFor > 0) return locked(before.lockedFor);
  const n = await guess(c, key);
  if (typeof n !== 'number') return n;
  if (!sameText(account.auth_hash, hash)) return error('invalid_login', 401);
  return {
    hash,
    done: async () => {
      await takeBack(c.db, key, n).run();
    },
  };
}

async function logout(c: Ctx): Promise<Response> {
  const { idHash } = c.auth as Authed;
  await c.db.batch(ended(c.db, 'id_hash = ?1', [idHash], 'logout', c.now));
  return empty({ 'Set-Cookie': clearedCookie() });
}

async function account(c: Ctx): Promise<Response> {
  const { account: row, idHash } = c.auth as Authed;
  return json({ account: await accountView(c.db, c.env, row, idHash, c.now), wrapPw: row.wrap_pw } satisfies LoginAnswer);
}

async function password(c: Ctx): Promise<Response> {
  const { account: row, idHash } = c.auth as Authed;
  const b = await body(c.request, ['authKey', 'set']);
  if (!b) return badRequest();
  const next = hasKeys(b.set, PASSWORD_KEYS) ? await passwordOf(b.set) : null;
  if (!next) return badRequest();
  const proven = await passwordAgain(c, row, b.authKey);
  if (proven instanceof Response) return proven;
  // Only while the password is still the one that was proven (another
  // session may have changed it meanwhile). The other sessions end with
  // the old password: only when the row now holds the new one.
  const [updated] = await c.db.batch([
    c.db
      .prepare('UPDATE account SET salt = ?2, kdf = ?3, auth_hash = ?4, wrap_pw = ?5 WHERE id = ?1 AND auth_hash = ?6')
      .bind(row.id, next.salt, next.kdf, next.authHash, next.wrapPw, proven.hash),
    ...ended(
      c.db,
      'account = ?1 AND id_hash <> ?2 AND EXISTS (SELECT 1 FROM account WHERE id = ?1 AND auth_hash = ?3 AND wrap_pw = ?4)',
      [row.id, idHash, next.authHash, next.wrapPw],
      'password',
      c.now,
    ),
  ]);
  if (updated?.meta.changes !== 1) return error('invalid_login', 401);
  await proven.done();
  return empty();
}

async function recovery(c: Ctx): Promise<Response> {
  const { account: row } = c.auth as Authed;
  const b = await body(c.request, ['authKey', 'recoveryAuth', 'wrapRc']);
  if (!b) return badRequest();
  const recoveryHash = await keyHashOf(b.recoveryAuth);
  const wrapRc = wrapOf(b.wrapRc);
  if (!recoveryHash || !wrapRc) return badRequest();
  const proven = await passwordAgain(c, row, b.authKey);
  if (proven instanceof Response) return proven;
  const updated = await c.db
    .prepare('UPDATE account SET recovery_hash = ?2, wrap_rc = ?3 WHERE id = ?1 AND auth_hash = ?4')
    .bind(row.id, recoveryHash, wrapRc, proven.hash)
    .run();
  if (updated.meta.changes !== 1) return error('invalid_login', 401);
  await proven.done();
  return empty();
}

async function endSession(c: Ctx): Promise<Response> {
  const { account: row, idHash } = c.auth as Authed;
  const id = c.url.pathname.slice(SESSIONS_PREFIX.length);
  if (id === OTHER_SESSIONS) {
    await c.db.batch(ended(c.db, 'account = ?1 AND id_hash <> ?2', [row.id, idHash], 'ended', c.now));
    return empty();
  }
  if (!SESSION_ID.test(id)) return error('not_found', 404);
  // Only a session of this account: another account's id is as unknown as a made-up one.
  const results = await c.db.batch<{ id_hash: string }>([
    c.db.prepare('SELECT id_hash FROM session WHERE account = ?1 AND id = ?2').bind(row.id, id),
    ...ended(c.db, 'account = ?1 AND id = ?2', [row.id, id], 'ended', c.now),
  ]);
  const gone = results[0]?.results[0];
  if (!gone) return error('not_found', 404);
  return empty(gone.id_hash === idHash ? { 'Set-Cookie': clearedCookie() } : {});
}

async function prefs(c: Ctx): Promise<Response> {
  const { account: row } = c.auth as Authed;
  const b = await body(c.request, [], ['galleryNotice', 'rulesAccepted']);
  if (!b || Object.keys(b).length === 0) return badRequest();
  if (b.galleryNotice !== undefined && typeof b.galleryNotice !== 'boolean') return badRequest();
  // One way: the rules are ticked once and stay ticked (ADR 0154).
  if (b.rulesAccepted !== undefined && b.rulesAccepted !== true) return badRequest();
  // `galleryNotice` left the contract in stage 65 (ADR 0155): a cached old
  // client may still send it; it is checked and ignored.
  // Each key set on its own in the stored JSON, so two changes at once do not undo each other.
  let sql = "CASE WHEN json_valid(prefs) AND json_type(prefs) = 'object' THEN prefs ELSE '{}' END";
  if (b.rulesAccepted === true) sql = `json_set(${sql}, '$.rulesAccepted', json('true'))`;
  const [, read] = await c.db.batch<{ prefs: string }>([
    c.db.prepare(`UPDATE account SET prefs = ${sql} WHERE id = ?1`).bind(row.id),
    c.db.prepare('SELECT prefs FROM account WHERE id = ?1').bind(row.id),
  ]);
  const fresh = read?.results[0];
  if (!fresh) return error('unauthorized', 401);
  return json({ prefs: prefsOf(fresh) } satisfies PrefsAnswer);
}

async function remove(c: Ctx): Promise<Response> {
  const { account: row } = c.auth as Authed;
  const b = await body(c.request, ['authKey']);
  if (!b) return badRequest();
  const proven = await passwordAgain(c, row, b.authKey);
  if (proven instanceof Response) return proven;
  // One transaction (worker/deletion.ts), guarded by the proven password.
  const results = await c.db.batch(deletionBatch(c.db, row, proven.hash, c.now));
  const { deleted, pubs } = deletedBy(results);
  if (!deleted) return error('invalid_login', 401);
  await proven.done();
  // The R2 objects after it (the daily cron catches what fails), so the
  // answer does not wait on more than one pass.
  await afterDeletion(c.env, row.id, pubs);
  // Its runs, votes, comments and notes leave the public reads.
  return publicChange(empty({ 'Set-Cookie': clearedCookie() }), true);
}

// --- Routes ---

const SESSIONS_PREFIX = '/api/u/account/sessions/';

/** path (or a prefix ending in '/') → method → handler. */
const ROUTES: Record<string, Record<string, Handler>> = {
  '/api/auth/params': { GET: params },
  '/api/auth/register': { POST: register },
  '/api/auth/login': { POST: login },
  '/api/auth/recover': { POST: recover },
  '/api/u/auth/logout': { POST: logout },
  '/api/u/account': { GET: account, DELETE: remove },
  '/api/u/account/password': { POST: password },
  '/api/u/account/recovery': { POST: recovery },
  '/api/u/account/prefs': { PATCH: prefs },
  [REPORT_PATH]: { POST: report },
  [SESSIONS_PREFIX]: { DELETE: endSession },
};

function routeOf(path: string): Record<string, Handler> | undefined {
  const community = communityUserRoute(path);
  if (community) return community.route;
  if (isSyncPath(path)) return syncRoute(path);
  if (isRunsPath(path)) return runsRoute(path);
  if (isPubPath(path)) return pubRoute(path);
  if (path.startsWith(SESSIONS_PREFIX)) return path.length > SESSIONS_PREFIX.length ? ROUTES[SESSIONS_PREFIX] : undefined;
  return Object.hasOwn(ROUTES, path) ? ROUTES[path] : undefined;
}

/** `X-WC: 1` and an Origin that is this site's (spec §7.1): what another site's page cannot send. */
export function sameSite(request: Request, url: URL): boolean {
  return request.headers.get('x-wc') === '1' && request.headers.get('origin') === url.origin;
}

/** The paths behind the tight limit as well: each can cost the database a write or Turnstile a call. */
const TIGHT = new Set(['/api/auth/login', '/api/auth/recover', '/api/auth/register']);

/** Every request under `/api/auth/` and `/api/u/`. */
export async function accountApi(request: Request, env: Env, url: URL, deps: Deps): Promise<Response> {
  const now = deps.now();
  // (`flags` does not throw: a failing database is the defaults.)
  if (!(await flags(env, now)).accounts) return error('not_found', 404);
  try {
    return await answer(request, env, url, deps, now);
  } catch {
    // A failing database or binding. Nothing of the request is logged.
    return error('unavailable', 503);
  }
}

async function answer(request: Request, env: Env, url: URL, deps: Deps, now: number): Promise<Response> {
  const path = url.pathname;
  // The general limit: per address (address.ts: an IPv6 /64 is one), and
  // per session as well where a request carries a token; both before any
  // database work, so made-up cookies are bounded by their address. A key
  // is used in passing; nothing is stored.
  const address = addressKey(request.headers.get('cf-connecting-ip'));
  const user = path.startsWith('/api/u/');
  const token = user ? sessionToken(request) : null;
  const limiter = env.API_LIMITER;
  if (limiter) {
    if (!(await limiter.limit({ key: `a|${address}` })).success) return error('rate_limited', 429);
    if (token && !(await limiter.limit({ key: `s|${await tokenHash(token)}` })).success) return error('rate_limited', 429);
  }

  const route = routeOf(path);
  if (!route) return error('not_found', 404);
  // The flags `sync` and `runs` close their paths as `accounts` closes them all.
  if (isSyncPath(path) && !(await flags(env, now)).sync) return error('not_found', 404);
  if (isRunsPath(path) && !(await flags(env, now)).runs) return error('not_found', 404);
  const community = communityUserRoute(path);
  if (community) {
    const on = await flags(env, now);
    if (!on.share || !on.gallery || (community.runes && !on.runes)) return error('not_found', 404);
  } else if ((isPubPath(path) || path === REPORT_PATH) && !(await flags(env, now)).share) return error('not_found', 404);
  const head = request.method === 'HEAD';
  const method = head ? 'GET' : request.method;
  const handler = Object.hasOwn(route, method) ? route[method] : undefined;
  if (!handler) return error('method_not_allowed', 405, { Allow: Object.keys(route).join(', ') });
  if (method !== 'GET' && !sameSite(request, url)) return error('forbidden', 403);
  // The tight limit on what can count a try or make an account.
  if (TIGHT.has(path) && env.AUTH_LIMITER && !(await env.AUTH_LIMITER.limit({ key: `a|${address}` })).success) return error('rate_limited', 429);

  const pepper = env.AUTH_PEPPER ?? '';
  if (pepper.length < MIN_PEPPER_LENGTH || !env.TURNSTILE_SECRET) return error('accounts_not_configured', 503);
  const db = env.DB;
  if (!db) return error('unavailable', 503);
  // The admin's default limits (stage 66, worker/limits.ts), before any handler checks one.
  await loadLimitDefaults(env, now);

  let auth: Authed | null = null;
  if (user) {
    const found = token ? await authenticate(db, token, now) : null;
    // The cookie is cleared only for a browser that sent one.
    const clear: Record<string, string> = hasSessionCookie(request) ? { 'Set-Cookie': clearedCookie() } : {};
    if (found && 'ended' in found) return json({ error: 'session_ended', reason: found.ended } satisfies SessionEnded, 401, clear);
    if (!found) return error('unauthorized', 401, clear);
    auth = found;
  }
  const res = await handler({ request, env, url, deps, db, now, pepper: utf8(pepper), address, auth });
  if (auth?.renewed && !res.headers.has('set-cookie')) res.headers.set('Set-Cookie', auth.renewed);
  return head ? new Response(null, { status: res.status, headers: res.headers }) : res;
}
