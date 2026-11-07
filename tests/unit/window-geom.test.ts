import { describe, expect, it } from 'vitest';
import {
  BAND_PX,
  GLASS_EDGE_PX,
  GRID_GAP_PX,
  HOOD_PX,
  MIN_H,
  MIN_W,
  windowBody,
  cellDelta,
  defaultRect,
  fitRect,
  minSize,
  moveRect,
  resizeRect,
  sameRect,
} from '../../src/chrome/kit/window-geom';

const G = { cols: 160, rows: 50 };

describe('window geometry (ADR 0103)', () => {
  it('has a 60 × 18 content minimum inside a one-cell frame', () => {
    expect(MIN_W).toBe(62);
    expect(MIN_H).toBe(20);
    expect(minSize(G)).toEqual({ w: 62, h: 20 });
    expect(minSize({ cols: 40, rows: 12 })).toEqual({ w: 40, h: 12 });
  });

  it('opens at about 80% of the screen, centred, and offset for the second window', () => {
    expect(defaultRect(G)).toEqual({ x: 16, y: 5, w: 128, h: 40 });
    expect(defaultRect(G, 1)).toEqual({ x: 17, y: 6, w: 128, h: 40 });
    // A small screen: at least the minimum, still centred.
    expect(defaultRect({ cols: 70, rows: 22 })).toEqual({ x: 4, y: 1, w: 62, h: 20 });
  });

  it('fills the screen along an axis smaller than the minimum', () => {
    expect(defaultRect({ cols: 50, rows: 15 })).toEqual({ x: 0, y: 0, w: 50, h: 15 });
    expect(fitRect({ x: 10, y: 3, w: 80, h: 30 }, { cols: 50, rows: 40 })).toEqual({ x: 0, y: 3, w: 50, h: 30 });
  });

  it('keeps a stored rectangle fully on screen: shrinks, then moves', () => {
    expect(fitRect({ x: 150, y: 45, w: 100, h: 30 }, G)).toEqual({ x: 60, y: 20, w: 100, h: 30 });
    expect(fitRect({ x: -5, y: -2, w: 300, h: 300 }, G)).toEqual({ x: 0, y: 0, w: 160, h: 50 });
    expect(fitRect({ x: 3, y: 3, w: 10, h: 5 }, G)).toEqual({ x: 3, y: 3, w: 62, h: 20 });
    expect(fitRect({ x: 3.4, y: 2.6, w: 70.5, h: 21.2 }, G)).toEqual({ x: 3, y: 3, w: 71, h: 21 });
  });

  it('moves in whole cells and clamps to the screen', () => {
    const r = { x: 10, y: 10, w: 70, h: 25 };
    expect(moveRect(r, 5, -3, G)).toEqual({ x: 15, y: 7, w: 70, h: 25 });
    expect(moveRect(r, -50, -50, G)).toEqual({ x: 0, y: 0, w: 70, h: 25 });
    expect(moveRect(r, 500, 500, G)).toEqual({ x: 90, y: 25, w: 70, h: 25 });
    expect(cellDelta(9 * 5.4, 9)).toBe(5);
    expect(cellDelta(-17 * 2.6, 17)).toBe(-3);
    expect(cellDelta(10, 0)).toBe(0);
  });

  it('resizes from each edge with the opposite edges fixed, between the minimum and the screen', () => {
    const r = { x: 20, y: 10, w: 80, h: 30 };
    expect(resizeRect(r, 'e', 4, 0, G)).toEqual({ x: 20, y: 10, w: 84, h: 30 });
    expect(resizeRect(r, 'e', 100, 0, G)).toEqual({ x: 20, y: 10, w: 140, h: 30 });
    expect(resizeRect(r, 'w', -5, 0, G)).toEqual({ x: 15, y: 10, w: 85, h: 30 });
    expect(resizeRect(r, 'w', 50, 0, G)).toEqual({ x: 38, y: 10, w: 62, h: 30 });
    expect(resizeRect(r, 'w', -50, 0, G)).toEqual({ x: 0, y: 10, w: 100, h: 30 });
    expect(resizeRect(r, 'n', 0, 20, G)).toEqual({ x: 20, y: 20, w: 80, h: 20 });
    expect(resizeRect(r, 's', 0, -20, G)).toEqual({ x: 20, y: 10, w: 80, h: 20 });
    expect(resizeRect(r, 'se', 3, 2, G)).toEqual({ x: 20, y: 10, w: 83, h: 32 });
    expect(resizeRect(r, 'nw', -3, -2, G)).toEqual({ x: 17, y: 8, w: 83, h: 32 });
    expect(resizeRect(r, 'ne', 1, 1, G)).toEqual({ x: 20, y: 11, w: 81, h: 29 });
    expect(resizeRect(r, 'sw', 1, 1, G)).toEqual({ x: 21, y: 10, w: 79, h: 31 });
  });

  it("sizes the Lykta frame's body in px and the old-look grid in it (ADR 0127)", () => {
    // The default cell (10 × 19 px): the content box is the window less the band, the
    // lit window's edge and the hood's room; the grid keeps the old one-cell frame's size.
    const b = windowBody({ x: 0, y: 0, w: 115, h: 37 }, 10, 19);
    expect(b.w).toBe(115 * 10 - 2 * (BAND_PX + GLASS_EDGE_PX));
    expect(b.h).toBe(37 * 19 - 2 * (BAND_PX + GLASS_EDGE_PX) - HOOD_PX);
    expect([b.cols, b.rows]).toEqual([113, 35]);
    // Centred, in whole px.
    expect(b.left).toBe(Math.floor((b.w - 113 * 10) / 2));
    expect(b.top).toBe(Math.floor((b.h - 35 * 19) / 2));
    // The minimum window: 60 × 18 grid cells, at least 360 × 260 CSS px of body.
    const m = windowBody({ x: 0, y: 0, w: MIN_W, h: MIN_H }, 10, 19);
    expect([m.cols, m.rows]).toEqual([60, 18]);
    expect(m.w).toBeGreaterThanOrEqual(360);
    expect(m.h).toBeGreaterThanOrEqual(260);
    // The grid never touches the lit window's edge.
    for (const [cw, ch] of [[7, 13], [9, 17], [12.5, 24]] as const) {
      const g = windowBody({ x: 0, y: 0, w: 70, h: 24 }, cw, ch);
      expect(g.cols * cw + g.left).toBeLessThanOrEqual(g.w - GRID_GAP_PX);
      expect(g.rows * ch + g.top).toBeLessThanOrEqual(g.h - GRID_GAP_PX / 2);
    }
    // No cells: nothing to lay out.
    expect(windowBody({ x: 0, y: 0, w: 1, h: 1 }, 0, 0)).toEqual({ w: 0, h: 0, cols: 0, rows: 0, left: 0, top: 0 });
  });

  it('compares rectangles', () => {
    expect(sameRect({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 4 })).toBe(true);
    expect(sameRect({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 5 })).toBe(false);
    expect(sameRect(null, null)).toBe(true);
    expect(sameRect(null, { x: 0, y: 0, w: 1, h: 1 })).toBe(false);
  });
});
