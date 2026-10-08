// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 The WebCockpit Authors
// Derived from MMapper 26.06.0 (https://github.com/MUME/MMapper),
// Copyright (C) 2019-2026 The MMapper Authors. Modified for WebCockpit
// (2026-09-28): rewritten in TypeScript and WebGL2; see
// THIRD_PARTY_NOTICES.md "MMapper-derived code".
//
// The WebGL2 map renderer (ADR 0020, research §2–§9): MMapper's 2D view.
//
// - setMap builds every static mesh once (rooms per layer as instanced
//   quads, connections, door names, infomarks) and uploads it.
// - render(view) only sets uniforms and issues ~15 draw calls per layer;
//   the scene (player, path, group) is a few dozen vertices rebuilt when
//   the scene or the view changes.
// - Tiles come through the AssetResolver (createImageBitmap, flipped as
//   MMapper mirrors its QImages) into texture arrays with mipmaps and
//   trilinear filtering (display/Textures.cpp).
//
// The draw order follows MMapper 26.06.0 MapCanvas::actuallyPaintGL,
// renderMapBatches and LayerMeshes::render (GPL-2.0-or-later).

import type { AssetResolver } from '../assets';
import type { MapData } from '../model';
import { EMPTY_SCENE, type Scene } from '../scene';
import type { View } from '../view';
import { buildScene, type SceneGeometry } from './characters';
import { buildConnections, type ConnectionLayer, type MapText } from './connections';
import { type FontMetrics, FontVerts, FONT_STRIDE, fontFntPath, fontPagePath, fontSizeForDpr, layoutText, parseFnt } from './font';
import { COLOR_STRIDE } from './geometry';
import { buildInfomarks, type InfomarkLayer } from './infomarks';
import { BACKGROUND, BLACK, GRAY70, LIGHT_BG_INK, NAMED_COLORS, type RGBA, WATER, WHITE, isLightBackground, withAlpha } from './palette';
import { buildRoomMeshes, type Category, CATEGORY_TEX, roomsByLayer, type RoomLayerMesh } from './rooms';
import * as S from './shaders';
import { ARRAY_FILES, arraySize, CHAR_ARROWS_FILE, dottedWallImages, mipLevels, TEX } from './textures';
import type { Renderer, TileStyle } from './renderer';

/** Zoom cutoffs (configuration.h). */
export const CONNECTION_ZOOM = 0.15;
export const DOOR_NAME_ZOOM = 0.4;
export const INFOMARK_ZOOM = 0.25;

type GL = WebGL2RenderingContext;

interface Program {
  p: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

function compile(gl: GL, vs: string, fs: string, uniforms: string[]): Program {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error(`map shader: ${gl.getShaderInfoLog(s) ?? 'compile failed'}`);
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`map shader: ${gl.getProgramInfoLog(p) ?? 'link failed'}`);
  }
  const u: Program['u'] = {};
  for (const n of uniforms) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}

/** A float vertex buffer with its VAO. */
interface FloatMesh {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  count: number;
}

/** Attribute layouts: [location, size] in order, all floats. */
const COLOR_LAYOUT: [number, number][] = [
  [0, 3],
  [1, 4],
];
const TEXCOLOR_LAYOUT: [number, number][] = [
  [0, 3],
  [1, 4],
  [2, 3],
];
const FONT_LAYOUT: [number, number][] = [
  [0, 3],
  [1, 4],
  [2, 2],
  [3, 2],
];

interface LayerGL {
  z: number;
  rooms: RoomLayerMesh | null;
  roomVao: WebGLVertexArrayObject | null;
  roomVbo: WebGLBuffer | null;
  conn: FloatMesh | null;
  doorNames: MapText[];
  doorNameMesh: FloatMesh | null;
  marks: FloatMesh | null;
  markTexts: MapText[];
  markTextMesh: FloatMesh | null;
}

const DECODE: ImageBitmapOptions = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

async function bitmap(assets: AssetResolver, path: string): Promise<ImageBitmap | null> {
  return (await tile(assets, path))?.bmp ?? null;
}

/** A decoded tile and its file (kept for a rescale). */
interface Tile {
  blob: Blob;
  bmp: ImageBitmap;
}

