import { describe, expect, it } from 'vitest';
import { rgb } from '../../src/core/types';
import { ESC, harness, lines, one } from './text-helpers';

describe('LineAssembler: ANSI SGR', () => {
  it('parses a coloured line the way MUME sends it', () => {
    const l = one(`${ESC}[35mA blue wall appears.${ESC}[0m\r\n`);
    expect(l.text).toBe('A blue wall appears.');
    expect(l.runs).toEqual([{ start: 0, end: 20, fg: 5 }]);
    expect(l.raw).toBe(`${ESC}[35mA blue wall appears.${ESC}[0m`);
  });

  it('leaves unstyled gaps out of runs', () => {
    const l = one(`ab${ESC}[32mcd${ESC}[mef\n`);
    expect(l.runs).toEqual([{ start: 2, end: 4, fg: 2 }]);
  });

  it('maps bright and background colours', () => {
    const l = one(`${ESC}[91;104mX${ESC}[39mY${ESC}[49mZ\n`);
    expect(l.runs).toEqual([
      { start: 0, end: 1, fg: 9, bg: 12 },
      { start: 1, end: 2, bg: 12 },
    ]);
  });

  it('parses 256-colour and truecolor forms', () => {
    const l = one(`${ESC}[38;5;208mA${ESC}[48;2;1;2;3mB${ESC}[0m\n`);
    expect(l.runs).toEqual([
      { start: 0, end: 1, fg: 208 },
      { start: 1, end: 2, fg: 208, bg: rgb(1, 2, 3) },
    ]);
  });

  it('accepts colon separators', () => {
    expect(one(`${ESC}[38:5:21mA\n`).runs).toEqual([{ start: 0, end: 1, fg: 21 }]);
  });

  it('sets and clears attributes', () => {
    const l = one(
      `${ESC}[1;3;4;5;7mA${ESC}[22mB${ESC}[23mC${ESC}[24mD${ESC}[25mE${ESC}[27mF\n`,
    );
    expect(l.runs).toEqual([
      { start: 0, end: 1, bold: true, italic: true, underline: true, blink: true, inverse: true },
      { start: 1, end: 2, italic: true, underline: true, blink: true, inverse: true },
      { start: 2, end: 3, underline: true, blink: true, inverse: true },
      { start: 3, end: 4, blink: true, inverse: true },
      { start: 4, end: 5, inverse: true },
    ]);
  });

  it('keeps the colour index when bold (bold does not brighten)', () => {
    expect(one(`${ESC}[1;31mX\n`).runs).toEqual([{ start: 0, end: 1, fg: 1, bold: true }]);
  });

  it('handles MUME combined codes like 0;37;46', () => {
    expect(one(`${ESC}[0;37;46m foo ${ESC}[0m\n`).runs).toEqual([
      { start: 0, end: 5, fg: 7, bg: 6 },
    ]);
  });

  it('merges adjacent runs with identical style', () => {
    const l = one(`${ESC}[32mab${ESC}[0m${ESC}[32mcd${ESC}[32mef\n`);
    expect(l.runs).toEqual([{ start: 0, end: 6, fg: 2 }]);
  });

  it('keeps SGR state across lines', () => {
    const ls = lines(`${ESC}[33mone\r\ntwo${ESC}[0m\r\nthree\r\n`);
    expect(ls.map((l) => l.runs)).toEqual([
      [{ start: 0, end: 3, fg: 3 }],
      [{ start: 0, end: 3, fg: 3 }],
      [],
    ]);
    expect(ls[1]!.raw).toBe(`two${ESC}[0m`);
  });

  it('strips non-SGR CSI and other escape sequences from text and raw', () => {
    const l = one(`a${ESC}[2Jb${ESC}[?25lc${ESC}(Bd${ESC}]0;title\x07e${ESC}7f\n`);
    expect(l.text).toBe('abcdef');
    expect(l.raw).toBe('abcdef');
    expect(l.runs).toEqual([]);
  });

  it('handles escape sequences split across chunks', () => {
    const src = `x${ESC}[1;38;5;196my${ESC}[0mz\n`;
    for (let cut = 1; cut < src.length; cut++) {
      const h = harness();
      h.asm.text(src.slice(0, cut), 1);
      h.asm.text(src.slice(cut), 1);
      expect(h.lines).toEqual(lines(src));
    }
    expect(one(src).runs).toEqual([{ start: 1, end: 2, fg: 196, bold: true }]);
  });

  it('survives a lone ESC before a newline', () => {
    expect(lines(`a${ESC}\nb\n`).map((l) => l.text)).toEqual(['a', 'b']);
  });

  it('ignores a malformed extended colour', () => {
    expect(one(`${ESC}[38;9;1mA\n`).runs).toEqual([]);
  });

  describe('colour-heavy lines (help 24-bit colours)', () => {
    // One cell per colour, as MUME's colour help draws its tables.
    const truecolor = (cells: number): string => {
      let s = '';
      for (let k = 0; k < cells; k++) s += `${ESC}[48;2;${k};${255 - k};${(k * 7) & 255}m${ESC}[38;5;${k & 255}m${k % 10}`;
      return s + `${ESC}[0m`;
    };
    const runsOf = (cells: number) =>
      Array.from({ length: cells }, (_, k) => ({
        start: k,
        end: k + 1,
        fg: k & 255,
        bg: rgb(k, 255 - k, (k * 7) & 255),
      }));

    it('keeps raw byte-identical and gives one run per cell (24-bit / 256-colour)', () => {
      const body = truecolor(96);
      const l = one(`${body}\r\n`);
      expect(l.raw).toBe(body);
      expect(l.text).toBe(Array.from({ length: 96 }, (_, k) => String(k % 10)).join(''));
      expect(l.runs).toEqual(runsOf(96));
    });

    it('keeps raw and runs across many lines in one chunk', () => {
      const rows = [truecolor(40), `plain ${ESC}[1;31mbold red${ESC}[22m red${ESC}[0m end`, truecolor(7)];
      const ls = lines(rows.map((r) => `${r}\r\n`).join(''));
      expect(ls.map((l) => l.raw)).toEqual(rows);
      expect(ls[0]!.runs).toEqual(runsOf(40));
      expect(ls[1]!.runs).toEqual([
        { start: 6, end: 14, fg: 1, bold: true },
        { start: 14, end: 18, fg: 1 },
      ]);
      expect(ls[2]!.runs).toEqual(runsOf(7));
    });

    it('gives the same raw and runs for every split point', () => {
      const src = `${truecolor(12)}\r\nnext ${ESC}[38;2;1;2;3mx${ESC}[2Ky${ESC}[0m\r\n`;
      const whole = lines(src);
      expect(whole[1]!.raw).toBe(`next ${ESC}[38;2;1;2;3mxy${ESC}[0m`);
      for (let cut = 1; cut < src.length; cut++) {
        const h = harness();
        h.asm.text(src.slice(0, cut), 1);
        h.asm.text(src.slice(cut), 1);
        expect(h.lines, `cut at ${cut}`).toEqual(whole);
      }
    });

    it('keeps raw across dropped controls, DEL and a long SGR', () => {
      const params = Array.from({ length: 20 }, () => '1').join(';');
      const l = one(`a\rb\x7fc${ESC}[${params};32md\x07e\r\n`);
      expect(l.text).toBe('abcde');
      expect(l.raw).toBe(`abc${ESC}[${params};32mde`);
      expect(l.runs).toEqual([{ start: 3, end: 5, fg: 2, bold: true }]);
      // The parameter array is reused: a short SGR after a long one reads only its own values.
      expect(one(`${ESC}[${params};32mx${ESC}[0;33my\n`).runs).toEqual([
        { start: 0, end: 1, fg: 2, bold: true },
        { start: 1, end: 2, fg: 3 },
      ]);
    });
  });
});
