// Log player timeline (ADR 0018 "Log player"): a session's runs, parsed
// once into one list of timed entries. Pure (no DOM, no App), so the stage 7
// HTML replay can reuse it with the engine.
//
// Every capture line (src/capture/format.ts) is an entry: inbound text,
// an outbound command, or a GMCP / VIEW / SIZE / SPANE record (unknown records and
// malformed lines are dropped). Entries of all runs are in chain order and
// stored column-wise in typed arrays (a 5 h run is ~100 000 entries):
//
//   run[i]    index of the run (0-based) in `runs`
//   ts[i]     log time, µs since the epoch (the capture timestamp)
//   play[i]   playback time, ms from the chain start (see below)
//   kind[i]   ENTRY_*
//   body      the text after `<ts> ` (and after `> ` / the record type),
//             sliced lazily from the run's text with `start` / `end`
//
// Playback time follows the log time, except that a gap longer than 10 s
// between two entries (inside a run or between runs) takes no playback
// time (Inv §7.5): idle stretches and the pause between two runs of a
// session play instantly, while the log time still jumps by the real gap.
//
// Lead-in (owner feedback 2026-09-28): each run's entries up to and
// including its first visible one (an inbound line with some non-blank
// text, or a command the output echoes) take no playback time either. The
// recorder writes the GMCP of the login phase (Comm.Channel.List at
// connect, then Char.Name after the password) with its receive times, and
// the VIEW / SIZE / Char.Vitals records before the first text; played in
// real time that is seconds of a blank screen. So a run starts showing
// text at once: at 00:00 for the first run, and straight after the last
// entry of the previous run for the others. Nothing is dropped: the
// lead-in's entries are delivered at the same playback time, in order, on
// their own log times.
//
// Edits (stage 7, ADR 0019 "Timeline edits"; none = exactly the above):
//
//   comments   an ENTRY_COMMENT before the first entry with log µs ≥ its
//              anchor (null: after the last entry), on the anchor's log
//              time, followed by its hold: the next entry plays `holdMs`
//              later, while the log time stands still. The engine lets a
//              hold pass at 1× wall rate whatever the speed.
//   cuts       excluded ranges [from, to) (to null = end of log): entries
//              inside (the kept state GMCP / VIEW / SIZE) take no playback
//              time, and the stretch from the last entry before the range
//              to the first one after it plays in at most 500 ms (0 when it
//              is longer than the 10 s gap limit, or in a lead-in).
//              The excluded tail (ADR 0019 addendum "Excluded tail"): the
//              entries inside a cut after the last entry outside every cut
//              are dropped, not played; nothing resumes after them, so
//              their state (later VIEW appearance and layout, room, vitals)
//              would only burst in at the end. Comments anchored there (or
//              at null) follow the last entry taken, in its run.
//   windows    spotlight mode, one per run: entries before `fromUs` are a
//              state prefix (inbound lines and commands dropped, the rest
//              in no time), entries after `toUs` are dropped, and after the
//              run's last entry playback dwells until `toUs`. Each such run
//              starts with an ENTRY_BLANK (`blankLines` blank rows, no
//              time). Runs may be in any time order (the engine rebases the
//              replay clock when a run starts before it).
//
// Mappings (all by binary search):
//   countAt(p)        entries with play ≤ p (what has been shown at p)
//   logUsAt(p)        log time at playback time p (moves with p inside a
//                     kept gap, stands still over a collapsed one)
//   playAtLogUs(us)   playback time of log time us (markers, the cursor)
//   runAt(p)          the run playing at p

import type { RunMeta } from '../capture/store';
import type { RunSummary } from '../runs/summary';
import { PLAYING_COMMANDS } from '../net/session';

/** Gaps longer than this (µs) take no playback time (Inv §7.5). */
export const GAP_COLLAPSE_US = 10_000_000;
/** Longest playback time of a cut, ms (Inv §7.7). */
export const CUT_MAX_MS = 500;

export const ENTRY_IN = 0;
export const ENTRY_OUT = 1;
export const ENTRY_GMCP = 2;
export const ENTRY_VIEW = 3;
export const ENTRY_SIZE = 4;
/** A comment (stage 7): body = the comment text; followed by its hold. */
export const ENTRY_COMMENT = 5;
/** Blank rows before a spotlight window (stage 7); no body, no time. */
export const ENTRY_BLANK = 6;
/** A script pane record (ADR 0053 P1): body = `<id> <json>`. */
export const ENTRY_SPANE = 7;

