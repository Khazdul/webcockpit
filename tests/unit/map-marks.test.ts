// Script map marks (ADR 0057): the room query on arda.mm2, fitRooms, the
// worker core's marks (fake clock), the scene geometry and the main-thread
// hub.

import { describe, expect, it } from 'vitest';
import { MapMarkHub, type MapMarkPort } from '../../src/map/marks';
import { DIR_COUNT, type MapData, buildIndexes, normalizeText } from '../../src/map/model';
import { MAP_PROTOCOL_VERSION, type MainToWorker, type WorkerToMain } from '../../src/map/protocol';
import { findRooms, parseExits } from '../../src/map/query';
import { buildScene } from '../../src/map/render/characters';
import type { Renderer } from '../../src/map/render/renderer';
import { EMPTY_SCENE, type Scene } from '../../src/map/scene';
import { ZOOM_MIN, defaultView, fitRooms, pxPerRoom } from '../../src/map/view';
import { MARK_TICK_MS, MapWorkerCore } from '../../src/map/worker/core';
import { HAS_ARDA, loadArda } from './map-helpers';

/** A small map: rooms at positions, with names and descriptions. */
function makeMap(rooms: Array<{ pos: [number, number, number]; name?: string; desc?: string }>): MapData {
  const n = rooms.length;
  const slots = n * DIR_COUNT;
  const empty = { count: 0, type: new Uint8Array(0), cls: new Uint8Array(0), angle: new Int32Array(0), x1: new Int32Array(0), y1: new Int32Array(0), z1: new Int32Array(0), x2: new Int32Array(0), y2: new Int32Array(0), z2: new Int32Array(0), text: [] };
  const map: MapData = {
    version: 42,
    roomCount: n,
    selected: { x: 0, y: 0, z: 0 },
    x: Int32Array.from(rooms, (r) => r.pos[0]),
    y: Int32Array.from(rooms, (r) => r.pos[1]),
    z: Int32Array.from(rooms, (r) => r.pos[2]),
    extId: Uint32Array.from(rooms, (_, i) => i + 1),
    serverId: new Uint32Array(n),
    terrain: new Uint8Array(n).fill(3),
    light: new Uint8Array(n),
    align: new Uint8Array(n),
    portable: new Uint8Array(n),
    ridable: new Uint8Array(n),
    sundeath: new Uint8Array(n),
    mobFlags: new Uint32Array(n),
    loadFlags: new Uint32Array(n),
    names: rooms.map((r, i) => r.name ?? `Room ${i}`),
    descs: rooms.map((r) => r.desc ?? ''),
    areas: rooms.map(() => ''),
    contents: rooms.map(() => ''),
    notes: rooms.map(() => ''),
    exitFlags: new Uint16Array(slots),
    doorFlags: new Uint16Array(slots),
    doorNames: new Map(),
    outStart: new Uint32Array(slots + 1),
    outTo: new Uint32Array(0),
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

describe.skipIf(!HAS_ARDA)('room query on arda.mm2', () => {
  it('finds a unique name; an ambiguous one narrowed by a description line or the exits; brief mode keeps all', async () => {
    const map = await loadArda();
    const by = new Map<string, number[]>();
    for (let r = 0; r < map.roomCount; r++) {
      const n = normalizeText(map.names[r]!);
      const l = by.get(n);
      if (l) l.push(r);
      else by.set(n, [r]);
    }
    const unique = [...by.entries()].find(([n, l]) => l.length === 1 && n.length > 8)!;
    expect(findRooms(map, { name: unique[0] }, null)).toEqual({ rooms: unique[1], total: 1 });
    // Case-insensitive fallback; whitespace normalised.
    expect(findRooms(map, { name: `  ${unique[0].toUpperCase()} ` }, null).rooms).toEqual(unique[1]);

    // Felak-Azan: three rooms with different descriptions and exits.
    const fel = by.get('Felak-Azan')!;
    expect(fel).toHaveLength(3);
    expect(findRooms(map, { name: 'Felak-Azan' }, null).total).toBe(3);
    const line = normalizeText(map.descs[fel[1]!]!).slice(0, 60);
    expect(findRooms(map, { name: 'Felak-Azan', lines: ['A magenta aura glows.', line] }, null)).toEqual({ rooms: [fel[1]], total: 1 });
    // Lines that match nothing (brief mode, auras, objects): all stay.
    expect(findRooms(map, { name: 'Felak-Azan', lines: ['A long sword lies here, rusty and forgotten.'] }, null).total).toBe(3);
    // Exits: 41 = N, E, W? bits 0,3,5 → north, west, down.
    expect(parseExits('Exits: north, [west], down.')).toBe(0b101001);
    expect(parseExits('No exits here')).toBeNull();
    expect(findRooms(map, { name: 'Felak-Azan', exits: 'Exits: north, [west], down.' }, null)).toEqual({ rooms: [fel[1]], total: 1 });
    // Exits that no candidate has: ignored.
    expect(findRooms(map, { name: 'Felak-Azan', exits: 'Exits: east.' }, null).total).toBe(3);
    // Nothing.
    expect(findRooms(map, { name: 'No Such Room Anywhere' }, null)).toEqual({ rooms: [], total: 0 });
  });

  it('orders by distance from the player and cuts at max', async () => {
    const map = await loadArda();
    const from = 26971; // Hill Road (map-demo's end)
    const r = findRooms(map, { name: 'Old East Road' }, from);
    expect(r.total).toBe(184);
    expect(r.rooms).toHaveLength(20);
    const d = (x: number) => (map.x[x]! - map.x[from]!) ** 2 + (map.y[x]! - map.y[from]!) ** 2 + ((map.z[x]! - map.z[from]!) * 8) ** 2;
    for (let i = 1; i < r.rooms.length; i++) expect(d(r.rooms[i]!)).toBeGreaterThanOrEqual(d(r.rooms[i - 1]!));
    expect(findRooms(map, { name: 'Old East Road', max: 5 }, from).rooms).toEqual(r.rooms.slice(0, 5));
    expect(findRooms(map, { name: 'Old East Road', max: 500 }, from).rooms).toHaveLength(50);
  });
});

describe('fitRooms', () => {
  it('shows the player and the targets, never zooms in, clamps, works without a player', () => {
    const v = { ...defaultView(), zoom: 1 };
    // Close rooms: no zoom change (never in), centred between them.
    const near = fitRooms(v, { x: 0, y: 0, z: 0 }, [{ x: 2, y: 0, z: 0 }], 400, 300);
    expect(near.zoom).toBe(1);
    expect(near.x).toBeCloseTo(1.5);
    // Far: zoomed out until both fit inside the margin.
    const far = fitRooms(v, { x: 0, y: 0, z: 0 }, [{ x: 40, y: 10, z: 0 }], 400, 300);
    expect(far.zoom).toBeLessThan(1);
    expect(41 * pxPerRoom(far.zoom, 0)).toBeLessThanOrEqual(400 - 96 + 1e-6);
    // Too far for both even at ZOOM_MIN: the target wins, not the midpoint (ADR 0079).
    const vfar = fitRooms(v, { x: 0, y: 0, z: 0 }, [{ x: 50000, y: 0, z: 2 }], 400, 300);
    expect(vfar).toMatchObject({ x: 50000.5, y: 0.5, layer: 2 });
    expect(vfar.zoom).toBeLessThanOrEqual(1);
    // Targets too far apart from each other as well: the first (nearest) one.
    const spread = fitRooms(v, { x: 0, y: 0, z: 0 }, [{ x: 30000, y: 0, z: 0 }, { x: 90000, y: 0, z: 0 }], 400, 300);
    expect(spread).toMatchObject({ x: 30000.5, y: 0.5, layer: 0 });
    // Two targets that fit together (but not with the player): framed together.
    const pair = fitRooms(v, { x: 0, y: 0, z: 0 }, [{ x: 30000, y: 0, z: 0 }, { x: 30004, y: 0, z: 0 }], 400, 300);
    expect(pair.x).toBeCloseTo(30002.5);
    // No player: the targets alone, on their layer.
    const alone = fitRooms(v, null, [{ x: 10, y: 10, z: 1 }], 400, 300);
    expect(alone).toMatchObject({ x: 10.5, y: 10.5, layer: 1 });
    expect(fitRooms(v, null, [], 400, 300)).toBe(v);
  });
});

function harness(map: MapData) {
  const out: WorkerToMain[] = [];
  let frames: (() => void)[] = [];
  const scenes: Scene[] = [];
  const views: { x: number; y: number; zoom: number; layer: number }[] = [];
  let now = 0;
  const timers: Array<{ at: number; cb: () => void }> = [];
  const renderer: Renderer = {
    setMap: () => {},
    setScene: (s) => void scenes.push(s),
    resize: () => {},
    render: (v) => void views.push(v),
    dispose: () => {},
  };
  const canvas = { width: 0, height: 0, getContext: () => ({}) as WebGL2RenderingContext } as unknown as OffscreenCanvas;
  const core = new MapWorkerCore({
    post: (m) => void out.push(m),
    requestFrame: (cb) => void frames.push(cb),
    fetch,
    now: () => now,
    createRenderer: () => renderer,
    setTimer: (cb, ms) => void timers.push({ at: now + ms, cb }),
  });
  core.handle({ t: 'init', protocol: MAP_PROTOCOL_VERSION, canvas, width: 400, height: 300, dpr: 1, assets: { kind: 'base', url: '/' } });
  const t = {
    core,
    out,
    scenes,
    views,
    send: (m: MainToWorker) => core.handle(m),
    /** Advances the clock by `ms` in frames of 16 ms. */
    run: (ms: number) => {
      const end = now + ms;
      do {
        now = Math.min(end, now + 16);
        const f = frames;
        frames = [];
        for (const cb of f) cb();
        for (const tm of timers.filter((x) => x.at <= now)) {
          timers.splice(timers.indexOf(tm), 1);
          tm.cb();
        }
      } while (now < end);
    },
    pending: () => frames.length,
    timers,
    async load() {
      await core.load(1, { kind: 'data', map, name: 'test' });
    },
    room: (r: number) => {
      core.handle({
        t: 'events',
        events: [{ k: 'gmcp', pkg: 'Room.Info', data: { name: map.names[r], desc: map.descs[r] } }],
      });
    },
  };
  return t;
}

const STYLE = { color: 0xff40ff, blink: true, fade: 5, arrows: true };

describe('map worker core: marks', () => {
  const map = () =>
    makeMap([
      { pos: [0, 0, 0], name: 'Home', desc: 'Your home.' },
      { pos: [30, 20, 0], name: 'A Tunnel', desc: 'A long dark tunnel.' },
      { pos: [-30, 0, 0], name: 'A Tunnel', desc: 'A short wet tunnel.' },
      { pos: [5, 5, 1], name: 'Tower', desc: 'High up.' },
    ]);

  it('find answers a query; mark → marked, a blinking scene at 15 Hz, markEnded at the end, then the loop stops', async () => {
    const h = harness(map());
    await h.load();
    h.room(0);
    h.send({ t: 'find', req: 7, query: { name: 'A Tunnel' } });
    expect(h.out.at(-1)).toEqual({ t: 'found', req: 7, rooms: [2, 1], total: 2 });
    h.send({ t: 'mark', id: 3, target: { query: { name: 'a tunnel', max: 1 } }, style: STYLE, ms: 15_000 });
    expect(h.out.at(-1)).toEqual({ t: 'marked', id: 3, rooms: [2], total: 2 });
    expect(h.core.liveMarks).toBe(1);
    h.run(1000);
    // ~15 scene refreshes per second.
    expect(h.core.markTicks).toBeGreaterThanOrEqual(13);
    expect(h.core.markTicks).toBeLessThanOrEqual(16);
    const alphas = h.scenes.filter((s) => s.marks).map((s) => s.marks![0]!.alpha);
    expect(Math.max(...alphas)).toBeGreaterThan(0.9);
    expect(Math.min(...alphas)).toBeLessThan(0.2);
    // Fading in the last 5 s.
    h.run(12_000);
    expect(h.scenes.at(-1)!.marks![0]!.alpha).toBeLessThan(0.45);
    h.run(2100);
    expect(h.out.at(-1)).toEqual({ t: 'markEnded', id: 3 });
    expect(h.scenes.at(-1)!.marks).toBeUndefined();
    const ticks = h.core.markTicks;
    h.run(1000);
    expect(h.core.markTicks).toBe(ticks);
    expect(h.pending()).toBe(0);
    // Nothing matched: marked [] and markEnded at once.
    h.send({ t: 'mark', id: 4, target: { query: { name: 'Nowhere' } }, style: STYLE, ms: 1000 });
    expect(h.out.slice(-2)).toEqual([
      { t: 'marked', id: 4, rooms: [], total: 0 },
      { t: 'markEnded', id: 4 },
    ]);
    // Rooms by id (bad ids dropped); unmark ends it.
    h.send({ t: 'mark', id: 5, target: { rooms: [3, 99, -1] }, style: STYLE, ms: 60_000 });
    expect(h.out.at(-1)).toEqual({ t: 'marked', id: 5, rooms: [3], total: 1 });
    h.send({ t: 'unmark', id: 5 });
    expect(h.out.at(-1)).toEqual({ t: 'markEnded', id: 5 });
    expect(MARK_TICK_MS).toBe(66);
  });

  it('no ticks while hidden; a hidden mark ends on time when shown again', async () => {
    const h = harness(map());
    await h.load();
    h.send({ t: 'mark', id: 1, target: { rooms: [1] }, style: STYLE, ms: 2000 });
    h.send({ t: 'visible', visible: false });
    const ticks = h.core.markTicks;
    h.run(3000);
    expect(h.core.markTicks).toBe(ticks);
    h.send({ t: 'visible', visible: true });
    expect(h.out.at(-1)).toEqual({ t: 'markEnded', id: 1 });
  });

  it('focus fits the view; untouched it comes back; a pan keeps the player\'s view; a move re-fits', async () => {
    const h = harness(map());
    await h.load();
    h.room(0);
    const before = { ...h.core.view };
    h.send({ t: 'mark', id: 1, target: { rooms: [1] }, style: STYLE, ms: 15_000, focus: true });
    expect(h.core.view.zoom).toBeLessThan(before.zoom);
    expect(h.core.view.x).toBeCloseTo(15.5);
    // A move during the focus re-fits (not just centres).
    h.room(3);
    expect(h.core.view.layer).toBe(1);
    expect(h.core.view.zoom).toBeLessThan(before.zoom);
    h.room(0);
    h.run(15_100);
    // Untouched: the zoom back, centred on the player.
    expect(h.core.view).toMatchObject({ zoom: before.zoom, x: 0.5, y: 0.5, layer: 0 });

    // Touched (a pan): the view stays where the player put it.
    h.send({ t: 'mark', id: 2, target: { rooms: [2] }, style: STYLE, ms: 5000, focus: true });
    h.send({ t: 'pan', dx: 40, dy: 0 });
    const panned = { ...h.core.view };
    h.room(0);
    expect(h.core.view.x).not.toBeCloseTo(panned.x); // a move centres (no re-fit) once touched
    h.send({ t: 'zoom', steps: 1, x: 0, y: 0 });
    const mine = { ...h.core.view };
    h.run(5100);
    expect(h.core.view).toEqual(mine);
  });

  it('linger: after the blink the mark stays steady with its arrows, no ticker, and ends after duration + linger; the zoom comes back at the blink\'s end', async () => {
    const h = harness(map());
    await h.load();
    h.room(0);
    const zoom = h.core.view.zoom;
    h.send({ t: 'mark', id: 9, target: { rooms: [1] }, style: { ...STYLE, linger: 180, label: '$cave' }, ms: 15_000, focus: true });
    expect(h.core.view.zoom).toBeLessThan(zoom);
    h.run(15_100);
    // The blink is over: the zoom is back, the mark lingers steady.
    expect(h.core.view.zoom).toBe(zoom);
    expect(h.out.some((m) => m.t === 'markEnded')).toBe(false);
    const steady = h.scenes.at(-1)!.marks![0]!;
    expect(steady).toMatchObject({ rooms: [1], alpha: 0.75, arrows: true, label: '$cave' });
    // No ticks during the linger, nor pending frames.
    const ticks = h.core.markTicks;
    const scenes = h.scenes.length;
    h.run(60_000);
    expect(h.core.markTicks).toBe(ticks);
    expect(h.scenes.length).toBe(scenes);
    expect(h.pending()).toBe(0);
    // The arrows are still drawn: the room is off the view at the restored zoom.
    const g = buildScene(h.scenes.at(-1)!, { map: h.core.map!, view: h.core.view, w: 400, h: 300, dpr: 1, font: null });
    expect(g.arrows.count).toBeGreaterThan(0);
    // Ends after 15 + 180 s, by the timer.
    h.run(120_000);
    expect(h.out.at(-1)).toEqual({ t: 'markEnded', id: 9 });
    expect(h.scenes.at(-1)!.marks).toBeUndefined();
    expect(h.timers).toHaveLength(0);
  });

  it('a map load drops the marks', async () => {
    const h = harness(map());
    await h.load();
    h.send({ t: 'mark', id: 1, target: { rooms: [1] }, style: STYLE, ms: 60_000 });
    await h.load();
    expect(h.out.some((m) => m.t === 'markEnded' && m.id === 1)).toBe(true);
    expect(h.core.liveMarks).toBe(0);
  });
});

describe('scene geometry: marks', () => {
  const map = makeMap([{ pos: [0, 0, 0] }, { pos: [100, 0, 0] }, { pos: [1, 0, 1] }]);
  const ctx = (zoom = 1) => ({ map, view: { ...defaultView(), x: 0.5, y: 0.5, zoom }, w: 400, h: 300, dpr: 1, font: null });
  const scene = (rooms: number[], alpha = 1): Scene => ({ ...EMPTY_SCENE, marks: [{ rooms, color: 0xff40ff, alpha, arrows: true }] });

  it('a visible room: fill and outline, no arrow; off view: an edge arrow; another layer: the layer arrow', () => {
    const on = buildScene(scene([0]), ctx());
    // Fill (2 tris) and 4 outline quads (8 tris).
    expect(on.tris.count).toBe(30);
    expect(on.arrows.count).toBe(0);
    const off = buildScene(scene([1]), ctx());
    expect(off.arrows.count).toBeGreaterThan(0);
    const up = buildScene(scene([2]), ctx());
    expect(up.tris.count).toBeGreaterThan(30); // the layer arrow's outline
    // Invisible at alpha 0.
    expect(buildScene(scene([0, 1], 0), ctx()).tris.count).toBe(0);
  });

  it('small rooms also get a screen dot', () => {
    expect(buildScene(scene([0]), ctx(1)).points.count).toBe(0);
    const small = buildScene(scene([0]), ctx(0.1));
    expect(pxPerRoom(0.1, 0)).toBeLessThan(12);
    expect(small.points.count).toBe(6);
  });
});

describe('MapMarkHub', () => {
  it('is "map off" without a shown port; routes answers; a detach ends live marks', () => {
    const hub = new MapMarkHub();
    expect(hub.unavailable()).toBe('map off');
    expect(hub.mark({ rooms: [1] }, STYLE, 1000, false, { marked: () => {}, ended: () => {} })).toBeNull();
    const sent: string[] = [];
    let shown = true;
    const port: MapMarkPort = {
      find: (req) => void sent.push(`find ${req}`),
      mark: (id) => void sent.push(`mark ${id}`),
      unmark: (id) => void sent.push(`unmark ${id}`),
      ask: (req, q) => void sent.push(`ask ${req} ${q.k}`),
      shown: () => shown,
    };
    const detach = hub.attach(port);
    expect(hub.unavailable()).toBeNull();
    const got: string[] = [];
    const id = hub.mark({ rooms: [1] }, STYLE, 1000, false, {
      marked: (r) => void got.push(`marked ${r.rooms.join(',')}`),
      ended: () => void got.push('ended'),
    })!;
    hub.marked(id, [1], 1);
    hub.find({ name: 'x' }, (r) => void got.push(`found ${r.total}`));
    expect(sent).toEqual([`mark ${id}`, `find ${id + 1}`]);
    hub.found(id + 1, [], 0);
    // Asks (ADR 0077 §B): answered by req; a detach answers null.
    expect(hub.ask({ k: 'room', room: 3 }, (a) => void got.push(`room ${a?.k === 'room' && a.room === null ? 'none' : '?'}`))).toBe(true);
    expect(sent.at(-1)).toBe(`ask ${id + 2} room`);
    hub.answered(id + 2, { k: 'room', room: null });
    hub.ask({ k: 'path', room: 3 }, (a) => void got.push(`path ${a === null ? 'null' : a.k}`));
    expect(hub.unmark(id)).toBe(true);
    expect(sent.at(-1)).toBe(`unmark ${id}`);
    shown = false;
    expect(hub.unavailable()).toBe('map off');
    detach();
    expect(got).toEqual([`marked 1`, 'found 0', 'room none', 'path null', 'ended']);
    expect(hub.live).toBe(0);
  });
});
