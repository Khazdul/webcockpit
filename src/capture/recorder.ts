// Raw run recorder (Inv §7.1, spec §1.4, §2.8, ADR 0006, ADR 0008).
//
// - A run starts when the connection reaches `playing` (after GMCP
//   Char.Name) and is sealed when it leaves `playing`.
// - Lines are formatted into strings as they arrive and kept in memory; a
//   chunk is written every `flushMs` (2 s), on pagehide / hidden, and as
//   soon as the next line would take it over `CHUNK_BYTES`. There is no IndexedDB work per line.
// - Bytes are counted as lines are captured, and no chunk holds more than
//   `CHUNK_BYTES`: a burst becomes several chunks, each written in its own
//   task (the next starts after the previous transaction completed), so the
//   join and the structured clone stay small (ADR 0044 rule 6).
// - One writer per character: the Web Lock `webcockpit-run-<name>` is held
//   for the whole run. If another tab holds it, this tab does not record.
// - Unsealed runs whose lock is free are orphans (a crashed or closed tab)
//   and are sealed at their last chunk's `lastUs` on start-up, and for the
//   character whenever a new run for it starts.
// - Every store operation runs on one promise chain, so start, flushes and
//   seal are strictly ordered.
// - Each run has its own buffers (`RunCapture`): a run that starts before
//   the previous run's seal task has run never shares lines or events with
//   it.
// - Replays are never captured: a `conn.state` with `replay` never starts a
//   run, even when recorded GMCP takes the replay to `playing`.
//
// Client records (format.ts, ADR 0016):
// - GMCP: every inbound message (`gmcp.raw`) except Core.Ping replies, at
//   its frame's receive time. Messages that arrive on the connection before
//   the run starts (Comm.Channel.List, the Char.Name that starts it …) are
//   kept, up to `PRE_RUN_GMCP_MAX`, and written first when the run starts.
// - VIEW / SIZE: the latest `view.settings` / `view.size` are written when
//   the run starts, and again `VIEW_DEBOUNCE_MS` after a change (the last
//   value wins), and at the end of the run if a change is still pending.
//
// Run events (ADR 0018, stage 6): with `events` (the App's RunEventDeriver)
// the events of the recorded run are buffered like the lines and written
// with each chunk (`RunStore.append`, one transaction with the new
// summary). `run_start` gets its `previousRunId` when it is written (the
// character's latest sealed run, after orphan sealing). Events are taken
// until the run's final write, so a `run_end` from the same `conn.state`
// is kept whatever the subscription order. A run sealed without a
// `run_start` is too short and is deleted (meta, chunks, events); an
// orphan gets an `orphan_close` (src/runs/store.ts `sealOrphan`). Without
// `events` runs are recorded as in stage 5 (no summary, never deleted).

import type { Bus } from '../core/bus';
import { type ConnState, nowUs } from '../core/types';
import {
  RECORD,
  formatGmcpRecord,
  formatInbound,
  formatOutbound,
  formatRecord,
  makeRunId,
  utf8Length,
} from './format';
import type { RunMeta } from './store';
import type { RunEvent } from '../runs/events';
import { type RunEventRecord, RunStore, type RunSummary, summarize } from '../runs/store';

export const FLUSH_MS = 2000;
/** Most UTF-8 bytes in one chunk (a single longer line gets a chunk of its own). */
export const CHUNK_BYTES = 256 * 1024;
/** GMCP lines kept from before the run starts on one connection. */
export const PRE_RUN_GMCP_MAX = 64;
/** Delay before a changed view (settings, size) is written. */
export const VIEW_DEBOUNCE_MS = 500;

/** Web Lock name for a character's run. */
export function runLockName(character: string): string {
  return 'webcockpit-run-' + character;
}

/** The subset of `LockManager` the recorder uses (injectable for tests). */
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => Promise<void> | void,
  ): Promise<unknown>;
}

/** Where run events come from (the App's `RunEventDeriver`). */
export interface RunEventSource {
  subscribe(fn: (e: RunEvent) => void): () => void;
}

