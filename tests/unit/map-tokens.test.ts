// Stage 80 part B (ADR 0171): map tokens. The layout of a room's tokens
// (the mockup's sizes, the fan), the token form of buildScene, the GPU
// side through a wrapped WebGL2 (the cost rule: one draw call more at
// most, nothing rebuilt on an unchanged frame; the picture layers and
// their LRU), the worker's pictures and its `tokens` message, and the main
// thread's TokenFeed state from GameState.
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GameState } from '../../src/gmcp/state';
import { vitalTone } from '../../src/gmcp/vital-tone';
import { resetLibrary, libraryOf } from '../../src/looks/library';
import { ringRgb } from '../../src/looks/ring';
import { LooksStore } from '../../src/looks/store';
import { tokenState, hexColor } from '../../src/map/tokens-feed';
import type { MapData } from '../../src/map/model';
import { MAP_PROTOCOL_VERSION, type TokenFace, type TokenLook, type WorkerToMain, tokenKey } from '../../src/map/protocol';
import { buildScene, drawsTokens } from '../../src/map/render/characters';
import type { Renderer } from '../../src/map/render/renderer';
import { FAN_SHOWN, TOKEN_MIN_PX, type TokenQuad, arcWidth, fitD, layoutRoom, tokenReach } from '../../src/map/render/token-layout';
import { TOKEN_LAYERS, TOKEN_STRIDE, type TokenImageSource, TokenTextures } from '../../src/map/render/tokens';
import { WebGLMapRenderer } from '../../src/map/render/webgl';
import { EMPTY_SCENE, type Scene, type SceneTokens } from '../../src/map/scene';
import { defaultView, pxPerRoom, type View } from '../../src/map/view';
import { MapWorkerCore } from '../../src/map/worker/core';
import { KEEP, TokenImages } from '../../src/map/worker/token-images';
import { defaultSettings } from '../../src/settings/types';
import { hpToneColors } from '../../src/panes/group-model';
import { HAS_ARDA, loadArda } from './map-helpers';

const drawn = (portrait: string): TokenLook => ({ k: 'drawn', portrait, sex: 'male' });
const face = (hp: number | null, look: TokenLook = drawn('human')): TokenFace => ({ look, hp });
const COLORS = { ok: 0x3fd062, low: 0xff8c2a, critical: 0xff4d4d };

describe('vital tone (shared with the Group bars)', () => {
  it('is orange at 45 % and below, red at 25 % and below, the base when unknown', () => {
    expect([1, 0.46, 0.45, 0.26, 0.25, 0, null].map(vitalTone)).toEqual(['ok', 'ok', 'low', 'low', 'critical', 'critical', 'ok']);
  });
});

describe('token layout (the mockup, ring R3)', () => {
  it('fits the picture, ring, outline and arc room into the box', () => {
    for (const box of [16, 35.2, 70]) {
      for (const arc of [true, false]) {
        const d = fitD(box, arc);
        expect(2 * tokenReach(d, arc)).toBeCloseTo(box, 1);
      }
    }
    // 44 px a room alone: a picture of about 28 px with the arc room, 32 without.
    expect(fitD(44 * 0.8, true)).toBeCloseTo(28.2, 1);
    expect(fitD(44 * 0.8, false)).toBeCloseTo(32.2, 1);
    expect(arcWidth(10)).toBe(1);
    expect(arcWidth(100)).toBeCloseTo(3.5);
  });

  const t = (n: number) => ({ face: face(1), ring: n, hp: -1, arc: 0 });

  it('puts one token in the middle of its room', () => {
    const out: TokenQuad[] = [];
    layoutRoom(out, [t(1)], 10, 20, 0, 44, true);
    expect(out).toHaveLength(1);
    expect([out[0]!.x, out[0]!.y]).toEqual([10.5, 20.5]);
    expect(out[0]!.r * 2).toBeCloseTo(fitD(35.2, true));
  });

  it('fans five: the first whole and last (on top), three small along the lower edge, then +1 under them', () => {
    const out: TokenQuad[] = [];
    layoutRoom(out, [t(1), t(2), t(3), t(4), t(5)], 0, 0, 0, 44, true);
    expect(out.map((q) => (q.plus ? `+${q.plus}` : q.ring))).toEqual(['+1', 4, 3, 2, 1]);
    const [plus, s3, s2, s1, big] = out as [TokenQuad, TokenQuad, TokenQuad, TokenQuad, TokenQuad];
    expect(big.y).toBeCloseTo(1 - 0.37);
    expect(big.r * 2).toBeCloseTo(fitD(44 * 0.7, true));
    for (const q of [plus, s1, s2, s3]) {
      expect(q.y).toBeCloseTo(1 - 0.78);
      expect(q.r * 2).toBeCloseTo(fitD(44 * 0.38, true));
    }
    // Left to right in group order, centred on the room, the +1 last.
    expect(s1.x).toBeLessThan(s2.x);
    expect(s2.x).toBeLessThan(s3.x);
    expect(s3.x).toBeLessThan(plus.x);
    expect((s1.x + plus.x) / 2).toBeCloseTo(0.5);
    expect(FAN_SHOWN).toBe(3);
  });

  it('shows two or three without a +n disc', () => {
    for (const n of [2, 3, 4]) {
      const out: TokenQuad[] = [];
      layoutRoom(out, Array.from({ length: n }, (_, i) => t(i)), 0, 0, 0, 44, false);
      expect(out.filter((q) => q.plus > 0)).toHaveLength(0);
      expect(out).toHaveLength(n);
    }
  });
});

