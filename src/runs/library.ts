// The run library (ADR 0018 "RunLibrary"): what History, Statistics and the
// log player read, and the retention sweep and backups.
//
//   listSessions(now)   sealed runs stitched into sessions, newest first
//   characters()        characters with sealed runs, alphabetical
//   events(ids)         the runs' events in time order
//   chainLog(ids)       each run's meta and its capture text
//   chainLogRange(id, from, to)  a run's capture text around a time range,
//                       whole chunks only (Spotlights, ADR 0019)
//   chainOf(id, now)    the session holding a run, the unsealed one included
//   exportDoc / saveExportDoc  the export editor's record of a session
//                       (DB v6, keyed by the chain's first run id)
//   save / remove       per chain (every run); Delete is the only way out
//   sweep(now)          under the Web Lock `webcockpit-sweep` (one tab):
//                       seals orphans whose lock is free, then deletes every
//                       unsaved sealed run that started over 14 days ago,
//                       and every export doc whose session run is gone
//   backup / restore    all sealed runs as one gzip JSON-lines file
//   estimate()          navigator.storage.estimate()
//
// Backup format (`webcockpit-runs-YYYY-MM-DD.jsonl.gz`, `zcat` reads it):
//
//   {"type":"webcockpit-runs","schema":1,"exportedUs":…}
//   {"type":"run","run":{…RunMeta}}
//   {"type":"event","runId":…,"seq":…,"event":{…}}      (that run's events)
//   {"type":"chunk","runId":…,"seq":…,"firstUs":…,"lastUs":…,"text":…}
//   … the next run …
//   {"type":"export","doc":{…ExportDoc}}                (after the runs, ADR 0019)
//
// The lines and their checks are src/runs/lines.ts, shared with a
// run's body in the cloud (ADR 0153).
//
// Runs in the cloud (stage 63 C1, ADR 0153), through src/runs/cloud-hook.ts
// (set by the space's runtime when the flag `runs` is on):
//
//   listSessions(now, {remote: true})  History's list: the `remote` rows'
//                       metas stitched in with the runs here
//   cloudRows()         the `runCloud` rows by run id (History's marks)
//   ensureLocal(s, p)   fetches a session's cloud-only runs before they
//                       are read (the player, the export editor)
//   save                tells the hook (the queue takes the sealed runs)
//   remove              deletes the runs here and their rows; the hook
//                       deletes them everywhere (a tombstone, then the body)
//   sweep               keeps the export docs of sessions in the cloud
//   backup(now, {only}) the runs backup of some runs (Log out's Download)
// Export lines were added in stage 7 without a schema bump (additive): a
// stage 6 reader rejects them as an unknown record, a stage 7 reader reads
// stage 6 files unchanged.
// Restore reads the file twice: the first pass checks every line (a bad
// file is rejected before anything is written), the second adds each run
// whose `runId` is not stored yet, one transaction per run, then each export
// doc for which no doc is stored.

import type { RunMeta } from '../capture/store';
import { type LockManagerLike, acquire, runLockName } from '../capture/recorder';
import { type ExportDoc, defaultExportDoc, normalizeExportDoc } from '../share/edits';
import { BACKUP_SCHEMA, BACKUP_TYPE, BadBackupError, type RunRows, checkRecord, parseLine, runLines, streamLines, toChunk, toEvent, toRunMeta } from './lines';
import type { RunEvent } from './events';
import type { RunCloudRow } from '../cloud/runs/types';
import { type EnsureResult, type FetchProgressFn, type SaveWhere, runCloudHook } from './cloud-hook';
import { noteStored } from '../core/store-events';
import { RunStore } from './store';
import { DAY_US, RETENTION_DAYS, type Session, stitchChains, stitchSessions, toSession } from './stitch';

export { BACKUP_SCHEMA, BACKUP_TYPE, BadBackupError } from './lines';

/** Web Lock held by the tab that sweeps. */
export const SWEEP_LOCK = 'webcockpit-sweep';

/** `webcockpit-runs-2026-09-27.jsonl.gz` (local date). */
export function backupFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `webcockpit-runs-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.jsonl.gz`;
}

export interface RunLibraryOptions {
  /** Web Locks; default `navigator.locks`. `null`: no sweep lock, no orphan sealing. */
  locks?: LockManagerLike | null;
  /** Storage estimate; default `navigator.storage`. */
  storage?: { estimate(): Promise<{ usage?: number; quota?: number }> } | null;
}

