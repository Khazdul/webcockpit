// Stage 9 P1: the pure parts of the map renderer (mesh builders,
// connection geometry, text layout, scene geometry). The WebGL side is
// covered by tests/e2e/map-render.spec.ts.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIR, DIR_COUNT, DOOR_FLAG, EXIT_FLAG, type MapData, buildIndexes } from '../../src/map/model';
import { readMm2 } from '../../src/map/mm2';
import { buildScene, Screen } from '../../src/map/render/characters';
import { buildConnections, connectionLine, connectionTriangles } from '../../src/map/render/connections';
import { fontSizeForDpr, FONT_STRIDE, FontVerts, layoutText, measureText, parseFnt } from '../../src/map/render/font';
import { buildInfomarks } from '../../src/map/render/infomarks';
import { NC, textColor, WHITE, BLACK, rgb } from '../../src/map/render/palette';
import { buildRoomMeshes, roadIndex, type RoomLayerMesh, roomsByLayer, wallColor } from '../../src/map/render/rooms';
import { ARRAY_FILES, dottedWallImages, L128, L256, roadSuffix } from '../../src/map/render/textures';
import { EMPTY_SCENE } from '../../src/map/scene';
import { defaultView, pxPerRoom } from '../../src/map/view';

interface RoomSpec {
  pos: [number, number, number];
  terrain?: number;
  light?: number;
  sundeath?: number;
  ridable?: number;
  mob?: number;
  load?: number;
  /** dir → [exit flags, target room indices, door flags?, door name?]. */
  exits?: Partial<Record<number, [number, number[], number?, string?]>>;
}

function makeMap(specs: RoomSpec[]): MapData {
  const n = specs.length;
  const slots = n * DIR_COUNT;
  const outStart = new Uint32Array(slots + 1);
  const to: number[] = [];
  const exitFlags = new Uint16Array(slots);
  const doorFlags = new Uint16Array(slots);
  const doorNames = new Map<number, string>();
  specs.forEach((s, r) => {
    for (let d = 0; d < DIR_COUNT; d++) {
      const slot = r * DIR_COUNT + d;
      outStart[slot] = to.length;
      const e = s.exits?.[d];
      if (!e) continue;
      exitFlags[slot] = e[0];
      doorFlags[slot] = e[2] ?? 0;
      if (e[3]) doorNames.set(slot, e[3]);
      to.push(...e[1]);
    }
  });
  outStart[slots] = to.length;
  const u8 = (f: (s: RoomSpec) => number) => Uint8Array.from(specs, f);
  const empty = { count: 0, type: new Uint8Array(0), cls: new Uint8Array(0), angle: new Int32Array(0), x1: new Int32Array(0), y1: new Int32Array(0), z1: new Int32Array(0), x2: new Int32Array(0), y2: new Int32Array(0), z2: new Int32Array(0), text: [] };
  const map: MapData = {
    version: 42,
    roomCount: n,
    selected: { x: 0, y: 0, z: 0 },
    x: Int32Array.from(specs, (s) => s.pos[0]),
    y: Int32Array.from(specs, (s) => s.pos[1]),
    z: Int32Array.from(specs, (s) => s.pos[2]),
    extId: Uint32Array.from(specs, (_, i) => i + 1),
    serverId: new Uint32Array(n),
    terrain: u8((s) => s.terrain ?? 3),
    light: u8((s) => s.light ?? 2),
    align: u8(() => 0),
    portable: u8(() => 0),
    ridable: u8((s) => s.ridable ?? 1),
    sundeath: u8((s) => s.sundeath ?? 0),
    mobFlags: Uint32Array.from(specs, (s) => s.mob ?? 0),
    loadFlags: Uint32Array.from(specs, (s) => s.load ?? 0),
    names: specs.map((_, i) => `Room ${i}`),
    descs: specs.map(() => ''),
    areas: specs.map(() => ''),
    contents: specs.map(() => ''),
    notes: specs.map(() => ''),
    exitFlags,
    doorFlags,
    doorNames,
    outStart,
    outTo: Uint32Array.from(to),
    inStart: new Uint32Array(0),
    inFrom: new Uint32Array(0),
    infomarks: empty,
    byServerId: new Map(),
    byNameDesc: new Map(),
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, count: 0 },
    layers: new Map(),
  };
  buildIndexes(map);
  return map;
}

const E = EXIT_FLAG.EXIT;

