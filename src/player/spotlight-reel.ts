// The Spotlights reel (ADR 0019 "Spotlights", Inv §7.6): loading and the
// reel's arithmetic. No DOM; the card is src/player/spotlight-card.ts and
// the player wiring src/player/spotlight-mode.ts.
//
// Loading (`ReelSource`). Every sealed run with a log and its events →
// `selectSpotlights` (the Spotlights settings' filters, ADR 0110; rotation
// order). Each spotlight's window is
// then read on its own with `RunLibrary.chainLogRange(runId, prefixFromUs,
// toUs)`: only the chunks around the window (the state prefix of at most
// 10 minutes and the 15 s window), never the whole run, a few at a time.
// MUME sends some state only at login (Char.Name, Char.StatusVars, the first
// full Char.Vitals), so the run's login stretch (its capture start up to
// LOGIN_US after `run_start`) is read too and put before the prefix; the
// timeline keeps only its GMCP / VIEW / SIZE (everything before the window
// is state prefix).
// A window with no visible entry is dropped. Runs and windows are cached,
// so a rebuild for new settings reads only new windows. The reel opens once every
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
import { OPEN_FILTERS, type Spotlight, type SpotlightRun, emptyState, filtersOpen, hasVisibleEntry, selectSpotlights } from '../share/spotlights';
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

/** What loads a reel for the current settings (`ReelSource`, or a test double). */
export interface ReelLoader {
  load(filters: SpotlightSettings, nowUs: number): Promise<Reel | { empty: ReelEmpty }>;
}

/**
 * Loads reels from the run library. The runs and their events are read once
 * (nothing is recorded while the start page shows), and each spotlight's
 * window once (cached by spotlight id), so a reel rebuilt for new settings
 * (ADR 0110) reads only the windows it has not read yet.
 */
export class ReelSource implements ReelLoader {
  private runsP: Promise<SpotlightRun[]> | null = null;
  private readonly windows = new Map<string, Promise<ChainRun | null>>();

  constructor(private readonly lib: RunLibrary) {}

  /** Sealed runs with a log, with their events. */
  runs(): Promise<SpotlightRun[]> {
    this.runsP ??= (async () => {
      const metas = (await this.lib.store.listRuns()).filter((m) => m.sealed && m.bytes > 0);
      return Promise.all(metas.map(async (meta) => ({ meta, events: await this.lib.events([meta.runId]) })));
    })();
    return this.runsP;
  }

  /** The reel for `filters` at `nowUs`, or which empty state to show. */
  async load(filters: SpotlightSettings, nowUs: number): Promise<Reel | { empty: ReelEmpty }> {
    const runs = await this.runs();
    const picked = selectSpotlights(runs, filters, nowUs);
    const logs: Array<ChainRun | null> = new Array<ChainRun | null>(picked.length).fill(null);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < picked.length) {
        const i = next++;
        logs[i] = await this.window(picked[i]!, runs);
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
    if (spots.length > 0) return { spots, chain };
    // `no_data` only when nothing would show with open filters (ADR 0110).
    return { empty: emptyState(filters, filtersOpen(filters) ? false : selectSpotlights(runs, OPEN_FILTERS, nowUs).length > 0) };
  }

  /** A spotlight's cut log (its login stretch first), or null without a visible entry. */
  private window(s: Spotlight, runs: readonly SpotlightRun[]): Promise<ChainRun | null> {
    let p = this.windows.get(s.id);
    if (!p) {
      p = (async () => {
        const r = await this.lib.chainLogRange(s.runId, s.prefixFromUs, s.toUs);
        if (!r || !hasVisibleEntry(r.text, s.fromUs, s.toUs)) return null;
        const meta = runs.find((x) => x.meta.runId === s.runId)?.meta;
        const from = firstTs(r.text);
        if (meta && meta.startedUs < from) {
          const login = await this.lib.chainLogRange(s.runId, meta.startedUs, Math.min(runStartUs(meta) + LOGIN_US, from));
          if (login) r.text = linesBefore(login.text, from) + r.text;
        }
        return r;
      })();
      this.windows.set(s.id, p);
    }
    return p;
  }
}

/** Loads the reel, or says which empty state to show (a one-off `ReelSource`). */
export function loadReel(lib: RunLibrary, filters: SpotlightSettings, nowUs: number = Date.now() * 1000): Promise<Reel | { empty: ReelEmpty }> {
  return new ReelSource(lib).load(filters, nowUs);
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

/** Rail markers: one per spotlight at its moment. */
export function reelMarks(tl: Timeline, spots: readonly Spotlight[]): PlacedMark[] {
  return spotMoments(tl, spots).map((offset, i) => {
    const s = spots[i]!;
    return { letter: MARK_OF[s.kind], offset, tip: `${s.character}: ${markTip(s.event, s.level)}` };
  });
}

/** `YYYY-MM-DD`, local time. */
export function fmtDate(us: number): string {
  const d = new Date(us / 1000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
