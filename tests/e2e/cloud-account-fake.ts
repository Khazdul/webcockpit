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
  type MyPub,
  NAME_PATTERN,
  OTHER_SESSIONS,
  PUB_DESCRIPTION_MAX,
  PUB_META_MAX_BYTES,
  PUB_TITLE_MAX,
  type PrefsAnswer,
  type PubMetaIn,
  type PubPatch,
  RECOVER_TICKET_SECONDS,
  REGISTER_PER_HOUR,
  type RecoverAnswer,
  SALT_MAX_BYTES,
  SALT_MIN_BYTES,
  SESSION_SECONDS,
  TURNSTILE_MAX_LENGTH,
  type SessionEndReason,
  WRAP_MAX_BYTES,
  WRAP_MIN_BYTES,
} from '../../shared/cloud/api';
import {
  COMMENT_MAX,
  COMMENT_NEWLINES_MAX,
  COMMENTS_PAGE_SIZE,
  COMMENTS_PER_RUN,
  type Comment,
  type CommunityBoxes,
  COUNTER_RUNS,
  DAY_RUN_DESCRIPTION_MAX,
  type DayRun,
  GALLERY_PAGE_SIZE,
  GALLERY_PAGES_MAX,
  GALLERY_PERIOD_DAYS,
  GALLERY_PERIODS,
  GALLERY_SORTS,
  HALL_OF_FAME_SIZE,
  type GalleryRow,
  type GallerySort,
  type MumeBoxes,
  NEWS_MAX,
  NOTE_DAYS,
  NOTE_MAX,
  type Note,
  RANKING_AGE_DAYS,
  RUNES_SHOWN,
  TOP_PRIOR_MEAN,
  TOP_PRIOR_VOTES,
} from '../../shared/cloud/api';
import { isPublicText } from '../../shared/cloud/text';
import { ServerModel } from '../unit/cloud-sync-model';

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
  /** The status and the headers arrived, the body did not (`loseNextAnswer = 'body'`). */
  bodyLost?: boolean;
}

/**
 * How an answer is lost after the server has done the request's work:
 * `connection` the connection drops (the client: `offline`), `hang` no
 * answer ever comes (the client: `timeout`, after its 15 s), `body` the
 * status and the headers arrive (the cookie with them) and the body is
 * cut off (the client: `bad_answer`).
 */
export type LostAnswer = 'connection' | 'hang' | 'body';

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

