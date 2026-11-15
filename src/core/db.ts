// The IndexedDB databases of the app (ADR 0006, ADR 0008, ADR 0010, ADR 0150).
//
// One database per space (src/core/space.ts): the device's `webcockpit`,
// and a logged-in account's `webcockpit-u-<nameKey>`. One schema for both:
// the upgrade chain below builds every space's database.
// `openWebcockpitDb()` opens the current space's; `openDeviceDb()` always
// opens `webcockpit` (the map, the tilesets and the locator's ids are the
// device's whoever is logged in: in an account's database `maps` and
// `mapIds` stay empty). This file and src/core/space.ts (deleteDatabase)
// are the only ones in src/ that open or delete a space's database (a
// unit test holds that).
//
// Schema:
//
//   version 1 (stage 1, capture — see src/capture/store.ts)
//     runs       keyPath 'runId'   indexes 'character', 'startedUs'
//     runChunks  keyPath ['runId', 'seq']
//   version 2 (stage 2)
//     settings   out-of-line keys; one record under key 'main' (src/settings)
//     profiles   keyPath 'name'; { name, text, created, modified } (ADR 0010)
//   version 3 (stage 4)
//     comm       keyPath 'seq' (autoIncrement); one record per Comm message
//                indexes 'character_ts' ['character', 'ts'], 'ts'
//                (src/gmcp/comm-archive.ts, ADR 0016)
//   version 4 (stage 5)
//     timers     keyPath 'character'; one record per character
//                { character, savedAt, state } (src/timers/archive.ts, ADR 0017)
//   version 5 (stage 6)
//     runEvents  keyPath ['runId', 'seq']; { runId, seq, event: RunEvent }
//                (src/runs/store.ts, ADR 0018). `runs` records gain the
//                optional fields saved, rating, savedUs, summary (additive,
//                no data migration: absent = the default)
//   version 6 (stage 7)
//     exports    keyPath 'sessionId'; one export editor record per session
//                (ExportDoc, keyed by the chain's first run id;
//                src/share/edits.ts, src/runs/store.ts, ADR 0019)
//   version 7 (stage 9)
//     maps       keyPath 'key'; one record 'current', the imported map:
//                { key, name, size, date, bytes: ArrayBuffer, hash, rooms? }
//                (absent = the bundled public/map/arda.mm2; ADR 0020)
//     mapIds     keyPath ['mapHash', 'serverId']; server ids the locator
//                learned: { mapHash, serverId, room } (room = index in
//                that map; src/map, ADR 0020)
//   version 8 (stage 10)
//     scripts    keyPath 'id'; user scripts { id, name, source, enabled,
//                created, updated } (src/scripts/library.ts, ADR 0051)
//     scriptData keyPath 'name'; per script name, bundled or user:
//                { name, enabled?, settings, store } (ADR 0051)
//   version 9 (stage 61, ADR 0150)
//     profiles   records gain `id` (random; filled for existing records
//                here, given to new ones, kept on rename)
//     sync       keyPath ['kind', 'key']; per synced item: { kind, key
//                (the local key), id (server id), rev, hash, state }
//                (src/cloud/sync; empty in the device's database)
//     syncMeta   out-of-line keys; account, cursor, device label (an
//                account's space); `seeded` in every space's database
//                (src/profiles/seed-ids.ts: the seeds were put there once)
//   version 10 (stage 63, ADR 0153)
//     runCloud   keyPath 'runId', index 'state'; per run the cloud knows or
//                should know: { runId, state (queued | up | full |
//                tooLarge | remote | fetching), serverId, size, tries, at,
//                startedUs, meta? (remote rows) } (src/cloud/runs/types.ts;
//                empty in the device's database)
//
// The upgrade handler is a chain of `if (oldVersion < N)` steps, so every
// older database upgrades in order. Add a step (and bump DB_VERSION) for
// every new store; never edit an old step.
//
// Every connection closes itself on `versionchange`, so a tab running newer
// code can upgrade the database while this tab stays open. The module that
// owns a connection must be ready for its transactions to fail afterwards.
//
// Superseded (ADR 0025): once a newer tab has upgraded the database past
// DB_VERSION (a `versionchange` to a higher version, or an open that fails
// with `VersionError`), this tab can no longer save anything; its stores
// fall back to memory. `onDbSuperseded` tells the app so it can say so. Other
// open failures (private mode, no IndexedDB) are not reported here.
//
// Deleted (stage 61): an account's database is made only while its space
// is prepared, or as the page's own space at load. Once this page has seen
// it deleted (a Log out here or in another tab), a late write does not make
// an empty one again: the open fails with `NoSuchSpaceDb` and the store
// falls back to memory, as when superseded.

