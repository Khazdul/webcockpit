// The Statistics pane's data (stage 30 S7, ADR 0109): the live run chain
// (`app.runs`) as a StatsModel, kept current while the pane is shown.
//
// - Shown: a load at once, then on every run event at most once per
//   LIVE_TICK_MS, and a tick at that rate while a run is in progress (the
//   running clock). Hidden or disposed: no subscription, no timer.
// - A run in progress: its chain, live (`nowUs`; a replay's events are on
//   log time, so no running clock).
// - No run in progress: the latest run of this tab (`LiveRuns.latest()`),
//   `ended`: a recorded one (the anchor) as its chain from the store, one
//   that is not recorded (a replay, capture off) from memory, so it does not
//   blank when it ends. Before any run in this tab: `noRun`.
// - The rating stars of the anchor's saved chain, read on show and when a
//   run starts or ends.
//
// No DOM and no Preact; unit tested with fake timers.

import { nowUs as clockUs } from '../core/types';
import type { LiveRuns } from '../runs/live';
import { type StatsModel, buildStats } from '../runs/stats';

/** Refresh interval (Inv §7.3: 1 Hz). */
export const STATS_FEED_MS = 1000;

export interface StatsFeedState {
  model: StatsModel | null;
  /** No run in progress; the model is the latest run's. */
  ended: boolean;
  /** Stars of the anchor's saved chain (0: none). */
  rating: number;
  /** A read failed (shown in place of the ruler). */
  note?: string;
  /** No run has started in this tab yet. */
  noRun: boolean;
}

export interface StatsFeedOptions {
  runs: Pick<LiveRuns, 'current' | 'latest' | 'subscribe' | 'chainEvents' | 'chain' | 'anchor' | 'library'>;
  /** True while a replay plays (no running clock). */
  replay: () => boolean;
  /** Wall clock in ms (default `Date.now`). */
  now?: () => number;
  /** µs clock for the running clock (default `nowUs`). */
  nowUs?: () => number;
}

export class StatsFeed {
  private st: StatsFeedState = { model: null, ended: false, rating: 0, noRun: false };
  private readonly o: StatsFeedOptions;
  private readonly now: () => number;
  private readonly us: () => number;
  private readonly listeners = new Set<(s: StatsFeedState) => void>();
  private shown = false;
  private disposed = false;
  private unsub: (() => void) | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  /** A request came while loading: load again once done. */
  private again = false;
  private last = -Infinity;
  /** A run was in progress at the last load. */
  private running = false;
  /** Loads done (tests). */
  loads = 0;

  constructor(o: StatsFeedOptions) {
    this.o = o;
    this.now = o.now ?? Date.now;
    this.us = o.nowUs ?? clockUs;
  }

  get state(): Readonly<StatsFeedState> {
    return this.st;
  }

  /** Calls `fn` on every change. Returns the unsubscribe. */
  subscribe(fn: (s: StatsFeedState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Starts (shown) or stops (hidden) the work. */
  setShown(shown: boolean): void {
    if (this.disposed || shown === this.shown) return;
    this.shown = shown;
    if (shown) {
      this.unsub = this.o.runs.subscribe(() => this.request());
      this.last = -Infinity;
      void this.load();
      void this.loadRating();
    } else {
      this.unsub?.();
      this.unsub = null;
      this.stopTick();
      if (this.pending !== null) clearTimeout(this.pending);
      this.pending = null;
      this.again = false;
    }
  }

  dispose(): void {
    this.setShown(false);
    this.disposed = true;
    this.listeners.clear();
  }

  /** A load now, or once LIVE_TICK_MS has passed since the last one. */
  private request(): void {
    if (!this.shown) return;
    if (this.busy) {
      this.again = true;
      return;
    }
    const wait = this.last + STATS_FEED_MS - this.now();
    if (wait <= 0) {
      void this.load();
      return;
    }
    this.pending ??= setTimeout(() => {
      this.pending = null;
      this.request();
    }, wait);
  }

  private async load(): Promise<void> {
    if (!this.shown || this.busy) return;
    this.busy = true;
    this.last = this.now();
    this.loads++;
    const wasRunning = this.running;
    try {
      const runs = this.o.runs;
      if (runs.current()) {
        this.running = true;
        const events = await runs.chainEvents();
        this.set({ model: buildStats(events, this.o.replay() ? {} : { nowUs: this.us() }), ended: false, noRun: false, note: undefined });
      } else {
        this.running = false;
        const latest = runs.latest();
        let model: StatsModel | null = null;
        // A recorded run: its chain from the store (pending writes flushed
        // first). One that is not recorded: its events from memory.
        if (latest?.runId && latest.runId === runs.anchor()) {
          await runs.chain();
          const events = await runs.chainEvents();
          if (events.length > 0) model = buildStats(events);
        }
        if (!model && latest) model = buildStats(latest.events);
        this.set({ model, ended: model !== null, noRun: model === null, note: undefined });
      }
    } catch (e) {
      this.set({ note: `Could not read the run: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      this.busy = false;
    }
    if (!this.shown) return;
    if (this.running !== wasRunning) void this.loadRating();
    if (this.running) this.startTick();
    else this.stopTick();
    if (this.again) {
      this.again = false;
      this.request();
    }
  }

  private async loadRating(): Promise<void> {
    try {
      const lib = await this.o.runs.library();
      const id = this.o.runs.anchor();
      const s = lib && id ? await lib.chainOf(id, this.us()) : null;
      const rating = s?.saved ? s.rating : 0;
      if (rating !== this.st.rating) this.set({ rating });
    } catch {
      /* the header just shows no stars */
    }
  }

  private startTick(): void {
    this.tick ??= setInterval(() => this.request(), STATS_FEED_MS);
  }

  private stopTick(): void {
    if (this.tick !== null) clearInterval(this.tick);
    this.tick = null;
  }

  private set(p: Partial<StatsFeedState>): void {
    if (this.disposed) return;
    const next = { ...this.st, ...p };
    if (next.note === undefined) delete next.note;
    this.st = next;
    for (const fn of [...this.listeners]) fn(next);
  }
}
