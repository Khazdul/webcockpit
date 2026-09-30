// `#help` on the input line (src/app/help-command.ts, ADR 0037): what a
// word resolves to, and the list being derived from the manual data.
import { describe, expect, it } from 'vitest';
import { HELP_MAX_W, helpIndex, helpList, helpOutput, helpWidth, resolveHelp } from '../../src/app/help-command';
import { type HelpSection, helpLayout, helpLineText, helpLineWidth, helpSections } from '../../src/editor/help';
import { COMMANDS } from '../../src/script/commands';

const heading = (arg: string): string | null => {
  const t = resolveHelp(arg);
  return t.kind === 'section' ? t.section.heading : null;
};
const message = (arg: string): string | null => {
  const t = resolveHelp(arg);
  return t.kind === 'message' ? t.text : null;
};
const rowText = (out: ReturnType<typeof helpOutput>): string[] =>
  typeof out === 'string' ? [out] : out.map((r) => r.segs.map((s) => s.text).join(''));

describe('#help resolution', () => {
  it('gives the list for no argument', () => {
    expect(resolveHelp('')).toEqual({ kind: 'list' });
    expect(resolveHelp('   ')).toEqual({ kind: 'list' });
  });

  it('resolves command words as commands are resolved', () => {
    expect(heading('alias')).toBe('#alias');
    expect(heading('al')).toBe('#alias');
    expect(heading('#alias')).toBe('#alias');
    expect(heading('#AL')).toBe('#alias');
    expect(heading('{alias}')).toBe('#alias');
    expect(heading('alias and more')).toBe('#alias');
    expect(heading('act')).toBe('#action');
    // One letter that starts several commands is ambiguous, as `#a` is.
    expect(message('a')).toBe('No help for "a". Type #help for the list.');
    expect(heading('hi')).toBe('#highlight');
    expect(heading('var')).toBe('#variable');
    expect(heading('help')).toBe('#help');
  });

  it('maps the #un… forms to their command', () => {
    expect(heading('unalias')).toBe('#alias');
    expect(heading('#unaction')).toBe('#action');
    expect(heading('unvar')).toBe('#variable');
    for (const c of COMMANDS.filter((x) => x.kind === 'undefine')) {
      expect(heading(c.name), c.name).toBe('#' + c.name.slice(2));
    }
  });

  it('finds a section for every command the list names', () => {
    for (const c of helpIndex().commands) expect(heading(c), c).toBe(c);
  });

  it('resolves topics: the full word first, then a command, then the start of a topic', () => {
    expect(heading('patterns')).toBe('Patterns');
    expect(heading('colours')).toBe('Colours');
    expect(heading('colors')).toBe('Colours');
    expect(heading('KEYS')).toBe('Keys');
    expect(heading('unsupported')).toBe('Not supported');
    // `variables` is the topic, `variable` and `var` the command.
    expect(heading('variables')).toBe('Variables $name');
    expect(heading('variable')).toBe('#variable');
    // A short form: the topic wins over a tt++ command that is not run (#path, #break).
    expect(heading('pat')).toBe('Patterns');
    expect(heading('br')).toBe('Braces and ;');
    expect(heading('col')).toBe('Colours');
    for (const t of helpIndex().topics) expect(heading(t), t).not.toBeNull();
    // With a # the word is a command, never a topic.
    expect(heading('#patterns')).toBeNull();
    expect(message('#keys')).toBe('No help for "#keys". Type #help for the list.');
  });

  it('says that an inert or unsupported tt++ command is not supported, with the table hint', () => {
    expect(message('foreach')).toBe('#foreach: Not supported yet; kept in the profile as written.');
    expect(message('#split')).toBe('#split is not supported. Screen and terminal commands do nothing in the browser.');
    expect(message('#read')).toBe('#read is not supported. File commands are not available in the browser.');
    for (const c of COMMANDS.filter((x) => x.inert)) {
      const m = message('#' + c.name);
      expect(m, c.name).toContain(c.hint!);
      expect(m, c.name).toMatch(/not supported/i);
    }
  });

  it('has one line for the commands the menus cover', () => {
    for (const n of ['connect', 'disconnect', 'reconnect', 'replay', 'runlog']) {
      expect(message(n), n).toBe(`#${n} has no help entry; it is handled from the menus.`);
    }
  });

  it('points to #help for an unknown word', () => {
    expect(message('blah')).toBe('No help for "blah". Type #help for the list.');
    expect(message('#')).toBe('No help for "#". Type #help for the list.');
    expect(message('aliases')).toBe('No help for "aliases". Type #help for the list.');
  });
});

