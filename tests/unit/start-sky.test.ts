// The start page sky's model (stage 41a, ADR 0124): look, weather director, clock overrides, params.

import { describe, expect, it } from 'vitest';
import { DAWN, DAY_S, DUSK, MONTH_S, YEAR_S } from '../../src/gmcp/clock';
import { periodOf, seasonOf } from '../../src/gmcp/gametime';
import { shiftedMinutes } from '../../src/start/clock';
import { luma } from '../../src/start/sky/color';
import { DEFAULT_VIEW, horizonOf, skyColorAt, skyCss, skyLayers, skyLookAt, skySceneAt } from '../../src/start/sky/look';
import { parseSkyParams } from '../../src/start/sky/params';
import { FADE, SLOT, dawnFogAt, skyWeatherAt, slotState } from '../../src/start/sky/weather';

const Y = 3038 * YEAR_S;
const at = (month: number, hour: number, day = 1, year = Y): number => year + month * MONTH_S + (day - 1) * DAY_S + hour * 60;
const PHONE = { w: 390, h: 844 };

describe('start sky look', () => {
  it('follows the period of the day from gametime', () => {
    for (let m = 0; m < 12; m++)
      for (let h = 0; h < 24; h++) expect(skyLookAt(at(m, h + 0.5)).period).toBe(periodOf(m, h));
  });

  it('dayness rises smoothly and never falls from deep night through dawn to noon', () => {
    for (let m = 0; m < 12; m++) {
      const rise = DAWN[m]!;
      let prev = -1;
      for (let h = rise - 3; h <= 12.5; h += 1 / 60) {
        const d = skyLookAt(at(m, h), { weather: 'clear' }).dayness;
        expect(d).toBeGreaterThanOrEqual(prev - 1e-12);
        if (prev >= 0) expect(d - prev).toBeLessThan(0.03);
        prev = d;
      }
      expect(skyLookAt(at(m, rise - 3)).dayness).toBeLessThan(0.05);
      expect(skyLookAt(at(m, 12.5)).dayness).toBeGreaterThan(0.95);
    }
  });

  it('the sun enters just off-screen left, crosses left to right and sets off-screen right', () => {
    for (const m of [0, 6]) {
      const rise = DAWN[m]!;
      const set = DUSK[m]! + 1;
      const first = skySceneAt(at(m, rise));
      expect(first.sun.x).toBeLessThan(0);
      expect(first.sun.y).toBeCloseTo(horizonOf(DEFAULT_VIEW), 5);
      // slow and shallow: a quarter hour after rise it has not climbed far
      expect(first.horizonY - skySceneAt(at(m, rise + 0.25)).sun.y).toBeLessThan(0.05);
      let px = -Infinity;
      for (let h = rise; h <= set; h += 0.25) {
        const x = skySceneAt(at(m, h)).sun.x;
        expect(x).toBeGreaterThan(px);
        px = x;
      }
      expect(skySceneAt(at(m, set)).sun.x).toBeGreaterThan(1);
    }
  });

  it('the sun is clearly larger than the moon', () => {
    for (const view of [DEFAULT_VIEW, PHONE]) {
      const s = skySceneAt(at(4, 12), { view });
      expect(s.sun.r).toBeGreaterThan(s.moon.r * 1.8);
    }
  });

  it('never draws the moon over the sun', () => {
    let both = 0;
    for (const view of [DEFAULT_VIEW, PHONE]) {
      for (let g = at(0, 0); g < at(0, 0) + YEAR_S; g += 37) {
        const s = skySceneAt(g, { view, weather: 'clear' });
        if (!s.sun.drawn || !s.moon.drawn) continue;
        both++;
        const d = Math.hypot((s.moon.x - s.sun.x) * view.w, (s.moon.y - s.sun.y) * view.h);
        expect(d).toBeGreaterThan(s.sun.r * 3 + s.moon.r);
      }
    }
    expect(both).toBeGreaterThan(100);
  });

  it('lights the wordmark with the sun by day and the moon or nothing at night', () => {
    const noon = skyLookAt(at(6, 13), { weather: 'clear' });
    expect(noon.light.kind).toBe('sun');
    expect(noon.light.strength).toBeGreaterThan(0.6);
    for (let g = at(2, 0); g < at(2, 0) + 40 * DAY_S; g += 61) {
      const l = skyLookAt(g, { weather: 'clear' });
      expect(l.light.strength).toBeGreaterThanOrEqual(0);
      expect(l.light.strength).toBeLessThanOrEqual(1);
      if (l.period === 'night' && l.light.kind === 'moon') expect(l.light.strength).toBeLessThanOrEqual(0.85);
      if (l.light.kind === 'none') expect(l.light.strength).toBeLessThan(0.02);
    }
  });

  it('gives bright text backs by day and dark ones at night', () => {
    const day = skyLookAt(at(6, 13), { weather: 'clouds' });
    const night = skyLookAt(at(6, 1), { weather: 'clear' });
    expect(day.textBackLuminance).toBeGreaterThan(night.textBackLuminance + 0.2);
    expect(night.textBackLuminance).toBeLessThan(0.15);
    // the almanac corner sits in the vignette's shade
    expect(day.textBack.almanac).toBeLessThan(day.textBack.quote);
  });

  it('is a pure function of game time', () => {
    const g = at(9, 6.7, 12);
    expect(skyLookAt(g, { view: PHONE })).toEqual(skyLookAt(g, { view: PHONE }));
  });

  it('describes the light position as viewport fractions that depend on the aspect only through the horizon', () => {
    const g = at(4, 10);
    const wide = skyLookAt(g, { view: { w: 1600, h: 900 } });
    const wide2 = skyLookAt(g, { view: { w: 3200, h: 1800 } });
    expect(wide.light.x).toBeCloseTo(wide2.light.x, 9);
    expect(wide.light.y).toBeCloseTo(wide2.light.y, 9);
    expect(horizonOf({ w: 390, h: 844 })).toBeCloseTo(0.655, 3);
    expect(horizonOf({ w: 1440, h: 900 })).toBeCloseTo(0.6, 3);
  });

  it('continues below the horizon as a plain surface: sky blue by day, near black at night', () => {
    const day = skyLookAt(at(6, 13), { weather: 'clear' });
    const night = skyLookAt(at(6, 1), { weather: 'clear' });
    const dayBelow = skyColorAt(day, 0.5, 0.9);
    expect(dayBelow[2]).toBeGreaterThan(dayBelow[0] + 40);
    expect(luma(skyColorAt(night, 0.5, 0.9))).toBeLessThan(0.05);
    // no seam: the colour changes smoothly across the line
    const hy = day.horizonY;
    let prev = skyColorAt(day, 0.5, hy - 0.05);
    for (let y = hy - 0.05; y < hy + 0.05; y += 0.002) {
      const c = skyColorAt(day, 0.5, y);
      expect(Math.abs(luma(c) - luma(prev))).toBeLessThan(0.03);
      prev = c;
    }
  });

  it('writes the same layers as CSS for the engine and the first paint', () => {
    const l = skyLookAt(at(4, 7.4), { view: PHONE });
    const css = skyCss(l);
    const { back, air } = skyLayers(skySceneAt(at(4, 7.4), { view: PHONE }));
    expect(css.back.split('-gradient(').length - 1).toBe(back.length);
    expect(css.air.split('-gradient(').length - 1).toBe(air.length);
    expect(css.all).toBe(`${css.air},${css.back}`);
    expect(css.all).not.toMatch(/NaN|undefined/);
  });
});

