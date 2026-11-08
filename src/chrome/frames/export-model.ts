// Export editor (Inv §7.7, ADR 0019, ADR 0115, ADR 0128 §43d): pure
// helpers for the frame in export-editor.tsx. The log's visible entries,
// the item list (entries, comments, the end row) with its wrapped row
// offsets, the pixel geometry of the virtual log (rows at one line height,
// the inline comment composer as one extra item of measured height), the
// selection's entries, the overview strip's stretches and marks, SGR
// colouring of the rows on screen, the bar's summary and the cursor
// arithmetic. No DOM; unit tested.
//
// Built for a 5 h chain (~100 000 entries): the log is read once into flat
// arrays; the item list is rebuilt in one pass when the comments or the
// width change; only the rows near the view are coloured.

import type { Color, StyleRun } from '../../core/types';
import { rgb } from '../../core/types';
import { PLAYING_COMMANDS } from '../../net/session';
import type { ChainRun } from '../../player/timeline';
import { markersOf } from '../../player/strip';
import type { RunEvent } from '../../runs/events';
import { stripAnsi } from '../../share/capture';
import { SYS_PREFIX, playerEntries } from '../../share/system-lines';
import { COMMENT_COLS, type ExportComment, type ExportDoc, commentLines } from '../../share/edits';
import { colorToCss } from '../../ui/palette';

// ---------------------------------------------------------------- layout

/** The log never wraps wider than this many columns (a very wide window caps the page, ADR 0128 §43d). */
export const LOG_MAX_COLS = 120;
/** … nor narrower than this (a tiny window still shows words). */
export const LOG_MIN_COLS = 16;

/** The log's wrap width in columns: what fits in `textW` px at `charW` px a character, within the caps. */
export function logCols(textW: number, charW: number): number {
  const cw = charW > 0 ? charW : 8;
  return Math.max(LOG_MIN_COLS, Math.min(LOG_MAX_COLS, Math.floor((Math.max(0, textW) + 0.5) / cw)));
}

// ------------------------------------------------------------------- log

export const KIND_IN = 0;
export const KIND_OUT = 1;
/** A system line the player prints (`[SYSTEM] Rasta logged in.`, src/share/system-lines.ts). */
export const KIND_SYS = 2;

/** A command row's prefix (commands sit on rows of their own in the editor). */
export const OUT_PREFIX = '> ';

/** The visible entries of a chain (oldest run first), as flat arrays. */
export interface EditorLog {
  /** Entry log µs (the anchors), ascending within a run. */
  ts: number[];
  /** KIND_IN, KIND_OUT or KIND_SYS. */
  kind: Uint8Array;
  /** Inbound: the line with its SGR; command: the text sent; system line: the message. */
  raw: string[];
  /** Shown length in cells (a command's prefix included). */
  len: Uint32Array;
  /** The shown text (no SGR; a command's or system line's prefix included), for the word wrap. */
  plain: string[];
}

/**
 * The entries the editor shows and excludes (ADR 0019 "What an exclusion
 * removes"): inbound lines, commands and the player's system lines (each
 * anchored on the entry that prints it). Empty Enters and the width
 * commands sent on entering the game are left out, as the output pane and
 * the text export leave them out.
 */
export function buildEditorLog(chain: readonly ChainRun[]): EditorLog {
  const ts: number[] = [];
  const kinds: number[] = [];
  const raw: string[] = [];
  const lens: number[] = [];
  const plain: string[] = [];
  const shown = (t: string): void => {
    plain.push(t);
    lens.push(t.length);
  };
  for (const e of playerEntries(chain)) {
    if (e.kind === 'in') {
      ts.push(e.ts);
      kinds.push(KIND_IN);
      raw.push(e.body);
      // (stripAnsi returns the same string when the line has no escapes.)
      shown(stripAnsi(e.body));
    } else if (e.kind === 'out') {
      if (e.body === '' || PLAYING_COMMANDS.includes(e.body)) continue;
      ts.push(e.ts);
      kinds.push(KIND_OUT);
      raw.push(e.body);
      shown(OUT_PREFIX + e.body);
    } else if (e.kind === 'sys') {
      ts.push(e.ts);
      kinds.push(KIND_SYS);
      raw.push(e.body);
      shown(SYS_PREFIX + e.body);
    }
  }
  return { ts, kind: Uint8Array.from(kinds), raw, len: Uint32Array.from(lens), plain };
}

