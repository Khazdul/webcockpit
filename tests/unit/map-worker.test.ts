import { describe, expect, it } from 'vitest';
import { assetResolver } from '../../src/map/assets';
import { writeMm2 } from '../../src/map/mm2-write';
import type { MapData } from '../../src/map/model';
import { MAP_PROTOCOL_VERSION, type WorkerToMain } from '../../src/map/protocol';
import type { Renderer } from '../../src/map/render/renderer';
import { centreOn, defaultView, pan, pxPerRoom, zoomAt, ZOOM_MAX } from '../../src/map/view';
import { MapWorkerCore, PROGRESS_MS } from '../../src/map/worker/core';
import { readMm2 } from '../../src/map/mm2';
import { migrateLayout } from '../../src/settings/migrate';

describe('map view', () => {
  it('uses MMapper projection: 44 px per room on layer 0 at zoom 1', () => {
    expect(pxPerRoom(1, 0)).toBe(44);
    expect(pxPerRoom(1, 1)).toBeCloseTo(49.8, 1);
  });

  it('pans with the pointer (+y is north, up on screen)', () => {
    const v = pan(defaultView(), 44, 44);
    expect(v.x).toBeCloseTo(-1);
    expect(v.y).toBeCloseTo(1);
  });

  it('zooms around the cursor and clamps', () => {
    const v0 = centreOn(defaultView(), 10, 20, 0);
    const w = 400;
    const h = 300;
    const at = (v: typeof v0, px: number, py: number) => {
      const s = pxPerRoom(v.zoom, v.layer);
      return { x: v.x + (px - w / 2) / s, y: v.y - (py - h / 2) / s };
    };
    const before = at(v0, 50, 70);
    const v1 = zoomAt(v0, 2, 50, 70, w, h);
    expect(v1.zoom).toBeCloseTo(1.175 ** 2);
    const after = at(v1, 50, 70);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomAt(v0, 100, 0, 0, w, h).zoom).toBe(ZOOM_MAX);
  });
});

describe('asset resolver', () => {
  it('reads from a base URL or from inline files', async () => {
    const seen: string[] = [];
    const fake = (async (u: string) => {
      seen.push(String(u));
      return new Response('x');
    }) as typeof fetch;
    await assetResolver({ kind: 'base', url: '/map' }, fake)('pixmaps/a.png');
    expect(seen).toEqual(['/map/pixmaps/a.png']);
    const blob = new Blob(['y']);
    const inline = assetResolver({ kind: 'inline', files: { 'fonts/a.fnt': blob, 'b.png': 'data:,z' } });
    expect(await inline('fonts/a.fnt')).toBe(blob);
    expect(await (await inline('b.png')).text()).toBe('z');
    await expect(inline('nope.png')).rejects.toThrow(/not included/);
  });
});

function tinyFile(): Promise<Uint8Array> {
  const one = (n: number): Int32Array => Int32Array.from([n]);
  const empty = {
    count: 0,
    type: new Uint8Array(0),
    cls: new Uint8Array(0),
    angle: new Int32Array(0),
    x1: new Int32Array(0),
    y1: new Int32Array(0),
    z1: new Int32Array(0),
    x2: new Int32Array(0),
    y2: new Int32Array(0),
    z2: new Int32Array(0),
    text: [],
  };
  const map: MapData = {
    version: 42,
    roomCount: 1,
    selected: { x: 5, y: 6, z: 0 },
    x: one(5),
    y: one(6),
    z: one(0),
    extId: Uint32Array.from([1]),
    serverId: Uint32Array.from([77]),
    terrain: Uint8Array.from([3]),
    light: new Uint8Array(1),
    align: new Uint8Array(1),
    portable: new Uint8Array(1),
    ridable: new Uint8Array(1),
    sundeath: new Uint8Array(1),
    mobFlags: new Uint32Array(1),
    loadFlags: new Uint32Array(1),
    names: ['A'],
    descs: ['B'],
    areas: [''],
    contents: [''],
    notes: ['Herb: thyme\n'],
    exitFlags: new Uint16Array(7),
    doorFlags: new Uint16Array(7),
    doorNames: new Map(),
    outStart: new Uint32Array(8),
    outTo: new Uint32Array(0),
    inStart: new Uint32Array(0),
    inFrom: new Uint32Array(0),
    infomarks: empty,
    byServerId: new Map(),
    byNameDesc: new Map(),
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, count: 0 },
    layers: new Map(),
  };
  return writeMm2(map);
}

