// Map background colour (ADR 0085): the named list, the typed code, the
// renderer colour and the worker's `background` message.
import { describe, expect, it } from 'vitest';
import { MAP_BACKGROUNDS, MAP_BG_DARK_PAPER, MAP_BG_DEFAULT, isNamedMapBg, mapBgIsLight, mapBgName, parseMapBg } from '../../src/map/backgrounds';
import { MAP_PROTOCOL_VERSION, type WorkerToMain } from '../../src/map/protocol';
import { BACKGROUND, LIGHT_BG_INK, type RGBA, hexRgba, isLightBackground } from '../../src/map/render/palette';
import type { Renderer } from '../../src/map/render/renderer';
import { MapWorkerCore } from '../../src/map/worker/core';
import { defaultSettings } from '../../src/settings/types';
import { contrast, luminance } from '../../src/theme/color';

/** White with LIGHT_BG_INK of it taken away: the lines on a light background. */
const LIGHT_INK = (() => {
  const v = Math.round(255 * (1 - LIGHT_BG_INK)).toString(16).padStart(2, '0');
  return `#${v}${v}${v}`;
})();

describe('map background choices', () => {
  it('starts with the default, MMapper\'s #2e3436, which is the setting\'s default', () => {
    expect(MAP_BACKGROUNDS[0]).toEqual({ name: 'Default', hex: '#2e3436' });
    expect(MAP_BG_DEFAULT).toBe('#2e3436');
    expect(defaultSettings().mapper.background).toBe(MAP_BG_DEFAULT);
    expect(hexRgba(MAP_BG_DEFAULT)).toEqual(BACKGROUND);
  });

  it('has unique, lower-case #rrggbb entries', () => {
    const hexes = MAP_BACKGROUNDS.map((c) => c.hex);
    for (const h of hexes) expect(h).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(new Set(MAP_BACKGROUNDS.map((c) => c.name)).size).toBe(hexes.length);
  });

  it('keeps the lines legible on every named colour: white on the dark ones, dark on Dark paper', () => {
    for (const c of MAP_BACKGROUNDS) {
      if (mapBgIsLight(c.hex)) {
        expect(contrast(LIGHT_INK, c.hex), c.name).toBeGreaterThanOrEqual(7);
        expect(isLightBackground(hexRgba(c.hex)), c.name).toBe(true);
      } else {
        expect(contrast('#ffffff', c.hex), c.name).toBeGreaterThanOrEqual(7);
        expect(isLightBackground(hexRgba(c.hex)), c.name).toBe(false);
      }
    }
    // Only Dark paper is light, a shade darker than the paper background.
    expect(MAP_BACKGROUNDS.filter((c) => mapBgIsLight(c.hex)).map((c) => c.name)).toEqual(['Dark paper']);
    expect(MAP_BG_DARK_PAPER).toBe('#e8dfc8');
    expect(luminance(MAP_BG_DARK_PAPER)).toBeLessThan(luminance('#f4ecd8'));
    expect(luminance(MAP_BG_DARK_PAPER)).toBeGreaterThan(luminance('#f4ecd8') * 0.8);
  });

  it('the renderer and the options agree on light (the same threshold), also for typed codes', () => {
    for (const h of ['#ffffff', '#808080', '#767676', '#777777', '#2e3436', '#e8dfc8', '#ffff00', '#0000ff']) {
      expect(isLightBackground(hexRgba(h)), h).toBe(mapBgIsLight(h));
    }
  });

  it('names a listed colour and shows a typed one as its code', () => {
    expect(mapBgName('#2E3436')).toBe('Default');
    expect(mapBgName('#000000')).toBe('Black');
    expect(mapBgName('#123456')).toBe('#123456');
  });

  it('tells a named colour from a typed one', () => {
    expect(isNamedMapBg('#2E3436')).toBe(true);
    expect(isNamedMapBg('#e8dfc8')).toBe(true);
    expect(isNamedMapBg('#abcdef')).toBe(false);
  });

  it('takes #rrggbb, #rgb and a code without #; refuses anything else', () => {
    expect(parseMapBg('#1A2B3C')).toBe('#1a2b3c');
    expect(parseMapBg(' 1a2b3c ')).toBe('#1a2b3c');
    expect(parseMapBg('#abc')).toBe('#aabbcc');
    expect(parseMapBg('#12345')).toBeNull();
    expect(parseMapBg('navy')).toBeNull();
    expect(parseMapBg('')).toBeNull();
  });

  it('turns a code into the renderer\'s RGBA, the default for a bad one', () => {
    expect(hexRgba('#ff0080')).toEqual([1, 0, 128 / 255, 1]);
    expect(hexRgba('nope')).toEqual(BACKGROUND);
  });
});

describe('map worker background', () => {
  function harness(background?: string) {
    const out: WorkerToMain[] = [];
    const frames: (() => void)[] = [];
    const set: RGBA[] = [];
    let builds = 0;
    const renderer: Renderer = {
      setMap: () => {},
      setScene: () => {},
      resize: () => {},
      render: () => {},
      dispose: () => {},
      setBackground: (c) => void set.push(c),
    };
    const canvas = { width: 0, height: 0, getContext: () => ({}) as WebGL2RenderingContext } as unknown as OffscreenCanvas;
    const core = new MapWorkerCore({
      post: (m) => void out.push(m),
      requestFrame: (cb) => void frames.push(cb),
      fetch: (async () => new Response('nope', { status: 404 })) as typeof fetch,
      now: () => 0,
      createRenderer: () => {
        builds++;
        return renderer;
      },
    });
    core.handle({
      t: 'init',
      protocol: MAP_PROTOCOL_VERSION,
      canvas,
      width: 200,
      height: 100,
      dpr: 1,
      assets: { kind: 'base', url: '/map/' },
      ...(background ? { background } : {}),
    });
    return { core, set, frames, builds: () => builds };
  }

  it('gives the renderer the default, or the colour sent with init', () => {
    expect(harness().set).toEqual([BACKGROUND]);
    expect(harness('#000000').set).toEqual([[0, 0, 0, 1]]);
  });

  it('applies a background message live and draws again', () => {
    const h = harness();
    for (const cb of h.frames.splice(0)) cb();
    h.core.handle({ t: 'background', color: '#1c1c1c' });
    expect(h.set.at(-1)).toEqual(hexRgba('#1c1c1c'));
    expect(h.frames.length).toBe(1);
    const before = h.core.frames;
    for (const cb of h.frames.splice(0)) cb();
    expect(h.core.frames).toBe(before + 1);
  });
});