describe('start sky weather director', () => {
  const step = 7;
  const range = (m0: number, months: number, years = 2): number[] => {
    const out: number[] = [];
    for (let y = 0; y < years; y++) {
      const g0 = at(m0, 0, 1, Y + y * YEAR_S);
      for (let g = g0; g < g0 + months * MONTH_S; g += step) out.push(g);
    }
    return out;
  };

  it('always snows in winter (Afteryule, Solmath, Rethe), light to steady', () => {
    let lo = 1;
    let hi = 0;
    for (const g of range(0, 3)) {
      const w = skyWeatherAt(g);
      expect(w.snow).toBeGreaterThan(0.1);
      expect(w.rain).toBe(0);
      expect(w.state).toBe('snow');
      lo = Math.min(lo, w.snow);
      hi = Math.max(hi, w.snow);
    }
    expect(hi - lo).toBeGreaterThan(0.3);
  });

  it('never rains in summer', () => {
    for (const g of range(6, 3)) {
      const w = skyWeatherAt(g);
      expect(w.rain).toBe(0);
      expect(w.storm).toBe(0);
      expect(w.snow).toBe(0);
    }
  });

  it('rains rarely and lightly in spring and autumn; storms only in autumn, short', () => {
    for (const [m0, storms] of [[3, false], [9, true]] as const) {
      let wet = 0;
      let n = 0;
      let stormy = 0;
      for (const g of range(m0, 3)) {
        const w = skyWeatherAt(g);
        n++;
        if (w.rain > 0.1) wet++;
        if (w.storm > 0.5) stormy++;
        expect(w.rain).toBeLessThanOrEqual(0.85);
      }
      expect(wet / n).toBeGreaterThan(0.005);
      expect(wet / n).toBeLessThan(0.12);
      if (storms) {
        expect(stormy).toBeGreaterThan(0);
        expect(stormy / n).toBeLessThan(0.01);
      } else expect(stormy).toBe(0);
    }
  });

  it('never has rain right after rain', () => {
    for (let n = Math.floor(at(3, 0) / SLOT); n < Math.floor(at(12, 0) / SLOT); n++) {
      const wet = (s: string): boolean => s === 'rain' || s === 'storm';
      expect(wet(slotState(n)) && wet(slotState(n - 1))).toBe(false);
    }
  });

  it('has fog only sometimes, and only around dawn, never in winter', () => {
    let mornings = 0;
    let foggy = 0;
    for (let d = 0; d < 360; d++) {
      const g0 = Y + d * DAY_S;
      const month = Math.floor(d / 30);
      if (seasonOf(month) !== 'winter') mornings++;
      let any = false;
      for (let g = g0; g < g0 + DAY_S; g += 5) {
        const f = dawnFogAt(g);
        if (f <= 0) continue;
        any = true;
        expect(seasonOf(month)).not.toBe('winter');
        const h = (g - g0) / 60;
        expect(h).toBeGreaterThan(DAWN[month]! - 1.6);
        expect(h).toBeLessThan(DAWN[month]! + 2.1);
      }
      if (any) foggy++;
    }
    expect(foggy).toBeGreaterThan(mornings * 0.1);
    expect(foggy).toBeLessThan(mornings * 0.4);
  });

  it('changes slowly: no jumps from one minute to the next', () => {
    let prev = skyWeatherAt(at(3, 0));
    for (let g = at(3, 0) + 1; g < at(3, 0) + 20 * DAY_S; g++) {
      const w = skyWeatherAt(g);
      for (const k of ['cloud', 'rain', 'snow', 'fog', 'storm'] as const) expect(Math.abs(w[k] - prev[k])).toBeLessThan(0.06);
      prev = w;
    }
  });

  it('keeps long calm stretches', () => {
    const runs: number[] = [];
    let cur = skyWeatherAt(at(6, 0)).state;
    let len = 0;
    for (let g = at(6, 0); g < at(9, 0); g += 1) {
      const s = skyWeatherAt(g).state;
      if (s === cur) len++;
      else {
        runs.push(len);
        cur = s;
        len = 1;
      }
    }
    runs.sort((a, b) => a - b);
    expect(runs[Math.floor(runs.length / 2)]!).toBeGreaterThanOrEqual(SLOT - FADE);
  });

  it('is deterministic and can be pinned', () => {
    const g = at(9, 15, 3);
    expect(skyWeatherAt(g)).toEqual(skyWeatherAt(g));
    expect(skyWeatherAt(g, 'storm').state).toBe('storm');
    expect(skyWeatherAt(at(6, 12), 'snow').snow).toBeGreaterThan(0.2);
  });
});

