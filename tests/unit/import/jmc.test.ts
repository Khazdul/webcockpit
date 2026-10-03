import { describe, expect, it } from 'vitest';
import { jmcColours, jmcCommand } from '../../../src/import/jmc';
import { body, countsMatch, file, load, one, run } from './helpers';

/** Imports JMC lines (a .set file, so the format is JMC). */
const jmc = (text: string) => one('test.set', text);

describe('jmcCommand', () => {
  it('resolves abbreviations like JMC', () => {
    expect(jmcCommand('act')).toBe('action');
    expect(jmcCommand('al')).toBe('alias');
    expect(jmcCommand('hot')).toBe('hotkey');
    expect(jmcCommand('hi')).toBe('highlight');
    expect(jmcCommand('var')).toBe('variable');
    expect(jmcCommand('sub')).toBe('substitute');
    expect(jmcCommand('wa')).toBe('wait');
    expect(jmcCommand('ACTION')).toBe('action');
    expect(jmcCommand('zzz')).toBe(null);
  });
});

describe('jmcColours', () => {
  it('maps names, backgrounds, numbers and attributes', () => {
    expect(jmcColours('light red, b blue')?.colours).toBe('light red, b blue');
    expect(jmcColours('brown')?.colours).toBe('yellow');
    expect(jmcColours('yellow')?.colours).toBe('light yellow');
    expect(jmcColours('grey, b white')?.colours).toBe('white, b light white');
    expect(jmcColours('charcoal, bold')?.colours).toBe('light black, bold');
    expect(jmcColours('mag')?.colours).toBe('magenta');
    expect(jmcColours('4, 18')?.colours).toBe('yellow, b red');
    expect(jmcColours('light magenta, b gray')).toEqual({ colours: 'light magenta', dropped: ['b gray'] });
    expect(jmcColours('mauve')).toBe(null);
  });
});

