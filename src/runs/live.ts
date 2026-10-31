// The live run for the ESC menu (ADR 0018 "LiveRuns"; Inv §4.6, §7.3):
// `app.runs`.
//
//   current()        the run in progress: its id and its events so far
//                    (the deriver's in-memory list), or null before
//                    `run_start` and after the run ended. `runId` is ''
//                    when the run is not recorded (a replay, capture off,
//                    another tab records the character).
//   latest()         the latest run of this tab, in progress or ended: its
//                    id ('' when not recorded) and its events (the
//                    deriver keeps them until the next run starts), or
//                    null before any run (the Statistics pane, ADR 0109)
//   subscribe(fn)    after every event
//   chain()          the anchor run's session: the live run plus its sealed
//                    predecessors in the chain (pending writes flushed first)
//   chainEvents()    that session's events: stored ones for the sealed
//                    runs, the in-memory ones for the live run; a live run
//                    that is not recorded has no chain: its own events
//   saveChain(r)     Exit with rating: r > 0 saves the chain with rating r;
//                    0 re-saves an already saved chain keeping its ratings
//                    and never creates a save
//
// Anchor: the run being recorded, or when disconnected the latest run that
// started in this tab (never an older one; Inv §7.4 "Exit confirmation").

import type { Recorder } from '../capture/recorder';
import { nowUs as clockUs } from '../core/types';
import type { RunEvent, RunEventDeriver } from './events';
import { RunLibrary } from './library';
import type { Session } from './stitch';

export interface LiveRunsOptions {
  deriver: RunEventDeriver;
  recorder: Recorder;
  /** The library (default: over the recorder's store). */
  openLibrary?: () => Promise<RunLibrary | null>;
  /** µs clock for expiry (default `nowUs`). */
  nowUs?: () => number;
}

export class LiveRuns {
  private readonly deriver: RunEventDeriver;
  private readonly recorder: Recorder;
  private readonly openLibrary: () => Promise<RunLibrary | null>;
  private readonly clock: () => number;
  private libP: Promise<RunLibrary | null> | null = null;
  private readonly listeners = new Set<() => void>();
  /** Stored events of sealed chain runs, by run id (they never change). */
  private readonly sealedEvents = new Map<string, RunEvent[]>();
  /** The recorder's id of the latest run while it was in progress ('' when not recorded). */
  private latestId = '';

  constructor(opts: LiveRunsOptions) {
    this.deriver = opts.deriver;
    this.recorder = opts.recorder;
    this.openLibrary =
      opts.openLibrary ?? (() => this.recorder.getStore().then((s) => (s ? new RunLibrary(s) : null)));
    this.clock = opts.nowUs ?? clockUs;
    this.deriver.subscribe(() => {
      if (this.deriver.started) this.latestId = this.recorder.runId ?? '';
      for (const fn of [...this.listeners]) fn();
    });
  }

  /** The run in progress, or null (see the file header). */
  current(): { runId: string; events: readonly RunEvent[] } | null {
    if (!this.deriver.started) return null;
    return { runId: this.recorder.runId ?? '', events: this.deriver.events };
  }

  /** The latest run of this tab, in progress or ended (see the file header), or null. */
  latest(): { runId: string; events: readonly RunEvent[]; ended: boolean } | null {
    const events = this.deriver.events;
    if (events.length === 0) return null;
    const ended = !this.deriver.started;
    return { runId: ended ? this.latestId : (this.recorder.runId ?? ''), events, ended };
  }

  /** Calls `fn` after every run event. Returns the unsubscribe. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The library over this App's store (null without IndexedDB). */
  library(): Promise<RunLibrary | null> {
    this.libP ??= this.openLibrary().catch(() => null);
    return this.libP;
  }

  /** The anchor run's id (see the file header), or null. */
  anchor(): string | null {
    return this.recorder.runId ?? this.recorder.lastRun;
  }

  /** The anchor run's session, or null. */
  async chain(): Promise<Session | null> {
    // Pending writes first: a run that is still starting becomes the anchor.
    await this.recorder.flush();
    const id = this.anchor();
    if (!id) return null;
    const lib = await this.library();
    return lib ? lib.chainOf(id, this.clock()) : null;
  }

  /** The events of the anchor's session: stored for sealed runs, in memory for the live one. */
  async chainEvents(): Promise<RunEvent[]> {
    const live = this.current();
    // A run that is not recorded (a replay, capture off) is not in any chain.
    if (live && !live.runId) return [...live.events];
    const lib = await this.library();
    const id = this.anchor();
    if (!lib || !id) return live ? [...live.events] : [];
    const s = await lib.chainOf(id, this.clock());
    if (!s) return live ? [...live.events] : [];
    const out: RunEvent[] = [];
    for (const m of s.runs) {
      if (live && m.runId === live.runId) {
        out.push(...live.events);
        continue;
      }
      let evs = m.sealed ? this.sealedEvents.get(m.runId) : undefined;
      if (!evs) {
        evs = await lib.events([m.runId]);
        if (m.sealed) this.sealedEvents.set(m.runId, evs);
      }
      out.push(...evs);
    }
    return out;
  }

  /** Exit with rating (Inv §4.6). */
  async saveChain(rating: number): Promise<void> {
    const s = await this.chain();
    const lib = await this.library();
    if (!s || !lib) return;
    if (rating > 0) await lib.save(s, rating, this.clock());
    else if (s.saved) await lib.save(s, undefined, this.clock());
  }
}