/** The first entry with log µs ≥ `us` (entries.length when none). */
export function entryAtOrAfter(log: EditorLog, us: number): number {
  const ts = log.ts;
  let lo = 0;
  let hi = ts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid]! < us) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ----------------------------------------------------------------- items

export const ITEM_ENTRY = 0;
export const ITEM_COMMENT = 1;
export const ITEM_END = 2;

/**
 * The editor's rows: every entry, every comment before its anchor entry
 * (null-anchored ones before the end row), and the final end row. An item
 * is one cursor stop; an entry wraps to several rows, a comment is its
 * wrapped `## ` lines.
 */
export interface Items {
  count: number;
  kind: Uint8Array;
  /** Entry index or comment index (-1 for the end row). */
  ref: Int32Array;
  /** First row of each item; rowStart[count] = total rows. */
  rowStart: Int32Array;
  totalRows: number;
  /** Item of each entry / comment. */
  entryItem: Int32Array;
  commentItem: Int32Array;
  /** Each comment's shown lines (at the log width). */
  commentRows: string[][];
  width: number;
}

/**
 * Word wrap at `width` cells: a row breaks at the last space that fits (the
 * space itself is not shown), and a word longer than a row breaks hard.
 * Returns the row count; with `out`, pushes each row's [start, end) offsets.
 * A text that fits is one row (an empty text too).
 */
export function wrapSpans(text: string, width: number, out?: number[]): number {
  const w = Math.max(1, width);
  const n = text.length;
  let pos = 0;
  let rows = 1;
  while (n - pos > w) {
    // The last space within the row, or the one just after a full row.
    let sp = pos + w;
    while (sp > pos && text.charCodeAt(sp) !== 32) sp--;
    const end = sp > pos ? sp : pos + w;
    out?.push(pos, end);
    pos = sp > pos ? sp + 1 : end;
    rows++;
  }
  out?.push(pos, n);
  return rows;
}

/** Rows entry `e` takes at `width` cells (word wrap; nothing scanned for a line that fits). */
export function entryWrapRows(log: EditorLog, e: number, width: number): number {
  return log.len[e]! <= width ? 1 : wrapSpans(log.plain[e]!, width);
}

/** Comment lines at the log width (80 columns, fewer when the log is narrower). */
export function commentDisplay(text: string, width: number): string[] {
  return commentLines(text, Math.max(8, Math.min(COMMENT_COLS, width)));
}

export function buildItems(log: EditorLog, comments: readonly ExportComment[], width: number): Items {
  const n = log.ts.length;
  const count = n + comments.length + 1;
  const kind = new Uint8Array(count);
  const ref = new Int32Array(count);
  const rowStart = new Int32Array(count + 1);
  const entryItem = new Int32Array(n);
  const commentItem = new Int32Array(comments.length);
  const commentRows = comments.map((c) => commentDisplay(c.text, width));
  let it = 0;
  let row = 0;
  let ci = 0;
  const pushComment = (): void => {
    kind[it] = ITEM_COMMENT;
    ref[it] = ci;
    commentItem[ci] = it;
    rowStart[it] = row;
    row += commentRows[ci]!.length;
    ci++;
    it++;
  };
  for (let e = 0; e < n; e++) {
    const us = log.ts[e]!;
    while (ci < comments.length && comments[ci]!.beforeUs !== null && comments[ci]!.beforeUs! <= us) pushComment();
    kind[it] = ITEM_ENTRY;
    ref[it] = e;
    entryItem[e] = it;
    rowStart[it] = row;
    row += entryWrapRows(log, e, width);
    it++;
  }
  while (ci < comments.length) pushComment();
  kind[it] = ITEM_END;
  ref[it] = -1;
  rowStart[it] = row;
  row += 1;
  rowStart[count] = row;
  return { count, kind, ref, rowStart, totalRows: row, entryItem, commentItem, commentRows, width };
}

/** The item showing row `row` (clamped). */
export function itemAtRow(items: Items, row: number): number {
  const r = Math.max(0, Math.min(items.totalRows - 1, row));
  const rs = items.rowStart;
  let lo = 0;
  let hi = items.count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rs[mid]! <= r) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** PgUp / PgDn: the item one viewport (`height` rows) away. */
export function pageItem(items: Items, cur: number, height: number, dir: 1 | -1): number {
  const target = itemAtRow(items, items.rowStart[cur]! + dir * Math.max(1, height));
  if (target === cur) return Math.max(0, Math.min(items.count - 1, cur + dir));
  return target;
}

