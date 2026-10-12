import { describe, expect, it } from 'vitest';
import { Bus } from '../../../src/core/bus';
import type { Line } from '../../../src/core/types';
import { jmcColourCodes, jmcColourPrefix, jmcColours, jmcCommand, jmcOperators, jmcOrderDiffers, jmcRegex, jmcSpeedwalk, quoteComparisons } from '../../../src/import/jmc';
import { FakeScheduler, ScriptEngine } from '../../../src/script/engine';
import { body, countsMatch, file, load, one, run } from './helpers';

/** An engine with a translated profile loaded; records what it sends and shows. */
function engineWith(profile: string) {
  const bus = new Bus();
  const sent: string[] = [];
  const shown: Line[] = [];
  const clock = new FakeScheduler();
  const e = new ScriptEngine({ send: (t) => sent.push(t), message: () => {}, scheduler: clock, now: () => 0 });
  e.attach(bus);
  bus.on('text.display', (d) => shown.push(d.line));
  const loaded = e.loadProfile(profile);
  expect(loaded).toEqual({ ok: true, warnings: [] });
  const recv = (text: string) => bus.emit('text.line', { text, runs: [], tags: [], prompt: false, raw: text, ts: 0 });
  return { e, sent, shown, clock, recv };
}

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

  it('takes the first match in cmds.h order, not the alphabetical one', () => {
    expect(jmcCommand('g')).toBe('group');
    expect(jmcCommand('h')).toBe('highlight');
    expect(jmcCommand('r')).toBe('read');
    expect(jmcCommand('l')).toBe('loop');
    expect(jmcCommand('o')).toBe('output');
    expect(jmcCommand('unh')).toBe('unhotkey');
    expect(jmcCommand('unv')).toBe('unvar');
    expect(jmcCommand('nop')).toBe('nope');
    expect(jmcCommand('t')).toBe('tolower');
    // Not in JMC's table: resolved only when nothing in it matches.
    expect(jmcCommand('ung')).toBe('ungag');
    expect(jmcCommand('unhi')).toBe('unhighlight');
  });

  it('keeps commands JMC has but we cannot translate', () => {
    const r = jmc('#drop\n#tolower {x} {Y}\n#g local x\n#nop a note\n');
    expect(r.items.map((i) => [i.outcome, i.reason])).toEqual([
      ['kept', 'Unsupported JMC command #drop'],
      ['kept', 'Unsupported JMC command #tolower'],
      ['skipped', 'Group scope (local/global) has no meaning here'],
    ]);
    expect(body(r)).toEqual(['#nop {a note}']);
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

  it('resolves abbreviations in JMC table order', () => {
    expect(jmcColours('re')?.colours).toBe('red');
    expect(jmcColours('bl')?.colours).toBe('black');
    expect(jmcColours('b')?.colours).toBe('black');
    expect(jmcColours('bo, b bl, rev')?.colours).toBe('bold, b black, reverse');
    expect(jmcColours('l')?.colours).toBe('light red');
    expect(jmcColours('faint')).toBe(null);
  });
});

