// The run endpoints over fetch (stage 63, ADR 0153; the contract is "Runs
// in the cloud" of shared/cloud/api.ts), the queue's `RunRemote`:
//
//   PUT    /api/u/runs/<id>   application/octet-stream, the body a Blob (its size is the Content-Length)
//   GET    /api/u/runs/<id>   the body, read as a stream with progress
//   DELETE /api/u/runs/<id>
//   GET    /api/u/runs        the list
//
// `X-WC: 1` on every write, same-origin credentials. Errors map as the
// sync's `fetchRemote` (remote.ts): no answer → offline, `5xx`/`429` →
// server, `401 session_ended` → session_ended, any other `401` →
// not_logged_in, anything else (a `404` too: the flag `runs` off, or no
// such body) → refused with its status. `413` is a result of the PUT.
// Small calls give up after 20 s; a body's transfer gets that plus a time
// scaled to its size (at `MIN_BYTES_PER_SECOND`).

import { SESSION_END_REASONS, type RunBodyList, type RunBodyWritten, type SessionEndReason } from '../../../shared/cloud/api.ts';
import { RemoteError } from '../sync/types';
import type { RunPutResult, RunRemote } from '../runs/types';
import { SYNC_TIMEOUT_MS } from './remote';

/** The slowest line a transfer is given time for (bytes/s): 20 MB in some seven minutes. */
export const MIN_BYTES_PER_SECOND = 50_000;

/** What a run endpoint's answer is read as (the subset of `Response` used). */
export interface RunResponse {
  status: number;
  json(): Promise<unknown>;
  body: ReadableStream<Uint8Array> | null;
  blob(): Promise<Blob>;
}

export type RunFetch = (url: string, init: RequestInit) => Promise<RunResponse>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isUsage = (v: unknown): boolean => isObj(v) && whole(v.items) && whole(v.itemBytes) && (v.runBytes === undefined || whole(v.runBytes));
const isWritten = (v: unknown): v is RunBodyWritten => isObj(v) && whole(v.size) && isUsage(v.usage);
const isList = (v: unknown): v is RunBodyList =>
  isObj(v) &&
  Array.isArray(v.bodies) &&
  v.bodies.every((b) => isObj(b) && typeof b.id === 'string' && whole(b.size) && typeof b.created === 'number') &&
  isUsage(v.usage) &&
  isObj(v.limits);

/** The time a transfer of `bytes` is given (ms). */
export function transferTimeoutMs(bytes: number, base = SYNC_TIMEOUT_MS): number {
  return base + Math.ceil((Math.max(0, bytes) / MIN_BYTES_PER_SECOND) * 1000);
}

const runPath = (id: string): string => `/api/u/runs/${encodeURIComponent(id)}`;

export function fetchRunRemote(fetchFn: RunFetch | undefined = globalThis.fetch?.bind(globalThis) as RunFetch | undefined, timeoutMs = SYNC_TIMEOUT_MS): RunRemote {
  /** A request with a timer; `read` takes the answer apart before the timer ends. */
  async function call<T>(method: 'GET' | 'PUT' | 'DELETE', path: string, o: { body?: Blob; timeout?: number }, read: (res: RunResponse) => Promise<T>): Promise<T> {
    if (!fetchFn) throw new RemoteError('offline');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), o.timeout ?? timeoutMs);
    let res: RunResponse;
    try {
      const headers: Record<string, string> = { Accept: method === 'GET' && path !== '/api/u/runs' ? 'application/octet-stream' : 'application/json' };
      if (method !== 'GET') headers['X-WC'] = '1';
      if (o.body) headers['Content-Type'] = 'application/octet-stream';
      res = await fetchFn(path, { method, credentials: 'same-origin', cache: 'no-store', headers, ...(o.body ? { body: o.body } : {}), signal: abort.signal });
    } catch {
      clearTimeout(timer);
      throw new RemoteError('offline');
    }
    try {
      return await read(res);
    } catch (e) {
      if (e instanceof RemoteError) throw e;
      // The answer broke off (or the timer ended it).
      throw new RemoteError('offline');
    } finally {
      clearTimeout(timer);
    }
  }

  const json = async (res: RunResponse): Promise<unknown> => {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  };

  /** Throws for every answer that is not a result. */
  function gate(status: number, data: unknown): void {
    if (status === 401) {
      if (isObj(data) && data.error === 'session_ended') {
        const reason = (SESSION_END_REASONS as readonly unknown[]).includes(data.reason) ? (data.reason as SessionEndReason) : undefined;
        throw new RemoteError('session_ended', { status, ...(reason ? { reason } : {}) });
      }
      throw new RemoteError('not_logged_in', { status });
    }
    if (status >= 500 || status === 429) throw new RemoteError('server', { status });
  }

  return {
    put(id, body) {
      return call('PUT', runPath(id), { body, timeout: transferTimeoutMs(body.size, timeoutMs) }, async (res): Promise<RunPutResult> => {
        const data = await json(res);
        gate(res.status, data);
        if (res.status === 200 && isWritten(data)) return { status: 'ok', written: { size: data.size, usage: data.usage } };
        if (res.status === 413 && isObj(data)) {
          if (data.error === 'quota' && whole(data.used) && whole(data.limit) && whole(data.size)) return { status: 'quota', used: data.used, limit: data.limit, size: data.size };
          if (data.error === 'run_too_large' && whole(data.limit)) return { status: 'tooLarge', limit: data.limit };
        }
        throw new RemoteError('refused', { status: res.status });
      });
    },

    get(id, o = {}) {
      return call('GET', runPath(id), { timeout: transferTimeoutMs(o.size ?? 0, timeoutMs) }, async (res) => {
        if (res.status !== 200) {
          const data = await json(res);
          gate(res.status, data);
          throw new RemoteError('refused', { status: res.status });
        }
        if (!res.body) {
          const blob = await res.blob();
          o.onBytes?.(blob.size);
          return blob;
        }
        const reader = res.body.getReader();
        const parts: BlobPart[] = [];
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            parts.push(value as Uint8Array<ArrayBuffer>);
            o.onBytes?.(value.length);
          }
        } finally {
          reader.releaseLock();
        }
        return new Blob(parts, { type: 'application/octet-stream' });
      });
    },

    remove(id) {
      return call('DELETE', runPath(id), {}, async (res) => {
        const data = await json(res);
        gate(res.status, data);
        if (res.status === 200 && isWritten(data)) return { size: data.size, usage: data.usage };
        throw new RemoteError('refused', { status: res.status });
      });
    },

    list() {
      return call('GET', '/api/u/runs', {}, async (res) => {
        const data = await json(res);
        gate(res.status, data);
        if (res.status === 200 && isList(data)) return data;
        throw new RemoteError('refused', { status: res.status });
      });
    },
  };
}
