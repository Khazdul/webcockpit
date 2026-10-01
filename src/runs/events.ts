// Run events (Inv §7.2, ADR 0018 "Run events"): what happened in a run, as
// Statistics, History, the player's markers and stage 7 read it. Pure TS,
// no DOM; the clock and the fold timer are injected, so a replay clock can
// drive it.
//
//   bus conn.state   `playing` arms a run; the first `Char.Vitals` after it
//                    is `run_start` (baseline level/XP/TP). Leaving
//                    `playing` folds what is pending and ends the run
//                    (`run_end`); `connecting` forgets everything.
//   bus gmcp         Char.Vitals → xp_loss, level_up (level from XP), tp_gained,
//                    tp_loss; Group.* → group_changed (player allies in id =
//                    join order, only when the set changes); Event.Achieved
//                    → achievement. `us` is the message's receive time (from
//                    the `gmcp.raw` just before it).
//   system rule      one catch-all action (`%0`, priority 3) on the clean line:
//                    `*Name the Race* … R.I.P.` → pkill, `… is dead! R.I.P.`,
//                    `… has drawn his/her last breath! R.I.P.`, `… disappears
//                    into nothing.` → kill, `You are dead! Sorry...` →
//                    char_death. The pc form wins over the mob form on the
//                    same line (Inv §8.3: pc_death prio 3 over mob_death 4).
//
// Kill fold (Cockpit ADR 0008): every death line queues a victim and
// (re)starts a 500 ms timer. On fold the XP gained since the last fold is
// split evenly over the queue (mobs and players mixed, in arrival order),
// the remainder to the last; `us` is the fold time, `logUs` the death
// line's own time. A drop in XP is `xp_loss` and moves the fold anchor.
//
// Every attributed kill, pkill and death is also a `◆` line in the UI pane
// (`◆ KILL: <mob>, <xp> xp.`, `◆ PKILL: <name>, <xp> xp.`, `◆ DEATH: You
// died.`). The deriver runs in every App, replays included; only the
// recorder persists what it emits (src/capture/recorder.ts).

import type { Bus } from '../core/bus';
import { type UiMessage, gmcpKey } from '../core/types';
import type { SystemRules } from '../gmcp/state';
import { GroupModel } from '../gmcp/group';
import { levelFromXp } from '../gmcp/levels';
import { type Scheduler, realScheduler } from '../script/engine/timers';

export type RunEvent =
  | {
      type: 'run_start';
      us: number;
      character: string;
      level?: number;
      xp?: number;
      tp?: number;
      previousRunId?: string;
      schema: 1;
    }
  | { type: 'run_end'; us: number }
  | { type: 'orphan_close'; us: number }
  | { type: 'level_up'; us: number; level: number }
  | { type: 'kill'; us: number; logUs: number; mobName: string; xpDelta: number }
  | { type: 'pkill'; us: number; logUs: number; name: string; race: string; xpDelta: number }
  | { type: 'tp_gained'; us: number; tpDelta: number }
  | { type: 'xp_loss'; us: number; xpDelta: number }
  | { type: 'tp_loss'; us: number; tpDelta: number }
  | { type: 'char_death'; us: number; logUs: number; level?: number }
  | { type: 'achievement'; us: number; name: string }
  | { type: 'group_changed'; us: number; members: string[] };

export type RunEventType = RunEvent['type'];

/** `run_start.schema`. Additive changes do not bump it. */
export const RUN_EVENT_SCHEMA = 1;
/** The kill fold debounce, ms. */
export const KILL_FOLD_MS = 500;
/** Priority of the death-line rule (Inv §8.3 core band). */
export const DEATH_RULE_PRIORITY = 3;

/** `◆` tags of the run lines in the UI pane. */
export const RUN_TAGS = { kill: 'KILL', pkill: 'PKILL', death: 'DEATH' } as const;

// ------------------------------------------------------------ death lines

const RIP_DEAD = ' is dead! R.I.P.';
const RIP_HIS = ' has drawn his last breath! R.I.P.';
const RIP_HER = ' has drawn her last breath! R.I.P.';
const UNDEAD = ' disappears into nothing.';
const YOU_DIED = 'You are dead! Sorry...';

export type DeathLine =
  | { kind: 'mob'; name: string }
  | { kind: 'pc'; name: string; race: string }
  | { kind: 'char' };

