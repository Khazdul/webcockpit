// Stage 61 part C: the sync's flows on the two spaces. The engine's ports
// on IndexedDB and fetch (src/cloud/space/local.ts, remote.ts), the move
// (move.ts), Log out's decisions, the lost session (lock, remove, unlock),
// the hand-back and the words. IndexedDB is fake-indexeddb; the server is
// the in-memory model of tests/unit/cloud-sync-model.ts behind a fetch.

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncKind } from '../../shared/cloud/api';
import { createAccountStore } from '../../src/cloud/account/store';
import { deriveKeys, makeRoot } from '../../src/cloud/crypto';
import { enterAccount, deleteHandBack, leaveAccount, lockedNotice, removeLocked, sessionLost, setLeaving } from '../../src/cloud/space/flows';
import { META, idbLocalItems, idbSyncRecords, readMeta, writeMeta } from '../../src/cloud/space/local';
import { beginMove, continueMove, moveState } from '../../src/cloud/space/move';
import { type SyncFetch, fetchRemote } from '../../src/cloud/space/remote';
import {
  deviceDb,
  handBack,
  notInAccount,
  pendingChanges,
  prepareAccountSpace,
  recordOpening,
  recordWithout,
  resetSpaceConnsForTests,
  runCounts,
  spaceDb,
  writeThings,
} from '../../src/cloud/space/spaces';
import {
  countWords,
  eventWords,
  keptWords,
  lockedWords,
  moveWaitWords,
  movedLine,
  movedWords,
  movingWords,
  unsyncedLines,
} from '../../src/cloud/space/words';
import { SyncEngine } from '../../src/cloud/sync/engine';
import { RemoteError, type SyncKeys } from '../../src/cloud/sync/types';
import { resetSyncViewForTests, setPlaying, syncView } from '../../src/cloud/sync-view';
import { STORE, idbDone, idbRequest, openDeviceDb, openWebcockpitDb } from '../../src/core/db';
import { SPACE_KEY, SPACE_MESSAGE_KEY, readSpaceRecord, resetSpaceForTests, writeSpaceRecord } from '../../src/core/space';
import { PROFILE_TEMPLATE, ProfileStore, SEED_TIME, isUntouchedSeed, seedId } from '../../src/profiles';
import { type Answer, ServerModel } from './cloud-sync-model';

/** A Storage over a Map. */
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

/** The model server behind a fetch, as the Worker answers (X-WC on writes, If-Match). */
function modelFetch(server: ServerModel, net: { offline: boolean } = { offline: false }): SyncFetch {
  return async (url, init) => {
    if (net.offline) throw new TypeError('Failed to fetch');
    const u = new URL(url, 'https://wc.test');
    const method = init.method ?? 'GET';
    const h = (init.headers ?? {}) as Record<string, string>;
    let a: Answer;
    if (u.pathname === '/api/u/sync/changes') {
      const limit = u.searchParams.get('limit');
      a = server.changes(Number(u.searchParams.get('since')), limit === null ? undefined : Number(limit));
    } else {
      const [kind, id] = u.pathname.slice('/api/u/sync/items/'.length).split('/').map(decodeURIComponent);
      if (h['X-WC'] !== '1') a = { status: 403, body: { error: 'forbidden' } };
      else if (method === 'PUT') {
        expect(h['Content-Type']).toBe('application/octet-stream');
        a = server.put(kind!, id!, Number(h['If-Match']), init.body as Uint8Array);
      } else a = server.remove(kind!, id!, Number(h['If-Match']));
    }
    return { status: a.status, json: async () => (a.body === undefined ? Promise.reject(new SyntaxError('none')) : structuredClone(a.body)) };
  };
}

let local: Storage;
let session: Storage;
let keys: SyncKeys;

beforeEach(async () => {
  local = memStorage();
  session = memStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('indexedDB', new IDBFactory());
  resetSpaceForTests();
  resetSpaceConnsForTests();
  resetSyncViewForTests();
  keys ??= await deriveKeys(makeRoot());
});

afterEach(() => {
  setLeaving(false);
  vi.unstubAllGlobals();
  resetSpaceForTests();
  resetSpaceConnsForTests();
});