/** Instances of one category on layer 0, as [x, y, z, tex, color]. */
function instances(map: MapData, cat: string): number[][] {
  const layer = buildRoomMeshes(map).find((l) => l.z === 0)!;
  const r = layer.ranges[cat as keyof RoomLayerMesh['ranges']];
  const out: number[][] = [];
  for (let i = r.first; i < r.first + r.count; i++) {
    const w = layer.inst[i * 4 + 3]!;
    out.push([layer.inst[i * 4]!, layer.inst[i * 4 + 1]!, layer.inst[i * 4 + 2]!, w & 255, w >> 8]);
  }
  return out;
}

describe('texture catalogue', () => {
  it('names road and trail tiles in n, e, s, w order from the exit bits (N=1 S=2 E=4 W=8)', () => {
    expect(roadSuffix(0)).toBe('none');
    expect(roadSuffix(15)).toBe('all');
    expect(roadSuffix(1 | 2)).toBe('ns');
    expect(roadSuffix(4 | 2)).toBe('es');
    expect(roadSuffix(1 | 4 | 8)).toBe('new');
    expect(ARRAY_FILES.A128.files[L128.road(1 | 2)]).toBe('road-ns.png');
    expect(ARRAY_FILES.A128.files[L128.terrain(14)]).toBe('terrain-cavern.png');
    expect(ARRAY_FILES.A128.files[L128.mob(0)]).toBe('mob-rent.png');
    expect(ARRAY_FILES.A128.files[L128.load(15)]).toBe('load-watch.png');
    expect(ARRAY_FILES.A128.files[L128.noRide]).toBe('no-ride.png');
    expect(ARRAY_FILES.A128.files[L128.exitClimbDown]).toBe('exit-climb-down.png');
    expect(ARRAY_FILES.A128.files[L128.wall(DIR.W)]).toBe('wall-west.png');
    expect(ARRAY_FILES.A128.files[L128.streamOut(DIR.D)]).toBe('stream-out-down.png');
    expect(ARRAY_FILES.A128.files).toHaveLength(96);
    expect(ARRAY_FILES.A256.files[L256.door(DIR.U)]).toBe('door-up.png');
    expect(ARRAY_FILES.A256.files[L256.charRoomSel]).toBe('char-room-sel.png');
  });

  it('generates the dotted walls like MMapper (band on the edge, 2 on / 2 off)', () => {
    const south = dottedWallImages(DIR.S);
    expect(south.map((m) => Math.sqrt(m.length / 4))).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
    const a = (img: Uint8Array, size: number, x: number, y: number) => img[(y * size + x) * 4 + 3];
    // South: rows 0..3 (the south edge once uploaded unflipped).
    expect([0, 1, 2, 3].map((x) => a(south[0]!, 128, x, 0))).toEqual([255, 255, 0, 0]);
    expect(a(south[0]!, 128, 0, 3)).toBe(255);
    expect(a(south[0]!, 128, 0, 4)).toBe(0);
    // East: the band is the last column; north: the last rows; west: the first column.
    const east = dottedWallImages(DIR.E)[0]!;
    expect(a(east, 128, 127, 0)).toBe(255);
    expect(a(east, 128, 0, 0)).toBe(0);
    const north = dottedWallImages(DIR.N)[0]!;
    expect(a(north, 128, 127, 127)).toBe(255);
    expect(a(north, 128, 0, 0)).toBe(0);
    const west = dottedWallImages(DIR.W)[0]!;
    expect(a(west, 128, 0, 127)).toBe(255);
    expect(a(west, 128, 127, 0)).toBe(0);
  });
});

