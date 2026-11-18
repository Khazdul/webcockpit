// The second half of a link's payload (stage 64 C1; link-payload.ts): the
// JSON validated as the watch page will read it (`validatePayload`, whole
// or not at all: a `PayloadError` throws), then gzip. In the export
// editor's chunk (link-payload.ts says why).
//
// Desert's tiles (ADR 0154 addendum 2026-11-18) are several times the
// default set's bytes. A link they would push past the upload limit
// (`maxBytes`: the share dialog passes the default account limit) is
// sealed with MMapper's default tiles instead, as before: the watch page
// draws it with Desert's all the same (src/share/shared-tiles.ts), so no
// log that could be shared before becomes too large.

import { SHARED_TILESET } from '../map/tilesets';
import { validatePayload } from '../replay/validate';
import type { LinkPayload, PreparedLink } from './link-payload';
import type { ReplayPayload } from './payload';
import { retileMap } from './shared-tiles';

export interface SealOptions {
  /** Past this many bytes a Desert map falls back to the default tiles (absent: never). */
  maxBytes?: number;
  /** The site's base URL, for the default tiles (default `document.baseURI`). */
  base?: string;
  fetch?: (url: string) => Promise<Response>;
}

async function gzipJson(payload: ReplayPayload): Promise<Uint8Array> {
  const json = JSON.stringify(payload);
  const gz = new Blob([new TextEncoder().encode(json) as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(gz).arrayBuffer());
}

/** Validates and compresses a prepared link. Throws when the watch page would refuse it. */
export async function sealLinkPayload(p: PreparedLink, o: SealOptions = {}): Promise<LinkPayload> {
  // What is uploaded is the validated copy (review fix S7): only the fields
  // and bounds the watch page reads, never a key the validator drops.
  let payload = validatePayload(JSON.parse(p.json));
  let bytes = await gzipJson(payload);
  if (o.maxBytes !== undefined && bytes.length > o.maxBytes && payload.map?.tileset === SHARED_TILESET) {
    const base = o.base ?? globalThis.document?.baseURI ?? '';
    const assetBase = base ? new URL('map/', base).href : 'map/';
    payload = validatePayload(await retileMap(payload, undefined, undefined, { assetBase, ...(o.fetch ? { fetch: o.fetch } : {}) }));
    bytes = await gzipJson(payload);
  }
  return { payload, bytes, lengthS: p.lengthS };
}
