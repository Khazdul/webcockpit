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

// --- Helpers over the IndexedDB adapters ---

import { COMM_LIST_MS, COMM_PIECE_RAW, META, type OpenDb, commDayKept, commPieces, idbLocalItems, idbSyncRecords, readMeta, settleSettingsSeed } from '../../src/cloud/space/local';
import { prepareAccountSpace } from '../../src/cloud/space/spaces';
import { fetchRemote } from '../../src/cloud/space/remote';
import { SyncEngine } from '../../src/cloud/sync/engine';
import { SYNC_SPECS } from '../../src/cloud/sync/items';
import type { CommItem, LocalBatch, SettingsItem } from '../../src/cloud/sync/types';
import { STORE, idbDone, idbRequest, openDeviceDb, openWebcockpitDb } from '../../src/core/db';
import { CommArchive } from '../../src/gmcp/comm-archive';
import { SettingsStore } from '../../src/settings/store';
import { ServerModel as Server } from './cloud-sync-model';

async function put(db: IDBDatabase, store: string, ...recs: [unknown, IDBValidKey?][]): Promise<void> {
  const t = db.transaction(store, 'readwrite');
  const done = idbDone(t);
  for (const [r, k] of recs) t.objectStore(store).put(r, k);
  await done;
}

async function get(db: IDBDatabase, store: string, key: IDBValidKey): Promise<unknown> {
  const t = db.transaction(store, 'readonly');
  const done = idbDone(t);
  const r = await idbRequest(t.objectStore(store).get(key));
  await done;
  return r;
}

const settings = (size: number, profile = 'default'): Record<string, unknown> => ({ version: 1, profile, appearance: { size } });
const NOW = Date.UTC(2026, 10, 15, 12);
const DAY = 86_400_000;
const msg = (ts: number, text: string, character = 'Rasta') => ({ character, ts, channel: 'tells', talker: 'Bob', talkerType: null, destination: null, text });
const texts = (items: { body: unknown }[]): string[] => items.flatMap((i) => (i.body as unknown as CommItem).records.map((r) => r.text));

/** A second device's space database on its own factory. */
function deviceSpace(factory: IDBFactory): OpenDb {
  let p: Promise<IDBDatabase> | null = null;
  return () => (p ??= openWebcockpitDb(factory, 'webcockpit-u-ole', { create: true }));
}

function engineOn(server: Server, open: OpenDb, o: { written?: (...a: unknown[]) => void; inUse?: Set<string> } = {}): SyncEngine {
  return new SyncEngine({
    local: idbLocalItems(open, { written: o.written }, { type: 'desktop', now: () => Date.now() }),
    records: idbSyncRecords(open, () => 'desktop, Firefox'),
    remote: fetchRemote(modelFetch(server)),
    keys,
    specs: SYNC_SPECS,
    yieldToGame: async () => {},
    inUse: { keys: (kind) => (kind === 'settings' && o.inUse ? o.inUse : new Set()) },
  });
}

