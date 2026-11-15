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

describe('F2: numbers that are not finite and holes never stop the sync', () => {
  it('the store API refuses math.huge and 0/0 anywhere in a value (finiteValue)', async () => {
    const { finiteValue } = await import('../../src/scripts/host');
    expect(finiteValue(1)).toBe(true);
    expect(finiteValue({ a: [1, 'x', { b: true }] })).toBe(true);
    expect(finiteValue(Infinity)).toBe(false);
    expect(finiteValue({ a: [1, { b: NaN }] })).toBe(false);
  });

  it('the scriptData adapter lists stored values that are not JSON as null (jsonSafe)', async () => {
    const { jsonSafe, canonicalJson } = await import('../../src/core/canonical-json');
    expect(jsonSafe({ a: NaN, b: [1, undefined, Infinity], c: undefined, d: { e: -Infinity } })).toEqual({ a: null, b: [1, null, null], d: { e: null } });
    const { prepareAccountSpace } = await import('../../src/cloud/space/spaces');
    const { idbLocalItems } = await import('../../src/cloud/space/local');
    const { itemHashes, ITEM_SPECS } = await import('../../src/cloud/sync/items');
    const { STORE, idbDone } = await import('../../src/core/db');
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'd', copy: 'all' });
    const db = await open();
    const t = db.transaction(STORE.scriptData, 'readwrite');
    const done = idbDone(t);
    // eslint-disable-next-line no-sparse-arrays
    t.objectStore(STORE.scriptData).put({ name: 'hunt', settings: {}, store: { big: Infinity, list: [1, , 3], nan: NaN } });
    await done;
    const [item] = await idbLocalItems(open, {}, { type: 'desktop' }).list('scriptData');
    expect(item!.body).toEqual({ name: 'hunt', settings: {}, store: { big: null, list: [1, null, 3], nan: null } });
    expect(() => canonicalJson(item!.body)).not.toThrow();
    await expect(itemHashes(ITEM_SPECS.scriptData, item!.body)).resolves.toBeTruthy();
  });

  it('the engine skips a body it cannot hash (an event) and syncs the rest', async () => {
    const { Device, ServerModel } = await import('./cloud-sync-model');
    const server = new ServerModel();
    const clock = { now: () => Date.UTC(2026, 10, 15, 12) };
    const a = new Device(server, keys, 'desktop', clock);
    const b = new Device(server, keys, 'phone', clock);
    a.local.set('profile', { id: 'p1', name: 'warrior', text: 't', created: 1, modified: 1 });
    a.local.set('scriptData', { name: 'bad', settings: {}, store: { x: NaN } });
    a.local.set('scriptData', { name: 'good', settings: {}, store: { x: 1 } });
    expect(await a.sync()).toEqual({ type: 'synced' });
    expect(a.events).toContainEqual({ type: 'unencodable', kind: 'scriptData', key: 'bad' });
    expect(a.engine.status.get().waiting).toBe(1);
    expect(await a.engine.unsynced()).toEqual([{ kind: 'scriptData', key: 'bad', name: null, change: 'new' }]);
    await b.sync();
    expect(b.list('profile').map((x) => x.name)).toEqual(['warrior']);
    expect(b.list('scriptData').map((x) => x.name)).toEqual(['good']);
    // Once fixed, it goes up as any change.
    a.local.set('scriptData', { name: 'bad', settings: {}, store: { x: 2 } });
    await a.sync();
    await b.sync();
    expect(b.list('scriptData').map((x) => x.name)).toEqual(['bad', 'good']);
  });

  it('an item already in the account whose body turns bad is left alone, not deleted', async () => {
    const { Device, ServerModel } = await import('./cloud-sync-model');
    const server = new ServerModel();
    const clock = { now: () => Date.UTC(2026, 10, 15, 12) };
    const a = new Device(server, keys, 'desktop', clock);
    const b = new Device(server, keys, 'phone', clock);
    a.local.set('scriptData', { name: 'hunt', settings: {}, store: { x: 1 } });
    await a.sync();
    await b.sync();
    a.local.set('scriptData', { name: 'hunt', settings: {}, store: { x: NaN } });
    expect(await a.sync()).toEqual({ type: 'synced' });
    expect(server.all().filter((x) => x.kind === 'scriptData' && !x.deleted)).toHaveLength(1);
    await b.sync();
    expect(b.list('scriptData')).toEqual([{ name: 'hunt', settings: {}, store: { x: 1 } }]);
  });
});
