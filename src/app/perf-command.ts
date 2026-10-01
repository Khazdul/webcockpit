// `#perf` on the input line (ADR 0047): the latency monitor's rings
// (src/app/perf-monitor.ts) as rows in the game window. No DOM; unit tested.
//
// Loaded with a dynamic import when `#perf` is typed, so the formatting is
// not on the start-up path. The rows go to the output pane like `#help`
// rows: not on the bus, so nothing records them and no rule fires on them.
//
//   #perf          a summary per measure: count, median, p95, p99, max
//   #perf worst    the ten worst moments, slowest first
//   #perf reset    empties the rings

import type { StyledRow } from '../ui/output-pane';
import { messageWidth } from './messages';
// Types only: the monitor's module stays in the start-up chunk alone.
import type { PerfRings, Ring, RingColumn, RingEntry } from './perf-monitor';

type Seg = StyledRow['segs'][number];

/** What the formatting needs of the monitor (PerfMonitor). */
export interface PerfView {
  readonly rings: PerfRings;
  readonly eventTiming: boolean;
  readonly longFrames: boolean;
  readonly timeOrigin: number;
  readonly since: number;
  /** Event Timing reports events longer than this (ms). */
  readonly eventThreshold: number;
  /** Key kind names by the key ring's `a`. */
  readonly keyKinds: readonly string[];
  time(): number;
  reset(): void;
}

/** Where the page runs: shown in the summary's first row. */
export interface PerfEnv {
  userAgent: string;
  ratio: number;
  /** Wall clock for a monitor time (default: local time of timeOrigin + t). */
  clock?: (epochMs: number) => string;
}

export type PerfAction = 'summary' | 'worst' | 'reset';

/** The action `#perf <arg>` asks for; null for anything else. */
export function parsePerf(arg: string): PerfAction | null {
  const w = arg.trim().replace(/^\{\s*(.*?)\s*\}$/, '$1').toLowerCase();
  if (w === '') return 'summary';
  if ('worst'.startsWith(w)) return 'worst';
  if ('reset'.startsWith(w)) return 'reset';
  return null;
}

export const PERF_USAGE = 'Usage: #perf [worst | reset]';

/** `firefox 132`, `chrome 129` … from a user agent string. */
export function browserName(ua: string): string {
  const m =
    /Firefox\/(\d+)/.exec(ua) ?? /Edg\/(\d+)/.exec(ua) ?? /Chrome\/(\d+)/.exec(ua) ?? /Version\/(\d+)[^ ]* .*Safari/.exec(ua);
  if (!m) return 'unknown browser';
  const name = m[0].startsWith('Firefox') ? 'firefox' : m[0].startsWith('Edg') ? 'edge' : m[0].startsWith('Chrome') ? 'chrome' : 'safari';
  return `${name} ${m[1]}`;
}

