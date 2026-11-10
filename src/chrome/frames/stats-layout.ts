// Statistics (Inv §7.3): pure layout for the renderer in statistics.tsx.
// Widths, table sorting and cells, the sparklines and the XP ruler as rows
// of coloured segments. No DOM; unit tested.
//
// Geometry (one side = a table of T cells, 2 blank cells, a scrollbar cell):
//
//   ALLIES ……………………… T    ▒  ACHIEVEMENTS ……… T    ▒
//   |<------ T ------>|  |  |  |<------ T ------>|  |
//                      2  1  2                     2  1      total = 2T + 8
//
// The ruler spans the whole width; each sparkline its side's table.

import { xpForLevel } from '../../gmcp/levels';
import type { KillRow, PvpRow, XpRuler } from '../../runs/stats';
import { cellLen, truncate } from '../kit/nav';

/** A run of text in one colour class. */
export interface Seg {
  text: string;
  cls?: string;
}

/** Widest content (Inv §7.3: the 84-wide ruler). */
export const STATS_MAX_W = 84;

/** Table width per side and the total width for a grid `cols` wide. */
export function statsWidths(cols: number): { T: number; total: number } {
  const total = Math.max(40, Math.min(cols, STATS_MAX_W));
  const T = Math.floor((total - 8) / 2);
  return { T, total: 2 * T + 8 };
}

// ------------------------------------------------------------- fitting

/**
 * Narrowest grid that takes the two sides (T = 28, a KILLS name column of
 * 8 cells): a phone frame stacks below it (ADR 0075 §3.2), the pane goes
 * narrow (ADR 0109).
 */
export const STATS_WIDE_MIN_COLS = 64;
/** Rows of the sparklines (a blank, the title, the rule, 3 bars, the axis, the labels). */
export const STATS_SPARK_ROWS = 8;
/** Rows of the XP ruler (a blank and three rows). */
export const STATS_RULER_ROWS = 4;
/** Rows the pane's wide layout always takes: header, blank, 4 (allies), blank, title + divider, Total. */
export const STATS_PANE_FIXED_ROWS = 10;
/** KILLS / PvPs rows the wide layout keeps at least. */
export const STATS_MIN_DATA_ROWS = 2;

/**
 * What fits a body `rows` tall when `fixed` rows are always taken: the
 * sparklines, then the ruler, as far as they fit after two data rows, and
 * the KILLS / PvPs rows (the rest, at least two).
 */
export function statsFit(rows: number, fixed: number): { showSpark: boolean; showRuler: boolean; fitRows: number } {
  let rest = rows - fixed - STATS_MIN_DATA_ROWS;
  const showSpark = rest >= STATS_SPARK_ROWS;
  if (showSpark) rest -= STATS_SPARK_ROWS;
  const showRuler = rest >= STATS_RULER_ROWS;
  if (showRuler) rest -= STATS_RULER_ROWS;
  return { showSpark, showRuler, fitRows: STATS_MIN_DATA_ROWS + Math.max(0, rest) };
}

/**
 * The first of `candidates` (longest first) that fits `cols` cells; the
 * last one cut with `…` when none does.
 */
export function fitHeader(candidates: readonly string[], cols: number): string {
  for (const c of candidates) if (cellLen(c) <= cols) return c;
  return truncate(candidates[candidates.length - 1] ?? '', cols);
}

// ------------------------------------------------------------ formatting

/** `950`, `9.1k`, `48.2k`, `482k`, `1.2M`, `12M` (negative with `-`). */
export function fmtK(n: number): string {
  const v = Math.round(Math.abs(n));
  const sign = n < 0 && v > 0 ? '-' : '';
  let s: string;
  if (v < 1000) s = String(v);
  else if (v < 99_950) s = (v / 1000).toFixed(1) + 'k';
  else if (v < 999_500) s = Math.round(v / 1000) + 'k';
  else if (v < 9_950_000) s = (v / 1e6).toFixed(1) + 'M';
  else s = Math.round(v / 1e6) + 'M';
  return sign + s;
}

