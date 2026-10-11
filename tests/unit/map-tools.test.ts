import { existsSync, readFileSync, statSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DIR_COUNT, type MapData, TERRAIN_ROAD } from '../../src/map/model';
import { readMm2 } from '../../src/map/mm2';
import { writeMm2 } from '../../src/map/mm2-write';
import {
  type MapVisits,
  extractVisits,
  neededAssets,
  replaySubset,
  resolveVisits,
  runMapToolRequest,
  spatialMargin,
} from '../../src/map/tools';
import { FONT_FILES, fontPagePath, FONT_SIZES, parseFnt } from '../../src/map/render/font';
import { buildRoomMeshes, CATEGORIES, CATEGORY_TEX } from '../../src/map/render/rooms';
import { ARRAY_FILES, CHARACTER_PIXMAPS, RENDERER_PIXMAPS, TEX } from '../../src/map/render/textures';
import { gmcpLine, gridMap } from './map-grid';

const inflate = async (z: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateSync(z));
const deflate = async (b: Uint8Array): Promise<Uint8Array> => new Uint8Array(deflateSync(b));
const env = { fetch: (() => Promise.reject(new Error('no fetch'))) as typeof fetch, inflate, deflate };

describe('extractVisits', () => {
  it('reads Room.Info in order and Group mapids, skipping repeats and junk', () => {
    const run1 =
      gmcpLine(1, 'Room.Info', { id: 1005, name: 'Room 5', desc: 'x' }) +
      gmcpLine(2, 'Room.Info', { id: 1005, name: 'Room 5', desc: 'x' }) +
      '0000000000000003 some text\n' +
      gmcpLine(4, 'Room.Info', { name: 'Room 6', desc: 'y' }) +
      gmcpLine(5, 'Group.Set', [{ id: 1, name: 'A', mapid: 1020 }, { id: 2, name: 'B' }]) +
      `0000000000000006 \x1bGMCP Room.Info {broken\n` +
      gmcpLine(7, 'Group.Update', { id: 2, mapid: 1021 }) +
      gmcpLine(8, 'Char.Vitals', { hp: 1 });
    const run2 = gmcpLine(9, 'room.info', { id: 1007 }) + gmcpLine(10, 'Group.Add', { id: 3, mapid: 1020 });
    const v = extractVisits([run1, run2]);
    expect(v.rooms).toEqual([{ id: 1005, name: 'Room 5', desc: 'x' }, { name: 'Room 6', desc: 'y' }, { id: 1007 }]);
    expect(v.mapIds.sort()).toEqual([1020, 1021]);
  });

  it('returns nothing for a chain without map data', () => {
    expect(extractVisits(['0000000000000001 hello\n'])).toEqual({ rooms: [], mapIds: [] });
  });

  describe('with cuts', () => {
    const text = (ts: number, s: string): string => `${String(ts).padStart(16, '0')} ${s}\n`;
    // 1–3 cut away (Rivendell), 4–6 kept, 7–9 cut to the end.
    const chain =
      gmcpLine(1, 'Room.Info', { id: 1001, name: 'Far 1' }) +
      gmcpLine(2, 'Group.Set', [{ id: 1, mapid: 1050 }]) +
      gmcpLine(3, 'Room.Info', { id: 1002, name: 'Start' }) +
      text(4, 'kept text') +
      gmcpLine(5, 'Room.Info', { id: 1003, name: 'Next' }) +
      gmcpLine(6, 'Group.Update', { id: 1, mapid: 1051 }) +
      gmcpLine(7, 'Room.Info', { id: 1004, name: 'Later' }) +
      gmcpLine(8, 'Group.Update', { id: 1, mapid: 1052 }) +
      text(9, 'cut text');
    const cuts: [number, number | null][] = [
      [1, 4],
      [7, null],
    ];

    it('counts only kept content plus the room each kept stretch starts in', () => {
      const v = extractVisits([chain], cuts);
      // 1001 is in the cut and not the clip start; 1004 is in a trailing cut.
      expect(v.rooms.map((r) => r.id)).toEqual([1002, 1003]);
      // Group mapids inside cuts never count.
      expect(v.mapIds).toEqual([1051]);
    });

    it('takes the clip-start room from an earlier cut when the last cut holds none', () => {
      const t = gmcpLine(1, 'Room.Info', { id: 1001 }) + text(2, 'a') + text(3, 'b') + gmcpLine(4, 'Room.Info', { id: 1002 });
      // Two adjacent cuts, the room in the first: the player still stands there at 3.
      const twoCuts: [number, number | null][] = [
        [1, 2],
        [2, 3],
      ];
      expect(extractVisits([t], twoCuts).rooms.map((r) => r.id)).toEqual([1001, 1002]);
      // A room followed by a later one in the same cut: only the later one is the clip start.
      expect(extractVisits([t + text(5, 'c')], [[1, 5]]).rooms.map((r) => r.id)).toEqual([1002]);
    });

    it('does not repeat the clip-start room when the kept stretch repeats it', () => {
      const t = gmcpLine(1, 'Room.Info', { id: 1001 }) + gmcpLine(2, 'Room.Info', { id: 1001 }) + text(3, 'x');
      expect(extractVisits([t], [[1, 2]]).rooms).toEqual([{ id: 1001 }]);
    });

    it('is unchanged without cuts', () => {
      const v = extractVisits([chain], []);
      expect(v).toEqual(extractVisits([chain]));
      expect(v.rooms.map((r) => r.id)).toEqual([1001, 1002, 1003, 1004]);
      expect(v.mapIds.sort()).toEqual([1050, 1051, 1052]);
    });
  });
});