type ProfileRow = { id: string; name: string; text: string; created: number; modified: number };
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
const script = (id: string, name: string, source = `-- @name ${name}\nprint(1)`, t = 1000): ScriptRow => ({ id, name, source, enabled: true, created: t, updated: t });

/** A device's database with the seeds (as a new device) and `own` things. */
async function deviceWith(profiles: ProfileRow[], scripts: ScriptRow[] = []): Promise<IDBDatabase> {
  const store = new ProfileStore();
  await store.init();
  await store.close();
  const db = await openDeviceDb();
  if (profiles.length) await put(db, STORE.profiles, ...profiles);
  if (scripts.length) await put(db, STORE.scripts, ...scripts);
  return db;
}

/** An engine on an account's space, over the model server. */
function engineOn(nameKey: string, server: ServerModel, net = { offline: false }, label = 'desktop, Firefox'): SyncEngine {
  const open = spaceDb(nameKey);
  return new SyncEngine({ local: idbLocalItems(open), records: idbSyncRecords(open, () => label), remote: fetchRemote(modelFetch(server, net)), keys });
}

// ------------------------------------------------------------ the seeds

describe('the seeds', () => {
  it('a new device seeds default and khazdul with fixed ids and times; untouched until changed', async () => {
    const store = new ProfileStore();
    await store.init();
    const list = await store.list();
    expect(list.map((p) => [p.name, p.id, p.created, p.modified])).toEqual([
      ['default', seedId('default'), SEED_TIME, SEED_TIME],
      ['khazdul', seedId('khazdul'), SEED_TIME, SEED_TIME],
    ]);
    expect(list.every(isUntouchedSeed)).toBe(true);
    await store.save('default', `${PROFILE_TEMPLATE}\n#alias {x} {y}`);
    expect(isUntouchedSeed((await store.get('default'))!)).toBe(false);
    await store.close();
  });
});

// ------------------------------------------------------------ the ports

describe('LocalItems and SyncRecords on IndexedDB', () => {
  it('lists profiles (untouched seeds left out until they have a record) and user scripts', async () => {
    await prepareAccountSpace('Ole', { fresh: true, deviceLabel: 'phone' });
    const open = spaceDb('ole');
    const db = await open();
    await put(db, STORE.profiles, prof('p1', 'warrior'));
    await put(db, STORE.scripts, script('s1', 'hunt'));
    const li = idbLocalItems(open);
    expect((await li.list('profile')).map((i) => i.key)).toEqual(['p1']);
    expect((await li.list('script')).map((i) => i.body)).toEqual([script('s1', 'hunt')]);
    // A record for the seed: from then on it is an item, untouched or not.
    await idbSyncRecords(open, () => 'x').write({
      put: [{ kind: 'profile', serverId: 'A'.repeat(22), key: seedId('default'), name: 'default', rev: 1, hash: 'h', bare: 'b', state: 'synced' }],
      remove: [],
    });
    expect((await li.list('profile')).map((i) => i.key).sort()).toEqual(['p1', seedId('default')]);
  });

  it('writes a batch in one transaction, removes before it puts: a swap of names and a rename by id', async () => {
    const open = spaceDb('ole');
    const db = await open();
    await put(db, STORE.profiles, prof('a', 'one'), prof('b', 'two'), prof('c', 'gone'));
    const written = vi.fn();
    const li = idbLocalItems(open, { written });
    await li.write('profile', { put: [{ ...prof('a', 'two') }, { ...prof('b', 'one') }], remove: ['c'] });
    const rows = await all<ProfileRow>(db, STORE.profiles);
    expect(rows.map((r) => [r.name, r.id]).sort()).toEqual([
      ['one', 'b'],
      ['two', 'a'],
    ]);
    expect(written).toHaveBeenCalledWith('profile');
  });

  it("a script's @name follows a name the sync gave it", async () => {
    const open = spaceDb('ole');
    const li = idbLocalItems(open);
    await li.write('script', { put: [{ ...script('s1', 'hunt_from_phone_14Nov', '-- @name hunt\nprint(1)') }, { ...script('s2', 'bare', 'print(2)') }], remove: [] });
    const rows = await all<ScriptRow>(await open(), STORE.scripts);
    expect(rows.find((r) => r.id === 's1')!.source).toBe('-- @name hunt_from_phone_14Nov\nprint(1)');
    // No header: left alone.
    expect(rows.find((r) => r.id === 's2')!.source).toBe('print(2)');
  });

  it('records by server id; meta with the stored label, or the default', async () => {
    const open = spaceDb('ole');
    const r = idbSyncRecords(open, () => 'desktop, Chrome');
    expect(await r.meta()).toEqual({ cursor: 0, lastSynced: null, deviceLabel: 'desktop, Chrome' });
    await writeMeta(open, { [META.deviceLabel]: 'phone' });
    await r.setMeta({ cursor: 7, lastSynced: 5 });
    expect(await r.meta()).toEqual({ cursor: 7, lastSynced: 5, deviceLabel: 'phone' });
    const rec = { kind: 'script' as SyncKind, serverId: 'B'.repeat(22), key: null, name: null, rev: 3, hash: null, bare: null, state: 'newer' as const };
    await r.write({ put: [rec], remove: [] });
    expect(await r.list()).toEqual([rec]);
    await r.write({ put: [], remove: [{ kind: 'script', serverId: 'B'.repeat(22) }] });
    expect(await r.list()).toEqual([]);
  });
});

