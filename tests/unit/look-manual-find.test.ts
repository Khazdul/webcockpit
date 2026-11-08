// Stage 42e (ADR 0127): find in the lantern manual, the pure part
// (src/editor/look-manual-find.ts): the blocks a section is drawn as, the
// search over them (the toggles, a bad regex, the 1000 cap), where the
// first match lies from the current section, and the count text.
import { describe, expect, it } from 'vitest';
import { type HelpSection, helpSections } from '../../src/editor/help';
import {
  SECTION_MATCH_MAX,
  findInSections,
  firstInSection,
  manualBlocks,
  matchesByBlock,
  sectionBlocks,
  sectionCountText,
} from '../../src/editor/look-manual-find';
import { EMPTY_QUERY, type FindQuery } from '../../src/editor/manual-search';
import { scriptManualSections } from '../../src/editor/script-reference';

const q = (search: string, over: Partial<FindQuery> = {}): FindQuery => ({ ...EMPTY_QUERY, search, ...over });

const REF: HelpSection = {
  group: 'reference',
  heading: 'tempTimer',
  syntax: ['tempTimer(seconds, fn)', 'tempTimer(seconds, fn, repeat)'],
  text: [
    'Runs fn after a while.',
    '- once by default',
    '- again with repeat',
    'Parameters:',
    '- seconds (number): how long to wait',
    '- fn (function): what to run',
    'Returns: the timer id',
  ],
  examples: [{ code: 'tempTimer(5, function()\n  send("look")\nend)', lang: 'lua', note: 'Look in five seconds:' }],
};

describe('manualBlocks', () => {
  it('splits a section into the blocks the reader draws, in reading order', () => {
    expect(manualBlocks(REF).map((b) => [b.kind, b.text])).toEqual([
      ['heading', 'tempTimer'],
      ['syntax', 'tempTimer(seconds, fn)'],
      ['syntax', 'tempTimer(seconds, fn, repeat)'],
      ['para', 'Runs fn after a while.'],
      ['item', 'once by default'],
      ['item', 'again with repeat'],
      ['label', 'Parameters'],
      ['param', 'seconds (number): how long to wait'],
      ['param', 'fn (function): what to run'],
      ['label', 'Returns'],
      ['para', 'the timer id'],
      ['note', 'Look in five seconds:'],
      ['code', 'tempTimer(5, function()'],
      ['code', '  send("look")'],
      ['code', 'end)'],
    ]);
    const code = manualBlocks(REF).filter((b) => b.kind === 'code');
    expect(code.every((b) => b.ex === 0 && b.lang === 'lua')).toBe(true);
  });

  it('gives tt++ examples by default and caches per section', () => {
    const s: HelpSection = { group: 'basics', heading: 'Keys', text: ['A key.'], examples: [{ code: '#macro {\\eOP} {flee}' }] };
    expect(manualBlocks(s).at(-1)).toEqual({ kind: 'code', text: '#macro {\\eOP} {flee}', ex: 0, lang: 'tt' });
    expect(manualBlocks(s)).toBe(manualBlocks(s));
    expect(sectionBlocks(s)).toEqual(['Keys', 'A key.', '#macro {\\eOP} {flee}']);
  });

  it('draws every section of both manuals', () => {
    for (const s of [...helpSections(), ...scriptManualSections()]) {
      const blocks = manualBlocks(s);
      expect(blocks[0]).toEqual({ kind: 'heading', text: s.heading });
      // Nothing is lost: every text line is a block (an item without its dash, "Returns:" split in two).
      const texts = blocks.filter((b) => b.kind !== 'heading' && b.kind !== 'syntax' && b.kind !== 'note' && b.kind !== 'code');
      const parts = s.text.reduce((n, t) => n + (t.startsWith('Returns: ') ? 2 : 1), 0);
      expect(texts.length).toBe(parts);
    }
  });
});

