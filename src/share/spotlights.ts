// Spotlights (ADR 0019 "Spotlights", Inv §7.6): which moments the reel
// plays, in which order, over which log windows, and how the info box
// names them. Pure; P3 loads the windows and plays them.
//
//   events     char_death, level_up, pkill and achievement of every
//              character's sealed runs that have a log, one spotlight per
//              event (no merging), filtered by the Spotlights settings
//              (kinds × characters × period, `spotlightFilter`; ADR 0110)
//   window     [at − 10 s, at + 5 s] with at = logUs ?? us; the player
//              trims the pre-roll to the first visible entry and dwells
//              through the post-roll; a window with no visible entry is
//              dropped by the loader (`hasVisibleEntry`)
//   rotation   per-character queues, newest first; each pick takes the
//              queue whose head is the most recent, but not the character
//              of the previous pick while another character has some left
//   prefix     the state before a window is read from at most 10 minutes
//              before it (`RunLibrary.chainLogRange(runId, prefixFromUs, toUs)`)

import type { RunMeta } from '../capture/store';
import { hasInk } from '../player/timeline';
import { PLAYING_COMMANDS } from '../net/session';
import type { RunEvent } from '../runs/events';
import { runStartUs } from '../runs/stitch';
import type { SpotlightPeriod, SpotlightSettings } from '../settings';
import { captureEntries } from './capture';

export const WINDOW_BEFORE_US = 10_000_000;
export const WINDOW_AFTER_US = 5_000_000;
/** How far before a window its state prefix is read. */
export const STATE_PREFIX_US = 600_000_000;

export type SpotlightKind = 'pkill' | 'death' | 'level' | 'achievement';

/** The info box's type line (`RASTA: PvP kill`). */
export const KIND_LABEL: Readonly<Record<SpotlightKind, string>> = {
  pkill: 'PvP kill',
  death: 'Death',
  level: 'Level up',
  achievement: 'Achievement',
};

export interface Spotlight {
  /** `<runId>#<event index in the run>`, stable. */
  id: string;
  runId: string;
  character: string;
  /** The character's level at the event, when known. */
  level?: number;
  kind: SpotlightKind;
  /** The moment, µs (`logUs ?? us`). */
  atUs: number;
  /** The window, inclusive µs. */
  fromUs: number;
  toUs: number;
  /** Where the state prefix starts (read `chainLogRange(runId, prefixFromUs, toUs)`). */
  prefixFromUs: number;
  /** The info box label: `*Name the Race*`, `Death (level N)`, `Reached level N`, `Achievement: …`. */
  label: string;
  /** The run's start, µs (the header date). */
  runStartUs: number;
  event: RunEvent;
}

/** One run as the selection reads it. */
export interface SpotlightRun {
  meta: RunMeta;
  events: readonly RunEvent[];
}

function kindOf(e: RunEvent): SpotlightKind | null {
  switch (e.type) {
    case 'pkill':
      return 'pkill';
    case 'char_death':
      return 'death';
    case 'level_up':
      return 'level';
    case 'achievement':
      return 'achievement';
    default:
      return null;
  }
}

/** True when the filters let `kind` through. */
export function kindShown(kind: SpotlightKind, f: SpotlightSettings): boolean {
  if (kind === 'pkill') return f.pvp;
  if (kind === 'death') return f.deaths;
  if (kind === 'level') return f.levelUps;
  return f.achievements;
}

/** Filters that let everything through (every kind, every character, all time). */
export const OPEN_FILTERS: Readonly<SpotlightSettings> = {
  achievements: true,
  deaths: true,
  levelUps: true,
  pvp: true,
  allCharacters: true,
  characters: [],
  period: 'all',
};

/** A kind's switch in the Spotlights settings. */
export type SpotlightKindKey = 'achievements' | 'deaths' | 'levelUps' | 'pvp';

/** The kinds as the settings list them, in Cockpit's order (ADR 0110). */
export const SPOTLIGHT_KINDS: ReadonlyArray<{ key: SpotlightKindKey; kind: SpotlightKind; label: string }> = [
  { key: 'achievements', kind: 'achievement', label: 'Achievements' },
  { key: 'deaths', kind: 'death', label: 'Deaths' },
  { key: 'levelUps', kind: 'level', label: 'Level-ups' },
  { key: 'pvp', kind: 'pkill', label: 'PvP kills' },
];

export const PERIOD_LABELS: Readonly<Record<SpotlightPeriod, string>> = {
  all: 'All time',
  year: 'Last year',
  '3months': 'Last 3 months',
  month: 'Last month',
  week: 'Last week',
};

