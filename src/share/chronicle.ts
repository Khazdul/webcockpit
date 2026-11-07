// Credits (ADR 0019 "Credits", ADR 0132, Inv §7.6): the chronicle of every
// character's deeds, told as a book (`chronicleBook`, Credits' pages). Pure
// and deterministic: the same event always reads the same, because its
// sentence template is picked by a stable hash of (character, run, time,
// kind).
//
// Shape: an opening line, one chapter per character (the character whose
// first deed is oldest first), each with a header and one sentence per
// death, level-up, PvP kill and achievement (filtered by the Spotlights
// settings: kinds × characters × period, ADR 0110; no log needed), then
// `The End.` The wording is our own. (The rolled, word-wrapped
// `buildChronicle` of the old Credits is gone, stage 47 wave 3.)

import type { RunMeta } from '../capture/store';
import type { RunEvent } from '../runs/events';
import type { SpotlightSettings } from '../settings';
import { type SpotlightKind, eventAt, spotlightFilter } from './spotlights';

export const CHRONICLE_OPENING = 'Here the scribes have set down, as well as memory allows, the deeds of your companions.';
export const CHRONICLE_END = 'The End.';

/** Chapter headers; `{name}` is the character. */
export const CHAPTER_HEADERS: readonly string[] = [
  'The Tale of {name}',
  'Concerning {name}',
  'Of {name} and the Long Road',
  'How {name} Went Out Into the World',
  'The Lay of {name}, Mostly True',
  'The Deeds of {name}, As Far As They Are Known',
  'Of {name}, and Things Better Left Unsung',
];

/**
 * Sentences per kind; `{date}` is `On the first of May, 2026`, `{victim}`
 * the PvP victim (`*Name the Race*`), `{level}` a level, `{deed}` an
 * achievement, `{atlevel}` ` at level N` or ''.
 */
export const TEMPLATES: Readonly<Record<SpotlightKind, readonly string[]>> = {
  pkill: [
    '{date} you met {victim} upon the road, and {victim} walked no further.',
    '{date} {victim} crossed your path, and there the tale of {victim} ends.',
    '{date} you sent {victim} on the long walk to the halls of waiting.',
    '{date} {victim} learned, briefly, what it costs to cross you.',
    '{date} a song was made of how {victim} fell before you. It was short.',
  ],
  death: [
    '{date} you fell{atlevel}, and the world went grey for a while.',
    '{date} your light went out{atlevel}, though not for ever.',
    '{date} you were laid low{atlevel}, and the scribes put down their pens.',
    '{date} death found you{atlevel}, but you did not care to stay.',
    '{date} you walked the grey paths{atlevel}, and came back somewhat lighter.',
  ],
  level: [
    '{date} you grew in strength and reached level {level}.',
    '{date} the long toil told at last, and you became level {level}.',
    '{date} you climbed to level {level}, and the road seemed shorter.',
    '{date} word went round the inns that you had reached level {level}.',
    '{date} you stood a little taller, being now of level {level}.',
  ],
  achievement: [
    '{date} you won renown: {deed}.',
    '{date} it was written of you: {deed}.',
    '{date} came a deed worth the telling: {deed}.',
    '{date} the chroniclers noted, with some surprise: {deed}.',
    '{date} you did a thing long remembered: {deed}.',
  ],
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
  'twenty-first',
  'twenty-second',
  'twenty-third',
  'twenty-fourth',
  'twenty-fifth',
  'twenty-sixth',
  'twenty-seventh',
  'twenty-eighth',
  'twenty-ninth',
  'thirtieth',
  'thirty-first',
];

