// Where the profile editor was left (stage 57, ADR 0143): per profile name,
// the chosen kind, the marked row of each kind and the list's scroll
// offset, so the next open of the editor comes back there. In memory only,
// for the page's lifetime: a reload starts fresh, nothing is stored. One
// map for every host (the Profile window, the phone's menu, the start page).
//
// The editor's entry ids come from a fresh parse on every open, so a row is
// remembered as a mark that survives a re-parse: its position among the
// kind's entries in document order (a Lite edit never reorders the text,
// ADR 0015, while the display order moves an entry whose pattern changed
// and a new entry once it is no longer pinned last) and its pattern (a
// macro's key name). Found again by, in turn: the entry at that position
// when it has that pattern; the first entry of the kind with that pattern;
// the display row it was on, clamped to the list (so after a delete or an
// import the mark lands near where it was). An empty kind marks nothing.
// The `+ New` row and a kind whose cursor was never moved are not
// remembered: they open as they always did.
//
// Also kept per profile name, with the same lifetime: the view the editor
// was left in (Lite or Editor; the next open is in that view). The Editor
// buffer's own place is buffer-place.ts's.

import { type EntryNode, type ProfileDoc, listEntries } from '../../script/doc';
import { KINDS, type LiteKind, listRows } from '../logic';

/** A marked row in a form that survives a re-parse. */
export interface RowMark {
  /** Its index among the kind's entries, in document order. */
  at: number;
  /** Its row in the list (display order) when it was left: the fallback. */
  row: number;
  /** Its pattern (a macro's key name). */
  pattern: string;
}

export type RowMarks = Partial<Record<LiteKind, RowMark>>;

/** Where a profile's editor was left. */
export interface Place {
  kind: LiteKind;
  rows: RowMarks;
  /** The list's `scrollTop` for `kind`. */
  scroll: number;
}

/** A remembered place resolved against a freshly parsed profile. */
export interface Recalled extends Place {
  /** The marked entry's id per kind (the editor's cursors). */
  cursorIds: Partial<Record<LiteKind, number>>;
}

/** The views an open can start in (Help lies over one of them and is not reopened). */
export type PlaceView = 'lite' | 'editor';

const places = new Map<string, Place>();
const views = new Map<string, PlaceView>();

/** Remembers `place` for the profile `name`. */
export function keepPlace(name: string, place: Place): void {
  places.set(name, place);
}

/** The list of `kind` was scrolled to `top` (ignored when another kind is the remembered one). */
export function keepScroll(name: string, kind: LiteKind, top: number): void {
  const p = places.get(name);
  if (p && p.kind === kind) places.set(name, { ...p, scroll: top });
}

/** The remembered place of `name`, as it was kept. */
export function placeOf(name: string): Place | undefined {
  return places.get(name);
}

/** Forgets every place (tests). */
export function forgetPlaces(): void {
  places.clear();
  views.clear();
}

/** The profile `name` is shown in `view`. */
export function keepView(name: string, view: PlaceView): void {
  views.set(name, view);
}

/** The view the next open of `name` starts in: the one it was left in, Lite the first time. */
export function viewOf(name: string): PlaceView {
  return views.get(name) ?? 'lite';
}

/** The mark of entry `id`, on display row `row`, among its kind's `entries` (document order). */
export function markOf(entries: readonly EntryNode[], id: number, row: number): RowMark | null {
  const at = entries.findIndex((e) => e.id === id);
  return at < 0 ? null : { at, row, pattern: entries[at]!.pattern };
}

/**
 * The entry `mark` stands for now: `entries` in document order, `list` the
 * same entries in display order. Undefined only for an empty kind.
 */
export function findMark(entries: readonly EntryNode[], list: readonly EntryNode[], mark: RowMark): EntryNode | undefined {
  const there = entries[mark.at];
  if (there && there.pattern === mark.pattern) return there;
  const same = list.find((e) => e.pattern === mark.pattern);
  if (same) return same;
  const row = Number.isFinite(mark.row) ? Math.trunc(mark.row) : 0;
  return list[Math.max(0, Math.min(list.length - 1, row))];
}

/** The place remembered for `name`, resolved against `doc`; null when none is remembered. */
export function recallPlace(name: string, doc: ProfileDoc): Recalled | null {
  const p = places.get(name);
  if (!p) return null;
  const cursorIds: Partial<Record<LiteKind, number>> = {};
  const rows: RowMarks = {};
  for (const k of KINDS) {
    const mark = p.rows[k];
    if (!mark) continue;
    const e = findMark(listEntries(doc, k), listRows(doc, k), mark);
    if (!e) continue;
    cursorIds[k] = e.id;
    rows[k] = mark;
  }
  return { kind: p.kind, rows, scroll: p.scroll, cursorIds };
}