describe('room meshes', () => {
  it('picks the terrain, road and trail tiles from the road exits', () => {
    const map = makeMap([
      { pos: [0, 0, 0], terrain: 11, exits: { [DIR.N]: [E | EXIT_FLAG.ROAD, [1]], [DIR.E]: [E | EXIT_FLAG.ROAD, [2]] } },
      { pos: [0, 1, 0], terrain: 4, exits: { [DIR.S]: [E | EXIT_FLAG.ROAD, [0]] } },
      { pos: [1, 0, 0], terrain: 3, exits: { [DIR.W]: [E, [0]] } },
    ]);
    expect(roadIndex(map, 0)).toBe(1 | 4);
    expect(instances(map, 'terrain').map((i) => i[3])).toEqual([L128.road(1 | 4), L128.terrain(4), L128.terrain(3)]);
    // A trail only where the terrain is not ROAD; road-index "s" on room 1.
    expect(instances(map, 'trails')).toEqual([[0, 1, 0, 2, 0]]);
  });

  it('tints dark rooms, then no-sundeath rooms, and adds mob, load and no-ride overlays in order', () => {
    const map = makeMap([
      { pos: [0, 0, 0], light: 1, sundeath: 2, mob: 1 | (1 << 12), load: 1 << 17, ridable: 2 },
      { pos: [1, 0, 0], sundeath: 2 },
    ]);
    expect(instances(map, 'tintDark')).toEqual([[0, 0, 0, 0, NC.ROOM_DARK]]);
    expect(instances(map, 'tintNoSundeath')).toEqual([[1, 0, 0, 0, NC.ROOM_NO_SUNDEATH]]);
    expect(instances(map, 'overlays').map((i) => i[3])).toEqual([L128.mob(0), L128.mob(12), L128.load(17), L128.noRide]);
  });

  it('draws walls, doors, dotted flag walls, unmapped exits and up/down icons', () => {
    const map = makeMap([
      {
        pos: [0, 0, 0],
        exits: {
          [DIR.N]: [E | EXIT_FLAG.DOOR, [1], DOOR_FLAG.HIDDEN, 'skulldoor'],
          [DIR.E]: [E | EXIT_FLAG.UNMAPPED, []],
          [DIR.W]: [E | EXIT_FLAG.RANDOM, [2]],
          [DIR.U]: [E | EXIT_FLAG.CLIMB, [3]],
          [DIR.D]: [E, [4]],
        },
      },
      { pos: [0, 1, 0], exits: { [DIR.S]: [E, [0]] } },
      { pos: [-1, 0, 0] },
      { pos: [0, 0, 1] },
      { pos: [0, 0, -1] },
    ]);
    const room0 = (cat: string) => instances(map, cat).filter((i) => i[0] === 0 && i[1] === 0 && i[2] === 0);
    // Solid walls: south (no exit) and north (a door); east is an exit (unmapped) and west too.
    expect(room0('walls').map((i) => [i[3], i[4]])).toEqual([
      [L128.wall(DIR.N), NC.WALL_REGULAR_EXIT],
      [L128.wall(DIR.S), NC.WALL_REGULAR_EXIT],
    ]);
    expect(room0('doors').map((i) => i[3])).toEqual([L256.door(DIR.N)]);
    expect(room0('dotted').map((i) => [i[3], i[4]])).toEqual([
      [DIR.E, NC.WALL_NOT_MAPPED],
      [DIR.W, NC.WALL_RANDOM],
    ]);
    expect(room0('upDown').map((i) => [i[3], i[4]])).toEqual([
      [L128.exitClimbUp, NC.VERTICAL_CLIMB],
      [L128.exitDown, NC.VERTICAL_REGULAR_EXIT],
    ]);
    expect(wallColor(EXIT_FLAG.CLIMB, false)).toBe(NC.WALL_CLIMB);
    expect(wallColor(EXIT_FLAG.NO_FLEE | EXIT_FLAG.RANDOM, false)).toBe(NC.WALL_NO_FLEE);
    expect(wallColor(0, false)).toBe(-1);
  });

  it('splits layers in ascending z', () => {
    const map = makeMap([{ pos: [0, 0, 1] }, { pos: [0, 0, -1] }, { pos: [5, 5, 0] }]);
    expect([...roomsByLayer(map).keys()]).toEqual([-1, 0, 1]);
    expect(buildRoomMeshes(map).map((l) => l.z)).toEqual([-1, 0, 1]);
  });
});

