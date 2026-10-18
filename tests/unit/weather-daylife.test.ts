// The day sky's sun rays (owner feedback 52, items 65, 73; ADR 0091, 0093):
// a slow pulse, about every 20 s, between nothing and only just
// perceptible, a little more at midday.

import { describe, expect, it } from 'vitest';
import { GLIMPSE_H_UNKNOWN, PULSE_HIGH, PULSE_LOW, PULSE_S, pulseStrength, sunHeight } from '../../src/weather/worker/daylife';
import { FPS_STILL } from '../../src/weather/worker/env';

describe('the day sky\'s rays pulse (item 73)', () => {
  it('the sun stands highest at midday, low at the dawn and dusk hours; unknown counts as mid-morning', () => {
    expect(sunHeight(0)).toBeCloseTo(0, 6);
    expect(sunHeight(1)).toBeCloseTo(0, 6);
    expect(sunHeight(0.5)).toBeCloseTo(1, 6);
    expect(sunHeight(0.25)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(sunHeight(-1)).toBe(GLIMPSE_H_UNKNOWN);
  });

  it('swells from nothing to its peak and back each pulse, a little more at midday', () => {
    for (const u of [0.1, 0.5, 0.9]) {
      expect(pulseStrength(0, u)).toBeCloseTo(0, 9);
      expect(pulseStrength(1, u)).toBeCloseTo(0, 9);
      expect(pulseStrength(0.5, u)).toBeGreaterThanOrEqual(PULSE_LOW);
    }
    expect(pulseStrength(0.5, 0.5)).toBeCloseTo(PULSE_HIGH, 9);
    expect(pulseStrength(0.5, 0)).toBeCloseTo(PULSE_LOW, 9);
    expect(pulseStrength(0.5, 0.1)).toBeLessThan(pulseStrength(0.5, 0.5));
    expect(pulseStrength(0.5, 0.9)).toBeCloseTo(pulseStrength(0.5, 0.1), 9);
    // only just perceptible: well under a third of the old glimpse's full strength
    expect(PULSE_HIGH).toBeLessThanOrEqual(0.35);
    expect(PULSE_S).toBeGreaterThanOrEqual(15);
    expect(PULSE_S).toBeLessThanOrEqual(25);
  });

  it('is slow enough for the still frame rate: under 0.003 of strength per frame', () => {
    const dt = 1 / FPS_STILL;
    let m = 0;
    for (let t = 0; t < PULSE_S * 0.85; t += 0.05) m = Math.max(m, Math.abs(pulseStrength((t + dt) / (PULSE_S * 0.85), 0.5) - pulseStrength(t / (PULSE_S * 0.85), 0.5)));
    // strength × the ray's alpha (0.165) is what shows: under 0.01 alpha per frame
    expect(m * 0.165).toBeLessThan(0.01);
  });
});
