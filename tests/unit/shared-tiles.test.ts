// Stage 73 E2 (owner, 2026-11-18; ADR 0154 addendum "Desert"): a shared
// run's map is drawn in Desert's tiles. A link stores the default tiles;
// the watch page retiles every payload (`withSharedTiles`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { RENDERER_PIXMAPS } from '../../src/map/render/textures';
import { SHARED_TILESET, TILESETS, sharedOverlay } from '../../src/map/tilesets';
import type { MapToolRequest, MapToolResponse } from '../../src/map/tools';
import { validatePayload } from '../../src/replay/validate';
import { defaultSettings } from '../../src/settings';
import { defaultExportDoc } from '../../src/share/edits';
import { prepareLinkPayload } from '../../src/share/link-payload';
import { sealLinkPayload } from '../../src/share/link-seal';
import type { ReplayPayload } from '../../src/share/payload';
import { needsSharedTiles, retileMap, withSharedTiles } from '../../src/share/shared-tiles';
import type { ChainRun } from '../../src/player/timeline';
import { retiledWire } from '../../src/watch/frame-host';

const ROOT = join(import.meta.dirname, '../..');
const BASE = 'http://wc.test/';
const ASSETS = ['pixmaps/terrain-field.png', 'pixmaps/wall-north.png', 'pixmaps/stream-in-east.png', 'fonts/Cantarell18.fnt', 'fonts/Cantarell18_0.png'];

const fileUri = (rel: string, mime = 'image/png'): string => `data:${mime};base64,${readFileSync(join(ROOT, 'public', rel)).toString('base64')}`;

/** Serves `public/` and records the paths asked for. */
function publicFetch(asked: string[] = []): (url: string) => Promise<Response> {
  return async (url) => {
    const rel = url.slice(BASE.length);
    asked.push(rel);
    try {
      return new Response(readFileSync(join(ROOT, 'public', rel)));
    } catch {
      return new Response('', { status: 404 });
    }
  };
}

/** The map tool's subset answer: these assets, a tiny `.mm2`. */
const fakeTool = async (_req: MapToolRequest): Promise<MapToolResponse> => ({
  ok: true,
  t: 'subset',
  result: { mm2: new Uint8Array([1, 2, 3, 4]), rooms: 3, visited: 2, assets: ASSETS, name: 'arda.mm2' },
});

function chain(): ChainRun[] {
  const text = readFileSync(join(ROOT, 'tests/fixtures/map-demo.log'), 'utf8');
  const us = Number(/^(\d{16}) /.exec(text)?.[1] ?? 1_790_000_000_000_000);
  return [{ meta: { runId: 'Rasta/x', character: 'Rasta', startedUs: us, endedUs: null, sealed: true, bytes: text.length, lines: 0 }, text }];
}

/** An old link's payload: the map with some other set's tiles (Gefe & Rik's, with its untinted flow and tints). */
function oldPayload(): ReplayPayload {
  return {
    schema: 1,
    title: 't',
    character: 'Rasta',
    level: 1,
    startUs: 1,
    settings: {},
    runs: [],
    comments: [],
    cuts: [],
    markers: [],
    map: {
      name: 'map.mm2',
      rooms: 3,
      visited: 2,
      mm2: 'AQIDBA==',
      files: {
        'pixmaps/terrain-field.png': fileUri('map/tilesets/gefe-rik/terrain-field.png'),
        'pixmaps/wall-north.png': fileUri('map/pixmaps/wall-north.png'),
        'fonts/Cantarell18.fnt': fileUri('map/fonts/Cantarell18.fnt', 'text/plain'),
      },
      streamsAsIs: true,
      tints: { dark: '#e3dcdc', noSundeath: '#f1eded' },
    },
  } as unknown as ReplayPayload;
}

