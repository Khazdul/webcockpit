// The left band (stage 28 item 99): one curve for the sky and every weather
// effect over it (src/weather/worker/band.ts).

import { describe, expect, it } from 'vitest';
import { LEFT_DARK, LEFT_SOLID, bandEnd, bandK, bandSolid, leftDark } from '../../src/weather/worker/band';
import { leftDark as skyLeftDark } from '../../src/weather/worker/sky';
import { fogModule } from '../../src/weather/worker/fog';

describe('the left band: one curve for the sky and the weather', () => {
  const W = 2000;

  it('the sky uses the same curve', () => {
    expect(skyLeftDark).toBe(leftDark);
  });

  it('nothing in the solid band, everything right of it, the sky curve between', () => {
    expect(bandSolid(W)).toBeCloseTo(W * LEFT_DARK * LEFT_SOLID, 6);
    expect(bandEnd(W)).toBeCloseTo(W * LEFT_DARK, 6);
    expect(bandK(0, W)).toBe(0);
    expect(bandK(bandSolid(W) - 1, W)).toBe(0);
    expect(bandK(bandEnd(W), W)).toBe(1);
    expect(bandK(W, W)).toBe(1);
    for (let x = bandSolid(W); x <= bandEnd(W); x += 37) expect(bandK(x, W)).toBeCloseTo(1 - leftDark(x / (W * LEFT_DARK)), 9);
    // smooth: no step anywhere along the ramp
    for (let x = 0; x < W; x += 5) expect(Math.abs(bandK(x + 5, W) - bandK(x, W))).toBeLessThan(0.03);
  });

  it('scales with the width; a zero width shows everything', () => {
    expect(bandK(500, 1000)).toBeCloseTo(bandK(1000, 2000), 9);
    expect(bandK(10, 0)).toBe(1);
  });

  it('fog asks the engine to take the band out of its cache', () => {
    const fog = fogModule();
    expect(fog.band).toBe(true);
    expect(fog.scale).toBeLessThan(1);
  });
});
