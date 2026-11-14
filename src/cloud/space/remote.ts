// The sync engine's `Remote` over fetch (stage 61 part C, ADR 0151 "What
// part C provides"; the contract is "// --- Sync" of shared/cloud/api.ts).
//
//   GET    /api/u/sync/changes?since=&limit=
//   PUT    /api/u/sync/items/<kind>/<id>   If-Match: <rev>, application/octet-stream
//   DELETE /api/u/sync/items/<kind>/<id>   If-Match: <rev>
//
// `X-WC: 1` on every write (the server's CSRF rule), same-origin
// credentials (the session cookie). `200`, `409` and `413` are results;
// the rest throws a `RemoteError` as tests/unit/cloud-sync-model.ts's
// `remoteFor` maps it: no answer → offline, `5xx`/`429` → server, `401
// {error: "session_ended", reason}` → session_ended, any other `401` →
// not_logged_in, anything else (and a body not the contract's) → refused.

import { SESSION_END_REASONS, type SessionEndReason, type SyncChanges, type SyncItem, type SyncKind, type SyncWritten } from '../../../shared/cloud/api.ts';
import { type FullReason, type Remote, RemoteError, type WriteResult } from '../sync/types';

/** A sync request gives up after this long (ms): then it is `offline`. */
export const SYNC_TIMEOUT_MS = 20_000;

export type SyncFetch = (url: string, init: RequestInit) => Promise<{ status: number; json(): Promise<unknown> }>;

const FULL: readonly string[] = ['item_too_large', 'storage_full', 'too_many_items'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function isItem(v: unknown): v is SyncItem {
  if (!isObj(v)) return false;
  return (
    typeof v.kind === 'string' &&
    typeof v.id === 'string' &&
    whole(v.rev) &&
    whole(v.seq) &&
    typeof v.deleted === 'boolean' &&
    whole(v.size) &&
    typeof v.updated === 'number' &&
    (v.blob === undefined || typeof v.blob === 'string')
  );
}

const isUsage = (v: unknown): boolean => isObj(v) && whole(v.items) && whole(v.itemBytes);

function isChanges(v: unknown): v is SyncChanges {
  return isObj(v) && Array.isArray(v.items) && v.items.every(isItem) && whole(v.cursor) && typeof v.more === 'boolean' && isUsage(v.usage) && isObj(v.limits);
}

const isWritten = (v: unknown): v is SyncWritten => isObj(v) && whole(v.rev) && whole(v.seq) && isUsage(v.usage);

export function fetchRemote(fetchFn: SyncFetch | undefined = globalThis.fetch?.bind(globalThis) as SyncFetch | undefined, timeoutMs = SYNC_TIMEOUT_MS): Remote {
  async function call(method: 'GET' | 'PUT' | 'DELETE', path: string, o: { rev?: number; body?: Uint8Array } = {}): Promise<{ status: number; data: unknown }> {
    if (!fetchFn) throw new RemoteError('offline');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (method !== 'GET') headers['X-WC'] = '1';
      if (o.rev !== undefined) headers['If-Match'] = String(o.rev);
      if (o.body) headers['Content-Type'] = 'application/octet-stream';
      const res = await fetchFn(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers,
        ...(o.body ? { body: o.body as BodyInit } : {}),
        signal: abort.signal,
      });
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        data = undefined;
      }
      return { status: res.status, data };
    } catch {
      throw new RemoteError('offline');
    } finally {
      clearTimeout(timer);
    }
  }

  /** Throws for every answer that is not a result. */
  function gate(status: number, data: unknown): void {
    if (status === 401) {
      const err = isObj(data) ? data.error : null;
      if (err === 'session_ended') {
        const reason = isObj(data) && (SESSION_END_REASONS as readonly unknown[]).includes(data.reason) ? (data.reason as SessionEndReason) : undefined;
        throw new RemoteError('session_ended', { status, ...(reason ? { reason } : {}) });
      }
      throw new RemoteError('not_logged_in', { status });
    }
    if (status >= 500 || status === 429) throw new RemoteError('server', { status });
  }

  function written(status: number, data: unknown): WriteResult {
    gate(status, data);
    if (status === 200 && isWritten(data)) return { status: 'ok', written: { rev: data.rev, seq: data.seq, usage: data.usage } };
    if (status === 409 && isObj(data) && data.error === 'conflict' && isItem(data.current)) return { status: 'conflict', current: data.current };
    if (status === 413 && isObj(data) && FULL.includes(data.error as string)) return { status: 'full', error: data.error as FullReason };
    throw new RemoteError('refused', { status });
  }

  const itemPath = (kind: SyncKind, id: string): string => `/api/u/sync/items/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`;

  return {
    async changes(since, limit) {
      const q = `since=${since}${limit !== undefined ? `&limit=${limit}` : ''}`;
      const { status, data } = await call('GET', `/api/u/sync/changes?${q}`);
      gate(status, data);
      if (status !== 200 || !isChanges(data)) throw new RemoteError('refused', { status });
      return data;
    },
    async put(kind, id, rev, blob) {
      const { status, data } = await call('PUT', itemPath(kind, id), { rev, body: blob });
      return written(status, data);
    },
    async remove(kind, id, rev) {
      const { status, data } = await call('DELETE', itemPath(kind, id), { rev });
      return written(status, data);
    },
  };
}
