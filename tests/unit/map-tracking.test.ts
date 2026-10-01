// Stage 9 P2 (ADR 0020): locator, prespam path, group mates, tracking and
// the main-thread event forwarder. The map tests use the bundled arda.mm2.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { MOVE_FAILURE_RE, MapEventForwarder, moveFailure } from '../../src/map/client';
import { ColorGenerator, GroupTable, hslColor, hueOf } from '../../src/map/group';
import { type RoomInfo, learnIds, locate, parseRoomInfo, visibleExits } from '../../src/map/locate';
import { DIR, type MapData } from '../../src/map/model';
import { LOOK, MOVE_NONE, PrespamQueue, parseMoveCommand, parseMovedDir, walkPath } from '../../src/map/path';
import type { MapEvent, WorkerToMain } from '../../src/map/protocol';
import type { Renderer } from '../../src/map/render/renderer';
import type { Scene } from '../../src/map/scene';
import { Tracker } from '../../src/map/tracking';
import { MapWorkerCore } from '../../src/map/worker/core';
import { memoryLearnedIds } from '../../src/map/worker/ids';
import { MAP_PROTOCOL_VERSION } from '../../src/map/protocol';
import { HAS_ARDA, loadArda, logEvents } from './map-helpers';

const FIXTURE = readFileSync(new URL('../fixtures/map-demo.log', import.meta.url), 'utf8');
/** The rooms map-demo.gen.ts walks through (its ROUTE output). */
const ROUTE = [
  26432, 26433, 26434, 26435, 26438, 26439, 26440, 26441, 26442, 26921, 26923, 26923, 26921, 26920, 26919, 26438, 26435, 26445,
  26446, 26447, 26969, 26974, 27000, 27001, 27000, 26974, 26969, 26970, 26971,
];

describe('prespam commands (MMapper parseSimpleCommand)', () => {
  it('recognises full and abbreviated directions, and a bare look', () => {
    expect(['n', 'no', 'North', 's', 'sou', 'e', 'w', 'we', 'u', 'd', 'down'].map(parseMoveCommand)).toEqual([
      DIR.N, DIR.N, DIR.N, DIR.S, DIR.S, DIR.E, DIR.W, DIR.W, DIR.U, DIR.D, DIR.D,
    ]);
    expect(parseMoveCommand('  north  now ')).toBe(DIR.N); // only the first word counts
    expect(parseMoveCommand('l')).toBe(LOOK);
    expect(parseMoveCommand('look')).toBe(LOOK);
    expect(parseMoveCommand('exa')).toBe(LOOK);
    expect(parseMoveCommand('look north')).toBeNull();
    expect(parseMoveCommand('ex')).toBeNull();
    expect(['', '  ', 'kill orc', 'northx', 'sc', 'flee', 'x'].map(parseMoveCommand)).toEqual(Array(7).fill(null));
  });

  it('maps Event.Moved', () => {
    expect(parseMovedDir({ dir: 'up' })).toBe(DIR.U);
    expect(parseMovedDir({ dir: 'none' })).toBe(MOVE_NONE);
    expect(parseMovedDir({ dir: 'sideways' })).toBe(DIR.UNKNOWN);
    expect(parseMovedDir(undefined)).toBe(DIR.UNKNOWN);
  });

  it('dequeues per arrival, clears on mismatch, pops on failure', () => {
    const q = new PrespamQueue();
    q.push(DIR.N);
    q.push(DIR.N);
    q.push(DIR.E);
    expect(q.arrive(DIR.N)).toBe(true);
    expect(q.items).toEqual([DIR.N, DIR.E]);
    expect(q.fail()).toBe(true);
    expect(q.items).toEqual([DIR.E]);
    q.push(LOOK);
    q.arrive(DIR.W); // mismatch
    expect(q.items).toEqual([]);
    expect(q.arrive(DIR.N)).toBe(false);
    expect(q.fail()).toBe(false);
  });
});

