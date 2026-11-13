// The profile editor's remembered place (stage 57, ADR 0143): the mark of a
// row survives a re-parse (document position + pattern), falls back to the
// pattern, then to the display row, and never names a missing entry; the
// view and the Editor buffer's place, clamped to the text.
import { beforeEach, describe, expect, it } from 'vitest';
import { listRows } from '../../src/editor/logic';
import { bufferOf, clampBuffer, forgetBuffers, keepBuffer } from '../../src/editor/buffer-place';
import {
  type RowMark,
  findMark,
  forgetPlaces,
  keepPlace,
  keepScroll,
  keepView,
  markOf,
  placeOf,
  recallPlace,
  viewOf,
} from '../../src/editor/profile/place';
import { addEntry, editEntry, listEntries, parseProfile, serialize } from '../../src/script/doc';

const ALIASES = '#alias {d} {4}\n#alias {b} {2}\n#action {x} {y}\n#alias {a} {1}\n#alias {c} {3}\n';

/** The mark of the alias with `pattern` in `text`, as the editor takes it. */
function mark(text: string, pattern: string): RowMark {
  const doc = parseProfile(text);
  const entries = listEntries(doc, 'alias');
  const list = listRows(doc, 'alias');
  const e = entries.find((x) => x.pattern === pattern)!;
  return markOf(entries, e.id, list.indexOf(e))!;
}

/** The body of the alias `m` stands for in `text`. */
function found(text: string, m: RowMark): string | undefined {
  const doc = parseProfile(text);
  return findMark(listEntries(doc, 'alias'), listRows(doc, 'alias'), m)?.body;
}

beforeEach(() => {
  forgetPlaces();
  forgetBuffers();
});

describe('a row mark', () => {
  it('holds the document position, the display row and the pattern', () => {
    expect(mark(ALIASES, 'a')).toEqual({ at: 2, row: 0, pattern: 'a' });
    expect(mark(ALIASES, 'd')).toEqual({ at: 0, row: 3, pattern: 'd' });
    const doc = parseProfile(ALIASES);
    expect(markOf(listEntries(doc, 'alias'), 9999, 0)).toBeNull();
  });

  it('finds the same entry after a re-parse, also among equal patterns', () => {
    expect(found(ALIASES, mark(ALIASES, 'c'))).toBe('3');
    const twins = '#alias {k} {first}\n#alias {a} {x}\n#alias {k} {second}\n';
    expect(found(twins, { at: 2, row: 2, pattern: 'k' })).toBe('second');
    expect(found(twins, { at: 0, row: 1, pattern: 'k' })).toBe('first');
  });

  it('finds an entry whose pattern was edited and applied, and a new entry once it sorts', () => {
    // Edited in Lite: the text keeps its order, the list moves the row.
    let doc = parseProfile(ALIASES);
    const b = listEntries(doc, 'alias')[1]!;
    doc = editEntry(doc, b.id, { pattern: 'zz' });
    const m = markOf(listEntries(doc, 'alias'), b.id, 1)!;
    expect(found(serialize(doc), m)).toBe('2');
    // A new entry was pinned last in the list; the next open sorts it first.
    const added = addEntry(doc, { kind: 'alias', pattern: 'A', body: 'new' });
    const m2 = markOf(listEntries(added.doc, 'alias'), added.id, 4)!;
    expect(m2).toEqual({ at: 4, row: 4, pattern: 'A' });
    const again = parseProfile(serialize(added.doc));
    expect(listRows(again, 'alias')[0]!.body).toBe('new');
    expect(found(serialize(added.doc), m2)).toBe('new');
  });

  it('falls back to the first entry with the pattern when the position moved', () => {
    const m = mark(ALIASES, 'c');
    expect(found('#alias {new} {0}\n#alias {c} {3}\n#alias {a} {1}\n', m)).toBe('3');
    expect(found('#alias {c} {one}\n#alias {b} {2}\n#alias {c} {two}\n', { at: 1, row: 0, pattern: 'c' })).toBe('one');
  });

  it('falls back to the display row, clamped, when the entry is gone', () => {
    // `c` was on row 2 of a b c d; without it row 2 is d.
    expect(found('#alias {d} {4}\n#alias {b} {2}\n#alias {a} {1}\n', mark(ALIASES, 'c'))).toBe('4');
    expect(found('#alias {a} {1}\n', mark(ALIASES, 'd'))).toBe('1');
    expect(found('#alias {a} {1}\n', { at: -3, row: -7, pattern: 'q' })).toBe('1');
    expect(found('#alias {a} {1}\n', { at: Number.NaN, row: Number.NaN, pattern: 'q' })).toBe('1');
    expect(found('#action {x} {y}\n', mark(ALIASES, 'c'))).toBeUndefined();
    expect(found('', mark(ALIASES, 'c'))).toBeUndefined();
  });
});

