// The sky's geometry (ADR 0091): the sun and the moon both rise in the east
// (the right side of the screen) and set in the west (the left side; owner
// feedback 38: "The moon disappears in the west.").

import { describe, expect, it } from 'vitest';
import { bandK, bandSolid } from '../../src/weather/worker/band';
import { sunPoint, sunPsi } from '../../src/weather/worker/beams';
import { MOON_GLIDE_S, MOON_PACE_CAP, moonAt, moonBandK, moonClockU, moonGlide, moonPath } from '../../src/weather/worker/sky';

const W = 1600, H = 900, R = 45;

describe('sky geometry', () => {
  it('the moon rises at the right edge and sets into the left band (owner item 100)', () => {
    const P = moonPath(W, H, R), o = new Float32Array(2);
    moonAt(P, 0, o);
    // at the rise the disc just touches the right edge from outside: it comes into view at the rise
    expect(o[0]).toBeCloseTo(W + R, 3);
    const [x0, y0] = [o[0]!, o[1]!];
    moonAt(P, 0.5, o);
    expect(o[1]).toBeLessThan(y0);
    // at the set its centre is where the sky's left fade is complete: faded out exactly then
    moonAt(P, 1, o);
    expect(o[0]).toBeCloseTo(bandSolid(W), 3);
    expect(bandK(o[0]!, W)).toBe(0);
    expect(o[1]).toBeCloseTo(y0, 3);
    // fully visible (as far as the band goes) until it reaches the band, then fading by its curve
    for (const u of [0.1, 0.3, 0.4]) {
      moonAt(P, u, o);
      expect(bandK(o[0]!, W)).toBe(1);
    }
    moonAt(P, 0.9, o);
    expect(bandK(o[0]!, W)).toBeGreaterThan(0);
    expect(bandK(o[0]!, W)).toBeLessThan(1);
    // an even pace, east to west
    const xs = [0.1, 0.3, 0.6, 0.9].map((u) => (moonAt(P, u, o), o[0]!));
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeLessThan(xs[i - 1]!);
    expect(x0).toBeGreaterThan(xs[0]!);
  });

  it('the moon stays visible into its last seconds up and is gone at the set (owner 2026-10-20)', () => {
    for (const [w, h] of [[1600, 900], [2560, 1400], [1024, 640]] as const) {
      const r = Math.round(Math.min(56, Math.max(30, h * 0.05)));
      const P = moonPath(w, h, r), o = new Float32Array(2);
      // 720 s up: u at s seconds before the set
      const k = (s: number): number => (moonAt(P, 1 - s / 720, o), moonBandK(o[0]!, w));
      expect(k(400)).toBe(1);
      expect(k(60)).toBeGreaterThan(0.3);
      expect(k(10)).toBeGreaterThan(0.12);
      expect(k(0)).toBeLessThan(0.001);
      // fading the whole way, never back up
      for (let s = 299; s >= 0; s--) expect(k(s)).toBeLessThanOrEqual(k(s + 1));
    }
  });

  it('the waiting place without a clock is right of the band, for any window (item 100)', () => {
    for (const [w, h] of [[1400, 800], [1780, 1040], [1024, 640], [2560, 1400], [800, 600]] as const) {
      const r = Math.round(Math.min(56, Math.max(30, h * 0.05)));
      const P = moonPath(w, h, r);
      // the waiting place without a clock (MOON_HOLD 0.45) is still right of the band
      const o = new Float32Array(2);
      moonAt(P, 0.45, o);
      expect(bandK(o[0]!, w)).toBe(1);
    }
  });

  it('the clock places the moon by time alone: a pause (hidden tab) changes nothing (item 69)', () => {
    const rise = 1_000_000, set = rise + 745_000;
    expect(moonClockU(rise, rise, set)).toBe(0);
    expect(moonClockU(set, rise, set)).toBe(1);
    expect(moonClockU(rise - 74_500, rise, set)).toBeCloseTo(-0.1, 9);
    // 5 minutes away and back: the place is where the time says, however many frames there were
    expect(moonClockU(rise + 300_000, rise, set)).toBeCloseTo(300 / 745, 9);
  });

  it('a correction changes the pace by at most half; a big one is not glided (item 69)', () => {
    const n = 1 / 745, dt = 0.1;
    // on its place: one even step
    expect(moonGlide(0.3, 0.3 + n * dt, n, dt)).toBeCloseTo(0.3 + n * dt, 12);
    // a few seconds behind: at most 1.5 × its pace
    expect(moonGlide(0.3, 0.3 + 5 * n, n, dt)).toBeCloseTo(0.3 + (1 + MOON_PACE_CAP) * n * dt, 12);
    // ahead: at least half its pace (it never stops or goes back)
    expect(moonGlide(0.3, 0.3 - 5 * n, n, dt)).toBeCloseTo(0.3 + (1 - MOON_PACE_CAP) * n * dt, 12);
    // more than the cap takes up in MOON_GLIDE_S: fade and place instead
    expect(moonGlide(0.1, 0.1 + n * dt + n * (MOON_PACE_CAP * MOON_GLIDE_S + 1), n, dt)).toBeNull();
    expect(moonGlide(0.1, 0.41, n, dt)).toBeNull();
    // a 3 s resync is taken up in 6 s at 1.5 ×
    let u = 0.2, tu = 0.2 + 3 * n;
    for (let i = 0; i < 70; i++) {
      tu += n * dt;
      u = moonGlide(u, tu, n, dt)!;
    }
    expect(u).toBeCloseTo(tu, 9);
  });

  it('the sun rises on the right and sets on the left, like the moon', () => {
    const o = new Float32Array(2);
    for (const p of [0, 0.5, 1]) {
      sunPoint(sunPsi('rise', p), W, H, o);
      expect(o[0]).toBeGreaterThan(W * 0.8);
      sunPoint(sunPsi('set', p), W, H, o);
      expect(o[0]).toBeLessThan(W * 0.25);
    }
  });
});