describe('JMC text colours', () => {
  it('&x codes become <abc> codes; uppercase is bold like JMC, && is &', () => {
    expect(jmcColourCodes('&RARMOUR DOWN!&w')).toBe('<118>ARMOUR DOWN!<079>');
    expect(jmcColourCodes('&d&D&p&C fish && chips &x')).toBe('<009><108><059><168> fish & chips \\&x');
    expect(jmcColourPrefix('light red')).toBe('<019><188>');
    expect(jmcColourPrefix('cyan, b blue, bold')).toBe('<064><188>');
    expect(jmcColourPrefix('mauve')).toBe(null);
  });

  it('converts &x codes only with the colorcodes colour; elsewhere they are text', () => {
    const r = jmc(
      '#action {^You feel less protected.} {#showme {&RARMOUR DOWN!&w}} {3} {spells}\n' +
        '#action {^a} {#showme {light red} {Hi}}\n' +
        '#action {^b} {#output {light green} {Yo &&}}\n' +
        '#action {^c} {#showme {colorcodes} {&RRED&w}}\n' +
        '#action {^d} {#output {col} {&gok}}\n' +
        '#substitute {You are hungry.} {&YHUNGRY&w}\n' +
        '#substitute {gun} {Smith&Wesson}\n',
    );
    expect(body(r)).toEqual([
      '#class {spells} {open}',
      '#action {^You feel less protected.} {#showme {\\&RARMOUR DOWN!\\&w}} {3}',
      '#class {spells} {close}',
      '#action {^a} {#showme {<019><188>Hi}}',
      '#action {^b} {#showme {<029><188>Yo \\&&}}',
      '#action {^c} {#showme {<118>RED<079>}}',
      '#action {^d} {#showme {<029>ok}}',
      '#substitute {You are hungry.} {\\&YHUNGRY\\&w}',
      '#substitute {gun} {Smith\\&Wesson}',
    ]);
    expect(r.items.every((i) => !i.warning)).toBe(true);
    const t = engineWith(r.profileText);
    t.e.input('#variable {Wesson} {x}');
    t.recv('You feel less protected.');
    t.recv('b');
    t.recv('c');
    t.recv('You are hungry.');
    t.recv('my gun');
    const shown = t.shown.map((l) => l.text);
    expect(shown).toEqual(expect.arrayContaining(['&RARMOUR DOWN!&w', 'Yo &&', 'RED', '&YHUNGRY&w', 'my Smith&Wesson']));
    expect(t.shown.find((l) => l.text === 'RED')!.runs[0]).toMatchObject({ start: 0, end: 3, fg: 1, bold: true });
  });

  it('#showme with unbraced text takes the whole rest', () => {
    expect(body(jmc('#alias {a} {#showme Target set}\n'))).toEqual(['#alias {a} {#showme {Target set}}']);
  });
});

describe('JMC #if, repeats, #beep', () => {
  it('quotes text comparisons in #if; numeric ones stay', () => {
    expect(quoteComparisons('$target == orc')).toEqual({ text: '"$target" == "orc"', changed: true });
    expect(quoteComparisons('$a != x && $hp > 10 || %1 == 1')).toEqual({ text: '"$a" != "x" && $hp > 10 || %1 == 1', changed: true });
    expect(quoteComparisons('%1 == 1').changed).toBe(false);
    expect(quoteComparisons('$hp == 100').changed).toBe(false);
    const r = jmc('#alias {chk} {#if {$target == orc} {say yes} {say no}}\n');
    expect(body(r)).toEqual(['#alias {chk} {#if {"$target" == "orc"} {say yes} {say no}}']);
    expect(r.items[0]!.warning).toMatch(/compares numbers only/);
    const t = engineWith(r.profileText);
    t.e.input('#variable {target} {orc}');
    t.e.input('chk');
    t.e.input('#variable {target} {big orc}');
    t.e.input('chk');
    expect(t.sent).toEqual(['say yes', 'say no']);
  });

  it('#N cmd becomes #N {cmd}, which the engine repeats', () => {
    const r = jmc('#alias {ws} {#3 wield sword}\n#2 {say hi}\n');
    expect(body(r)).toEqual(['#alias {ws} {#3 {wield sword}}', '#2 {say hi}']);
    expect(r.items.every((i) => i.outcome === 'translated' && !i.warning)).toBe(true);
    const t = engineWith('#alias {ws} {#3 {wield sword}}');
    t.e.input('ws');
    expect(t.sent).toEqual(['wield sword', 'wield sword', 'wield sword']);
  });

  it('#N:delay cmd (deciseconds) is unrolled into #delay', () => {
    const r = jmc('#alias {kk} {#3:15 kick}\n#alias {big} {#50:10 kick}\n');
    expect(body(r)).toEqual(['#alias {kk} {kick;#delay {1.5} {kick};#delay {3} {kick}}', '#alias {big} {#50:10 kick}']);
    expect(r.items[0]!.warning).toMatch(/3 delayed commands/);
    expect(r.items[1]!.warning).toMatch(/too long to unroll/);
    const t = engineWith('#alias {kk} {kick;#delay {1.5} {kick};#delay {3} {kick}}');
    t.e.input('kk');
    expect(t.sent).toEqual(['kick']);
    t.clock.advance(3000);
    expect(t.sent).toEqual(['kick', 'kick', 'kick']);
  });

  it('#beep in a body becomes #bell with a warning', () => {
    const r = jmc('#action TEXT {^You have been KILLED!} {#beep} {1} {default}\n');
    expect(body(r)).toEqual(['#action {^You have been KILLED!} {#bell} {1}']);
    expect(r.items[0]!.warning).toMatch(/no sound/);
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });
});

