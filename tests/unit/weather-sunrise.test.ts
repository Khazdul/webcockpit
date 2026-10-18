// The time-driven sunrise (stage 28 item 60, ADR 0093): the curves
// (sunrise.ts) and the director's rise clock (director.ts).
import { describe, expect, it } from 'vitest';
import { Director, RISE_GUARD_MS, SKY_RATE, eventState } from '../../src/weather/director';
import { DAY_FULL_S, RISE_FAINT, RISE_LATE_S, riseDayWeight, riseIntensity, risePalette, riseProgress } from '../../src/weather/sunrise';

const W0 = 1_800_000_000_000;

describe('sunrise curves', () => {
  const at = (f: (s: number) => number, from: number, to: number, step = 0.1): number[] => {
    const out: number[] = [];
    for (let s = from; s <= to + 1e-9; s += step) out.push(f(s));
    return out;
  };

  it('intensity: only just perceptible for the first 40 s, builds up over the last 20, over when the day begins', () => {
    expect(riseIntensity(-60)).toBe(0);
    expect(riseIntensity(-61)).toBe(0);
    for (const v of at(riseIntensity, -60, -20)) expect(v).toBeLessThanOrEqual(RISE_FAINT + 1e-9);
    expect(riseIntensity(-40)).toBeLessThan(0.04);
    expect(riseIntensity(-14)).toBeGreaterThan(0.3);
    expect(Math.max(...at(riseIntensity, -12, -4))).toBeGreaterThan(0.9);
    expect(riseIntensity(-2)).toBeLessThan(0.2);
    expect(riseIntensity(0)).toBe(0);
    expect(riseIntensity(5)).toBe(0);
    // rising all the way to its peak, then only falling
    const v = at(riseIntensity, -60, 0);
    const peak = v.indexOf(Math.max(...v));
    for (let i = 1; i <= peak; i++) expect(v[i]!).toBeGreaterThanOrEqual(v[i - 1]! - 1e-12);
    for (let i = peak + 1; i < v.length; i++) expect(v[i]!).toBeLessThanOrEqual(v[i - 1]! + 1e-12);
  });

  it('smooth: no frame step above 1 % at 30 fps, and the faint part creeps at the still rate too', () => {
    for (const f of [riseIntensity, risePalette, riseDayWeight, riseProgress]) {
      const v = at(f, -61, 20, 1 / 30);
      for (let i = 1; i < v.length; i++) expect(Math.abs(v[i]! - v[i - 1]!)).toBeLessThan(0.01);
    }
    // the first 40 s: under 0.001 per frame even at 3 fps (FPS_STILL)
    const faint = at(riseIntensity, -60, -20, 1 / 3);
    for (let i = 1; i < faint.length; i++) expect(Math.abs(faint[i]! - faint[i - 1]!)).toBeLessThan(0.001);
  });

  it('palette and colours: warm only late, gone when the day begins', () => {
    expect(risePalette(-55)).toBe(0);
    expect(risePalette(-40)).toBeLessThan(0.25);
    expect(risePalette(-10)).toBeGreaterThan(0.8);
    expect(risePalette(0)).toBe(0);
    expect(riseProgress(-60)).toBe(0);
    expect(riseProgress(-20)).toBeCloseTo(0.363, 2);
    expect(riseProgress(0)).toBe(1);
  });

  it('day weight: night until -28 s, the day sky stronger than the night when the day begins, complete 14 s in', () => {
    expect(riseDayWeight(-60)).toBe(0);
    expect(riseDayWeight(-28)).toBe(0);
    expect(riseDayWeight(-20)).toBeLessThan(0.15);
    expect(riseDayWeight(0)).toBeGreaterThan(0.6);
    expect(riseDayWeight(0)).toBeCloseTo(0.741, 2);
    expect(riseDayWeight(10)).toBeLessThan(1);
    expect(riseDayWeight(DAY_FULL_S)).toBe(1);
    expect(riseDayWeight(15)).toBe(1);
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
    expect(d.mix.sun).toBeCloseTo(riseDayWeight(-10), 5);
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
    run(RISE_LATE_S);
    expect(d.riseS).toBeNull();
    expect([d.mix.sun, d.mix.dark, d.mix.night]).toEqual([1, 0, 0]);
  });

  it('a page load or a sync mid-rise joins at its place', () => {
    const { d } = rig({ dayAt: W0 + 10_000 });
    expect(d.riseS).toBeCloseTo(-10, 5);
    expect(d.mix.sun).toBeCloseTo(riseDayWeight(-10), 5);
    const late = rig({ dayAt: W0 - 5_000 });
    expect(late.d.riseS).toBeCloseTo(5, 5);
    expect(late.d.settled.clock).toBe('day');
    expect(late.d.mix.sun).toBeCloseTo(riseDayWeight(5), 5);
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
    d.riseEvent();
    expect(d.riseS).toBe(-60);
    run(30);
    d.riseEvent();
    expect(d.riseS).toBeCloseTo(-30, 5);
    run(30);
    expect(d.settled.clock).toBe('day');
    run(RISE_LATE_S + 1);
    expect(d.riseS).toBeNull();
    // the same dawn: no second sunrise
    d.riseEvent();
    expect(d.riseS).toBeNull();
  });

  it('a rise event while the clock-driven one runs is ignored', () => {
    const { d, run } = rig({ dayAt: W0 + 30_000 });
    run(1);
    d.riseEvent();
    expect(d.riseS).toBeCloseTo(-29, 5);
  });

  it('the clock catching up after the event (a sync to the minute) glides it', () => {
    const { d, run, wall } = rig({ dayAt: -1 });
    d.riseEvent();
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
    d.riseEvent(-30);
    expect(d.riseS).toBe(-30);
    run(10);
    expect(d.riseS).toBeCloseTo(0, 5);
    run(30);
    expect(d.riseS).toBeNull();
    d.riseEvent();
    expect(d.riseS).toBeNull();
    d.speed = 1;
    d.riseEvent(-100);
    expect(d.riseS).toBe(-60);
    run(70);
    d.jump({ clock: 'night' });
    d.riseEvent();
    expect(d.riseS).toBe(-60);
    expect(RISE_GUARD_MS).toBeGreaterThan(60_000 * 5);
  });
});
