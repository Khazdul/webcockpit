// What is new in the community for the account logged in here (stage 65,
// ADR 0155 "The counter and the reactions mark"): `GET
// /api/u/community/news` → `{runs, reactions, newestRun, newestReaction}`.
// One module, one request, for both readers: the start menu's Community row
// (runs listed since the last visit) and the owner row's reactions mark
// (new stars and comments on one's own runs).
//
// The cadence is the sync's: asked while the start page is the view (not
// while a game is: spec §7.0 rule 1), when the tab becomes visible again,
// and every 5 minutes. `watchCommunityNews()` starts it (reference
// counted: two readers share one timer and one request); `refreshCommunityNews()`
// asks once now (the Published runs view does before it marks what it
// showed as seen). Nothing is asked unless the page may call the API, the
// flags `accounts` and `gallery` are on and somebody is logged in here; a
// failure keeps the last answer (or none), silently.
//
// `markCommunitySeen` posts `/api/u/community/seen` and clears the counts it
// covers locally at once, so the rows lose their mark without waiting for
// the next round.
//
// Small on purpose: the start page (the chrome chunk) imports it
// statically, so it imports no value of shared/cloud/api.ts (`NEWS_MAX`
// is written out; a unit test holds the two together).

import type { CommunityNews, CommunitySeenRequest } from '../../../shared/cloud/api.ts';
import { accountState, accountsEnabled } from '../account/state';
import { CLOUD_TIMEOUT_MS, flagOn } from '../config';
import { isPlaying, onPlaying } from '../../core/playing';

export type { CommunityNews };

/** `NEWS_MAX` of the contract: each count stops there ("99+"). */
export const NEWS_CAP = 99;
/** The cadence's period (ms): the sync's 5 minutes. */
export const NEWS_EVERY_MS = 5 * 60_000;

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const time = (v: unknown): v is number | null => v === null || whole(v);

/** The answer as the contract has it, or null. */
export function parseCommunityNews(v: unknown): CommunityNews | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const { runs, reactions, newestRun, newestReaction } = v as Record<string, unknown>;
  if (!whole(runs) || !whole(reactions) || !time(newestRun) || !time(newestReaction)) return null;
  return { runs: Math.min(NEWS_CAP, runs), reactions: Math.min(NEWS_CAP, reactions), newestRun, newestReaction };
}

/** The part of `fetch` used here. */
export type NewsFetch = (url: string, init: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface NewsDeps {
  fetch?: NewsFetch | undefined;
  /** May the request be made (default: the API, `accounts` and `gallery` on, somebody logged in here). */
  enabled?: () => Promise<boolean>;
}

/** The default: the page may call the API, accounts and the community are on, somebody is logged in here. */
export async function newsEnabled(): Promise<boolean> {
  try {
    return accountState().name !== null && (await accountsEnabled()) && (await flagOn('share')) && (await flagOn('gallery'));
  } catch {
    return false;
  }
}

let deps: NewsDeps = {};
let last: CommunityNews | null = null;
const fns = new Set<(n: CommunityNews | null) => void>();
let asking: Promise<CommunityNews | null> | null = null;

function tell(): void {
  for (const fn of [...fns]) {
    try {
      fn(last);
    } catch {
      /* a listener's problem */
    }
  }
}

const fetcher = (): NewsFetch | undefined => deps.fetch ?? globalThis.fetch?.bind(globalThis);
const signal = (): AbortSignal | undefined => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(CLOUD_TIMEOUT_MS) : undefined);

/** The last answer (null: none yet, or nobody logged in). */
export function communityNews(): CommunityNews | null {
  return last;
}

/** Calls `fn` with every new answer (or null when the account is gone); returns the unsubscribe. */
export function onCommunityNews(fn: (n: CommunityNews | null) => void): () => void {
  fns.add(fn);
  return () => void fns.delete(fn);
}

/**
 * Asks now (one request at a time: a call while one is out gets its
 * answer). Resolves to the news, or the last answer when this one failed,
 * or null when nothing may be asked. Never rejects.
 */
export function refreshCommunityNews(): Promise<CommunityNews | null> {
  asking ??= (async () => {
    try {
      const on = await (deps.enabled ?? newsEnabled)();
      if (!on) {
        if (last !== null) {
          last = null;
          tell();
        }
        return null;
      }
      const f = fetcher();
      if (!f) return last;
      const s = signal();
      const res = await f('/api/u/community/news', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        ...(s ? { signal: s } : {}),
      });
      if (!res.ok) return last;
      const n = parseCommunityNews(await res.json());
      if (!n) return last;
      last = n;
      tell();
      return n;
    } catch {
      return last;
    } finally {
      asking = null;
    }
  })();
  return asking;
}

/**
 * `POST /api/u/community/seen` with the newest time each reader showed.
 * The counts it covers are cleared here at once (the server sets each
 * time to at most now, so the next answer agrees). True when the server
 * took it. Never rejects.
 */
export async function markCommunitySeen(req: CommunitySeenRequest): Promise<boolean> {
  const body: CommunitySeenRequest = {};
  if (whole(req.gallery)) body.gallery = req.gallery;
  if (whole(req.reactions)) body.reactions = req.reactions;
  if (body.gallery === undefined && body.reactions === undefined) return false;
  if (last) {
    const n = { ...last };
    if (body.gallery !== undefined && (n.newestRun === null || n.newestRun <= body.gallery)) n.runs = 0;
    if (body.reactions !== undefined && (n.newestReaction === null || n.newestReaction <= body.reactions)) n.reactions = 0;
    if (n.runs !== last.runs || n.reactions !== last.reactions) {
      last = n;
      tell();
    }
  }
  try {
    if (!(await (deps.enabled ?? newsEnabled)())) return false;
    const f = fetcher();
    if (!f) return false;
    const s = signal();
    const res = await f('/api/u/community/seen', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-WC': '1' },
      body: JSON.stringify(body),
      ...(s ? { signal: s } : {}),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ the cadence

let watchers = 0;
let stopCadence: (() => void) | null = null;

function startCadence(): () => void {
  const doc = globalThis.document as Document | undefined;
  const due = (): boolean => !isPlaying() && doc?.visibilityState !== 'hidden';
  const tick = (): void => {
    if (due()) void refreshCommunityNews();
  };
  tick();
  const timer = setInterval(tick, NEWS_EVERY_MS);
  const onVisible = (): void => {
    if (doc?.visibilityState === 'visible') tick();
  };
  doc?.addEventListener('visibilitychange', onVisible);
  // The start page shown again after a game.
  const offPlaying = onPlaying((on) => {
    if (!on) tick();
  });
  return () => {
    clearInterval(timer);
    doc?.removeEventListener('visibilitychange', onVisible);
    offPlaying();
  };
}

/**
 * Starts the cadence (at once, every 5 minutes, when the tab becomes
 * visible, when the start page is the view again), for as long as one
 * caller holds it. Returns the release.
 */
export function watchCommunityNews(): () => void {
  watchers++;
  stopCadence ??= startCadence();
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    watchers--;
    if (watchers === 0 && stopCadence) {
      stopCadence();
      stopCadence = null;
    }
  };
}

/** Tests: other ways to ask, and nothing known. */
export function setNewsDepsForTest(d: NewsDeps): void {
  deps = d;
  last = null;
  asking = null;
  fns.clear();
  if (stopCadence) stopCadence();
  stopCadence = null;
  watchers = 0;
}
