// Profile store (ADR 0010 "Profiles"): named tt++ text records in the
// IndexedDB `profiles` store (keyPath `name`, src/core/db.ts).
//
//   const profiles = new ProfileStore();
//   await profiles.init();                  // first run: seeds `default` and `khazdul`
//   await profiles.create('ranger', text);
//   await profiles.rename('ranger', 'hunter');
//   const name = await profiles.importFile('My pvp.tin', text);  // My_pvp
//
// The text is stored verbatim; parsing starts in stage 3. Which profile is
// selected lives in the settings (`settings.profile`), not here: callers
// update it after a create, rename or import.
//
// Every record has an `id` (ADR 0150): random at create and import, fixed for the seeds (stage 61),
// kept by a rename (the record moves to its new name with its id).
//
// Without IndexedDB (private mode, blocked upgrade) the store keeps the
// records in memory for the page's lifetime; `persistent` is false.

import { STORE, idbDone, idbRequest, openWebcockpitDb, randomId } from '../core/db';
import { noteStored } from '../core/store-events';
import { stripSend } from './migrate';
import { DEFAULT_PROFILE, nameError, nameFromFileName, uniqueName } from './names';
import { BUNDLED_PROFILE_NAMES, type BundledProfileName, SEEDED_META_KEY, seedId } from './seed-ids';
import KHAZDUL from './khazdul.tin?raw';
import TEMPLATE from './template.tin?raw';

export interface ProfileRecord {
  /** Random, kept on rename: the sync's item (ADR 0150; database version 9). */
  id: string;
  name: string;
  /** tt++ text, verbatim. */
  text: string;
  /** ms since the epoch. */
  created: number;
  modified: number;
}

/** A rule violation (bad name, collision, protected profile). The message is user-facing. */
export class ProfileError extends Error {
  override name = 'ProfileError';
}

/** The text a new blank profile (and `default`) starts from. */
export const PROFILE_TEMPLATE: string = TEMPLATE;

/**
 * Bundled profiles a new user starts with besides `default` (ADR 0024):
 * the owner's PvP profile. Seeded once, on first run only.
 */
const BUNDLED_TEXT: Record<BundledProfileName, string> = { khazdul: KHAZDUL };
export const BUNDLED_PROFILES: readonly { name: string; text: string }[] = BUNDLED_PROFILE_NAMES.map((name) => ({ name, text: BUNDLED_TEXT[name] }));

/**
 * The seeds (`default` and the bundled profiles) have fixed ids and times
 * (stage 61, ADR 0151 "Seeds"): every device and every account's space
 * seeds the same records, so the sync sees one item per seed, not one per
 * device. An *untouched* seed (its seed text, under its name) is not an
 * item at all: it never moves at Create account and is not synced until
 * it is changed.
 */
export const SEED_TIME = Date.UTC(2026, 8, 27);

export { seedId };

/** The seed records, as a new device (or a new account's space) gets them. */
export function seedProfiles(): ProfileRecord[] {
  return [{ name: DEFAULT_PROFILE, text: PROFILE_TEMPLATE }, ...BUNDLED_PROFILES].map((b) => ({
    id: seedId(b.name),
    name: b.name,
    text: stripSend(b.text),
    created: SEED_TIME,
    modified: SEED_TIME,
  }));
}

export interface ProfileStoreOptions {
  /** IndexedDB factory; null = memory only. Default: `globalThis.indexedDB`. */
  factory?: IDBFactory | null;
  /** Clock (tests). */
  now?: () => number;
}

export class ProfileStore {
  private readonly factory: IDBFactory | null;
  private readonly now: () => number;
  private db: Promise<IDBDatabase> | null = null;
  /** Memory fallback, used once IndexedDB has failed to open. */
  private mem: Map<string, ProfileRecord> | null = null;
  /** The `seeded` mark of the memory fallback. */
  private memSeeded = false;
  private readonly listeners = new Set<(name: string, text: string) => void>();

  constructor(opts: ProfileStoreOptions = {}) {
    this.factory = opts.factory === undefined ? (globalThis.indexedDB ?? null) : opts.factory;
    this.now = opts.now ?? Date.now;
    if (!this.factory) this.mem = new Map();
  }

  /** False when records live in memory only. */
  get persistent(): boolean {
    return this.mem === null;
  }

