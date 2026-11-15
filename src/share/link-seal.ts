// The second half of a link's payload (stage 64 C1; link-payload.ts): the
// JSON validated as the watch page will read it (`validatePayload`, whole
// or not at all: a `PayloadError` throws), then gzip. In the export
// editor's chunk (link-payload.ts says why).

import { validatePayload } from '../replay/validate';
import type { LinkPayload, PreparedLink } from './link-payload';

/** Validates and compresses a prepared link. Throws when the watch page would refuse it. */
export async function sealLinkPayload(p: PreparedLink): Promise<LinkPayload> {
  // What is uploaded is the validated copy (review fix S7): only the fields
  // and bounds the watch page reads, never a key the validator drops.
  const payload = validatePayload(JSON.parse(p.json));
  const json = JSON.stringify(payload);
  const gz = new Blob([new TextEncoder().encode(json) as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(gz).arrayBuffer());
  return { payload, bytes, lengthS: p.lengthS };
}