/** A small map: rooms in a row on layer 0, one on layer 1, one far away. */
function rowMap(): MapData {
  const xs = [0, 1, 2, 0, 50];
  const ys = [0, 0, 0, 1, 40];
  const zs = [0, 0, 0, 1, 0];
  const n = xs.length;
  return { roomCount: n, x: Int32Array.from(xs), y: Int32Array.from(ys), z: Int32Array.from(zs) } as unknown as MapData;
}

const members = [
  { id: 2, room: 0, text: 'Thorin', color: 0x00c0ff, npc: false },
  { id: 3, room: 0, text: 'Eowyn', color: 0xff40a0, npc: false },
  { id: 4, room: 0, text: 'Glorfindel', color: 0x40ff40, npc: false },
  { id: 5, room: 0, text: 'a trained horse', color: 0xffa040, npc: true },
  { id: 6, room: 2, text: 'Bilbo', color: 0xa040ff, npc: false },
  { id: 7, room: 3, text: 'Strider', color: 0x40ffff, npc: false },
  { id: 8, room: 4, text: 'Faraway', color: 0xff4040, npc: false },
];
const tokens = (hp = true): SceneTokens => ({
  hp,
  self: face(0.5),
  members: new Map<number, TokenFace>([
    [2, face(1)],
    [3, face(0.3)],
    [4, face(0.2)],
    [6, face(0.1)],
    [7, face(null)],
    [8, face(1)],
  ]),
  colors: COLORS,
});
const scene = (over: Partial<Scene> = {}): Scene => ({ ...EMPTY_SCENE, room: 0, located: true, path: [1, 2], members, tokens: tokens(), ...over });
const view = (zoom = 1): View => ({ ...defaultView(), x: 0.5, y: 0.5, zoom });
const ctx = (zoom = 1) => ({ map: rowMap(), view: view(zoom), w: 640, h: 400, dpr: 1, font: null });

