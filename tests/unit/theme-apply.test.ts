// @vitest-environment happy-dom
import { legacySettings } from './legacy-defaults';
import { describe, expect, it } from 'vitest';
import { PANE_IDS } from '../../src/layout/types';
import { migrateSettings } from '../../src/settings';
import {
  applyPaneTheme,
  applyTheme,
  boldFg,
  boldTokens,
  inputColor,
  paneTokens,
  rootTokens,
  shadeVar,
} from '../../src/theme/apply';
import { CellMetrics, cellHeight, nominalCell } from '../../src/theme/cells';
import { hslToHex, paneShades } from '../../src/theme/color';
import { FONTS, fontPx } from '../../src/theme/fonts';
import { INPUT_COLOR_IDS, PAPER_PALETTE, TERMINAL_BG_PRESETS, TERMINAL_FG_PRESETS } from '../../src/theme/presets';

describe('root tokens', () => {
  it('covers the Inv §10.9 names', () => {
    const t = rootTokens(legacySettings());
    expect(t['--term-fg']).toBe('#c0c0c0');
    expect(t['--term-bg']).toBe('#000000');
    for (let i = 0; i < 16; i++) expect(t[`--ansi-${i}`]).toMatch(/^#[0-9a-f]{6}$/);
    expect(t['--ansi-1']).toBe('#800000');
    expect(t['--c-title']).toBe('#00d7d7');
    expect(t['--c-accent']).toBe('#ffaf00');
    expect(t['--c-sel-bg']).toBe('#bcbcbc');
    expect(t['--c-line-hl']).toBe('#1f1f1f');
    expect(t['--star-bright']).toBe('#74e8e8');
    expect(t['--ui-warn']).toBe('#ffb300');
    expect(t['--pane-bg-red']).toBe('#1a0e0e');
    expect(t['--pane-border-red']).toBe('#2e2222');
    expect(t['--pane-bg-none']).toBe('#000000');
    expect(t['--pane-border-none']).toBe('#292929');
    expect(t['--font-mono']).toBe('"WebCockpit Underscore", "DejaVu Sans Mono", monospace');
    expect(t['--pad']).toBe('0px');
  });

  it('applies to <html> with cursor and light attributes', () => {
    const root = document.createElement('div');
    const s = migrateSettings({
      appearance: { bg: '#f4ecd8', cursorStyle: 'underline', cursorBlink: false, padding: 6, ansi: ['#010203'] },
    });
    applyTheme(s, root);
    expect(root.style.getPropertyValue('--term-bg')).toBe('#f4ecd8');
    expect(root.style.getPropertyValue('--ansi-0')).toBe('#010203');
    expect(root.style.getPropertyValue('--pad')).toBe('6px');
    expect(root.dataset.cursor).toBe('underline');
    expect(root.dataset.cursorBlink).toBe('off');
    expect(root.hasAttribute('data-light')).toBe(true);
    applyTheme(legacySettings(), root);
    expect(root.hasAttribute('data-light')).toBe(false);
    expect(root.dataset.cursor).toBe('beam');
  });
});

describe('bold colours (ADR 0060)', () => {
  const on = (appearance: Record<string, unknown> = {}) =>
    migrateSettings({ appearance: { boldBright: true, ...appearance } }).appearance;

  it('off: bold keeps every colour, the default foreground inherits', () => {
    const a = legacySettings().appearance;
    const t = boldTokens(a);
    for (let i = 0; i < 8; i++) expect(t[`--bold-${i}`]).toBe(a.ansi[i]);
    expect(t['--bold-fg']).toBe('currentcolor');
    expect(t['--bold-fg-def']).toBe('#c0c0c0');
    expect(rootTokens(legacySettings())['--bold-1']).toBe('#800000');
  });

  it('on: colours 0–7 take their bright twin, silver default fg turns bright white', () => {
    const a = on();
    const t = boldTokens(a);
    for (let i = 0; i < 8; i++) expect(t[`--bold-${i}`]).toBe(a.ansi[i + 8]);
    expect(t['--bold-1']).toBe('#ff0000');
    expect(t['--bold-fg']).toBe('#ffffff');
    expect(t['--bold-fg-def']).toBe('#ffffff');
    expect(rootTokens(migrateSettings({ appearance: { boldBright: true } }))['--bold-fg']).toBe('#ffffff');
  });

  it('a font colour outside the palette is mixed toward the ink the background takes', () => {
    // sage on black: halfway to white.
    expect(boldFg(on({ fg: '#778a8d' }))).toBe('#bbc5c6');
    // A mid grey on a light background: halfway to black.
    expect(boldFg(on({ fg: '#606060', bg: '#ffffff' }))).toBe('#303030');
  });

  it('paper: ink is already black, so bold is weight only; never less contrast', () => {
    const paper = on({ fg: '#000000', bg: '#f4ecd8', ansi: [...PAPER_PALETTE] });
    // ink matches palette 0, whose twin (a mid grey) would be weaker.
    expect(boldFg(paper)).toBe('#000000');
    expect(boldTokens(paper)['--bold-7']).toBe('#000000'); // white → bright white = black ink
    // Paper with a lighter ink gets darker.
    expect(boldFg(on({ fg: '#4a4538', bg: '#f4ecd8', ansi: [...PAPER_PALETTE] }))).toBe('#000000');
  });

  it('is applied with the theme', () => {
    const root = document.createElement('div');
    applyTheme(migrateSettings({ appearance: { boldBright: true } }), root);
    expect(root.style.getPropertyValue('--bold-0')).toBe('#808080');
    expect(root.style.getPropertyValue('--bold-fg')).toBe('#ffffff');
    applyTheme(legacySettings(), root);
    expect(root.style.getPropertyValue('--bold-0')).toBe('#000000');
    expect(root.style.getPropertyValue('--bold-fg')).toBe('currentcolor');
  });
});

describe('input colour (ADR 0034, 0035)', () => {
  const DARK = 'color-mix(in oklab, var(--term-fg) 55%, #7fb2e6)';
  const LIGHT = 'color-mix(in oklab, var(--term-fg) 55%, #1f5f9e)';

  it('is steel: the fg mixed with a light blue on dark, a dark blue on light', () => {
    expect(rootTokens(legacySettings())['--term-echo']).toBe(DARK);
    expect(inputColor('steel', '#000000')).toBe(DARK);
    expect(inputColor('steel', '#f4ecd8')).toBe(LIGHT);
  });

  it('has the ADR 0035 formula for every option, dark and light', () => {
    const mix = (p: number, t: string) => `color-mix(in oklab, var(--term-fg) ${p}%, ${t})`;
    const want: Record<string, [string, string]> = {
      none: ['var(--term-fg)', 'var(--term-fg)'],
      steel: [mix(55, '#7fb2e6'), mix(55, '#1f5f9e')],
      bright: [mix(55, '#ffffff'), mix(55, '#000000')],
      sand: [mix(55, '#e2bf7e'), mix(55, '#8a5a12')],
      sage: [mix(50, '#9fd08c'), mix(50, '#2f6e25')],
      cyan: [mix(15, '#00d7d7'), mix(15, '#007a8a')],
      amber: [mix(15, '#ffaf00'), mix(15, '#9a5a00')],
    };
    expect([...INPUT_COLOR_IDS]).toEqual(['none', 'steel', 'bright', 'sand', 'sage', 'cyan', 'amber']);
    for (const id of INPUT_COLOR_IDS) {
      expect(inputColor(id, '#000000')).toBe(want[id]![0]);
      expect(inputColor(id, '#f4ecd8')).toBe(want[id]![1]);
      const t = rootTokens(migrateSettings({ appearance: { inputColor: id } }));
      expect(t['--term-echo']).toBe(want[id]![0]);
    }
  });

  it('covers every fg × bg preset, following the bg lightness', () => {
    for (const bg of TERMINAL_BG_PRESETS) {
      for (const fg of TERMINAL_FG_PRESETS) {
        const t = rootTokens(migrateSettings({ appearance: { bg: bg.hex, fg: fg.hex } }));
        expect(t['--term-fg']).toBe(fg.hex);
        expect(t['--term-echo']).toBe(bg.name === 'paper' ? LIGHT : DARK);
      }
    }
  });

  it('is set on the element applyTheme themes', () => {
    const root = document.createElement('div');
    applyTheme(migrateSettings({ appearance: { bg: '#f4ecd8', fg: '#000000' } }), root);
    expect(root.style.getPropertyValue('--term-echo')).toBe(LIGHT);
  });
});

describe('pane tokens', () => {
  it('sets bg, border, seven shades and data-light, recomputed every call', () => {
    const s = legacySettings();
    s.panes.timers.color = 'red';
    const t = paneTokens(s, 'timers');
    expect(t['--pane-bg']).toBe('#1a0e0e');
    expect(t['--pane-border']).toBe('#2e2222');
    expect(Object.keys(t)).toHaveLength(9);
    expect(t['--pane-shade-pane-bg']).toBe(paneShades('red', '#000000').paneBg);
    expect(t['--pane-shade-dim']).toBe(hslToHex(2, 60, 27));
    expect(shadeVar('paneBg')).toBe('--pane-shade-pane-bg');

    const el = document.createElement('div');
    applyPaneTheme(el, s, 'character');
    expect(el.style.getPropertyValue('--pane-border')).toBe('#292929');
    expect(el.hasAttribute('data-light')).toBe(false);
    const paper = migrateSettings({ appearance: { bg: '#f4ecd8' } });
    applyPaneTheme(el, paper, 'character');
    expect(el.hasAttribute('data-light')).toBe(true);
    expect(el.style.getPropertyValue('--pane-bg')).toBe('#f4ecd8');
    paper.panes.timers.color = 'red';
    applyPaneTheme(el, paper, 'timers');
    expect(el.hasAttribute('data-light')).toBe(false);
    for (const id of PANE_IDS) expect(Object.keys(paneTokens(s, id))).toHaveLength(9);
  });
});

describe('cell metrics', () => {
  it('snaps the font size to whole-pixel cells', () => {
    expect(fontPx('dejavu', 15) * FONTS.dejavu.advanceEm).toBeCloseTo(9, 3);
    expect(fontPx('dejavu', 16) * FONTS.dejavu.advanceEm).toBeCloseTo(10, 3);
    expect(fontPx('jetbrains', 15)).toBe(15);
    expect(fontPx('jetbrains', 20)).toBe(20);
    expect(fontPx('jetbrains', 16)).toBe(16.6667);
    for (let size = 6; size <= 32; size++) {
      for (const f of ['dejavu', 'jetbrains'] as const) {
        const px = fontPx(f, size);
        expect(Math.abs(px - size)).toBeLessThanOrEqual(0.5 / FONTS[f].advanceEm + 1e-3);
      }
    }
  });

  it('cell height is the block ink height rounded down', () => {
    const a = legacySettings().appearance;
    expect(cellHeight(a)).toBe(17); // 14.9489 px × 2433/2048 = 17.76
    expect(cellHeight({ ...a, font: 'jetbrains' })).toBe(19); // 15 × 1.32 = 19.8
    expect(nominalCell({ ...a, size: 16 })).toEqual({ w: 10, h: 19, px: 16.6099, ls: 0 });
  });

  it('publishes custom properties, re-measures after font load, notifies changes', async () => {
    const root = document.createElement('div');
    let loaded = false;
    let release!: () => void;
    const m = new CellMetrics({
      root,
      measure: (a) => ({ ...nominalCell(a), w: loaded ? nominalCell(a).w : 7.5 }),
      loadFont: () =>
        new Promise<void>((r) => {
          release = () => {
            loaded = true;
            r();
          };
        }),
    });
    const seen: number[] = [];
    m.subscribe((c) => seen.push(c.w));
    const a = legacySettings().appearance;
    const p = m.update(a);
    expect(root.style.getPropertyValue('--cell-w')).toBe('7.5px');
    expect(root.style.getPropertyValue('--cell-h')).toBe('17px');
    expect(root.style.getPropertyValue('--font-size')).toBe('14.9489px');
    release();
    await p;
    expect(m.get()).toEqual({ w: 9, h: 17, px: 14.9489, ls: 0 });
    expect(root.style.getPropertyValue('--cell-w')).toBe('9px');
    expect(seen).toEqual([7.5, 9]);
  });

  it('a newer update supersedes a pending one', async () => {
    const root = document.createElement('div');
    const waits: Array<() => void> = [];
    const m = new CellMetrics({
      root,
      measure: nominalCell,
      loadFont: () => new Promise<void>((r) => waits.push(r)),
    });
    const a = legacySettings().appearance;
    const p1 = m.update({ ...a, size: 20 });
    const p2 = m.update({ ...a, size: 10 });
    waits[1]!();
    await p2;
    waits[0]!();
    await p1;
    expect(m.get().px).toBe(fontPx('dejavu', 10));
  });
});
