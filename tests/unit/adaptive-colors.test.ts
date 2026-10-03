// @vitest-environment happy-dom
// Adaptive colours (ADR 0068): resolution, the `~` syntax, the live custom
// properties and every renderer that takes a `Color`.

import { afterEach, describe, expect, it } from 'vitest';
import { ADAPTIVE_COLOR, adaptiveColor, isAdaptive, isTrueColor, rgb, shadeRoleOf } from '../../src/core/types';
import { BACKGROUND_THEMES, TERMINAL_BG_PRESETS } from '../../src/theme/presets';
import { contrast, hexToHsl, normalizeHex } from '../../src/theme/color';
import {
  ADAPTIVE_MAX,
  ADAPTIVE_MIN_CONTRAST,
  adaptBg,
  adaptFg,
  adaptiveCss,
  applyAdaptive,
  resetAdaptive,
  resolveAdaptive,
} from '../../src/theme/adaptive';
import { colorToCss } from '../../src/ui/palette';
import { mudletColor, parseCecho, parseScriptColor } from '../../src/scripts/colors';
import { toCecho } from '../../src/scripts/host';
import { renderLine } from '../../src/ui/output-pane';
import { paneColor, paneInk, paneLine } from '../../src/panes/script-pane';
import { runStyle } from '../../src/chrome/frames/export-model';
import { applyTheme } from '../../src/theme/apply';
import { defaultSettings } from '../../src/settings/types';

/** The readability script's colours (Cockpit's hues) and a few hard cases. */
const BASES = ['#3fb0a0', '#6e6e6e', '#f0c850', '#ef6fa6', '#da9bff', '#0000ff', '#ffff00', '#ffffff', '#000000', '#800000'];

const hueOf = (hex: string): number => hexToHsl(hex).h;

afterEach(() => resetAdaptive());

describe('adaptFg', () => {
  for (const p of TERMINAL_BG_PRESETS) {
    it(`${p.name}: every base reads at 4.5:1 or better`, () => {
      for (const b of BASES) {
        const out = adaptFg(b, p.hex);
        expect(contrast(out, p.hex), `${b} on ${p.hex} → ${out}`).toBeGreaterThanOrEqual(ADAPTIVE_MIN_CONTRAST - 0.01);
      }
    });
  }

  it('leaves a colour that already passes unchanged (Cockpit hues on black)', () => {
    for (const b of ['#3fb0a0', '#f0c850', '#ef6fa6', '#da9bff']) expect(adaptFg(b, '#000000')).toBe(b);
    expect(adaptFg('#000000', '#f4ecd8')).toBe('#000000');
  });

  it('keeps the hue of a saturated colour', () => {
    for (const p of TERMINAL_BG_PRESETS) {
      for (const b of ['#3fb0a0', '#f0c850', '#ef6fa6', '#da9bff']) {
        const out = adaptFg(b, p.hex);
        if (out === '#ffffff' || out === '#000000') continue;
        const d = Math.abs(hueOf(out) - hueOf(b));
        expect(Math.min(d, 360 - d), `${b} on ${p.name} → ${out}`).toBeLessThan(4);
      }
    }
  });

  it('darkens on paper and lightens on a dark background', () => {
    const paper = adaptFg('#f0c850', '#f4ecd8');
    expect(hexToHsl(paper).l).toBeLessThan(hexToHsl('#f0c850').l);
    const grey = adaptFg('#6e6e6e', '#002b36');
    expect(hexToHsl(grey).l).toBeGreaterThan(hexToHsl('#6e6e6e').l);
  });
});

describe('adaptBg', () => {
  it('keeps the font colour readable on the fill', () => {
    for (const p of TERMINAL_BG_PRESETS) {
      const fg = BACKGROUND_THEMES[p.name]?.fg ?? '#c0c0c0';
      for (const b of BASES) {
        const fill = adaptBg(b, fg, p.hex);
        const best = Math.max(contrast(fg, '#000000'), contrast(fg, '#ffffff'));
        expect(contrast(fg, fill), `${b} under ${fg} on ${p.name}`).toBeGreaterThanOrEqual(Math.min(ADAPTIVE_MIN_CONTRAST, best) - 0.01);
      }
    }
  });
});

