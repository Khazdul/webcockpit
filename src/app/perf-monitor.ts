// `#perf`, the latency monitor for real sessions (ADR 0047). It keeps the
// last few thousand measurements in fixed-size rings; `#perf` prints a
// summary from them (src/app/perf-command.ts). Nothing is shown or
// recorded otherwise: no status readout, nothing in the run capture.
//
// What it measures, and where:
// - key → send: the keydown's `timeStamp` to just after `ws.send`, for the
//   first write a typed line or a macro makes in its keydown (App wraps
//   `onCommand` / `onMacroKey` in `keyStart` / `keyEnd`; the keydown is
//   `window.event`).
// - socket buffer: `ws.bufferedAmount` just after each write (Session's
//   `onSend`). It includes the bytes just written.
// - output frames: the output pane's frame scheduler is wrapped. A frame
//   that flushed is timed (script), with the rows and style runs it built;
//   one MessageChannel message posted from the frame runs after that
//   frame's style, layout and paint, which gives "rendered". Received →
//   shown is from the oldest game line's receive time (`Line.ts`) to then.
// - input delay: Event Timing (`event` entries over 16 ms), where supported.
// - long frames: Long Animation Frames (Chromium), with the longest script.
//
// Overhead (ADR 0044 rules 1 and 6): no listener runs per line, nothing
// runs while nothing happens (no timer, no rAF loop), a measurement is a
// few typed-array writes, and nothing reads layout.

/** A DOMHighResTimeStamp clock (ms, `performance.now()`). */
export type Clock = () => number;

/** Count and nearest-rank percentiles of a set of values. */
export interface Stats {
  count: number;
  median: number;
  p95: number;
  p99: number;
  max: number;
}

/** The value at percentile `p` (0–100) of ascending `sorted`, nearest rank. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const rank = Math.ceil((p / 100) * n);
  return sorted[Math.min(n - 1, Math.max(0, rank - 1))]!;
}

/** Stats of `values` (any order); null when there are none. */
export function stats(values: Float64Array): Stats | null {
  if (values.length === 0) return null;
  const s = values.slice().sort();
  return { count: s.length, median: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99), max: s[s.length - 1]! };
}

/** The columns of a ring entry: `v` is the measured value, `a` and `b` context. */
export type RingColumn = 'v' | 'a' | 'b';

/** One ring entry. */
export interface RingEntry {
  t: number;
  v: number;
  a: number;
  b: number;
  label: string;
}

/**
 * A fixed-size ring of measurements: a time, a value, two numbers of
 * context and, if asked for, a label. Writing never allocates (a label is
 * a reference); once full, the oldest entry is overwritten.
 */
export class Ring {
  readonly capacity: number;
  private readonly t: Float64Array;
  private readonly v: Float64Array;
  private readonly a: Float64Array;
  private readonly b: Float64Array;
  private readonly labels: string[] | null;
  /** Writes since the last clear. */
  private writes = 0;

  constructor(capacity: number, labels = false) {
    this.capacity = capacity;
    this.t = new Float64Array(capacity);
    this.v = new Float64Array(capacity);
    this.a = new Float64Array(capacity);
    this.b = new Float64Array(capacity);
    this.labels = labels ? new Array<string>(capacity).fill('') : null;
  }

  push(t: number, v: number, a = 0, b = 0, label = ''): void {
    const i = this.writes % this.capacity;
    this.t[i] = t;
    this.v[i] = v;
    this.a[i] = a;
    this.b[i] = b;
    if (this.labels) this.labels[i] = label;
    this.writes++;
  }

  /** Entries held. */
  get size(): number {
    return Math.min(this.writes, this.capacity);
  }

  /** True when older entries have been overwritten. */
  get wrapped(): boolean {
    return this.writes > this.capacity;
  }

  /** Time of the oldest entry held (NaN when empty). */
  get oldest(): number {
    if (this.writes === 0) return NaN;
    return this.t[this.wrapped ? this.writes % this.capacity : 0]!;
  }

  /** Entry `k` in age order (0 = oldest). */
  entry(k: number): RingEntry {
    const i = this.wrapped ? (this.writes + k) % this.capacity : k;
    return { t: this.t[i]!, v: this.v[i]!, a: this.a[i]!, b: this.b[i]!, label: this.labels?.[i] ?? '' };
  }

  /** The held values of one column (a copy, in storage order). */
  column(col: RingColumn = 'v'): Float64Array {
    return this[col].slice(0, this.size);
  }

  stats(col: RingColumn = 'v'): Stats | null {
    return stats(this.column(col));
  }

  /** The `k` entries with the largest values, largest first. */
  worst(k: number): RingEntry[] {
    const n = this.size;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(i);
    idx.sort((x, y) => this.v[y]! - this.v[x]!);
    return idx.slice(0, k).map((i) => ({ t: this.t[i]!, v: this.v[i]!, a: this.a[i]!, b: this.b[i]!, label: this.labels?.[i] ?? '' }));
  }

  clear(): void {
    this.writes = 0;
    if (this.labels) this.labels.fill('');
  }
}

