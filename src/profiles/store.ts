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
// Without IndexedDB (private mode, blocked upgrade) the store keeps the
// records in memory for the page's lifetime; `persistent` is false.

import { STORE, idbDone, idbRequest, openWebcockpitDb } from '../core/db';
import { stripSend } from './migrate';
import { DEFAULT_PROFILE, nameError, nameFromFileName, uniqueName } from './names';
import KHAZDUL from './khazdul.tin?raw';
import TEMPLATE from './template.tin?raw';

export interface ProfileRecord {
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
export const BUNDLED_PROFILES: readonly { name: string; text: string }[] = [
  { name: 'khazdul', text: KHAZDUL },
];

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
   * Seeds `default` from the template when it is missing. A missing
   * `default` means a first run, so the bundled profiles are seeded too
   * (unless a name is taken); a user who deletes one keeps it deleted.
   */
  async init(): Promise<void> {
    await this.tx('readwrite', async (st) => {
      const cur = await st.get(DEFAULT_PROFILE);
      if (cur) {
        // Profiles stored before `_send` was removed (ADR 0040).
        for (const rec of await st.all()) {
          const text = stripSend(rec.text);
          if (text !== rec.text) await st.put({ ...rec, text, modified: this.now() });
        }
        return;
      }
      await st.put(this.record(DEFAULT_PROFILE, PROFILE_TEMPLATE));
      for (const b of BUNDLED_PROFILES) {
        if (!(await st.get(b.name))) await st.put(this.record(b.name, b.text));
      }
    });
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

  /** Replaces the text of `name` (stage 3 editor; kept here for the record shape). */
  async save(name: string, text: string): Promise<void> {
    await this.tx('readwrite', async (st) => {
      const cur = await st.get(name);
      if (!cur) throw new ProfileError(`No profile "${name}".`);
      await st.put({ ...cur, text, modified: this.now() });
    });
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
      await st.put({ ...cur, name: to, modified: this.now() });
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
    return { name, text, created: t, modified: t };
  }

  /**
   * Runs `fn` against one transaction (IndexedDB) or the memory map. Falls
   * back to memory if the database cannot be opened.
   */
  private async tx<T>(mode: IDBTransactionMode, fn: (st: RecordStore) => Promise<T>): Promise<T> {
    if (!this.mem) {
      let db: IDBDatabase | null = null;
      try {
        db = await this.open();
      } catch {
        this.mem = new Map();
      }
      if (db) {
        let t: IDBTransaction;
        try {
          t = db.transaction(STORE.profiles, mode);
        } catch {
          // Closed by a versionchange in another tab: reopen once.
          this.db = null;
          t = (await this.open()).transaction(STORE.profiles, mode);
        }
        const done = idbDone(t);
        let result: T;
        try {
          result = await fn(idbStore(t.objectStore(STORE.profiles)));
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
        return result;
      }
    }
    // Memory: apply to a copy so a thrown ProfileError leaves nothing half done.
    const copy = new Map(this.mem!);
    const result = await fn(memStore(copy));
    if (mode === 'readwrite') this.mem = copy;
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
}

function idbStore(os: IDBObjectStore): RecordStore {
  return {
    get: (name) => idbRequest(os.get(name) as IDBRequest<ProfileRecord | undefined>),
    all: () => idbRequest(os.getAll() as IDBRequest<ProfileRecord[]>),
    names: async () => (await idbRequest(os.getAllKeys())).map(String),
    put: async (r) => {
      await idbRequest(os.put(r));
    },
    delete: async (name) => {
      await idbRequest(os.delete(name));
    },
  };
}

function memStore(m: Map<string, ProfileRecord>): RecordStore {
  return {
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
