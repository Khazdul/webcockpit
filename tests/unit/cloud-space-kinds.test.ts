// Stage 62 part C1: the sync of the small kinds on IndexedDB (ADR 0152).
// The adapters of src/cloud/space/local.ts for settings (per device type,
// the seed), scriptData, timers and comm (kept days, the cache, the
// additive put, the split); Create account's copy and Log in's seed
// (spaces.ts); the engine over every kind on three devices; and the
// page's triggers (runtime.ts: the play schedule). IndexedDB is
// fake-indexeddb; the server is the model of tests/unit/cloud-sync-model.ts.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveKeys, makeRoot } from '../../src/cloud/crypto';
import {
  COMM_PIECE_RAW,
  META,
  type OpenDb,
  commPieces,
  idbLocalItems,
  idbSyncRecords,
  readMeta,
  settingsSeedHash,
  settleSettingsSeed,
} from '../../src/cloud/space/local';
import { type SyncFetch, fetchRemote } from '../../src/cloud/space/remote';
import { applyWritten } from '../../src/cloud/space/notify';
import { PageSync } from '../../src/cloud/space/runtime';
import { notInAccount, pendingChanges, prepareAccountSpace, resetSpaceConnsForTests, spaceDb } from '../../src/cloud/space/spaces';
import { SyncEngine } from '../../src/cloud/sync/engine';
import { SYNC_SPECS } from '../../src/cloud/sync/items';
import type { CommItem, SettingsItem, SyncKeys } from '../../src/cloud/sync/types';
import { resetSyncViewForTests, setPlaying, takeSyncMessage } from '../../src/cloud/sync-view';
import { STORE, idbDone, idbRequest, openDeviceDb, openWebcockpitDb } from '../../src/core/db';
import { resetSpaceForTests, writeSpaceRecord } from '../../src/core/space';
import { noteStored } from '../../src/core/store-events';
import { CommArchive } from '../../src/gmcp/comm-archive';
import { type Answer, ServerModel } from './cloud-sync-model';

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

