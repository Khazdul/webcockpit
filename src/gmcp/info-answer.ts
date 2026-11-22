// The hidden `info` poll's answer (stage 77 part A "Live results", ADR
// 0166 points 2 and addendum part B). Pure TS, no DOM.
//
// - `INFO_FIELDS` is the one list of fields: the poll builds its format
//   from it, joined with `INFO_SEPARATOR`.
// - The answer's text is the lines between the sentinels, the sentinels
//   removed. It wraps at the window's width, the break in a space's place:
//   the lines are joined with a space, SGR is stripped, the text is split
//   at `|` and each field trimmed.
// - A wrong number of fields is no answer (null): nothing says which field
//   is which. A field that cannot be read is null and the others are kept.
//   Nothing is guessed: an unknown shape is unreadable.
// - Heights, weights and pounds come in number words ("one hundred two
//   pounds"). A hyphen and a space read the same, so a break after a
//   hyphen does no harm.
// - The text fields (%F, %q, %c) are kept as sent, but %q without "You
//   are " and its final "!" or ".".

import { ABILITIES, type Ability } from './age';
import { stripAnsi } from './comm';

/** The fields in the order they are sent and answered, with their `info` codes. */
export const INFO_FIELDS = [
  { key: 'level', code: '%l' },
  { key: 'ob', code: '%O' },
  { key: 'db', code: '%D' },
  { key: 'pb', code: '%k' },
  { key: 'abs', code: '%A' },
  { key: 'str', code: '%S' },
  { key: 'int', code: '%i' },
  { key: 'wis', code: '%w' },
  { key: 'dex', code: '%d' },
  { key: 'con', code: '%o' },
  { key: 'wil', code: '%I' },
  { key: 'per', code: '%p' },
  { key: 'unaffected', code: '%G' },
  { key: 'years', code: '%a' },
  { key: 'months', code: '%N' },
  { key: 'days', code: '%n' },
  { key: 'height', code: '%h' },
  { key: 'weight', code: '%W' },
  { key: 'carrying', code: '%C' },
  { key: 'load', code: '%F' },
  { key: 'alignment', code: '%q' },
  { key: 'citizen', code: '%c' },
  { key: 'purse', code: '%r' },
  { key: 'warFame', code: '%K' },
  { key: 'vision', code: '%v' },
  { key: 'hearing', code: '%H' },
  { key: 'smell', code: '%s' },
  { key: 'wimpy', code: '%y' },
] as const;

export type InfoKey = (typeof INFO_FIELDS)[number]['key'];

/** Between the fields. The answer wraps at its spaces, so it is split at `|` alone. */
export const INFO_SEPARATOR = ' | ';

export interface AbilityScore {
  current: number | null;
  /** From `%G`: without affects. */
  unaffected: number | null;
  /** current − unaffected, null when either is unknown. */
  delta: number | null;
}

/** An answer, read. Null: that field could not be read, or was empty. */
export interface InfoAnswer {
  level: number | null;
  ob: number | null;
  db: number | null;
  pb: number | null;
  abs: number | null;
  abilities: Record<Ability, AbilityScore>;
  years: number | null;
  months: number | null;
  days: number | null;
  height: { feet: number; inches: number } | null;
  weight: { stone: number; pounds: number } | null;
  /** Pounds. */
  carrying: number | null;
  /** The encumbrance sentence, as sent. */
  load: string | null;
  alignment: string | null;
  citizen: string | null;
  purse: { gold: number; silver: number; copper: number } | null;
  warFame: { word: string; points: number } | null;
  vision: number | null;
  hearing: number | null;
  smell: number | null;
  /** Hit points (GMCP has no wimpy). */
  wimpy: number | null;
}

/**
 * Reads an answer from the lines between the sentinels, or null when it
 * does not have every field.
 */
export function parseInfoAnswer(lines: readonly string[]): InfoAnswer | null {
  const text = stripAnsi(lines.join(' ')).replace(/\s+/g, ' ');
  const parts = text.split('|');
  if (parts.length !== INFO_FIELDS.length) return null;
  const f = {} as Record<InfoKey, string>;
  INFO_FIELDS.forEach(({ key }, i) => (f[key] = parts[i]!.trim()));

  const base = unaffectedOf(f.unaffected);
  const abilities = {} as Record<Ability, AbilityScore>;
  for (const a of ABILITIES) {
    const current = numberOf(f[a]);
    const unaffected = base?.[a] ?? null;
    abilities[a] = { current, unaffected, delta: current !== null && unaffected !== null ? current - unaffected : null };
  }
  return {
    level: numberOf(f.level),
    ob: numberOf(f.ob),
    db: numberOf(f.db),
    pb: numberOf(f.pb),
    abs: numberOf(f.abs),
    abilities,
    years: numberOf(f.years),
    months: numberOf(f.months),
    days: numberOf(f.days),
    height: heightOf(f.height),
    weight: weightOf(f.weight),
    carrying: poundsOf(f.carrying),
    load: f.load || null,
    alignment: f.alignment.replace(/^You are /, '').replace(/[!.]$/, '') || null,
    citizen: f.citizen || null,
    purse: purseOf(f.purse),
    warFame: warFameOf(f.warFame),
    vision: numberOf(f.vision),
    hearing: numberOf(f.hearing),
    smell: numberOf(f.smell),
    wimpy: numberOf(f.wimpy),
  };
}

