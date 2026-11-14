// The client of the account API (spec §7.2; the contract is the table of
// docs/stages/60-accounts.md, the server worker/auth.ts, the types
// shared/cloud/api.ts). One function per endpoint; no crypto and no state
// (the flows, flows.ts, are what the pages drive).
//
// Rules:
//
// - No request unless accounts are on for this page (state.ts
//   `accountsEnabled`: the page may call the API and the flag `accounts`
//   is on). Otherwise the answer is `disabled` and nothing is sent.
// - Never rejects. Every call resolves to `{ ok: true, value }` or
//   `{ ok: false, code }`: one of the server's codes, or one of ours
//   (`disabled`, `offline`, `timeout`, `cancelled`, `bad_answer`).
// - Same-origin credentials: the session cookie `__Secure-wc_s`
//   (HttpOnly, path `/api/u`) is received from `/api/auth/*` and sent to
//   `/api/u/*` by the browser; the page never sees it. `X-WC: 1` on
//   everything that is not a GET (the server's CSRF rule; the browser adds
//   `Origin`).
// - What the server answers is checked before it is used: an answer that
//   is not the contract's is `bad_answer`, and only the contract's fields
//   are passed on. A session's label is cut to printable ASCII again; it
//   is still untrusted text, to be written as text and never as markup.
// - An error without one of the server's codes (the edge's own page, a
//   proxy) is read by its status: 404 `not_found`, 429 `rate_limited`,
//   5xx `unavailable`, anything else `bad_answer`. A bare 401 is never
//   taken for `unauthorized`: only the server's own word logs a device
//   out.

import {
  ACCOUNT_ERRORS,
  type Account,
  type AccountAnswer,
  type AccountError,
  type AccountLimits,
  type AccountPrefs,
  type AccountSession,
  type AccountUsage,
  type AuthParams,
  type DeleteAccountRequest,
  KDF_MAX_ROUNDS,
  KDF_MIN_ROUNDS,
  KDF_NAME,
  type Kdf,
  LOGIN_WINDOW_SECONDS,
  type LoginAnswer,
  type LoginRequest,
  NAME_PATTERN,
  OTHER_SESSIONS,
  type PasswordRequest,
  type PrefsAnswer,
  type PrefsRequest,
  type RecoverAnswer,
  type RecoverRequest,
  type RecoverSetRequest,
  type RecoveryRequest,
  type RegisterRequest,
  SALT_MAX_BYTES,
  SALT_MIN_BYTES,
  WRAP_MAX_BYTES,
  WRAP_MIN_BYTES,
} from '../../../shared/cloud/api.ts';
import { config } from '../config';
import { cleanLabel } from '../device-info';
import { accountsEnabled } from './state';

/** An account request gives up after this long (ms): registration waits for Turnstile's check on the server (5 s at most there). */
export const ACCOUNT_TIMEOUT_MS = 15_000;

/**
 * Why a call did not succeed: the server's code, or
 *
 *   disabled    accounts are off for this page (the flag, the dev server
 *               without an API, an automated browser); nothing was sent
 *   offline     the request did not reach the server (no network, DNS, a
 *               dropped connection)
 *   timeout     no answer within `ACCOUNT_TIMEOUT_MS`; a state-changing
 *               request may or may not have been carried out
 *   cancelled   the caller's signal fired
 *   bad_answer  the server answered something that is not the contract's
 */
export type ApiErrorCode = AccountError | 'disabled' | 'offline' | 'timeout' | 'cancelled' | 'bad_answer';

export interface ApiFailure {
  ok: false;
  code: ApiErrorCode;
  /** With `locked`: seconds until the name can be tried again. */
  retryAfter?: number;
  /** The HTTP status, when there was an answer. */
  status?: number;
}

export type ApiResult<T> = { ok: true; value: T } | ApiFailure;

/** The part of `fetch` the client uses (globalThis.fetch fits). */
export type AccountFetch = (url: string, init: RequestInit) => Promise<{ status: number; json(): Promise<unknown> }>;