// ------------------------------------------------------------ geometry

/**
 * The inline comment composer in the log (ADR 0128 §43d): before item `at`
 * (a new comment) or in place of comment item `at` (`edit`), `h` px tall
 * (measured).
 */
export interface ComposerSlot {
  at: number;
  edit: boolean;
  h: number;
}

/** The virtual log's pixel geometry: one line height, the padding above the first row, the composer. */
export interface LogGeom {
  lh: number;
  pad: number;
  comp: ComposerSlot | null;
}

/** The composer's px offset added to item `i`'s top (0 above the composer). */
function shiftOf(items: Items, i: number, g: LogGeom): number {
  const c = g.comp;
  if (!c) return 0;
  if (c.edit) return i > c.at ? c.h - (items.rowStart[c.at + 1]! - items.rowStart[c.at]!) * g.lh : 0;
  return i >= c.at ? c.h : 0;
}

/** Item `i`'s top in the log's content (px; `i = count` is the end of the last item). */
export function itemTop(items: Items, i: number, g: LogGeom): number {
  return g.pad + items.rowStart[i]! * g.lh + shiftOf(items, i, g);
}

/** Item `i`'s height (px; the composer's for an edited comment). */
export function itemHeight(items: Items, i: number, g: LogGeom): number {
  if (g.comp?.edit && g.comp.at === i) return g.comp.h;
  return (items.rowStart[i + 1]! - items.rowStart[i]!) * g.lh;
}

/** The composer's top in the log's content (px), or -1 without one. */
export function composerTop(items: Items, g: LogGeom): number {
  return g.comp ? g.pad + items.rowStart[g.comp.at]! * g.lh : -1;
}

/** The content's height: the padding, every row and the composer (the bottom padding is the caller's). */
export function contentHeight(items: Items, g: LogGeom): number {
  return itemTop(items, items.count, g);
}

/**
 * The item at content y (px), clamped to the items; a y on the composer
 * gives the item it stands for (the one it sits before, or the edited one).
 */
export function itemAtY(items: Items, y: number, g: LogGeom): number {
  const c = g.comp;
  let yy = y - g.pad;
  if (c) {
    const top = items.rowStart[c.at]! * g.lh;
    if (yy >= top && yy < top + c.h) return Math.min(items.count - 1, c.at);
    if (yy >= top + c.h) yy -= shiftOf(items, items.count, g);
  }
  return itemAtRow(items, Math.floor(yy / Math.max(1, g.lh)));
}

/**
 * The scrollTop that shows [top, top + h) in a view of `view` px at
 * `scroll`, moving as little as possible (`margin` px kept around it).
 */
export function revealTop(scroll: number, view: number, top: number, h: number, margin = 0): number {
  let t = scroll;
  if (top + h + margin > t + view) t = top + h + margin - view;
  if (top - margin < t) t = top - margin;
  return Math.max(0, t);
}

// ------------------------------------------------------------ comments

/**
 * Where ADD COMMENT puts a comment: before the cursor entry, after a cursor
 * comment (`above`: before it, a selection that starts on a comment), or at
 * the end.
 */
export function commentSlot(
  doc: ExportDoc,
  log: EditorLog,
  items: Items,
  cur: number,
  above = false,
): { beforeUs: number | null; slot: number } {
  const k = items.kind[cur];
  if (k === ITEM_ENTRY) return { beforeUs: log.ts[items.ref[cur]!]!, slot: Infinity };
  if (k === ITEM_COMMENT) {
    const ci = items.ref[cur]!;
    const anchor = doc.comments[ci]!.beforeUs;
    let first = ci;
    while (first > 0 && doc.comments[first - 1]!.beforeUs === anchor) first--;
    return { beforeUs: anchor, slot: ci - first + (above ? 0 : 1) };
  }
  return { beforeUs: null, slot: Infinity };
}

/** The first comment index that differs between two comment lists (the one an add inserted). */
export function changedComment(before: readonly ExportComment[], after: readonly ExportComment[]): number {
  const n = Math.min(before.length, after.length);
  for (let i = 0; i < n; i++) if (before[i] !== after[i]) return i;
  return n;
}

// --------------------------------------------------------------- cursor

/** A cursor that survives an item rebuild: an entry, a comment or the end row. */
export type CursorKey = { entry: number } | { comment: number } | { end: true };

