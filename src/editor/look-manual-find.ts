// Find in the lantern manual (stage 42, ADR 0127): the pure part of
// `LookManual` (look-manual.tsx). Package 42e owns this file.
//
// The manual is drawn as blocks: one element per heading, syntax line,
// paragraph, list item, label, parameter, example note and example line
// (`manualBlocks`). A block's text is exactly the text the reader draws for
// it (links and colours are spans inside it, the text unchanged), so a
// match (section, block, from, to) maps straight onto the block's text
// nodes. A match lies within one block, never across two.
//
// The query and its toggles are the buffer search's (`FindQuery`,
// manual-search.ts: Case, Word, Regex); the count text is the panels' ("3
// of 12", "12 matches", "No matches", "Bad regex"), at most `cap` matches
// ("1000+").

import type { HelpSection } from './help';
import { type FindQuery, findCountText, findInLines } from './manual-search';

/** Matches kept at most by the manual's find. */
export const SECTION_MATCH_MAX = 1000;

/**
 * What a block is: `heading` the section's title; `syntax` one syntax
 * line; `para` a paragraph; `item` a `- ` list item (without the dash);
 * `label` "Parameters" or "Returns"; `param` one parameter (`name (type):
 * text`); `note` the line above an example; `code` one line of an example.
 */
export type ManualBlockKind = 'heading' | 'syntax' | 'para' | 'item' | 'label' | 'param' | 'note' | 'code';

export interface ManualBlock {
  kind: ManualBlockKind;
  /** The text the reader draws for the block (what find searches). */
  text: string;
  /** `code`: the example's index in the section and its language. */
  ex?: number;
  lang?: 'tt' | 'lua';
}

/** One match: section `section`, its block `block`, text `from`..`to` (UTF-16, end exclusive). */
export interface SectionMatch {
  section: number;
  block: number;
  from: number;
  to: number;
}

export interface SectionFindResult {
  /** False: the regular expression does not compile. */
  valid: boolean;
  matches: SectionMatch[];
  /** True when the search stopped at `cap` matches. */
  capped: boolean;
}

/** The find query kept across opens of a manual (the host keeps the object). */
export interface FindMemory {
  query: FindQuery;
}

const PARAMS = 'Parameters:';
const RETURNS = 'Returns: ';

const cache = new WeakMap<HelpSection, ManualBlock[]>();

/**
 * The blocks of a section, in reading order: the heading, the syntax
 * lines, the text (paragraphs, `- ` items; a "Parameters:" line becomes
 * the label "Parameters" and its items parameters; "Returns: x" the label
 * "Returns" and the paragraph x), then each example's note and lines.
 * Cached per section object.
 */
export function manualBlocks(s: HelpSection): ManualBlock[] {
  const hit = cache.get(s);
  if (hit) return hit;
  const out: ManualBlock[] = [{ kind: 'heading', text: s.heading }];
  for (const l of s.syntax ?? []) out.push({ kind: 'syntax', text: l });
  let params = false;
  for (const t of s.text) {
    if (t === PARAMS) {
      out.push({ kind: 'label', text: 'Parameters' });
      params = true;
      continue;
    }
    if (t.startsWith('- ')) {
      out.push({ kind: params ? 'param' : 'item', text: t.slice(2) });
      continue;
    }
    params = false;
    if (t.startsWith(RETURNS)) {
      out.push({ kind: 'label', text: 'Returns' });
      out.push({ kind: 'para', text: t.slice(RETURNS.length) });
      continue;
    }
    out.push({ kind: 'para', text: t });
  }
  (s.examples ?? []).forEach((x, ex) => {
    if (x.note) out.push({ kind: 'note', text: x.note });
    for (const line of x.code.split('\n')) out.push({ kind: 'code', text: line, ex, lang: x.lang ?? 'tt' });
  });
  cache.set(s, out);
  return out;
}

/** The searchable texts of a section, in reading order (the blocks' texts). */
export function sectionBlocks(s: HelpSection): string[] {
  return manualBlocks(s).map((b) => b.text);
}

/** Every match of `q` in `sections`, at most `cap`. */
export function findInSections(sections: readonly HelpSection[], q: FindQuery, cap = SECTION_MATCH_MAX): SectionFindResult {
  if (!q.search) return { valid: true, matches: [], capped: false };
  const matches: SectionMatch[] = [];
  for (let section = 0; section < sections.length; section++) {
    const r = findInLines(sectionBlocks(sections[section]!), q, cap - matches.length);
    if (!r.valid) return { valid: false, matches: [], capped: false };
    for (const m of r.matches) matches.push({ section, block: m.line, from: m.from, to: m.to });
    if (matches.length >= cap) return { valid: true, matches, capped: true };
  }
  return { valid: true, matches, capped: false };
}

/** The index of the first match in section `section` or after it, wrapping to the first; -1 when there are none. */
export function firstInSection(matches: readonly SectionMatch[], section: number): number {
  if (matches.length === 0) return -1;
  let lo = 0;
  let hi = matches.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (matches[mid]!.section < section) lo = mid + 1;
    else hi = mid;
  }
  return lo < matches.length ? lo : 0;
}

/** The count beside the field, with its colour class (as the panels show it). */
export function sectionCountText(q: FindQuery, r: SectionFindResult, cur: number): { text: string; cls: string } {
  return findCountText(q, { valid: r.valid, matches: r.matches.map((m) => ({ line: m.section, from: m.from, to: m.to })), capped: r.capped }, cur);
}

/** The section's matches by block (for drawing `<mark>`s where the Highlight API is missing). */
export function matchesByBlock(matches: readonly SectionMatch[]): Map<number, Map<number, SectionMatch[]>> {
  const out = new Map<number, Map<number, SectionMatch[]>>();
  for (const m of matches) {
    let s = out.get(m.section);
    if (!s) out.set(m.section, (s = new Map()));
    const b = s.get(m.block);
    if (b) b.push(m);
    else s.set(m.block, [m]);
  }
  return out;
}
