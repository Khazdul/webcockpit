// The token pictures in the map worker (stage 80 §7, ADR 0171): the
// decoded sources the renderer uploads (render/tokens.ts). They live here,
// not on the GPU, so a renderer built again after a lost context uploads
// them again without asking anyone.
//
// - Library tokens: fetched by the worker itself (`${lib}<id>.webp`, the
//   app's own origin: `connect-src 'self'`) and decoded with
//   createImageBitmap, premultiplied.
// - Drawings (and part D's own images): the main thread has them (a
//   drawing needs the DOM to bake). The worker asks once (`tokenArt`); the
//   answer is a transferred ImageBitmap (or bytes, decoded here). Never a
//   `data:` URL fetched here (src/map/assets.ts says why).
// - A picture that cannot be had is remembered as failed: the renderer
//   draws the face's fallback. At most KEEP sources are held; the least
//   recently asked one is closed (asked again, it is fetched or requested
//   again).
// - The `+n` disc's glyphs are drawn here once per count on a 2D
//   OffscreenCanvas (none where there is none: the disc stays plain).
// - Nothing happens per frame: the renderer asks only when it builds a
//   scene, and `onChange` (a redraw) follows an arrival.

import { type TokenLook, tokenKey } from '../protocol';
import type { TokenImageSource } from '../render/tokens';
import { TOKEN_PX } from '../render/tokens';
import type { TileImage } from '../render/upload';

/** Sources kept (a little over the GPU's layers). */
export const KEEP = 96;

const DECODE: ImageBitmapOptions = { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' };

export interface TokenImagesHost {
  fetch: typeof fetch;
  /** Asks the main thread for a picture it has (`tokenArt`). */
  ask(key: string, look: TokenLook): void;
  /** A picture arrived (or failed): draw again. */
  onChange(): void;
  /** createImageBitmap (absent in Node: nothing decodes). */
  decode?: (b: Blob) => Promise<ImageBitmap>;
}

type Entry = { img: TileImage } | { pending: true } | { failed: true };

export class TokenImages implements TokenImageSource {
  private readonly map = new Map<string, Entry>();
  private readonly glyphs = new Map<number, TileImage | null>();
  /** The URL prefix of the library's 128 px pictures. */
  lib = '/tokens/t/';

  constructor(private readonly host: TokenImagesHost) {}

  private decode(b: Blob): Promise<ImageBitmap> {
    if (this.host.decode) return this.host.decode(b);
    if (typeof createImageBitmap !== 'function') return Promise.reject(new Error('no createImageBitmap'));
    return createImageBitmap(b, DECODE);
  }

  image(look: TokenLook): TileImage | null | false {
    const key = tokenKey(look);
    if (key === '') return false;
    const e = this.map.get(key);
    if (e) {
      // Most recently asked last.
      this.map.delete(key);
      this.map.set(key, e);
      return 'img' in e ? e.img : 'failed' in e ? false : null;
    }
    this.map.set(key, { pending: true });
    this.trim();
    if (look.k === 'lib') void this.fetchLib(key, look.id);
    else this.host.ask(key, look);
    return null;
  }

  private async fetchLib(key: string, id: string): Promise<void> {
    try {
      const r = await this.host.fetch(`${this.lib}${encodeURIComponent(id)}.webp`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this.settle(key, await this.decode(await r.blob()));
    } catch {
      this.settle(key, null);
    }
  }

  /** The main thread's answer to `tokenArt`. */
  receive(key: string, a: { bitmap?: ImageBitmap; bytes?: ArrayBuffer; failed?: boolean }): void {
    if (a.bitmap) {
      this.settle(key, a.bitmap);
      return;
    }
    if (a.bytes && !a.failed) {
      this.decode(new Blob([a.bytes])).then(
        (b) => this.settle(key, b),
        () => this.settle(key, null),
      );
      return;
    }
    this.settle(key, null);
  }

  private settle(key: string, img: TileImage | null): void {
    const e = this.map.get(key);
    if (!e || !('pending' in e)) {
      // Not asked for any more (trimmed): let it go.
      if (img && 'close' in img) img.close();
      return;
    }
    this.map.set(key, img ? { img } : { failed: true });
    this.host.onChange();
  }

  private trim(): void {
    while (this.map.size > KEEP) {
      const [k, e] = this.map.entries().next().value!;
      this.map.delete(k);
      if ('img' in e && 'close' in e.img) e.img.close();
    }
  }

  plus(n: number): TileImage | null {
    if (this.glyphs.has(n)) return this.glyphs.get(n)!;
    const img = drawPlus(n);
    this.glyphs.set(n, img);
    return img;
  }

  /** Keys held (tests). */
  keys(): string[] {
    return [...this.map.keys()];
  }
}

/** `+n` in the mockup's look (bold, #fbe7c2, 58 % of the disc), premultiplied; null without a 2D OffscreenCanvas. */
function drawPlus(n: number): TileImage | null {
  if (typeof OffscreenCanvas !== 'function') return null;
  try {
    const c = new OffscreenCanvas(TOKEN_PX, TOKEN_PX);
    const g = c.getContext('2d');
    if (!g) return null;
    const text = `+${n}`;
    let size = TOKEN_PX * 0.58;
    g.font = `700 ${size}px ui-monospace, "DejaVu Sans Mono", monospace`;
    // A long count is narrowed to the disc.
    const w = g.measureText(text).width;
    if (w > TOKEN_PX * 0.9) {
      size *= (TOKEN_PX * 0.9) / w;
      g.font = `700 ${size}px ui-monospace, "DejaVu Sans Mono", monospace`;
    }
    g.fillStyle = '#fbe7c2';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, TOKEN_PX / 2, TOKEN_PX / 2 + TOKEN_PX * 0.04);
    const d = g.getImageData(0, 0, TOKEN_PX, TOKEN_PX);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const a = p[i + 3]! / 255;
      p[i] = Math.round(p[i]! * a);
      p[i + 1] = Math.round(p[i + 1]! * a);
      p[i + 2] = Math.round(p[i + 2]! * a);
    }
    return d;
  } catch {
    return null;
  }
}