describe('buildScene with tokens', () => {
  it('draws tokens from 20 px a room outside the far style', () => {
    expect(TOKEN_MIN_PX).toBe(20);
    expect(drawsTokens(scene(), view(1))).toBe(true);
    expect(drawsTokens(scene(), view(19.9 / 44))).toBe(false);
    expect(drawsTokens(scene(), view(20 / 44))).toBe(true);
    expect(drawsTokens(scene({ tokens: undefined }), view(1))).toBe(false);
  });

  it('makes the fan in your room, tokens elsewhere, no boxes; the arrows, path and labels as with boxes', () => {
    const g = buildScene(scene(), ctx());
    const boxes = buildScene(scene({ tokens: undefined }), ctx());
    expect(g.roomSel).toHaveLength(0);
    // You and 2, 3, 4 shown, 5 behind +1; 6, 7 (another layer) and 8 (off screen) alone.
    expect(g.tokens.map((q) => (q.plus ? '+' + q.plus : q.ring))).toEqual(
      ['+1', ...[4, 3, 2].map((id) => members.find((m) => m.id === id)!.color), 0xffff00, ...[6, 7, 8].map((id) => members.find((m) => m.id === id)!.color)].map((c) =>
        typeof c === 'string' ? c : (([r, gg, b]) => (r << 16) | (gg << 8) | b)(ringRgb(c)),
      ),
    );
    // The arcs: you (50 %), 3 (30 %, orange), 4 (20 %, red), 6 (10 %); not 2 (full) nor 7 (unknown).
    const arcs = g.tokens.filter((q) => q.hp >= 0).map((q) => q.arc);
    expect(arcs).toEqual([COLORS.critical, COLORS.low, COLORS.ok, COLORS.critical]);
    // The off-screen arrow, the layer arrow, the path and the names are the boxes' own.
    expect(g.arrows.data).toEqual(boxes.arrows.data);
    expect(g.pathQuads.data).toEqual(boxes.pathQuads.data);
    expect(g.points.data).toEqual(boxes.points.data);
    expect(g.names.data).toEqual(boxes.names.data);
    // The layer arrow (tris) for Strider; no far boxes.
    expect(g.tris.data).toEqual(boxes.tris.data);
  });

  it('draws no arcs with the HP arc off, and a member without a face as a disc', () => {
    const g = buildScene(scene({ tokens: tokens(false) }), ctx());
    expect(g.tokens.filter((q) => q.hp >= 0)).toHaveLength(0);
    const g2 = buildScene(scene({ members: [{ id: 99, room: 2, text: 'X', color: 0x123456, npc: false }] }), ctx());
    expect(g2.tokens.map((q) => q.face)).toEqual([tokens().self, null]);
  });

  it('keeps the far marker for an unlocated player; the members of the room are its fan', () => {
    const g = buildScene(scene({ located: false }), ctx());
    expect(g.tris.count).toBeGreaterThan(0); // your far outline
    // No token of yours (the only one at 50 %).
    expect(g.tokens.filter((q) => q.hp === 0.5)).toHaveLength(0);
    // 2 whole, 3, 4 and 5 small: no +n.
    const room0 = g.tokens.filter((q) => Math.floor(q.x) === 0 && Math.floor(q.y) === 0);
    expect(room0).toHaveLength(4);
    expect(room0.filter((q) => q.plus)).toHaveLength(0);
  });

  it('draws a room without you with its first member whole', () => {
    const g = buildScene(scene({ room: 4 }), ctx());
    const inRoom0 = g.tokens.filter((q) => Math.floor(q.x) === 0 && Math.floor(q.y) === 0);
    expect(inRoom0.at(-1)!.r).toBeGreaterThan(inRoom0[0]!.r);
    expect(inRoom0.at(-1)!.face).toEqual(tokens().members.get(2));
  });
});

// ------------------------------------------------------------- the GPU side

/** A WebGL2 stand-in: every call succeeds; draw calls, buffer uploads and texture uploads are counted. */
function wrappedGl() {
  const n = { draws: 0, instanced: 0, bufferData: 0, texSub: 0, mipmaps: 0, storage: 0 };
  const gl = new Proxy({} as Record<string, unknown>, {
    get(_t, k: string) {
      if (/^[A-Z][A-Z0-9_]*$/.test(k)) return 1;
      switch (k) {
        case 'isContextLost':
          return () => false;
        case 'getShaderParameter':
        case 'getProgramParameter':
          return () => true;
        case 'drawArrays':
          return () => void n.draws++;
        case 'drawArraysInstanced':
          return () => {
            n.draws++;
            n.instanced++;
          };
        case 'bufferData':
          return () => void n.bufferData++;
        case 'texSubImage3D':
          return () => void n.texSub++;
        case 'generateMipmap':
          return () => void n.mipmaps++;
        case 'texStorage3D':
          return () => void n.storage++;
        default:
          return k.startsWith('create') || k === 'getUniformLocation' ? () => ({}) : () => {};
      }
    },
  }) as unknown as WebGL2RenderingContext;
  return { gl, n };
}

const PUBLIC_MAP = new URL('../../public/map/', import.meta.url);
const img = (w = 128, h = 128) => ({ width: w, height: h, close: () => {} }) as unknown as ImageBitmap;

