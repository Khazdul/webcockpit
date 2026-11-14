// Segmented bodies (spec §7.3): a run's body, encrypted in pieces so it can
// be streamed with memory bounded by the segment size, and so a body that
// was cut off, reordered or spliced does not open.
//
//   body    = header | segment 0 | segment 1 | … | segment n-1
//   header  = version (1 byte, 0x01) | segment size S (32 bits big-endian) | body id (16 random bytes)
//   segment = nonce (12 random bytes) | AES-256-GCM ciphertext | tag (16)
//
//   associated data of segment i =
//     version (0x01) | 0x53 ("S") | field(kind) | field(id) | S (32 bits BE) | body id (16) | i (32 bits BE) | final (0x00 or 0x01)
//
// The body id is made anew every time a body is written. It ties the
// segments of one writing together: a run saved twice under the same kind
// and id gives two bodies whose segments cannot be mixed.
//
// The plaintext is cut into pieces of exactly S bytes; the last piece has
// 1..S bytes and is the only one sealed with final = 1. An empty body is
// one final segment of no bytes. So every segment but the last is exactly
// 12 + S + 16 bytes on the wire and the reader needs no length fields: a
// full frame followed by more bytes is not final, what is left at the end
// is.
//
// What fails, and why:
// - a body cut at a segment boundary: its last frame was sealed with
//   final = 0 and is opened with final = 1;
// - a body cut inside a segment, or changed bytes: the tag;
// - segments reordered, duplicated or dropped: the index;
// - a segment of another body: the body id, and kind and id; the same
//   body under another kind or id: kind and id;
// - a changed header: the version, S and the body id are in every
//   segment's associated data.
//
// A reader that streams gets the earlier segments before a cut is seen:
// every piece handed out is authentic and in its place, but only the end
// of the stream without an error says the body is whole. Callers that
// write to disk as they go must discard on error.
//
// Nonces are random, one per segment, under the data key (see blob.ts for
// the bound: a 20 MB body is 20 of the 2^32).

import { type Bytes, type RandomSource, concat, kindId, systemRandom, u32 } from './bytes';
import { NONCE_BYTES, TAG_BYTES, gcmDecrypt, gcmEncrypt } from './blob';
import { CloudCryptoError } from './errors';

export const BODY_VERSION = 1;
/** Spec §7.3: 1 MB segments. */
export const SEGMENT_SIZE = 1 << 20;
/** The largest segment size a reader accepts (it must hold one segment in memory). */
export const MAX_SEGMENT_SIZE = 1 << 24;
export const BODY_ID_BYTES = 16;
export const BODY_HEADER_BYTES = 1 + 4 + BODY_ID_BYTES;
const SEGMENT_OVERHEAD = NONCE_BYTES + TAG_BYTES;

/** Bytes as they come: a stream or anything iterable in chunks. */
export type ByteSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Iterable<Uint8Array>;

export interface BodyOptions {
  /** Bytes of plaintext per segment (default 1 MB). */
  segmentSize?: number;
  random?: RandomSource;
}

function checkSegmentSize(size: number, code: 'bad_input' | 'malformed'): void {
  if (!Number.isInteger(size) || size < 1 || size > MAX_SEGMENT_SIZE) throw new CloudCryptoError(code, 'a segment size out of range');
}

/** The associated data of segment `index` of the body `bodyId`. */
export function segmentAad(kind: string, id: string, segmentSize: number, bodyId: Bytes, index: number, final: boolean): Bytes {
  if (bodyId.length !== BODY_ID_BYTES) throw new CloudCryptoError('bad_input', 'a body id is 16 bytes');
  return concat(Uint8Array.of(BODY_VERSION, 0x53), kindId(kind, id), u32(segmentSize), bodyId, u32(index), Uint8Array.of(final ? 1 : 0));
}

/** The source's chunks, whatever it is (a stream is read with a reader: not every browser iterates streams). */
async function* chunksOf(source: ByteSource): AsyncGenerator<Uint8Array> {
  if (typeof (source as ReadableStream<Uint8Array>).getReader === 'function') {
    const reader = (source as ReadableStream<Uint8Array>).getReader();
    let finished = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          return;
        }
        yield value;
      }
    } finally {
      if (!finished) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  } else {
    yield* source as AsyncIterable<Uint8Array>;
  }
}

/**
 * Chunks in, exact byte counts out. A pushed chunk is read in place until
 * `keep()` copies what is left of it, which the loops below do before they
 * ask the source for the next chunk (a source may reuse its buffer).
 */
class ByteQueue {
  private parts: Uint8Array[] = [];
  private borrowed = false;
  length = 0;

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    this.parts.push(chunk);
    this.borrowed = true;
    this.length += chunk.length;
  }

  /** Copies the rest of the last pushed chunk, so the queue owns all it holds. */
  keep(): void {
    const last = this.parts.length - 1;
    if (this.borrowed && last >= 0) this.parts[last] = this.parts[last]!.slice();
    this.borrowed = false;
  }

  /** The next `n` bytes, copied out. */
  take(n: number): Bytes {
    const out = new Uint8Array(n);
    let at = 0;
    while (at < n) {
      const head = this.parts[0]!;
      const want = n - at;
      if (head.length <= want) {
        out.set(head, at);
        at += head.length;
        this.parts.shift();
      } else {
        out.set(head.subarray(0, want), at);
        this.parts[0] = head.subarray(want);
        at = n;
      }
    }
    this.length -= n;
    return out;
  }
}

/**
 * Encrypts a body: yields the header, then one chunk per segment. Holds at
 * most one segment (and the source's current chunk) in memory. Random
 * draws: the body id (16), then a nonce (12) per segment.
 */
