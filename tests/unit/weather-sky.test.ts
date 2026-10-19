// The sky's geometry (ADR 0091): the sun and the moon both rise in the east
// (the right side of the screen) and set in the west (the left side; owner
// feedback 38: "The moon disappears in the west.").

import { describe, expect, it } from 'vitest';
import { MOON_GLIDE_S, MOON_PACE_CAP, MOON_RISE_IN, moonAt, moonClockU, moonGlide, moonLead, moonPath, moonPreU, moonVisU, sunPos } from '../../src/weather/worker/sky';

const W = 1600, H = 900, R = 45;

describe('sky geometry', () => {
  it('the moon rises below the right edge and sets below the left edge', () => {
    const P = moonPath(W, H, R), o = new Float32Array(2);
    moonAt(P, 0, o);
    expect(o[0]).toBeGreaterThan(W + R);
    const [x0, y0] = [o[0]!, o[1]!];
    moonAt(P, 0.5, o);
    expect(o[0]).toBeCloseTo(W / 2, 0);
    expect(o[1]).toBeLessThan(y0);
    moonAt(P, 1, o);
    expect(o[0]).toBeLessThan(-R);
    expect(o[1]).toBeCloseTo(y0, 3);
    // an even pace, east to west
    const xs = [0.1, 0.3, 0.6, 0.9].map((u) => (moonAt(P, u, o), o[0]!));
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeLessThan(xs[i - 1]!);
    expect(x0).toBeGreaterThan(xs[0]!);
  });

  it('the moon waiting for a late set event (u 0.97) is at the left edge', () => {
    const o = new Float32Array(2);
    moonAt(moonPath(W, H, R), 0.97, o);
    expect(o[0]).toBeLessThan(W * 0.05);
  });

  it('at the game\'s rise and set the moon is mostly inside the edge, for any window (owner items 63, 69)', () => {
    const o = new Float32Array(2);
    for (const [w, h] of [[1400, 800], [1780, 1040], [1024, 640], [2560, 1400], [800, 600]] as const) {
      const r = Math.round(Math.min(56, Math.max(30, h * 0.05)));
      const P = moonPath(w, h, r), L = moonLead(P, w, r), pre = moonPreU(L);
      // the way in starts at the path's start below the right edge, the way out ends at its end
      moonAt(P, moonVisU(-pre, L), o);
      expect(o[0]).toBeCloseTo(P.x0, 2);
      moonAt(P, moonVisU(1 + pre, L), o);
      expect(o[0]).toBeCloseTo(P.x1, 2);
      // at the rise: the centre MOON_RISE_IN · R inside the right edge; at the set as far inside the left
      moonAt(P, moonVisU(0, L), o);
      expect(o[0]).toBeCloseTo(w - MOON_RISE_IN * r, 2);
      moonAt(P, moonVisU(1, L), o);
      expect(o[0]).toBeCloseTo(MOON_RISE_IN * r, 2);
    }
    // 1400 × 800 → R 40, lead 0.0754 of the path at each end
    const P = moonPath(1400, 800, 40), L = moonLead(P, 1400, 40);
    expect(L).toBeCloseTo(120 / 1592, 6);
    expect(moonPreU(L)).toBeCloseTo(0.0888, 3);
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
      sunPos('rise', p, W, H, o);
      expect(o[0]).toBeGreaterThan(W * 0.8);
      sunPos('set', p, W, H, o);
      expect(o[0]).toBeLessThan(W * 0.25);
    }
  });
});
