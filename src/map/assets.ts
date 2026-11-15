// Asset resolver for the map worker (ADR 0020 "Package notes"): every
// tile and font file is read through one function, so the app (files
// under public/map/) and the HTML replay (embedded data URIs / Blobs)
// share the renderer. Pure apart from `fetch`.

import type { AssetSource, TilesetOverlay } from './protocol';

/** A transparent 1×1 PNG: the HTML replay's answer for a tile it did not embed (`AssetSource.fallback`). */
export const EMPTY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

/** Reads one asset by its path relative to the asset root (`pixmaps/…`, `fonts/…`). */
export type AssetResolver = (path: string) => Promise<Blob>;

/**
 * Where an asset path (relative to the asset root) is read from under an
 * overlay: `pixmaps/<f>` → `<dir><f>` when the set has `<f>`,
 * `<dir><alias>` when the set draws `<f>` with another of its files
 * (ADR 0088), else as is.
 */
export function overlayPath(overlay: TilesetOverlay | undefined, path: string): string {
  if (!overlay || !path.startsWith('pixmaps/')) return path;
  const f = path.slice('pixmaps/'.length);
  const alias = overlay.aliases && Object.hasOwn(overlay.aliases, f) ? overlay.aliases[f] : undefined;
  if (alias !== undefined) return overlay.dir + alias;
  return overlay.files.includes(f) ? overlay.dir + f : path;
}

export function assetResolver(src: AssetSource, fetchFn: typeof fetch = fetch): AssetResolver {
  if (src.kind === 'base') {
    const base = src.url.endsWith('/') ? src.url : `${src.url}/`;
    const tileset = src.tileset;
    return async (path) => {
      const res = await fetchFn(base + overlayPath(tileset, path));
      if (!res.ok) throw new Error(`map asset ${path}: HTTP ${res.status}`);
      return res.blob();
    };
  }
  const files = src.files;
  const fallback = src.fallback;
  return async (path) => {
    let f = Object.hasOwn(files, path) ? files[path] : undefined;
    if (f === undefined && fallback !== undefined && path.startsWith('pixmaps/')) f = fallback;
    if (f === undefined) throw new Error(`map asset ${path}: not included`);
    if (typeof f !== 'string') return f;
    return dataUriBlob(f);
  };
}

/**
 * The Blob of a base64 `data:` URI, decoded here rather than fetched: the
 * shared replay's frame has `connect-src 'none'` (ADR 0154), which a
 * `fetch` of a data: URI is subject to, and nothing but a base64 data: URI
 * is ever loaded (src/replay/validate.ts checks the payload's).
 */
export function dataUriBlob(uri: string): Blob {
  const m = /^data:([a-z0-9.+/-]+);base64,/i.exec(uri);
  if (!m) throw new Error('map asset: not a base64 data: URI');
  const bin = atob(uri.slice(m[0].length));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1]!.toLowerCase() });
}