function harness(files: Record<string, Uint8Array> = {}) {
  const out: WorkerToMain[] = [];
  const frames: (() => void)[] = [];
  const draws: number[] = [];
  const renderer: Renderer & { complete: boolean } = {
    setMap: () => {},
    setScene: () => {},
    resize: () => {},
    render: (v) => void draws.push(v.zoom),
    dispose: () => {},
    complete: true,
  };
  const canvas = { width: 0, height: 0, getContext: () => ({}) as WebGL2RenderingContext } as unknown as OffscreenCanvas;
  const core = new MapWorkerCore({
    post: (m) => void out.push(m),
    requestFrame: (cb) => void frames.push(cb),
    fetch: (async (u: string) => {
      const f = files[String(u)];
      return f ? new Response(f as Uint8Array<ArrayBuffer>) : new Response('nope', { status: 404 });
    }) as typeof fetch,
    now: () => 0,
    createRenderer: () => renderer,
  });
  const runFrames = (): void => {
    for (const cb of frames.splice(0)) cb();
  };
  core.handle({ t: 'init', protocol: MAP_PROTOCOL_VERSION, canvas, width: 200, height: 100, dpr: 2, assets: { kind: 'base', url: '/map/' } });
  return { core, out, canvas, draws, runFrames, renderer };
}

describe('map worker core', () => {
  it('initialises, sizes the canvas in device px and renders on demand', () => {
    const h = harness();
    expect(h.out).toEqual([{ t: 'ready' }]);
    expect([h.canvas.width, h.canvas.height]).toEqual([400, 200]);
    h.core.handle({ t: 'pan', dx: 1, dy: 1 });
    h.core.handle({ t: 'zoom', steps: 1, x: 0, y: 0 });
    h.runFrames();
    expect(h.draws).toHaveLength(1); // coalesced
    h.core.handle({ t: 'visible', visible: false });
    h.core.handle({ t: 'pan', dx: 1, dy: 1 });
    h.runFrames();
    expect(h.draws).toHaveLength(1);
    h.core.handle({ t: 'unknown-from-the-future' } as never);
  });

  it('loads a map by URL and reports counts; a bad load keeps the map', async () => {
    const h = harness({ '/map/a.mm2': await tinyFile() });
    await h.core.load(1, { kind: 'url', url: '/map/a.mm2' });
    const loaded = h.out.find((m) => m.t === 'loaded');
    expect(loaded).toMatchObject({ t: 'loaded', req: 1, info: { name: 'a.mm2', rooms: 1, infomarks: 0, serverIds: 1 } });
    expect(h.core.view).toMatchObject({ x: 5.5, y: 6.5, layer: 0 });
    await h.core.load(2, { kind: 'url', url: '/map/missing.mm2' });
    expect(h.out.at(-1)).toMatchObject({ t: 'error', stage: 'load', req: 2 });
    expect(h.core.map?.roomCount).toBe(1);
    await h.core.load(3, { kind: 'bytes', bytes: new Uint8Array([1, 2, 3]).buffer, name: 'x.mm2' });
    expect(h.out.at(-1)).toMatchObject({ t: 'error', stage: 'load', message: expect.stringMatching(/too short/) });
  });

  it('reports load stages, and the first frame with every tile and the font once per load', async () => {
    const h = harness({ '/map/a.mm2': await tinyFile() });
    h.renderer.complete = false;
    await h.core.load(1, { kind: 'url', url: '/map/a.mm2' });
    expect(h.out.find((m) => m.t === 'loaded')).toMatchObject({
      info: { stages: { fetch: 0, inflate: 0, parse: 0, hash: 0, meshes: 0 } },
    });
    h.runFrames();
    expect(h.out.some((m) => m.t === 'drawn')).toBe(false); // tiles still loading
    h.renderer.complete = true;
    h.core.requestRender();
    h.runFrames();
    expect(h.out.filter((m) => m.t === 'drawn')).toEqual([{ t: 'drawn', req: 1, ms: 0 }]);
    h.core.handle({ t: 'pan', dx: 1, dy: 0 });
    h.runFrames();
    expect(h.out.filter((m) => m.t === 'drawn')).toHaveLength(1);
  });

  it('loads parsed data (a subset sent by the main thread)', async () => {
    const h = harness();
    const map = await readMm2(await tinyFile());
    await h.core.load(4, { kind: 'data', map: structuredClone(map), name: 'subset' });
    expect(h.out.at(-1)).toMatchObject({ t: 'loaded', info: { rooms: 1, serverIds: 1, hash: '' } });
  });

  it('answers stamped Room.Infos with the located room\'s note (ADR 0077)', async () => {
    const h = harness();
    await h.core.load(1, { kind: 'data', map: await readMm2(await tinyFile()), name: 't' });
    h.core.handle({
      t: 'events',
      events: [
        { k: 'gmcp', pkg: 'Room.Info', data: { id: 77, name: 'A' }, seq: 1 },
        { k: 'gmcp', pkg: 'Room.Info', data: { id: 5, name: 'Elsewhere' }, seq: 2 },
        { k: 'gmcp', pkg: 'Room.Info', data: { id: 77, name: 'A' } },
      ],
    });
    expect(h.out.filter((m) => m.t === 'roomNotes')).toEqual([
      {
        t: 'roomNotes',
        notes: [
          { seq: 1, note: 'Herb: thyme\n' },
          { seq: 2, note: '' },
        ],
      },
    ]);
    // Nothing stamped: nothing posted.
    const n = h.out.length;
    h.core.handle({ t: 'events', events: [{ k: 'gmcp', pkg: 'Room.Info', data: { id: 77, name: 'A' } }] });
    expect(h.out.slice(n).some((m) => m.t === 'roomNotes')).toBe(false);
  });

  it('answers roomAt with the room under the point and its hover content (ADR 0077)', async () => {
    const h = harness();
    await h.core.load(1, { kind: 'data', map: await readMm2(await tinyFile()), name: 't' });
    // The view is centred on the selected position (5, 6): the canvas centre is room 0.
    h.core.handle({ t: 'roomAt', req: 1, x: 100, y: 50, full: false });
    expect(h.out.at(-1)).toMatchObject({ t: 'roomAt', req: 1, room: 0, info: { name: 'A', note: 'Herb: thyme\n' } });
    expect((h.out.at(-1) as { info: object }).info).not.toHaveProperty('desc');
    h.core.handle({ t: 'roomAt', req: 2, x: 100, y: 50, full: true });
    expect(h.out.at(-1)).toMatchObject({ t: 'roomAt', req: 2, room: 0, info: { name: 'A', desc: 'B', contents: '', exits: 'Exits: none.' } });
    expect((h.out.at(-1) as { info: object }).info).not.toHaveProperty('flags');
    h.core.handle({ t: 'roomAt', req: 3, x: 0, y: 0, full: false });
    expect(h.out.at(-1)).toEqual({ t: 'roomAt', req: 3, room: null });
  });

  it('reports a missing WebGL2 at init', () => {
    const out: WorkerToMain[] = [];
    const core = new MapWorkerCore({ post: (m) => void out.push(m), requestFrame: () => {}, fetch, now: () => 0 });
    const canvas = { getContext: () => null } as unknown as OffscreenCanvas;
    core.handle({ t: 'init', protocol: MAP_PROTOCOL_VERSION, canvas, width: 1, height: 1, dpr: 1, assets: { kind: 'base', url: '/' } });
    expect(out).toEqual([{ t: 'error', stage: 'init', message: 'WebGL2 is not available' }]);
  });
});