export interface RecorderOptions {
  /** Opens the store; default `RunStore.open()`. */
  openStore?: () => Promise<RunStore>;
  /** Run events to persist with the run (ADR 0018); absent = lines only. */
  events?: RunEventSource;
  /** Web Locks; default `navigator.locks`. `null` means unavailable. */
  locks?: LockManagerLike | null;
  /** Called with a short status text whenever it changes. */
  onStatus?: (text: string) => void;
  /** Chunk interval in ms (default 2000). */
  flushMs?: number;
  /** Chunk size limit in UTF-8 bytes (default `CHUNK_BYTES`). */
  chunkBytes?: number;
  /** Window for pagehide/visibilitychange; default `globalThis.window`. */
  win?: Window | null;
  /** Clock in µs (default `nowUs`). */
  now?: () => number;
  /** Debounce of VIEW / SIZE records in ms (default 500). */
  viewDebounceMs?: number;
}

export const STATUS = {
  idle: 'capture: idle',
  recording: 'capture: recording',
  anotherTab: 'capture: another tab',
  noDb: 'capture: off (no IndexedDB)',
  noLocks: 'capture: off (no Web Locks)',
  error: 'capture: error',
} as const;

/** Captured lines cut into one chunk. */
interface PendingChunk {
  lines: string[];
  bytes: number;
  firstUs: number;
  lastUs: number;
}

/** One run's capture state (per run, so runs never share buffers). */
interface RunCapture {
  character: string;
  /** Set by the start task once the meta is stored; null until then (or when it failed). */
  runId: string | null;
  release: (() => void) | null;
  /** Next chunk seq. */
  seq: number;
  /** Lines of the chunk being filled, their UTF-8 bytes and time span. */
  buf: string[];
  bufBytes: number;
  bufFirstUs: number;
  bufLastUs: number;
  /** Full chunks cut from `buf`, oldest first, not written yet. */
  ready: PendingChunk[];
  /** Run events not written yet, and their state. */
  evBuf: RunEvent[];
  evSeq: number;
  hasStart: boolean;
  summary: RunSummary | null;
}

export class Recorder {
  private readonly opts: RecorderOptions;
  private readonly locks: LockManagerLike | null;
  private readonly now: () => number;
  private readonly storeP: Promise<RunStore | null>;
  private chain: Promise<void> = Promise.resolve();

  private state: ConnState = 'idle';
  private character: string | null = null;
  /** The run lines are buffered for, from `playing` until it stops. */
  private run: RunCapture | null = null;
  /**
   * The run that takes run events: the current run, or after it stopped
   * the stopped run until its final write (a `run_end` from the same
   * `conn.state` is kept whatever the subscription order). A newer run
   * takes over at its start.
   */
  private evRun: RunCapture | null = null;
  /** Set once a start was attempted for the current `playing` period. */
  private triedThisPlaying = false;
  /** The recording run's id (stored and not yet sealed). */
  private current: string | null = null;

  /** The latest run started in this tab (kept after its seal), and the one before. */
  private lastRunId: string | null = null;
  private prevLastRunId: string | null = null;

  /** The current connection is a replay (never recorded). */
  private replay = false;
  /** GMCP lines of this connection from before the run started. */
  private preRun: { ts: number; line: string }[] = [];
  /** Latest view payloads seen, and the ones written in this run. */
  private viewJson = '';
  private sizeJson = '';
  private viewWritten = '';
  private sizeWritten = '';
  private viewTimer: ReturnType<typeof setTimeout> | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private statusText = '';
  private readonly unsubs: Array<() => void> = [];
  private readonly win: Window | null;
  private readonly chunkBytes: number;

