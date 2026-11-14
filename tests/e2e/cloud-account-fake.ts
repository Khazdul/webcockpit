// A fake of the account API (stage 60; the contract is the table of
// docs/stages/60-accounts.md, the real thing worker/auth.ts), for the e2e
// specs of the account pages and for the unit tests of the client's flows
// (tests/unit/cloud-account-flows.test.ts). Not a spec (no tests).
//
// Two layers:
//
//   FakeAccountServer   the contract in memory, no Playwright: accounts,
//                       sessions, the counters (Turnstile from the fourth
//                       try, the lock with `retryAfter`), the recover
//                       ticket, reserved names, and switches for the
//                       failures a page must have words for. It keeps
//                       what the server "saw" (`seen`).
//   fakeAccountApi      the server behind `page.route('**/api/**')`, with
//                       `/api/config` answering the flag `accounts` on and
//                       a site key. Open the page with `?cloudtest`
//                       (src/cloud/config.ts).
//
// The cookie is simulated: `__Secure-wc_s` is HttpOnly, Secure and bound
// to `/api/u`, which a route stub on the dev server's plain http cannot
// set in every browser. Each `FakeBrowser` (one per page, from
// `server.browser()`) has a cookie jar of its own instead, so two pages
// on one server are two devices.
//
// Kept honest against worker/auth.ts by hand: the order of the checks
// (flag, route, method, CSRF, configuration, session, body), the status
// and code of every answer, exact body keys, counting before looking, a
// success taking back only its own try. Where it is simpler than the
// server: keys are compared as text (the server keeps their SHA-256); the
// address limits are one counter for everybody; Turnstile is a rule
// (below) instead of a call.
//
// Turnstile here: any token passes once. A token that was used before, or
// that starts with `bad`, fails (`turnstile`); `turnstileDown` answers 503.

import type { Page } from '@playwright/test';
import {
  type Account,
  type AccountLimits,
  type AccountPrefs,
  type AccountSession,
  AUTH_KEY_BYTES,
  type AuthParams,
  type Config,
  DEFAULT_ACCOUNT_LIMITS,
  DEFAULT_KDF,
  KDF_MAX_ROUNDS,
  KDF_MIN_ROUNDS,
  KDF_NAME,
  type Kdf,
  LABEL_MAX_LENGTH,
  LOGIN_LOCK_AFTER,
  LOGIN_TURNSTILE_AFTER,
  LOGIN_WINDOW_SECONDS,
  type LoginAnswer,
  NAME_PATTERN,
  OTHER_SESSIONS,
  type PrefsAnswer,
  RECOVER_TICKET_SECONDS,
  REGISTER_PER_HOUR,
  type RecoverAnswer,
  SALT_MAX_BYTES,
  SALT_MIN_BYTES,
  SESSION_SECONDS,
  TURNSTILE_MAX_LENGTH,
  WRAP_MAX_BYTES,
  WRAP_MIN_BYTES,
} from '../../shared/cloud/api';

/** Cloudflare's published test site key (always passes). */
export const FAKE_SITE_KEY = '1x00000000000000000000AA';

export interface FakeRequest {
  method: string;
  /** `/api/…` */
  path: string;
  /** `?name=…` or empty. */
  search?: string;
  /** Lower-case names. */
  headers: Record<string, string>;
  body?: string | null;
  /** The site's origin (what `Origin` must equal). */
  origin: string;
}

export interface FakeResponse {
  status: number;
  /** JSON; undefined: no body (204). */
  body?: unknown;
  headers?: Record<string, string>;
}

/** A request as the server saw it. */
export interface SeenRequest {
  method: string;
  path: string;
  search: string;
  /** The parsed JSON body, the raw text when it is not JSON, or null. */
  body: unknown;
  headers: Record<string, string>;
  /** The request carried a session cookie. */
  cookie: boolean;
  status: number;
}

/** What a failure switch answers instead of the endpoint. */
export type FakeFailure = 'unavailable' | 'accounts_not_configured' | 'rate_limited' | 'offline' | 'garbage';

