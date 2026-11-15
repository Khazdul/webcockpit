// Stage 63 (ADR 0153): the run endpoints over fetch (src/cloud/space/
// run-remote.ts) against the contract, and through it the queue against the model.

import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ACCOUNT_LIMITS } from '../../shared/cloud/api.ts';
import { fetchRunRemote, transferTimeoutMs, type RunFetch, type RunResponse } from '../../src/cloud/space/run-remote';
import { RemoteError } from '../../src/cloud/sync/types';
import { ServerModel } from './cloud-sync-model';

interface Call {
  url: string;
  init: RequestInit;
}

function answer(status: number, data?: unknown, bytes?: Uint8Array, pieces = 1): RunResponse {
  const body =
    bytes === undefined
      ? null
      : new ReadableStream<Uint8Array>({
          start(c) {
            const n = Math.ceil(bytes.length / pieces);
            for (let i = 0; i < bytes.length; i += n) c.enqueue(bytes.slice(i, i + n));
            c.close();
          },
        });
  return {
    status,
    json: async () => {
      if (data === undefined) throw new Error('no json');
      return structuredClone(data);
    },
    body,
    blob: async () => new Blob(bytes ? [bytes as Uint8Array<ArrayBuffer>] : []),
  };
}

function fake(reply: (c: Call) => RunResponse | Promise<RunResponse>): { fetch: RunFetch; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      const c = { url, init };
      calls.push(c);
      return reply(c);
    },
  };
}

/** The model behind fetch, as a Worker would answer. */
function modelFetch(server: ServerModel): RunFetch {
  return async (url, init) => {
    const m = /^\/api\/u\/runs(?:\/([^/]+))?$/.exec(url);
    if (!m) return answer(404, { error: 'not_found' });
    const id = m[1] ? decodeURIComponent(m[1]) : undefined;
    if (!id) {
      const a = server.listBodies();
      return answer(a.status, a.body);
    }
    if (init.method === 'PUT') {
      const bytes = new Uint8Array(await (init.body as Blob).arrayBuffer());
      const a = await server.putBody(id, bytes);
      return answer(a.status, a.body);
    }
    if (init.method === 'DELETE') {
      const a = server.removeBody(id);
      return answer(a.status, a.body);
    }
    const a = server.getBody(id);
    return a.status === 200 ? answer(200, undefined, a.body as Uint8Array, 3) : answer(a.status, a.body);
  };
}

const ID = 'A'.repeat(22);
const usage = { items: 1, itemBytes: 10, runBytes: 100 };

async function kind(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof RemoteError) return `${e.kind}${e.status !== null ? ` ${e.status}` : ''}${e.reason ? ` ${e.reason}` : ''}`;
    throw e;
  }
  return 'ok';
}