describe('the remembered place', () => {
  it('is none until one is kept, and is kept per profile name', () => {
    const doc = parseProfile(ALIASES);
    expect(recallPlace('default', doc)).toBeNull();
    keepPlace('default', { kind: 'alias', rows: { alias: mark(ALIASES, 'c') }, scroll: 120 });
    expect(recallPlace('other', doc)).toBeNull();
    const r = recallPlace('default', doc)!;
    expect(r.kind).toBe('alias');
    expect(r.scroll).toBe(120);
    expect(listEntries(doc, 'alias').find((e) => e.id === r.cursorIds.alias)!.pattern).toBe('c');
    expect(r.cursorIds.action).toBeUndefined();
  });

  it('resolves every kind’s mark and drops the mark of a kind that is now empty', () => {
    keepPlace('default', {
      kind: 'macro',
      rows: { macro: { at: 0, row: 0, pattern: 'F5' }, alias: mark(ALIASES, 'b'), action: { at: 0, row: 0, pattern: 'x' } },
      scroll: 0,
    });
    const doc = parseProfile(ALIASES);
    const r = recallPlace('default', doc)!;
    expect(r.kind).toBe('macro');
    expect(r.cursorIds.macro).toBeUndefined();
    expect(r.rows.macro).toBeUndefined();
    expect(listEntries(doc).find((e) => e.id === r.cursorIds.alias)!.body).toBe('2');
    expect(listEntries(doc).find((e) => e.id === r.cursorIds.action)!.body).toBe('y');
    expect(recallPlace('default', parseProfile(''))).toEqual({ kind: 'macro', rows: {}, scroll: 0, cursorIds: {} });
  });

  it('keeps the scroll offset only for the remembered kind', () => {
    keepScroll('default', 'alias', 50);
    expect(placeOf('default')).toBeUndefined();
    keepPlace('default', { kind: 'alias', rows: {}, scroll: 0 });
    keepScroll('default', 'alias', 50);
    keepScroll('default', 'macro', 900);
    expect(placeOf('default')!.scroll).toBe(50);
  });
});

describe('the view and the Editor buffer', () => {
  it('the first open is Lite, a later one the view it was left in, per profile', () => {
    expect(viewOf('default')).toBe('lite');
    keepView('default', 'editor');
    expect(viewOf('default')).toBe('editor');
    expect(viewOf('other')).toBe('lite');
    keepView('default', 'lite');
    expect(viewOf('default')).toBe('lite');
  });

  it('keeps the selection and the scroll, each part on its own', () => {
    expect(bufferOf('default', 100)).toBeNull();
    keepBuffer('default', { anchor: 12, head: 20 });
    expect(bufferOf('default', 100)).toEqual({
      anchor: 12,
      head: 20,
      top: 0,
      off: 0,
    });
    keepBuffer('default', { anchor: 30, head: 30, top: 24, off: 7 });
    keepBuffer('default', { anchor: 31, head: 31 });
    expect(bufferOf('default', 100)).toEqual({
      anchor: 31,
      head: 31,
      top: 24,
      off: 7,
    });
    expect(bufferOf('other', 100)).toBeNull();
    forgetBuffers();
    expect(bufferOf('default', 100)).toBeNull();
  });

  it('is clamped to a text that got shorter', () => {
    expect(clampBuffer({ anchor: 5, head: 90, top: 40, off: 9 }, 50)).toEqual({
      anchor: 5,
      head: 50,
      top: 40,
      off: 9,
    });
    // The top line is gone: the end of the text, unscrolled.
    expect(clampBuffer({ anchor: 80, head: 90, top: 70, off: 9 }, 50)).toEqual({
      anchor: 50,
      head: 50,
      top: 50,
      off: 0,
    });
    expect(clampBuffer({ anchor: 3, head: 3, top: 2, off: 1 }, 0)).toEqual({
      anchor: 0,
      head: 0,
      top: 0,
      off: 0,
    });
    expect(clampBuffer({ anchor: -4, head: Number.NaN, top: Number.NaN, off: -3 }, 10)).toEqual({ anchor: 0, head: 0, top: 0, off: 0 });
    expect(clampBuffer({ anchor: 4, head: 4, top: 4, off: -2.4 }, 10)).toEqual({
      anchor: 4,
      head: 4,
      top: 4,
      off: -2,
    });
    expect(clampBuffer({ anchor: 1.7, head: 2, top: 0, off: Number.POSITIVE_INFINITY }, 10)).toEqual({ anchor: 1, head: 2, top: 0, off: 0 });
  });
});