describe('move-failure lines', () => {
  it('matches MMapper starts-with, ends-with and regex actions', () => {
    const fail = [
      'Alas, you cannot go that way...',
      'The door seems to be closed.',
      'The gates seem to be closed.',
      'You need to swim to go there.',
      'The descent is too steep, you need to climb to go there.',
      'Your pony is too exhausted.',
      'You are too exhausted.',
      "ZBLAM! The pony doesn't want you riding him anymore.",
      'Maybe you should get on your feet first?',
    ];
    for (const l of fail) expect(MOVE_FAILURE_RE.exec(l)?.[1], l).toBeUndefined();
    for (const l of fail) expect(MOVE_FAILURE_RE.test(l), l).toBe(true);
    expect(MOVE_FAILURE_RE.exec('You are dead! Sorry...')?.[1]).toBe('You are dead!');
    for (const l of ['Gibur says: Alas, you cannot go that way...', 'The door seems to be closed', 'Exits: north.', '']) {
      expect(MOVE_FAILURE_RE.test(l), l).toBe(false);
    }
  });

  it('moveFailure gives what MOVE_FAILURE_RE gives', () => {
    const expected = (l: string) => {
      const m = MOVE_FAILURE_RE.exec(l);
      return m === null ? null : m[1] === undefined ? 'fail' : 'dead';
    };
    const lines = [
      'Alas, you cannot go that way...',
      'The door seems to be closed.',
      'The gates seem to be closed.',
      'The descent is too steep, you need to climb to go there.',
      'Your pony is too exhausted.',
      'You are too exhausted.',
      'You are too exhausted to ride.',
      "ZBLAM! The pony doesn't want you riding him anymore.",
      "ZBLAM! The pony doesn't want you riding him anymore. Really.",
      'You are dead! Sorry...',
      'You are dead! The door seems to be closed.',
      'If you still want to try, you must climb.',
      'Gibur says: Alas, you cannot go that way...',
      'The door seems to be closed',
      'The door seems\u2028to be closed.',
      'The door\u2028 seems to be closed.',
      'seems to be closed.',
      'Exits: north.',
      'You',
      '.',
      '',
      'Nah... You feel too relaxed to do that.',
      'Maybe you should get on your feet first?',
      'In your dreams, or what?',
      'No way! You are fighting for your life!',
    ];
    for (const l of lines) expect(moveFailure(l), JSON.stringify(l)).toBe(expected(l));
  });
});

describe('group mates (MMapper ColorGenerator, CGroupChar)', () => {
  it('gives golden-angle hues from the player colour and reuses released ones', () => {
    expect(hueOf(0xffff00)).toBe(60);
    const g = new ColorGenerator();
    expect([g.next(), g.next(), g.next()]).toEqual([198, 335, 113]);
    g.release(335);
    expect(g.next()).toBe(335);
    expect(g.next()).toBe(250);
    expect(hslColor(60)).toBe(0xfefe00);
    expect(hslColor(198)).toBe(0x00b2fe);
  });

  it('keeps a table by id without the player', () => {
    const t = new GroupTable();
    const resolve = (sid: number): number | null => (sid === 100 ? 7 : null);
    t.apply('Group.Set', [
      { id: 1, type: 'you', name: 'Rasta', mapid: 100 },
      { id: 2, type: 'ally', name: 'Gibur', label: 0, mapid: 100 },
      { id: 3, type: 'npc', name: 'a citizen mercenary', label: 'MERC', mapid: 5 },
    ]);
    expect(t.members(resolve)).toEqual([
      { id: 2, room: 7, text: 'Gibur', color: hslColor(198), npc: false },
      { id: 3, room: null, text: 'MERC', color: hslColor(335), npc: true },
    ]);
    expect(t.apply('group.update', { id: 3, mapid: 100 })).toBe(true);
    expect(t.apply('Group.Update', { id: 3, hp: 5 })).toBe(false);
    expect(t.members(resolve)[1]!.room).toBe(7);
    expect(t.apply('Group.Remove', 2)).toBe(true);
    expect(t.apply('Group.Add', { id: 9, type: 'ally', name: 'Dori' })).toBe(true);
    expect(t.members(resolve).map((m) => [m.id, m.color])).toEqual([
      [3, hslColor(335)],
      [9, hslColor(198)], // Gibur's released hue
    ]);
    expect(t.apply('Group.Update', { id: 11, name: 'Nob' })).toBe(true); // unknown id: added
    expect(t.size).toBe(3);
    expect(t.apply('Group.Remove', 42)).toBe(false);
  });
});

