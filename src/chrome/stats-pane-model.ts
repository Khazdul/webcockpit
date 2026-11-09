// The Statistics pane's pure parts (ADR 0134 "Statistics pane"): the kill
// list from a run's events, the tiles, the rating scale's geometry and the
// short time texts. No DOM; unit tested.
//
// - Kills: every `kill` and `pkill` of the run in time order (a pkill's name
//   as `*Name*`). The pane shows the last one on the card and the rest in
//   the Earlier list.
// - The list's bars: a fill of XP / scale, the scale being 3 × the median
//   (so the median tick sits at a third of the bar), or the largest mob kill
//   while the rating is still calibrating.
// - The card's scale: the five ratings on a log2 axis from 0.25× to 4× the
//   median; the marker at the kill's ratio.

import type { RunEvent } from '../runs/events';
import { KillRater, RATING_BOUNDS, RATING_ORDER, type KillRating } from '../runs/kill-rating';
import type { StatsModel } from '../runs/stats';
import { fmtK } from './frames/stats-layout';

/** One kill as the pane shows it. */
export interface KillEntry {
  us: number;
  name: string;
  xp: number;
  /** A pkill (rated against the median, never in it). */
  pk: boolean;
}

/** The run's kills and pkills, oldest first (events in any order). */
export function killEntries(events: readonly RunEvent[]): KillEntry[] {
  const out: KillEntry[] = [];
  for (const e of events) {
    if (e.type === 'kill') out.push({ us: e.us, name: e.mobName, xp: e.xpDelta, pk: false });
    else if (e.type === 'pkill') out.push({ us: e.us, name: `*${e.name}*`, xp: e.xpDelta, pk: true });
  }
  // Stable: kills at the same µs keep their event order.
  return out.map((k, i) => ({ k, i })).sort((a, b) => a.k.us - b.k.us || a.i - b.i).map((x) => x.k);
}

/** A rater fed with `kills` in order. */
export function raterOf(kills: readonly KillEntry[]): KillRater {
  const r = new KillRater();
  for (const k of kills) r.add(k.xp, k.pk);
  return r;
}

/** Where the bars are full: 3 × the median, or the largest mob kill while calibrating (at least 1). */
export const SCALE_PER_MEDIAN = 3;

export function barScale(median: number | null, kills: readonly KillEntry[]): number {
  if (median !== null && median > 0) return median * SCALE_PER_MEDIAN;
  let max = 1;
  for (const k of kills) if (!k.pk && k.xp > max) max = k.xp;
  return max;
}

/** The four tiles' values (text). */
export interface Tiles {
  avg: string;
  median: string;
  xpPerHour: string;
  kills: string;
}

/** Hours below which XP / h is not shown (a single early kill reads as millions). */
const MIN_RATE_US = 60e6;

export function tilesOf(kills: readonly KillEntry[], median: number | null, model: Pick<StatsModel, 'xpGains'> | null, durationUs: number): Tiles {
  let sum = 0;
  for (const k of kills) sum += k.xp;
  let gained = 0;
  for (const g of model?.xpGains ?? []) gained += g.delta;
  return {
    avg: kills.length ? fmtK(sum / kills.length) : '—',
    median: median !== null ? fmtK(median) : '—',
    xpPerHour: durationUs >= MIN_RATE_US ? fmtK((gained * 3600e6) / durationUs) : '—',
    kills: String(kills.length),
  };
}

// ------------------------------------------------------------ the scale

/** A ratio on the card's scale: log2 from 0.25× (0) to 4× (1). */
export function scalePos(ratio: number): number {
  return Math.min(1, Math.max(0, (Math.log2(Math.max(ratio, 0.01)) + 2) / 4));
}

/** The five bands' widths on the scale (fractions, worst first; they sum to 1). */
export function scaleBands(): { rating: KillRating; frac: number }[] {
  const edges = [0, ...RATING_BOUNDS.map(scalePos), 1];
  return RATING_ORDER.map((rating, i) => ({ rating, frac: edges[i + 1]! - edges[i]! }));
}

// ------------------------------------------------------------ times

/** A row's age: `40s`, `12m`, `1h05`. */
export function fmtAge(us: number): string {
  const s = Math.max(0, Math.floor(us / 1e6));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

/** The run clock: `4:07`, `1:12:04`. */
export function fmtRunClock(us: number): string {
  const s = Math.max(0, Math.floor(us / 1e6));
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  return h > 0 ? `${h}:${p2(m)}:${p2(s % 60)}` : `${m}:${p2(s % 60)}`;
}

/** True when `next` is `prev` plus kills at the end (the same run, nothing changed before). */
export function extendsKills(prev: readonly KillEntry[], next: readonly KillEntry[]): boolean {
  if (next.length < prev.length) return false;
  if (prev.length === 0) return true;
  const a = prev[prev.length - 1]!;
  const b = next[prev.length - 1]!;
  const f = prev[0]!;
  const g = next[0]!;
  return a.us === b.us && a.xp === b.xp && a.name === b.name && f.us === g.us && f.name === g.name;
}