describe('Remote over fetch', () => {
  const id = 'C'.repeat(22);
  it('maps the answers as the contract says', async () => {
    const server = new ServerModel();
    const net = { offline: false };
    const remote = fetchRemote(modelFetch(server, net));
    const blob = new Uint8Array([1, 2, 3]);
    expect(await remote.put('profile', id, 0, blob)).toMatchObject({ status: 'ok', written: { rev: 1, seq: 1 } });
    expect(await remote.put('profile', id, 0, blob)).toMatchObject({ status: 'conflict', current: { rev: 1 } });
    // A missing item is a tombstone of rev 0.
    expect(await remote.remove('profile', 'D'.repeat(22), 0)).toMatchObject({ status: 'conflict', current: { rev: 0, deleted: true } });
    server.limits.itemMaxBytes = 2;
    expect(await remote.put('profile', id, 1, blob)).toEqual({ status: 'full', error: 'item_too_large' });
    expect((await remote.changes(0)).items).toHaveLength(1);
    net.offline = true;
    await expect(remote.changes(0)).rejects.toMatchObject({ kind: 'offline' });
    net.offline = false;
    server.ended = 'password';
    await expect(remote.changes(0)).rejects.toEqual(new RemoteError('session_ended', { reason: 'password', status: 401 }));
  });

  it('401 without the reason is not_logged_in; 5xx and 429 server; another 4xx refused', async () => {
    const answer = (status: number, body: unknown): SyncFetch => async () => ({ status, json: async () => body });
    await expect(fetchRemote(answer(401, { error: 'unauthorized' })).changes(0)).rejects.toMatchObject({ kind: 'not_logged_in' });
    await expect(fetchRemote(answer(503, {})).changes(0)).rejects.toMatchObject({ kind: 'server' });
    await expect(fetchRemote(answer(429, {})).put('profile', id, 0, new Uint8Array(1))).rejects.toMatchObject({ kind: 'server' });
    await expect(fetchRemote(answer(404, { error: 'not_found' })).put('profile', id, 0, new Uint8Array(1))).rejects.toMatchObject({ kind: 'refused' });
    await expect(fetchRemote(answer(200, { nope: 1 })).changes(0)).rejects.toMatchObject({ kind: 'refused' });
  });
});

