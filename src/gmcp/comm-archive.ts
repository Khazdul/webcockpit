// Comm history per character (Inv §2.7, ADR 0016 "Storage"): one IndexedDB
// record per `Comm.Channel.Text`, raw and unnormalised (the pane formats at
// render time, so the archive stays re-renderable).
//
//   database `webcockpit`, store `comm` (src/core/db.ts, version 3)
//     keyPath 'seq' (autoIncrement: insertion order, filled on append)
//     index 'character_ts' ['character', 'ts']   loadRecent
//     index 'ts'                                 prune
//
// Usage (the Comm pane, P2):
//
//   const archive = await CommArchive.open(ctx.openDb);  // rejects without IndexedDB
//   await archive.prune();                               // at start and each live Char.Name
//   const last = await archive.loadRecent('Rasta');      // oldest first, ≤ 1000, ≤ 7 days
//   void archive.append({ character: 'Rasta', ts: Date.now(), channel, ... });
//
// Times are ms since the Unix epoch (`Date.now()`). Every call is its own
// transaction; a failed write rejects and the caller decides whether to
// report it. The database may close under us (another tab upgrading it);
// calls then reject.

import { STORE, idbDone, idbRequest } from '../core/db';

/** How long messages are kept (7 days, Inv §2.7). */
export const COMM_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Messages loaded for a character (the pane keeps 1000 in memory). */
export const COMM_LOAD_LIMIT = 1000;

/** One stored message: the `Comm.Channel.Text` fields as received. */
export interface CommRecord {
  /** Character name from `Char.Name`. */
  character: string;
  /** Receive time, ms since the epoch. */
  ts: number;
  /** Store key, assigned on append (insertion order; ties in `ts` keep it). */
  seq: number;
  channel: string;
  talker: string;
  /** `talker-type` as sent (npc, ally, neutral, enemy, player …), or null. */
  talkerType: string | null;
  /** `destination` (only on sent messages), or null. */
  destination: string | null;
  /** Text as sent, ANSI kept. */
  text: string;
}

/** A record before it is stored (`seq` is assigned by the store). */
export type NewCommRecord = Omit<CommRecord, 'seq'>;

export interface CommArchiveOptions {
  /** Clock in ms (default `Date.now`). */
  now?: () => number;
}

export class CommArchive {
  readonly db: IDBDatabase;
  private readonly now: () => number;

  constructor(db: IDBDatabase, opts: CommArchiveOptions = {}) {
    this.db = db;
    this.now = opts.now ?? Date.now;
  }

  /** Opens the archive with the context's lazy database opener. */
  static async open(openDb: () => Promise<IDBDatabase>, opts: CommArchiveOptions = {}): Promise<CommArchive> {
    return new CommArchive(await openDb(), opts);
  }

  /** Stores one message; resolves with its `seq` once committed. */
  async append(rec: NewCommRecord): Promise<number> {
    const tx = this.db.transaction(STORE.comm, 'readwrite');
    const done = idbDone(tx);
    const key = idbRequest(tx.objectStore(STORE.comm).add({ ...rec }));
    await done;
    return (await key) as number;
  }

  /**
   * The newest `limit` messages of `character` from the last 7 days,
   * oldest first.
   */
  async loadRecent(character: string, limit = COMM_LOAD_LIMIT): Promise<CommRecord[]> {
    if (limit <= 0) return [];
    const since = this.now() - COMM_RETENTION_MS;
    const tx = this.db.transaction(STORE.comm, 'readonly');
    const done = idbDone(tx);
    const range = IDBKeyRange.bound([character, since], [character, Infinity]);
    const req = tx.objectStore(STORE.comm).index('character_ts').openCursor(range, 'prev');
    const out: CommRecord[] = [];
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve();
        out.push(c.value as CommRecord);
        if (out.length >= limit) return resolve();
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
    await done;
    return out.reverse();
  }

  /** Deletes every message (all characters) older than 7 days; resolves with the count. */
  async prune(): Promise<number> {
    const before = this.now() - COMM_RETENTION_MS;
    const tx = this.db.transaction(STORE.comm, 'readwrite');
    const done = idbDone(tx);
    const req = tx.objectStore(STORE.comm).index('ts').openCursor(IDBKeyRange.upperBound(before, true));
    let n = 0;
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      c.delete();
      n++;
      c.continue();
    };
    await done;
    return n;
  }
}
