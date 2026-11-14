// The account's flows (stage 60, spec §7.2, ADR 0145 "As built (stage 60
// part B)"): what the pages drive. Each flow ties together the API client
// (api.ts), the key work (src/cloud/crypto, loaded with `import()` the
// first time a flow needs it), the device's store (store.ts) and the start
// page's hint (state.ts). index.ts has the guide for a page's author.
//
// Rules that hold for every flow:
//
// - **Never rejects.** A flow resolves to `{ ok: true, value }` or
//   `{ ok: false, code }` (`FlowErrorCode`).
// - **Working…** `onStep` tells the page where the flow is: `checking`
//   (asking the server what is needed), `deriving` (the password's slow
//   step, with `estimateMs` for the bar), `sending` (the request that
//   changes something), `saving` (the keys into the device's store).
// - **Cancel** with the `signal`. It stops the flow up to and including
//   `deriving` (the KDF worker is terminated) and answers `cancelled`.
//   From `sending` on a flow is not cancelled: a request that changes the
//   account is never left half-known on purpose.
// - **Secrets.** A password or recovery code is an argument and is not
//   kept beyond the derivation it is for; a flow object (`startLogin` …)
//   drops it as soon as the keys are derived, and `dispose()` drops
//   everything. The root key never leaves the crypto module, which wipes
//   it. Strings cannot be wiped in JavaScript: the references are dropped.
//   Nothing secret is logged or stored; the recovery code is returned once
//   and not kept.
// - **The KDF worker.** The slow step runs in the KDF worker. When the
//   worker fails (`worker_failed`: it could not start, died, or was
//   silent for two minutes) the derivation is run once more on the page's
//   own thread (`inline`; WebCrypto's PBKDF2 is asynchronous there too,
//   it is only not guaranteed to leave the thread free) and the page is
//   told with `onStep('deriving', { inline: true })`. A player is never
//   locked out of an account because a worker could not start. If that
//   fails as well the flow answers `worker_failed`.
// - **401 `unauthorized`** from `/api/u/*` means the session is gone
//   (ended from another device, the password changed, the account
//   deleted): the device is logged out locally (the keys and the record
//   removed, the name kept for the Log in page) and the flow answers
//   `unauthorized`. Only while the device's record is still the one the
//   request started with: a 401 that comes back after another tab has
//   logged in again answers `login_changed` and removes nothing.
// - **The device's record is the truth, the hint is not.** Every logged-in
//   flow reads the record in IndexedDB. Keys without a hint (localStorage
//   was cleared, or cannot be written) put the hint back; a hint without
//   keys is cleared; a store that cannot be read ends the flow with
//   `storage_unreadable` and logs nobody out.
// - **The session must be the stored account's.** `GET /api/u/account`
//   is asked before anything that changes the account, and its name is
//   compared with the record's (as the server compares names). Another
//   account's session is ended, the device logged out, and the flow
//   answers `wrong_account`.
// - **A lost answer** (`lostAnswer`): `timeout`, `offline` or `bad_answer`
//   after `sending` means the request left and its answer did not come.
//   The change may have been made; a page says so.
// - **Nothing of the player's own data** (profiles, scripts, runs,
//   settings) is read or touched by anything here.

import {
  type Account,
  type AccountPrefs,
  type AuthParams,
  DEFAULT_KDF,
  type LoginAnswer,
  OTHER_SESSIONS,
  type PrefsRequest,
} from '../../../shared/cloud/api.ts';
import type { AccountKeys, PasswordKdf, PasswordSet, RegisterKeys } from '../crypto';
import { deviceLabel } from '../device-info';
import { type AccountApi, type ApiErrorCode, type ApiFailure, type ApiResult, createAccountApi } from './api';
import { checkName, checkPassword } from './checks';
import { estimateKdfMs, noteKdfMs } from './kdf-time';
import { accountState, accountsEnabled, noteLoggedIn, noteLoggedOut } from './state';
import { type AccountStore, type StoredAccount, createAccountStore } from './store';

