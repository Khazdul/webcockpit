// The live figures of the `#perf` overlay (stage 50, ADR 0135, ADR 0047
// addendum): frame rate and worst frame from animation frame intervals,
// and rolling median / p95 of the monitor's rings. Pure: no DOM, no
// timers; src/app/perf-overlay.ts owns the loop and the box.
//
// Why frame intervals: the monitor's "received -> shown" ends after the
// main thread painted the frame (a MessageChannel message from the flush
// frame). In Firefox the composite happens after that, on WebRender's own
// threads, so a slow compositor does not show in it directly. It does show
// in the frame intervals: Firefox's refresh driver waits for the compositor
// to finish the previous frames before it runs the next one, so a backed-up
// compositor stretches the interval between animation frames (and with it
// the next text's wait).

import { percentile, type Ring } from './perf-monitor';

/** Animation frame intervals in a fixed ring: about 17 s at 60 Hz. */
export const FRAME_RING = 1024;

/**
 * Frame intervals, written once per animation frame (one subtraction and
 * two typed-array stores), read a few times a second.
 */
export class FrameMeter {
  private readonly t = new Float64Array(FRAME_RING);
  private readonly dt = new Float64Array(FRAME_RING);
  private writes = 0;
  private last = NaN;

  /** An animation frame at `t` (its rAF timestamp). */
  tick(t: number): void {
    const prev = this.last;
    this.last = t;
    if (prev !== prev) return;
    const i = this.writes % FRAME_RING;
    this.t[i] = t;
    this.dt[i] = t - prev;
    this.writes++;
  }

  /** Forgets the last frame (the loop stopped): the next tick starts a new interval. */
  pause(): void {
    this.last = NaN;
  }

  /** Intervals held. */
  get size(): number {
    return Math.min(this.writes, FRAME_RING);
  }

  /** Frames per second over the intervals that ended in the last `windowMs` (NaN: none). */
  fps(now: number, windowMs = 1000): number {
    let n = 0;
    let sum = 0;
    this.each(now - windowMs, (dt) => {
      n++;
      sum += dt;
    });
    return n > 0 && sum > 0 ? (n * 1000) / sum : NaN;
  }

  /** The longest interval that ended in the last `windowMs` (NaN: none). */
  worst(now: number, windowMs = 5000): number {
    let m = NaN;
    this.each(now - windowMs, (dt) => {
      if (!(dt <= m)) m = dt;
    });
    return m;
  }

  /** Newest first, every interval that ended after `t0`. */
  private each(t0: number, fn: (dt: number) => void): void {
    const n = this.size;
    for (let k = 0; k < n; k++) {
      const i = (this.writes - 1 - k) % FRAME_RING;
      if (this.t[i]! <= t0) break;
      fn(this.dt[i]!);
    }
  }
}

/** Count, median and p95 of a rolling window. */
export interface Rolling {
  count: number;
  median: number;
  p95: number;
}

/** Median and p95 (nearest rank) of the ring's values written after `t0`. */
export function rolling(ring: Ring, t0: number): Rolling {
  const v = ring.valuesSince(t0).sort();
  return { count: v.length, median: percentile(v, 50), p95: percentile(v, 95) };
}

/** Window of the rolling latency figures (ms). */
export const ROLLING_MS = 30_000;
/** Window of the worst frame (ms). */
export const WORST_MS = 5_000;

/** What the overlay shows. */
export interface LiveFigures {
  fps: number;
  worst: number;
  shown: Rolling;
  key: Rolling;
}

export function liveFigures(frames: FrameMeter, shown: Ring, keys: Ring, now: number): LiveFigures {
  return {
    fps: frames.fps(now),
    worst: frames.worst(now, WORST_MS),
    shown: rolling(shown, now - ROLLING_MS),
    key: rolling(keys, now - ROLLING_MS),
  };
}

/** A value in ms: one decimal below 10, else whole; `-` for none. */
export function ms(v: number): string {
  if (!(v === v)) return '-';
  return v < 10 ? v.toFixed(1) : String(Math.round(v));
}

const pair = (r: Rolling): string => (r.count ? `${ms(r.median)} / ${ms(r.p95)} ms` : '-');

/**
 * The overlay's three lines, compact (ASCII `->`, as `#perf`: the bundled
 * fonts need not have an arrow glyph). Latencies are median / p95 over the
 * last 30 s; the worst frame is over the last 5 s.
 */
export function overlayLines(f: LiveFigures): string[] {
  const fps = f.fps === f.fps ? String(Math.round(f.fps)) : '-';
  const worst = f.worst === f.worst ? `${ms(f.worst)} ms` : '-';
  return [`fps ${fps}  worst ${worst}`, `shown ${pair(f.shown)}`, `key ${pair(f.key)}`];
}
