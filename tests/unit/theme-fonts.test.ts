// @vitest-environment happy-dom
// Terminal font choice (ADR 0049): local-only Lucida Console, the
// fallback to DejaVu Sans Mono, the generated @font-face rules, preloads.
import { legacySettings } from './legacy-defaults';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FONT_IDS, migrateSettings } from '../../src/settings';
import { rootTokens } from '../../src/theme/apply';
import { cellHeight, nominalCell } from '../../src/theme/cells';
import {
  FONTS,
  bundledFont,
  detectLocalFonts,
  effectiveFont,
  fontChoices,
  fontFaceCss,
  fontFiles,
  fontPx,
  installFontFaces,
  isFontAvailable,
  preloadFont,
  setFontInstalled,
} from '../../src/theme/fonts';

afterEach(() => {
  setFontInstalled('lucida', false);
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
});

function withFont(font: (typeof FONT_IDS)[number]) {
  const s = legacySettings();
  s.appearance.font = font;
  return s;
}

describe('font ids', () => {
  it('lists the picker order: by label, Lucida Console last', () => {
    const labels = FONT_IDS.map((id) => FONTS[id].label);
    expect(labels.at(-1)).toBe('Lucida Console');
    const rest = labels.slice(0, -1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    expect(new Set(FONT_IDS).size).toBe(Object.keys(FONTS).length);
  });

  it('migration keeps every known id (Lucida included) and turns an unknown one into the default', () => {
    for (const id of FONT_IDS) expect(migrateSettings({ appearance: { font: id } }).appearance.font).toBe(id);
    expect(migrateSettings({ appearance: { font: 'comic-sans' } }).appearance.font).toBe('dejavu');
    expect(migrateSettings({ appearance: { font: 42 } }).appearance.font).toBe('dejavu');
  });
});

describe('Lucida Console where it is not installed', () => {
  it('is not offered, and renders and measures as DejaVu Sans Mono; the setting is kept', () => {
    expect(isFontAvailable('lucida')).toBe(false);
    expect(fontChoices()).not.toContain('lucida');
    expect(fontChoices()).toHaveLength(FONT_IDS.length - 1);
    expect(effectiveFont('lucida')).toBe('dejavu');
    const s = withFont('lucida');
    expect(rootTokens(s)['--font-mono']).toBe(FONTS.dejavu.stack);
    expect(nominalCell(s.appearance)).toEqual(nominalCell(legacySettings().appearance));
    expect(cellHeight(s.appearance)).toBe(cellHeight(legacySettings().appearance));
    expect(fontPx('lucida', 15)).toBe(fontPx('dejavu', 15));
    expect(fontFiles('lucida')).toEqual(fontFiles('dejavu'));
    expect(s.appearance.font).toBe('lucida');
  });
});

describe('Lucida Console where it is installed', () => {
  it('is offered last and used with its own metrics and fill face', () => {
    setFontInstalled('lucida', true);
    expect(fontChoices().at(-1)).toBe('lucida');
    expect(effectiveFont('lucida')).toBe('lucida');
    const s = withFont('lucida');
    expect(rootTokens(s)['--font-mono']).toBe(
      '"WebCockpit Fill LC", "WebCockpit Lucida", "DejaVu Sans Mono", monospace',
    );
    // Size 15 → a whole 15 px (`wholePx`): 9.04 px advance, 9 px cells;
    // 2048/2048 em high less the half-px margin.
    const c = nominalCell(s.appearance);
    expect(c).toEqual({ w: 9, h: 14, px: 15, ls: 0 });
    // Exports never use it.
    expect(bundledFont('lucida')).toBe('dejavu');
  });

  it('preloads only the bundled fill face, never a URL for Lucida itself', () => {
    setFontInstalled('lucida', true);
    preloadFont('lucida');
    const hrefs = [...document.head.querySelectorAll('link[rel="preload"]')].map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/fonts/WebCockpitFill-LC.woff2']);
  });
});

describe('detectLocalFonts', () => {
  it('marks Lucida Console installed when its local() face loads', async () => {
    const srcs: string[] = [];
    vi.stubGlobal(
      'FontFace',
      class {
        constructor(_family: string, src: string) {
          srcs.push(src);
        }
        load(): Promise<unknown> {
          return Promise.resolve(this);
        }
      },
    );
    expect(await detectLocalFonts()).toEqual(['lucida']);
    expect(srcs).toEqual(['local("Lucida Console"), local("LucidaConsole")']);
    expect(isFontAvailable('lucida')).toBe(true);
  });

  it('leaves it unavailable when the face fails to load, or without the Font Loading API', async () => {
    vi.stubGlobal(
      'FontFace',
      class {
        load(): Promise<unknown> {
          return Promise.reject(new DOMException('not found', 'NetworkError'));
        }
      },
    );
    expect(await detectLocalFonts()).toEqual([]);
    expect(isFontAvailable('lucida')).toBe(false);
    vi.stubGlobal('FontFace', undefined);
    expect(await detectLocalFonts()).toEqual([]);
  });
});

describe('@font-face rules', () => {
  it('declares every family once per weight; Lucida only as local(), with font-display: block', () => {
    const css = fontFaceCss();
    const rules = css.split('\n');
    for (const r of rules) expect(r).toContain('font-display:block');
    const lucida = rules.filter((r) => r.includes('"WebCockpit Lucida"'));
    expect(lucida).toHaveLength(2);
    for (const r of lucida) {
      expect(r).toContain('src:local("Lucida Console"), local("LucidaConsole");');
      expect(r).not.toContain('url(');
    }
    const keys = rules.map((r) => /font-family:"([^"]+)".*font-weight:(\w+)/.exec(r)!.slice(1).join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    // 3270 has no bold: its bold rule is the regular file (no synthetic bold).
    expect(css).toContain(
      '@font-face{font-family:"IBM 3270";src:url("/fonts/IBM3270-Regular.woff2") format("woff2");font-weight:bold;',
    );
  });

  it('installs the rules once', () => {
    installFontFaces();
    installFontFaces();
    expect(document.head.querySelectorAll('style#wc-font-faces')).toHaveLength(1);
  });
});

