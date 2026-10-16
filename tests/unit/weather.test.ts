// Weather engine pure logic (stage 28, ADR 0091): the director's dwell,
// mix easing and sky selection, geometry diffing and background palettes.
import { describe, expect, it } from 'vitest';
import { DWELL_MS, Director, eventState, mixTargets, zeroMix } from '../../src/weather/director';
import { frameRect, geometryDiff, linesChanged, protectFor } from '../../src/weather/geometry';
import { adapt, luminance, parseHex, themeInfo } from '../../src/weather/palette';
import { ALL_CATEGORIES, DEFAULT_STATE, type Geometry, type WeatherState } from '../../src/weather/protocol';

const state = (s: Partial<WeatherState>): WeatherState => ({ ...DEFAULT_STATE, ...s });

describe('mixTargets: sky selection (v4)', () => {
  it('sun up outdoors gives the day sky', () => {
    const m = mixTargets(state({ weather: ' ', clock: 'day' }), ALL_CATEGORIES);
    expect([m.outdoors, m.sun, m.moon, m.dark, m.evil]).toEqual([1, 1, 0, 0, 0]);
  });
  it('night with the moon up gives the moonlit sky, without it the starry night', () => {
    expect(mixTargets(state({ weather: ' ', clock: 'night', moonUp: true }), ALL_CATEGORIES).moon).toBe(1);
    const dark = mixTargets(state({ weather: ' ', clock: 'night', moonUp: false }), ALL_CATEGORIES);
    expect([dark.moon, dark.dark, dark.night]).toEqual([0, 1, 1]);
  });
  it("light 'o' overrides with the darkness sky, day or night; other light values do not pick the sky", () => {
    for (const clock of ['day', 'night'] as const) {
      const m = mixTargets(state({ weather: ' ', clock, light: 'o', moonUp: true }), ALL_CATEGORIES);
      expect([m.sun, m.moon, m.dark, m.evil]).toEqual([0, 0, 0, 1]);
    }
    expect(mixTargets(state({ weather: ' ', clock: 'day', light: ')' }), ALL_CATEGORIES).sun).toBe(1);
  });
  it('indoors (weather null) has no sky and no precipitation', () => {
    const m = mixTargets(state({ weather: null, clock: 'day', light: 'o', fog: '-' }), ALL_CATEGORIES);
    expect([m.outdoors, m.sun, m.evil, m.clouds, m.rain]).toEqual([0, 0, 0, 0, 0]);
    expect(m.fog).toBe(0.5);
  });
  it('weather symbols map to cover and precipitation', () => {
    const t = (w: WeatherState['weather']) => mixTargets(state({ weather: w }), ALL_CATEGORIES);
    expect(t('~').clouds).toBe(0.6);
    expect([t("'").rain, t("'").heavy]).toEqual([1, 0]);
    expect([t('"').rain, t('"').heavy, t('"').clouds]).toEqual([1, 1, 1]);
    expect(t('*').snow).toBe(1);
    expect(mixTargets(state({ fog: '=' }), ALL_CATEGORIES).fog).toBe(1);
  });
  it('positions', () => {
    const t = (position: string) => mixTargets(state({ position }), ALL_CATEGORIES);
    expect(t('dying').down).toBe(1);
    expect(t('incapacitated').down).toBe(0.6);
    expect(t('sleeping').sleeping).toBe(1);
    expect(t('resting').resting).toBe(1);
  });
  it('a category that is off has its targets at 0', () => {
    const off = { ...ALL_CATEGORIES, darkness: false, precipitation: false, fog: false, body: false, sky: false };
    const m = mixTargets(state({ weather: '"', light: 'o', clock: 'day', fog: '=', position: 'dying' }), off);
    expect([m.evil, m.rain, m.heavy, m.fog, m.down, m.clouds]).toEqual([0, 0, 0, 0, 0, 0]);
    // darkness off: light 'o' no longer overrides, the day sky stays
    expect(m.sun).toBe(1);
  });
});

