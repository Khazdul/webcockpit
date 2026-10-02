// Tiled groups of temporary panes (stage 12 round 8, ADR 0053 addendum):
// the pure tiling and its inverse for a drag.
import { describe, expect, it } from 'vitest';
import { TILE_MIN_H, cornerOrigin, originFor, tileCorner, tileRects } from '../../src/layout/tiles';

const game = { x: 0, y: 0, w: 120, h: 40 };
const spec = (o: Partial<Parameters<typeof tileRects>[2]> = {}) => ({ cols: 2, corner: 'top-left' as const, tile: { w: 52, h: 12 }, origin: null, ...o });

describe('tileRects', () => {
  it('row-major from the top left in opening order, no gaps: 1, right of 1, below 1, below 2', () => {
    const l = tileRects(game, 4, spec());
    expect(l.rects).toEqual([
      { x: 0, y: 0, w: 52, h: 12 },
      { x: 52, y: 0, w: 52, h: 12 },
      { x: 0, y: 12, w: 52, h: 12 },
      { x: 52, y: 12, w: 52, h: 12 },
    ]);
    // Closing the second: the rest reflow in order (3 takes 2's place, 4 takes 3's).
    expect(tileRects(game, 3, spec()).rects.map((r) => [r.x, r.y])).toEqual([
      [0, 0],
      [52, 0],
      [0, 12],
    ]);
  });

  it('grows away from its corner', () => {
    expect(tileRects(game, 3, spec({ corner: 'top-right' })).rects.map((r) => [r.x, r.y])).toEqual([
      [68, 0],
      [16, 0],
      [68, 12],
    ]);
    expect(tileRects(game, 3, spec({ corner: 'bottom-left' })).rects.map((r) => [r.x, r.y])).toEqual([
      [0, 28],
      [52, 28],
      [0, 16],
    ]);
    expect(tileRects(game, 2, spec({ corner: 'bottom-right' })).rects.map((r) => [r.x, r.y])).toEqual([
      [68, 28],
      [16, 28],
    ]);
    expect(cornerOrigin(game, 'bottom-right', 52, 12)).toEqual({ x: 68, y: 28 });
    expect(tileCorner('center')).toBe('top-left');
    expect(tileCorner('bottom-right')).toBe('bottom-right');
  });

  it('wraps to fewer columns, then shortens tiles, never below the minimum (the caller clamps the rest)', () => {
    // 80 wide: one column fits.
    const narrow = tileRects({ x: 0, y: 0, w: 80, h: 60 }, 3, spec());
    expect(narrow.cols).toBe(1);
    expect(narrow.rects.map((r) => r.y)).toEqual([0, 12, 24]);
    // 30 high, three rows needed: tiles of 10.
    const short = tileRects({ x: 0, y: 0, w: 60, h: 30 }, 3, spec());
    expect(short.h).toBe(10);
    // Very low: the minimum height, overlapping past the edge.
    const low = tileRects({ x: 0, y: 0, w: 60, h: 8 }, 3, spec());
    expect(low.h).toBe(TILE_MIN_H);
    // One member: one column whatever cols says.
    expect(tileRects(game, 1, spec({ cols: 4 })).cols).toBe(1);
  });

  it("a moved group starts at its origin; originFor is the inverse of a member's drop", () => {
    const moved = tileRects(game, 4, spec({ origin: { x: 5, y: 3 } }));
    expect(moved.rects[3]).toEqual({ x: 57, y: 15, w: 52, h: 12 });
    // Member 4 (index 3) dropped at (60, 20): the group's origin follows.
    expect(originFor({ x: 60, y: 20, w: 52, h: 12 }, 3, 2, 'top-left')).toEqual({ x: 8, y: 8 });
    expect(originFor({ x: 10, y: 20, w: 52, h: 12 }, 1, 2, 'top-right')).toEqual({ x: 62, y: 20 });
    // A resize: the new size, and the origin from the resized member.
    const r = tileRects(game, 2, spec({ tile: { w: 40, h: 10 }, origin: originFor({ x: 40, y: 0, w: 40, h: 10 }, 1, 2, 'top-left') }));
    expect(r.rects).toEqual([
      { x: 0, y: 0, w: 40, h: 10 },
      { x: 40, y: 0, w: 40, h: 10 },
    ]);
  });
});
