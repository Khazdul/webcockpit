// The two spaces in the browser (ADR 0150): src/core/space.ts, the
// database per space and its version 9 upgrade, and the rule that only
// src/core/db.ts opens a space's database.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, DB_VERSION, STORE, idbDone, idbRequest, openDeviceDb, openWebcockpitDb } from '../../src/core/db';
import {
  SPACE_KEY,
  SPACE_MESSAGE_KEY,
  currentSpace,
  deleteSpaceDb,
  followSpace,
  gameLockName,
  gameRunningElsewhere,
  holdGameLock,
  lockedCopies,
  parseSpaceRecord,
  resetSpaceForTests,
  spaceDbName,
  spaceMessagePending,
  spaceStorageKey,
  switchSpace,
  takeSpaceMessage,
} from '../../src/core/space';
import { ProfileStore } from '../../src/profiles';
import { ScriptLibrary } from '../../src/scripts';

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

function withStorages(): { local: Storage; session: Storage } {
  const local = memStorage();
  const session = memStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  return { local, session };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetSpaceForTests();
});

describe('the space record', () => {
  it('reads open, locked, the other locked copies, and nonsense as none', () => {
    expect(parseSpaceRecord('{"nameKey":"olev","state":"open"}')).toEqual({ nameKey: 'olev', state: 'open' });
    expect(parseSpaceRecord('{"nameKey":"olev","state":"locked","locked":["anna","olev","BAD"]}')).toEqual({
      nameKey: 'olev',
      state: 'locked',
      locked: ['anna'],
    });
    for (const bad of [null, '', 'x', '{}', '{"nameKey":"Olev","state":"open"}', '{"nameKey":"olev","state":"gone"}', '[1]']) {
      expect(parseSpaceRecord(bad)).toBeNull();
    }
    expect(lockedCopies(parseSpaceRecord('{"nameKey":"olev","state":"locked","locked":["anna"]}'))).toEqual(['olev', 'anna']);
    expect(lockedCopies(parseSpaceRecord('{"nameKey":"bert","state":"open","locked":["anna"]}'))).toEqual(['anna']);
    expect(lockedCopies(null)).toEqual([]);
  });

  it('is the device without localStorage or a record', () => {
    expect(currentSpace()).toEqual({ kind: 'device' });
    expect(spaceDbName()).toBe('webcockpit');
    resetSpaceForTests();
    withStorages();
    expect(currentSpace()).toEqual({ kind: 'device' });
  });

  it('is decided once per page: an open record is the account, a locked one the device', () => {
    const { local } = withStorages();
    local.setItem(SPACE_KEY, '{"nameKey":"olev","state":"open"}');
    expect(currentSpace()).toEqual({ kind: 'account', nameKey: 'olev' });
    expect(spaceDbName()).toBe('webcockpit-u-olev');
    local.removeItem(SPACE_KEY);
    expect(currentSpace()).toEqual({ kind: 'account', nameKey: 'olev' });
    resetSpaceForTests();
    local.setItem(SPACE_KEY, '{"nameKey":"olev","state":"locked"}');
    expect(currentSpace()).toEqual({ kind: 'device' });
  });

  it('prefixes per-space keys only in an account space', () => {
    expect(spaceStorageKey('wc.x', { kind: 'device' })).toBe('wc.x');
    expect(spaceStorageKey('wc.x', { kind: 'account', nameKey: 'olev' })).toBe('wc.x@u-olev');
    expect(gameLockName({ kind: 'device' })).toBe('webcockpit-game@device');
    expect(gameLockName({ kind: 'account', nameKey: 'olev' })).toBe('webcockpit-game@u-olev');
  });
});

