// Password → `authKey` and `kek` in the KDF worker (kdf.worker.ts), as a
// promise. The worker is started by the first request, shared by requests
// that overlap, and ended a while after the last answer. A request can be
// cancelled with an AbortSignal: PBKDF2 cannot be interrupted, so the
// worker is terminated (when nothing else waits on it).
//
// Where there are no workers (unit tests in Node), or with `inline`, the
// derivation runs on the calling thread (`crypto.subtle` is asynchronous
// there too; it is the worker that guarantees the page's thread is free).

import type { Bytes } from './bytes';
import { CloudCryptoError, type CryptoErrorCode } from './errors';
import { type KdfParams, type PasswordKeys, checkKdf, derivePasswordKeysChecked } from './kdf';

export interface KdfRequest {
  id: number;
  password: string;
  salt: Bytes;
  kdf: KdfParams;
}

export type KdfResponse =
  | { id: number; ok: true; authKey: Bytes; kek: CryptoKey }
  | { id: number; ok: false; code: CryptoErrorCode; message: string };

export interface KdfOptions {
  /** Cancels the request: it rejects with `cancelled`. */
  signal?: AbortSignal;
  /** Run on the calling thread even where workers exist. */
  inline?: boolean;
}

/** The shape of `derivePasswordKeys`: what the flows of account.ts take (tests pass their own). */
export type PasswordKdf = (password: string, salt: Bytes, kdf: KdfParams, opts?: KdfOptions) => Promise<PasswordKeys>;

/** The worker is ended this long after its last answer (ms). */
export const KDF_IDLE_MS = 30_000;

interface Pending {
  resolve(keys: PasswordKeys): void;
  reject(err: CloudCryptoError): void;
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
  for (const p of waiting) p.reject(new CloudCryptoError('worker_failed', message));
}

function settled(): void {
  if (pending.size > 0 || !worker) return;
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = setTimeout(endWorker, KDF_IDLE_MS);
}

function startWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker !== 'function') return null;
  const w = new Worker(new URL('./kdf.worker.ts', import.meta.url), { type: 'module', name: 'kdf' });
  w.addEventListener('message', (e: MessageEvent<KdfResponse>) => {
    const res = e.data;
    const p = pending.get(res.id);
    if (!p) return; // cancelled meanwhile
    pending.delete(res.id);
    if (res.ok) p.resolve({ authKey: res.authKey, kek: res.kek });
    else p.reject(new CloudCryptoError(res.code, res.message));
    settled();
  });
  w.addEventListener('error', (e: ErrorEvent) => failAll(e.message || 'the KDF worker failed'));
  w.addEventListener('messageerror', () => failAll('the KDF worker sent an answer that could not be read'));
  worker = w;
  return w;
}

/**
 * Password, salt and the account's KDF parameters → `authKey` (32 bytes,
 * for the server) and `kek` (non-extractable AES-256-GCM key). Rejects with
 * a `CloudCryptoError`: `bad_kdf` (parameters this client refuses; checked
 * before any work), `cancelled`, `worker_failed`.
 */
export const derivePasswordKeys: PasswordKdf = async (password, salt, kdf, opts = {}) => {
  const checked = checkKdf(kdf, salt);
  const { signal } = opts;
  if (signal?.aborted) throw new CloudCryptoError('cancelled');
  let w: Worker | null = null;
  if (!opts.inline) {
    try {
      w = startWorker();
    } catch (e) {
      throw new CloudCryptoError('worker_failed', e instanceof Error ? e.message : 'the KDF worker could not be started');
    }
  }
  if (!w) {
    const keys = await derivePasswordKeysChecked(password, salt, checked);
    if (signal?.aborted) throw new CloudCryptoError('cancelled');
    return keys;
  }
  const id = nextId++;
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = null;
  return new Promise<PasswordKeys>((resolve, reject) => {
    const onAbort = (): void => {
      if (!pending.delete(id)) return;
      // Nothing else waits: stop the work. Otherwise the answer is dropped when it comes.
      if (pending.size === 0) endWorker();
      reject(new CloudCryptoError('cancelled'));
    };
    const done = (): void => signal?.removeEventListener('abort', onAbort);
    pending.set(id, {
      resolve: (keys) => {
        done();
        resolve(keys);
      },
      reject: (err) => {
        done();
        reject(err);
      },
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    const req: KdfRequest = { id, password, salt, kdf: checked };
    w.postMessage(req);
  });
};

/** True while the KDF worker is alive (working, or idle and not yet ended). */
export function kdfWorkerAlive(): boolean {
  return worker !== null;
}

/** Ends the worker now; requests still waiting reject with `cancelled`. */
export function stopKdfWorker(): void {
  const waiting = [...pending.values()];
  pending.clear();
  endWorker();
  for (const p of waiting) p.reject(new CloudCryptoError('cancelled'));
}
