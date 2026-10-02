// Choosing the `paper` background in Options → Appearance also sets ink and
// the paper palette; leaving it puts the defaults back.
import { describe, expect, it } from 'vitest';
import { backgroundPatch } from '../../src/chrome/frames/options';
import { contrast } from '../../src/theme/color';
import { DEFAULT_TERM_FG, DOS_PALETTE, PAPER_PALETTE } from '../../src/theme/presets';

const PAPER = '#f4ecd8';

describe('backgroundPatch', () => {
  it('sets ink and the paper palette on paper', () => {
    expect(backgroundPatch('#000000', PAPER)).toEqual({ bg: PAPER, fg: '#000000', ansi: [...PAPER_PALETTE] });
  });

  it('puts the default font colour and palette back when leaving paper', () => {
    expect(backgroundPatch(PAPER, '#000000')).toEqual({ bg: '#000000', fg: DEFAULT_TERM_FG, ansi: [...DOS_PALETTE] });
  });

  it('changes only the background between other backgrounds', () => {
    expect(backgroundPatch('#000000', '#1a0e0e')).toEqual({ bg: '#1a0e0e' });
  });
});

describe('PAPER_PALETTE', () => {
  it('reads at 4.5:1 or better on paper', () => {
    expect(PAPER_PALETTE).toHaveLength(16);
    for (const c of PAPER_PALETTE) expect(contrast(c, PAPER), c).toBeGreaterThanOrEqual(4.5);
  });
});
