// Find in the manuals (ADR 0070): the pure part. The manual is laid out
// as rows of text (help.ts `HelpLayout`); a match lies within one row,
// across its segments (syntax colours) but not across wrapped rows. The
// panel (manual-find.tsx) and the highlighting (manual-view.tsx) use it.
//
// The query has the toggles of the buffer search (search.ts): Case, Word,
// Regex. Offsets are UTF-16 indexes into a row's text (its segments
// joined, without the indent), so they slice the segments directly.

// ------------------------------------------------- shared with search.ts

/** The panel's top rule (clipped to the width). Shared by the buffer search (search.ts) and the manual's (manual-find.tsx). */
export const RULE = '─'.repeat(400);
/** The hint at the right of the panel's last row. */
export const FIND_HINT = 'Enter Next · Shift+Enter Prev · ESC Close';

export type Toggle = 'caseSensitive' | 'wholeWord' | 'regexp';

/** The query toggles, their labels and Alt hotkeys. */
export const TOGGLES: ReadonlyArray<{ key: Toggle; label: string; hotkey: string; title: string }> = [
  { key: 'caseSensitive', label: 'Case', hotkey: 'c', title: 'Match case (Alt+C)' },
  { key: 'wholeWord', label: 'Word', hotkey: 'w', title: 'Whole words (Alt+W)' },
  { key: 'regexp', label: 'Regex', hotkey: 'r', title: 'Regular expression (Alt+R)' },
];

/** The query: the text and the three toggles of the buffer search. */
export interface FindQuery {
  search: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

export const EMPTY_QUERY: FindQuery = { search: '', caseSensitive: false, wholeWord: false, regexp: false };

/** One match: row `line`, text `from`..`to` (UTF-16, end exclusive). */
export interface FindMatch {
  line: number;
  from: number;
  to: number;
}

export interface FindResult {
  /** False: the regular expression does not compile. */
  valid: boolean;
  matches: FindMatch[];
  /** True when the search stopped at `max` matches. */
  capped: boolean;
}

/** Matches kept at most (a one-letter search in a long manual stays cheap). */
export const MATCH_MAX = 10000;

const WORD = /[\p{L}\p{N}_]/u;
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The query as a global RegExp; null when it is empty or does not compile. */
export function compileQuery(q: FindQuery): RegExp | null {
  if (!q.search) return null;
  try {
    return new RegExp(q.regexp ? q.search : escapeRe(q.search), q.caseSensitive ? 'g' : 'gi');
  } catch {
    return null;
  }
}

/** The character before offset `i` (a whole code point), or ''. */
function charBefore(s: string, i: number): string {
  if (i <= 0) return '';
  const c = s.charCodeAt(i - 1);
  return c >= 0xdc00 && c <= 0xdfff && i >= 2 ? s.slice(i - 2, i) : s[i - 1]!;
}

/** The character at offset `i` (a whole code point), or ''. */
const charAt = (s: string, i: number): string => (i < s.length ? String.fromCodePoint(s.codePointAt(i)!) : '');

/** Every match of `q` in `lines`, row by row, left to right. Empty matches are skipped. */
export function findInLines(lines: readonly string[], q: FindQuery, max = MATCH_MAX): FindResult {
  if (!q.search) return { valid: true, matches: [], capped: false };
  const re = compileQuery(q);
  if (!re) return { valid: false, matches: [], capped: false };
  const matches: FindMatch[] = [];
  for (let line = 0; line < lines.length; line++) {
    const s = lines[line]!;
    re.lastIndex = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const from = m.index;
      const to = from + m[0].length;
      if (to === from) {
        re.lastIndex = from + 1;
        continue;
      }
      if (q.wholeWord && (WORD.test(charBefore(s, from)) || WORD.test(charAt(s, to)))) {
        re.lastIndex = from + 1;
        continue;
      }
      matches.push({ line, from, to });
      if (matches.length >= max) return { valid: true, matches, capped: true };
    }
  }
  return { valid: true, matches, capped: false };
}

/**
 * The index of the first match at or after row `line`, offset `ch`,
 * wrapping to the first match; -1 when there are none.
 */
export function firstFrom(matches: readonly FindMatch[], line: number, ch = 0): number {
  if (matches.length === 0) return -1;
  let lo = 0;
  let hi = matches.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const m = matches[mid]!;
    if (m.line < line || (m.line === line && m.from < ch)) lo = mid + 1;
    else hi = mid;
  }
  return lo < matches.length ? lo : 0;
}

/** The next (`dir` 1) or previous (-1) match after `cur`, wrapping; -1 when there are none. */
export function stepMatch(cur: number, n: number, dir: 1 | -1): number {
  if (n === 0) return -1;
  if (cur < 0 || cur >= n) return dir > 0 ? 0 : n - 1;
  return (cur + dir + n) % n;
}

/**
 * The count beside the field, with its colour class: "3 of 12", "12
 * matches" (none current), "No matches", "Bad regex", or nothing.
 */
export function findCountText(q: FindQuery, r: FindResult, cur: number): { text: string; cls: string } {
  if (!q.search) return { text: '', cls: 'wc-c-hint' };
  if (!r.valid) return { text: 'Bad regex', cls: 'wc-c-err' };
  return formatCount(r.matches.length, cur >= 0 && cur < r.matches.length ? cur + 1 : 0, r.capped);
}

/** The match count as the panels show it: `at` is 1-based, 0 for none current. */
export function formatCount(n: number, at: number, capped = false): { text: string; cls: string } {
  if (n === 0) return { text: 'No matches', cls: 'wc-c-err' };
  const total = capped ? `${n}+` : `${n}`;
  if (at) return { text: `${at} of ${total}`, cls: 'wc-c-body' };
  return { text: `${total} match${n === 1 && !capped ? '' : 'es'}`, cls: 'wc-c-body' };
}

/** The matches of each row, by row (for painting the rows). */
export function matchesByLine(matches: readonly FindMatch[]): Map<number, FindMatch[]> {
  const out = new Map<number, FindMatch[]>();
  for (const m of matches) {
    const l = out.get(m.line);
    if (l) l.push(m);
    else out.set(m.line, [m]);
  }
  return out;
}

/** A piece of a row's segment: `hit` 0 plain, 1 a match, 2 the current match. */
export interface SegPiece {
  text: string;
  hit: 0 | 1 | 2;
}

/**
 * Splits the segments of a row at its matches. `segs` are the segments'
 * texts in order; the result has one array of pieces per segment.
 */
export function splitSegs(segs: readonly string[], hits: readonly FindMatch[], current: FindMatch | null): SegPiece[][] {
  const out: SegPiece[][] = [];
  let base = 0;
  for (const text of segs) {
    const pieces: SegPiece[] = [];
    const end = base + text.length;
    let at = base;
    for (const h of hits) {
      if (h.to <= at || h.from >= end) continue;
      const from = Math.max(at, h.from);
      const to = Math.min(end, h.to);
      if (from > at) pieces.push({ text: text.slice(at - base, from - base), hit: 0 });
      pieces.push({ text: text.slice(from - base, to - base), hit: h === current ? 2 : 1 });
      at = to;
    }
    if (at < end || pieces.length === 0) pieces.push({ text: text.slice(at - base), hit: 0 });
    out.push(pieces);
    base = end;
  }
  return out;
}
