// The time-driven sunrise and sunset (stage 28 items 60, 61; ADR 0093): the curves
// (sunturn.ts) and the director's turn clock (director.ts).
import { describe, expect, it } from 'vitest';
import { Director, TURN_GUARD_MS, SKY_RATE, eventState } from '../../src/weather/director';
import { FULL_S, GLIMPSE_LEAD_S, TURN_FAINT, LATE_S, TURN_RAYS, glimpseBlocked, turnWeight, turnIntensity, turnPalette, turnProgress, turnRays } from '../../src/weather/sunturn';

const W0 = 1_800_000_000_000;

describe('sunrise curves', () => {
  const at = (f: (s: number) => number, from: number, to: number, step = 0.1): number[] => {
    const out: number[] = [];
    for (let s = from; s <= to + 1e-9; s += step) out.push(f(s));
    return out;
  };

  it('intensity: only just perceptible for the first 40 s, builds up over the last 20, over when the day begins', () => {
    expect(turnIntensity(-60)).toBe(0);
    expect(turnIntensity(-61)).toBe(0);
    for (const v of at(turnIntensity, -60, -20)) expect(v).toBeLessThanOrEqual(TURN_FAINT + 1e-9);
    expect(turnIntensity(-40)).toBeLessThan(0.04);
    expect(turnIntensity(-14)).toBeGreaterThan(0.3);
    expect(Math.max(...at(turnIntensity, -12, -4))).toBeGreaterThan(0.9);
    expect(turnIntensity(-2)).toBeLessThan(0.2);
    expect(turnIntensity(0)).toBe(0);
    expect(turnIntensity(5)).toBe(0);
    // rising all the way to its peak, then only falling
    const v = at(turnIntensity, -60, 0);
    const peak = v.indexOf(Math.max(...v));
    for (let i = 1; i <= peak; i++) expect(v[i]!).toBeGreaterThanOrEqual(v[i - 1]! - 1e-12);
    for (let i = peak + 1; i < v.length; i++) expect(v[i]!).toBeLessThanOrEqual(v[i - 1]! + 1e-12);
  });

  it('smooth: no frame step above 1 % at 30 fps, and the faint part creeps at the still rate too', () => {
    for (const f of [turnIntensity, turnPalette, turnWeight, turnProgress]) {
      const v = at(f, -61, 20, 1 / 30);
      for (let i = 1; i < v.length; i++) expect(Math.abs(v[i]! - v[i - 1]!)).toBeLessThan(0.01);
    }
    // the first 40 s: under 0.001 per frame even at 3 fps (FPS_STILL)
    const faint = at(turnIntensity, -60, -20, 1 / 3);
    for (let i = 1; i < faint.length; i++) expect(Math.abs(faint[i]! - faint[i - 1]!)).toBeLessThan(0.001);
  });

  it('rays: glimpsed from the first second, a little more from -30 s, then the build-up; gone at 0 (item 62)', () => {
    for (const kind of ['rise', 'set'] as const) {
      const f = TURN_RAYS[kind];
      expect(turnRays(kind, -60)).toBe(0);
      expect(turnRays(kind, -57)).toBeCloseTo(f.early, 5);
      expect(turnRays(kind, -40)).toBeCloseTo(f.early, 5);
      expect(turnRays(kind, -25)).toBeCloseTo(f.late, 5);
      expect(f.late).toBeGreaterThan(f.early);
      expect(turnRays(kind, -10)).toBeCloseTo(turnIntensity(-10), 5);
      expect(turnRays(kind, 0)).toBe(0);
      for (let s = -60; s < 0; s += 0.5) expect(turnRays(kind, s)).toBeGreaterThanOrEqual(turnIntensity(s));
      // no pop: under 1 % per frame at 30 fps (the sky runs at FPS_FAST through a turn)
      const v = at((x) => turnRays(kind, x), -61, 1, 1 / 30);
      for (let i = 1; i < v.length; i++) expect(Math.abs(v[i]! - v[i - 1]!)).toBeLessThan(0.01);
    }
    // the sunset's rays are drawn about half as strong: its floor is higher
    expect(TURN_RAYS.set.early).toBeGreaterThan(TURN_RAYS.rise.early);
  });

  it('the day glimpses are held back while a turn runs and just before one (item 64)', () => {
    const N = 1_800_000_000_000;
    expect(glimpseBlocked(N, NaN, NaN, -1, -1)).toBe(false);
    expect(glimpseBlocked(N, -30, NaN, -1, -1)).toBe(true);
    expect(glimpseBlocked(N, NaN, -59, -1, -1)).toBe(true);
    // after the turn's second it is day (or night): no hold
    expect(glimpseBlocked(N, 5, NaN, -1, -1)).toBe(false);
    // the clock's sunset begins its way in 60 s before the night: glimpses stop GLIMPSE_LEAD_S before that
    const night = N + (60 + GLIMPSE_LEAD_S - 1) * 1000;
    expect(glimpseBlocked(N, NaN, NaN, -1, night)).toBe(true);
    expect(glimpseBlocked(N, NaN, NaN, -1, night + 2000)).toBe(false);
    expect(glimpseBlocked(N, NaN, NaN, N + 30_000, -1)).toBe(true);
    expect(glimpseBlocked(N, NaN, NaN, N - 1000, -1)).toBe(false);
  });

  it('palette and colours: warm only late, gone when the day begins', () => {
    expect(turnPalette(-55)).toBe(0);
    expect(turnPalette(-40)).toBeLessThan(0.25);
    expect(turnPalette(-10)).toBeGreaterThan(0.8);
    expect(turnPalette(0)).toBe(0);
    expect(turnProgress(-60)).toBe(0);
    expect(turnProgress(-20)).toBeCloseTo(0.132, 2);
    // the old moments' strong middle at the intensity's peak
    expect(turnProgress(-7.5)).toBeCloseTo(0.513, 2);
    expect(turnProgress(0)).toBe(1);
  });

  it('day weight: night until -28 s, the day sky stronger than the night when the day begins, complete 14 s in', () => {
    expect(turnWeight(-60)).toBe(0);
    expect(turnWeight(-28)).toBe(0);
    expect(turnWeight(-20)).toBeLessThan(0.15);
    expect(turnWeight(0)).toBeGreaterThan(0.6);
    expect(turnWeight(0)).toBeCloseTo(0.741, 2);
    expect(turnWeight(10)).toBeLessThan(1);
    expect(turnWeight(FULL_S)).toBe(1);
    expect(turnWeight(15)).toBe(1);
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
  it('runs over the last 60 s of the night: night sky first, day sky stronger at the day, complete 14 s later', () => {
    // the day begins 61 s from now
    const { d, run } = rig({ dayAt: W0 + 61_000 });
    expect(d.riseS).toBeNull();
    run(1);
    expect(d.riseS).toBeCloseTo(-60, 5);
    run(30);
    expect(d.riseS).toBeCloseTo(-30, 5);
    expect(d.mix.sun).toBe(0);
    expect(d.settled.clock).toBe('night');
    run(20);
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

  it('the demo: from a later point, at its speed; a speed change or a jump lifts the once-a-dawn guard', () => {
    const { d, run } = rig({ dayAt: -1 });
    d.speed = 3;
    d.turnEvent('rise', -30);
    expect(d.riseS).toBe(-30);
    run(10);
    expect(d.riseS).toBeCloseTo(0, 5);
    run(30);
    expect(d.riseS).toBeNull();
    d.turnEvent('rise');
    expect(d.riseS).toBeNull();
    d.speed = 1;
    d.turnEvent('rise', -100);
    expect(d.riseS).toBe(-60);
    run(70);
    d.jump({ clock: 'night' });
    d.turnEvent('rise');
    expect(d.riseS).toBe(-60);
    expect(TURN_GUARD_MS).toBeGreaterThan(60_000 * 5);
  });
});

describe('Director: the sunset follows the clock (item 61)', () => {
  /** By day, outdoors, the moon down unless given. */
  const day = (state: Parameters<typeof rig>[0]) => rig({ clock: 'day', ...state });

  it('runs over the last 60 s of the day: day sky first, night sky stronger at the night, complete 14 s later', () => {
    const { d, run } = day({ nightAt: W0 + 61_000 });
    expect(d.setS).toBeNull();
    expect(d.mix.sun).toBe(1);
    run(1);
    expect(d.setS).toBeCloseTo(-60, 5);
    expect(d.riseS).toBeNull();
    run(30);
    expect(d.mix.sun).toBe(1);
    expect(d.settled.clock).toBe('day');
    run(20);
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
    expect(sun).toBeGreaterThan(0.85);
    d.turnEvent('set', -30);
    expect([d.riseS, d.setS]).toEqual([null, -30]);
    // the sky it had is where the sunset starts from: no jump
    run(0.1);
    expect(d.mix.sun).toBeCloseTo(sun, 5);
  });
});