/** The listed characters with their checks (the remembered subset; listed names only). */
export function characterRows(names: readonly string[], f: SpotlightSettings): Array<{ name: string; on: boolean }> {
  const set = new Set(f.characters);
  return names.map((name) => ({ name, on: set.has(name) }));
}

/** The patch for `All characters` turned on or off over the listed `names`. */
export function allCharactersPatch(names: readonly string[], f: SpotlightSettings, on: boolean): Partial<SpotlightSettings> {
  if (on) return { allCharacters: true };
  const kept = names.filter((n) => f.characters.includes(n));
  // None of the remembered names is listed: start from every listed character.
  return { allCharacters: false, characters: kept.length > 0 ? kept : [...names] };
}

/** The patch for one character checked or unchecked (listed names only, in list order). */
export function characterPatch(names: readonly string[], f: SpotlightSettings, name: string, on: boolean): Partial<SpotlightSettings> {
  return { characters: names.filter((n) => (n === name ? on : f.characters.includes(n))) };
}

/** True when `f` lets everything through. */
export function filtersOpen(f: SpotlightSettings): boolean {
  return f.achievements && f.deaths && f.levelUps && f.pvp && f.allCharacters && f.period === 'all';
}

/**
 * The earliest moment (µs) a period lets through at `nowUs`, or -Infinity
 * for all time: the same local clock time one year, three months or one
 * month back, or seven days back for a week.
 */
