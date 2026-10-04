// Game time model (ADR 0074 §1–2): seasons, the period of the day, the
// moon, and a solver for "the next window where a condition holds". Pure
// TS beside the clock (clock.ts), no DOM, no timers.
//
// Every time here is an absolute game minute `g`: minutes since year 0,
// month 0, day 1, 00:00 (clock.ts `momentSeconds`). One game minute is
// one real second, so `g = unixSeconds - clock epoch`.
//
// The moon follows MMapper's model (MMapper 26.06, src/clock/mumemoment.cpp,
// GPL; read to learn the model, not copied). The moon is a pure function of
// the game minute counted from year 2850 (MMapper's MUME_START_YEAR):
//
//   zenith  = floor(m · 1440 / CYCLE) mod 1440   minute of day the moon is highest
//   level   = |12 − round(zenith / 60)|           0 new … 12 full
//   waxing  = zenith ≥ 720
//   phase   = level / 3 (new, crescent, quarter, gibbous, full) + waxing
//   rises at zenith + 18 h, sets 12 h later; below the horizon in between
//
// with CYCLE the synodic month, 29 d 12 h 44 m. Checked against the logs:
// GMCP `Event.Moon {what: "set"}` on 2026-10-03 came at 19 Wedmath 2855
// 22:58, the minute the model predicts (tests/unit/gmcp-gametime.test.ts).
//
// Visibility (MMapper's rules): below the horizon or new → not visible; a
// dim moon (level ≤ 4) is not visible by day (between the dawn and dusk
// hours); otherwise visible, and bright when level > 4.
//
// Moon events are found in closed form, not by stepping: the hour angle is
// `m − floor(1440 m / CYCLE) − 1080 (mod 1440)` and its unwrapped form
// never decreases, so the minute it reaches a value has a formula.

import { DAWN, DAY_S, DUSK, HOUR_S, MONTH_S, MONTHS_SINDARIN, MONTHS_WESTRON, WEEKDAYS, YEAR_S, monthIndex, weekdayOf } from './clock';

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
/** Winter = Afteryule–Rethe, Spring = Astron–Forelithe, Summer = Afterlithe–Halimath, Autumn = Winterfilth–Foreyule. */
export const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn'];

/** The season of a month (0–11). */
export const seasonOf = (month: number): Season => SEASONS[Math.floor(month / 3)]!;

/** Period of the day: the dawn hour, day, the dusk hour, night. */
export type DayPeriod = 'dawn' | 'day' | 'dusk' | 'night';
export const DAY_PERIODS: readonly DayPeriod[] = ['dawn', 'day', 'dusk', 'night'];

/** The period of `hour` in `month` (DAWN/DUSK tables; clock.ts `isDay` is dawn ≤ h < dusk). */
export function periodOf(month: number, hour: number): DayPeriod {
  const dawn = DAWN[month]!;
  const dusk = DUSK[month]!;
  if (hour === dawn) return 'dawn';
  if (hour === dusk) return 'dusk';
  return hour > dawn && hour < dusk ? 'day' : 'night';
}

// ------------------------------------------------------------------- moon

/** The synodic month in game minutes: 29 d 12 h 44 m. */
export const MOON_CYCLE = (29 * 24 + 12) * 60 + 44;
/** Game minute where the moon model's count starts (year 2850, MMapper's origin). */
export const MOON_ORIGIN = 2850 * YEAR_S;

export type MoonPhase =
  | 'new'
  | 'waxing crescent'
  | 'first quarter'
  | 'waxing gibbous'
  | 'full'
  | 'waning gibbous'
  | 'third quarter'
  | 'waning crescent';