describe('findInSections', () => {
  const sections: HelpSection[] = [
    { group: 'intro', heading: 'Timers', text: ['A timer runs.', 'TIMER and timers.'] },
    { group: 'basics', heading: 'Other', text: ['Nothing here.'], examples: [{ code: '#ticker {t} {timer} {1}' }] },
  ];

  it('finds in every block, case-insensitive by default', () => {
    const r = findInSections(sections, q('timer'));
    expect(r.valid).toBe(true);
    expect(r.matches.map((m) => [m.section, m.block, m.from, m.to])).toEqual([
      [0, 0, 0, 5],
      [0, 1, 2, 7],
      [0, 2, 0, 5],
      [0, 2, 10, 15],
      [1, 2, 13, 18],
    ]);
  });

  it('honours Case, Word and Regex', () => {
    expect(findInSections(sections, q('timer', { caseSensitive: true })).matches).toHaveLength(3);
    expect(findInSections(sections, q('timer', { wholeWord: true })).matches).toHaveLength(3);
    expect(findInSections(sections, q('t[a-z]+r\\b', { regexp: true })).matches.map((m) => [m.section, m.block])).toEqual([
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 2],
      [1, 2],
    ]);
  });

  it('reports a bad regex', () => {
    const r = findInSections(sections, q('(timer', { regexp: true }));
    expect(r).toEqual({ valid: false, matches: [], capped: false });
    expect(sectionCountText(q('(timer', { regexp: true }), r, -1)).toEqual({ text: 'Bad regex', cls: 'wc-c-err' });
  });

  it('stops at 1000 matches', () => {
    const many: HelpSection[] = [{ group: 'intro', heading: 'A', text: ['a '.repeat(700)] }, { group: 'intro', heading: 'B', text: ['a '.repeat(700)] }];
    const r = findInSections(many, q('a'));
    expect(SECTION_MATCH_MAX).toBe(1000);
    expect(r.matches).toHaveLength(1000);
    expect(r.capped).toBe(true);
    expect(sectionCountText(q('a'), r, -1).text).toBe('1000+ matches');
    expect(sectionCountText(q('a'), r, 1).text).toBe('2 of 1000+');
    expect(findInSections(many, q('a'), 10).matches).toHaveLength(10);
  });

  it('has the count texts of the panels', () => {
    const r = findInSections(sections, q('timer'));
    expect(sectionCountText(q('timer'), r, 2)).toEqual({ text: '3 of 5', cls: 'wc-c-body' });
    expect(sectionCountText(q('timer'), r, -1).text).toBe('5 matches');
    expect(sectionCountText(q('zzz'), findInSections(sections, q('zzz')), -1)).toEqual({ text: 'No matches', cls: 'wc-c-err' });
    expect(sectionCountText(EMPTY_QUERY, findInSections(sections, EMPTY_QUERY), -1).text).toBe('');
  });

  it('finds "timer" in the script manual', () => {
    const r = findInSections(scriptManualSections(), q('timer'));
    expect(r.valid).toBe(true);
    expect(r.matches.length).toBeGreaterThan(10);
  });
});

describe('firstInSection and matchesByBlock', () => {
  const sections: HelpSection[] = [
    { group: 'intro', heading: 'orc', text: ['orc'] },
    { group: 'intro', heading: 'elf', text: ['elf'] },
    { group: 'intro', heading: 'Orcs', text: ['an orc'] },
  ];
  const r = findInSections(sections, q('orc'));

  it('picks the first match in the section or after it, wrapping', () => {
    expect(firstInSection(r.matches, 0)).toBe(0);
    expect(firstInSection(r.matches, 1)).toBe(2);
    expect(firstInSection(r.matches, 2)).toBe(2);
    expect(firstInSection(r.matches, 3)).toBe(0);
    expect(firstInSection([], 0)).toBe(-1);
  });

  it('groups matches by section and block', () => {
    const by = matchesByBlock(r.matches);
    expect([...by.keys()]).toEqual([0, 2]);
    expect([...by.get(2)!.keys()]).toEqual([0, 1]);
    expect(by.get(0)!.get(1)).toEqual([{ section: 0, block: 1, from: 0, to: 3 }]);
  });
});
