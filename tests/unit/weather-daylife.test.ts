// The day sky's sun rays (owner feedback 52, items 65, 73; ADR 0091, 0093):
// a slow pulse, about every 20 s, between nothing and only just
// perceptible, a little more at midday.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { themeInfo } from '../../src/weather/palette';
import { BIRD_FPS, DAY_FAN, DayLife, DAY_RAYS, GLIMPSE_H_UNKNOWN, GLIMPSE_RAY, PULSE_HIGH, PULSE_LOW, PULSE_S, dayRayAngle, pulseStrength, sunHeight } from '../../src/weather/worker/daylife';
import { sunDrift, sunMid, sunPoint, sunPsi } from '../../src/weather/worker/beams';
import { FPS_SMOOTH, FPS_STILL } from '../../src/weather/worker/env';

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
    // only just perceptible: well under a quarter of the old glimpse's full strength (item 82: fainter than item 73's 0.3)
    expect(PULSE_HIGH).toBeLessThanOrEqual(0.22);
    expect(PULSE_S).toBeGreaterThanOrEqual(15);
    expect(PULSE_S).toBeLessThanOrEqual(25);
  });

  it('is slow enough for the still frame rate: under 0.003 of strength per frame', () => {
    const dt = 1 / FPS_STILL;
    let m = 0;
    for (let t = 0; t < PULSE_S * 0.85; t += 0.05) m = Math.max(m, Math.abs(pulseStrength((t + dt) / (PULSE_S * 0.85), 0.5) - pulseStrength(t / (PULSE_S * 0.85), 0.5)));
    // strength × the ray's alpha is what shows: under 0.01 alpha per frame (each level dithered over many frames, item 84)
    expect(m * GLIMPSE_RAY).toBeLessThan(0.01);
    // subtler than item 82's 0.165 (item 84)
    expect(GLIMPSE_RAY).toBeLessThan(0.165 * 0.85);
  });
});

describe('the day sky\'s rays: few, wide, calm (item 82)', () => {
  const S = new Float32Array(2);
  const deg = (a: number): number => (a * 180) / Math.PI;
  it('spread evenly over about 100° round the sun\'s direction, not bunched', () => {
    const a = Array.from({ length: DAY_RAYS }, (_, i) => dayRayAngle(i, 0, 0) - sunDrift(0)).sort((x, y) => x - y);
    // nine (item 84, was six)
    expect(DAY_RAYS).toBe(9);
    expect(deg(a.at(-1)! - a[0]!)).toBeGreaterThan(75);
    const step = (2 * DAY_FAN) / DAY_RAYS;
    for (let i = 1; i < a.length; i++) {
      expect(a[i]! - a[i - 1]!).toBeGreaterThan(step * 0.6);
      expect(a[i]! - a[i - 1]!).toBeLessThan(step * 1.4);
    }
    // a sun above the top, right of the middle: down-left 35° below level or less and down-right 65° or less (the owner's arrows)
    const W = 2000, H = 1150;
    sunPoint(sunPsi('day', 0.35), W, H, S);
    const mid = sunMid(S[0]!, S[1]!, W, H);
    const below = Array.from({ length: DAY_RAYS }, (_, i) => dayRayAngle(i, mid, 0)).map((x) => ({ left: Math.cos(x) < 0, d: deg(Math.atan2(Math.sin(x), Math.abs(Math.cos(x)))) }));
    expect(Math.min(...below.filter((x) => x.left).map((x) => x.d))).toBeLessThan(35);
    expect(Math.min(...below.filter((x) => !x.left).map((x) => x.d))).toBeLessThan(65);
  });

  it('moves calmly: under 1°/s as the sun crosses the day (in 10 min) and sways', () => {
    let worst = 0;
    for (const [W, H] of [[2000, 1150], [1400, 800], [900, 1000]] as const) {
      const at = (t: number): number[] => {
        sunPoint(sunPsi('day', t / 600), W, H, S);
        const mid = sunMid(S[0]!, S[1]!, W, H);
        return Array.from({ length: DAY_RAYS }, (_, i) => dayRayAngle(i, mid, t));
      };
      let prev = at(0);
      for (let t = 0.5; t <= 600; t += 0.5) {
        const cur = at(t);
        for (let i = 0; i < cur.length; i++) worst = Math.max(worst, deg(Math.abs(cur[i]! - prev[i]!)) / 0.5);
        prev = cur;
      }
    }
    expect(worst).toBeLessThan(1);
  });
});

describe('birds at the screen\'s rate (stage 31b, ADR 0113)', () => {
  /** A canvas whose context accepts every call and records drawImage's arguments. */
  class Cv {
    calls: unknown[][] = [];
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      const calls = this.calls, canvas = this;
      const grad = { addColorStop() {} };
      return new Proxy({ canvas } as Record<string, unknown>, {
        get(t, k) {
          if (k in t) return t[k as string];
          if (k === 'drawImage') return (...a: unknown[]) => void calls.push(a);
          if (k === 'getImageData' || k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(4 * w * h) });
          if (k.toString().startsWith('create')) return () => grad;
          return () => {};
        },
        set(t, k, v) {
          t[k as string] = v;
          return true;
        },
      });
    }
  }
  let saved: unknown;
  beforeEach(() => {
    saved = (globalThis as Record<string, unknown>).OffscreenCanvas;
    (globalThis as Record<string, unknown>).OffscreenCanvas = Cv;
  });
  afterEach(() => {
    (globalThis as Record<string, unknown>).OffscreenCanvas = saved;
  });

  it('ask for FPS_SMOOTH while a flock flies, and are drawn at sub-pixel places', () => {
    const life = new DayLife(themeInfo('#000000'));
    life.resize(1600, 900);
    expect(life.fps()).toBe(0);
    // a small flock in the middle of the screen (out of the left band)
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.7);
    life.birdsNow();
    rnd.mockRestore();
    expect(life.fps()).toBe(BIRD_FPS);
    expect(BIRD_FPS).toBe(FPS_SMOOTH);
    const b = new Cv(1600, 900);
    const ctx = b.getContext() as unknown as Parameters<DayLife['frame']>[0];
    const k = { life: 1, tufts: 0, sun: 0, sunU: 0.5, sx: 0, sy: 0, block: false };
    for (let i = 0; i < 120; i++) life.frame(ctx, 10 + i / 60, 1 / 60, k);
    // the birds' strip copies (9 arguments): their places are not whole pixels
    const at = b.calls.filter((a) => a.length === 9).map((a) => a[5] as number);
    expect(at.length).toBeGreaterThan(0);
    expect(at.some((x) => !Number.isInteger(x))).toBe(true);
  });
});