export function itemKey(items: Items, i: number): CursorKey {
  const k = items.kind[i];
  if (k === ITEM_ENTRY) return { entry: items.ref[i]! };
  if (k === ITEM_COMMENT) return { comment: items.ref[i]! };
  return { end: true };
}

export function keyItem(items: Items, key: CursorKey): number {
  if ('entry' in key) return items.entryItem[key.entry] ?? items.count - 1;
  if ('comment' in key) return items.commentItem[key.comment] ?? items.count - 1;
  return items.count - 1;
}

/** The cursor after comment `deleted` is removed: the item that followed it. */
export function keyAfterDelete(items: Items, deleted: number): CursorKey {
  const next = itemKey(items, Math.min(items.count - 1, items.commentItem[deleted]! + 1));
  if ('comment' in next) return { comment: next.comment - 1 };
  return next;
}

// ------------------------------------------------------------ selection

/**
 * The entries a selection from item `a` to item `b` (either order,
 * inclusive) covers, as the first and last entry index; comments and the
 * end row are skipped (ADR 0115 §2). Null when it holds no entry.
 */
export function selectedEntries(items: Items, a: number, b: number): [number, number] | null {
  let lo = Math.max(0, Math.min(a, b));
  let hi = Math.min(items.count - 1, Math.max(a, b));
  while (lo <= hi && items.kind[lo] !== ITEM_ENTRY) lo++;
  while (hi >= lo && items.kind[hi] !== ITEM_ENTRY) hi--;
  return lo <= hi ? [items.ref[lo]!, items.ref[hi]!] : null;
}

/**
 * The half-open µs range of entries `lo`..`hi` (ADR 0115 §3): from the
 * first's µs to the µs of the entry after the last, null when the last is
 * the log's last.
 */
export function entryRangeUs(log: EditorLog, lo: number, hi: number): [number, number | null] {
  return [log.ts[lo]!, hi + 1 < log.ts.length ? log.ts[hi + 1]! : null];
}

// ------------------------------------------------------------------ map

export type MarkLetter = 'K' | 'D' | 'A' | 'L';

/**
 * The overview strip beside the log (ADR 0115 §5, ADR 0128 §43d), as
 * fractions of the log's rows (0 top, 1 bottom): the excluded stretches
 * (merged), the comments and the event letters (K pkill, D death, A
 * achievement, L level). Drawn as a few absolutely placed marks, never one
 * element per line; O(ranges · log n + comments + events).
 */
export interface MapStrip {
  excluded: [from: number, to: number][];
  comments: number[];
  marks: { letter: MarkLetter; at: number }[];
}