interface AccountRow {
  name: string;
  key: string;
  created: number;
  state: 'active' | 'suspended';
  salt: string;
  kdf: Kdf;
  authKey: string;
  recoveryAuth: string;
  wrapPw: string;
  wrapRc: string;
  limits: AccountLimits;
  prefs: AccountPrefs;
}

interface SessionRow {
  token: string;
  id: string;
  account: string;
  label: string;
  created: number;
  lastUsed: number;
  expires: number;
}

interface Attempt {
  start: number;
  count: number;
  until: number;
}

/** The fields of an account a test can seed (all from the client's crypto: `seedAccount`). */
export interface SeedFields {
  salt: string;
  kdf: Kdf;
  authKey: string;
  recoveryAuth: string;
  wrapPw: string;
  wrapRc: string;
}

const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'webcockpit', 'cockpit', 'mume', 'abuse', 'support', 'system', 'root', 'staff', 'owner', 'official', 'anonymous', 'deleted'];
const WINDOW_MS = LOGIN_WINDOW_SECONDS * 1000;
const PASSWORD_KEYS = ['salt', 'kdf', 'authKey', 'wrapPw'];
const SESSIONS_PREFIX = '/api/u/account/sessions/';
const ROUTES: Record<string, string[]> = {
  '/api/auth/params': ['GET'],
  '/api/auth/register': ['POST'],
  '/api/auth/login': ['POST'],
  '/api/auth/recover': ['POST'],
  '/api/u/auth/logout': ['POST'],
  '/api/u/account': ['GET', 'DELETE'],
  '/api/u/account/password': ['POST'],
  '/api/u/account/recovery': ['POST'],
  '/api/u/account/prefs': ['PATCH'],
  [SESSIONS_PREFIX]: ['DELETE'],
};

const err = (error: string, status: number): FakeResponse => ({ status, body: { error } });

function randomText(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isBytes(v: unknown, min: number, max: number): v is string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]+$/.test(v) || v.length % 4 === 1) return false;
  const n = Math.floor((v.length * 3) / 4);
  return n >= min && n <= max;
}

function hasKeys(o: unknown, required: readonly string[], optional: readonly string[] = []): o is Record<string, unknown> {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return false;
  const keys = Object.keys(o);
  return required.every((k) => Object.hasOwn(o, k)) && keys.every((k) => required.includes(k) || optional.includes(k));
}

const isKey = (v: unknown): v is string => isBytes(v, AUTH_KEY_BYTES, AUTH_KEY_BYTES);
const isWrap = (v: unknown): v is string => isBytes(v, WRAP_MIN_BYTES, WRAP_MAX_BYTES);
const isToken = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= TURNSTILE_MAX_LENGTH;

function kdfOf(v: unknown): Kdf | null {
  if (!hasKeys(v, ['name', 'rounds'])) return null;
  const { name, rounds } = v;
  if (name !== KDF_NAME || typeof rounds !== 'number' || !Number.isInteger(rounds)) return null;
  return rounds >= KDF_MIN_ROUNDS && rounds <= KDF_MAX_ROUNDS ? { name: KDF_NAME, rounds } : null;
}

function labelOf(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 400) return null;
  return v
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, LABEL_MAX_LENGTH)
    .trim();
}

function passwordOf(o: Record<string, unknown>): { salt: string; kdf: Kdf; authKey: string; wrapPw: string } | null {
  const kdf = kdfOf(o.kdf);
  if (!isBytes(o.salt, SALT_MIN_BYTES, SALT_MAX_BYTES) || !kdf || !isKey(o.authKey) || !isWrap(o.wrapPw)) return null;
  return { salt: o.salt, kdf, authKey: o.authKey, wrapPw: o.wrapPw };
}

