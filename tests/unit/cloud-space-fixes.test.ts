// Stage 61's review findings, each with its regression test (the stage
// file's "Review fixes"): seeds and ids, the move and a later device edit,
// the hand-back of runs and a hand-back cut off, the created mark, the
// seeded mark, the stored note, the late writer of a deleted space, the
// lost session after a Log out, the sync paused and resumed, in use in
// another tab, and the caches of the other tabs. IndexedDB is
// fake-indexeddb; the server is the model of tests/unit/cloud-sync-model.ts.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountStore } from '../../src/cloud/account/store';
import { deriveKeys, makeRoot } from '../../src/cloud/crypto';
import {
  CREATED_KEY,
  HANDBACK_KEY,
  createAccountSpace,
  deleteHandBack,
  finishHandBacks,
  noteCreated,
  onSyncControl,
  pendingHandBacks,
  sessionLost,
  setLeaving,
} from '../../src/cloud/space/flows';
import { DuplicateIdError, type ProfileRow, idbLocalItems, idbSyncRecords, profileItems } from '../../src/cloud/space/local';
import { beginMove, continueMove, moveState } from '../../src/cloud/space/move';
import { applyWritten, channelName, listenWritten, notifyWritten, resetChannelsForTests } from '../../src/cloud/space/notify';
import { type SyncFetch, fetchRemote } from '../../src/cloud/space/remote';
import { PageSync } from '../../src/cloud/space/runtime';
import { deviceDb, handBack, pendingChanges, prepareAccountSpace, recordOpening, resetSpaceConnsForTests, spaceDb } from '../../src/cloud/space/spaces';
import { SyncEngine } from '../../src/cloud/sync/engine';
import type { SyncKeys } from '../../src/cloud/sync/types';
import { resetSyncViewForTests } from '../../src/cloud/sync-view';
import { NoSuchSpaceDb, STORE, idbDone, idbRequest, markDbGone, openDeviceDb, openWebcockpitDb, resetGoneDbsForTests } from '../../src/core/db';
import { SPACE_MESSAGE_KEY, readSpaceRecord, resetSpaceForTests, writeSpaceRecord } from '../../src/core/space';
import { onStored } from '../../src/core/store-events';
import { BUNDLED_PROFILES, PROFILE_TEMPLATE, ProfileStore, seedId, seedProfiles } from '../../src/profiles';
import { SEED_NAMES } from '../../src/profiles/seed-ids';
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
    if (u.pathname === '/api/u/sync/changes') a = server.changes(Number(u.searchParams.get('since')));
    else {
      const [kind, id] = u.pathname.slice('/api/u/sync/items/'.length).split('/').map(decodeURIComponent);
      a = method === 'PUT' ? server.put(kind!, id!, Number(h['If-Match']), init.body as Uint8Array) : server.remove(kind!, id!, Number(h['If-Match']));
    }
    return { status: a.status, json: async () => (a.body === undefined ? Promise.reject(new SyntaxError('none')) : structuredClone(a.body)) };
  };
}