describe('start clock overrides and sky params', () => {
  it('moves the clock to the asked hour, month and day, then runs or stands still', () => {
    const real0 = at(5, 3.25, 9);
    const g = shiftedMinutes(real0, real0, { hour: 21.5, month: 0, day: 15 });
    expect(Math.floor(g / YEAR_S)).toBe(3038);
    expect(Math.floor((g % YEAR_S) / MONTH_S)).toBe(0);
    expect(Math.floor((g % MONTH_S) / DAY_S)).toBe(14);
    expect((g % DAY_S) / 60).toBeCloseTo(21.5, 9);
    expect(shiftedMinutes(real0 + 10, real0, { hour: 21.5 }) - shiftedMinutes(real0, real0, { hour: 21.5 })).toBeCloseTo(10, 9);
    expect(shiftedMinutes(real0 + 10, real0, { hour: 21.5, freeze: true })).toBe(shiftedMinutes(real0, real0, { hour: 21.5 }));
    expect(shiftedMinutes(real0 + 10, real0, { speed: 600 }) - real0).toBeCloseTo(6000, 6);
  });

  it('parses the sky parameters and ignores bad values', () => {
    expect(parseSkyParams('?skyHour=21&skyMonth=0&skyWeather=snow&skyFreeze')).toEqual({ hour: 21, month: 0, weather: 'snow', freeze: true });
    expect(parseSkyParams('?skyMonth=Halimath&skyDay=4&skyFast&skyQuality=low&skyMotion=reduce&skyStats')).toEqual({
      month: 8,
      day: 4,
      speed: 600,
      quality: 'low',
      motion: 'reduce',
      stats: true,
    });
    expect(parseSkyParams('?skyHour=99&skyMonth=x&skyWeather=hail&skyQuality=ultra&skyFast=3')).toEqual({ speed: 3 });
    expect(parseSkyParams('?weather=1&speed=2')).toEqual({});
  });
});
