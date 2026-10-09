// wrapText (src/scripts/wrap.ts, ADR 0089): word-wrapping cecho text to a
// script pane's width, measured as the pane measures it.

import { describe, expect, it } from 'vitest';
import { TRUECOLOR, shadeColor } from '../../src/core/types';
import { PaneContent, type PaneSpan, lineCells } from '../../src/panes/script-content';
import { parseCecho } from '../../src/scripts/colors';
import { wrapText } from '../../src/scripts/wrap';

/** Each line as a pane row draws it: its spans. */
function rows(lines: string[]): PaneSpan[][] {
  const c = new PaneContent('t');
  lines.forEach((l, i) => c.setLine(i, parseCecho(l, { shades: true })));
  return c.lines.map((l) => ('spans' in l ? l.spans : []));
}

const text = (spans: PaneSpan[]): string => spans.map((s) => s.text).join('');

/** No pane row is wider than `w` cells. */
function fits(lines: string[], w: number): void {
  const c = new PaneContent('t');
  lines.forEach((l, i) => c.setLine(i, parseCecho(l, { shades: true })));
  for (const l of c.lines) expect(lineCells(l)).toBeLessThanOrEqual(w);
}

describe('wrapText', () => {
  it('wraps plain text at spaces and drops the spaces at a break', () => {
    const out = wrapText('the quick brown fox jumps over the lazy dog', 10);
    expect(out).toEqual(['the quick', 'brown fox', 'jumps over', 'the lazy', 'dog']);
    fits(out, 10);
  });

  it('leaves text that fits as it is, leading spaces included', () => {
    expect(wrapText('  hi there', 20)).toEqual(['  hi there']);
    expect(wrapText('  hello world', 8)).toEqual(['  hello', 'world']);
    expect(wrapText('', 10)).toEqual(['']);
  });

  it('carries the colour across a break', () => {
    const out = wrapText('<yellow>one two three<reset> four', 8);
    expect(out.length).toBe(3);
    fits(out, 8);
    const r = rows(out);
    expect(r.map(text)).toEqual(['one two', 'three', 'four']);
    const yellow = TRUECOLOR | 0xffff00;
    expect(r[0]).toEqual([{ text: 'one two', fg: yellow }]);
    expect(r[1]).toEqual([{ text: 'three', fg: yellow }]);
    expect(r[2]).toEqual([{ text: 'four' }]);
  });

  it('carries a background and pane shades across a break', () => {
    const out = wrapText('<@text:@dim>alpha beta<reset> <:ansi_4>gamma delta', 6);
    fits(out, 6);
    const r = rows(out);
    expect(r.map(text)).toEqual(['alpha', 'beta', 'gamma', 'delta']);
    expect(r[1]).toEqual([{ text: 'beta', fg: shadeColor('vtext'), bg: shadeColor('dim') }]);
    expect(r[3]).toEqual([{ text: 'delta', bg: 4 }]);
  });

  it('keeps bold and palette colours, and mixed colours on one line', () => {
    const out = wrapText('<ansi_light_black>a <b><red>bb<reset> cc dd', 7);
    const r = rows(out);
    expect(r.map(text)).toEqual(['a bb cc', 'dd']);
    expect(r[0]).toEqual([{ text: 'a ', fg: 8 }, { text: 'bb', fg: TRUECOLOR | 0xff0000, bold: true }, { text: ' cc' }]);
  });

  it('cuts a word wider than the line', () => {
    expect(wrapText('abcdefghij xy', 4)).toEqual(['abcd', 'efgh', 'ij', 'xy']);
    const r = rows(wrapText('<green>abcdefgh', 3));
    expect(r.map(text)).toEqual(['abc', 'def', 'gh']);
    expect(r[2]).toEqual([{ text: 'gh', fg: TRUECOLOR | 0x00ff00 }]);
  });

  it('puts indent spaces before continuation lines, counted in the width', () => {
    const out = wrapText('one two three four five', 9, 2);
    expect(out).toEqual(['one two', '  three', '  four', '  five']);
    fits(out, 9);
    // The indent is unstyled; the colour opens after it.
    const r = rows(wrapText('<cyan>aaa bbb', 5, 2));
    expect(r[1]).toEqual([{ text: '  ' }, { text: 'bbb', fg: TRUECOLOR | 0x00ffff }]);
    // An indent as wide as the line leaves one cell.
    expect(wrapText('ab cd', 2, 5)).toEqual(['ab', ' c', ' d']);
  });

  it('breaks at every \\n, and indents only within a paragraph', () => {
    expect(wrapText('first line\nsecond one here', 8, 1)).toEqual(['first', ' line', 'second', ' one', ' here']);
    expect(wrapText('a\n\nb', 10)).toEqual(['a', '', 'b']);
    // A colour runs on over the \n, as in a pane.
    const r = rows(wrapText('<red>x\ny', 10));
    expect(r[1]).toEqual([{ text: 'y', fg: TRUECOLOR | 0xff0000 }]);
  });

  it('only splits at \\n with a width under 1', () => {
    const long = 'a fairly long line that is not wrapped';
    expect(wrapText(long, 0)).toEqual([long]);
    expect(wrapText(`${long}\nnext`, -3)).toEqual([long, 'next']);
    expect(wrapText(long, Number.NaN)).toEqual([long]);
  });

  it('counts characters as the pane does: ★ and å are one cell, tags none, a tab one', () => {
    const out = wrapText('<yellow>★★★ åäö<reset> bär\tö', 7);
    fits(out, 7);
    expect(rows(out).map(text)).toEqual(['★★★ åäö', 'bär ö']);
    expect(wrapText('★★★★★★', 4)).toEqual(['★★★★', '★★']);
    expect(wrapText('å å å å', 3)).toEqual(['å å', 'å å']);
  });
});
