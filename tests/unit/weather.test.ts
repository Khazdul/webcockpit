// Weather engine pure logic (stage 28, ADR 0091): the director's dwell,
// mix easing and sky selection, geometry diffing and background palettes.
import { describe, expect, it } from 'vitest';
import { DWELL_MS, Director, FOG_RATE, OUT_RATE, SKY_HOLD_S, SKY_RATE, eventState, mixTargets, zeroMix } from '../../src/weather/director';
import { frameRect, geometryDiff, paneTintRects, plateOf, protectFor } from '../../src/weather/geometry';
import { adapt, luminance, parseHex, themeInfo } from '../../src/weather/palette';
import { ALL_CATEGORIES, DEFAULT_STATE, type Geometry, type WeatherState } from '../../src/weather/protocol';

const state = (s: Partial<WeatherState>): WeatherState => ({ ...DEFAULT_STATE, ...s });

describe('mixTargets: sky selection (v4)', () => {
  it('sun up outdoors gives the day sky', () => {
    const m = mixTargets(state({ weather: ' ', clock: 'day' }), ALL_CATEGORIES);
    expect([m.outdoors, m.sun, m.moon, m.dark]).toEqual([1, 1, 0, 0]);
  });
  it('night with the moon up gives the moonlit sky, without it the starry night', () => {
    expect(mixTargets(state({ weather: ' ', clock: 'night', moonUp: true }), ALL_CATEGORIES).moon).toBe(1);
    const dark = mixTargets(state({ weather: ' ', clock: 'night', moonUp: false }), ALL_CATEGORIES);
    expect([dark.moon, dark.dark, dark.night]).toEqual([0, 1, 1]);
  });
  it('light values do not pick the sky; there is no darkness sky (owner feedback 26)', () => {
    expect(mixTargets(state({ weather: ' ', clock: 'day', light: ')' }), ALL_CATEGORIES).sun).toBe(1);
    const o = mixTargets(state({ weather: ' ', clock: 'night', light: 'o' }), ALL_CATEGORIES);
    expect(o.dark).toBe(1);
    expect(Object.keys(o)).not.toContain('evil');
  });
  it('indoors (weather null): outdoors 0 gates the sky, no clouds or precipitation; the time of day stays (owner feedback 27)', () => {
    const m = mixTargets(state({ weather: null, clock: 'day', light: '!', fog: '-' }), ALL_CATEGORIES);
    expect([m.outdoors, m.clouds, m.rain]).toEqual([0, 0, 0]);
    expect([m.sun, m.moon, m.dark]).toEqual([1, 0, 0]);
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
    expect([m.rain, m.heavy, m.fog, m.down, m.clouds]).toEqual([0, 0, 0, 0, 0]);
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
    let t = DWELL_MS;
    for (let i = 0; i < 60; i++) d.tick((t += 16), 0.016);
    expect(d.mix.rain).toBeGreaterThan(0.2);
    expect(d.mix.rain).toBeLessThan(0.6);
    for (let i = 0; i < 600; i++) d.tick((t += 16), 0.016);
    expect(d.mix.rain).toBeLessThan(0.01);
  });
  it('going in or out crossfades the sky at a constant rate over 5 s (owner feedback 27)', () => {
    expect(1 / OUT_RATE).toBe(5);
    const d = new Director({ weather: ' ' });
    d.set({ weather: null });
    d.settle(1);
    let t = 1 + DWELL_MS;
    d.tick(t, 0);
    const run = (s: number): void => {
      for (let i = 0; i < s * 10; i++) d.tick((t += 100), 0.1);
    };
    run(1);
    expect(d.mix.outdoors).toBeCloseTo(0.8, 5);
    run(1.5);
    expect(d.mix.outdoors).toBeCloseTo(0.5, 5);
    run(2.5);
    expect(d.mix.outdoors).toBeCloseTo(0, 5);
    // the time of day does not move indoors
    expect(d.mix.sun).toBe(1);
  });
  it('after a sunset the day sky holds, then changes to night slowly (owner feedback 29)', () => {
    const d = new Director({ weather: ' ', clock: 'day' });
    d.set(eventState('sun.set')!);
    let t = 0;
    const run = (s: number): void => {
      for (let i = 0; i < s * 10; i++) d.tick((t += 100), 0.1);
    };
    run(SKY_HOLD_S - 0.5);
    expect([d.mix.sun, d.mix.dark]).toEqual([1, 0]);
    expect(d.resting()).toBe(false);
    run(0.5 + 6);
    expect(d.mix.sun).toBeCloseTo(1 - 6 * SKY_RATE, 1);
    run(1 / SKY_RATE - 6 + 0.5);
    expect([d.mix.sun, d.mix.dark, d.mix.night]).toEqual([0, 1, 1]);
    // a moon rising after it: no hold, the same slow pace
    d.set(eventState('moon.rise')!);
    run(6);
    expect(d.mix.moon).toBeCloseTo(6 * SKY_RATE, 5);
    // a jump (page load, dev) is at once
    d.jump({ clock: 'day' });
    expect(d.mix.sun).toBe(1);
  });
  it('fog grows and thins at a constant rate: 20 s per step (owner feedback 8)', () => {
    expect(0.5 / FOG_RATE).toBe(20);
    const d = new Director({ weather: ' ' });
    d.set({ fog: '-' });
    d.settle(1);
    let t = 1 + DWELL_MS;
    const run = (s: number): void => {
      for (let i = 0; i < s * 10; i++) d.tick((t += 100), 0.1);
    };
    run(0.1);
    expect(d.settled.fog).toBe('-');
    run(5);
    expect(d.mix.fog).toBeGreaterThan(0.1);
    expect(d.mix.fog).toBeLessThan(0.15);
    run(15);
    expect(d.mix.fog).toBeCloseTo(0.5, 5);
    d.set({ fog: '' });
    run(DWELL_MS / 1000 + 10);
    expect(d.mix.fog).toBeGreaterThan(0.2);
    run(11);
    expect(d.mix.fog).toBe(0);
    // switching the category off still fades quickly
    d.jump({ fog: '=' });
    d.cats = { ...d.cats, fog: false };
    run(5);
    expect(d.mix.fog).toBeLessThan(0.01);
  });
  it('resting once every mix value has arrived and nothing waits to settle', () => {
    const d = new Director({ weather: ' ' });
    expect(d.resting()).toBe(true);
    d.set({ weather: '~' });
    d.settle(1);
    expect(d.resting()).toBe(false);
    d.settle(1 + DWELL_MS);
    expect(d.resting()).toBe(false);
    let t = 1 + DWELL_MS;
    for (let i = 0; i < 200; i++) d.tick((t += 100), 0.1);
    expect(d.resting()).toBe(true);
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
      {
        id: 'comm',
        x: 1205,
        y: 430,
        w: 390,
        h: 430,
        border: 2,
        label: 'Comm',
        floating: false,
        z: 0,
        bg: null,
        box: { x: 1200, y: 422, w: 400, h: 446 },
      },
    ],
    protect: protectFor(1600, 980, 19, 15),
    cell: { w: 9, h: 19, size: 15, font: '15px monospace' },
    ...over,
  };
}

describe('geometry diff', () => {
  it('no change or layout', () => {
    expect(geometryDiff(geom(), geom())).toBe('none');
    expect(geometryDiff(geom(), geom({ W: 1500 }))).toBe('layout');
    expect(geometryDiff(geom(), geom({ dpr: 2 }))).toBe('layout');
    expect(geometryDiff(null, geom())).toBe('layout');
    const g = geom();
    g.panes[0]!.bg = '#102030';
    expect(geometryDiff(geom(), g)).toBe('layout');
    const f = geom();
    f.panes[0]!.floating = true;
    f.panes[0]!.z = 11;
    expect(geometryDiff(geom(), f)).toBe('layout');
    const t = geom();
    t.panes[0]!.border = 3;
    expect(geometryDiff(geom(), t)).toBe('layout');
    // The nameplate is part of the frame.
    const n = geom();
    n.panes[0]!.plate = { x: 1229, w: 60, y1: 15, lip: 2, r: 4 };
    expect(geometryDiff(geom(), n)).toBe('layout');
    const n2 = geom();
    n2.panes[0]!.plate = { x: 1229, w: 62, y1: 15, lip: 2, r: 4 };
    expect(geometryDiff(n, n2)).toBe('layout');
    const n3 = geom();
    n3.panes[0]!.plate = { x: 1229, w: 60, y1: 17, lip: 2, r: 4 };
    expect(geometryDiff(n, n3)).toBe('layout');
    expect(geometryDiff(n, n)).toBe('none');
  });
  it('ignores sub-pixel jitter', () => {
    const g = geom({ out: { x: 0.2, y: 0, w: 1200.3, h: 980 } });
    expect(geometryDiff(geom(), g)).toBe('none');
  });
  it('protect: solid from one row above the game bottom, 3.5 lines of fade', () => {
    expect(protectFor(1600, 980, 19, 15)).toEqual({ solidTop: 959, fadeTop: 959 - 52.5, left: 80 });
    expect(protectFor(4000, 980, 19, 15).left).toBe(90);
  });
  it('frame rect: the frame box of a framed pane', () => {
    const ins = { l: 4, r: 3, top: 8, b: 7 };
    expect(frameRect({ x: 10, y: 20, w: 100, h: 50 }, true, ins)).toEqual({ x: 14, y: 28, w: 93, h: 35 });
    expect(frameRect({ x: 10, y: 20, w: 100, h: 50 }, false, ins)).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });
  it('nameplate: screen px, sides widened to half px; none without the plate values', () => {
    const fr = { x: 10.25, y: 20, w: 200, h: 100 };
    expect(plateOf(fr, 24, 63.1, 2, 15, 4)).toEqual({ x: 34, w: 39.5, y1: 35, lip: 2, r: 4 });
    expect(plateOf(fr, NaN, NaN, NaN, NaN, 0)).toBeUndefined();
  });
  it('pane tint: inside the rim less the nameplate; the whole box unframed', () => {
    const p = { x: 100, y: 50, w: 200, h: 100, border: 6, plate: { x: 130, w: 40, y1: 65, lip: 2, r: 4 } };
    expect(paneTintRects(p)).toEqual([
      { x: 106, y: 65, w: 188, h: 79 },
      { x: 106, y: 56, w: 24, h: 9 },
      { x: 170, y: 56, w: 124, h: 9 },
    ]);
    expect(paneTintRects({ ...p, plate: undefined })).toEqual([{ x: 106, y: 56, w: 188, h: 88 }]);
    expect(paneTintRects({ ...p, border: 0 })).toEqual([{ x: 100, y: 50, w: 200, h: 100 }]);
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

describe('glass blur', () => {
  it('is left out in Gecko only (ADR 0091 "Frames", addendum: glass rim and nameplate)', async () => {
    const { glassBlurCheap } = await import('../../src/weather/support');
    expect(glassBlurCheap('Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0')).toBe(false);
    expect(glassBlurCheap('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36')).toBe(true);
    expect(glassBlurCheap('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe(true);
  });
});
