// Comm history per character (Inv §2.7, ADR 0016 "Storage"): one IndexedDB
// record per `Comm.Channel.Text`, raw and unnormalised (the pane formats at
// render time, so the archive stays re-renderable).
//
//   database `webcockpit`, store `comm` (src/core/db.ts, version 3)
//     keyPath 'seq' (autoIncrement: insertion order, filled on append)
//     index 'character_ts' ['character', 'ts']   loadRecent
//     index 'ts'                                 prune (whole days), the sync
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
//
// For the sync (ADR 0152, a `comm` piece per UTC day): `commDays` lists the
// days with a cache key (a key cursor), `recordsAfter` reads what was
// appended after a `seq`, `dayRecords` reads a day's records without
// `seq`, `addDayRecords` adds the pulled ones it does not have (by
// identity, removing none), `removeDay` deletes a day. An append
// transaction notes `comm` (src/core/store-events.ts); these do not (they
// are the sync's own writes).

import { STORE, idbDone, idbRequest } from '../core/db';
import { noteStored } from '../core/store-events';
import { type NewCommRecord, commFields, commIdentity, commKeptFrom, dayBounds, sortCommRecords, utcDay } from './comm-records';

export { type NewCommRecord, commFields, commIdentity, dayBounds, sortCommRecords, utcDay } from './comm-records';

/** How long messages are kept (7 days, Inv §2.7). */
export const COMM_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Messages loaded for a character (the pane keeps 1000 in memory). */
export const COMM_LOAD_LIMIT = 1000;

/** One stored message: the `Comm.Channel.Text` fields as received, and its store key. */
export interface CommRecord extends NewCommRecord {
  /** Store key, assigned on append (insertion order; ties in `ts` keep it). */
  seq: number;
}

/** A day with records, for the sync: the UTC day and its cache key. */
export interface CommDay {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  /** Records of the day within retention. */
  count: number;
  /** Highest `seq` among them (with `count`, changes whenever the day does). */
  maxSeq: number;
}

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
        noteStored('comm');
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

  /**
   * Deletes every message (all characters) of a day the sync no longer
   * keeps (`commDayKept`: its start older than 8 days 6 hours); resolves
   * with the count. Whole days only: a day the sync still lists keeps its
   * records past the seven days the pane shows, so pruning never changes
   * a listed day (and so never pushes it again).
   */
  async prune(): Promise<number> {
    const before = commKeptFrom(this.now());
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

  // ------------------------------------------------------------ the sync

  /**
   * The UTC days that have records from `since` on (default: the 7 days
   * before `now`), oldest first, each with its cache key (count, highest
   * `seq`). A key cursor on the `ts` index: no record is read.
   */
  async commDays(now = this.now(), since = now - COMM_RETENTION_MS): Promise<CommDay[]> {
    this.writeQueued();
    const tx = this.db.transaction(STORE.comm, 'readonly');
    const done = idbDone(tx);
    const req = tx.objectStore(STORE.comm).index('ts').openKeyCursor(IDBKeyRange.lowerBound(since));
    const days = new Map<string, CommDay>();
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve();
        const ts = c.key as number;
        const seq = c.primaryKey as number;
        const day = utcDay(ts);
        const d = days.get(day);
        if (d) {
          d.count++;
          if (seq > d.maxSeq) d.maxSeq = seq;
        } else days.set(day, { day, count: 1, maxSeq: seq });
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
    await done;
    return [...days.values()];
  }

  /** The records stored after `seq` (appended later), without `seq`, in store order. */
  async recordsAfter(seq: number): Promise<NewCommRecord[]> {
    this.writeQueued();
    const tx = this.db.transaction(STORE.comm, 'readonly');
    const done = idbDone(tx);
    const all = (await idbRequest(tx.objectStore(STORE.comm).getAll(IDBKeyRange.lowerBound(seq, true)))) as unknown[];
    await done;
    const out: NewCommRecord[] = [];
    for (const r of all) {
      const f = commFields(r);
      if (f) out.push(f);
    }
    return out;
  }

  /**
   * The records of a UTC day within retention (`all`: every stored record
   * of the day), without `seq`, sorted by `ts` then identity, each
   * identity once.
   */
  async dayRecords(day: string, o: { all?: boolean } = {}): Promise<NewCommRecord[]> {
    const range = o.all ? IDBKeyRange.bound(...dayBounds(day), false, true) : this.dayRange(day);
    if (!range) return [];
    this.writeQueued();
    const tx = this.db.transaction(STORE.comm, 'readonly');
    const done = idbDone(tx);
    const all = (await idbRequest(tx.objectStore(STORE.comm).index('ts').getAll(range))) as CommRecord[];
    await done;
    const out: NewCommRecord[] = [];
    for (const r of all) {
      const f = commFields(r);
      if (f) out.push(f);
    }
    return sortCommRecords(out);
  }

  /**
   * Adds the records the store does not have (by identity; duplicates in
   * `records` are one), removes none; records older than `since`
   * (default: retention) or not records at all are skipped. Resolves with
   * how many were added. One transaction, so a message appended meanwhile
   * is never lost.
   */
  async addDayRecords(records: readonly unknown[], o: { since?: number } = {}): Promise<number> {
    const since = o.since ?? this.now() - COMM_RETENTION_MS;
    const byDay = new Map<string, NewCommRecord[]>();
    for (const raw of records) {
      const f = commFields(raw);
      if (!f || f.ts < since) continue;
      const day = utcDay(f.ts);
      const list = byDay.get(day);
      if (list) list.push(f);
      else byDay.set(day, [f]);
    }
    if (byDay.size === 0) return 0;
    this.writeQueued();
    const tx = this.db.transaction(STORE.comm, 'readwrite');
    const done = idbDone(tx);
    const store = tx.objectStore(STORE.comm);
    let added = 0;
    try {
      for (const [day, list] of byDay) {
        const [start, end] = dayBounds(day);
        const have = (await idbRequest(store.index('ts').getAll(IDBKeyRange.bound(start, end, false, true)))) as CommRecord[];
        const ids = new Set(have.map((r) => commIdentity(r)));
        for (const r of sortCommRecords(list)) {
          const id = commIdentity(r);
          if (ids.has(id)) continue;
          ids.add(id);
          store.add(r);
          added++;
        }
      }
    } catch (err) {
      try {
        tx.abort();
      } catch {
        /* already finished */
      }
      await done.catch(() => undefined);
      throw err;
    }
    await done;
    return added;
  }

  /** Deletes every record of a UTC day; resolves with the count. */
  async removeDay(day: string): Promise<number> {
    const [start, end] = dayBounds(day);
    this.writeQueued();
    const tx = this.db.transaction(STORE.comm, 'readwrite');
    const done = idbDone(tx);
    const req = tx.objectStore(STORE.comm).index('ts').openCursor(IDBKeyRange.bound(start, end, false, true));
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

  /** A day's range clipped to retention, or null when nothing of it is kept. */
  private dayRange(day: string): IDBKeyRange | null {
    const [start, end] = dayBounds(day);
    const from = Math.max(start, this.now() - COMM_RETENTION_MS);
    return from < end ? IDBKeyRange.bound(from, end, false, true) : null;
  }
}
