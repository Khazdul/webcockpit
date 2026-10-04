// Game state hub (ADR 0016 "Package notes", P1): the character, group and
// clock models, fed from the bus, shared by the panes and the input-line
// clock strip. App builds one and hands it to the panes in the
// PaneContext (`ctx.game`).
//
//   bus gmcp        → char.apply, group.apply (Char.Vitals fight fields too),
//                     clock.syncSun (Event.Sun), clock.noteMoon (Event.Moon
//                     against the moon model; diagnostics only)
//   system rules    → wimpy (`Wimpy set to: N`, `Wimpy removed.`) and the
//                     clock lines (`… of the Third Age.`, `The current time
//                     is …`), installed into the script engine's system
//                     store (never in the profile): `installRules(system)`
//   MSSP            → clock.syncMssp (`mssp(vars)`, from the Session)
//   conn.state      → a new connection (`connecting`) and a live
//                     `disconnected` reset char and group (Inv §2.1); after
//                     a replay ends the state stays until the next
//                     connection starts. The clock never resets.
//
//   timers          → `game.timers` (src/timers/hub.ts, ADR 0017): the
//                     trackers behind the Timers pane, attached with the
//                     rest; App installs their rules (`timers.installRules`)
//
// Listeners (`subscribe`) are told which part changed; panes mark
// themselves dirty and render in the next frame.
//
// The clock is saved to `localStorage` `wc.clock` after every sync (not per
// tick), global for all characters; last writer wins (Inv §2.5).

import type { Bus } from '../core/bus';
import { gmcpKey } from '../core/types';
import { CharModel } from './char';
import { ClockModel, loadClockState } from './clock';
import { moonEventDelta } from './gametime';
import { GroupModel } from './group';
import { TimersHub, type TimersHubOptions } from '../timers/hub';

/** localStorage key of the clock state. */
export const CLOCK_KEY = 'wc.clock';

export type GamePart = 'char' | 'group' | 'clock' | 'timers';

/** What `installRules` needs from a rule store (src/script/engine RuleStore). */
export interface SystemRules {
  define(
    kind: 'action',
    pattern: string,
    body: string,
    opts: { priority?: number; fn?: (m: { args: string[]; line: { text: string } | null }) => void },
  ): unknown;
}

export interface GameStateOptions {
  /** Wall clock in ms. */
  now?: () => number;
  /** Where the clock is kept (null: memory only). */
  storage?: Storage | null;
  /** Timers hub options (database, scheduler, window, trackers); `now` is shared. */
  timers?: Omit<TimersHubOptions, 'now'>;
}

export class GameState {
  readonly char = new CharModel();
  readonly group = new GroupModel();
  readonly clock: ClockModel;
  /** Timers trackers and their persistence (ADR 0017). */
  readonly timers: TimersHub;
  private readonly now: () => number;
  private readonly storage: Storage | null;
  private readonly listeners = new Set<(part: GamePart) => void>();
  private readonly unsubs: Array<() => void> = [];

  constructor(opts: GameStateOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.storage = opts.storage ?? null;
    let saved: string | null = null;
    try {
      saved = this.storage?.getItem(CLOCK_KEY) ?? null;
    } catch {
      saved = null;
    }
    this.clock = new ClockModel(loadClockState(saved, this.now()));
    this.timers = new TimersHub({ ...opts.timers, now: this.now });
    this.timers.subscribe(() => this.emit('timers'));
  }

  /** Follows the bus (GMCP, connection state). Returns this. */
  attach(bus: Bus): this {
    this.unsubs.push(
      bus.on('gmcp', (m) => this.onGmcp(m.pkg, m.data, gmcpKey(m))),
      bus.on('conn.state', (s) => {
        if (s.state === 'connecting' || (s.state === 'disconnected' && !s.replay)) this.resetCharacter();
      }),
    );
    this.timers.attach(bus);
    return this;
  }

  dispose(): void {
    for (const u of this.unsubs.splice(0)) u();
    this.timers.dispose();
    this.listeners.clear();
  }

  /** Calls `fn(part)` after each change. Returns the unsubscribe function. */
  subscribe(fn: (part: GamePart) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(part: GamePart): void {
    for (const fn of [...this.listeners]) fn(part);
  }

  /** One GMCP message (also usable without a bus); `p` is `pkg` in lower case. */
  onGmcp(pkg: string, data: unknown, p = pkg.toLowerCase()): void {
    if (p.startsWith('char.')) {
      if (this.char.apply(pkg, data)) this.emit('char');
      if (p === 'char.vitals' && this.group.apply(pkg, data)) this.emit('group');
    } else if (p.startsWith('group.')) {
      if (this.group.apply(pkg, data)) this.emit('group');
    } else if (p === 'event.sun') {
      const what = (data as { what?: unknown } | undefined)?.what;
      if (this.clock.syncSun(what, this.now())) this.clockSynced();
    } else if (p === 'event.moon') {
      const what = (data as { what?: unknown } | undefined)?.what;
      if (what !== 'rise' && what !== 'set') return;
      const g = Math.floor(this.now() / 1000) - this.clock.state.epoch;
      if (this.clock.noteMoon(what, moonEventDelta(g, what))) this.saveClock();
    }
  }

  /** Character and group forget everything (new connection, live disconnect). */
  resetCharacter(): void {
    this.char.reset();
    this.group.reset();
    this.emit('char');
    this.emit('group');
  }

  /** Wimpy from a text line. */
  setWimpy(n: number | null): void {
    if (this.char.setWimpy(n)) this.emit('char');
  }

  /** A `… of the Third Age.` line. */
  timeLine(text: string): void {
    if (this.clock.syncTimeLine(text, this.now())) this.clockSynced();
  }

  /** A `The current time is …` line. */
  roomClock(text: string): void {
    if (this.clock.syncRoomClock(text, this.now())) this.clockSynced();
  }

  /** An MSSP table from the server. */
  mssp(vars: ReadonlyMap<string, readonly string[]>): void {
    if (this.clock.syncMssp(vars, this.now())) this.clockSynced();
  }

  private clockSynced(): void {
    this.saveClock();
    this.emit('clock');
  }

  private saveClock(): void {
    try {
      this.storage?.setItem(CLOCK_KEY, JSON.stringify(this.clock.state));
    } catch {
      // Storage full or blocked: the clock still works for this page.
    }
  }

  /**
   * Installs the text rules into the script engine's system store (ADR
   * 0016 "Text-derived state"). Patterns are tt++ patterns on the clean
   * line.
   */
  installRules(system: SystemRules): void {
    const prio = 3;
    system.define('action', '^Wimpy set to: %1$', '', {
      priority: prio,
      fn: (m) => {
        const n = Number.parseInt(m.args[1] ?? '', 10);
        if (Number.isFinite(n)) this.setWimpy(n);
      },
    });
    system.define('action', '^Wimpy removed.$', '', { priority: prio, fn: () => this.setWimpy(0) });
    system.define('action', '^%1 of the Third Age.$', '', {
      priority: prio,
      fn: (m) => this.timeLine(m.line?.text ?? m.args[0] ?? ''),
    });
    system.define('action', '^The current time is %1.$', '', {
      priority: prio,
      fn: (m) => this.roomClock(m.line?.text ?? m.args[0] ?? ''),
    });
  }
}