describe('F1: a login seed gives way to the account settings, changed or not', () => {
  it('the shell changed the copy before the first pull: the account keeps its settings and they are taken', async () => {
    const server = new Server();
    const aOpen = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'desktop, Chrome', copy: 'all' });
    await put(await aOpen(), STORE.settings, [settings(20, 'warrior'), 'main']);
    expect(await engineOn(server, aOpen).sync()).toEqual({ type: 'synced' });
    const rev = server.all().find((x) => x.kind === 'settings')!.rev;
    // Device B logs in: its own settings copied as the seed; at boot the shell writes `profile: default` into them.
    const dev = await openDeviceDb();
    await put(dev, STORE.settings, [settings(9, 'gone'), 'main']);
    dev.close();
    const bOpen = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'desktop, Firefox' });
    await put(await bOpen(), STORE.settings, [settings(9, 'default'), 'main']);
    const written = vi.fn();
    expect(await engineOn(server, bOpen, { written }).sync()).toEqual({ type: 'synced' });
    expect(await get(await bOpen(), STORE.settings, 'main')).toEqual(settings(20, 'warrior'));
    expect(written).toHaveBeenCalledWith('settings', undefined, expect.objectContaining({ seedRecord: settings(20, 'warrior') }));
    expect(server.all().find((x) => x.kind === 'settings')!.rev).toBe(rev);
    expect(await settleSettingsSeed(bOpen, 'desktop')).toBe(false);
    expect((await readMeta(bOpen, [META.settingsSeed]))[META.settingsSeed]).toBeUndefined();
  });

  it('an account with none of this type: the copy, changes included, is pushed once the first pull is done', async () => {
    const server = new Server();
    const dev = await openDeviceDb();
    await put(dev, STORE.settings, [settings(9), 'main']);
    dev.close();
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'desktop, Firefox' });
    await put(await open(), STORE.settings, [settings(10), 'main']);
    const e = engineOn(server, open);
    expect(await e.sync()).toEqual({ type: 'synced' });
    expect(server.all().filter((x) => x.kind === 'settings')).toHaveLength(0);
    expect(await settleSettingsSeed(open, 'desktop')).toBe(true);
    await e.sync();
    expect(server.all().filter((x) => x.kind === 'settings')).toHaveLength(1);
    expect(await e.unsynced()).toEqual([]);
  });

  it('reload({ force, record }) drops a change not saved and puts the record back over a write of its own', async () => {
    const store = new SettingsStore({ storage: null, win: null, debounceMs: 200 });
    await store.load();
    store.update({ appearance: { size: 30 } });
    // The sync wrote the account's record; then the store's own write landed over it.
    const db = await openDeviceDb();
    await put(db, STORE.settings, [settings(20, 'warrior'), 'main']);
    await store.flush();
    expect(await get(db, STORE.settings, 'main')).toMatchObject({ appearance: { size: 30 } });
    store.update({ appearance: { size: 31 } }); // and a change not saved yet
    expect(await store.reload({ force: true, record: settings(20, 'warrior') })).toBe('applied');
    expect(store.get().appearance.size).toBe(20);
    expect(store.get().profile).toBe('warrior');
    expect(await get(db, STORE.settings, 'main')).toEqual(settings(20, 'warrior'));
    // Nothing left to save over it.
    await new Promise((r) => setTimeout(r, 300));
    expect(await get(db, STORE.settings, 'main')).toEqual(settings(20, 'warrior'));
    db.close();
    await store.dispose();
  });

  it('the page applies a seed record with force', async () => {
    const { applyWritten } = await import('../../src/cloud/space/notify');
    const reload = vi.fn(async () => 'applied' as const);
    await applyWritten({ profiles: {} as never, settings: { reload } as never }, { kind: 'settings', settings: { from: 'x', seedRecord: { version: 1 } } });
    expect(reload).toHaveBeenCalledWith({ force: true, record: { version: 1 } });
  });
});

describe('F3: a remove of a split day takes exactly the removed pieces', () => {
  const day = '2026-11-15';
  const setup = async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    await new CommArchive(await open(), { now: () => NOW }).addDayRecords(Array.from({ length: 9 }, (_, i) => msg(NOW - 10_000 + i, `m${i}`)));
    return open;
  };

  it('two pieces of one day in one batch', async () => {
    const open = await setup();
    const li = idbLocalItems(open, {}, { type: 'desktop', now: () => NOW, commPieceMax: 400, yieldToGame: async () => {} });
    const listed = await li.list('comm');
    expect(listed.map((i) => i.key)).toEqual([day, `${day}.2`, `${day}.3`]);
    const first = texts(listed.slice(0, 1));
    await li.write('comm', { put: [], remove: [`${day}.2`, `${day}.3`] });
    expect(texts(await li.list('comm'))).toEqual(first);
  });

  it('a remove of `day` with nothing listed resolves the pieces from a fresh read: only the first goes', async () => {
    const open = await setup();
    const o = { type: 'desktop' as const, now: () => NOW, commPieceMax: 400, yieldToGame: async () => {} };
    const listed = await idbLocalItems(open, {}, o).list('comm');
    const rest = texts(listed.slice(1));
    await idbLocalItems(open, {}, o).write('comm', { put: [], remove: [day] });
    expect(texts(await idbLocalItems(open, {}, o).list('comm'))).toEqual(rest);
  });

  it('a message written after the list stays when its day is removed', async () => {
    const open = await setup();
    const li = idbLocalItems(open, {}, { type: 'desktop', now: () => NOW, yieldToGame: async () => {} });
    await li.list('comm');
    await new CommArchive(await open(), { now: () => NOW }).append(msg(NOW - 1, 'late'));
    await li.write('comm', { put: [], remove: [day] });
    expect(texts(await li.list('comm'))).toEqual(['late']);
  });
});