/** `On the first of May, 2026` (local date). */
export function datePhrase(us: number): string {
  const d = new Date(us / 1000);
  return `On the ${ORDINALS[d.getDate() - 1]} of ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

/** FNV-1a, 32 bit: a stable hash (the same on every machine and run). */
export function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function kindOf(e: RunEvent): SpotlightKind | null {
  if (e.type === 'pkill') return 'pkill';
  if (e.type === 'char_death') return 'death';
  if (e.type === 'level_up') return 'level';
  if (e.type === 'achievement') return 'achievement';
  return null;
}

/** The sentence of one event (stable per character, run, time and kind). */
export function eventSentence(character: string, runId: string, e: RunEvent, level?: number): string | null {
  const kind = kindOf(e);
  if (!kind) return null;
  const us = eventAt(e);
  const list = TEMPLATES[kind];
  const t = list[stableHash(`${character}|${runId}|${us}|${kind}`) % list.length]!;
  let victim = '';
  let lvl = '';
  let deed = '';
  let atlevel = '';
  if (e.type === 'pkill') victim = '*' + (e.race ? `${e.name} ${e.race}` : e.name) + '*';
  else if (e.type === 'level_up') lvl = String(e.level);
  else if (e.type === 'achievement') deed = e.name.trim().replace(/[.!]+$/, '');
  else if (e.type === 'char_death') {
    const l = e.level ?? level;
    if (l !== undefined) atlevel = ` at level ${l}`;
  }
  return t
    .replaceAll('{date}', datePhrase(us))
    .replaceAll('{victim}', victim)
    .replaceAll('{level}', lvl)
    .replaceAll('{deed}', deed)
    .replaceAll('{atlevel}', atlevel);
}

export interface ChronicleRun {
  meta: RunMeta;
  events: readonly RunEvent[];
}

// ------------------------------------------------------------ the book (stage 47, ADR 0132)

/** One deed of the book: its date phrase (set in small caps) and the rest of its sentence. */
export interface BookDeed {
  /** When it happened, µs. */
  us: number;
  /** `On the first of May, 2026` (every template starts with `{date}`). */
  date: string;
  /** The sentence after the date phrase (starts with its space: ` you fell …`). */
  rest: string;
  kind: SpotlightKind;
}

/** One character's chapter: the header split around the name for the title page. */
export interface BookChapter {
  name: string;
  /** The whole header (`The Lay of Rasta, Mostly True`). */
  header: string;
  /** The header's words before the name (`The Lay of`; may be ''). */
  pre: string;
  /** The header's words after the name (`, Mostly True`, `and the Long Road`; may be ''). */
  post: string;
  deeds: BookDeed[];
}

/** The chronicle as structure (Credits' book). */
export interface ChronicleBook {
  opening: string;
  chapters: BookChapter[];
  end: string;
}

/**
 * The chronicle as a book: a chapter per character (oldest first deed
 * first), each deed its event's sentence in time order, unwrapped and
 * split for typesetting, or null when no event passes the filters.
 */
export function chronicleBook(
  runs: readonly ChronicleRun[],
  filters: SpotlightSettings,
  opts: { nowUs?: number } = {},
): ChronicleBook | null {
  const shown = spotlightFilter(filters, opts.nowUs ?? Date.now() * 1000);
  const byChar = new Map<string, BookDeed[]>();
  for (const r of runs) {
    let level: number | undefined = undefined;
    for (const e of r.events) {
      if (e.type === 'run_start' && e.level !== undefined) level = e.level;
      if (e.type === 'level_up') level = e.level;
      const kind = kindOf(e);
      if (!kind || !shown(kind, r.meta.character, eventAt(e))) continue;
      const text = eventSentence(r.meta.character, r.meta.runId, e, level ?? r.meta.summary?.level);
      if (!text) continue;
      const us = eventAt(e);
      const phrase = datePhrase(us);
      const date = text.startsWith(phrase) ? phrase : '';
      const list = byChar.get(r.meta.character) ?? [];
      list.push({ us, date, rest: text.slice(date.length), kind });
      byChar.set(r.meta.character, list);
    }
  }
  if (byChar.size === 0) return null;
  const chapters = [...byChar.entries()]
    .map(([name, deeds]) => ({ name, deeds: deeds.sort((a, b) => a.us - b.us) }))
    .sort((a, b) => a.deeds[0]!.us - b.deeds[0]!.us || a.name.localeCompare(b.name))
    .map(({ name, deeds }): BookChapter => {
      // Split the template, not the header: a name may be a word of it (`Tale`).
      const tpl = CHAPTER_HEADERS[stableHash(name) % CHAPTER_HEADERS.length]!;
      const at = tpl.indexOf('{name}');
      return {
        name,
        header: tpl.replaceAll('{name}', name),
        pre: tpl.slice(0, at).trim(),
        post: tpl.slice(at + '{name}'.length).trim(),
        deeds,
      };
    });
  return { opening: CHRONICLE_OPENING, chapters, end: CHRONICLE_END };
}