describe('the run endpoints over fetch', () => {
  it('PUT sends the Blob with the headers and reads the answers of the contract', async () => {
    const { fetch, calls } = fake(() => answer(200, { size: 5, usage }));
    const r = fetchRunRemote(fetch);
    const body = new Blob([new Uint8Array(5)]);
    expect(await r.put(ID, body)).toEqual({ status: 'ok', written: { size: 5, usage } });
    expect(calls[0]!.url).toBe(`/api/u/runs/${ID}`);
    expect(calls[0]!.init).toMatchObject({ method: 'PUT', credentials: 'same-origin', cache: 'no-store', body });
    expect(calls[0]!.init.headers).toMatchObject({ 'X-WC': '1', 'Content-Type': 'application/octet-stream' });
    const q = fetchRunRemote(fake(() => answer(413, { error: 'quota', used: 9, limit: 10, size: 5 })).fetch);
    expect(await q.put(ID, body)).toEqual({ status: 'quota', used: 9, limit: 10, size: 5 });
    const t = fetchRunRemote(fake(() => answer(413, { error: 'run_too_large', limit: 3 })).fetch);
    expect(await t.put(ID, body)).toEqual({ status: 'tooLarge', limit: 3 });
  });

  it('maps everything else as the sync Remote does', async () => {
    const cases: [RunResponse | 'throw', string][] = [
      ['throw', 'offline'],
      [answer(503, { error: 'x' }), 'server 503'],
      [answer(429), 'server 429'],
      [answer(401, { error: 'session_ended', reason: 'logout' }), 'session_ended 401 logout'],
      [answer(401, { error: 'unauthorized' }), 'not_logged_in 401'],
      [answer(404, { error: 'not_found' }), 'refused 404'],
      [answer(411, { error: 'length_required' }), 'refused 411'],
      [answer(413, { error: 'quota' }), 'refused 413'],
      [answer(200, { size: -1, usage }), 'refused 200'],
      [answer(200), 'refused 200'],
    ];
    for (const [res, want] of cases) {
      const r = fetchRunRemote(fake(() => (res === 'throw' ? Promise.reject(new TypeError('net')) : res)).fetch);
      expect(await kind(r.put(ID, new Blob(['x']))), want).toBe(want);
    }
    expect(await kind(fetchRunRemote(undefined).list())).toBe('offline');
  });

  it('GET streams the body with progress; a 404 is refused 404; a body cut off is offline', async () => {
    const bytes = new Uint8Array(10_000).map((_, i) => i % 251);
    const { fetch, calls } = fake(() => answer(200, undefined, bytes, 4));
    const seen: number[] = [];
    const blob = await fetchRunRemote(fetch).get(ID, { size: bytes.length, onBytes: (n) => seen.push(n) });
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(seen).toHaveLength(4);
    expect(seen.reduce((a, b) => a + b, 0)).toBe(bytes.length);
    expect(calls[0]!.init.method).toBe('GET');
    expect(calls[0]!.init.headers).not.toHaveProperty('X-WC');
    expect(await kind(fetchRunRemote(fake(() => answer(404, { error: 'not_found' })).fetch).get(ID))).toBe('refused 404');
    const broken: RunResponse = {
      ...answer(200),
      body: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(3));
          c.error(new TypeError('reset'));
        },
      }),
    };
    expect(await kind(fetchRunRemote(fake(() => broken).fetch).get(ID))).toBe('offline');
  });

  it('DELETE and the list', async () => {
    const list = { bodies: [{ id: ID, size: 5, created: 1 }], usage, limits: DEFAULT_ACCOUNT_LIMITS };
    const { fetch, calls } = fake((c) => (c.init.method === 'DELETE' ? answer(200, { size: 0, usage }) : answer(200, list)));
    const r = fetchRunRemote(fetch);
    expect(await r.remove(ID)).toEqual({ size: 0, usage });
    expect(calls[0]!.init).toMatchObject({ method: 'DELETE' });
    expect(calls[0]!.init.headers).toMatchObject({ 'X-WC': '1' });
    expect(await r.list()).toEqual(list);
    expect(calls[1]!.url).toBe('/api/u/runs');
    expect(await kind(fetchRunRemote(fake(() => answer(200, { bodies: 'x', usage, limits: {} })).fetch).list())).toBe('refused 200');
  });

  it('gives a small call 20 s, a transfer more by its size', async () => {
    expect(transferTimeoutMs(0)).toBe(20_000);
    expect(transferTimeoutMs(20 * 1024 * 1024)).toBeGreaterThan(400_000);
    vi.useFakeTimers();
    try {
      const { fetch } = fake(
        (c) =>
          new Promise((_, reject) => {
            c.init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      const r = fetchRunRemote(fetch);
      const small = kind(r.list());
      const big = kind(r.put(ID, new Blob([new Uint8Array(1_000_000)])));
      let bigDone = false;
      void big.then(() => (bigDone = true));
      await vi.advanceTimersByTimeAsync(20_001);
      expect(await small).toBe('offline');
      expect(bigDone).toBe(false);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await big).toBe('offline');
    } finally {
      vi.useRealTimers();
    }
  });

  it('against the model: put, get, list, delete', async () => {
    const server = new ServerModel().enableRuns();
    const r = fetchRunRemote(modelFetch(server));
    const bytes = new Uint8Array(3000).fill(7);
    expect(await r.put(ID, new Blob([bytes]))).toMatchObject({ status: 'ok', written: { size: 3000, usage: { runBytes: 3000 } } });
    expect(new Uint8Array(await (await r.get(ID)).arrayBuffer())).toEqual(bytes);
    expect((await r.list()).bodies).toMatchObject([{ id: ID, size: 3000 }]);
    server.limits = { ...DEFAULT_ACCOUNT_LIMITS, runBytes: 4000 };
    expect(await r.put('B'.repeat(22), new Blob([bytes]))).toEqual({ status: 'quota', used: 3000, limit: 4000, size: 3000 });
    expect(await r.remove(ID)).toMatchObject({ usage: { runBytes: 0 } });
    expect(await kind(r.get(ID))).toBe('refused 404');
    expect(await kind(fetchRunRemote(modelFetch(new ServerModel())).list())).toBe('refused 404');
  });
});
