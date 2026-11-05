// Pane hover buttons (ADR 0095): labels, states and what fits.
import { describe, expect, it } from 'vitest';
import { CROSS_CELLS_BORDERLESS, CROSS_CELLS_FRAMED, LOOK_ICONS, PANE_LOOKS, hoverFit, lookButtonsFit, lookLabel, lookOn, lookSlot } from '../../src/layout/pane-buttons';

const P = { on: true, color: 'black' as const, border: true, glass: true };

describe('pane look buttons', () => {
  it('are Colour, Border, Background from the left, slot 0 next to the cross', () => {
    expect(PANE_LOOKS).toEqual(['color', 'border', 'glass']);
    expect(PANE_LOOKS.map(lookSlot)).toEqual([2, 1, 0]);
  });

  it('label the action and the state', () => {
    expect(lookLabel('color', P)).toBe('Colour: Plain');
    expect(lookLabel('color', { ...P, color: 'orange' })).toBe('Colour: Orange');
    expect(lookLabel('border', P)).toBe('Border: on');
    expect(lookLabel('border', { ...P, border: false })).toBe('Border: off');
    expect(lookLabel('glass', P)).toBe('Background: glass');
    expect(lookLabel('glass', { ...P, glass: false })).toBe('Background: clear');
    expect(lookOn('border', { ...P, border: false })).toBe(false);
    expect(lookOn('glass', { ...P, glass: false })).toBe(false);
    expect(lookOn('color', P)).toBe(true);
  });

  it('fit right of the title with half a cell to spare; all of them with nothing to keep clear', () => {
    // 30 cells of 10 px: the cross takes the last four, each button two.
    expect(lookButtonsFit(300, 10, 0)).toBe(3);
    expect(lookButtonsFit(300, 10, 195)).toBe(3); // the third's left edge at 200
    expect(lookButtonsFit(300, 10, 196)).toBe(2);
    expect(lookButtonsFit(300, 10, 215)).toBe(2);
    expect(lookButtonsFit(300, 10, 216)).toBe(1);
    expect(lookButtonsFit(300, 10, 256)).toBe(0);
    // A pane narrower than the cross and one button.
    expect(lookButtonsFit(50, 10, 0)).toBe(0);
    // Borderless (round 1): the cross at the edge, so one cell more for the buttons.
    expect(lookButtonsFit(300, 10, 205, CROSS_CELLS_BORDERLESS)).toBe(3);
    expect(lookButtonsFit(300, 10, 206, CROSS_CELLS_BORDERLESS)).toBe(2);
    expect(CROSS_CELLS_FRAMED).toBe(4);
  });

  it('beside the lantern hood: clear of it when they fit, over its right part when not, dropped only past its left end', () => {
    // 25 cells of 10 px, the Gear and three look buttons: the set from 130 (twelve cells from the right).
    expect(hoverFit(250, 10, 4, 128, 42)).toEqual({ fit: 4, cover: null });
    expect(hoverFit(250, 10, 4, 130, 42)).toEqual({ fit: 4, cover: null });
    // The hood (moved left as far as it goes) ends at 104: the set lies over its right part.
    expect(hoverFit(200, 10, 4, 104, 42)).toEqual({ fit: 4, cover: 80 });
    expect(hoverFit(170, 10, 4, 104, 42)).toEqual({ fit: 4, cover: 50 });
    // The label's start (the hood's left end and rivet) stays clear: the Gear drops first, then Colour.
    expect(hoverFit(160, 10, 4, 104, 42)).toEqual({ fit: 3, cover: 60 });
    expect(hoverFit(140, 10, 4, 100, 42)).toEqual({ fit: 2, cover: 60 });
    expect(hoverFit(100, 10, 4, 80, 42)).toEqual({ fit: 0, cover: 60 });
    // Three buttons (no Gear).
    expect(hoverFit(170, 10, 3, 104, 42)).toEqual({ fit: 3, cover: 70 });
    // No hood: nothing to cover or keep clear.
    expect(hoverFit(100, 10, 4, 0, 0)).toEqual({ fit: 3, cover: null });
  });

  it('icons are inline SVG or CSS, without ids (they repeat in every pane)', () => {
    for (const k of PANE_LOOKS) expect(LOOK_ICONS[k]).not.toMatch(/\bid=/);
    expect(LOOK_ICONS.border).toMatch(/^<svg /);
    expect(LOOK_ICONS.glass).toContain('wc-look-clear');
  });
});