/** A span of time, coarse: `45s`, `12m 04s`, `3h 05m`. */
export function span(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** A value in its unit's precision: ms below 10 with one decimal, else whole. */
export function num(v: number, unit: string): string {
  if (!(v === v)) return '-';
  if (unit === 'ms' && v < 10) return v.toFixed(1);
  return String(Math.round(v));
}

interface Measure {
  label: string;
  ring: keyof PerfRings;
  col: RingColumn;
  unit: string;
  /** False: the browser cannot measure it. */
  supported?: (v: PerfView) => boolean;
  /** Shown after the numbers. */
  note?: (v: PerfView) => string;
  /** Shown instead when not supported. */
  missing?: string;
}

const MEASURES: readonly Measure[] = [
  { label: 'key -> send', ring: 'keys', col: 'v', unit: 'ms' },
  { label: 'input delay', ring: 'events', col: 'v', unit: 'ms', supported: (v) => v.eventTiming, note: (v) => `events over ${v.eventThreshold} ms`, missing: 'not supported' },
  { label: 'frame script', ring: 'frames', col: 'v', unit: 'ms' },
  { label: 'received -> shown', ring: 'shown', col: 'v', unit: 'ms' },
  { label: 'rows per frame', ring: 'frames', col: 'a', unit: '' },
  { label: 'runs per frame', ring: 'frames', col: 'b', unit: '' },
  { label: 'long frames', ring: 'loaf', col: 'v', unit: 'ms', supported: (v) => v.longFrames, missing: 'chromium only' },
  { label: 'socket buffer', ring: 'sends', col: 'v', unit: 'B' },
];

const LABEL_W = 18;
const COUNT_W = 6;
const NUM_W = 7;

const ROW_CLS = 'wc-msg';
const DIM = 'wc-msg-state';
const CMD = 'wc-syn-cmd';

/** Cuts `segs` to `width` cells, ending in `…`. */
function fit(segs: readonly Seg[], width: number): Seg[] {
  let left = width;
  const out: Seg[] = [];
  for (const s of segs) {
    if (left <= 0) break;
    if (s.text.length <= left) {
      out.push(s);
      left -= s.text.length;
    } else {
      out.push({ ...s, text: s.text.slice(0, Math.max(0, left - 1)) + '…' });
      left = 0;
    }
  }
  return out;
}

function row(segs: readonly Seg[], width: number): StyledRow {
  return { cls: ROW_CLS, segs: fit(segs, width) };
}

const pad = (s: string, w: number): string => s.padStart(w);

/** The summary: a heading, a column header and one row per measure. */
export function perfSummary(v: PerfView, env: PerfEnv, cols = 0): StyledRow[] {
  const width = messageWidth(cols);
  const now = v.time();
  const ratio = Math.round(env.ratio * 100) / 100;
  const out: StyledRow[] = [
    row([{ text: '#perf', cls: CMD }, { text: ` last ${span(now - v.since)}, ${browserName(env.userAgent)}, pixel ratio ${ratio}`, cls: DIM }], width),
    row(
      [{ text: '  ' + 'measure'.padEnd(LABEL_W) + pad('count', COUNT_W) + ['median', 'p95', 'p99', 'max'].map((h) => pad(h, NUM_W)).join(''), cls: DIM }],
      width,
    ),
  ];
  for (const m of MEASURES) {
    const ring: Ring = v.rings[m.ring];
    const ok = m.supported ? m.supported(v) : true;
    const st = ok ? ring.stats(m.col) : null;
    const nums = st ? [st.median, st.p95, st.p99, st.max] : [NaN, NaN, NaN, NaN];
    const text =
      '  ' +
      m.label.padEnd(LABEL_W) +
      pad(String(st?.count ?? 0), COUNT_W) +
      nums.map((x) => pad(num(x, m.unit), NUM_W)).join('') +
      (m.unit ? ' ' + m.unit : '').padEnd(3);
    const notes: string[] = [];
    if (!ok && m.missing) notes.push(m.missing);
    else {
      if (m.note) notes.push(m.note(v));
      if (ring.wrapped) notes.push(`last ${span(now - ring.oldest)}`);
    }
    const segs: Seg[] = [{ text: notes.length ? text : text.trimEnd() }];
    if (notes.length) segs.push({ text: '  ' + notes.join(', '), cls: DIM });
    out.push(row(segs, width));
  }
  return out;
}

interface Moment {
  t: number;
  what: string;
  v: number;
  context: string;
}

const plural = (n: number, w: string): string => `${Math.round(n)} ${w}${Math.round(n) === 1 ? '' : 's'}`;
const ms = (x: number): string => `${num(x, 'ms')} ms`;

/** What each ring's entries say, for `#perf worst`. */
const MOMENTS: ReadonlyArray<{ ring: keyof PerfRings; what: string; context: (e: RingEntry, v: PerfView) => string }> = [
  { ring: 'keys', what: 'key -> send', context: (e, v) => v.keyKinds[e.a] ?? '' },
  { ring: 'events', what: 'input delay', context: (e) => `${e.label}, handler ${ms(e.b)}, to paint ${ms(e.a)}` },
  { ring: 'frames', what: 'frame script', context: (e) => `${plural(e.a, 'row')}, ${plural(e.b, 'run')}` },
  { ring: 'shown', what: 'received -> shown', context: (e) => `${plural(e.a, 'row')}, script ${ms(e.b)}` },
  { ring: 'loaf', what: 'long frame', context: (e) => [`blocking ${ms(e.a)}`, e.b > 0 ? `forced layout ${ms(e.b)}` : '', e.label].filter(Boolean).join(', ') },
];

/** The `n` worst moments over every timed measure, slowest first. */
export function worstMoments(v: PerfView, n = 10): Moment[] {
  const all: Moment[] = [];
  for (const m of MOMENTS) {
    for (const e of v.rings[m.ring].worst(n)) all.push({ t: e.t, what: m.what, v: e.v, context: m.context(e, v) });
  }
  return all.sort((a, b) => b.v - a.v).slice(0, n);
}

function localClock(epochMs: number): string {
  const d = new Date(epochMs);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
}

/** `#perf worst`: a heading and one row per moment (time, age, what, value, context). */
export function perfWorst(v: PerfView, env: PerfEnv, cols = 0): StyledRow[] {
  const width = messageWidth(cols);
  const moments = worstMoments(v);
  if (moments.length === 0) return [row([{ text: '#perf', cls: CMD }, { text: ' worst' }, { text: ' none', cls: DIM }], width)];
  const now = v.time();
  const clock = env.clock ?? localClock;
  const out: StyledRow[] = [row([{ text: '#perf', cls: CMD }, { text: ' worst, slowest first', cls: DIM }], width)];
  for (const m of moments) {
    const when = `  ${clock(v.timeOrigin + m.t)} ${pad(span(now - m.t), 7)} ago  `;
    out.push(row([{ text: when, cls: DIM }, { text: m.what.padEnd(LABEL_W) + pad(ms(m.v), 9) }, { text: '  ' + m.context, cls: DIM }], width));
  }
  return out;
}

/**
 * What `#perf <arg>` prints in a game pane `cols` cells wide: rows for the
 * output pane, or one line for a system message (a usage hint).
 */
export function perfOutput(arg: string, v: PerfView, env: PerfEnv, cols = 0): StyledRow[] | string {
  const action = parsePerf(arg);
  if (action === null) return PERF_USAGE;
  if (action === 'reset') {
    v.reset();
    return [row([{ text: '#perf', cls: CMD }, { text: ' cleared', cls: DIM }], messageWidth(cols))];
  }
  return action === 'worst' ? perfWorst(v, env, cols) : perfSummary(v, env, cols);
}
