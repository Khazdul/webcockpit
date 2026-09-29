// The Timers hub (ADR 0017 "Hub", "Time", "Input", "Persistence"): owns the
// trackers, the clock, the per-character persistence and the view the
// Timers pane draws. `GameState` builds one (`game.timers`), so the
// trackers run whether or not the pane shows.
//
//   bus conn.state   `connecting`: save what is pending, forget the
//                    in-memory state (it is in the archive), remember
//                    whether the new connection is a replay
//   bus gmcp         `Char.Name` live: load that character's record and
//                    merge it under the lines that arrived meanwhile;
//                    in a replay: start empty, never read or write
//                    `WebCockpit.Timers` in a replay only: the state an
//                    HTML replay carries across a cut (ADR 0033); it
//                    replaces the current state
//   bus cmd.sent     every sent command (after aliases; `''` = empty
//                    Enter) to `tracker.onSent`. Live connection: live
//                    sends only; replay: only the replayed log's sends
//                    (`replay: true`), not what the user types meanwhile.
//                    Passwords (`secret`) never.
//   system rules     `installRules(system)`: each tracker's game-text actions
//   tick             one scheduler timer, every second: `tracker.tick(now)`
//
// Saving: after each change, coalesced (one write at most `saveDelayMs`
// after the first unsaved change) and at once on `pagehide`. One record per
// character: `{ v: 1, trackers: { [tracker.key]: tracker.serialize() } }`.
// Never cleared on disconnect. Without IndexedDB (or before a live
// `Char.Name`) the hub works in memory.
//
// Time: `now()` (ms, wall clock) and the `Scheduler` are injected; nothing
// here reads `Date.now` or calls `setTimeout` itself.

import type { Bus } from '../core/bus';
import type { UiMessage } from '../core/types';
import type { SystemRules } from '../gmcp/state';
import { type Scheduler, realScheduler } from '../script/engine/timers';
import { TimersArchive } from './archive';
import { TIMER_GROUPS, type TimerCell, type TimersView, emptyView, sortCells } from './entry';
import { ManualTracker, type StateTag, type Tracker, type TrackerFactory, type TrackerHost, stateMessage } from './tracker';
import { createTrackers } from './trackers';

/** Version of the saved state. */
export const TIMERS_STATE_VERSION = 1;
/** Longest delay from a change to its save, ms. */
export const TIMERS_SAVE_DELAY_MS = 250;
/** GMCP package (lower case) of a replayed timers state (src/share/timers-state.ts). */
export const TIMERS_GMCP_PKG = 'webcockpit.timers';
/** The tick period, ms. */
export const TIMERS_TICK_MS = 1000;

/** The saved state of one character. */
export interface TimersState {
  v: 1;
  /** Each tracker's `serialize()` by its key. */
  trackers: Record<string, unknown>;
}