describe('JMC import', () => {
  it('drops the action type word, keeps priority, groups become classes', () => {
    const r = jmc('#action TEXT {^You are hungry.} {eat bread} {5} {default}\n#action TEXT {^%0 tells you} {say hi %0} {3} {pk}\n#act {x} {y} {pk}\n');
    expect(body(r)).toEqual(['#action {^You are hungry.} {eat bread}', '#class {pk} {open}', '#action {^%1 tells you} {say hi %1} {3}', '#action {x} {y}', '#class {pk} {close}']);
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
    // %0 in the inner pattern and body belongs to the action: %%1 in tt++ (renumbered); %%1 is the alias argument: %1.
    expect(body(r)).toEqual(['#alias {mk} {#action {%%1 hits} {say %%1 hit %1}}']);
  });

  it('warns when %n is nested deeper than JMC replaces it', () => {
    // #variable does not substitute %n in its value: %0 stays text in JMC.
    const r = jmc('#action {^%0 tells you} {#var who {%0}}\n');
    expect(body(r)).toEqual(['#action {^%1 tells you} {#variable {who} {%1}}']);
    expect(r.items[0]!.warning).toMatch(/left as text by JMC/);
  });

  it('commands that substitute their own arguments take a single %n without a warning', () => {
    const r = jmc(
      '#action {^%0 tells you %1} {#showme {%0};#output {red} {%0};#if {%1 == 5} {say %0} {say no};#math {n} {%1 + 1}}\n' +
        '#alias {a} {#if {1} {#showme {%1}}}\n',
    );
    expect(body(r)).toEqual([
      '#action {^%1 tells you %2} {#showme {%1};#showme {<019>%1};#if {%2 == 5} {say %1} {say no};#math {n} {%2 + 1}}',
      '#alias {a} {#if {1} {#showme {%1}}}',
    ]);
    expect(r.items.every((i) => !i.warning)).toBe(true);
    const t = engineWith(r.profileText);
    t.recv('Bob tells you 5');
    expect(t.shown.map((l) => l.text)).toEqual(['Bob', 'Bob', 'Bob tells you 5']);
    expect(t.sent).toEqual(['say Bob']);
    expect(t.e.getVariable('n')).toBe('6');
  });

  it('swaps highlight arguments and maps colours', () => {
    const r = jmc('#highlight {light red, b blue} {^%0 hits you} {default}\n#hi {mauve} {x}\n');
    expect(body(r)).toEqual(['#highlight {^%1 hits you} {light red, b blue}']);
    expect(r.items.map((i) => i.outcome)).toEqual(['translated', 'kept']);
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('substitute with . is a gag; #gag stays a gag', () => {
    const r = jmc('#substitute {^The sun rises.} {.}\n#sub {orc} {ORC}\n#gag {^Spam}\n');
    expect(body(r)).toEqual(['#gag {^The sun rises.}', '#substitute {orc} {ORC}', '#gag {^Spam}']);
  });

  it('renumbers wildcards: JMC %0 is a capture, not the whole match', () => {
    const r = jmc("#substitute {%0 tells you '%1'} {%0 tells: %1}\n#sub {a %1 b %0 c} {[%0|%1]}\n#action {^%0 arrives} {say hi %0}\n");
    expect(body(r)).toEqual(["#substitute {%1 tells you '%2'} {%1 tells: %2}", '#substitute {a %2 b %1 c} {[%1|%2]}', '#action {^%1 arrives} {say hi %1}']);
    const t = engineWith(r.profileText);
    t.recv("Bob tells you 'hi there'");
    t.recv('a X b Y c');
    t.recv('Ann arrives from the north.');
    expect(t.shown.map((l) => l.text)).toEqual(['Bob tells: hi there', '[Y|X]', 'Ann arrives from the north.']);
    expect(t.sent).toEqual(['say hi Ann']);
  });

  it('warns about first-match substitutes unless #multisubstitute is on', () => {
    expect(jmc('#sub {a} {b}\n#sub {c} {d}\n').fileWarnings).toEqual([expect.stringMatching(/first matching substitute/)]);
    expect(jmc('#sub {a} {b}\n#sub {c} {.}\n').fileWarnings).toEqual([]);
    const on = jmc('#multisubstitute on\n#sub {a} {b}\n#sub {c} {d}\n');
    expect(on.fileWarnings).toEqual([]);
    expect(on.items[0]).toMatchObject({ outcome: 'skipped' });
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
    expect(body(r)).toEqual(['#alias {k} {kill %1;#showme {hi}}', '#action {a} {b}']);
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

  it('comments close an open group instead of sitting inside it', () => {
    const r = jmc('#action {a} {b} {5} {spells}\n## ---- Highlights ----\n#highlight {red} {x} {spells}\n#nop note\n#alias {y} {z} {spells}\n');
    expect(body(r)).toEqual([
      '#class {spells} {open}',
      '#action {a} {b}',
      '#class {spells} {close}',
      '#nop {---- Highlights ----}',
      '#class {spells} {open}',
      '#highlight {x} {red}',
      '#class {spells} {close}',
      '#nop {note}',
      '#class {spells} {open}',
      '#alias {y} {z}',
      '#class {spells} {close}',
    ]);
  });

  it('among unread files a .set is the entry', () => {
    const r = run(file('notes.txt', '#alias {n} {n}\n'), file('char.set', '#alias {c} {c}\n'));
    expect(r.entry).toBe('char.set');
  });
});

describe('JMC execution details', () => {
  it('expands speedwalks in bodies while #speedwalk is on', () => {
    expect(jmcSpeedwalk('3n2w')).toEqual(['n', 'n', 'n', 'w', 'w']);
    expect(jmcSpeedwalk('u7')).toEqual(['u']);
    expect(jmcSpeedwalk('sun')).toEqual(['s', 'u', 'n']);
    expect(jmcSpeedwalk('12')).toBe(null);
    expect(jmcSpeedwalk('north')).toBe(null);
    const r = jmc('#alias {go} {3n2w;n;open door;news}\n#alias {ne} {say ne}\n#alias {x} {ne}\n');
    expect(body(r)).toEqual(['#alias {go} {n;n;n;w;w;n;open door;n;e;w;s}', '#alias {ne} {say ne}', '#alias {x} {ne}']);
    expect(r.items[0]!.warning).toMatch(/Speedwalk 3n2w expanded \(JMC speedwalk\)\. Speedwalk news expanded/);
    expect(r.items[2]!.warning).toBeUndefined();
    const t = engineWith(body(r)[0]!);
    t.e.input('go');
    expect(t.sent).toEqual(['n', 'n', 'n', 'w', 'w', 'n', 'open door', 'n', 'e', 'w', 's']);
  });

  it('#speedwalk off (or a toggle) stops the expansion', () => {
    const off = jmc('#speedwalk off\n#alias {go} {3n}\n');
    expect(body(off)).toEqual(['#alias {go} {3n}']);
    expect(off.items[0]).toMatchObject({ outcome: 'skipped' });
    expect(body(jmc('#speedwalk\n#alias {go} {3n}\n'))).toEqual(['#alias {go} {3n}']);
    expect(body(jmc('#speedwalk on\n#alias {go} {3n}\n'))).toEqual(['#alias {go} {n;n;n}']);
  });

  it('de-nests $$var like %%n and warns where JMC froze the value', () => {
    const r = jmc('#alias {mk} {#action {x} {say $hp $$hp};#showme {$$hp}}\n#alias {sv} {#var x {$hp}}\n');
    expect(body(r)).toEqual(['#alias {mk} {#action {x} {say $hp $hp};#showme {$hp}}', '#alias {sv} {#variable {x} {$hp}}']);
    expect(r.items[0]!.warning).toMatch(/JMC read \$\$hp when the outer rule ran/);
    expect(r.items[1]!.warning).toBeUndefined();
    const t = engineWith(body(r)[0]!);
    t.e.input('#variable {hp} {10}');
    t.e.input('mk');
    t.e.input('#variable {hp} {20}');
    t.recv('x');
    expect(t.shown.map((l) => l.text)).toContain('10');
    expect(t.sent).toEqual(['say 20 20']);
  });

  it('maps JMC expression operators and warns about its precedence', () => {
    expect(jmcOperators('$a = 1 & $b != 2 | $c >= 3')).toBe('$a == 1 && $b != 2 || $c >= 3');
    expect(jmcOperators('$a == 1 && "x=y"')).toBe('$a == 1 && "x=y"');
    expect(jmcOrderDiffers('10-2+3')).toBe(true);
    expect(jmcOrderDiffers('8/2*2')).toBe(true);
    expect(jmcOrderDiffers('-2+3')).toBe(false);
    expect(jmcOrderDiffers('(10-2)+3')).toBe(false);
    expect(jmcOrderDiffers('$a-1 > 0 && $b+1 > 0')).toBe(false);
    const r = jmc('#alias {c} {#if {$hp = 10 & $mv = 5} {say yes} {say no}}\n#alias {m} {#math {x} {10-2+3}}\n');
    expect(body(r)).toEqual(['#alias {c} {#if {$hp == 10 && $mv == 5} {say yes} {say no}}', '#alias {m} {#math {x} {10-2+3}}']);
    expect(r.items[0]!.warning).toBeUndefined();
    expect(r.items[1]!.warning).toMatch(/JMC evaluates \* before \/ and \+ before -/);
    const t = engineWith(body(r)[0]!);
    t.e.input('#variable {hp} {10}');
    t.e.input('#variable {mv} {5}');
    t.e.input('c');
    expect(t.sent).toEqual(['say yes']);
  });

  it('warns that #N has no loop counter', () => {
    const r = jmc('#alias {cnt} {#3 {say %0}}\n#alias {ok} {#3 {say hi}}\n#action {^%0 waves} {#2 say %0}\n');
    expect(body(r)).toEqual(['#alias {cnt} {#3 {say %0}}', '#alias {ok} {#3 {say hi}}', '#action {^%1 waves} {#2 {say %1}}']);
    expect(r.items[0]!.warning).toMatch(/loop counter \(1\.\.N\)/);
    expect(r.items[1]!.warning).toBeUndefined();
    expect(r.items[2]!.warning).toBeUndefined();
  });

  it('unbraced last arguments run to the end of the command', () => {
    const r = jmc('#gag You are hungry.\n#alias {k} kill %1 now\n#action {^%0 bows} say hi %0\n#highlight red You are thirsty.\n#sub {orc} big ugly orc\n#var target big orc\n');
    expect(body(r)).toEqual([
      '#gag {You are hungry.}',
      '#alias {k} {kill %1 now}',
      '#action {^%1 bows} {say hi %1}',
      '#highlight {You are thirsty.} {red}',
      '#substitute {orc} {big ugly orc}',
      '#variable {target} {big orc}',
    ]);
    const t = engineWith(r.profileText);
    t.recv('You are hungry.');
    t.recv('Ann bows');
    expect(t.shown.map((l) => l.text)).toEqual(['Ann bows']);
    expect(t.sent).toEqual(['say hi Ann']);
  });

  it('renumbers the patterns of #unaction, #unsubstitute, #ungag and #unhighlight', () => {
    const r = jmc('#unaction {%0 tells you}\n#unsub {%0 arrives}\n#ungag {%0 leaves}\n#unhighlight {%0 hits}\n#unalias {k}\n#unvar {x}\n#unhotkey {NUM8}\n#alias {u} {#unaction {%0 hits}}\n');
    expect(body(r)).toEqual([
      '#unaction {%1 tells you}',
      '#unsubstitute {%1 arrives}',
      '#ungag {%1 leaves}',
      '#unhighlight {%1 hits}',
      '#unalias {k}',
      '#unvariable {x}',
      '#unmacro {Numpad8}',
      '#alias {u} {#unaction {%%1 hits}}',
    ]);
    const t = engineWith('#action {%1 tells you} {say hi}\n#unaction {%1 tells you}');
    t.recv('Bob tells you');
    expect(t.sent).toEqual([]);
  });

  it('a pattern starting with / is a regex even without the closing slash', () => {
    expect(jmcRegex('/^(\\w+) arrives/i')).toEqual({ body: '^(\\w+) arrives', flags: 'i' });
    expect(jmcRegex('/^(\\w+) arrives')).toEqual({ body: '^(\\w+) arrives', flags: '' });
    expect(jmcRegex('/gi')).toBe(null);
    expect(jmcRegex('plain')).toBe(null);
    const r = jmc('#action {/^(\\w+) arrives} {say hi %%0}\n#alias {/^x} {y}\n');
    expect(body(r)).toEqual(['#action {^{\\w+} arrives} {say hi %1}']);
    expect(r.items[1]!.reason).toBe('Regex alias (not supported)');
  });

  it('warns that typed arguments are appended to an alias body with $var and no %n', () => {
    const r = jmc('#alias {at} {attack $target}\n#alias {k} {kill %1 $target}\n#alias {f} {flee}\n');
    expect(r.items[0]!.warning).toMatch(/appends the typed arguments/);
    expect(r.items[1]!.warning).toBeUndefined();
    expect(r.items[2]!.warning).toBeUndefined();
  });

  it('a digit after a wildcard is a literal in patterns and warned about in bodies', () => {
    const r = jmc('#action {^Cost %05 coins} {say %05}\n');
    expect(body(r)).toEqual(['#action {^Cost %1\\5 coins} {say %15}']);
    expect(r.items[0]!.warning).toMatch(/%05 is %0 followed by 5 in JMC; here %15 reads as one two-digit argument/);
    const t = engineWith(body(r)[0]!);
    t.recv('Cost 125 coins');
    expect(t.sent).toEqual(['say']);
  });

  it('warns about first-match highlights unless #multihighlight is on', () => {
    expect(jmc('#hi {red} {a}\n#hi {blue} {b}\n').fileWarnings).toEqual([expect.stringMatching(/first matching highlight/)]);
    expect(jmc('#hi {red} {a}\n').fileWarnings).toEqual([]);
    const on = jmc('#multihighlight on\n#hi {red} {a}\n#hi {blue} {b}\n');
    expect(on.fileWarnings).toEqual([]);
    expect(on.items[0]).toMatchObject({ outcome: 'skipped' });
  });
});