describe('connections', () => {
  it('draws nothing for adjacent two-way exits in matching directions', () => {
    const map = makeMap([
      { pos: [0, 0, 0], exits: { [DIR.E]: [E, [1]] } },
      { pos: [1, 0, 0], exits: { [DIR.W]: [E, [0]] } },
    ]);
    const [l] = buildConnections(map, roomsByLayer(map));
    expect(l!.tris.length).toBe(0);
  });

  it('builds a one-way connection on the other lane with one arrow at the target', () => {
    expect(connectionLine(DIR.E, DIR.W, true, true, 1, 0, 0, 0)).toEqual([
      [0.9, 0.75, 0],
      [1.1, 0.75, 0],
      [0.9, 0.75, 0],
      [1.1, 0.75, 0],
    ]);
    const tris = connectionTriangles(DIR.E, DIR.W, true, 1, 0, 0, 0);
    expect(tris).toHaveLength(1);
    expect(tris[0]![2]).toEqual([1.3, 0.75, 0]);
    // Two-way end mirrors the start stub; up/down get no triangles.
    expect(connectionLine(DIR.N, DIR.S, false, false, 0, 3, 0, 0)).toEqual([
      [0.75, 0.9, 0],
      [0.75, 1.1, 0],
      [0.25, 2.9, 0],
      [0.25, 3.1, 0],
    ]);
    expect(connectionTriangles(DIR.U, DIR.D, false, 1, 0, 0, 0)).toHaveLength(0);
  });

  it('joins a down exit and an up exit of same-layer neighbours from icon to icon', () => {
    // As in the owner's screenshot: the rent room's "down" leads to the room east of it.
    expect(connectionLine(DIR.D, DIR.U, false, true, 1, 0, 0, 0)).toEqual([
      [0.25, 0.25, 0],
      [1.75, 0.75, 0],
    ]);
  });

  it('colours a connection red when one side lacks EXIT, fades long and cross-layer segments', () => {
    const map = makeMap([
      { pos: [0, 0, 0], exits: { [DIR.N]: [E, [1]], [DIR.U]: [E, [2]] } },
      { pos: [0, 5, 0] },
      { pos: [0, 0, 1] },
    ]);
    const conns = buildConnections(map, roomsByLayer(map));
    expect(conns.map((c) => c.z)).toEqual([0, 1]);
    const l0 = conns[0]!.tris;
    const alphas = new Set<number>();
    for (let i = 6; i < l0.length; i += 7) alphas.add(Math.round(l0[i]! * 100) / 100);
    expect(alphas).toEqual(new Set([1, 0.1]));
    // The cross-layer one-way connection is drawn on both layers.
    expect(conns[1]!.tris.length).toBeGreaterThan(0);
  });

  it('labels hidden named doors, merging both sides when adjacent', () => {
    const map = makeMap([
      { pos: [0, 0, 0], exits: { [DIR.N]: [E | EXIT_FLAG.DOOR, [1], DOOR_FLAG.HIDDEN | DOOR_FLAG.NEED_KEY, 'skulldoor'] } },
      { pos: [0, 1, 0], exits: { [DIR.S]: [E | EXIT_FLAG.DOOR, [0], DOOR_FLAG.HIDDEN, 'skulldoor'] } },
      { pos: [3, 0, 0], exits: { [DIR.W]: [E | EXIT_FLAG.DOOR, [], DOOR_FLAG.HIDDEN, 'crack'] } },
    ]);
    const [l] = buildConnections(map, roomsByLayer(map));
    expect(l!.doorNames.map((n) => [n.text, n.x, n.y])).toEqual([['skulldoor [L]/skulldoor', 0.6, 1.2]]);
  });
});

describe('infomarks', () => {
  it('builds text, line and arrow marks per layer with class colours at α 0.55', () => {
    const map = makeMap([{ pos: [0, 0, 0] }]);
    map.infomarks = {
      count: 3,
      type: Uint8Array.from([0, 1, 2]),
      cls: Uint8Array.from([0, 1, 4]),
      angle: new Int32Array(3),
      x1: Int32Array.from([150, 0, 0]),
      y1: Int32Array.from([250, 0, 0]),
      z1: Int32Array.from([0, 0, 0]),
      x2: Int32Array.from([0, 100, 100]),
      y2: Int32Array.from([0, 0, 0]),
      z2: Int32Array.from([0, 0, 0]),
      text: ['skulldoor', '', ''],
    };
    const [l] = buildInfomarks(map);
    expect(l!.texts).toHaveLength(1);
    expect(l!.texts[0]).toMatchObject({ x: 1.5, y: 2.5, text: 'skulldoor', fg: WHITE, bg: [0, 0, 0, 0.55] });
    // Arrow head (1 tri) first, then two line quads (4 tris).
    expect(l!.tris.length / 21).toBe(5);
    expect(textColor(rgb(0xffff00))).toEqual(BLACK);
    expect(textColor(rgb(0xff0000))).toEqual(WHITE);
  });
});

const FONT = new URL('../../public/map/fonts/Cantarell18.fnt', import.meta.url);

describe.skipIf(!existsSync(FONT))('BMFont text', () => {
  const fm = parseFnt(readFileSync(FONT, 'utf8'));

  it('parses Cantarell 18 and picks the size by DPR like MMapper', () => {
    expect(fm.lineHeight).toBe(18);
    expect(fm.base).toBe(15);
    expect(fm.glyphs.size).toBe(191);
    expect(fontSizeForDpr(1)).toBe(18);
    expect(fontSizeForDpr(1.5)).toBe(27);
    expect(fontSizeForDpr(2)).toBe(36);
  });

  it('lays out centred text with a background box (glyph bounds + 2/1 px)', () => {
    const v = new FontVerts();
    layoutText(fm, { x: 1, y: 2, z: 0, text: 'crack', fg: WHITE, bg: [0, 0, 0, 0.4], center: true }, v);
    // Background + 5 glyphs, 6 vertices each.
    expect(v.count).toBe(6 * 6);
    const w = measureText(fm, 'crack');
    const offs: number[] = [];
    for (let i = 0; i < 6; i++) offs.push(v.data[i * FONT_STRIDE + 9]!);
    expect(Math.min(...offs)).toBeLessThanOrEqual(-Math.trunc(w / 2) - 2);
    expect(Math.max(...offs)).toBeGreaterThanOrEqual(w - Math.trunc(w / 2));
    // Anchor stays the world position.
    expect(v.data.slice(0, 3)).toEqual([1, 2, 0]);
  });
});

