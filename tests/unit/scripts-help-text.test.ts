// Help typesetting (src/scripts/help-text.ts, ADR 0121 "Help text"): the
// rules on small inputs, and every bundled script's help at the widths of
// the Scripts page and the in-game window.

import { describe, expect, it } from 'vitest';
import { BUNDLED_SCRIPTS } from '../../src/scripts/bundled';
import { parseHeader } from '../../src/scripts/header';
import { type HelpLine, helpBlocks, helpLineText, typesetHelp, wrapWords } from '../../src/scripts/help-text';

const text = (lines: HelpLine[]): string[] => lines.map(helpLineText);
const roles = (l: HelpLine): string[] => l.filter((s) => s.role).map((s) => s.role!);
const helpOf = (name: string): string[] => parseHeader(BUNDLED_SCRIPTS.find((b) => b.name === name)!.source).header.help;

describe('typesetHelp', () => {
  it('joins unindented lines into paragraphs and wraps them', () => {
    const out = typesetHelp(['One two three', 'four five.', '', '', 'Six.'], 12);
    expect(text(out)).toEqual(['One two', 'three four', 'five.', '', 'Six.']);
    expect(roles(out[0]!)).toEqual(['text']);
  });

  it('lays out list items with a hanging indent', () => {
    const out = typesetHelp(['Intro:', '- first item that', 'goes on', '• second'], 14);
    expect(text(out)).toEqual(['Intro:', '- first item', '  that goes on', '• second']);
    expect(roles(out[1]!)).toEqual(['bullet', 'text']);
  });

  it('makes a heading of ## with a blank line above', () => {
    const out = typesetHelp(['Text.', '## Usage', 'More.'], 20);
    expect(text(out)).toEqual(['Text.', '', 'Usage', 'More.']);
    expect(roles(out[2]!)).toEqual(['heading']);
  });

  it('typesets a run of term  description lines as a table', () => {
    const lines = ['  cmd       does a thing', '  cmd two   another thing that is long', '            and goes on'];
    const out = typesetHelp(lines, 40);
    expect(text(out)).toEqual(['  cmd      does a thing', '  cmd two  another thing that is long', '           and goes on']);
    expect(roles(out[0]!)).toEqual(['term', 'desc']);
    // A term column above 40 % of the width: the description under its term.
    expect(text(typesetHelp(lines, 20))).toEqual(['  cmd', '      does a thing', '  cmd two', '      another thing', '      that is long', '      and goes on']);
  });

  it('keeps any other indented run as written, wrapping a long line with a hanging indent', () => {
    const out = typesetHelp(['  A line.   becomes: B', '  no gap here', '    deeper'], 40);
    expect(text(out)).toEqual(['  A line.   becomes: B', '  no gap here', '    deeper']);
    expect(roles(out[0]!)).toEqual(['pre']);
    // A term ending a sentence is not a table.
    expect(roles(typesetHelp(['  Frodo leaves west.   becomes: X'], 40)[0]!)).toEqual(['pre']);
    expect(text(typesetHelp(['  aaaa bbbb cccc dddd eeee'], 16))).toEqual(['  aaaa bbbb cccc', '    dddd eeee']);
  });

  it('wraps words, splitting one longer than the line', () => {
    expect(wrapWords('ab cdefghij k', 4)).toEqual(['ab', 'cdef', 'ghij', 'k']);
    expect(wrapWords('', 4)).toEqual(['']);
  });
});

