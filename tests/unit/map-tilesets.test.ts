// Map tilesets (ADR 0082): the catalogue against the bundled folders,
// per-file fallback, alternating by MUME month, the asset resolver, the
// worker's live swap, array sizes and the setting.
import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLOCK_KEY, momentSeconds, SEED_EPOCH } from '../../src/gmcp/clock';
import { type AssetResolver, assetResolver } from '../../src/map/assets';
import { MAP_PROTOCOL_VERSION } from '../../src/map/protocol';
import type { Renderer, TileStyle } from '../../src/map/render/renderer';
import { arraySize, MAX_TILE_SIZE, mipLevels, RENDERER_PIXMAPS } from '../../src/map/render/textures';
import {
  chooseTileset,
  currentOverlay,
  DEFAULT_TILESET,
  mumeMonth,
  overlayFor,
  overlayPath,
  resolveTileset,
  storedClockEpoch,
  TILESET_CHOICES,
  TILESET_FAMILIES,
  TILESET_IDS,
  TILESETS,
  tilesetChoice,
  tilesetOverlay,
} from '../../src/map/tilesets';
import { MapWorkerCore } from '../../src/map/worker/core';
import { tilesetCredit } from '../../src/chrome/frames/options-mapper';
import { isNamedMapBg } from '../../src/map/backgrounds';
import { defaultSettings, migrateMapper, migrateSettings } from '../../src/settings';

const PUBLIC = new URL('../../public/map/', import.meta.url);
const RENDERER_FILES = RENDERER_PIXMAPS.map((p) => p.slice('pixmaps/'.length));

/** A storage holding one key. */
function storage(key: string, value: string): Storage {
  return { getItem: (k: string) => (k === key ? value : null) } as Storage;
}