  /**
   * Seeds `default` from the template when it is missing. The first run of
   * a database (no `seeded` mark, no `default`) seeds the bundled profiles
   * too, each only where its name and its id are free; a user who deletes
   * one keeps it deleted. Afterwards (the mark is set) a missing `default`
   * (the move took the device's edited one into an account) brings back
   * `default` alone.
   */
  async init(): Promise<void> {
    await this.tx(
      'readwrite',
      async (st) => {
        const cur = await st.get(DEFAULT_PROFILE);
        const seeded = await st.seeded();
        if (cur) {
          if (!seeded) await st.markSeeded();
          // Profiles stored before `_send` was removed (ADR 0040).
          for (const rec of await st.all()) {
            const text = stripSend(rec.text);
            if (text !== rec.text) await st.put({ ...rec, text, modified: this.now() });
          }
          return;
        }
        const all = await st.all();
        const ids = new Set(all.map((r) => r.id));
        const names = new Set(all.map((r) => r.name));
        for (const seed of seedProfiles()) {
          const isDefault = seed.name === DEFAULT_PROFILE;
          if (!isDefault && (seeded || names.has(seed.name) || ids.has(seed.id))) continue;
          // `default` must be there; its seed id only when no other profile has it.
          await st.put(ids.has(seed.id) ? { ...seed, id: randomId() } : seed);
        }
        if (!seeded) await st.markSeeded();
      },
      true,
    );
  }

  /** Every profile, sorted by name (case-insensitive). */
  async list(): Promise<ProfileRecord[]> {
    const all = await this.tx('readonly', (st) => st.all());
    return all.sort((a, b) => compareNames(a.name, b.name));
  }

  async get(name: string): Promise<ProfileRecord | null> {
    return this.tx('readonly', async (st) => (await st.get(name)) ?? null);
  }

  /** Creates `name` with `text`. Throws ProfileError on a bad or taken name. */
  async create(name: string, text: string = PROFILE_TEMPLATE): Promise<ProfileRecord> {
    return this.tx('readwrite', async (st) => {
      const err = nameError(name, await st.names());
      if (err) throw new ProfileError(err);
      const rec = this.record(name, text);
      await st.put(rec);
      return rec;
    });
  }

  /** Replaces the text of `name`; the listeners hear of it once it is stored. */
  async save(name: string, text: string): Promise<void> {
    await this.tx('readwrite', async (st) => {
      const cur = await st.get(name);
      if (!cur) throw new ProfileError(`No profile "${name}".`);
      await st.put({ ...cur, text, modified: this.now() });
    });
    this.announce(name, text);
  }