export class RunLibrary {
  private readonly locks: LockManagerLike | null;
  private readonly storage: RunLibraryOptions['storage'];

  constructor(
    readonly store: RunStore,
    opts: RunLibraryOptions = {},
  ) {
    const nav = globalThis.navigator as Navigator | undefined;
    this.locks = opts.locks !== undefined ? opts.locks : (nav?.locks ?? null);
    this.storage = opts.storage !== undefined ? opts.storage : (nav?.storage ?? null);
  }

  static async open(factory?: IDBFactory, opts?: RunLibraryOptions): Promise<RunLibrary> {
    return new RunLibrary(await RunStore.open(factory), opts);
  }

  // ------------------------------------------------------------------ read

  /**
   * Sessions of sealed runs, newest first (the active run is never
   * listed). `remote`: the account's runs that are only in the cloud
   * (`runCloud` rows `remote` or `fetching`) are stitched in from their
   * metas (History; ADR 0153).
   */
  async listSessions(nowUs: number, o: { remote?: boolean } = {}): Promise<Session[]> {
    const runs = (await this.store.listRuns()).filter((r) => r.sealed);
    if (o.remote) {
      const here = new Set(runs.map((r) => r.runId));
      for (const row of await this.cloudList()) {
        if ((row.state === 'remote' || row.state === 'fetching') && row.meta && !here.has(row.runId)) runs.push(row.meta);
      }
    }
    return stitchSessions(runs, nowUs);
  }

  /** The `runCloud` rows by run id (empty for a guest, or with the flag `runs` off). */
  async cloudRows(): Promise<Map<string, RunCloudRow>> {
    return new Map((await this.cloudList()).map((r) => [r.runId, r]));
  }

  private async cloudList(): Promise<RunCloudRow[]> {
    try {
      return await this.store.listCloud();
    } catch {
      return []; // a database before version 10 (a test's), or a store in memory
    }
  }

  /**
   * Before a session is read (the player, the export editor): its runs
   * that are only in the cloud are fetched (`onProgress(done, total)` in
   * bytes). `ok` when every run is here now.
   */
  async ensureLocal(session: Session, onProgress?: FetchProgressFn): Promise<EnsureResult> {
    const rows = await this.cloudRows();
    const ids = session.runs.map((r) => r.runId).filter((id) => {
      const st = rows.get(id)?.state;
      return st === 'remote' || st === 'fetching';
    });
    if (ids.length === 0) return { ok: true };
    const hook = runCloudHook();
    if (!hook) return { ok: false, why: 'unavailable' };
    return hook.fetch(ids, onProgress);
  }

  /** Characters with sealed runs, alphabetical. */
  async characters(): Promise<string[]> {
    const set = new Set<string>();
    for (const r of await this.store.listRuns()) if (r.sealed) set.add(r.character);
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  /** The events of `runIds`, in time order (stable: `seq` order within a run). */
  async events(runIds: readonly string[]): Promise<RunEvent[]> {
    const out: RunEvent[] = [];
    for (const id of runIds) for (const r of await this.store.getEvents(id)) out.push(r.event);
    return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.us - b.e.us || a.i - b.i).map((x) => x.e);
  }

  /** Each run's meta and capture text (chunks joined), in the given order. */
  async chainLog(runIds: readonly string[]): Promise<Array<{ meta: RunMeta; text: string }>> {
    const out: Array<{ meta: RunMeta; text: string }> = [];
    for (const id of runIds) {
      const meta = await this.store.getRun(id);
      if (!meta) continue;
      const chunks = await this.store.getChunks(id);
      out.push({ meta, text: chunks.map((c) => c.text).join('') });
    }
    return out;
  }

