// The account on the client (stage 60, spec §7.2, ADR 0145 "As built
// (stage 60 part B, the client core)"). No pages here: this is what the
// pages are built on. THIS COMMENT IS THE GUIDE FOR WHOEVER BUILDS THEM.
//
// ── Two ways in ──────────────────────────────────────────────────────────
//
//   './state'   THE START PAGE imports this file and only this file,
//               statically. It is tiny and pulls in no crypto, no
//               IndexedDB and no API client.
//   './index'   (this file) THE ACCOUNT PAGES. Load it with `import()`
//               when an account page is opened; never import it
//               statically from anything on the start-up or game path
//               (spec §7.0 rules 1–2). It carries the API client, the
//               flows, the device's store and the checks. The heavy
//               crypto (src/cloud/crypto and its KDF worker) is loaded by
//               the flows themselves the first time one needs it.
//
// ── The start page (from './state') ──────────────────────────────────────
//
//   watchAccountState(): Promise<AccountState>
//       Call once, on idle time. Asks for the flag and listens for other
//       tabs. Resolves when `enabled` is known. Never rejects.
//   accountState(): AccountState          { enabled, name, lastName }
//       Synchronous. `enabled` null = not known yet, false = show NOTHING
//       of accounts, true = show the entry. `name` = who is logged in on
//       this device (as the server spells it) or null. `lastName` = the
//       Log in page's prefill.
//   onAccountState(fn): () => void
//       `fn(state)` on every change (this tab's flows, another tab, the
//       flag arriving). Returns the unsubscribe function.
//   accountsEnabled(): Promise<boolean>
//
//   `name` is a hint (localStorage): the session may be gone on the
//   server. The Account page finds out with `loadAccount()`. Inside this
//   chunk the device's record (IndexedDB) is the truth, not the hint:
//   `storedAccount()` and every logged-in flow read the record and put a
//   missing hint back (localStorage cleared) or clear a hint without keys.
//   Where localStorage cannot be written the name is kept in memory, so
//   the start page's row still follows; after a reload the row says "Log
//   in", and the Log in page finds the keys and goes to the Account page.
//
// ── Results ──────────────────────────────────────────────────────────────
//
//   Every flow resolves (never rejects) to
//       { ok: true, value }  |  { ok: false, code, retryAfter? }
//   and takes `{ onStep, signal }`:
//       onStep(step, info)   'checking' | 'deriving' | 'sending' | 'saving'
//                            With 'deriving', `info.estimateMs` is about
//                            how long the slow step will take on this
//                            device (for the Working… bar; it can arrive a
//                            second time with `info.inline` when the KDF
//                            worker failed and the page's thread does it).
//       signal               an AbortSignal: cancels up to and including
//                            'deriving' (→ `cancelled`). From 'sending' on
//                            nothing is cancelled.
//
//   A LOST ANSWER: `lostAnswer(code)` is true for `timeout`, `offline` and
//   `bad_answer`. When the flow had reached 'sending', the request left
//   and its answer did not come: the change MAY have been made. Say "may
//   or may not", never "the server was not reached" (the pages:
//   `work.doubtful(code)`, working.tsx).
//
//   A PAGE MUST NOT LEAVE WHILE ITS FLOW WORKS: Back and Esc are Cancel
//   then, and from 'sending' on nothing (`work.orCancel(back)`).
//
// ── Before logging in: three flow objects ────────────────────────────────
//
//   Each `start…` returns a `FlowHandle<T>`:
//       submit({ turnstile?, onStep?, signal? }): Promise<FlowResult<T>>
//       needsTurnstile: boolean   the next submit needs a token
//       finished: boolean         it is over; submit answers `finished`
//       dispose()                 drop everything (leave the page: call it)
//   A handle keeps what was already derived, so submitting again (with a
//   Turnstile token, after `offline`, after `locked` ran out) does not
//   run the slow step again. A Turnstile token works once: get a new one
//   from the widget for every submit that needs one. Make a new handle
//   when the player changes the name, the password or the code.
//
//   startRegister(name, password): FlowHandle<RegisterDone>
//       submit needs `turnstile` every time. Value: { account,
//       recoveryCode, stored }. SHOW `recoveryCode` ONCE (it is kept
//       nowhere; `lastGroupMatches(code, typed)` checks the "type the last
//       group" confirmation). `stored: false` = the account exists but
//       this device could not keep the keys: show the code, then send the
//       player to Log in.
//       Codes: name_taken (the handle is finished), turnstile, rate_limited
//       (3 registrations an hour, 10 a day per address, or too many
//       requests), storage_failed, plus the general ones below.
//       After a lost answer KEEP THE HANDLE and submit again: the retry
//       finds the account its first try made (it asks with its own
//       password key) and returns the same recovery code. While it cannot
//       tell yet whose the name is, it answers the failure of that
//       question (`offline`, `timeout`, `locked`, `turnstile_required`:
//       submit again with a new token) and stays usable; `name_taken`
//       only when the name is somebody else's. A new handle (the player
//       changed the name or the password) cannot find it: say then that
//       the account may have been made and to try logging in.
//   startLogin(name, password): FlowHandle<Account>
//       First submit without a token. `turnstile_required` → show the
//       widget, submit again with the token (no second derivation), and
//       from then on every submit needs one (`needsTurnstile`).
//       Codes: invalid_login (wrong name or password, one message for
//       both; the handle is finished), turnstile_required, turnstile (the
//       token was refused: a new one), locked (+ retryAfter seconds; the
//       same handle can be submitted when it has run out), corrupt_wrap,
//       update_needed, storage_failed, plus the general ones.
//   startRecover(name, recoveryCode, newPassword): FlowHandle<Account>
//       The first submit needs `turnstile`. It makes both calls of the
//       recovery; if the second fails (`offline`, `timeout`,
//       `unavailable`) submit again without a token (`needsTurnstile` is
//       then false; the ticket is good for 15 minutes). Every older
//       session is ended; the recovery code stays valid.
//       Codes: invalid_recovery (wrong name or code, or the ticket ran
//       out; the handle is finished), turnstile, locked (+ retryAfter),
//       corrupt_wrap, update_needed, storage_failed, plus the general ones.
//
// ── Logged in ────────────────────────────────────────────────────────────
//
//   loadAccount(o?): FlowResult<Account>
//       `GET /api/u/account`: name, created, state, usage, limits,
//       sessions (id, label, created, lastUsed, current), prefs. Call it
//       when the Account page opens. A session's `label` is untrusted
//       text: write it with textContent, never as markup. The account
//       must be the stored one (`wrong_account` otherwise, below); the
//       password questions ask this first, too.
//   logout(o?): FlowResult<LogoutDone>      { server, keysRemoved }
//       Always logs this device out (keys and record removed, whatever the
//       server says; it does not fail). `server: 'unreached'` = the server
//       could not be told: say that the session stays valid there until it
//       is ended from another device or runs out. Nothing of the player's
//       profiles, scripts or runs is touched (no keep/remove choice yet:
//       stage 61).
//   changePassword(oldPassword, newPassword, o?): FlowResult<null>
//       Two slow steps (the bar's estimate covers both). Ends the other
//       sessions; this one stays. Codes: invalid_login (the old password
//       is wrong), locked.
//   newRecoveryCode(password, o?): FlowResult<{ recoveryCode }>
//       SHOW THE CODE ONCE. The old code stops working. On a lost
//       answer here the server may or may not have taken the new code:
//       tell the player the old one may no longer work and to make a new
//       one again. Codes: invalid_login, locked.
//   endSession(id, o?), endOtherSessions(o?): FlowResult<null>
//       For the session marked `current`, use `logout()` instead. One
//       session that is already gone counts as ended; `endOtherSessions`
//       answers `not_found` as a failure (accounts were switched off).
//   deleteAccount(password, o?): FlowResult<null>
//       Removes the account on the server (its name stays reserved for
//       good) and logs this device out; `lastName` is forgotten. Codes:
//       invalid_login, locked.
//   setPrefs({ galleryNotice }, o?): FlowResult<AccountPrefs>
//       (No page uses it before stage 65.)
//   storedAccount(): StoredAccount | null   the device's record (name,
//       created, label, savedAt), without a request; repairs the hint.
//       Null also when the store could not be read just now.
//   accountKeys(): AccountKeys | null       the two non-extractable keys
//       (stage 61's sync engine).
//   accountConfig(): { turnstileSiteKey, limits }   from `/api/config`.
//       `turnstileSiteKey` null = the server has none: registration and
//       recovery cannot work; say so instead of showing an empty widget.
//
// ── Error codes a page must have words for ───────────────────────────────
//
//   From the server:
//     invalid_login        wrong user name or password (never say which)
//     invalid_recovery     wrong user name or recovery code, or the
//                          recovery took more than 15 minutes
//     turnstile_required   show the Turnstile widget and submit again
//     turnstile            the check was not passed: a new token
//     locked               too many tries for this name; `retryAfter`
//                          seconds (15 minutes at most) → "try again in …"
//     rate_limited         too many requests from this address (or 3
//                          accounts an hour / 10 a day): wait a while
//     name_taken           the name is in use, or reserved
//     unauthorized         the session is gone (ended from another device,
//                          the password changed, the account deleted). The
//                          device IS ALREADY logged out locally when a
//                          page sees this: show "you were logged out" and
//                          go to Log in (the name is in `lastName`)
//                          (A 401 that arrives after another tab has
//                          logged in again is `login_changed` instead.)
//     not_found            accounts were switched off on the server
//     unavailable          the service has a problem; try again later
//     accounts_not_configured   as `unavailable` (the server lacks its
//                          secrets; nothing the player can do)
//     bad_request, forbidden, method_not_allowed
//                          this client and the server disagree: a bug or
//                          an old page; "reload the page" is the advice
//   From the client:
//     disabled             accounts are off for this page; nothing sent
//     offline              the server was not reached
//     timeout              no answer in 15 s; a change may or may not
//                          have been made
//     cancelled            the page's own signal
//     bad_answer           the server's answer was not understood
//     worker_failed        the password could not be processed here
//     corrupt_wrap         the password (or code) was RIGHT but the key
//                          the server keeps for it does not open. Not a
//                          typing mistake: do not ask for the password
//                          again; say the account's key is damaged
//     update_needed        the account was written by a newer version:
//                          reload to update
//     storage_failed       this browser cannot keep the keys (a private
//                          window, storage blocked)
//     not_logged_in        nobody is logged in on this device
//     storage_unreadable   the device's key store could not be read just
//                          now. NOBODY was logged out: say so, "reload"
//     wrong_account        the server knows this browser as ANOTHER account
//                          than the one stored here (two tabs logged in to
//                          different accounts at once, a cookie from
//                          elsewhere). That session was ended and the
//                          device IS ALREADY logged out: as `unauthorized`,
//                          with its own words
//     login_changed        another tab logged in (again) while the flow
//                          ran; its last request changed nothing and the
//                          device is still logged in: "try again"
//     bad_input            the checks below were skipped
//     busy, finished       the page called a handle wrongly
//     failed               unexpected
//
// ── Checks (pure; call them as the player types) ─────────────────────────
//
//   checkName(name): null | 'empty' | 'too_short' | 'too_long' | 'bad_characters'
//   checkPassword(pw): null | 'empty' | 'too_short'      (≥ 10 after NFKC)
//   passwordLength(pw): number
//   passwordsMatch(pw, again): boolean
//   passwordStrength(pw, name?): 'too_short' | 'weak' | 'fair' | 'good' | 'strong'
//       a hint from length and variety only (the rule is in checks.ts)
//   checkRecoveryCode(typed): string | null    the canonical code or null
//   lastGroup(code), lastGroupMatches(code, typed)
//   deviceLabel(userAgent), cleanLabel(text)
//   estimateKdfMs(rounds?): number    before a flow starts, if wanted
//
// ── Turnstile ────────────────────────────────────────────────────────────
//
//   The widget is the page's: load Cloudflare's script only on a page
//   that needs it, render it with `accountConfig().turnstileSiteKey`, and
//   pass its token to `submit({ turnstile })`. Register and the first
//   recover submit always need one; login only after `turnstile_required`.
//
// ── Tests ────────────────────────────────────────────────────────────────
//
//   tests/e2e/cloud-account-fake.ts is the account API in memory behind
//   `page.route` (accounts, sessions, limits, switchable failures), with
//   `?cloudtest` on the dev server. tests/e2e/cloud-account.ts shows a
//   whole life of an account through this module.