describe('tileset catalogue', () => {
  it('lists the choices in Options → Mapper order', () => {
    expect(TILESET_CHOICES.map((c) => [c.id, c.name])).toEqual([
      ['default', 'Default (MMapper)'],
      ['shimrod', 'Shimrod (alternating)'],
      ['shimrod-spring', 'Shimrod Spring'],
      ['shimrod-summer', 'Shimrod Summer'],
      ['shimrod-autumn', 'Shimrod Autumn'],
      ['shimrod-winter', 'Shimrod Winter'],
      ['desert', 'Desert'],
      ['gefe-rik', 'Gefe & Rik'],
      ['grays-map', "Gray's Map"],
    ]);
    expect(TILESET_IDS[0]).toBe(DEFAULT_TILESET);
    for (const c of TILESET_CHOICES) expect(c.credit.length).toBeLessThanOrEqual(48);
  });

  it("matches each set's folder: every renderer file but `lacks` and aliases, nothing else", () => {
    for (const t of TILESETS) {
      const dir = new URL(`tilesets/${t.dir}/`, PUBLIC);
      expect(existsSync(dir), t.dir).toBe(true);
      const files = readdirSync(dir).sort();
      const aliased = Object.keys(t.aliases ?? {});
      const want = RENDERER_FILES.filter((f) => !t.lacks.includes(f) && !aliased.includes(f)).sort();
      expect(files, `${t.dir}: the folder holds exactly the renderer files it does not lack`).toEqual(want);
      for (const f of t.lacks) expect(RENDERER_FILES, `${t.dir} lacks ${f}`).toContain(f);
      // An alias is a renderer file the set does not lack, drawn with a file the folder has.
      for (const [f, to] of Object.entries(t.aliases ?? {})) {
        expect(RENDERER_FILES, `${t.dir} alias ${f}`).toContain(f);
        expect(t.lacks, `${t.dir} alias ${f}`).not.toContain(f);
        expect(files, `${t.dir} alias ${f} → ${to}`).toContain(to);
      }
      // A recommended background is one of the named map backgrounds.
      if (t.background) expect(isNamedMapBg(t.background), `${t.dir} background`).toBe(true);
    }
    // No folder without an entry.
    expect(readdirSync(new URL('tilesets/', PUBLIC)).sort()).toEqual(TILESETS.map((t) => t.dir).sort());
  });

  it('family members are sets', () => {
    for (const f of TILESET_FAMILIES) for (const id of Object.values(f.seasons)) expect(TILESETS.some((t) => t.id === id)).toBe(true);
  });

  it('resolves default and unknown ids to the default pixmaps, sets to themselves', () => {
    expect(resolveTileset('default', 0)).toBeNull();
    expect(resolveTileset('no-such-set', 5)).toBeNull();
    expect(tilesetChoice('no-such-set').id).toBe('default');
    expect(resolveTileset('desert', 0)?.dir).toBe('desert');
    expect(resolveTileset('shimrod-summer', 0)?.dir).toBe('shimrod-summer');
    expect(overlayFor('default', 3)).toBeUndefined();
  });

  it('alternating follows MUME’s season for all 12 months', () => {
    // Afteryule–Rethe winter, Astron–Forelithe spring, Afterlithe–Halimath summer, Winterfilth–Foreyule autumn.
    const want = ['winter', 'winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn'];
    for (let m = 0; m < 12; m++) expect(resolveTileset('shimrod', m)?.id, `month ${m}`).toBe(`shimrod-${want[m]}`);
  });

  it('overrides the default pixmaps file by file', () => {
    const o = tilesetOverlay(resolveTileset('desert', 0))!;
    expect(o.dir).toBe('tilesets/desert/');
    expect(overlayPath(o, 'pixmaps/terrain-field.png')).toBe('tilesets/desert/terrain-field.png');
    expect(overlayPath(o, 'pixmaps/trail-ns.png')).toBe('tilesets/desert/trail-ns.png');
    // Lacked: walls, doors, the character square, road terrain, underwater (Desert only).
    expect(overlayPath(o, 'pixmaps/wall-north.png')).toBe('pixmaps/wall-north.png');
    expect(overlayPath(o, 'pixmaps/door-up.png')).toBe('pixmaps/door-up.png');
    expect(overlayPath(o, 'pixmaps/char-room-sel.png')).toBe('pixmaps/char-room-sel.png');
    expect(overlayPath(o, 'pixmaps/terrain-underwater.png')).toBe('pixmaps/terrain-underwater.png');
    expect(overlayPath(overlayFor('shimrod-spring', 0), 'pixmaps/terrain-underwater.png')).toBe('tilesets/shimrod-spring/terrain-underwater.png');
    // Fonts and the default: unchanged.
    expect(overlayPath(o, 'fonts/Cantarell18.fnt')).toBe('fonts/Cantarell18.fnt');
    expect(overlayPath(undefined, 'pixmaps/terrain-field.png')).toBe('pixmaps/terrain-field.png');
  });

  it('reads an aliased file from the set’s own file, and carries the set’s flags (ADR 0088)', () => {
    const g = tilesetOverlay(resolveTileset('grays-map', 0))!;
    expect(g.dir).toBe('tilesets/grays-map/');
    expect(g.files).not.toContain('terrain-rapids.png');
    expect(overlayPath(g, 'pixmaps/terrain-rapids.png')).toBe('tilesets/grays-map/terrain-water.png');
    expect(overlayPath(g, 'pixmaps/terrain-water.png')).toBe('tilesets/grays-map/terrain-water.png');
    expect(overlayPath(g, 'pixmaps/stream-in-north.png')).toBe('tilesets/grays-map/stream-in-north.png');
    expect(overlayPath(g, 'pixmaps/wall-north.png')).toBe('pixmaps/wall-north.png');
    expect(g.streamsAsIs).toBe(true);
    const gefe = overlayFor('gefe-rik', 0)!;
    expect(gefe.aliases).toBeUndefined();
    expect(gefe.streamsAsIs).toBe(true);
    expect(overlayPath(gefe, 'pixmaps/terrain-rapids.png')).toBe('tilesets/gefe-rik/terrain-rapids.png');
    expect(overlayPath(gefe, 'pixmaps/load-horse.png')).toBe('pixmaps/load-horse.png');
    // The older sets: no new fields, so they draw as before.
    for (const id of ['desert', 'shimrod-autumn']) {
      const o = overlayFor(id, 0)!;
      expect(o.aliases).toBeUndefined();
      expect(o.streamsAsIs).toBeUndefined();
    }
    expect(tilesetChoice('gefe-rik').background).toBe('#ffffff');
    expect(tilesetChoice('grays-map').background).toBe('#ffffff');
    expect(tilesetChoice('desert').background).toBeUndefined();
    expect(tilesetChoice('shimrod').background).toBeUndefined();
  });

  it('the base resolver fetches the overlay’s files from its folder', async () => {
    const seen: string[] = [];
    const fake = (async (u: string) => {
      seen.push(u);
      return new Response('x');
    }) as typeof fetch;
    const r = assetResolver({ kind: 'base', url: '/map', tileset: overlayFor('desert', 0) }, fake);
    await r('pixmaps/terrain-forest.png');
    await r('pixmaps/wall-east.png');
    await r('fonts/Cantarell27.fnt');
    expect(seen).toEqual(['/map/tilesets/desert/terrain-forest.png', '/map/pixmaps/wall-east.png', '/map/fonts/Cantarell27.fnt']);
  });
});

