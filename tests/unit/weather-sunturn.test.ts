// The time-driven sunrise and sunset (stage 28 items 60, 61; ADR 0093): the curves
// (sunturn.ts) and the director's turn clock (director.ts).
import { describe, expect, it } from 'vitest';
import { Director, TURN_GUARD_MS, TURN_JOIN_RATE, SKY_RATE, eventState } from '../../src/weather/director';
import { FULL_S, GLIMPSE_LEAD_S, GLOW_FADE_S, LATE_S, RAYS_FADE_S, SET_RAYS_EARLY, SET_STARS_S, TURN_FULL, TURN_RAY_N, glimpseBlocked, turnBeamOn, turnGlint, turnGlow, turnIntensity, turnOn, turnPalette, turnProgress, turnRayOn, turnRays, turnReach, turnShimmer, turnStars, turnWeight } from '../../src/weather/sunturn';

const W0 = 1_800_000_000_000;

describe('sunrise and sunset curves (items 71, 72, 76, 77)', () => {
  const at = (f: (s: number) => number, from: number, to: number, step = 0.1): number[] => {
    const out: number[] = [];
    for (let s = from; s <= to + 1e-9; s += step) out.push(f(s));
    return out;
  };
  /** The largest change of `f` over any `w`-second window from `from` to `to`. */
  const maxChange = (f: (s: number) => number, from: number, to: number, w = 1): number => {
    let m = 0;
    for (let s = from; s + w <= to; s += 0.1) m = Math.max(m, Math.abs(f(s + w) - f(s)));
    return m;
  };
  const KINDS = ['rise', 'set'] as const;

  it('rays: rising evenly to RAYS_FADE_S, then fading softly, gone at the turn', () => {
    for (const kind of KINDS) {
      const r = (x: number): number => turnRays(kind, x);
      expect(r(-60)).toBe(0);
      // rising all the way to its peak at RAYS_FADE_S, then only falling
      const v = at(r, -60, 0);
      const peak = v.indexOf(Math.max(...v));
      expect(-60 + peak * 0.1).toBeCloseTo(RAYS_FADE_S, 0);
      for (let i = 1; i <= peak; i++) expect(v[i]!).toBeGreaterThanOrEqual(v[i - 1]! - 1e-12);
      for (let i = peak + 1; i < v.length; i++) expect(v[i]!).toBeLessThanOrEqual(v[i - 1]! + 1e-12);
      // even: at most 0.04 a second up, at most 0.07 (a sunset's late fade 0.1) a second down
      expect(maxChange(r, -60, RAYS_FADE_S)).toBeLessThan(0.08);
      expect(maxChange(r, -45, RAYS_FADE_S)).toBeLessThan(0.04);
      expect(maxChange(r, RAYS_FADE_S, 0)).toBeLessThan(kind === 'set' ? 0.3 : 0.07);
      expect(r(RAYS_FADE_S + 8)).toBeGreaterThan(0.4);
      expect(r(-0.05)).toBeLessThan(kind === 'set' ? 0.01 : 0.001);
      expect(r(0)).toBe(0);
      expect(turnOn(-0.1)).toBe(true);
      expect(turnOn(0)).toBe(false);
    }
    // a sunrise's softly: barely there 5 s before the day
    expect(turnRays('rise', -5)).toBeLessThan(0.1);
    expect(turnRays('rise', -5)).toBeGreaterThan(0.02);
    // a sunset's late: strong until its last 3 s, then fading out (item 89; was half there at -5, item 83)
    // 40 % down from -16 to -10 s, then the old fade from there (owner item 107)
    expect(turnRays('set', -16)).toBeGreaterThan(0.8);
    expect(turnRays('set', -10)).toBeGreaterThan(0.48);
    expect(turnRays('set', -10)).toBeLessThan(0.6);
    expect(turnRays('set', -4)).toBeGreaterThan(0.42);
    expect(turnRays('set', -2)).toBeGreaterThan(0.21);
    expect(turnRays('set', -1)).toBeLessThan(0.12);
    // a sunset's few rays come in softly over its first 14 s (item 88; were there in 2.5 s), then as before (items 62, 71)
    expect(turnRays('set', -57)).toBeLessThan(0.08);
    expect(turnRays('set', -53)).toBeLessThan(0.35);
    expect(turnRays('set', -46)).toBeCloseTo(SET_RAYS_EARLY + ((1 - SET_RAYS_EARLY) * 14) / (60 + RAYS_FADE_S), 2);
    expect(SET_RAYS_EARLY).toBeGreaterThanOrEqual(0.4);
    // a sunrise's in step with its glow: barely there at first (item 80)
    for (let x = -60; x <= -35; x += 0.5) expect(Math.abs(turnRays('rise', x) - turnGlow('rise', x))).toBeLessThan(0.02);
    expect(turnRays('rise', -57)).toBeLessThan(0.1);
  });

  it('glints: with the rays, a little faster down; a sunrise\'s held back at first (items 80, 81)', () => {
    for (const kind of KINDS) {
      for (let x = -60; x <= 0; x += 0.25) {
        const r = turnRays(kind, x), g = turnGlint(kind, x);
        expect(g).toBeLessThanOrEqual(r + 1e-12);
        // fading with the rays: well under them once they are under half
        if (x > RAYS_FADE_S && r > 0.01 && r < 0.5) expect(g).toBeLessThan(r * 0.75);
      }
      // only falling once the rays fade
      for (let x = RAYS_FADE_S; x < 0; x += 0.25) expect(turnGlint(kind, x + 0.25)).toBeLessThanOrEqual(turnGlint(kind, x) + 1e-12);
      expect(turnGlint(kind, 0)).toBe(0);
    }
    // not so marked at first: a sunrise's glints a fraction of its rays' for the first 10 s
    for (let x = -59; x <= -50; x += 1) expect(turnGlint('rise', x)).toBeLessThan(turnRays('rise', x) * 0.6);
    expect(turnGlint('rise', -40)).toBeGreaterThan(0.25);
  });

  it('a sunrise\'s hazy light comes slowly: in 25 s what came in 3, then growing; gone at the day (item 77)', () => {
    const g = (x: number): number => turnGlow('rise', x);
    expect(g(-60)).toBe(0);
    expect(g(-57)).toBeLessThan(0.1);
    expect(g(-35)).toBeCloseTo(0.6, 2);
    const v = at(g, -60, GLOW_FADE_S);
    for (let i = 1; i < v.length; i++) expect(v[i]!).toBeGreaterThanOrEqual(v[i - 1]!);
    expect(maxChange(g, -60, 0)).toBeLessThan(0.1);
    expect(g(-0.05)).toBeLessThan(0.001);
    expect(g(0)).toBe(0);
    // a sunset's sun is up from the start and goes with its rays
    expect(turnGlow('set', -48)).toBeCloseTo(0.6, 2);
    // and sets at the night's second (item 83)
    expect(turnGlow('set', -5)).toBeGreaterThan(0.35);
    expect(turnGlow('set', -1)).toBeLessThan(0.1);
    expect(turnGlow('set', 0)).toBe(0);
  });

  it('a sunrise\'s order: the stars fade first, then the blue; at the day it is blue and the sun gone (item 77)', () => {
    const st = (x: number): number => turnStars(x, NaN);
    expect(st(-60)).toBe(1);
    expect(st(-50)).toBeCloseTo(0.5, 5);
    expect(st(-30)).toBeLessThanOrEqual(0.1);
    expect(st(-30)).toBeGreaterThan(0.03);
    expect(st(-6)).toBe(0);
    for (let x = -60; x < 0; x += 0.5) expect(st(x + 0.5)).toBeLessThanOrEqual(st(x));
    // the blue over the last 30 s
    expect(turnWeight('rise', -30)).toBe(0);
    expect(turnWeight('rise', -15)).toBeCloseTo(0.5, 5);
    expect(turnWeight('rise', 0)).toBe(1);
    expect(TURN_FULL.rise).toBe(0);
    for (const f of [turnIntensity, turnPalette, (x: number) => turnRays('rise', x), (x: number) => turnGlow('rise', x)]) expect(f(0)).toBe(0);
  });

  it('a sunset\'s order: the blue fades from 10 s in; the stars just perceptible as the sun sets, complete 10 s after (items 76, 88)', () => {
    expect(turnWeight('set', -50)).toBe(0);
    expect(turnWeight('set', -45)).toBeGreaterThan(0);
    // the blue still fairly clear 10 s before the night, weaker at -5, just perceptible at -2 (item 89)
    expect(1 - turnWeight('set', -10)).toBeGreaterThan(0.5);
    expect(1 - turnWeight('set', -5)).toBeLessThan(0.4);
    expect(1 - turnWeight('set', -2)).toBeLessThan(0.2);
    expect(1 - turnWeight('set', -2)).toBeGreaterThan(0.05);
    expect(turnWeight('set', 0)).toBe(1);
    const st = (x: number): number => turnStars(NaN, x);
    expect(st(-60 + 0.1)).toBe(0);
    // none before the night (under 0.15 they do not show), just perceptible at it, about half 5 s in, complete 10 s in (item 88; was -5 … +5, item 83)
    expect(SET_STARS_S).toBe(-3);
    expect(st(SET_STARS_S)).toBe(0);
    expect(st(-1)).toBeLessThan(0.15);
    expect(st(0)).toBeGreaterThan(0.15);
    expect(st(0)).toBeLessThan(0.22);
    expect(st(5)).toBeGreaterThan(0.5);
    expect(st(5)).toBeLessThan(0.65);
    for (let x = -59.75; x < 10; x += 0.25) expect(st(x + 0.25)).toBeGreaterThanOrEqual(st(x));
    // few while the rays are strong (item 76; the sun now sets at 0, the stars start under its last light, item 83)
    for (let x = -60; x < 0; x += 0.1) if (turnRays('set', x) > 0.45) expect(st(x)).toBeLessThan(0.2);
    expect(TURN_FULL.set).toBe(10);
    expect(st(9.95)).toBeGreaterThan(0.99);
    expect(st(10)).toBe(1);
    expect(TURN_FULL.set).toBe(FULL_S);
    // outside a turn the stars are as the sky says
    expect(turnStars(NaN, NaN)).toBe(1);
    expect(turnStars(NaN, TURN_FULL.set + 1)).toBe(1);
  });

  it('a sunset\'s rays fade in one by one, the beams too; a sunrise\'s all come with its glow (item 80)', () => {
    for (let i = 0; i < TURN_RAY_N; i++) expect(turnRayOn('rise', i, -59.9)).toBe(1);
    for (let i = 0; i < 3; i++) expect(turnBeamOn('rise', i, -59.9)).toBe(1);
    const count = (s: number): number => Array.from({ length: TURN_RAY_N }, (_, i) => turnRayOn('set', i, s)).filter((v) => v > 0.5).length;
    // one at a time from the start (item 88; three were there at once)
    expect(count(-59)).toBe(1);
    expect(count(-54)).toBe(1);
    expect(count(-50)).toBe(2);
    expect(count(-46)).toBe(3);
    const counts = [-59, -50, -44, -38, -32, -26, -20].map(count);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    expect(count(-20)).toBe(TURN_RAY_N);
    expect(counts.filter((c, i) => i > 0 && c > counts[i - 1]!).length).toBeGreaterThanOrEqual(4);
    // each fades in over seconds: no ray pops in
    for (let i = 0; i < TURN_RAY_N; i++) expect(maxChange((x) => turnRayOn('set', i, x), -60, 0)).toBeLessThan(0.2);
    for (let i = 0; i < 3; i++) {
      expect(turnBeamOn('set', i, -49)).toBe(0);
      // all there before the rays start to fade
      expect(turnBeamOn('set', i, RAYS_FADE_S)).toBe(1);
      expect(maxChange((x) => turnBeamOn('set', i, x), -60, 0)).toBeLessThan(0.16);
    }
  });

  it('a sunset\'s last seconds: its rays reach far until -3 s, then shrink; the shimmer grows from nothing (item 89)', () => {
    expect(turnReach('set', -3)).toBe(1);
    expect(turnReach('set', -0.01)).toBeLessThan(0.45);
    expect(turnReach('rise', -1)).toBe(1);
    expect(turnShimmer(-60)).toBe(0);
    expect(turnShimmer(-45)).toBeCloseTo(0.5, 6);
    expect(turnShimmer(-30)).toBe(1);
  });

  it('intensity, palette, progress, weight, glow, stars: even, no jerk, nothing snaps', () => {
    const fs: Array<(s: number) => number> = [turnIntensity, turnPalette, turnProgress];
    for (const k of KINDS) fs.push((s) => turnWeight(k, s), (s) => turnGlow(k, s));
    fs.push((s) => turnStars(s, NaN));
    for (const f of fs) {
      const v = at(f, -59.9, FULL_S + 2, 1 / 30);
      for (let i = 1; i < v.length; i++) expect(Math.abs(v[i]! - v[i - 1]!)).toBeLessThan(0.005);
    }
    // a sunset's stars come in 13 s (item 88): no snap
    const v = at((s) => turnStars(NaN, s), -59.9, FULL_S + 2, 1 / 30);
    for (let i = 1; i < v.length; i++) expect(Math.abs(v[i]! - v[i - 1]!)).toBeLessThan(0.0075);
    // the colours and the sun's path move at one pace from the first second to the turn
    expect(turnProgress(-60)).toBe(0);
    expect(turnProgress(-30)).toBeCloseTo(0.5, 9);
    expect(turnProgress(0)).toBe(1);
    expect(maxChange(turnProgress, -60, 0, 10)).toBeCloseTo(10 / 60, 6);
    // the tint and palette start to fade only at GLOW_FADE_S
    expect(turnIntensity(GLOW_FADE_S)).toBeCloseTo(1, 9);
    expect(turnPalette(GLOW_FADE_S)).toBeCloseTo(1, 9);
  });

  it('the day sky\'s rays are held back while a turn runs and just before one (item 64)', () => {
    const N = 1_800_000_000_000;
    expect(glimpseBlocked(N, NaN, NaN, -1, -1)).toBe(false);
    expect(glimpseBlocked(N, -30, NaN, -1, -1)).toBe(true);
    expect(glimpseBlocked(N, NaN, -59, -1, -1)).toBe(true);
    // until the turn's sun is gone, at its second
    expect(glimpseBlocked(N, -1, NaN, -1, -1)).toBe(true);
    expect(glimpseBlocked(N, 1, NaN, -1, -1)).toBe(false);
    const night = N + (60 + GLIMPSE_LEAD_S - 1) * 1000;
    expect(glimpseBlocked(N, NaN, NaN, -1, night)).toBe(true);
    expect(glimpseBlocked(N, NaN, NaN, -1, night + 2000)).toBe(false);
    expect(glimpseBlocked(N, NaN, NaN, N + 30_000, -1)).toBe(true);
    expect(glimpseBlocked(N, NaN, NaN, N - 1000, -1)).toBe(false);
  });
});

