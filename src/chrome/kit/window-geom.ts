// Window geometry (stage 30 S8, ADR 0103): pure functions in whole cells
// on the cockpit's grid (origin at the cockpit element's top left, as the
// panes; `cols × rows` whole cells).
//
// A window's rectangle is its outer box. The title bar is its top row,
// the content grid is inset one cell on the left, right and bottom (the
// thin border and the resize bands live in those cells), so the content
// is `w - 2 × h - 2` cells.
//
// - Minimum content 60 × 18 cells (outer 62 × 20). A screen smaller than
//   that along an axis makes the window fill the screen along it.
// - Always fully on screen: `fitRect` shrinks, then moves.
// - Default: about 80% of the screen, centred, at least the minimum.
// - Drags and resizes move whole cells (`cellDelta` rounds the pointer's
//   pixel offset) and are clamped to the screen and the minimum.

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CellGrid {
  cols: number;
  rows: number;
}

/** Cells the frame takes around the content: one column each side, the title row and one bottom row. */
export const FRAME_W = 2;
export const FRAME_H = 2;
/** The least content size, in cells. */
export const MIN_CONTENT_COLS = 60;
export const MIN_CONTENT_ROWS = 18;
export const MIN_W = MIN_CONTENT_COLS + FRAME_W;
export const MIN_H = MIN_CONTENT_ROWS + FRAME_H;
/** Share of the screen a window covers by default. */
export const DEFAULT_SHARE = 0.8;

/** Which edge or corner a resize drags. */
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const EDGES: readonly Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The least outer size on `grid`: the minimum, or the whole screen along an axis that is smaller. */
export function minSize(grid: CellGrid): { w: number; h: number } {
  return { w: Math.min(MIN_W, Math.max(0, grid.cols)), h: Math.min(MIN_H, Math.max(0, grid.rows)) };
}

/**
 * `r` as shown on `grid`: whole cells, at least the minimum (or the whole
 * screen along a short axis), at most the screen, fully on screen.
 */
export function fitRect(r: CellRect, grid: CellGrid): CellRect {
  const cols = Math.max(0, Math.floor(grid.cols));
  const rows = Math.max(0, Math.floor(grid.rows));
  const m = minSize({ cols, rows });
  const w = cols < MIN_W ? cols : clamp(Math.round(r.w), m.w, cols);
  const h = rows < MIN_H ? rows : clamp(Math.round(r.h), m.h, rows);
  return {
    x: clamp(Math.round(r.x), 0, cols - w),
    y: clamp(Math.round(r.y), 0, rows - h),
    w,
    h,
  };
}

/**
 * The default rectangle on `grid`: about 80% of the screen, centred, at
 * least the minimum; `offset` cells right and down (the second window
 * opened beside the first).
 */
export function defaultRect(grid: CellGrid, offset = 0): CellRect {
  const w = Math.max(MIN_W, Math.floor(grid.cols * DEFAULT_SHARE));
  const h = Math.max(MIN_H, Math.floor(grid.rows * DEFAULT_SHARE));
  const x = Math.floor((grid.cols - w) / 2) + offset;
  const y = Math.floor((grid.rows - h) / 2) + offset;
  return fitRect({ x, y, w, h }, grid);
}

/** Whole cells for a pointer offset of `px` pixels (cells of `cell` px). */
export function cellDelta(px: number, cell: number): number {
  return cell > 0 ? Math.round(px / cell) : 0;
}

/** `start` moved by `dx × dy` cells, kept on screen. */
export function moveRect(start: CellRect, dx: number, dy: number, grid: CellGrid): CellRect {
  return fitRect({ ...start, x: start.x + dx, y: start.y + dy }, grid);
}

/**
 * `start` resized by dragging `edge` by `dx × dy` cells: the opposite
 * edges stay put, the size stays between the minimum and the screen.
 */
export function resizeRect(start: CellRect, edge: Edge, dx: number, dy: number, grid: CellGrid): CellRect {
  const s = fitRect(start, grid);
  const m = minSize(grid);
  let { x, y, w, h } = s;
  if (edge.includes('e')) w = clamp(s.w + dx, m.w, grid.cols - s.x);
  if (edge.includes('w')) {
    const right = s.x + s.w;
    x = clamp(s.x + dx, 0, right - m.w);
    w = right - x;
  }
  if (edge.includes('s')) h = clamp(s.h + dy, m.h, grid.rows - s.y);
  if (edge.includes('n')) {
    const bottom = s.y + s.h;
    y = clamp(s.y + dy, 0, bottom - m.h);
    h = bottom - y;
  }
  return fitRect({ x, y, w, h }, grid);
}

/** True when `a` and `b` are the same rectangle. */
export function sameRect(a: CellRect | null, b: CellRect | null): boolean {
  return a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
}
