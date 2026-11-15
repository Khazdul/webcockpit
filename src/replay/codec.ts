// The HTML replay's embedded payload (ADR 0019 "Replay payload"): JSON,
// gzip, base64. The exporter encodes it (src/replay/export.ts), the page
// decodes it (src/replay/page.ts). Base64 has no `<`, so the text is safe
// inside a `<script type="application/json">`. Uses the Compression
// Streams API (every current browser, Node ≥ 18).

import type { ReplayPayload } from '../share/payload';
import { validatePayload } from './validate';

/** Id of the `<script type="application/json">` holding the payload. */
export const PAYLOAD_ELEMENT_ID = 'wc-replay-payload';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
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

/** Most JSON a shared payload may decompress to (ADR 0154: a gzip bomb stops here). */
export const PAYLOAD_JSON_MAX = 64 * 1024 * 1024;

/** Why a shared payload could not be read; `text` is safe to show (no payload text, no stack). */
export class PayloadReadError extends Error {
  constructor(readonly text: string) {
    super(text);
    this.name = 'PayloadReadError';
  }
}

/**
 * The gunzipped bytes of `gz`, at most `max` of them: past that the stream
 * is cancelled and a `PayloadReadError` thrown, so a gzip bomb never
 * allocates more than `max` (plus one chunk).
 */
export async function gunzipBounded(gz: Uint8Array | ArrayBuffer, max = PAYLOAD_JSON_MAX): Promise<Uint8Array> {
  const reader = new Blob([gz as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > max) {
        void reader.cancel().catch(() => {});
        throw new PayloadReadError('This replay is too large.');
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof PayloadReadError) throw err;
    throw new PayloadReadError('This replay could not be read (damaged data).');
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * A shared payload from its wire form (gzip JSON, ADR 0154 "What is
 * uploaded"): bounded decompression, strict UTF-8, JSON, `validatePayload`.
 * Every failure is a `PayloadReadError` with a one-line text.
 */
export async function readSharedPayload(gz: Uint8Array | ArrayBuffer, max = PAYLOAD_JSON_MAX): Promise<ReplayPayload> {
  const bytes = await gunzipBounded(gz, max);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new PayloadReadError('This replay could not be read (damaged data).');
  }
  try {
    return validatePayload(raw);
  } catch {
    throw new PayloadReadError('This replay could not be read (not a valid replay).');
  }
}

/** The wire form of a payload: its JSON, gzip (what `encodePayload` makes before base64). */
export async function payloadBytes(p: ReplayPayload): Promise<Uint8Array> {
  return pipe(new TextEncoder().encode(JSON.stringify(p)), new CompressionStream('gzip'));
}