/** What the output pane reports about its last flush (OutputPane.flushStats). */
export interface FlushSource {
  /** Flushes done; a frame callback that changed it was a flush. */
  readonly flushCount: number;
  readonly flushStats: {
    /** Rows built. */
    readonly rows: number;
    /** Style runs (and styled segments) in them. */
    readonly runs: number;
    /** Receive time of the oldest game line built (µs since the epoch), 0 = none. */
    readonly receivedUs: number;
  };
}

/** Ring sizes (ADR 0047): a few thousand entries, about 200 KB in all. */
export const RING_SIZES = { keys: 2048, sends: 2048, frames: 4096, events: 512, loaf: 256 } as const;

/** How a key sent: Enter on a typed line, or a macro. Stored as `a`. */
export const KEY_ENTER = 0;
export const KEY_MACRO = 1;
/** The names of KEY_ENTER and KEY_MACRO. */
export const KEY_KINDS: readonly string[] = ['enter', 'macro'];

/** Event Timing reports events longer than this (the API's minimum). */
export const EVENT_THRESHOLD_MS = 16;

/** The rings, by measure. */
export interface PerfRings {
  /** v = key -> send ms, a = KEY_ENTER | KEY_MACRO. */
  keys: Ring;
  /** v = bufferedAmount after the write (bytes), a = bytes written. */
  sends: Ring;
  /** v = flush script ms, a = rows, b = style runs. */
  frames: Ring;
  /** v = received -> shown ms, a = rows, b = flush script ms. */
  shown: Ring;
  /** v = input delay ms, a = duration ms, b = processing ms, label = event type. */
  events: Ring;
  /** v = duration ms, a = blocking ms, b = forced style and layout ms, label = longest script. */
  loaf: Ring;
}

export interface PerfMonitorOptions {
  /** Observers, `window.event`, visibility. Default none (unit tests). */
  win?: (Window & typeof globalThis) | null;
  /** Default `performance.now`. */
  now?: Clock;
  /** `performance.timeOrigin` (ms since the epoch). */
  timeOrigin?: number;
}

/** A pending frame: start, script ms, rows, runs, received (perf ms, NaN = none). */
const PEND_FIELDS = 5;
const PEND_MAX = 8;

type EventTimingEntry = PerformanceEntry & { processingStart: number; processingEnd: number };
interface LoafScript {
  duration: number;
  invoker?: string;
  sourceFunctionName?: string;
  sourceURL?: string;
  forcedStyleAndLayoutDuration?: number;
}
type LoafEntry = PerformanceEntry & { blockingDuration?: number; scripts?: readonly LoafScript[] };

export class PerfMonitor {
  readonly rings: PerfRings;
  /** Event Timing is available. */
  readonly eventTiming: boolean;
  /** Long Animation Frames are available. */
  readonly longFrames: boolean;
  readonly timeOrigin: number;
  /** Event Timing's threshold (ms) and the key kinds, for the formatting. */
  readonly eventThreshold = EVENT_THRESHOLD_MS;
  readonly keyKinds = KEY_KINDS;
  /** `now()` at start or the last reset. */
  since: number;
  /** The output pane whose flushes are measured. */
  output: FlushSource | null = null;

  private readonly now: Clock;
  private readonly win: (Window & typeof globalThis) | null;
  private readonly observers: PerformanceObserver[] = [];
  /** The current key's `timeStamp` while a typed line or macro runs; NaN otherwise. */
  private keyTs = NaN;
  private keyKind = KEY_ENTER;
  private channel: MessageChannel | null = null;
  private readonly pend = new Float64Array(PEND_FIELDS * PEND_MAX);
  private pending = 0;
  /** When the page was last shown: nothing hidden can be rendered earlier. */
  private shownAt = 0;
  private disposed = false;

  constructor(opts: PerfMonitorOptions = {}) {
    this.now = opts.now ?? (() => performance.now());
    this.timeOrigin = opts.timeOrigin ?? performance.timeOrigin;
    this.win = opts.win ?? null;
    this.since = this.now();
    this.rings = {
      keys: new Ring(RING_SIZES.keys),
      sends: new Ring(RING_SIZES.sends),
      frames: new Ring(RING_SIZES.frames),
      shown: new Ring(RING_SIZES.frames),
      events: new Ring(RING_SIZES.events, true),
      loaf: new Ring(RING_SIZES.loaf, true),
    };
    const PO = this.win?.PerformanceObserver;
    const types: readonly string[] = PO?.supportedEntryTypes ?? [];
    this.eventTiming = this.observe(PO, types, 'event', (l) => this.onEvents(l), { durationThreshold: EVENT_THRESHOLD_MS });
    this.longFrames = this.observe(PO, types, 'long-animation-frame', (l) => this.onLoaf(l));
    this.win?.document.addEventListener('visibilitychange', this.onVisibility);
  }

