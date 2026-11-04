// The seam between the TimersHub and its trackers (ADR 0017 "Hub",
// "Package notes" P0). Each tracker (affects, stored spells, blinds,
// charms, herblores; P1) implements `Tracker`; the hub owns the clock, the
// persistence, the input tap and the view, and calls the trackers.
//
// Rules for a tracker:
// - Pure TS, no DOM, no `Date.now` / timers: time comes as `now` (ms) in
//   every call, or from `host.now()` inside rule callbacks.
// - Every mutation calls `host.changed()` once (the hub notifies the pane
//   and schedules the save). Restores (`restore`) and `reset` do not.
// - Landings and removals announce with `host.announce(tag, name, verb)`
//   (`◆ SPELL: sanctuary up.`); restores stay silent.
// - `serialize` returns fresh JSON-safe data (no shared references), or
//   undefined when the tracker has nothing to persist.
// - `restore` merges saved data into the current state: entries that
//   arrived from lines while the record was loading win; saved entries
//   whose expiry passed during the downtime are dropped silently.

import type { UiMessage } from '../core/types';
import type { SystemRules } from '../gmcp/state';
import { TIMER_GROUPS, type TimerCell, type TimerGroup } from './entry';
import type { SanctMember } from './sanct';

/** `◆` tags of the timers (Inv §2.4). */
export type StateTag = 'SPELL' | 'BUFF' | 'DEBUFF' | 'STORE' | 'BLIND' | 'CHARM' | 'HERB';

/** The `◆` tag of a group's lines. */
export const GROUP_TAG: Readonly<Record<TimerGroup, StateTag>> = {
  sanct: 'SPELL',
  spell: 'SPELL',
  buff: 'BUFF',
  debuff: 'DEBUFF',
  herb: 'HERB',
  stored: 'STORE',
  blind: 'BLIND',
  charm: 'CHARM',
};

/**
 * A `◆ TAG: name verb.` UI line (Cockpit docs/ui-messaging.md): the name
 * is a value (bold yellow), `detail` goes in parentheses before the period
 * (`◆ STORE: earthquake decayed (untracked).`).
 */
export function stateMessage(tag: StateTag, name: string, verb: string, detail?: string): UiMessage {
  const tail = detail ? ` ${verb} (${detail}).` : ` ${verb}.`;
  return { kind: 'state', tag, parts: [{ value: name }, tail] };
}

/** What the hub gives each tracker. */
export interface TrackerHost {
  /** Wall clock in ms (the hub's injected clock). */
  now(): number;
  /** State changed: notify the view, schedule the save. */
  changed(): void;
  /** Emits a `◆ TAG: name verb.` line. */
  announce(tag: StateTag, name: string, verb: string, detail?: string): void;
  /** Emits any UI line (e.g. `⚠ WARN: STORE: lost track of stored spells.`). */
  message(m: UiMessage): void;
}

/** One tracker behind the hub. Optional members are called only when present. */
export interface Tracker {
  /** Key of this tracker's part in the saved state (`state.trackers[key]`); unique. */
  readonly key: string;
  /** The cells this tracker shows now, any order (the hub sorts). */
  cells(now: number): TimerCell[];
  /** Once per hub tick (1 s): prune expired entries, advance phases. */
  tick?(now: number): void;
  /** Persistable state, fresh and JSON-safe; undefined = nothing to save. */
  serialize(now: number): unknown;
  /** Merges saved state (see the file header). Silent; no `changed()`. */
  restore(saved: unknown, now: number): void;
  /** Forgets everything (new connection, a replay's character). Silent. */
  reset(): void;
  /** Installs game-text actions into the system store. */
  installRules?(system: SystemRules): void;
  /**
   * A command sent to the game after alias expansion (live, or replayed
   * from a log during a replay). `''` is an empty Enter. Never a password.
   */
  onSent?(text: string, now: number): void;
  /** The herblore catalogue with the active flags (the herblore tracker). */
  herbs?(now: number): Array<{ key: string; name: string; active: boolean }>;
  addHerb?(key: string, now: number): void;
  removeHerb?(key: string, now: number): void;
  /** Forgets a charm by its cell id (the `×` on a charm row). */
  dropCharm?(id: string, now: number): void;
  /** The group members after a Group.* change (GameState → `TimersHub.noteGroup`). */
  onGroup?(members: readonly SanctMember[], now: number): void;
}