  constructor(bus: Bus, opts: RecorderOptions = {}) {
    this.opts = opts;
    this.now = opts.now ?? nowUs;
    this.locks =
      opts.locks !== undefined
        ? opts.locks
        : ((globalThis.navigator as Navigator | undefined)?.locks ?? null);
    this.win = opts.win !== undefined ? opts.win : (globalThis.window ?? null);
    this.chunkBytes = opts.chunkBytes ?? CHUNK_BYTES;

    const open = opts.openStore ?? (() => RunStore.open());
    this.storeP = open().then(
      (s) => s,
      () => null,
    );
    this.enqueue(async () => {
      const store = await this.storeP;
      if (!store) return this.setStatus(STATUS.noDb);
      if (!this.locks) return this.setStatus(STATUS.noLocks);
      if (!this.statusText) this.setStatus(STATUS.idle);
      await this.sealOrphans(store, null);
    });

    this.unsubs.push(
      bus.on('gmcp', (m) => {
        if (m.pkg.toLowerCase() !== 'char.name') return;
        const n = (m.data as { name?: unknown } | undefined)?.name;
        if (typeof n === 'string' && n) {
          this.character = n;
          this.maybeStart();
        }
      }),
      bus.on('conn.state', (s) => {
        const was = this.state;
        this.state = s.state;
        this.replay = s.replay === true;
        if (s.state === 'connecting') this.preRun = [];
        if (s.state === 'playing') this.maybeStart();
        else if (was === 'playing') this.stop();
      }),
      bus.on('gmcp.raw', (m) => {
        if (m.pkg === 'Core.Ping' || this.replay) return;
        const ts = m.ts ?? this.now();
        const line = formatGmcpRecord(ts, m.pkg, m.json);
        if (this.run) this.capture(ts, line);
        else if (this.state === 'login' || this.state === 'connecting') {
          this.preRun.push({ ts, line });
          if (this.preRun.length > PRE_RUN_GMCP_MAX) this.preRun.shift();
        }
      }),
      bus.on('view.settings', (v) => {
        this.viewJson = v.json;
        this.viewChanged();
      }),
      bus.on('view.size', (v) => {
        this.sizeJson = JSON.stringify({ cols: v.cols, rows: v.rows });
        this.viewChanged();
      }),
      bus.on('text.line', (line) => {
        if (this.run) this.capture(line.ts, formatInbound(line.ts, line.raw));
      }),
      ...(opts.events
        ? [
            opts.events.subscribe((e) => {
              const run = this.evRun;
              if (!run) return;
              if (e.type === 'run_start') run.hasStart = true;
              run.evBuf.push(e);
            }),
          ]
        : []),
      bus.on('cmd.sent', (c) => {
        // echo:false commands were still sent, so they are captured; a
        // replayed log's commands were not sent now.
        if (this.run && !c.secret && !c.replay) this.capture(c.ts, formatOutbound(c.ts, c.text));
      }),
    );

    this.win?.addEventListener('pagehide', this.onHide);
    this.win?.document?.addEventListener('visibilitychange', this.onVisibility);
  }

  /** The run being recorded, or null. */
  get runId(): string | null {
    return this.current;
  }

  /**
   * The latest run started in this tab, recording or sealed (null when
   * none, or when it was deleted as too short). LiveRuns' anchor.
   */
  get lastRun(): string | null {
    return this.lastRunId;
  }

  get status(): string {
    return this.statusText;
  }

  /** The store, or null when IndexedDB is unavailable. */
  getStore(): Promise<RunStore | null> {
    return this.storeP;
  }

  /** Writes buffered lines now; resolves when all queued work is done. */
  flush(): Promise<void> {
    const run = this.run;
    if (run) this.enqueue(() => this.writeChunk(run));
    return this.chain;
  }

  /** Resolves when all queued store work is done (for tests). */
  idle(): Promise<void> {
    return this.chain;
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.win?.removeEventListener('pagehide', this.onHide);
    this.win?.document?.removeEventListener('visibilitychange', this.onVisibility);
    if (this.run) this.stop();
  }

  // --------------------------------------------------------------- capture

  private capture(ts: number, s: string): void {
    const run = this.run;
    if (!run) return;
    const bytes = utf8Length(s);
    if (run.buf.length && run.bufBytes + bytes > this.chunkBytes) {
      // Full: the chunk is written now, in a task of its own.
      cutChunk(run);
      this.enqueue(() => this.writeChunk(run, true));
    }
    if (run.buf.length === 0) run.bufFirstUs = ts;
    run.bufLastUs = ts;
    run.buf.push(s);
    run.bufBytes += bytes;
  }

  private readonly onHide = (): void => {
    if (this.run) void this.flush();
  };

  private readonly onVisibility = (): void => {
    if (this.win?.document?.visibilityState === 'hidden') this.onHide();
  };