/** A source that has every picture at once. */
const allThere = (): TokenImageSource & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    image: (l) => {
      asked.push(tokenKey(l));
      return img();
    },
    plus: () => img(),
  };
};

describe.skipIf(!HAS_ARDA)('the token draw on a wrapped WebGL2 (cost rule)', () => {
  let map: MapData;
  beforeAll(async () => {
    map = await loadArda();
  });
  afterEach(() => vi.unstubAllGlobals());

  async function renderer() {
    vi.stubGlobal('createImageBitmap', async () => img());
    const { gl, n } = wrappedGl();
    const assets = async (path: string): Promise<Blob> => {
      const u = new URL(path, PUBLIC_MAP);
      return existsSync(u) ? new Blob([readFileSync(u)]) : new Blob(['x']);
    };
    const r = new WebGLMapRenderer(gl, assets);
    r.resize(1280, 800, 1);
    r.setMap(map);
    await vi.waitFor(() => expect(r.complete).toBe(true));
    return { r, n };
  }

  const RENT = 7636;
  const at = (room: number, zoom: number): View => ({ ...defaultView(), x: map.x[room]! + 0.5, y: map.y[room]! + 0.5, layer: map.z[room]!, zoom });
  const group = (room: number) =>
    [2, 3, 4, 5, 6, 7, 8, 9].map((id, i) => ({ id, room: i < 4 ? room : room + i, text: `M${id}`, color: 0x00c0ff + id, npc: false }));
  const sceneAt = (room: number, withTokens: boolean): Scene => ({
    ...EMPTY_SCENE,
    room,
    located: true,
    members: group(room),
    ...(withTokens ? { tokens: { ...tokens(), members: new Map(group(room).map((m) => [m.id, face(0.4)])) } } : {}),
  });

  it('draws at most one call more with tokens, in one instanced draw, and nothing again on an unchanged frame', async () => {
    const { r, n } = await renderer();
    const src = allThere();
    r.setTokenSource(src);
    const v = at(RENT, 1);
    r.setScene(sceneAt(RENT, false));
    r.render(v);
    const off = r.drawCalls;
    r.setScene(sceneAt(RENT, true));
    r.render(v);
    const on = r.drawCalls;
    console.info(`map draw calls at the rent room, zoom 1, you and eight members: boxes ${off}, tokens ${on}`);
    expect(on).toBeLessThanOrEqual(off + 1);
    expect(r.tokenCounts).toMatchObject({ tokens: 8, plus: 1, arcs: 8 });
    // An unchanged frame: no buffer, no texture upload, the same draws.
    const before = { ...n };
    r.render(v);
    expect(n.bufferData).toBe(before.bufferData);
    expect(n.texSub).toBe(before.texSub);
    expect(n.mipmaps).toBe(before.mipmaps);
    expect(r.drawCalls).toBe(on);
    // The pictures: one texture array, made once; each face asked once.
    expect(n.storage).toBeGreaterThan(0);
    expect(new Set(src.asked)).toEqual(new Set(['drawn:human:male']));
    // Below 20 px a room and in the far style: today's draws exactly.
    for (const zoom of [19 / 44, 0.3]) {
      r.setScene(sceneAt(RENT, false));
      r.render(at(RENT, zoom));
      const a = r.drawCalls;
      r.setScene(sceneAt(RENT, true));
      r.render(at(RENT, zoom));
      expect(r.drawCalls).toBe(a);
      expect(r.tokenCounts.tokens).toBe(0);
    }
    r.dispose();
  });

  it('builds the scene again when the view moves or a picture arrives', async () => {
    const { r, n } = await renderer();
    r.setTokenSource(allThere());
    r.setScene(sceneAt(RENT, true));
    r.render(at(RENT, 1));
    const b0 = n.bufferData;
    r.render({ ...at(RENT, 1), x: map.x[RENT]! + 0.6 });
    expect(n.bufferData).toBeGreaterThan(b0);
    const b1 = n.bufferData;
    r.tokensChanged();
    r.render({ ...at(RENT, 1), x: map.x[RENT]! + 0.6 });
    expect(n.bufferData).toBeGreaterThan(b1);
    r.dispose();
  });
});