describe('the engine on two IndexedDB devices', () => {
  it('a profile made on one is on the other; the same profile changed on both keeps both', async () => {
    const server = new ServerModel();
    // Device A (this global indexedDB) and device B (its own factory).
    await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'desktop, Firefox' });
    const a = engineOn('ole', server);
    const bFactory = new IDBFactory();
    const bOpen = async (): Promise<IDBDatabase> => openWebcockpitDb(bFactory, 'webcockpit-u-ole');
    const bDb = await bOpen();
    const b = new SyncEngine({ local: idbLocalItems(bOpen), records: idbSyncRecords(bOpen, () => 'phone'), remote: fetchRemote(modelFetch(server)), keys });
    const aDb = await spaceDb('ole')();
    await put(aDb, STORE.profiles, prof('w', 'warrior'));
    expect(await a.sync()).toEqual({ type: 'synced' });
    expect(await b.sync()).toEqual({ type: 'synced' });
    expect((await all<ProfileRow>(bDb, STORE.profiles)).map((p) => p.name)).toEqual(['warrior']);
    // Both change it; A first.
    await put(aDb, STORE.profiles, prof('w', 'warrior', '#nop A', 2000));
    await put(bDb, STORE.profiles, prof('w', 'warrior', '#nop B', 2001));
    const events: string[] = [];
    const b2 = new SyncEngine({
      local: idbLocalItems(bOpen),
      records: idbSyncRecords(bOpen, () => 'phone'),
      remote: fetchRemote(modelFetch(server)),
      keys,
      events: { emit: (e) => events.push(eventWords(e) ?? e.type) },
    });
    await a.sync();
    await b2.sync();
    await a.sync();
    const names = (await all<ProfileRow>(aDb, STORE.profiles)).map((p) => p.name).filter((n) => n.startsWith('warrior')).sort();
    expect(names).toHaveLength(2);
    expect(names[0]).toBe('warrior');
    expect(names[1]).toMatch(/^warrior_from_phone_\d+[A-Z][a-z]{2}$/);
    expect(events[0]).toMatch(/^warrior was changed on two devices\. Both are kept: warrior and warrior_from_phone_/);
  });
});

// ------------------------------------------------------------ the move

describe('Create account: the move', () => {
  it('copies the own things with their ids; each leaves the device once the server has it; seeds stay', async () => {
    await deviceWith([prof('w', 'warrior'), prof('m', 'mage')], [script('s', 'hunt')]);
    const { total } = await beginMove('Ole', 'desktop, Firefox');
    expect(total).toEqual({ profiles: 2, scripts: 1 });
    const acct = await spaceDb('ole')();
    expect((await all<ProfileRow>(acct, STORE.profiles)).map((p) => p.id).sort()).toEqual(['m', seedId('default'), seedId('khazdul'), 'w']);
    expect(await readMeta(spaceDb('ole'), [META.account])).toEqual({ account: { name: 'Ole', nameKey: 'ole' } });
    // Nothing synced yet: nothing leaves the device.
    expect(await continueMove(spaceDb('ole'))).toMatchObject({ moved: 0, left: { profiles: 2, scripts: 1 }, done: false });
    const server = new ServerModel();
    expect(await engineOn('ole', server).sync()).toEqual({ type: 'synced' });
    expect(await continueMove(spaceDb('ole'))).toMatchObject({ moved: 3, justDone: true, done: true });
    const dev = await deviceDb();
    expect((await all<ProfileRow>(dev, STORE.profiles)).map((p) => p.name).sort()).toEqual(['default', 'khazdul']);
    expect(await all(dev, STORE.scripts)).toEqual([]);
    // The untouched seeds never went to the server.
    expect(server.all()).toHaveLength(3);
  });

  it('an edited seed moves (it is the account seed’s item); an interrupted move goes on later', async () => {
    const store = new ProfileStore();
    await store.init();
    await store.save('default', '#nop mine');
    await store.close();
    await deviceWith([prof('w', 'warrior')]);
    await beginMove('ole', 'phone');
    const acct = await spaceDb('ole')();
    expect((await all<ProfileRow>(acct, STORE.profiles)).find((p) => p.name === 'default')!.text).toBe('#nop mine');
    const server = new ServerModel();
    const net = { offline: true };
    expect((await engineOn('ole', server, net).sync()).type).toBe('offline');
    expect(await continueMove(spaceDb('ole'))).toMatchObject({ moved: 0, done: false, left: { profiles: 2, scripts: 0 } });
    // A later load: online again.
    net.offline = false;
    resetSpaceConnsForTests();
    await engineOn('ole', server, net).sync();
    expect(await continueMove(spaceDb('ole'))).toMatchObject({ moved: 2, done: true });
    const dev = await deviceDb();
    const left = await all<ProfileRow>(dev, STORE.profiles);
    // The device's edited default left; the profile store seeds it again at the next start.
    expect(left.map((p) => p.name)).toEqual(['khazdul']);
    expect((await moveState(spaceDb('ole')))!.doneAt).not.toBeNull();
  });
});

