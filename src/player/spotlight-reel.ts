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

import { type Color, type StyleRun, rgb } from '../core/types';
import { PLAYING_COMMANDS } from '../net/session';
import { isPromptLike } from '../net/replay-socket';
import type { RunLibrary } from '../runs/library';
import type { SpotlightSettings } from '../settings';
import { runStartUs } from '../runs/stitch';
import { captureEntries } from '../share/capture';
import { OPEN_FILTERS, type Spotlight, type SpotlightRun, emptyState, filtersOpen, hasVisibleEntry, selectSpotlights } from '../share/spotlights';
import { type MarkLetter, type PlacedMark, markTip } from './strip';
import { type ChainRun, GAP_COLLAPSE_US, type Timeline, hasInk, playAtLogUs } from './timeline';

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

// ------------------------------------------------------------ the wall (stage 46)
//
// The Spotlights page's wall of cards needs, per spotlight, a still of the
// game text at the moment and the spotlight's playing length. Both are
// read straight from the cut window's capture text (already in memory):
// a binary search to the window's first line, then only the window's own
// lines (seconds of text), so a wall of hundreds of cards costs little.

/** One line of a card's still: plain text and its style runs (ANSI kept), or an echoed command. */
export interface StillLine {
  text: string;
  runs: StyleRun[];
  /** A command the output echoes (drawn in the echo colour). */
  cmd?: true;
}

/** Lines in a card's still (a phone shows the last three). */
export const STILL_LINES = 4;
/** The moment's own line may come this long after the moment (µs). */
const STILL_SLACK_US = 250_000;

const TS_LEN = 16;

/** The first line start at or after `p` (`text.length` when none). */
function lineFrom(text: string, p: number): number {
  if (p <= 0) return 0;
  const nl = text.indexOf('\n', p - 1);
  return nl < 0 ? text.length : nl + 1;
}

/** The start of the first line stamped at or after `us` (a capture text is in time order). */
export function seekLine(text: string, us: number): number {
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const s = lineFrom(text, mid);
    if (s >= text.length) {
      hi = mid;
      continue;
    }
    const t = Number(text.slice(s, s + TS_LEN));
    if (!(t >= us)) lo = s + 1;
    else hi = mid;
  }
  return lineFrom(text, lo);
}

/** True for a command the output echoes (not an empty Enter or a width command). */
const echoed = (body: string): boolean => body !== '' && !PLAYING_COMMANDS.includes(body);

/**
 * The SGR state across the lines of a still (MUME may set a colour on one
 * line and reset it on a later one): colours and flags.
 */
class Sgr {
  fg: Color | undefined;
  bg: Color | undefined;
  bold = false;
  italic = false;
  underline = false;
  inverse = false;

  /** Plain text and style runs of an inbound line; the state carries on. */
  line(raw: string): { text: string; runs: StyleRun[] } {
    let text = '';
    const runs: StyleRun[] = [];
    const emit = (s: string): void => {
      if (!s) return;
      const start = text.length;
      text += s;
      if (this.fg === undefined && this.bg === undefined && !this.bold && !this.italic && !this.underline && !this.inverse) return;
      const r: StyleRun = { start, end: text.length };
      if (this.fg !== undefined) r.fg = this.fg;
      if (this.bg !== undefined) r.bg = this.bg;
      if (this.bold) r.bold = true;
      if (this.italic) r.italic = true;
      if (this.underline) r.underline = true;
      if (this.inverse) r.inverse = true;
      const last = runs[runs.length - 1];
      if (
        last &&
        last.end === start &&
        last.fg === r.fg &&
        last.bg === r.bg &&
        last.bold === r.bold &&
        last.italic === r.italic &&
        last.underline === r.underline &&
        last.inverse === r.inverse
      )
        last.end = r.end;
      else runs.push(r);
    };
    let pos = 0;
    while (pos < raw.length) {
      const esc = raw.indexOf('\x1b', pos);
      if (esc < 0) {
        emit(raw.slice(pos));
        break;
      }
      emit(raw.slice(pos, esc));
      if (raw[esc + 1] !== '[') {
        pos = esc + 2;
        continue;
      }
      let end = esc + 2;
      while (end < raw.length) {
        const c = raw.charCodeAt(end);
        if (c >= 0x40 && c <= 0x7e) break;
        end++;
      }
      if (end >= raw.length) break;
      if (raw[end] === 'm') this.apply(raw.slice(esc + 2, end));
      pos = end + 1;
    }
    return { text, runs };
  }

