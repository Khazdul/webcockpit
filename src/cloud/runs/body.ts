// A run's body in the cloud (ADR 0153, "The body"). Pure: no IndexedDB, no
// DOM; run in the body's Web Worker (body.worker.ts), and in Node by the
// unit tests.
//
//   plaintext = {"type":"webcockpit-run-body","v":1}\n
//               the run's lines as the runs backup writes them
//               (src/runs/lines.ts: its meta, its events, its chunks;
//               the meta without its rating, which lives in the `run` item)
//   body      = encryptBody(dataKey, "run", serverId, gzip(plaintext))
//
// Reading goes the other way as a stream: decrypt (every segment
// authenticated, kind and id in its associated data), gunzip with a cap on
// the plaintext (a gzip bomb stops at the cap, not at the memory's end),
// lines, the same checks `restore()` makes. Only the end of the stream
// without an error says the body is whole: nothing is handed out before it.

import { RUN_BODY_TYPE, RUN_BODY_VERSION } from '../../../shared/cloud/api.ts';
import { BadBackupError, type Rec, type RunRows, checkRecord, parseLine, runLines, streamLines, toChunk, toEvent, toRunMeta } from '../../runs/lines';
import type { ByteSource } from '../crypto/segments';
import { type BodyOptions, decryptBodyStream, encryptBody } from '../crypto/segments';
import { isCryptoError } from '../crypto/errors';

/** The sync kind a run's body is sealed under (its associated data). */
export const RUN_BODY_KIND = 'run';

/**
 * The most a body may grow to when it is opened. A body is at most 20 MB
 * sealed (`runMaxBytes`); capture text gzips some 5 to 10 times, so a real
 * run stays well below.
 */
export const RUN_PLAIN_MAX_BYTES = 256 * 1024 * 1024;

/** A byte stream's transform (the DOM types of the compression streams take any `BufferSource`). */
type ByteTransform = TransformStream<Uint8Array, Uint8Array>;

/** Lines are handed to gzip in pieces of about this many bytes. */
const PIECE_BYTES = 64 * 1024;

export type RunBodyErrorCode =
  /** A newer client wrote it (segment format or header `v`): "update the client". */
  | 'newer'
  /** It does not open, is cut, changed, not gzip, or not a run body. */
  | 'unreadable'
  /** Its plaintext passes the cap (`RUN_PLAIN_MAX_BYTES`). */
  | 'too_large'
  /** It opens, but holds another run. */
  | 'wrong_run';

export class RunBodyError extends Error {
  override name = 'RunBodyError';
  constructor(
    readonly code: RunBodyErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}

/** A `RunBodyError` (also one rebuilt from a worker's answer), of `code` when given. */
export function isRunBodyError(e: unknown, code?: RunBodyErrorCode): e is RunBodyError {
  const ok = e instanceof RunBodyError || (!!e && typeof e === 'object' && (e as { name?: unknown }).name === 'RunBodyError');
  return ok && (code === undefined || (e as RunBodyError).code === code);
}

/** The header line of the plaintext. */
export function runBodyHeader(): string {
  return JSON.stringify({ type: RUN_BODY_TYPE, v: RUN_BODY_VERSION }) + '\n';
}

/**
 * The rows a body holds: the run as it was sealed, without its rating. The
 * rating is the one thing of a saved run that changes; it lives in the
 * `run` item (whose meta wins when a run is fetched), so a body sealed
 * again from the same run, here or on a device that fetched it, is the same
 * plaintext and so the same size as the item says.
 */
export function bodyRows(rows: RunRows): RunRows {
  const { rating: _r, ...meta } = rows.meta;
  return { ...rows, meta };
}

/** The plaintext of a run's body as a stream of UTF-8, in pieces of about 64 KB. */
export function runBodyPlaintext(rows: RunRows): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const lines = (function* () {
    yield runBodyHeader();
    yield* runLines(bodyRows(rows));
  })();
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      let piece = '';
      for (;;) {
        const next = lines.next();
        if (next.done) {
          if (piece) controller.enqueue(enc.encode(piece));
          controller.close();
          return;
        }
        piece += next.value;
        if (piece.length >= PIECE_BYTES) {
          controller.enqueue(enc.encode(piece));
          return;
        }
      }
    },
  });
}

