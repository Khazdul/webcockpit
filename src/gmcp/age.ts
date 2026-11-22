// A character's age and what it adds (`help age`; stage 77 decision 16,
// ADR 0166 addendum part B). Pure TS, no DOM.
//
// - Seven ages, each from a bracket of years that depends on the race's
//   factor (race.ts `ageFactor`). The brackets are the printed ones, not
//   a product: help rounds 97.5, 162.5 and 227.5 down.
// - "Linear and gradual": the age is fractional (`ageInYears`: 12 months
//   of 30 days) and the modifiers change linearly from bracket to
//   bracket. Below the 1st bracket and from the 7th on they stand still.
//   The brackets are whole years, so the age a character is in is the
//   same for the whole years and for the fractional age.
// - Nothing is rounded here: the pane rounds what it shows.

import type { VitalKind } from './bands';
import type { AgeFactor } from './race';

export type Ability = 'str' | 'int' | 'wis' | 'dex' | 'con' | 'wil' | 'per';

/** The seven abilities, in MUME's order. */
export const ABILITIES: readonly Ability[] = ['str', 'int', 'wis', 'dex', 'con', 'wil', 'per'];

/** The ages' names; an age's index is 0–6. */
export const AGE_NAMES: readonly string[] = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

// `help age` (from the owner, 2026-11-22): the years at which the 1st–7th
// age begin, by factor.
// prettier-ignore
export const AGE_BRACKETS: Readonly<Record<AgeFactor, readonly number[]>> = {
  1:   [18, 24,  32,  40,  50,  65,  90], // Man (Other), Bear
  1.5: [27, 36,  48,  60,  75,  97, 135], // Man (Dúnadan, Númenórean), Hobbit
  2:   [36, 48,  64,  80, 100, 130, 180], // Half-elf, Dwarf, Orc, Troll
  2.5: [45, 60,  80, 100, 125, 162, 225], // Elf (Silvan)
  3:   [54, 72,  96, 120, 150, 195, 270], // Elf (Sinda)
  3.5: [63, 84, 112, 140, 175, 227, 315], // Elf (Noldo)
};

// `help age`: what each age adds to the abilities, the points and the
// regeneration. Each row is the 1st–7th age.
// prettier-ignore
export const AGE_MODIFIERS: {
  readonly abilities: Readonly<Record<Ability, readonly number[]>>;
  readonly points: Readonly<Record<VitalKind, readonly number[]>>;
  readonly regen: Readonly<Record<VitalKind, readonly number[]>>;
} = {
  abilities: {
    str:  [ 0,  1,  1,  0,  -1,  -1,  -2],
    int:  [ 1,  1,  1,  0,   0,   0,  -1],
    wis:  [-1,  0,  0,  1,   1,   2,   2],
    dex:  [ 1,  1,  0,  0,  -1,  -2,  -3],
    con:  [ 0,  1,  1,  0,   0,  -1,  -2],
    wil:  [ 1,  1,  1,  1,   1,   0,   0],
    per:  [ 1,  1,  0,  0,  -1,  -2,  -3],
  },
  points: {
    mana: [-5, -3,  0,  3,   7,  15,  10],
    hp:   [14, 16, 12, 10,   8,   4,  -6],
    mp:   [10, 10,  5,  0,  -5, -12, -15],
  },
  regen: {
    mana: [ 0,  1,  3,  6,   8,  10,   6],
    hp:   [ 3,  2,  1,  0,  -1,  -2,  -5],
    mp:   [ 3,  3,  2,  1,  -3,  -6,  -9],
  },
};

/** MUME's calendar. */
const MONTHS_PER_YEAR = 12;
const DAYS_PER_MONTH = 30;

/** Years, months and days as fractional years. */
export function ageInYears(years: number, months = 0, days = 0): number {
  return years + (months + days / DAYS_PER_MONTH) / MONTHS_PER_YEAR;
}

/** An age and its modifiers (unrounded). */
export interface AgeView {
  /** 0–6: the 1st–7th age (the 1st also before its bracket). */
  index: number;
  /** The next age and the year it begins, or null in the 7th. */
  next: { index: number; year: number } | null;
  /** On the seven-step track, 0–1: each age is a seventh. */
  position: number;
  abilities: Record<Ability, number>;
  points: Record<VitalKind, number>;
  regen: Record<VitalKind, number>;
}

/** The age at `age` years (fractional: `ageInYears`) for a race's factor. */
export function ageAt(age: number, factor: AgeFactor): AgeView {
  const years = AGE_BRACKETS[factor];
  let i = 0;
  while (i < years.length - 1 && age >= years[i + 1]!) i++;
  const from = years[i]!;
  const to = years[i + 1];
  /** How far into the age, 0–1. */
  const f = to === undefined ? 0 : Math.max(0, (age - from) / (to - from));
  const between = <K extends string>(rows: Readonly<Record<K, readonly number[]>>): Record<K, number> => {
    const out = {} as Record<K, number>;
    for (const k of Object.keys(rows) as K[]) {
      const a = rows[k][i]!;
      out[k] = a + ((rows[k][i + 1] ?? a) - a) * f;
    }
    return out;
  };
  return {
    index: i,
    next: to === undefined ? null : { index: i + 1, year: to },
    position: (i + f) / years.length,
    abilities: between(AGE_MODIFIERS.abilities),
    points: between(AGE_MODIFIERS.points),
    regen: between(AGE_MODIFIERS.regen),
  };
}

/**
 * When the next birthday is, from the months and days since the last one:
 * "in 5 months" (a started month counts whole), "today" at 0 and 0.
 */
export function birthdayIn(months: number, days: number): string {
  if (months === 0 && days === 0) return 'today';
  // Rounded up, so the days only tell today from a year away.
  const left = Math.max(1, MONTHS_PER_YEAR - months);
  return `in ${left} month${left === 1 ? '' : 's'}`;
}