describe('resolveVisits', () => {
  it('finds rooms by server id, then by name + description', () => {
    const map = gridMap(10, 10, { noServerId: (i) => i >= 50 });
    const v: MapVisits = {
      rooms: [{ id: 1003 }, { id: 99999, name: 'Room 60', desc: 'The plain room number 60.' }, { id: 1051 }],
      mapIds: [1007, 424242],
    };
    expect([...resolveVisits(map, v)].sort((a, b) => a - b)).toEqual([3, 7, 60]);
  });

  it('prefers the candidate next to the previous room; keeps a few ambiguous ones', () => {
    // Every room in row 1 has the same name and description.
    const same = (i: number): boolean => i >= 10 && i < 20;
    const map = gridMap(10, 5, {
      noServerId: same,
      name: (i) => (same(i) ? 'Road' : `Room ${i}`),
      desc: (i) => (same(i) ? 'A road.' : `Room ${i}.`),
    });
    // From room 4 (row 0) north: only room 14 is adjacent.
    expect([...resolveVisits(map, { rooms: [{ id: 1004 }, { name: 'Road', desc: 'A road.' }], mapIds: [] })]).toEqual([4, 14]);
    // No previous room and 10 candidates: skipped.
    expect([...resolveVisits(map, { rooms: [{ name: 'Road', desc: 'A road.' }], mapIds: [] })]).toEqual([]);
    // Three candidates: all kept.
    const few = gridMap(10, 5, { noServerId: () => true, name: (i) => (i < 3 ? 'Hall' : `R${i}`), desc: () => '' });
    expect([...resolveVisits(few, { rooms: [{ name: 'Hall', desc: '' }], mapIds: [] })].sort()).toEqual([0, 1, 2]);
  });
});

