// The words of the sync's flows (stage 61 part C; the owner's picks of
// round 9, notes/research/start-menu-mockups/round9/README.md "The
// words"). Pure, so the unit tests hold every form.

import type { SyncKind } from '../../../shared/cloud/api.ts';
import type { SyncEvent, Unsynced } from '../sync/types';

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export interface KindCounts {
  profiles: number;
  scripts: number;
  /** Runs moved at Create account (stage 63, ADR 0153); absent: none. */
  runs?: number;
}

/** "4 profiles, 2 scripts", "1 profile", "1 profile, 3 runs" (kinds with none are left out). */
export function countWords(c: KindCounts): string {
  const parts: string[] = [];
  if (c.profiles > 0) parts.push(plural(c.profiles, 'profile'));
  if (c.scripts > 0) parts.push(plural(c.scripts, 'script'));
  if ((c.runs ?? 0) > 0) parts.push(plural(c.runs!, 'run'));
  return parts.join(', ');
}

/** "2 scripts", "1 profile and 2 scripts" (the things still to move: never runs). */
function countAnd(c: KindCounts): string {
  return countWords({ profiles: c.profiles, scripts: c.scripts }).replace(', ', ' and ');
}

/** The move is done (pick 1a). */
export function movedWords(name: string, c: KindCounts): string {
  return `Moved into ${name}: ${countWords(c)}. This device is back at its starting set.`;
}

/** The move runs. */
export function movingWords(name: string, done: number, total: number): string {
  return `Moving ${plural(total, 'thing')} into ${name}… ${done} of ${total}`;
}

/** Part of the move waits for the network. */
export function moveWaitWords(name: string, done: number, left: KindCounts): string {
  const n = left.profiles + left.scripts;
  return `${plural(done, 'thing')} moved into ${name}. ${countAnd(left)} still to move: ${n === 1 ? 'it goes' : 'they go'} when the server can be reached, and ${n === 1 ? 'stays' : 'stay'} on this device until then.`;
}

/** The Account page's lasting line (pick 1c). */
export function movedLine(c: KindCounts): string {
  return `Moved here from this device when the account was made: ${countWords(c)}.`;
}

/** What a locked copy keeps: "3 changes", "1 change and 1 saved run". */
export function keptWords(changes: number, savedRuns: number): string {
  const parts: string[] = [];
  if (changes > 0) parts.push(plural(changes, 'change'));
  if (savedRuns > 0) parts.push(plural(savedRuns, 'saved run'));
  return parts.join(' and ');
}

/** The locked copy's notice (pick 2a). */
export function lockedWords(name: string, what: string): string {
  const one = /^1 /.test(what) && !what.includes(' and ');
  return one
    ? `${what} is not in the account ${name} yet. It is kept on this device until you log in.`
    : `${what} are not in the account ${name} yet. They are kept on this device until you log in.`;
}

const KIND_WORD: Partial<Record<SyncKind, [string, string]>> = { profile: ['profile', 'profiles'], script: ['script', 'scripts'] };

/** "the profile warrior", "the scripts autoloot and hunt". */
export function namedWords(kind: SyncKind, names: string[]): string {
  const [one, many] = KIND_WORD[kind] ?? [kind, `${kind}s`];
  const list = names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `the ${names.length === 1 ? one : many} ${list}`;
}

/** Remove's list and the Log out dialog's: one line per kind of what is not in the account. */
export function unsyncedLines(list: readonly Unsynced[]): string[] {
  const out: string[] = [];
  for (const kind of ['profile', 'script'] as const) {
    const of = list.filter((u) => u.kind === kind);
    const named = of.filter((u) => u.change !== 'delete' && u.name).map((u) => u.name!);
    const deleted = of.filter((u) => u.change === 'delete').length;
    if (named.length) out.push(namedWords(kind, named));
    if (deleted) out.push(`${plural(deleted, `deleted ${KIND_WORD[kind]![0]}`)}`);
  }
  return out;
}

export const loggedOutWords = (name: string): string => `Logged out. Everything is in your account ${name}.`;
export const loggedOutAnywayWords = (name: string): string => `Logged out of ${name}.`;
export const lostWords = (name: string): string => `You were logged out of ${name} on this device.`;
export const deletedElsewhereWords = (name: string): string => `The account ${name} was deleted.`;
export const deletedHereWords = (name: string): string => `The account ${name} is deleted. Its profiles, scripts and runs are this device’s now.`;
export const handingBackWords = (name: string): string => `The account ${name} is deleted. Its things are being moved back to this device.`;

/** A sync event in words for the start menu's line, or null when it needs none. */
export function eventWords(e: SyncEvent): string | null {
  switch (e.type) {
    case 'keptBoth':
      return `${e.name} was changed on two devices. Both are kept: ${e.name} and ${e.copyName}.`;
    case 'renamed': {
      const k = KIND_WORD[e.kind]?.[0] ?? e.kind;
      return `Another device made a ${k} named ${e.from} too. Both are kept: this one is now ${e.to}.`;
    }
    case 'restored':
      return `${e.name} was deleted here but changed on another device, so it is back.`;
    default:
      return null;
  }
}