export function mapStrip(items: Items, log: EditorLog, doc: ExportDoc, events: readonly RunEvent[]): MapStrip {
  const total = Math.max(1, items.totalRows);
  const n = log.ts.length;
  const excluded: [number, number][] = [];
  for (const [from, to] of doc.excludes) {
    const e0 = entryAtOrAfter(log, from);
    const e1 = (to === null ? n : entryAtOrAfter(log, to)) - 1;
    if (e1 < e0 || e0 >= n) continue;
    const a = items.rowStart[items.entryItem[e0]!]! / total;
    const b = items.rowStart[items.entryItem[e1]! + 1]! / total;
    const last = excluded[excluded.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else excluded.push([a, b]);
  }
  const comments = Array.from(items.commentItem, (it) => items.rowStart[it]! / total);
  const marks = markersOf(events).map((m) => {
    const e = entryAtOrAfter(log, m.us);
    return { letter: m.letter as MarkLetter, at: items.rowStart[e < n ? items.entryItem[e]! : items.count - 1]! / total };
  });
  return { excluded, comments, marks };
}

/** The item a press at fraction `f` (0–1) of the strip jumps to. */
export function mapItemAt(items: Items, f: number): number {
  return itemAtRow(items, Math.floor(Math.max(0, Math.min(1, f)) * items.totalRows));
}

/** The strip's viewport thumb as fractions [top, height] of the strip (at least `min` tall). */
export function mapThumb(scrollTop: number, view: number, content: number, min = 0.02): [number, number] {
  if (!(content > view)) return [0, 1];
  const h = Math.max(min, view / content);
  const t = Math.max(0, Math.min(1 - h, scrollTop / content));
  return [t, h];
}

// ------------------------------------------------------------------ SGR

const BOLD = 1;
const ITALIC = 2;
const UNDERLINE = 4;
const BLINK = 8;
const INVERSE = 16;

/**
 * An inbound capture line (SGR kept, ADR 0007) as plain text and style
 * runs, the shape the output pane renders. Other escape sequences are
 * dropped.
 */
export function parseSgr(raw: string): { text: string; runs: StyleRun[] } {
  if (raw.indexOf('\x1b') < 0) return { text: raw, runs: [] };
  let text = '';
  const runs: StyleRun[] = [];
  let fg: Color | undefined;
  let bg: Color | undefined;
  let flags = 0;
  let pos = 0;
  const emit = (s: string): void => {
    if (!s) return;
    const start = text.length;
    text += s;
    if (fg === undefined && bg === undefined && flags === 0) return;
    const r: StyleRun = { start, end: text.length };
    if (fg !== undefined) r.fg = fg;
    if (bg !== undefined) r.bg = bg;
    if (flags & BOLD) r.bold = true;
    if (flags & ITALIC) r.italic = true;
    if (flags & UNDERLINE) r.underline = true;
    if (flags & BLINK) r.blink = true;
    if (flags & INVERSE) r.inverse = true;
    const last = runs[runs.length - 1];
    if (
      last &&
      last.end === start &&
      last.fg === r.fg &&
      last.bg === r.bg &&
      last.bold === r.bold &&
      last.italic === r.italic &&
      last.underline === r.underline &&
      last.blink === r.blink &&
      last.inverse === r.inverse
    )
      last.end = r.end;
    else runs.push(r);
  };
  while (pos < raw.length) {
    const esc = raw.indexOf('\x1b', pos);
    if (esc < 0) {
      emit(raw.slice(pos));
      break;
    }
    emit(raw.slice(pos, esc));
    if (raw[esc + 1] !== '[') {
      pos = esc + 2;
      continue;
    }
    let end = esc + 2;
    while (end < raw.length) {
      const c = raw.charCodeAt(end);
      if (c >= 0x40 && c <= 0x7e) break;
      end++;
    }
    if (end >= raw.length) break;
    if (raw[end] === 'm') {
      const ps = raw.slice(esc + 2, end).split(/[;:]/).map((s) => (s === '' ? 0 : Number(s)));
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]!;
        if (p === 0) {
          fg = undefined;
          bg = undefined;
          flags = 0;
        } else if (p === 1) flags |= BOLD;
        else if (p === 3) flags |= ITALIC;
        else if (p === 4) flags |= UNDERLINE;
        else if (p === 5 || p === 6) flags |= BLINK;
        else if (p === 7) flags |= INVERSE;
        else if (p === 22) flags &= ~BOLD;
        else if (p === 23) flags &= ~ITALIC;
        else if (p === 24) flags &= ~UNDERLINE;
        else if (p === 25) flags &= ~BLINK;
        else if (p === 27) flags &= ~INVERSE;
        else if (p >= 30 && p <= 37) fg = p - 30;
        else if (p === 39) fg = undefined;
        else if (p >= 40 && p <= 47) bg = p - 40;
        else if (p === 49) bg = undefined;
        else if (p >= 90 && p <= 97) fg = p - 90 + 8;
        else if (p >= 100 && p <= 107) bg = p - 100 + 8;
        else if (p === 38 || p === 48) {
          let c: Color | undefined;
          if (ps[i + 1] === 5 && i + 2 < ps.length) {
            c = ps[i + 2]! & 0xff;
            i += 2;
          } else if (ps[i + 1] === 2 && i + 4 < ps.length) {
            c = rgb(ps[i + 2]!, ps[i + 3]!, ps[i + 4]!);
            i += 4;
          } else break;
          if (p === 38) fg = c;
          else bg = c;
        }
      }
    }
    pos = end + 1;
  }
  return { text, runs };
}

export interface Seg {
  text: string;
  /** Classes (palette colours, bold …), '' for default. */
  cls: string;
  color?: string;
  bg?: string;
}