/** An IDBFactory whose `open` of `bad` throws (a database that cannot be reached). */
function failing(real: IDBFactory, bad: (name: string) => boolean): IDBFactory {
  return new Proxy(real, {
    get(t, k) {
      if (k === 'open') {
        return (name: string, v?: number) => {
          if (bad(name)) throw new DOMException('blocked', 'UnknownError');
          return t.open(name, v);
        };
      }
      const v = Reflect.get(t, k) as unknown;
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
}

let local: Storage;
let session: Storage;
let keys: SyncKeys;
let factory: IDBFactory;

beforeEach(async () => {
  local = memStorage();
  session = memStorage();
  factory = new IDBFactory();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('indexedDB', factory);
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  resetSpaceForTests();
  resetSpaceConnsForTests();
  resetSyncViewForTests();
  resetGoneDbsForTests();
  keys ??= await deriveKeys(makeRoot());
});

afterEach(() => {
  setLeaving(false);
  onSyncControl({ stop: () => {}, pause: () => {}, resume: () => {} });
  resetChannelsForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSpaceForTests();
  resetSpaceConnsForTests();
});

type ScriptRow = { id: string; name: string; source: string; enabled: boolean; created: number; updated: number };

async function put(db: IDBDatabase, store: string, ...recs: object[]): Promise<void> {
  const t = db.transaction(store, 'readwrite');
  const done = idbDone(t);
  for (const r of recs) t.objectStore(store).put(r);
  await done;
}

async function all<T>(db: IDBDatabase, store: string): Promise<T[]> {
  const t = db.transaction(store, 'readonly');
  const done = idbDone(t);
  const r = (await idbRequest(t.objectStore(store).getAll())) as T[];
  await done;
  return r;
}

const prof = (id: string, name: string, text = `#nop ${name}`, t = 1000): ProfileRow => ({ id, name, text, created: t, modified: t });

function engineOn(nameKey: string, server: ServerModel, inUse?: Set<string>): SyncEngine {
  const open = spaceDb(nameKey);
  return new SyncEngine({
    local: idbLocalItems(open),
    records: idbSyncRecords(open, () => 'phone'),
    remote: fetchRemote(modelFetch(server)),
    keys,
    ...(inUse ? { inUse: { keys: async (k) => (k === 'profile' ? inUse : new Set<string>()) } } : {}),
  });
}

async function loggedIn(name: string): Promise<void> {
  await createAccountStore().write({ name, created: 1, label: 'x', savedAt: 1, ...keys });
  local.setItem('wc.account', JSON.stringify({ name }));
  await prepareAccountSpace(name, { fresh: true, deviceLabel: 'phone' });
  writeSpaceRecord(recordOpening(name.toLowerCase()));
  resetSpaceForTests();
}

async function dbNames(): Promise<string[]> {
  return ((await indexedDB.databases()) as { name: string }[]).map((d) => d.name).sort();
}

// ------------------------------------------------------------ 1, 2: seeds and ids

describe('finding 1: a renamed bundled seed and the move', () => {
  it('the seed of the new space gives way to the device’s renamed khazdul (same id); the server and a second device get conan', async () => {
    const store = new ProfileStore();
    await store.init();
    await store.rename('khazdul', 'conan'); // keeps the id seed-khazdul
    await store.save('conan', '#nop my conan');
    await store.close();
    await beginMove('ole', 'phone');
    const open = spaceDb('ole');
    const rows = await all<ProfileRow>(await open(), STORE.profiles);
    expect(rows.filter((r) => r.id === seedId('khazdul')).map((r) => r.name)).toEqual(['conan']);
    const server = new ServerModel();
    await engineOn('ole', server).sync();
    await continueMove(open);
    await engineOn('ole', server).sync();
    await engineOn('ole', server).sync();
    expect((await all<ProfileRow>(await open(), STORE.profiles)).find((r) => r.name === 'conan')?.text).toBe('#nop my conan');
    // A second device (another space name stands in) logs in.
    await prepareAccountSpace('two', { fresh: true, deviceLabel: 'desktop' });
    await engineOn('two', server).sync();
    const rows2 = await all<ProfileRow>(await spaceDb('two')(), STORE.profiles);
    expect(rows2.find((r) => r.name === 'conan')?.text).toBe('#nop my conan');
    expect(rows2.filter((r) => r.id === seedId('khazdul'))).toHaveLength(1);
  });

  it('the account’s space seeds only names and ids that are free', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'phone' });
    const db = await open();
    // A thing with a seed's id under another name, then the space is prepared again (not fresh).
    await put(db, STORE.profiles, prof(seedId('khazdul'), 'conan'));
    const t = db.transaction([STORE.profiles], 'readwrite');
    t.objectStore(STORE.profiles).delete('khazdul');
    await idbDone(t);
    await put(db, STORE.syncMeta);
    const meta = db.transaction(STORE.syncMeta, 'readwrite');
    meta.objectStore(STORE.syncMeta).delete('seeded');
    await idbDone(meta);
    await prepareAccountSpace('ole', { fresh: false, deviceLabel: 'phone' });
    const rows = await all<ProfileRow>(await spaceDb('ole')(), STORE.profiles);
    expect(rows.map((r) => [r.name, r.id]).sort()).toEqual([
      ['conan', seedId('khazdul')],
      ['default', seedId('default')],
    ]);
  });

  it('list refuses two rows with one id (an untouched seed among them gives way)', () => {
    const seed = seedProfiles()[1]!;
    expect(profileItems([seed, prof(seed.id, 'conan')], new Set([seed.id])).map((r) => r.name)).toEqual(['conan']);
    expect(() => profileItems([prof('x', 'a'), prof('x', 'b')], new Set())).toThrow(DuplicateIdError);
  });
});