describe('#help list', () => {
  it('is derived from the manual: every command section and every topic, in order', () => {
    const sections = helpSections();
    const { commands, topics } = helpIndex();
    expect(commands).toEqual(sections.filter((s) => s.group === 'commands').map((s) => s.heading));
    expect(topics).toEqual(sections.filter((s) => s.topics).map((s) => s.topics![0]));
    expect(sections.filter((s) => s.group === 'basics').every((s) => s.topics?.length)).toBe(true);
    const text = helpList(80).map(helpLineText).join('\n');
    const words = text.split(/\s+/);
    for (const c of commands) expect(words, c).toContain(c);
    for (const t of topics) expect(words, t).toContain(t);
    for (const h of ['#connect', '#disconnect', '#reconnect', '#replay', '#runlog']) expect(text).not.toContain(h);
    expect(text).toContain('#help <command> or #help <topic> shows the details: #help action, #help braces.');
    expect(text).toContain('HELP in the profile editor has the whole manual.');
  });

  it('follows a custom section list', () => {
    const custom: HelpSection[] = [
      { group: 'basics', heading: 'Things', topics: ['things', 'stuff'], text: ['About things.'] },
      { group: 'commands', heading: '#alias', covers: ['alias', 'unalias'], syntax: ['#alias {a} {b}'], text: ['T.'] },
      { group: 'commands', heading: '#gag', covers: ['gag'], text: ['G.'] },
    ];
    expect(helpIndex(custom)).toEqual({ commands: ['#alias', '#gag'], topics: ['things'] });
    expect(helpList(40, custom).map(helpLineText).slice(0, 5)).toEqual(['Commands', '    #alias  #gag', '', 'Topics', '    things']);
    expect(resolveHelp('stuff', custom)).toEqual({ kind: 'section', section: custom[0] });
    expect(resolveHelp('action', custom).kind).toBe('message');
  });

  it('is in columns and fits the width', () => {
    for (const w of [24, 40, 80, 100]) {
      const lines = helpList(w);
      for (const l of lines) expect(helpLineWidth(l), `${w}: ${helpLineText(l)}`).toBeLessThanOrEqual(w);
    }
    expect(helpList(80).length).toBeLessThanOrEqual(14);
    const first = helpList(80)[1]!;
    expect(first.kind).toBe('code');
    expect(first.segs[0]).toEqual({ text: '#action', cls: 'cmd' });
    expect(first.segs.filter((s) => s.cls === 'cmd').length).toBeGreaterThan(3);
  });
});

describe('#help output rows', () => {
  it('prints a section as the HELP view lays it out, without the group title', () => {
    const out = helpOutput('al', 80);
    expect(typeof out).not.toBe('string');
    const section = helpSections().find((s) => s.heading === '#alias')!;
    const layout = helpLayout(79, [section], { groups: false }).lines;
    expect(rowText(out)).toEqual(['', ...layout.map(helpLineText)]);
    expect(rowText(out).slice(0, 4)).toEqual(['', '#alias', '    #alias {pattern} {commands} {priority}', '    #unalias {pattern}']);
    const rows = out as Exclude<typeof out, string>;
    expect(rows[1]!.cls).toBe('wc-help wc-help-heading');
    expect(rows[2]!.cls).toBe('wc-help wc-help-syntax');
    const code = rows.find((r) => r.cls === 'wc-help wc-help-code')!;
    expect(code.segs.slice(0, 3)).toEqual([{ text: '    ' }, { text: '#variable', cls: 'wc-syn-cmd' }, { text: ' ' }]);
    expect(rows.some((r) => r.cls === 'wc-help wc-help-group')).toBe(false);
  });

  it('gives a message as one line', () => {
    expect(helpOutput('foreach', 80)).toBe('#foreach: Not supported yet; kept in the profile as written.');
  });

  it('wraps to the pane: one cell of margin, a maximum, a default when unmeasured', () => {
    expect(helpWidth(80)).toBe(79);
    expect(helpWidth(300)).toBe(HELP_MAX_W);
    expect(helpWidth(10)).toBe(24);
    expect(helpWidth(0)).toBe(80);
    for (const cols of [41, 60, 120]) {
      for (const r of helpOutput('patterns', cols) as Exclude<ReturnType<typeof helpOutput>, string>) {
        expect([...r.segs.map((s) => s.text).join('')].length).toBeLessThan(cols);
      }
    }
  });
});