function modelFetch(server: ServerModel): SyncFetch {
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

const settings = (size: number, version = 1): Record<string, unknown> => ({ version, appearance: { size } });
const NOW = Date.UTC(2026, 10, 15, 12);
const DAY = 86_400_000;
const msg = (ts: number, text: string, character = 'Rasta') => ({ character, ts, channel: 'tells', talker: 'Bob', talkerType: null, destination: null, text });

/** A device's own space database on its own factory (a second or third device). */
function deviceSpace(factory: IDBFactory): OpenDb {
  let p: Promise<IDBDatabase> | null = null;
  return () => (p ??= openWebcockpitDb(factory, 'webcockpit-u-ole', { create: true }));
}

describe('the settings adapter', () => {
  it('main is this device type, device:<type> the others; puts go to the right key', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'desktop, Chrome', copy: 'all' });
    const db = await open();
    await put(db, STORE.settings, [settings(16), 'main'], [{ type: 'phone', record: settings(12), from: 'phone' }, 'device:phone'], [{ type: 'desktop', record: settings(1) }, 'device:desktop']);
    const li = idbLocalItems(open, {}, { type: 'desktop' });
    const items = (await li.list('settings')).sort((x, y) => (x.key < y.key ? -1 : 1));
    // `device:desktop` is this type's key spelled as another's: never listed. A stored `from` (stage 62 before pick 2a) is not.
    expect(items).toEqual([
      { key: 'desktop', body: { type: 'desktop', record: settings(16) } },
      { key: 'phone', body: { type: 'phone', record: settings(12) } },
    ]);
    const written = vi.fn();
    await idbLocalItems(open, { written }, { type: 'desktop' }).write('settings', {
      put: [
        { type: 'desktop', record: settings(20), from: 'desktop, Firefox' },
        { type: 'tablet', record: settings(14), from: 'tablet' },
      ],
      remove: ['phone'],
    });
    expect(await get(db, STORE.settings, 'main')).toEqual(settings(20));
    expect(await get(db, STORE.settings, 'device:tablet')).toEqual({ type: 'tablet', record: settings(14) });
    expect(await get(db, STORE.settings, 'device:phone')).toBeUndefined();
    expect(written).toHaveBeenCalledWith('settings', undefined, {});
    // Another type's alone: nothing for this page to show.
    written.mockClear();
    await idbLocalItems(open, { written }, { type: 'desktop' }).write('settings', { put: [{ type: 'phone', record: settings(9) }], remove: [] });
    expect(written).toHaveBeenCalledWith('settings', undefined, undefined);
  });

  it('a login copies the device settings as a seed: no item, changed or not, until settled or an agreed record', async () => {
    const dev = await openDeviceDb();
    await put(dev, STORE.settings, [settings(18), 'main']);
    dev.close();
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'desktop, Chrome' });
    expect((await readMeta(open, [META.settingsSeed]))[META.settingsSeed]).toBe(await settingsSeedHash('desktop', settings(18)));
    const li = idbLocalItems(open, {}, { type: 'desktop' });
    expect(await li.list('settings')).toEqual([]);
    // Changed (the player, the shell's own writes at boot): still the seed (stage 62 review, F1).
    await put(await open(), STORE.settings, [settings(19), 'main']);
    expect(await li.list('settings')).toEqual([]);
    // A full sync met none of this type: the seed is the account's, as it is now.
    expect(await settleSettingsSeed(open, 'desktop')).toBe(true);
    expect((await li.list('settings')).map((i) => i.key)).toEqual(['desktop']);
    expect(((await li.list('settings'))[0]!.body as unknown as SettingsItem).record).toEqual(settings(19));
    expect(await settleSettingsSeed(open, 'desktop')).toBe(false);
  });

  it('Create account copies settings (no seed), script data, Comm and timers; the device keeps its own', async () => {
    const dev = await openDeviceDb();
    await put(dev, STORE.settings, [settings(18), 'main']);
    await put(dev, STORE.scriptData, [{ name: 'autoloot', settings: { x: 1 }, store: {} }]);
    await put(dev, STORE.timers, [{ character: 'Rasta', savedAt: 5, state: { v: 1 } }]);
    await new CommArchive(dev).addDayRecords([msg(Date.now() - 1000, 'hi')]);
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'desktop, Chrome', copy: 'all' });
    expect((await readMeta(open, [META.settingsSeed]))[META.settingsSeed]).toBeUndefined();
    const li = idbLocalItems(open, {}, { type: 'desktop' });
    expect((await li.list('settings')).map((i) => i.key)).toEqual(['desktop']);
    expect((await li.list('scriptData')).map((i) => i.key)).toEqual(['autoloot']);
    expect((await li.list('timers')).map((i) => i.body)).toEqual([{ character: 'Rasta', savedAt: 5, state: { v: 1 } }]);
    expect((await li.list('comm')).flatMap((i) => (i.body as unknown as CommItem).records.map((r) => r.text))).toEqual(['hi']);
    expect((await pendingChanges(li, idbSyncRecords(open, () => 'x'))).map((u) => u.kind).sort()).toEqual(['comm', 'scriptData', 'settings', 'timers']);
    // The locked copy's decision: timers alone do not keep a copy.
    expect((await notInAccount('ole')).changes.map((u) => u.kind).sort()).toEqual(['comm', 'scriptData', 'settings']);
    expect(await get(dev, STORE.timers, 'Rasta')).toBeTruthy();
    dev.close();
  });
});