  // ------------------------------------------------------------- lifecycle

  private maybeStart(): void {
    if (this.state !== 'playing' || this.replay || !this.character || this.run || this.triedThisPlaying) return;
    this.triedThisPlaying = true;
    const character = this.character;
    const run: RunCapture = {
      character,
      runId: null,
      release: null,
      seq: 0,
      buf: [],
      bufBytes: 0,
      bufFirstUs: 0,
      bufLastUs: 0,
      ready: [],
      evBuf: [],
      evSeq: 0,
      hasStart: false,
      summary: null,
    };
    this.run = run;
    if (this.opts.events) this.evRun = run;
    // GMCP from before the start (it includes the Char.Name that started
    // the run), then the view, at the start frame's time.
    let ts = 0;
    for (const p of this.preRun) {
      this.capture(p.ts, p.line);
      ts = p.ts;
    }
    this.preRun = [];
    this.viewWritten = '';
    this.sizeWritten = '';
    this.writeView(ts || this.now());
    const startedUs = this.now();
    const runId = makeRunId(character, new Date(startedUs / 1000));
    this.enqueue(() => this.startRun(run, runId, startedUs));
    const ms = this.opts.flushMs ?? FLUSH_MS;
    this.timer = setInterval(() => {
      if (run.buf.length || run.ready.length || run.evBuf.length) this.enqueue(() => this.writeChunk(run));
    }, ms);
  }

  private async startRun(run: RunCapture, runId: string, startedUs: number): Promise<void> {
    const store = await this.storeP;
    const fail = (status: string) => {
      if (this.run === run) this.abandon();
      this.setStatus(status);
    };
    if (!store) return fail(STATUS.noDb);
    if (!this.locks) return fail(STATUS.noLocks);
    const release = await acquire(this.locks, runLockName(run.character));
    if (!release) return fail(STATUS.anotherTab);
    run.release = release;
    // We hold the character's lock: any unsealed run of theirs is an orphan.
    await this.sealOrphans(store, run.character);
    // Two runs of one character within the same second: keep both.
    let id = runId;
    for (let n = 2; await store.getRun(id); n++) id = runId + '-' + n;
    const meta: RunMeta = {
      runId: id,
      character: run.character,
      startedUs,
      endedUs: null,
      sealed: false,
      bytes: 0,
      lines: 0,
    };
    if (this.opts.events) meta.summary = null;
    await store.putRun(meta);
    run.runId = id;
    this.current = id;
    this.prevLastRunId = this.lastRunId;
    this.lastRunId = id;
    this.setStatus(STATUS.recording);
  }

  /** Gives up recording for this playing period (no lock / no store). */
  private abandon(): void {
    const run = this.run;
    this.run = null;
    if (run && this.evRun === run) this.evRun = null;
    this.clearTimer();
  }