describe('finding 2: an untouched seed on a second device', () => {
  async function editedDefaultOnServer(server: ServerModel): Promise<void> {
    await prepareAccountSpace('one', { fresh: true, deviceLabel: 'phone' });
    const db = await spaceDb('one')();
    await put(db, STORE.profiles, { ...seedProfiles()[0]!, text: '#nop edited on one', modified: 5 });
    await engineOn('one', server).sync();
  }

  it('the pulled item replaces it by id: no keep-both copy, nothing pushed back', async () => {
    const server = new ServerModel();
    await editedDefaultOnServer(server);
    const before = server.all().length;
    await prepareAccountSpace('two', { fresh: true, deviceLabel: 'desktop' });
    const e = engineOn('two', server);
    expect(await e.sync()).toEqual({ type: 'synced' });
    const names = (await all<ProfileRow>(await spaceDb('two')(), STORE.profiles)).map((p) => [p.name, p.text]);
    expect(names).toContainEqual(['default', '#nop edited on one']);
    expect(names.filter(([n]) => n!.startsWith('default'))).toHaveLength(1);
    expect(server.all()).toHaveLength(before);
    expect(await e.unsynced()).toEqual([]);
  });

  it('a pulled record not yet agreed on (rev 0) does not make the seed an item', async () => {
    const server = new ServerModel();
    await editedDefaultOnServer(server);
    await prepareAccountSpace('two', { fresh: true, deviceLabel: 'desktop' });
    // In use during play: the pull is held, the seed stays as it is, and it is no change of this device.
    const e = engineOn('two', server, new Set([seedId('default')]));
    await e.sync();
    const open = spaceDb('two');
    expect((await all<ProfileRow>(await open(), STORE.profiles)).find((p) => p.name === 'default')!.text).toBe(PROFILE_TEMPLATE);
    expect(e.status.get().held).toBe(1);
    expect(await idbLocalItems(open).list('profile')).toEqual([]);
    expect(await pendingChanges(idbLocalItems(open), idbSyncRecords(open, () => 'x'))).toEqual([]);
    // After play it is replaced.
    await engineOn('two', server).sync();
    expect((await all<ProfileRow>(await open(), STORE.profiles)).find((p) => p.name === 'default')!.text).toBe('#nop edited on one');
  });
});

// ------------------------------------------------------------ 3, 11: the move

describe('finding 3: a device thing changed after it was copied', () => {
  it('stays on the device and is not counted as moved', async () => {
    const store = new ProfileStore();
    await store.init();
    await store.create('warrior', '#nop v1');
    await store.create('mage', '#nop m');
    await beginMove('ole', 'phone');
    // A guest game in another tab (still on the device's space) types a setting.
    await store.save('warrior', '#nop v1\n#alias {k} {kill}');
    const open = spaceDb('ole');
    const server = new ServerModel();
    await engineOn('ole', server).sync();
    const p = await continueMove(open);
    expect(p).toMatchObject({ total: { profiles: 1, scripts: 0 }, moved: 1, done: true, justDone: true });
    expect((await store.get('warrior'))?.text).toBe('#nop v1\n#alias {k} {kill}');
    expect(await store.get('mage')).toBeNull();
    expect((await moveState(open))!.kept!.map((e) => e.name)).toEqual(['warrior']);
    await store.close();
  });
});

