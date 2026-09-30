// The UI colours on a light terminal background (ADR 0041): every text
// role keeps a WCAG contrast that can be read, on `paper` and on any other
// background that counts as light, and the dark tables are untouched.
import { describe, expect, it } from 'vitest';
import { migrateSettings } from '../../src/settings';
import { rootTokens, themeColors } from '../../src/theme/apply';
import { contrast, fitContrast, hslToHex, isLight, luminance, mix } from '../../src/theme/color';
import {
  BANNER_COLORS,
  BANNER_COLORS_LIGHT,
  STATS_COLORS,
  STATS_COLORS_LIGHT,
  STATS_MIN_CONTRAST,
  TERMINAL_BG_PRESETS,
  UI_COLORS,
  UI_COLORS_LIGHT,
  UI_MESSAGE_COLORS,
  UI_MIN_CONTRAST,
} from '../../src/theme/presets';

const PAPER = '#f4ecd8';

/** Normal text: item, body, titles, status colours, syntax. */
const NORMAL = [
  'title', 'section', 'header', 'active', 'item', 'hover', 'body', 'accent', 'cursor', 'yellow',
  'err', 'danger', 'ok', 'note', 'quote-attr', 'scroll-thumb',
  'syn-cmd', 'syn-brace', 'syn-delim', 'syn-var', 'syn-code',
];
/** Deliberately dim text. */
const DIM = ['hint', 'quote'];
const STATS_NORMAL = ['value', 'label', 'gained', 'loss', 'tp', 'total', 'arrow', 'pvp', 'ally', 'star'];
const STATS_DIM = ['hint', 'thumb'];
// Rounding to 8-bit channels may cost a hair.
const EPS = 0.02;

function checkLight(bg: string): void {
  const c = themeColors(bg);
  const at = (what: string, fg: string, against: string, min: number): void => {
    expect(contrast(fg, against), `${what} ${fg} on ${against}`).toBeGreaterThanOrEqual(min - EPS);
  };
  for (const r of NORMAL) at(`--c-${r}`, c.ui[r]!, bg, 4.5);
  for (const r of DIM) at(`--c-${r}`, c.ui[r]!, bg, 3);
  at('sel-fg on sel-bg', c.ui['sel-fg']!, c.ui['sel-bg']!, 4.5);
  at('sel-fg on focus-bg', c.ui['sel-fg']!, c.ui['focus-bg']!, 4.5);
  for (const r of STATS_NORMAL) at(`--st-${r}`, c.stats[r]!, bg, 4.5);
  for (const r of STATS_DIM) at(`--st-${r}`, c.stats[r]!, bg, 3);
  // The UI-message prefixes (system, warn, err …).
  for (const [k, v] of Object.entries(c.messages)) at(`--ui-${k}`, v, bg, 4.5);
  at('--banner-word', c.banner['banner-word']!, bg, 4.5);
  at('--star-bright', c.banner['star-bright']!, bg, 3);
}

describe('contrast helpers', () => {
  it('computes WCAG luminance and contrast', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 6);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('fitContrast keeps a colour that passes and moves one that does not', () => {
    expect(fitContrast('#000000', PAPER, 4.5, '#000000')).toBe('#000000');
    expect(fitContrast('#3A362E', PAPER, 4.5, '#000000')).toBe('#3a362e');
    const fitted = fitContrast('#ffd75f', PAPER, 4.5, '#000000');
    expect(fitted).not.toBe('#ffd75f');
    expect(contrast(fitted, PAPER)).toBeGreaterThanOrEqual(4.5 - EPS);
    // The smallest step: just past the threshold, not black.
    expect(contrast(fitted, PAPER)).toBeLessThan(4.8);
    // Nothing reaches 7:1 on a mid grey: the ink itself.
    expect(fitContrast('#ffd75f', '#808080', 7, '#000000')).toBe('#000000');
  });
});