describe.skipIf(!HAS_ARDA)('locator and path on arda.mm2', () => {
  let map: MapData;
  beforeAll(async () => {
    map = await loadArda();
  });
  const info = (r: number, o: Partial<RoomInfo> = {}): RoomInfo => ({
    id: map.serverId[r] || null,
    name: map.names[r]!,
    desc: map.descs[r]!,
    exits: visibleExits(map, r),
    exitIds: [0, 0, 0, 0, 0, 0],
    ...o,
  });

  it('parses Room.Info', () => {
    const i = parseRoomInfo({ id: 0, name: 'X', desc: 'Y', exits: { n: { id: 5 }, d: {} } })!;
    expect(i).toEqual({ id: null, name: 'X', desc: 'Y', exits: 0b100001, exitIds: [5, 0, 0, 0, 0, 0] });
    expect(parseRoomInfo('nope')).toBeNull();
  });

  it('finds rooms by server id, direction + name, and name + description', () => {
    const learned = new Map<number, number>();
    expect(locate(map, learned, info(26435), null, LOOK)).toEqual({ room: 26435, how: 'id' });
    // Cobble Street has no server id: east of the Prancing Pony, by name (the description differs).
    const cobble = info(26438, { desc: 'Something else entirely.' });
    expect(locate(map, learned, cobble, 26435, DIR.E)).toEqual({ room: 26438, how: 'dir' });
    // Without a last room: by name and description.
    expect(locate(map, learned, info(26438), null, LOOK)).toEqual({ room: 26438, how: 'text' });
    expect(locate(map, learned, cobble, null, LOOK)).toEqual({ room: null, how: 'none' });
    expect(locate(map, learned, info(26438, { name: 'Nowhere' }), 26435, DIR.E)).toEqual({ room: null, how: 'none' });
  });

  it('never matches a room whose own server id differs', () => {
    const learned = new Map<number, number>();
    const wrong = info(26435, { id: 99_999_999 });
    expect(locate(map, learned, wrong, 26434, DIR.N)).toEqual({ room: null, how: 'none' });
  });

  it('learns ids by match and from exits, and checks learned rooms by name', () => {
    const learned = new Map<number, number>();
    const i = info(26438, { id: 17_026_438, exitIds: [0, 0, 17_026_439, 15_496_063, 0, 0] });
    const r = locate(map, learned, i, 26435, DIR.E);
    expect(r).toEqual({ room: 26438, how: 'dir' });
    // Its own id, and east's neighbour (no server id); west already has one.
    expect(learnIds(map, learned, i, r.room!, r.how)).toEqual([
      [17_026_438, 26438],
      [17_026_439, 26439],
    ]);
    expect(locate(map, learned, info(26439, { id: 17_026_439, desc: '?' }), null, LOOK)).toEqual({ room: 26439, how: 'learned' });
    // A learned id whose room has another name is dropped.
    expect(locate(map, learned, info(26440, { id: 17_026_439, desc: '?' }), null, LOOK).how).toBe('none');
    expect(learned.has(17_026_439)).toBe(false);
    // An id found by the map's own server id teaches nothing about itself.
    expect(learnIds(map, learned, info(26435), 26435, 'id')).toEqual([]);
  });

  it('breaks name + description ties by the moved exit, then by the exit set', () => {
    // Find a text group with two rooms whose visible exit sets differ.
    let pair: number[] | null = null;
    for (const list of map.byNameDesc.values()) {
      if (list.length === 2 && map.serverId[list[0]!] === 0 && map.serverId[list[1]!] === 0) {
        if (visibleExits(map, list[0]!) !== visibleExits(map, list[1]!)) {
          pair = list;
          break;
        }
      }
    }
    expect(pair).not.toBeNull();
    const [a, b] = pair!;
    const learned = new Map<number, number>();
    expect(locate(map, learned, info(a!), null, LOOK)).toEqual({ room: a, how: 'text' });
    expect(locate(map, learned, info(b!), null, LOOK)).toEqual({ room: b, how: 'text' });
    expect(locate(map, learned, info(a!, { exits: null }), null, LOOK)).toEqual({ room: null, how: 'none' });
  });

  it('walks the path like MMapper walk_path', () => {
    expect(walkPath(map, 26435, [DIR.E, LOOK, DIR.E, DIR.N])).toEqual([26438, 26439, 26440]);
    // No exit (the Prancing Pony's sign has no up): skipped, the walk goes on.
    expect(walkPath(map, 26435, [DIR.U, DIR.E])).toEqual([26438]);
    expect(walkPath(map, null, [DIR.N])).toEqual([]);
  });
});

