// Stage 7 P1: the export editor's pure model (export-model.ts).
import { describe, expect, it } from 'vitest';
import type { RunMeta } from '../../src/capture/store';
import {
  ITEM_COMMENT,
  ITEM_END,
  ITEM_ENTRY,
  KIND_OUT,
  buildEditorLog,
  buildItems,
  centredTop,
  changedComment,
  commentSlot,
  entryAtOrAfter,
  entryPlainRows,
  entryRows,
  entryRangeUs,
  entrySegments,
  exportLayout,
  itemAtRow,
  itemKey,
  keyAfterDelete,
  keyItem,
  mapItem,
  mapMarks,
  mapThumb,
  pageItem,
  parseSgr,
  runStyle,
  selectedEntries,
  selectionTitle,
  summaryLines,
  summaryText,
  topFor,
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

  it('lays the package out: the log fills the width beside a 30-cell panel; narrow puts the panel above', () => {
    // [margin 2][log][gap 1][map 2][gap 2][panel 30] within cols − 2.
    expect(exportLayout(200)).toEqual({ at: 1, logW: 200 - 2 - 2 - 1 - 2 - 2 - 30, panelW: 30 });
    expect(exportLayout(400).logW).toBe(400 - 39);
    expect(exportLayout(79)).toEqual({ at: 1, logW: 40, panelW: 30 });
    expect(exportLayout(78)).toEqual({ at: 1, logW: 78 - 7, panelW: 0 });
    expect(exportLayout(30).logW).toBe(23);
  });

  it('keeps the cursor on screen, pages by the viewport and centres', () => {
    const long = buildEditorLog(chain(Array.from({ length: 100 }, (_, i) => `${ts(i)} line ${i}`)));
    const items = buildItems(long, [], 80);
    expect(topFor(items, 50, 0, 10)).toBe(41);
    expect(topFor(items, 5, 41, 10)).toBe(5);
    expect(topFor(items, 100, 0, 10)).toBe(91);
    expect(pageItem(items, 50, 10, 1)).toBe(60);
    expect(pageItem(items, 5, 10, -1)).toBe(0);
    expect(pageItem(items, 0, 10, -1)).toBe(0);
    expect(centredTop(items, 50, 10)).toBe(45);
    expect(centredTop(items, 2, 10)).toBe(0);
  });

  it('draws the overview map: markers over comments over excluded, and the thumb', () => {
    const long = buildEditorLog(chain(Array.from({ length: 100 }, (_, i) => `${ts(i)} line ${i}`)));
    let doc = defaultExportDoc('Rasta/1');
    doc = excludeRange(doc, T + 90e6, null);
    doc = addComment(doc, T + 30e6, 'hello');
    const items = buildItems(long, doc.comments, 80);
    const events = [{ type: 'pkill', us: T + 50e6 + 5, logUs: T + 50e6, name: 'X', race: 'y', xpDelta: 1 }] as RunEvent[];
    const m = mapMarks(items, long, doc, events, 10);
    expect(m[0]).toBe(null);
    // 102 rows (100 entries, the comment, the end row) on 10 map rows.
    expect(m[2]).toBe('comment');
    expect(m[5]).toBe('K');
    expect(m[7]).toBe(null);
    expect(m.slice(8)).toEqual(['excluded', 'excluded']);
    expect(mapThumb(items, 0, 10, 10)).toEqual([0, 0]);
    expect(mapThumb(items, 51, 51, 10)).toEqual([5, 9]);
    expect(mapThumb(buildItems(log, [], 80), 0, 10, 10)).toEqual([0, 9]);
    expect(mapItem(items, 5, 10)).toBe(56);
  });

  it('writes the summary and the selection heading', () => {
    const sum = { character: 'Rasta', level: 73, date: '2026-09-25', lines: 70098, excluded: 3, comments: 1 };
    expect(summaryLines(sum)).toEqual(['Rasta (L73)', '2026-09-25 · 70098 lines', '3 excluded · 1 comment']);
    expect(summaryText({ character: 'Rasta', date: 'd', lines: 1, excluded: 0, comments: 2 })).toBe(
      'Rasta · d · 1 line · 0 excluded · 2 comments',
    );
    expect(selectionTitle({ selected: 4 })).toBe('SELECTION · 4 lines');
    expect(selectionTitle({ selected: 1 })).toBe('SELECTION · 1 line');
    expect(selectionTitle({ entry: 11 })).toBe('LINE · 12');
    expect(selectionTitle({ comment: true })).toBe('COMMENT');
    expect(selectionTitle({ end: true })).toBe('END OF LOG');
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
    mapMarks(items, big, doc, [], 40);
    expect(big.ts.length).toBe(100_000);
    expect(items.count).toBe(100_002);
    expect(performance.now() - t0).toBeLessThan(2000);
    // An edit's rebuild (items + map) alone.
    const t1 = performance.now();
    buildItems(big, addComment(doc, T + 600e6, 'two').comments, 100);
    mapMarks(items, big, doc, [], 40);
    expect(performance.now() - t1).toBeLessThan(300);
  });
});
