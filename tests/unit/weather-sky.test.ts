// The sky's geometry (ADR 0091): the sun and the moon both rise in the east
// (the right side of the screen) and set in the west (the left side; owner
// feedback 38: "The moon disappears in the west.").

import { describe, expect, it } from 'vitest';
import { moonAt, moonPath, sunPos } from '../../src/weather/worker/sky';

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