describe('F4: pieces of 1 MB, stable as the day grows', () => {
  it('splits at 1 MB of JSON', () => {
    expect(COMM_PIECE_RAW).toBe(1024 * 1024);
    const big = 'x'.repeat(1000);
    const recs = Array.from({ length: 2100 }, (_, i) => msg(1000 + i, `${i} ${big}`));
    const pieces = commPieces('2026-11-15', recs);
    expect(pieces).toHaveLength(3);
    for (const p of pieces) expect(JSON.stringify(p.records).length).toBeLessThanOrEqual(COMM_PIECE_RAW + 2);
  });

  it('a message at the end leaves the earlier pieces as they were, the same objects (cached, hashed once)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const arch = new CommArchive(await open(), { now: () => NOW });
    await arch.addDayRecords(Array.from({ length: 9 }, (_, i) => msg(NOW - 10_000 + i, `m${i}`)));
    const o = { type: 'desktop' as const, now: () => NOW, commPieceMax: 400, yieldToGame: async () => {} };
    const li = idbLocalItems(open, {}, o);
    const before = await li.list('comm');
    await arch.append(msg(NOW - 100, 'new'));
    const after = await li.list('comm');
    for (let i = 0; i < before.length - 1; i++) expect(after[i]!.body).toBe(before[i]!.body);
    // The same as a day read again from scratch.
    const fresh = await idbLocalItems(await (async () => open)(), {}, { ...o, commPieceMax: 401 }).list('comm');
    expect(after.map((i) => i.body)).toEqual(commPieces('2026-11-15', fresh.flatMap((i) => (i.body as unknown as CommItem).records), 400));
    // A pulled record in the middle: the day is read again, in order.
    await li.write('comm', { put: [{ day: '2026-11-15', records: [msg(NOW - 10_000 + 3.5, 'mid')] }], remove: [] });
    const mid = await li.list('comm');
    expect(texts(mid)).toEqual(['m0', 'm1', 'm2', 'm3', 'mid', 'm4', 'm5', 'm6', 'm7', 'm8', 'new']);
    expect(mid.map((i) => i.body)).toEqual(commPieces('2026-11-15', mid.flatMap((i) => (i.body as unknown as CommItem).records), 400));
  });
});

describe('F6: the write says a settings version was held for the game', () => {
  it('the engine marks the record held for in use, and its later write carries held', async () => {
    const server = new Server();
    const aOpen = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'a', copy: 'all' });
    await put(await aOpen(), STORE.settings, [settings(20), 'main']);
    const a = engineOn(server, aOpen);
    await a.sync();
    const bOpen = deviceSpace(new IDBFactory());
    await put(await bOpen(), STORE.settings, [settings(20), 'main']);
    const playing = new Set(['desktop']);
    const written = vi.fn();
    const b = engineOn(server, bOpen, { written, inUse: playing });
    await b.sync();
    // A changes them while B plays: B holds them.
    await put(await aOpen(), STORE.settings, [settings(21), 'main']);
    await a.sync();
    written.mockClear();
    await b.sync();
    expect(written).not.toHaveBeenCalledWith('settings', undefined, expect.anything());
    expect(await get(await bOpen(), STORE.settings, 'main')).toEqual(settings(20));
    // The game ends.
    playing.clear();
    await b.sync();
    expect(written).toHaveBeenCalledWith('settings', undefined, expect.objectContaining({ held: true }));
    expect(await get(await bOpen(), STORE.settings, 'main')).toEqual(settings(21));
    // A change taken off play says nothing of the kind.
    await put(await aOpen(), STORE.settings, [settings(22), 'main']);
    await a.sync();
    written.mockClear();
    await b.sync();
    expect(written).toHaveBeenCalledWith('settings', undefined, { from: 'a' });
  });

  it('the runtime keeps no page-wide flag: the hook carries it', () => {
    const src = readFileSync(resolve(SRC, 'cloud/space/runtime.ts'), 'utf8');
    expect(src).not.toMatch(/heldSettings/);
  });
});