/** Optional edits of a timeline (ADR 0019); see the file header. */
export interface TimelineEdits {
  comments?: ReadonlyArray<{ beforeUs: number | null; text: string; holdMs: number }>;
  /** Excluded ranges of log µs, [from, to) with to null = end of log. */
  cuts?: ReadonlyArray<readonly [number, number | null]>;
  /** Spotlight mode: the window of run i (inclusive log µs). */
  windows?: ReadonlyArray<{ fromUs: number; toUs: number } | null | undefined>;
  /** Blank rows before each window (default 100). */
  blankLines?: number;
}

/** Blank rows before a spotlight window by default (Inv §7.6). */
export const BLANK_LINES = 100;

/** One run of the chain as the player reads it. */
export interface ChainRun {
  meta: RunMeta;
  /** The run's capture text (RunLibrary.chainLog). */
  text: string;
}

/**
 * What the player reads of a run's metadata (the in-app player's header):
 * a `RunMeta` has it, and an HTML replay's payload carries only this
 * (src/share/payload.ts).
 */
export type PlayedRunMeta = Pick<RunMeta, 'startedUs'> & { summary?: Pick<RunSummary, 'startUs' | 'level'> | null };

/** A run as the timeline takes it: a `ChainRun`, or a payload's run. */
export interface PlayedRun {
  meta: PlayedRunMeta;
  text: string;
}

export interface TimelineRun {
  meta: PlayedRunMeta;
  text: string;
  /** Index of the run's first entry, and one past its last. */
  first: number;
  end: number;
}

export interface Timeline {
  runs: TimelineRun[];
  /** Number of entries. */
  n: number;
  run: Uint16Array;
  kind: Uint8Array;
  ts: Float64Array;
  play: Float64Array;
  start: Uint32Array;
  end: Uint32Array;
  /**
   * Playback length in ms: the last entry's `play` (0 when empty), plus a
   * trailing comment's hold or the last spotlight window's dwell.
   */
  durationMs: number;
  /** Hold after entry i, ms (comments only); empty when there are no comments. */
  hold: Float64Array;
  /** The holds as playback intervals [at, at + ms), in order. */
  holds: Array<{ at: number; ms: number }>;
  /** Comment texts; an ENTRY_COMMENT's `start` indexes this. */
  comments: string[];
  /** Rows of an ENTRY_BLANK. */
  blankLines: number;
}

const TS_DIGITS = 16;

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

/** True when `text[b, e)` has a character other than blanks and SGR sequences. */
export function hasInk(text: string, b: number, e: number): boolean {
  for (let i = b; i < e; i++) {
    const c = text.charCodeAt(i);
    if (c === 27 && text.charCodeAt(i + 1) === 91) {
      // ESC [ … final byte (0x40–0x7E).
      i += 2;
      while (i < e) {
        const f = text.charCodeAt(i);
        if (f >= 0x40 && f <= 0x7e) break;
        i++;
      }
      continue;
    }
    if (c !== 32 && c !== 9 && c !== 13 && c !== 160) return true;
  }
  return false;
}

/** Body start of the line `lineKind` last accepted. */
let bodyStart = 0;

/**
 * The ENTRY_* of the capture line `text[s, e)` (no line end), or -1 when
 * it is no entry (malformed, or an unknown record); sets `bodyStart`.
 */
function lineKind(text: string, s: number, e: number): number {
  if (e - s < TS_DIGITS + 1 || text.charCodeAt(s + TS_DIGITS) !== 32) return -1;
  let ok = true;
  for (let k = s; k < s + TS_DIGITS; k++) {
    if (!isDigit(text.charCodeAt(k))) {
      ok = false;
      break;
    }
  }
  if (!ok) return -1;
  let b = s + TS_DIGITS + 1;
  let k: number = ENTRY_IN;
  const c0 = text.charCodeAt(b);
  if (c0 === 62 && text.charCodeAt(b + 1) === 32 && b + 1 < e) {
    // "> cmd" ("> " alone is an empty Enter); a bare ">" is a prompt.
    k = ENTRY_OUT;
    b += 2;
  } else if (c0 === 27) {
    const c1 = text.charCodeAt(b + 1);
    if (c1 >= 65 && c1 <= 90) {
      const sp = text.indexOf(' ', b);
      const type = text.slice(b + 1, sp < 0 || sp > e ? e : sp);
      if (type === 'GMCP') k = ENTRY_GMCP;
      else if (type === 'VIEW') k = ENTRY_VIEW;
      else if (type === 'SIZE') k = ENTRY_SIZE;
      else if (type === 'SPANE') k = ENTRY_SPANE;
      else return -1;
      if (sp < 0 || sp >= e) return -1; // every known record has a payload
      b = sp + 1;
    }
  }
  bodyStart = b;
  return k;
}