describe('finding 11: the device after a move', () => {
  it('is back at its starting set: default comes back alone, a deleted bundled profile stays deleted', async () => {
    const store = new ProfileStore();
    await store.init();
    await store.remove('khazdul');
    await store.save('default', '#nop mine');
    await store.close();
    await beginMove('ole', 'phone');
    await engineOn('ole', new ServerModel()).sync();
    expect(await continueMove(spaceDb('ole'))).toMatchObject({ done: true });
    expect(await all<ProfileRow>(await deviceDb(), STORE.profiles)).toEqual([]);
    resetSpaceConnsForTests();
    const again = new ProfileStore();
    await again.init();
    expect((await again.list()).map((p) => [p.name, p.id, p.text])).toEqual([['default', seedId('default'), PROFILE_TEMPLATE]]);
    await again.close();
  });

  it('a database seeded before the mark existed gets the mark at its next start', async () => {
    const store = new ProfileStore();
    await store.init();
    const db = await openDeviceDb();
    const t = db.transaction(STORE.syncMeta, 'readwrite');
    t.objectStore(STORE.syncMeta).delete('seeded');
    await idbDone(t);
    await store.init();
    const m = db.transaction(STORE.syncMeta, 'readonly');
    expect(await idbRequest(m.objectStore(STORE.syncMeta).get('seeded'))).toBe(true);
    db.close();
    await store.close();
  });
});

// ------------------------------------------------------------ 5, 10: the hand-back

describe('finding 5: Delete account hands the runs back', () => {
  it('runs with their chunks, events and export edits; a clash keeps the device’s; a second hand-back doubles nothing', async () => {
    await loggedIn('Ole');
    const dev = await deviceDb();
    await put(dev, STORE.runs, { runId: 'r2', character: 'Dev', startedUs: 1 });
    await put(dev, STORE.runChunks, { runId: 'r2', seq: 0, bytes: 'dev' });
    const acct = await spaceDb('ole')();
    await put(acct, STORE.runs, { runId: 'r1', character: 'Acc', startedUs: 5, saved: true }, { runId: 'r2', character: 'Acc', startedUs: 9 });
    await put(acct, STORE.runChunks, { runId: 'r1', seq: 0, bytes: 'a' }, { runId: 'r1', seq: 1, bytes: 'b' }, { runId: 'r2', seq: 0, bytes: 'acc' });
    await put(acct, STORE.runEvents, { runId: 'r1', seq: 0, event: { type: 'x' } });
    await put(acct, STORE.exports, { sessionId: 'r1', title: 't1' }, { sessionId: 'r2', title: 't2' });
    expect(await handBack('ole')).toMatchObject({ runs: 2 });
    const runs = await all<{ runId: string; character: string }>(dev, STORE.runs);
    expect(runs).toHaveLength(3);
    expect(runs.find((r) => r.runId === 'r2')!.character).toBe('Dev');
    const moved = runs.find((r) => r.character === 'Acc' && r.runId !== 'r1')!;
    const chunks = await all<{ runId: string; bytes: string }>(dev, STORE.runChunks);
    expect(chunks.filter((c) => c.runId === 'r1').map((c) => c.bytes)).toEqual(['a', 'b']);
    expect(chunks.filter((c) => c.runId === moved.runId).map((c) => c.bytes)).toEqual(['acc']);
    expect(chunks.filter((c) => c.runId === 'r2').map((c) => c.bytes)).toEqual(['dev']);
    expect(await all(dev, STORE.runEvents)).toEqual([{ runId: 'r1', seq: 0, event: { type: 'x' } }]);
    expect((await all<{ sessionId: string; title: string }>(dev, STORE.exports)).map((x) => [x.sessionId, x.title]).sort()).toEqual(
      [
        ['r1', 't1'],
        [moved.runId, 't2'],
      ].sort(),
    );
    // Again (a cut-off hand-back tried at the next load): r1 is skipped. (The clash is a new id again only because its device run differs.)
    expect((await handBack('ole')).profiles).toBe(0);
    expect((await all<{ runId: string }>(dev, STORE.runs)).filter((r) => r.runId === 'r1')).toHaveLength(1);
  });

  it('the words name the runs', async () => {
    await loggedIn('Ole');
    expect(await deleteHandBack('Ole')).toBe(true);
    expect(session.getItem(SPACE_MESSAGE_KEY)).toBe('The account Ole is deleted. Its profiles, scripts and runs are this device’s now.');
  });
});