describe('replaySubset', () => {
  it('keeps the visited rooms with a margin and a ring, centred on the first', () => {
    const map = gridMap(60, 60);
    const v: MapVisits = { rooms: [{ id: 1000 + 30 * 60 + 30 }, { id: 1000 + 30 * 60 + 31 }], mapIds: [] };
    const sub = replaySubset(map, v, { margin: 2, ring: 1 })!;
    // x 28…33 and y 28…32 within the margin (6 × 5), plus the ring of exit neighbours around it.
    expect(sub.visited).toBe(2);
    expect(sub.map.roomCount).toBe(6 * 5 + 2 * 6 + 2 * 5);
    expect(sub.map.selected).toEqual({ x: 30, y: 30, z: 0 });
    expect(spatialMargin(map, [0], 1).size).toBe(4);
    expect(replaySubset(map, { rooms: [{ id: 5 }], mapIds: [] })).toBeNull();
  });

  it('round-trips through the tools request as a .mm2 file', async () => {
    const map = gridMap(40, 40);
    const r = await runMapToolRequest(
      { t: 'subset', source: { kind: 'data', map, name: 'grid' }, visits: { rooms: [{ id: 1000 + 820 }], mapIds: [] } },
      env,
    );
    expect(r.ok && r.t === 'subset').toBe(true);
    if (!r.ok || r.t !== 'subset') return;
    expect(r.result.visited).toBe(1);
    const back = await readMm2(r.result.mm2!, inflate);
    expect(back.roomCount).toBe(r.result.rooms);
    expect(back.byServerId.has(1820)).toBe(true);
    expect(r.result.assets).toContain('pixmaps/terrain-field.png');

    const none = await runMapToolRequest({ t: 'subset', source: { kind: 'data', map, name: 'grid' }, visits: { rooms: [], mapIds: [] } }, env);
    expect(none).toEqual({ ok: true, t: 'subset', result: { mm2: null, rooms: 0, visited: 0, assets: [], name: 'grid' } });
  });

  it('validates a .mm2 file and rejects junk', async () => {
    const bytes = await writeMm2(gridMap(5, 4), deflate);
    const ok = await runMapToolRequest({ t: 'validate', bytes: bytes.slice().buffer }, env);
    expect(ok).toMatchObject({ ok: true, t: 'validate', info: { rooms: 20, serverIds: 20 } });
    if (ok.ok && ok.t === 'validate') expect(ok.info.hash).toMatch(/^[0-9a-f]{32}$/);
    const bad = await runMapToolRequest({ t: 'validate', bytes: new Uint8Array([1, 2, 3]).buffer }, env);
    expect(bad).toMatchObject({ ok: false, message: expect.stringMatching(/Not an MMapper map/) });
  });
});

describe('neededAssets', () => {
  it('lists the terrain, road and trail tiles, the flag overlays, the character tiles and the fonts', () => {
    // Row 0 is road (road tiles), the rest field; room 4 has a road exit north (a trail).
    const map = gridMap(3, 3, { terrain: (i) => (i < 3 ? TERRAIN_ROAD : 3) });
    map.exitFlags[4 * DIR_COUNT + 0]! |= 4; // ROAD north on room 4
    map.mobFlags[5] = 1 << 12; // aggressive_mob
    map.loadFlags[6] = (1 << 15) | (1 << 9); // tower, pack_horse
    const a = neededAssets(map);
    for (const p of ['road-e.png', 'road-ew.png', 'road-w.png', 'terrain-field.png', 'trail-n.png', 'mob-aggmob.png', 'load-watch.png', 'load-pack.png']) {
      expect(a).toContain(`pixmaps/${p}`);
    }
    expect(a).not.toContain('pixmaps/terrain-road.png');
    expect(a).not.toContain('pixmaps/mellon.png');
    for (const p of CHARACTER_PIXMAPS) expect(a).toContain(p);
    for (const f of FONT_FILES) expect(a).toContain(f);
  });

  it('only names files that exist in public/map', () => {
    const map = gridMap(4, 4, { terrain: (i) => i % 15 });
    map.mobFlags.fill((1 << 19) - 1);
    map.loadFlags.fill((1 << 25) - 1);
    for (const p of neededAssets(map)) expect(existsSync(new URL(`../../public/map/${p}`, import.meta.url)), p).toBe(true);
  });

  it('every file the renderer loads exists, and the fonts name the pages the renderer falls back to', () => {
    for (const p of [...RENDERER_PIXMAPS, ...FONT_FILES]) expect(existsSync(new URL(`../../public/map/${p}`, import.meta.url)), p).toBe(true);
    for (const size of FONT_SIZES) {
      const fnt = parseFnt(readFileSync(new URL(`../../public/map/fonts/Cantarell${size}.fnt`, import.meta.url), 'utf8'));
      expect(fontPagePath(size, fnt.page)).toBe(fontPagePath(size));
    }
  });
});

