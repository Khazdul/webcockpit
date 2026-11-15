// The Log out dialog's second line under "N changes not synced" (stage 62,
// round 10's pick 1a, notes/research/start-menu-mockups/round10/README.md):
// the kinds of what is not in the account, quietly named. Pure but for
// the clock (today's UTC day), so the unit tests hold every form.
//
// (Stage 62 C2 wrote this beside src/cloud/space/words.ts, which part C1
// changes in parallel; the two are joined at the merge.)

import type { Unsynced } from '../sync/types';

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A Comm piece's day: `YYYY-MM-DD` of `YYYY-MM-DD` or of a split piece `YYYY-MM-DD.2`. */
const dayOf = (key: string): string => key.split('.')[0]!;

/**
 * "2 profiles · settings · Comm history, today": profiles and scripts
 * counted, then "settings", "script data", Comm history ("today" when its
 * only day is today's UTC day, else "N days"), "timers"; each named once,
 * in that order, joined with " · ". Empty for an empty list.
 */
export function unsyncedKindsWords(list: Unsynced[]): string {
  const of = (kind: Unsynced['kind']): Unsynced[] => list.filter((u) => u.kind === kind);
  const parts: string[] = [];
  const profiles = of('profile').length;
  const scripts = of('script').length;
  if (profiles > 0) parts.push(plural(profiles, 'profile'));
  if (scripts > 0) parts.push(plural(scripts, 'script'));
  if (of('settings').length > 0) parts.push('settings');
  if (of('scriptData').length > 0) parts.push('script data');
  const days = new Set(of('comm').map((u) => dayOf(u.key)));
  if (days.size > 0) {
    const today = new Date().toISOString().slice(0, 10);
    parts.push(days.size === 1 && days.has(today) ? 'Comm history, today' : `Comm history, ${plural(days.size, 'day')}`);
  }
  if (of('timers').length > 0) parts.push('timers');
  return parts.join(' · ');
}