describe('finding 10: a hand-back that fails after the server deleted the account', () => {
  it('is not locked under the dead account; it is tried again at the next load until it is done', async () => {
    await loggedIn('Ole');
    await put(await spaceDb('ole')(), STORE.profiles, prof('m', 'mage'));
    resetSpaceForTests({ kind: 'account', nameKey: 'ole' });
    // The device's database cannot be reached just now.
    resetSpaceConnsForTests();
    vi.stubGlobal('indexedDB', failing(factory, (n) => n === 'webcockpit'));
    expect(await deleteHandBack('Ole')).toBe(true);
    expect(readSpaceRecord()).toBeNull(); // the device's space, no locked copy (no Log in is offered)
    expect(session.getItem(SPACE_MESSAGE_KEY)).toBe('The account Ole is deleted. Its things are being moved back to this device.');
    expect(pendingHandBacks()).toEqual([{ nameKey: 'ole', name: 'Ole' }]);
    expect(await dbNames()).toContain('webcockpit-u-ole');
    // The next load (still failing): the same words.
    resetSpaceForTests();
    resetSpaceConnsForTests();
    expect(await finishHandBacks()).toEqual(['The account Ole is deleted. Its things are being moved back to this device.']);
    // The load after: done.
    vi.stubGlobal('indexedDB', factory);
    resetSpaceConnsForTests();
    expect(await finishHandBacks()).toEqual(['The account Ole is deleted. Its profiles, scripts and runs are this device’s now.']);
    expect(local.getItem(HANDBACK_KEY)).toBeNull();
    expect(await dbNames()).not.toContain('webcockpit-u-ole');
    expect((await all<ProfileRow>(await deviceDb(), STORE.profiles)).map((p) => p.name)).toContain('mage');
  });
});

// ------------------------------------------------------------ 8, 9: the flows

describe('finding 9: the created mark', () => {
  it('stays until the move has stored its state: a move that throws is begun again at the next load', async () => {
    noteCreated('Ole');
    vi.stubGlobal('indexedDB', failing(factory, (n) => n.startsWith('webcockpit-u-')));
    await expect(createAccountSpace('Ole')).rejects.toBeTruthy();
    expect(local.getItem(CREATED_KEY)).toBe('ole');
    vi.stubGlobal('indexedDB', factory);
    resetSpaceConnsForTests();
    expect(await createAccountSpace('Ole')).toBe(true);
    expect(local.getItem(CREATED_KEY)).toBeNull();
    expect(readSpaceRecord()).toEqual({ nameKey: 'ole', state: 'open' });
    expect(await moveState(spaceDb('ole'))).not.toBeNull();
  });
});

describe('finding 8: a failed Log out or Delete account', () => {
  it('pauses the page’s sync, and it goes on afterwards', async () => {
    await loggedIn('Ole');
    resetSpaceForTests({ kind: 'account', nameKey: 'ole' });
    const sync = vi.spyOn(SyncEngine.prototype, 'sync').mockResolvedValue({ type: 'synced' });
    const host = { profiles: new ProfileStore(), settings: { get: () => ({ profile: 'default' }) } };
    const page = new PageSync(host as never, 'ole', 'Ole', keys).start();
    expect(sync).toHaveBeenCalledTimes(1);
    setLeaving(true);
    await page.syncNow();
    expect(sync).toHaveBeenCalledTimes(1);
    setLeaving(false);
    expect(sync).toHaveBeenCalledTimes(2);
    await page.syncNow();
    expect(sync).toHaveBeenCalledTimes(3);
    page.stop();
    await host.profiles.close();
  });
});

