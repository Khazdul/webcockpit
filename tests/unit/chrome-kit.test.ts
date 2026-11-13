import { describe, expect, it } from 'vitest';
import {
  centreLeft,
  footerText,
  navKey,
  step,
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

  it('flags windows below 60×18 cells', () => {
    expect(tooSmall(60, 18)).toBe(false);
    expect(tooSmall(59, 40)).toBe(true);
    expect(tooSmall(100, 17)).toBe(true);
  });
});