describe('tileset clock', () => {
  it('reads the MUME month from a clock anchor', () => {
    const epoch = 1_000_000;
    const at = (month: number) => (epoch + momentSeconds(0, month, 15, 12, 0)) * 1000;
    for (let m = 0; m < 12; m++) expect(mumeMonth(epoch, at(m))).toBe(m);
  });

  it('uses the saved clock, or the cold-start estimate without one', () => {
    const now = 1_790_000_000_000;
    expect(storedClockEpoch(null, now)).toBe(SEED_EPOCH);
    const saved = JSON.stringify({ epoch: 12345, precision: 'minute', lastSync: now / 1000 - 60, reason: 'x' });
    expect(storedClockEpoch(storage(CLOCK_KEY, saved), now)).toBe(12345);
    // Blocked storage: the estimate.
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(storedClockEpoch(blocked, now)).toBe(SEED_EPOCH);
  });

  it('the export overlay follows the saved clock', () => {
    const now = 1_790_000_000_000;
    const nowS = now / 1000;
    // An anchor that puts "now" on Thrimidge 10th (month 4, spring).
    const epoch = nowS - momentSeconds(3000, 4, 10, 8, 0);
    const st = storage(CLOCK_KEY, JSON.stringify({ epoch, precision: 'minute', lastSync: nowS - 10, reason: 'x' }));
    expect(currentOverlay('shimrod', st, now)?.dir).toBe('tilesets/shimrod-spring/');
    expect(currentOverlay('desert', st, now)?.dir).toBe('tilesets/desert/');
    expect(currentOverlay('default', st, now)).toBeUndefined();
  });

  it('the credit line names the season an alternating set draws', () => {
    expect(tilesetCredit('shimrod', 0)).toBe('Tiles by Shimrod (v0.92) · now Winter');
    expect(tilesetCredit('shimrod', 7)).toBe('Tiles by Shimrod (v0.92) · now Summer');
    expect(tilesetCredit('desert', 7)).toBe("By Khazdul, from Shimrod's tiles");
    expect(tilesetCredit('bogus', 7)).toBe("MMapper's default tiles");
  });
});

describe('tileset setting', () => {
  it('defaults to the default set and drops unknown ids', () => {
    expect(defaultSettings().mapper.tileset).toBe('default');
    expect(migrateSettings({ profile: 'x' }).mapper.tileset).toBe('default');
    for (const id of TILESET_IDS) expect(migrateMapper({ tileset: id }).tileset).toBe(id);
    expect(migrateMapper({ tileset: 'gone' }).tileset).toBe('default');
    expect(migrateMapper({ tileset: 7 }).tileset).toBe('default');
  });
});