type CryptoModule = typeof import('../crypto');

/**
 * Why a flow did not succeed: one of the API client's codes
 * (`ApiErrorCode`: the server's, and `disabled`, `offline`, `timeout`,
 * `cancelled`, `bad_answer`), or
 *
 *   worker_failed  the password could not be derived, in the worker or on
 *                  the page's thread
 *   corrupt_wrap   the server accepted the password (or the recovery
 *                  code), but the wrapped key it handed back does not open
 *                  with it: the account's key material on the server is
 *                  damaged or not this account's. NOT a typing mistake;
 *                  typing the password again will not help
 *   update_needed  the wrapped key was written by a newer client
 *   storage_failed this device cannot keep the keys (no IndexedDB, a
 *                  private window that refuses them)
 *   not_logged_in  the flow needs an account on this device and there is
 *                  none
 *   storage_unreadable  the device's key store could not be read just now;
 *                  nobody was logged out
 *   wrong_account  the session the server knows this browser by is another
 *                  account's than the one stored here; that session was
 *                  ended and the device logged out
 *   login_changed  another tab logged in (again) on this device while the
 *                  flow ran; this flow's last request changed nothing
 *   bad_input      an argument is not usable (a name that is not a user
 *                  name, a new password under the minimum, a recovery
 *                  code that is not one); the page's checks (checks.ts)
 *                  should have caught it
 *   busy           this flow object is already working
 *   finished       this flow object has ended (it succeeded, or its
 *                  password or code was refused); start a new one
 *   failed         something unexpected; nothing is known about the outcome
 */
export type FlowErrorCode =
  | ApiErrorCode
  | 'worker_failed'
  | 'corrupt_wrap'
  | 'update_needed'
  | 'storage_failed'
  | 'not_logged_in'
  | 'storage_unreadable'
  | 'wrong_account'
  | 'login_changed'
  | 'bad_input'
  | 'busy'
  | 'finished'
  | 'failed';

export interface FlowFailure {
  ok: false;
  code: FlowErrorCode;
  /** With `locked`: seconds until the name can be tried again. */
  retryAfter?: number;
}

export type FlowResult<T> = { ok: true; value: T } | FlowFailure;

/**
 * The one rule for "the request left, the answer did not come": a flow
 * that had reached `sending` and ended with one of these may have made its
 * change on the server all the same (the connection dropped after the
 * request, no answer in time, an answer that could not be read).
 */
export function lostAnswer(code: FlowErrorCode): boolean {
  return code === 'timeout' || code === 'offline' || code === 'bad_answer';
}

export type FlowStep = 'checking' | 'deriving' | 'sending' | 'saving';

export interface StepInfo {
  /** With `deriving`: about how long it will take on this device (ms). */
  estimateMs?: number;
  /** With `deriving`: the worker failed and the derivation now runs on the page's thread. */
  inline?: boolean;
}

export interface RunOptions {
  onStep?: (step: FlowStep, info: StepInfo) => void;
  /** Cancels the flow before it sends anything that changes the account. */
  signal?: AbortSignal;
}

export interface SubmitOptions extends RunOptions {
  /** A Turnstile token, used once. */
  turnstile?: string;
}

/** A flow that may be submitted more than once (a Turnstile token later, a retry after a network failure). */
export interface FlowHandle<T> {
  /** Runs the flow, or what is left of it. Never rejects. */
  submit(o?: SubmitOptions): Promise<FlowResult<T>>;
  /** True when the next `submit` needs a Turnstile token (`turnstile_required` otherwise). */
  readonly needsTurnstile: boolean;
  /** True once the flow has ended: `submit` then answers `finished`. */
  readonly finished: boolean;
  /** Ends the flow and drops everything it holds. */
  dispose(): void;
}

export interface RegisterDone {
  account: Account;
  /** The recovery code, canonical (`XXXX-XXXX-…`): shown once by the page; kept nowhere else. */
  recoveryCode: string;
  /**
   * False when the account was made but this device could not keep its
   * keys: nobody is logged in here (the session was ended again). The
   * page must still show the recovery code, and then send the player to
   * Log in.
   */
  stored: boolean;
}