describe('light UI colours (ADR 0041)', () => {
  it('uses the light tables as they are on paper', () => {
    const c = themeColors(PAPER);
    for (const [k, v] of Object.entries(UI_COLORS_LIGHT)) expect(c.ui[k], k).toBe(v);
    for (const [k, v] of Object.entries(STATS_COLORS_LIGHT)) expect(c.stats[k], k).toBe(v);
    for (const [k, v] of Object.entries(BANNER_COLORS_LIGHT)) expect(c.banner[k], k).toBe(v);
    expect(c.ui['sel-fg']).toBe(PAPER);
    expect(c.ui.off).toBe(mix(PAPER, '#000000', 0.3));
    expect(c.stats.track).toBe(mix(PAPER, '#000000', 0.12));
  });

  it('has every role of the dark tables', () => {
    const c = themeColors(PAPER);
    expect(Object.keys(c.ui).sort()).toEqual(Object.keys(UI_COLORS).sort());
    expect(Object.keys(c.stats).sort()).toEqual(Object.keys(STATS_COLORS).sort());
    expect(Object.keys(c.banner).sort()).toEqual(Object.keys(BANNER_COLORS).sort());
    expect(Object.keys(c.messages).sort()).toEqual(Object.keys(UI_MESSAGE_COLORS).sort());
    for (const r of [...NORMAL, ...DIM, 'sel-bg', 'focus-bg']) expect(UI_MIN_CONTRAST[r], r).toBeDefined();
    for (const r of [...STATS_NORMAL, ...STATS_DIM]) expect(STATS_MIN_CONTRAST[r], r).toBeDefined();
  });

  it('is readable on paper', () => {
    checkLight(PAPER);
    const t = rootTokens(migrateSettings({ appearance: { bg: PAPER } }));
    expect(contrast(t['--c-yellow']!, PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(t['--c-item']).toBe('#3a362e');
    expect(t['--st-value']).toBe('#000000');
    expect(t['--banner-word']).toBe('#00727a');
  });

  it('keeps the order of emphasis on paper', () => {
    const { ui } = themeColors(PAPER);
    const k = (r: string) => contrast(ui[r]!, PAPER);
    expect(k('active')).toBeGreaterThan(k('hover'));
    expect(k('hover')).toBeGreaterThan(k('item'));
    expect(k('item')).toBeGreaterThan(k('body') + 2);
    expect(k('body')).toBeGreaterThan(k('hint') + 2);
    expect(k('hint')).toBeGreaterThan(k('off') + 0.8);
    expect(k('title')).toBeGreaterThan(k('section'));
    // The fills stay faint.
    expect(k('off')).toBeLessThan(3);
    expect(k('brace-match-bg')).toBeLessThan(1.6);
    // Brace match text on its band.
    expect(contrast(ui.hover!, ui['brace-match-bg']!)).toBeGreaterThanOrEqual(4.5);
    // The syntax colours stay apart.
    const syn = ['syn-cmd', 'syn-brace', 'syn-delim', 'syn-var', 'syn-code'].map((r) => ui[r]);
    expect(new Set(syn).size).toBe(5);
  });

  it('is readable on every background that counts as light', () => {
    const bgs: string[] = ['#ffffff', '#c0c0c0', '#a0a0a0', '#d0e0ff', '#fff8b0', '#ffc0c0', '#2a2aff', '#ff30ff'];
    for (let h = 0; h < 360; h += 15) {
      for (const s of [0, 25, 50, 75, 100]) {
        for (const l of [59, 65, 75, 85, 95, 100]) bgs.push(hslToHex(h, s, l));
      }
    }
    let n = 0;
    for (const bg of bgs) {
      if (!isLight(bg)) continue;
      n++;
      checkLight(bg);
    }
    expect(n).toBeGreaterThan(500);
  });
});

describe('dark UI colours', () => {
  it('are the dark tables, unchanged, on every dark preset', () => {
    for (const p of TERMINAL_BG_PRESETS) {
      if (isLight(p.hex)) continue;
      const c = themeColors(p.hex);
      expect(c.ui, p.name).toEqual(UI_COLORS);
      expect(c.banner, p.name).toEqual(BANNER_COLORS);
      expect(c.messages, p.name).toEqual(UI_MESSAGE_COLORS);
      expect(c.stats, p.name).toEqual(STATS_COLORS);
    }
  });

  it('have the values they always had', () => {
    expect(UI_COLORS).toEqual({
      title: '#00d7d7', section: '#008787', header: '#ffd060', active: '#ffffff', item: '#bcbcbc',
      hover: '#dadada', body: '#8a8a8a', hint: '#585858', off: '#3a3a3a', accent: '#ffaf00',
      cursor: '#ffaf00', yellow: '#ffd75f', err: '#ff5f5f', danger: '#a04030', ok: '#7ac46f',
      note: '#b8923c', quote: '#8a8a8a', 'quote-attr': '#87af87', 'sel-fg': '#000000',
      'sel-bg': '#bcbcbc', 'focus-bg': '#ffaf00', 'scroll-thumb': '#ffffff', 'scroll-track': '#585858',
      'syn-cmd': '#5fafaf', 'syn-brace': '#8290a0', 'syn-delim': '#c8a060', 'syn-var': '#87af87',
      'syn-code': '#9b86b3', 'brace-match-bg': '#3a3a3a',
    });
    expect(STATS_COLORS).toEqual({
      value: '#ffffff', label: '#909090', gained: '#6fe060', loss: '#e03c3c', tp: '#ffc847',
      track: '#1f1f1f', thumb: '#707070', total: '#b0b0b0', arrow: '#b0b0b0', hint: '#5c5c5c',
      pvp: '#ff5f5f', ally: '#00d7d7', star: '#ffd060',
    });
    expect(BANNER_COLORS).toEqual({
      'banner-word': '#00d0d0', 'banner-word-dim': '#0a9a9c', 'star-dim': '#1f595b',
      'star-mid': '#2f9092', 'star-bright': '#74e8e8',
    });
    const t = rootTokens(migrateSettings({}));
    for (const [k, v] of Object.entries(UI_COLORS)) expect(t[`--c-${k}`], k).toBe(v);
    for (const [k, v] of Object.entries(STATS_COLORS)) expect(t[`--st-${k}`], k).toBe(v);
    for (const [k, v] of Object.entries(UI_MESSAGE_COLORS)) expect(t[`--ui-${k}`], k).toBe(v);
  });
});
