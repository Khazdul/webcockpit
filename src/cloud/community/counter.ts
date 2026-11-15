// The Community row's counter on the start menu (stage 65 C1, spec §7.8,
// ADR 0155 "The counter and the reactions mark"; round 13's pick 5):
// "N new", the runs listed since the player last opened the Community
// page, "99+ new" at the cap (start-menu-model.ts `communityCount`).
//
// Two sources, as decided:
//
// - **Logged in:** the community's news (news.ts, stage 65 C3: one request
//   for this row and the owner row's reactions mark, on the sync's
//   cadence): its `runs`, other accounts' runs listed after the account's
//   seen time, on every device.
// - **A guest** (or accounts off): `GET /api/stats/public`'s `listed`, the
//   newest listed times, counted against this device's `wc.communitySeen`
//   (localStorage). No extra request: the almanac's "N online" and this
//   share the one answer (src/cloud/online.ts `publicStats`). Asked on the
//   same cadence by the start menu (`refreshCommunityCount`), never while
//   a game plays.
//
// Opening the Community page sets "seen" to the newest listed time it
// showed (`markCommunityPageSeen`): the device's key always, and logged in
// news.ts `markCommunitySeen({gallery})`, which clears the count at once.
//
// Small on purpose (the start menu imports it statically): no value of
// shared/cloud/api.ts.

import { accountState } from '../account/state';
import { isPlaying } from '../../core/playing';
import { communityNews, markCommunitySeen, onCommunityNews } from './news';

/** The device's seen time (ms; a guest's counter). */
export const SEEN_KEY = 'wc.communitySeen';
/** The guests' counter is asked for again this often on the start page (the sync's 5 minutes). */
export const COUNTER_PERIOD_MS = 5 * 60_000;

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The device's seen time, 0 when none (or storage is blocked). */
export function readSeen(s: Pick<Storage, 'getItem'> | null = store()): number {
  try {
    const n = Number(s?.getItem(SEEN_KEY) ?? '');
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Moves the device's seen time forward to `t` (never back). */
export function writeSeen(t: number, s: Pick<Storage, 'getItem' | 'setItem'> | null = store()): void {
  if (!Number.isSafeInteger(t) || t <= readSeen(s)) return;
  try {
    s?.setItem(SEEN_KEY, String(t));
  } catch {
    /* not kept: the counter counts these again next time */
  }
}

/** The guests' count: the listed times newer than `seen`. */
export function countListed(listed: readonly number[], seen: number): number {
  let n = 0;
  for (const t of listed) if (t > seen) n++;
  return n;
}

// --- The guests' state ---

let guestCount = 0;
const fns = new Set<() => void>();

function tell(): void {
  for (const fn of [...fns]) {
    try {
      fn();
    } catch {
      /* a listener's problem */
    }
  }
}

const loggedIn = (): boolean => accountState().name !== null && accountState().enabled === true;

/** The count now: the account's news logged in, the device's count for a guest (0 until the first answer). */
export function communityCount(): number {
  return loggedIn() ? (communityNews()?.runs ?? 0) : guestCount;
}

/** Calls `fn` with the count on every change of either source; returns the unsubscribe. */
export function onCommunityCount(fn: (n: number) => void): () => void {
  const call = (): void => fn(communityCount());
  fns.add(call);
  const off = onCommunityNews(call);
  return () => {
    fns.delete(call);
    off();
  };
}

/** Bumped by `markCommunityPageSeen`: an answer asked before it is not used (it would bring old news back). */
let epoch = 0;
let asking = false;

/**
 * A guest's count, asked once (not while a game plays, not twice at a
 * time) from the public listed times; logged in nothing (the news has its
 * own cadence). A failure keeps the count. Never rejects.
 */
export async function refreshCommunityCount(): Promise<void> {
  if (asking || isPlaying()) return;
  // Logged in, news.ts asks on its own cadence (held by the owner row's mark, start-main.tsx).
  if (loggedIn()) return;
  asking = true;
  const was = epoch;
  try {
    const m = await import('../online');
    const listed = await m.listedNow();
    if (listed && was === epoch) {
      const n = countListed(listed, readSeen());
      if (n !== guestCount) {
        guestCount = n;
        tell();
      }
    }
  } catch {
    /* the count stays */
  } finally {
    asking = false;
  }
}

/**
 * The Community page was opened and showed runs up to `newest` (the newest
 * `listedAt` it had): the row clears, the device remembers it, and a
 * logged-in account tells the server (every device clears). Never rejects.
 */
export async function markCommunityPageSeen(newest: number | null): Promise<void> {
  epoch++;
  if (guestCount !== 0) {
    guestCount = 0;
    tell();
  }
  if (newest === null) return;
  writeSeen(newest);
  if (accountState().name === null) return;
  await markCommunitySeen({ gallery: newest });
}

/** Tests: the state back to its start. */
export function resetCommunityCountForTest(): void {
  guestCount = 0;
  epoch = 0;
  asking = false;
  fns.clear();
}