import type { AccountKeys } from '../crypto';
import { type AccountFlows, type FlowHandle, type FlowResult, type LogoutDone, type RegisterDone, type RunOptions, createAccountFlows } from './flows';
import type { Account, AccountPrefs, PrefsRequest } from '../../../shared/cloud/api.ts';
import type { StoredAccount } from './store';

export type {
  Account,
  AccountLimits,
  AccountPrefs,
  AccountSession,
  AccountState as AccountStanding,
  AccountUsage,
  PrefsRequest,
} from '../../../shared/cloud/api.ts';
export { LOGIN_WINDOW_SECONDS, NAME_MAX_LENGTH, NAME_MIN_LENGTH, RECOVER_TICKET_SECONDS } from '../../../shared/cloud/api.ts';
export type { AccountKeys } from '../crypto';
export { lastGroup, lastGroupMatches } from '../crypto/recovery';
export { type AccountConfig, type ApiErrorCode, ACCOUNT_TIMEOUT_MS, accountConfig } from './api';
export {
  type NameProblem,
  type PasswordProblem,
  type PasswordStrength,
  PASSWORD_MIN_LENGTH,
  checkName,
  checkPassword,
  checkRecoveryCode,
  cleanLabel,
  deviceLabel,
  passwordLength,
  passwordStrength,
  passwordsMatch,
} from './checks';
export {
  type AccountFlows,
  type FlowDeps,
  type FlowErrorCode,
  type FlowFailure,
  type FlowHandle,
  type FlowResult,
  type FlowStep,
  type LogoutDone,
  type RegisterDone,
  type RunOptions,
  type StepInfo,
  type SubmitOptions,
  createAccountFlows,
  defaultFlowDeps,
  lostAnswer,
} from './flows';
export { estimateKdfMs } from './kdf-time';
export { type AccountState, accountState, accountsEnabled, onAccountState, watchAccountState } from './state';
export { type StoredAccount, ACCOUNT_DB_NAME } from './store';