export interface CallOptions {
  /** Cancels the request: `cancelled`. */
  signal?: AbortSignal;
}

export interface AccountApi {
  /** `GET /api/auth/params?name=`: the salt and KDF of a name (a stable fake for a name without an account). */
  params(name: string, o?: CallOptions): Promise<ApiResult<AuthParams>>;
  /** `POST /api/auth/register`. `name_taken`, `turnstile`, `rate_limited`. */
  register(body: RegisterRequest, o?: CallOptions): Promise<ApiResult<AccountAnswer>>;
  /** `POST /api/auth/login`. `invalid_login`, `turnstile_required`, `turnstile`, `locked`. */
  login(body: LoginRequest, o?: CallOptions): Promise<ApiResult<LoginAnswer>>;
  /** `POST /api/auth/recover`, first call. `invalid_recovery`, `turnstile`, `locked`. */
  recover(body: RecoverRequest, o?: CallOptions): Promise<ApiResult<RecoverAnswer>>;
  /** `POST /api/auth/recover`, second call (with the ticket). `invalid_recovery`, `locked`. */
  recoverSet(body: RecoverSetRequest, o?: CallOptions): Promise<ApiResult<AccountAnswer>>;
  /** `POST /api/u/auth/logout`. */
  logout(o?: CallOptions): Promise<ApiResult<null>>;
  /** `GET /api/u/account`: the account and its current password wrap. */
  account(o?: CallOptions): Promise<ApiResult<LoginAnswer>>;
  /** `POST /api/u/account/password`. `invalid_login`, `locked`. */
  password(body: PasswordRequest, o?: CallOptions): Promise<ApiResult<null>>;
  /** `POST /api/u/account/recovery`. `invalid_login`, `locked`. */
  recovery(body: RecoveryRequest, o?: CallOptions): Promise<ApiResult<null>>;
  /** `DELETE /api/u/account/sessions/<id>`; `OTHER_SESSIONS` ends all but this one. `not_found`: no such session (or the flag is off). */
  endSession(id: string, o?: CallOptions): Promise<ApiResult<null>>;
  /** `PATCH /api/u/account/prefs`. */
  setPrefs(body: PrefsRequest, o?: CallOptions): Promise<ApiResult<PrefsAnswer>>;
  /** `DELETE /api/u/account`. `invalid_login`, `locked`. */
  remove(body: DeleteAccountRequest, o?: CallOptions): Promise<ApiResult<null>>;
}

export interface AccountApiOptions {
  fetch?: AccountFetch;
  /** May a request be made (default `accountsEnabled`). */
  enabled?: () => Promise<boolean>;
  timeoutMs?: number;
}

// --- Reading an answer ---

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** True for base64url text (no padding) of `min`–`max` bytes. */
function isBytes(v: unknown, min: number, max: number): v is string {
  if (typeof v !== 'string' || v.length > Math.ceil((max * 4) / 3) || !BASE64URL.test(v) || v.length % 4 === 1) return false;
  const bytes = Math.floor((v.length * 3) / 4);
  return bytes >= min && bytes <= max;
}

const isWrap = (v: unknown): v is string => isBytes(v, WRAP_MIN_BYTES, WRAP_MAX_BYTES);

function kdfOf(v: unknown): Kdf | undefined {
  if (!isObject(v) || v.name !== KDF_NAME) return undefined;
  const rounds = v.rounds;
  return whole(rounds) && rounds >= KDF_MIN_ROUNDS && rounds <= KDF_MAX_ROUNDS ? { name: KDF_NAME, rounds } : undefined;
}

/** `AuthParams`, or undefined. The crypto module checks the same bounds again before it derives. */
export function parseParams(v: unknown): AuthParams | undefined {
  if (!isObject(v) || !isBytes(v.salt, SALT_MIN_BYTES, SALT_MAX_BYTES)) return undefined;
  const kdf = kdfOf(v.kdf);
  return kdf ? { salt: v.salt, kdf } : undefined;
}

const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const LIMIT_KEYS = ['items', 'itemBytes', 'itemMaxBytes', 'runBytes', 'runMaxBytes', 'payloadMaxBytes', 'sharedRuns'] as const;
const USAGE_KEYS = ['items', 'itemBytes', 'runBytes'] as const;