  private observe(
    PO: typeof PerformanceObserver | undefined,
    types: readonly string[],
    type: string,
    fn: (list: PerformanceObserverEntryList) => void,
    extra: Record<string, unknown> = {},
  ): boolean {
    if (!PO || !types.includes(type)) return false;
    try {
      const o = new PO((list) => fn(list));
      o.observe({ type, buffered: false, ...extra } as PerformanceObserverInit);
      this.observers.push(o);
      return true;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ keys

  /**
   * A typed line (`KEY_ENTER`) or a macro (`KEY_MACRO`) starts running in
   * the current keydown. Its first write is measured from the keydown.
   */
  keyStart(kind: number): void {
    const ev = this.win?.event;
    this.keyTs = ev && ev.type === 'keydown' ? ev.timeStamp : NaN;
    this.keyKind = kind;
  }

  /** The typed line or macro has run. */
  keyEnd(): void {
    this.keyTs = NaN;
  }

  /** Just after a write to the socket: `bytes` written, `buffered` its `bufferedAmount`. */
  sent(bytes: number, buffered: number): void {
    const t = this.now();
    if (this.keyTs === this.keyTs) {
      this.rings.keys.push(t, Math.max(0, t - this.keyTs), this.keyKind);
      this.keyTs = NaN;
    }
    this.rings.sends.push(t, buffered, bytes);
  }

  // ---------------------------------------------------------------- frames

  /** Wraps the output pane's frame scheduler so each flush is measured. */
  frames(base: (cb: () => void) => void): (cb: () => void) => void {
    return (cb) =>
      base(() => {
        const src = this.output;
        const before = src ? src.flushCount : 0;
        const t0 = this.now();
        cb();
        if (!src || src.flushCount === before || this.disposed) return;
        this.flushed(t0, this.now() - t0, src.flushStats);
      });
  }

  /** A flush ran in the current frame. Exposed for tests. */
  flushed(t0: number, script: number, st: FlushSource['flushStats']): void {
    if (this.pending === PEND_MAX) return;
    const o = this.pending * PEND_FIELDS;
    this.pend[o] = t0;
    this.pend[o + 1] = script;
    this.pend[o + 2] = st.rows;
    this.pend[o + 3] = st.runs;
    this.pend[o + 4] = st.receivedUs > 0 ? st.receivedUs / 1000 - this.timeOrigin : NaN;
    if (this.pending++ > 0) return;
    if (!this.channel) {
      if (typeof MessageChannel === 'undefined') {
        this.rendered();
        return;
      }
      this.channel = new MessageChannel();
      this.channel.port1.onmessage = () => this.rendered();
    }
    // Runs after this frame's style, layout and paint.
    this.channel.port2.postMessage(null);
  }

  /** After the frame(s) that flushed. Exposed for tests. */
  rendered(): void {
    const t = this.now();
    const r = this.rings;
    for (let k = 0; k < this.pending; k++) {
      const o = k * PEND_FIELDS;
      const t0 = this.pend[o]!;
      const script = this.pend[o + 1]!;
      const rows = this.pend[o + 2]!;
      r.frames.push(t0, script, rows, this.pend[o + 3]!);
      const recv = this.pend[o + 4]!;
      if (recv === recv) r.shown.push(t0, Math.max(0, t - Math.max(recv, this.shownAt)), rows, script);
    }
    this.pending = 0;
  }

  private readonly onVisibility = (): void => {
    if (this.win && !this.win.document.hidden) this.shownAt = this.now();
  };

  // ------------------------------------------------------------- observers

  private onEvents(list: PerformanceObserverEntryList): void {
    for (const e of list.getEntries() as EventTimingEntry[]) {
      this.rings.events.push(e.startTime, Math.max(0, e.processingStart - e.startTime), e.duration, e.processingEnd - e.processingStart, e.name);
    }
  }

  private onLoaf(list: PerformanceObserverEntryList): void {
    for (const e of list.getEntries() as LoafEntry[]) {
      let forced = 0;
      let top: LoafScript | null = null;
      for (const s of e.scripts ?? []) {
        forced += s.forcedStyleAndLayoutDuration ?? 0;
        if (!top || s.duration > top.duration) top = s;
      }
      this.rings.loaf.push(e.startTime, e.duration, e.blockingDuration ?? 0, forced, top ? scriptLabel(top) : '');
    }
  }

  // ----------------------------------------------------------------- admin

  /** Empties every ring (`#perf reset`). */
  reset(): void {
    for (const r of Object.values(this.rings) as Ring[]) r.clear();
    this.pending = 0;
    this.since = this.now();
  }

  /** The current time on the monitor's clock. */
  time(): number {
    return this.now();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const o of this.observers) o.disconnect();
    this.observers.length = 0;
    this.win?.document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.channel) this.channel.port1.onmessage = null;
    this.channel = null;
  }
}

/** A LoAF script as `invoker function (file)`, short. */
export function scriptLabel(s: LoafScript): string {
  const file = (s.sourceURL ?? '').replace(/[?#].*$/, '').split('/').pop() ?? '';
  const parts = [s.invoker ?? '', s.sourceFunctionName ?? '', file ? `(${file})` : ''].filter((x) => x !== '');
  return `${parts.join(' ')} ${Math.round(s.duration)} ms`.trim();
}