describe('token picture layers (LRU)', () => {
  const quads = (keys: string[]): TokenQuad[] =>
    keys.map((k, i) => ({ x: i, y: 0, z: 0, r: 10, face: face(1, { k: 'lib', id: k }), ring: 0, hp: -1, arc: 0, aw: 1, plus: 0 }));

  it('gives each picture a layer, keeps it, and gives the least recently used one over when full', () => {
    const { gl, n } = wrappedGl();
    const t = new TokenTextures(gl);
    const src = allThere();
    const first = Array.from({ length: TOKEN_LAYERS }, (_, i) => `p${i}`);
    const data = t.pack(quads(first), src);
    expect(data.length).toBe(TOKEN_LAYERS * TOKEN_STRIDE);
    expect(n.texSub).toBe(TOKEN_LAYERS);
    expect(n.mipmaps).toBe(1);
    // p1 … p63 used again; then a new one takes p0's layer.
    t.pack(quads(first.slice(1)), src);
    expect(n.texSub).toBe(TOKEN_LAYERS);
    t.pack(quads(['new']), src);
    expect(t.layerOf('lib:new')).toBe(0);
    expect(t.layerOf('lib:p0')).toBeUndefined();
    expect(t.layerOf('lib:p1')).toBe(1);
  });

  it('packs a picture not there yet as no layer, and a failed one as its fallback', () => {
    const { gl } = wrappedGl();
    const t = new TokenTextures(gl);
    const failing: TokenImageSource = { image: (l) => (l.k === 'lib' ? false : img()), plus: () => null };
    const q: TokenQuad = { x: 0, y: 0, z: 0, r: 10, face: { look: { k: 'lib', id: 'gone' }, alt: drawn('elf'), hp: 1 }, ring: 0, hp: -1, arc: 0, aw: 1, plus: 0 };
    const d = t.pack([q], failing);
    expect(d[4]).toBe(0); // the drawing's layer
    expect(d[5]).toBe(0); // drawn: the drawing's disc
    const pending: TokenImageSource = { image: () => null, plus: () => null };
    const t2 = new TokenTextures(gl);
    expect(t2.pack([q], pending)[4]).toBe(-1);
  });
});

