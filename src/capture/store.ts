// IndexedDB storage for raw run capture (ADR 0006, ADR 0008).
//
// Stores in the shared `webcockpit` database (opened by src/core/db.ts):
//
//   runs       keyPath 'runId'
//              { runId, character, startedUs, endedUs: number|null,
//                sealed: boolean, bytes, lines }
//              indexes: 'character' → character, 'startedUs' → startedUs
//   runChunks  keyPath ['runId', 'seq']
//              { runId, seq, firstUs, lastUs, text }
//
// `bytes` is the UTF-8 size of all chunk texts, `lines` the number of
// captured lines.
//
// Stage 6 (DB version 5, ADR 0018) adds optional fields to `runs` records
// (absent on older records = the default) and the `runEvents` store; both
// are handled by src/runs/store.ts (`RunStore extends CaptureStore`).

import { idbDone as done, idbRequest as req, openWebcockpitDb } from '../core/db';
import type { RunSummary } from '../runs/store';
import { noteStored } from '../core/store-events';

export { DB_NAME, DB_VERSION, openWebcockpitDb, requestPersistence } from '../core/db';

export interface RunMeta {
  runId: string;
  character: string;
  startedUs: number;
  endedUs: number | null;
  sealed: boolean;
  bytes: number;
  lines: number;
  /** Saved (kept by retention); absent = false (ADR 0018). */
  saved?: boolean;
  /** 0–5; absent = 0. */
  rating?: number;
  /** When it was saved (µs), or null / absent. */
  savedUs?: number | null;
  /**
   * Kept current by the recorder from the run's events. `null`: a stage 6
   * run with no `run_start` yet; absent: a run captured before stage 6.
   */
  summary?: RunSummary | null;
}

export interface RunChunk {
  runId: string;
  seq: number;
  firstUs: number;
  lastUs: number;
  text: string;
}

export class CaptureStore {
  constructor(readonly db: IDBDatabase) {}

  static async open(factory?: IDBFactory): Promise<CaptureStore> {
    return new CaptureStore(await openWebcockpitDb(factory));
  }

  async putRun(meta: RunMeta): Promise<void> {
    const tx = this.db.transaction('runs', 'readwrite');
    tx.objectStore('runs').put(meta);
    await done(tx);
  }

  getRun(runId: string): Promise<RunMeta | undefined> {
    const tx = this.db.transaction('runs', 'readonly');
    return req(tx.objectStore('runs').get(runId) as IDBRequest<RunMeta | undefined>);
  }

  /** All runs, oldest first by start time. */
  listRuns(): Promise<RunMeta[]> {
    const tx = this.db.transaction('runs', 'readonly');
    return req(tx.objectStore('runs').index('startedUs').getAll() as IDBRequest<RunMeta[]>);
  }

  /** The most recently started run, if any. */
  async latestRun(): Promise<RunMeta | undefined> {
    const tx = this.db.transaction('runs', 'readonly');
    const cursor = await req(tx.objectStore('runs').index('startedUs').openCursor(null, 'prev'));
    return (cursor?.value as RunMeta | undefined) ?? undefined;
  }

  /**
   * Writes one chunk and bumps the run's `bytes`/`lines` in the same
   * transaction, so a run's totals always match its chunks.
   */
  async appendChunk(chunk: RunChunk, bytes: number, lines: number): Promise<void> {
    const tx = this.db.transaction(['runs', 'runChunks'], 'readwrite');
    const runs = tx.objectStore('runs');
    tx.objectStore('runChunks').put(chunk);
    const r = runs.get(chunk.runId);
    r.onsuccess = () => {
      const meta = r.result as RunMeta | undefined;
      if (!meta) return;
      meta.bytes += bytes;
      meta.lines += lines;
      runs.put(meta);
    };
    await done(tx);
  }

  /**
   * Marks a run sealed with `endedUs`. A saved run sealed (the Exit popup
   * saves the live run before the game ends) is noted, so the upload queue
   * of runs in the cloud takes it at once (stage 63 C2, ADR 0153).
   */
  async sealRun(runId: string, endedUs: number): Promise<void> {
    const tx = this.db.transaction('runs', 'readwrite');
    const runs = tx.objectStore('runs');
    const r = runs.get(runId);
    let saved = false;
    r.onsuccess = () => {
      const meta = r.result as RunMeta | undefined;
      if (!meta || meta.sealed) return;
      meta.sealed = true;
      meta.endedUs = endedUs;
      saved = !!meta.saved;
      runs.put(meta);
    };
    await done(tx);
    if (saved) noteStored('runSealed');
  }

  /** A run's chunks in sequence order. */
  getChunks(runId: string): Promise<RunChunk[]> {
    const tx = this.db.transaction('runChunks', 'readonly');
    const range = IDBKeyRange.bound([runId, 0], [runId, Infinity]);
    return req(tx.objectStore('runChunks').getAll(range) as IDBRequest<RunChunk[]>);
  }

  /** The last chunk of a run, if any. */
  async lastChunk(runId: string): Promise<RunChunk | undefined> {
    const tx = this.db.transaction('runChunks', 'readonly');
    const range = IDBKeyRange.bound([runId, 0], [runId, Infinity]);
    const cursor = await req(tx.objectStore('runChunks').openCursor(range, 'prev'));
    return (cursor?.value as RunChunk | undefined) ?? undefined;
  }

  close(): void {
    this.db.close();
  }
}
