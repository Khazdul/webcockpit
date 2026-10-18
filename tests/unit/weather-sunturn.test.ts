// The time-driven sunrise and sunset (stage 28 items 60, 61; ADR 0093): the curves
// (sunturn.ts) and the director's turn clock (director.ts).
import { describe, expect, it } from 'vitest';
import { Director, TURN_GUARD_MS, SKY_RATE, eventState } from '../../src/weather/director';
import { FULL_S, GLIMPSE_LEAD_S, LATE_S, RAYS_FADE_S, TURN_RAYS, TURN_RAY_N, glimpseBlocked, turnBeamOn, turnFade, turnIntensity, turnOn, turnPalette, turnProgress, turnRayOn, turnRays, turnWeight } from '../../src/weather/sunturn';

const W0 = 1_800_000_000_000;

describe('sunrise and sunset curves (items 71, 72)', () => {
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

  it('rays: a few from the first seconds, rising evenly to the turn, no jerk', () => {
    for (const kind of ['rise', 'set'] as const) {
      const e = TURN_RAYS[kind].early, r = (x: number): number => turnRays(kind, x);
      expect(r(-60)).toBe(0);
      expect(r(-57)).toBeCloseTo(e + ((1 - e) * 3) / 57, 2);
      // rising all the way to its peak near the turn, then only falling
      const v = at(r, -60, FULL_S);
      const peak = v.indexOf(Math.max(...v));
      const ps = -60 + peak * 0.1;
      expect(ps).toBeGreaterThan(-12);
      expect(ps).toBeLessThan(1);
      for (let i = 1; i <= peak; i++) expect(v[i]!).toBeGreaterThanOrEqual(v[i - 1]! - 1e-12);
      for (let i = peak + 1; i < v.length; i++) expect(v[i]!).toBeLessThanOrEqual(v[i - 1]! + 1e-12);
      // even: after the first 3 s, at most 0.03 a second up, at most 0.1 a second down
      expect(maxChange(r, -57, ps)).toBeLessThan(0.03);
      expect(maxChange(r, ps, FULL_S)).toBeLessThan(0.06);
      // halfway through the build-up, about halfway up
      expect(r(-30)).toBeGreaterThan(e + (1 - e) * 0.4);
      expect(r(-30)).toBeLessThan(e + (1 - e) * 0.6);
    }
    // set by eye per kind (a sunrise's first rays pass behind the right dock's panes, item 75)
    for (const k of ['rise', 'set'] as const) expect(TURN_RAYS[k].early).toBeGreaterThanOrEqual(0.4);
  });

  it('the rays fade as the new sky comes and are gone exactly when it is complete', () => {
    for (const kind of ['rise', 'set'] as const) {
      const r = (x: number): number => turnRays(kind, x);
      // not fading before the new sky is perceptible
      for (let s = -60; s <= RAYS_FADE_S; s += 0.5) expect(turnFade(s)).toBe(1);
      expect(turnWeight(RAYS_FADE_S)).toBeGreaterThan(0.35);
      expect(turnWeight(RAYS_FADE_S)).toBeLessThan(0.45);
      // slowly: still more than a third there 10 s into the day or night
      expect(r(10)).toBeGreaterThan(0.3);
      expect(r(0)).toBeGreaterThan(0.4);
      expect(r(FULL_S - 3)).toBeGreaterThan(0);
      expect(r(FULL_S - 0.05)).toBeLessThan(0.005);
      expect(r(FULL_S)).toBe(0);
      expect(turnWeight(FULL_S)).toBe(1);
      expect(turnOn(FULL_S - 0.1)).toBe(true);
      expect(turnOn(FULL_S)).toBe(false);
    }
    expect(FULL_S).toBeLessThanOrEqual(20);
  });

  it('more rays fade in one by one; the beams too', () => {
    const count = (s: number): number => Array.from({ length: TURN_RAY_N }, (_, i) => turnRayOn(i, s)).filter((v) => v > 0.5).length;
    expect(count(-59)).toBe(3);
    const counts = [-59, -50, -44, -38, -32, -26, -20].map(count);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    expect(count(-20)).toBe(TURN_RAY_N);
    expect(counts.filter((c, i) => i > 0 && c > counts[i - 1]!).length).toBeGreaterThanOrEqual(4);
    // each fades in over seconds: no ray pops in
    for (let i = 0; i < TURN_RAY_N; i++) expect(maxChange((x) => turnRayOn(i, x), -60, 0)).toBeLessThan(0.2);
    for (let i = 0; i < 3; i++) {
      expect(turnBeamOn(i, -45)).toBe(0);
      expect(turnBeamOn(i, -15)).toBe(1);
      expect(maxChange((x) => turnBeamOn(i, x), -60, 0)).toBeLessThan(0.16);
    }
  });

  it('intensity, palette, progress, weight: even, no jerk, nothing snaps', () => {
    for (const f of [turnIntensity, turnPalette, turnWeight, turnProgress]) {
      const v = at(f, -61, FULL_S + 2, 1 / 30);
      for (let i = 1; i < v.length; i++) expect(Math.abs(v[i]! - v[i - 1]!)).toBeLessThan(0.005);
    }
    // the colours and the sun's path move at one pace from the first second until the sky is complete
    expect(turnProgress(-60)).toBe(0);
    expect(turnProgress((FULL_S - 60) / 2)).toBeCloseTo(0.5, 9);
    expect(turnProgress(FULL_S)).toBe(1);
    expect(maxChange(turnProgress, -60, FULL_S, 10)).toBeCloseTo(10 / (60 + FULL_S), 6);
    // gone with the rays
    expect(turnIntensity(FULL_S)).toBe(0);
    expect(turnPalette(FULL_S)).toBe(0);
  });

  it('weight: the new sky from -32 s, stronger than the old at the turn, complete at FULL_S', () => {
    expect(turnWeight(-32)).toBe(0);
    expect(turnWeight(-20)).toBeLessThan(0.15);
    expect(turnWeight(0)).toBeGreaterThan(0.7);
    expect(turnWeight(FULL_S - 1)).toBeLessThan(1);
    expect(turnWeight(FULL_S)).toBe(1);
  });

  it('the day sky\'s rays are held back while a turn runs and just before one (item 64)', () => {
    const N = 1_800_000_000_000;
    expect(glimpseBlocked(N, NaN, NaN, -1, -1)).toBe(false);
    expect(glimpseBlocked(N, -30, NaN, -1, -1)).toBe(true);
    expect(glimpseBlocked(N, NaN, -59, -1, -1)).toBe(true);
    // until the new sky is complete
    expect(glimpseBlocked(N, 5, NaN, -1, -1)).toBe(true);
    expect(glimpseBlocked(N, FULL_S + 1, NaN, -1, -1)).toBe(false);
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
  it('runs over the last 60 s of the night: night sky first, day sky stronger at the day, complete FULL_S later', () => {
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
    expect(d.mix.sun).toBeCloseTo(turnWeight(-10), 5);
    expect(d.mix.sun + d.mix.dark).toBeCloseTo(1, 5);
    run(10.1);
    // the day's first second: the clock is day, the day sky outweighs the night
    expect(d.riseS).toBeCloseTo(0.1, 5);
    expect(d.settled.clock).toBe('day');
    expect(d.mix.sun).toBeGreaterThan(0.6);
    expect(d.mix.dark).toBeLessThan(0.4);
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
    expect(d.mix.sun).toBeCloseTo(turnWeight(-10), 5);
    const late = rig({ dayAt: W0 - 5_000 });
    expect(late.d.riseS).toBeCloseTo(5, 5);
    expect(late.d.settled.clock).toBe('day');
    expect(late.d.mix.sun).toBeCloseTo(turnWeight(5), 5);
    // well into the day (after the day sky is complete): no rise
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

  it('runs over the last 60 s of the day: day sky first, night sky stronger at the night, complete FULL_S later', () => {
    const { d, run } = day({ nightAt: W0 + 61_000 });
    expect(d.setS).toBeNull();
    expect(d.mix.sun).toBe(1);
    run(1);
    expect(d.setS).toBeCloseTo(-60, 5);
    expect(d.riseS).toBeNull();
    run(25);
    expect(d.mix.sun).toBe(1);
    expect(d.settled.clock).toBe('day');
    run(25);
    expect(d.mix.sun).toBeCloseTo(1 - turnWeight(-10), 5);
    expect(d.mix.night).toBeCloseTo(turnWeight(-10), 5);
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
    expect(d.mix.moon).toBeCloseTo(turnWeight(-10), 5);
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
    // the sky it had is where the sunset starts from: no jump
    run(0.1);
    expect(d.mix.sun).toBeCloseTo(sun, 5);
  });
});
