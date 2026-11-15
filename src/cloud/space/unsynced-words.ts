// The Log out dialog's second line under "N changes not synced" (stage 62,
// round 10's pick 1a, notes/research/start-menu-mockups/round10/README.md):
// the kinds of what is not in the account, quietly named. Pure but for
// the clock (today's UTC day), so the unit tests hold every form. The
// small kinds' names are one table, `SMALL_KIND_WORDS`, also used by the
// locked copy's Remove list (src/cloud/space/flows.ts).

import type { Unsynced } from '../sync/types';

/** The small kinds as a player reads them, in the order they are named. */
export const SMALL_KIND_WORDS = [
  ['settings', 'settings'],
  ['scriptData', 'script data'],
  ['comm', 'Comm history'],
  ['timers', 'timers'],
] as const satisfies readonly (readonly [Unsynced['kind'], string])[];

/** The names of the small kinds among `list`, in order, each once ("settings", "script data", "Comm history"; `timers` too unless left out). */
export function smallKindNames(list: readonly Unsynced[], o: { timers?: boolean } = {}): string[] {
  const kinds = new Set(list.map((u) => u.kind));
  return SMALL_KIND_WORDS.filter(([k]) => kinds.has(k) && (k !== 'timers' || o.timers !== false)).map(([, w]) => w);
}

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
  const days = new Set(of('comm').map((u) => dayOf(u.key)));
  const today = new Date().toISOString().slice(0, 10);
  for (const word of smallKindNames(list)) {
    if (word !== 'Comm history') parts.push(word);
    else parts.push(days.size === 1 && days.has(today) ? `${word}, today` : `${word}, ${plural(days.size, 'day')}`);
  }
  return parts.join(' · ');
}