  private stop(): void {
    this.triedThisPlaying = false;
    const run = this.run;
    if (!run) return;
    this.writeView(this.now());
    this.run = null;
    this.clearTimer();
    const endedUs = this.now();
    this.enqueue(async () => {
      // Events of this `conn.state` (run_end) are in by now; unless a newer
      // run already took over, this run stops taking them here.
      if (this.evRun === run) this.evRun = null;
      await this.writeChunk(run);
      run.evBuf = [];
      const runId = run.runId;
      if (runId) {
        const store = await this.storeP;
        if (this.opts.events && !run.hasStart) {
          // Too short: nothing but a login.
          await store?.deleteRun(runId);
          if (this.lastRunId === runId) this.lastRunId = this.prevLastRunId;
        } else await store?.sealRun(runId, endedUs);
        if (this.current === runId) this.current = null;
      }
      run.release?.();
      run.release = null;
      if (this.statusText === STATUS.recording && !this.current) this.setStatus(STATUS.idle);
    });
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.viewTimer !== null) clearTimeout(this.viewTimer);
    this.viewTimer = null;
  }

  // ------------------------------------------------------------------ view

  private viewChanged(): void {
    if (!this.run || this.viewTimer !== null) return;
    this.viewTimer = setTimeout(() => {
      this.viewTimer = null;
      if (this.run) this.writeView(this.now());
    }, this.opts.viewDebounceMs ?? VIEW_DEBOUNCE_MS);
  }

  /** Writes the VIEW / SIZE records whose value differs from the last written. */
  private writeView(ts: number): void {
    if (this.viewJson && this.viewJson !== this.viewWritten) {
      this.viewWritten = this.viewJson;
      this.capture(ts, formatRecord(ts, RECORD.view, this.viewJson));
    }
    if (this.sizeJson && this.sizeJson !== this.sizeWritten) {
      this.sizeWritten = this.sizeJson;
      this.capture(ts, formatRecord(ts, RECORD.size, this.sizeJson));
    }
  }

  /**
   * Writes the full chunks, then (unless `fullOnly`) the lines of the chunk
   * being filled, one `append` (and so one task) per chunk. The run's
   * pending events go with the first.
   */
  private async writeChunk(run: RunCapture, fullOnly = false): Promise<void> {
    if (!run.runId) return;
    if (fullOnly) {
      while (run.ready.length) await this.writeOne(run, run.ready.shift());
      return;
    }
    if (run.buf.length) cutChunk(run);
    do {
      await this.writeOne(run, run.ready.shift());
    } while (run.ready.length);
  }

  private async writeOne(run: RunCapture, chunk: PendingChunk | undefined): Promise<void> {
    const runId = run.runId;
    if (!runId || (!chunk && run.evBuf.length === 0)) return;
    const store = await this.storeP;
    if (!store) return;
    const evs = run.evBuf;
    run.evBuf = [];
    let records: RunEventRecord[] | undefined;
    if (evs.length) {
      records = [];
      for (const e of evs) {
        if (e.type === 'run_start' && e.previousRunId === undefined) {
          const prev = await store.latestSealedRun(run.character, runId);
          if (prev) e.previousRunId = prev.runId;
        }
        run.summary = summarize(run.summary, e);
        records.push({ runId, seq: run.evSeq++, event: e });
      }
    }
    await store.append(runId, {
      ...(chunk
        ? {
            chunk: { runId, seq: run.seq++, firstUs: chunk.firstUs, lastUs: chunk.lastUs, text: chunk.lines.join('') },
            bytes: chunk.bytes,
            lines: chunk.lines.length,
          }
        : {}),
      ...(records ? { events: records, summary: run.summary } : {}),
    });
  }

  /**
   * Seals unsealed runs whose character lock is free. With `heldFor` set,
   * this tab holds that character's lock, so their runs are sealed directly.
   */
  private async sealOrphans(store: RunStore, heldFor: string | null): Promise<void> {
    const runs = await store.listRuns();
    for (const r of runs) {
      if (r.sealed || r.runId === this.current) continue;
      if (heldFor !== null) {
        if (r.character === heldFor) await store.sealOrphan(r, this.now());
        continue;
      }
      if (!this.locks) return;
      const release = await acquire(this.locks, runLockName(r.character));
      if (!release) continue;
      try {
        await store.sealOrphan(r, this.now());
      } finally {
        release();
      }
    }
  }

  // ----------------------------------------------------------------- misc

  private enqueue(task: () => Promise<void>): void {
    this.chain = this.chain.then(task).catch((err: unknown) => {
      console.error('[capture]', err);
      this.setStatus(STATUS.error);
    });
  }

  private setStatus(text: string): void {
    if (text === this.statusText) return;
    this.statusText = text;
    this.opts.onStatus?.(text);
  }
}

/** Moves the lines being filled into a full chunk. */
function cutChunk(run: RunCapture): void {
  run.ready.push({ lines: run.buf, bytes: run.bufBytes, firstUs: run.bufFirstUs, lastUs: run.bufLastUs });
  run.buf = [];
  run.bufBytes = 0;
}

/**
 * Tries to take a Web Lock without waiting. Resolves with a release
 * function, or null when another holder has it.
 */
export function acquire(locks: LockManagerLike, name: string): Promise<(() => void) | null> {
  return new Promise((resolve, reject) => {
    locks
      .request(name, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        return new Promise<void>((release) => resolve(() => release()));
      })
      .catch(reject);
  });
}
