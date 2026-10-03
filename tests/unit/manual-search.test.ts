// Find in the manuals (src/editor/manual-search.ts, ADR 0070): matches in
// the laid-out rows, the next/previous step with wrap-around, and the count.
import { describe, expect, it } from 'vitest';
import { helpLayout } from '../../src/editor/help';
import {
  EMPTY_QUERY,
  type FindQuery,
  findCountText,
  findInLines,
  firstFrom,
  formatCount,
  matchesByLine,
  splitSegs,
  stepMatch,
} from '../../src/editor/manual-search';

const q = (search: string, over: Partial<FindQuery> = {}): FindQuery => ({ ...EMPTY_QUERY, search, ...over });

const LINES = ['An orc arrives.', 'The Orc dies.', '', 'orcs and orc-kin', 'Nothing here'];

describe('findInLines', () => {
  it('finds every match, row by row, case-insensitive by default', () => {
    const r = findInLines(LINES, q('orc'));
    expect(r.valid).toBe(true);
    expect(r.capped).toBe(false);
    expect(r.matches).toEqual([
      { line: 0, from: 3, to: 6 },
      { line: 1, from: 4, to: 7 },
      { line: 3, from: 0, to: 3 },
      { line: 3, from: 9, to: 12 },
    ]);
  });

  it('Case, Word and Regex narrow the matches', () => {
    expect(findInLines(LINES, q('Orc', { caseSensitive: true })).matches).toEqual([{ line: 1, from: 4, to: 7 }]);
    // "orcs" is not the word orc; "orc-kin" is (the hyphen is a boundary).
    expect(findInLines(LINES, q('orc', { wholeWord: true })).matches.map((m) => m.line)).toEqual([0, 1, 3]);
    expect(findInLines(LINES, q('orc', { wholeWord: true })).matches[2]).toEqual({ line: 3, from: 9, to: 12 });
    expect(findInLines(LINES, q('a\\w+s', { regexp: true })).matches).toEqual([{ line: 0, from: 7, to: 14 }]);
    // Without Regex the text is literal.
    expect(findInLines(['a.b axb'], q('a.b')).matches).toEqual([{ line: 0, from: 0, to: 3 }]);
  });

  it('an empty query finds nothing; a bad regex is reported; empty matches are skipped', () => {
    expect(findInLines(LINES, q(''))).toEqual({ valid: true, matches: [], capped: false });
    expect(findInLines(LINES, q('(', { regexp: true })).valid).toBe(false);
    expect(findInLines(['aaa'], q('x*', { regexp: true })).matches).toEqual([]);
    expect(findInLines(['baab'], q('a*', { regexp: true })).matches).toEqual([{ line: 0, from: 1, to: 3 }]);
  });

  it('stops at the cap', () => {
    const r = findInLines(['aaaaa'], q('a'), 3);
    expect(r.matches).toHaveLength(3);
    expect(r.capped).toBe(true);
  });

  it('finds across the segments of a laid-out row (the manual itself)', () => {
    const layout = helpLayout(80);
    const texts = layout.lines.map((l) => l.segs.map((s) => s.text).join(''));
    const r = findInLines(texts, q('#alias'));
    expect(r.matches.length).toBeGreaterThan(3);
    for (const m of r.matches) expect(texts[m.line]!.slice(m.from, m.to).toLowerCase()).toBe('#alias');
  });
});

describe('firstFrom and stepMatch', () => {
  const ms = findInLines(LINES, q('orc')).matches;

  it('firstFrom: the first match at or after a position, wrapping to the first', () => {
    expect(firstFrom(ms, 0)).toBe(0);
    expect(firstFrom(ms, 0, 4)).toBe(1);
    expect(firstFrom(ms, 2)).toBe(2);
    expect(firstFrom(ms, 3, 1)).toBe(3);
    expect(firstFrom(ms, 3, 10)).toBe(0);
    expect(firstFrom(ms, 99)).toBe(0);
    expect(firstFrom([], 0)).toBe(-1);
  });

  it('stepMatch: next and previous wrap around', () => {
    expect(stepMatch(0, 4, 1)).toBe(1);
    expect(stepMatch(3, 4, 1)).toBe(0);
    expect(stepMatch(0, 4, -1)).toBe(3);
    expect(stepMatch(-1, 4, 1)).toBe(0);
    expect(stepMatch(-1, 4, -1)).toBe(3);
    expect(stepMatch(0, 0, 1)).toBe(-1);
  });
});

describe('count text', () => {
  it('shows "n of m", "m matches", "No matches", "Bad regex" or nothing', () => {
    const r = findInLines(LINES, q('orc'));
    expect(findCountText(q('orc'), r, 2)).toEqual({ text: '3 of 4', cls: 'wc-c-body' });
    expect(findCountText(q('orc'), r, -1)).toEqual({ text: '4 matches', cls: 'wc-c-body' });
    expect(findCountText(q('zzz'), findInLines(LINES, q('zzz')), -1)).toEqual({ text: 'No matches', cls: 'wc-c-err' });
    expect(findCountText(q('(', { regexp: true }), findInLines(LINES, q('(', { regexp: true })), -1)).toEqual({
      text: 'Bad regex',
      cls: 'wc-c-err',
    });
    expect(findCountText(q(''), findInLines(LINES, q('')), -1).text).toBe('');
    expect(formatCount(1, 0).text).toBe('1 match');
    expect(formatCount(5, 2, true).text).toBe('2 of 5+');
  });
});

describe('painting', () => {
  it('matchesByLine groups the matches of each row', () => {
    const by = matchesByLine(findInLines(LINES, q('orc')).matches);
    expect([...by.keys()]).toEqual([0, 1, 3]);
    expect(by.get(3)).toHaveLength(2);
  });

  it('splitSegs cuts the segments at the matches, a match across segments included', () => {
    const segs = ['local x', ' = orc', 'ish'];
    const hits = findInLines([segs.join('')], q('orcish')).matches.concat(findInLines([segs.join('')], q('x')).matches);
    hits.sort((a, b) => a.from - b.from);
    const cur = hits.find((h) => h.from === 10)!;
    expect(splitSegs(segs, hits, cur)).toEqual([
      [
        { text: 'local ', hit: 0 },
        { text: 'x', hit: 1 },
      ],
      [
        { text: ' = ', hit: 0 },
        { text: 'orc', hit: 2 },
      ],
      [{ text: 'ish', hit: 2 }],
    ]);
    expect(splitSegs(['abc'], [], null)).toEqual([[{ text: 'abc', hit: 0 }]]);
    expect(splitSegs([''], [], null)).toEqual([[{ text: '', hit: 0 }]]);
  });
});
