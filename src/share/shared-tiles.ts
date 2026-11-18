// The tiles of a shared run (owner, 2026-11-18; ADR 0154 addendum
// "Desert"): a run shared by a link or published in the Community draws
// its map with Desert (`SHARED_TILESET`), whatever set the sender draws.
//
// A link stores MMapper's default tiles, as the HTML file does (small:
// Desert's would add about 2.9 MB to every upload and every view). The
// watch page gives every payload Desert's tiles before it goes to the
// frame (src/watch/frame-host.ts): the frame may fetch nothing
// (`connect-src 'none'`), the page fetches the files from its own origin
// (cached across runs), and the frame validates the result as any payload.
// So runs published before this change are drawn in Desert too.
//
// `retileMap` swaps the `pixmaps/` files the payload already carries (the
// subset's `neededAssets`) for a tileset's (each from the set when it has
// the file, else the default `pixmaps/`, as `embedReplayMap` does); the
// fonts, the subset and everything else stay.

import { overlayPath } from '../map/assets';
import type { TilesetOverlay } from '../map/protocol';
import { sharedOverlay } from '../map/tilesets';
import { toBase64 } from '../replay/codec';
import type { ReplayMap, ReplayPayload } from './payload';

export interface RetileOptions {
  /** Asset root URL (`…/map/`). */
  assetBase: string;
  fetch?: (url: string) => Promise<Response>;
}

/** Whether `p` has map tiles to draw in Desert (false: no map, or no tiles in it). */
export function needsSharedTiles(p: ReplayPayload): boolean {
  return p.map !== undefined && Object.keys(p.map.files).some((k) => k.startsWith('pixmaps/'));
}

/**
 * `p` with its map's tiles from `overlay` (undefined: MMapper's default
 * pixmaps), with the set's flow and room tints. A new object; `p` itself
 * when it has no map. Rejects when a file cannot be fetched.
 */
export async function retileMap(p: ReplayPayload, overlay: TilesetOverlay | undefined, o: RetileOptions): Promise<ReplayPayload> {
  if (!p.map) return p;
  const f = o.fetch ?? ((url: string) => fetch(url));
  const base = o.assetBase.endsWith('/') ? o.assetBase : `${o.assetBase}/`;
  const files: Record<string, string> = { ...p.map.files };
  await Promise.all(
    Object.keys(files)
      .filter((k) => k.startsWith('pixmaps/'))
      .map(async (k) => {
        const resp = await f(base + overlayPath(overlay, k));
        if (!resp.ok) throw new Error(`${k}: HTTP ${resp.status}`);
        files[k] = `data:image/png;base64,${toBase64(new Uint8Array(await resp.arrayBuffer()))}`;
      }),
  );
  const { streamsAsIs: _s, tints: _t, ...rest } = p.map;
  const map: ReplayMap = {
    ...rest,
    files,
    ...(overlay?.streamsAsIs ? { streamsAsIs: true } : {}),
    ...(overlay?.tints ? { tints: { ...overlay.tints } } : {}),
  };
  return { ...p, map };
}

/** `p` drawn with Desert's tiles (`p` itself when it has none to draw). */
export async function withSharedTiles(p: ReplayPayload, o: RetileOptions): Promise<ReplayPayload> {
  return needsSharedTiles(p) ? retileMap(p, sharedOverlay(), o) : p;
}
