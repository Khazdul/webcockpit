// The account pages' words (stage 60, spec §7.2): what a page says for
// every way a flow can end, and the few sentences several pages share.
// Pure (no DOM, no Preact, nothing of the account's client but types), so
// it is unit tested (tests/unit/account-words.test.ts) and the Account
// page and its dialogs use the same words.
//
// HOW TO USE IT (the next page's author):
//
//   const r = await handle.submit(…)            // or logout(), changePassword() …
//   if (!r.ok) {
//     if (r.code === 'cancelled') return;       // the player's own Cancel: say nothing
//     if (r.code === 'unauthorized') return toLogin(nav, failureWords(r.code, 'account'));
//     if (r.code === 'locked') show <WaitPlate seconds={r.retryAfter} />   (form.tsx)
//     else setError(failureWords(r.code, 'account'));
//   }
//
// `failureWords(code, where)` has a sentence for every `FlowErrorCode`
// (the list in src/cloud/account/index.ts): the unit test fails when a
// code is added without words. `where` picks the wording where the same
// code means something else on another page (`timeout` after Create
// account is "it may or may not have been made").
//
// The texts the owner approved in the mockups (the six points, the plates,
// the wait, the Working sentences; notes/research/account-mockups) are
// here or on their page as they stood. Change them only with the owner.

import type { FlowErrorCode, NameProblem, PasswordStrength } from '../../../cloud/account';

/** Where a flow was started: the wording differs for a few codes. */
export type FlowPlace = 'login' | 'register' | 'recover' | 'account';

/** The six points of Create account (ADR 0145 "What the player is told at registration"): a lead-in and its sentence. */
export const POINTS: readonly (readonly [lead: string, text: string])[] = [
  ['What is stored', 'Your profiles, scripts, settings and saved runs, encrypted on this device before they are sent.'],
  ['What we can see', 'Your user name, when you were last here, and how much you store. Not the contents.'],
  ['What is never stored', 'Your MUME name and password.'],
  ['What is public', 'Your user name, if you publish a run or comment on one.'],
  ['No e-mail', 'So there is no “forgot password” mail. You get a recovery code next: keep it.'],
  ['Yours to delete', 'The account and everything in it, at any time.'],
];

export const WRONG_LOGIN = 'Wrong user name or password.';
export const WRONG_RECOVERY = 'Wrong user name or recovery code.';
export const NAME_HINT = '3–20 of a–z 0–9 _ - · public · cannot be changed later';
export const PASSWORD_HINT = 'At least 10 characters. Long beats odd: a few words do well.';
/** Under a new password where the page has no plate for it (Recovery, Change password). */
export const NEW_PASSWORD_HINT = 'At least 10 characters. Not your MUME password.';
export const CODE_HINT = 'Six groups of four. Dashes and capitals do not matter.';
export const CODE_PLACEHOLDER = 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX';

/** The service's own trouble, in one sentence that blames nothing of the player's. */
const SERVICE_DOWN = 'The account service has a problem right now. Nothing is wrong with your account or with what is on this device. Try again later.';
const RELOAD = 'This page and the server disagree: the page is probably an old one. Reload the page and try again.';

/**
 * What the page says when a flow ends with `code`. Never empty: an
 * unknown code gets the words of `failed`. `cancelled` has words too, but
 * a page says nothing for the player's own Cancel.
 */
export function failureWords(code: FlowErrorCode, where: FlowPlace): string {
  switch (code) {
    case 'invalid_login':
      return where === 'account' ? 'Wrong password.' : WRONG_LOGIN;
    case 'invalid_recovery':
      return WRONG_RECOVERY;
    case 'turnstile_required':
      return where === 'login' ? 'Three wrong tries. Show that you are a person, then try again.' : 'Show that you are a person first: the check above the button.';
    case 'turnstile':
      return 'The check that you are a person did not pass. Do it once more, then try again.';
    case 'locked':
      return 'Too many wrong tries for this name. Nobody can log in to it until the time is up.';
    case 'rate_limited':
      return where === 'register'
        ? 'Too many accounts were made from this network (three an hour and ten a day are allowed), or too many tries. Wait a while, then try again.'
        : 'Too many tries from this network. Wait a minute, then try again.';
    case 'name_taken':
      return 'That name is taken. Try another.';
    case 'unauthorized':
      return 'You were logged out here: the session was ended from another device, or the password was changed. Log in again.';
    case 'not_found':
    case 'disabled':
      return 'Accounts are switched off right now. Try again later.';
    case 'unavailable':
    case 'accounts_not_configured':
      return SERVICE_DOWN;
    case 'bad_request':
    case 'forbidden':
    case 'method_not_allowed':
      return RELOAD;
    case 'offline':
      return 'The server was not reached. Check the connection, then try again.';
    case 'timeout':
      if (where === 'register') return 'No answer from the server. The account may or may not have been made: press Create account again and it will be found.';
      if (where === 'recover') return 'No answer from the server. The password may or may not have been set: press Set new password again.';
      if (where === 'account') return 'No answer from the server. The change may or may not have been made.';
      return 'No answer from the server. Try again.';
    case 'cancelled':
      return 'Cancelled.';
    case 'bad_answer':
      return 'The server’s answer was not understood. Reload the page and try again.';
    case 'worker_failed':
      return 'The password could not be processed in this browser. Reload the page and try again; if it stays so, try another browser.';
    case 'corrupt_wrap':
      return where === 'recover'
        ? 'The recovery code is right, but the account’s key on the server is damaged and does not open with it. Typing it again will not help. If you remember the password, try Log in.'
        : 'The password is right, but the account’s key on the server is damaged and does not open with it. Typing it again will not help. Your recovery code may still open it: try Forgot password.';
    case 'update_needed':
      return 'This account was last used with a newer version of the client. Reload the page to update, then try again.';
    case 'storage_failed':
      return where === 'register'
        ? 'This browser cannot keep an account’s keys (a private window, or storage is blocked). No account was made.'
        : 'This browser cannot keep the account’s keys (a private window, or storage is blocked), so nobody can be logged in here.';
    case 'not_logged_in':
      return 'Nobody is logged in on this device.';
    case 'bad_input':
      return 'Something in the form cannot be used. Check the fields.';
    case 'busy':
      return 'Still working on the last try.';
    case 'finished':
      return 'That try is over. Try again.';
    case 'failed':
    default:
      return 'Something unexpected went wrong. Try again; if it stays so, reload the page.';
  }
}