describe('F7: playing follows the game lock, not the start page animation', () => {
  it('the shell sets playing where it takes and lets go of the game lock; the start page does not', () => {
    const shell = readFileSync(resolve(SRC, 'app/shell.ts'), 'utf8');
    const show = shell.slice(shell.indexOf('  private showCockpit('), shell.indexOf('  private markPhoneGame('));
    expect(show).toMatch(/holdGameLock\(\);\s*\/\/[^\n]*\n\s*setPlaying\(true\)/);
    const start = shell.slice(shell.indexOf('  private showStart('), shell.indexOf('  private showCockpit('));
    expect(start).toMatch(/this\.releaseGame = null;[\s\S]*setPlaying\(false\)/);
    const chrome = readFileSync(resolve(SRC, 'chrome/index.tsx'), 'utf8');
    expect(chrome).not.toMatch(/setPlaying/);
  });

  it('the sync view and the shell share one flag (src/core/playing.ts)', async () => {
    const view = await import('../../src/cloud/sync-view');
    const core = await import('../../src/core/playing');
    const seen: boolean[] = [];
    const off = view.onPlaying((on) => seen.push(on));
    core.setPlaying(true);
    expect(view.isPlaying()).toBe(true);
    core.setPlaying(false);
    off();
    expect(seen).toEqual([true, false]);
  });
});

describe('F8: little work during play', () => {
  it('settings writes in play wait for the play schedule; visibility syncs in play only when hidden, off play only when visible', async () => {
    const { writeSpaceRecord } = await import('../../src/core/space');
    const { noteStored } = await import('../../src/core/store-events');
    const { setPlaying } = await import('../../src/core/playing');
    const { PageSync } = await import('../../src/cloud/space/runtime');
    writeSpaceRecord({ nameKey: 'ole', state: 'open' });
    resetSpaceForTests();
    await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const sync = vi.spyOn(SyncEngine.prototype, 'sync').mockResolvedValue({ type: 'busy', retryAt: Date.now() + 3_600_000 });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('document', doc);
    const host = { profiles: { get: async () => null }, settings: { get: () => ({ profile: 'default' }), reload: async () => 'same' } };
    const ps = new PageSync(host as never, 'ole', 'Ole', keys).start();
    await vi.advanceTimersByTimeAsync(10);
    const n0 = sync.mock.calls.length;
    setPlaying(true);
    noteStored('settings');
    await vi.advanceTimersByTimeAsync(6000);
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10);
    expect(sync.mock.calls.length).toBe(n0);
    setPlaying(false);
    for (let i = 0; i < 50 && sync.mock.calls.length < n0 + 1; i++) await new Promise((r) => setImmediate(r));
    expect(sync.mock.calls.length).toBe(n0 + 1);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10);
    expect(sync.mock.calls.length).toBe(n0 + 1);
    noteStored('settings');
    await vi.advanceTimersByTimeAsync(6000);
    expect(sync.mock.calls.length).toBe(n0 + 2);
    ps.stop();
  });

  it('commDays counts with a key cursor (no record read)', async () => {
    const { IDBIndex } = await import('fake-indexeddb');
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const arch = new CommArchive(await open(), { now: () => NOW });
    await arch.addDayRecords([msg(NOW - 1000, 'a'), msg(NOW - 2000, 'b'), msg(NOW - DAY, 'c')]);
    const cursor = vi.spyOn(IDBIndex.prototype, 'openCursor');
    const keyCursor = vi.spyOn(IDBIndex.prototype, 'openKeyCursor');
    const days = await arch.commDays();
    expect(days.map((d) => [d.day, d.count])).toEqual([
      ['2026-11-14', 1],
      ['2026-11-15', 2],
    ]);
    expect(days.map((d) => d.maxSeq)).toEqual([3, 2]);
    expect(cursor).not.toHaveBeenCalled();
    expect(keyCursor).toHaveBeenCalledTimes(1);
  });

  it('adapters on one space share the Comm cache: Log out and the counts read no day again', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    await new CommArchive(await open(), { now: () => NOW }).addDayRecords([msg(NOW - 1000, 'a'), msg(NOW - DAY, 'b')]);
    const o = { type: 'desktop' as const, now: () => NOW, yieldToGame: async () => {} };
    const first = await idbLocalItems(open, {}, o).list('comm');
    const read = vi.spyOn(CommArchive.prototype, 'dayRecords');
    const second = await idbLocalItems(open, {}, o).list('comm');
    expect(read).not.toHaveBeenCalled();
    second.forEach((it, i) => expect(it.body).toBe(first[i]!.body));
    const { pendingChanges } = await import('../../src/cloud/space/spaces');
    await pendingChanges(idbLocalItems(open, {}, o), idbSyncRecords(open, () => 'x'));
    expect(read).not.toHaveBeenCalled();
  });

  it('the Comm list yields to the game after each day it reads', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    await new CommArchive(await open(), { now: () => NOW }).addDayRecords([msg(NOW - 1000, 'a'), msg(NOW - DAY, 'b'), msg(NOW - 2 * DAY, 'c')]);
    const yieldToGame = vi.fn(async () => {});
    const li = idbLocalItems(open, {}, { type: 'desktop', now: () => NOW, yieldToGame });
    await li.list('comm');
    expect(yieldToGame).toHaveBeenCalledTimes(3);
    await li.list('comm');
    expect(yieldToGame).toHaveBeenCalledTimes(3);
  });

  it('the runtime builds no adapter of its own beside the engine', () => {
    const src = readFileSync(resolve(SRC, 'cloud/space/runtime.ts'), 'utf8');
    expect(src.match(/idbLocalItems\(/g)).toHaveLength(1);
  });
});

