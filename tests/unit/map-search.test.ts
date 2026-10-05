// Map search for scripts (ADR 0077 §B): matching per field (MMapper
// RoomFilter), the shortest paths (MMapper's costs), direction text, room
// details, the worker's `ask`, and the new mark options (until unmarked,
// focus "move").

import { describe, expect, it } from 'vitest';
import { DIR, DIR_COUNT, DOOR_FLAG, EXIT_FLAG, LOAD_FLAGS, MOB_FLAGS, type MapData, RIDABLE, buildIndexes } from '../../src/map/model';
import { MAP_PROTOCOL_VERSION, type MainToWorker, type WorkerToMain } from '../../src/map/protocol';
import type { Renderer } from '../../src/map/render/renderer';
import type { Scene } from '../../src/map/scene';
import {
  compressDirs,
  pathTo,
  roomDetails,
  roomPath,
  searchPattern,
  searchRooms,
  shortestPaths,
} from '../../src/map/search';
import { MapWorkerCore } from '../../src/map/worker/core';
import { HAS_ARDA, loadArda } from './map-helpers';

interface TRoom {
  pos: [number, number, number];
  name?: string;
  desc?: string;
  note?: string;
  area?: string;
  contents?: string;
  terrain?: number;
  ridable?: number;
  mob?: string[];
  load?: string[];
}
interface TExit {
  from: number;
  dir: number;
  to: number[];
  flags?: number;
  door?: { name?: string; flags?: number };
}

const EXIT = EXIT_FLAG.EXIT;