/** The classes and inline colours of a style run (as the output pane renders it). */
export function runStyle(r: StyleRun): Omit<Seg, 'text'> {
  let fg = r.fg;
  let bg = r.bg;
  const cls: string[] = [];
  const out: Omit<Seg, 'text'> = { cls: '' };
  if (r.inverse) {
    const t = fg;
    fg = bg;
    bg = t;
    cls.push('wc-inv');
    if (fg === undefined) cls.push('wc-fd');
    if (bg === undefined) cls.push('wc-bd');
  } else if (r.bold && fg === undefined) cls.push('wc-fbd');
  if (fg !== undefined) {
    if (fg < 16) cls.push('wc-f' + fg);
    else out.color = colorToCss(fg);
  }
  if (bg !== undefined) {
    if (bg < 16) cls.push('wc-b' + bg);
    else out.bg = colorToCss(bg, 'b');
  }
  if (r.bold) cls.push('wc-bold');
  if (r.italic) cls.push('wc-ital');
  if (r.underline) cls.push('wc-ul');
  if (r.blink) cls.push('wc-blink');
  out.cls = cls.join(' ');
  return out;
}

/** An entry's rows at `width` cells, each as styled segments. */
export function entrySegments(log: EditorLog, e: number, width: number): Seg[][] {
  const w = Math.max(1, width);
  let text: string;
  let runs: StyleRun[];
  if (log.kind[e] === KIND_OUT) {
    text = OUT_PREFIX + log.raw[e]!;
    runs = [{ start: 0, end: OUT_PREFIX.length, fg: -1 }];
  } else if (log.kind[e] === KIND_SYS) {
    text = SYS_PREFIX + log.raw[e]!;
    runs = [{ start: 0, end: text.length, fg: -2 }];
  } else ({ text, runs } = parseSgr(log.raw[e]!));
  const rows: Seg[][] = [];
  const spans: number[] = [];
  const n = wrapSpans(text, w, spans);
  for (let r = 0; r < n; r++) {
    const a = spans[2 * r]!;
    const b = spans[2 * r + 1]!;
    const segs: Seg[] = [];
    let pos = a;
    for (const run of runs) {
      if (run.end <= a || run.start >= b) continue;
      const s = Math.max(a, run.start);
      const t = Math.min(b, run.end);
      if (s > pos) segs.push({ text: text.slice(pos, s), cls: '' });
      const part = text.slice(s, t);
      segs.push(
        run.fg === -1
          ? { text: part, cls: 'wc-exp-prefix' }
          : run.fg === -2
            ? { text: part, cls: 'wc-exp-sys' }
            : { text: part, ...runStyle(run) },
      );
      pos = t;
    }
    if (pos < b) segs.push({ text: text.slice(pos, b), cls: '' });
    rows.push(segs);
  }
  return rows;
}

/** An entry's plain rows at `width` cells (excluded lines lose their colour). */
export function entryPlainRows(log: EditorLog, e: number, width: number): string[] {
  const text = log.plain[e]!;
  const spans: number[] = [];
  const n = wrapSpans(text, width, spans);
  return Array.from({ length: n }, (_, r) => text.slice(spans[2 * r], spans[2 * r + 1]));
}

// ----------------------------------------------------------------- info

export interface Summary {
  character: string;
  level?: number | undefined;
  date: string;
  lines: number;
  excluded: number;
  comments: number;
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** A count with thousands separators (`70,098`), as the bar shows it. */
export function fmtCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** The bar's summary (ADR 0128 §43d): `Rasta` and `Level 72 · 2026-09-25 · 70,098 lines · 3 excluded · 1 comment`. */
export function barSummary(p: Summary): { who: string; line: string } {
  const parts = [
    ...(p.level !== undefined ? [`Level ${p.level}`] : []),
    p.date,
    `${fmtCount(p.lines)} line${p.lines === 1 ? '' : 's'}`,
    `${p.excluded} excluded`,
    plural(p.comments, 'comment'),
  ];
  return { who: p.character, line: parts.join(' · ') };
}

/** The bar's selection heading (drawn in capitals): `Selection · 4 lines`, `Line · 12`, `Comment`, `End of log`. */
export function selectionTitle(sel: { selected: number } | { entry: number } | { comment: true } | { end: true }): string {
  if ('selected' in sel) return `Selection · ${plural(sel.selected, 'line')}`;
  if ('entry' in sel) return `Line · ${sel.entry + 1}`;
  if ('comment' in sel) return 'Comment';
  return 'End of log';
}

/** Longest export title, characters. */
export const TITLE_MAX = 200;

/** Newlines (and tabs) of typed or pasted comment text as spaces (a comment is one paragraph). */
export const pasteText = (s: string): string => s.replace(/\r\n|[\r\n\t]/g, ' ');

/** The hold line under a comment preview: `Holds the replay for 7 s.` */
export function holdText(ms: number): string {
  return `Holds the replay for ${Math.round(ms / 1000)} s.`;
}