describe('the Color kind', () => {
  it('is neither truecolor nor a shade role', () => {
    const c = adaptiveColor(0xf0c850);
    expect(c).toBe(ADAPTIVE_COLOR | 0xf0c850);
    expect(isAdaptive(c)).toBe(true);
    expect(isTrueColor(c)).toBe(false);
    expect(shadeRoleOf(c)).toBeNull();
    expect(isAdaptive(rgb(1, 2, 3))).toBe(false);
    expect(isAdaptive(7)).toBe(false);
  });
});

describe('~ syntax', () => {
  const gold = adaptiveColor(0xffd700);
  it('parses ~ names, hex and rgb in cecho tags', () => {
    expect(parseCecho('<~gold>x').runs).toEqual([{ start: 0, end: 1, fg: gold }]);
    expect(parseCecho('<~#f0c850>x').runs).toEqual([{ start: 0, end: 1, fg: adaptiveColor(0xf0c850) }]);
    expect(parseCecho('<~240,200,80>x').runs).toEqual([{ start: 0, end: 1, fg: adaptiveColor(0xf0c850) }]);
    expect(parseCecho('<~gold:~navy>x').runs).toEqual([{ start: 0, end: 1, fg: gold, bg: adaptiveColor(0x000080) }]);
    expect(parseCecho('<:~gold>x').runs).toEqual([{ start: 0, end: 1, bg: gold }]);
    expect(parseCecho('<white:~gold>x').runs).toEqual([{ start: 0, end: 1, fg: mudletColor('white')!, bg: gold }]);
  });

  it('keeps ~ansi colours as the palette colour', () => {
    expect(parseCecho('<~ansi_red>x').runs).toEqual([{ start: 0, end: 1, fg: 1 }]);
  });

  it('leaves unknown ~ tags as text', () => {
    expect(parseCecho('<~nosuch>x').text).toBe('<~nosuch>x');
    expect(parseCecho('<~>x').text).toBe('<~>x');
  });

  it('takes ~ colours in highlight', () => {
    expect(parseScriptColor('~gold')).toEqual({ fg: gold });
    expect(parseScriptColor('~#f0c850:~#000080')).toEqual({ fg: adaptiveColor(0xf0c850), bg: adaptiveColor(0x000080) });
    expect(parseScriptColor('<b><~gold>')).toEqual({ fg: gold, bold: true });
    expect(parseScriptColor('~nosuch')).toBeNull();
  });

  it('round-trips through copy2cecho', () => {
    const c = parseCecho('<~#f0c850>Bill<reset> is here.');
    expect(toCecho(c.text, c.runs)).toBe('<~#f0c850>Bill<reset> is here.');
    expect(parseCecho(toCecho(c.text, c.runs))).toEqual(c);
  });
});

