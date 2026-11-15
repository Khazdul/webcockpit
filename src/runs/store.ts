// Run storage for stage 6 (DB version 5, ADR 0018 "Storage"). Extends the
// capture store (src/capture/store.ts) with the run events and the fields
// History reads:
//
//   runs       + saved?: boolean, rating?: 0–5, savedUs?: µs | null,
//                summary?: RunSummary | null   (absent = the default)
//   runEvents  keyPath ['runId', 'seq']; { runId, seq, event: RunEvent }
//
// `summary` is what History lists from without reading events or chunks.
// The recorder keeps it current (`summarize`) in the same transaction as
// the events it summarises. A stage 6 run is created with `summary: null`
// and gets one at its `run_start`; a run captured before stage 6 has no
// `summary` field at all and is never deleted as too short.
//
// Orphans (a tab that closed mid-run) are sealed by `sealOrphan`: a run
// with a summary gets an `orphan_close` event (its `us` is the seal time)
// and is sealed at its last chunk's `lastUs`; one with `summary: null` had
// nothing but a login and is deleted.
//
// Stage 7 (DB version 6, ADR 0019) adds the `exports` store: one export
// editor document per session, keyPath 'sessionId' (the chain's first run
// id; src/share/edits.ts).
//
// Stage 63 (DB version 10, ADR 0153): `runCloud` (src/cloud/runs/types.ts)
// is read here for History (`listCloud`), and a player's Delete of saved
// runs (`deleteSavedRuns`) removes their rows too and keeps each server id
// whose body may be in the cloud in `syncMeta` (`RUN_BODY_DELETES`): the
// space's runtime deletes those bodies after the next sync that pushed
// the tombstones (ADR 0153 B2, "Delete's body goes after its tombstone").

import { idbDone as done, idbRequest as req, openWebcockpitDb } from '../core/db';
import { CaptureStore, type RunChunk, type RunMeta } from '../capture/store';
import type { ExportDoc } from '../share/edits';
import type { RunCloudRow } from '../cloud/runs/types';
import type { RunEvent } from './events';
import type { RunSummary } from './summary';

export { type RunSummary, summarize, summarizeAll } from './summary';

export interface RunEventRecord {
  runId: string;
  seq: number;
  event: RunEvent;
}

/** What one `append` writes. */
export interface RunAppend {
  chunk?: RunChunk;
  /** UTF-8 bytes and lines of `chunk`. */
  bytes?: number;
  lines?: number;
  events?: RunEventRecord[];
  /** The run's summary after `events` (undefined: unchanged). */
  summary?: RunSummary | null;
}

const runRange = (runId: string): IDBKeyRange => IDBKeyRange.bound([runId, 0], [runId, Infinity]);

/** `syncMeta` key: run id → server id of deleted runs whose body is still to be deleted in the cloud. */
export const RUN_BODY_DELETES = 'runBodyDeletes';

/** The `runCloud` states whose body may be in the cloud (a Delete deletes it after the sync). */
const BODY_MAY_BE_UP = new Set(['up', 'remote', 'fetching', 'queued']);

export class RunStore extends CaptureStore {
  static override async open(factory?: IDBFactory): Promise<RunStore> {
    return new RunStore(await openWebcockpitDb(factory));
  }

  /**
   * Writes a chunk and/or events and the run's new totals and summary in
   * one transaction, so a run's meta always matches what is stored.
   */
  async append(runId: string, a: RunAppend): Promise<void> {
    const tx = this.db.transaction(['runs', 'runChunks', 'runEvents'], 'readwrite');
    const runs = tx.objectStore('runs');
    if (a.chunk) tx.objectStore('runChunks').put(a.chunk);
    if (a.events?.length) {
      const evs = tx.objectStore('runEvents');
      for (const e of a.events) evs.put(e);
    }
    const r = runs.get(runId);
    r.onsuccess = () => {
      const meta = r.result as RunMeta | undefined;
      if (!meta) return;
      meta.bytes += a.bytes ?? 0;
      meta.lines += a.lines ?? 0;
      if (a.summary !== undefined) meta.summary = a.summary;
      runs.put(meta);
    };
    await done(tx);
  }