/** A bare number, with a sign or not. */
function numberOf(s: string): number | null {
  return /^[+-]?\d+$/.test(s) ? Number(s) : null;
}

/** `%G`: `Str:16 Int:16 …`, all seven or null. */
function unaffectedOf(s: string): Record<Ability, number> | null {
  const labelled = new Map<string, number>();
  for (const m of s.matchAll(/([a-z]+): ?([+-]?\d+)(?= |$)/gi)) labelled.set(m[1]!.toLowerCase(), Number(m[2]));
  const out = {} as Record<Ability, number>;
  for (const a of ABILITIES) {
    const n = labelled.get(a);
    if (n === undefined) return null;
    out[a] = n;
  }
  return out;
}

const UNITS: ReadonlyMap<string, number> = new Map(
  [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  ].map((w, n) => [w, n]),
);
const TENS: ReadonlyMap<string, number> = new Map(
  ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'].map((w, n) => [w, (n + 2) * 10]),
);

/** A number in English words ("no", "a" and "an" too), or null. */
export function wordsToNumber(s: string): number | null {
  const w = s.toLowerCase().split(/[\s,-]+/).filter(Boolean);
  if (w.length === 1 && (w[0] === 'no' || w[0] === 'zero')) return 0;
  let thousands = 0;
  /** The part below a thousand. */
  let n = 0;
  for (let i = 0; i < w.length; i++) {
    const x = w[i]!;
    const unit = x === 'a' || x === 'an' ? (i === 0 ? 1 : undefined) : UNITS.get(x);
    const ten = TENS.get(x);
    if (x === 'and') {
      if (i === 0 || i === w.length - 1 || (w[i - 1] !== 'hundred' && w[i - 1] !== 'thousand')) return null;
    } else if (x === 'hundred') {
      if (n === 0 || n >= 100) return null;
      n *= 100;
    } else if (x === 'thousand') {
      if (n === 0 || thousands > 0) return null;
      thousands = n * 1000;
      n = 0;
    } else if (ten !== undefined) {
      if (n % 100 !== 0) return null;
      n += ten;
    } else if (unit) {
      // A teen needs empty tens, a unit an empty unit that no teen took.
      const below = n % 100;
      if (unit >= 10 ? below !== 0 : below % 10 !== 0 || below === 10) return null;
      n += unit;
    } else {
      return null;
    }
  }
  return w.length > 0 ? thousands + n : null;
}

/** `%C`: "ninety-seven pounds". */
function poundsOf(s: string): number | null {
  const m = /^(.+?) pounds?$/i.exec(s);
  return m ? wordsToNumber(m[1]!) : null;
}

/** `%h`: "four feet eleven". */
function heightOf(s: string): InfoAnswer['height'] {
  const m = /^(.+?) (?:feet|foot)(?:,? (?:and )?(.+?)(?: inch(?:es)?)?)?$/i.exec(s);
  if (!m) return null;
  const feet = wordsToNumber(m[1]!);
  const inches = m[2] === undefined ? 0 : wordsToNumber(m[2]);
  return feet !== null && inches !== null && inches < 12 ? { feet, inches } : null;
}

/** `%W`: "eight stone and five pounds", either part alone too. */
function weightOf(s: string): InfoAnswer['weight'] {
  const m = /^(.+?) stones?(?:,? (?:and )?(.+?) pounds?)?$/i.exec(s);
  if (!m) {
    const pounds = poundsOf(s);
    return pounds === null ? null : { stone: 0, pounds };
  }
  const stone = wordsToNumber(m[1]!);
  const pounds = m[2] === undefined ? 0 : wordsToNumber(m[2]);
  return stone !== null && pounds !== null ? { stone, pounds } : null;
}

const COIN = /^(\d{1,3}(?:,\d{3})+|\d+) (?:(gold) coins?|(silver) penn(?:y|ies)|(copper) penn(?:y|ies))$/i;

/** `%r`: "380 gold coins, 5 silver pennies, and 49 copper pennies". A coin not named is 0. */
function purseOf(s: string): InfoAnswer['purse'] {
  const out = { gold: 0, silver: 0, copper: 0 };
  const seen = new Set<string>();
  for (const part of s.split(/,? and |, /)) {
    const m = COIN.exec(part);
    if (!m) return null;
    const coin = (m[2] ?? m[3] ?? m[4])!.toLowerCase() as keyof typeof out;
    if (seen.has(coin)) return null;
    seen.add(coin);
    out[coin] = Number(m[1]!.replaceAll(',', ''));
  }
  return out;
}

/** `%K`: "warlord (19)". */
function warFameOf(s: string): InfoAnswer['warFame'] {
  const m = /^(.+?) ?\((-?\d[\d,]*)\)$/.exec(s);
  return m ? { word: m[1]!, points: Number(m[2]!.replaceAll(',', '')) } : null;
}
