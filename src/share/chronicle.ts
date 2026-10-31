// Credits (ADR 0019 "Credits", Inv §7.6): the chronicle of every
// character's deeds, rolled up the screen like end credits. Pure and
// deterministic: the same event always reads the same, because its sentence
// template is picked by a stable hash of (character, run, time, kind).
//
// Shape: an opening line, one chapter per character (the character whose
// first deed is oldest first), each with a header and one sentence per
// death, level-up, PvP kill and achievement (filtered by the Spotlights
// settings: kinds × characters × period, ADR 0110; no log needed), then `The End.` Lines are word-wrapped to the
// column width; an empty string is a blank row. The wording is our own.

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

/** Word-wraps `text` to `width` columns (a longer word is broken). */
export function wrapText(text: string, width: number): string[] {
  const w = Math.max(1, width);
  const out: string[] = [];
  let cur = '';
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > w) {
      if (cur) out.push(cur);
      cur = '';
      out.push(word.slice(0, w));
      word = word.slice(w);
    }
    if (!word) continue;
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= w) cur += ' ' + word;
    else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export interface ChronicleRun {
  meta: RunMeta;
  events: readonly RunEvent[];
}

export interface ChronicleOptions {
  /** Column width in cells (default 60). */
  width?: number;
  /** Now, µs: the period counts back from it (default the clock). */
  nowUs?: number;
}

/**
 * The chronicle as display rows ('' = blank), or [] when no event passes
 * the filters (the frame then shows its empty state).
 */
export function buildChronicle(
  runs: readonly ChronicleRun[],
  filters: SpotlightSettings,
  opts: ChronicleOptions = {},
): string[] {
  const width = opts.width ?? 60;
  const shown = spotlightFilter(filters, opts.nowUs ?? Date.now() * 1000);
  const byChar = new Map<string, Array<{ us: number; text: string }>>();
  for (const r of runs) {
    let level: number | undefined = undefined;
    for (const e of r.events) {
      if (e.type === 'run_start' && e.level !== undefined) level = e.level;
      if (e.type === 'level_up') level = e.level;
      const kind = kindOf(e);
      if (!kind || !shown(kind, r.meta.character, eventAt(e))) continue;
      const text = eventSentence(r.meta.character, r.meta.runId, e, level ?? r.meta.summary?.level);
      if (!text) continue;
      const list = byChar.get(r.meta.character) ?? [];
      list.push({ us: eventAt(e), text });
      byChar.set(r.meta.character, list);
    }
  }
  if (byChar.size === 0) return [];
  const chapters = [...byChar.entries()]
    .map(([name, deeds]) => ({ name, deeds: deeds.sort((a, b) => a.us - b.us) }))
    .sort((a, b) => a.deeds[0]!.us - b.deeds[0]!.us || a.name.localeCompare(b.name));
  const out: string[] = [...wrapText(CHRONICLE_OPENING, width), '', ''];
  for (const ch of chapters) {
    const header = CHAPTER_HEADERS[stableHash(ch.name) % CHAPTER_HEADERS.length]!.replaceAll('{name}', ch.name);
    out.push(...wrapText(header, width), '');
    for (const d of ch.deeds) out.push(...wrapText(d.text, width), '');
    out.push('');
  }
  out.push(CHRONICLE_END);
  return out;
}