describe('switching space', () => {
  it('writes the record, leaves the message once, and reloads', () => {
    const { local, session } = withStorages();
    const reload = vi.fn();
    expect(switchSpace({ nameKey: 'olev', state: 'open' }, 'Logged in as Olev.', reload)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(local.getItem(SPACE_KEY)).toBe('{"nameKey":"olev","state":"open"}');
    expect(session.getItem(SPACE_MESSAGE_KEY)).toBe('Logged in as Olev.');
    expect(spaceMessagePending()).toBe(true);
    expect(takeSpaceMessage()).toBe('Logged in as Olev.');
    expect(spaceMessagePending()).toBe(false);
    expect(takeSpaceMessage()).toBeNull();
    expect(session.getItem(SPACE_MESSAGE_KEY)).toBeNull();
    resetSpaceForTests();
    switchSpace(null, undefined, reload);
    expect(local.getItem(SPACE_KEY)).toBeNull();
    expect(takeSpaceMessage()).toBeNull();
  });

  it('does not reload when localStorage refuses the record', () => {
    vi.stubGlobal('localStorage', {
      ...memStorage(),
      setItem: () => {
        throw new Error('full');
      },
    });
    const reload = vi.fn();
    expect(switchSpace({ nameKey: 'olev', state: 'open' }, 'x', reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('follows another tab only when the space it puts the page in changes', () => {
    withStorages();
    const target = new EventTarget();
    const fn = vi.fn();
    const off = followSpace(fn, target as unknown as Window);
    const fire = (key: string | null, newValue: string | null): void => {
      const e = new Event('storage') as Event & { key: string | null; newValue: string | null };
      Object.assign(e, { key, newValue });
      target.dispatchEvent(e);
    };
    fire('wc.other', '{"nameKey":"olev","state":"open"}');
    fire(SPACE_KEY, '{"nameKey":"olev","state":"locked"}'); // still the device's
    expect(fn).not.toHaveBeenCalled();
    fire(SPACE_KEY, '{"nameKey":"olev","state":"open"}');
    expect(fn).toHaveBeenCalledWith({ kind: 'account', nameKey: 'olev' });
    off();
    fire(SPACE_KEY, '{"nameKey":"anna","state":"open"}');
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('the game lock', () => {
  it('is false without Web Locks', async () => {
    vi.stubGlobal('navigator', {});
    expect(await gameRunningElsewhere({ kind: 'device' })).toBe(false);
  });

  it('counts the holders besides this page', async () => {
    const held: { name: string; mode: string }[] = [];
    vi.stubGlobal('navigator', {
      locks: {
        request: (name: string, o: { mode: string }, cb: () => Promise<void>) => {
          const l = { name, mode: o.mode };
          held.push(l);
          return cb().then(() => void held.splice(held.indexOf(l), 1));
        },
        query: async () => ({ held: [...held], pending: [] }),
      },
    });
    const olev = { kind: 'account', nameKey: 'olev' } as const;
    expect(await gameRunningElsewhere(olev)).toBe(false);
    const release = holdGameLock(olev);
    expect(held).toEqual([{ name: 'webcockpit-game@u-olev', mode: 'shared' }]);
    expect(await gameRunningElsewhere(olev)).toBe(false); // this page's own
    held.push({ name: 'webcockpit-game@u-olev', mode: 'shared' }); // another tab
    expect(await gameRunningElsewhere(olev)).toBe(true);
    expect(await gameRunningElsewhere({ kind: 'device' })).toBe(false);
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(held).toHaveLength(1);
    expect(await gameRunningElsewhere(olev)).toBe(true);
  });
});

describe('a database per space', () => {
  it('opens the current space; the device database stays the device', async () => {
    const { local } = withStorages();
    local.setItem(SPACE_KEY, '{"nameKey":"olev","state":"open"}');
    const f = new IDBFactory();
    const acc = await openWebcockpitDb(f);
    expect(acc.name).toBe('webcockpit-u-olev');
    expect(acc.version).toBe(DB_VERSION);
    // One schema: every store exists in an account's database too.
    expect([...acc.objectStoreNames].sort()).toEqual(Object.values(STORE).sort());
    const dev = await openDeviceDb(f);
    expect(dev.name).toBe(DB_NAME);
    acc.close();
    dev.close();
    const names = (await f.databases()).map((d) => d.name).sort();
    expect(names).toEqual(['webcockpit', 'webcockpit-u-olev']);
  });

  it("keeps the device's profiles and scripts apart from an account's", async () => {
    const { local } = withStorages();
    const f = new IDBFactory();
    const devProfiles = new ProfileStore({ factory: f });
    await devProfiles.init();
    await devProfiles.create('guestonly', 'g');
    const devScripts = new ScriptLibrary({ factory: f, bundled: [] });
    await devScripts.create('guestscript', '-- @api 1');
    await devScripts.flush();
    await devScripts.close();
    await devProfiles.close();

    resetSpaceForTests();
    local.setItem(SPACE_KEY, '{"nameKey":"olev","state":"open"}');
    const accProfiles = new ProfileStore({ factory: f });
    await accProfiles.init();
    expect((await accProfiles.list()).map((p) => p.name)).toEqual(['default', 'khazdul']);
    await accProfiles.create('mine', 'm');
    const accScripts = new ScriptLibrary({ factory: f, bundled: [] });
    await accScripts.init();
    expect(accScripts.list().map((s) => s.name)).not.toContain('guestscript');
    await accScripts.close();
    await accProfiles.close();

    resetSpaceForTests();
    local.removeItem(SPACE_KEY);
    const again = new ProfileStore({ factory: f });
    expect((await again.list()).map((p) => p.name)).toEqual(['default', 'guestonly', 'khazdul']);
    await again.close();
    const scriptsAgain = new ScriptLibrary({ factory: f, bundled: [] });
    await scriptsAgain.init();
    expect(scriptsAgain.list().map((s) => s.name)).toContain('guestscript');
    await scriptsAgain.close();
  });

  it('deletes an account database, never the device one', async () => {
    const f = new IDBFactory();
    (await openWebcockpitDb(f, 'webcockpit-u-olev', { create: true })).close();
    (await openDeviceDb(f)).close();
    await deleteSpaceDb('olev', f);
    expect((await f.databases()).map((d) => d.name)).toEqual(['webcockpit']);
    await expect(deleteSpaceDb('', f)).rejects.toThrow();
    await expect(deleteSpaceDb('../webcockpit', f)).rejects.toThrow();
  });
});

/** Builds a version 8 database as stage 10's code did, with two profiles. */
async function version8(f: IDBFactory, name = DB_NAME): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = f.open(name, 8);
    r.onupgradeneeded = () => {
      const d = r.result;
      const runs = d.createObjectStore('runs', { keyPath: 'runId' });
      runs.createIndex('character', 'character');
      runs.createIndex('startedUs', 'startedUs');
      d.createObjectStore('runChunks', { keyPath: ['runId', 'seq'] });
      d.createObjectStore('settings');
      d.createObjectStore('profiles', { keyPath: 'name' });
      const comm = d.createObjectStore('comm', { keyPath: 'seq', autoIncrement: true });
      comm.createIndex('character_ts', ['character', 'ts']);
      comm.createIndex('ts', 'ts');
      d.createObjectStore('timers', { keyPath: 'character' });
      d.createObjectStore('runEvents', { keyPath: ['runId', 'seq'] });
      d.createObjectStore('exports', { keyPath: 'sessionId' });
      d.createObjectStore('maps', { keyPath: 'key' });
      d.createObjectStore('mapIds', { keyPath: ['mapHash', 'serverId'] });
      d.createObjectStore('scripts', { keyPath: 'id' });
      d.createObjectStore('scriptData', { keyPath: 'name' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const tx = db.transaction(['profiles', 'scripts', 'mapIds'], 'readwrite');
  tx.objectStore('profiles').put({ name: 'default', text: 'd', created: 1, modified: 2 });
  tx.objectStore('profiles').put({ name: 'ranger', text: 'r', created: 3, modified: 4 });
  tx.objectStore('scripts').put({ id: 's1', name: 'mine', source: '-- @api 1', enabled: true, created: 1, updated: 1 });
  tx.objectStore('mapIds').put({ mapHash: 'h', serverId: 5, room: 6 });
  await idbDone(tx);
  db.close();
}

describe('database version 9', () => {
  it('gives every existing profile an id and adds sync and syncMeta, keeping the rest', async () => {
    const f = new IDBFactory();
    await version8(f);
    const db = await openWebcockpitDb(f);
    expect(db.version).toBe(9);
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['sync', 'syncMeta']));
    const tx = db.transaction(['profiles', 'scripts', 'mapIds', 'sync', 'syncMeta'], 'readwrite');
    const profiles = await idbRequest(tx.objectStore('profiles').getAll());
    expect(profiles.map((p: { name: string }) => p.name)).toEqual(['default', 'ranger']);
    for (const p of profiles) expect(typeof p.id === 'string' && p.id.length >= 8).toBe(true);
    expect(profiles[0].id).not.toBe(profiles[1].id);
    expect(profiles[1]).toMatchObject({ name: 'ranger', text: 'r', created: 3, modified: 4 });
    expect(await idbRequest(tx.objectStore('scripts').getAll())).toHaveLength(1);
    expect(await idbRequest(tx.objectStore('mapIds').getAll())).toHaveLength(1);
    // sync: keyed by kind and local key; syncMeta: out-of-line keys.
    tx.objectStore('sync').put({ kind: 'profile', key: 'ranger', id: 'x', rev: 1, hash: 'h', state: 'synced' });
    tx.objectStore('syncMeta').put('c-1', 'cursor');
    expect(await idbRequest(tx.objectStore('sync').get(['profile', 'ranger']))).toMatchObject({ id: 'x' });
    await idbDone(tx);
    db.close();
  });

  it('the ids survive a reopen and a rename', async () => {
    const f = new IDBFactory();
    await version8(f);
    const s = new ProfileStore({ factory: f });
    await s.init();
    const before = await s.get('ranger');
    await s.rename('ranger', 'hunter');
    await s.close();
    const t = new ProfileStore({ factory: f });
    expect((await t.get('hunter'))?.id).toBe(before!.id);
    await t.close();
  });
});

describe('only src/core/db.ts opens a space database', () => {
  // src/cloud/account/store.ts opens the keys' own database `webcockpit-account` (ADR 0145): not a space.
  const ALLOWED_OPEN = new Set(['src/core/db.ts', 'src/cloud/account/store.ts']);
  const ALLOWED_DELETE = new Set(['src/core/space.ts', 'src/cloud/account/store.ts']);

  function files(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) files(p, out);
      else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
    }
    return out;
  }

  it('holds for every source file', () => {
    const root = join(__dirname, '../..');
    const opens: string[] = [];
    const deletes: string[] = [];
    for (const p of files(join(root, 'src'))) {
      const rel = relative(root, p).replaceAll('\\', '/');
      const src = readFileSync(p, 'utf8').replace(/^\s*\/\/.*$/gm, '');
      // `indexedDB.open(`, or `<factory>.open(name, version)` on any IDBFactory.
      if (/\bindexedDB\s*(\?\.|!?\.)\s*open\s*\(/.test(src) || /\.open\(\s*[^,()]+,\s*(\w*VERSION\w*|\d+)\s*\)/.test(src)) opens.push(rel);
      if (/\bdeleteDatabase\s*\(/.test(src)) deletes.push(rel);
    }
    expect(opens.filter((f) => !ALLOWED_OPEN.has(f))).toEqual([]);
    expect(deletes.filter((f) => !ALLOWED_DELETE.has(f))).toEqual([]);
    // The test sees what it is meant to see.
    expect(opens).toContain('src/core/db.ts');
    expect(deletes).toContain('src/core/space.ts');
  });
});
