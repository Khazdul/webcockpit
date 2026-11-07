// Window geometry (stage 30 S8, ADR 0103): pure functions in whole cells
// on the cockpit's grid (origin at the cockpit element's top left, as the
// panes; `cols × rows` whole cells).
//
// A window's rectangle is its outer box, in whole cells. Inside it the
// Lykta frame (stage 42d, ADR 0127) is drawn in CSS px: a 5 px iron band,
// the hood over the top of the lit window, the lit window's 1 px edge.
// What is left is the body (`windowBody`): free DOM for look frames, and
// for old-look frames the largest whole-cell grid that fits it, centred
// (at the default cell size that is `w - 2 × h - 2` cells, as the old
// one-cell frame gave).
//
// - Minimum 62 × 20 cells outer (it was 60 × 18 content cells in a one-cell
//   frame; at least 360 × 260 CSS px at the default cell size). A screen
//   smaller than that along an axis makes the window fill the screen along it.
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

/** The frame's budget in cells for the minimum (one column each side, the title row and one bottom row). */
export const FRAME_W = 2;
export const FRAME_H = 2;
/** The least content size, in cells (the minimum's measure: an old-look grid at the default cell size). */
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

// ------------------------------------------------------------ the body (px)

/** The Lykta frame's iron band, CSS px (every side). */
export const BAND_PX = 5;
/** The lit window's edge (its 1 px black border), CSS px. */
export const GLASS_EDGE_PX = 1;
/** Room under the hood at the top of the lit window, CSS px (the hood hangs 23 px from the window's top). */
export const HOOD_PX = 19;
/** The least room between an old-look grid and the lit window's edge, CSS px (right and bottom; the grid is centred). */
export const GRID_GAP_PX = 2;

/** A window's body: the lit window's content box, and the old-look cell grid centred in it. */
export interface WindowBody {
  /** The content box, CSS px (below the hood, inside the lit window's edge). */
  w: number;
  h: number;
  /** The old-look grid in whole cells. */
  cols: number;
  rows: number;
  /** The grid's offset in the content box, whole CSS px (centred). */
  left: number;
  top: number;
}

/** The body of a window of `rect` cells, with cells of `cellW × cellH` px. */
export function windowBody(rect: CellRect, cellW: number, cellH: number): WindowBody {
  const edge = BAND_PX + GLASS_EDGE_PX;
  const w = Math.max(0, rect.w * cellW - 2 * edge);
  const h = Math.max(0, rect.h * cellH - 2 * edge - HOOD_PX);
  const fit = (px: number, cell: number): number => (cell > 0 ? Math.max(0, Math.floor((px - 2 * GRID_GAP_PX) / cell + 1e-6)) : 0);
  const cols = fit(w, cellW);
  const rows = cellH > 0 ? Math.max(0, Math.floor((h - GRID_GAP_PX) / cellH + 1e-6)) : 0;
  return {
    w,
    h,
    cols,
    rows,
    left: Math.max(0, Math.floor((w - cols * cellW) / 2)),
    top: Math.max(0, Math.floor((h - rows * cellH) / 2)),
  };
}