describe('texture array sizes', () => {
  it('keeps the nominal size for the default set and grows to the largest file', () => {
    const sq = (n: number) => ({ width: n, height: n });
    expect(arraySize(128, [sq(128), sq(128), null])).toBe(128);
    expect(arraySize(64, [sq(64), sq(128)])).toBe(128);
    expect(arraySize(128, [sq(256), sq(128)])).toBe(256);
    expect(arraySize(128, [null, null])).toBe(128);
    expect(arraySize(128, [{ width: 100, height: 300 }])).toBe(MAX_TILE_SIZE);
    expect(arraySize(128, [sq(1024)])).toBe(MAX_TILE_SIZE);
    expect(arraySize(256, [sq(32)])).toBe(32);
    // Gefe & Rik mixes 128, 160 and 200 px files (ADR 0088): the largest wins, no power of two needed.
    expect(arraySize(128, [sq(160), sq(128), sq(200), null])).toBe(200);
    expect(mipLevels(200)).toBe(8);
    expect(mipLevels(256)).toBe(9);
    expect(mipLevels(128)).toBe(8);
    expect(mipLevels(100)).toBe(7);
  });
});

describe('worker tileset swap', () => {
  it('hands the renderer a resolver for the new set; the map stays', async () => {
    const seen: string[] = [];
    const resolvers: AssetResolver[] = [];
    const renderer: Renderer = {
      setMap: () => {},
      setScene: () => {},
      resize: () => {},
      render: () => {},
      dispose: () => {},
      setAssets: (a) => void resolvers.push(a),
    };
    const canvas = { width: 0, height: 0, getContext: () => ({}) as WebGL2RenderingContext } as unknown as OffscreenCanvas;
    const core = new MapWorkerCore({
      post: () => {},
      requestFrame: () => {},
      fetch: (async (u: string) => {
        seen.push(String(u));
        return new Response('x');
      }) as typeof fetch,
      now: () => 0,
      createRenderer: () => renderer,
    });
    // Before init: ignored.
    core.handle({ t: 'assets', assets: { kind: 'base', url: '/map/' } });
    core.handle({ t: 'init', protocol: MAP_PROTOCOL_VERSION, canvas, width: 10, height: 10, dpr: 1, assets: { kind: 'base', url: '/map/' } });
    core.handle({ t: 'assets', assets: { kind: 'base', url: '/map/', tileset: overlayFor('shimrod-autumn', 0) } });
    expect(resolvers).toHaveLength(1);
    await resolvers[0]!('pixmaps/terrain-forest.png');
    await resolvers[0]!('pixmaps/door-north.png');
    expect(seen).toEqual(['/map/tilesets/shimrod-autumn/terrain-forest.png', '/map/pixmaps/door-north.png']);
  });
});