export interface LogoutDone {
  /**
   * `ended`: the server ended the session (or no longer knew it).
   * `unreached`: the server could not be asked; the session stays valid
   * on the server until it runs out or is ended from another device, and
   * the page should say so.
   */
  server: 'ended' | 'unreached';
  /** False when the device's key store could not be deleted (it is unusable all the same once the session is gone). */
  keysRemoved: boolean;
}

export interface FlowDeps {
  api: AccountApi;
  store: AccountStore;
  /** The crypto module, loaded on first use. */
  crypto: () => Promise<CryptoModule>;
  /** The password KDF (default: the crypto module's worker KDF). */
  derive?: PasswordKdf;
  /** May account requests be made (asked before a derivation is spent). */
  enabled: () => Promise<boolean>;
  /** This device's session label. */
  label: () => string;
  now: () => number;
}

export interface AccountFlows {
  startRegister(name: string, password: string): FlowHandle<RegisterDone>;
  startLogin(name: string, password: string): FlowHandle<Account>;
  startRecover(name: string, recoveryCode: string, newPassword: string): FlowHandle<Account>;
  logout(o?: RunOptions): Promise<FlowResult<LogoutDone>>;
  loadAccount(o?: RunOptions): Promise<FlowResult<Account>>;
  changePassword(oldPassword: string, newPassword: string, o?: RunOptions): Promise<FlowResult<null>>;
  newRecoveryCode(password: string, o?: RunOptions): Promise<FlowResult<{ recoveryCode: string }>>;
  endSession(id: string, o?: RunOptions): Promise<FlowResult<null>>;
  endOtherSessions(o?: RunOptions): Promise<FlowResult<null>>;
  deleteAccount(password: string, o?: RunOptions): Promise<FlowResult<null>>;
  setPrefs(prefs: PrefsRequest, o?: RunOptions): Promise<FlowResult<AccountPrefs>>;
  storedAccount(): Promise<StoredAccount | null>;
  accountKeys(): Promise<AccountKeys | null>;
}

/** Leaves a flow with a failure. */
class Stop {
  readonly failure: FlowFailure;
  constructor(code: FlowErrorCode, retryAfter?: number) {
    this.failure = retryAfter === undefined ? { ok: false, code } : { ok: false, code, retryAfter };
  }
}

const stopOf = (f: ApiFailure): Stop => new Stop(f.code, f.retryAfter);

/** The value of an API answer, or the flow ends with its failure. */
function need<T>(r: ApiResult<T>): T {
  if (!r.ok) throw stopOf(r);
  return r.value;
}