describe('bundled help', () => {
  const widths = [28, 36, 44, 60, 80, 120];

  it('never runs wider than the width', () => {
    for (const b of BUNDLED_SCRIPTS) {
      const help = parseHeader(b.source).header.help;
      for (const w of widths) {
        for (const l of text(typesetHelp(help, w))) expect([...l].length, `${b.name} @${w}: ${l}`).toBeLessThanOrEqual(w);
      }
    }
  });

  it('finds the command tables', () => {
    const tableTerms = (name: string, w = 80): string[] =>
      typesetHelp(helpOf(name), w).flatMap((l) => l.filter((s) => s.role === 'term').map((s) => s.text));
    expect(tableTerms('almanac')).toEqual(
      expect.arrayContaining(['NOW', 'PLAN', 'LORE', 'almanac', 'almanac now|plan|lore', 'almanac import <line>']),
    );
    expect(tableTerms('mercenaries')).toEqual([
      'merc',
      'merc autopay',
      'merc cost [10|20]',
      'merc pay [name]',
      'merc list',
      'merc label <who>',
      'merc forget <name>',
    ]);
    expect(tableTerms('mapsearch')).toEqual(['Name', 'Description', 'Contents', 'Area', 'Exits', 'Notes', 'Flags', 'All', 'mapsearch', 'Ctrl+F', 'mapsearch <text>']);
    expect(tableTerms('keymanager')).toEqual(['locatel home', 'locatel troll cave', 'teleport home', 'portal home', "cast 'teleport' $home"]);
    // A continuation line joins its description.
    const merc = text(typesetHelp(helpOf('mercenaries'), 80));
    const at = merc.findIndex((l) => l.startsWith('  merc label <who>    label and track a mercenary by hand, for example'));
    expect(merc[at + 1]).toMatch(/^ {22}\S/);
    expect(merc[at + 1]!.trim()).toBe('label 2.mercenary');
  });

  it('keeps readability\'s examples preformatted', () => {
    const out = typesetHelp(helpOf('readability'), 80);
    const pre = out.filter((l) => roles(l).includes('pre')).map(helpLineText);
    expect(pre).toEqual(
      expect.arrayContaining([
        '  A huge, black bear is here, proud heir to the great and',
        '    ancient mountain bears.',
        '  becomes: The huge, black bear is here.   (name in gold)',
        '  A young troll leaves north.   becomes: A young troll leaves north ▲',
        '  Frodo leaves west.            becomes: Frodo leaves ◄ west',
        '  #script set readability shortnames off',
      ]),
    );
    expect(out.some((l) => roles(l).includes('term'))).toBe(false);
  });

  it('has the headings', () => {
    const headings = (name: string): string[] =>
      typesetHelp(helpOf(name), 80)
        .filter((l) => roles(l)[0] === 'heading')
        .map(helpLineText);
    expect(headings('almanac')).toEqual(['Three tabs', 'Your own events', 'Commands']);
    expect(headings('keymanager')).toEqual(['The pick window', 'The safe key', 'TV', 'The Port keys pane']);
    expect(headings('readability')).toEqual(['Mobs', 'Movement', 'Exits and flags', 'Turning a part off']);
  });
});

describe('helpBlocks (the Scripts page\'s DOM help, stage 44a)', () => {
  /** The blocks typeset as `typesetHelp` would: the same decisions give the same lines. */
  const linesOf = (help: readonly string[], w: number): string[] => {
    const out: string[] = [];
    for (const b of helpBlocks(help)) {
      switch (b.kind) {
        case 'blank':
          out.push('');
          break;
        case 'heading':
        case 'para':
          out.push(...wrapWords(b.text, w));
          break;
        case 'item':
          wrapWords(b.text, w - b.bullet.length - 1).forEach((l, i) => out.push(i === 0 ? `${b.bullet} ${l}` : `${' '.repeat(b.bullet.length + 1)}${l}`));
          break;
        case 'table': {
          const termW = Math.max(...b.rows.map((r) => [...r.term].length));
          // typesetHelp's rule: the term column over 40 % of the width, or under 12 cells for the text.
          const stacked = 2 + termW + 2 > w * 0.4 || w - (2 + termW + 2) < 12;
          for (const r of b.rows) {
            if (stacked) {
              out.push(...wrapWords(r.term, w - 2).map((l) => `  ${l}`));
              out.push(...wrapWords(r.desc, w - 6).map((l) => `      ${l}`));
              continue;
            }
            const at = 2 + termW + 2;
            wrapWords(r.desc, w - at).forEach((l, i) => out.push(i === 0 ? `  ${r.term.padEnd(termW + 2)}${l}` : `${' '.repeat(at)}${l}`));
          }
          break;
        }
        case 'pre':
          for (const l of b.lines) out.push(`  ${l}`);
          break;
      }
    }
    return out;
  };

  it('makes the same block decisions as typesetHelp for every bundled script', () => {
    for (const b of BUNDLED_SCRIPTS) {
      const help = parseHeader(b.source).header.help;
      // Wide enough that no pre line wraps (pre runs are kept as written).
      for (const w of [80, 120]) expect(linesOf(help, w), `${b.name} @${w}`).toEqual(text(typesetHelp(help, w)));
    }
  });

  it('gives paragraphs, items, tables (not when a term ends a sentence), pre runs and headings', () => {
    const blocks = helpBlocks(['Intro', 'goes on.', '', '- one', '• two', '## Usage', '  cmd   does it', '  cmd2  more', '', '  A line.   becomes: B']);
    expect(blocks.map((b) => b.kind)).toEqual(['para', 'blank', 'item', 'item', 'blank', 'heading', 'table', 'blank', 'pre']);
    expect(blocks[0]).toEqual({ kind: 'para', text: 'Intro goes on.' });
    expect(blocks[3]).toEqual({ kind: 'item', bullet: '•', text: 'two' });
    expect(blocks[6]).toEqual({ kind: 'table', rows: [{ term: 'cmd', desc: 'does it' }, { term: 'cmd2', desc: 'more' }] });
    expect(blocks[8]).toEqual({ kind: 'pre', lines: ['A line.   becomes: B'] });
  });
});