/** A director with a wall clock the test moves; `run` ticks it in 0.1 s frames. */
function rig(state: ConstructorParameters<typeof Director>[0], wall = W0) {
  let w = wall;
  const d = new Director();
  d.wall = () => w;
  d.jump({ weather: ' ', clock: 'night', moonUp: false, ...state });
  let t = 0;
  const run = (s: number, each?: () => void): void => {
    for (let i = 0; i < Math.round(s * 10); i++) {
      w += 100;
      d.tick((t += 100), 0.1);
      each?.();
    }
  };
  return { d, run, wall: () => w };
}

describe('Director: the sunrise follows the clock', () => {
  it('runs over the last 60 s of the night: night sky first, the day sky complete at the day (item 77)', () => {
    // the day begins 61 s from now
    const { d, run } = rig({ dayAt: W0 + 61_000 });
    expect(d.riseS).toBeNull();
    run(1);
    expect(d.riseS).toBeCloseTo(-60, 5);
    run(25);
    expect(d.riseS).toBeCloseTo(-35, 5);
    expect(d.mix.sun).toBe(0);
    expect(d.settled.clock).toBe('night');
    run(25);
    expect(d.mix.sun).toBeCloseTo(turnWeight('rise', -10), 5);
    expect(d.mix.sun + d.mix.dark).toBeCloseTo(1, 5);
    run(10.1);
    // the day's first second: the clock is day, the day sky complete
    expect(d.riseS).toBeCloseTo(0.1, 5);
    expect(d.settled.clock).toBe('day');
    expect(d.mix.sun).toBe(1);
    expect(d.mix.dark).toBe(0);
    // the almanac turns the clock to day a little later: nothing jumps
    run(9.9);
    d.set({ clock: 'day' });
    let last = d.mix.sun;
    run(10, () => {
      expect(d.mix.sun).toBeGreaterThanOrEqual(last);
      last = d.mix.sun;
    });
    expect(d.mix.sun).toBe(1);
    run(LATE_S);
    expect(d.riseS).toBeNull();
    expect([d.mix.sun, d.mix.dark, d.mix.night]).toEqual([1, 0, 0]);
  });

  it('a page load or a sync mid-rise joins at its place', () => {
    const { d } = rig({ dayAt: W0 + 10_000 });
    expect(d.riseS).toBeCloseTo(-10, 5);
    expect(d.mix.sun).toBeCloseTo(turnWeight('rise', -10), 5);
    const late = rig({ dayAt: W0 - 5_000 });
    expect(late.d.riseS).toBeCloseTo(5, 5);
    expect(late.d.settled.clock).toBe('day');
    expect(late.d.mix.sun).toBe(1);
    // well into the day (past the join window): no rise
    expect(rig({ dayAt: W0 - 30_000 }).d.riseS).toBeNull();
  });

  it('a small resync glides; a big one snaps, but never back over the day', () => {
    const { d, run } = rig({ dayAt: W0 + 30_000 });
    run(1);
    expect(d.riseS).toBeCloseTo(-29, 5);
    // the clock moves 2 s later: the rise eases back over a few seconds, no jump
    d.set({ dayAt: W0 + 32_000 });
    let last = d.riseS!;
    run(10, () => {
      expect(Math.abs(d.riseS! - last)).toBeLessThan(0.2);
      last = d.riseS!;
    });
    expect(d.riseS).toBeCloseTo(-21, 1);
    // a big jump forward: at once
    d.set({ dayAt: W0 + 13_000 });
    run(0.1);
    expect(d.riseS).toBeCloseTo(-1.9, 5);
    run(15);
    expect(d.riseS!).toBeGreaterThan(4);
    // after the day began, a clock that says it is still the dawn hour does not bring the night back
    const s = d.riseS!;
    d.set({ dayAt: d.wall() + 40_000 });
    run(1);
    expect(d.riseS!).toBeCloseTo(s + 1, 5);
    expect(d.settled.clock).toBe('day');
  });

  it('a sky already day stays day through a rise (a dev jump by day)', () => {
    const { d, run } = rig({ clock: 'day', dayAt: W0 + 20_000 });
    run(10);
    expect(d.riseS).toBeCloseTo(-10, 5);
    expect(d.mix.sun).toBe(1);
  });

  it('the moon in the night part of the sky goes with it', () => {
    const { d, run } = rig({ moonUp: true, dayAt: W0 + 10_000 });
    run(5);
    expect(d.mix.moon).toBeCloseTo(1 - d.mix.sun, 5);
    expect(d.mix.dark).toBe(0);
  });
});