// Every instance of the room meshes the renderer builds for arda.mm2 and
// for replay subsets must sample a file the replay embeds (else the tile
// is transparent in the HTML replay), and neededAssets only lists files
// the renderer loads.
describe('neededAssets matches the renderer (arda.mm2)', () => {
  const ARDA_FILE = new URL('../../public/map/arda.mm2', import.meta.url);
  const TEX_FILES: Record<number, readonly string[]> = {};
  const check = (map: MapData): void => {
    const need = new Set(neededAssets(map));
    const loadable = new Set([...RENDERER_PIXMAPS, ...FONT_FILES]);
    for (const p of need) expect(loadable.has(p), p).toBe(true);
    for (const m of buildRoomMeshes(map)) {
      for (const cat of CATEGORIES) {
        if (cat === 'tintDark' || cat === 'tintNoSundeath' || cat === 'dotted') continue;
        const files = TEX_FILES[CATEGORY_TEX[cat]]!;
        const { first, count } = m.ranges[cat];
        for (let i = first; i < first + count; i++) {
          const f = `pixmaps/${files[m.inst[i * 4 + 3]! & 0xff]}`;
          expect(need.has(f), `${cat} ${f}`).toBe(true);
        }
      }
    }
  };
  it('full map and subsets around several areas', async () => {
    TEX_FILES[TEX.A128] = ARRAY_FILES.A128.files;
    TEX_FILES[TEX.A64] = ARRAY_FILES.A64.files;
    TEX_FILES[TEX.A256] = ARRAY_FILES.A256.files;
    const map = await readMm2(readFileSync(ARDA_FILE), inflate);
    check(map);
    // Eight areas spread over the rooms that have a server id.
    const withId = [...Array(map.roomCount).keys()].filter((r) => map.serverId[r]! > 0);
    for (let k = 0; k < 8; k++) {
      const r = withId[Math.floor((k * withId.length) / 8)]!;
      const s = replaySubset(map, { rooms: [{ id: map.serverId[r]! }], mapIds: [] });
      expect(s, `room ${r}`).not.toBeNull();
      check(s!.map);
    }
  });
});

// ------------------------------------------------------ arda measurements

const ARDA = new URL('../../public/map/arda.mm2', import.meta.url);

/** A trip of about `steps` rooms: the shortest path (N/E/S/W/U/D exits) from `start` to a room that far away. */
function walk(map: MapData, start: number, steps: number): number[] {
  const parent = new Map<number, number>([[start, -1]]);
  let frontier = [start];
  let last = start;
  for (let d = 1; d < steps && frontier.length > 0; d++) {
    const next: number[] = [];
    for (const r of frontier) {
      const s = r * DIR_COUNT;
      for (let k = map.outStart[s]!; k < map.outStart[s + 6]!; k++) {
        const t = map.outTo[k]!;
        if (parent.has(t)) continue;
        parent.set(t, r);
        next.push(t);
      }
    }
    if (next.length > 0) last = next[next.length >> 1]!;
    frontier = next;
  }
  const path: number[] = [];
  for (let r = last; r >= 0; r = parent.get(r)!) path.unshift(r);
  return path;
}

function visitsOf(map: MapData, path: number[]): MapVisits {
  return {
    rooms: path.map((r) =>
      map.serverId[r] ? { id: map.serverId[r]! } : { name: map.names[r]!, desc: map.descs[r]! },
    ),
    mapIds: [],
  };
}

describe.skipIf(!existsSync(ARDA))('replay subsets of arda.mm2 (sizes, ADR 0020 P3)', () => {
  it('a fight and a long trip stay well under 1 MB with their tiles', async () => {
    const map = await readMm2(new Uint8Array(readFileSync(ARDA)), inflate);
    // Starts: the first room with a server id, and one in the middle of the file.
    const starts = [map.serverId.findIndex((s) => s !== 0), map.serverId.findIndex((s, i) => s !== 0 && i > map.roomCount / 2)];
    const rows: string[] = [];
    for (const start of starts) {
      for (const steps of [30, 300]) {
        const path = walk(map, start, steps);
        const visits = visitsOf(map, path);
        const r = await runMapToolRequest({ t: 'subset', source: { kind: 'data', map, name: 'arda' }, visits }, env);
        if (!r.ok || r.t !== 'subset') throw new Error('subset failed');
        const mm2 = r.result.mm2!.byteLength;
        const assets = r.result.assets.reduce((n, p) => n + statSync(new URL(`../../public/map/${p}`, import.meta.url)).size, 0);
        const b64 = Math.ceil((mm2 + assets) / 3) * 4;
        rows.push(
          `start ${start} steps ${steps}: walked ${new Set(path).size}, visited ${r.result.visited}, rooms ${r.result.rooms}, mm2 ${mm2} B, ` +
            `assets ${r.result.assets.length} files ${assets} B, base64 total ≈ ${b64} B`,
        );
        expect(r.result.visited).toBeGreaterThan(0);
        if (steps === 30) expect(b64).toBeLessThan(900_000);
      }
    }
    console.log(rows.join('\n'));
  }, 60_000);
});
