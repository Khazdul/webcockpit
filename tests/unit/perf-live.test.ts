import { describe, expect, it } from 'vitest';
import { FRAME_RING, FrameMeter, ROLLING_MS, liveFigures, ms, overlayLines, rolling } from '../../src/app/perf-live';
import { Ring } from '../../src/app/perf-monitor';

/** Ticks `meter` from `t0` at the given intervals; returns the last time. */
function frames(meter: FrameMeter, t0: number, intervals: number[]): number {
  let t = t0;
  meter.tick(t);
  for (const d of intervals) meter.tick((t += d));
  return t;
}

describe('FrameMeter', () => {
  it('gives the frame rate over the last second', () => {
    const m = new FrameMeter();
    const end = frames(m, 0, Array<number>(120).fill(1000 / 60));
    expect(m.fps(end)).toBeCloseTo(60, 5);
    expect(m.size).toBe(120);
  });

  it('counts only the intervals that ended in the window', () => {
    // 60 fps for 2 s, then 13 fps (75 ms) for the last second.
    const m2 = new FrameMeter();
    const t = frames(m2, 0, [...Array<number>(120).fill(1000 / 60), ...Array<number>(14).fill(75)]);
    expect(m2.fps(t, 1000)).toBeCloseTo(1000 / 75, 5);
    expect(m2.fps(t, 3000)).toBeGreaterThan(1000 / 75);
  });

  it('gives the worst frame of the window', () => {
    const m = new FrameMeter();
    const t = frames(m, 0, [16, 16, 200, 16]);
    expect(m.worst(t, 5000)).toBe(200);
    // Six seconds of 16 ms frames later the 200 ms frame is out of the window.
    const m2 = new FrameMeter();
    const end = frames(m2, 0, [16, 200, ...Array<number>(375).fill(16)]);
    expect(m2.worst(end, 5000)).toBe(16);
    expect(m2.worst(end, 10_000)).toBe(200);
  });

  it('is NaN with no frames, and a pause starts a new interval', () => {
    const m = new FrameMeter();
    expect(m.fps(0)).toBeNaN();
    expect(m.worst(0)).toBeNaN();
    m.tick(0);
    m.tick(16);
    m.pause();
    m.tick(5000);
    m.tick(5016);
    expect(m.size).toBe(2);
    expect(m.worst(5016, 10_000)).toBe(16);
  });

  it('keeps the newest intervals once the ring wraps', () => {
    const m = new FrameMeter();
    const end = frames(m, 0, [500, ...Array<number>(FRAME_RING + 10).fill(10)]);
    expect(m.size).toBe(FRAME_RING);
    expect(m.worst(end, 1e9)).toBe(10);
    expect(m.fps(end)).toBeCloseTo(100, 5);
  });
});

describe('rolling figures', () => {
  it('takes the values written after the window start', () => {
    const r = new Ring(8);
    for (let i = 1; i <= 12; i++) r.push(i * 1000, i);
    // The ring holds 5..12; after t = 8000: 9, 10, 11, 12.
    expect(Array.from(r.valuesSince(8000))).toEqual([12, 11, 10, 9]);
    expect(r.valuesSince(0).length).toBe(8);
    expect(r.valuesSince(20_000).length).toBe(0);
    expect(rolling(r, 8000)).toEqual({ count: 4, median: 10, p95: 12 });
    expect(rolling(new Ring(4), 0)).toEqual({ count: 0, median: NaN, p95: NaN });
  });

  it('builds the overlay figures and lines', () => {
    const meter = new FrameMeter();
    const end = frames(meter, 0, [...Array<number>(60).fill(1000 / 60), 48]);
    const shown = new Ring(64);
    const keys = new Ring(64);
    shown.push(end - ROLLING_MS - 1, 999); // outside the window
    for (const v of [8, 9, 10, 11, 30]) shown.push(end - 100, v);
    keys.push(end - 10, 0.25);
    const f = liveFigures(meter, shown, keys, end);
    expect(f.worst).toBe(48);
    expect(f.shown).toEqual({ count: 5, median: 10, p95: 30 });
    expect(f.key.count).toBe(1);
    expect(overlayLines(f)).toEqual([`fps ${Math.round(f.fps)}  worst 48 ms`, 'shown 10 / 30 ms', 'key 0.3 / 0.3 ms']);
    expect(overlayLines({ fps: NaN, worst: NaN, shown: { count: 0, median: NaN, p95: NaN }, key: { count: 0, median: NaN, p95: NaN } })).toEqual([
      'fps -  worst -',
      'shown -',
      'key -',
    ]);
  });

  it('formats ms', () => {
    expect(ms(0.24)).toBe('0.2');
    expect(ms(9.94)).toBe('9.9');
    expect(ms(16.4)).toBe('16');
    expect(ms(NaN)).toBe('-');
  });
});