  /** A run's events in `seq` order. */
  getEvents(runId: string): Promise<RunEventRecord[]> {
    const tx = this.db.transaction('runEvents', 'readonly');
    return req(tx.objectStore('runEvents').getAll(runRange(runId)) as IDBRequest<RunEventRecord[]>);
  }

  /** The highest event `seq` of a run, or -1. */
  async lastEventSeq(runId: string): Promise<number> {
    const tx = this.db.transaction('runEvents', 'readonly');
    const cursor = await req(tx.objectStore('runEvents').openCursor(runRange(runId), 'prev'));
    return (cursor?.value as RunEventRecord | undefined)?.seq ?? -1;
  }

  /** Deletes a run: its meta, chunks and events. */
  async deleteRun(runId: string): Promise<void> {
    const tx = this.db.transaction(['runs', 'runChunks', 'runEvents'], 'readwrite');
    tx.objectStore('runs').delete(runId);
    tx.objectStore('runChunks').delete(runRange(runId));
    tx.objectStore('runEvents').delete(runRange(runId));
    await done(tx);
  }

  /** The `runCloud` rows (empty in the device's space and with the flag `runs` off). */
  listCloud(): Promise<RunCloudRow[]> {
    const tx = this.db.transaction('runCloud', 'readonly');
    return req(tx.objectStore('runCloud').getAll() as IDBRequest<RunCloudRow[]>);
  }

  /**
   * The player's Delete of a session (ADR 0153): every run of it (meta,
   * chunks, events, `runCloud` row) and its export doc, in one
   * transaction; the server id of each run whose body may be in the
   * cloud is kept in `syncMeta` (`RUN_BODY_DELETES`) for the runtime.
   */
  async deleteSavedRuns(runIds: readonly string[], sessionId: string): Promise<void> {
    const tx = this.db.transaction(['runs', 'runChunks', 'runEvents', 'runCloud', 'syncMeta', 'exports'], 'readwrite');
    const cloud = tx.objectStore('runCloud');
    const meta = tx.objectStore('syncMeta');
    const rows = await Promise.all(runIds.map((id) => req(cloud.get(id) as IDBRequest<RunCloudRow | undefined>)));
    const bodies = rows.filter((r): r is RunCloudRow => !!r && BODY_MAY_BE_UP.has(r.state) && typeof r.serverId === 'string');
    if (bodies.length) {
      const cur = (await req(meta.get(RUN_BODY_DELETES))) as Record<string, string> | undefined;
      const next: Record<string, string> = { ...(cur && typeof cur === 'object' ? cur : {}) };
      for (const r of bodies) next[r.runId] = r.serverId;
      meta.put(next, RUN_BODY_DELETES);
    }
    for (const id of runIds) {
      tx.objectStore('runs').delete(id);
      tx.objectStore('runChunks').delete(runRange(id));
      tx.objectStore('runEvents').delete(runRange(id));
      cloud.delete(id);
    }
    tx.objectStore('exports').delete(sessionId);
    await done(tx);
  }

  /** A character's runs, oldest first. */
  runsOf(character: string): Promise<RunMeta[]> {
    const tx = this.db.transaction('runs', 'readonly');
    return req(tx.objectStore('runs').index('character').getAll(character) as IDBRequest<RunMeta[]>).then((rs) =>
      rs.sort((a, b) => a.startedUs - b.startedUs),
    );
  }