/** Builds the trackers for a hub (TimersHubOptions.trackers). */
export type TrackerFactory = (host: TrackerHost) => Tracker[];

/**
 * A tracker whose cells are put in by hand: tests, and the hub's debug
 * hook (`hub.debugAdd`) so the pane can be built without the real
 * trackers. Cells are kept as given; `herbs` is a settable catalogue whose
 * add/remove flip `active`; `dropCharm` removes the cell with that id.
 * With `persist` it saves and restores its cells (dropping expired ones).
 */
export class ManualTracker implements Tracker {
  readonly key: string;
  private readonly host: TrackerHost | null;
  private readonly persist: boolean;
  private items = new Map<string, TimerCell>();
  private catalogue: Array<{ key: string; name: string; active: boolean }> = [];

  constructor(key = 'manual', host: TrackerHost | null = null, opts: { persist?: boolean } = {}) {
    this.key = key;
    this.host = host;
    this.persist = opts.persist ?? false;
  }

  /** Adds or replaces a cell (by id). */
  put(cell: TimerCell): void {
    this.items.set(cell.id, { ...cell });
    this.host?.changed();
  }

  /** Removes a cell by id. */
  remove(id: string): void {
    if (this.items.delete(id)) this.host?.changed();
  }

  clear(): void {
    if (this.items.size === 0) return;
    this.items.clear();
    this.host?.changed();
  }

  /** Sets the herblore catalogue (all inactive). */
  setHerbs(list: Array<{ key: string; name: string }>): void {
    this.catalogue = list.map((h) => ({ ...h, active: false }));
    this.host?.changed();
  }

  cells(): TimerCell[] {
    return [...this.items.values()].map((c) => ({ ...c }));
  }

  serialize(): unknown {
    return this.persist ? this.cells() : undefined;
  }

  restore(saved: unknown, now: number): void {
    if (!this.persist || !Array.isArray(saved)) return;
    for (const c of saved as TimerCell[]) {
      if (!c || typeof c.id !== 'string' || !TIMER_GROUPS.includes(c.group)) continue;
      if (this.items.has(c.id)) continue;
      if (c.expiresAt !== null && c.expiresAt <= now) continue;
      this.items.set(c.id, { ...c });
    }
  }

  reset(): void {
    this.items.clear();
    for (const h of this.catalogue) h.active = false;
  }

  herbs(): Array<{ key: string; name: string; active: boolean }> {
    return this.catalogue.map((h) => ({ ...h }));
  }

  /** Marks a catalogue herb running and, with `now`, puts a 10-minute Herblore cell (tests). */
  addHerb(key: string, now?: number): void {
    const h = this.catalogue.find((x) => x.key === key);
    this.flipHerb(key, true);
    if (h && now !== undefined) {
      this.put({ id: `herb:${key}`, name: h.name, group: 'herb', startedAt: now, expiresAt: now + 600_000, expected: 600_000, tracked: true, phase: 'buff', herbKey: key });
    }
  }

  removeHerb(key: string): void {
    this.flipHerb(key, false);
    this.remove(`herb:${key}`);
  }

  dropCharm(id: string): void {
    const c = this.items.get(id);
    if (c && c.group === 'charm') this.remove(id);
  }

  private flipHerb(key: string, active: boolean): void {
    const h = this.catalogue.find((x) => x.key === key);
    if (!h || h.active === active) return;
    h.active = active;
    this.host?.changed();
  }
}