describe('F9: a Comm day is listed until all its records are past seven days, with a margin', () => {
  it('commDayKept: the day start within 8 days 6 hours (and the model agrees)', async () => {
    const { commDayKept: modelKept } = await import('./cloud-sync-model');
    expect(COMM_LIST_MS).toBe((8 * 24 + 6) * 3600_000);
    const start = Date.UTC(2026, 10, 7);
    for (const kept of [commDayKept, modelKept]) {
      expect(kept('2026-11-07', start + 7 * DAY + 23 * 3600_000)).toBe(true); // its last records are still kept
      expect(kept('2026-11-07', start + COMM_LIST_MS)).toBe(true);
      expect(kept('2026-11-07', start + COMM_LIST_MS + 1)).toBe(false);
      expect(kept('2026-11-07.2', start + COMM_LIST_MS + 1)).toBe(false);
    }
  });

  it('a day past seven days is still listed with all its records, and a pulled piece of it is taken', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const day = '2026-11-07'; // starts 8 d 12 h before NOW: not listed
    const kept = '2026-11-08'; // starts 7 d 12 h before NOW
    const start = Date.UTC(2026, 10, 8);
    const arch = new CommArchive(await open(), { now: () => start + DAY });
    await arch.addDayRecords([msg(start + 1000, 'early'), msg(start + 20 * 3600_000, 'late'), msg(Date.UTC(2026, 10, 7, 23), 'older')]);
    const li = idbLocalItems(open, {}, { type: 'desktop', now: () => NOW, yieldToGame: async () => {} });
    const items = await li.list('comm');
    expect(items.map((i) => i.key)).toEqual([kept]);
    expect(texts(items)).toEqual(['early', 'late']);
    await li.write('comm', { put: [{ day: kept, records: [msg(start + 2000, 'pulled')] }, { day, records: [msg(Date.UTC(2026, 10, 7, 22), 'gone')] }], remove: [] });
    expect(texts(await li.list('comm'))).toEqual(['early', 'pulled', 'late']);
  });
});

