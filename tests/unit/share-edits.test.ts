// The export doc model and its edit ops (ADR 0019 "Export doc", Inv §7.7).
import { describe, expect, it } from 'vitest';
import {
  COMMENT_MAX,
  type ExportDoc,
  addComment,
  collapseComment,
  commentHoldMs,
  commentLines,
  defaultExportDoc,
  defaultTitle,
  deleteComment,
  editComment,
  excludeRange,
  excludedBetween,
  excludedCount,
  exportFileName,
  isExcluded,
  mergeRanges,
  normalizeExportDoc,
  sanitizeFileName,
  includeRange,
  setFormat,
  setTitle,
} from '../../src/share/edits';

const d0 = (): ExportDoc => defaultExportDoc('Rasta/2026-09-26T21-00-00');
const KEYS = [10, 20, 30, 40, 50, 60, 70];

describe('export doc defaults and names', () => {
  it('has the documented defaults', () => {
    expect(d0()).toEqual({ sessionId: 'Rasta/2026-09-26T21-00-00', schema: 1, title: '', format: 'html', excludes: [], comments: [] });
  });

  it('builds the default title and file names', () => {
    const start = new Date(2026, 8, 26, 21, 0, 5).getTime() * 1000;
    expect(defaultTitle('Rasta', start)).toBe('mume-Rasta-2026-09-26T21-00-05');
    expect(exportFileName(d0(), 'Rasta', start)).toBe('mume-Rasta-2026-09-26T21-00-05.html');
    expect(exportFileName({ ...d0(), format: 'text', title: 'DT fight: 3/4' }, 'Rasta', start)).toBe('DT fight- 3-4.txt');
    expect(sanitizeFileName('a\\b/c:d*e?f"g<h>i|j\x01')).toBe('a-b-c-d-e-f-g-h-i-j-');
    expect(sanitizeFileName('..hidden')).toBe('-hidden');
    expect(sanitizeFileName('   ')).toBe('mume');
    expect(setTitle(d0(), '  a   b ').title).toBe('a b');
    expect(setFormat(d0(), 'text').format).toBe('text');
    expect(setFormat(d0(), 'html')).toEqual(d0());
    const t = setFormat(d0(), 'text');
    expect(setFormat(t, 'text')).toBe(t);
  });

  it('normalises stored data', () => {
    expect(normalizeExportDoc(null)).toBeNull();
    expect(normalizeExportDoc({ title: 'x' })).toBeNull();
    const d = normalizeExportDoc({
      sessionId: 'X/1',
      format: 'pdf',
      excludes: [[30, 40], 'junk', [5, 3], [1, 2], [40, null], [2, 3]],
      comments: [{ beforeUs: null, text: ' end ' }, { beforeUs: 5, text: 'a\n b' }, { beforeUs: 'x', text: 'no' }, { beforeUs: 5, text: '  ' }],
    })!;
    expect(d.format).toBe('html');
    expect(d.excludes).toEqual([
      [1, 3],
      [30, null],
    ]);
    expect(d.comments).toEqual([
      { beforeUs: 5, text: 'a b' },
      { beforeUs: null, text: 'end' },
    ]);
    expect(mergeRanges([[5, 10], [0, 5], [20, 30], [25, 26]])).toEqual([
      [0, 10],
      [20, 30],
    ]);
  });
});