describe('live custom properties', () => {
  it('renders a var() that every themed root resolves', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    applyAdaptive(a, '#c0c0c0', '#000000');
    applyAdaptive(b, '#000000', '#f4ecd8');
    const css = adaptiveCss(adaptiveColor(0xf0c850), 'f');
    expect(css).toBe('var(--wc-af-f0c850, #f0c850)');
    expect(a.style.getPropertyValue('--wc-af-f0c850')).toBe('#f0c850');
    const paper = b.style.getPropertyValue('--wc-af-f0c850');
    expect(paper).toBe(adaptFg('#f0c850', '#f4ecd8'));
    expect(contrast(paper, '#f4ecd8')).toBeGreaterThanOrEqual(4.49);
    expect(b.style.getPropertyValue('--wc-ab-f0c850')).toBe(adaptBg('#f0c850', '#000000', '#f4ecd8'));
  });

  it('rewrites the properties when the theme changes', () => {
    const root = document.createElement('div');
    applyAdaptive(root, '#c0c0c0', '#000000');
    adaptiveCss(adaptiveColor(0x6e6e6e), 'f');
    const onBlack = root.style.getPropertyValue('--wc-af-6e6e6e');
    applyAdaptive(root, '#000000', '#f4ecd8');
    const onPaper = root.style.getPropertyValue('--wc-af-6e6e6e');
    expect(onPaper).not.toBe(onBlack);
    expect(onPaper).toBe(adaptFg('#6e6e6e', '#f4ecd8'));
  });

  it('applyTheme writes them on its root', () => {
    const s = defaultSettings();
    const root = document.createElement('div');
    adaptiveCss(adaptiveColor(0x3fb0a0), 'f');
    applyTheme({ ...s, appearance: { ...s.appearance, bg: '#f4ecd8', fg: '#000000' } }, root);
    expect(root.style.getPropertyValue('--wc-af-3fb0a0')).toBe(adaptFg('#3fb0a0', '#f4ecd8'));
  });

  it(`resolves past ${ADAPTIVE_MAX} colours against the last background`, () => {
    const root = document.createElement('div');
    applyAdaptive(root, '#000000', '#f4ecd8');
    for (let i = 0; i < ADAPTIVE_MAX; i++) adaptiveCss(adaptiveColor(i), 'f');
    const c = adaptiveColor(0xf0c850);
    expect(adaptiveCss(c, 'f')).toBe(resolveAdaptive(c, 'f', '#f4ecd8', '#000000'));
  });
});

describe('renderers', () => {
  const gold = adaptiveColor(0xf0c850);

  it('colorToCss gives the var() for text and fill', () => {
    expect(colorToCss(gold)).toBe('var(--wc-af-f0c850, #f0c850)');
    expect(colorToCss(gold, 'b')).toBe('var(--wc-ab-f0c850, #f0c850)');
    expect(colorToCss(rgb(1, 2, 3), 'b')).toBe('#010203');
  });

  it('the output pane writes it in both render paths', () => {
    const line = { text: 'Bill is here.', runs: [{ start: 0, end: 4, fg: gold }], tags: [], prompt: false, raw: '', ts: 0 };
    const row = renderLine(document, line, 80);
    const span = row.querySelector('span')!;
    expect(span.getAttribute('style')).toContain('--wc-af-f0c850');
    // A background row (ADR 0044 rule 5): four background runs.
    const runs = [0, 1, 2, 3].map((i) => ({ start: i, end: i + 1, bg: gold, fg: i === 0 ? gold : undefined }));
    const bgRow = renderLine(document, { ...line, text: 'abcd', runs }, 80);
    expect(bgRow.querySelector('.wc-bgrow')!.getAttribute('style')).toContain('--wc-ab-f0c850');
  });

  it('the export model', () => {
    expect(runStyle({ start: 0, end: 1, fg: gold, bg: gold })).toMatchObject({
      color: 'var(--wc-af-f0c850, #f0c850)',
      bg: 'var(--wc-ab-f0c850, #f0c850)',
    });
  });

  it('a script pane resolves against its own background', () => {
    const ramp = { track: '#111111', dim: '#222222', mid: '#333333', paneBg: '#f4ecd8', vtext: '#000000', label: '#000000', glow: '#cccccc' };
    const ink = paneInk('#000000', '#f4ecd8', true);
    const line = paneLine({ spans: [{ text: 'gold', fg: gold }] }, 10, ramp, true, [], ink);
    const want = adaptFg('#f0c850', '#f4ecd8');
    expect(JSON.stringify(line)).toContain(want);
    expect(paneColor(gold, [])).toBe('#f0c850');
    expect(normalizeHex(want)).toBe(want);
  });
});