export async function* encryptBody(dataKey: CryptoKey, kind: string, id: string, source: ByteSource, opts: BodyOptions = {}): AsyncGenerator<Bytes> {
  const size = opts.segmentSize ?? SEGMENT_SIZE;
  const random = opts.random ?? systemRandom;
  checkSegmentSize(size, 'bad_input');
  kindId(kind, id); // refuses a bad kind or id before anything is written
  const bodyId = random(BODY_ID_BYTES);
  yield concat(Uint8Array.of(BODY_VERSION), u32(size), bodyId);
  const queue = new ByteQueue();
  let index = 0;
  const sealSegment = async (plain: Bytes, final: boolean): Promise<Bytes> => {
    const nonce = random(NONCE_BYTES);
    return concat(nonce, await gcmEncrypt(dataKey, nonce, segmentAad(kind, id, size, bodyId, index++, final), plain));
  };
  for await (const chunk of chunksOf(source)) {
    queue.push(chunk);
    // A full segment is only written when more follows: the last one must be sealed as final.
    while (queue.length > size) yield await sealSegment(queue.take(size), false);
    queue.keep();
  }
  yield await sealSegment(queue.take(queue.length), true);
}

/**
 * Decrypts a body: yields the plaintext segment by segment. Throws a
 * `CloudCryptoError`: `unknown_version` (a newer client wrote it),
 * `malformed` (no header, a bad segment size, too short to hold a final
 * segment), `auth` (anything cut, moved, changed, or not this kind and id).
 * What was yielded before an error is authentic but the body is not whole.
 */
export async function* decryptBody(dataKey: CryptoKey, kind: string, id: string, source: ByteSource): AsyncGenerator<Bytes> {
  kindId(kind, id);
  const queue = new ByteQueue();
  let size = 0;
  let frame = 0;
  let index = 0;
  let bodyId: Bytes = new Uint8Array(BODY_ID_BYTES);
  const openSegment = async (sealed: Bytes, final: boolean): Promise<Bytes> =>
    gcmDecrypt(dataKey, sealed.slice(0, NONCE_BYTES), segmentAad(kind, id, size, bodyId, index++, final), sealed.slice(NONCE_BYTES));
  for await (const chunk of chunksOf(source)) {
    queue.push(chunk);
    if (frame === 0) {
      if (queue.length < BODY_HEADER_BYTES) {
        queue.keep();
        continue;
      }
      const header = queue.take(BODY_HEADER_BYTES);
      if (header[0] !== BODY_VERSION) throw new CloudCryptoError('unknown_version', `body version ${header[0]}`);
      size = new DataView(header.buffer).getUint32(1);
      checkSegmentSize(size, 'malformed');
      bodyId = header.slice(5);
      frame = size + SEGMENT_OVERHEAD;
    }
    // A full frame is only opened as "not final" when more follows.
    while (queue.length > frame) yield await openSegment(queue.take(frame), false);
    queue.keep();
  }
  if (frame === 0) {
    // The version first, as for a blob: a later format's header may be shorter.
    if (queue.length > 0 && queue.take(1)[0] !== BODY_VERSION) throw new CloudCryptoError('unknown_version', 'body version');
    throw new CloudCryptoError('malformed', 'a body without a header');
  }
  if (queue.length < SEGMENT_OVERHEAD) throw new CloudCryptoError('malformed', 'a body without a final segment');
  const last = await openSegment(queue.take(queue.length), true);
  // The writer never makes an empty final segment after others; one that verifies anyway is not ours.
  if (last.length === 0 && index > 1) throw new CloudCryptoError('malformed', 'an empty final segment');
  if (last.length > 0) yield last;
}

function streamOf(chunks: AsyncGenerator<Bytes>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (e) {
        controller.error(e);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}

/** `encryptBody` as a stream (for an upload's body or a pipe). */
export function encryptBodyStream(dataKey: CryptoKey, kind: string, id: string, source: ByteSource, opts: BodyOptions = {}): ReadableStream<Uint8Array> {
  return streamOf(encryptBody(dataKey, kind, id, source, opts));
}

/** `decryptBody` as a stream. The stream errors with the `CloudCryptoError`. */
export function decryptBodyStream(dataKey: CryptoKey, kind: string, id: string, source: ByteSource): ReadableStream<Uint8Array> {
  return streamOf(decryptBody(dataKey, kind, id, source));
}

async function collect(chunks: AsyncGenerator<Bytes>): Promise<Bytes> {
  const parts: Bytes[] = [];
  for await (const c of chunks) parts.push(c);
  return concat(...parts);
}

/** One shot: the whole body in memory (tests, small bodies). */
export function sealBody(dataKey: CryptoKey, kind: string, id: string, plaintext: Bytes, opts: BodyOptions = {}): Promise<Bytes> {
  return collect(encryptBody(dataKey, kind, id, [plaintext], opts));
}

/** One shot: the whole plaintext, or the error; nothing partial. */
export function openBody(dataKey: CryptoKey, kind: string, id: string, body: Bytes): Promise<Bytes> {
  return collect(decryptBody(dataKey, kind, id, [body]));
}

/** The size of a body of `plainBytes` bytes once sealed (for the storage limit's arithmetic). */
export function sealedBodySize(plainBytes: number, segmentSize = SEGMENT_SIZE): number {
  const segments = Math.max(1, Math.ceil(plainBytes / segmentSize));
  return BODY_HEADER_BYTES + plainBytes + segments * SEGMENT_OVERHEAD;
}