/** The header's run duration: `2h 14m`, `14m`. */
export function fmtRunDur(us: number): string {
  const m = Math.max(0, Math.floor(us / 60e6));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Sparkline x-axis: `00:00`, `34:12`, `2:14:00`. */
export function fmtClock(us: number): string {
  const s = Math.max(0, Math.floor(us / 1e6));
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${p2(Math.floor(s / 60) % 60)}:${p2(s % 60)}` : `${p2(Math.floor(s / 60))}:${p2(s % 60)}`;
}

/** A number in `w` cells: plain when it fits, else k-formatted. */
export function fitNum(n: number, w: number): string {
  const plain = String(Math.round(n));
  return (plain.length <= w ? plain : fmtK(n)).padStart(w);
}

/** A PvP label cut to `w` cells with the `…` inside the asterisks. */
export function pvpLabel(label: string, w: number): string {
  if (cellLen(label) <= w) return label;
  const inner = label.replace(/^\*|\*$/g, '');
  return '*' + truncate(inner, Math.max(1, w - 2)) + '*';
}

// ----------------------------------------------------------------- tables

export type KillSortKey = 'name' | 'n' | 'xpPer' | 'xpTotal';
export type PvpSortKey = 'name' | 'n' | 'xp';

export interface StatSort<K extends string> {
  key: K;
  dir: 1 | -1;
}

export const DEFAULT_KILL_SORT: StatSort<KillSortKey> = {
  key: 'xpTotal',
  dir: -1,
};
export const DEFAULT_PVP_SORT: StatSort<PvpSortKey> = { key: 'xp', dir: -1 };

/** Same column flips; a new column starts at its type's default (text ▲, numbers ▼). */
export function nextStatSort<K extends string>(cur: StatSort<K>, key: K): StatSort<K> {
  if (cur.key === key) return { key, dir: cur.dir > 0 ? -1 : 1 };
  return { key, dir: key === 'name' ? 1 : -1 };
}

export function sortKills(rows: readonly KillRow[], s: StatSort<KillSortKey>): KillRow[] {
  return [...rows].sort((a, b) => {
    const d = s.key === 'name' ? a.name.localeCompare(b.name) : a[s.key] - b[s.key];
    return d * s.dir || b.xpTotal - a.xpTotal || a.name.localeCompare(b.name);
  });
}

export function sortPvps(rows: readonly PvpRow[], s: StatSort<PvpSortKey>): PvpRow[] {
  return [...rows].sort((a, b) => {
    const d = s.key === 'name' ? a.label.localeCompare(b.label) : a[s.key] - b[s.key];
    return d * s.dir || b.xp - a.xp || a.label.localeCompare(b.label);
  });
}

/** A table column: its title, its width, and how it sorts. */
export interface StatCol<K extends string> {
  key: K;
  title: string;
  width: number;
  align: 'left' | 'right';
}

export function killCols(T: number): StatCol<KillSortKey>[] {
  return [
    { key: 'name', title: 'KILLS', width: T - 20, align: 'left' },
    { key: 'n', title: 'N', width: 4, align: 'right' },
    { key: 'xpPer', title: 'XP/N', width: 7, align: 'right' },
    { key: 'xpTotal', title: 'XP tot', width: 9, align: 'right' },
  ];
}

export function pvpCols(T: number): StatCol<PvpSortKey>[] {
  return [
    { key: 'name', title: 'PvPs', width: T - 13, align: 'left' },
    { key: 'n', title: 'N', width: 4, align: 'right' },
    { key: 'xp', title: 'XP', width: 9, align: 'right' },
  ];
}

/**
 * The title row of a sortable table: each title (plus ` ▲`/` ▼` on the
 * sorted column) placed in its column, left- or right-aligned. Returns the
 * segments with the column key of each title, and the gaps as plain text.
 */
export function titleSegs<K extends string>(cols: readonly StatCol<K>[], sort: StatSort<K>): Array<Seg & { key?: K }> {
  const out: Array<Seg & { key?: K }> = [];
  let pos = 0; // cells written so far
  let x = 0; // left edge of the current column
  for (const c of cols) {
    const t = c.title + (sort.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : '');
    const w = cellLen(t);
    const at = c.align === 'left' ? x : Math.max(pos, x + c.width - w);
    if (at > pos) out.push({ text: ' '.repeat(at - pos) });
    out.push({ text: t, key: c.key });
    pos = at + w;
    x += c.width;
  }
  if (x > pos) out.push({ text: ' '.repeat(x - pos) });
  return out;
}

/** A data row: the name with its glyph, then the numbers, as one string per column. */
export function killCells(r: KillRow, cols: readonly StatCol<KillSortKey>[]): string[] {
  const [name, n, per, tot] = cols as [
    StatCol<KillSortKey>,
    StatCol<KillSortKey>,
    StatCol<KillSortKey>,
    StatCol<KillSortKey>,
  ];
  return [
    truncate(r.name, name.width - 1).padEnd(name.width),
    fitNum(r.n, n.width),
    fitNum(r.xpPer, per.width),
    fitNum(r.xpTotal, tot.width),
  ];
}

/** `⚔ *Name the Race*` cut to the name column (the glyph is a separate segment). */
export function pvpCells(r: PvpRow, cols: readonly StatCol<PvpSortKey>[]): string[] {
  const [name, n, xp] = cols as [StatCol<PvpSortKey>, StatCol<PvpSortKey>, StatCol<PvpSortKey>];
  return [pvpLabel(r.label, name.width - 3).padEnd(name.width - 2), fitNum(r.n, n.width), fitNum(r.xp, xp.width)];
}

/** Allies two per row (row-major over the alphabetical list). */
export function allyPairs(allies: readonly string[]): Array<[string, string | undefined]> {
  const out: Array<[string, string | undefined]> = [];
  for (let i = 0; i < allies.length; i += 2) out.push([allies[i]!, allies[i + 1]]);
  return out;
}

// -------------------------------------------------------------- sparklines

const EIGHTHS = '▁▂▃▄▅▆▇█';

/** Rows of a chart: `values` scaled to `rows` × 8 levels, top row first. A positive value shows at least ▁. */
export function sparkRows(values: readonly number[], rows = 3): string[] {
  const max = Math.max(0, ...values);
  const levels = rows * 8;
  const h = values.map((v) => (max <= 0 || v <= 0 ? 0 : Math.max(1, Math.round((v / max) * levels))));
  return Array.from({ length: rows }, (_, r) => {
    const base = (rows - 1 - r) * 8;
    return h.map((x) => (x <= base ? ' ' : EIGHTHS[Math.min(8, x - base) - 1]!)).join('');
  });
}

/** Y labels for a chart's rows: max, half, 0 (5 cells, right-aligned). */
export function sparkLabels(max: number): string[] {
  return [fmtK(max), fmtK(max / 2), '0'].map((s) => s.padStart(5));
}

/** Buckets per sparkline for a table `T` wide (Inv §7.3: width − 7). */
export const sparkBuckets = (T: number): number => Math.max(1, T - 7);

// ---------------------------------------------------------------- ruler

/** The three ruler rows (label, bar, level marks), each exactly `width` cells. */
export function rulerRows(r: XpRuler, width: number): { label: Seg[]; bar: Seg[]; marks: Seg[] } {
  const w = Math.max(10, width);
  const span = Math.max(1, r.toXp - r.fromXp);
  const col = (xp: number): number => Math.max(0, Math.min(w, Math.round(((xp - r.fromXp) / span) * w)));
  const lo = Math.min(r.startXp, r.nowXp);
  const hi = Math.max(r.startXp, r.nowXp);
  let a = col(lo);
  let b = col(hi);
  if (r.delta !== 0 && b - a < 1) {
    if (b < w) b = a + 1;
    else a = b - 1;
  }
  const loss = r.delta < 0;
  const band = loss ? 'wc-st-loss' : 'wc-st-gained';

  // Bar.
  const bar: Seg[] = [];
  if (a > 0) bar.push({ text: '█'.repeat(a), cls: 'wc-st-track' });
  if (b > a) bar.push({ text: '█'.repeat(b - a), cls: band });
  if (w > b) bar.push({ text: '█'.repeat(w - b), cls: 'wc-st-track' });

  // Label: ▌◄▬▬ N XP ▬▬►▐ over the band, or a plain `N XP` centred on it.
  const num = (loss ? '-' : '') + fmtK(Math.abs(r.delta));
  const inner = ` ${num} XP `;
  const bw = b - a;
  const label: Seg[] = [];
  if (bw >= cellLen(inner) + 6) {
    const fill = bw - cellLen(inner) - 4;
    const l = Math.floor(fill / 2);
    if (a > 0) label.push({ text: ' '.repeat(a) });
    label.push({ text: '▌◄' + '▬'.repeat(l), cls: 'wc-st-arrow' });
    label.push({ text: inner, cls: band });
    label.push({ text: '▬'.repeat(fill - l) + '►▐', cls: 'wc-st-arrow' });
    if (w > b) label.push({ text: ' '.repeat(w - b) });
  } else {
    const t = `${num} XP`;
    const tw = cellLen(t);
    const at = Math.max(0, Math.min(w - tw, Math.round((a + b) / 2 - tw / 2)));
    if (at > 0) label.push({ text: ' '.repeat(at) });
    label.push({ text: t, cls: band });
    if (w - at - tw > 0) label.push({ text: ' '.repeat(w - at - tw) });
  }

  // Level marks: `▌73` at each boundary, `74▐` on the last one.
  const cells: Array<{ ch: string; cls?: string }> = Array.from({ length: w }, () => ({ ch: ' ' }));
  const put = (at: number, s: string, cls: string): void => {
    [...s].forEach((ch, i) => {
      if (at + i >= 0 && at + i < w) cells[at + i] = { ch, cls };
    });
  };
  for (let L = r.fromLevel; L <= r.toLevel; L++) {
    const c = col(xpForLevel(L));
    const digits = String(L);
    if (L === r.toLevel) {
      const end = Math.min(w - 1, Math.max(c - 1, digits.length));
      put(end - digits.length, digits, 'wc-st-label');
      put(end, '▐', 'wc-st-track');
    } else {
      const at = Math.min(c, w - 1 - digits.length);
      put(at, '▌', 'wc-st-track');
      put(at + 1, digits, 'wc-st-label');
    }
  }
  const marks: Seg[] = [];
  for (const c of cells) {
    const last = marks[marks.length - 1];
    if (last && last.cls === c.cls) last.text += c.ch;
    else marks.push({ text: c.ch, cls: c.cls });
  }
  return { label, bar, marks };
}

/** The plain text of segments (tests). */
export const segText = (segs: readonly Seg[]): string => segs.map((s) => s.text).join('');
