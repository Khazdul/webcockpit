// The timed-entry model of the Timers pane (Inv §2.6.1, §2.6.4, ADR 0017).
// Pure: no DOM, no clock of its own (every function takes `now` in ms).
//
//   TimerCell         one entry as the pane draws it (trackers make them)
//   barPct            drain: clamp(remaining / expected, 0, 1)
//   countdownText     the short time: `Ns` up to 90 s, else minutes
//                     (`(secs + 30) // 60` → `Nm`), `1h52` from an hour
//   exactText         the exact time for tooltips: `45s`, `3:12`, `1:52:00`
//   charmMinutes      count-up minutes of a charm row (≤ 99)
//   sortCells         the order within a group (Inv §2.6.1 "Sort order")
//
// Both panes (Group's sanctuary ring, Timers) use the two formatters, so
// one time reads the same everywhere.

/** The pane's groups, top to bottom (Inv §2.6.1). */
export type TimerGroup = 'sanct' | 'spell' | 'buff' | 'debuff' | 'herb' | 'stored' | 'blind' | 'charm';

export const TIMER_GROUPS: readonly TimerGroup[] = ['herb', 'sanct', 'spell', 'buff', 'debuff', 'stored', 'blind', 'charm'];

/** Group labels (Options, the `Group:` header rows). */
export const TIMER_GROUP_LABELS: Readonly<Record<TimerGroup, string>> = {
  sanct: 'Sanctuary',
  spell: 'Spells',
  buff: 'Buffs',
  debuff: 'Debuffs',
  herb: 'Herblores',
  stored: 'Stored',
  blind: 'Blinds',
  charm: 'Charmies',
};

/** One entry as the pane draws it (ADR 0017 "Hub"). */
export interface TimerCell {
  /** Stable across updates (the pane may key DOM or clicks on it). */
  id: string;
  /** Display name (the pane capitalises its first letter; blind targets stay as written). */
  name: string;
  group: TimerGroup;
  /** Start time in ms, or null (untracked). */
  startedAt: number | null;
  /** Expiry in ms; null = indefinite / untracked / permanent. */
  expiresAt: number | null;
  /** The duration the bar drains over, ms; null = no drain. */
  expected: number | null;
  /** False: seen in `stat`/`info` only (affect), or after a blast (stored spell). */
  tracked: boolean;
  /**
   * Sanctuary group (ADR 0122): whose sanctuary it is, a group member's
   * name; absent for your own.
   */
  target?: string;
  /** The duration is an estimate (another's sanctuary timed from your cast): the pane says "about". */
  estimated?: boolean;
  /** Herblore group (ADR 0122 addendum): the phase's kind; the cell's herb key is `herbKey`. */
  phase?: 'buff' | 'debuff';
  /** Herblore group: the catalogue key (the × stops it). */
  herbKey?: string;
}

/** One herblore of the catalogue, `active` while it runs (the Herblores `+` menu). */
export interface HerbEntry {
  key: string;
  name: string;
  active: boolean;
}

/** What the pane reads from the hub (ADR 0017). */
export interface TimersView {
  /** Cells per group, already sorted. */
  cells: Record<TimerGroup, TimerCell[]>;
  /** The herblore catalogue in its order. */
  herbs: HerbEntry[];
}

/** An empty view (no trackers, before any line). */
export function emptyView(): TimersView {
  return {
    cells: { sanct: [], spell: [], buff: [], debuff: [], herb: [], stored: [], blind: [], charm: [] },
    herbs: [],
  };
}

/** True when the cell counts down (timed and tracked). */
export function isTimed(c: TimerCell): boolean {
  return c.tracked && c.expiresAt !== null;
}

/** Remaining ms (may be negative: overrun), or null when the cell is not timed. */
export function remainingMs(c: TimerCell, now: number): number | null {
  return isTimed(c) ? c.expiresAt! - now : null;
}

/**
 * The bar's fill fraction 0–1: `remaining / expected` clamped. An
 * indefinite tracked cell is full (1); an untracked one is empty (0).
 */