describe('the worker side', () => {
  it('fetches library pictures itself, asks the main thread for drawings, remembers failures, keeps KEEP', async () => {
    const asked: string[] = [];
    const fetched: string[] = [];
    let changes = 0;
    const im = new TokenImages({
      fetch: (async (u: string) => {
        fetched.push(String(u));
        return String(u).includes('gone') ? new Response('', { status: 404 }) : new Response(new Blob(['webp']));
      }) as typeof fetch,
      ask: (k) => void asked.push(k),
      onChange: () => void changes++,
      decode: async () => img(),
    });
    im.lib = '/base/tokens/t/';
    expect(im.image({ k: 'lib', id: 'elf-m' })).toBeNull();
    expect(im.image({ k: 'lib', id: 'gone' })).toBeNull();
    expect(im.image(drawn('dwarf'))).toBeNull();
    expect(im.image({ k: 'none' })).toBe(false);
    await vi.waitFor(() => expect(changes).toBe(2));
    expect(fetched).toEqual(['/base/tokens/t/elf-m.webp', '/base/tokens/t/gone.webp']);
    expect(asked).toEqual(['drawn:dwarf:male']);
    expect(im.image({ k: 'lib', id: 'elf-m' })).toMatchObject({ width: 128 });
    expect(im.image({ k: 'lib', id: 'gone' })).toBe(false);
    // The drawing arrives (a transferred bitmap).
    im.receive('drawn:dwarf:male', { bitmap: img() });
    expect(changes).toBe(3);
    expect(im.image(drawn('dwarf'))).toMatchObject({ width: 128 });
    // Asked again it is not asked again.
    expect(asked).toHaveLength(1);
    for (let i = 0; i < KEEP + 5; i++) im.image(drawn(`x${i}`));
    expect(im.keys().length).toBe(KEEP);
  });

  function core() {
    const out: WorkerToMain[] = [];
    const frames: (() => void)[] = [];
    const scenes: Scene[] = [];
    const renderer: Renderer = {
      setMap: () => {},
      setScene: (s) => void scenes.push(s),
      resize: () => {},
      render: () => {},
      dispose: () => {},
      tokenCounts: { tokens: 3, plus: 0, arcs: 1, hp: 500 },
    };
    const canvas = { width: 0, height: 0, getContext: () => ({}) as WebGL2RenderingContext } as unknown as OffscreenCanvas;
    const c = new MapWorkerCore({
      post: (m) => void out.push(m),
      requestFrame: (cb) => void frames.push(cb),
      fetch: (async () => new Response('nope', { status: 404 })) as typeof fetch,
      now: () => 0,
      createRenderer: () => renderer,
    });
    c.handle({ t: 'init', protocol: MAP_PROTOCOL_VERSION, canvas, width: 200, height: 100, dpr: 1, assets: { kind: 'base', url: '/map/' } });
    return { c, out, scenes, run: () => frames.splice(0).forEach((f) => f()) };
  }
  const debug: Scene = { ...EMPTY_SCENE, room: 0, located: true, members: [{ id: 2, room: 0, text: 'A', color: 0x111111, npc: false }, { id: 3, room: 0, text: 'B', color: 0x222222, npc: false }] };
  const msg = (on: boolean) => ({
    t: 'tokens' as const,
    on,
    hp: true,
    self: face(1),
    members: [{ id: 2, color: 0xabcdef, ...face(0.5) }],
    colors: COLORS,
    lib: '/t/',
  });

  it('gives a scene the main thread hues by id and, with tokens on, the faces', () => {
    const { c, scenes, out, run } = core();
    c.handle({ t: 'debugScene', scene: debug });
    expect(scenes.at(-1)).toBe(debug);
    c.handle(msg(true));
    let s = scenes.at(-1)!;
    expect(s.members.map((m) => m.color)).toEqual([0xabcdef, 0x222222]);
    expect(s.tokens?.members.get(2)).toEqual(face(0.5));
    expect(s.tokens?.hp).toBe(true);
    expect(c.tokenImages.lib).toBe('/t/');
    run();
    expect(out.filter((m) => m.t === 'tokensDrawn')).toEqual([{ t: 'tokensDrawn', tokens: 3, plus: 0, arcs: 1, hp: 500 }]);
    // Off: the boxes (no tokens), the hues still the main thread's.
    c.handle(msg(false));
    s = scenes.at(-1)!;
    expect(s.tokens).toBeUndefined();
    expect(s.members[0]!.color).toBe(0xabcdef);
    // An answer to tokenArt goes to the pictures.
    c.handle({ t: 'tokenImage', key: 'drawn:human:male', failed: true });
  });

  it('leaves out the NPCs the map setting hides, tokens or boxes (stage 80 part G)', () => {
    const { c, scenes } = core();
    const npcs: Scene = {
      ...EMPTY_SCENE,
      room: 0,
      located: true,
      members: [
        { id: 2, room: 0, text: 'Thorin', color: 1, npc: false },
        { id: 3, room: 0, text: 'HORSE', color: 2, npc: true, labeled: true },
        { id: 4, room: 0, text: 'pony', color: 3, npc: true, labeled: false },
      ],
    };
    c.handle({ t: 'debugScene', scene: npcs });
    // Before the first `npcs`: all, the scene as it came.
    expect(scenes.at(-1)).toBe(npcs);
    const ids = () => scenes.at(-1)!.members.map((m) => m.id);
    c.handle({ t: 'npcs', mode: 'labeled' });
    expect(ids()).toEqual([2, 3]);
    expect(scenes.at(-1)!.tokens).toBeUndefined();
    c.handle({ t: 'npcs', mode: 'off' });
    expect(ids()).toEqual([2]);
    // With tokens the faces come on top of the same filter.
    c.handle(msg(true));
    expect(ids()).toEqual([2]);
    expect(scenes.at(-1)!.tokens).toBeDefined();
    c.handle({ t: 'npcs', mode: 'all' });
    expect(ids()).toEqual([2, 3, 4]);
    const n = scenes.length;
    c.handle({ t: 'npcs', mode: 'all' });
    expect(scenes.length).toBe(n);
  });

  it('asks the main thread for a drawing with tokenArt', () => {
    const { c, out } = core();
    expect(c.tokenImages.image(drawn('hobbit'))).toBeNull();
    expect(out.at(-1)).toEqual({ t: 'tokenArt', key: 'drawn:hobbit:male', look: drawn('hobbit') });
  });
});