describe('scriptData and timers', () => {
  it('by name and by character, put and remove', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const li = idbLocalItems(open, {}, { type: 'desktop' });
    await li.write('scriptData', { put: [{ name: 'hunt', enabled: true, settings: { a: 1 }, store: { k: 'v' } }], remove: [] });
    await li.write('timers', { put: [{ character: 'Rasta', savedAt: 7, state: null }], remove: [] });
    expect(await li.list('scriptData')).toEqual([{ key: 'hunt', body: { name: 'hunt', enabled: true, settings: { a: 1 }, store: { k: 'v' } } }]);
    expect(await li.list('timers')).toEqual([{ key: 'Rasta', body: { character: 'Rasta', savedAt: 7, state: null } }]);
    await li.write('scriptData', { put: [], remove: ['hunt'] });
    await li.write('timers', { put: [], remove: ['Rasta'] });
    expect(await li.list('scriptData')).toEqual([]);
    expect(await li.list('timers')).toEqual([]);
  });
});

describe('the comm adapter', () => {
  it('kept days only, cached while unchanged, additive put, old days dropped, remove of a day', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const arch = new CommArchive(await open(), { now: () => NOW });
    const today = '2026-11-15';
    await arch.addDayRecords([msg(NOW - 2000, 'b'), msg(NOW - 3000, 'a'), msg(NOW - DAY, 'yesterday')]);
    const li = idbLocalItems(open, {}, { type: 'desktop', now: () => NOW });
    const first = await li.list('comm');
    expect(first.map((i) => i.key)).toEqual(['2026-11-14', today]);
    expect((first[1]!.body as unknown as CommItem).records.map((r) => r.text)).toEqual(['a', 'b']);
    // Unchanged: the very same body (its hashes are cached with it).
    const again = await li.list('comm');
    expect(again[1]!.body).toBe(first[1]!.body);
    await arch.addDayRecords([msg(NOW - 1000, 'c')]);
    const third = await li.list('comm');
    expect(third[1]!.body).not.toBe(first[1]!.body);
    expect(third[0]!.body).toBe(first[0]!.body);
    // Additive: the piece's records the day lacks are added, none removed; an old day is dropped.
    await li.write('comm', {
      put: [
        { day: today, records: [msg(NOW - 3000, 'a'), msg(NOW - 500, 'from B')] },
        { day: '2026-11-01', records: [msg(Date.UTC(2026, 10, 1, 5), 'old')] },
      ],
      remove: [],
    });
    const texts = ((await li.list('comm'))[1]!.body as unknown as CommItem).records.map((r) => r.text);
    expect(texts).toEqual(['a', 'b', 'c', 'from B']);
    expect((await li.list('comm')).map((i) => i.key)).toEqual(['2026-11-14', today]);
    // A day whose start is past seven days is still listed while its records are kept (stage 62 review, F9: 8 days 6 hours).
    const edge = new CommArchive(await open(), { now: () => NOW });
    await edge.addDayRecords([msg(NOW - 7 * DAY + 3600_000, 'edge')]);
    expect((await li.list('comm')).map((i) => i.key)).toEqual(['2026-11-08', '2026-11-14', today]);
    await li.write('comm', { put: [], remove: ['2026-11-14'] });
    expect((await li.list('comm')).map((i) => i.key)).toEqual(['2026-11-08', today]);
  });

  it('a day over the limit is split, newest in the last piece; a piece removed takes only its records', async () => {
    const recs = Array.from({ length: 10 }, (_, i) => msg(1000 + i, `m${i}`));
    const pieces = commPieces('2026-11-15', recs, 400);
    expect(pieces.length).toBeGreaterThan(2);
    expect(pieces.map((p) => p.day)).toEqual(pieces.map((_, i) => (i === 0 ? '2026-11-15' : `2026-11-15.${i + 1}`)));
    expect(pieces.at(-1)!.records.at(-1)!.text).toBe('m9');
    expect(pieces.flatMap((p) => p.records)).toEqual(recs);
    expect(commPieces('2026-11-15', recs).length).toBe(1);
    expect(COMM_PIECE_RAW).toBeGreaterThan(1_000_000);
  });
});