export function barPct(c: TimerCell, now: number): number {
  if (!c.tracked) return 0;
  if (c.expiresAt === null || c.expected === null) return 1;
  if (c.expected <= 0) return 0;
  const p = (c.expiresAt - now) / c.expected;
  return p <= 0 ? 0 : p >= 1 ? 1 : p;
}

/**
 * Countdown text from remaining seconds (Inv §2.6.1 "Clock", ADR 0122):
 * ≤ 90 s → `Ns`, else minutes rounded half up (`91s` → `2m`; `1m` never
 * appears), and from 60 minutes `1h52` (hours and two-digit minutes);
 * negative clamps to `0s`. Fractions are truncated first.
 */
export function countdownText(remainingSec: number): string {
  const secs = Number.isFinite(remainingSec) ? Math.max(0, Math.floor(remainingSec)) : 0;
  if (secs <= 90) return `${secs}s`;
  const mins = Math.floor((secs + 30) / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
}

/**
 * The exact time for tooltips from seconds: `45s` under a minute, `3:12`,
 * `1:52:00` from an hour. Fractions are truncated; negative clamps to `0s`.
 */
export function exactText(secs: number): string {
  const s = Number.isFinite(secs) ? Math.max(0, Math.floor(secs)) : 0;
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** Minutes since a charm landed, 0–99; null for a permanent charm (no expiry). */
export function charmMinutes(c: TimerCell, now: number): number | null {
  if (c.expiresAt === null || c.startedAt === null) return null;
  return Math.min(99, Math.max(0, Math.floor((now - c.startedAt) / 60000)));
}

const byName = (a: TimerCell, b: TimerCell): number => {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

/** Most remaining first (latest expiry), name as tie-break. */
const byExpiryDesc = (a: TimerCell, b: TimerCell): number =>
  (b.expiresAt ?? 0) - (a.expiresAt ?? 0) || byName(a, b);

/** Spells, buffs, debuffs: untimed first (by name), then timed by most remaining. */
export function sortAffectCells(cells: TimerCell[]): TimerCell[] {
  return cells.sort((a, b) => {
    const ua = a.expiresAt === null;
    const ub = b.expiresAt === null;
    if (ua !== ub) return ua ? -1 : 1;
    return ua ? byName(a, b) : byExpiryDesc(a, b);
  });
}

/** Stored: tracked first (most remaining first), then untracked (by name). */
export function sortStoredCells(cells: TimerCell[]): TimerCell[] {
  return cells.sort((a, b) => {
    if (a.tracked !== b.tracked) return a.tracked ? -1 : 1;
    return a.tracked ? byExpiryDesc(a, b) : byName(a, b);
  });
}

/** Blinds: most remaining first, name as tie-break. */
export function sortBlindCells(cells: TimerCell[]): TimerCell[] {
  return cells.sort(byExpiryDesc);
}

/** Charms: oldest first (a permanent one without a start sorts first), id as tie-break. */
export function sortCharmCells(cells: TimerCell[]): TimerCell[] {
  return cells.sort(
    (a, b) => (a.startedAt ?? -Infinity) - (b.startedAt ?? -Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Sanctuary: yours first, then timed by most remaining, then untimed by name. */
export function sortSanctCells(cells: TimerCell[]): TimerCell[] {
  return cells.sort((a, b) => {
    const sa = a.target === undefined;
    const sb = b.target === undefined;
    if (sa !== sb) return sa ? -1 : 1;
    const ta = isTimed(a);
    const tb = isTimed(b);
    if (ta !== tb) return ta ? -1 : 1;
    return ta ? byExpiryDesc(a, b) : byName(a, b);
  });
}

/** Sorts `cells` in place in the order of `group`; returns the array. */
export function sortCells(group: TimerGroup, cells: TimerCell[]): TimerCell[] {
  switch (group) {
    case 'sanct':
      return sortSanctCells(cells);
    case 'spell':
    case 'buff':
    case 'debuff':
    case 'herb':
      return sortAffectCells(cells);
    case 'stored':
      return sortStoredCells(cells);
    case 'blind':
      return sortBlindCells(cells);
    case 'charm':
      return sortCharmCells(cells);
  }
}
