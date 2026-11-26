// The token pictures on the GPU (stage 80 §7, ADR 0171): one
// TEXTURE_2D_ARRAY of TOKEN_LAYERS layers of TOKEN_PX px, RGBA8,
// premultiplied, with mipmaps and trilinear filtering (a layer per
// picture: no bleeding between cells, no shimmer at 20 px a room). Made
// the first time a token is drawn, so tokens off costs nothing.
//
// - A picture gets a layer the first time a frame's scene needs it; with
//   every layer taken, the least recently used one (not used by the scene
//   being built) is given over. A picture not decoded yet draws the disc
//   and the ring until it arrives (the source then asks for a redraw).
// - `pack` turns the scene's TokenQuads into the instance data (16 floats
//   each, shaders.ts TOKEN_VS) once per scene build, into a buffer that is
//   kept and grown, never per frame.

import { type TokenFace, type TokenLook, tokenKey } from '../protocol';
import type { TokenQuad } from './token-layout';
import { type TileImage, uploadLayer } from './upload';

export const TOKEN_LAYERS = 64;
export const TOKEN_PX = 128;
/** Floats per token instance. */
export const TOKEN_STRIDE = 16;
const MIPS = 8; // 128 → 1

/** Where the renderer gets its pictures (the worker's TokenImages). */
export interface TokenImageSource {
  /** The decoded picture: null while it loads (asked for now), false when it cannot load. */
  image(look: TokenLook): TileImage | null | false;
  /** The `+n` disc's glyphs, premultiplied (null: none can be drawn here). */
  plus(n: number): TileImage | null;
}

/** The crop of a picture in its disc (the mockup's): zoom and the top offset. */
function crop(l: TokenLook | null): [number, number, number] {
  if (!l) return [0, 1, 0.5];
  switch (l.k) {
    case 'drawn':
      return [0, 1.2, 0.12];
    case 'lib':
      return [1, 1.12, 0.08];
    case 'own':
      return [1, 1, 0.5];
    default:
      return [1, 1, 0.5];
  }
}

export class TokenTextures {
  /** The texture array (null until the first token). */
  tex: WebGLTexture | null = null;
  private readonly keys: (string | null)[] = new Array<string | null>(TOKEN_LAYERS).fill(null);
  private readonly byKey = new Map<string, number>();
  private readonly used = new Uint32Array(TOKEN_LAYERS);
  private frame = 0;
  private dirty = false;
  /** Pictures uploaded (tests, the bench). */
  uploads = 0;
  private data = new Float32Array(TOKEN_STRIDE * 16);

  constructor(private readonly gl: WebGL2RenderingContext) {}

  private ensure(): WebGLTexture {
    if (this.tex) return this.tex;
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, MIPS, gl.RGBA8, TOKEN_PX, TOKEN_PX, TOKEN_LAYERS);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tex = t;
    return t;
  }

  /** The layer holding `key`, uploading `get()` into a free (or the least recently used) layer; -1 when there is no picture yet. */
  private layer(key: string, get: () => TileImage | null | false): number {
    const have = this.byKey.get(key);
    if (have !== undefined) {
      this.used[have] = this.frame;
      return have;
    }
    const img = get();
    if (!img) return -1;
    let pick = -1;
    for (let i = 0; i < TOKEN_LAYERS; i++) {
      if (this.keys[i] === null) {
        pick = i;
        break;
      }
      if (this.used[i] !== this.frame && (pick < 0 || this.used[i]! < this.used[pick]!)) pick = i;
    }
    if (pick < 0) return -1; // every layer is in this frame's scene
    const old = this.keys[pick];
    if (old !== null && old !== undefined) this.byKey.delete(old);
    const gl = this.gl;
    const tex = this.ensure();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    uploadLayer(gl, tex, TOKEN_PX, pick, img);
    this.keys[pick] = key;
    this.byKey.set(key, pick);
    this.used[pick] = this.frame;
    this.dirty = true;
    this.uploads++;
    return pick;
  }

  /** A face's layer and its look (the fallback when the picture cannot load), or -1 and the look. */
  private faceLayer(face: TokenFace | null, src: TokenImageSource | null): [number, TokenLook | null] {
    if (!face || !src) return [-1, face?.look ?? null];
    for (const look of face.alt ? [face.look, face.alt] : [face.look]) {
      if (look.k === 'none') return [-1, look];
      const key = tokenKey(look);
      let failed = false;
      const l = this.layer(key, () => {
        const img = src.image(look);
        failed = img === false;
        return img;
      });
      if (l >= 0 || !failed) return [l, look];
    }
    return [-1, face.look];
  }

  /**
   * The instance data of `quads` (TOKEN_STRIDE floats each, in order), in a
   * kept buffer: valid until the next call. Uploads the pictures it needs
   * and the mipmaps once.
   */
  pack(quads: readonly TokenQuad[], src: TokenImageSource | null): Float32Array {
    this.frame++;
    const need = quads.length * TOKEN_STRIDE;
    if (this.data.length < need) this.data = new Float32Array(Math.max(need, this.data.length * 2));
    const out = this.data;
    let o = 0;
    for (const t of quads) {
      let layer = -1;
      let look: TokenLook | null = null;
      if (t.plus > 0) {
        const n = t.plus;
        if (src && t.r * 2 >= 9) layer = this.layer(`plus:${n}`, () => src.plus(n));
      } else [layer, look] = this.faceLayer(t.face, src);
      const [kind, zoom, oy] = t.plus > 0 ? [2, 1, 0.5] : crop(look);
      out[o++] = t.x;
      out[o++] = t.y;
      out[o++] = t.z;
      out[o++] = t.r;
      out[o++] = layer;
      out[o++] = kind;
      out[o++] = t.hp;
      out[o++] = t.aw;
      out[o++] = ((t.ring >> 16) & 255) / 255;
      out[o++] = ((t.ring >> 8) & 255) / 255;
      out[o++] = (t.ring & 255) / 255;
      out[o++] = ((t.arc >> 16) & 255) / 255;
      out[o++] = ((t.arc >> 8) & 255) / 255;
      out[o++] = (t.arc & 255) / 255;
      out[o++] = zoom;
      out[o++] = oy;
    }
    if (this.dirty && this.tex) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      this.dirty = false;
    }
    return out.subarray(0, need);
  }

  /** The layer of `key`, or undefined (tests). */
  layerOf(key: string): number | undefined {
    return this.byKey.get(key);
  }

  dispose(): void {
    if (this.tex) this.gl.deleteTexture(this.tex);
    this.tex = null;
  }
}
