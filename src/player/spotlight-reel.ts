// The Spotlights reel (ADR 0019 "Spotlights", Inv §7.6): loading and the
// reel's arithmetic. No DOM; the info box is src/player/spotlight-box.ts and
// the player wiring src/player/spotlight-mode.ts.
//
// Loading. Every sealed run with a log and its events → `selectSpotlights`
// (Options → Spotlights filters, rotation order). Each spotlight's window is
// then read on its own with `RunLibrary.chainLogRange(runId, prefixFromUs,
// toUs)`: only the chunks around the window (the state prefix of at most
// 10 minutes and the 15 s window), never the whole run, a few at a time.
// MUME sends some state only at login (Char.Name, Char.StatusVars, the first
// full Char.Vitals), so the run's login stretch (its capture start up to
// LOGIN_US after `run_start`) is read too and put before the prefix; the
// timeline keeps only its GMCP / VIEW / SIZE (everything before the window
// is state prefix).
// A window with no visible entry is dropped. The reel opens once every
// window is read: the header's TOTAL, the strip and the markers cover the
// whole reel, and one timeline cannot grow while it plays (a reel of a
// hundred spotlights reads in well under a second).
//
// One reel = one timeline: spotlight i is run i (its window cut from its
// capture, a blank transition first). Spotlight i starts at the playback
// time of its first entry (the blank) and ends where the next one starts
// (or at the end); its moment is `playAtLogUs(tl, atUs, i)`.

import type { RunLibrary } from '../runs/library';
import type { SpotlightSettings } from '../settings';
import { runStartUs } from '../runs/stitch';
import { type Spotlight, emptyState, hasVisibleEntry, selectSpotlights } from '../share/spotlights';
import { type MarkLetter, type PlacedMark, markTip } from './strip';
import { type ChainRun, type Timeline, playAtLogUs } from './timeline';

/** A reel ready to play: spotlights and their cut logs, index for index. */
export interface Reel {
  spots: Spotlight[];
  chain: ChainRun[];
}

export type ReelEmpty = 'no_data' | 'filtered';

/** Windows read at the same time while loading. */
const LOAD_PARALLEL = 4;
/** The login stretch read for its state: up to this long after run_start (µs). */
const LOGIN_US = 10_000_000;

/** The capture timestamp of the first line of `text`, or Infinity. */
function firstTs(text: string): number {
  const t = Number(text.slice(0, 16));
  return text.length >= 16 && Number.isFinite(t) ? t : Infinity;
}

/** The lines of `text` stamped before `us`. */
function linesBefore(text: string, us: number): string {
  let end = 0;
  while (end < text.length) {
    if (!(Number(text.slice(end, end + 16)) < us)) break;
    const nl = text.indexOf('\n', end);
    end = nl < 0 ? text.length : nl + 1;
  }
  return text.slice(0, end);
}

/** Loads the reel, or says which empty state to show. */
export async function loadReel(lib: RunLibrary, filters: SpotlightSettings): Promise<Reel | { empty: ReelEmpty }> {
  const metas = (await lib.store.listRuns()).filter((m) => m.sealed && m.bytes > 0);
  const runs = await Promise.all(metas.map(async (meta) => ({ meta, events: await lib.events([meta.runId]) })));
  const picked = selectSpotlights(runs, filters);
  const metaOf = new Map(metas.map((m) => [m.runId, m]));
  const logs: Array<ChainRun | null> = new Array<ChainRun | null>(picked.length).fill(null);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < picked.length) {
      const i = next++;
      const s = picked[i]!;
      const r = await lib.chainLogRange(s.runId, s.prefixFromUs, s.toUs);
      if (!r || !hasVisibleEntry(r.text, s.fromUs, s.toUs)) continue;
      const meta = metaOf.get(s.runId);
      const from = firstTs(r.text);
      if (meta && meta.startedUs < from) {
        const login = await lib.chainLogRange(s.runId, meta.startedUs, Math.min(runStartUs(meta) + LOGIN_US, from));
        if (login) r.text = linesBefore(login.text, from) + r.text;
      }
      logs[i] = r;
    }
  };
  await Promise.all(Array.from({ length: Math.min(LOAD_PARALLEL, picked.length) }, worker));
  const spots: Spotlight[] = [];
  const chain: ChainRun[] = [];
  picked.forEach((s, i) => {
    const log = logs[i];
    if (!log) return;
    spots.push(s);
    chain.push(log);
  });
  return spots.length > 0 ? { spots, chain } : { empty: emptyState(filters) };
}

// ------------------------------------------------------------ positions

/** Playback time where each spotlight starts (its blank), ms. */
export function spotStarts(tl: Timeline): number[] {
  return tl.runs.map((r) => (r.end > r.first ? tl.play[r.first]! : 0));
}