describe('the shared tileset', () => {
  it('is Desert, a concrete set: its files less what it lacks, no aliases, untinted flow or tints', () => {
    expect(SHARED_TILESET).toBe('desert');
    const desert = TILESETS.find((t) => t.id === 'desert')!;
    const o = sharedOverlay();
    expect(o.dir).toBe('tilesets/desert/');
    expect(o.files.length).toBe(RENDERER_PIXMAPS.length - desert.lacks.length);
    for (const f of desert.lacks) expect(o.files).not.toContain(f);
    expect(o.aliases).toBeUndefined();
    expect(o.streamsAsIs).toBeUndefined();
    expect(o.tints).toBeUndefined();
  });

  it('is needed by a payload whose map has tiles', () => {
    const p = oldPayload();
    expect(needsSharedTiles(p)).toBe(true);
    const { map: _m, ...noMap } = p;
    expect(needsSharedTiles(noMap as ReplayPayload)).toBe(false);
    expect(needsSharedTiles({ ...p, map: { ...p.map!, files: { 'fonts/Cantarell18.fnt': p.map!.files['fonts/Cantarell18.fnt']! } } })).toBe(false);
  });

  it('retiles an old payload: Desert where it has the file, the default where it lacks it, fonts and the rest untouched', async () => {
    const p = oldPayload();
    const asked: string[] = [];
    const out = await withSharedTiles(p, { assetBase: `${BASE}map/`, fetch: publicFetch(asked) });
    expect(asked.sort()).toEqual(['map/pixmaps/wall-north.png', 'map/tilesets/desert/terrain-field.png']);
    expect(out.map!.files['pixmaps/terrain-field.png']).toBe(fileUri('map/tilesets/desert/terrain-field.png'));
    expect(out.map!.files['pixmaps/wall-north.png']).toBe(fileUri('map/pixmaps/wall-north.png'));
    expect(out.map!.files['fonts/Cantarell18.fnt']).toBe(p.map!.files['fonts/Cantarell18.fnt']);
    // Gefe & Rik's untinted flow and light tints go with its tiles: Desert has MMapper's.
    expect(out.map!.streamsAsIs).toBeUndefined();
    expect(out.map!.tints).toBeUndefined();
    expect(out.map!.mm2).toBe(p.map!.mm2);
    expect(out.runs).toBe(p.runs);
    // The result is a payload the frame takes (it validates it again).
    expect(validatePayload(JSON.parse(JSON.stringify(out))).map!.files['pixmaps/terrain-field.png']).toBe(fileUri('map/tilesets/desert/terrain-field.png'));
    // The input is not changed.
    expect(p.map!.files['pixmaps/terrain-field.png']).toBe(fileUri('map/tilesets/gefe-rik/terrain-field.png'));
  });

  it('rejects when a tile cannot be fetched', async () => {
    await expect(withSharedTiles(oldPayload(), { assetBase: `${BASE}map/`, fetch: async () => new Response('', { status: 503 }) })).rejects.toThrow(/503/);
  });
});

describe('a new link', () => {
  it('stores the default tiles (small), and the watch page draws it in Desert', async () => {
    const asked: string[] = [];
    const prepared = await prepareLinkPayload(chain(), [], defaultExportDoc('Rasta/x'), defaultSettings(), { kind: 'url', url: 'arda.mm2' } as never, {
      base: BASE,
      fetch: publicFetch(asked),
      runMapTool: fakeTool,
    });
    const link = await sealLinkPayload(prepared);
    const stored = JSON.parse(gunzipSync(link.bytes).toString('utf8')) as ReplayPayload;
    expect(stored.map!.files['pixmaps/terrain-field.png']).toBe(fileUri('map/pixmaps/terrain-field.png'));
    expect(asked.some((a) => a.includes('tilesets/'))).toBe(false);
    const shown = await withSharedTiles(stored, { assetBase: `${BASE}map/`, fetch: publicFetch() });
    expect(shown.map!.files['pixmaps/terrain-field.png']).toBe(fileUri('map/tilesets/desert/terrain-field.png'));
    expect(shown.map!.files['pixmaps/stream-in-east.png']).toBe(fileUri('map/tilesets/desert/stream-in-east.png'));
    // Desert lacks walls: the default's.
    expect(shown.map!.files['pixmaps/wall-north.png']).toBe(fileUri('map/pixmaps/wall-north.png'));
  });
});

describe('the watch page posts the retiled payload only when the frame takes it (stage 73 review fix)', () => {
  const original = new Uint8Array([31, 139, 8, 0, 9, 9, 9]);
  const read = (b: ArrayBuffer): ReplayPayload => JSON.parse(gunzipSync(new Uint8Array(b)).toString('utf8')) as ReplayPayload;

  it('posts the retiled bytes when they are valid and within the limit', async () => {
    const out = await withSharedTiles(oldPayload(), { assetBase: `${BASE}map/`, fetch: publicFetch() });
    const wire = await retiledWire(out, original);
    expect(read(wire).map!.files['pixmaps/terrain-field.png']).toBe(fileUri('map/tilesets/desert/terrain-field.png'));
  });

  it('falls back to the original bytes when the retiled JSON is over the limit', async () => {
    const out = await withSharedTiles(oldPayload(), { assetBase: `${BASE}map/`, fetch: publicFetch() });
    const size = new TextEncoder().encode(JSON.stringify(out)).byteLength;
    const wire = await retiledWire(out, original, size - 1);
    expect([...new Uint8Array(wire)]).toEqual([...original]);
    expect(read(await retiledWire(out, original, size)).map).toBeDefined();
  });

  it('falls back to the original bytes when the retiled payload fails the validation', async () => {
    const p = oldPayload();
    const bad = { ...p, map: { ...p.map!, files: { ...p.map!.files, 'pixmaps/terrain-field.png': 'javascript:alert(1)' } } } as ReplayPayload;
    expect(() => validatePayload(JSON.parse(JSON.stringify(bad)))).toThrow();
    const wire = await retiledWire(bad, original);
    expect([...new Uint8Array(wire)]).toEqual([...original]);
  });
});
