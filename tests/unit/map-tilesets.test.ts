// Map tilesets (ADR 0082): the catalogue against the bundled folders,
// per-file fallback, alternating by MUME month, the asset resolver, the
// worker's live swap, array sizes and the setting.
import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLOCK_KEY, momentSeconds, SEED_EPOCH } from '../../src/gmcp/clock';
import { type AssetResolver, assetResolver } from '../../src/map/assets';
import { MAP_PROTOCOL_VERSION } from '../../src/map/protocol';
import type { Renderer } from '../../src/map/render/renderer';
import { arraySize, MAX_TILE_SIZE, mipLevels, RENDERER_PIXMAPS } from '../../src/map/render/textures';
import {
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
    ]);
    expect(TILESET_IDS[0]).toBe(DEFAULT_TILESET);
    for (const c of TILESET_CHOICES) expect(c.credit.length).toBeLessThanOrEqual(48);
  });

  it("matches each set's folder: every renderer file but `lacks`, nothing else", () => {
    for (const t of TILESETS) {
      const dir = new URL(`tilesets/${t.dir}/`, PUBLIC);
      expect(existsSync(dir), t.dir).toBe(true);
      const files = readdirSync(dir).sort();
      const want = RENDERER_FILES.filter((f) => !t.lacks.includes(f)).sort();
      expect(files, `${t.dir}: the folder holds exactly the renderer files it does not lack`).toEqual(want);
      for (const f of t.lacks) expect(RENDERER_FILES, `${t.dir} lacks ${f}`).toContain(f);
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