let shared: AccountFlows | null = null;

/** The page's one set of flows (the real API, the real store). */
function flows(): AccountFlows {
  shared ??= createAccountFlows();
  return shared;
}

export const startRegister = (name: string, password: string): FlowHandle<RegisterDone> => flows().startRegister(name, password);
export const startLogin = (name: string, password: string): FlowHandle<Account> => flows().startLogin(name, password);
export const startRecover = (name: string, recoveryCode: string, newPassword: string): FlowHandle<Account> =>
  flows().startRecover(name, recoveryCode, newPassword);
export const logout = (o?: RunOptions): Promise<FlowResult<LogoutDone>> => flows().logout(o);
export const loadAccount = (o?: RunOptions): Promise<FlowResult<Account>> => flows().loadAccount(o);
export const changePassword = (oldPassword: string, newPassword: string, o?: RunOptions): Promise<FlowResult<null>> =>
  flows().changePassword(oldPassword, newPassword, o);
export const newRecoveryCode = (password: string, o?: RunOptions): Promise<FlowResult<{ recoveryCode: string }>> => flows().newRecoveryCode(password, o);
export const endSession = (id: string, o?: RunOptions): Promise<FlowResult<null>> => flows().endSession(id, o);
export const endOtherSessions = (o?: RunOptions): Promise<FlowResult<null>> => flows().endOtherSessions(o);
export const deleteAccount = (password: string, o?: RunOptions): Promise<FlowResult<null>> => flows().deleteAccount(password, o);
export const setPrefs = (prefs: PrefsRequest, o?: RunOptions): Promise<FlowResult<AccountPrefs>> => flows().setPrefs(prefs, o);
export const storedAccount = (): Promise<StoredAccount | null> => flows().storedAccount();
export const accountKeys = (): Promise<AccountKeys | null> => flows().accountKeys();