/**
 * Seals a run's rows as its body: a `Blob` of known size (the upload's
 * `Content-Length`). `serverId` is `opaqueId(idKey, "run", runId)`.
 */
export async function encodeRunBody(dataKey: CryptoKey, serverId: string, rows: RunRows, opts: BodyOptions = {}): Promise<Blob> {
  const gz = runBodyPlaintext(rows).pipeThrough(new CompressionStream('gzip') as unknown as ByteTransform);
  const parts: BlobPart[] = [];
  for await (const seg of encryptBody(dataKey, RUN_BODY_KIND, serverId, gz, opts)) parts.push(seg as Uint8Array<ArrayBuffer>);
  return new Blob(parts, { type: 'application/octet-stream' });
}

export interface DecodeOptions {
  /** The plaintext cap (default `RUN_PLAIN_MAX_BYTES`). */
  maxPlainBytes?: number;
}

/** Passes bytes on until `max` have gone by, then errors (and so cancels what feeds it). */
function capBytes(max: number): TransformStream<Uint8Array, Uint8Array> {
  let n = 0;
  return new TransformStream({
    transform(chunk, controller) {
      n += chunk.length;
      if (n > max) throw new RunBodyError('too_large', 'the run body opens larger than the cap');
      controller.enqueue(chunk);
    },
  });
}

/** A header line's verdict: ok, or why not. */
function checkHeader(o: Rec): void {
  if (o.type !== RUN_BODY_TYPE) throw new RunBodyError('unreadable', 'not a run body');
  const v = o.v;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new RunBodyError('unreadable', 'a run body without a version');
  if (v > RUN_BODY_VERSION) throw new RunBodyError('newer', `run body version ${v}`);
}

/**
 * Opens the body of run `runId` (server id `serverId`) and reads it back to
 * its rows, as `restore()` reads a backup's run. Rejects with a
 * `RunBodyError`; nothing is returned of a body that is not whole.
 */
export async function decodeRunBody(dataKey: CryptoKey, serverId: string, runId: string, source: Blob | ByteSource, opts: DecodeOptions = {}): Promise<RunRows> {
  const max = opts.maxPlainBytes ?? RUN_PLAIN_MAX_BYTES;
  const src: ByteSource = source instanceof Blob ? source.stream() : source;
  const text = decryptBodyStream(dataKey, RUN_BODY_KIND, serverId, src)
    .pipeThrough(new DecompressionStream('gzip') as unknown as ByteTransform)
    .pipeThrough(capBytes(max))
    .pipeThrough(new TextDecoderStream('utf-8', { fatal: true }) as unknown as TransformStream<Uint8Array, string>);
  let n = 0;
  let header = false;
  let cur: string | null = null;
  let rows: RunRows | null = null;
  try {
    for await (const line of streamLines(text)) {
      n++;
      if (!line) continue;
      const o = parseLine(line, n);
      if (!header) {
        checkHeader(o);
        header = true;
        continue;
      }
      if (o.type !== 'run' && o.type !== 'event' && o.type !== 'chunk') throw new RunBodyError('unreadable', `line ${n}: not a run's line`);
      if (o.type === 'run' && rows) throw new RunBodyError('unreadable', `line ${n}: a second run`);
      cur = checkRecord(o, cur, n);
      if (o.type === 'run') {
        rows = { meta: toRunMeta(o), events: [], chunks: [] };
        if (rows.meta.runId !== runId) throw new RunBodyError('wrong_run', 'the body holds another run');
      } else if (o.type === 'event') rows!.events.push(toEvent(o));
      else rows!.chunks.push(toChunk(o));
    }
  } catch (e) {
    throw asRunBodyError(e);
  }
  if (!header || !rows) throw new RunBodyError('unreadable', 'a run body without its run');
  return rows;
}

/** Any failure of the read as a `RunBodyError`. */
function asRunBodyError(e: unknown): RunBodyError {
  if (e instanceof RunBodyError) return e;
  if (isCryptoError(e, 'unknown_version')) return new RunBodyError('newer', 'a body of a newer client');
  if (e instanceof BadBackupError) return new RunBodyError('unreadable', e.message);
  return new RunBodyError('unreadable', e instanceof Error ? e.message : String(e));
}