export const MOON_PHASES: readonly MoonPhase[] = [
  'new', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full', 'waning gibbous', 'third quarter', 'waning crescent',
];
const WAXING_NAMES: readonly MoonPhase[] = ['new', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full'];
const WANING_NAMES: readonly MoonPhase[] = ['new', 'waning crescent', 'third quarter', 'waning gibbous', 'full'];

/** Where the moon is: five places above the horizon, or below it. */
export type MoonPosition = 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'below';
const ABOVE: readonly MoonPosition[] = ['east', 'southeast', 'southeast', 'south', 'south', 'southwest', 'southwest', 'west'];

export interface Moon {
  phase: MoonPhase;
  /** 0 new … 12 full. */
  level: number;
  waxing: boolean;
  position: MoonPosition;
  visible: boolean;
  bright: boolean;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Unwrapped zenith count: one step per moon minute-of-day shift. */
const zenithCount = (g: number): number => Math.floor(((g - MOON_ORIGIN) * DAY_S) / MOON_CYCLE);
/** Unwrapped hour angle + 1080: never decreases, rises 0 or 1 per minute. */
const angleCount = (g: number): number => g - MOON_ORIGIN - zenithCount(g);

/** Minute of the day (0–1439) at which the moon is highest. */
export const moonZenith = (g: number): number => mod(zenithCount(g), DAY_S);

const levelOfZenith = (z: number): number => Math.abs(12 - Math.floor((z + 30) / 60));
function phaseOfZenith(z: number): MoonPhase {
  const i = Math.min(4, Math.floor(levelOfZenith(z) / 3));
  return z >= DAY_S / 2 ? WAXING_NAMES[i]! : WANING_NAMES[i]!;
}

/** Minutes since moonrise (0–1439); the moon is up below 720. */
const hourAngle = (g: number): number => mod(angleCount(g) - 1080, DAY_S);

/** The moon at game minute `g`. */
export function moonAt(g: number): Moon {
  const z = moonZenith(g);
  const level = levelOfZenith(z);
  const phase = phaseOfZenith(z);
  const h = hourAngle(g);
  const position = h < DAY_S / 2 ? ABOVE[Math.floor(h / 90)]! : 'below';
  let visible = position !== 'below' && phase !== 'new';
  if (visible && level <= 4 && periodAt(g) === 'day') visible = false;
  return { phase, level, waxing: z >= DAY_S / 2, position, visible, bright: visible && level > 4 };
}

/** The first minute ≥ `g` at which the moon rises (`rise`) or sets (`set`). */
export function nextMoonEvent(g: number, what: 'rise' | 'set'): number {
  // Rise: the angle count reaches 1080 (mod 1440); set: 720 later.
  const c = what === 'rise' ? 1080 : 1800 % DAY_S;
  const prev = angleCount(g - 1);
  const target = prev + 1 + mod(c - (prev + 1), DAY_S);
  // Smallest m with m − floor(1440 m / C) ≥ target.
  const m = Math.floor(((target - 1) * MOON_CYCLE) / (MOON_CYCLE - DAY_S)) + 1;
  return m + MOON_ORIGIN;
}

/**
 * GMCP `Event.Moon` against the model: the game minute `g` it arrived at
 * minus the nearest predicted rise or set, in game minutes (−720 … 719).
 * 0 means the model and the anchor agree to the minute.
 */
export function moonEventDelta(g: number, what: 'rise' | 'set'): number {
  return g - nextMoonEvent(g - DAY_S / 2, what);
}

/** Zenith minutes where the phase name or brightness (level > 4) changes, ascending. */
const ZENITH_EDGES: readonly number[] = (() => {
  const key = (z: number): string => `${phaseOfZenith(z)}|${levelOfZenith(z) > 4}`;
  const out: number[] = [];
  for (let z = 0; z < DAY_S; z++) if (key(z) !== key(mod(z - 1, DAY_S))) out.push(z);
  return out;
})();

/** The first minute > `g` at which the phase (or the moon's brightness) changes. */
export function nextMoonChange(g: number): number {
  const zc = zenithCount(g);
  const z = mod(zc, DAY_S);
  const base = zc - z;
  const next = ZENITH_EDGES.find((e) => e > z);
  const zt = next !== undefined ? base + next : base + DAY_S + ZENITH_EDGES[0]!;
  // Smallest m with floor(1440 m / C) ≥ zt.
  return Math.ceil((zt * MOON_CYCLE) / DAY_S) + MOON_ORIGIN;
}

/** The first minute > `g` at which the phase name changes (skips brightness-only edges). */
export function nextPhaseChange(g: number): number {
  const now = moonAt(g).phase;
  let t = nextMoonChange(g);
  while (moonAt(t).phase === now) t = nextMoonChange(t);
  return t;
}

// -------------------------------------------------------------- calendar

const monthOf = (g: number): number => mod(Math.floor(g / MONTH_S), 12);
const hourOf = (g: number): number => mod(Math.floor(g / HOUR_S), 24);
/** The period of the day at game minute `g`. */
export const periodAt = (g: number): DayPeriod => periodOf(monthOf(g), hourOf(g));

// ----------------------------------------------------------------- solver

/** A moment `gameTimeFind{at = …}` can ask for. */
export type AtMoment = 'dawn' | 'dusk' | 'midnight' | 'moonrise' | 'moonset' | 'seasonStart';
export const AT_MOMENTS: readonly AtMoment[] = ['dawn', 'dusk', 'midnight', 'moonrise', 'moonset', 'seasonStart'];

/** A checked condition (`parseCond`): every key optional, all must hold. */
export interface GameTimeCond {
  season?: readonly Season[];
  notSeason?: readonly Season[];
  /** 0–11. */
  month?: readonly number[];
  /** Hours from ≤ h < to, across midnight when from > to. */
  hours?: { from: number; to: number };
  period?: readonly DayPeriod[];
  moon?: readonly MoonPhase[];
  moonVisible?: boolean;
  at?: AtMoment;
}

export const COND_KEYS = ['season', 'notSeason', 'month', 'hours', 'period', 'moon', 'moonVisible', 'at'] as const;

/** A bad condition; the message is for the script author. */
export class CondError extends Error {}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);

function names<T extends string>(key: string, v: unknown, allowed: readonly T[]): T[] {
  const out: T[] = [];
  for (const x of list(v)) {
    const s = typeof x === 'string' ? x.trim().toLowerCase() : x;
    const hit = allowed.find((a) => a.toLowerCase() === s);
    if (!hit) throw new CondError(`${key}: unknown value ${JSON.stringify(x)} (one of ${allowed.join(', ')})`);
    out.push(hit);
  }
  if (out.length === 0) throw new CondError(`${key}: empty list`);
  return out;
}

function hourValue(key: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 23) {
    throw new CondError(`${key}: an hour 0–23 expected, got ${JSON.stringify(v)}`);
  }
  return v;
}