/** A `CloudCryptoError`'s code (by shape: the module may not be loaded where this is asked). */
function cryptoCode(e: unknown): string | null {
  if (!(e instanceof Error) || e.name !== 'CloudCryptoError') return null;
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** What a thrown error means when no step said otherwise. */
function failureOf(e: unknown): FlowFailure {
  if (e instanceof Stop) return e.failure;
  switch (cryptoCode(e)) {
    case 'cancelled':
      return { ok: false, code: 'cancelled' };
    case 'worker_failed':
      return { ok: false, code: 'worker_failed' };
    case 'bad_input':
      return { ok: false, code: 'bad_input' };
    case 'unknown_version':
      return { ok: false, code: 'update_needed' };
    // The server's parameters or values were not what this client reads.
    case 'bad_kdf':
    case 'malformed':
      return { ok: false, code: 'bad_answer' };
    case 'wrong_password':
    case 'wrong_code':
    case 'auth':
      return { ok: false, code: 'corrupt_wrap' };
    default:
      return { ok: false, code: 'failed' };
  }
}

/**
 * An unwrap that failed after the server accepted the key that goes with
 * it: never a typing mistake. Null when `e` is not an unwrap's failure.
 */
function unwrapFailure(e: unknown): Stop | null {
  switch (cryptoCode(e)) {
    case 'unknown_version':
      return new Stop('update_needed');
    case 'wrong_password':
    case 'wrong_code':
    case 'auth':
    case 'malformed':
      return new Stop('corrupt_wrap');
    default:
      return null;
  }
}

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const elapsed = (): number => globalThis.performance?.now?.() ?? Date.now();

export function defaultFlowDeps(): FlowDeps {
  return {
    api: createAccountApi(),
    store: createAccountStore(),
    crypto: () => import('../crypto'),
    enabled: accountsEnabled,
    label: () => deviceLabel(globalThis.navigator?.userAgent ?? ''),
    now: () => Date.now(),
  };
}

export function createAccountFlows(deps: FlowDeps = defaultFlowDeps()): AccountFlows {
  const { api, store } = deps;

  async function run<T>(body: () => Promise<T>): Promise<FlowResult<T>> {
    try {
      return { ok: true, value: await body() };
    } catch (e) {
      return failureOf(e);
    }
  }

  /** The KDF of a flow: timed, and run on the page's thread once when the worker fails. */
  function deriver(o: RunOptions): PasswordKdf {
    return async (name, password, salt, kdf, ko) => {
      const base = deps.derive ?? (await cryptoModule()).derivePasswordKeys;
      const t0 = elapsed();
      try {
        const keys = await base(name, password, salt, kdf, ko);
        noteKdfMs(elapsed() - t0, kdf.rounds);
        return keys;
      } catch (e) {
        if (cryptoCode(e) !== 'worker_failed') throw e;
        step(o, 'deriving', { estimateMs: estimateKdfMs(kdf.rounds), inline: true });
        try {
          return await base(name, password, salt, kdf, { ...ko, inline: true });
        } catch (again) {
          // Whatever went wrong the second time, the answer is that the password could not be derived.
          throw cryptoCode(again) === 'cancelled' ? again : new Stop('worker_failed');
        }
      }
    };
  }

  /** The crypto module. When its code cannot be fetched (no network, a release since the page loaded) the flow ends with `offline`. */
  async function cryptoModule(): Promise<CryptoModule> {
    try {
      return await deps.crypto();
    } catch {
      throw new Stop('offline');
    }
  }

  /** Tells the page where the flow is. A page's handler that throws does not end the flow. */
  const step = (o: RunOptions, at: FlowStep, info: StepInfo = {}): void => {
    try {
      o.onStep?.(at, info);
    } catch {
      /* the page's problem */
    }
  };

  const cancelledIf = (o: RunOptions): void => {
    if (o.signal?.aborted) throw new Stop('cancelled');
  };

  /** Before a derivation is spent: accounts are on, and the device can keep keys. */
  async function ready(): Promise<void> {
    if (!(await deps.enabled())) throw new Stop('disabled');
    if (!(await store.works())) throw new Stop('storage_failed');
  }

  /**
   * Stores the account and its keys and tells the start page. False when
   * the device could not keep them. (Where localStorage takes no hint the
   * state keeps the name in memory: the keys are what counts.)
   */
  async function keep(account: Account, keys: AccountKeys): Promise<boolean> {
    try {
      await store.write({ name: account.name, created: account.created, label: deps.label(), savedAt: deps.now(), dataKey: keys.dataKey, idKey: keys.idKey });
    } catch {
      return false;
    }
    noteLoggedIn(account.name);
    return true;
  }

  /** Logs the device out locally: the keys and the record removed, the hint cleared. */
  async function forget(o: { forgetName?: boolean } = {}): Promise<boolean> {
    const removed = await store.remove();
    noteLoggedOut(o);
    return removed;
  }

  /** The device's record. A store that cannot be read ends the flow: it is not "nobody is logged in". */
  async function record(): Promise<StoredAccount | null> {
    try {
      return await store.read();
    } catch {
      throw new Stop('storage_unreadable');
    }
  }

  /**
   * The account of this device, or null. The record is the truth: keys
   * without a hint put the hint back, a hint without keys is cleared.
   * (Nothing is deleted here: another tab may be storing a login right now.)
   */
  async function storedAccount(): Promise<StoredAccount | null> {
    const me = await record();
    const hint = accountState().name;
    if (!me) {
      if (hint !== null) noteLoggedOut();
      return null;
    }
    if (me.name !== hint) noteLoggedIn(me.name);
    return me;
  }

  async function signedIn(): Promise<StoredAccount> {
    const me = await storedAccount();
    if (!me) throw new Stop('not_logged_in');
    return me;
  }

  /**
   * Before the local login is removed on the server's word: is the
   * device's record still `me`, the one the request was made for? False:
   * it is gone already. Another login in its place ends the flow with
   * `login_changed` (the answer in hand is about a login that is no more).
   */
  async function stillMine(me: StoredAccount): Promise<boolean> {
    const now = await record();
    if (!now) {
      if (accountState().name !== null) noteLoggedOut();
      return false;
    }
    if (now.savedAt !== me.savedAt || now.name !== me.name) throw new Stop('login_changed');
    return true;
  }

  /** An answer from `/api/u/*` for `me`: `unauthorized` logs the device out locally, while its login is still that one. */
  async function authed<T>(me: StoredAccount, answer: Promise<ApiResult<T>>): Promise<ApiResult<T>> {
    const r = await answer;
    if (!r.ok && r.code === 'unauthorized' && (await stillMine(me))) await forget();
    return r;
  }

  /**
   * `GET /api/u/account` for `me`. The session must be the stored
   * account's: when the cookie is another account's (two tabs that logged
   * in to different accounts at once, a cookie set from elsewhere) that
   * session is ended and the device logged out.
   */
  async function myAccount(me: StoredAccount, o: RunOptions): Promise<LoginAnswer> {
    const a = need(await authed(me, api.account({ signal: o.signal })));
    if (sameName(a.account.name, me.name)) return a;
    if (await stillMine(me)) {
      await api.logout();
      await forget();
    }
    throw new Stop('wrong_account');
  }

  /** A sign-in answer's account must be the one that was asked for. Ends the new session otherwise. */
  async function checkedAccount(account: Account, name: string): Promise<Account> {
    if (sameName(account.name, name)) return account;
    await api.logout();
    throw new Stop('bad_answer');
  }

  /** The common frame of the three flow objects: one submit at a time, `finished`, `dispose`. */
  function handle<T>(needsTurnstile: () => boolean, body: (o: SubmitOptions, end: () => void) => Promise<T>, drop: () => void): FlowHandle<T> {
    let busy = false;
    let finished = false;
    const end = (): void => {
      finished = true;
      drop();
    };
    return {
      get needsTurnstile() {
        return !finished && needsTurnstile();
      },
      get finished() {
        return finished;
      },
      dispose: end,
      async submit(o: SubmitOptions = {}) {
        if (finished) return { ok: false, code: 'finished' };
        if (busy) return { ok: false, code: 'busy' };
        busy = true;
        try {
          return await run(() => body(o, end));
        } finally {
          busy = false;
        }
      },
    };
  }

  // --- Register ---

  function startRegister(name: string, password: string): FlowHandle<RegisterDone> {
    let pw: string | null = password;
    let prepared: { request: RegisterKeys; recoveryCode: string; keys: AccountKeys } | null = null;
    // An earlier submit may have reached the server without its answer reaching us.
    let unsure = false;
    // The login that asks "is the taken name ours" was told `turnstile_required`.
    let loginWantsToken = false;
    return handle(
      () => true,
      async (o, end) => {
        if (!o.turnstile) throw new Stop('turnstile_required');
        if (!prepared) {
          if (pw === null || checkName(name) !== null || checkPassword(pw) !== null) throw new Stop('bad_input');
          await ready();
          cancelledIf(o);
          step(o, 'deriving', { estimateMs: estimateKdfMs(DEFAULT_KDF.rounds) });
          const c = await cryptoModule();
          prepared = await c.prepareRegistration(name, pw, { derive: deriver(o), signal: o.signal });
          pw = null;
        }
        // A local: `dispose()` during a submit must not pull the ground from under it.
        const made = prepared;
        cancelledIf(o);
        step(o, 'sending');
        const label = deps.label();
        let account: Account | null = null;
        // The earlier try may have made the account. Its password key
        // tells: it opens a session only if the account is this flow's.
        const mine = (turnstile?: string): Promise<ApiResult<LoginAnswer>> =>
          api.login({ name, authKey: made.request.authKey, label, ...(turnstile ? { turnstile } : {}) });
        let failure: ApiFailure | null = null;
        if (unsure && loginWantsToken) {
          // The server wants a check before any login to this name: this submit's token goes to the question "is it ours".
          const l = await mine(o.turnstile);
          if (l.ok) account = l.value.account;
          else failure = l.code === 'invalid_login' ? { ok: false, code: 'name_taken' } : l;
        } else {
          const r = await api.register({ name, ...made.request, label, turnstile: o.turnstile });
          if (r.ok) account = r.value.account;
          else if (r.code === 'name_taken' && unsure) {
            const l = await mine();
            if (l.ok) account = l.value.account;
            else if (l.code !== 'invalid_login') {
              // Not known yet whose the name is: the flow stays, and the login's own failure is the answer.
              if (l.code === 'turnstile_required') loginWantsToken = true;
              failure = l;
            } else failure = r;
          } else {
            unsure = unsure || lostAnswer(r.code);
            failure = r;
          }
        }
        if (!account) {
          const f = failure as ApiFailure;
          // Somebody else's (or a reserved) name: this flow's keys are of no more use.
          if (f.code === 'name_taken') end();
          throw stopOf(f);
        }
        try {
          account = await checkedAccount(account, name);
        } catch (e) {
          // A 2xx came: the account may well exist, whatever was wrong with the answer.
          unsure = true;
          throw e;
        }
        step(o, 'saving');
        const stored = await keep(account, made.keys);
        if (!stored) await api.logout();
        end();
        return { account, recoveryCode: made.recoveryCode, stored };
      },
      () => {
        pw = null;
        prepared = null;
      },
    );
  }

  // --- Log in ---

  function startLogin(name: string, password: string): FlowHandle<Account> {
    let pw: string | null = password;
    // Kept between submits: a retry with a Turnstile token does not derive again.
    let derived: { authKey: string; kek: CryptoKey } | null = null;
    let wantsTurnstile = false;
    return handle(
      () => wantsTurnstile,
      async (o, end) => {
        if (!derived) {
          if (pw === null || checkName(name) !== null || pw.length === 0) throw new Stop('bad_input');
          await ready();
          step(o, 'checking');
          const params: AuthParams = need(await api.params(name, { signal: o.signal }));
          step(o, 'deriving', { estimateMs: estimateKdfMs(params.kdf.rounds) });
          const c = await cryptoModule();
          derived = await c.derivePasswordLogin(name, pw, params, { derive: deriver(o), signal: o.signal });
          pw = null;
        }
        const { authKey, kek } = derived;
        cancelledIf(o);
        step(o, 'sending');
        const r = await api.login({ name, authKey, label: deps.label(), ...(o.turnstile ? { turnstile: o.turnstile } : {}) });
        if (!r.ok) {
          // From now on the server wants a token with every try (a token works once: a new one each time).
          if (r.code === 'turnstile_required') wantsTurnstile = true;
          // The password is not the name's: this flow's key is of no more use.
          else if (r.code === 'invalid_login') end();
          throw stopOf(r);
        }
        step(o, 'saving');
        let keys: AccountKeys;
        try {
          const account = await checkedAccount(r.value.account, name);
          const c = await cryptoModule();
          keys = await c.unlockWithPassword(account.name, kek, r.value.wrapPw);
        } catch (e) {
          end();
          if (e instanceof Stop) throw e;
          // The server took the password and made a session, but its wrap does not open: no keys, so no login.
          await api.logout();
          throw unwrapFailure(e) ?? e;
        }
        const stored = await keep(r.value.account, keys);
        end();
        if (!stored) {
          await api.logout();
          throw new Stop('storage_failed');
        }
        return r.value.account;
      },
      () => {
        pw = null;
        derived = null;
      },
    );
  }

  // --- Recover ---

  function startRecover(name: string, recoveryCode: string, newPassword: string): FlowHandle<Account> {
    let code: string | null = recoveryCode;
    let pw: string | null = newPassword;
    let recoveryAuth: string | null = null;
    // After the first call and the derivation: what the second call sends, and the keys it will leave us with.
    let second: { ticket: string; set: PasswordSet; keys: AccountKeys } | null = null;
    return handle(
      () => second === null,
      async (o, end) => {
        if (!second) {
          if (code === null || pw === null || checkName(name) !== null || checkPassword(pw) !== null) throw new Stop('bad_input');
          if (!o.turnstile) throw new Stop('turnstile_required');
          await ready();
          cancelledIf(o);
          const c = await cryptoModule();
          const rk = await c.deriveRecoveryLogin(name, code);
          recoveryAuth = rk.recoveryAuth;
          step(o, 'checking');
          const first = await api.recover({ name, recoveryAuth, turnstile: o.turnstile });
          if (!first.ok) {
            if (first.code === 'invalid_recovery') end();
            throw stopOf(first);
          }
          step(o, 'deriving', { estimateMs: estimateKdfMs(DEFAULT_KDF.rounds) });
          try {
            const { set, keys } = await c.recoverAccount(name, rk.recoveryKek, first.value.wrapRc, pw, { derive: deriver(o), signal: o.signal });
            second = { ticket: first.value.ticket, set, keys };
          } catch (e) {
            const broken = unwrapFailure(e);
            if (!broken) throw e;
            // The server accepted the code, but its wrap does not open with it.
            end();
            throw broken;
          }
          pw = null;
          code = null;
        }
        if (recoveryAuth === null) throw new Stop('failed');
        const { ticket, set, keys } = second;
        step(o, 'sending');
        const r = await api.recoverSet({ name, recoveryAuth, ticket, set, label: deps.label() });
        if (!r.ok) {
          // The ticket ran out (15 minutes) or the code was replaced meanwhile: the flow cannot go on.
          if (r.code === 'invalid_recovery') end();
          throw stopOf(r);
        }
        let account: Account;
        try {
          account = await checkedAccount(r.value.account, name);
        } finally {
          end();
        }
        step(o, 'saving');
        if (!(await keep(account, keys))) {
          await api.logout();
          throw new Stop('storage_failed');
        }
        return account;
      },
      () => {
        code = null;
        pw = null;
        recoveryAuth = null;
        second = null;
      },
    );
  }

  // --- Logged in ---

  /**
   * The password asked for again: the account of this device (checked
   * against the session's), its parameters, its current password wrap
   * (the root is not kept on the device) and the password's keys.
   */
  async function passwordKeys(
    password: string,
    o: RunOptions,
    extraMs: number,
  ): Promise<{ me: StoredAccount; authKey: string; kek: CryptoKey; wrapPw: string; c: CryptoModule }> {
    if (password.length === 0) throw new Stop('bad_input');
    const me = await signedIn();
    step(o, 'checking');
    const { wrapPw } = await myAccount(me, o);
    const params = need(await api.params(me.name, { signal: o.signal }));
    step(o, 'deriving', { estimateMs: estimateKdfMs(params.kdf.rounds) + extraMs });
    const c = await cryptoModule();
    const { authKey, kek } = await c.derivePasswordLogin(me.name, password, params, { derive: deriver(o), signal: o.signal });
    return { me, authKey, kek, wrapPw, c };
  }

  /**
   * The password's key did not open the account's wrap before the server
   * was asked anything: the password typed is not the account's. The same
   * answer as the server's for a wrong password.
   */
  function wrongPassword(e: unknown): unknown {
    return cryptoCode(e) === 'wrong_password' ? new Stop('invalid_login') : e;
  }

  const logout = (o: RunOptions = {}): Promise<FlowResult<LogoutDone>> =>
    run(async () => {
      step(o, 'sending');
      const r = await api.logout();
      const keysRemoved = await forget();
      // `unauthorized`: the server no longer knew the session, which is what was asked for.
      const server = r.ok || r.code === 'unauthorized' ? 'ended' : 'unreached';
      return { server, keysRemoved };
    });

  const loadAccount = (o: RunOptions = {}): Promise<FlowResult<Account>> =>
    run(async () => {
      const me = await signedIn();
      step(o, 'checking');
      return (await myAccount(me, o)).account;
    });

  const changePassword = (oldPassword: string, newPassword: string, o: RunOptions = {}): Promise<FlowResult<null>> =>
    run(async () => {
      if (checkPassword(newPassword) !== null) throw new Stop('bad_input');
      const { me, authKey, kek, wrapPw, c } = await passwordKeys(oldPassword, o, estimateKdfMs(DEFAULT_KDF.rounds));
      let set: PasswordSet;
      try {
        ({ set } = await c.changePassword(me.name, kek, wrapPw, newPassword, { derive: deriver(o), signal: o.signal }));
      } catch (e) {
        throw wrongPassword(e);
      }
      cancelledIf(o);
      step(o, 'sending');
      need(await authed(me, api.password({ authKey, set })));
      return null;
    });

  const newRecoveryCode = (password: string, o: RunOptions = {}): Promise<FlowResult<{ recoveryCode: string }>> =>
    run(async () => {
      const { me, authKey, kek, wrapPw, c } = await passwordKeys(password, o, 0);
      let made: { recoveryCode: string; recoveryAuth: string; wrapRc: string };
      try {
        made = await c.newRecoveryCode(me.name, kek, wrapPw);
      } catch (e) {
        throw wrongPassword(e);
      }
      cancelledIf(o);
      step(o, 'sending');
      need(await authed(me, api.recovery({ authKey, recoveryAuth: made.recoveryAuth, wrapRc: made.wrapRc })));
      return { recoveryCode: made.recoveryCode };
    });

  const endSessionOf = (id: string, o: RunOptions): Promise<FlowResult<null>> =>
    run(async () => {
      const me = await signedIn();
      step(o, 'sending');
      const r = await authed(me, api.endSession(id));
      // No such session: it was ended meanwhile, which is what was asked for. Only for one session's id:
      // "all others" has no id that can be gone, so a 404 there is the service saying no (accounts switched off).
      if (!r.ok && !(r.code === 'not_found' && id !== OTHER_SESSIONS)) throw stopOf(r);
      return null;
    });

  const deleteAccount = (password: string, o: RunOptions = {}): Promise<FlowResult<null>> =>
    run(async () => {
      const { me, authKey } = await passwordKeys(password, o, 0);
      cancelledIf(o);
      step(o, 'sending');
      need(await authed(me, api.remove({ authKey })));
      // The name is reserved for good: nothing to prefill.
      await forget({ forgetName: true });
      return null;
    });

  const setPrefs = (prefs: PrefsRequest, o: RunOptions = {}): Promise<FlowResult<AccountPrefs>> =>
    run(async () => {
      const me = await signedIn();
      step(o, 'sending');
      return need(await authed(me, api.setPrefs({ galleryNotice: prefs.galleryNotice }))).prefs;
    });

  return {
    startRegister,
    startLogin,
    startRecover,
    logout,
    loadAccount,
    changePassword,
    newRecoveryCode,
    endSession: (id, o = {}) => endSessionOf(id, o),
    endOtherSessions: (o = {}) => endSessionOf(OTHER_SESSIONS, o),
    deleteAccount,
    setPrefs,
    storedAccount: async () => {
      try {
        return await storedAccount();
      } catch {
        return null;
      }
    },
    accountKeys: async () => {
      try {
        const me = await storedAccount();
        return me ? { dataKey: me.dataKey, idKey: me.idKey } : null;
      } catch {
        return null;
      }
    },
  };
}