/**
 * Log µs of the last entry of the chain outside every cut (sorted,
 * non-overlapping), or -Infinity when there is none: the entries after it
 * are the excluded tail (also the payload's rule, src/share/payload.ts).
 */
export function lastKeptUs(chain: ReadonlyArray<{ text: string }>, cuts: ReadonlyArray<readonly [number, number | null]>): number {
  for (let r = chain.length - 1; r >= 0; r--) {
    const text = chain[r]!.text;
    let nl = text.length;
    while (nl > 0) {
      let s = text.lastIndexOf('\n', nl - 1);
      const lineEnd = nl;
      nl = s < 0 ? 0 : s;
      s = s < 0 ? 0 : s + 1;
      let e = lineEnd;
      if (e > s && text.charCodeAt(e - 1) === 13) e--;
      if (lineKind(text, s, e) < 0) continue;
      const t = Number(text.slice(s, s + TS_DIGITS));
      if (!inCuts(cuts, t)) return t;
    }
  }
  return -Infinity;
}

/** True when `t` lies in one of `cuts` (sorted, non-overlapping). */
function inCuts(cuts: ReadonlyArray<readonly [number, number | null]>, t: number): boolean {
  let lo = 0;
  let hi = cuts.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cuts[mid]![0] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && t < (cuts[lo - 1]![1] ?? Infinity);
}

