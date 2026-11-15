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
//
// For the sync (ADR 0152, a `comm` piece per UTC day): `commDays` lists the
// days of the last seven with a cache key, `dayRecords` reads a day's
// records without `seq`, `addDayRecords` adds the pulled ones it does not
// have (by identity, removing none), `removeDay` deletes a day. An append
// transaction notes `comm` (src/core/store-events.ts); these do not (they
// are the sync's own writes).

import { canonicalJson } from '../cloud/sync/items';
import { STORE, idbDone, idbRequest } from '../core/db';
import { noteStored } from '../core/store-events';

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

/** A day with records, for the sync: the UTC day and its cache key. */
export interface CommDay {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  /** Records of the day within retention. */
  count: number;
  /** Highest `seq` among them (with `count`, changes whenever the day does). */
  maxSeq: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The UTC day `YYYY-MM-DD` of a time in ms. */
export function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** The start (inclusive) and end (exclusive) of a UTC day in ms; throws on a bad day. */
export function dayBounds(day: string): [number, number] {
  const m = DAY_RE.exec(day);
  const start = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  if (!m || !Number.isFinite(start) || utcDay(start) !== day) throw new RangeError(`not a UTC day: ${day}`);
  return [start, start + DAY_MS];
}

/** The record without `seq` (and without anything else that is not a field), or null if it is not one. */
export function commFields(raw: unknown): NewCommRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const strOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
  if (typeof r.character !== 'string' || typeof r.ts !== 'number' || !Number.isFinite(r.ts)) return null;
  if (typeof r.channel !== 'string' || typeof r.talker !== 'string' || typeof r.text !== 'string') return null;
  if (!strOrNull(r.talkerType) || !strOrNull(r.destination)) return null;
  return {
    character: r.character,
    ts: r.ts,
    channel: r.channel,
    talker: r.talker,
    talkerType: r.talkerType,
    destination: r.destination,
    text: r.text,
  };
}

/** A record's identity (ADR 0152): the canonical JSON of its fields without `seq`. */
export function commIdentity(rec: NewCommRecord): string {
  return canonicalJson(commFields(rec) ?? rec);
}

/** Sorts records by `ts`, then identity (a new array; ADR 0152's piece order). */
export function sortCommRecords(records: readonly NewCommRecord[]): NewCommRecord[] {
  return records
    .map((r) => ({ r, id: commIdentity(r) }))
    .sort((a, b) => a.r.ts - b.r.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((x) => x.r);
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

  // ------------------------------------------------------------ the sync

  /**
   * The UTC days that have records within the 7 days before `now`, oldest
   * first, each with its cache key (count, highest `seq`).
   */
  async commDays(now = this.now()): Promise<CommDay[]> {
    this.writeQueued();
    const tx = this.db.transaction(STORE.comm, 'readonly');
    const done = idbDone(tx);
    const req = tx.objectStore(STORE.comm).index('ts').openCursor(IDBKeyRange.lowerBound(now - COMM_RETENTION_MS));
    const days = new Map<string, CommDay>();
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve();
        const r = c.value as CommRecord;
        const day = utcDay(r.ts);
        const d = days.get(day);
        if (d) {
          d.count++;
          if (r.seq > d.maxSeq) d.maxSeq = r.seq;
        } else days.set(day, { day, count: 1, maxSeq: r.seq });
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
    await done;
    return [...days.values()];
  }

  /** The records of a UTC day within retention, without `seq`, sorted by `ts` then identity. */
  async dayRecords(day: string): Promise<NewCommRecord[]> {
    const range = this.dayRange(day);
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
   * `records` are one), removes none; records outside retention or not
   * records at all are skipped. Resolves with how many were added. One
   * transaction, so a message appended meanwhile is never lost.
   */
  async addDayRecords(records: readonly unknown[]): Promise<number> {
    const since = this.now() - COMM_RETENTION_MS;
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
