// Pane hover buttons (ADR 0095): labels, states and what fits.
import { describe, expect, it } from 'vitest';
import { LOOK_ICONS, PANE_LOOKS, lookButtonsFit, lookLabel, lookOn, lookSlot } from '../../src/layout/pane-buttons';

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
  });

  it('icons are inline SVG or CSS, without ids (they repeat in every pane)', () => {
    for (const k of PANE_LOOKS) expect(LOOK_ICONS[k]).not.toMatch(/\bid=/);
    expect(LOOK_ICONS.border).toMatch(/^<svg /);
    expect(LOOK_ICONS.glass).toContain('wc-look-clear');
  });
});
