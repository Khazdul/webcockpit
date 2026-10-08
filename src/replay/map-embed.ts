// The map of an HTML replay (ADR 0020 "Replays"), both ends:
//
// - Export (`embedReplayMap`, the app): the rooms the exported chain
//   visited (`Room.Info` ids and names, `Group.*` mapids; src/map/tools.ts)
//   are looked up in the current map by the map tools worker, which cuts
//   the subset (visited rooms + a margin + a ring) and writes it as a
//   `.mm2`. The tiles and fonts that subset draws are fetched from the
//   app's own origin (the tiles from the client's tileset, ADR 0082) and
//   embedded as data URIs. A chain without map data
//   gets no map; a map that cannot be read gets none either (the export
//   still succeeds, with a console warning).
//
// The page side is src/replay/map-host.ts (kept apart, so the replay
// bundle does not carry the export code).

import { overlayPath } from '../map/assets';
import type { MapSource, TilesetOverlay } from '../map/protocol';
import type { MapToolRequest, MapToolResponse } from '../map/tools';
import { extractVisits } from '../map/tools';
import type { ReplayMap, ReplayPayload } from '../share/payload';
import { toBase64 } from './codec';

export interface EmbedMapOptions {
  /** Asset root URL (`…/map/`), resolved against the page. */
  assetBase: string;
  fetch?: (url: string) => Promise<Response>;
  /** Runs a map tool (default: the tools worker). */
  runTool?: (req: MapToolRequest) => Promise<MapToolResponse>;
  /**
   * The tileset the client draws (ADR 0082): each pixmap is fetched from
   * it when the set has the file, else from the default `pixmaps/`, and
   * embedded under its `pixmaps/` path (an aliased file under the path it
   * stands in for, ADR 0088), so the page needs no tileset logic; the set's
   * untinted flow marks and room tints travel as `ReplayMap.streamsAsIs`
   * and `ReplayMap.tints`.
   */
  tileset?: TilesetOverlay;
}

const MIME: Readonly<Record<string, string>> = { png: 'image/png', fnt: 'text/plain' };

/** `payload` with its map subset (a new object; the same one when there is nothing to embed). */
export async function embedReplayMap(payload: ReplayPayload, source: MapSource, o: EmbedMapOptions): Promise<ReplayPayload> {
  const visits = extractVisits(payload.runs.map((r) => r.text));
  if (visits.rooms.length === 0 && visits.mapIds.length === 0) return payload;
  const run = o.runTool ?? (async (req: MapToolRequest) => (await import('../map/tools-client')).runMapTool(req));
  const res = await run({ t: 'subset', source, visits });
  if (!res.ok || res.t !== 'subset') {
    console.warn(`WebCockpit: the replay's map was left out (${res.ok ? 'unexpected answer' : res.message})`);
    return payload;
  }
  const r = res.result;
  if (!r.mm2) return payload;
  const f = o.fetch ?? ((url: string) => fetch(url));
  const base = o.assetBase.endsWith('/') ? o.assetBase : `${o.assetBase}/`;
  const files: Record<string, string> = {};
  try {
    await Promise.all(
      r.assets.map(async (path) => {
        const resp = await f(base + overlayPath(o.tileset, path));
        if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
        const mime = MIME[path.slice(path.lastIndexOf('.') + 1)] ?? 'application/octet-stream';
        files[path] = `data:${mime};base64,${toBase64(new Uint8Array(await resp.arrayBuffer()))}`;
      }),
    );
  } catch (err) {
    console.warn(`WebCockpit: the replay's map was left out (${err instanceof Error ? err.message : String(err)})`);
    return payload;
  }
  const map: ReplayMap = {
    name: r.name,
    rooms: r.rooms,
    visited: r.visited,
    mm2: toBase64(r.mm2),
    files,
    ...(o.tileset?.streamsAsIs ? { streamsAsIs: true } : {}),
    ...(o.tileset?.tints ? { tints: { ...o.tileset.tints } } : {}),
  };
  return { ...payload, map };
}