  /**
   * Tells the listeners that `name` now holds `text`, written by someone
   * else than this store (the sync, here or in another tab of the space:
   * src/cloud/space/runtime.ts). An open editor lays its edits over it.
   */
  announce(name: string, text: string): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(name, text);
      } catch (e) {
        console.error(e);
      }
    }
  }

  /**
   * Calls `fn` after every `save` (any caller: the editor, the write-back),
   * with the name and the new text. Returns the unsubscribe. The profile
   * editor follows outside changes with it (ADR 0105).
   */
  subscribe(fn: (name: string, text: string) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Renames `from` to `to`. Same name is a no-op; `default` cannot be renamed. */
  async rename(from: string, to: string): Promise<void> {
    if (from === to) return;
    if (from === DEFAULT_PROFILE) throw new ProfileError('The default profile cannot be renamed.');
    await this.tx('readwrite', async (st) => {
      const cur = await st.get(from);
      if (!cur) throw new ProfileError(`No profile "${from}".`);
      const err = nameError(to, await st.names(), from);
      if (err) throw new ProfileError(err);
      // The record is keyed by name, so it moves; its `id` goes with it (the sync sees a rename, not a delete and a create).
      await st.put({
        ...cur,
        id: cur.id || randomId(),
        name: to,
        modified: this.now(),
      });
      await st.delete(from);
    });
  }

  /** Deletes `name`; `default` cannot be deleted. */
  async remove(name: string): Promise<void> {
    if (name === DEFAULT_PROFILE) throw new ProfileError("You can't delete the default profile.");
    await this.tx('readwrite', (st) => st.delete(name));
  }

  /**
   * Stores an imported file under a name taken from `fileName` (sanitised,
   * `_2`, `_3` … on a collision). Returns the name used.
   */
  async importFile(fileName: string, text: string): Promise<string> {
    return this.tx('readwrite', async (st) => {
      const name = uniqueName(nameFromFileName(fileName), await st.names());
      await st.put(this.record(name, stripSend(text)));
      return name;
    });
  }

  /** Closes the database connection (tests). */
  async close(): Promise<void> {
    const db = this.db;
    this.db = null;
    if (db) (await db.catch(() => null))?.close();
  }

  // ---------------------------------------------------------------- storage

  private record(name: string, text: string): ProfileRecord {
    const t = this.now();
    return { id: randomId(), name, text, created: t, modified: t };
  }

  /**
   * Runs `fn` against one transaction (IndexedDB) or the memory map. Falls
   * back to memory if the database cannot be opened.
   */
  private async tx<T>(mode: IDBTransactionMode, fn: (st: RecordStore) => Promise<T>, meta = false): Promise<T> {
    const stores = meta ? [STORE.profiles, STORE.syncMeta] : [STORE.profiles];
    const wrote = { profiles: false };
    if (!this.mem) {
      let db: IDBDatabase | null = null;
      try {
        db = await this.open();
      } catch {
        this.mem = new Map();
      }
      if (db) {
        let t: IDBTransaction | null = null;
        try {
          t = db.transaction(stores, mode);
        } catch {
          // Closed by a versionchange in another tab: reopen once.
          this.db = null;
          const again = await this.open().catch(() => null);
          // Gone (the account's space deleted under this page: src/core/db.ts): memory from now on.
          if (again) t = again.transaction(stores, mode);
          else this.mem = new Map();
        }
        if (t) {
          const done = idbDone(t);
          let result: T;
          try {
            result = await fn(idbStore(t.objectStore(STORE.profiles), meta ? t.objectStore(STORE.syncMeta) : null, wrote));
          } catch (err) {
            done.catch(() => {});
            try {
              t.abort();
            } catch {
              /* already finished */
            }
            throw err;
          }
          await done;
          // Only a transaction that put or deleted a profile is a change (the sync's trigger).
          if (wrote.profiles) noteStored('profile');
          return result;
        }
      }
    }
    // Memory: apply to a copy so a thrown ProfileError leaves nothing half done.
    const copy = new Map(this.mem!);
    const flag = { seeded: this.memSeeded };
    const result = await fn(memStore(copy, flag));
    if (mode === 'readwrite') {
      this.mem = copy;
      this.memSeeded = flag.seeded;
    }
    return result;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = openWebcockpitDb(this.factory!);
      this.db.catch(() => {
        this.db = null;
      });
    }
    return this.db;
  }
}

/** Case-insensitive name order, ties broken case-sensitively. */
export function compareNames(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
}

interface RecordStore {
  get(name: string): Promise<ProfileRecord | undefined>;
  all(): Promise<ProfileRecord[]>;
  names(): Promise<string[]>;
  put(r: ProfileRecord): Promise<void>;
  delete(name: string): Promise<void>;
  /** The database's `seeded` mark (`init` only: its transaction has `syncMeta`). */
  seeded(): Promise<boolean>;
  markSeeded(): Promise<void>;
}

function idbStore(os: IDBObjectStore, meta: IDBObjectStore | null, wrote: { profiles: boolean }): RecordStore {
  return {
    get: (name) => idbRequest(os.get(name) as IDBRequest<ProfileRecord | undefined>),
    all: () => idbRequest(os.getAll() as IDBRequest<ProfileRecord[]>),
    names: async () => (await idbRequest(os.getAllKeys())).map(String),
    put: async (r) => {
      wrote.profiles = true;
      await idbRequest(os.put(r));
    },
    delete: async (name) => {
      wrote.profiles = true;
      await idbRequest(os.delete(name));
    },
    seeded: async () => (meta ? (await idbRequest(meta.get(SEEDED_META_KEY))) !== undefined : false),
    markSeeded: async () => {
      if (meta) await idbRequest(meta.put(true, SEEDED_META_KEY));
    },
  };
}

function memStore(m: Map<string, ProfileRecord>, flag: { seeded: boolean }): RecordStore {
  return {
    seeded: async () => flag.seeded,
    markSeeded: async () => {
      flag.seeded = true;
    },
    get: async (name) => {
      const r = m.get(name);
      return r ? { ...r } : undefined;
    },
    all: async () => [...m.values()].map((r) => ({ ...r })),
    names: async () => [...m.keys()],
    put: async (r) => {
      m.set(r.name, { ...r });
    },
    delete: async (name) => {
      m.delete(name);
    },
  };
}
