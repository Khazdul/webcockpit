// A script pane's content (ADR 0053): styled lines, gauges and link
// ranges with hints. Pure data and operations, no DOM and no Lua, so the
// script host (src/scripts/host.ts) edits it, the ScriptPane
// (script-pane.ts) draws it, and runs record its plain-data snapshot
// (`PaneSnapshot`, P1) for the log player and the HTML replay.
//
// Rows and columns are 0-based here; the Lua API is 1-based and converts.
//
// - A line is styled text (spans) or a gauge (a full-width bar).
// - `append` writes like Mudlet's echo: text goes on the end of the last
//   line and `\n` starts a new line. A trailing `\n` is remembered, so
//   `append("a\n")`, `append("b\n")` gives two lines and no empty third.
// - `setLine` and `setGauge` replace one row (the list grows with empty
//   lines when needed) and drop the links on that row: links belong to the
//   row's content, so a script adds them again after redrawing a row.
// - A link is a range of cells on one row with a hint (the tooltip) and an
//   `id` the host maps to its Lua function. A new link drops the links it
//   overlaps. Every dropped link is reported to `onDrop`, so the host can
//   release its function.
// - At most MAX_LINES lines are kept: appending past that drops the
//   oldest lines (and their links), shifting the rest up. A line holds at
//   most MAX_LINE_CELLS cells.
// - Tabs become one space; other control characters are dropped. One
//   UTF-16 unit is one cell (pane text is BMP, as in grid.ts).

import type { Color, StyleRun } from '../core/types';

/** Most lines a pane keeps. */
export const MAX_LINES = 500;
/** Most cells in one line. */
export const MAX_LINE_CELLS = 500;
/** Most characters of a link hint or a title. */
export const MAX_HINT = 500;
export const MAX_TITLE = 60;

/** A run of text in one style. Colours are line-model colours (palette index or truecolor). */
export interface PaneSpan {
  text: string;
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** A full-width bar: `value` of `max` filled, `label` centred over it. */
export interface PaneGauge {
  value: number;
  max: number;
  /** The fill colour; absent: the default bar colour. */
  color?: Color;
  label: string;
}

/** One row: styled text or a gauge. */
export type PaneLine = { spans: PaneSpan[] } | { gauge: PaneGauge };

/** A clickable range of cells. */
export interface PaneLink {
  row: number;
  col: number;
  len: number;
  /** The tooltip ('' for none). */
  hint: string;
  /** The host's key for the link's function. */
  id: number;
}

/** Plain data for runs (P1): no functions, no ids. */
export interface PaneSnapshot {
  title: string;
  lines: PaneLine[];
  links: { row: number; col: number; len: number; hint: string }[];
}

/** Text with style runs, as `parseCecho` (src/scripts/colors.ts) yields it. */
export interface StyledText {
  text: string;
  runs: readonly StyleRun[];
}

/** Text without style. */
export const plain = (text: string): StyledText => ({ text, runs: [] });

/** Tabs to spaces, other control characters out (keeps `\n`). */
function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u0009\u000b-\u001f\u007f]/.test(s) ? s.replace(/\t/g, ' ').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '') : s;
}

function sameStyle(a: PaneSpan, b: PaneSpan): boolean {
  return a.fg === b.fg && a.bg === b.bg && !a.bold === !b.bold && !a.italic === !b.italic && !a.underline === !b.underline;
}

function span(text: string, r: StyleRun | null): PaneSpan {
  const s: PaneSpan = { text };
  if (!r) return s;
  if (r.fg !== undefined) s.fg = r.fg;
  if (r.bg !== undefined) s.bg = r.bg;
  if (r.bold) s.bold = true;
  if (r.italic) s.italic = true;
  if (r.underline) s.underline = true;
  return s;
}

/** Appends `s` to `out`, merging it into the last span when the style is the same. */
function pushSpan(out: PaneSpan[], s: PaneSpan): void {
  if (s.text === '') return;
  const last = out[out.length - 1];
  if (last && sameStyle(last, s)) last.text += s.text;
  else out.push(s);
}

/**
 * `t` (no `\n` in it) as spans. Text and runs must agree as parseCecho
 * makes them; control characters are cleaned per span.
 */
export function toSpans(t: StyledText): PaneSpan[] {
  const out: PaneSpan[] = [];
  let pos = 0;
  for (const r of t.runs) {
    if (r.start > pos) pushSpan(out, span(clean(t.text.slice(pos, r.start)), null));
    pushSpan(out, span(clean(t.text.slice(r.start, r.end)), r));
    pos = Math.max(pos, r.end);
  }
  if (pos < t.text.length) pushSpan(out, span(clean(t.text.slice(pos)), null));
  return out;
}

