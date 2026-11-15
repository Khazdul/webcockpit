// Timers state per character (ADR 0017 "Persistence"): one IndexedDB record
// per character, replaced whole on every save.
//
//   database `webcockpit`, store `timers` (src/core/db.ts, version 4)
//     keyPath 'character'   { character, savedAt, state }
//
// `state` belongs to the hub and its trackers (src/timers/hub.ts, versioned
// `v: 1`); the archive stores it as given (structured clone). Usage (the
// hub):
//
//   const archive = await TimersArchive.open(ctx.openDb);  // rejects without IndexedDB
//   const rec = await archive.load('Rasta');               // null when none
//   await archive.save('Rasta', state);                    // savedAt = now()
//
// Every call is its own transaction; transactions on the one connection run
// in the order they were created, so a save followed by a load sees the
// save. The database may close under us (another tab upgrading it); calls
// then reject and the caller carries on in memory.
//
// For the sync (ADR 0152, a `timers` item per character): `list`, `put`
// and `remove`. A `save` notes `timers` (src/core/store-events.ts); these
// do not (they are the sync's own writes). The hub reads a record put here
// at the next `Char.Name` of that character.

import { STORE, idbDone, idbRequest } from '../core/db';
import { noteStored } from '../core/store-events';

/** One stored record. */
export interface TimersRecord {
  /** Character name from `Char.Name`, verbatim. */
  character: string;
  /** Save time, ms since the epoch. */
  savedAt: number;
  /** The hub's state (`{ v: 1, … }`). */
  state: unknown;
}

export interface TimersArchiveOptions {
  /** Clock in ms (default `Date.now`). */
  now?: () => number;
}

export class TimersArchive {
  readonly db: IDBDatabase;
  private readonly now: () => number;

  constructor(db: IDBDatabase, opts: TimersArchiveOptions = {}) {
    this.db = db;
    this.now = opts.now ?? Date.now;
  }

  /** Opens the archive with the context's lazy database opener. */
  static async open(openDb: () => Promise<IDBDatabase>, opts: TimersArchiveOptions = {}): Promise<TimersArchive> {
    return new TimersArchive(await openDb(), opts);
  }

  /** The record of `character`, or null. */
  async load(character: string): Promise<TimersRecord | null> {
    const tx = this.db.transaction(STORE.timers, 'readonly');
    const done = idbDone(tx);
    const rec = await idbRequest(tx.objectStore(STORE.timers).get(character));
    await done;
    const r = asRecord(rec);
    return r && r.character === character ? r : null;
  }

  /** Every record, by character. */
  async list(): Promise<TimersRecord[]> {
    const tx = this.db.transaction(STORE.timers, 'readonly');
    const done = idbDone(tx);
    const all = (await idbRequest(tx.objectStore(STORE.timers).getAll())) as unknown[];
    await done;
    const out: TimersRecord[] = [];
    for (const raw of all) {
      const r = asRecord(raw);
      if (r) out.push(r);
    }
    return out;
  }

  /** Stores a record as given (`savedAt` kept); resolves once committed. */
  async put(record: TimersRecord): Promise<void> {
    const r = asRecord(record);
    if (!r) throw new TypeError('not a timers record');
    const tx = this.db.transaction(STORE.timers, 'readwrite');
    const done = idbDone(tx);
    tx.objectStore(STORE.timers).put(r);
    await done;
  }

  /** Deletes the record of `character` (none is fine); resolves once committed. */
  async remove(character: string): Promise<void> {
    const tx = this.db.transaction(STORE.timers, 'readwrite');
    const done = idbDone(tx);
    tx.objectStore(STORE.timers).delete(character);
    await done;
  }

  /** Replaces the record of `character`; resolves once committed. */
  async save(character: string, state: unknown): Promise<void> {
    const tx = this.db.transaction(STORE.timers, 'readwrite');
    const done = idbDone(tx);
    const rec: TimersRecord = { character, savedAt: this.now(), state };
    tx.objectStore(STORE.timers).put(rec);
    await done;
    noteStored('timers');
  }
}

/** A stored value as a record (`savedAt` 0 and `state` null when missing), or null. */
function asRecord(raw: unknown): TimersRecord | null {
  const r = raw as Partial<TimersRecord> | undefined;
  if (!r || typeof r !== 'object' || typeof r.character !== 'string') return null;
  return { character: r.character, savedAt: typeof r.savedAt === 'number' ? r.savedAt : 0, state: r.state ?? null };
}