describe('Director: the sunrise without minute precision', () => {
  it('Event.Sun rise starts it at -60 and it runs on its own; a second one is ignored', () => {
    const { d, run } = rig({ dayAt: -1 });
    expect(eventState('sun.rise')).toBeNull();
    d.turnEvent('rise');
    expect(d.riseS).toBe(-60);
    run(30);
    d.turnEvent('rise');
    expect(d.riseS).toBeCloseTo(-30, 5);
    run(30);
    expect(d.settled.clock).toBe('day');
    run(LATE_S + 1);
    expect(d.riseS).toBeNull();
    // the same dawn: no second sunrise
    d.turnEvent('rise');
    expect(d.riseS).toBeNull();
  });

  it('a rise event while the clock-driven one runs is ignored', () => {
    const { d, run } = rig({ dayAt: W0 + 30_000 });
    run(1);
    d.turnEvent('rise');
    expect(d.riseS).toBeCloseTo(-29, 5);
  });

  it('the clock catching up after the event (a sync to the minute) glides it', () => {
    const { d, run, wall } = rig({ dayAt: -1 });
    d.turnEvent('rise');
    run(5);
    d.set({ dayAt: wall() + 56_000 });
    run(10);
    expect(d.riseS).toBeCloseTo(-46, 0);
  });

  it('light without a sunrise: the day sky fades in at the sky rate, without the hold', () => {
    const { d, run } = rig({ dayAt: -1 });
    d.set(eventState('sun.light')!);
    run(6);
    expect(d.mix.sun).toBeCloseTo(6 * SKY_RATE, 5);
    expect(d.riseS).toBeNull();
  });

  it('the demo: from a later point; its turns never hold back the game\'s; a speed change or a jump lifts the guard', () => {
    const { d, run } = rig({ dayAt: -1 });
    d.turnEvent('rise', -25);
    expect(d.riseS).toBe(-25);
    run(25);
    expect(d.riseS).toBeCloseTo(0, 5);
    run(61);
    expect(d.riseS).toBeNull();
    // the demo's sunrise does not count: the game's own may come
    d.turnEvent('rise');
    expect(d.riseS).toBe(-60);
    run(61 + 61);
    expect(d.riseS).toBeNull();
    // a game sunrise does count: no second one this dawn
    d.turnEvent('rise');
    expect(d.riseS).toBeNull();
    // a dev speed change lifts it; a speed runs the turn faster
    d.speed = 3;
    d.turnEvent('rise', -30);
    run(10);
    expect(d.riseS).toBeCloseTo(0, 5);
    d.speed = 1;
    run(70);
    d.jump({ clock: 'night' });
    d.turnEvent('rise', -100);
    expect(d.riseS).toBe(-60);
    expect(TURN_GUARD_MS).toBeGreaterThan(60_000 * 5);
  });
});

