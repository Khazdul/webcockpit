// Device-pixel cells (ADR 0050): at ratio 1 every family and size keeps
// the cell it had before (fixtures/cells-dpr1.json, recorded from the
// CSS px rules of ADR 0049) on both text grids; at other ratios the
// `device` grid (Firefox) gives whole device px cells and the `css` grid
// (Chrome) whole CSS px cells with a font size Chrome draws wide enough.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FONT_IDS, defaultSettings } from '../../src/settings';
import { CSS_GRID_MARGIN, nominalCell } from '../../src/theme/cells';
import { fontInfo } from '../../src/theme/fonts';

const DPR1 = JSON.parse(readFileSync(new URL('./fixtures/cells-dpr1.json', import.meta.url), 'utf8')) as Record<
  string,
  Record<string, [number, number, number]>
>;

const look = (font: (typeof FONT_IDS)[number], size: number) => ({ ...defaultSettings().appearance, font, size });
const each = (fn: (font: (typeof FONT_IDS)[number], size: number) => void): void => {
  for (const font of FONT_IDS) for (let size = 6; size <= 32; size++) fn(font, size);
};

describe('device-pixel cells (ADR 0050)', () => {
  it('ratio 1: every family × size 6–32 keeps its cell exactly, on both grids', () => {
    each((font, size) => {
      const [w, h, px] = DPR1[font]![String(size)]!;
      expect(nominalCell(look(font, size)), `${font} ${size}`).toEqual({ w, h, px, ls: 0 });
      expect(nominalCell(look(font, size), 1, 'css')).toEqual({ w, h, px, ls: 0 });
      expect(nominalCell(look(font, size), 1, 'device')).toEqual({ w, h, px, ls: 0 });
    });
  });

  for (const dpr of [1.25, 1.5, 1.75]) {
    it(`blink-device grid at ratio ${dpr}: whole device px cells, a size Chrome draws wide enough`, () => {
      each((font, size) => {
        const f = fontInfo(font);
        const c = nominalCell(look(font, size), dpr, 'blink-device');
        const wd = c.w * dpr;
        expect(Math.abs(wd - Math.round(wd))).toBeLessThan(1e-4);
        expect(Math.abs(c.h * dpr - Math.round(c.h * dpr))).toBeLessThan(1e-4);
        const pd = c.px * dpr;
        const frac = pd - Math.floor(pd + 1e-6);
        expect(frac < 1e-3 || frac >= 0.5, `${font} ${size}`).toBe(true);
        const excess = Math.round(pd) * f.advanceEm - Math.round(wd);
        expect(excess).toBeGreaterThan(-1e-3);
        expect(excess).toBeLessThan(0.45 + 1e-3);
      });
    });
  }

  for (const dpr of [1.25, 1.5, 1.75, 2, 3]) {
    it(`device grid at ratio ${dpr}: whole device px cells, the exact advance`, () => {
      each((font, size) => {
        const f = fontInfo(font);
        const c = nominalCell(look(font, size), dpr, 'device');
        const [w1, h1] = DPR1[font]![String(size)]!;
        const wd = c.w * dpr;
        const hd = c.h * dpr;
        expect(Math.abs(wd - Math.round(wd)), `${font} ${size} w`).toBeLessThan(1e-4);
        expect(Math.abs(hd - Math.round(hd)), `${font} ${size} h`).toBeLessThan(1e-4);
        expect(Math.abs(wd - w1 * dpr)).toBeLessThanOrEqual(0.5 + 1e-6);
        expect(Math.abs(c.h - h1)).toBeLessThanOrEqual(2);
        expect(Math.abs(c.px * dpr * f.advanceEm - wd)).toBeLessThan(1e-4);
      });
    });

    it(`css grid at ratio ${dpr}: the ratio-1 width, a font size drawn wide enough, a margin`, () => {
      each((font, size) => {
        const f = fontInfo(font);
        const c = nominalCell(look(font, size), dpr, 'css');
        const [w1, h1, px1] = DPR1[font]![String(size)]!;
        expect(c.w).toBe(w1);
        expect(Number.isInteger(c.h)).toBe(true);
        expect(c.h).toBeLessThanOrEqual(h1);
        expect(c.h).toBe(Math.max(1, Math.floor(c.px * f.blockEm - (f.cellMargin ?? 0) - CSS_GRID_MARGIN + 1e-6)));
        if (f.wholePx || f.halfUpPx) {
          const pd = c.px * dpr;
          const frac = pd - Math.floor(pd + 1e-6);
          expect(frac < 1e-3 || frac >= 0.5, `${font} ${size}`).toBe(true);
          expect(Math.round(pd) * f.advanceEm).toBeGreaterThanOrEqual(w1 * dpr - 1e-6);
        } else {
          expect(c.px).toBe(px1);
        }
      });
    });
  }
});