import { seedIdOf } from '../profiles/seed-ids';
import { ACCOUNT_SPACE_PREFIX, DEVICE_DB_NAME, currentSpace, spaceDbName } from './space';

/** The device's database (the space of a guest). */
export const DB_NAME = DEVICE_DB_NAME;
export const DB_VERSION = 10;

/** Object store names, for callers outside this module. */
export const STORE = {
  runs: 'runs',
  runChunks: 'runChunks',
  settings: 'settings',
  profiles: 'profiles',
  comm: 'comm',
  timers: 'timers',
  runEvents: 'runEvents',
  exports: 'exports',
  maps: 'maps',
  mapIds: 'mapIds',
  scripts: 'scripts',
  scriptData: 'scriptData',
  sync: 'sync',
  syncMeta: 'syncMeta',
  runCloud: 'runCloud',
} as const;

/** A random id (profile ids, ADR 0150). */
export function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

let persistAsked = false;

let superseded = false;
const supersededListeners = new Set<() => void>();

/**
 * Calls `fn` once when this page's database is superseded by a newer
 * version (see the file header); at once if it already is. Returns the
 * unsubscribe function.
 */
export function onDbSuperseded(fn: () => void): () => void {
  if (superseded) {
    fn();
    return () => {};
  }
  supersededListeners.add(fn);
  return () => supersededListeners.delete(fn);
}

/** True once a newer version has taken over the database. */
export function isDbSuperseded(): boolean {
  return superseded;
}

function markSuperseded(): void {
  if (superseded) return;
  superseded = true;
  const fns = [...supersededListeners];
  supersededListeners.clear();
  for (const fn of fns) {
    try {
      fn();
    } catch {
      /* a listener's problem */
    }
  }
}

/** Tests: forget a superseded state. */
export function resetDbSupersededForTests(): void {
  superseded = false;
  supersededListeners.clear();
}

/** Asks once per page for persistent storage (ADR 0006). Never throws. */
export function requestPersistence(): void {
  if (persistAsked) return;
  persistAsked = true;
  try {
    const p = globalThis.navigator?.storage?.persist?.();
    p?.catch(() => {});
  } catch {
    /* not available */
  }
}

/** Account databases this page saw deleted (or deleted itself): never made again by a late writer. */
const goneDbs = new Set<string>();

/** An account's database is being deleted by this page (Log out, Delete account, Remove): no store of this page makes it again. */
export function markDbGone(name: string): void {
  if (name.startsWith(ACCOUNT_SPACE_PREFIX)) goneDbs.add(name);
}

/** Tests: forget the deleted databases. */
export function resetGoneDbsForTests(): void {
  goneDbs.clear();
}

/** Thrown (as the open's rejection) when an account's database does not exist and may not be made here. */
export class NoSuchSpaceDb extends Error {
  override name = 'NoSuchSpaceDb';
}

/**
 * Whether an open may make `name` when it does not exist. The device's
 * database always; an account's only while its space is being prepared
 * (`create`), or as the page's own space at load (the record says the page
 * is in it) when this page has not seen it deleted. A writer that comes
 * late, after a Log out deleted the space, gets `NoSuchSpaceDb` instead of
 * an empty database of a dead account (its store falls back to memory).
 */
function mayCreate(name: string, create: boolean): boolean {
  if (!name.startsWith(ACCOUNT_SPACE_PREFIX) || create) return true;
  return name === spaceDbName(currentSpace()) && !goneDbs.has(name);
}

/**
 * Opens (and creates or upgrades) the current space's database
 * (`webcockpit`, or `webcockpit-u-<nameKey>` while an account is logged
 * in; src/core/space.ts). `name` overrides the space (tests,
 * `openDeviceDb`). `create`: an account's space is being prepared (see
 * `mayCreate`).
 */
