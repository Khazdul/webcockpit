// Real-play round 2 (stage 28 items 93–96): clouds that come fast, a grey
// that follows them, the left band's smooth ramp, snow visible at once.

import { describe, expect, it } from 'vitest';
import { COVER_TAU_IN, SKY_GREY, coverStep, leftDark, wetOf } from '../../src/weather/worker/sky';
import { SNOW_START } from '../../src/weather/worker/weather';

/** The cover after `s` seconds from `c0` toward `t`, in 1/30 s steps. */
function coverAfter(c0: number, t: number, s: number): number {
  let c = c0;
  for (let i = 0; i < Math.round(s * 30); i++) c = coverStep(c, t, 1 / 30);
  return c;
}

describe('cloud cover: fast, then slower (item 94)', () => {
  it('from clear to snow: most of the sky in ~5–6 s, all of it soon after', () => {
    expect(coverAfter(0, 1, 2)).toBeGreaterThan(0.5);
    expect(coverAfter(0, 1, 5.8)).toBeGreaterThanOrEqual(0.9);
    expect(coverAfter(0, 1, 15)).toBe(1);
    // was a constant 1/40 per s: 0.15 after 6 s
    expect(COVER_TAU_IN).toBeLessThanOrEqual(3);
  });

  it('clearing is a little slower, and reaches clear', () => {
    const up = coverAfter(0, 1, 4), down = 1 - coverAfter(1, 0, 4);
    expect(down).toBeLessThan(up);
    expect(coverAfter(1, 0, 9.5)).toBeLessThanOrEqual(0.1);
    expect(coverAfter(1, 0, 25)).toBe(0);
  });

  it('runs at the dev time scale', () => {
    expect(coverStep(0, 1, 1, 10)).toBeGreaterThan(coverStep(0, 1, 1));
  });
});

describe('the grey follows the clouds (item 95)', () => {
  it('never ahead of the cover; full only once the sky is covered', () => {
    expect(wetOf(1, 0)).toBe(0);
    expect(wetOf(1, 0.3)).toBe(0);
    expect(wetOf(1, 0.6)).toBeLessThan(0.6);
    expect(wetOf(1, 1)).toBe(1);
  });

  it('cloudy is a little grey, rain mostly, heavy rain and snow overcast', () => {
    expect(SKY_GREY['~']).toBeGreaterThan(0);
    expect(SKY_GREY['~']).toBeLessThan(0.4);
    expect(SKY_GREY["'"]).toBeGreaterThan(0.6);
    expect(SKY_GREY['"']).toBe(1);
    expect(SKY_GREY['*']).toBe(1);
    expect(SKY_GREY[' ']).toBeUndefined();
    // `~` at its cover (0.6) keeps its own small grey
    expect(wetOf(SKY_GREY['~']!, 0.6)).toBe(SKY_GREY['~']);
  });
});

describe('left band: a smooth ramp (item 96)', () => {
  it('fully dark at the edge, none at its end, without a kink at either end', () => {
    expect(leftDark(0)).toBe(1);
    expect(leftDark(0.3)).toBe(1);
    expect(leftDark(1)).toBe(0);
    const h = 1e-3;
    // the slope goes to zero at the end (a straight ramp's end read as a bright band)
    expect(Math.abs(leftDark(1) - leftDark(1 - h)) / h).toBeLessThan(0.01);
    for (let x = 0; x < 1; x += 0.05) expect(leftDark(x + 0.05)).toBeLessThanOrEqual(leftDark(x));
  });
});

describe('snow visible at once (item 93)', () => {
  it('starts at half its build-up', () => {
    expect(SNOW_START).toBeGreaterThanOrEqual(0.4);
    expect(SNOW_START).toBeLessThan(1);
  });
});
