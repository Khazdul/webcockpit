// Export editor (Inv §7.7, ADR 0019): pure helpers for the frame in
// export-editor.tsx. The log's visible entries, the item list (entries,
// comments, the end row) with its wrapped row offsets, the overview map,
// SGR colouring of the rows on screen, and the cursor arithmetic. No DOM;
// unit tested.
//
// Built for a 5 h chain (~100 000 entries): the log is read once into flat
// arrays; the item list is rebuilt in one pass when the comments or the
// width change; only the rows on screen are coloured.

import type { Color, StyleRun } from '../../core/types';
import { rgb } from '../../core/types';
import { PLAYING_COMMANDS } from '../../net/session';
import type { ChainRun } from '../../player/timeline';
import { markersOf } from '../../player/strip';
import type { RunEvent } from '../../runs/events';
import { stripAnsi } from '../../share/capture';
import { SYS_PREFIX, playerEntries } from '../../share/system-lines';
import { COMMENT_COLS, type ExportComment, type ExportDoc, commentLines, rangeAt } from '../../share/edits';
import { colorToCss } from '../../ui/palette';

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
  for (const e of playerEntries(chain)) {
    if (e.kind === 'in') {
      ts.push(e.ts);
      kinds.push(KIND_IN);
      raw.push(e.body);
      lens.push(stripAnsi(e.body).length);
    } else if (e.kind === 'out') {
      if (e.body === '' || PLAYING_COMMANDS.includes(e.body)) continue;
      ts.push(e.ts);
      kinds.push(KIND_OUT);
      raw.push(e.body);
      lens.push(OUT_PREFIX.length + e.body.length);
    } else if (e.kind === 'sys') {
      ts.push(e.ts);
      kinds.push(KIND_SYS);
      raw.push(e.body);
      lens.push(SYS_PREFIX.length + e.body.length);
    }
  }
  return { ts, kind: Uint8Array.from(kinds), raw, len: Uint32Array.from(lens) };
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

