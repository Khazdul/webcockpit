// The tiles of a shared run (owner, 2026-11-18; ADR 0154 addendum
// "Desert"): a run shared by a link or published in the Community draws
// its map with Desert (`SHARED_TILESET`), whatever set the sender draws.
//
// - New links embed Desert when they are made (src/share/link-payload.ts,
//   `ReplayMap.tileset` says so), so the stored payload is right.
// - Every payload the watch page plays whose tiles are not Desert's (all
//   links made before, and a link that only fitted with the small default
//   tiles) gets Desert's tiles on the page before it goes to the frame
//   (src/watch/frame-host.ts): the frame may fetch nothing (`connect-src
//   'none'`), the page fetches the files from its own origin as the
//   exporter does, and the frame validates the result as any payload.
//
// `retileMap` swaps the `pixmaps/` files the payload already carries (the
// subset's `neededAssets`) for a tileset's (each from the set when it has
// the file, else the default `pixmaps/`, as `embedReplayMap` does); the
// fonts, the subset and everything else stay.

import { overlayPath } from '../map/assets';
import type { TilesetOverlay } from '../map/protocol';
import { SHARED_TILESET, sharedOverlay } from '../map/tilesets';
import { toBase64 } from '../replay/codec';
import type { ReplayMap, ReplayPayload } from './payload';

export interface RetileOptions {
  /** Asset root URL (`…/map/`). */
  assetBase: string;
  fetch?: (url: string) => Promise<Response>;
}

/** Whether `p`'s map needs Desert's tiles to be drawn as a shared run is (false: no map, or Desert's already). */
export function needsSharedTiles(p: ReplayPayload): boolean {
  return p.map !== undefined && p.map.tileset !== SHARED_TILESET && Object.keys(p.map.files).some((k) => k.startsWith('pixmaps/'));
}

/**
 * `p` with its map's tiles from `overlay` (undefined: MMapper's default
 * pixmaps) under `id` (the `ReplayMap.tileset` it then says; undefined:
 * none). A new object; `p` itself when it has no map. Rejects when a
 * file cannot be fetched.
 */
export async function retileMap(p: ReplayPayload, overlay: TilesetOverlay | undefined, id: string | undefined, o: RetileOptions): Promise<ReplayPayload> {
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
  const { streamsAsIs: _s, tints: _t, tileset: _id, ...rest } = p.map;
  const map: ReplayMap = {
    ...rest,
    files,
    ...(overlay?.streamsAsIs ? { streamsAsIs: true } : {}),
    ...(overlay?.tints ? { tints: { ...overlay.tints } } : {}),
    ...(id !== undefined ? { tileset: id } : {}),
  };
  return { ...p, map };
}

/** `p` drawn with Desert's tiles (`p` itself when it needs none). */
export async function withSharedTiles(p: ReplayPayload, o: RetileOptions): Promise<ReplayPayload> {
  return needsSharedTiles(p) ? retileMap(p, sharedOverlay(), SHARED_TILESET, o) : p;
}