describe('F10: a change made between the scan and the write is kept (last writer)', () => {
  it('settings: the adapter skips a put over a value changed since the scan', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x', copy: 'all' });
    await put(await open(), STORE.settings, [settings(20), 'main'], [{ type: 'phone', record: settings(5) }, 'device:phone']);
    const li = idbLocalItems(open, {}, { type: 'desktop' });
    await li.list('settings', { scan: true });
    await put(await open(), STORE.settings, [settings(21), 'main']);
    const batch: LocalBatch = { put: [{ type: 'desktop', record: settings(30) }, { type: 'phone', record: settings(6) }], remove: [] };
    await li.write('settings', batch);
    expect(await get(await open(), STORE.settings, 'main')).toEqual(settings(21));
    expect(await get(await open(), STORE.settings, 'device:phone')).toEqual({ type: 'phone', record: settings(6) });
    // Without a scan (a write of its own), nothing is guarded.
    await li.write('settings', { put: [{ type: 'desktop', record: settings(30) }], remove: [] });
    expect(await get(await open(), STORE.settings, 'main')).toEqual(settings(30));
  });

  it('scriptData: a store write during the sync is pushed next, not overwritten by the pulled version', async () => {
    const server = new Server();
    const aOpen = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'a', copy: 'all' });
    await put(await aOpen(), STORE.scriptData, [{ name: 'hunt', settings: {}, store: { n: 1 } }]);
    const a = engineOn(server, aOpen);
    await a.sync();
    const bOpen = deviceSpace(new IDBFactory());
    const inner = idbLocalItems(bOpen, {}, { type: 'desktop' });
    let during: (() => Promise<void>) | null = null;
    const local = {
      list: inner.list,
      async write(kind: Parameters<typeof inner.write>[0], b: LocalBatch) {
        if (kind === 'scriptData' && during) {
          const f = during;
          during = null;
          await f();
        }
        return inner.write(kind, b);
      },
    };
    const b = new SyncEngine({ local, records: idbSyncRecords(bOpen, () => 'b'), remote: fetchRemote(modelFetch(server)), keys, specs: SYNC_SPECS, yieldToGame: async () => {} });
    await b.sync();
    expect(await get(await bOpen(), STORE.scriptData, 'hunt')).toEqual({ name: 'hunt', settings: {}, store: { n: 1 } });
    // A writes n = 2; B's script writes n = 3 while B's engine takes A's version.
    await put(await aOpen(), STORE.scriptData, [{ name: 'hunt', settings: {}, store: { n: 2 } }]);
    await a.sync();
    during = async () => put(await bOpen(), STORE.scriptData, [{ name: 'hunt', settings: {}, store: { n: 3 } }]);
    await b.sync();
    expect(await get(await bOpen(), STORE.scriptData, 'hunt')).toEqual({ name: 'hunt', settings: {}, store: { n: 3 } });
    // The next sync pushes it (local wins as the last writer) and A takes it.
    await b.sync();
    await a.sync();
    expect(await get(await aOpen(), STORE.scriptData, 'hunt')).toEqual({ name: 'hunt', settings: {}, store: { n: 3 } });
  });
});

describe('F11: cleanups', () => {
  it('settleSettingsSeed reads the seed mark first: without one the sync store is not read', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x', copy: 'all' });
    const db = await open();
    const t = vi.spyOn(db, 'transaction');
    expect(await settleSettingsSeed(open, 'desktop')).toBe(false);
    expect(t.mock.calls.some(([stores]) => ([] as string[]).concat(stores as string[]).includes(STORE.sync))).toBe(false);
  });

  it('the timers adapter goes through TimersArchive (one normalisation)', async () => {
    const src = readFileSync(resolve(SRC, 'cloud/space/local.ts'), 'utf8');
    expect(src).not.toMatch(/STORE\.timers/);
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x', copy: 'all' });
    await put(await open(), STORE.timers, [{ character: 'Rasta', state: { v: 1 } }], [{ character: '', savedAt: 1 }]);
    const li = idbLocalItems(open, {}, { type: 'desktop' });
    expect(await li.list('timers')).toEqual([{ key: 'Rasta', body: { character: 'Rasta', savedAt: 0, state: { v: 1 } } }]);
    await li.write('timers', { put: [{ character: 'Bob', savedAt: 5, state: null }], remove: ['Rasta'] });
    expect((await li.list('timers')).map((i) => i.key)).toEqual(['Bob']);
  });

  it('the locked copy and Log out name the small kinds from one table', async () => {
    const { smallKindNames, unsyncedKindsWords } = await import('../../src/cloud/space/unsynced-words');
    const list = [
      { kind: 'timers' as const, key: 'Rasta', name: null, change: 'new' as const },
      { kind: 'comm' as const, key: '2026-11-01', name: null, change: 'new' as const },
      { kind: 'settings' as const, key: 'desktop', name: null, change: 'edit' as const },
    ];
    expect(smallKindNames(list, { timers: false })).toEqual(['settings', 'Comm history']);
    expect(unsyncedKindsWords(list)).toBe('settings · Comm history, 1 day · timers');
    const flows = readFileSync(resolve(SRC, 'cloud/space/flows.ts'), 'utf8');
    expect(flows).not.toMatch(/function smallKindLines/);
    expect(readFileSync(resolve(SRC, 'cloud/space/unsynced-words.ts'), 'utf8')).not.toMatch(/joined at the merge/);
  });
});