/** Rows an entry takes at `width` cells (hard wrap, like the log player). */
export function entryRows(len: number, width: number): number {
  return Math.max(1, Math.ceil(len / Math.max(1, width)));
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
    row += entryRows(log.len[e]!, width);
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

/** The top row that keeps item `cur` on screen, moving as little as possible. */
export function topFor(items: Items, cur: number, top: number, height: number): number {
  const a = items.rowStart[cur]!;
  const b = items.rowStart[cur + 1]!;
  let t = top;
  if (b > t + height) t = b - height;
  if (a < t) t = a;
  return clampTop(items, t, height);
}

export function clampTop(items: Items, top: number, height: number): number {
  return Math.max(0, Math.min(top, items.totalRows - height));
}

/** The top row that centres item `cur`. */
export function centredTop(items: Items, cur: number, height: number): number {
  return clampTop(items, items.rowStart[cur]! - Math.floor(height / 2), height);
}

/** PgUp / PgDn: the item one viewport (`height` rows) away. */
export function pageItem(items: Items, cur: number, height: number, dir: 1 | -1): number {
  const target = itemAtRow(items, items.rowStart[cur]! + dir * Math.max(1, height));
  if (target === cur) return Math.max(0, Math.min(items.count - 1, cur + dir));
  return target;
}

// ------------------------------------------------------------ comments

/** Where ADD COMMENT puts a comment: before the cursor entry, after a cursor comment, or at the end. */
export function commentSlot(
  doc: ExportDoc,
  log: EditorLog,
  items: Items,
  cur: number,
): { beforeUs: number | null; slot: number } {
  const k = items.kind[cur];
  if (k === ITEM_ENTRY) return { beforeUs: log.ts[items.ref[cur]!]!, slot: Infinity };
  if (k === ITEM_COMMENT) {
    const ci = items.ref[cur]!;
    const anchor = doc.comments[ci]!.beforeUs;
    let first = ci;
    while (first > 0 && doc.comments[first - 1]!.beforeUs === anchor) first--;
    return { beforeUs: anchor, slot: ci - first + 1 };
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

// ------------------------------------------------------------------ map

export type MapMark = 'K' | 'D' | 'A' | 'L' | 'comment' | 'excluded' | null;

/** The overview map's content column: one mark per map row (markers > comments > excluded). */
export function mapMarks(
  items: Items,
  log: EditorLog,
  doc: ExportDoc,
  events: readonly RunEvent[],
  height: number,
): MapMark[] {
  const out: MapMark[] = Array.from({ length: Math.max(0, height) }, () => null);
  if (height <= 0) return out;
  const total = items.totalRows;
  const rowOf = (item: number): number => Math.min(height - 1, Math.floor((items.rowStart[item]! * height) / total));
  const rank = (m: MapMark): number => (m === null ? 0 : m === 'excluded' ? 1 : m === 'comment' ? 2 : 3);
  const put = (r: number, m: MapMark): void => {
    if (rank(m) > rank(out[r]!)) out[r] = m;
  };
  if (doc.excludes.length > 0) {
    for (let e = 0; e < log.ts.length; e++) {
      if (rangeAt(doc, log.ts[e]!) >= 0) {
        // An excluded stretch covers every map row from its first to its last row.
        const it = items.entryItem[e]!;
        const r0 = rowOf(it);
        const r1 = Math.min(height - 1, Math.floor(((items.rowStart[it + 1]! - 1) * height) / total));
        for (let r = r0; r <= r1; r++) put(r, 'excluded');
      }
    }
  }
  for (let c = 0; c < items.commentItem.length; c++) put(rowOf(items.commentItem[c]!), 'comment');
  for (const m of markersOf(events)) {
    const e = entryAtOrAfter(log, m.us);
    put(rowOf(e < log.ts.length ? items.entryItem[e]! : items.count - 1), m.letter);
  }
  return out;
}

/** The map's viewport thumb: first and last map row (inclusive). */
export function mapThumb(items: Items, top: number, visible: number, height: number): [number, number] {
  const total = items.totalRows;
  if (height <= 0) return [0, -1];
  if (total <= visible) return [0, height - 1];
  const a = Math.floor((top * height) / total);
  const b = Math.max(a, Math.ceil(((top + visible) * height) / total) - 1);
  return [Math.min(a, height - 1), Math.min(b, height - 1)];
}

/** The item a click on map row `r` jumps to. */
export function mapItem(items: Items, r: number, height: number): number {
  return itemAtRow(items, Math.floor(((r + 0.5) * items.totalRows) / Math.max(1, height)));
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
  const n = entryRows(text.length, w);
  for (let r = 0; r < n; r++) {
    const a = r * w;
    const b = Math.min(text.length, a + w);
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
  const w = Math.max(1, width);
  const k = log.kind[e];
  const text = k === KIND_OUT ? OUT_PREFIX + log.raw[e]! : k === KIND_SYS ? SYS_PREFIX + log.raw[e]! : stripAnsi(log.raw[e]!);
  const n = entryRows(text.length, w);
  return Array.from({ length: n }, (_, r) => text.slice(r * w, (r + 1) * w));
}

// ----------------------------------------------------------------- info

/** `Rasta (L73) · 2026-09-25 · 70098 lines · 3 excluded · 1 comments · → mume-Rasta-….html` */
export function infoText(p: {
  character: string;
  level?: number | undefined;
  date: string;
  lines: number;
  excluded: number;
  comments: number;
  file: string;
}): string {
  const who = p.level !== undefined ? `${p.character} (L${p.level})` : p.character;
  return `${who} · ${p.date} · ${p.lines} lines · ${p.excluded} excluded · ${p.comments} comments · → ${p.file}`;
}

/** The hold line under a comment preview: `Holds the replay for 7 s.` */
export function holdText(ms: number): string {
  return `Holds the replay for ${Math.round(ms / 1000)} s.`;
}