  /** The character's most recently started sealed run other than `exclude`. */
  async latestSealedRun(character: string, exclude?: string): Promise<RunMeta | undefined> {
    const runs = await this.runsOf(character);
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i]!;
      if (r.sealed && r.runId !== exclude) return r;
    }
    return undefined;
  }

  /** Applies `fn` to each run's meta in one transaction (save, rate). */
  async updateRuns(runIds: readonly string[], fn: (meta: RunMeta) => void): Promise<void> {
    const tx = this.db.transaction('runs', 'readwrite');
    const runs = tx.objectStore('runs');
    for (const id of runIds) {
      const r = runs.get(id);
      r.onsuccess = () => {
        const meta = r.result as RunMeta | undefined;
        if (!meta) return;
        fn(meta);
        runs.put(meta);
      };
    }
    await done(tx);
  }

  /**
   * Seals an orphan (the caller holds its character's lock): deleted when it
   * never started (`summary: null`), else sealed at its last chunk, with an
   * `orphan_close` event when it has a summary.
   */
  async sealOrphan(meta: RunMeta, nowUs: number): Promise<'sealed' | 'deleted'> {
    if (meta.summary === null) {
      await this.deleteRun(meta.runId);
      return 'deleted';
    }
    const last = await this.lastChunk(meta.runId);
    const endedUs = last ? last.lastUs : meta.startedUs;
    if (meta.summary === undefined) {
      await this.sealRun(meta.runId, endedUs);
      return 'sealed';
    }
    const seq = (await this.lastEventSeq(meta.runId)) + 1;
    const tx = this.db.transaction(['runs', 'runEvents'], 'readwrite');
    const runs = tx.objectStore('runs');
    tx.objectStore('runEvents').put({ runId: meta.runId, seq, event: { type: 'orphan_close', us: nowUs } });
    const r = runs.get(meta.runId);
    r.onsuccess = () => {
      const m = r.result as RunMeta | undefined;
      if (!m || m.sealed) return;
      m.sealed = true;
      m.endedUs = endedUs;
      if (m.summary && endedUs > m.summary.lastEventUs) m.summary = { ...m.summary, lastEventUs: endedUs };
      runs.put(m);
    };
    await done(tx);
    return 'sealed';
  }

  /** The export doc of a session, if one was saved. */
  getExport(sessionId: string): Promise<ExportDoc | undefined> {
    const tx = this.db.transaction('exports', 'readonly');
    return req(tx.objectStore('exports').get(sessionId) as IDBRequest<ExportDoc | undefined>);
  }

  async putExport(doc: ExportDoc): Promise<void> {
    const tx = this.db.transaction('exports', 'readwrite');
    tx.objectStore('exports').put(doc);
    await done(tx);
  }

  async deleteExport(sessionId: string): Promise<void> {
    const tx = this.db.transaction('exports', 'readwrite');
    tx.objectStore('exports').delete(sessionId);
    await done(tx);
  }

  /** Every export doc (backup, sweep). */
  listExports(): Promise<ExportDoc[]> {
    const tx = this.db.transaction('exports', 'readonly');
    return req(tx.objectStore('exports').getAll() as IDBRequest<ExportDoc[]>);
  }

  /** One chunk by `seq`, if stored. */
  getChunk(runId: string, seq: number): Promise<RunChunk | undefined> {
    const tx = this.db.transaction('runChunks', 'readonly');
    return req(tx.objectStore('runChunks').get([runId, seq]) as IDBRequest<RunChunk | undefined>);
  }

  /** A run's chunks from `seq` on, while `keep(chunk)` holds (in seq order). */
  chunksFrom(runId: string, seq: number, keep: (c: RunChunk) => boolean): Promise<RunChunk[]> {
    const tx = this.db.transaction('runChunks', 'readonly');
    const out: RunChunk[] = [];
    const r = tx.objectStore('runChunks').openCursor(IDBKeyRange.bound([runId, seq], [runId, Infinity]));
    return new Promise((resolve, reject) => {
      r.onsuccess = () => {
        const cur = r.result;
        const c = cur?.value as RunChunk | undefined;
        if (!cur || !c || !keep(c)) return resolve(out);
        out.push(c);
        cur.continue();
      };
      r.onerror = () => reject(r.error);
    });
  }

  /** Adds a whole run (restore): meta, events and chunks in one transaction. */
  async putWholeRun(meta: RunMeta, events: RunEventRecord[], chunks: RunChunk[]): Promise<void> {
    const tx = this.db.transaction(['runs', 'runChunks', 'runEvents'], 'readwrite');
    tx.objectStore('runs').put(meta);
    const evs = tx.objectStore('runEvents');
    for (const e of events) evs.put(e);
    const cs = tx.objectStore('runChunks');
    for (const c of chunks) cs.put(c);
    await done(tx);
  }
}