function numbersOf<K extends string>(v: unknown, keys: readonly K[]): Record<K, number> | undefined {
  if (!isObject(v) || !keys.every((k) => whole(v[k]))) return undefined;
  return Object.fromEntries(keys.map((k) => [k, v[k]])) as Record<K, number>;
}

function sessionOf(v: unknown): AccountSession | undefined {
  if (!isObject(v)) return undefined;
  const { id, label, created, lastUsed, current } = v;
  if (typeof id !== 'string' || !SESSION_ID.test(id) || typeof label !== 'string') return undefined;
  if (!whole(created) || !whole(lastUsed) || typeof current !== 'boolean') return undefined;
  return { id, label: cleanLabel(label), created, lastUsed, current };
}

function prefsOf(v: unknown): AccountPrefs | undefined {
  return isObject(v) && typeof v.galleryNotice === 'boolean' ? { galleryNotice: v.galleryNotice } : undefined;
}

/** `Account` with only the contract's fields, or undefined when `v` is not one. */
export function parseAccount(v: unknown): Account | undefined {
  if (!isObject(v)) return undefined;
  const { name, created, state } = v;
  if (typeof name !== 'string' || !NAME_PATTERN.test(name) || !whole(created)) return undefined;
  if (state !== 'active' && state !== 'suspended') return undefined;
  const usage: AccountUsage | undefined = numbersOf(v.usage, USAGE_KEYS);
  const limits: AccountLimits | undefined = numbersOf(v.limits, LIMIT_KEYS);
  const prefs = prefsOf(v.prefs);
  if (!usage || !limits || !prefs || !Array.isArray(v.sessions)) return undefined;
  const sessions: AccountSession[] = [];
  for (const s of v.sessions) {
    const session = sessionOf(s);
    if (!session) return undefined;
    sessions.push(session);
  }
  return { name, created, state, usage, limits, sessions, prefs };
}

function accountAnswer(v: unknown): AccountAnswer | undefined {
  const account = isObject(v) ? parseAccount(v.account) : undefined;
  return account ? { account } : undefined;
}

function loginAnswer(v: unknown): LoginAnswer | undefined {
  const a = accountAnswer(v);
  return a && isWrap((v as Record<string, unknown>).wrapPw) ? { account: a.account, wrapPw: (v as { wrapPw: string }).wrapPw } : undefined;
}

function recoverAnswer(v: unknown): RecoverAnswer | undefined {
  if (!isObject(v) || !isWrap(v.wrapRc)) return undefined;
  const ticket = v.ticket;
  return typeof ticket === 'string' && ticket.length > 0 && ticket.length <= 100 && BASE64URL.test(ticket) ? { wrapRc: v.wrapRc, ticket } : undefined;
}

function prefsAnswer(v: unknown): PrefsAnswer | undefined {
  const prefs = isObject(v) ? prefsOf(v.prefs) : undefined;
  return prefs ? { prefs } : undefined;
}

/** For an endpoint that answers 204: there is nothing to read. */
const nothing = (): null => null;

const fail = (code: ApiErrorCode, status?: number): ApiFailure => (status === undefined ? { ok: false, code } : { ok: false, code, status });

/** What an answer that is not 2xx means. */
export function failureOf(status: number, data: unknown): ApiFailure {
  const code = isObject(data) && typeof data.error === 'string' ? data.error : null;
  if (code !== null && (ACCOUNT_ERRORS as readonly string[]).includes(code)) {
    if (code === 'locked') {
      const after = (data as Record<string, unknown>).retryAfter;
      // A lock without a usable time is taken for the longest one.
      const retryAfter = whole(after) && after > 0 && after <= 86_400 ? after : LOGIN_WINDOW_SECONDS;
      return { ok: false, code, retryAfter, status };
    }
    return fail(code as AccountError, status);
  }
  if (status === 404) return fail('not_found', status);
  if (status === 429) return fail('rate_limited', status);
  if (status >= 500) return fail('unavailable', status);
  return fail('bad_answer', status);
}