export function openWebcockpitDb(
  factory: IDBFactory = globalThis.indexedDB,
  name: string = spaceDbName(currentSpace()),
  o: { create?: boolean } = {},
): Promise<IDBDatabase> {
  if (!factory) return Promise.reject(new Error('IndexedDB unavailable'));
  requestPersistence();
  if (o.create) goneDbs.delete(name);
  return new Promise((resolve, reject) => {
    const r = factory.open(name, DB_VERSION);
    let refused = false;
    r.onupgradeneeded = (ev) => {
      const db = r.result;
      if (ev.oldVersion === 0 && !mayCreate(name, o.create === true)) {
        // Aborting the first upgrade leaves no database behind.
        refused = true;
        r.transaction?.abort();
        return;
      }
      if (ev.oldVersion < 1) {
        const runs = db.createObjectStore(STORE.runs, { keyPath: 'runId' });
        runs.createIndex('character', 'character');
        runs.createIndex('startedUs', 'startedUs');
        db.createObjectStore(STORE.runChunks, { keyPath: ['runId', 'seq'] });
      }
      if (ev.oldVersion < 2) {
        db.createObjectStore(STORE.settings);
        db.createObjectStore(STORE.profiles, { keyPath: 'name' });
      }
      if (ev.oldVersion < 3) {
        const comm = db.createObjectStore(STORE.comm, { keyPath: 'seq', autoIncrement: true });
        comm.createIndex('character_ts', ['character', 'ts']);
        comm.createIndex('ts', 'ts');
      }
      if (ev.oldVersion < 4) {
        db.createObjectStore(STORE.timers, { keyPath: 'character' });
      }
      if (ev.oldVersion < 5) {
        db.createObjectStore(STORE.runEvents, { keyPath: ['runId', 'seq'] });
      }
      if (ev.oldVersion < 6) {
        db.createObjectStore(STORE.exports, { keyPath: 'sessionId' });
      }
      if (ev.oldVersion < 7) {
        db.createObjectStore(STORE.maps, { keyPath: 'key' });
        db.createObjectStore(STORE.mapIds, { keyPath: ['mapHash', 'serverId'] });
      }
      if (ev.oldVersion < 8) {
        db.createObjectStore(STORE.scripts, { keyPath: 'id' });
        db.createObjectStore(STORE.scriptData, { keyPath: 'name' });
      }
      if (ev.oldVersion < 9) {
        // Every profile gets an id that a rename keeps (the sync's item, ADR 0150).
        const profiles = r.transaction!.objectStore(STORE.profiles);
        profiles.openCursor().onsuccess = (e) => {
          const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cur) return;
          const rec = cur.value as { id?: unknown; name?: unknown };
          // The seeds get their fixed ids (`seed-<name>`, src/profiles/seed-ids.ts): one item per seed on every device.
          const seed = seedIdOf(rec.name);
          if (typeof rec.id !== 'string' || !rec.id) cur.update({ ...rec, id: seed ?? randomId() });
          cur.continue();
        };
        db.createObjectStore(STORE.sync, { keyPath: ['kind', 'key'] });
        db.createObjectStore(STORE.syncMeta);
      }
      if (ev.oldVersion < 10) {
        db.createObjectStore(STORE.runCloud, { keyPath: 'runId' }).createIndex('state', 'state');
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = (ev) => {
        db.close();
        // null: the database is being deleted, not upgraded.
        if (ev.newVersion === null) markDbGone(name);
        else if (ev.newVersion > DB_VERSION) markSuperseded();
      };
      resolve(db);
    };
    r.onerror = () => {
      if (refused) {
        reject(new NoSuchSpaceDb(`${name} does not exist`));
        return;
      }
      if (r.error?.name === 'VersionError') markSuperseded();
      reject(r.error);
    };
    r.onblocked = () => reject(new Error('database upgrade blocked by another tab'));
  });
}

/**
 * Opens the device's database `webcockpit` whatever the current space:
 * the imported map, the tilesets and the locator's ids (ADR 0150).
 */
export function openDeviceDb(factory: IDBFactory = globalThis.indexedDB): Promise<IDBDatabase> {
  return openWebcockpitDb(factory, DB_NAME);
}

/** The one `maps` record (key `current`): an imported `.mm2` (ADR 0020). */
export interface StoredMap {
  key: 'current';
  name: string;
  size: number;
  /** Import time, ms since the epoch. */
  date: number;
  bytes: ArrayBuffer;
  /** `mapHash` of the bytes (src/map/mm2.ts). */
  hash: string;
  /** Rooms in the map (set by the import; absent in older records). */
  rooms?: number;
}

/** A `mapIds` record: a server id the locator matched to a room of map `mapHash`. */
export interface StoredMapId {
  mapHash: string;
  serverId: number;
  room: number;
}

/** Resolves with a request's result. */
export function idbRequest<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Resolves when a transaction commits. */
export function idbDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}
