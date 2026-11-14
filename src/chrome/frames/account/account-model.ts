// The Account page's model (stage 60): the order of the device list and
// the words of its times. Pure (types only from the account's client), so
// it is unit tested (tests/unit/account-model.test.ts).
//
// What the times can honestly say: the server writes a session's
// `lastUsed` at most once a day (worker/sessions.ts renews it when it is
// a day old), so the true last use lies between `lastUsed` and a day
// after it. The page therefore speaks in days and says "about": under a
// day old is "in the last day", then "about a day ago", "about 3 days
// ago", weeks, months. `created` is exact and shown as a date.

import type { AccountSession } from '../../../cloud/account';
import { serverMs } from './words';

const DAY = 86_400_000;

/** This device first, then the latest used first (ties: the newest made, then the id, so the order is stable). */
export function orderSessions(list: readonly AccountSession[]): AccountSession[] {
  return [...list].sort(
    (a, b) => Number(b.current) - Number(a.current) || b.lastUsed - a.lastUsed || b.created - a.created || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** When a session was made, as a short date in the player's locale ("14 Nov 2026"); empty for a bad value. */
export function madeWords(created: number, locale?: string): string {
  if (!Number.isFinite(created) || created <= 0) return '';
  try {
    return new Date(serverMs(created)).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

const count = (n: number, one: string, many: string): string => (n === 1 ? `about ${one} ago` : `about ${n} ${many} ago`);

/** When a session was last used, by day and never finer (the header says why); empty for a bad value. */
export function usedWords(lastUsed: number, now: number): string {
  if (!Number.isFinite(lastUsed) || lastUsed <= 0 || !Number.isFinite(now)) return '';
  const days = Math.floor((now - serverMs(lastUsed)) / DAY);
  // (A clock that is behind the server's gives a time in the future: that is "in the last day" too.)
  if (days < 1) return 'in the last day';
  if (days < 14) return count(days, 'a day', 'days');
  if (days < 60) return count(Math.round(days / 7), 'a week', 'weeks');
  if (days < 365) return count(Math.round(days / 30), 'a month', 'months');
  return 'over a year ago';
}

/** The line under a device's name: "Logged in 14 Nov 2026 · last used about 3 days ago". */
export function sessionWords(s: Pick<AccountSession, 'created' | 'lastUsed'>, now: number, locale?: string): string {
  const made = madeWords(s.created, locale);
  const used = usedWords(s.lastUsed, now);
  return [made && `Logged in ${made}`, used && `${made ? 'last used' : 'Last used'} ${used}`].filter(Boolean).join(' · ');
}

/** A device's name as text; a session without a label still has a row to end it by. */
export const labelWords = (label: string): string => (label.trim().length > 0 ? label : 'Unnamed device');

/** "End all others": the question and its button for `n` other sessions (n ≥ 1). */
export function endOthersWords(n: number): { question: string; button: string } {
  return n === 1
    ? { question: 'End the session on the other device?', button: 'End 1 session' }
    : { question: `End the sessions on the ${n} other devices?`, button: `End ${n} sessions` };
}

/** True when what is typed in "type the user name" names this account (case and outer spaces do not matter: names are unique without case). */
export const namesAccount = (typed: string, name: string): boolean => name.length > 0 && typed.trim().toLowerCase() === name.toLowerCase();