describe('the engine over every kind on three devices', () => {
  it('two desktops share settings, the phone keeps its own; Comm adds up; timers and script data follow', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const server = new ServerModel();
    const aOpen = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'desktop, Chrome', copy: 'all' });
    const bOpen = deviceSpace(new IDBFactory());
    const pOpen = deviceSpace(new IDBFactory());
    const engine = (open: OpenDb, type: 'desktop' | 'phone', label: string, written?: (...a: unknown[]) => void): SyncEngine =>
      new SyncEngine({
        local: idbLocalItems(open, { written }, { type, now: () => NOW }),
        records: idbSyncRecords(open, () => label),
        remote: fetchRemote(modelFetch(server)),
        keys,
        specs: SYNC_SPECS,
        yieldToGame: async () => {},
      });
    await put(await bOpen(), STORE.syncMeta, ['desktop, Firefox', META.deviceLabel]);
    const a = engine(aOpen, 'desktop', 'desktop, Chrome');
    const bWritten = vi.fn();
    const b = engine(bOpen, 'desktop', 'desktop, Firefox', bWritten);
    const p = engine(pOpen, 'phone', 'phone');
    await put(await aOpen(), STORE.syncMeta, ['desktop, Chrome', META.deviceLabel]);
    await put(await aOpen(), STORE.settings, [settings(20), 'main']);
    await put(await pOpen(), STORE.settings, [settings(11), 'main']);
    await put(await aOpen(), STORE.timers, [{ character: 'Rasta', savedAt: NOW - 60_000, state: { v: 1, t: 3 } }]);
    await put(await aOpen(), STORE.scriptData, [{ name: 'hunt', settings: { n: 2 }, store: {} }]);
    await new CommArchive(await aOpen(), { now: () => NOW }).addDayRecords([msg(NOW - 5000, 'from A')]);
    await new CommArchive(await pOpen(), { now: () => NOW }).addDayRecords([msg(NOW - 4000, 'from phone', 'Other')]);
    for (const e of [a, b, p, a, b, p]) expect(await e.sync()).toEqual({ type: 'synced' });
    expect(await get(await bOpen(), STORE.settings, 'main')).toEqual(settings(20));
    expect(bWritten).toHaveBeenCalledWith('settings', undefined, {});
    expect(await get(await pOpen(), STORE.settings, 'main')).toEqual(settings(11));
    expect(await get(await pOpen(), STORE.settings, 'device:desktop')).toMatchObject({ type: 'desktop', record: settings(20) });
    expect(await get(await bOpen(), STORE.timers, 'Rasta')).toEqual({ character: 'Rasta', savedAt: NOW - 60_000, state: { v: 1, t: 3 } });
    expect(await get(await bOpen(), STORE.scriptData, 'hunt')).toEqual({ name: 'hunt', settings: { n: 2 }, store: {} });
    for (const open of [aOpen, bOpen, pOpen]) {
      const items = await idbLocalItems(open, {}, { type: 'desktop', now: () => NOW }).list('comm');
      expect(items.flatMap((i) => (i.body as unknown as CommItem).records.map((r) => r.text))).toEqual(['from A', 'from phone']);
    }
    // In step: nothing waits anywhere.
    for (const e of [a, b, p]) expect(await e.unsynced()).toEqual([]);
    // A desktop's change reaches the other desktop, not the phone's own.
    await put(await bOpen(), STORE.settings, [settings(22), 'main']);
    for (const e of [b, a, p]) await e.sync();
    expect(await get(await aOpen(), STORE.settings, 'main')).toEqual(settings(22));
    expect(await get(await pOpen(), STORE.settings, 'main')).toEqual(settings(11));
    const pItems = await idbLocalItems(pOpen, {}, { type: 'phone' }).list('settings');
    expect((pItems.find((i) => i.key === 'desktop')!.body as unknown as SettingsItem).record).toEqual(settings(22));
  });

  it('a login seed gives way to the account settings of this type', async () => {
    const server = new ServerModel();
    const aOpen = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'desktop, Chrome', copy: 'all' });
    await put(await aOpen(), STORE.settings, [settings(20), 'main']);
    const mk = (open: OpenDb): SyncEngine =>
      new SyncEngine({ local: idbLocalItems(open, {}, { type: 'desktop' }), records: idbSyncRecords(open, () => 'd'), remote: fetchRemote(modelFetch(server)), keys, specs: SYNC_SPECS });
    expect(await mk(aOpen).sync()).toEqual({ type: 'synced' });
    // Device B logs in with its own settings copied as a seed.
    const bOpen = deviceSpace(new IDBFactory());
    await put(await bOpen(), STORE.settings, [settings(9), 'main']);
    await put(await bOpen(), STORE.syncMeta, [await settingsSeedHash('desktop', settings(9)), META.settingsSeed]);
    expect(await mk(bOpen).sync()).toEqual({ type: 'synced' });
    expect(await get(await bOpen(), STORE.settings, 'main')).toEqual(settings(20));
    expect(await settleSettingsSeed(bOpen, 'desktop')).toBe(false);
    expect((await readMeta(bOpen, [META.settingsSeed]))[META.settingsSeed]).toBeUndefined();
  });
});