/** Drops a trailing MUME label: `A pack horse (MIN)` → `A pack horse`. */
export function stripLabel(s: string): string {
  const n = s.length;
  if (n === 0 || s.charCodeAt(n - 1) !== 0x29 /* ) */) return s;
  const open = s.lastIndexOf('(');
  if (open <= 0 || s.charCodeAt(open - 1) !== 0x20 || s.indexOf(')', open) !== n - 1) return s;
  let i = open - 1;
  while (i > 0 && s.charCodeAt(i - 1) === 0x20) i--;
  return s.slice(0, i);
}

/** `Moraxus the Orc` → `Moraxus` / `the Orc`; no ` the ` → the whole / `''`. */
export function splitPcName(full: string): { name: string; race: string } {
  const i = full.indexOf(' the ');
  if (i <= 0) return { name: full, race: '' };
  return { name: full.slice(0, i), race: full.slice(i + 1) };
}

/**
 * Classifies a clean game line as a death line, or null. Cheap for the
 * common case: a line that does not end in `P.`, `g.` or `..` is rejected
 * on two character reads.
 */
export function parseDeathLine(text: string): DeathLine | null {
  const n = text.length;
  if (n < 16 || text.charCodeAt(n - 1) !== 0x2e /* . */) return null;
  const c = text.charCodeAt(n - 2);
  if (c === 0x50 /* P */) {
    let subject: string;
    if (text.endsWith(RIP_DEAD)) subject = text.slice(0, n - RIP_DEAD.length);
    else if (text.endsWith(RIP_HIS)) subject = text.slice(0, n - RIP_HIS.length);
    else if (text.endsWith(RIP_HER)) subject = text.slice(0, n - RIP_HER.length);
    else return null;
    // MUME puts a label after the stars: `*a Dwarf* (m) has drawn …`.
    const s = stripLabel(subject);
    if (s.length > 2 && s.charCodeAt(0) === 0x2a && s.charCodeAt(s.length - 1) === 0x2a /* * */) {
      const inner = stripLabel(s.slice(1, -1));
      if (inner) return { kind: 'pc', ...splitPcName(inner) };
    }
    return s ? { kind: 'mob', name: s } : null;
  }
  if (c === 0x67 /* g */) {
    if (!text.endsWith(UNDEAD)) return null;
    const s = stripLabel(text.slice(0, n - UNDEAD.length));
    return s ? { kind: 'mob', name: s } : null;
  }
  if (c === 0x2e && text === YOU_DIED) return { kind: 'char' };
  return null;
}

/** XP as the KILL line shows it (Cockpit): `950`, `5.4k`, `48k`. */
export function fmtXp(n: number): string {
  const v = Math.floor(n);
  if (v < 1000) return String(v);
  if (v < 10000) return (v / 1000).toFixed(1) + 'k';
  return Math.floor(v / 1000) + 'k';
}

/** The `◆` UI line of a kill, pkill or death event, or null for other events. */
export function runUiMessage(e: RunEvent): UiMessage | null {
  switch (e.type) {
    case 'kill':
      return { kind: 'state', tag: RUN_TAGS.kill, parts: [{ value: e.mobName }, ', ', { value: fmtXp(e.xpDelta) }, ' xp.'] };
    case 'pkill':
      return { kind: 'state', tag: RUN_TAGS.pkill, parts: [{ value: e.name }, ', ', { value: fmtXp(e.xpDelta) }, ' xp.'] };
    case 'char_death':
      return { kind: 'state', tag: RUN_TAGS.death, parts: ['You died.'] };
    default:
      return null;
  }
}

// ---------------------------------------------------------------- deriver

export interface RunEventDeriverOptions {
  /** Wall clock in ms (App's GameState clock; a replay clock later). */
  now?: () => number;
  /** One-shot timers for the kill fold (the engine's Scheduler). */
  scheduler?: Scheduler;
  /** Fold debounce in ms (default 500). */
  foldMs?: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

type Pending = { pc: false; name: string; logUs: number } | { pc: true; name: string; race: string; logUs: number };

export class RunEventDeriver {
  private readonly now: () => number;
  private readonly sched: Scheduler;
  private readonly foldMs: number;
  private readonly listeners = new Set<(e: RunEvent) => void>();
  private readonly unsubs: Array<() => void> = [];
  private bus: Bus | null = null;

  /** The connection is `playing`: the next Char.Vitals starts the run. */
  private armed = false;
  private isStarted = false;
  private character = '';
  /** Receive time of the GMCP message being handled (from `gmcp.raw`). */
  private rawTs: number | undefined;
  /** Latest input time seen (µs); fold times never go below it. */
  private lastUs = 0;

