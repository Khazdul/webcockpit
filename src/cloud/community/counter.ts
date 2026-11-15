// The Community row's counter on the start menu (stage 65 C1, spec §7.8,
// ADR 0155 "The counter and the reactions mark"; round 13's pick 5):
// "N new", the runs listed since the player last opened the Community
// page, "99+ new" past the cap.
//
// Two sources, as decided:
//
// - **A guest** (or accounts off): `GET /api/stats/public`'s `listed`, the
//   newest listed times, counted against this device's `wc.communitySeen`
//   (localStorage). No extra request: the almanac's "N online" and this
//   share the one answer (src/cloud/online.ts `publicStats`).
// - **Logged in:** `GET /api/u/community/news`'s `runs` (other accounts'
//   runs listed after the account's seen time, on every device).
//
// When: with the sync's cadence (src/cloud/space/runtime.ts): when the
// start page is shown, when the tab becomes visible again while it is,
// and every 5 minutes on the start page; never while a game plays (the
// counter is not on the game path, spec §7.0 rule 1). The start menu
// drives it (`useCommunityCounter` in start-main.tsx calls `refresh`).
//
// Opening the Community page sets "seen" to the newest listed time it
// showed, for both: the device's key and, logged in, `POST
// /api/u/community/seen`; the row clears at once.
//
// Small on purpose (the start menu imports it statically): no value of
// shared/cloud/api.ts, and its two account requests are made here (the
// page's client, ./api.ts, lives in the account pages' chunk; importing it
// from here would split the start page's chunks). Same rules as that
// client: the flags first, `X-WC: 1` on the write, the answer checked.

import { accountState } from '../account/state';
import { apiAllowed, flagOn } from '../config';
import { isPlaying } from '../../core/playing';

/** The device's seen time (ms; a guest's counter). */
export const SEEN_KEY = 'wc.communitySeen';
/** The counter is asked for again this often on the start page (the sync's `PERIOD_MS`). */
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

// --- The account's requests ---

const COUNTER_TIMEOUT_MS = 10_000;
const time = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** The flags an account's counter needs: the API, `accounts`, `share` and `gallery`. */
async function accountCounterOn(): Promise<boolean> {
  try {
    return apiAllowed() && (await flagOn('accounts')) && (await flagOn('share')) && (await flagOn('gallery'));
  } catch {
    return false;
  }
}

/** A same-origin JSON request with a timeout; the parsed body of a 2xx, else null. Never rejects. */
async function ask(path: string, init: RequestInit): Promise<unknown> {
  const f = globalThis.fetch;
  if (typeof f !== 'function') return null;
  try {
    const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(COUNTER_TIMEOUT_MS) : undefined;
    const res = await f(path, { credentials: 'same-origin', ...init, ...(signal ? { signal } : {}) });
    return res.ok ? ((await res.json()) as unknown) : null;
  } catch {
    return null;
  }
}

/** `GET /api/u/community/news`'s `runs`, or null. */
export async function fetchNewsRuns(): Promise<number | null> {
  if (!(await accountCounterOn())) return null;
  const d = await ask('/api/u/community/news', { headers: { Accept: 'application/json' } });
  const runs = d && typeof d === 'object' ? (d as { runs?: unknown }).runs : undefined;
  return time(runs) ? runs : null;
}

/** `POST /api/u/community/seen {gallery}`; true when the server took it. */
export async function sendSeen(gallery: number): Promise<boolean> {
  if (!time(gallery) || !(await accountCounterOn())) return false;
  const d = await ask('/api/u/community/seen', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-WC': '1' },
    body: JSON.stringify({ gallery }),
  });
  return !!d && typeof d === 'object' && time((d as { gallery?: unknown }).gallery);
}

// --- The state the row reads ---

let count = 0;
const fns = new Set<(n: number) => void>();

function set(n: number): void {
  if (n === count) return;
  count = n;
  for (const fn of [...fns]) {
    try {
      fn(n);
    } catch {
      /* a listener's problem */
    }
  }
}

/** The count now (0 until the first answer). */
export function communityCount(): number {
  return count;
}

/** Calls `fn` on every change; returns the unsubscribe. */
export function onCommunityCount(fn: (n: number) => void): () => void {
  fns.add(fn);
  return () => void fns.delete(fn);
}

/** Bumped by `markSeen`: an answer asked before it is not used (it would bring old news back). */
let epoch = 0;
let asking = false;
/** The last `seen` on its way to the server: a count asked after it waits for it (else it would be the old one). */
let seenSent: Promise<unknown> = Promise.resolve();

/**
 * Asks for the count once (not while a game plays, not twice at a time).
 * Logged in: the account's news; a guest: the public listed times. Any
 * failure keeps the count as it was. Never rejects.
 */
export async function refreshCommunityCount(): Promise<void> {
  if (asking || isPlaying()) return;
  asking = true;
  try {
    await seenSent;
  } catch {
    /* never rejects */
  }
  const was = epoch;
  try {
    const name = accountState().name;
    let n: number | null = null;
    if (name !== null && accountState().enabled === true) {
      n = await fetchNewsRuns();
    } else {
      const m = await import('../online');
      const listed = await m.listedNow();
      if (listed) n = countListed(listed, readSeen());
    }
    if (n !== null && was === epoch) set(n);
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
export async function markCommunitySeen(newest: number | null): Promise<void> {
  epoch++;
  set(0);
  if (newest === null) return;
  writeSeen(newest);
  if (accountState().name === null) return;
  // A failure keeps the server's seen; the next news says so.
  const sent = sendSeen(newest);
  seenSent = sent;
  await sent;
}

/** Tests: the state back to its start. */
export function resetCommunityCountForTest(): void {
  count = 0;
  epoch = 0;
  asking = false;
  seenSent = Promise.resolve();
  fns.clear();
}