function makeMap(rooms: TRoom[], exits: TExit[]): MapData {
  const n = rooms.length;
  const slots = n * DIR_COUNT;
  const exitFlags = new Uint16Array(slots);
  const doorFlags = new Uint16Array(slots);
  const doorNames = new Map<number, string>();
  const outs: number[][] = Array.from({ length: slots }, () => []);
  for (const e of exits) {
    const s = e.from * DIR_COUNT + e.dir;
    exitFlags[s] = EXIT | (e.flags ?? 0) | (e.door ? EXIT_FLAG.DOOR : 0);
    outs[s] = e.to;
    if (e.door) {
      doorFlags[s] = e.door.flags ?? 0;
      if (e.door.name) doorNames.set(s, e.door.name);
    }
  }
  const outStart = new Uint32Array(slots + 1);
  for (let s = 0; s < slots; s++) outStart[s + 1] = outStart[s]! + outs[s]!.length;
  const empty = { count: 0, type: new Uint8Array(0), cls: new Uint8Array(0), angle: new Int32Array(0), x1: new Int32Array(0), y1: new Int32Array(0), z1: new Int32Array(0), x2: new Int32Array(0), y2: new Int32Array(0), z2: new Int32Array(0), text: [] };
  const bits = (names: readonly string[], list?: string[]) => (list ?? []).reduce((b, f) => b | (1 << names.indexOf(f)), 0);
  const map: MapData = {
    version: 42,
    roomCount: n,
    selected: { x: 0, y: 0, z: 0 },
    x: Int32Array.from(rooms, (r) => r.pos[0]),
    y: Int32Array.from(rooms, (r) => r.pos[1]),
    z: Int32Array.from(rooms, (r) => r.pos[2]),
    extId: Uint32Array.from(rooms, (_, i) => i + 1),
    serverId: new Uint32Array(n),
    terrain: Uint8Array.from(rooms, (r) => r.terrain ?? 1),
    light: new Uint8Array(n),
    align: new Uint8Array(n),
    portable: new Uint8Array(n),
    ridable: Uint8Array.from(rooms, (r) => r.ridable ?? 0),
    sundeath: new Uint8Array(n),
    mobFlags: Uint32Array.from(rooms, (r) => bits(MOB_FLAGS, r.mob)),
    loadFlags: Uint32Array.from(rooms, (r) => bits(LOAD_FLAGS, r.load)),
    names: rooms.map((r, i) => r.name ?? `Room ${i}`),
    descs: rooms.map((r) => r.desc ?? ''),
    areas: rooms.map((r) => r.area ?? ''),
    contents: rooms.map((r) => r.contents ?? ''),
    notes: rooms.map((r) => r.note ?? ''),
    exitFlags,
    doorFlags,
    doorNames,
    outStart,
    outTo: Uint32Array.from(outs.flat()),
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

/**
 * 0 Home (0,0) —e→ 1 Road (1,0) —e→ 2 Road (2,0) —e→ 3 Gate (3,0) —n (door "gate")→ 4 Glade (3,1)
 * 0 —u→ 5 Attic (0,0,1); 0 —s→ 6 Pit (0,-1) deathtrap; 6 —e→ 7 (unreachable otherwise? no: 3 —s→ 7)
 * 8 Island (50,50): no exits to it. 9 Swamp: two targets (random) from 4.
 */
function town(): MapData {
  return makeMap(
    [
      { pos: [0, 0, 0], name: 'Home', desc: 'A cosy\nhome.', terrain: 1 },
      { pos: [1, 0, 0], name: 'Old Road', terrain: 11, area: 'Bree' },
      { pos: [2, 0, 0], name: 'Old Road', terrain: 11, area: 'Bree' },
      { pos: [3, 0, 0], name: 'The Gate', terrain: 2, mob: ['aggressive_mob'] },
      { pos: [3, 1, 0], name: 'A Glade', terrain: 4, note: 'Herb: athelas\n', load: ['herb'], contents: 'a small flower' },
      { pos: [0, 0, 1], name: 'Attic', terrain: 1, ridable: RIDABLE.NOT_RIDABLE },
      { pos: [0, -1, 0], name: 'The Pit', terrain: 3, load: ['deathtrap'] },
      { pos: [3, -1, 0], name: 'Lhûn Bank', terrain: 3 },
      { pos: [50, 50, 0], name: 'Island', terrain: 3, note: 'Herb: kingsfoil\n' },
      { pos: [4, 1, 0], name: 'Swamp', terrain: 3 },
      { pos: [5, 1, 0], name: 'Swamp', terrain: 3 },
    ],
    [
      { from: 0, dir: DIR.E, to: [1], flags: EXIT_FLAG.ROAD },
      { from: 1, dir: DIR.E, to: [2], flags: EXIT_FLAG.ROAD },
      { from: 2, dir: DIR.E, to: [3] },
      { from: 3, dir: DIR.N, to: [4], door: { name: 'gate', flags: DOOR_FLAG.NEED_KEY } },
      { from: 0, dir: DIR.U, to: [5], flags: EXIT_FLAG.CLIMB },
      { from: 0, dir: DIR.S, to: [6] },
      { from: 6, dir: DIR.E, to: [7] },
      { from: 3, dir: DIR.S, to: [7] },
      { from: 4, dir: DIR.E, to: [9, 10], flags: EXIT_FLAG.RANDOM },
    ],
  );
}

describe('search pattern (MMapper createRegex)', () => {
  it('a plain text is a case-insensitive substring; whitespace matches any run; regex on request; folded to ASCII', () => {
    const re = searchPattern({ text: ' a.b  c ' });
    expect(re.test('xx A.B\n c')).toBe(true);
    expect(re.test('aXb c')).toBe(false);
    expect(searchPattern({ text: 'Road', case: true }).test('old road')).toBe(false);
    expect(searchPattern({ text: '^Old R', regex: true }).test('old road')).toBe(true);
    expect(() => searchPattern({ text: '(', regex: true })).toThrow(SyntaxError);
    expect(searchPattern({ text: 'Lhûn' }).test('Lhun Bank')).toBe(true);
  });

  it('compressDirs writes runs separated by spaces', () => {
    expect(compressDirs('eeenuu')).toBe('3e n 2u');
    expect(compressDirs('')).toBe('');
    expect(compressDirs('nsns')).toBe('n s n s');
  });
});

describe('searchRooms on a small map', () => {
  const map = town();
  const ids = (r: ReturnType<typeof searchRooms>) => r.results.map((h) => h.id);

  it('matches each field', () => {
    expect(ids(searchRooms(map, { text: 'road' }, null))).toEqual([1, 2]);
    expect(ids(searchRooms(map, { text: 'cosy home', field: 'desc' }, null))).toEqual([0]);
    expect(ids(searchRooms(map, { text: 'flower', field: 'contents' }, null))).toEqual([4]);
    expect(ids(searchRooms(map, { text: 'herb:', field: 'note' }, null))).toEqual([4, 8]);
    expect(ids(searchRooms(map, { text: 'bree', field: 'area' }, null))).toEqual([1, 2]);
    // Exits: door names (MMapper).
    expect(ids(searchRooms(map, { text: 'gate', field: 'exits' }, null))).toEqual([3]);
    // Flags: MMapper's names, our words, exit and door flags; never "exit".
    expect(ids(searchRooms(map, { text: 'aggmob', field: 'flags' }, null))).toEqual([3]);
    expect(ids(searchRooms(map, { text: 'aggressive mob', field: 'flags' }, null))).toEqual([3]);
    expect(ids(searchRooms(map, { text: 'herb', field: 'flags' }, null))).toEqual([4]);
    expect(ids(searchRooms(map, { text: 'needkey', field: 'flags' }, null))).toEqual([3]);
    expect(ids(searchRooms(map, { text: 'climb', field: 'flags' }, null))).toEqual([0]);
    expect(ids(searchRooms(map, { text: 'noride', field: 'flags' }, null))).toEqual([5]);
    expect(searchRooms(map, { text: 'exit', field: 'flags' }, null).total).toBe(0);
    // All: any of them.
    expect(ids(searchRooms(map, { text: 'gate', field: 'all' }, null))).toEqual([3]);
    expect(ids(searchRooms(map, { text: 'herb', field: 'all' }, null))).toEqual([4, 8]);
    expect(() => searchRooms(map, { text: '[', regex: true }, null)).toThrow();
  });

  it('orders by path cost from the player, then by straight-line distance; max cuts, total counts all', () => {
    const r = searchRooms(map, { text: 'a', field: 'name' }, 0);
    expect(r.here).toBe(0);
    const order = r.results.map((h) => h.name);
    expect(order.slice(0, 5)).toEqual(['Old Road', 'Old Road', 'The Gate', 'Lhûn Bank', 'A Glade']);
    // Unreachable last: Swamp ×2 (random exit), Island (no way in), nearest first.
    expect(order.slice(-3)).toEqual(['Swamp', 'Swamp', 'Island']);
    expect(r.results.at(-1)).toMatchObject({ steps: null, dirs: null });
    const glade = r.results.find((h) => h.id === 4)!;
    expect(glade).toMatchObject({ steps: 4, dirs: '3e n', note: 'Herb: athelas\n' });
    expect(searchRooms(map, { text: 'a', max: 2 }, 0)).toMatchObject({ total: r.total });
    expect(searchRooms(map, { text: 'a', max: 2 }, 0).results).toHaveLength(2);
    // Without a position: index order, no steps.
    const none = searchRooms(map, { text: 'a' }, null);
    expect(none.here).toBeNull();
    expect(ids(none)).toEqual([...ids(none)].sort((a, b) => a - b));
    expect(none.results.every((h) => h.steps === null)).toBe(true);
  });

  it('path costs follow MMapper: terrain, road −0.1, door +1, climb +2, not ridable +3/+4, deathtrap +1000, random skipped', () => {
    const t = shortestPaths(map, 0);
    // Home → Road (road terrain 0.85 − 0.1) → Road → Gate (city 0.75) → Glade (forest 2.15 + door 1).
    expect(t.cost[1]).toBeCloseTo(0.75);
    expect(t.cost[3]).toBeCloseTo(0.75 + 0.75 + 0.75);
    expect(t.cost[4]).toBeCloseTo(2.25 + 3.15);
    // Attic: indoors 0.75 + climb 2 + not ridable 3 + 4.
    expect(t.cost[5]).toBeCloseTo(9.75);
    // The pit: field 1.5 + deathtrap 1000.
    expect(t.cost[6]).toBeCloseTo(1001.5);
    // Lhûn Bank: through the gate (2.25 + 1.5), not the pit.
    expect(pathTo(t, 7)).toEqual({ dirs: '3e s', steps: 4 });
    expect(t.cost[9]).toBe(Infinity);
    expect(pathTo(t, 0)).toEqual({ dirs: '', steps: 0 });
    expect(roomPath(map, 0, 5)).toEqual({ dirs: 'u', steps: 1 });
    expect(roomPath(map, null, 5)).toBeNull();
    expect(roomPath(map, 0, 99)).toBeNull();
  });

  it('roomDetails: text, terrain, exits with doors and flags, flags in words', () => {
    expect(roomDetails(map, 3)).toEqual({
      id: 3,
      name: 'The Gate',
      area: '',
      desc: '',
      contents: '',
      note: '',
      terrain: 'city',
      x: 3,
      y: 0,
      z: 0,
      exits: [
        { dir: 'north', to: 4, door: 'gate', flags: ['needkey'] },
        { dir: 'south', to: 7, flags: [] },
      ],
      flags: ['aggressive mob'],
    });
    expect(roomDetails(map, 4)!.exits).toEqual([{ dir: 'east', flags: ['random'] }]);
    expect(roomDetails(map, 4)!.flags).toEqual(['herb']);
    expect(roomDetails(map, 11)).toBeNull();
  });
});

describe.skipIf(!HAS_ARDA)('map search on arda.mm2', () => {
  it('one Dijkstra over the whole map is fast; a name search with paths too', async () => {
    const map = await loadArda();
    const from = map.byServerId.values().next().value as number;
    shortestPaths(map, from);
    const t0 = performance.now();
    const tree = shortestPaths(map, (from + 1) % map.roomCount);
    const ms = performance.now() - t0;
    let reach = 0;
    for (const c of tree.cost) if (c !== Infinity) reach++;
    expect(reach).toBeGreaterThan(map.roomCount * 0.9);
    // Generous for CI; about 8 ms on a desktop.
    expect(ms).toBeLessThan(200);
    const r = searchRooms(map, { text: 'tunnel' }, from);
    expect(r.total).toBeGreaterThan(100);
    expect(r.results).toHaveLength(200);
    const steps = r.results.map((h) => h.steps ?? Infinity);
    expect(steps[0]).toBeLessThanOrEqual(steps[50]!);
    expect(r.results[0]!.dirs).toMatch(/^(\d*[nsewud?] ?)+$/);
    // Herb notes (about 1 300 notes in the map).
    expect(searchRooms(map, { text: 'herb', field: 'note' }, from).total).toBeGreaterThan(100);
  });
});

function harness(map: MapData) {
  const out: WorkerToMain[] = [];
  let frames: (() => void)[] = [];
  const scenes: Scene[] = [];
  let now = 0;
  const renderer: Renderer = { setMap: () => {}, setScene: (s) => void scenes.push(s), resize: () => {}, render: () => {}, dispose: () => {} };
  const canvas = { width: 0, height: 0, getContext: () => ({}) as WebGL2RenderingContext } as unknown as OffscreenCanvas;
  const core = new MapWorkerCore({
    post: (m) => void out.push(m),
    requestFrame: (cb) => void frames.push(cb),
    fetch,
    now: () => now,
    createRenderer: () => renderer,
    setTimer: () => {},
  });
  core.handle({ t: 'init', protocol: MAP_PROTOCOL_VERSION, canvas, width: 400, height: 300, dpr: 1, assets: { kind: 'base', url: '/' } });
  return {
    core,
    out,
    scenes,
    send: (m: MainToWorker) => core.handle(m),
    run: (ms: number) => {
      const end = now + ms;
      do {
        now = Math.min(end, now + 16);
        const f = frames;
        frames = [];
        for (const cb of f) cb();
      } while (now < end);
    },
    load: () => core.load(1, { kind: 'data', map, name: 'test' }),
    room: (r: number) =>
      core.handle({ t: 'events', events: [{ k: 'gmcp', pkg: 'Room.Info', data: { name: map.names[r], desc: map.descs[r] } }] }),
  };
}

const STYLE = { color: 0xff40ff, blink: true, fade: 0, arrows: true };

describe('map worker core: ask and the new mark options', () => {
  it('answers search, path and room from the player\'s room; a bad regex answers an error', async () => {
    const h = harness(town());
    await h.load();
    h.room(0);
    h.send({ t: 'ask', req: 1, ask: { k: 'search', query: { text: 'glade' } } });
    expect(h.out.at(-1)).toEqual({
      t: 'answer',
      req: 1,
      answer: { k: 'search', results: [{ id: 4, name: 'A Glade', area: '', note: 'Herb: athelas\n', steps: 4, dirs: '3e n' }], total: 1, here: 0 },
    });
    h.send({ t: 'ask', req: 2, ask: { k: 'path', room: 5 } });
    expect(h.out.at(-1)).toEqual({ t: 'answer', req: 2, answer: { k: 'path', dirs: 'u', steps: 1 } });
    h.send({ t: 'ask', req: 3, ask: { k: 'path', room: 8 } });
    expect(h.out.at(-1)).toEqual({ t: 'answer', req: 3, answer: { k: 'path', dirs: null, steps: null } });
    h.send({ t: 'ask', req: 4, ask: { k: 'room', room: 1 } });
    expect(h.out.at(-1)).toMatchObject({ t: 'answer', req: 4, answer: { k: 'room', room: { id: 1, name: 'Old Road', terrain: 'road' } } });
    h.send({ t: 'ask', req: 5, ask: { k: 'search', query: { text: '(', regex: true } } });
    expect(h.out.at(-1)).toMatchObject({ t: 'answer', req: 5, answer: { k: 'search', results: [], total: 0, error: expect.any(String) } });
  });

  it('a mark of Infinity ms blinks until unmarked', async () => {
    const h = harness(town());
    await h.load();
    h.send({ t: 'mark', id: 1, target: { rooms: [4, 8] }, style: STYLE, ms: Infinity });
    h.run(3_600_000 / 60); // one minute
    expect(h.core.liveMarks).toBe(1);
    const alphas = h.scenes.slice(-20).map((s) => s.marks![0]!.alpha);
    expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(0.3);
    const ticks = h.core.markTicks;
    h.run(1000);
    expect(h.core.markTicks - ticks).toBeGreaterThanOrEqual(13);
    h.send({ t: 'unmark', id: 1 });
    expect(h.out.at(-1)).toEqual({ t: 'markEnded', id: 1 });
    expect(h.core.liveMarks).toBe(0);
  });

  it('focus "move": fits now, a look keeps it, the first move to another room restores the zoom and follows; marks stay', async () => {
    const h = harness(town());
    await h.load();
    h.room(0);
    const zoom = h.core.view.zoom;
    h.send({ t: 'mark', id: 1, target: { rooms: [8] }, style: STYLE, ms: Infinity, focus: 'move' });
    const fitted = { ...h.core.view };
    expect(fitted.zoom).toBeLessThan(zoom);
    h.room(0); // a look
    expect(h.core.view).toEqual(fitted);
    h.room(3);
    expect(h.core.view).toMatchObject({ zoom, x: 3.5, y: 0.5, layer: 0 });
    expect(h.core.liveMarks).toBe(1);
    // Following again: the next move centres, no re-fit.
    h.room(4);
    expect(h.core.view).toMatchObject({ zoom, x: 3.5, y: 1.5 });
    // A pan before the move ends the focus too: the view stays where the player put it, then follows.
    h.send({ t: 'mark', id: 2, target: { rooms: [8] }, style: STYLE, ms: Infinity, focus: 'move' });
    h.send({ t: 'pan', dx: 30, dy: 0 });
    const panned = { ...h.core.view };
    expect(panned.zoom).toBeLessThan(zoom);
    h.send({ t: 'unmark', id: 2 });
    expect(h.core.view).toEqual(panned);
    h.room(0);
    expect(h.core.view).toMatchObject({ zoom: panned.zoom, x: 0.5 });
    // Unmarked before any move: the zoom comes back.
    h.send({ t: 'zoom', steps: 3, x: 200, y: 150 });
    const z2 = h.core.view.zoom;
    h.send({ t: 'mark', id: 3, target: { rooms: [8] }, style: STYLE, ms: Infinity, focus: 'move' });
    expect(h.core.view.zoom).toBeLessThan(z2);
    h.send({ t: 'unmark', id: 3 });
    expect(h.core.view.zoom).toBe(z2);
  });
});
