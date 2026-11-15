// What a share link uploads (stage 64 C1, ADR 0154 "What is uploaded"):
// the export doc's `ReplayPayload`, built exactly as the HTML export builds
// it (`buildReplayPayload`, then the map subset when the export embeds one:
// `withReplayMap`), its JSON checked with `validatePayload` (a payload the
// watch page would refuse is never uploaded), then gzip: the wire form.
//
// Only the cut leaves the device. The payload's settings are the
// whitelisted sections (`replaySettings`); the doc itself, the run bodies,
// the data key and any item stay here: nothing but this function's bytes
// and the meta go into the POST (src/cloud/pub/api.ts `pubBody`).

import type { ChainRun } from '../player/timeline';
import { buildTimeline } from '../player/timeline';
import type { RunEvent } from '../runs/events';
import type { Settings } from '../settings/types';
import type { MapSource } from '../map/protocol';
import { pipe } from '../replay/codec';
import { withReplayMap } from '../replay/export';
import { validatePayload } from '../replay/validate';
import type { ExportDoc } from './edits';
import { type ReplayPayload, buildReplayPayload, payloadEdits } from './payload';

export interface LinkPayload {
  /** The payload as uploaded (the validated copy's source). */
  payload: ReplayPayload;
  /** Its JSON, gzip: the bytes the POST carries after the meta. */
  bytes: Uint8Array;
  /** The cut's played length, seconds (the meta's `lengthS`). */
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

/**
 * Builds the payload of a link. `map` is what the HTML export passes (the
 * current map's source); null: no map. Throws a `PayloadError` when the
 * result would not pass `validatePayload`.
 */
export async function buildLinkPayload(
  chain: readonly ChainRun[],
  events: readonly RunEvent[],
  doc: ExportDoc,
  settings: Settings,
  map: MapSource | null,
  o: { base?: string; fetch?: (url: string) => Promise<Response> } = {},
): Promise<LinkPayload> {
  const payload = await withReplayMap(buildReplayPayload(chain, events, doc, settings), { map, ...o });
  const json = JSON.stringify(payload);
  // As the watch page will read it: from the JSON, whole or not at all.
  validatePayload(JSON.parse(json));
  const bytes = await pipe(new TextEncoder().encode(json), new CompressionStream('gzip'));
  return { payload, bytes, lengthS: playedSeconds(payload) };
}