describe('map worker loading progress (stage 24)', () => {
  /** A core whose clock and timers the test drives; fetch streams `file` in `chunk`-byte pieces. */
  function progressHarness(file: Uint8Array, opts: { chunk: number; length?: string | null; tiles?: string[] }) {
    const out: WorkerToMain[] = [];
    const frames: (() => void)[] = [];
    const timers: (() => void)[] = [];
    let t = 0;
    const renderer: Renderer & { complete: boolean } = {
      setMap: () => {},
      setScene: () => {},
      resize: () => {},
      render: () => {},
      dispose: () => {},
      complete: true,
    };
    const fetchFn = (async (u: string) => {
      if (String(u).endsWith('.mm2')) {
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            for (let i = 0; i < file.length; i += opts.chunk) c.enqueue(file.slice(i, i + opts.chunk));
            c.close();
          },
        });
        const headers: Record<string, string> = {};
        const len = opts.length === undefined ? String(file.length) : opts.length;
        if (len !== null) headers['content-length'] = len;
        return new Response(body, { headers });
      }
      return new Response('png');
    }) as typeof fetch;
    const core = new MapWorkerCore({
      post: (m) => void out.push(m),
      requestFrame: (cb) => void frames.push(cb),
      fetch: fetchFn,
      now: () => t,
      setTimer: (cb) => void timers.push(cb),
      createRenderer: (_gl, assets) => {
        for (const f of opts.tiles ?? []) void assets(f);
        return renderer;
      },
    });
    const canvas = { width: 0, height: 0, getContext: () => ({}) as WebGL2RenderingContext } as unknown as OffscreenCanvas;
    core.handle({ t: 'init', protocol: MAP_PROTOCOL_VERSION, canvas, width: 20, height: 10, dpr: 1, assets: { kind: 'base', url: '/map/' } });
    return {
      core,
      out,
      renderer,
      tick: (ms: number) => void (t += ms),
      runTimers: () => {
        for (const cb of timers.splice(0)) cb();
      },
      runFrames: () => {
        for (const cb of frames.splice(0)) cb();
      },
      progress: () => out.filter((m): m is Extract<WorkerToMain, { t: 'progress' }> => m.t === 'progress'),
    };
  }

  it('reports the phases in order and the bytes against Content-Length, all before `loaded`', async () => {
    const file = await tinyFile();
    const h = progressHarness(file, { chunk: 8 });
    await h.core.load(1, { kind: 'url', url: '/map/a.mm2' });
    const p = h.progress();
    const phases = p.map((m) => m.map?.phase).filter((x, i, a) => x !== a[i - 1]);
    expect(phases).toEqual(['fetch', 'unpack', 'parse', 'build']);
    expect(p.every((m) => m.map?.req === 1)).toBe(true);
    expect(p[0]!.map).toEqual({ req: 1, phase: 'fetch', bytes: 0, total: 0 });
    // The clock stands still: the byte reports wait for a timer; the next phase supersedes them.
    h.runTimers();
    expect(h.progress()).toHaveLength(p.length);
    expect(h.out.at(-1)).toMatchObject({ t: 'loaded', req: 1 });
    const iLoaded = h.out.findIndex((m) => m.t === 'loaded');
    expect(h.out.slice(iLoaded).some((m) => m.t === 'progress')).toBe(false);
  });

  it('streams byte counts at most every PROGRESS_MS; unknown or wrong lengths report 0', async () => {
    const file = await tinyFile();
    const seen: { bytes: number; total: number }[] = [];
    for (const length of [undefined, null, '3']) {
      const h = progressHarness(file, { chunk: 4, length });
      // Advance the clock on every read so every report goes out at once.
      const orig = h.core.load.bind(h.core);
      const post = h.out.push.bind(h.out);
      h.out.push = (...ms: WorkerToMain[]) => {
        h.tick(PROGRESS_MS);
        return post(...ms);
      };
      await orig(1, { kind: 'url', url: '/map/a.mm2' });
      const fetches = h.progress().filter((m) => m.map?.phase === 'fetch');
      seen.push(fetches.at(-1)!.map!);
      expect(fetches.length).toBeGreaterThan(2);
    }
    expect(seen[0]).toMatchObject({ bytes: file.length, total: file.length });
    expect(seen[1]).toMatchObject({ bytes: file.length, total: 0 }); // no Content-Length
    expect(seen[2]).toMatchObject({ bytes: file.length, total: 0 }); // more than announced
  });

  it('skips the fetch for bytes, and counts tile files; a tileset change ends with `tilesDrawn`', async () => {
    const file = await tinyFile();
    const h = progressHarness(file, { chunk: 64, tiles: ['pixmaps/a.png', 'pixmaps/b.png'] });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    h.runTimers();
    expect(h.progress().at(-1)!.tiles).toEqual({ done: 2, total: 2 });
    await h.core.load(1, { kind: 'bytes', bytes: file.slice().buffer, name: 'x.mm2' });
    expect(h.progress().some((m) => m.map?.phase === 'fetch')).toBe(false);
    expect(h.progress().some((m) => m.map?.phase === 'unpack')).toBe(true);
    // A tileset change: the renderer is incomplete until the new tiles are in.
    h.renderer.complete = false;
    h.core.handle({ t: 'assets', assets: { kind: 'base', url: '/map/' } });
    h.runFrames();
    h.core.requestRender();
    h.runFrames();
    expect(h.out.some((m) => m.t === 'tilesDrawn')).toBe(false);
    h.renderer.complete = true;
    h.core.requestRender();
    h.runFrames();
    expect(h.out.filter((m) => m.t === 'tilesDrawn')).toHaveLength(1);
    h.core.requestRender();
    h.runFrames();
    expect(h.out.filter((m) => m.t === 'tilesDrawn')).toHaveLength(1);
  });
});

describe('map pane layout migration', () => {
  it('keeps a stored auto entry and a moved map rectangle', () => {
    const base = { docks: { right: { size: 33, panes: [] } } };
    expect(migrateLayout({ ...base, floating: [{ id: 'map', x: 1, y: 2, w: 40, h: 12, auto: true }] }).floating[0]).toMatchObject({
      id: 'map',
      auto: true,
    });
    expect(migrateLayout({ ...base, floating: [{ id: 'map', x: 1, y: 2, w: 40, h: 12 }] }).floating[0]).toEqual({
      id: 'map',
      x: 1,
      y: 2,
      w: 40,
      h: 12,
    });
    // Docked by the user: stays docked.
    const docked = migrateLayout({ docks: { left: { size: 40, panes: [{ id: 'map', desired: 20 }] } } });
    expect(docked.docks.left.lanes).toEqual([{ size: 40, panes: [{ id: 'map', desired: 20 }] }]);
    expect(docked.floating).toEqual([]);
  });
});