/** Splits styled text at each `\n` (runs cut and shifted). */
export function splitLines(t: StyledText): StyledText[] {
  if (t.text.indexOf('\n') < 0) return [t];
  const out: StyledText[] = [];
  let start = 0;
  for (;;) {
    const nl = t.text.indexOf('\n', start);
    const end = nl < 0 ? t.text.length : nl;
    const runs: StyleRun[] = [];
    for (const r of t.runs) {
      const a = Math.max(r.start, start);
      const b = Math.min(r.end, end);
      if (b > a) runs.push({ ...r, start: a - start, end: b - start });
    }
    out.push({ text: t.text.slice(start, end), runs });
    if (nl < 0) return out;
    start = nl + 1;
  }
}

/** The number of cells of a line (0 for a gauge). */
export function lineCells(l: PaneLine): number {
  if (!('spans' in l)) return 0;
  let n = 0;
  for (const s of l.spans) n += s.text.length;
  return n;
}

/** Cuts spans to `max` cells. */
function clip(spans: PaneSpan[], max: number): PaneSpan[] {
  let n = 0;
  const out: PaneSpan[] = [];
  for (const s of spans) {
    if (n >= max) break;
    const room = max - n;
    out.push(s.text.length <= room ? s : { ...s, text: s.text.slice(0, room) });
    n += Math.min(room, s.text.length);
  }
  return out;
}

export interface PaneContentOptions {
  /** A link was dropped (replaced, cleared, scrolled out or its row redrawn). */
  onDrop?: (id: number) => void;
  /** Most lines kept (default MAX_LINES; tests). */
  maxLines?: number;
}

export class PaneContent {
  title: string;
  lines: PaneLine[] = [];
  links: PaneLink[] = [];
  /** Bumped by every change (renderers compare it). */
  version = 0;
  /** The last append ended with `\n`: the next one starts a new line. */
  private broken = false;
  private readonly onDrop: (id: number) => void;
  private readonly maxLines: number;

  constructor(title: string, opts: PaneContentOptions = {}) {
    this.title = title.slice(0, MAX_TITLE);
    this.onDrop = opts.onDrop ?? (() => {});
    this.maxLines = opts.maxLines ?? MAX_LINES;
  }

  setTitle(title: string): void {
    const t = clean(title.replace(/\n/g, ' ')).slice(0, MAX_TITLE);
    if (t === this.title) return;
    this.title = t;
    this.version++;
  }

  /** Empties the pane (lines and links). */
  clear(): void {
    for (const l of this.links) this.onDrop(l.id);
    this.links = [];
    this.lines = [];
    this.broken = false;
    this.version++;
  }

  /** Appends text (see the file header); returns the row and column where it started. */
  append(t: StyledText): { row: number; col: number } {
    const parts = splitLines(t);
    // "a\n" splits into "a" and "": the empty tail only marks the break.
    const trailing = t.text.endsWith('\n');
    if (trailing) parts.pop();
    let start: { row: number; col: number } | null = null;
    parts.forEach((p, i) => {
      const last = this.lines[this.lines.length - 1];
      // A gauge row is never written into: the text goes on a new line.
      if (i > 0 || this.broken || !last || !('spans' in last)) this.newLine();
      const row = this.lines.length - 1;
      const target = this.lines[row] as { spans: PaneSpan[] };
      start ??= { row, col: lineCells(target) };
      for (const s of toSpans(p)) pushSpan(target.spans, s);
      target.spans = clip(target.spans, MAX_LINE_CELLS);
    });
    this.broken = trailing;
    const shifted = this.trim();
    this.version++;
    const s = start ?? { row: 0, col: 0 };
    return { row: Math.max(0, s.row - shifted), col: s.col };
  }

  private newLine(): void {
    this.lines.push({ spans: [] });
  }

  /** Drops the oldest lines past the cap and moves the links up; returns how many went. */
  private trim(): number {
    const over = this.lines.length - this.maxLines;
    if (over <= 0) return 0;
    this.lines.splice(0, over);
    const kept: PaneLink[] = [];
    for (const l of this.links) {
      if (l.row < over) this.onDrop(l.id);
      else kept.push({ ...l, row: l.row - over });
    }
    this.links = kept;
    return over;
  }