describe('applying pulled settings', () => {
  it('reloads the settings store quietly: no message (the owner\'s pick 2a)', async () => {
    const reload = vi.fn(async () => 'applied' as const);
    const host = { profiles: {} as never, settings: { reload } as never };
    await applyWritten(host, { kind: 'settings', settings: {} });
    expect(reload).toHaveBeenCalledWith({});
    expect(takeSyncMessage()).toBeNull();
  });
});

describe('the triggers (the play schedule)', () => {
  it('during play small-kind and settings writes wait for 5 minutes, hidden or the game left; profiles note at 5 s; off play all do', async () => {
    writeSpaceRecord({ nameKey: 'ole', state: 'open' });
    resetSpaceForTests();
    await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const sync = vi.spyOn(SyncEngine.prototype, 'sync').mockResolvedValue({ type: 'busy', retryAt: Date.now() + 3_600_000 });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const host = { profiles: { get: async () => null }, settings: { get: () => ({ profile: 'default' }), reload: async () => 'same' } };
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('document', doc);
    const ps = new PageSync(host as never, 'ole', 'Ole', keys).start();
    const flush = async (ms: number): Promise<void> => {
      await vi.advanceTimersByTimeAsync(ms);
    };
    await flush(10);
    const n0 = sync.mock.calls.length;
    expect(n0).toBe(1); // the load
    setPlaying(true);
    // (Settings too since the stage 62 review, F8: the cockpit writes them by itself, pane sizes and window rects.)
    for (const k of ['comm', 'timers', 'scriptData', 'settings'] as const) noteStored(k);
    await flush(6000);
    expect(sync.mock.calls.length).toBe(n0);
    noteStored('profile');
    await flush(6000);
    expect(sync.mock.calls.length).toBe(n0 + 1);
    // Every 5 minutes of play.
    await flush(5 * 60_000);
    expect(sync.mock.calls.length).toBe(n0 + 2);
    // Visible again in play: nothing; hidden: a sync.
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush(10);
    expect(sync.mock.calls.length).toBe(n0 + 2);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush(10);
    expect(sync.mock.calls.length).toBe(n0 + 3);
    // The game is left.
    setPlaying(false);
    for (let i = 0; i < 50 && sync.mock.calls.length < n0 + 4; i++) await new Promise((r) => setImmediate(r));
    expect(sync.mock.calls.length).toBe(n0 + 4);
    // Off play a Comm write notes at 5 s.
    noteStored('comm');
    await flush(6000);
    expect(sync.mock.calls.length).toBe(n0 + 5);
    // Off play, hidden: nothing; visible again: a sync.
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush(10);
    expect(sync.mock.calls.length).toBe(n0 + 5);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush(10);
    expect(sync.mock.calls.length).toBe(n0 + 6);
    ps.stop();
  });
});