describe.skipIf(!HAS_ARDA)('tracking the map-demo fixture', () => {
  let map: MapData;
  beforeAll(async () => {
    map = await loadArda();
  });

  it('follows the whole walk, the prespam path and the group mates', () => {
    const tr = new Tracker();
    tr.setMap(map, 'h');
    const events = logEvents(FIXTURE);
    const rooms: number[] = [];
    let maxPath = 0;
    let allLearned = 0;
    for (const ev of events) {
      const before = tr.stats.roomInfos;
      const r = tr.apply([ev]);
      allLearned += r.learned.length;
      maxPath = Math.max(maxPath, tr.current.path.length);
      if (tr.stats.roomInfos > before) {
        expect(tr.current.located, `after ${rooms.length} arrivals`).toBe(true);
        rooms.push(tr.current.room!);
      }
    }
    expect(rooms).toEqual(ROUTE);
    // `n;n;n` shows a three-room path at once.
    expect(maxPath).toBe(3);
    expect(tr.current.path).toEqual([]);
    const s = tr.stats;
    expect(s.roomInfos).toBe(ROUTE.length);
    expect(s.byHow.none).toBe(0);
    expect(s.byHow.dir).toBeGreaterThan(0);
    expect(allLearned).toBeGreaterThan(10);
    // Gibur ends on the Old East Road (a map id); the mercenary on Cobble
    // Street, whose invented id was learned from an exit.
    expect(tr.current.members.map((m) => [m.text, m.room])).toEqual([
      ['Gibur', 26447],
      ['MERC', 26439],
    ]);
    console.log(`map-demo locator: ${JSON.stringify(s.byHow)} of ${s.roomInfos}; ${allLearned} ids learned`);
  });

  it('pops the queue on a failure line, clears it on death and disconnect', () => {
    const tr = new Tracker();
    tr.setMap(map, 'h');
    tr.apply([{ k: 'gmcp', pkg: 'Room.Info', data: { id: map.serverId[26435], name: map.names[26435], desc: map.descs[26435] } }]);
    expect(tr.current.room).toBe(26435);
    tr.apply([{ k: 'cmd', text: 'w' }, { k: 'cmd', text: 'e' }, { k: 'cmd', text: 'e' }]);
    expect(tr.current.path).toEqual([26445, 26435, 26438]);
    tr.apply([{ k: 'fail', kind: 'fail' }]);
    expect(tr.current.path).toEqual([26438, 26439]);
    tr.apply([{ k: 'fail', kind: 'dead' }]);
    expect(tr.current.path).toEqual([]);
    tr.apply([{ k: 'cmd', text: 'e' }, { k: 'conn', state: 'disconnected', prev: 'playing' } as MapEvent]);
    expect(tr.current.path).toEqual([]);
  });

  it('keeps the last room but not located when Room.Info does not match; Event.Moved first is fine', () => {
    const tr = new Tracker();
    tr.setMap(map, 'h');
    const r = tr.apply([
      { k: 'gmcp', pkg: 'Event.Moved', data: { dir: 'north' } },
      { k: 'gmcp', pkg: 'Room.Info', data: { id: map.serverId[26435], name: map.names[26435], desc: map.descs[26435] } },
    ]);
    expect(r.moved).toBe(true);
    expect(tr.status).toEqual({ located: true, room: 26435, how: 'id' });
    tr.apply([{ k: 'gmcp', pkg: 'Room.Info', data: { name: 'Somewhere Else', desc: 'x' } }]);
    expect(tr.status).toEqual({ located: false, room: 26435, how: 'none' });
    // An Event.Moved with no Room.Info after it: the next one steps blindly first.
    tr.apply([{ k: 'gmcp', pkg: 'Room.Info', data: { id: map.serverId[26435], name: map.names[26435], desc: map.descs[26435] } }]);
    tr.apply([
      { k: 'gmcp', pkg: 'Event.Moved', data: { dir: 'east' } },
      { k: 'gmcp', pkg: 'Event.Moved', data: { dir: 'east' } },
      { k: 'gmcp', pkg: 'Room.Info', data: { name: map.names[26439], desc: 'dark' } },
    ]);
    expect(tr.status).toEqual({ located: true, room: 26439, how: 'dir' });
  });
});