describe('scene geometry', () => {
  it('projects like MMapper and finds the proxy point on the margin', () => {
    const view = { ...defaultView(), x: 10.5, y: 10.5 };
    const s = new Screen(view, 400, 300);
    expect(s.project([10.5, 10.5, 0])).toEqual([200, 150]);
    expect(s.project([11.5, 10.5, 0])![0]).toBeCloseTo(200 + pxPerRoom(1, 0));
    expect(s.roomVisible(10, 10, 0, 12)).toBe(true);
    expect(s.roomVisible(100, 10, 0, 12)).toBe(false);
    const p = s.proxy([100, 10.5, 0], 24);
    expect(s.project(p)![0]).toBeCloseTo(400 - 24, 0);
  });

  it('draws the player square, rotated unfilled group mates in the same room, labels elsewhere and the path', () => {
    const map = makeMap([{ pos: [0, 0, 0] }, { pos: [1, 0, 0] }, { pos: [2, 0, 0] }]);
    const view = { ...defaultView(), x: 0.5, y: 0.5 };
    const g = buildScene(
      {
        ...EMPTY_SCENE,
        room: 0,
        located: true,
        path: [1, 2],
        members: [
          { id: 1, room: 0, text: 'Mate', color: 0x00ffff, npc: false },
          { id: 2, room: 1, text: 'Far', color: 0xff00ff, npc: false },
        ],
      },
      { map, view, w: 400, h: 300, dpr: 1, font: existsSync(FONT) ? parseFnt(readFileSync(FONT, 'utf8')) : null },
    );
    // Three squares of 6 vertices: mate (rotated), far member, player last and axis-aligned.
    expect(g.roomSel.length / 10).toBe(18);
    const player = g.roomSel.slice(12 * 10, 12 * 10 + 3);
    expect(player).toEqual([0, 0, 0]);
    const mate = g.roomSel.slice(0, 3);
    expect(mate[0]).not.toBeCloseTo(0);
    // Path: two segments, one end point; only the member outside your room is labelled.
    expect(g.pathQuads.count).toBe(12);
    expect(g.points.count).toBe(6);
    if (existsSync(FONT)) expect(g.names.count).toBeGreaterThan(0);
  });

  it('uses the far outline style when zoomed out or not located', () => {
    const map = makeMap([{ pos: [0, 0, 0] }]);
    const scene = { ...EMPTY_SCENE, room: 0, located: false };
    const g = buildScene(scene, { map, view: { ...defaultView(), x: 0.5, y: 0.5 }, w: 400, h: 300, dpr: 1, font: null });
    expect(g.roomSel.length).toBe(0);
    // Fill (2 tris) and 4 outline quads (8 tris).
    expect(g.tris.count).toBe(30);
  });
});

const ARDA = new URL('../../public/map/arda.mm2', import.meta.url);

describe.skipIf(!existsSync(ARDA))('arda.mm2 meshes', () => {
  it('builds every layer quickly', async () => {
    const map = await readMm2(new Uint8Array(readFileSync(ARDA)));
    const t0 = performance.now();
    const layers = roomsByLayer(map);
    const rooms = buildRoomMeshes(map, layers);
    const t1 = performance.now();
    const conns = buildConnections(map, layers);
    const t2 = performance.now();
    const marks = buildInfomarks(map);
    const t3 = performance.now();
    console.info(`arda meshes: rooms ${(t1 - t0).toFixed(0)} ms, connections ${(t2 - t1).toFixed(0)} ms, infomarks ${(t3 - t2).toFixed(0)} ms`);
    expect(rooms.map((l) => l.z)).toEqual([-1, 0, 1, 2]);
    expect(rooms.reduce((n, l) => n + l.ranges.terrain.count, 0)).toBe(30074);
    expect(conns.reduce((n, l) => n + l.doorNames.length, 0)).toBeGreaterThan(0);
    expect(marks.reduce((n, l) => n + l.texts.length, 0)).toBe(614);
    expect(t3 - t0).toBeLessThan(3000);
  });
});