// ------------------------------------------------------------ log out, the lost session, delete

describe('what is not in the account', () => {
  it('changes by local key (no keys needed) and the runs', async () => {
    await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'phone' });
    const open = spaceDb('ole');
    const db = await open();
    await put(db, STORE.profiles, prof('w', 'warrior'));
    await put(db, STORE.scripts, script('s', 'hunt'));
    expect((await pendingChanges(idbLocalItems(open), idbSyncRecords(open, () => 'x'))).map((u) => [u.kind, u.name, u.change])).toEqual([
      ['profile', 'warrior', 'new'],
      ['script', 'hunt', 'new'],
    ]);
    const server = new ServerModel();
    const engine = engineOn('ole', server);
    await engine.sync();
    expect(await pendingChanges(idbLocalItems(open), idbSyncRecords(open, () => 'x'))).toEqual([]);
    expect(await engine.unsynced()).toEqual([]);
    await put(db, STORE.profiles, prof('w', 'warrior', '#nop 2', 3000));
    expect(await pendingChanges(idbLocalItems(open), idbSyncRecords(open, () => 'x'))).toEqual(await engine.unsynced());
    const now = Date.now();
    await put(db, STORE.runs, { runId: 'r1', saved: true, startedUs: 1 }, { runId: 'r2', startedUs: now * 1000 }, { runId: 'r3', startedUs: (now - 20 * 86_400_000) * 1000 });
    expect(await runCounts(open, now)).toEqual({ saved: 1, unsaved: 1 });
    expect(await notInAccount('ole')).toMatchObject({ savedRuns: 1, changes: [{ name: 'warrior', change: 'edit' }] });
  });
});

/** Logged in as `name` on this device, in its space (keys stored, hint and record written). */
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

describe('a lost session', () => {
  it('nothing outside the account: the copy is removed, the keys too', async () => {
    await loggedIn('Ole');
    await sessionLost('password');
    expect(readSpaceRecord()).toBeNull();
    expect(session.getItem(SPACE_MESSAGE_KEY)).toBe('You were logged out of Ole on this device.');
    expect(await dbNames()).not.toContain('webcockpit-u-ole');
    expect(await createAccountStore().read()).toBeNull();
    expect(local.getItem('wc.account')).toBeNull();
  });

  it('something not in the account: kept, locked; the notice names it; a login to the same account unlocks', async () => {
    await loggedIn('Ole');
    await put(await spaceDb('ole')(), STORE.profiles, prof('w', 'warrior'));
    await sessionLost('ended');
    expect(readSpaceRecord()).toEqual({ nameKey: 'ole', state: 'locked' });
    expect(session.getItem(SPACE_MESSAGE_KEY)).toBeNull();
    resetSpaceForTests();
    const n = await lockedNotice();
    expect(n).toEqual({ nameKey: 'ole', name: 'Ole', what: '1 change', lost: ['the profile warrior'] });
    expect(lockedWords(n!.name, n!.what)).toBe('1 change is not in the account Ole yet. It is kept on this device until you log in.');
    // Another account's login leaves it alone.
    expect(await enterAccount('Anna')).toBe(true);
    expect(readSpaceRecord()).toEqual({ nameKey: 'anna', state: 'open', locked: ['ole'] });
    // Anna's session goes too, with nothing of hers: Ole's copy is still the locked one.
    resetSpaceForTests();
    await sessionLost(null);
    expect(readSpaceRecord()).toEqual({ nameKey: 'ole', state: 'locked' });
    // Ole logs in again: the same database, open.
    resetSpaceForTests();
    expect(await enterAccount('Ole')).toBe(true);
    expect(readSpaceRecord()).toEqual({ nameKey: 'ole', state: 'open' });
    expect((await all<ProfileRow>(await spaceDb('ole')(), STORE.profiles)).map((p) => p.name)).toContain('warrior');
  });

  it('a saved run alone keeps the copy; Remove deletes it', async () => {
    await loggedIn('Ole');
    await put(await spaceDb('ole')(), STORE.runs, { runId: 'r1', saved: true, startedUs: 1 });
    await sessionLost('expired');
    resetSpaceForTests();
    const n = await lockedNotice();
    expect(n).toMatchObject({ what: '1 saved run', lost: ['1 saved run'] });
    await removeLocked('ole');
    expect(readSpaceRecord()).toBeNull();
    expect(await dbNames()).not.toContain('webcockpit-u-ole');
    expect(syncView().locked).toBeNull();
  });

  it('deleted: removed whatever it holds; during a game it waits for the start page', async () => {
    await loggedIn('Ole');
    await put(await spaceDb('ole')(), STORE.profiles, prof('w', 'warrior'));
    setPlaying(true);
    await sessionLost('deleted');
    expect(readSpaceRecord()).toEqual({ nameKey: 'ole', state: 'open' });
    setPlaying(false);
    const { sessionLostLater } = await import('../../src/cloud/space/flows');
    await sessionLostLater();
    expect(readSpaceRecord()).toBeNull();
    expect(session.getItem(SPACE_MESSAGE_KEY)).toBe('The account Ole was deleted.');
    expect(local.getItem('wc.account.last')).toBeNull();
  });
});

