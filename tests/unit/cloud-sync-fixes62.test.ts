// Stage 62's review findings, each with its regression test (ADR 0152,
// "As built (stage 62, review fixes)"): one `describe` per finding.
// IndexedDB is fake-indexeddb; the server is the model of
// tests/unit/cloud-sync-model.ts.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveKeys, makeRoot } from '../../src/cloud/crypto';
import { resetSpaceConnsForTests } from '../../src/cloud/space/spaces';
import type { SyncKeys } from '../../src/cloud/sync/types';
import { resetSyncViewForTests } from '../../src/cloud/sync-view';
import { resetSpaceForTests } from '../../src/core/space';
import type { Answer, ServerModel } from './cloud-sync-model';
import type { SyncFetch } from '../../src/cloud/space/remote';

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

export function modelFetch(server: ServerModel): SyncFetch {
  return async (url, init) => {
    const u = new URL(url, 'https://wc.test');
    const method = init.method ?? 'GET';
    const h = (init.headers ?? {}) as Record<string, string>;
    let a: Answer;
    if (u.pathname === '/api/u/sync/changes') {
      const limit = u.searchParams.get('limit');
      a = server.changes(Number(u.searchParams.get('since')), limit === null ? undefined : Number(limit));
    } else {
      const [kind, id] = u.pathname.slice('/api/u/sync/items/'.length).split('/').map(decodeURIComponent);
      if (method === 'PUT') a = server.put(kind!, id!, Number(h['If-Match']), init.body as Uint8Array);
      else a = server.remove(kind!, id!, Number(h['If-Match']));
    }
    return { status: a.status, json: async () => (a.body === undefined ? Promise.reject(new SyntaxError('none')) : structuredClone(a.body)) };
  };
}

let keys: SyncKeys;

beforeEach(async () => {
  vi.stubGlobal('localStorage', memStorage());
  vi.stubGlobal('sessionStorage', memStorage());
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  resetSpaceForTests();
  resetSpaceConnsForTests();
  resetSyncViewForTests();
  keys ??= await deriveKeys(makeRoot());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSpaceForTests();
  resetSpaceConnsForTests();
});

const SRC = resolve(dirname(new URL(import.meta.url).pathname), '../../src');

/** The modules `file` imports (relative specifiers resolved), transitively, within src. */
function importGraph(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/^\s*(?:import|export)\s[^'";]*?from\s+'(\.[^']+)'/gm)) {
    if (/^\s*import\s+type\s/.test(m[0]) || /^\s*export\s+type\s/.test(m[0])) continue;
    let p = resolve(dirname(file), m[1]!);
    if (!/\.tsx?$/.test(p)) p = readable(`${p}.ts`) ?? readable(`${p}.tsx`) ?? readable(`${p}/index.ts`) ?? p;
    if (p.startsWith(SRC)) importGraph(p, seen);
  }
  return seen;
}
function readable(p: string): string | null {
  try {
    readFileSync(p);
    return p;
  } catch {
    return null;
  }
}

describe('F5: the Comm archive does not pull the sync into a guest', () => {
  it('src/gmcp/comm-archive.ts imports nothing under src/cloud (canonicalJson and the record rules live outside it)', () => {
    const graph = [...importGraph(resolve(SRC, 'gmcp/comm-archive.ts'))].map((f) => f.slice(SRC.length + 1));
    expect(graph.filter((f) => f.startsWith('cloud/'))).toEqual([]);
    expect(graph).toContain('core/canonical-json.ts');
    expect(graph).toContain('gmcp/comm-records.ts');
  });

  it('one copy of the record rules: the sync re-exports the archive side', async () => {
    const items = await import('../../src/cloud/sync/items');
    const rec = await import('../../src/gmcp/comm-records');
    const cj = await import('../../src/core/canonical-json');
    expect(items.canonicalJson).toBe(cj.canonicalJson);
    expect(items.commIdentity).toBe(rec.commIdentity);
    expect(items.sortCommRecords).toBe(rec.sortCommRecords);
    expect(items.utcDay).toBe(rec.utcDay);
  });
});