describe('Director', () => {
  it('weather, fog and light settle only after the dwell', () => {
    const d = new Director({ weather: ' ' });
    d.set({ weather: '"', fog: '-', light: 'o' });
    d.settle(1000);
    expect(d.settled.weather).toBe(' ');
    d.settle(1000 + DWELL_MS - 1);
    expect(d.settled.weather).toBe(' ');
    d.settle(1000 + DWELL_MS);
    expect([d.settled.weather, d.settled.fog, d.settled.light]).toEqual(['"', '-', 'o']);
  });
  it('running through rooms never settles the passing values', () => {
    const d = new Director({ weather: ' ' });
    let now = 0;
    for (const w of [null, ' ', null, '~', null] as const) {
      d.set({ weather: w });
      d.settle((now += 500));
    }
    d.set({ weather: ' ' });
    d.settle((now += 500));
    d.settle(now + DWELL_MS * 2);
    expect(d.settled.weather).toBe(' ');
  });
  it('position, clock and moon are immediate', () => {
    const d = new Director();
    d.set({ position: 'sleeping', clock: 'night', moonUp: true, moonPhase: 0.3 });
    d.settle(1);
    expect([d.settled.position, d.settled.clock, d.settled.moonUp, d.settled.moonPhase]).toEqual(['sleeping', 'night', true, 0.3]);
  });
  it('reports position changes', () => {
    const d = new Director();
    expect(d.set({ position: 'stunned' })).toEqual({ from: 'standing', to: 'stunned' });
    expect(d.set({ position: 'stunned' })).toBeNull();
  });
  it('mix values ease toward their targets', () => {
    const d = new Director({ weather: null });
    d.jump({ weather: '"' });
    expect(d.mix.rain).toBe(1);
    d.set({ weather: null });
    d.tick(0, 0.016);
    d.tick(DWELL_MS, 0.016);
    expect(d.mix.outdoors).toBeGreaterThan(0.9);
    let t = DWELL_MS;
    for (let i = 0; i < 60; i++) d.tick((t += 16), 0.016);
    expect(d.mix.outdoors).toBeGreaterThan(0.2);
    expect(d.mix.outdoors).toBeLessThan(0.6);
    for (let i = 0; i < 600; i++) d.tick((t += 16), 0.016);
    expect(d.mix.outdoors).toBeLessThan(0.01);
  });
  it('quiet when nothing shows', () => {
    expect(new Director({ weather: null }).quiet()).toBe(true);
    expect(new Director({ weather: ' ' }).quiet()).toBe(false);
    expect(new Director({ weather: null, position: 'sleeping' }).quiet()).toBe(false);
  });
  it('events set the sun and the moon', () => {
    expect(eventState('sun.rise')).toEqual({ clock: 'day' });
    expect(eventState('sun.dark')).toEqual({ clock: 'night' });
    expect(eventState('moon.set')).toEqual({ moonUp: false });
    expect(eventState('strike')).toBeNull();
  });
  it('zeroMix has every key at 0', () => {
    expect(Object.values(zeroMix()).every((v) => v === 0)).toBe(true);
  });
});

function geom(over: Partial<Geometry> = {}): Geometry {
  return {
    W: 1600,
    H: 1000,
    dpr: 1,
    out: { x: 0, y: 0, w: 1200, h: 980 },
    panes: [
      { id: 'comm', x: 1205, y: 430, w: 390, h: 430, border: 2, label: 'Comm', floating: false, bg: null, box: { x: 1200, y: 422, w: 400, h: 446 } },
    ],
    lines: [{ x: 0, y: 20, w: 300, h: 19 }],
    protect: protectFor(1600, 980, 19, 15),
    cell: { w: 9, h: 19, size: 15, font: '15px monospace' },
    ...over,
  };
}

describe('geometry diff', () => {
  it('no change, lines only, or layout', () => {
    expect(geometryDiff(geom(), geom())).toBe('none');
    expect(geometryDiff(geom(), geom({ lines: [{ x: 0, y: 39, w: 300, h: 19 }] }))).toBe('lines');
    expect(geometryDiff(geom(), geom({ W: 1500 }))).toBe('layout');
    expect(geometryDiff(geom(), geom({ dpr: 2 }))).toBe('layout');
    expect(geometryDiff(null, geom())).toBe('layout');
    const g = geom();
    g.panes[0]!.bg = '#102030';
    expect(geometryDiff(geom(), g)).toBe('layout');
  });
  it('ignores sub-pixel jitter', () => {
    const g = geom({ out: { x: 0.2, y: 0, w: 1200.3, h: 980 } });
    expect(geometryDiff(geom(), g)).toBe('none');
    expect(linesChanged([{ x: 0, y: 0, w: 10, h: 10 }], [{ x: 0.3, y: 0, w: 10, h: 10 }])).toBe(false);
  });
  it('protect: solid from one row above the game bottom, 3.5 lines of fade', () => {
    expect(protectFor(1600, 980, 19, 15)).toEqual({ solidTop: 959, fadeTop: 959 - 52.5, left: 80 });
    expect(protectFor(4000, 980, 19, 15).left).toBe(90);
  });
  it('frame rect: the frame box of a framed pane', () => {
    expect(frameRect({ x: 10, y: 20, w: 100, h: 50 }, true, 4, 8)).toEqual({ x: 14, y: 28, w: 92, h: 34 });
    expect(frameRect({ x: 10, y: 20, w: 100, h: 50 }, false, 4, 8)).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });
});

describe('palette', () => {
  it('parses colours and classifies backgrounds', () => {
    expect(parseHex('#f4ecd8')).toEqual([244, 236, 216]);
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(themeInfo('#000000').light).toBe(false);
    expect(themeInfo('#2a2a2e').light).toBe(false);
    expect(themeInfo('#f4ecd8').light).toBe(true);
    expect(themeInfo('#f4ecd8').add).toBe('multiply');
    expect(themeInfo('#000').add).toBe('lighter');
  });
  it('keeps colours on dark backgrounds and darkens light effects on light ones', () => {
    const dark = themeInfo('#000'), light = themeInfo('#f4ecd8');
    expect(adapt([200, 215, 255], dark)).toEqual([200, 215, 255]);
    const a = adapt([200, 215, 255], light);
    expect(luminance(a)).toBeLessThan(0.15);
    // the hue stays blue
    expect(a[2]).toBeGreaterThan(a[0]);
  });
});
