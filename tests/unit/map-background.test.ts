// Map background colour (ADR 0085): the named list, the
// renderer colour and the worker's `background` message.
import { describe, expect, it } from 'vitest';
import {
  MAP_BACKGROUNDS,
  MAP_BG_DARK_PAPER,
  MAP_BG_DEFAULT,
  MAP_BG_TRANSPARENT,
  isNamedMapBg,
  mapBgEffective,
  mapBgIsLight,
  mapBgName,
} from '../../src/map/backgrounds';
import { MAP_PROTOCOL_VERSION, type WorkerToMain } from '../../src/map/protocol';
import {
  BACKGROUND,
  LIGHT_BG_INK,
  LOWER_LAYER_FADE,
  type RGBA,
  backgroundRgba,
  clearRgba,
  fadeRgba,
  hexRgba,
  isLightBackground,
  isTransparentBackground,
  withAlpha,
} from '../../src/map/render/palette';
import type { Renderer } from '../../src/map/render/renderer';
import { MAP_CONTEXT, MapWorkerCore } from '../../src/map/worker/core';
import { defaultSettings, migrateMapper } from '../../src/settings';
import { contrast, luminance } from '../../src/theme/color';

/** White with LIGHT_BG_INK of it taken away: the lines on a light background. */
const LIGHT_INK = (() => {
  const v = Math.round(255 * (1 - LIGHT_BG_INK)).toString(16).padStart(2, '0');
  return `#${v}${v}${v}`;
})();