async function tile(assets: AssetResolver, path: string): Promise<Tile | null> {
  try {
    const blob = await assets(path);
    return { blob, bmp: await createImageBitmap(blob, DECODE) };
  } catch {
    return null; // missing in an HTML-replay subset, or not decodable: the layer stays transparent
  }
}

/**
 * `t` as a `size`² image (ADR 0082: a tileset file of another size than
 * its array). Decoded again with the browser's high-quality resize; where
 * that is not honoured, drawn scaled on a 2D canvas. Null when neither works.
 */
async function rescaled(t: Tile, size: number): Promise<ImageBitmap | ImageData | null> {
  try {
    const b = await createImageBitmap(t.blob, { ...DECODE, resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
    if (b.width === size && b.height === size) return b;
    b.close();
  } catch {
    // fall through to the canvas
  }
  try {
    const c = new OffscreenCanvas(size, size);
    const g = c.getContext('2d');
    if (!g) return null;
    g.imageSmoothingQuality = 'high';
    g.drawImage(t.bmp, 0, 0, size, size);
    return g.getImageData(0, 0, size, size);
  } catch {
    return null;
  }
}

export class WebGLMapRenderer implements Renderer {
  private readonly room: Program;
  private readonly color: Program;
  private readonly texColor: Program;
  private readonly font: Program;
  private readonly full: Program;
  private readonly fullVao: WebGLVertexArrayObject;
  private readonly arrays: (WebGLTexture | null)[] = [null, null, null, null];
  private charArrows: WebGLTexture | null = null;
  private fontTex: WebGLTexture | null = null;
  private fontMetrics: FontMetrics | null = null;
  private fontSize = 0;
  private fontLoading = 0;
  private map: MapData | null = null;
  private layers: LayerGL[] = [];
  private scene: Scene = EMPTY_SCENE;
  private sceneVersion = 0;
  private sceneMeshes: { key: string; roomSel: FloatMesh; tris: FloatMesh; arrows: FloatMesh; points: FloatMesh; path: FloatMesh; names: FloatMesh } | null = null;
  private pw = 1;
  private ph = 1;
  private dpr = 1;
  private disposed = false;
  /** Milliseconds of the last setMap mesh build (tests, reports). */
  buildMs = 0;
  private texturesLoaded = false;
  /** The newest tile load (a tileset change starts another; older ones are dropped). */
  private tileGen = 0;
  /** The tile load whose arrays are in use (a tileset change is pending while it lags `tileGen`). */
  private tileGenLoaded = 0;
  /** The newest font load failed (the map draws without text; nothing more will arrive). */
  private fontFailed = false;
  /** The background (Options → Mapper, ADR 0085): the clear colour and the fade over lower layers. */
  private bg: RGBA = BACKGROUND;
  /** The tiles in use draw their flow marks untinted (ADR 0088). */
  private streamsAsIs = false;
  /** The style of the newest tile source, applied when its tiles are swapped in. */
  private style: TileStyle;
  /** Every tile array of the newest tile source and the current font are loaded (or the font failed). */
  get complete(): boolean {
    return this.texturesLoaded && this.tileGenLoaded === this.tileGen && (this.fontTex !== null || this.fontFailed);
  }

  constructor(
    private readonly gl: GL,
    private assets: AssetResolver,
    private readonly onChange: () => void = () => {},
    style: TileStyle = {},
  ) {
    this.style = style;
    this.room = compile(gl, S.ROOM_VS, S.ROOM_FS, ['uView', 'uNamed', 'uTex', 'uColor', 'uWhite']);
    this.color = compile(gl, S.COLOR_VS, S.COLOR_FS, ['uView', 'uColor', 'uInk']);
    this.texColor = compile(gl, S.TEXCOLOR_VS, S.TEXCOLOR_FS, ['uView', 'uTex']);
    this.font = compile(gl, S.FONT_VS, S.FONT_FS, ['uView', 'uPhys', 'uScreen', 'uTex']);
    this.full = compile(gl, S.FULL_VS, S.FULL_FS, ['uColor']);
    this.fullVao = gl.createVertexArray()!;
    const named = new Float32Array(S.MAX_NAMED_COLORS * 4);
    NAMED_COLORS.forEach((c, i) => named.set(c, i * 4));
    gl.useProgram(this.room.p);
    gl.uniform4fv(this.room.u.uNamed!, named);
    gl.uniform1i(this.room.u.uTex!, 0);
    gl.useProgram(this.texColor.p);
    gl.uniform1i(this.texColor.u.uTex!, 0);
    gl.useProgram(this.font.p);
    gl.uniform1i(this.font.u.uTex!, 0);
    this.arrays[TEX.DOTTED] = this.makeDotted();
    void this.loadTextures();
  }

  // ------------------------------------------------------------ assets

  /** The background (Options → Mapper, ADR 0085), from the next render. */
  setBackground(color: RGBA): void {
    this.bg = color;
  }

  /**
   * New tiles (a tileset change, ADR 0082): the arrays are loaded again and
   * swapped in when complete; the old ones draw until then. `style`
   * (ADR 0088) takes effect with the new tiles.
   */
  setAssets(assets: AssetResolver, style: TileStyle = {}): void {
    this.assets = assets;
    this.style = style;
    void this.loadTextures();
  }

  private async loadTextures(): Promise<void> {
    const gl = this.gl;
    const gen = ++this.tileGen;
    const groups = [
      [TEX.A128, ARRAY_FILES.A128],
      [TEX.A64, ARRAY_FILES.A64],
      [TEX.A256, ARRAY_FILES.A256],
    ] as const;
    const assets = this.assets;
    const style = this.style;
    // Decode every file, size each array by its largest file, and scale the
    // others to it (a tileset's mixed sizes; the default set needs none).
    const loads = groups.map(async ([id, g]) => {
      const tiles = await Promise.all(g.files.map((f) => tile(assets, `pixmaps/${f}`)));
      const size = arraySize(g.size, tiles.map((t) => t?.bmp ?? null));
      const images = await Promise.all(
        tiles.map(async (t) => {
          if (!t) return null;
          if (t.bmp.width === size && t.bmp.height === size) return t.bmp;
          const r = await rescaled(t, size);
          t.bmp.close();
          return r;
        }),
      );
      return { id, size, images };
    });
    const arrowsLoad = bitmap(assets, `pixmaps/${CHAR_ARROWS_FILE}`);
    const loaded = await Promise.all(loads);
    const a = await arrowsLoad;
    if (this.disposed || gen !== this.tileGen) {
      for (const l of loaded) for (const im of l.images) if (im && 'close' in im) im.close();
      a?.close();
      return;
    }
    for (const { id, size, images } of loaded) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, mipLevels(size), gl.RGBA8, size, size, images.length);
      images.forEach((im, layer) => {
        if (!im) return;
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, im);
        if ('close' in im) im.close();
      });
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      this.setSampling(gl.TEXTURE_2D_ARRAY, true);
      const old = this.arrays[id];
      this.arrays[id] = t;
      if (old) gl.deleteTexture(old);
    }
    if (a) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, a);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.setSampling(gl.TEXTURE_2D, true);
      if (this.charArrows) gl.deleteTexture(this.charArrows);
      this.charArrows = t;
      a.close();
    }
    this.streamsAsIs = style.streamsAsIs === true;
    this.texturesLoaded = true;
    this.tileGenLoaded = gen;
    this.onChange();
  }

  /** LINEAR_MIPMAP_LINEAR / LINEAR, mirrored repeat (MMapper with trilinear filtering on). */
  private setSampling(target: number, trilinear: boolean): void {
    const gl = this.gl;
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, trilinear ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, trilinear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  }

  /** The generated dotted walls: manual mips, nearest sampling (they cannot be updated in MMapper). */
  private makeDotted(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 8, gl.RGBA8, 128, 128, 4);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    for (let dir = 0; dir < 4; dir++) {
      dottedWallImages(dir).forEach((img, level) => {
        const s = 128 >> level;
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, level, 0, 0, dir, s, s, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
      });
    }
    this.setSampling(gl.TEXTURE_2D_ARRAY, false);
    return t;
  }

  private async loadFont(size: number): Promise<void> {
    const req = ++this.fontLoading;
    try {
      const fnt = await (await this.assets(fontFntPath(size))).text();
      const fm = parseFnt(fnt);
      const img = await bitmap(this.assets, fontPagePath(size, fm.page));
      if (req !== this.fontLoading || this.disposed) {
        img?.close();
        return;
      }
      if (!img) throw new Error('font page not decodable');
      const gl = this.gl;
      if (this.fontTex) gl.deleteTexture(this.fontTex);
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      img.close();
      this.fontTex = t;
      this.fontMetrics = fm;
      this.fontFailed = false;
      this.rebuildTexts();
      this.sceneMeshes = this.freeScene();
      this.onChange();
    } catch {
      // No font: the map draws without text.
      if (req === this.fontLoading && !this.disposed) {
        this.fontFailed = true;
        this.onChange();
      }
    }
  }

  // ------------------------------------------------------------ meshes

  private floatMesh(data: ArrayLike<number>, stride: number, layout: [number, number][], usage: number = this.gl.STATIC_DRAW, reuse?: FloatMesh): FloatMesh {
    const gl = this.gl;
    const vao = reuse?.vao ?? gl.createVertexArray()!;
    const vbo = reuse?.vbo ?? gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), usage);
    if (!reuse) {
      let off = 0;
      for (const [loc, size] of layout) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4);
        off += size;
      }
    }
    gl.bindVertexArray(null);
    return { vao, vbo, count: data.length / stride };
  }

  private deleteMesh(m: FloatMesh | null): void {
    if (!m) return;
    this.gl.deleteVertexArray(m.vao);
    this.gl.deleteBuffer(m.vbo);
  }

  private freeLayers(): void {
    const gl = this.gl;
    for (const l of this.layers) {
      if (l.roomVao) gl.deleteVertexArray(l.roomVao);
      if (l.roomVbo) gl.deleteBuffer(l.roomVbo);
      for (const m of [l.conn, l.doorNameMesh, l.marks, l.markTextMesh]) this.deleteMesh(m);
    }
    this.layers = [];
  }

  private freeScene(): null {
    const s = this.sceneMeshes;
    if (s) for (const m of [s.roomSel, s.tris, s.arrows, s.points, s.path, s.names]) this.deleteMesh(m);
    return null;
  }

  setMap(map: MapData | null): void {
    this.freeLayers();
    this.sceneMeshes = this.freeScene();
    this.map = map;
    if (!map) return;
    const t0 = performance.now();
    const byLayer = roomsByLayer(map);
    const rooms = buildRoomMeshes(map, byLayer);
    const conns = buildConnections(map, byLayer);
    const marks = buildInfomarks(map);
    this.buildMs = performance.now() - t0;

    const gl = this.gl;
    const zs = new Set<number>([...byLayer.keys(), ...marks.map((m) => m.z)]);
    for (const z of [...zs].sort((a, b) => a - b)) {
      const r = rooms.find((m) => m.z === z) ?? null;
      const c: ConnectionLayer | undefined = conns.find((m) => m.z === z);
      const im: InfomarkLayer | undefined = marks.find((m) => m.z === z);
      const l: LayerGL = {
        z,
        rooms: r,
        roomVao: null,
        roomVbo: null,
        conn: c && c.tris.length ? this.floatMesh(c.tris, COLOR_STRIDE, COLOR_LAYOUT) : null,
        doorNames: c?.doorNames ?? [],
        doorNameMesh: null,
        marks: im && im.tris.length ? this.floatMesh(im.tris, COLOR_STRIDE, COLOR_LAYOUT) : null,
        markTexts: im?.texts ?? [],
        markTextMesh: null,
      };
      if (r && r.inst.length) {
        l.roomVao = gl.createVertexArray()!;
        l.roomVbo = gl.createBuffer()!;
        gl.bindVertexArray(l.roomVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, l.roomVbo);
        gl.bufferData(gl.ARRAY_BUFFER, r.inst, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribDivisor(0, 1);
        gl.bindVertexArray(null);
      }
      this.layers.push(l);
    }
    this.rebuildTexts();
  }

  /** Door names and infomark texts depend on the font (and so on the DPR). */
  private rebuildTexts(): void {
    const fm = this.fontMetrics;
    for (const l of this.layers) {
      this.deleteMesh(l.doorNameMesh);
      this.deleteMesh(l.markTextMesh);
      l.doorNameMesh = l.markTextMesh = null;
      if (!fm) continue;
      const mk = (texts: MapText[]) => {
        if (!texts.length) return null;
        const v = new FontVerts();
        for (const t of texts) layoutText(fm, t, v);
        return this.floatMesh(v.data, FONT_STRIDE, FONT_LAYOUT);
      };
      l.doorNameMesh = mk(l.doorNames);
      l.markTextMesh = mk(l.markTexts);
    }
  }

  resize(width: number, height: number, dpr: number): void {
    this.pw = Math.max(1, width);
    this.ph = Math.max(1, height);
    this.dpr = dpr > 0 ? dpr : 1;
    const size = fontSizeForDpr(this.dpr);
    if (size !== this.fontSize) {
      this.fontSize = size;
      void this.loadFont(size);
    }
  }

  setScene(scene: Scene): void {
    this.scene = scene;
    this.sceneVersion++;
  }

  // ------------------------------------------------------------ render

  render(view: View): void {
    const gl = this.gl;
    if (this.disposed || gl.isContextLost()) return;
    gl.viewport(0, 0, this.pw, this.ph);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(this.bg[0], this.bg[1], this.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.map) return;

    const cssW = this.pw / this.dpr;
    const cssH = this.ph / this.dpr;
    const kx = (5280 * view.zoom) / cssW;
    const ky = (5280 * view.zoom) / cssH;
    for (const p of [this.room, this.color, this.texColor, this.font]) {
      gl.useProgram(p.p);
      gl.uniform4f(p.u.uView!, view.x, view.y, kx, ky);
    }
    gl.useProgram(this.font.p);
    gl.uniform2f(this.font.u.uPhys!, this.pw, this.ph);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const cur = view.layer;
    // A light background (ADR 0085 addendum): the white lines turn dark.
    const ink = isLightBackground(this.bg) ? LIGHT_BG_INK : 0;
    for (const l of this.layers) {
      if (l.z === cur && l.rooms) this.fullScreen(withAlpha(this.bg, 0.5));
      if (l.rooms) this.drawLayer(l, cur);
      if (view.zoom >= CONNECTION_ZOOM) {
        if (l.conn) this.drawColor(l.conn, l.z === cur ? WHITE : withAlpha(GRAY70, 0.1), l.z === cur ? ink : 0);
        if (l.z === cur && view.zoom >= DOOR_NAME_ZOOM && l.doorNameMesh) this.drawFont(l.doorNameMesh, this.fontTex, false);
      }
    }
    if (view.zoom >= INFOMARK_ZOOM) {
      const l = this.layers.find((x) => x.z === cur);
      if (l?.marks) this.drawColor(l.marks, WHITE, ink);
      if (l?.markTextMesh) this.drawFont(l.markTextMesh, this.fontTex, false);
    }
    this.drawScene(view, cssW, cssH);
  }

  private fullScreen(c: RGBA): void {
    const gl = this.gl;
    gl.useProgram(this.full.p);
    gl.uniform4fv(this.full.u.uColor!, c);
    gl.bindVertexArray(this.fullVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** LayerMeshes::render. */
  private drawLayer(l: LayerGL, cur: number): void {
    const gl = this.gl;
    const r = l.rooms!;
    const noTex = l.z > cur;
    const color: RGBA = l.z <= cur ? withAlpha(WHITE, 0.9) : withAlpha(GRAY70, 0.2);
    gl.useProgram(this.room.p);
    gl.bindVertexArray(l.roomVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, l.roomVbo);
    const draw = (cat: Category, c: RGBA, white = false) => {
      const range = r.ranges[cat];
      if (!range.count) return;
      const t = this.arrays[CATEGORY_TEX[cat]];
      if (!white && !t) return; // still loading
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t ?? null);
      gl.uniform4fv(this.room.u.uColor!, c);
      gl.uniform1i(this.room.u.uWhite!, white ? 1 : 0);
      gl.vertexAttribIPointer(0, 4, gl.INT, 16, range.first * 16);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, range.count);
    };
    if (noTex) draw('terrain', withAlpha(WHITE, 0.2), true);
    else draw('terrain', color);
    gl.blendFuncSeparate(gl.ZERO, gl.SRC_COLOR, gl.ZERO, gl.ONE);
    draw('tintDark', WHITE, true);
    draw('tintNoSundeath', WHITE, true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (!noTex) {
      // MMapper tints its white flow arrows with the river colour; a set's own coloured marks draw as is (ADR 0088).
      const stream: RGBA = this.streamsAsIs ? color : [WATER[0] * color[0], WATER[1] * color[1], WATER[2] * color[2], color[3]];
      draw('streamIns', stream);
      draw('streamOuts', stream);
      draw('trails', color);
      draw('overlays', color);
    }
    draw('upDown', color);
    draw('doors', color);
    draw('walls', color);
    draw('dotted', color);
    if (l.z !== cur) {
      const d = Math.abs(cur - l.z);
      const alpha = Math.min(1, Math.max(0, (l.z < cur ? 0.5 : 0.1) + 0.03 * d));
      draw('terrain', withAlpha(l.z < cur || noTex ? BLACK : WHITE, alpha), true);
    }
    gl.bindVertexArray(null);
  }

  /** `ink`: the colour shader's uInk (0: as is; LIGHT_BG_INK on a light background). */
  private drawColor(m: FloatMesh, c: RGBA, ink = 0): void {
    if (!m.count) return;
    const gl = this.gl;
    gl.useProgram(this.color.p);
    gl.uniform4fv(this.color.u.uColor!, c);
    gl.uniform1f(this.color.u.uInk!, ink);
    gl.bindVertexArray(m.vao);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
  }

  private drawFont(m: FloatMesh, tex: WebGLTexture | null, screen: boolean, solidOnly = false): void {
    if (!m.count || (!tex && !solidOnly)) return;
    const gl = this.gl;
    gl.useProgram(this.font.p);
    gl.uniform1i(this.font.u.uScreen!, screen ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindVertexArray(m.vao);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
  }

  /** Characters, path and labels (MapCanvas::paintCharacters, CharFakeGL::reallyDraw). */
  private drawScene(view: View, cssW: number, cssH: number): void {
    const map = this.map!;
    const s = this.scene;
    if (s.room === null && s.members.length === 0) return;
    const key = `${this.sceneVersion},${this.fontSize},${view.x},${view.y},${view.zoom},${view.layer},${cssW},${cssH},${this.dpr}`;
    if (!this.sceneMeshes || this.sceneMeshes.key !== key) {
      const g: SceneGeometry = buildScene(s, { map, view, w: cssW, h: cssH, dpr: this.dpr, font: this.fontMetrics });
      const old = this.sceneMeshes;
      const dyn = this.gl.DYNAMIC_DRAW;
      this.sceneMeshes = {
        key,
        roomSel: this.floatMesh(g.roomSel, 10, TEXCOLOR_LAYOUT, dyn, old?.roomSel),
        tris: this.floatMesh(g.tris.data, COLOR_STRIDE, COLOR_LAYOUT, dyn, old?.tris),
        arrows: this.floatMesh(g.arrows.data, FONT_STRIDE, FONT_LAYOUT, dyn, old?.arrows),
        points: this.floatMesh(g.points.data, FONT_STRIDE, FONT_LAYOUT, dyn, old?.points),
        path: this.floatMesh(g.pathQuads.data, COLOR_STRIDE, COLOR_LAYOUT, dyn, old?.path),
        names: this.floatMesh(g.names.data, FONT_STRIDE, FONT_LAYOUT, dyn, old?.names),
      };
    }
    const m = this.sceneMeshes;
    const gl = this.gl;
    if (m.roomSel.count && this.arrays[TEX.A256]) {
      gl.useProgram(this.texColor.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.arrays[TEX.A256] ?? null);
      gl.bindVertexArray(m.roomSel.vao);
      gl.drawArrays(gl.TRIANGLES, 0, m.roomSel.count);
    }
    this.drawColor(m.tris, WHITE);
    this.drawFont(m.arrows, this.charArrows, false);
    this.drawFont(m.points, null, false, true);
    this.drawColor(m.path, WHITE);
    this.drawFont(m.names, this.fontTex, true);
  }

  dispose(): void {
    this.disposed = true;
    this.freeLayers();
    this.sceneMeshes = this.freeScene();
    const gl = this.gl;
    for (const t of [...this.arrays, this.charArrows, this.fontTex]) if (t) gl.deleteTexture(t);
    for (const p of [this.room, this.color, this.texColor, this.font, this.full]) gl.deleteProgram(p.p);
    gl.deleteVertexArray(this.fullVao);
  }
}