export class FakeAccountServer {
  /** The flags of `/api/config`; `accounts` off: every account endpoint is 404 `not_found`. */
  flags: Config['flags'] = { accounts: true };
  siteKey = FAKE_SITE_KEY;
  /** Answers every account request with this failure (`offline`: no answer at all; `garbage`: 200 and nonsense). */
  fail: FakeFailure | null = null;
  /** Limits `fail` to the requests it returns true for. */
  failWhen: ((req: FakeRequest) => boolean) | null = null;
  /** Carry the request out and then drop the answer (what a timeout after the server's work looks like): the next request only. */
  dropNextAnswer = false;
  /** Turnstile's own service is down: 503 `unavailable` where a token would be checked. */
  turnstileDown = false;
  /** Registrations left before 429 `rate_limited` (the address limit; one counter for everybody). */
  registrationsLeft = REGISTER_PER_HOUR;
  /** Every account request, in order, as the server saw it. */
  seen: SeenRequest[] = [];

  private clock = Date.now();
  private accounts = new Map<string, AccountRow>();
  private sessions = new Map<string, SessionRow>();
  private attempts = new Map<string, Attempt>();
  private reserved = new Set<string>(RESERVED);
  private tickets = new Map<string, { key: string; recoveryAuth: string; expires: number }>();
  private usedTokens = new Set<string>();

  // --- For the tests ---

  /** The server's time (ms). */
  now(): number {
    return this.clock;
  }

  /** Moves the server's clock (past a lock, a ticket, a session). */
  advance(ms: number): void {
    this.clock += ms;
  }

  /** A browser of its own (a cookie jar): one per page. */
  browser(): FakeBrowser {
    return new FakeBrowser(this);
  }

  /** Puts an account in place. The fields must come from the client's crypto (`seedAccount`). */
  seed(name: string, fields: SeedFields, o: { state?: 'active' | 'suspended'; created?: number } = {}): void {
    const key = name.toLowerCase();
    this.accounts.set(key, {
      name,
      key,
      created: o.created ?? this.clock,
      state: o.state ?? 'active',
      ...fields,
      limits: { ...DEFAULT_ACCOUNT_LIMITS },
      prefs: { galleryNotice: true },
    });
  }

  /** A session for an account, as if another device had logged in (`ago`: made and last used that many ms ago). Returns its public id. */
  addSession(name: string, label: string, o: { madeAgo?: number; usedAgo?: number } = {}): string {
    const s = this.newSession(name.toLowerCase(), label);
    s.created = this.clock - (o.madeAgo ?? 0);
    s.lastUsed = this.clock - (o.usedAgo ?? 0);
    return s.id;
  }

  hasAccount(name: string): boolean {
    return this.accounts.has(name.toLowerCase());
  }

  /** The stored fields of an account (what the server keeps), or null. */
  stored(name: string): (SeedFields & { name: string; prefs: AccountPrefs }) | null {
    const a = this.accounts.get(name.toLowerCase());
    return a ? { name: a.name, salt: a.salt, kdf: a.kdf, authKey: a.authKey, recoveryAuth: a.recoveryAuth, wrapPw: a.wrapPw, wrapRc: a.wrapRc, prefs: a.prefs } : null;
  }

  /** The labels of an account's live sessions. */
  sessionLabels(name: string): string[] {
    return this.sessionsOf(name.toLowerCase()).map((s) => s.label);
  }

  /** Ends every session of an account, as another device's "End all others" or a password change would. */
  endSessions(name: string): void {
    for (const s of this.sessionsOf(name.toLowerCase())) this.sessions.delete(s.token);
  }

