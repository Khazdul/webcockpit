// What a share link uploads (stage 64 C1, ADR 0154 "What is uploaded"):
// the export doc's `ReplayPayload`, built exactly as the HTML export builds
// it (`buildReplayPayload`, then the map subset when the export embeds one:
// `withReplayMap`), its JSON checked with `validatePayload` (a payload the
// watch page would refuse is never uploaded), then gzip: the wire form.
// One difference: the map's tiles are Desert's, a shared run's tileset
// (owner, 2026-11-18; ADR 0154 addendum), not the HTML file's default ones.
//
// Two halves: `prepareLinkPayload` (here: what the HTML export does) and
// `sealLinkPayload` (link-seal.ts: the validator and gzip). Both run in the
// export editor's chunk, with the modules the exporter already has there:
// a share dialog chunk that shared them would split the app's chunks anew
// and grow the entry chunk's preload lists.
//
// Only the cut leaves the device. The payload's settings are the
// whitelisted sections (`replaySettings`); the map's subset carries no
// room notes and a neutral name (`forLink`); the doc itself, the run bodies,
// the data key and any item stay here: nothing but the sealed bytes and
// the meta go into the POST (src/cloud/pub/api.ts `pubBody`).

import type { ChainRun } from '../player/timeline';
import { buildTimeline } from '../player/timeline';
import type { RunEvent } from '../runs/events';
import type { Settings } from '../settings/types';
import type { MapSource } from '../map/protocol';
import { SHARED_TILESET, sharedOverlay } from '../map/tilesets';
import { type BuildReplayOptions, withReplayMap } from '../replay/export';
import type { ExportDoc } from './edits';
import { type ReplayPayload, buildReplayPayload, payloadEdits } from './payload';

/** A link's payload before it is sealed. */
export interface PreparedLink {
  payload: ReplayPayload;
  /** Its JSON: what is validated and compressed. */
  json: string;
  /** The cut's played length, seconds (the meta's `lengthS`). */
  lengthS: number;
}

/** A link's payload as uploaded. */
export interface LinkPayload {
  payload: ReplayPayload;
  /** The JSON, gzip: the bytes the POST carries after the meta. */
  bytes: Uint8Array;
  lengthS: number;
}

/** The played length of a payload, seconds: the replay's own timeline (gaps collapsed, comments' holds in). */
export function playedSeconds(p: ReplayPayload): number {
  try {
    return Math.round(buildTimeline(p.runs, payloadEdits(p)).durationMs / 1000);
  } catch {
    return 0;
  }
}

/** Builds the payload of a link as the HTML export does. `map` is what the HTML export passes; null: no map. */
export async function prepareLinkPayload(
  chain: readonly ChainRun[],
  events: readonly RunEvent[],
  doc: ExportDoc,
  settings: Settings,
  map: MapSource | null,
  o: { base?: string; fetch?: (url: string) => Promise<Response>; runMapTool?: BuildReplayOptions['runMapTool'] } = {},
): Promise<PreparedLink> {
  // The map without the player's room notes and the map file's name (review
  // fix S6), in Desert's tiles: a shared run's tileset (owner, 2026-11-18).
  const payload = await withReplayMap(buildReplayPayload(chain, events, doc, settings), {
    map,
    forLink: true,
    tileset: sharedOverlay(),
    tilesetId: SHARED_TILESET,
    ...o,
  });
  return { payload, json: JSON.stringify(payload), lengthS: playedSeconds(payload) };
}