/** Parses the runs of a chain (oldest first) into one timeline, with optional edits. */
export function buildTimeline(chain: readonly PlayedRun[], edits?: TimelineEdits): Timeline {
  const comments = edits?.comments
    ? [...edits.comments].sort((a, b) => (a.beforeUs ?? Infinity) - (b.beforeUs ?? Infinity))
    : [];
  const cuts = edits?.cuts ? [...edits.cuts].sort((a, b) => a[0] - b[0]) : [];
  const windows = edits?.windows;
  const blankLines = edits?.blankLines ?? BLANK_LINES;
  // Upper bound on entries: the newlines in every text (+1 each), plus the
  // comments and a blank per run.
  let cap = comments.length + (windows ? chain.length : 0);
  for (const r of chain) {
    let k = 1;
    for (let p = r.text.indexOf('\n'); p >= 0; p = r.text.indexOf('\n', p + 1)) k++;
    cap += k;
  }
  const run = new Uint16Array(cap);
  const kind = new Uint8Array(cap);
  const ts = new Float64Array(cap);
  const play = new Float64Array(cap);
  const start = new Uint32Array(cap);
  const end = new Uint32Array(cap);
  const hold = new Float64Array(comments.length > 0 ? cap : 0);
  const holds: Array<{ at: number; ms: number }> = [];
  const texts: string[] = [];
  const runs: TimelineRun[] = [];
  let n = 0;
  let lastTs = -1;
  let clock = 0;
  let ci = 0;
  let cutI = 0;
  /** Log time before the cut being passed (the last entry before its range), or null. */
  let cutBase: number | null = null;
  /** Entries in a cut after this log µs are the excluded tail: dropped. */
  const tailUs = cuts.length > 0 ? lastKeptUs(chain, cuts) : Infinity;
  /** Run of the last entry taken (trailing comments join it). */
  let lastRun = chain.length - 1;

  const pushComments = (r: number, t: number, upTo: number): void => {
    while (ci < comments.length && (comments[ci]!.beforeUs ?? Infinity) <= upTo) {
      const c = comments[ci++]!;
      run[n] = r;
      kind[n] = ENTRY_COMMENT;
      ts[n] = t;
      play[n] = clock;
      start[n] = texts.length;
      end[n] = 0;
      texts.push(c.text);
      const ms = Math.max(0, c.holdMs);
      hold[n] = ms;
      if (ms > 0) holds.push({ at: clock, ms });
      clock += ms;
      n++;
    }
  };

  for (let r = 0; r < chain.length; r++) {
    const { meta, text } = chain[r]!;
    const win = windows?.[r] ?? null;
    const first = n;
    const len = text.length;
    /** Still in the run's lead-in (nothing visible yet). */
    let lead = true;
    let runLast = -1;
    let pos = 0;
    while (pos < len) {
      let nl = text.indexOf('\n', pos);
      if (nl < 0) nl = len;
      let e = nl;
      if (e > pos && text.charCodeAt(e - 1) === 13) e--;
      const s = pos;
      pos = nl + 1;
      const k = lineKind(text, s, e);
      if (k < 0) continue;
      const b = bodyStart;
      const t = Number(text.slice(s, s + TS_DIGITS));
      if (win) {
        // Spotlight window: the state prefix loses its text, the rest after
        // the window goes.
        if (t > win.toUs) break;
        if (t < win.fromUs && (k === ENTRY_IN || k === ENTRY_OUT)) continue;
        if (n === first) {
          run[n] = r;
          kind[n] = ENTRY_BLANK;
          ts[n] = t;
          play[n] = clock;
          start[n] = 0;
          end[n] = 0;
          n++;
        }
      }
      // Cuts: has one ended since the last entry, or is this entry inside one?
      let passed = false;
      let inCut = false;
      if (cuts.length > 0) {
        while (cutI < cuts.length && (cuts[cutI]![1] ?? Infinity) <= t) {
          if ((cuts[cutI]![1] ?? Infinity) > lastTs) passed = true;
          cutI++;
        }
        inCut = cutI < cuts.length && cuts[cutI]![0] <= t;
        // The excluded tail: no kept entry follows, so nothing resumes.
        if (inCut && t > tailUs) continue;
        if (inCut && cutBase === null) cutBase = lastTs;
      }
      if (lead) {
        // The lead-in and its first visible entry take no playback time.
        if (k === ENTRY_IN ? hasInk(text, b, e) : k === ENTRY_OUT && b < e && !PLAYING_COMMANDS.includes(text.slice(b, e))) {
          lead = false;
        }
      } else if (inCut) {
        // Kept state inside an excluded range: no time.
      } else if (passed) {
        const base = cutBase ?? lastTs;
        const d = t - base;
        if (base >= 0 && d > 0 && d <= GAP_COLLAPSE_US) clock += Math.min(CUT_MAX_MS, d / 1000);
      } else if (lastTs >= 0) {
        const d = t - lastTs;
        if (d > 0 && d <= GAP_COLLAPSE_US) clock += d / 1000;
      }
      if (!inCut) cutBase = null;
      if (comments.length > 0) pushComments(r, t, t);
      lastTs = t;
      runLast = t;
      lastRun = r;
      run[n] = r;
      kind[n] = k;
      ts[n] = t;
      play[n] = clock;
      start[n] = b;
      end[n] = e;
      n++;
    }
    // Spotlight post-roll: dwell until the window's end (never clamped).
    if (win && n > first) clock += Math.max(0, win.toUs - Math.max(runLast, win.fromUs)) / 1000;
    runs.push({ meta, text, first, end: n });
  }
  if (ci < comments.length && chain.length > 0) {
    // After the last entry, in its run (a later, empty run would connect anew).
    pushComments(lastRun, lastTs < 0 ? 0 : lastTs, Infinity);
    runs[lastRun]!.end = n;
    for (let r = lastRun + 1; r < runs.length; r++) runs[r]!.first = runs[r]!.end = n;
  }
  const lastPlay = n > 0 ? play[n - 1]! : 0;
  return {
    runs,
    n,
    run: run.slice(0, n),
    kind: kind.slice(0, n),
    ts: ts.slice(0, n),
    play: play.slice(0, n),
    start: start.slice(0, n),
    end: end.slice(0, n),
    durationMs: n > 0 ? Math.max(lastPlay, clock) : 0,
    hold: hold.length > 0 ? hold.slice(0, n) : hold,
    holds,
    comments: texts,
    blankLines,
  };
}

/** The body text of entry `i` (a comment's text; '' for a blank). */
export function entryText(tl: Timeline, i: number): string {
  const k = tl.kind[i]!;
  if (k === ENTRY_COMMENT) return tl.comments[tl.start[i]!]!;
  if (k === ENTRY_BLANK) return '';
  return tl.runs[tl.run[i]!]!.text.slice(tl.start[i]!, tl.end[i]!);
}

