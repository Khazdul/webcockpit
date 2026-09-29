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
  excludeFrom,
  excludedCount,
  exportFileName,
  isExcluded,
  mergeRanges,
  normalizeExportDoc,
  sanitizeFileName,
  setTitle,
  stopExcluding,
  toggleFormat,
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
    expect(toggleFormat(d0()).format).toBe('text');
    expect(toggleFormat(toggleFormat(d0())).format).toBe('html');
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
  it('excludes from here to the end, or to the end of the next range (merging)', () => {
    let d = excludeFrom(d0(), 50);
    expect(d.excludes).toEqual([[50, null]]);
    d = excludeFrom(d, 20);
    expect(d.excludes).toEqual([[20, null]]);
    expect(excludeFrom(d, 30)).toBe(d); // already excluded: no-op
    let e = { ...d0(), excludes: [[40, 60]] as ExportDoc['excludes'] };
    e = excludeFrom(e, 20);
    expect(e.excludes).toEqual([[20, 60]]);
    expect(excludedCount(e, KEYS)).toBe(4);
    expect(isExcluded(e, 60)).toBe(false);
    expect(isExcluded(e, 20)).toBe(true);
  });

  it('stops excluding: the range ends above the cursor; on its first line it goes', () => {
    const d = { ...d0(), excludes: [[20, 60]] as ExportDoc['excludes'] };
    expect(stopExcluding(d, 40).excludes).toEqual([[20, 40]]);
    expect(stopExcluding(d, 20).excludes).toEqual([]);
    expect(stopExcluding(d, 70)).toBe(d);
    // A range whose start is not an entry: with the keys, the first entry in it removes it.
    const e = { ...d0(), excludes: [[15, null]] as ExportDoc['excludes'] };
    expect(stopExcluding(e, 20, KEYS).excludes).toEqual([]);
    expect(stopExcluding(e, 20).excludes).toEqual([[15, 20]]);
    expect(stopExcluding(e, 40, KEYS).excludes).toEqual([[15, 40]]);
    expect(excludedCount(e, KEYS)).toBe(6);
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