describe('untinted flow marks (ADR 0088)', () => {
  it('the worker tells the renderer how a source draws, at init and on a swap', () => {
    const styles: Array<TileStyle | undefined> = [];
    const swaps: Array<TileStyle | undefined> = [];
    const renderer: Renderer = {
      setMap: () => {},
      setScene: () => {},
      resize: () => {},
      render: () => {},
      dispose: () => {},
      setAssets: (_a, style) => void swaps.push(style),
    };
    const canvas = { width: 0, height: 0, getContext: () => ({}) as WebGL2RenderingContext } as unknown as OffscreenCanvas;
    const core = new MapWorkerCore({
      post: () => {},
      requestFrame: () => {},
      fetch: (async () => new Response('x')) as typeof fetch,
      now: () => 0,
      createRenderer: (_gl, _assets, _on, style) => {
        styles.push(style);
        return renderer;
      },
    });
    core.handle({
      t: 'init',
      protocol: MAP_PROTOCOL_VERSION,
      canvas,
      width: 10,
      height: 10,
      dpr: 1,
      assets: { kind: 'base', url: '/map/', tileset: overlayFor('gefe-rik', 0) },
    });
    expect(styles).toEqual([{ streamsAsIs: true }]);
    core.handle({ t: 'assets', assets: { kind: 'base', url: '/map/', tileset: overlayFor('shimrod-autumn', 0) } });
    core.handle({ t: 'assets', assets: { kind: 'base', url: '/map/' } });
    core.handle({ t: 'assets', assets: { kind: 'base', url: '/map/', tileset: overlayFor('grays-map', 0) } });
    core.handle({ t: 'assets', assets: { kind: 'inline', files: {}, streamsAsIs: true } });
    expect(swaps).toEqual([{}, {}, { streamsAsIs: true }, { streamsAsIs: true }]);
  });

  it('only the community sets draw their own flow marks', () => {
    for (const t of TILESETS) expect(t.streamsAsIs === true, t.id).toBe(t.id === 'gefe-rik' || t.id === 'grays-map');
  });
});

describe('recommended background (ADR 0088)', () => {
  const at = (tileset: string, background: string, backgroundBefore = '') => ({ tileset, background, backgroundBefore });

  it('switches to the set’s background and remembers the user’s', () => {
    expect(chooseTileset(at('default', '#2e3436'), 'gefe-rik')).toEqual(at('gefe-rik', '#ffffff', '#2e3436'));
    expect(chooseTileset(at('shimrod', '#13261a'), 'grays-map')).toEqual(at('grays-map', '#ffffff', '#13261a'));
  });

  it('keeps the first remembered colour across sets with a background', () => {
    expect(chooseTileset(at('gefe-rik', '#ffffff', '#1c1c1c'), 'grays-map')).toEqual(at('grays-map', '#ffffff', '#1c1c1c'));
    // A colour changed by hand on the light set is replaced by the next set's, the memory stays.
    expect(chooseTileset(at('gefe-rik', '#e8dfc8', '#1c1c1c'), 'grays-map')).toEqual(at('grays-map', '#ffffff', '#1c1c1c'));
  });

  it('restores the remembered colour when leaving for a set without one, if the background is untouched', () => {
    expect(chooseTileset(at('grays-map', '#ffffff', '#1c1c1c'), 'default')).toEqual(at('default', '#1c1c1c'));
    expect(chooseTileset(at('gefe-rik', '#FFFFFF', '#2e3436'), 'shimrod')).toEqual(at('shimrod', '#2e3436'));
    // Changed by hand: the user's colour stays, the memory goes.
    expect(chooseTileset(at('gefe-rik', '#e8dfc8', '#2e3436'), 'desert')).toEqual(at('desert', '#e8dfc8'));
    // Nothing remembered: the background stays.
    expect(chooseTileset(at('gefe-rik', '#ffffff'), 'default')).toEqual(at('default', '#ffffff'));
  });

  it('leaves the background alone between sets without one', () => {
    expect(chooseTileset(at('default', '#000000'), 'desert')).toEqual(at('desert', '#000000'));
    expect(chooseTileset(at('desert', '#ffffff', '#000000'), 'shimrod')).toEqual(at('shimrod', '#ffffff', '#000000'));
  });

  it('keeps a remembered colour only when it is a named background', () => {
    expect(defaultSettings().mapper.backgroundBefore).toBe('');
    expect(migrateMapper({ backgroundBefore: '#1C1C1C' }).backgroundBefore).toBe('#1c1c1c');
    expect(migrateMapper({ backgroundBefore: '#123456' }).backgroundBefore).toBe('');
    expect(migrateMapper({ backgroundBefore: 7 }).backgroundBefore).toBe('');
    expect(migrateMapper({}).backgroundBefore).toBe('');
  });
});
