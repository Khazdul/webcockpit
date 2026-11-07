// Stage 7 P1: the export editor's pure model (export-model.ts).
import { describe, expect, it } from 'vitest';
import type { RunMeta } from '../../src/capture/store';
import {
  ITEM_COMMENT,
  ITEM_END,
  ITEM_ENTRY,
  KIND_OUT,
  LOG_MAX_COLS,
  barSummary,
  buildEditorLog,
  buildItems,
  changedComment,
  commentSlot,
  composerTop,
  contentHeight,
  entryAtOrAfter,
  entryPlainRows,
  entryRows,
  entryRangeUs,
  entrySegments,
  fmtCount,
  itemAtRow,
  itemAtY,
  itemHeight,
  itemKey,
  itemTop,
  keyAfterDelete,
  keyItem,
  logCols,
  mapItemAt,
  mapStrip,
  mapThumb,
  pageItem,
  parseSgr,
  revealTop,
  runStyle,
  selectedEntries,
  selectionTitle,
  wrapSpans,
} from '../../src/chrome/frames/export-model';
import type { RunEvent } from '../../src/runs/events';
import { addComment, defaultExportDoc, excludeRange } from '../../src/share/edits';

const T = 1_790_000_000_000_000;
const ts = (s: number) => String(T + s * 1e6).padStart(16, '0');
const meta = { runId: 'Rasta/1' } as RunMeta;

function chain(lines: string[]) {
  return [{ meta, text: lines.join('\n') + '\n' }];
}

describe('export editor log', () => {
  it('keeps inbound lines and commands, drops GMCP, empty Enters and the width commands', () => {
    const log = buildEditorLog(
      chain([
        `${ts(0)} \x1b[32mHello\x1b[0m world`,
        `${ts(1)} \x1bGMCP Char.Vitals {"hp":1}`,
        `${ts(2)} > look`,
        `${ts(3)} > change width all 500`,
        `${ts(4)} > `,
        `${ts(5)} >`,
        `${ts(6)} Second`,
      ]),
    );
    expect(log.ts).toEqual([T, T + 2e6, T + 5e6, T + 6e6]);
    expect(log.raw).toEqual(['\x1b[32mHello\x1b[0m world', 'look', '>', 'Second']);
    expect(log.kind[1]).toBe(KIND_OUT);
    expect([...log.len]).toEqual([11, 6, 1, 6]);
    expect(entryAtOrAfter(log, T + 1)).toBe(1);
    expect(entryAtOrAfter(log, T + 99e6)).toBe(4);
  });

  it('parses SGR into text and style runs', () => {
    expect(parseSgr('plain')).toEqual({ text: 'plain', runs: [] });
    const p = parseSgr('\x1b[1;31mRed\x1b[0m and \x1b[38;5;196mX\x1b[48;2;1;2;3mY\x1b[K\x1b[0m');
    expect(p.text).toBe('Red and XY');
    expect(p.runs[0]).toEqual({ start: 0, end: 3, fg: 1, bold: true });
    expect(p.runs[1]).toMatchObject({ start: 8, end: 9, fg: 196 });
    expect(p.runs[2]!.bg).toBeGreaterThan(0xffffff);
    expect(runStyle({ start: 0, end: 1, fg: 1, bold: true }).cls).toBe('wc-f1 wc-bold');
    expect(runStyle({ start: 0, end: 1, fg: 196 }).color).toBe('#ff0000');
    expect(runStyle({ start: 0, end: 1, inverse: true }).cls).toBe('wc-inv wc-fd wc-bd');
    expect(runStyle({ start: 0, end: 1, bold: true }).cls).toBe('wc-fbd wc-bold');
    expect(runStyle({ start: 0, end: 1, bold: true, inverse: true }).cls).toBe('wc-inv wc-fd wc-bd wc-bold');
  });

  it('wraps entries hard at the width, splitting style runs', () => {
    const log = buildEditorLog(chain([`${ts(0)} ab\x1b[31mcdef\x1b[0mg`, `${ts(1)} > look`]));
    const rows = entrySegments(log, 0, 3);
    expect(rows.map((r) => r.map((s) => s.text).join(''))).toEqual(['abc', 'def', 'g']);
    expect(rows[0]![1]).toMatchObject({ text: 'c', cls: 'wc-f1' });
    expect(rows[1]![0]).toMatchObject({ text: 'def', cls: 'wc-f1' });
    expect(entrySegments(log, 1, 80)[0]).toEqual([
      { text: '> ', cls: 'wc-exp-prefix' },
      { text: 'look', cls: '' },
    ]);
    expect(entryPlainRows(log, 0, 4)).toEqual(['abcd', 'efg']);
    expect(entryRows(0, 80)).toBe(1);
  });

  it('wraps at the last space that fits; a word longer than a row breaks hard', () => {
    const rows = (t: string, w: number): string[] => {
      const sp: number[] = [];
      const n = wrapSpans(t, w, sp);
      const out = Array.from({ length: n }, (_, r) => t.slice(sp[2 * r], sp[2 * r + 1]));
      expect(out.length).toBe(n);
      return out;
    };
    expect(rows('A path leads south.', 10)).toEqual(['A path', 'leads', 'south.']);
    // A space just after a full row breaks there.
    expect(rows('abcde fgh', 5)).toEqual(['abcde', 'fgh']);
    expect(rows('abcdefghij kl', 4)).toEqual(['abcd', 'efgh', 'ij', 'kl']);
    expect(rows('', 8)).toEqual(['']);
    expect(rows('fits', 4)).toEqual(['fits']);
    expect(wrapSpans('one two three', 1000)).toBe(1);
  });

  it('word-wraps the rendered rows and counts the same rows in the items', () => {
    const line = 'The old bridge spans the \x1b[32mHoarwell\x1b[0m here, its three arches worn.';
    const log = buildEditorLog(chain([`${ts(0)} ${line}`, `${ts(1)} > say guarding you`]));
    const segRows = entrySegments(log, 0, 20).map((r) => r.map((s) => s.text).join(''));
    expect(segRows).toEqual(['The old bridge spans', 'the Hoarwell here,', 'its three arches', 'worn.']);
    expect(entrySegments(log, 0, 20)[1]).toContainEqual({ text: 'Hoarwell', cls: 'wc-f2' });
    expect(entryPlainRows(log, 0, 20)).toEqual(segRows);
    expect(entryPlainRows(log, 1, 12)).toEqual(['> say', 'guarding you']);
    const items = buildItems(log, [], 20);
    expect(items.rowStart[1]! - items.rowStart[0]!).toBe(4);
    expect(items.rowStart[2]! - items.rowStart[1]!).toBe(entryPlainRows(log, 1, 20).length);
  });
});

