// Kill rating (ADR 0134, the Statistics pane): every kill gets a word for
// how good its XP was against this run's own kills, not against absolute
// values (2k is great at level 12 and poor at level 48). Pure TS, no DOM.
//
// - The reference is the median XP of the last `RATING_WINDOW` (30) mob
//   kills with XP > 0. Pkills are rated against it but never enter it (a
//   pkill is rare and large); kills that gave no XP (a fold without an XP
//   change) carry no information and stay out of it too.
// - r = XP / median: Poor < 0.45 ≤ Meh < 0.8 ≤ Good < 1.5 ≤ Great < 2.5 ≤
//   Superb. The bounds sit on a log scale around 1 (Good is "typical").
// - Fewer than `RATING_MIN_KILLS` (5) kills in the window: no rating yet
//   ("calibrating…").
// - Rows are rated against the current median, so an older row may change
//   its word during the run (owner, 2026-11-09).
//
// XP is shown with `fmtK` (src/chrome/frames/stats-layout.ts): exact under
// 1000 (`540`), then `2.6k`, `25.9k` — the ADR's rule; no formatter here.

import type { RunEvent } from './events';

export type KillRating = 'poor' | 'meh' | 'good' | 'great' | 'superb';

/** Worst to best. */
export const RATING_ORDER: readonly KillRating[] = ['poor', 'meh', 'good', 'great', 'superb'];

/** The badge words. */
export const RATING_LABEL: Readonly<Record<KillRating, string>> = {
  poor: 'Poor',
  meh: 'Meh',
  good: 'Good',
  great: 'Great',
  superb: 'Superb',
};

/** Mob kills in the median. */
export const RATING_WINDOW = 30;
/** Kills needed before anything is rated. */
export const RATING_MIN_KILLS = 5;
/** Upper bounds of Poor, Meh, Good and Great as a ratio to the median. */
export const RATING_BOUNDS: readonly [number, number, number, number] = [0.45, 0.8, 1.5, 2.5];

/** The rating of a ratio to the median. */
export function ratingOf(ratio: number): KillRating {
  const [a, b, c, d] = RATING_BOUNDS;
  if (!(ratio >= a)) return 'poor';
  if (ratio < b) return 'meh';
  if (ratio < c) return 'good';
  if (ratio < d) return 'great';
  return 'superb';
}

/** The median of `xs` (not empty). */
function medianOf(xs: readonly number[]): number {
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface Rated {
  rating: KillRating;
  /** XP / median. */
  ratio: number;
}

/**
 * The run's rating reference, fed kill by kill (O(window) per kill). The
 * Statistics pane keeps one per run and feeds it each new kill event.
 */
export class KillRater {
  private readonly recent: number[] = [];
  private cached: number | null = null;

  /** Adds a kill (`pk`: a pkill, rated but not in the median). */
  add(xp: number, pk = false): void {
    if (pk || !(xp > 0)) return;
    this.recent.push(xp);
    if (this.recent.length > RATING_WINDOW) this.recent.shift();
    this.cached = null;
  }

  /** Adds every kill and pkill of `events`, in order. */
  addEvents(events: readonly RunEvent[]): void {
    for (const e of events) {
      if (e.type === 'kill') this.add(e.xpDelta);
      else if (e.type === 'pkill') this.add(e.xpDelta, true);
    }
  }

  /** Kills in the median now. */
  get count(): number {
    return this.recent.length;
  }

  /** The median, or null while calibrating. */
  get median(): number | null {
    if (this.recent.length < RATING_MIN_KILLS) return null;
    this.cached ??= medianOf(this.recent);
    return this.cached;
  }

  /** The rating of a kill of `xp`, or null while calibrating. */
  rate(xp: number): Rated | null {
    const m = this.median;
    if (m === null || !(m > 0)) return null;
    const ratio = Math.max(0, xp) / m;
    return { rating: ratingOf(ratio), ratio };
  }
}