describe('grid settings (ADR 0049)', () => {
  it('a wholePx family gets whole px sizes whose advance is under half a px over the cell', () => {
    for (const id of ['gomono', 'ibm3270', 'plex'] as const) {
      expect(FONTS[id].wholePx).toBe(true);
      for (let size = 6; size <= 32; size++) {
        const px = fontPx(id, size);
        expect(Number.isInteger(px)).toBe(true);
        expect(Math.abs(px - size)).toBeLessThanOrEqual(2);
        const adv = px * FONTS[id].advanceEm;
        expect(adv - Math.floor(adv)).toBeLessThan(0.45);
      }
    }
  });

  it('the other families keep a whole-px advance; DejaVu keeps its cells', () => {
    expect(fontPx('dejavu', 15)).toBe(14.9489);
    expect(FONTS.dejavu.cellMargin ?? 0).toBe(0);
    for (const id of FONT_IDS) {
      if (FONTS[id].wholePx || FONTS[id].halfUpPx) continue;
      const adv = fontPx(id, 15) * FONTS[id].advanceEm;
      expect(adv).toBeCloseTo(Math.round(adv), 3);
    }
  });

  it('JetBrains Mono: a size under half a px over a whole px goes to the half px; cell widths unchanged', () => {
    const a = (size: number) => ({ ...legacySettings().appearance, font: 'jetbrains' as const, size });
    expect(fontPx('jetbrains', 13)).toBe(13.5);
    expect(fontPx('jetbrains', 15)).toBe(15);
    expect(fontPx('jetbrains', 16)).toBe(16.6667);
    for (let size = 6; size <= 32; size++) {
      const px = fontPx('jetbrains', size);
      const frac = px - Math.floor(px);
      expect(frac < 0.001 || frac >= 0.5).toBe(true);
      // Chrome draws at Math.round(px): never narrower than the cell.
      expect(Math.round(px) * 0.6).toBeGreaterThanOrEqual(nominalCell(a(size)).w);
      expect(nominalCell(a(size)).w).toBe(Math.round(size * 0.6));
    }
    expect(nominalCell(a(15))).toEqual({ w: 9, h: 19, px: 15, ls: 0 });
    expect(nominalCell(a(25)).h).toBe(32);
  });

  it('the cell is rounded down from the block height less the family margin', () => {
    const a = { ...legacySettings().appearance, font: 'cascadia' as const, size: 15 };
    const px = fontPx('cascadia', 15);
    expect(cellHeight(a)).toBe(Math.floor(px * FONTS.cascadia.blockEm - 0.5));
    expect(FONTS.mononoki.cellMargin).toBe(1);
  });
});