describe('exclusions', () => {
  const ex = (r: ExportDoc['excludes']): ExportDoc => ({ ...d0(), excludes: r });

  it('excludes a range, merging with touching and overlapping ranges', () => {
    let d = excludeRange(d0(), 30, 50);
    expect(d.excludes).toEqual([[30, 50]]);
    d = excludeRange(d, 50, 60);
    expect(d.excludes).toEqual([[30, 60]]);
    d = excludeRange(d, 10, 20);
    expect(d.excludes).toEqual([
      [10, 20],
      [30, 60],
    ]);
    d = excludeRange(d, 15, 40);
    expect(d.excludes).toEqual([[10, 60]]);
    expect(excludeRange(d, 20, 50)).toBe(d); // already excluded: no-op
    expect(excludeRange(d, 70, 70)).toBe(d); // empty: no-op
    // To the end of the log.
    d = excludeRange(d, 70, null);
    expect(d.excludes).toEqual([
      [10, 60],
      [70, null],
    ]);
    expect(excludeRange(d, 40, null).excludes).toEqual([[10, null]]);
    expect(excludedCount(d, KEYS)).toBe(6);
    expect(isExcluded(d, 60)).toBe(false);
    expect(d0().excludes).toEqual([]); // ops never mutate
  });

  it('includes a range: trims, splits and removes ranges', () => {
    const d = ex([[20, 60]]);
    expect(includeRange(d, 20, 60).excludes).toEqual([]);
    expect(includeRange(d, 30, 50).excludes).toEqual([
      [20, 30],
      [50, 60],
    ]);
    expect(includeRange(d, 10, 40).excludes).toEqual([[40, 60]]);
    expect(includeRange(d, 50, null).excludes).toEqual([[20, 50]]);
    expect(includeRange(d, 60, 70)).toBe(d); // nothing excluded there: no-op
    // An open range is split; the tail stays open.
    expect(includeRange(ex([[10, null]]), 30, 40).excludes).toEqual([
      [10, 30],
      [40, null],
    ]);
    // Across several ranges.
    expect(
      includeRange(
        ex([
          [10, 20],
          [30, 40],
          [50, null],
        ]),
        15,
        55,
      ).excludes,
    ).toEqual([
      [10, 15],
      [55, null],
    ]);
    // With the keys, a bounded piece without an entry goes.
    expect(includeRange(ex([[15, 45]]), 20, 40, KEYS).excludes).toEqual([[40, 45]]);
    expect(includeRange(ex([[15, 45]]), 20, 40).excludes).toEqual([
      [15, 20],
      [40, 45],
    ]);
  });

  it('counts the excluded entries in an index range', () => {
    const d = ex([
      [20, 40],
      [60, null],
    ]);
    // KEYS: 10 20 30 40 50 60 70 → excluded: 20 30 60 70.
    expect(excludedBetween(d, KEYS, 0, 6)).toBe(4);
    expect(excludedBetween(d, KEYS, 1, 2)).toBe(2);
    expect(excludedBetween(d, KEYS, 2, 4)).toBe(1);
    expect(excludedBetween(d, KEYS, 3, 4)).toBe(0);
    expect(excludedBetween(d, KEYS, 5, 6)).toBe(2);
    expect(excludedBetween(d, KEYS, 4, 3)).toBe(0);
  });
});

describe('comments', () => {
  it('collapses, caps and wraps at 80 columns with the ## prefix', () => {
    expect(collapseComment('  a \n\t b  ')).toBe('a b');
    expect(collapseComment('x'.repeat(700))).toHaveLength(COMMENT_MAX);
    const text = 'This log happened in DT yesterday. ' + 'Me and my group went in and it went badly for everyone involved. '.repeat(2);
    const lines = commentLines(text);
    expect(lines.every((l) => l.startsWith('## ') && l.length <= 80)).toBe(true);
    expect(lines.map((l) => l.slice(3)).join(' ')).toBe(collapseComment(text));
    expect(lines.length).toBe(3);
    expect(commentLines('y'.repeat(100))).toEqual(['## ' + 'y'.repeat(77), '## ' + 'y'.repeat(23)]);
    expect(commentLines('')).toEqual(['## ']);
  });

  it('holds for clamp(2 + len/15, 5, 20) seconds', () => {
    expect(commentHoldMs('short')).toBe(2500);
    expect(commentHoldMs('x'.repeat(90))).toBe(4000);
    expect(commentHoldMs('x'.repeat(600))).toBe(10000);
  });

  it('adds before an entry in anchor order, edits and deletes', () => {
    let d = addComment(d0(), 40, 'second');
    d = addComment(d, null, 'last');
    d = addComment(d, 10, ' first ');
    d = addComment(d, 40, 'before second', 0);
    d = addComment(d, 40, 'after second');
    expect(d.comments).toEqual([
      { beforeUs: 10, text: 'first' },
      { beforeUs: 40, text: 'before second' },
      { beforeUs: 40, text: 'second' },
      { beforeUs: 40, text: 'after second' },
      { beforeUs: null, text: 'last' },
    ]);
    expect(addComment(d, 5, '   ')).toBe(d);
    const e = editComment(d, 2, ' changed\ntext ');
    expect(e.comments[2]).toEqual({ beforeUs: 40, text: 'changed text' });
    expect(d.comments[2]!.text).toBe('second'); // ops never mutate
    expect(editComment(e, 2, '').comments).toHaveLength(4);
    expect(deleteComment(e, 0).comments[0]!.text).toBe('before second');
    expect(deleteComment(e, 9)).toBe(e);
  });
});