  /** Grows the list to hold `row` (0-based). */
  private ensure(row: number): void {
    if (row >= this.maxLines) throw new RangeError(`row ${row + 1} is past the last row (${this.maxLines})`);
    while (this.lines.length <= row) this.newLine();
  }

  /** Drops the links on `row`. */
  private dropRow(row: number): void {
    if (!this.links.some((l) => l.row === row)) return;
    this.links = this.links.filter((l) => {
      if (l.row !== row) return true;
      this.onDrop(l.id);
      return false;
    });
  }

  /** Replaces row `row` with `t` (one line: `\n` becomes a space). */
  setLine(row: number, t: StyledText): void {
    this.ensure(row);
    const one = t.text.indexOf('\n') < 0 ? t : { text: t.text.replace(/\n/g, ' '), runs: t.runs };
    this.dropRow(row);
    this.lines[row] = { spans: clip(toSpans(one), MAX_LINE_CELLS) };
    this.version++;
  }

  /** Replaces row `row` with a gauge. */
  setGauge(row: number, g: PaneGauge): void {
    this.ensure(row);
    this.dropRow(row);
    const max = Number.isFinite(g.max) && g.max > 0 ? g.max : 1;
    const value = Number.isFinite(g.value) ? Math.max(0, Math.min(max, g.value)) : 0;
    const gauge: PaneGauge = { value, max, label: clean(g.label.replace(/\n/g, ' ')).slice(0, MAX_LINE_CELLS) };
    if (g.color !== undefined) gauge.color = g.color;
    this.lines[row] = { gauge };
    this.version++;
  }

  /**
   * Makes `len` cells of `row` from `col` a link (`id`, `hint`); the row
   * need not have text there. Links it overlaps on that row are dropped.
   */
  addLink(row: number, col: number, len: number, id: number, hint: string): void {
    this.ensure(row);
    const c = Math.max(0, Math.floor(col));
    const n = Math.max(1, Math.min(MAX_LINE_CELLS - c, Math.floor(len)));
    if (c >= MAX_LINE_CELLS) throw new RangeError(`column ${c + 1} is past the last column (${MAX_LINE_CELLS})`);
    this.links = this.links.filter((l) => {
      const overlap = l.row === row && l.col < c + n && c < l.col + l.len;
      if (overlap) this.onDrop(l.id);
      return !overlap;
    });
    this.links.push({ row, col: c, len: n, hint: clean(hint).slice(0, MAX_HINT), id });
    this.version++;
  }

  /** Appends `t` as a link (`id`, `hint`) to the last line (as `append`). */
  appendLink(t: StyledText, id: number, hint: string): void {
    const one = t.text.indexOf('\n') < 0 ? t : { text: t.text.replace(/\n/g, ' '), runs: t.runs };
    const at = this.append(one);
    const len = Math.min(toSpans(one).reduce((n, s) => n + s.text.length, 0), MAX_LINE_CELLS - at.col);
    if (len > 0) this.addLink(at.row, at.col, len, id, hint);
    else this.onDrop(id);
  }

  /** The link covering cell (`row`, `col`), or null. */
  linkAt(row: number, col: number): PaneLink | null {
    for (let i = this.links.length - 1; i >= 0; i--) {
      const l = this.links[i]!;
      if (l.row === row && col >= l.col && col < l.col + l.len) return l;
    }
    return null;
  }

  /** Plain data for runs: a deep copy without link ids. */
  snapshot(): PaneSnapshot {
    return {
      title: this.title,
      lines: this.lines.map((l) => ('spans' in l ? { spans: l.spans.map((s) => ({ ...s })) } : { gauge: { ...l.gauge } })),
      links: this.links.map(({ row, col, len, hint }) => ({ row, col, len, hint })),
    };
  }

  /**
   * Replaces the whole content with a snapshot (the log player; links get
   * ids 1, 2, … and do nothing). Dropped links are not reported.
   */
  load(s: PaneSnapshot): void {
    this.title = s.title;
    this.lines = s.lines.map((l) => ('spans' in l ? { spans: l.spans.map((x) => ({ ...x })) } : { gauge: { ...l.gauge } }));
    this.links = s.links.map((l, i) => ({ ...l, id: i + 1 }));
    this.broken = false;
    this.version++;
  }

  /** Content from a snapshot (see `load`). */
  static fromSnapshot(s: PaneSnapshot): PaneContent {
    const c = new PaneContent(s.title);
    c.load(s);
    return c;
  }
}