  private xp: number | null = null;
  private foldAnchor: number | null = null;
  private tp: number | null = null;
  /** Last level seen (from XP; StatusVars while XP is unknown). */
  private level: number | null = null;
  private statusLevel: number | null = null;

  private pending: Pending[] = [];
  private foldTimer: unknown = null;

  private readonly group = new GroupModel();
  private allies: string[] = [];
  private list: RunEvent[] = [];

  constructor(opts: RunEventDeriverOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.sched = opts.scheduler ?? realScheduler;
    this.foldMs = opts.foldMs ?? KILL_FOLD_MS;
  }

  /** True between `run_start` and the end of the run. */
  get started(): boolean {
    return this.isStarted;
  }

  /** The current run's events so far (empty before `run_start`). */
  get events(): readonly RunEvent[] {
    return this.list;
  }

  /** Calls `fn` with every event as it is derived. Returns the unsubscribe. */
  subscribe(fn: (e: RunEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Follows the bus (connection, GMCP) and emits the `◆` lines on it. Returns this. */
  attach(bus: Bus): this {
    this.bus = bus;
    this.unsubs.push(
      bus.on('conn.state', (s) => {
        if (s.prev === 'playing' && s.state !== 'playing') this.end();
        if (s.state === 'connecting') this.reset();
        else if (s.state === 'playing') this.armed = true;
      }),
      bus.on('gmcp.raw', (m) => {
        this.rawTs = m.ts;
      }),
      bus.on('gmcp', (m) => {
        const ts = this.rawTs ?? this.nowUs();
        this.rawTs = undefined;
        this.onGmcp(m.pkg, m.data, ts, gmcpKey(m));
      }),
    );
    return this;
  }

  /**
   * Installs the death-line rule into the script engine's system store.
   * `%0` (a lone wildcard, matched without the regex) and not `%*`: a rule
   * with the same pattern would replace the timers' catch-all router.
   */
  installRules(system: SystemRules): void {
    system.define('action', '%0', '', {
      priority: DEATH_RULE_PRIORITY,
      fn: (m) => {
        const line = m.line as { text: string; ts?: number } | null;
        if (line) this.onLine(line.text, line.ts ?? this.nowUs());
      },
    });
  }

  dispose(): void {
    for (const u of this.unsubs.splice(0)) u();
    this.clearFold();
    this.listeners.clear();
    this.bus = null;
  }

  // ----------------------------------------------------------------- input

  /** One clean game line received at `ts` (µs). */
  onLine(text: string, ts: number): void {
    if (!this.isStarted) return;
    const d = parseDeathLine(text);
    if (!d) return;
    if (ts > this.lastUs) this.lastUs = ts;
    if (d.kind === 'char') {
      const e: RunEvent = { type: 'char_death', us: ts, logUs: ts };
      if (this.level !== null) e.level = this.level;
      this.emit(e);
      return;
    }
    this.pending.push(d.kind === 'pc' ? { pc: true, name: d.name, race: d.race, logUs: ts } : { pc: false, name: d.name, logUs: ts });
    this.clearFold();
    this.foldTimer = this.sched.set(() => {
      this.foldTimer = null;
      this.fold();
    }, this.foldMs);
  }

  /** One GMCP message received at `ts` (µs); `p` is `pkg` in lower case. */
  onGmcp(pkg: string, data: unknown, ts: number, p = pkg.toLowerCase()): void {
    if (ts > this.lastUs) this.lastUs = ts;
    if (p === 'char.vitals') {
      if (!isObj(data)) return;
      if (this.isStarted) this.vitals(data, ts);
      else if (this.armed) this.start(data, ts);
    } else if (p.startsWith('group.')) {
      const changed = this.group.apply(pkg, data);
      // Vital updates cannot change who the allies are unless they carry a type.
      if (changed && this.isStarted && (p !== 'group.update' || (isObj(data) && 'type' in data))) this.checkAllies(ts);
    } else if (p === 'char.name') {
      const n = isObj(data) ? data.name : undefined;
      if (typeof n === 'string' && n) this.character = n;
    } else if (p === 'char.statusvars') {
      const l = isObj(data) ? num(data.level) : null;
      if (l === null) return;
      this.statusLevel = l;
      if (this.isStarted && this.xp === null) this.setLevel(l, ts);
    } else if (p === 'event.achieved') {
      if (!this.isStarted) return;
      const what = isObj(data) ? data.what : undefined;
      if (typeof what === 'string' && what) this.emit({ type: 'achievement', us: ts, name: what });
    }
  }

  // ------------------------------------------------------------- lifecycle

  private start(v: Obj, ts: number): void {
    this.isStarted = true;
    this.list = [];
    this.xp = num(v.xp);
    this.foldAnchor = this.xp;
    this.tp = num(v.tp);
    this.level = this.xp !== null ? levelFromXp(this.xp) : this.statusLevel;
    const e: RunEvent = { type: 'run_start', us: ts, character: this.character, schema: RUN_EVENT_SCHEMA };
    if (this.level !== null) e.level = this.level;
    if (this.xp !== null) e.xp = this.xp;
    if (this.tp !== null) e.tp = this.tp;
    this.emit(e);
    // The group from before the baseline is not a change of its own; it is
    // written once, right after run_start, so the allies are complete.
    this.allies = [];
    this.checkAllies(ts);
  }

  private end(): void {
    if (this.isStarted) {
      if (this.foldTimer !== null) {
        this.clearFold();
        this.fold();
      }
      this.emit({ type: 'run_end', us: this.nowUs() });
    }
    this.reset();
  }

  private reset(): void {
    this.clearFold();
    this.armed = false;
    this.isStarted = false;
    this.pending = [];
    this.xp = null;
    this.foldAnchor = null;
    this.tp = null;
    this.level = null;
    this.statusLevel = null;
    this.allies = [];
    this.group.reset();
    this.rawTs = undefined;
  }

  // ---------------------------------------------------------------- vitals

  private vitals(v: Obj, ts: number): void {
    const xp = num(v.xp);
    if (xp !== null) {
      if (this.foldAnchor === null) this.foldAnchor = xp;
      else if (xp < this.foldAnchor) {
        this.emit({ type: 'xp_loss', us: ts, xpDelta: xp - this.foldAnchor });
        this.foldAnchor = xp;
      }
      this.xp = xp;
      this.setLevel(levelFromXp(xp), ts);
    }
    const tp = num(v.tp);
    if (tp !== null) {
      if (this.tp !== null && tp > this.tp) this.emit({ type: 'tp_gained', us: ts, tpDelta: tp - this.tp });
      else if (this.tp !== null && tp < this.tp) this.emit({ type: 'tp_loss', us: ts, tpDelta: tp - this.tp });
      this.tp = tp;
    }
  }

  /** Level from the latest observation; only a rise is an event. */
  private setLevel(level: number, ts: number): void {
    if (this.level !== null && level > this.level) this.emit({ type: 'level_up', us: ts, level });
    this.level = level;
  }

  // ------------------------------------------------------------------ group

  private checkAllies(ts: number): void {
    const now: string[] = [];
    for (const m of this.group.list()) if (m.type === 'ally' && m.name) now.push(m.name);
    const prev = this.allies;
    if (now.length === prev.length && now.every((n, i) => n === prev[i])) return;
    this.allies = now;
    this.emit({ type: 'group_changed', us: ts, members: now.slice() });
  }

  // ------------------------------------------------------------------- fold

  private fold(): void {
    const q = this.pending;
    const n = q.length;
    if (n === 0) return;
    this.pending = [];
    const cur = this.xp ?? this.foldAnchor;
    const gained = cur !== null && this.foldAnchor !== null ? Math.max(0, cur - this.foldAnchor) : 0;
    const per = Math.floor(gained / n);
    const rem = gained - per * n;
    const us = this.nowUs();
    for (let i = 0; i < n; i++) {
      const k = q[i]!;
      const xpDelta = per + (i === n - 1 ? rem : 0);
      this.emit(
        k.pc
          ? { type: 'pkill', us, logUs: k.logUs, name: k.name, race: k.race, xpDelta }
          : { type: 'kill', us, logUs: k.logUs, mobName: k.name, xpDelta },
      );
    }
    if (cur !== null) this.foldAnchor = cur;
  }

  private clearFold(): void {
    if (this.foldTimer !== null) this.sched.clear(this.foldTimer);
    this.foldTimer = null;
  }

  // ------------------------------------------------------------------ misc

  /** Now in µs on the injected clock, never before the latest input. */
  private nowUs(): number {
    const t = Math.round(this.now() * 1000);
    return t > this.lastUs ? t : this.lastUs;
  }

  private emit(e: RunEvent): void {
    this.list.push(e);
    if (e.us > this.lastUs) this.lastUs = e.us;
    for (const fn of this.listeners) fn(e);
    const m = runUiMessage(e);
    if (m) this.bus?.emit('ui.message', m);
  }
}