/** What is wrong with a user name as typed (Create account), or null. `empty` is not an error to show. */
export function nameWords(problem: NameProblem | null): string | null {
  switch (problem) {
    case 'bad_characters':
      return 'Only a–z, 0–9, _ and -. No spaces.';
    case 'too_short':
      return 'At least 3 characters.';
    case 'too_long':
      return 'At most 20 characters.';
    default:
      return null;
  }
}

export const takenWords = (name: string): string => `The name ${name} is taken. Try another.`;

/** A strength's step on the four-part meter (0: too short, nothing lit) and its word. */
export function strengthMark(s: PasswordStrength): { step: 0 | 1 | 2 | 3 | 4; word: string } {
  switch (s) {
    case 'weak':
      return { step: 1, word: 'weak' };
    case 'fair':
      return { step: 2, word: 'fair' };
    case 'good':
      return { step: 3, word: 'good' };
    case 'strong':
      return { step: 4, word: 'strong' };
    default:
      return { step: 0, word: 'too short' };
  }
}

export const charactersWords = (n: number): string => (n === 1 ? '1 character' : `${n} characters`);

/** A wait as a clock: `14:32`, `0:07`; over an hour `1:02:03`. Never negative. */
export function waitClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/** How long the slow step will take, said plainly from the estimate (ms). */
export function howLong(estimateMs: number | null): string {
  if (estimateMs === null || !Number.isFinite(estimateMs)) return 'This takes a moment.';
  if (estimateMs < 2500) return 'About a second.';
  if (estimateMs < 8000) return 'This takes a few seconds.';
  return 'This can take a while on this device.';
}

/**
 * The Working… sentence: what is being made, where, and how long it takes
 * ("Making your key on this phone. This takes a few seconds."). `what`:
 * `key` (log in, create), `new key` (recovery, a password change).
 */
export function workingWords(o: { what?: 'key' | 'new key'; phone: boolean; estimateMs: number | null; inline?: boolean }): string {
  const made = `Making your ${o.what ?? 'key'} on this ${o.phone ? 'phone' : 'device'}.`;
  // The worker failed and the page's own thread does it: the page may stand still meanwhile.
  if (o.inline) return `${made} The page may stand still while it does.`;
  return `${made} ${howLong(o.estimateMs)}`;
}

/** The recovery code's text file: what it is, whose it is and where it is used. Never the password. */
export function recoveryFile(o: { name: string; code: string; site: string; date: string }): { name: string; text: string } {
  const text = [
    'WebCockpit account recovery code',
    '',
    `Site:       ${o.site}`,
    `User name:  ${o.name}`,
    `Made:       ${o.date}`,
    '',
    `Recovery code:  ${o.code}`,
    '',
    'What it is for: if you forget the password of this account, the code',
    'lets you set a new one (Log in, then "Forgot password"). It is the',
    'only way back: there is no e-mail and nobody can reset the password',
    'for you.',
    '',
    'Keep this file where you keep other keys, and nowhere public: with',
    'the user name, the code opens the account. The code stays the same',
    'until you make a new one on the Account page.',
    '',
  ].join('\n');
  return { name: `webcockpit-recovery-code-${o.name}.txt`, text };
}

/** A time from the server as milliseconds: it counts seconds; a value that large is already milliseconds. */
export const serverMs = (t: number): number => (t < 1e11 ? t * 1000 : t);

/** "Account since …": a date as the player's own locale writes it (a day, no time). */
export function sinceWords(created: number, locale?: string): string {
  if (!Number.isFinite(created) || created <= 0) return 'Account';
  try {
    return `Account since ${new Date(serverMs(created)).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })}`;
  } catch {
    return 'Account';
  }
}
