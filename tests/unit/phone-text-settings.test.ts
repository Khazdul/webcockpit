import { describe, expect, it } from 'vitest';
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from '../../src/settings/types';
import { BACKGROUND_THEMES, TERMINAL_BG_PRESETS } from '../../src/theme/presets';
import { PHONE_THEMES, type ScreenFit, canStep, sizeFits, stepSize, themeBg, themeOf } from '../../src/phone/text-settings';

const LIM = { min: FONT_SIZE_MIN, max: FONT_SIZE_MAX };

describe('phone themes', () => {
  it('are the terminal background presets black and paper, each with a theme of its own', () => {
    for (const t of PHONE_THEMES) {
      expect(TERMINAL_BG_PRESETS.find((p) => p.name === t.value)?.hex).toBe(t.bg);
      expect(BACKGROUND_THEMES[t.value]).toBeDefined();
      expect(themeBg(t.value)).toBe(t.bg);
    }
  });

  it('themeOf names a background, whatever its case; another background is neither', () => {
    expect(themeOf('#000000')).toBe('black');
    expect(themeOf('#F4ECD8')).toBe('paper');
    expect(themeOf(' #f4ecd8 ')).toBe('paper');
    expect(themeOf('#0e141c')).toBeNull();
    expect(themeOf('')).toBeNull();
  });
});

describe('stepSize', () => {
  it('steps by one inside the font size limits', () => {
    expect(stepSize(14, 1, LIM)).toBe(15);
    expect(stepSize(14, -1, LIM)).toBe(13);
    expect(stepSize(14, 5, LIM)).toBe(15);
    expect(stepSize(FONT_SIZE_MAX, 1, LIM)).toBe(FONT_SIZE_MAX);
    expect(stepSize(FONT_SIZE_MIN, -1, LIM)).toBe(FONT_SIZE_MIN);
    expect(stepSize(Number.NaN, 1, LIM)).toBe(FONT_SIZE_MIN + 1);
  });

  it('canStep is false at an end', () => {
    expect(canStep(14, 1, LIM)).toBe(true);
    expect(canStep(FONT_SIZE_MAX, 1, LIM)).toBe(false);
    expect(canStep(FONT_SIZE_MIN, -1, LIM)).toBe(false);
    expect(canStep(FONT_SIZE_MIN, 1, LIM)).toBe(true);
  });
});

describe('sizeFits', () => {
  // A 390 × 844 phone at size 14: an 8.4 × 17 px cell (46 columns, 49 rows).
  const screen: ScreenFit = { width: 390, height: 844, cellW: 8.4, cellH: 17, size: 14, minCols: 30, minRows: 8 };

  it('a larger size fits while the game keeps its least columns', () => {
    expect(sizeFits(15, screen)).toBe(true);
    // 21: 12.6 → 13 px cells, 30 columns.
    expect(sizeFits(21, screen)).toBe(true);
    // 22: 13.2 → 14 px cells, 27 columns.
    expect(sizeFits(22, screen)).toBe(false);
    expect(sizeFits(32, screen)).toBe(false);
  });

  it('the rows count too, unless the keyboard is up (height Infinity)', () => {
    const low: ScreenFit = { ...screen, width: 844, height: 150 };
    // 15: 18.2 → 19 px rows, 7 of them.
    expect(sizeFits(15, low)).toBe(false);
    expect(sizeFits(15, { ...low, height: Infinity })).toBe(true);
  });

  it('the same or a smaller size always fits, also from a size that is already too large', () => {
    const big: ScreenFit = { ...screen, cellW: 19.2, cellH: 39, size: 32 };
    expect(sizeFits(32, big)).toBe(true);
    expect(sizeFits(31, big)).toBe(true);
    expect(sizeFits(33, big)).toBe(false);
  });

  it('errs towards does not fit: a cell is rounded up to whole pixels', () => {
    // 13 px wide cells exactly: 30 columns; a hair wider rounds up to 14: 27.
    expect(sizeFits(15, { ...screen, cellW: 13 * (14 / 15) })).toBe(true);
    expect(sizeFits(15, { ...screen, cellW: 13.05 * (14 / 15) })).toBe(false);
  });

  it('without metrics every size fits', () => {
    expect(sizeFits(32, null)).toBe(true);
    expect(sizeFits(32, { ...screen, cellW: 0 })).toBe(true);
    expect(sizeFits(32, { ...screen, width: 0 })).toBe(true);
    expect(sizeFits(32, { ...screen, size: Number.NaN })).toBe(true);
  });
});