/** A published run in the fake (stage 64 C1). */
interface FakePub {
  account: string;
  pub: MyPub;
  payload: Uint8Array;
}

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
  /** Carry the request out and then lose the answer in this way: the next request only. */
  loseNextAnswer: LostAnswer | null = null;
  /** `loseNextAnswer = 'connection'`. */
  set dropNextAnswer(on: boolean) {
    this.loseNextAnswer = on ? 'connection' : null;
  }
  /**
   * Called once between "the password is proven" and the write in the
   * three password questions (change password, new recovery code,
   * delete): what another session did meanwhile. worker/auth.ts writes
   * only where the password is still the proven one, and so does this.
   */
  meanwhile: (() => void) | null = null;
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
  /** Ended sessions' tokens and why (stage 61). */
  private ended = new Map<string, SessionEndReason>();
  /** The accounts' items (stage 61). */
  private models = new Map<string, ServerModel>();
  /** The sync's requests fail as if the network were down (the other account requests answer). */
  syncOffline = false;

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
      prefs: { rulesAccepted: false },
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
  endSessions(name: string, reason: SessionEndReason = 'ended'): void {
    for (const s of this.sessionsOf(name.toLowerCase())) this.drop(s.token, reason);
  }

  /** Ends one session and keeps why (stage 61: `401 session_ended` with the reason, as worker/sessions.ts). */
  private drop(token: string, reason: SessionEndReason): void {
    this.sessions.delete(token);
    this.ended.set(token, reason);
  }

  /** The 401 for a cookie without a live session: why it ended when the server knows (stage 61), else `unauthorized`. */
  private gone(cookie: string | null): FakeResponse {
    const reason = cookie !== null ? this.ended.get(cookie) : undefined;
    return reason ? { status: 401, body: { error: 'session_ended', reason } } : err('unauthorized', 401);
  }

  /**
   * The account's items (stage 61): the in-memory model of the sync API
   * (tests/unit/cloud-sync-model.ts); with the flag `runs` (stage 63) its
   * run bodies too (`bodies`, `runBytes`, `limits.runBytes` the quota).
   */
  items(name: string): ServerModel {
    const key = name.toLowerCase();
    let m = this.models.get(key);
    if (!m) {
      m = new ServerModel();
      this.models.set(key, m);
    }
    if (this.flags.runs === true && !m.runsFlag) m.enableRuns();
    return m;
  }

  /**
   * A run request (`/api/u/runs…`, stage 63, ADR 0153): the flags
   * `accounts` and `runs` (404 off), the CSRF rule on writes, the session,
   * then the account's model. `bytes` is a PUT's body; a GET's answer
   * `body` is the stored bytes (a `Uint8Array`).
   */
  async runs(req: FakeRequest, cookie: string | null, bytes: Uint8Array | null): Promise<FakeResponse | 'offline'> {
    if (this.syncOffline) return 'offline';
    if (this.flags.accounts !== true || this.flags.runs !== true) return err('not_found', 404);
    if (req.method !== 'GET' && !(req.headers['x-wc'] === '1' && req.headers.origin === req.origin)) return err('forbidden', 403);
    let session = cookie !== null ? (this.sessions.get(cookie) ?? null) : null;
    if (session && session.expires <= this.clock) {
      this.drop(session.token, 'expired');
      session = null;
    }
    if (!session) return this.gone(cookie);
    const model = this.items(session.account);
    model.ended = null;
    if (req.path === '/api/u/runs' && req.method === 'GET') return model.listBodies();
    const id = decodeURIComponent(req.path.slice('/api/u/runs/'.length));
    if (!req.path.startsWith('/api/u/runs/') || id.includes('/')) return err('not_found', 404);
    if (req.method === 'PUT') {
      if (req.headers['content-length'] === undefined && bytes === null) return err('length_required', 411);
      return model.putBody(id, bytes ?? new Uint8Array(0));
    }
    if (req.method === 'GET') return model.getBody(id);
    if (req.method === 'DELETE') return model.removeBody(id);
    return err('not_found', 404);
  }

  /**
   * A sync request (`/api/u/sync/…`, stage 61): the flags `accounts` and
   * `sync`, the CSRF rule, the session, then the account's model. `bytes`
   * is a PUT's body.
   */
  sync(req: FakeRequest, cookie: string | null, bytes: Uint8Array | null): FakeResponse | 'offline' {
    if (this.syncOffline) return 'offline';
    if (this.flags.accounts !== true || this.flags.sync !== true) return err('not_found', 404);
    if (req.method !== 'GET' && !(req.headers['x-wc'] === '1' && req.headers.origin === req.origin)) return err('forbidden', 403);
    let session = cookie !== null ? (this.sessions.get(cookie) ?? null) : null;
    if (session && session.expires <= this.clock) {
      this.drop(session.token, 'expired');
      session = null;
    }
    if (!session) return this.gone(cookie);
    const model = this.items(session.account);
    model.ended = null;
    let a: { status: number; body: unknown };
    if (req.path === '/api/u/sync/changes' && req.method === 'GET') {
      const q = new URLSearchParams(req.search ?? '');
      const limit = q.get('limit');
      a = model.changes(Number(q.get('since') ?? 0), limit === null ? undefined : Number(limit));
    } else if (req.path.startsWith('/api/u/sync/items/') && (req.method === 'PUT' || req.method === 'DELETE')) {
      const [kind, id] = req.path.slice('/api/u/sync/items/'.length).split('/');
      const ifMatch = req.headers['if-match'];
      if (ifMatch === undefined) return err('if_match_required', 428);
      a = req.method === 'PUT' ? model.put(kind ?? '', id ?? '', Number(ifMatch), bytes ?? new Uint8Array(0)) : model.remove(kind ?? '', id ?? '', Number(ifMatch));
    } else return err('not_found', 404);
    return { status: a.status, body: a.body };
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

  // --- Stage 64 C2 (the watch page, tests/e2e/cloud-pub-fake.ts): sessions as the pub fake needs them ---

  /** The account (its name and state) of a live session token, or null. */
  sessionAccount(cookie: string | null): { name: string; state: 'active' | 'suspended' } | null {
    const s = cookie !== null ? this.sessions.get(cookie) : undefined;
    if (!s || s.expires <= this.clock) return null;
    const a = this.accounts.get(s.account);
    return a ? { name: a.name, state: a.state } : null;
  }

  /** Logs `browser` in to `name` without the pages (a session and its cookie). */
  logInBrowser(browser: FakeBrowser, name: string, label = 'Firefox on Linux'): void {
    browser.cookie = this.newSession(name.toLowerCase(), label).token;
  }

  /** An account's name as it spells it, from its key (the sender of a run), or null. */
  accountName(key: string): string | null {
    return this.accounts.get(key.toLowerCase())?.name ?? null;
  }

  // --- End of stage 64 C2 ---

  // ===================== Share links (stage 64 C1) =====================
  // The sender's pub endpoints (worker/pub.ts, ADR 0154): `POST /api/u/pub`
  // (the two-part body), `GET /api/u/pub`, `GET|PATCH|DELETE
  // /api/u/pub/<id>`, behind the flags `accounts` and `share`. The public
  // `/api/pub/*` and `/api/u/report` are the watch page's (stage 64 C2).
  // The rules' tick is `PATCH /api/u/account/prefs` above.

  /** Every published run, by id (removed ones are deleted here: the list never shows a tombstone). */
  pubs = new Map<string, FakePub>();
  /** Every `POST /api/u/pub` body as it arrived (the meta parsed, the payload bytes as sent), in order. */
  pubUploads: { meta: unknown; payload: Uint8Array; body: Uint8Array }[] = [];
  /** The pub requests fail as if the network were down (the other requests answer). */
  pubOffline = false;
  /** The next POST is done but its answer is lost on the way back (review fix CR3: the dialog's Try again). */
  pubLoseAnswer = false;
  /** `<account>|<key>` → the run a POST's idempotency key made (review fix CR3). */
  private pubKeys = new Map<string, string>();

  /** An account's limits (a test's own: `sharedRuns`, `payloadMaxBytes`). */
  setLimits(name: string, patch: Partial<AccountLimits>): void {
    const a = this.accounts.get(name.toLowerCase());
    if (a) a.limits = { ...a.limits, ...patch };
  }

  /** Sets an account's state (`suspended`: cannot share). */
  setState(name: string, state: 'active' | 'suspended'): void {
    const a = this.accounts.get(name.toLowerCase());
    if (a) a.state = state;
  }

  /** A published run of an account, as if it had shared it before (no payload check). Returns its id. */
  addPub(name: string, o: Partial<Omit<MyPub, 'id'>> & { id?: string; payload?: Uint8Array } = {}): string {
    const id = o.id ?? this.newPubId();
    // Milliseconds, as the Worker sends every time.
    const t = this.clock;
    this.pubs.set(id, {
      account: name.toLowerCase(),
      payload: o.payload ?? new Uint8Array([0x1f, 0x8b]),
      pub: {
        id,
        title: o.title ?? 'A run',
        description: o.description ?? '',
        character: o.character ?? 'Rasta',
        ...(o.level !== undefined ? { level: o.level } : {}),
        lengthS: o.lengthS ?? 60,
        listed: o.listed ?? false,
        ...(o.listedAt !== undefined || o.listed ? { listedAt: o.listedAt ?? t } : {}),
        state: o.state ?? 'active',
        created: o.created ?? t,
        updated: o.updated ?? o.created ?? t,
        views: o.views ?? 0,
        bytes: o.bytes ?? 2,
        stars: { sum: 0, count: 0 },
        comments: 0,
        news: { votes: 0, comments: 0 },
      },
    });
    return id;
  }

  /** The account's runs, newest first (as `GET /api/u/pub`), with their stars, comments and what is new (stage 65). */
  pubsOf(name: string): MyPub[] {
    return [...this.pubs.values()]
      .filter((p) => p.account === name.toLowerCase())
      .map((p) => this.withReactions(p))
      .sort((a, b) => b.created - a.created || (a.id < b.id ? -1 : 1));
  }

  private newPubId(): string {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (const b of crypto.getRandomValues(new Uint8Array(12))) id += abc[b % abc.length];
    return this.pubs.has(id) ? this.newPubId() : id;
  }

  /** A pub request (`/api/u/pub…`). `bytes` is a POST's body. */
  pub(req: FakeRequest, cookie: string | null, bytes: Uint8Array | null): FakeResponse | 'offline' {
    if (this.pubOffline) return 'offline';
    if (this.flags.accounts !== true || this.flags.share !== true) return err('not_found', 404);
    if (req.method !== 'GET' && !(req.headers['x-wc'] === '1' && req.headers.origin === req.origin)) return err('forbidden', 403);
    let session = cookie !== null ? (this.sessions.get(cookie) ?? null) : null;
    if (session && session.expires <= this.clock) {
      this.drop(session.token, 'expired');
      session = null;
    }
    if (!session) return this.gone(cookie);
    const account = this.accounts.get(session.account);
    if (!account) return err('unauthorized', 401);
    const res = this.pubAnswer(req, account, bytes);
    this.seen.push({ method: req.method, path: req.path, search: req.search ?? '', body: null, headers: { ...req.headers }, cookie: true, status: res.status });
    if (this.pubLoseAnswer && req.method === 'POST') {
      this.pubLoseAnswer = false;
      return 'offline';
    }
    return res;
  }

  private pubAnswer(req: FakeRequest, account: AccountRow, bytes: Uint8Array | null): FakeResponse {
    const t = this.clock;
    if (req.path === '/api/u/pub') {
      if (req.method === 'GET') return { status: 200, body: { pubs: this.pubsOf(account.key) } };
      if (req.method !== 'POST') return err('method_not_allowed', 405);
      if (bytes === null) return err('length_required', 411);
      if ((req.headers['content-type'] ?? '').split(';')[0]!.trim() !== 'application/octet-stream') return err('bad_request', 400);
      if (bytes.length < 4) return err('bad_request', 400);
      const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
      if (n === 0 || n > PUB_META_MAX_BYTES || 4 + n > bytes.length) return err('bad_request', 400);
      if (account.state === 'suspended') return err('suspended', 403);
      if (!account.prefs.rulesAccepted) return err('rules', 403);
      const payload = bytes.subarray(4 + n);
      if (payload.length > account.limits.payloadMaxBytes) return { status: 413, body: { error: 'payload_too_large', limit: account.limits.payloadMaxBytes } };
      let meta: unknown;
      try {
        meta = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4, 4 + n)));
      } catch {
        return err('bad_request', 400);
      }
      this.pubUploads.push({ meta, payload: new Uint8Array(payload), body: new Uint8Array(bytes) });
      if (!hasKeys(meta, ['title', 'description', 'character', 'lengthS', 'listed'], ['level', 'key'])) return err('bad_request', 400);
      const { key, ...m } = meta as unknown as PubMetaIn;
      if (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,32}$/.test(key))) return err('bad_request', 400);
      const textOk = (v: unknown, min: number, max: number): boolean => typeof v === 'string' && [...v].length >= min && [...v].length <= max && v === v.trim();
      if (!textOk(m.title, 1, PUB_TITLE_MAX) || typeof m.description !== 'string' || [...m.description].length > PUB_DESCRIPTION_MAX || !textOk(m.character, 0, 40)) return err('bad_request', 400);
      // Hall of Fame (stage 65): `listed: true` with the flag `gallery` on, at most `listingsPerDay` first listings a UTC day.
      if (typeof m.listed !== 'boolean' || (m.listed && this.flags.gallery !== true) || !Number.isInteger(m.lengthS) || m.lengthS < 0 || (m.level !== undefined && !Number.isInteger(m.level))) return err('bad_request', 400);
      if (payload[0] !== 0x1f || payload[1] !== 0x8b) return err('bad_request', 400);
      // A repeated key answers the run it made (review fix CR3).
      const made = key === undefined ? undefined : this.pubKeys.get(`${account.key}|${key}`);
      if (made && this.pubs.has(made)) return { status: 200, body: { pub: { ...this.pubs.get(made)!.pub } } };
      if (this.pubsOf(account.key).length >= account.limits.sharedRuns) return { status: 413, body: { error: 'pub_quota', limit: account.limits.sharedRuns } };
      if (m.listed && this.listingsToday(account.key) >= account.limits.listingsPerDay) return err('too_many', 429);
      const id = this.addPub(account.key, { ...m, created: t, updated: t, bytes: payload.length, payload: new Uint8Array(payload), ...(m.listed ? { listedAt: t } : {}) });
      if (key !== undefined) this.pubKeys.set(`${account.key}|${key}`, id);
      return { status: 200, body: { pub: this.withReactions(this.pubs.get(id)!) } };
    }
    const id = req.path.slice('/api/u/pub/'.length);
    const p = /^[A-Za-z0-9]{12}$/.test(id) ? this.pubs.get(id) : undefined;
    if (!p || p.account !== account.key) return err('not_found', 404);
    if (req.method === 'GET') {
      const { pub } = p;
      return {
        status: 200,
        body: {
          id: pub.id,
          title: pub.title,
          description: pub.description,
          sender: account.name,
          character: pub.character,
          ...(pub.level !== undefined ? { level: pub.level } : {}),
          lengthS: pub.lengthS,
          created: pub.created,
          views: pub.views,
          bytes: pub.bytes,
          ...(pub.state === 'hidden' ? { hidden: true } : {}),
          ...(this.flags.gallery === true ? { listed: pub.listed, stars: this.starsOf(id), comments: this.commentCount(id) } : {}),
        },
      };
    }
    if (req.method === 'DELETE') {
      this.pubs.delete(id);
      this.dropCommunityOf(id);
      return { status: 204 };
    }
    if (req.method !== 'PATCH') return err('method_not_allowed', 405);
    if (account.state === 'suspended') return err('suspended', 403);
    if (p.pub.state === 'hidden') return err('hidden', 403);
    const b = this.body(req, [], ['title', 'description', 'listed']);
    if (!b || Object.keys(b).length === 0) return err('bad_request', 400);
    // Stage 65: list (flag `gallery`; a first listing counts against `listingsPerDay`) or unlist; `listedAt` is set once.
    if (b.listed !== undefined && (typeof b.listed !== 'boolean' || (b.listed && this.flags.gallery !== true))) return err('bad_request', 400);
    if (b.listed === true && p.pub.listedAt === undefined) {
      if (this.listingsToday(account.key) >= account.limits.listingsPerDay) return err('too_many', 429);
      p.pub.listedAt = t;
    }
    if (b.title !== undefined && (typeof b.title !== 'string' || b.title.trim() === '' || b.title !== b.title.trim() || [...b.title].length > PUB_TITLE_MAX)) return err('bad_request', 400);
    if (b.description !== undefined && (typeof b.description !== 'string' || [...b.description].length > PUB_DESCRIPTION_MAX)) return err('bad_request', 400);
    p.pub = { ...p.pub, ...(b as PubPatch), updated: t };
    return { status: 200, body: { pub: this.withReactions(p) } };
  }
  // =================== end of Share links (stage 64 C1) ===================

  // ===================== The community (stage 65 B) =====================
  // worker/community.ts as an in-memory model (ADR 0155; the contract is
  // "The community" in shared/cloud/api.ts), for the views of part C:
  //
  //   GET  /api/gallery (round 13: `by`, five sorts, pages of 10), /api/community, /api/runes
  //   GET  /api/pub/<id>/comments
  //   GET|PUT|DELETE /api/u/pub/<id>/vote, POST /api/u/pub/<id>/comments
  //   DELETE /api/u/comments/<id>, POST /api/u/runes, DELETE /api/u/runes/<id>
  //   GET  /api/u/community/news, POST /api/u/community/seen
  //   `listed` of GET /api/stats/public: `publicStats()`
  //
  // Behind `flags.share` and `flags.gallery` (the board `flags.runes` too).
  // Listed runs are the store's `pubs` (seed one with `addPub(name,
  // {listed: true, listedAt})`); votes, comments and notes are seeded with
  // `addVote`, `addComment`, `addNote`. No cache: every answer is fresh.
  // Not modelled: reports of comments and notes (the pub fake's
  // `/api/u/report` answers run reports only) and the hiding by reports.

  /** `<pub id>` → account key → the vote. */
  votes = new Map<string, Map<string, { stars: number; updated: number; ranks: boolean }>>();
  /** Every comment, by id (`state` 'hidden' is shown to no one). */
  comments = new Map<string, { id: string; pub: string; account: string; text: string; created: number; state: 'active' | 'hidden' }>();
  /** Every note, by id. */
  notes = new Map<string, { id: string; account: string; text: string; created: number; state: 'active' | 'hidden' }>();
  /** account key → its seen times. */
  seenTimes = new Map<string, { gallery: number; reactions: number }>();
  /** MUME's boxes of `GET /api/community` (absent until a test sets them). */
  mume: MumeBoxes | null = null;
  /** Every community request fails as if the network were down. */
  communityOffline = false;

  private listingsToday(key: string): number {
    const start = Date.parse(`${new Date(this.clock).toISOString().slice(0, 10)}T00:00:00Z`);
    return [...this.pubs.values()].filter((p) => p.account === key && (p.pub.listedAt ?? -1) >= start).length;
  }

  private communityId(): string {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (const b of crypto.getRandomValues(new Uint8Array(12))) id += abc[b % abc.length];
    return id;
  }

  private liveVoter(key: string): boolean {
    return this.accounts.get(key)?.state === 'active';
  }

  /** A run's stars (suspended accounts' votes out, as the Worker's sums). */
  starsOf(id: string): { sum: number; count: number } {
    let sum = 0;
    let count = 0;
    for (const [key, v] of this.votes.get(id) ?? []) {
      if (!this.liveVoter(key)) continue;
      sum += v.stars;
      count++;
    }
    return { sum, count };
  }

  commentCount(id: string): number {
    return [...this.comments.values()].filter((c) => c.pub === id && c.state === 'active').length;
  }

  private seenOf(key: string): { gallery: number; reactions: number } {
    return this.seenTimes.get(key) ?? { gallery: 0, reactions: 0 };
  }

  private withReactions(p: FakePub): MyPub {
    const seen = this.seenOf(p.account).reactions;
    const votes = [...(this.votes.get(p.pub.id) ?? [])].filter(([, v]) => v.updated > seen).length;
    const comments = [...this.comments.values()].filter((c) => c.pub === p.pub.id && c.state === 'active' && c.created > seen && c.account !== p.account).length;
    return { ...p.pub, stars: this.starsOf(p.pub.id), comments: this.commentCount(p.pub.id), news: { votes: Math.min(NEWS_MAX, votes), comments: Math.min(NEWS_MAX, comments) } };
  }

  private dropCommunityOf(id: string): void {
    this.votes.delete(id);
    for (const [k, c] of this.comments) if (c.pub === id) this.comments.delete(k);
  }

  /** A vote, as if `name` had cast it `ago` ms ago; `ranks` defaults to the account's age (7 days). */
  addVote(name: string, id: string, stars: number, o: { ago?: number; ranks?: boolean } = {}): void {
    const key = name.toLowerCase();
    const at = this.clock - (o.ago ?? 0);
    const a = this.accounts.get(key);
    const ranks = o.ranks ?? (a !== undefined && at - a.created >= RANKING_AGE_DAYS * 86_400_000);
    const m = this.votes.get(id) ?? new Map();
    m.set(key, { stars, updated: at, ranks });
    this.votes.set(id, m);
  }

  /** A comment by `name` on `id`, `ago` ms ago. Returns its id. */
  addComment(name: string, id: string, text: string, o: { ago?: number; state?: 'active' | 'hidden' } = {}): string {
    const cid = this.communityId();
    this.comments.set(cid, { id: cid, pub: id, account: name.toLowerCase(), text, created: this.clock - (o.ago ?? 0), state: o.state ?? 'active' });
    return cid;
  }

  /** A note by `name`, `ago` ms ago. Returns its id. */
  addNote(name: string, text: string, o: { ago?: number; state?: 'active' | 'hidden' } = {}): string {
    const id = this.communityId();
    this.notes.set(id, { id, account: name.toLowerCase(), text, created: this.clock - (o.ago ?? 0), state: o.state ?? 'active' });
    return id;
  }

  private listed(): FakePub[] {
    return [...this.pubs.values()].filter((p) => p.pub.listed && p.pub.state === 'active' && p.pub.listedAt !== undefined);
  }

  private row(p: FakePub): GalleryRow {
    const { pub } = p;
    return {
      id: pub.id,
      title: pub.title,
      sender: this.accountName(p.account) ?? '',
      character: pub.character,
      ...(pub.level !== undefined ? { level: pub.level } : {}),
      lengthS: pub.lengthS,
      listedAt: pub.listedAt!,
      views: pub.views,
      stars: this.starsOf(pub.id),
      comments: this.commentCount(pub.id),
    };
  }

  private sorted(sort: GallerySort, since: number): FakePub[] {
    const runs = this.listed().filter((p) => p.pub.listedAt! >= since);
    const ranking = (id: string): { sum: number; count: number } => {
      let sum = 0;
      let count = 0;
      for (const [key, v] of this.votes.get(id) ?? []) if (v.ranks && this.liveVoter(key)) (sum += v.stars), count++;
      return { sum, count };
    };
    const all = this.listed().map((p) => ranking(p.pub.id));
    const total = all.reduce((s, r) => s + r.count, 0);
    const mean = total > 0 ? all.reduce((s, r) => s + r.sum, 0) / total : TOP_PRIOR_MEAN;
    const score = (p: FakePub): number => {
      const r = ranking(p.pub.id);
      return (TOP_PRIOR_VOTES * mean + r.sum) / (TOP_PRIOR_VOTES + r.count);
    };
    const newer = (a: FakePub, b: FakePub): number => b.pub.listedAt! - a.pub.listedAt! || (a.pub.id < b.pub.id ? -1 : 1);
    if (sort === 'new') return runs.sort(newer);
    if (sort === 'watched') return runs.sort((a, b) => b.pub.views - a.pub.views || newer(a, b));
    if (sort === 'comments') return runs.sort((a, b) => this.commentCount(b.pub.id) - this.commentCount(a.pub.id) || newer(a, b));
    if (sort === 'length') return runs.sort((a, b) => b.pub.lengthS - a.pub.lengthS || newer(a, b));
    return runs.sort((a, b) => score(b) - score(a) || ranking(b.pub.id).count - ranking(a.pub.id).count || newer(a, b));
  }

  /** `listed` of `GET /api/stats/public` (the fake's stats endpoint is the e2e's own; call this from it). */
  publicListed(): number[] {
    return this.listed()
      .map((p) => p.pub.listedAt!)
      .sort((a, b) => b - a)
      .slice(0, COUNTER_RUNS);
  }

  /** True for a path the community answers (public or under `/api/u/`). */
  static isCommunityPath(path: string): boolean {
    return (
      ['/api/gallery', '/api/community', '/api/runes', '/api/u/runes', '/api/u/community/news', '/api/u/community/seen'].includes(path) ||
      /^\/api\/pub\/[^/]+\/comments$/.test(path) ||
      /^\/api\/u\/pub\/[^/]+\/(vote|comments)$/.test(path) ||
      /^\/api\/u\/(comments|runes)\/[^/]+$/.test(path)
    );
  }

  /** One community request (`isCommunityPath`). */
  community(req: FakeRequest, cookie: string | null): FakeResponse | 'offline' {
    if (this.communityOffline) return 'offline';
    const path = req.path;
    const runes = path === '/api/runes' || path.startsWith('/api/u/runes');
    if (this.flags.share !== true || this.flags.gallery !== true || (runes && this.flags.runes !== true)) return err('not_found', 404);
    const t = this.clock;
    const q = new URLSearchParams(req.search ?? '');
    if (!path.startsWith('/api/u/')) {
      if (req.method !== 'GET') return err('method_not_allowed', 405);
      if (path === '/api/gallery') {
        const sort = (q.get('sort') ?? 'new') as GallerySort;
        const period = q.get('period') ?? 'all';
        const page = Number(q.get('page') ?? '1');
        if (!GALLERY_SORTS.includes(sort) || !(GALLERY_PERIODS as readonly string[]).includes(period) || !Number.isInteger(page) || page < 1 || page > GALLERY_PAGES_MAX) return err('bad_request', 400);
        const days = GALLERY_PERIOD_DAYS[period as keyof typeof GALLERY_PERIOD_DAYS];
        const by = q.get('by');
        const runs = this.sorted(sort, days === null ? 0 : t - days * 86_400_000).filter((p) => by === null || p.account === by.toLowerCase());
        const rows = runs.slice((page - 1) * GALLERY_PAGE_SIZE, page * GALLERY_PAGE_SIZE).map((p) => this.row(p));
        return { status: 200, body: { sort, period, page, rows, more: runs.length > page * GALLERY_PAGE_SIZE && page < GALLERY_PAGES_MAX, time: t } };
      }
      if (path === '/api/community') {
        const dayStart = (ms: number): number => Date.parse(`${new Date(ms).toISOString().slice(0, 10)}T00:00:00Z`);
        const ofDay = (start: number): DayRun | null => {
          const before = this.listed().filter((p) => p.pub.listedAt! < start).sort((a, b) => (a.pub.id < b.pub.id ? -1 : 1));
          const p = before[(start / 86_400_000) % before.length];
          return p ? { ...this.row(p), description: [...p.pub.description].slice(0, DAY_RUN_DESCRIPTION_MAX).join('') } : null;
        };
        const boxes: CommunityBoxes = {
          hallOfFame: this.sorted('top', 0).slice(0, HALL_OF_FAME_SIZE).map((p) => this.row(p)),
          today: ofDay(dayStart(t)),
          ...(this.mume ? { mume: this.mume } : {}),
          time: t,
        };
        return { status: 200, body: boxes };
      }
      if (path === '/api/runes') {
        const notes: Note[] = [...this.notes.values()]
          .filter((n) => n.state === 'active' && n.created > t - NOTE_DAYS * 86_400_000)
          .sort((a, b) => b.created - a.created)
          .slice(0, RUNES_SHOWN)
          .map((n) => ({ id: n.id, writer: this.accountName(n.account) ?? '', text: n.text, created: n.created }));
        return { status: 200, body: { notes, time: t } };
      }
      // /api/pub/<id>/comments
      const id = path.split('/')[3]!;
      const p = this.pubs.get(id);
      if (!p) return err('not_found', 404);
      if (p.pub.state === 'hidden') return err('hidden', 451);
      const pageText = q.get('page') ?? 'last';
      if (pageText !== 'last' && !/^[1-9]\d*$/.test(pageText)) return err('bad_request', 400);
      const all = [...this.comments.values()].filter((c) => c.pub === id && c.state === 'active').sort((a, b) => a.created - b.created);
      const pages = Math.max(1, Math.ceil(all.length / COMMENTS_PAGE_SIZE));
      const page = pageText === 'last' ? pages : Number(pageText);
      const comments: Comment[] = all
        .slice((page - 1) * COMMENTS_PAGE_SIZE, page * COMMENTS_PAGE_SIZE)
        .map((c) => ({ id: c.id, writer: this.accountName(c.account) ?? '', text: c.text, created: c.created }));
      return { status: 200, body: { comments, page, pages, total: all.length } };
    }

    if (this.flags.accounts !== true) return err('not_found', 404);
    if (req.method !== 'GET' && !(req.headers['x-wc'] === '1' && req.headers.origin === req.origin)) return err('forbidden', 403);
    const session = cookie !== null ? this.sessions.get(cookie) : undefined;
    if (!session || session.expires <= this.clock) return this.gone(cookie);
    const account = this.accounts.get(session.account);
    if (!account) return err('unauthorized', 401);
    const me = account.key;
    const hour = (ms: number): boolean => ms > t - 3_600_000;

    let m = /^\/api\/u\/pub\/([^/]+)\/(vote|comments)$/.exec(path);
    if (m) {
      const id = m[1]!;
      const p = this.pubs.get(id);
      if (m[2] === 'comments') {
        if (req.method !== 'POST') return err('method_not_allowed', 405);
        if (account.state === 'suspended') return err('suspended', 403);
        const b = this.body(req, ['text']);
        if (!b) return err('bad_request', 400);
        const text = b.text;
        if (typeof text !== 'string' || text !== text.trim() || [...text].length < 1 || [...text].length > COMMENT_MAX || !isPublicText(text, { newlines: COMMENT_NEWLINES_MAX })) return err('bad_text', 400);
        if (!p || p.pub.state !== 'active') return err('not_found', 404);
        if (this.commentCount(id) >= COMMENTS_PER_RUN) return err('full', 409);
        if ([...this.comments.values()].filter((c) => c.account === me && hour(c.created)).length >= account.limits.commentsPerHour) return err('too_many', 429);
        const cid = this.addComment(me, id, text);
        return { status: 200, body: { comment: { id: cid, writer: account.name, text, created: t } } };
      }
      const answer = (): FakeResponse => ({ status: 200, body: { stars: this.starsOf(id), mine: this.votes.get(id)?.get(me)?.stars ?? null } });
      if (req.method === 'GET') return p && p.pub.state === 'active' ? answer() : err('not_found', 404);
      if (req.method === 'DELETE') {
        if (account.state === 'suspended') return err('suspended', 403);
        if (!p) return err('not_found', 404);
        this.votes.get(id)?.delete(me);
        return answer();
      }
      if (req.method !== 'PUT') return err('method_not_allowed', 405);
      if (account.state === 'suspended') return err('suspended', 403);
      const b = this.body(req, ['stars']);
      if (!b || typeof b.stars !== 'number' || !Number.isInteger(b.stars) || b.stars < 1 || b.stars > 5) return err('bad_request', 400);
      if (!p || p.pub.state !== 'active') return err('not_found', 404);
      if (p.account === me) return err('own', 403);
      const others = [...this.votes].filter(([pid, v]) => pid !== id && hour(v.get(me)?.updated ?? -Infinity)).length;
      if (others >= account.limits.votesPerHour) return err('too_many', 429);
      this.addVote(me, id, b.stars);
      return answer();
    }
    m = /^\/api\/u\/comments\/([^/]+)$/.exec(path);
    if (m) {
      if (req.method !== 'DELETE') return err('method_not_allowed', 405);
      const c = this.comments.get(m[1]!);
      if (!c || (c.account !== me && this.pubs.get(c.pub)?.account !== me)) return err('not_found', 404);
      this.comments.delete(c.id);
      return { status: 204 };
    }
    if (path === '/api/u/runes') {
      if (req.method !== 'POST') return err('method_not_allowed', 405);
      if (account.state === 'suspended') return err('suspended', 403);
      const b = this.body(req, ['text']);
      if (!b) return err('bad_request', 400);
      const text = b.text;
      if (typeof text !== 'string' || text !== text.trim() || [...text].length < 1 || [...text].length > NOTE_MAX || !isPublicText(text, { newlines: 0 })) return err('bad_text', 400);
      const start = Date.parse(`${new Date(t).toISOString().slice(0, 10)}T00:00:00Z`);
      if ([...this.notes.values()].filter((n) => n.account === me && n.created >= start).length >= account.limits.notesPerDay) return err('too_many', 429);
      const id = this.addNote(me, text);
      return { status: 200, body: { note: { id, writer: account.name, text, created: t } } };
    }
    m = /^\/api\/u\/runes\/([^/]+)$/.exec(path);
    if (m) {
      if (req.method !== 'DELETE') return err('method_not_allowed', 405);
      const n = this.notes.get(m[1]!);
      if (!n || n.account !== me) return err('not_found', 404);
      this.notes.delete(n.id);
      return { status: 204 };
    }
    const seen = this.seenOf(me);
    if (path === '/api/u/community/news') {
      if (req.method !== 'GET') return err('method_not_allowed', 405);
      const runs = this.listed().filter((p) => p.account !== me && p.pub.listedAt! > seen.gallery);
      const mine = new Set([...this.pubs.values()].filter((p) => p.account === me && p.pub.state === 'active').map((p) => p.pub.id));
      const times = [
        ...[...this.votes].filter(([id]) => mine.has(id)).flatMap(([, v]) => [...v].filter(([k, x]) => k !== me && x.updated > seen.reactions).map(([, x]) => x.updated)),
        ...[...this.comments.values()].filter((c) => mine.has(c.pub) && c.account !== me && c.state === 'active' && c.created > seen.reactions).map((c) => c.created),
      ];
      return {
        status: 200,
        body: {
          runs: Math.min(NEWS_MAX, runs.length),
          reactions: Math.min(NEWS_MAX, times.length),
          newestRun: runs.length ? Math.max(...runs.map((p) => p.pub.listedAt!)) : null,
          newestReaction: times.length ? Math.max(...times) : null,
        },
      };
    }
    // /api/u/community/seen
    if (req.method !== 'POST') return err('method_not_allowed', 405);
    const b = this.body(req, [], ['gallery', 'reactions']);
    const whole = (v: unknown): boolean => v === undefined || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
    if (!b || Object.keys(b).length === 0 || !whole(b.gallery) || !whole(b.reactions)) return err('bad_request', 400);
    const next = {
      gallery: b.gallery === undefined ? seen.gallery : Math.max(seen.gallery, Math.min(b.gallery as number, t)),
      reactions: b.reactions === undefined ? seen.reactions : Math.max(seen.reactions, Math.min(b.reactions as number, t)),
    };
    this.seenTimes.set(me, next);
    return { status: 200, body: next };
  }
  // =================== end of The community (stage 65 B) ===================

  // --- The server ---

  /** `GET /api/config`. */
  config(): Config {
    return { flags: { ...this.flags }, turnstileSiteKey: this.siteKey, limits: { ...DEFAULT_ACCOUNT_LIMITS }, time: this.clock };
  }

  /** One account request. `cookie` is the browser's session token; the answer may set or clear it. */
  handle(req: FakeRequest, cookie: string | null): { res: FakeResponse | 'offline' | 'hang'; cookie: string | null } {
    let jar = cookie;
    const setCookie = (token: string | null): void => {
      jar = token;
    };
    const failing = this.fail !== null && (this.failWhen === null || this.failWhen(req));
    let res: FakeResponse | 'offline' | 'hang';
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
    const lose = this.loseNextAnswer;
    if (lose !== null && res !== 'offline') {
      this.loseNextAnswer = null;
      if (lose === 'connection') res = 'offline';
      else if (lose === 'hang') res = 'hang';
      else res = { ...res, bodyLost: true };
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
      if (session && session.expires <= this.clock) {
        this.drop(session.token, 'expired');
        session = null;
      }
      if (!session) {
        const answer = this.gone(cookie);
        if (cookie !== null) setCookie(null);
        return answer;
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
        this.drop(session!.token, 'logout');
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
    const usage = this.models.get(a.key)?.usage() ?? { items: 0, itemBytes: 0 };
    return { name: a.name, created: a.created, state: a.state, usage: { ...usage, runBytes: usage.runBytes ?? 0 }, limits: { ...a.limits }, sessions, prefs: { ...a.prefs } };
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
    this.endSessions(key, 'recovered');
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

  /**
   * After the proof, before the write: another session may have changed
   * the password or deleted the account meanwhile (`meanwhile`). True
   * when the proven password is still the account's (worker/auth.ts: the
   * write's `WHERE … AND auth_hash = ?`; otherwise 401 `invalid_login`,
   * the try stays counted).
   */
  private stillProven(account: AccountRow, authKey: unknown): boolean {
    const between = this.meanwhile;
    this.meanwhile = null;
    between?.();
    return this.accounts.get(account.key) === account && account.authKey === authKey;
  }

  private password(req: FakeRequest, account: AccountRow, session: SessionRow): FakeResponse {
    const b = this.body(req, ['authKey', 'set']);
    if (!b) return err('bad_request', 400);
    const next = hasKeys(b.set, PASSWORD_KEYS) ? passwordOf(b.set) : null;
    if (!next) return err('bad_request', 400);
    const proven = this.passwordAgain(account, b.authKey);
    if (typeof proven !== 'function') return proven;
    if (!this.stillProven(account, b.authKey)) return err('invalid_login', 401);
    Object.assign(account, next);
    for (const s of this.sessionsOf(account.key)) if (s.token !== session.token) this.drop(s.token, 'password');
    proven();
    return { status: 204 };
  }

  private recovery(req: FakeRequest, account: AccountRow): FakeResponse {
    const b = this.body(req, ['authKey', 'recoveryAuth', 'wrapRc']);
    if (!b) return err('bad_request', 400);
    if (!isKey(b.recoveryAuth) || !isWrap(b.wrapRc)) return err('bad_request', 400);
    const proven = this.passwordAgain(account, b.authKey);
    if (typeof proven !== 'function') return proven;
    if (!this.stillProven(account, b.authKey)) return err('invalid_login', 401);
    account.recoveryAuth = b.recoveryAuth;
    account.wrapRc = b.wrapRc;
    proven();
    return { status: 204 };
  }

  private endSession(id: string, account: AccountRow, session: SessionRow, setCookie: (t: string | null) => void): FakeResponse {
    if (id === OTHER_SESSIONS) {
      for (const s of this.sessionsOf(account.key)) if (s.token !== session.token) this.drop(s.token, 'ended');
      return { status: 204 };
    }
    if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return err('not_found', 404);
    const gone = this.sessionsOf(account.key).find((s) => s.id === id);
    if (!gone) return err('not_found', 404);
    this.drop(gone.token, 'ended');
    if (gone.token === session.token) setCookie(null);
    return { status: 204 };
  }

  private prefs(req: FakeRequest, account: AccountRow): FakeResponse {
    const b = this.body(req, [], ['galleryNotice', 'rulesAccepted']);
    if (!b || Object.keys(b).length === 0) return err('bad_request', 400);
    if (b.galleryNotice !== undefined && typeof b.galleryNotice !== 'boolean') return err('bad_request', 400);
    if (b.rulesAccepted !== undefined && b.rulesAccepted !== true) return err('bad_request', 400);
    account.prefs = {
      ...account.prefs,
      // (`galleryNotice` is accepted and ignored since stage 65, as the Worker does.)
      ...(b.rulesAccepted === true ? { rulesAccepted: true } : {}),
    };
    return { status: 200, body: { prefs: { ...account.prefs } } satisfies PrefsAnswer };
  }

  private remove(req: FakeRequest, account: AccountRow, setCookie: (t: string | null) => void): FakeResponse {
    const b = this.body(req, ['authKey']);
    if (!b) return err('bad_request', 400);
    const proven = this.passwordAgain(account, b.authKey);
    if (typeof proven !== 'function') return proven;
    if (!this.stillProven(account, b.authKey)) return err('invalid_login', 401);
    this.reserved.add(account.key);
    this.endSessions(account.key, 'deleted');
    this.accounts.delete(account.key);
    this.models.delete(account.key);
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

  /** A sync request from this browser (stage 61). */
  syncRequest(req: FakeRequest, bytes: Uint8Array | null): FakeResponse | 'offline' {
    const res = this.server.sync(req, this.cookie, bytes);
    if (res !== 'offline' && res.status === 401) this.cookie = null;
    return res;
  }

  /** A run request from this browser (stage 63). */
  async runsRequest(req: FakeRequest, bytes: Uint8Array | null): Promise<FakeResponse | 'offline'> {
    const res = await this.server.runs(req, this.cookie, bytes);
    if (res !== 'offline' && res.status === 401) this.cookie = null;
    return res;
  }

  /** A pub request from this browser (stage 64 C1). */
  pubRequest(req: FakeRequest, bytes: Uint8Array | null): FakeResponse | 'offline' {
    const res = this.server.pub(req, this.cookie, bytes);
    if (res !== 'offline' && res.status === 401) this.cookie = null;
    return res;
  }

  /** A community request from this browser (stage 65 B). */
  communityRequest(req: FakeRequest): FakeResponse | 'offline' {
    const res = this.server.community(req, this.cookie);
    if (res !== 'offline' && res.status === 401 && req.path.startsWith('/api/u/')) this.cookie = null;
    return res;
  }

  /** One request from this browser. `offline`: the connection failed. `hang`: no answer ever comes. */
  request(req: FakeRequest): FakeResponse | 'offline' | 'hang' {
    const { res, cookie } = this.server.handle(req, this.cookie);
    // An answer that never arrived sets no cookie either (one whose body was lost does: the cookie is a header).
    if (res !== 'offline' && res !== 'hang') this.cookie = cookie;
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
  /**
   * Holds the answer of the next request to `path` (e.g.
   * `/api/auth/register`): the server does its work, `arrived` resolves,
   * and the page gets the answer only after `release()`.
   */
  holdNext(path: string): { arrived: Promise<void>; release(): void };
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
  let hold: { path: string; arrived: () => void; released: Promise<void> } | null = null;
  const holdNext = (path: string): { arrived: Promise<void>; release(): void } => {
    let arrivedNow = (): void => {};
    let release = (): void => {};
    const arrived = new Promise<void>((r) => (arrivedNow = r));
    const released = new Promise<void>((r) => (release = r));
    hold = { path, arrived: arrivedNow, released };
    return { arrived, release };
  };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store', ...headers }, body: JSON.stringify(body) });
    if (url.pathname === '/api/config') return json(200, server.config());
    if (url.pathname === '/api/beat') return route.fulfill({ status: 204 });
    // --- The community (stage 65 B): public and `/api/u/` paths ---
    if (FakeAccountServer.isCommunityPath(url.pathname)) {
      const r = browser.communityRequest({ method: req.method(), path: url.pathname, search: url.search, headers: await req.allHeaders(), body: req.postData(), origin: url.origin });
      if (r === 'offline') return route.abort('connectionrefused');
      if (r.body === undefined) return route.fulfill({ status: r.status });
      return json(r.status, r.body);
    }
    // The guests' counter (stage 65 B): with `gallery` on the fake answers the public stats with `listed`.
    if (url.pathname === '/api/stats/public' && server.flags.gallery === true && server.flags.share === true) {
      return json(200, { online: 0, playing: 0, listed: server.publicListed() }, { 'Cache-Control': 'public, max-age=60' });
    }
    // --- end of The community ---
    if (!url.pathname.startsWith('/api/auth/') && !url.pathname.startsWith('/api/u/')) return json(404, { error: 'not_found' });
    if (url.pathname.startsWith('/api/u/sync/')) {
      const buf = req.postDataBuffer();
      const r = browser.syncRequest(
        { method: req.method(), path: url.pathname, search: url.search, headers: await req.allHeaders(), body: null, origin: url.origin },
        buf ? new Uint8Array(buf) : null,
      );
      if (r === 'offline') return route.abort('connectionrefused');
      return json(r.status, r.body);
    }
    if (url.pathname === '/api/u/runs' || url.pathname.startsWith('/api/u/runs/')) {
      const buf = req.postDataBuffer();
      const r = await browser.runsRequest(
        { method: req.method(), path: url.pathname, search: url.search, headers: await req.allHeaders(), body: null, origin: url.origin },
        buf ? new Uint8Array(buf) : null,
      );
      if (r === 'offline') return route.abort('connectionrefused');
      if (r.body instanceof Uint8Array) return route.fulfill({ status: r.status, contentType: 'application/octet-stream', headers: { 'Cache-Control': 'no-store' }, body: Buffer.from(r.body) });
      return json(r.status, r.body);
    }
    // --- Share links (stage 64 C1): the sender's pub endpoints ---
    if (url.pathname === '/api/u/pub' || url.pathname.startsWith('/api/u/pub/')) {
      const buf = req.postDataBuffer();
      const r = browser.pubRequest(
        { method: req.method(), path: url.pathname, search: url.search, headers: await req.allHeaders(), body: req.method() === 'PATCH' ? req.postData() : null, origin: url.origin },
        buf ? new Uint8Array(buf) : null,
      );
      if (r === 'offline') return route.abort('connectionrefused');
      if (r.body === undefined) return route.fulfill({ status: r.status });
      return json(r.status, r.body);
    }
    // --- end of Share links ---
    const res = browser.request({
      method: req.method(),
      path: url.pathname,
      search: url.search,
      headers: await req.allHeaders(),
      body: req.postData(),
      origin: url.origin,
    });
    if (hold && hold.path === url.pathname) {
      const h = hold;
      hold = null;
      h.arrived();
      await h.released;
    }
    if (res === 'offline') return route.abort('connectionrefused');
    // No answer: the request stays open until the page gives up (its 15 s) or goes.
    if (res === 'hang') return;
    if (res.bodyLost) return route.fulfill({ status: res.status, contentType: 'application/json', headers: res.headers ?? {}, body: '{"acc' });
    if (res.body === undefined) return route.fulfill({ status: res.status, headers: res.headers ?? {} });
    return json(res.status, res.body, res.headers);
  });
  return { server, browser, holdNext };
}