export interface TimersHubOptions {
  /** Wall clock in ms (default `Date.now`). */
  now?: () => number;
  /** One-shot timers for the tick and the save (default real timers). */
  scheduler?: Scheduler;
  /** The shared database opener (PaneContext `openDb`); absent = memory only. */
  openDb?: () => Promise<IDBDatabase>;
  /** Window for `pagehide` (default none). */
  win?: Window | null;
  /** Builds the trackers (default `createTrackers`, src/timers/trackers.ts). */
  trackers?: TrackerFactory;
  saveDelayMs?: number;
  tickMs?: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export class TimersHub {
  private readonly now: () => number;
  private readonly sched: Scheduler;
  private readonly openDb: (() => Promise<IDBDatabase>) | null;
  private readonly win: Window | null;
  private readonly saveDelayMs: number;
  private readonly tickMs: number;
  private readonly trackers: Tracker[];
  /** Cells put in by `debugAdd` (never saved). */
  private readonly debug: ManualTracker;
  private readonly listeners = new Set<() => void>();
  private readonly unsubs: Array<() => void> = [];
  private bus: Bus | null = null;

  /** The connection is a replay (from its `connecting`). */
  private replayConn = false;
  /** Character from the last `Char.Name` of this connection, or null. */
  private character: string | null = null;
  /** The state belongs to a live character and is saved. */
  private persist = false;
  /** The character's record is being loaded. */
  private loading = false;
  private loadToken = 0;
  /** A change is not saved yet. */
  private dirty = false;
  private saveTimer: unknown = null;
  private tickTimer: unknown = null;
  private archiveP: Promise<TimersArchive | null> | null = null;
  /** Archive work, in order. */
  private chain: Promise<void> = Promise.resolve();

  constructor(opts: TimersHubOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.sched = opts.scheduler ?? realScheduler;
    this.openDb = opts.openDb ?? null;
    this.win = opts.win ?? null;
    this.saveDelayMs = opts.saveDelayMs ?? TIMERS_SAVE_DELAY_MS;
    this.tickMs = opts.tickMs ?? TIMERS_TICK_MS;
    const host: TrackerHost = {
      now: () => this.now(),
      changed: () => this.changed(),
      announce: (tag: StateTag, name: string, verb: string, detail?: string) =>
        this.message(stateMessage(tag, name, verb, detail)),
      message: (m: UiMessage) => this.message(m),
    };
    this.trackers = (opts.trackers ?? createTrackers)(host);
    this.debug = new ManualTracker('debug', { ...host, changed: () => this.notify() });
    this.win?.addEventListener('pagehide', this.onHide);
  }

  // ------------------------------------------------------------ lifecycle

  /** Follows the bus (connection, `Char.Name`, sent commands) and starts the tick. Returns this. */
  attach(bus: Bus): this {
    this.bus = bus;
    this.unsubs.push(
      bus.on('conn.state', (s) => {
        if (s.state === 'connecting') this.onConnecting(s.replay === true);
      }),
      bus.on('gmcp', (m) => {
        const pkg = m.pkg.toLowerCase();
        if (pkg === TIMERS_GMCP_PKG) {
          if (this.replayConn) this.replaceState(m.data);
          return;
        }
        if (pkg !== 'char.name') return;
        const n = (m.data as { name?: unknown } | undefined)?.name;
        if (typeof n === 'string' && n) this.onCharacter(n);
      }),
      bus.on('cmd.sent', (c) => {
        if (c.secret || (c.replay === true) !== this.replayConn) return;
        const now = this.now();
        for (const t of this.trackers) t.onSent?.(c.text, now);
      }),
    );
    this.armTick();
    return this;
  }

  dispose(): void {
    this.flushSave();
    for (const u of this.unsubs.splice(0)) u();
    if (this.tickTimer !== null) this.sched.clear(this.tickTimer);
    this.tickTimer = null;
    this.win?.removeEventListener('pagehide', this.onHide);
    this.listeners.clear();
    this.bus = null;
  }

  /** Installs every tracker's game-text actions into the system store (ADR 0017 "Rules"). */
  installRules(system: SystemRules): void {
    for (const t of this.trackers) t.installRules?.(system);
  }

  private onConnecting(replay: boolean): void {
    this.flushSave();
    this.loadToken++;
    this.loading = false;
    this.replayConn = replay;
    this.character = null;
    this.persist = false;
    this.dirty = false;
    this.resetAll();
  }

  private onCharacter(name: string): void {
    if (this.replayConn) {
      if (this.character !== name) this.resetAll();
      this.character = name;
      this.persist = false;
      return;
    }
    if (this.character === name && this.persist) return;
    if (this.persist) {
      // Another character on the same connection: save the old one first.
      this.flushSave();
      this.resetAll();
    }
    this.character = name;
    this.persist = true;
    this.load(name);
  }

  private load(name: string): void {
    const token = ++this.loadToken;
    this.loading = true;
    this.enqueue(async () => {
      const a = await this.archive();
      let rec: { savedAt: number; state: unknown } | null = null;
      if (a) {
        try {
          rec = await a.load(name);
        } catch {
          rec = null;
        }
      }
      if (token !== this.loadToken) return;
      this.loading = false;
      const restored = rec ? this.restoreState(rec.state) : false;
      if (restored) this.notify();
      if (this.dirty) this.scheduleSave();
    });
  }

  private restoreState(state: unknown): boolean {
    if (!isObj(state) || state.v !== TIMERS_STATE_VERSION || !isObj(state.trackers)) return false;
    const saved = state.trackers;
    const now = this.now();
    let any = false;
    for (const t of this.trackers) {
      if (!Object.hasOwn(saved, t.key)) continue;
      try {
        t.restore(saved[t.key], now);
        any = true;
      } catch (err) {
        console.error(`[timers] restore of '${t.key}' failed`, err);
      }
    }
    return any;
  }

  /** Forgets the state and takes `state` (a `snapshot()`) instead. Silent. */
  replaceState(state: unknown): void {
    for (const t of this.trackers) t.reset();
    this.restoreState(state);
    this.notify();
  }

  private resetAll(): void {
    for (const t of this.trackers) t.reset();
    this.debug.reset();
    this.notify();
  }

  // --------------------------------------------------------------- saving

  private archive(): Promise<TimersArchive | null> {
    if (!this.archiveP) {
      this.archiveP = this.openDb
        ? TimersArchive.open(this.openDb, { now: this.now }).catch(() => null)
        : Promise.resolve(null);
    }
    return this.archiveP;
  }

  private enqueue(fn: () => Promise<void>): void {
    this.chain = this.chain.then(fn).catch((err: unknown) => console.error('[timers] archive', err));
  }

  private changed(): void {
    this.notify();
    if (!this.persist) return;
    this.dirty = true;
    if (!this.loading) this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = this.sched.set(() => {
      this.saveTimer = null;
      this.flushSave();
    }, this.saveDelayMs);
  }

  /** Writes the pending change now (also on `pagehide`). */
  flushSave(): void {
    if (this.saveTimer !== null) this.sched.clear(this.saveTimer);
    this.saveTimer = null;
    if (!this.dirty || !this.persist || this.loading || this.character === null) return;
    this.dirty = false;
    const name = this.character;
    const state = this.snapshot();
    this.enqueue(async () => {
      const a = await this.archive();
      await a?.save(name, state);
    });
  }

  /** The saved form of the current state (fresh, JSON-safe). */
  snapshot(): TimersState {
    const now = this.now();
    const trackers: Record<string, unknown> = {};
    for (const t of this.trackers) {
      const s = t.serialize(now);
      if (s !== undefined) trackers[t.key] = JSON.parse(JSON.stringify(s)) as unknown;
    }
    return { v: TIMERS_STATE_VERSION, trackers };
  }

  /** Resolves when the queued archive work (load, saves) is done (tests). */
  idle(): Promise<void> {
    return this.chain;
  }

  private readonly onHide = (): void => this.flushSave();

  // ----------------------------------------------------------------- tick

  private armTick(): void {
    this.tickTimer = this.sched.set(() => {
      this.tickTimer = null;
      const now = this.now();
      for (const t of this.trackers) {
        try {
          t.tick?.(now);
        } catch (err) {
          console.error(`[timers] tick of '${t.key}' failed`, err);
        }
      }
      if (this.bus) this.armTick();
    }, this.tickMs);
  }

  // ------------------------------------------------------------------ view

  /** Calls `fn` after each change. Returns the unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn();
  }

  private message(m: UiMessage): void {
    this.bus?.emit('ui.message', m);
  }

  /** The cells by group, sorted, and the herblore catalogue. Cheap enough per frame. */
  view(now: number = this.now()): TimersView {
    const v = emptyView();
    const add = (cells: TimerCell[]): void => {
      for (const c of cells) v.cells[c.group]?.push(c);
    };
    for (const t of this.trackers) {
      add(t.cells(now));
      if (t.herbs && v.herbs.length === 0) v.herbs = t.herbs(now);
    }
    add(this.debug.cells());
    if (v.herbs.length === 0) v.herbs = this.debug.herbs();
    for (const g of TIMER_GROUPS) sortCells(g, v.cells[g]);
    return v;
  }

  /** Starts a herblore (no-op when it runs). */
  addHerb(key: string): void {
    const now = this.now();
    for (const t of this.trackers) t.addHerb?.(key, now);
    this.debug.addHerb(key);
  }

  /** Stops a herblore. */
  removeHerb(key: string): void {
    const now = this.now();
    for (const t of this.trackers) t.removeHerb?.(key, now);
    this.debug.removeHerb(key);
  }

  /** Forgets a charm by its cell id (nothing is sent to the game). */
  dropCharm(id: string): void {
    const now = this.now();
    for (const t of this.trackers) t.dropCharm?.(id, now);
    this.debug.dropCharm(id);
  }

  // ------------------------------------------------------------ test hooks

  /**
   * Puts a cell in (by id), outside every tracker and never saved: tests
   * and the console (`__wc.app.game.timers.debugAdd({...})`), so the pane
   * can be exercised without game text. Cleared by a new connection.
   */
  debugAdd(cell: TimerCell): void {
    this.debug.put(cell);
  }

  /** Sets the herblore catalogue shown when no tracker has one (tests). */
  debugHerbs(list: Array<{ key: string; name: string }>): void {
    this.debug.setHerbs(list);
  }

  /** Removes every `debugAdd` cell. */
  debugClear(): void {
    this.debug.clear();
  }

  /** The character whose state is held, or null (tests, diagnostics). */
  get characterName(): string | null {
    return this.character;
  }

  /** True while the state is saved for a live character. */
  get persistent(): boolean {
    return this.persist;
  }
}