describe('Director: the sunset follows the clock (item 61)', () => {
  /** By day, outdoors, the moon down unless given. */
  const day = (state: Parameters<typeof rig>[0]) => rig({ clock: 'day', ...state });

  it('runs over the last 60 s of the day: the blue fades from 10 s in, gone at the night (item 76)', () => {
    const { d, run } = day({ nightAt: W0 + 61_000 });
    expect(d.setS).toBeNull();
    expect(d.mix.sun).toBe(1);
    run(1);
    expect(d.setS).toBeCloseTo(-60, 5);
    expect(d.riseS).toBeNull();
    run(10);
    expect(d.mix.sun).toBeCloseTo(1, 6);
    run(15);
    expect(d.mix.sun).toBeCloseTo(1 - turnWeight('set', -35), 5);
    expect(d.mix.sun).toBeLessThan(0.9);
    expect(d.settled.clock).toBe('day');
    run(25);
    expect(d.mix.sun).toBeCloseTo(1 - turnWeight('set', -10), 5);
    expect(d.mix.night).toBeCloseTo(turnWeight('set', -10), 5);
    run(10.1);
    // the night's first second: the clock is night, the night sky outweighs the day
    expect(d.settled.clock).toBe('night');
    expect(d.mix.dark).toBeGreaterThan(0.7);
    expect(d.mix.sun).toBeLessThan(0.3);
    run(9.9);
    d.set({ clock: 'night' });
    let last = d.mix.sun;
    run(10, () => {
      expect(d.mix.sun).toBeLessThanOrEqual(last);
      last = d.mix.sun;
    });
    expect(d.mix.sun).toBe(0);
    run(LATE_S);
    expect(d.setS).toBeNull();
    expect([d.mix.sun, d.mix.dark, d.mix.night]).toEqual([0, 1, 1]);
  });

  it('a moon up takes the night part; joining mid-set; a small resync glides', () => {
    const { d, run } = day({ moonUp: true, nightAt: W0 + 10_000 });
    expect(d.setS).toBeCloseTo(-10, 5);
    expect(d.mix.moon).toBeCloseTo(turnWeight('set', -10), 5);
    expect(d.mix.dark).toBe(0);
    d.set({ nightAt: W0 + 12_000 });
    let last = d.setS!;
    run(5, () => {
      expect(Math.abs(d.setS! - last)).toBeLessThan(0.2);
      last = d.setS!;
    });
    expect(d.setS!).toBeLessThan(-5.5);
    expect(d.setS!).toBeGreaterThan(-7.1);
  });

  it('never back over the night once it came; never two sunsets in one dusk', () => {
    const { d, run } = day({ nightAt: W0 + 5_000 });
    run(10);
    expect(d.settled.clock).toBe('night');
    const s = d.setS!;
    d.set({ nightAt: d.wall() + 40_000 });
    run(1);
    expect(d.setS!).toBeCloseTo(s + 1, 5);
    d.set({ nightAt: W0 + 5_000 });
    run(LATE_S);
    expect(d.setS).toBeNull();
    d.turnEvent('set');
    expect(d.setS).toBeNull();
  });

  it('Event.Sun set without minute precision starts it at -60; dark alone fades to night at the sky rate', () => {
    expect(eventState('sun.set')).toBeNull();
    expect(eventState('sun.dark')).toEqual({ clock: 'night', sunU: -1 });
    const a = day({ nightAt: -1 });
    a.d.turnEvent('set');
    expect(a.d.setS).toBe(-60);
    a.run(30);
    a.d.turnEvent('set');
    expect(a.d.setS).toBeCloseTo(-30, 5);
    a.run(30);
    expect(a.d.settled.clock).toBe('night');
    const b = day({ nightAt: -1 });
    b.d.set(eventState('sun.dark')!);
    b.run(6);
    expect(b.d.mix.sun).toBeCloseTo(1 - 6 * SKY_RATE, 5);
    expect(b.d.setS).toBeNull();
  });

  it('a sunset starting ends a sunrise still running (the demo), and the other way round', () => {
    const { d, run } = rig({ dayAt: -1, nightAt: -1 });
    d.speed = 3;
    d.turnEvent('rise', -30);
    run(12);
    expect(d.riseS).not.toBeNull();
    const sun = d.mix.sun;
    expect(sun).toBeGreaterThan(0.8);
    d.turnEvent('set', -30);
    expect([d.riseS, d.setS]).toEqual([null, -30]);
    // the sky it had is where the sunset starts from: it glides onto the sunset's curve, no jump
    run(0.1);
    expect(Math.abs(d.mix.sun - sun)).toBeLessThanOrEqual(0.1 * 3 * TURN_JOIN_RATE + 1e-9);
  });

  it('a sunset started mid-way by the demo glides onto its curve and then follows it', () => {
    const { d, run } = day({ nightAt: -1 });
    d.turnEvent('set', -30);
    let last = d.mix.sun;
    run(8, () => {
      expect(last - d.mix.sun).toBeLessThanOrEqual(0.1 * TURN_JOIN_RATE + 1e-9);
      expect(d.mix.sun).toBeLessThanOrEqual(last);
      last = d.mix.sun;
    });
    expect(d.mix.sun).toBeCloseTo(1 - turnWeight('set', -22), 5);
  });
});