/**
 * Checks a condition table from Lua (a LuaValue: object, or arrays for
 * lists) and returns it normalized. Throws CondError on an unknown key or
 * value. Lists may be given as one value. Months are 1–12 or names.
 */
export function parseCond(raw: unknown): GameTimeCond {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    if (Array.isArray(raw) && raw.length === 0) return {};
    throw new CondError('a table of conditions expected');
  }
  const r = raw as Record<string, unknown>;
  const out: GameTimeCond = {};
  for (const [k, v] of Object.entries(r)) {
    switch (k) {
      case 'season':
        out.season = names(k, v, SEASONS);
        break;
      case 'notSeason':
        out.notSeason = names(k, v, SEASONS);
        break;
      case 'month':
        out.month = list(v).map((x) => {
          const i = typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 12 ? x - 1 : typeof x === 'string' ? monthIndex(x) : -1;
          if (i < 0) throw new CondError(`month: 1–12 or a month name expected, got ${JSON.stringify(x)}`);
          return i;
        });
        if (out.month.length === 0) throw new CondError('month: empty list');
        break;
      case 'hours': {
        const h = v as Record<string, unknown> | unknown[];
        if (typeof h !== 'object' || h === null) throw new CondError('hours: a table {from = h, to = h} expected');
        const from = hourValue('hours.from', Array.isArray(h) ? h[0] : h.from);
        const to = hourValue('hours.to', Array.isArray(h) ? h[1] : h.to);
        if (from === to) throw new CondError('hours: from and to must differ (to is not included)');
        out.hours = { from, to };
        break;
      }
      case 'period':
        out.period = names(k, v, DAY_PERIODS);
        break;
      case 'moon':
        out.moon = names(k, v, MOON_PHASES);
        break;
      case 'moonVisible':
        if (typeof v !== 'boolean') throw new CondError(`moonVisible: true or false expected, got ${JSON.stringify(v)}`);
        out.moonVisible = v;
        break;
      case 'at': {
        if (Array.isArray(v)) throw new CondError('at: one moment expected, not a list');
        out.at = names(k, v, AT_MOMENTS)[0]!;
        break;
      }
      default:
        throw new CondError(`unknown key '${k}' (${COND_KEYS.join(', ')})`);
    }
  }
  return out;
}

/** True when every key of `c` except `at` holds at game minute `g`. */
export function condHolds(c: GameTimeCond, g: number): boolean {
  const month = monthOf(g);
  if (c.season && !c.season.includes(seasonOf(month))) return false;
  if (c.notSeason && c.notSeason.includes(seasonOf(month))) return false;
  if (c.month && !c.month.includes(month)) return false;
  const hour = hourOf(g);
  if (c.hours) {
    const { from, to } = c.hours;
    if (from < to ? hour < from || hour >= to : hour < from && hour >= to) return false;
  }
  if (c.period && !c.period.includes(periodOf(month, hour))) return false;
  if (c.moon || c.moonVisible !== undefined) {
    const m = moonAt(g);
    if (c.moon && !c.moon.includes(m.phase)) return false;
    if (c.moonVisible !== undefined && m.visible !== c.moonVisible) return false;
  }
  return true;
}

/** True when a key of `c` changes on the hour (everything but the moon phase). */
const usesHours = (c: GameTimeCond): boolean =>
  !!(c.season || c.notSeason || c.month || c.hours || c.period || c.moonVisible !== undefined);