// ------------------------------------------------------------ 7: in use in another tab

describe('finding 7: in use is per space, not per tab', () => {
  it('the selected profile is in use while another tab of the space holds the game lock', async () => {
    await loggedIn('Ole');
    resetSpaceForTests({ kind: 'account', nameKey: 'ole' });
    const profiles = new ProfileStore();
    await profiles.init();
    const host = { profiles, settings: { get: () => ({ profile: 'default' }) } };
    const page = new PageSync(host as never, 'ole', 'Ole', keys);
    const inUse = (k: 'profile' | 'script'): Promise<ReadonlySet<string>> => (page as unknown as { inUse(k: string): Promise<ReadonlySet<string>> }).inUse(k);
    let held: { name: string }[] = [];
    vi.stubGlobal('navigator', { locks: { query: async () => ({ held }), request: async () => {} } });
    expect([...(await inUse('profile'))]).toEqual([]);
    held = [{ name: 'webcockpit-game@u-ole' }];
    expect([...(await inUse('profile'))]).toEqual([seedId('default')]);
    await profiles.close();
  });
});

// ------------------------------------------------------------ 6: the other tabs

describe('finding 6: the caches of every tab of the space', () => {
  it('the writing tab’s caches follow, the other tabs are told on the space’s channel', async () => {
    await loggedIn('Ole');
    resetSpaceForTests({ kind: 'account', nameKey: 'ole' });
    const other = new BroadcastChannel(channelName({ kind: 'account', nameKey: 'ole' }));
    const heard: unknown[] = [];
    other.onmessage = (e) => heard.push(e.data);
    const reload = vi.fn(async () => {});
    const host = { profiles: new ProfileStore(), scripts: { reload }, settings: { get: () => ({ profile: 'default' }), update: vi.fn() } };
    const page = new PageSync(host as never, 'ole', 'Ole', keys);
    (page as unknown as { written(k: string): void }).written('script');
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(heard).toEqual([{ kind: 'script' }]));
    other.close();
    await host.profiles.close();
  });

  it('another tab’s write: the profile listeners hear, a rename of the selected profile follows by id, a delete falls back to default', async () => {
    await loggedIn('Ole');
    resetSpaceForTests({ kind: 'account', nameKey: 'ole' });
    const profiles = new ProfileStore();
    await profiles.init();
    await profiles.create('hunter', '#nop h');
    const id = (await profiles.get('hunter'))!.id;
    let selected = 'warrior';
    const settings = { get: () => ({ profile: selected }), update: (u: { profile: string }) => void (selected = u.profile) };
    const heard: [string, string][] = [];
    profiles.subscribe((n, t) => heard.push([n, t]));
    const host = { profiles, settings };
    const got = new Promise<void>((resolve) => listenWritten({ kind: 'account', nameKey: 'ole' }, (w) => void applyWritten(host as never, w).then(resolve)));
    // The other tab: its own channel object (a page never hears its own posts).
    const sender = new BroadcastChannel(channelName({ kind: 'account', nameKey: 'ole' }));
    sender.postMessage({ kind: 'profile', profiles: { put: [{ id, name: 'hunter', text: '#nop h' }], renamed: [{ id, from: 'warrior', to: 'hunter' }], removed: [] } });
    await got;
    expect(heard).toEqual([['hunter', '#nop h']]);
    expect(selected).toBe('hunter');
    // A delete of the selected one.
    selected = 'gone';
    await applyWritten(host as never, { kind: 'profile', profiles: { put: [], renamed: [], removed: [{ id: 'g', name: 'gone' }] } });
    expect(selected).toBe('default');
    sender.close();
    await profiles.close();
    notifyWritten({ kind: 'device' }, { kind: 'script' }); // no listener: nothing happens
  });
});

