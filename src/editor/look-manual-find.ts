// Find in the lantern manual (stage 42, ADR 0127): pure helpers over the
// manual's sections, for `LookManual` (look-manual.tsx). Package 42e owns
// this file.
//
// The query and its toggles are the buffer search's (`FindQuery`,
// manual-search.ts); the count text is the panels' ("3 of 12", "12
// matches", "No matches", "Bad regex"), at most `cap` matches ("1000+").
//
// 42-0 stub: a plain search over each section's text blocks; 42e decides
// the blocks (what the reader marks) and the final shape.

import type { HelpSection } from './help';
import { type FindQuery, findCountText, findInLines } from './manual-search';

/** Matches kept at most by the manual's find. */
export const SECTION_MATCH_MAX = 1000;

/** One match: section `section`, its text block `block`, text `from`..`to` (UTF-16, end exclusive). */
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

/** The searchable text blocks of a section, in reading order (42-0 stub: heading, syntax, text, examples). */
export function sectionBlocks(s: HelpSection): string[] {
  return [s.heading, ...(s.syntax ?? []), ...s.text, ...(s.examples ?? []).map((x) => x.code)];
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

/** The count beside the field, with its colour class (as the panels show it). */
export function sectionCountText(q: FindQuery, r: SectionFindResult, cur: number): { text: string; cls: string } {
  return findCountText(q, { valid: r.valid, matches: r.matches.map((m) => ({ line: m.section, from: m.from, to: m.to })), capped: r.capped }, cur);
}