// --- The client ---

export function createAccountApi(options: AccountApiOptions = {}): AccountApi {
  const enabled = options.enabled ?? accountsEnabled;
  const timeoutMs = options.timeoutMs ?? ACCOUNT_TIMEOUT_MS;

  async function call<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body: unknown,
    read: (data: unknown) => T | undefined,
    o: CallOptions = {},
  ): Promise<ApiResult<T>> {
    let on = false;
    try {
      on = await enabled();
    } catch {
      on = false;
    }
    if (!on) return fail('disabled');
    const fetchFn = options.fetch ?? (globalThis.fetch?.bind(globalThis) as AccountFetch | undefined);
    if (!fetchFn) return fail('offline');
    if (o.signal?.aborted) return fail('cancelled');

    const abort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, timeoutMs);
    const onAbort = (): void => abort.abort();
    o.signal?.addEventListener('abort', onAbort, { once: true });

    let status: number;
    let data: unknown;
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (method !== 'GET') headers['X-WC'] = '1';
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const answered = fetchFn(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: abort.signal,
      });
      // A fetch that does not honour the signal must not keep the page waiting either.
      const gaveUp = new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      gaveUp.catch(() => undefined);
      const res = await Promise.race([answered, gaveUp]);
      status = res.status;
      // 204 has no body; any other body that is not JSON is read as nothing.
      data = status === 204 ? undefined : await Promise.race([res.json().catch(() => undefined), gaveUp]);
    } catch {
      return fail(o.signal?.aborted ? 'cancelled' : timedOut ? 'timeout' : 'offline');
    } finally {
      clearTimeout(timer);
      o.signal?.removeEventListener('abort', onAbort);
    }
    if (typeof status !== 'number') return fail('bad_answer');
    if (status < 200 || status >= 300) return failureOf(status, data);
    const value = read(data);
    return value === undefined ? fail('bad_answer', status) : { ok: true, value };
  }

  return {
    params: (name, o) =>
      NAME_PATTERN.test(name) ? call('GET', `/api/auth/params?name=${encodeURIComponent(name)}`, undefined, parseParams, o) : Promise.resolve(fail('bad_request')),
    register: (body, o) => call('POST', '/api/auth/register', body, accountAnswer, o),
    login: (body, o) => call('POST', '/api/auth/login', body, loginAnswer, o),
    recover: (body, o) => call('POST', '/api/auth/recover', body, recoverAnswer, o),
    recoverSet: (body, o) => call('POST', '/api/auth/recover', body, accountAnswer, o),
    logout: (o) => call('POST', '/api/u/auth/logout', undefined, nothing, o),
    account: (o) => call('GET', '/api/u/account', undefined, loginAnswer, o),
    password: (body, o) => call('POST', '/api/u/account/password', body, nothing, o),
    recovery: (body, o) => call('POST', '/api/u/account/recovery', body, nothing, o),
    endSession: (id, o) =>
      id === OTHER_SESSIONS || SESSION_ID.test(id)
        ? call('DELETE', `/api/u/account/sessions/${encodeURIComponent(id)}`, undefined, nothing, o)
        : Promise.resolve(fail('bad_request')),
    setPrefs: (body, o) => call('PATCH', '/api/u/account/prefs', body, prefsAnswer, o),
    remove: (body, o) => call('DELETE', '/api/u/account', body, nothing, o),
  };
}

/** What the pages need of `/api/config` (fetched once per page load; no request when the API is not allowed). */
export interface AccountConfig {
  /** The Turnstile widget's site key, or null when the server has none (the pages then cannot register or recover). */
  turnstileSiteKey: string | null;
  /** The default limits of an account, or null when the server did not say. */
  limits: AccountLimits | null;
}

export async function accountConfig(): Promise<AccountConfig> {
  try {
    const c = await config();
    return { turnstileSiteKey: c.turnstileSiteKey ?? null, limits: c.limits ?? null };
  } catch {
    return { turnstileSiteKey: null, limits: null };
  }
}