/** Number of entries with `play ≤ p`. */
export function countAt(tl: Timeline, p: number): number {
  let lo = 0;
  let hi = tl.n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (tl.play[mid]! <= p) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Log time (µs) at playback time `p` (ms). */
export function logUsAt(tl: Timeline, p: number): number {
  if (tl.n === 0) return 0;
  const k = countAt(tl, p);
  if (k === 0) return tl.ts[0]!;
  const i = k - 1;
  let dt = Math.max(0, p - tl.play[i]!);
  // The log clock stands still during a comment's hold.
  if (tl.hold.length > 0 && tl.hold[i]! > 0) dt = Math.max(0, dt - tl.hold[i]!);
  const us = tl.ts[i]! + dt * 1000;
  // Runs of a spotlight reel are in any time order: clamp within a run only.
  return i + 1 < tl.n && tl.run[i + 1] === tl.run[i] ? Math.min(us, tl.ts[i + 1]!) : us;
}

/**
 * Playback time (ms) of log time `us`: the entry at or before it, plus the
 * time since, unless the gap after that entry was collapsed. With `run`,
 * only that run's entries are searched (a spotlight reel, whose runs are
 * not in time order); before its first entry that is the run's start.
 */
export function playAtLogUs(tl: Timeline, us: number, run?: number): number {
  if (tl.n === 0) return 0;
  const r = run === undefined ? null : tl.runs[run];
  if (run !== undefined && (!r || r.end === r.first)) return 0;
  const from = r ? r.first : 0;
  const to = r ? r.end : tl.n;
  let lo = from;
  let hi = to;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (tl.ts[mid]! <= us) lo = mid + 1;
    else hi = mid;
  }
  if (lo === from) return r ? tl.play[from]! : 0;
  const i = lo - 1;
  if (i + 1 >= to) return tl.play[i]!;
  const next = tl.play[i + 1]!;
  if (next === tl.play[i]!) return next;
  return Math.min(next, tl.play[i]! + (us - tl.ts[i]!) / 1000);
}

/**
 * Playback time reached `wallMs` of wall time after `p0` at `speed`: holds
 * pass at 1× (ADR 0019), everything else at `speed`.
 */
export function advancePlay(tl: Timeline, p0: number, wallMs: number, speed: number): number {
  const hs = tl.holds;
  if (hs.length === 0) return p0 + wallMs * speed;
  let p = p0;
  let w = wallMs;
  for (let i = firstHoldEndingAfter(hs, p); i < hs.length; i++) {
    const h = hs[i]!;
    if (p < h.at) {
      const need = (h.at - p) / speed;
      if (w <= need) return p + w * speed;
      w -= need;
      p = h.at;
    }
    const rest = h.at + h.ms - p;
    if (w <= rest) return p + w;
    w -= rest;
    p = h.at + h.ms;
  }
  return p + w * speed;
}

/** Wall ms from playback time `p0` to `p1` (≥ p0) at `speed`, holds at 1×. */
export function wallBetween(tl: Timeline, p0: number, p1: number, speed: number): number {
  const hs = tl.holds;
  if (hs.length === 0) return (p1 - p0) / speed;
  let w = 0;
  let p = p0;
  for (let i = firstHoldEndingAfter(hs, p); i < hs.length && p < p1; i++) {
    const h = hs[i]!;
    if (h.at >= p1) break;
    if (p < h.at) {
      w += (h.at - p) / speed;
      p = h.at;
    }
    const e = Math.min(p1, h.at + h.ms);
    w += e - p;
    p = e;
  }
  return w + Math.max(0, p1 - p) / speed;
}

function firstHoldEndingAfter(hs: ReadonlyArray<{ at: number; ms: number }>, p: number): number {
  let lo = 0;
  let hi = hs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (hs[mid]!.at + hs[mid]!.ms <= p) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the run playing at `p` (the run of the last entry shown; 0 before any). */
export function runAt(tl: Timeline, p: number): number {
  const k = countAt(tl, p);
  return k === 0 ? 0 : tl.run[k - 1]!;
}

/**
 * The script pane ids that have records in `tl`, in order of first
 * appearance (the viewer's pane toggles, ADR 0053 P1).
 */
export function scriptPaneIdsOf(tl: Timeline): string[] {
  const seen = new Set<string>();
  for (let i = 0; i < tl.n; i++) {
    if (tl.kind[i] !== ENTRY_SPANE) continue;
    const text = tl.runs[tl.run[i]!]!.text;
    const s = tl.start[i]!;
    const sp = text.indexOf(' ', s);
    if (sp > s && sp < tl.end[i]!) seen.add(text.slice(s, sp));
  }
  return [...seen];
}