/** The next minute > `g` at which `condHolds(c, ·)` may change. */
function nextEdge(c: GameTimeCond, g: number): number {
  let t = Infinity;
  if (usesHours(c)) t = (Math.floor(g / HOUR_S) + 1) * HOUR_S;
  if (c.moon || c.moonVisible !== undefined) t = Math.min(t, nextMoonChange(g));
  if (c.moonVisible !== undefined) t = Math.min(t, nextMoonEvent(g + 1, 'rise'), nextMoonEvent(g + 1, 'set'));
  // An empty condition holds everywhere: one step to the end.
  return t === Infinity ? g + YEAR_S : t;
}

/**
 * Where to look next while `c` does not hold at `g`: past the month when a
 * month key fails, past the phase when the phase fails, else the next edge.
 * Each skip is safe because the failing key cannot change before it.
 */
function skipFalse(c: GameTimeCond, g: number): number {
  let t = g + 1;
  const month = monthOf(g);
  const season = seasonOf(month);
  if ((c.season && !c.season.includes(season)) || c.notSeason?.includes(season) || (c.month && !c.month.includes(month))) {
    t = (Math.floor(g / MONTH_S) + 1) * MONTH_S;
  }
  if (c.moon && !c.moon.includes(moonAt(g).phase)) t = Math.max(t, nextPhaseChange(g));
  return t > g + 1 ? t : nextEdge(c, g);
}

/** The first minute ≥ `g` at which `at` happens. */
export function nextAt(at: AtMoment, g: number): number {
  switch (at) {
    case 'midnight':
      return Math.ceil(g / DAY_S) * DAY_S;
    case 'seasonStart': {
      let t = Math.ceil(g / MONTH_S) * MONTH_S;
      while (monthOf(t) % 3 !== 0) t += MONTH_S;
      return t;
    }
    case 'moonrise':
      return nextMoonEvent(g, 'rise');
    case 'moonset':
      return nextMoonEvent(g, 'set');
    case 'dawn':
    case 'dusk': {
      const table = at === 'dawn' ? DAWN : DUSK;
      let t = Math.ceil(g / HOUR_S) * HOUR_S;
      while (hourOf(t) !== table[monthOf(t)]) t += HOUR_S;
      return t;
    }
  }
}

/** One game year in minutes: the default horizon (six real days). */
export const DEFAULT_HORIZON = YEAR_S;

/**
 * The next window `[start, end)` at or after game minute `from` where `c`
 * holds, starting before `from + horizon`; null when there is none.
 *
 * - When `c` already holds at `from`, the window starts at `from`.
 * - With `at`, the window is that moment: start = end = the first `at`
 *   moment at which the other keys hold.
 * - A window still open a game year after its start ends there.
 */
export function findWindow(c: GameTimeCond, from: number, horizon: number = DEFAULT_HORIZON): { start: number; end: number } | null {
  const limit = from + horizon;
  if (c.at) {
    for (let t = nextAt(c.at, from); t < limit; t = nextAt(c.at, t + 1)) {
      if (condHolds(c, t)) return { start: t, end: t };
    }
    return null;
  }
  let t = from;
  while (!condHolds(c, t)) {
    t = skipFalse(c, t);
    if (t >= limit) return null;
  }
  const start = t;
  const cap = start + YEAR_S;
  do t = nextEdge(c, t);
  while (t < cap && condHolds(c, t));
  return { start, end: Math.min(t, cap) };
}

// ------------------------------------------------------------- game time

/** What `gameTime()` gives a script (ADR 0074 §2). */
export interface GameTimeInfo {
  year: number;
  /** 1–12. */
  month: number;
  monthName: string;
  sindarin: string;
  /** 1–30. */
  day: number;
  hour: number;
  minute: number;
  weekday: string;
  season: Season;
  period: DayPeriod;
  /** Dawn and dusk hours of the month. */
  dawn: number;
  dusk: number;
  moon: Moon;
}

/** The game time at minute `g`, with month 1–12 (Lua style). */
export function gameTimeAt(g: number): GameTimeInfo {
  const month = monthOf(g);
  const hour = hourOf(g);
  const dayOfMonth = mod(Math.floor(g / DAY_S), 30);
  return {
    year: Math.floor(g / YEAR_S),
    month: month + 1,
    monthName: MONTHS_WESTRON[month]!,
    sindarin: MONTHS_SINDARIN[month]!,
    day: dayOfMonth + 1,
    hour,
    minute: mod(g, 60),
    weekday: WEEKDAYS[weekdayOf(month, dayOfMonth + 1)]!,
    season: seasonOf(month),
    period: periodOf(month, hour),
    dawn: DAWN[month]!,
    dusk: DUSK[month]!,
    moon: moonAt(g),
  };
}
