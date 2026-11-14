// Learned server ids in IndexedDB (ADR 0020 "Locating the player"): the
// map worker reads and writes the `mapIds` store itself, so persistence
// costs the main thread nothing. Records: { mapHash, serverId, room }.
// IndexedDB works in workers; `openDeviceDb` is worker-safe (its
// persistence request is guarded and a no-op there). The ids are the
// device's whoever is logged in (ADR 0150): always `webcockpit`.

import { STORE, type StoredMapId, idbDone, idbRequest, openDeviceDb } from '../../core/db';

export interface LearnedIdStore {
  /** Every stored id of map `hash`: [serverId, room]. */
  load(hash: string): Promise<[number, number][]>;
  /** Stores ids of map `hash` (one transaction). */
  save(hash: string, ids: readonly (readonly [number, number])[]): Promise<void>;
}

/** The IndexedDB store; the connection is opened on first use and reopened after a versionchange close. */
export function idbLearnedIds(factory: IDBFactory | undefined = globalThis.indexedDB): LearnedIdStore {
  let dbp: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    if (!factory) return Promise.reject(new Error('IndexedDB unavailable'));
    if (!dbp) {
      const p = openDeviceDb(factory).then((d) => {
        d.addEventListener('close', () => {
          if (dbp === p) dbp = null;
        });
        const onVersionChange = d.onversionchange;
        d.onversionchange = (ev) => {
          if (dbp === p) dbp = null;
          onVersionChange?.call(d, ev);
        };
        return d;
      });
      p.catch(() => {
        if (dbp === p) dbp = null;
      });
      dbp = p;
    }
    return dbp;
  };
  return {
    async load(hash) {
      const d = await db();
      const range = IDBKeyRange.bound([hash, -Infinity], [hash, Infinity]);
      const rows = (await idbRequest(d.transaction(STORE.mapIds, 'readonly').objectStore(STORE.mapIds).getAll(range))) as StoredMapId[];
      return rows.map((r) => [r.serverId, r.room]);
    },
    async save(hash, ids) {
      if (ids.length === 0) return;
      const d = await db();
      const tx = d.transaction(STORE.mapIds, 'readwrite');
      const st = tx.objectStore(STORE.mapIds);
      for (const [serverId, room] of ids) st.put({ mapHash: hash, serverId, room } satisfies StoredMapId);
      await idbDone(tx);
    },
  };
}

/** An in-memory store (tests). */
export function memoryLearnedIds(): LearnedIdStore & { rows: Map<string, number> } {
  const rows = new Map<string, number>();
  return {
    rows,
    load: async (hash) => {
      const out: [number, number][] = [];
      for (const [k, room] of rows) {
        const i = k.lastIndexOf('|');
        if (k.slice(0, i) === hash) out.push([Number(k.slice(i + 1)), room]);
      }
      return out;
    },
    save: async (hash, ids) => {
      for (const [sid, room] of ids) rows.set(`${hash}|${sid}`, room);
    },
  };
}
