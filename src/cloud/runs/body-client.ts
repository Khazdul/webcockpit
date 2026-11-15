// The page's side of the run body worker (body.worker.ts, ADR 0153): a
// run's body sealed and opened off the page's thread. The worker is
// started by the first request, shared by requests that overlap, and ended
// a while after the last answer. One that does not answer in five minutes
// is taken for dead: it is ended and what waited on it rejects.
//
// Where there are no workers (unit tests in Node), the same code (body.ts,
// loaded with `import()`) runs on the calling thread. This file is itself
// loaded with `import()`: nothing of it is in the entry chunk.

import type { RunRows } from '../../runs/backup-format';
import { RunBodyError, type RunBodyErrorCode } from './body';
import type { RunBodyPort } from './types';

export type RunBodyRequest =
  | { id: number; op: 'encode'; dataKey: CryptoKey; serverId: string; rows: RunRows }
  | { id: number; op: 'decode'; dataKey: CryptoKey; serverId: string; runId: string; body: Blob };

export type RunBodyResponse =
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: true; rows: RunRows }
  /** `code`: the `RunBodyError`'s, or null for any other failure. */
  | { id: number; ok: false; code: RunBodyErrorCode | null; message: string };

/** A request without its id. */
type RunBodyAsk = RunBodyRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never;

/** Seals and opens run bodies (in the worker, or inline). */
export interface RunBodyCodec {
  encode(dataKey: CryptoKey, serverId: string, rows: RunRows): Promise<Blob>;
  /** Rejects with a `RunBodyError` for a body that is not this run's whole body. */
  decode(dataKey: CryptoKey, serverId: string, runId: string, body: Blob): Promise<RunRows>;
}

/** The worker is ended this long after its last answer (ms). */
export const BODY_IDLE_MS = 30_000;
/** A request not answered after this long (ms) fails, and the worker is ended. */
export const BODY_TIMEOUT_MS = 300_000;

/** body.ts on this thread (tests, and where there are no workers). */
export function inlineRunBodyCodec(): RunBodyCodec {
  return {
    async encode(dataKey, serverId, rows) {
      const { encodeRunBody } = await import('./body');
      return encodeRunBody(dataKey, serverId, rows);
    },
    async decode(dataKey, serverId, runId, body) {
      const { decodeRunBody } = await import('./body');
      return decodeRunBody(dataKey, serverId, runId, body);
    },
  };
}

interface Pending {
  resolve(res: RunBodyResponse & { ok: true }): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function endWorker(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = null;
  worker?.terminate();
  worker = null;
}

function failAll(message: string): void {
  const waiting = [...pending.values()];
  pending.clear();
  endWorker();
  for (const p of waiting) {
    clearTimeout(p.timer);
    p.reject(new Error(message));
  }
}

function startWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./body.worker.ts', import.meta.url), { type: 'module', name: 'run-body' });
  w.addEventListener('message', (e: MessageEvent<RunBodyResponse>) => {
    const res = e.data;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    clearTimeout(p.timer);
    if (res.ok) p.resolve(res);
    else p.reject(res.code ? new RunBodyError(res.code, res.message) : new Error(res.message));
    if (pending.size === 0) {
      if (idleTimer !== null) clearTimeout(idleTimer);
      idleTimer = setTimeout(endWorker, BODY_IDLE_MS);
    }
  });
  w.addEventListener('error', (e: ErrorEvent) => failAll(e.message || 'the run body worker failed'));
  w.addEventListener('messageerror', () => failAll('the run body worker sent an answer that could not be read'));
  worker = w;
  return w;
}

function ask(req: RunBodyAsk): Promise<RunBodyResponse & { ok: true }> {
  const w = startWorker();
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = null;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) failAll('the run body worker did not answer');
    }, BODY_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    w.postMessage({ ...req, id } as RunBodyRequest);
  });
}

/** The worker where there is one, else `inlineRunBodyCodec()`. */
export function runBodyCodec(): RunBodyCodec {
  if (typeof Worker !== 'function') return inlineRunBodyCodec();
  return {
    async encode(dataKey, serverId, rows) {
      const res = await ask({ op: 'encode', dataKey, serverId, rows });
      return (res as { blob: Blob }).blob;
    },
    async decode(dataKey, serverId, runId, body) {
      const res = await ask({ op: 'decode', dataKey, serverId, runId, body });
      return (res as { rows: RunRows }).rows;
    },
  };
}

/** The queue's body port: `codec` with the account's data key bound. */
export function runBodyPort(dataKey: CryptoKey, codec: RunBodyCodec = runBodyCodec()): RunBodyPort {
  return {
    encode: (serverId, rows) => codec.encode(dataKey, serverId, rows),
    decode: (serverId, runId, body) => codec.decode(dataKey, serverId, runId, body),
  };
}

/** True while the worker is alive. */
export function runBodyWorkerAlive(): boolean {
  return worker !== null;
}

/** Ends the worker now (Log out); requests still waiting reject. */
export function stopRunBodyWorker(): void {
  failAll('the run body worker was stopped');
}