  private apply(params: string): void {
    const ps = params.split(/[;:]/).map((s) => (s === '' ? 0 : Number(s)));
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      if (p === 0) {
        this.fg = this.bg = undefined;
        this.bold = this.italic = this.underline = this.inverse = false;
      } else if (p === 1) this.bold = true;
      else if (p === 3) this.italic = true;
      else if (p === 4) this.underline = true;
      else if (p === 7) this.inverse = true;
      else if (p === 22) this.bold = false;
      else if (p === 23) this.italic = false;
      else if (p === 24) this.underline = false;
      else if (p === 27) this.inverse = false;
      else if (p >= 30 && p <= 37) this.fg = p - 30;
      else if (p === 39) this.fg = undefined;
      else if (p >= 40 && p <= 47) this.bg = p - 40;
      else if (p === 49) this.bg = undefined;
      else if (p >= 90 && p <= 97) this.fg = p - 90 + 8;
      else if (p >= 100 && p <= 107) this.bg = p - 100 + 8;
      else if (p === 38 || p === 48) {
        let c: Color | undefined;
        if (ps[i + 1] === 5 && i + 2 < ps.length) {
          c = ps[i + 2]! & 0xff;
          i += 2;
        } else if (ps[i + 1] === 2 && i + 4 < ps.length) {
          c = rgb(ps[i + 2]!, ps[i + 3]!, ps[i + 4]!);
          i += 4;
        }
        if (c !== undefined) {
          if (p === 38) this.fg = c;
          else this.bg = c;
        }
      }
    }
  }
}

/**
 * A card's still: the last `n` visible lines of spotlight `i` up to its
 * moment (inbound lines with ink and echoed commands; prompts left out),
 * oldest first, with their ANSI styles. A death or a PvP kill ends on its
 * own line (the first visible one at its moment: the room MUME sends
 * after `You are dead!` is left out); a level-up or an achievement, whose
 * moment is the GMCP that told it, takes the text that came with it (up
 * to a quarter second later).
 */
export function spotStill(reel: Reel, i: number, n: number = STILL_LINES): StillLine[] {
  const s = reel.spots[i];
  const run = reel.chain[i];
  if (!s || !run || n <= 0) return [];
  const text = run.text;
  const until = s.atUs + STILL_SLACK_US;
  // A death or a PvP kill is stamped on its own line (`logUs`); a level-up
  // or an achievement on the GMCP that told it, its text in the same packet.
  const exact = 'logUs' in s.event;
  const sgr = new Sgr();
  const out: StillLine[] = [];
  for (const e of captureEntries(text.slice(seekLine(text, s.fromUs)))) {
    if (e.ts > until) break;
    if (e.kind === 'out') {
      if (echoed(e.body)) out.push({ text: e.body, runs: [], cmd: true });
    } else if (e.kind === 'in') {
      const line = sgr.line(e.body);
      if (line.text.trim() === '' || isPromptLike(e.body)) continue;
      out.push(line);
    } else continue;
    if (out.length > n) out.shift();
    if (exact && e.ts >= s.atUs) break;
  }
  return out;
}

/**
 * How long spotlight `i` plays, ms, as the reel's timeline counts it
 * (`buildTimeline` with the windows): from its first visible entry (the
 * lead-in takes no time), each gap of up to 10 s in real time (a longer
 * one none), then the dwell to the window's end.
 */
export function spotLengthMs(reel: Reel, i: number): number {
  const s = reel.spots[i];
  const run = reel.chain[i];
  if (!s || !run) return 0;
  const text = run.text;
  let lead = true;
  let last = -1;
  let ms = 0;
  for (const e of captureEntries(text.slice(seekLine(text, s.fromUs)))) {
    if (e.kind === 'record') continue;
    if (e.ts > s.toUs) break;
    if (lead) {
      if ((e.kind === 'in' && hasInk(e.body, 0, e.body.length)) || (e.kind === 'out' && echoed(e.body))) lead = false;
    } else {
      const d = e.ts - last;
      if (d > 0 && d <= GAP_COLLAPSE_US) ms += d / 1000;
    }
    last = e.ts;
  }
  if (last < 0) return 0;
  return ms + Math.max(0, s.toUs - Math.max(last, s.fromUs)) / 1000;
}

/** The whole reel's playing length, ms (the sum of its spotlights'). */
export function reelLengthMs(reel: Reel): number {
  let ms = 0;
  for (let i = 0; i < reel.spots.length; i++) ms += spotLengthMs(reel, i);
  return ms;
}