describe('export editor items', () => {
  const log = buildEditorLog(chain([0, 1, 2, 3, 4].map((s) => `${ts(s)} line ${s}`)));

  it('places comments before their anchor (null before the end row) and counts rows', () => {
    let doc = defaultExportDoc('Rasta/1');
    doc = addComment(doc, T + 2e6, 'before two');
    doc = addComment(doc, null, 'x '.repeat(60));
    const items = buildItems(log, doc.comments, 40);
    expect([...items.kind]).toEqual([
      ITEM_ENTRY,
      ITEM_ENTRY,
      ITEM_COMMENT,
      ITEM_ENTRY,
      ITEM_ENTRY,
      ITEM_ENTRY,
      ITEM_COMMENT,
      ITEM_END,
    ]);
    expect(items.commentRows[1]!.length).toBe(4);
    expect(items.commentRows[1]![0]).toMatch(/^## x x/);
    expect(items.totalRows).toBe(5 + 1 + 4 + 1);
    expect(itemAtRow(items, 7)).toBe(6);
    expect(itemAtRow(items, 99)).toBe(7);
    expect(keyItem(items, { entry: 2 })).toBe(3);
    expect(keyItem(items, { comment: 1 })).toBe(6);
    expect(itemKey(items, 7)).toEqual({ end: true });
  });

  it('comment slots: before an entry, after a comment on the same anchor, at the end', () => {
    let doc = defaultExportDoc('Rasta/1');
    doc = addComment(doc, T + 2e6, 'one');
    doc = addComment(doc, T + 2e6, 'two');
    const items = buildItems(log, doc.comments, 80);
    // Items: e0 e1 c0 c1 e2 e3 e4 end.
    expect(commentSlot(doc, log, items, 4)).toEqual({ beforeUs: T + 2e6, slot: Infinity });
    expect(commentSlot(doc, log, items, 2)).toEqual({ beforeUs: T + 2e6, slot: 1 });
    expect(commentSlot(doc, log, items, 7)).toEqual({ beforeUs: null, slot: Infinity });
    const next = addComment(doc, T + 2e6, 'between', 1);
    expect(next.comments.map((c) => c.text)).toEqual(['one', 'between', 'two']);
    expect(changedComment(doc.comments, next.comments)).toBe(1);
    // Deleting comment 0 moves the cursor to what followed it (comment 1 → 0).
    expect(keyAfterDelete(items, 0)).toEqual({ comment: 0 });
    expect(keyAfterDelete(items, 1)).toEqual({ entry: 2 });
    // Above a selection that starts on a comment: before it.
    expect(commentSlot(doc, log, items, 3, true)).toEqual({ beforeUs: T + 2e6, slot: 1 });
    expect(commentSlot(doc, log, items, 2, true)).toEqual({ beforeUs: T + 2e6, slot: 0 });
  });

  it('selection: the entries between two items, comments skipped, as a µs range', () => {
    let doc = defaultExportDoc('Rasta/1');
    doc = addComment(doc, T + 2e6, 'one');
    const items = buildItems(log, doc.comments, 80);
    // Items: e0 e1 c0 e2 e3 e4 end.
    expect(selectedEntries(items, 1, 3)).toEqual([1, 2]);
    expect(selectedEntries(items, 3, 1)).toEqual([1, 2]);
    expect(selectedEntries(items, 2, 2)).toBeNull();
    expect(selectedEntries(items, 2, 6)).toEqual([2, 4]);
    expect(selectedEntries(items, 6, 6)).toBeNull();
    expect(entryRangeUs(log, 1, 2)).toEqual([log.ts[1], log.ts[3]]);
    expect(entryRangeUs(log, 2, 4)).toEqual([log.ts[2], null]);
  });

  it('wraps the log at the columns that fit, within 16 and 120', () => {
    expect(logCols(780, 7.8)).toBe(100);
    expect(logCols(5000, 7.8)).toBe(LOG_MAX_COLS);
    expect(logCols(40, 7.8)).toBe(16);
    expect(logCols(800, 0)).toBe(100);
  });

  it('pages by the viewport; places items in pixels around the inline composer', () => {
    const long = buildEditorLog(chain(Array.from({ length: 100 }, (_, i) => `${ts(i)} line ${i}`)));
    const items = buildItems(long, [], 80);
    expect(pageItem(items, 50, 10, 1)).toBe(60);
    expect(pageItem(items, 5, 10, -1)).toBe(0);
    expect(pageItem(items, 0, 10, -1)).toBe(0);
    // No composer: rows of 21 px after an 8 px padding.
    const g = { lh: 21, pad: 8, comp: null };
    expect(itemTop(items, 3, g)).toBe(8 + 63);
    expect(itemHeight(items, 3, g)).toBe(21);
    expect(contentHeight(items, g)).toBe(8 + 101 * 21);
    expect(itemAtY(items, 8 + 63 + 20, g)).toBe(3);
    expect(itemAtY(items, -5, g)).toBe(0);
    expect(itemAtY(items, 1e9, g)).toBe(100);
    expect(composerTop(items, g)).toBe(-1);
    // A new comment's composer (100 px) before item 10: the items from 10 move down.
    const add = { lh: 21, pad: 8, comp: { at: 10, edit: false, h: 100 } };
    expect(composerTop(items, add)).toBe(8 + 210);
    expect(itemTop(items, 9, add)).toBe(8 + 189);
    expect(itemTop(items, 10, add)).toBe(8 + 210 + 100);
    expect(itemAtY(items, 8 + 210 + 50, add)).toBe(10);
    expect(itemAtY(items, 8 + 210 + 100 + 21 + 5, add)).toBe(11);
    expect(contentHeight(items, add)).toBe(8 + 101 * 21 + 100);
    // Editing a two-row comment: it is replaced by the composer.
    const doc = addComment(defaultExportDoc('Rasta/1'), T + 5e6, 'x '.repeat(50));
    const withC = buildItems(long, doc.comments, 80);
    const ci = withC.commentItem[0]!;
    expect(withC.rowStart[ci + 1]! - withC.rowStart[ci]!).toBe(2);
    const edit = { lh: 21, pad: 8, comp: { at: ci, edit: true, h: 120 } };
    expect(itemHeight(withC, ci, edit)).toBe(120);
    expect(itemTop(withC, ci + 1, edit)).toBe(8 + 5 * 21 + 120);
    expect(itemAtY(withC, 8 + 5 * 21 + 100, edit)).toBe(ci);
    expect(itemAtY(withC, 8 + 5 * 21 + 125, edit)).toBe(ci + 1);
    // Scrolling something into view, moving as little as possible.
    expect(revealTop(0, 200, 300, 21)).toBe(121);
    expect(revealTop(500, 200, 300, 21)).toBe(300);
    expect(revealTop(250, 200, 300, 21)).toBe(250);
    expect(revealTop(0, 200, 300, 21, 4)).toBe(125);
  });

  it('draws the overview strip: merged excluded stretches, comments and event letters; the thumb', () => {
    const long = buildEditorLog(chain(Array.from({ length: 100 }, (_, i) => `${ts(i)} line ${i}`)));
    let doc = defaultExportDoc('Rasta/1');
    doc = excludeRange(doc, T + 90e6, null);
    doc = excludeRange(doc, T + 10e6, T + 20e6);
    doc = addComment(doc, T + 30e6, 'hello');
    const items = buildItems(long, doc.comments, 80);
    const events = [{ type: 'pkill', us: T + 50e6 + 5, logUs: T + 50e6, name: 'X', race: 'y', xpDelta: 1 }] as RunEvent[];
    const m = mapStrip(items, long, doc, events);
    // 102 rows: 100 entries, the comment (before entry 30), the end row.
    expect(m.excluded).toEqual([
      [10 / 102, 20 / 102],
      [91 / 102, 101 / 102],
    ]);
    expect(m.comments).toEqual([30 / 102]);
    expect(m.marks).toEqual([{ letter: 'K', at: 51 / 102 }]);
    expect(mapItemAt(items, 0)).toBe(0);
    expect(mapItemAt(items, 51 / 102 + 0.001)).toBe(51);
    expect(mapItemAt(items, 2)).toBe(101);
    expect(mapThumb(0, 200, 1000)).toEqual([0, 0.2]);
    expect(mapThumb(900, 200, 1000)).toEqual([0.8, 0.2]);
    expect(mapThumb(0, 200, 150)).toEqual([0, 1]);
    expect(mapThumb(0, 10, 100000)).toEqual([0, 0.02]);
  });

  it('writes the summary and the selection heading', () => {
    const sum = { character: 'Rasta', level: 72, date: '2026-09-25', lines: 70098, excluded: 3, comments: 1 };
    expect(barSummary(sum)).toEqual({ who: 'Rasta', line: 'Level 72 · 2026-09-25 · 70,098 lines · 3 excluded · 1 comment' });
    expect(barSummary({ character: 'Rasta', date: 'd', lines: 1, excluded: 0, comments: 2 }).line).toBe(
      'd · 1 line · 0 excluded · 2 comments',
    );
    expect(fmtCount(1234567)).toBe('1,234,567');
    expect(selectionTitle({ selected: 4 })).toBe('Selection · 4 lines');
    expect(selectionTitle({ selected: 1 })).toBe('Selection · 1 line');
    expect(selectionTitle({ entry: 11 })).toBe('Line · 12');
    expect(selectionTitle({ comment: true })).toBe('Comment');
    expect(selectionTitle({ end: true })).toBe('End of log');
  });
});

describe('export editor on a 5 h chain', () => {
  it('reads 100 000 lines and rebuilds the items and map quickly', () => {
    const lines: string[] = [];
    for (let i = 0; i < 100_000; i++) {
      lines.push(i % 7 === 0 ? `${ts(i / 5)} > kill orc` : `${ts(i / 5)} \x1b[32mA line of game text number ${i}\x1b[0m`);
    }
    const text = chain(lines);
    const t0 = performance.now();
    const big = buildEditorLog(text);
    let doc = defaultExportDoc('Rasta/1');
    doc = excludeRange(doc, T + 1000e6, null);
    doc = addComment(doc, T + 500e6, 'hello');
    const items = buildItems(big, doc.comments, 100);
    mapStrip(items, big, doc, []);
    expect(big.ts.length).toBe(100_000);
    expect(items.count).toBe(100_002);
    expect(performance.now() - t0).toBeLessThan(2000);
    // An edit's rebuild (items + map) alone.
    const t1 = performance.now();
    buildItems(big, addComment(doc, T + 600e6, 'two').comments, 100);
    mapStrip(items, big, doc, []);
    expect(performance.now() - t1).toBeLessThan(300);
  });
});