describe('the main thread: the tokens state from GameState', () => {
  afterEach(() => resetLibrary());

  it('takes your look and HP, each member by id with its hue, look and HP, and Group’s colours', () => {
    const game = new GameState();
    game.onGmcp('Char.Name', { name: 'Rasta' });
    game.onGmcp('Char.StatusVars', { name: 'Rasta', race: 'Elf', subrace: 'Noldo' });
    game.onGmcp('Char.Vitals', { hp: 30, maxhp: 120 });
    const v = (hp: number) => ({ hp, maxhp: 100, 'hp-string': '' });
    game.onGmcp('Group.Set', [
      { id: 1, type: 'you', name: 'Rasta', label: 0, ...v(25) },
      { id: 2, type: 'ally', name: 'Thorin', label: 0, ...v(100) },
      { id: 3, type: 'npc', name: 'a trained horse', label: 'HORSE', ...v(40) },
    ]);
    expect(game.groupTable.size).toBe(2);
    const looks = new LooksStore();
    looks.choose('Thorin', { src: 'lib', id: 'dwarf-m-warrior' });
    const s = defaultSettings();
    const st = tokenState({ settings: s, light: false, game, looks, library: null, lib: '/tokens/t/' });
    expect(st.on).toBe(true);
    expect(st.hp).toBe(true);
    expect(st.self).toEqual({ look: { k: 'drawn', portrait: 'noldo', sex: 'male' }, hp: 0.25 });
    expect(st.members.map((m) => m.id)).toEqual([2, 3]);
    expect(st.members[0]).toMatchObject({ look: { k: 'lib', id: 'dwarf-m-warrior' }, alt: { k: 'drawn', portrait: 'neutral' }, hp: 1, color: game.groupTable.colorOf(2) });
    // An NPC without the manifest: no match yet, the disc.
    expect(st.members[1]).toMatchObject({ look: { k: 'none' }, hp: 0.4 });
    const lib = libraryOf({ tokens: [{ id: 'mount-trained-horse', label: 'x', group: 'mount', race: null, sex: null, tags: [], match: ['trained', 'horse'] }] as never });
    const st2 = tokenState({ settings: s, light: false, game, looks, library: lib, lib: '' });
    expect(st2.members[1]!.look).toEqual({ k: 'lib', id: 'mount-trained-horse' });
    const sides = hpToneColors(s, false);
    expect(st.colors).toEqual({ ok: hexColor(sides.ok, -1), low: hexColor(sides.low, -1), critical: hexColor(sides.critical, -1) });
    expect(st.colors.low).toBe(0xff8c2a);
    // The switches.
    const off = tokenState({ settings: { ...s, mapper: { ...s.mapper, tokens: false, tokenHp: false } }, light: false, game, looks, library: null, lib: '' });
    expect([off.on, off.hp]).toEqual([false, false]);
    // The table forgets the group at a new connection.
    game.resetCharacter();
    expect(game.groupTable.size).toBe(0);
  });

  it('reads colours', () => {
    expect(hexColor('#3fd062', 0)).toBe(0x3fd062);
    expect(hexColor('#abc', 0)).toBe(0xaabbcc);
    expect(hexColor('red', 7)).toBe(7);
  });

  it('gives the map the same hues as the worker table for the same messages', async () => {
    const { GroupTable } = await import('../../src/map/group');
    const game = new GameState();
    const worker = new GroupTable();
    const msgs: [string, unknown][] = [
      ['Group.Set', [{ id: 1, type: 'you', name: 'Me' }, { id: 2, type: 'ally', name: 'A' }]],
      ['Group.Add', { id: 3, type: 'ally', name: 'B' }],
      ['Group.Remove', 2],
      ['Group.Add', { id: 4, type: 'npc', name: 'a horse', label: 'H' }],
    ];
    for (const [p, d] of msgs) {
      game.onGmcp(p, d);
      worker.apply(p, d);
    }
    for (const e of worker.entries()) expect(game.groupTable.colorOf(e.id)).toBe(worker.colorOf(e.id));
    expect(pxPerRoom(1, 0)).toBe(44);
  });
});
