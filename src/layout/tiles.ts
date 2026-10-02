// Tiled groups of temporary panes (ADR 0053 addendum, stage 12 round 8).
// Pure: where the members of a group go, and the inverse for a drag.
//
// A group is the temporary panes of one script with the same `group`.
// They are tiled in a grid anchored at a corner of the game pane, row-major
// in the order they were opened, without gaps (a closed member's place is
// taken by reflowing the ones after it). The grid grows away from its
// corner: `top-left` right and down, `top-right` left and down,
// `bottom-left` right and up, `bottom-right` left and up. Tiles abut (no
// gutter: the frames make the seams).
//
// Fitting: fewer columns when the row does not fit the game pane (down to
// one); then shorter tiles (down to `minH`) when the rows do not fit; the
// caller clamps each rectangle to the cockpit, so what still does not fit
// overlaps at the edge.

import type { Rect } from './allocate';

export type TileCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface TileSpec {
  /** Wanted columns of the grid. */
  cols: number;
  corner: TileCorner;
  /** Outer tile size in cells (frame included). */
  tile: { w: number; h: number };
  /** The first tile's top-left corner, when the player moved the group; null: the game pane's corner. */
  origin: { x: number; y: number } | null;
}

export interface TileLayout {
  rects: Rect[];
  /** The columns and tile height used (after fitting). */
  cols: number;
  h: number;
  /** The first tile's top-left corner used. */
  origin: { x: number; y: number };
}

/** Smallest tile height when the rows are squeezed (frame + 3 rows). */
export const TILE_MIN_H = 5;

const right = (c: TileCorner): boolean => c.endsWith('right');
const bottom = (c: TileCorner): boolean => c.startsWith('bottom');

/** The corner of the game pane the first tile sits in. */
export function cornerOrigin(game: Rect, corner: TileCorner, w: number, h: number): { x: number; y: number } {
  return { x: right(corner) ? game.x + game.w - w : game.x, y: bottom(corner) ? game.y + game.h - h : game.y };
}

/** Where `n` members go in `game` (see the file header). */
export function tileRects(game: Rect, n: number, spec: TileSpec, minH = TILE_MIN_H): TileLayout {
  const w = Math.max(1, Math.round(spec.tile.w));
  let h = Math.max(1, Math.round(spec.tile.h));
  const origin = spec.origin ?? cornerOrigin(game, spec.corner, w, h);
  const dx = right(spec.corner) ? -1 : 1;
  const dy = bottom(spec.corner) ? -1 : 1;
  // Room from the first tile towards the growth direction.
  const roomW = dx > 0 ? game.x + game.w - origin.x : origin.x + w - game.x;
  const roomH = dy > 0 ? game.y + game.h - origin.y : origin.y + h - game.y;
  const cols = Math.max(1, Math.min(Math.max(1, Math.floor(spec.cols)), Math.floor(roomW / w) || 1, Math.max(1, n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  if (rows * h > roomH) h = Math.max(Math.min(h, minH), Math.floor(roomH / rows));
  // A bottom anchor keeps the first tile's bottom edge.
  const top0 = dy > 0 ? origin.y : origin.y + Math.round(spec.tile.h) - h;
  const rects: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    rects.push({ x: origin.x + dx * c * w, y: top0 + dy * r * h, w, h });
  }
  return { rects, cols, h, origin };
}

/**
 * The group's new first-tile corner when member `index` was dropped at
 * `rect` (a move, or a resize with the new size), with `cols` columns as
 * laid out (TileLayout.cols): every member follows.
 */
export function originFor(rect: Rect, index: number, cols: number, corner: TileCorner): { x: number; y: number } {
  const c = index % Math.max(1, cols);
  const r = Math.floor(index / Math.max(1, cols));
  const dx = right(corner) ? -1 : 1;
  const dy = bottom(corner) ? -1 : 1;
  return { x: rect.x - dx * c * rect.w, y: rect.y - dy * r * rect.h };
}

/** A temporary pane's `at` as a grid corner (an edge or the centre: top-left). */
export function tileCorner(at: string): TileCorner {
  return at === 'top-right' || at === 'bottom-left' || at === 'bottom-right' ? at : 'top-left';
}