describe('Log out and Delete account', () => {
  it('log out drops the copy and says so; the other locked copies stay', async () => {
    writeSpaceRecord({ nameKey: 'anna', state: 'locked' });
    await loggedIn('Ole');
    expect(readSpaceRecord()).toEqual({ nameKey: 'ole', state: 'open', locked: ['anna'] });
    expect(await leaveAccount('Logged out. Everything is in your account Ole.')).toBe(true);
    expect(readSpaceRecord()).toEqual({ nameKey: 'anna', state: 'locked' });
    expect(await dbNames()).not.toContain('webcockpit-u-ole');
    expect(recordWithout('anna')).toBeNull();
  });

  it('hands the account’s things back: a name on both sides keeps both, an id the device has is new', async () => {
    await deviceWith([prof('w', 'warrior', '#nop device')], [script('s', 'hunt', '-- @name hunt\nprint("device")')]);
    await loggedIn('Ole');
    const acct = await spaceDb('ole')();
    await put(acct, STORE.profiles, prof('w', 'warrior', '#nop account'), prof('m', 'mage'), { ...prof(seedId('default'), 'default', '#nop changed') });
    await put(acct, STORE.scripts, script('s2', 'hunt', '-- @name hunt\nprint("account")'), script('s3', 'loot'));
    expect(await handBack('ole')).toEqual({ profiles: 3, scripts: 2 });
    const dev = await deviceDb();
    const ps = await all<ProfileRow>(dev, STORE.profiles);
    expect(ps.map((p) => p.name).sort()).toEqual(['default', 'default_2', 'khazdul', 'mage', 'warrior', 'warrior_2']);
    const w2 = ps.find((p) => p.name === 'warrior_2')!;
    expect(w2.text).toBe('#nop account');
    expect(w2.id).not.toBe('w');
    const ss = await all<ScriptRow>(dev, STORE.scripts);
    expect(ss.map((s) => s.name).sort()).toEqual(['hunt', 'hunt_2', 'loot']);
    expect(ss.find((s) => s.name === 'hunt_2')!.source).toBe('-- @name hunt_2\nprint("account")');
  });

  it('deleteHandBack: the things back, the copy gone, the message', async () => {
    await loggedIn('Ole');
    await put(await spaceDb('ole')(), STORE.profiles, prof('m', 'mage'));
    expect(await deleteHandBack('Ole')).toBe(true);
    expect(readSpaceRecord()).toBeNull();
    expect(session.getItem(SPACE_MESSAGE_KEY)).toBe('The account Ole is deleted. Its profiles and scripts are this device’s now.');
    expect((await all<ProfileRow>(await deviceDb(), STORE.profiles)).map((p) => p.name)).toContain('mage');
  });

  it('a lost session while a log out runs is that log out’s', async () => {
    await loggedIn('Ole');
    setLeaving(true);
    await sessionLost('logout');
    expect(local.getItem(SPACE_KEY)).not.toBeNull();
  });
});