// ------------------------------------------------------------ 12, 13

describe('finding 12: the stored note', () => {
  it('comes only from a transaction that put or deleted a profile', async () => {
    const store = new ProfileStore();
    await store.init();
    const noted = vi.fn();
    const off = onStored(noted);
    await store.init(); // nothing to strip, the mark is there: no write
    await store.list();
    await expect(store.create('default')).rejects.toThrow();
    expect(noted).not.toHaveBeenCalled();
    await store.save('default', '#nop x');
    expect(noted).toHaveBeenCalledTimes(1);
    off();
    await store.close();
  });
});

describe('finding 13: one place for the seeds', () => {
  it('the upgrade’s names are the store’s seeds', () => {
    expect(SEED_NAMES).toEqual(seedProfiles().map((s) => s.name));
    expect(BUNDLED_PROFILES.map((b) => b.name)).toEqual(SEED_NAMES.slice(1));
  });
});

// ------------------------------------------------------------ 15: a deleted space

describe('finding 15: a deleted account database', () => {
  it('is not made again by a late writer; another space’s is not made at all', async () => {
    await loggedIn('Ole');
    resetSpaceForTests({ kind: 'account', nameKey: 'ole' });
    const store = new ProfileStore();
    await store.init();
    // Log out (here or in another tab) deletes the space.
    markDbGone('webcockpit-u-ole');
    await store.close();
    const { dropSpace } = await import('../../src/cloud/space/spaces');
    await dropSpace('ole');
    expect(await dbNames()).not.toContain('webcockpit-u-ole');
    // A late write of this page (the write-back of a game still open).
    await store.create('late', '#nop');
    expect(store.persistent).toBe(false);
    expect(await dbNames()).not.toContain('webcockpit-u-ole');
    // Another account's space is never made by an open that is not its preparation.
    await expect(openWebcockpitDb(factory, 'webcockpit-u-anna')).rejects.toBeInstanceOf(NoSuchSpaceDb);
    expect(await dbNames()).not.toContain('webcockpit-u-anna');
  });

  it('a lost session after a deliberate Log out (in another tab) does not lock the copy', async () => {
    await loggedIn('Ole');
    await put(await spaceDb('ole')(), STORE.profiles, prof('w', 'warrior'));
    resetSpaceForTests({ kind: 'account', nameKey: 'ole' });
    // The other tab logged out: the record goes, then this tab hears `session_ended`.
    writeSpaceRecord(null);
    await sessionLost('logout');
    expect(readSpaceRecord()).toBeNull();
  });
});

// ------------------------------------------------------------ 14 (shared routine)

describe('finding 14: one routine for what is not in the account', () => {
  it('the engine and the stores without keys agree, the untouched seed with a pulled record left out of both', async () => {
    const server = new ServerModel();
    await prepareAccountSpace('one', { fresh: true, deviceLabel: 'phone' });
    await put(await spaceDb('one')(), STORE.profiles, { ...seedProfiles()[0]!, text: '#nop e', modified: 5 });
    await engineOn('one', server).sync();
    await prepareAccountSpace('two', { fresh: true, deviceLabel: 'desktop' });
    const e = engineOn('two', server, new Set([seedId('default')]));
    await e.sync();
    const open = spaceDb('two');
    await put(await open(), STORE.scripts, { id: 's', name: 'hunt', source: 'x', enabled: false, created: 1, updated: 1 } satisfies ScriptRow);
    const viaKeys = await e.unsynced();
    expect(viaKeys.map((u) => u.name)).toEqual(['hunt']);
    expect(await pendingChanges(idbLocalItems(open), idbSyncRecords(open, () => 'x'))).toEqual(viaKeys);
  });
});
