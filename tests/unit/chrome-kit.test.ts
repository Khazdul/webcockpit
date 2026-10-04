import { describe, expect, it } from 'vitest';
import {
  centreLeft,
  cycle,
  firstEnabled,
  footerRows,
  footerText,
  navKey,
  packRows,
  scrollToShow,
  scrollbar,
  step,
  stepValue,
  tooSmall,
  truncate,
  wrapText,
} from '../../src/chrome/kit/nav';

describe('navKey', () => {
  it('maps the navigation grammar', () => {
    expect(navKey({ key: 'ArrowUp' })).toBe('up');
    expect(navKey({ key: 'ArrowRight' })).toBe('right');
    expect(navKey({ key: 'Tab' })).toBe('tab');
    expect(navKey({ key: 'Tab', shiftKey: true })).toBe('backtab');
    expect(navKey({ key: 'Enter' })).toBe('activate');
    expect(navKey({ key: ' ' })).toBe('activate');
    expect(navKey({ key: 'Escape' })).toBe('back');
    expect(navKey({ key: 'PageDown' })).toBe('pgdn');
    expect(navKey({ key: 'Home' })).toBe('home');
  });

  it('ignores characters and modified keys', () => {
    expect(navKey({ key: 'a' })).toBeNull();
    expect(navKey({ key: 'Enter', ctrlKey: true })).toBeNull();
    expect(navKey({ key: 'ArrowUp', altKey: true })).toBeNull();
  });
});

describe('step', () => {
  const en = (dis: number[]) => (i: number) => !dis.includes(i);

  it('wraps on menus and clamps elsewhere', () => {
    expect(step(5, 4, 1, { wrap: true })).toBe(0);
    expect(step(5, 0, -1, { wrap: true })).toBe(4);
    expect(step(5, 4, 1)).toBe(4);
    expect(step(5, 0, -1)).toBe(0);
  });

  it('skips disabled items', () => {
    expect(step(5, 0, 1, { enabled: en([1, 2]) })).toBe(3);
    expect(step(5, 3, -1, { enabled: en([1, 2]) })).toBe(0);
    expect(step(5, 4, 1, { wrap: true, enabled: en([0]) })).toBe(1);
    // Nothing else selectable: stay.
    expect(step(3, 1, 1, { enabled: en([0, 2]) })).toBe(1);
    // Disabled at the clamped end: stay.
    expect(step(3, 1, 1, { enabled: en([2]) })).toBe(1);
  });

  it('pages and clamps to the nearest selectable', () => {
    expect(step(30, 5, 10)).toBe(15);
    expect(step(30, 25, 10)).toBe(29);
    expect(step(30, 3, -10)).toBe(0);
    expect(step(30, 25, 10, { enabled: en([29]) })).toBe(28);
  });

  it('finds the first enabled', () => {
    expect(firstEnabled(4, en([0, 1]))).toBe(2);
    expect(firstEnabled(4, en([3]), 3)).toBe(0);
    expect(firstEnabled(2, () => false)).toBe(-1);
  });
});

describe('cyclers and steppers', () => {
  it('cycles with wrap; an unknown value starts at the ends', () => {
    const l = ['auto', 'quadrant', 'block'];
    expect(cycle(l, 'auto', 1)).toBe('quadrant');
    expect(cycle(l, 'block', 1)).toBe('auto');
    expect(cycle(l, 'auto', -1)).toBe('block');
    expect(cycle(l, 'nope', 1)).toBe('auto');
    expect(cycle(l, 'nope', -1)).toBe('block');
  });

  it('steps numbers within bounds on the step grid', () => {
    expect(stepValue(15, 1, 6, 32)).toBe(16);
    expect(stepValue(32, 1, 6, 32)).toBe(32);
    expect(stepValue(6, -1, 6, 32)).toBe(6);
    expect(stepValue(0, 1, 0, 40, 2)).toBe(2);
    expect(stepValue(3, 1, 0, 40, 2)).toBe(6);
    expect(stepValue(40, 1, 0, 40, 2)).toBe(40);
  });
});

describe('layout helpers', () => {
  it('centres on whole cells', () => {
    expect(centreLeft(80, 20)).toBe(30);
    expect(centreLeft(81, 20)).toBe(30);
    expect(centreLeft(10, 20)).toBe(0);
  });

  it('joins footers the Cockpit way', () => {
    expect(footerText(['↑↓ Navigate', 'Enter Select', 'ESC Back'])).toBe('↑↓ Navigate · Enter Select · ESC Back');
  });

  it('truncates with an ellipsis', () => {
    expect(truncate('JetBrains Mono', 20)).toBe('JetBrains Mono');
    expect(truncate('JetBrains Mono', 8)).toBe('JetBrai…');
    expect(truncate('abc', 0)).toBe('');
  });

  it('word-wraps and splits long words', () => {
    expect(wrapText('Not all those who wander are lost.', 12)).toEqual(['Not all', 'those who', 'wander are', 'lost.']);
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('a\n\nb', 10)).toEqual(['a', '', 'b']);
  });

  it('keeps the cursor inside the visible window', () => {
    expect(scrollToShow(0, 3, 5, 20)).toBe(0);
    expect(scrollToShow(0, 7, 5, 20)).toBe(3);
    expect(scrollToShow(10, 4, 5, 20)).toBe(4);
    expect(scrollToShow(18, 19, 5, 20)).toBe(15);
    expect(scrollToShow(3, 1, 5, 3)).toBe(0);
  });

  it('draws a scrollbar only when the list overflows', () => {
    expect(scrollbar(5, 10, 0)).toEqual([]);
    const top = scrollbar(20, 10, 0);
    expect(top).toHaveLength(10);
    expect(top.filter(Boolean)).toHaveLength(5);
    expect(top[0]).toBe(true);
    const end = scrollbar(20, 10, 10);
    expect(end[9]).toBe(true);
    expect(end[0]).toBe(false);
  });

  it('flags windows below 60×18 cells', () => {
    expect(tooSmall(60, 18)).toBe(false);
    expect(tooSmall(59, 40)).toBe(true);
    expect(tooSmall(100, 17)).toBe(true);
  });
});

describe('packRows / footerRows (phone wrapping, ADR 0075 §3.2)', () => {
  it('packs in order and starts a new row when the next item does not fit', () => {
    expect(packRows([5, 8, 8, 8, 8, 8], 30, 1)).toEqual([[0, 1, 2], [3, 4, 5]]);
    expect(packRows([5, 8], 14, 1)).toEqual([[0, 1]]);
    expect(packRows([5, 8], 13, 1)).toEqual([[0], [1]]);
  });
  it('gives an over-wide item a row of its own', () => {
    expect(packRows([3, 20, 3], 10, 1)).toEqual([[0], [1], [2]]);
    expect(packRows([], 10, 1)).toEqual([]);
  });
  it('wraps footer tokens at the ` · ` joints', () => {
    const t = ['↑↓ Navigate', '←→ Toggle/Edit', 'Enter Select', 'ESC Back'];
    const rows = footerRows(t, 30);
    expect(rows).toEqual([['↑↓ Navigate', '←→ Toggle/Edit'], ['Enter Select', 'ESC Back']]);
    expect(rows.flat()).toEqual(t);
  });
});