/** Index of the spotlight playing at `p`: the last one started at or before it. */
export function spotAt(starts: readonly number[], p: number): number {
  let i = 0;
  for (let k = 1; k < starts.length; k++) if (starts[k]! <= p) i = k;
  return i;
}

/** How far into the current spotlight `←` restarts it rather than going back (Inv §7.6). */
export const RESTART_MS = 1500;

/**
 * Where `←` (dir −1) or `→` (+1) goes from `p`, or null for nothing (→ on
 * the last spotlight). ← restarts the current spotlight when more than
 * 1.5 s in, and restarts the first one on the first.
 */
export function navTarget(starts: readonly number[], p: number, dir: -1 | 1): number | null {
  if (starts.length === 0) return null;
  const i = spotAt(starts, p);
  if (dir > 0) return i + 1 < starts.length ? starts[i + 1]! : null;
  if (p - starts[i]! > RESTART_MS || i === 0) return starts[i]!;
  return starts[i - 1]!;
}

/**
 * The moment of each spotlight as a playback time, ms. A moment after the
 * run's last entry falls in the post-roll dwell, where the log time moves
 * on with playback (`playAtLogUs` stops at the last entry).
 */
export function spotMoments(tl: Timeline, spots: readonly Spotlight[]): number[] {
  const starts = spotStarts(tl);
  return spots.map((s, i) => {
    const r = tl.runs[i];
    if (!r || r.end === r.first) return 0;
    const last = r.end - 1;
    if (s.atUs <= tl.ts[last]!) return playAtLogUs(tl, s.atUs, i);
    const end = i + 1 < starts.length ? starts[i + 1]! : tl.durationMs;
    return Math.min(end, tl.play[last]! + (s.atUs - tl.ts[last]!) / 1000);
  });
}

const MARK_OF: Readonly<Record<Spotlight['kind'], MarkLetter>> = {
  pkill: 'K',
  death: 'D',
  level: 'L',
  achievement: 'A',
};

/** Strip markers: one per spotlight at its moment. */
export function reelMarks(tl: Timeline, spots: readonly Spotlight[]): PlacedMark[] {
  return spotMoments(tl, spots).map((offset, i) => {
    const s = spots[i]!;
    return { letter: MARK_OF[s.kind], offset, tip: `${s.character}: ${markTip(s.event, s.level)}` };
  });
}

// ------------------------------------------------------------- info box

/** Info box size: 30 × 7 cells plus the countdown row (Inv §7.6). */
export const BOX_W = 30;
export const BOX_INNER = BOX_W - 2;
/** Top row, and cells in from the right edge (clear of the 2-column strip). */
export const BOX_TOP = 2;
export const BOX_RIGHT = 4;
/** Least cells left of the box; narrower players hide it. */
export const BOX_MARGIN = 2;
/** Half of the countdown bar's full fill (it drains one cell from each side). */
export const BAR_HALF = 10;

/** True when the info box fits in `cols` cells. */
export function boxFits(cols: number): boolean {
  return cols >= BOX_W + BOX_RIGHT + BOX_MARGIN;
}

/**
 * The label on at most two lines of `width` cells: word-wrapped, a word
 * longer than a line cut with `…`, and the second line ending in `…` when
 * the label needs more.
 */
export function labelLines(label: string, width = BOX_INNER): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (cellLen(cur) + 1 + cellLen(w) <= width) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= 2) return lines.map((l) => truncate(l, width));
  // The rest never fits on one line (the wrap is greedy), so it ends in `…`.
  return [truncate(lines[0]!, width), truncate(lines.slice(1).join(' '), width)];
}

/**
 * Half the countdown bar's fill at `p` in a spotlight starting at `start`
 * whose moment is `moment`: BAR_HALF at the start, 0 at the moment and
 * after (and when the moment is at the start).
 */
export function countdownHalf(start: number, moment: number, p: number): number {
  const span = moment - start;
  if (!(span > 0)) return 0;
  const f = Math.max(0, Math.min(1, (moment - p) / span));
  return Math.round(f * BAR_HALF);
}

/** The countdown row (BOX_W cells): `▐` + `█` × 2·half + `▌` centred, or blank. */
export function countdownRow(half: number): string {
  if (half <= 0) return ' '.repeat(BOX_W);
  const bar = '▐' + '█'.repeat(2 * half) + '▌';
  const pad = BOX_W - bar.length;
  return ' '.repeat(pad >> 1) + bar + ' '.repeat(pad - (pad >> 1));
}

/** Length in cells (code points). */
function cellLen(s: string): number {
  return [...s].length;
}

/** `s` cut to `n` cells with `…` when longer. */
function truncate(s: string, n: number): string {
  const cps = [...s];
  return cps.length <= n ? s : cps.slice(0, Math.max(0, n - 1)).join('') + '…';
}

/** `YYYY-MM-DD`, local time. */
export function fmtDate(us: number): string {
  const d = new Date(us / 1000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
