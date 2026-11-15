// A shared payload's wire form (ADR 0154 "What is uploaded"): its JSON,
// gzip, as the Worker stores and serves it. Read with a ceiling and
// `validatePayload` by the frame (src/replay/frame.ts) and the watch page
// (src/watch/frame-host.ts). Apart from codec.ts, so the exporter's code
// does not carry the validator.

import type { ReplayPayload } from '../share/payload';
import { pipe } from './codec';
import { validatePayload } from './validate';

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
