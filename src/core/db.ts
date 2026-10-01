// The one IndexedDB database of the app (ADR 0006, ADR 0008, ADR 0010).
//
// Database `webcockpit`:
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

export const DB_NAME = 'webcockpit';
export const DB_VERSION = 8;

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
} as const;

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

/** Opens (and creates or upgrades) the `webcockpit` database. */
export function openWebcockpitDb(factory: IDBFactory = globalThis.indexedDB): Promise<IDBDatabase> {
  if (!factory) return Promise.reject(new Error('IndexedDB unavailable'));
  requestPersistence();
  return new Promise((resolve, reject) => {
    const r = factory.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = (ev) => {
      const db = r.result;
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
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = (ev) => {
        db.close();
        // null: the database is being deleted, not upgraded.
        if (ev.newVersion !== null && ev.newVersion > DB_VERSION) markSuperseded();
      };
      resolve(db);
    };
    r.onerror = () => {
      if (r.error?.name === 'VersionError') markSuperseded();
      reject(r.error);
    };
    r.onblocked = () => reject(new Error('database upgrade blocked by another tab'));
  });
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
