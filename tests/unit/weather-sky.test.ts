// The sky's geometry (ADR 0091): the sun and the moon both rise in the east
// (the right side of the screen) and set in the west (the left side; owner
// feedback 38: "The moon disappears in the west.").

import { describe, expect, it } from 'vitest';
import { MOON_RISE_IN, moonAt, moonClockU, moonLead, moonPath, moonPreU, moonVisU, sunPos } from '../../src/weather/worker/sky';

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

  it('at the game\'s rise the moon is already half inside the right edge, for any window (owner item 63)', () => {
    const o = new Float32Array(2);
    for (const [w, h] of [[1400, 800], [1780, 1040], [1024, 640], [2560, 1400], [800, 600]] as const) {
      const r = Math.round(Math.min(56, Math.max(30, h * 0.05)));
      const P = moonPath(w, h, r), L = moonLead(P, w, r);
      // the way in starts at the path's start, below the right edge
      moonAt(P, moonVisU(-moonPreU(L), L), o);
      expect(o[0]).toBeCloseTo(P.x0, 2);
      // at the rise: the centre MOON_RISE_IN · R inside the edge
      moonAt(P, moonVisU(0, L), o);
      expect(o[0]).toBeCloseTo(w - MOON_RISE_IN * r, 2);
      expect(o[0]).toBeLessThan(w);
      // the set still ends at the path's end
      expect(moonVisU(1, L)).toBe(1);
    }
    // 1400 × 800 → R 40, lead 0.0754 of the path, the way in 58.7 s before the rise
    const P = moonPath(1400, 800, 40), L = moonLead(P, 1400, 40);
    expect(L).toBeCloseTo(120 / 1592, 6);
    expect(moonPreU(L) * 720).toBeCloseTo(58.7, 1);
  });

  it('the clock\'s u: negative before the rise, at the moon\'s pace', () => {
    expect(moonClockU(1_000_000, 1_000_000)).toBe(0);
    expect(moonClockU(1_000_000 - 36_000, 1_000_000)).toBeCloseTo(-0.05, 9);
    expect(moonClockU(1_000_000 + 72_000, 1_000_000)).toBeCloseTo(0.1, 9);
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