  /** Damages the stored password wrap (what `corrupt_wrap` is for): the same wrap with its last byte changed. */
  corruptWrap(name: string): void {
    const a = this.accounts.get(name.toLowerCase());
    if (!a) return;
    const bin = atob(a.wrapPw.replace(/-/g, '+').replace(/_/g, '/'));
    const last = String.fromCharCode(bin.charCodeAt(bin.length - 1) ^ 1);
    a.wrapPw = btoa(bin.slice(0, -1) + last)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /** The failures counted for a name's login (or recovery) in the running window. */
  failures(name: string, kind: 'login' | 'recover' = 'login'): number {
    return this.peek(`${kind}|${name.toLowerCase()}`).count;
  }

  /** The requests of one endpoint, e.g. `POST /api/auth/login`. */
  requests(what: string): SeenRequest[] {
    return this.seen.filter((r) => `${r.method} ${r.path}` === what);
  }

  /** True when `text` appears in anything the server was sent (a URL, a header or a body): "the server never saw the password". */
  saw(text: string): boolean {
    return this.seen.some((r) => JSON.stringify([r.path, r.search, r.body, r.headers]).includes(text));
  }

  // --- The server ---

  /** `GET /api/config`. */
  config(): Config {
    return { flags: { ...this.flags }, turnstileSiteKey: this.siteKey, limits: { ...DEFAULT_ACCOUNT_LIMITS }, time: this.clock };
  }

  /** One account request. `cookie` is the browser's session token; the answer may set or clear it. */
  handle(req: FakeRequest, cookie: string | null): { res: FakeResponse | 'offline'; cookie: string | null } {
    let jar = cookie;
    const setCookie = (token: string | null): void => {
      jar = token;
    };
    const failing = this.fail !== null && (this.failWhen === null || this.failWhen(req));
    let res: FakeResponse | 'offline';
    if (failing && this.fail === 'offline') res = 'offline';
    else if (failing && this.fail === 'garbage') res = { status: 200, body: { hello: 'world' } };
    else res = this.answer(req, cookie, setCookie, failing ? this.fail : null);
    let body: unknown = null;
    if (req.body) {
      try {
        body = JSON.parse(req.body);
      } catch {
        body = req.body;
      }
    }
    this.seen.push({
      method: req.method,
      path: req.path,
      search: req.search ?? '',
      body,
      headers: { ...req.headers },
      cookie: cookie !== null,
      status: res === 'offline' ? 0 : res.status,
    });
    if (this.dropNextAnswer && res !== 'offline') {
      this.dropNextAnswer = false;
      res = 'offline';
    }
    return { res, cookie: jar };
  }

  private answer(req: FakeRequest, cookie: string | null, setCookie: (t: string | null) => void, failure: FakeFailure | null): FakeResponse {
    if (this.flags.accounts !== true) return err('not_found', 404);
    if (failure === 'rate_limited') return err('rate_limited', 429);
    const path = req.path;
    const methods = path.startsWith(SESSIONS_PREFIX) ? (path.length > SESSIONS_PREFIX.length ? ROUTES[SESSIONS_PREFIX] : undefined) : ROUTES[path];
    if (!methods) return err('not_found', 404);
    if (!methods.includes(req.method)) return err('method_not_allowed', 405);
    if (req.method !== 'GET' && !(req.headers['x-wc'] === '1' && req.headers.origin === req.origin)) return err('forbidden', 403);
    if (failure === 'accounts_not_configured') return err('accounts_not_configured', 503);
    if (failure === 'unavailable') return err('unavailable', 503);

    let session: SessionRow | null = null;
    if (path.startsWith('/api/u/')) {
      session = cookie !== null ? (this.sessions.get(cookie) ?? null) : null;
      if (session && session.expires <= this.clock) session = null;
      if (!session) {
        if (cookie !== null) setCookie(null);
        return err('unauthorized', 401);
      }
    }
    const account = session ? this.accounts.get(session.account) : undefined;
    if (session && !account) return err('unauthorized', 401);

    switch (`${req.method} ${path.startsWith(SESSIONS_PREFIX) ? SESSIONS_PREFIX : path}`) {
      case 'GET /api/auth/params':
        return this.params(req);
      case 'POST /api/auth/register':
        return this.register(req, setCookie);
      case 'POST /api/auth/login':
        return this.login(req, setCookie);
      case 'POST /api/auth/recover':
        return this.recover(req, setCookie);
      case 'POST /api/u/auth/logout':
        this.sessions.delete(session!.token);
        setCookie(null);
        return { status: 204 };
      case 'GET /api/u/account':
        return { status: 200, body: { account: this.view(account!, session!), wrapPw: account!.wrapPw } satisfies LoginAnswer };
      case 'DELETE /api/u/account':
        return this.remove(req, account!, setCookie);
      case 'POST /api/u/account/password':
        return this.password(req, account!, session!);
      case 'POST /api/u/account/recovery':
        return this.recovery(req, account!);
      case 'PATCH /api/u/account/prefs':
        return this.prefs(req, account!);
      case `DELETE ${SESSIONS_PREFIX}`:
        return this.endSession(path.slice(SESSIONS_PREFIX.length), account!, session!, setCookie);
      default:
        return err('not_found', 404);
    }
  }

  private body(req: FakeRequest, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
    if (typeof req.body !== 'string' || req.body.length > 4096) return null;
    let v: unknown;
    try {
      v = JSON.parse(req.body);
    } catch {
      return null;
    }
    return hasKeys(v, required, optional) ? v : null;
  }

  private turnstile(token: string): FakeResponse | null {
    if (this.turnstileDown) return err('unavailable', 503);
    if (token.startsWith('bad') || this.usedTokens.has(token)) return err('turnstile', 403);
    this.usedTokens.add(token);
    return null;
  }

  private peek(key: string): { count: number; lockedFor: number } {
    const row = this.attempts.get(key);
    if (!row) return { count: 0, lockedFor: 0 };
    return {
      count: this.clock - row.start >= WINDOW_MS ? 0 : row.count,
      lockedFor: row.until > this.clock ? Math.ceil((row.until - this.clock) / 1000) : 0,
    };
  }

  /** Counts a guess before it is looked at (worker/attempts.ts `reserveGuess`). */
  private reserve(key: string): { count: number; lockedFor: number } {
    const now = this.clock;
    const row = this.attempts.get(key);
    if (!row || now - row.start >= WINDOW_MS) this.attempts.set(key, { start: now, count: 1, until: 0 });
    else {
      row.count += 1;
      if (row.count >= LOGIN_LOCK_AFTER && row.until <= now) row.until = now + WINDOW_MS;
    }
    return this.peek(key);
  }

  /** A success takes its own try back; the lock only when this try had set it. */
  private takeBack(key: string, count: number): void {
    const row = this.attempts.get(key);
    if (!row || row.count <= 0) return;
    row.count -= 1;
    if (count === LOGIN_LOCK_AFTER) row.until = 0;
  }

  private locked(seconds: number): FakeResponse {
    return { status: 429, body: { error: 'locked', retryAfter: seconds }, headers: { 'Retry-After': String(seconds) } };
  }

  /** The count including this guess, or the answer when it may not be looked at. */
  private guess(key: string): number | FakeResponse {
    const counter = this.reserve(key);
    if (counter.count > LOGIN_LOCK_AFTER && counter.lockedFor > 0) return this.locked(counter.lockedFor);
    return counter.count;
  }

  private sessionsOf(key: string): SessionRow[] {
    return [...this.sessions.values()].filter((s) => s.account === key && s.expires > this.clock);
  }

  private newSession(key: string, label: string): SessionRow {
    const s: SessionRow = { token: randomText(32), id: randomText(12), account: key, label, created: this.clock, lastUsed: this.clock, expires: this.clock + SESSION_SECONDS * 1000 };
    this.sessions.set(s.token, s);
    return s;
  }

  private view(a: AccountRow, current: SessionRow): Account {
    const sessions: AccountSession[] = this.sessionsOf(a.key)
      .sort((x, y) => y.lastUsed - x.lastUsed || y.created - x.created || (x.id < y.id ? -1 : 1))
      .map((s) => ({ id: s.id, label: s.label, created: s.created, lastUsed: s.lastUsed, current: s.token === current.token }));
    return { name: a.name, created: a.created, state: a.state, usage: { items: 0, itemBytes: 0, runBytes: 0 }, limits: { ...a.limits }, sessions, prefs: { ...a.prefs } };
  }

  /** A stable fake salt for a name without an account: the same for the same name, 16 bytes. */
  private fakeSalt(key: string): string {
    let h = 2166136261;
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      for (const c of `${i}|${key}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
      out[i] = h & 0xff;
    }
    let bin = '';
    for (const x of out) bin += String.fromCharCode(x);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private params(req: FakeRequest): FakeResponse {
    const name = new URLSearchParams(req.search ?? '').get('name');
    if (name === null || name === '' || name.length > 64) return err('bad_request', 400);
    const key = name.toLowerCase();
    const row = this.accounts.get(key);
    const answer: AuthParams = row ? { salt: row.salt, kdf: { ...row.kdf } } : { salt: this.fakeSalt(key), kdf: { ...DEFAULT_KDF } };
    return { status: 200, body: answer };
  }

  private register(req: FakeRequest, setCookie: (t: string | null) => void): FakeResponse {
    const b = this.body(req, ['name', 'recoveryAuth', 'wrapRc', 'label', 'turnstile', ...PASSWORD_KEYS]);
    if (!b) return err('bad_request', 400);
    const password = passwordOf(b);
    const label = labelOf(b.label);
    if (typeof b.name !== 'string' || !NAME_PATTERN.test(b.name) || !password || !isKey(b.recoveryAuth) || !isWrap(b.wrapRc) || label === null || !isToken(b.turnstile)) {
      return err('bad_request', 400);
    }
    if (this.registrationsLeft <= 0) return err('rate_limited', 429);
    const failed = this.turnstile(b.turnstile);
    if (failed) return failed;
    const key = b.name.toLowerCase();
    // A name that was taken costs the address nothing.
    if (this.reserved.has(key) || this.accounts.has(key)) return err('name_taken', 409);
    this.registrationsLeft -= 1;
    this.seed(b.name, { ...password, recoveryAuth: b.recoveryAuth, wrapRc: b.wrapRc });
    const session = this.newSession(key, label);
    setCookie(session.token);
    return { status: 201, body: { account: this.view(this.accounts.get(key)!, session) } };
  }

  private login(req: FakeRequest, setCookie: (t: string | null) => void): FakeResponse {
    const b = this.body(req, ['name', 'authKey', 'label'], ['turnstile']);
    if (!b) return err('bad_request', 400);
    const label = labelOf(b.label);
    if (typeof b.name !== 'string' || !NAME_PATTERN.test(b.name) || !isKey(b.authKey) || label === null || (b.turnstile !== undefined && !isToken(b.turnstile))) {
      return err('bad_request', 400);
    }
    const key = b.name.toLowerCase();
    const counter = `login|${key}`;
    const before = this.peek(counter);
    if (before.lockedFor > 0) return this.locked(before.lockedFor);
    // From the fourth try in the window, a Turnstile token comes first.
    if (before.count >= LOGIN_TURNSTILE_AFTER) {
      if (b.turnstile === undefined) return err('turnstile_required', 403);
      const failed = this.turnstile(b.turnstile as string);
      if (failed) return failed;
    }
    const n = this.guess(counter);
    if (typeof n !== 'number') return n;
    const row = this.accounts.get(key);
    if (!row || row.authKey !== b.authKey) return err('invalid_login', 401);
    const session = this.newSession(key, label);
    this.takeBack(counter, n);
    setCookie(session.token);
    return { status: 200, body: { account: this.view(row, session), wrapPw: row.wrapPw } satisfies LoginAnswer };
  }

  private recover(req: FakeRequest, setCookie: (t: string | null) => void): FakeResponse {
    const b = this.body(req, ['name', 'recoveryAuth'], ['turnstile', 'set', 'label', 'ticket']);
    if (!b) return err('bad_request', 400);
    if (typeof b.name !== 'string' || !NAME_PATTERN.test(b.name) || !isKey(b.recoveryAuth)) return err('bad_request', 400);
    const key = b.name.toLowerCase();
    const first = b.turnstile !== undefined;
    let password: ReturnType<typeof passwordOf> = null;
    let label: string | null = null;
    if (first) {
      if (b.set !== undefined || b.label !== undefined || b.ticket !== undefined || !isToken(b.turnstile)) return err('bad_request', 400);
    } else {
      password = hasKeys(b.set, PASSWORD_KEYS) ? passwordOf(b.set) : null;
      label = labelOf(b.label);
      if (!password || label === null || typeof b.ticket !== 'string' || b.ticket.length > 100) return err('bad_request', 400);
      // Without a valid ticket the second call is not a try at all: nothing is counted.
      const known = this.accounts.get(key);
      const ticket = this.tickets.get(b.ticket);
      const holds = ticket !== undefined && ticket.key === key && ticket.expires > this.clock && known !== undefined && ticket.recoveryAuth === known.recoveryAuth;
      if (!holds) return err('invalid_recovery', 401);
    }
    const counter = `recover|${key}`;
    const before = this.peek(counter);
    if (before.lockedFor > 0) return this.locked(before.lockedFor);
    if (first) {
      const failed = this.turnstile(b.turnstile as string);
      if (failed) return failed;
    }
    const n = this.guess(counter);
    if (typeof n !== 'number') return n;
    const row = this.accounts.get(key);
    if (!row || row.recoveryAuth !== b.recoveryAuth) return err('invalid_recovery', 401);
    if (!password || label === null) {
      this.takeBack(counter, n);
      const ticket = randomText(40);
      this.tickets.set(ticket, { key, recoveryAuth: row.recoveryAuth, expires: this.clock + RECOVER_TICKET_SECONDS * 1000 });
      return { status: 200, body: { wrapRc: row.wrapRc, ticket } satisfies RecoverAnswer };
    }
    // The new password, every older session ended, a new one made.
    Object.assign(row, password);
    this.endSessions(key);
    const session = this.newSession(key, label);
    this.takeBack(counter, n);
    setCookie(session.token);
    return { status: 200, body: { account: this.view(row, session) } };
  }

  /** The password asked for again: counts on the login counter and honours its lock; never asks for Turnstile. */
  private passwordAgain(account: AccountRow, authKey: unknown): FakeResponse | (() => void) {
    if (!isKey(authKey)) return err('bad_request', 400);
    const counter = `login|${account.key}`;
    const before = this.peek(counter);
    if (before.lockedFor > 0) return this.locked(before.lockedFor);
    const n = this.guess(counter);
    if (typeof n !== 'number') return n;
    if (account.authKey !== authKey) return err('invalid_login', 401);
    return () => this.takeBack(counter, n);
  }

  private password(req: FakeRequest, account: AccountRow, session: SessionRow): FakeResponse {
    const b = this.body(req, ['authKey', 'set']);
    if (!b) return err('bad_request', 400);
    const next = hasKeys(b.set, PASSWORD_KEYS) ? passwordOf(b.set) : null;
    if (!next) return err('bad_request', 400);
    const proven = this.passwordAgain(account, b.authKey);
    if (typeof proven !== 'function') return proven;
    Object.assign(account, next);
    for (const s of this.sessionsOf(account.key)) if (s.token !== session.token) this.sessions.delete(s.token);
    proven();
    return { status: 204 };
  }

  private recovery(req: FakeRequest, account: AccountRow): FakeResponse {
    const b = this.body(req, ['authKey', 'recoveryAuth', 'wrapRc']);
    if (!b) return err('bad_request', 400);
    if (!isKey(b.recoveryAuth) || !isWrap(b.wrapRc)) return err('bad_request', 400);
    const proven = this.passwordAgain(account, b.authKey);
    if (typeof proven !== 'function') return proven;
    account.recoveryAuth = b.recoveryAuth;
    account.wrapRc = b.wrapRc;
    proven();
    return { status: 204 };
  }

  private endSession(id: string, account: AccountRow, session: SessionRow, setCookie: (t: string | null) => void): FakeResponse {
    if (id === OTHER_SESSIONS) {
      for (const s of this.sessionsOf(account.key)) if (s.token !== session.token) this.sessions.delete(s.token);
      return { status: 204 };
    }
    if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return err('not_found', 404);
    const gone = this.sessionsOf(account.key).find((s) => s.id === id);
    if (!gone) return err('not_found', 404);
    this.sessions.delete(gone.token);
    if (gone.token === session.token) setCookie(null);
    return { status: 204 };
  }

  private prefs(req: FakeRequest, account: AccountRow): FakeResponse {
    const b = this.body(req, ['galleryNotice']);
    if (!b || typeof b.galleryNotice !== 'boolean') return err('bad_request', 400);
    account.prefs = { ...account.prefs, galleryNotice: b.galleryNotice };
    return { status: 200, body: { prefs: { ...account.prefs } } satisfies PrefsAnswer };
  }

  private remove(req: FakeRequest, account: AccountRow, setCookie: (t: string | null) => void): FakeResponse {
    const b = this.body(req, ['authKey']);
    if (!b) return err('bad_request', 400);
    const proven = this.passwordAgain(account, b.authKey);
    if (typeof proven !== 'function') return proven;
    this.reserved.add(account.key);
    this.endSessions(account.key);
    this.accounts.delete(account.key);
    proven();
    setCookie(null);
    return { status: 204 };
  }
}

/** One browser's view of the server: its cookie jar. */
export class FakeBrowser {
  /** The session token this browser holds (the simulated `__Secure-wc_s`), or null. */
  cookie: string | null = null;
  readonly server: FakeAccountServer;

  constructor(server: FakeAccountServer) {
    this.server = server;
  }

  /** One request from this browser. `offline`: the connection failed. */
  request(req: FakeRequest): FakeResponse | 'offline' {
    const { res, cookie } = this.server.handle(req, this.cookie);
    // An answer that never arrived sets no cookie either.
    if (res !== 'offline') this.cookie = cookie;
    return res;
  }

  /** Loses the cookie, as clearing the browser's cookies would. */
  dropCookie(): void {
    this.cookie = null;
  }
}

/**
 * Makes an account on the fake server with the client's own crypto (in
 * Node: no worker, the same bytes), so a page can log in to it with
 * `password`. Returns the account's recovery code.
 */
export async function seedAccount(server: FakeAccountServer, name: string, password: string, o: { state?: 'active' | 'suspended'; created?: number } = {}): Promise<{ recoveryCode: string }> {
  const { prepareRegistration } = await import('../../src/cloud/crypto/account');
  const made = await prepareRegistration(name, password);
  server.seed(name, made.request, o);
  return { recoveryCode: made.recoveryCode };
}

export interface FakeAccountApi {
  server: FakeAccountServer;
  browser: FakeBrowser;
}

/**
 * Stubs `/api/**` of a page with the fake: `/api/config` (the flag
 * `accounts` on, the site key, the limits), the account endpoints, 204 for
 * the beat and 404 for anything else. Pass `server` to put a second page
 * (another device) on the same server. Open the page with `?cloudtest`.
 */
export async function fakeAccountApi(page: Page, o: { server?: FakeAccountServer } = {}): Promise<FakeAccountApi> {
  const server = o.server ?? new FakeAccountServer();
  const browser = server.browser();
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store', ...headers }, body: JSON.stringify(body) });
    if (url.pathname === '/api/config') return json(200, server.config());
    if (url.pathname === '/api/beat') return route.fulfill({ status: 204 });
    if (!url.pathname.startsWith('/api/auth/') && !url.pathname.startsWith('/api/u/')) return json(404, { error: 'not_found' });
    const res = browser.request({
      method: req.method(),
      path: url.pathname,
      search: url.search,
      headers: await req.allHeaders(),
      body: req.postData(),
      origin: url.origin,
    });
    if (res === 'offline') return route.abort('connectionrefused');
    if (res.body === undefined) return route.fulfill({ status: res.status, headers: res.headers ?? {} });
    return json(res.status, res.body, res.headers);
  });
  return { server, browser };
}