describe('JMC import', () => {
  it('drops the action type word, keeps priority, groups become classes', () => {
    const r = jmc('#action TEXT {^You are hungry.} {eat bread} {5} {default}\n#action TEXT {^%0 tells you} {say hi %0} {3} {pk}\n#act {x} {y} {pk}\n');
    expect(body(r)).toEqual(['#action {^You are hungry.} {eat bread}', '#class {pk} {open}', '#action {^%0 tells you} {say hi %0} {3}', '#action {x} {y}', '#class {pk} {close}']);
    expect(r.counts.translated).toBe(3);
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('warns once about first-match semantics unless #multiaction is on', () => {
    expect(jmc('#action {a} {b}\n#action {c} {d}\n').fileWarnings).toEqual([expect.stringMatching(/first matching action/)]);
    expect(jmc('#multiaction ON\n#action {a} {b}\n').fileWarnings).toEqual([]);
  });

  it('keeps RAW and COLOR actions', () => {
    const r = jmc('#action COLOR {^&RYou bleed} {cure}\n');
    expect(r.items[0]).toMatchObject({ outcome: 'kept', reason: 'COLOR action (matches colour codes)' });
    expect(r.profileText).toContain('#nop {--- Not translated ---}');
    expect(r.profileText).toContain('#nop {COLOR action (matches colour codes): #action COLOR {^&RYou bleed} {cure}}');
  });

  it('turns regex patterns into {…} groups and shifts %n by one', () => {
    const r = jmc('#action {/^(\\w+) arrives from the (\\w+)\\.$/i} {#showme {%%0 from %%1}}\n');
    expect(body(r)).toEqual(['#action {^%i{\\w+} arrives from the {\\w+}.$} {#showme {%1 from %2}}']);
    expect(load(r.profileText).ok).toBe(true);
  });

  it('keeps regex aliases and regexes it cannot express', () => {
    const r = jmc('#alias {/^re(.*)$/} {reply %0}\n#action {/^(a|b)|c$/} {x}\n#action {/^((a)b)$/} {x}\n');
    expect(r.items.map((i) => i.reason)).toEqual(['Regex alias (not supported)', 'Regex with top-level alternation', 'Regex with nested capture groups']);
  });

  it('escapes pattern characters tt++ would read as wildcards', () => {
    const r = jmc('#action {^Trap at 100%} {flee}\n#action {cost $} {x}\n#gag {a {b} c}\n');
    expect(body(r)).toEqual(['#action {^Trap at 100\\%} {flee}', '#action {cost \\$} {x}', '#gag {a \\{b\\} c}']);
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('de-nests %%n by brace depth and maps $n', () => {
    const r = jmc('#alias {setv} {#var %1 {%%2}}\n#alias {t} {tell $1 $0}\n#alias {x} {#if {%%1 == 1} {say %%1}}\n');
    expect(body(r)).toEqual(['#alias {setv} {#variable {%1} {%2}}', '#alias {t} {tell %1 %0}', '#alias {x} {#if {%1 == 1} {say %1}}']);
    expect(r.items.every((i) => !i.warning)).toBe(true);
  });

  it('nested definitions get one more % per level', () => {
    const r = jmc('#alias {mk} {#action {%0 hits} {say %0 hit %%1}}\n');
    // %0 in the inner pattern and body belongs to the action: %%0 in tt++; %%1 is the alias argument: %1.
    expect(body(r)).toEqual(['#alias {mk} {#action {%%0 hits} {say %%0 hit %1}}']);
  });

  it('warns when %n is nested deeper than JMC replaces it', () => {
    const r = jmc('#action {^%0 tells you} {#showme {%0}}\n');
    expect(body(r)).toEqual(['#action {^%0 tells you} {#showme {%0}}']);
    expect(r.items[0]!.warning).toMatch(/left as text by JMC/);
  });

  it('swaps highlight arguments and maps colours', () => {
    const r = jmc('#highlight {light red, b blue} {^%0 hits you} {default}\n#hi {mauve} {x}\n');
    expect(body(r)).toEqual(['#highlight {^%0 hits you} {light red, b blue}']);
    expect(r.items.map((i) => i.outcome)).toEqual(['translated', 'kept']);
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('substitute with . is a gag; #gag stays a gag', () => {
    const r = jmc('#substitute {^The sun rises.} {.}\n#sub {orc} {ORC}\n#gag {^Spam}\n');
    expect(body(r)).toEqual(['#gag {^The sun rises.}', '#substitute {orc} {ORC}', '#gag {^Spam}']);
  });

  it('hotkeys become macros', () => {
    const r = jmc('#hot {Ctrl+F1} {flee} {default}\n#hotkey {NUM8} {north}\n#hot {Weird+Q} {quit}\n#hot {ESC} {x}\n');
    expect(body(r)).toEqual(['#macro {Ctrl+F1} {flee}', '#macro {Numpad8} {north}']);
    expect(r.items.map((i) => i.outcome)).toEqual(['translated', 'translated', 'kept', 'kept']);
  });

  it('#wait wraps the rest of the list in #delay', () => {
    const r = jmc('#alias {bs} {backstab %1;#wait 15;flee;#wt 5;rest}\n');
    expect(body(r)).toEqual(['#alias {bs} {backstab %1;#delay {1.5} {flee;#delay {0.5} {rest}}}']);
    expect(r.items[0]!.warning).toMatch(/#wait/);
  });

  it('the tick timer becomes a ticker with the file tick size', () => {
    const r = jmc('#ticksize 61\n#tickon\n#alias {t} {#tickoff}\n');
    expect(body(r)).toEqual(['#ticker {tick} {#showme {TICK!!!}} {61}', '#alias {t} {#unticker {tick}}']);
    expect(r.items.map((i) => i.outcome)).toEqual(['skipped', 'translated', 'translated']);
  });

  it('header state is skipped, scripts and status are kept, comments become #nop', () => {
    const r = jmc('#presub on\n#codepage {iso-8859-1}\n#group local default\n#use lib.js\n#status {1} {HP}\n## a comment {\n## another }\n#nop old stuff\nsay hi\n');
    expect(r.items.map((i) => i.outcome)).toEqual(['skipped', 'skipped', 'skipped', 'kept', 'kept', 'kept']);
    expect(body(r).slice(0, 3)).toEqual(['#nop {a comment \\{}', '#nop {another \\}}', '#nop {old stuff}']);
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('a non-# command character is normalised', () => {
    const r = one('x.set', '/alias {k} {kill %1;/showme hi}\n/action {a} {b}\n');
    expect(body(r)).toEqual(['#alias {k} {kill %1;#showme hi}', '#action {a} {b}']);
    expect(r.fileWarnings[0]).toMatch(/command character/);
  });

  it('multi-file: #read inlines, global.set comes last with the shared tick size', () => {
    const r = run(file('global.set', '#tickon\n'), file('mume.set', '#ticksize 30\n#read extra.txt\n'), file('extra.txt', '#alias {e} {extra}\n'));
    expect(r.entry).toBe('mume.set');
    expect(body(r)).toEqual(['#nop {--- extra.txt ---}', '#alias {e} {extra}', '#nop {--- end of extra.txt ---}', '#nop {--- global.set ---}', '#ticker {tick} {#showme {TICK!!!}} {30}']);
    expect(r.fileWarnings).toContain('global.set added at the end (JMC reads it after the profile).');
    expect(countsMatch(r)).toBe(true);
  });

  it('every statement gets an item', () => {
    const r = jmc('#alias {a} {b}\n#weird thing\n#bell\nplain\n#loop {1,3} {say %%0}\n#5 {sing}\n');
    expect(r.items).toHaveLength(6);
    expect(r.items.map((i) => i.outcome)).toEqual(['translated', 'kept', 'skipped', 'kept', 'kept', 'translated']);
    expect(countsMatch(r)).toBe(true);
  });
});