  /**
   * A run's meta and the text of its chunks that overlap `[fromUs, toUs]`
   * (whole chunks, so the text starts at or before `fromUs` and ends at or
   * after `toUs` when the run has lines there). Reads only those chunks.
   * Null when the run is not stored.
   */
  async chainLogRange(runId: string, fromUs: number, toUs: number): Promise<{ meta: RunMeta; text: string } | null> {
    const meta = await this.store.getRun(runId);
    if (!meta) return null;
    const last = await this.store.lastChunk(runId);
    if (!last || last.lastUs < fromUs) return { meta, text: '' };
    // Binary search for the first chunk ending at or after `fromUs` (seqs
    // are 0…last.seq); a hole in the seqs falls back to reading them all.
    let lo = 0;
    let hi = last.seq;
    let holes = false;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const c = await this.store.getChunk(runId, mid);
      if (!c) {
        holes = true;
        break;
      }
      if (c.lastUs >= fromUs) hi = mid;
      else lo = mid + 1;
    }
    const chunks = holes
      ? (await this.store.getChunks(runId)).filter((c) => c.lastUs >= fromUs && c.firstUs <= toUs)
      : await this.store.chunksFrom(runId, lo, (c) => c.firstUs <= toUs);
    return { meta, text: chunks.map((c) => c.text).join('') };
  }

  /**
   * The session that holds `runId`, stitched over the character's sealed
   * runs plus that run even when it is not sealed (the live run).
   */
  async chainOf(runId: string, nowUs: number): Promise<Session | null> {
    const meta = await this.store.getRun(runId);
    if (!meta) return null;
    const runs = (await this.store.runsOf(meta.character)).filter((r) => r.sealed || r.runId === runId);
    const chain = stitchChains(runs).find((c) => c.some((r) => r.runId === runId));
    return chain ? toSession(chain, nowUs) : null;
  }

  // ----------------------------------------------------------------- write

  /**
   * Saves every run of the session. With `rating` (0–5) every run gets it;
   * without, each run keeps its own.
   */
  async save(session: Session, rating?: number, nowUs: number = Date.now() * 1000, o: { where?: SaveWhere } = {}): Promise<void> {
    const r = rating === undefined ? undefined : Math.max(0, Math.min(5, Math.round(rating)));
    const ids = session.runs.map((m) => m.runId);
    await this.store.updateRuns(ids, (m) => {
      m.saved = true;
      m.savedUs = nowUs;
      if (r !== undefined) m.rating = r;
      else m.rating ??= 0;
    });
    // Logged in with runs in the cloud: the sealed ones are queued (the live run once it is sealed).
    runCloudHook()?.saved(ids, o.where ?? 'history');
  }

  /**
   * Deletes every run of the session (meta, chunks, events, its
   * `runCloud` row) and its export doc. Logged in with runs in the
   * cloud, that deletes them on every device and in the cloud (the
   * tombstones at the next sync, then the bodies).
   */
  async remove(session: Session): Promise<void> {
    const ids = session.runs.map((m) => m.runId);
    try {
      await this.store.deleteSavedRuns(ids, session.id);
    } catch {
      // A database before version 10 (no `runCloud`): as before stage 63.
      for (const id of ids) await this.store.deleteRun(id);
      await this.store.deleteExport(session.id);
    }
    runCloudHook()?.removed(ids);
  }

  // --------------------------------------------------------------- exports

  /** The export editor's document of a session (`Session.id`); the defaults when none is saved. */
  async exportDoc(sessionId: string): Promise<ExportDoc> {
    const raw = await this.store.getExport(sessionId);
    return (raw && normalizeExportDoc(raw)) ?? defaultExportDoc(sessionId);
  }

  /** Saves an export doc (every edit). */
  async saveExportDoc(doc: ExportDoc): Promise<void> {
    await this.store.putExport(doc);
    noteStored('exportDoc');
  }

  /**
   * Retention (Inv §7.8): seals orphans whose lock is free, then deletes
   * unsaved sealed runs that started more than 14 days before `nowUs`.
   * Only one tab sweeps (Web Lock, `ifAvailable`). Resolves with the number
   * of runs deleted; never rejects.
   */
  async sweep(nowUs: number): Promise<number> {
    try {
      if (!this.locks) return await this.sweepLocked(nowUs);
      let n = 0;
      await this.locks.request(SWEEP_LOCK, { ifAvailable: true }, async (lock) => {
        if (lock) n = await this.sweepLocked(nowUs);
      });
      return n;
    } catch (err) {
      console.error('[runs] sweep failed', err);
      return 0;
    }
  }

  private async sweepLocked(nowUs: number): Promise<number> {
    let deleted = 0;
    const cutoff = nowUs - RETENTION_DAYS * DAY_US;
    for (const r of await this.store.listRuns()) {
      if (r.sealed) {
        if (!r.saved && r.startedUs < cutoff) {
          await this.store.deleteRun(r.runId);
          deleted++;
        }
        continue;
      }
      if (!this.locks) continue;
      const release = await acquire(this.locks, runLockName(r.character));
      if (!release) continue;
      try {
        if ((await this.store.sealOrphan(r, nowUs)) === 'deleted') deleted++;
        else if (!r.saved && r.startedUs < cutoff) {
          await this.store.deleteRun(r.runId);
          deleted++;
        }
      } finally {
        release();
      }
    }
    // Export docs of sessions whose first run is gone (deleted above, or a
    // chain whose first run expired before the rest); a session in the
    // cloud (its first run has a `runCloud` row) keeps its doc (ADR 0153).
    const runs = new Set((await this.store.listRuns()).map((r) => r.runId));
    for (const r of await this.cloudList()) runs.add(r.runId);
    for (const d of await this.store.listExports()) if (!runs.has(d.sessionId)) await this.store.deleteExport(d.sessionId);
    return deleted;
  }

  /** Storage use of the origin, or null when the browser cannot tell. */
  async estimate(): Promise<{ usage: number; quota: number } | null> {
    try {
      const e = await this.storage?.estimate();
      if (!e || typeof e.usage !== 'number' || typeof e.quota !== 'number') return null;
      return { usage: e.usage, quota: e.quota };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- backup

  /**
   * Every sealed run as a gzip JSON-lines file (see the file header);
   * `only`: just those runs (Log out's Download of the runs not in the
   * cloud).
   */
  async backup(nowUs: number = Date.now() * 1000, o: { only?: ReadonlySet<string> } = {}): Promise<Blob> {
    const parts: string[] = [JSON.stringify({ type: BACKUP_TYPE, schema: BACKUP_SCHEMA, exportedUs: nowUs }) + '\n'];
    const sealed = new Set<string>();
    for (const meta of await this.store.listRuns()) {
      if (!meta.sealed || (o.only && !o.only.has(meta.runId))) continue;
      sealed.add(meta.runId);
      for (const line of runLines({ meta, events: await this.store.getEvents(meta.runId), chunks: await this.store.getChunks(meta.runId) })) parts.push(line);
    }
    for (const doc of await this.store.listExports()) {
      if (sealed.has(doc.sessionId)) parts.push(JSON.stringify({ type: 'export', doc }) + '\n');
    }
    return gzip(new Blob(parts));
  }

  /**
   * Adds the runs of a backup file that are not stored yet. Rejects with
   * `BadBackupError` (nothing written) when the file is not a valid backup.
   */
  async restore(file: Blob): Promise<{ added: number; skipped: number }> {
    // Pass 1: check everything.
    let header = false;
    let cur: string | null = null;
    let n = 0;
    try {
      for await (const text of readLines(file)) {
        n++;
        if (!text) continue;
        const o = parseLine(text, n);
        if (!header) {
          if (o.type !== BACKUP_TYPE || o.schema !== BACKUP_SCHEMA) throw new BadBackupError('Not a WebCockpit runs backup.');
          header = true;
          continue;
        }
        cur = checkRecord(o, cur, n);
      }
    } catch (err) {
      if (err instanceof BadBackupError) throw err;
      throw new BadBackupError('The file could not be read as a gzip backup.');
    }
    if (!header) throw new BadBackupError('Not a WebCockpit runs backup.');

    // Pass 2: write the new runs.
    const have = new Set((await this.store.listRuns()).map((r) => r.runId));
    let added = 0;
    let skipped = 0;
    let run: RunRows | null = null;
    const flush = async (): Promise<void> => {
      if (!run) return;
      const r = run;
      run = null;
      if (have.has(r.meta.runId)) {
        skipped++;
        return;
      }
      have.add(r.meta.runId);
      await this.store.putWholeRun(r.meta, r.events, r.chunks);
      added++;
    };
    const docs: ExportDoc[] = [];
    let first = true;
    for await (const text of readLines(file)) {
      if (!text) continue;
      if (first) {
        first = false;
        continue;
      }
      const o = JSON.parse(text) as Record<string, unknown>;
      if (o.type === 'run') {
        await flush();
        run = { meta: toRunMeta(o), events: [], chunks: [] };
      } else if (o.type === 'event') {
        run!.events.push(toEvent(o));
      } else if (o.type === 'export') {
        const doc = normalizeExportDoc(o.doc);
        if (doc) docs.push(doc);
      } else if (o.type === 'chunk') {
        run!.chunks.push(toChunk(o));
      }
    }
    await flush();
    for (const doc of docs) if (!(await this.store.getExport(doc.sessionId))) await this.store.putExport(doc);
    return { added, skipped };
  }
}

// ------------------------------------------------------------ file helpers

async function gzip(blob: Blob): Promise<Blob> {
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
  const out = await new Response(stream).blob();
  return new Blob([out], { type: 'application/gzip' });
}

/** The lines of a gzip text file, without their `\n`. */
function readLines(file: Blob): AsyncGenerator<string> {
  return streamLines(file.stream().pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()));
}
