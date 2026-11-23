// Game state hub (ADR 0016 "Package notes", P1): the character, group and
// clock models, fed from the bus, shared by the panes and the input-line
// clock strip. App builds one and hands it to the panes in the
// PaneContext (`ctx.game`).
//
//   bus gmcp        → char.apply, group.apply (Char.Vitals fight fields too),
//                     clock.syncSun (Event.Sun), clock.noteMoon (Event.Moon
//                     against the moon model; diagnostics only)
//   info poll       → `applyInfo`: `game.info` (info-model.ts) and the
//                     wimpy; reset with the character and on another name
//   sex             → `game.sex` (sex.ts, stage 77 part E2): remembered per
//                     name (`wc.charSex.v1`, the same storage), loaded at
//                     Char.Name; set by the poll's probe (`applySex`) and
//                     by a `You are a male|female <own race>.` line on the
//                     bus (a plain `info` the player typed); a replay's
//                     line sets it and is not remembered
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
//                     rest; App installs their rules (`timers.installRules`);
//                     after a Group.* change the members go to
//                     `timers.noteGroup` (sanctuary on others, ADR 0122)
//
// Listeners (`subscribe`) are told which part changed; panes mark
// themselves dirty and render in the next frame.
//
// Scripts rely on char and group being current when their GMCP handler
// runs (ADR 0090 §3): the scripts' GMCP cache hands every message to
// `take` before it stores it and tells the script host, so the order of
// the bus subscriptions does not matter. `take` applies a message once:
// the bus handler here skips the one the cache already handed over.
//
// The clock is saved to `localStorage` `wc.clock` after every sync (not per
// tick), global for all characters; last writer wins (Inv §2.5).

import type { Bus } from '../core/bus';
import { type BusEvents, gmcpKey } from '../core/types';
import { CharModel } from './char';
import { CLOCK_KEY, ClockModel, loadClockState } from './clock';
import { moonEventDelta } from './gametime';
import { GroupModel } from './group';
import type { InfoAnswer } from './info-answer';
import { InfoModel } from './info-model';
import { SEX_LINE_START, type Sex, SexMemory, parseSexLine } from './sex';
import { TimersHub, type TimersHubOptions } from '../timers/hub';

export { CLOCK_KEY };

export type GamePart = 'char' | 'group' | 'clock' | 'timers' | 'info';

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
  /** Where the clock and the characters' sex are kept (null: memory only). */
  storage?: Storage | null;
  /** Timers hub options (database, scheduler, window, trackers); `now` is shared. */
  timers?: Omit<TimersHubOptions, 'now'>;
}

export class GameState {
  readonly char = new CharModel();
  readonly group = new GroupModel();
  readonly clock: ClockModel;
  /** The info poll's last answer (Stats and Lore, stage 77). */
  readonly info = new InfoModel();
  /** Timers trackers and their persistence (ADR 0017). */
  readonly timers: TimersHub;
  /** The character's sex: remembered, probed or read; null until known. */
  sex: Sex | null = null;
  /** Whose `sex` it is (lower case). */
  private sexOf: string | null = null;
  private readonly sexMemory: SexMemory;
  /** The connection is a replay: what it shows is not remembered. */
  private replay = false;
  private readonly now: () => number;
  private readonly storage: Storage | null;
  private readonly listeners = new Set<(part: GamePart) => void>();
  private readonly unsubs: Array<() => void> = [];
  /** The last bus message applied (`take`). */
  private taken: BusEvents['gmcp'] | null = null;

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
    this.sexMemory = new SexMemory(this.storage);
    this.timers = new TimersHub({ ...opts.timers, now: this.now });
    this.timers.subscribe(() => this.emit('timers'));
  }

  /** Follows the bus (GMCP, connection state). Returns this. */
  attach(bus: Bus): this {
    this.unsubs.push(
      bus.on('gmcp', (m) => this.take(m)),
      bus.on('text.line', (l) => {
        if (l.text.startsWith(SEX_LINE_START)) this.sexLine(l.text);
      }),
      bus.on('conn.state', (s) => {
        this.replay = s.replay === true;
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

  /**
   * Bus message `m`, once: a second call with the same message (the
   * scripts' cache first, then this state's own bus handler) does nothing.
   */
  take(m: BusEvents['gmcp']): void {
    if (m === this.taken) return;
    this.taken = m;
    this.onGmcp(m.pkg, m.data, gmcpKey(m));
  }

  /** In a fight: an opponent, or the position says so. */
  fighting(): boolean {
    if (this.group.fight().opponent !== null) return true;
    const position = this.char.vitals.get('position');
    return typeof position === 'string' && position.toLowerCase() === 'fighting';
  }

  /** One GMCP message (also usable without a bus); `p` is `pkg` in lower case. */
  onGmcp(pkg: string, data: unknown, p = pkg.toLowerCase()): void {
    if (p.startsWith('char.')) {
      const name = p === 'char.name' ? this.char.name : null;
      if (this.char.apply(pkg, data)) {
        const other = name !== null && this.char.name?.toLowerCase() !== name.toLowerCase();
        const infoGone = other && this.info.reset();
        if (p === 'char.name') this.loadSex();
        this.emit('char');
        if (infoGone) this.emit('info');
      }
      if (p === 'char.vitals' && this.group.apply(pkg, data)) this.emit('group');
    } else if (p.startsWith('group.') || p === 'room.info') {
      if (this.group.apply(pkg, data)) {
        if (p !== 'room.info') this.noteGroup();
        this.emit('group');
      }
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

  /** The members to the timers (sanctuary on others, ADR 0122). */
  private noteGroup(): void {
    this.timers.noteGroup([...this.group.list(), ...this.group.unlabeled()]);
  }

  /** Character and group forget everything (new connection, live disconnect). */
  resetCharacter(): void {
    this.char.reset();
    this.group.reset();
    const infoGone = this.info.reset();
    this.sex = this.sexOf = null;
    this.noteGroup();
    this.emit('char');
    this.emit('group');
    if (infoGone) this.emit('info');
  }

  /** The hidden poll's answer, received now. */
  applyInfo(answer: InfoAnswer): void {
    this.info.apply(answer, this.now());
    if (answer.wimpy !== null) this.setWimpy(answer.wimpy);
    this.emit('info');
  }

  /** The character's sex is not known: the login poll may probe for it. */
  sexNeeded(): boolean {
    return this.char.name !== null && this.sex === null;
  }

  /** The character's sex, from the probe or a line: remembered (not in a replay). */
  applySex(sex: Sex): void {
    const name = this.char.name;
    if (name === null) return;
    if (!this.replay) this.sexMemory.set(name, sex);
    this.sexOf = name.toLowerCase();
    if (this.sex === sex) return;
    this.sex = sex;
    this.emit('char');
  }

  /** A line that may be a plain `info`'s first: only with the character's own race. */
  sexLine(text: string): void {
    const race = this.char.statusVars.get('race');
    const subrace = this.char.statusVars.get('subrace');
    const own = { race: typeof race === 'string' ? race : null, subrace: typeof subrace === 'string' ? subrace : null };
    if (own.race === null && own.subrace === null) return;
    const sex = parseSexLine(text, own);
    if (sex !== null) this.applySex(sex);
  }

  /** At Char.Name: another character's remembered sex, or null. */
  private loadSex(): void {
    const name = this.char.name?.toLowerCase() ?? null;
    if (name === this.sexOf) return;
    this.sexOf = name;
    this.sex = name === null ? null : this.sexMemory.get(name);
  }

  /** Wimpy from a text line or the poll. */
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