describe('map background choices', () => {
  it('starts with the default, MMapper\'s #2e3436; a new player starts transparent (ADR 0092), a stored mapper on the default', () => {
    expect(MAP_BACKGROUNDS[0]).toEqual({ name: 'Default', hex: '#2e3436' });
    expect(MAP_BG_DEFAULT).toBe('#2e3436');
    expect(defaultSettings().mapper.background).toBe(MAP_BG_TRANSPARENT);
    expect(migrateMapper({}).background).toBe(MAP_BG_DEFAULT);
    expect(migrateMapper({ background: 'bogus' }).background).toBe(MAP_BG_DEFAULT);
    expect(hexRgba(MAP_BG_DEFAULT)).toEqual(BACKGROUND);
  });

  it('has unique, lower-case #rrggbb entries, then Transparent last', () => {
    const hexes = MAP_BACKGROUNDS.map((c) => c.hex);
    expect(MAP_BACKGROUNDS.at(-1)).toEqual({ name: 'Transparent', hex: MAP_BG_TRANSPARENT });
    for (const h of hexes.slice(0, -1)) expect(h).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(new Set(MAP_BACKGROUNDS.map((c) => c.name)).size).toBe(hexes.length);
  });

  it('keeps the lines legible on every named colour: white on the dark ones, dark on Dark paper and White', () => {
    const colours = MAP_BACKGROUNDS.filter((c) => c.hex !== MAP_BG_TRANSPARENT);
    for (const c of colours) {
      if (mapBgIsLight(c.hex)) {
        expect(contrast(LIGHT_INK, c.hex), c.name).toBeGreaterThanOrEqual(7);
        expect(isLightBackground(hexRgba(c.hex)), c.name).toBe(true);
      } else {
        expect(contrast('#ffffff', c.hex), c.name).toBeGreaterThanOrEqual(7);
        expect(isLightBackground(hexRgba(c.hex)), c.name).toBe(false);
      }
    }
    // Only Dark paper (a shade darker than the paper background) and White are light, last in the list.
    expect(colours.filter((c) => mapBgIsLight(c.hex)).map((c) => c.name)).toEqual(['Dark paper', 'White']);
    expect(colours.slice(-2).map((c) => c.name)).toEqual(['Dark paper', 'White']);
    expect(MAP_BACKGROUNDS.some((c) => c.name === 'Black' && c.hex === '#000000')).toBe(true);
    expect(contrast(LIGHT_INK, '#ffffff')).toBeGreaterThanOrEqual(14);
    expect(MAP_BG_DARK_PAPER).toBe('#e8dfc8');
    expect(luminance(MAP_BG_DARK_PAPER)).toBeLessThan(luminance('#f4ecd8'));
    expect(luminance(MAP_BG_DARK_PAPER)).toBeGreaterThan(luminance('#f4ecd8') * 0.8);
  });

  it('the renderer and the options agree on light (the same threshold), also for other colours', () => {
    for (const h of ['#ffffff', '#808080', '#767676', '#777777', '#2e3436', '#e8dfc8', '#ffff00', '#0000ff']) {
      expect(isLightBackground(hexRgba(h)), h).toBe(mapBgIsLight(h));
    }
  });

  it('Transparent draws on the pane background; a colour stays itself (ADR 0085 addendum)', () => {
    expect(isNamedMapBg(MAP_BG_TRANSPARENT)).toBe(true);
    expect(mapBgName(MAP_BG_TRANSPARENT)).toBe('Transparent');
    expect(mapBgEffective(MAP_BG_TRANSPARENT, '#f4ecd8')).toBe('#f4ecd8');
    expect(mapBgEffective('#000000', '#f4ecd8')).toBe('#000000');
  });

  it('Transparent: the renderer gets the pane colour with alpha 0 and clears to nothing (addendum 2)', () => {
    const t = backgroundRgba('#f4ecd8', true);
    expect(t).toEqual(withAlpha(hexRgba('#f4ecd8'), 0));
    expect(isTransparentBackground(t)).toBe(true);
    expect(clearRgba(t)).toEqual([0, 0, 0, 0]);
    // The lines still follow the pane colour (dark on paper).
    expect(isLightBackground(t)).toBe(true);
    // Every colour: opaque, cleared to itself, faded at 50 % as before.
    for (const c of MAP_BACKGROUNDS.filter((x) => x.hex !== MAP_BG_TRANSPARENT)) {
      const bg = backgroundRgba(c.hex);
      expect(bg, c.name).toEqual(hexRgba(c.hex));
      expect(isTransparentBackground(bg), c.name).toBe(false);
      expect(clearRgba(bg), c.name).toEqual(bg);
      expect(fadeRgba(bg), c.name).toEqual(withAlpha(bg, LOWER_LAYER_FADE));
    }
  });

  it('the transparent fade moves drawn pixels toward the pane colour, keeps their alpha and leaves the empty space clear', () => {
    // The renderer blends the fade with (DST_ALPHA, ONE_MINUS_SRC_ALPHA) for colour, (ZERO, ONE) for alpha, premultiplied.
    const bg = backgroundRgba('#102030', true);
    const f = fadeRgba(bg);
    const blend = (dst: RGBA): RGBA => [0, 1, 2].map((i) => f[i]! * dst[3] + dst[i]! * (1 - f[3])).concat(dst[3]) as unknown as RGBA;
    expect(blend([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
    // An opaque tile: the same as the opaque fade (bg at 50 % over it).
    const tile: RGBA = [1, 0.5, 0, 1];
    const opaque = [0, 1, 2].map((i) => bg[i]! * 0.5 + tile[i]! * 0.5);
    blend(tile).slice(0, 3).forEach((v, i) => expect(v).toBeCloseTo(opaque[i]!, 6));
    expect(blend(tile)[3]).toBe(1);
    // A half-covered edge (premultiplied): still half covered, its colour faded the same way.
    const edge: RGBA = [0.5, 0.25, 0, 0.5];
    blend(edge).slice(0, 3).forEach((v, i) => expect(v / 0.5).toBeCloseTo(opaque[i]!, 6));
    expect(blend(edge)[3]).toBe(0.5);
  });

  it('names a listed colour and shows any other as its code', () => {
    expect(mapBgName('#2E3436')).toBe('Default');
    expect(mapBgName('#000000')).toBe('Black');
    expect(mapBgName('#123456')).toBe('#123456');
  });

  it('tells a named colour from any other', () => {
    expect(isNamedMapBg('#2E3436')).toBe(true);
    expect(isNamedMapBg('#e8dfc8')).toBe(true);
    expect(isNamedMapBg('#abcdef')).toBe(false);
  });

  it('turns a code into the renderer\'s RGBA, the default for a bad one', () => {
    expect(hexRgba('#ff0080')).toEqual([1, 0, 128 / 255, 1]);
    expect(hexRgba('nope')).toEqual(BACKGROUND);
  });
});

describe('map worker background', () => {
  function harness(background?: string, transparent?: boolean) {
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
    const attrs: unknown[] = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: (_kind: string, a: unknown) => {
        attrs.push(a);
        return {} as WebGL2RenderingContext;
      },
    } as unknown as OffscreenCanvas;
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
      ...(transparent ? { transparent } : {}),
    });
    return { core, set, frames, attrs, builds: () => builds };
  }

  it('gives the renderer the default, or the colour sent with init', () => {
    expect(harness().set).toEqual([BACKGROUND]);
    expect(harness('#000000').set).toEqual([[0, 0, 0, 1]]);
  });

  it('makes one premultiplied alpha context for every background (addendum 2)', () => {
    expect(harness().attrs).toEqual([MAP_CONTEXT]);
    expect(MAP_CONTEXT).toMatchObject({ alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
  });

  it('Transparent: the pane colour with alpha 0, at init and live, and back', () => {
    const h = harness('#0e141c', true);
    expect(h.set).toEqual([withAlpha(hexRgba('#0e141c'), 0)]);
    h.core.handle({ t: 'background', color: '#f4ecd8', transparent: true });
    expect(h.set.at(-1)).toEqual(withAlpha(hexRgba('#f4ecd8'), 0));
    h.core.handle({ t: 'background', color: '#000000' });
    expect(h.set.at(-1)).toEqual([0, 0, 0, 1]);
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
