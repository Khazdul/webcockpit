// The current map (ADR 0020 "Map files and storage"): an imported `.mm2`
// kept in IndexedDB (`maps`, record `current`), else the bundled
// public/map/arda.mm2. One `MapStore` per page (the shell's), shared by
// the live App's map pane, the log player and Options → Mapper:
//
// - `host()` is the Map pane's `MapPaneHost`: the imported bytes (a fresh
//   copy per load, since the pane transfers them to its worker) or the
//   bundled URL, the tiles under public/map/, and a change signal so a
//   running pane reloads after an import or "Use bundled map".
// - `importFile` checks the file in the map tools worker
//   (src/map/tools-client.ts: a short-lived worker, so the page never
//   parses a map on its main thread) before the record is replaced; a bad
//   file throws and the old map stays.
// - The record is read once and kept in memory (the log player reuses the
//   bytes; no second database read). Without IndexedDB the bundled map is
//   used and an import fails with a message.
//
// Other tabs are not told about an import; they pick it up on reload.

import { STORE, type StoredMap, idbDone, idbRequest } from '../core/db';
import { BUNDLED_MAP_BYTES } from './progress';
import type { MapPaneHost, MapSource } from './protocol';
import type { MapValidated } from './tools';

/** File name of the bundled map (public/map/). */
export const BUNDLED_MAP_FILE = 'arda.mm2';

/** URL of the map asset root (tiles, fonts, the bundled map). */
export function mapAssetBase(): string {
  return `${import.meta.env.BASE_URL}map/`;
}

/** The bundled map as a source. */
export function bundledMapSource(base = mapAssetBase()): MapSource {
  return { kind: 'url', url: `${base}${BUNDLED_MAP_FILE}`, name: BUNDLED_MAP_FILE, ...(BUNDLED_MAP_BYTES > 0 ? { size: BUNDLED_MAP_BYTES } : {}) };
}

/** What Options → Mapper shows. */
export type CurrentMap =
  | { kind: 'bundled'; name: string }
  | { kind: 'imported'; name: string; size: number; date: number; hash: string; rooms?: number };

export interface MapStoreOptions {
  /** The shared database opener (rejects without IndexedDB). */
  openDb: () => Promise<IDBDatabase>;
  /** Checks a `.mm2` (default: the map tools worker); throws with a message on a bad file. */
  validate?: (bytes: ArrayBuffer) => Promise<MapValidated>;
  now?: () => number;
  /** Asset root URL (default `mapAssetBase()`). */
  base?: string;
}

/** Checks a `.mm2` in the map tools worker. */
async function validateInWorker(bytes: ArrayBuffer): Promise<MapValidated> {
  const { runMapTool } = await import('./tools-client');
  const res = await runMapTool({ t: 'validate', bytes });
  if (!res.ok) throw new Error(res.message);
  if (res.t !== 'validate') throw new Error('unexpected answer from the map tools worker');
  return res.info;
}

export class MapStore {
  private readonly opts: MapStoreOptions;
  private readonly base: string;
  /** The record; undefined until read. */
  private rec: StoredMap | null | undefined;
  private reading: Promise<StoredMap | null> | null = null;
  private readonly fns = new Set<() => void>();

  constructor(opts: MapStoreOptions) {
    this.opts = opts;
    this.base = opts.base ?? mapAssetBase();
  }

  /** The imported map's record, or null (bundled). Read once; a database error counts as none. */
  record(): Promise<StoredMap | null> {
    if (this.rec !== undefined) return Promise.resolve(this.rec);
    this.reading ??= (async () => {
      try {
        const db = await this.opts.openDb();
        const r = await idbRequest<StoredMap | undefined>(db.transaction(STORE.maps, 'readonly').objectStore(STORE.maps).get('current'));
        return r && typeof r.bytes?.byteLength === 'number' ? r : null;
      } catch {
        return null;
      }
    })().then((r) => {
      this.reading = null;
      if (this.rec === undefined) this.rec = r;
      return this.rec;
    });
    return this.reading;
  }

  /** The current map for display. */
  async current(): Promise<CurrentMap> {
    const r = await this.record();
    if (!r) return { kind: 'bundled', name: BUNDLED_MAP_FILE };
    return { kind: 'imported', name: r.name, size: r.size, date: r.date, hash: r.hash, ...(r.rooms !== undefined ? { rooms: r.rooms } : {}) };
  }

  /** The current map as a source (imported bytes are copied: the caller may transfer them). */
  async source(): Promise<MapSource> {
    const r = await this.record();
    if (!r) return bundledMapSource(this.base);
    return { kind: 'bytes', bytes: r.bytes.slice(0), name: r.name };
  }

  /**
   * Checks and stores `bytes` as the current map, then tells every pane.
   * Throws (and keeps the old map) when the file is not a readable
   * `.mm2` or cannot be stored.
   */
  async importFile(name: string, bytes: ArrayBuffer): Promise<StoredMap> {
    const info = await (this.opts.validate ?? validateInWorker)(bytes.slice(0));
    const rec: StoredMap = {
      key: 'current',
      name,
      size: bytes.byteLength,
      date: (this.opts.now ?? Date.now)(),
      bytes,
      hash: info.hash,
      rooms: info.rooms,
    };
    let db: IDBDatabase;
    try {
      db = await this.opts.openDb();
    } catch {
      throw new Error('the map cannot be stored here (no IndexedDB)');
    }
    const tx = db.transaction(STORE.maps, 'readwrite');
    tx.objectStore(STORE.maps).put(rec);
    await idbDone(tx);
    this.rec = rec;
    this.notify();
    return rec;
  }

  /** Deletes the imported map; the bundled one is used again. */
  async useBundled(): Promise<void> {
    try {
      const db = await this.opts.openDb();
      const tx = db.transaction(STORE.maps, 'readwrite');
      tx.objectStore(STORE.maps).delete('current');
      await idbDone(tx);
    } catch {
      /* nothing stored: the bundled map is current anyway */
    }
    this.rec = null;
    this.notify();
  }

  /** Called after every change of the current map. */
  subscribe(fn: () => void): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }

  private notify(): void {
    for (const f of [...this.fns]) f();
  }

  /** The Map pane host for this store (the live App and the log player). */
  host(opts: { persistIds?: boolean } = {}): MapPaneHost {
    return {
      persistIds: opts.persistIds ?? false,
      source: () => this.source(),
      assets: { kind: 'base', url: this.base },
      subscribe: (fn) => this.subscribe(fn),
    };
  }
}
