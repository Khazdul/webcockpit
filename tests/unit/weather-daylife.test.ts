// The day's sun glimpses (owner feedback 52, ADR 0091): at least once a
// minute on a clear day, most often, longest and strongest at midday, fewer,
// shorter and fainter at the dawn and dusk hours.

import { describe, expect, it } from 'vitest';
import { GLIMPSE_FPS, GLIMPSE_H_UNKNOWN, planGlimpse, sunHeight } from '../../src/weather/worker/daylife';
import { FPS_SLOW } from '../../src/weather/worker/env';

/** A seeded generator (Park–Miller), so the statistics below are stable. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mean of `n` planned glimpses at `sunU`. */
function mean(sunU: number, n = 4000) {
  const r = seeded();
  let gap = 0, dur = 0, peak = 0, maxGap = 0, minGap = Infinity, maxDur = 0;
  for (let i = 0; i < n; i++) {
    const g = planGlimpse(sunU, r);
    gap += g.gap;
    dur += g.dur;
    peak += g.peak;
    maxGap = Math.max(maxGap, g.gap);
    minGap = Math.min(minGap, g.gap);
    maxDur = Math.max(maxDur, g.dur);
  }
  return { gap: gap / n, dur: dur / n, peak: peak / n, maxGap, minGap, maxDur, perMin: 60 / (gap / n) };
}

describe('sun glimpses through the day', () => {
  it('the sun stands highest at midday, low at the dawn and dusk hours; unknown counts as mid-morning', () => {
    expect(sunHeight(0)).toBeCloseTo(0, 6);
    expect(sunHeight(1)).toBeCloseTo(0, 6);
    expect(sunHeight(0.5)).toBeCloseTo(1, 6);
    expect(sunHeight(0.25)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(sunHeight(-1)).toBe(GLIMPSE_H_UNKNOWN);
  });

  it('comes at least once a minute at any hour of the day, start to start', () => {
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const m = mean(u);
      expect(m.maxGap).toBeLessThanOrEqual(60);
      // a glimpse is over before the next one is due
      expect(m.maxDur).toBeLessThan(m.minGap);
    }
  });

  it('is most frequent, longest and strongest at midday, fewer, shorter and fainter early and late', () => {
    const dawn = mean(0), morning = mean(1 / 6), noon = mean(0.5), afternoon = mean(5 / 6), dusk = mean(1);
    // per minute: ~1.1 at the dawn/dusk hours, ~1.9 at midday
    expect(dawn.perMin).toBeGreaterThan(1);
    expect(dawn.perMin).toBeLessThan(1.25);
    expect(noon.perMin).toBeGreaterThan(1.7);
    expect(noon.perMin).toBeLessThan(2.1);
    expect(morning.perMin).toBeGreaterThan(dawn.perMin);
    expect(morning.perMin).toBeLessThan(noon.perMin);
    expect(afternoon.perMin).toBeCloseTo(morning.perMin, 1);
    expect(dusk.perMin).toBeCloseTo(dawn.perMin, 1);
    // how long and how strong
    expect(dawn.dur).toBeLessThan(morning.dur);
    expect(morning.dur).toBeLessThan(noon.dur);
    expect(dawn.peak).toBeLessThan(morning.peak);
    expect(morning.peak).toBeLessThan(noon.peak);
    expect(noon.peak).toBeLessThanOrEqual(1);
  });

  it('varies: sometimes small and short, sometimes big and long, small ones more often', () => {
    const r = seeded(3);
    const gs = Array.from({ length: 2000 }, () => planGlimpse(0.5, r));
    const peaks = gs.map((g) => g.peak).sort((a, b) => a - b);
    expect(peaks[0]!).toBeLessThan(0.72);
    expect(peaks.at(-1)!).toBeGreaterThan(0.97);
    // the median below the middle of the range (0.7–1)
    expect(peaks[1000]!).toBeLessThan(0.85);
    // bigger means longer: duration and peak come from the same size
    const big = gs.filter((g) => g.peak > 0.9), small = gs.filter((g) => g.peak < 0.75);
    expect(Math.min(...big.map((g) => g.dur))).toBeGreaterThan(Math.max(...small.map((g) => g.dur)));
  });

  it('runs below the drifting-sky rate while it shines', () => {
    expect(GLIMPSE_FPS).toBeLessThan(FPS_SLOW);
  });
});