export function periodStartUs(period: SpotlightPeriod, nowUs: number): number {
  if (period === 'all') return -Infinity;
  const d = new Date(nowUs / 1000);
  const day = d.getDate();
  if (period === 'week') d.setDate(day - 7);
  else {
    // Back by calendar months, the day clamped to the target month (31 March → 28/29 February).
    const months = period === 'year' ? 12 : period === '3months' ? 3 : 1;
    d.setDate(1);
    d.setMonth(d.getMonth() - months);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return d.getTime() * 1000;
}

/** Whether one event passes: its kind, its character and its moment (µs). */
export type SpotlightFilter = (kind: SpotlightKind, character: string, atUs: number) => boolean;

/** The filter of the Spotlights settings at `nowUs` (ADR 0110): kinds × characters × period. */
export function spotlightFilter(f: SpotlightSettings, nowUs: number): SpotlightFilter {
  const from = periodStartUs(f.period, nowUs);
  const names = f.allCharacters ? null : new Set(f.characters);
  return (kind, character, atUs) => kindShown(kind, f) && (names === null || names.has(character)) && atUs >= from;
}

/** The event's moment in the log: `logUs ?? us`. */
export function eventAt(e: RunEvent): number {
  return 'logUs' in e && typeof e.logUs === 'number' ? e.logUs : e.us;
}

/** The info box label of an event (Inv §7.6). */
export function spotlightLabel(e: RunEvent, level?: number): string {
  switch (e.type) {
    case 'pkill':
      return '*' + (e.race ? `${e.name} ${e.race}` : e.name) + '*';
    case 'char_death': {
      const l = e.level ?? level;
      return l !== undefined ? `Death (level ${l})` : 'Death';
    }
    case 'level_up':
      return `Reached level ${e.level}`;
    case 'achievement':
      return `Achievement: ${e.name}`;
    default:
      return '';
  }
}

/** Every spotlight of one run, in time order (unfiltered). */
function spotlightsOf(run: SpotlightRun): Spotlight[] {
  const out: Spotlight[] = [];
  const m = run.meta;
  // The level as the run goes: the baseline, then every level_up.
  let cur: number | undefined;
  run.events.forEach((e, i) => {
    if (e.type === 'run_start' && e.level !== undefined) cur = e.level;
    if (e.type === 'level_up') cur = e.level;
    if (e.type === 'char_death' && e.level !== undefined) cur = e.level;
    const kind = kindOf(e);
    if (!kind) return;
    const level = cur ?? m.summary?.level;
    const at = eventAt(e);
    out.push({
      id: `${m.runId}#${i}`,
      runId: m.runId,
      character: m.character,
      ...(level !== undefined ? { level } : {}),
      kind,
      atUs: at,
      fromUs: at - WINDOW_BEFORE_US,
      toUs: at + WINDOW_AFTER_US,
      prefixFromUs: at - WINDOW_BEFORE_US - STATE_PREFIX_US,
      label: spotlightLabel(e, level),
      runStartUs: runStartUs(m),
      event: e,
    });
  });
  return out;
}

/**
 * The reel: every shown event of sealed runs with a log, one spotlight each,
 * in rotation order (see the file header). The period counts back from
 * `nowUs`.
 */
export function selectSpotlights(runs: readonly SpotlightRun[], filters: SpotlightSettings, nowUs: number = Date.now() * 1000): Spotlight[] {
  const shown = spotlightFilter(filters, nowUs);
  const queues = new Map<string, Spotlight[]>();
  for (const r of runs) {
    if (!r.meta.sealed || !(r.meta.bytes > 0)) continue;
    for (const s of spotlightsOf(r)) {
      if (!shown(s.kind, s.character, s.atUs)) continue;
      const q = queues.get(s.character);
      if (q) q.push(s);
      else queues.set(s.character, [s]);
    }
  }
  for (const q of queues.values()) q.sort((a, b) => b.atUs - a.atUs || b.id.localeCompare(a.id));
  const out: Spotlight[] = [];
  const heads = new Map<string, number>([...queues.keys()].map((k) => [k, 0]));
  let last: string | null = null;
  for (;;) {
    let best: string | null = null;
    let bestOther: string | null = null;
    for (const [ch, i] of heads) {
      const q = queues.get(ch)!;
      if (i >= q.length) continue;
      const newer = (x: string | null): boolean => {
        if (x === null) return true;
        const a = q[i]!;
        const b = queues.get(x)![heads.get(x)!]!;
        return a.atUs > b.atUs || (a.atUs === b.atUs && ch < x);
      };
      if (newer(best)) best = ch;
      if (ch !== last && newer(bestOther)) bestOther = ch;
    }
    const pick: string | null = bestOther ?? best;
    if (pick === null) break;
    const i = heads.get(pick)!;
    out.push(queues.get(pick)![i]!);
    heads.set(pick, i + 1);
    last = pick;
  }
  return out;
}

/**
 * True when a capture text has a visible entry (an inbound line with ink,
 * or an echoed command) in `[fromUs, toUs]`: a window without one is dropped.
 */
export function hasVisibleEntry(text: string, fromUs: number, toUs: number): boolean {
  for (const e of captureEntries(text)) {
    if (e.ts < fromUs) continue;
    if (e.ts > toUs) return false;
    if (e.kind === 'in' && hasInk(e.body, 0, e.body.length)) return true;
    if (e.kind === 'out' && e.body !== '' && !PLAYING_COMMANDS.includes(e.body)) return true;
  }
  return false;
}

/**
 * Which empty state to show when nothing passes: `no_data` when there is
 * nothing at all (`any`: something would show with open filters) or the
 * filters are open, else `filtered` (ADR 0110).
 */
export function emptyState(filters: SpotlightSettings, any = true): 'no_data' | 'filtered' {
  return !any || filtersOpen(filters) ? 'no_data' : 'filtered';
}

/**
 * The Spotlights page's character chips (stage 46, B "Galleriet"): `name`
 * null is the `All` chip, a name one of the listed `names`.
 *
 * - All on → off brings back the remembered set (`allCharactersPatch`);
 *   with no listed name All stays on (nothing to show instead).
 * - A name while All is on shows only that name.
 * - With All off a name toggles; turning the last one off turns All back
 *   on (the remembered set is kept for the next All off).
 */
export function chipPatch(f: SpotlightSettings, name: string | null, names: readonly string[]): Partial<SpotlightSettings> {
  if (name === null) {
    if (f.allCharacters && names.length === 0) return {};
    return allCharactersPatch(names, f, !f.allCharacters);
  }
  if (f.allCharacters) return { allCharacters: false, characters: [name] };
  const next = characterPatch(names, f, name, !f.characters.includes(name));
  return next.characters && next.characters.length > 0 ? next : { allCharacters: true };
}

/** The character chips that are lit: `All`, or the remembered names that are listed. */
export function chipsOn(f: SpotlightSettings, names: readonly string[]): string[] {
  return f.allCharacters ? [] : names.filter((n) => f.characters.includes(n));
}

/**
 * ANSI normal red as Spotlights draws it on its dark wells (owner decision,
 * stage 46): the Default palette's `#800000` is hard to read on near-black
 * (1.9:1); this reads at about 4:1 on black (3.8:1 on the viewer's
 * `#0b0907`). Only while the Display colours are Default; a chosen theme
 * keeps its own red.
 */
export const SPOTLIGHT_RED = '#c43c3c';

/**
 * The Spotlights palette tweak (stage 46), ANSI index → colour: the card
 * stills (spotlights-wall.tsx) and the viewer's host (`setPaletteTweak`,
 * spotlight-mode.ts) both draw from it.
 */
export const SPOTLIGHT_PALETTE_TWEAK: Readonly<Record<number, string>> = { 1: SPOTLIGHT_RED };
