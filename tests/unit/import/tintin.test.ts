import { describe, expect, it } from 'vitest';
import { ttBraceBalanced, ttBracesToOurs } from '../../../src/import/common';
import { body, countsMatch, file, fixture, load, one, run } from './helpers';

describe('tt++ import', () => {
  it('a native profile imports unchanged, without a header', () => {
    const text = '#alias {k} {kill %1}\n\n#action {^%1 arrives} {#showme hi} {4}\n#nop {note}\n';
    const r = one('pvp.tin', text);
    expect(r.format).toBe('tintin');
    expect(r.unchanged).toBe(true);
    expect(r.profileText).toBe(text);
    expect(r.counts).toEqual({ translated: 2, kept: 0, skipped: 0, warnings: 0 });
  });

  it('keeps multi-line bodies in place', () => {
    const text = '#alias {ga}\n{\n    get all %1;\n    #showme {Got %1}\n}\n';
    const r = one('a.tin', text);
    expect(r.unchanged).toBe(true);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.source).toBe('#alias {ga}\n{\n    get all %1;\n    #showme {Got %1}\n}');
  });

  it('rewrites /* */ comments as #nop lines', () => {
    const r = one('a.tin', '/* one\n   two { */\n#alias {k} {kill %1} /* tail */\n');
    expect(r.unchanged).toBe(false);
    expect(body(r)).toEqual(['#nop {one}', '#nop {two \\{}', '#alias {k} {kill %1}', '#nop {tail}']);
    expect(load(r.profileText).ok).toBe(true);
  });

  it('skips session, screen and #send commands', () => {
    const r = one('a.tin', '#config {COMMAND ECHO} {ON}\n#split 2 1\n#session {mume} {mume.org} {4242}\n#send {\\xFF}\n#alias {k} {kill}\n');
    expect(r.items.map((i) => i.outcome)).toEqual(['skipped', 'skipped', 'skipped', 'skipped', 'translated']);
    expect(body(r)).toEqual(['#alias {k} {kill}']);
  });

  it('keeps inert commands verbatim and unknown ones as #nop', () => {
    const r = one('a.tin', '#map flag nofollow\n#killall\n#class {x} {write} {x.tin}\nhello there\n');
    expect(r.items.every((i) => i.outcome === 'kept')).toBe(true);
    expect(body(r)).toEqual([
      '#map flag nofollow',
      '#nop {Unknown command #killall: #killall}',
      '#nop {#class write is not supported (only open, close and kill): #class {x} {write} {x.tin}}',
      '#nop {Text outside a command: hello there}',
    ]);
    expect(r.items[0]!.reason).toMatch(/Screen/);
  });

  it('renames tt++ GMCP events with a warning', () => {
    const r = one('a.tin', '#event {IAC SB GMCP Char.Vitals IAC SE} {#var hp %0}\n#event {IAC SB GMCP IAC SE} {#nop}\n');
    expect(body(r)).toEqual(['#event {IAC SB GMCP Char.Vitals} {#var hp %0}', '#event {IAC SB GMCP} {#nop}']);
    expect(r.items[0]!.warning).toMatch(/Arguments differ/);
    expect(r.counts.warnings).toBe(2);
  });

  it('keeps events that never fire', () => {
    const r = one('a.tin', '#event {PROGRAM START} {#showme hi}\n#event {SESSION CONNECTED} {#showme hi}\n');
    expect(r.items.map((i) => i.outcome)).toEqual(['kept', 'translated']);
  });

  it('rewrites 1.x highlight order and literal else', () => {
    const r = one('a.tin', '#highlight {light red} {^%* hits you}\n#alias {x} {#if {$a} {say 1} else {say 2}}\n');
    expect(body(r)).toEqual(['#highlight {^%* hits you} {light red}', '#alias {x} {#if {$a} {say 1} {say 2}}']);
    expect(r.items.every((i) => i.warning)).toBe(true);
  });

  it('renames macro keys it can decode and keeps the rest', () => {
    const r = one('a.tin', '#macro {^[[15~} {flee}\n#macro {\\eOq} {sw}\n#macro {\\e[99~} {x}\n');
    expect(body(r)).toEqual(['#macro {F5} {flee}', '#macro {\\eOq} {sw}', '#nop {Unknown key sequence \\e[99~: #macro {\\e[99~} {x}}']);
    expect(r.items.map((i) => i.outcome)).toEqual(['translated', 'translated', 'kept']);
  });

  it('warns about table variables', () => {
    const r = one('a.tin', '#var {stats} {{hp}{50}{mana}{30}}\n');
    expect(r.items[0]!.warning).toMatch(/Tables/);
    expect(r.profileText).toContain('#var {stats} {{hp}{50}{mana}{30}}');
  });

  it('splits a line of several commands into items', () => {
    const r = one('a.tin', '#var {a} {1}; #var {b} {2}\n#var {c} {3}; #split 1 1\n');
    expect(r.items.map((i) => i.outcome)).toEqual(['translated', 'translated', 'translated', 'skipped']);
    expect(body(r)).toEqual(['#var {a} {1}; #var {b} {2}', '#var {c} {3}']);
  });

  it('maps another command character to #', () => {
    const r = one('a.tin', '/alias {k} {kill %1;/showme hi}\n');
    expect(body(r)).toEqual(['#alias {k} {kill %1;#showme hi}']);
    expect(r.fileWarnings[0]).toMatch(/command character/);
  });

  it('inlines #read and #class read; reports missing files and cycles', () => {
    const r = run(
      file('main.tin', '#read sub.tin\n#class {g} {read} {dir/gmcp.tin}\n#read nope.tin\n#alias {m} {main}\n'),
      file('sub.tin', '#alias {s} {sub}\n#read main.tin\n'),
      file('GMCP.tin', '#alias {g} {gmcp}\n'),
    );
    expect(r.entry).toBe('main.tin');
    expect(r.missingFiles).toEqual(['nope.tin']);
    expect(body(r)).toEqual([
      '#nop {--- sub.tin ---}',
      '#alias {s} {sub}',
      '#read main.tin',
      '#nop {--- end of sub.tin ---}',
      '#class {g} {open}',
      '#nop {--- GMCP.tin ---}',
      '#alias {g} {gmcp}',
      '#nop {--- end of GMCP.tin ---}',
      '#class {g} {close}',
      '#read nope.tin',
      '#alias {m} {main}',
    ]);
    expect(r.items.filter((i) => i.outcome === 'kept').map((i) => i.reason)).toEqual([
      'File main.tin reads itself (a cycle)',
      'File nope.tin was not among the chosen files',
    ]);
    expect(countsMatch(r)).toBe(true);
    expect(load(r.profileText).ok).toBe(true);
  });

  it('inlines the #session file argument', () => {
    const r = run(file('main.tin', '#session {mume} {mume.org} {4242} {login.tin}\n'), file('login.tin', '#alias {l} {login}\n'));
    expect(r.items.map((i) => i.outcome)).toEqual(['skipped', 'translated', 'translated']);
    expect(body(r)).toContain('#alias {l} {login}');
  });

  it('appends chosen files nothing reads', () => {
    const r = run(file('a.tin', '#alias {a} {a}\n'), file('b.tin', '#alias {b} {b}\n'));
    expect(r.entry).toBe('a.tin');
    expect(r.unchanged).toBe(false);
    expect(body(r)).toEqual(['#alias {a} {a}', '#nop {--- b.tin ---}', '#alias {b} {b}']);
    expect(r.fileWarnings).toEqual(['b.tin was not read by a.tin; it was added at the end.']);
  });

  it('a backslash before a brace closes it in tt++: doubled so it means the same here', () => {
    const r = run(fixture('tintin', 'backslash.tin'));
    expect(load(r.profileText)).toMatchObject({ ok: true });
    expect(body(r)).toEqual([
      '#nop tt++ never escapes a brace with a backslash, the ones below close.',
      '#event {SESSION CONNECTED}',
      '{',
      '    #send {$IAC$DO$GMCP\\\\};',
      '    #showme {GMCP on}',
      '}',
      '#alias {dir} {#showme {C:\\games\\\\}}',
      '#alias {ok} {say fine}',
    ]);
    expect(r.items.map((i) => [i.line, i.outcome, i.reason])).toEqual([
      [2, 'translated', 'Backslash before a brace doubled (tt++ never escapes braces)'],
      [7, 'translated', 'Backslash before a brace doubled (tt++ never escapes braces)'],
      [8, 'translated', undefined],
    ]);
    expect(r.items[0]!.warning).toMatch(/doubled/);
  });

  it('a statement unbalanced by both rules is kept as #nop; the profile still loads', () => {
    const r = one('a.tin', '#alias {a} {b\n#alias {c} {d}\n');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ outcome: 'kept', reason: 'Unbalanced braces' });
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('ttBraceBalanced / ttBracesToOurs follow tt++: every brace counts', () => {
    expect(ttBraceBalanced('{a\\}')).toBe(true);
    expect(ttBraceBalanced('{a\\{}')).toBe(false);
    expect(ttBracesToOurs('{a\\}')).toBe('{a\\\\}');
    expect(ttBracesToOurs('{a\\\\}')).toBe('{a\\\\}');
    expect(ttBracesToOurs('{a\\\\\\}')).toBe('{a\\\\\\\\}');
  });

  it('the entry is the unread file that reads others', () => {
    const r = run(file('loose.tin', '#alias {l} {l}\n'), file('main.tin', '#read sub.tin\n'), file('sub.tin', '#alias {s} {s}\n'));
    expect(r.entry).toBe('main.tin');
    expect(r.fileWarnings).toEqual(['loose.tin was not read by main.tin; it was added at the end.']);
  });
});