describe('the account flows on session_ended', () => {
  it('log the device out, hand the reason to `lost`, and give the page `unauthorized`', async () => {
    const { createAccountFlows } = await import('../../src/cloud/account/flows');
    const { resetAccountStateForTest } = await import('../../src/cloud/account/state');
    resetAccountStateForTest();
    const me = { name: 'Ole', created: 1, label: 'x', savedAt: 1, ...keys };
    let stored: typeof me | null = me;
    const lost = vi.fn();
    const flows = createAccountFlows({
      api: { account: async () => ({ ok: false, code: 'session_ended', reason: 'recovered', status: 401 }) } as never,
      store: {
        read: async () => stored,
        write: async () => {},
        remove: async () => {
          stored = null;
          return true;
        },
        works: async () => true,
      },
      crypto: () => import('../../src/cloud/crypto'),
      enabled: async () => true,
      label: () => 'x',
      now: () => 1,
      lost,
    });
    expect(await flows.loadAccount()).toEqual({ ok: false, code: 'unauthorized' });
    expect(lost).toHaveBeenCalledWith('recovered');
    expect(stored).toBeNull();
  });
});

describe('writeThings', () => {
  it('skips a thing identical to the one of its name', async () => {
    const db = await deviceWith([prof('w', 'warrior')]);
    const out = await writeThings(deviceDb, { profiles: [prof('x', 'warrior')], scripts: [] }, { keepIds: false });
    expect(out.profiles).toEqual([]);
    expect((await all<ProfileRow>(db, STORE.profiles)).filter((p) => p.name.startsWith('warrior'))).toHaveLength(1);
  });
});

// ------------------------------------------------------------ the words

describe('the words', () => {
  it('as round 9 has them', () => {
    expect(movedWords('ole', { profiles: 4, scripts: 2 })).toBe('Moved into ole: 4 profiles, 2 scripts. This device is back at its starting set.');
    expect(movingWords('ole', 3, 6)).toBe('Moving 6 things into ole… 3 of 6');
    expect(moveWaitWords('ole', 4, { profiles: 0, scripts: 2 })).toBe(
      '4 things moved into ole. 2 scripts still to move: they go when the server can be reached, and stay on this device until then.',
    );
    expect(moveWaitWords('ole', 1, { profiles: 1, scripts: 0 })).toBe(
      '1 thing moved into ole. 1 profile still to move: it goes when the server can be reached, and stays on this device until then.',
    );
    expect(movedLine({ profiles: 4, scripts: 2 })).toBe('Moved here from this device when the account was made: 4 profiles, 2 scripts.');
    expect(countWords({ profiles: 1, scripts: 0 })).toBe('1 profile');
    expect(keptWords(3, 0)).toBe('3 changes');
    expect(keptWords(1, 2)).toBe('1 change and 2 saved runs');
    expect(lockedWords('ole', '3 changes')).toBe('3 changes are not in the account ole yet. They are kept on this device until you log in.');
    expect(
      unsyncedLines([
        { kind: 'profile', key: 'a', name: 'warrior', change: 'edit' },
        { kind: 'script', key: 'b', name: 'autoloot', change: 'new' },
        { kind: 'script', key: 'c', name: 'hunt', change: 'new' },
        { kind: 'script', key: 'd', name: 'old', change: 'delete' },
      ]),
    ).toEqual(['the profile warrior', 'the scripts autoloot and hunt', '1 deleted script']);
    expect(eventWords({ type: 'keptBoth', kind: 'profile', key: 'k', name: 'warrior', copyKey: 'c', copyName: 'warrior_from_phone_14Nov' })).toBe(
      'warrior was changed on two devices. Both are kept: warrior and warrior_from_phone_14Nov.',
    );
    expect(eventWords({ type: 'renamed', kind: 'script', key: 'k', from: 'hunt', to: 'hunt_2' })).toBe(
      'Another device made a script named hunt too. Both are kept: this one is now hunt_2.',
    );
    expect(eventWords({ type: 'full', kind: 'script', key: 'k', name: null, error: 'storage_full' })).toBeNull();
  });
});
