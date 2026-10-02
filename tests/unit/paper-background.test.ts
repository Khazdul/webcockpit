// Choosing a background preset in Options → Appearance also sets its font
// colour and palette (ADR 0058, 0061); leaving paper for an off-palette
// colour puts the defaults back.
import { describe, expect, it } from 'vitest';
import { backgroundPatch } from '../../src/chrome/frames/options';
import { contrast } from '../../src/theme/color';
import {
  BACKGROUND_THEMES,
  DEFAULT_TERM_FG,
  DOS_PALETTE,
  PAPER_PALETTE,
  TERMINAL_BG_PRESETS,
  TERMINAL_FG_PRESETS,
  backgroundTheme,
  presetName,
} from '../../src/theme/presets';

const PAPER = '#f4ecd8';

describe('backgroundPatch', () => {
  it('sets ink and the paper palette on paper', () => {
    expect(backgroundPatch('#000000', PAPER)).toEqual({ bg: PAPER, fg: '#000000', ansi: [...PAPER_PALETTE] });
  });

  it('puts the default font colour and palette back on black', () => {
    expect(backgroundPatch(PAPER, '#000000')).toEqual({ bg: '#000000', fg: DEFAULT_TERM_FG, ansi: [...DOS_PALETTE] });
    expect(backgroundPatch('#002b36', '#000000')).toEqual({ bg: '#000000', fg: DEFAULT_TERM_FG, ansi: [...DOS_PALETTE] });
  });

  it("sets a dark preset's own theme", () => {
    const teal = BACKGROUND_THEMES.teal!;
    expect(backgroundPatch('#000000', '#002b36')).toEqual({ bg: '#002b36', fg: teal.fg, ansi: [...teal.ansi] });
  });

  it('puts the defaults back when leaving paper for an off-palette colour', () => {
    expect(backgroundPatch(PAPER, '#123456')).toEqual({ bg: '#123456', fg: DEFAULT_TERM_FG, ansi: [...DOS_PALETTE] });
  });

  it('changes only the background for an off-palette colour from a dark one', () => {
    expect(backgroundPatch('#1a0e0e', '#123456')).toEqual({ bg: '#123456' });
  });
});

describe('BACKGROUND_THEMES', () => {
  it('has a theme for every background preset', () => {
    for (const p of TERMINAL_BG_PRESETS) expect(backgroundTheme(p.hex), p.name).not.toBeNull();
    expect(backgroundTheme('#123456')).toBeNull();
  });

  it('uses only named font colour presets (ADR 0062)', () => {
    for (const [name, t] of Object.entries(BACKGROUND_THEMES)) expect(presetName(TERMINAL_FG_PRESETS, t.fg), name).not.toBeNull();
  });

  it('keeps DOS and silver on black', () => {
    expect(BACKGROUND_THEMES.black).toEqual({ fg: DEFAULT_TERM_FG, ansi: DOS_PALETTE });
  });

  for (const p of TERMINAL_BG_PRESETS.filter((q) => q.name !== 'black')) {
    it(`${p.name}: colours 1–15 and the font colour read at 4.5:1 or better`, () => {
      const t = BACKGROUND_THEMES[p.name]!;
      expect(t.ansi).toHaveLength(16);
      const ink = p.name === 'paper' ? t.ansi : t.ansi.slice(1);
      for (const c of [...ink, t.fg]) expect(contrast(c, p.hex), c).toBeGreaterThanOrEqual(4.5);
    });
  }

  for (const p of TERMINAL_BG_PRESETS.filter((q) => q.name !== 'black' && q.name !== 'paper')) {
    it(`${p.name}: the font colour is colour 7 and bright white outshines it`, () => {
      const t = BACKGROUND_THEMES[p.name]!;
      expect(t.fg).toBe(t.ansi[7]);
      expect(contrast(t.ansi[15]!, p.hex)).toBeGreaterThan(contrast(t.ansi[7]!, p.hex));
    });
  }
});
