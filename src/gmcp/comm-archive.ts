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
// Times are ms since the Unix epoch (`Date.now()`). Appends made in one task
// (a burst of messages in one WebSocket frame) are written together in one
// transaction at the end of the task, in order, so the records and their
// `seq` are what one transaction per message would give; nothing waits past
// the task, so there is nothing to flush on unload. Every other call is its
// own transaction. A failed write rejects and the caller decides whether to
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

interface QueuedAppend {
  rec: NewCommRecord;
  resolve: (seq: number) => void;
  reject: (err: unknown) => void;
}

export class CommArchive {
  readonly db: IDBDatabase;
  private readonly now: () => number;
  /** Appends of the current task, written by `writeQueued`. */
  private queue: QueuedAppend[] = [];

  constructor(db: IDBDatabase, opts: CommArchiveOptions = {}) {
    this.db = db;
    this.now = opts.now ?? Date.now;
  }

  /** Opens the archive with the context's lazy database opener. */
  static async open(openDb: () => Promise<IDBDatabase>, opts: CommArchiveOptions = {}): Promise<CommArchive> {
    return new CommArchive(await openDb(), opts);
  }

  /** Stores one message; resolves with its `seq` once committed. */
  append(rec: NewCommRecord): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      if (this.queue.length === 0) queueMicrotask(this.writeQueued);
      this.queue.push({ rec: { ...rec }, resolve, reject });
    });
  }

  /** Writes the queued appends in one transaction (also before a read, so it sees them). */
  private readonly writeQueued = (): void => {
    const batch = this.queue;
    if (batch.length === 0) return;
    this.queue = [];
    let keys: Promise<IDBValidKey>[];
    let done: Promise<void>;
    try {
      const tx = this.db.transaction(STORE.comm, 'readwrite');
      done = idbDone(tx);
      const store = tx.objectStore(STORE.comm);
      keys = batch.map((q) => idbRequest(store.add(q.rec)));
    } catch (err) {
      for (const q of batch) q.reject(err);
      return;
    }
    // Each key is read only after the commit, as one transaction per message did.
    for (const k of keys) k.catch(() => undefined);
    done.then(
      async () => {
        for (let i = 0; i < batch.length; i++) batch[i]!.resolve((await keys[i]!) as number);
      },
      (err: unknown) => {
        for (const q of batch) q.reject(err);
      },
    );
  };

  /**
   * The newest `limit` messages of `character` from the last 7 days,
   * oldest first.
   */
  async loadRecent(character: string, limit = COMM_LOAD_LIMIT): Promise<CommRecord[]> {
    if (limit <= 0) return [];
    this.writeQueued();
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
    this.writeQueued();
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