describe.skipIf(!HAS_ARDA)('map worker core tracking', () => {
  it('sets the scene, re-centres, posts status and persists learned ids', async () => {
    const map = await loadArda();
    const out: WorkerToMain[] = [];
    const frames: (() => void)[] = [];
    const scenes: Scene[] = [];
    const renderer: Renderer = {
      setMap: () => {},
      setScene: (s) => void scenes.push(s),
      resize: () => {},
      render: () => {},
      dispose: () => {},
    };
    let current = renderer;
    const ids = memoryLearnedIds();
    ids.rows.set('abc|17026971', 26971);
    const core = new MapWorkerCore({
      post: (m) => void out.push(m),
      requestFrame: (cb) => void frames.push(cb),
      fetch: fetch,
      now: () => 0,
      createRenderer: () => current,
      ids,
    });
    const listeners = new Map<string, (e: Event) => void>();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({}) as WebGL2RenderingContext,
      addEventListener: (t: string, f: (e: Event) => void) => void listeners.set(t, f),
    } as unknown as OffscreenCanvas;
    core.handle({ t: 'init', protocol: MAP_PROTOCOL_VERSION, canvas, width: 200, height: 100, dpr: 1, assets: { kind: 'base', url: '/map/' } });
    core.handle({ t: 'persistIds', on: true });
    // A parsed map (no hash for `data`); give the tracker a hash as a .mm2 load would.
    await core.load(1, { kind: 'data', map, name: 'arda' });
    core.tracker.setMap(map, 'abc');
    core.handle({ t: 'persistIds', on: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(core.tracker.learned.get(17026971)).toBe(26971);

    core.handle({ t: 'events', events: logEvents(FIXTURE) });
    const last = out.filter((m) => m.t === 'status').pop();
    expect(last).toEqual({ t: 'status', located: true, room: 26971, how: 'learned' });
    expect(scenes.at(-1)!.room).toBe(26971);
    expect(core.view.x).toBe(map.x[26971]! + 0.5);
    expect(core.view.layer).toBe(map.z[26971]);
    await new Promise((r) => setTimeout(r, 0));
    expect(ids.rows.get('abc|17026440')).toBe(26440);
    expect(ids.rows.size).toBeGreaterThan(10);

    // A lost and restored WebGL context: the new renderer gets the map,
    // the tracker's current scene and the size again.
    let maps = 0;
    const restored: Scene[] = [];
    const sizes: number[][] = [];
    const again: Renderer = {
      setMap: (m) => void (m === map && maps++),
      setScene: (s) => void restored.push(s),
      resize: (w, h, d) => void sizes.push([w, h, d]),
      render: () => {},
      dispose: () => {},
    };
    let disposed = 0;
    renderer.dispose = () => void disposed++;
    current = again;
    listeners.get('webglcontextlost')!({ preventDefault: () => {} } as Event);
    listeners.get('webglcontextrestored')!({} as Event);
    expect(disposed).toBe(1);
    expect(maps).toBe(1);
    expect(restored.at(-1)).toBe(core.tracker.current);
    expect(restored.at(-1)!.room).toBe(26971);
    expect(sizes.at(-1)).toEqual([200, 100, 1]);
    expect(out.slice(-2)).toEqual([
      { t: 'error', stage: 'render', message: 'WebGL context lost' },
      { t: 'restored' },
    ]);
  });
});

describe('main-thread forwarder', () => {
  it('forwards only what the map needs, batched per microtask', async () => {
    const batches: MapEvent[][] = [];
    const f = new MapEventForwarder((b) => void batches.push(b));
    f.onCmd({ text: 'n', ts: 0 });
    f.onCmd({ text: 'secret', ts: 0, secret: true });
    f.onGmcp({ pkg: 'room.info', data: { id: 1 } });
    f.onGmcp({ pkg: 'Char.Vitals', data: {} });
    f.onLine({ text: 'Alas, you cannot go that way...', raw: '', runs: [], tags: [], prompt: false, ts: 0 });
    f.onLine({ text: 'Exits: north.', raw: '', runs: [], tags: [], prompt: false, ts: 0 });
    f.onConn({ state: 'playing', prev: 'login', replay: true });
    expect(batches).toEqual([]);
    await Promise.resolve();
    expect(batches).toEqual([
      [
        { k: 'cmd', text: 'n' },
        { k: 'gmcp', pkg: 'Room.Info', data: { id: 1 } },
        { k: 'fail', kind: 'fail' },
        { k: 'conn', state: 'playing', replay: true },
      ],
    ]);
  });

  it('costs well under 0.05 ms per event on the main thread', () => {
    let sent = 0;
    const f = new MapEventForwarder((b) => void (sent += b.length), (cb) => cb());
    const lines = FIXTURE.split('\n').map((t) => ({ text: t.slice(17), raw: t, runs: [], tags: [], prompt: false, ts: 0 }));
    const N = 20_000;
    const time = (fn: (i: number) => void): number => {
      for (let i = 0; i < 2000; i++) fn(i); // warm-up
      const t0 = performance.now();
      for (let i = 0; i < N; i++) fn(i);
      return (performance.now() - t0) / N;
    };
    const cmd = time(() => f.onCmd({ text: 'north', ts: 0 }));
    const gmcpHit = time(() => f.onGmcp({ pkg: 'Room.Info', data: null }));
    const gmcpMiss = time(() => f.onGmcp({ pkg: 'Char.Vitals', data: null }));
    const line = time((i) => f.onLine(lines[i % lines.length]!));
    console.log(
      `forwarder ms/event: cmd ${cmd.toFixed(5)}, gmcp hit ${gmcpHit.toFixed(5)}, gmcp miss ${gmcpMiss.toFixed(5)}, text.line ${line.toFixed(5)}`,
    );
    for (const ms of [cmd, gmcpHit, gmcpMiss, line]) expect(ms).toBeLessThan(0.05);
    expect(sent).toBeGreaterThan(0);
  });
});
