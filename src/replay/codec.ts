// The HTML replay's embedded payload (ADR 0019 "Replay payload"): JSON,
// gzip, base64. The exporter encodes it (src/replay/export.ts), the page
// decodes it (src/replay/page.ts). Base64 has no `<`, so the text is safe
// inside a `<script type="application/json">`. Uses the Compression
// Streams API (every current browser, Node ≥ 18).

import type { ReplayPayload } from '../share/payload';

/** Id of the `<script type="application/json">` holding the payload. */
export const PAYLOAD_ELEMENT_ID = 'wc-replay-payload';

export async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Base64 of `bytes` (chunked, so a multi-MB payload does not overflow the argument list). */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(s);
}

/** The bytes of a base64 text (whitespace ignored). */
export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** gzip + base64 of the payload's JSON. */
export async function encodePayload(p: ReplayPayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p));
  return toBase64(await pipe(json, new CompressionStream('gzip')));
}

/** The payload of an `encodePayload` text; throws on a damaged or foreign payload. */
export async function decodePayload(b64: string): Promise<ReplayPayload> {
  const json = new TextDecoder().decode(await pipe(fromBase64(b64), new DecompressionStream('gzip')));
  const p = JSON.parse(json) as ReplayPayload;
  if (!p || typeof p !== 'object' || p.schema !== 1 || !Array.isArray(p.runs)) {
    throw new Error('not a WebCockpit replay payload');
  }
  return p;
}

