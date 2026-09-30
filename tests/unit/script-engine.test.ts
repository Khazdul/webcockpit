import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents, Line, StyleRun } from '../../src/core/types';
import { rgb } from '../../src/core/types';
import { ENTRY_KINDS, listEntries, parseProfile, serialize } from '../../src/script/doc';
import { ALIAS_DEPTH, FakeScheduler, type Report, ScriptEngine, splitCommands } from '../../src/script/engine';
import { normalizeKey } from '../../src/script/keys';

function line(text: string, runs: StyleRun[] = [], prompt = false): Line {
  return { text, runs, tags: [], prompt, raw: text, ts: 0 };
}

function setup() {
  const bus = new Bus();
  const sent: string[] = [];
  const msgs: string[] = [];
  const shown: BusEvents['text.display'][] = [];
  const partials: BusEvents['text.displayPartial'][] = [];
  const clients: Array<[string, string]> = [];
  const vars: Array<[string, string]> = [];
  const reports: Report[] = [];
  const clock = new FakeScheduler();
  const e = new ScriptEngine({
    send: (t) => sent.push(t),
    message: (m) => msgs.push(m),
    client: (n, a) => clients.push([n, a]),
    onVariable: (n, v) => vars.push([n, v]),
    report: (r) => reports.push(r),
    scheduler: clock,
    now: () => 0,
  });
  e.attach(bus);
  bus.on('text.display', (d) => shown.push(d));
  bus.on('text.displayPartial', (d) => partials.push(d));
  const recv = (text: string, runs: StyleRun[] = []) => bus.emit('text.line', line(text, runs));
  const texts = () => shown.map((d) => d.line.text);
  return { bus, e, sent, msgs, shown, partials, clients, vars, reports, clock, recv, texts };
}

describe('input', () => {
  it('splits at ; and sends each command; empty input sends a bare newline', () => {
    const t = setup();
    t.e.input('n;e; look ');
    t.e.input('');
    expect(t.sent).toEqual(['n', 'e', 'look', '']);
  });

  it('expands variables and unescapes when sending', () => {
    const t = setup();
    t.e.input('#var target orc');
    t.e.input('kill $target;say a\\;b $nope');
    expect(t.sent).toEqual(['kill orc', 'say a;b $nope']);
  });

  it('_send sends its argument and cannot be shadowed', () => {
    const t = setup();
    t.e.input('#alias {_send} {say shadowed}');
    t.e.input('#var t elf;_send bash $t');
    expect(t.sent).toEqual(['bash elf']);
  });

  it('a plain command is trimmed after variable expansion, like _send', () => {
    const t = setup();
    t.e.input('#var door {};#alias {c} {close $door}');
    t.e.input('c;close $door;_send close $door');
    expect(t.sent).toEqual(['close', 'close', 'close']);
  });

  it('reports unknown, ambiguous and inert commands', () => {
    const t = setup();
    t.e.input('#blah;#s;#lua {x}');
    expect(t.msgs).toEqual(['Unknown command: #blah', 'Ambiguous command: #s', '#lua: Shell and Lua commands do nothing in the browser.']);
    expect(t.sent).toEqual([]);
  });

  it('runs client commands with their arguments', () => {
    const t = setup();
    t.e.input('#conn;#replay 0;#HELP;#re');
    expect(t.clients).toEqual([
      ['connect', ''],
      ['replay', '0'],
      ['help', ''],
    ]);
    expect(t.msgs).toEqual(['#read: File commands are not available in the browser.']);
  });

  it('repeats with #N', () => {
    const t = setup();
    t.e.input('#3 {n;e}');
    t.e.input('#2 s');
    expect(t.sent).toEqual(['n', 'e', 'n', 'e', 'n', 'e', 's', 's']);
  });
});

describe('aliases', () => {
  it('matches the first word and passes %0 and %1…', () => {
    const t = setup();
    t.e.input('#alias {k} {kill %1;say %0}');
    t.e.input('k orc big');
    t.e.input('kx orc');
    expect(t.sent).toEqual(['kill orc', 'say orc big', 'kx orc']);
  });

  it('appends unused arguments when the body has no %N', () => {
    const t = setup();
    t.e.input('#var target *elf*');
    t.e.input('#alias {bb} {_send bash $target}');
    t.e.input('bb');
    t.e.input('bb troll');
    expect(t.sent).toEqual(['bash *elf*', 'bash *elf* troll']);
  });

  it('matches pattern aliases anchored at the start', () => {
    const t = setup();
    t.e.input('#var target orc');
    t.e.input("#alias {^b%+1..d$} {_send cast 'blindness' %1.$target}");
    t.e.input('b12');
    t.e.input('b1x');
    t.e.input('#alias {tell %1 %2} {say to %1: %2}');
    t.e.input('tell bob hi there');
    expect(t.sent).toEqual(["cast 'blindness' 12.orc", 'b1x', 'say to bob: hi there']);
  });

  it('matches non-ASCII alias names and names with spaces', () => {
    const t = setup();
    t.e.input('#alias {é} {e};#alias {ś} {south};#alias {look at} {l %1}');
    t.e.input('é;ś;look at bob;look atx');
    expect(t.sent).toEqual(['e', 'south', 'l bob', 'look atx']);
  });

  it('takes the lower priority first, ties in definition order', () => {
    const t = setup();
    t.e.input('#alias {^go%*} {first} {6}');
    t.e.input('#alias {go} {second} {4}');
    t.e.input('go');
    t.e.input('#alias {^g%*} {third} {4}');
    t.e.input('go');
    t.e.input('#alias {^g%*} {fourth} {3}');
    t.e.input('go');
    expect(t.sent).toEqual(['second', 'second', 'fourth']);
  });

  it('an alias does not re-enter itself', () => {
    const t = setup();
    t.e.input('#alias {look} {look;exits}');
    t.e.input('look');
    expect(t.sent).toEqual(['look', 'exits']);
  });

  it('stops deep alias chains', () => {
    const t = setup();
    for (let i = 0; i < 40; i++) t.e.input(`#alias {a${i}} {a${i + 1}}`);
    t.e.input('a0');
    expect(t.sent).toEqual([]);
    expect(t.msgs).toEqual([`Alias nesting deeper than ${ALIAS_DEPTH} at {a${ALIAS_DEPTH}}; stopped.`]);
    t.e.input('#alias {a} {b};#alias {b} {a %1}');
    t.e.input('a');
    expect(t.sent).toEqual(['a']);
  });

  it('#unalias removes by name or glob', () => {
    const t = setup();
    t.e.input('#alias {aa} {x};#alias {ab} {y};#alias {c} {z}');
    t.e.input('#unalias {a*};aa;c');
    expect(t.sent).toEqual(['aa', 'z']);
  });
});

describe('#if', () => {
  it('handles #if/#elseif/#else chains as separate commands', () => {
    const t = setup();
    t.e.input(`#alias {cls} {
      #if {"%1" == "warrior"} {_send bash};
      #elseif {"%1" == "caster" || "%1" == "warcaster"} {_send cast};
      #else {_send shoot}
    }`);
    t.e.input('cls warrior;cls warcaster;cls thief');
    expect(t.sent).toEqual(['bash', 'cast', 'shoot']);
  });

  it('supports the else argument and nesting', () => {
    const t = setup();
    t.e.input('#if {1 > 2} {_send a} {_send b}');
    t.e.input('#if {1} {#if {0} {_send x};#else {_send y}}');
    t.e.input('#var bag sack;#if {"$bag" == "*sack*"} {_send glob}');
    expect(t.sent).toEqual(['b', 'y', 'glob']);
  });

  it('continues the chain when #else follows without ;', () => {
    const t = setup();
    t.e.input('#var r mage');
    t.e.input('#if {"$r" == "x"}\n{_send a}\n#elseif {"$r" == "mage"}\n{_send b}\n#else\n{_send c};_send after');
    t.e.input('#if {1} {_send yes} #else {_send no}');
    expect(t.sent).toEqual(['b', 'after', 'yes']);
  });

  it('reports a bad condition', () => {
    const t = setup();
    t.e.input('#if {(1} {x}');
    expect(t.msgs[0]).toMatch(/^#if \{\(1\}: missing \)/);
  });
});

describe('variables, #math, #format, #showme', () => {
  it('sets, shows and removes variables, and reports runtime sets', () => {
    const t = setup();
    t.e.input('#variable {spell} {\'burning hands\'};#var x;#var {y} {}');
    expect(t.e.getVariable('spell')).toBe("'burning hands'");
    expect(t.msgs).toEqual([]);
    expect(t.reports).toEqual([
      { type: 'set', item: { kind: 'variable', key: 'spell', body: "'burning hands'" } },
      { type: 'state', rows: [{ word: 'variable', key: 'x', state: 'not found' }] },
      { type: 'set', item: { kind: 'variable', key: 'y', body: '' } },
    ]);
    expect(t.e.getVariable('y')).toBe('');
    t.e.input('#unvar spell');
    expect(t.e.getVariable('spell')).toBeUndefined();
    expect(t.vars).toEqual([
      ['spell', "'burning hands'"],
      ['y', ''],
    ]);
  });

  it('computes with #math and #format', () => {
    const t = setup();
    t.e.input('#var hp 10;#math {hp} {$hp * 2 + 1};#format {s} {%-4s|%03d} {ab} {$hp}');
    expect(t.e.getVariable('hp')).toBe('21');
    expect(t.e.getVariable('s')).toBe('ab  |021');
  });

  it('#showme shows through the pipeline with colours, not sent', () => {
    const t = setup();
    t.e.input('#var target orc;#showme {<F9AA8B7>## TARGET: <FFFFFFF>$target<099>}');
    expect(t.sent).toEqual([]);
    expect(t.shown).toHaveLength(1);
    const d = t.shown[0]!;
    expect(d.local).toBe(true);
    expect(d.line.text).toBe('## TARGET: orc');
    expect(d.line.runs).toEqual([
      { start: 0, end: 11, fg: rgb(0x9a, 0xa8, 0xb7) },
      { start: 11, end: 14, fg: rgb(255, 255, 255) },
    ]);
  });
});

describe('actions', () => {
  it('fire on received lines with arguments, all matching in priority order (fan-out)', () => {
    const t = setup();
    t.e.input('#action {^%1 raises his hand.$} {group %1} {5}');
    t.e.input('#action {raises} {_send second} {7}');
    t.e.input('#action {hand} {_send first} {1}');
    t.e.system.define('action', 'raises', '', { priority: 5, fn: (m) => t.sent.push('system ' + m.args[0]) });
    t.recv('Bob raises his hand.');
    expect(t.sent).toEqual(['first', 'group Bob', 'system raises', 'second']);
  });

  it('match variables in patterns at match time', () => {
    const t = setup();
    t.e.input('#var foe Bob;#action {^$foe arrives} {_send kill $foe}');
    t.recv('Bob arrives from the north.');
    t.e.input('#var foe Tim');
    t.recv('Bob arrives.');
    t.recv('Tim arrives.');
    expect(t.sent).toEqual(['kill Bob', 'kill Tim']);
  });

  it('nested definitions register synchronously in line order', () => {
    const t = setup();
    t.e.input('#alias {arm} {#action {^%%1 recovers$} {_send bash %%1};_send armed %1;#showme {%%1 recovers}}');
    t.e.input('arm now');
    // The #showme line ran the action defined two commands earlier.
    expect(t.sent).toEqual(['armed now', 'bash %1']);
    expect(t.texts()).toEqual(['%1 recovers']);
    t.recv('Orc recovers');
    expect(t.sent).toEqual(['armed now', 'bash %1', 'bash Orc']);
  });

  it('#showme runs actions, with a guard against loops', () => {
    const t = setup();
    t.e.input('#action {^ping$} {#showme ping}');
    t.e.input('#showme ping');
    expect(t.texts().filter((x) => x === 'ping').length).toBeGreaterThan(1);
    expect(t.msgs.some((m) => m.includes('action loop'))).toBe(true);
  });

  it('#unaction and runtime toggles (autobash)', () => {
    const t = setup();
    t.e.input('#alias {on} {#action {seems to have recovered} {order bb bash}};#alias {off} {#unaction {seems to have recovered}}');
    t.e.input('on');
    t.recv('Orc seems to have recovered.');
    t.e.input('off');
    t.recv('Orc seems to have recovered.');
    expect(t.sent).toEqual(['order bb bash']);
  });
});

describe('display pipeline', () => {
  it('passes lines through untouched without rules', () => {
    const t = setup();
    const l = line('hello');
    t.bus.emit('text.line', l);
    expect(t.shown[0]!.line).toBe(l);
    expect(t.shown[0]!.source).toBe(l);
  });

  it('substitutes change only the displayed copy; actions and taps see the original', () => {
    const t = setup();
    const seen: string[] = [];
    t.bus.on('text.line', (l) => seen.push(l.text));
    t.e.input('#substitute {^%1 is stunned!} {<F23aaee>%0<900>} {5}');
    t.e.input('#action {^Orc is stunned!$} {_send hit}');
    t.e.input('#substitute {orc} {ORC}');
    t.recv('Orc is stunned! An orc and an orc.', [{ start: 0, end: 3, fg: 1 }]);
    const d = t.shown[0]!;
    expect(d.line.text).toBe('Orc is stunned! An ORC and an ORC.');
    expect(d.source.text).toBe('Orc is stunned! An orc and an orc.');
    expect(seen).toEqual(['Orc is stunned! An orc and an orc.']);
    expect(t.sent).toEqual([]); // the action is anchored with $: no match on the original
    expect(d.line.runs).toEqual([{ start: 0, end: 15, fg: rgb(0x23, 0xaa, 0xee) }]);
  });

  it('a substitution without codes keeps the style of the replaced text', () => {
    const t = setup();
    t.e.input('#sub {red} {crimson}');
    t.recv('a red b', [{ start: 2, end: 5, fg: 1 }]);
    expect(t.shown[0]!.line.text).toBe('a crimson b');
    expect(t.shown[0]!.line.runs).toEqual([{ start: 2, end: 9, fg: 1 }]);
  });

  it('gags hide the line (after substitutes) and actions still fire', () => {
    const t = setup();
    t.e.input('#gag {^You hear}');
    t.e.input('#action {^You hear %1$} {_send listen}');
    t.e.input('#sub {^Noise} {You hear noise}');
    t.recv('You hear a sound');
    t.recv('Noise');
    t.recv('Fine');
    expect(t.texts()).toEqual(['Fine']);
    expect(t.sent).toEqual(['listen']);
    t.e.input('#ungag {^You hear}');
    t.recv('You hear it');
    expect(t.texts()).toEqual(['Fine', 'You hear it']);
  });

  it('highlights every match on the substituted text', () => {
    const t = setup();
    t.e.input('#highlight {- armour} {Cyan} {5};#highlight {- sanc%*} {Magenta}');
    t.recv('You feel - armour and - sanctuary');
    expect(t.shown[0]!.line.runs).toEqual([
      { start: 9, end: 17, fg: 14 },
      { start: 22, end: 33, fg: 13 },
    ]);
    t.e.input('#hi {XX} {b red}');
    t.recv('XX and XX');
    expect(t.shown[1]!.line.runs).toEqual([
      { start: 0, end: 2, bg: 1 },
      { start: 7, end: 9, bg: 1 },
    ]);
  });

  it('partials get substitutes and highlights, no actions, no gags', () => {
    const t = setup();
    t.e.input('#sub {Name} {NAME};#hi {NAME} {red};#gag {Name};#action {Name} {_send x}');
    t.bus.emit('text.partial', line('By what Name? '));
    expect(t.partials[0]!.line.text).toBe('By what NAME? ');
    expect(t.partials[0]!.line.runs).toEqual([{ start: 8, end: 12, fg: 1 }]);
    expect(t.sent).toEqual([]);
  });

  it('a gagged line clears the partial it completes', () => {
    const t = setup();
    t.e.input('#gag {secret}');
    t.recv('a secret');
    expect(t.shown).toEqual([]);
    expect(t.partials).toHaveLength(1);
    expect(t.partials[0]!.line.text).toBe('');
  });

  it('500 rules with no match leave the line as is', () => {
    const t = setup();
    for (let i = 0; i < 500; i++) t.e.input(`#action {^zzz${i} %1$} {x};#sub {qq${i}} {y};#hi {ww${i}} {red}`);
    const l = line('An ordinary line of text.');
    t.bus.emit('text.line', l);
    expect(t.shown[0]!.line).toBe(l);
  });
});

describe('macros', () => {
  it('runs by canonical key, accepting tt++ escape forms', () => {
    const t = setup();
    t.e.input('#macro {\\eOp} {flee};#macro {F5} {_send draw};#mac {alt+a} {#if {1} {_send yes}}');
    expect(t.e.hasMacro('Numpad0')).toBe(true);
    expect(t.e.runMacro('Numpad0')).toBe(true);
    expect(t.e.runMacro('F5')).toBe(true);
    expect(t.e.runMacro('Alt+A')).toBe(true);
    expect(t.e.runMacro('F6')).toBe(false);
    expect(t.sent).toEqual(['flee', 'draw', 'yes']);
  });

  it('binds printable keys bare and with Shift (ADR 0026)', () => {
    const t = setup();
    t.e.input('#macro {a} {_send one};#macro {Shift+2} {_send two};#macro {Backquote} {_send three};#macro {shift+a} {_send four}');
    expect(t.msgs).toEqual([]);
    expect(t.e.runMacro('A')).toBe(true);
    expect(t.e.runMacro('Shift+2')).toBe(true);
    expect(t.e.runMacro('Backquote')).toBe(true);
    expect(t.e.runMacro('Shift+A')).toBe(true);
    expect(t.e.hasMacro('2')).toBe(false);
    expect(t.sent).toEqual(['one', 'two', 'three', 'four']);
  });

  it('refuses unbindable and unknown keys', () => {
    const t = setup();
    t.e.input('#macro {Escape} {x};#macro {Ctrl+W} {x};#macro {\\e[99~} {x}');
    expect(t.e.hasMacro('Escape')).toBe(false);
    expect(t.msgs).toHaveLength(3);
    expect(t.msgs[0]).toMatch(/cannot be bound/);
  });

  it('#unmacro removes', () => {
    const t = setup();
    t.e.input('#macro {F1} {x};#unmacro {F1}');
    expect(t.e.hasMacro('F1')).toBe(false);
  });
});

describe('timers', () => {
  it('#ticker repeats and #unticker stops', () => {
    const t = setup();
    t.e.input('#ticker {tick} {_send beat} {2}');
    t.clock.advance(1999);
    expect(t.sent).toEqual([]);
    t.clock.advance(1);
    t.clock.advance(4000);
    expect(t.sent).toEqual(['beat', 'beat', 'beat']);
    t.e.input('#unticker {tick}');
    t.clock.advance(10000);
    expect(t.sent).toHaveLength(3);
  });

  it('#delay fires once, named delays replace and #undelay cancels', () => {
    const t = setup();
    t.e.input('#delay {1.5} {_send once}');
    t.e.input('#delay {d} {_send named1} {1};#delay {d} {_send named2} {2}');
    t.e.input('#delay {x} {_send never} {1};#undelay x');
    t.clock.advance(5000);
    expect(t.sent).toEqual(['once', 'named2']);
    expect(t.clock.pending).toBe(0);
  });

  it('an inert command in a ticker hints once per load', () => {
    const t = setup();
    t.e.loadProfile('#TICKER {clock} {#lua {state.world.clock.tick()}} {0.25}');
    t.clock.advance(2000);
    expect(t.msgs).toEqual(['#lua: Shell and Lua commands do nothing in the browser.']);
  });
});

describe('#class', () => {
  it('groups rules, variables and timers and kills them', () => {
    const t = setup();
    t.e.input('#class {pvp} {open};#alias {x} {y};#var v 1;#ticker {t} {_send tick} {1};#class {pvp} {close};#alias {keep} {k}');
    t.e.input('#class {pvp} {kill}');
    t.e.input('x;keep');
    t.clock.advance(5000);
    expect(t.sent).toEqual(['x', 'k']);
    expect(t.e.getVariable('v')).toBeUndefined();
  });
});

describe('#event', () => {
  it('fires session and GMCP events', () => {
    const t = setup();
    t.e.input('#event {SESSION CONNECTED} {#showme up %0};#event {session disconnected} {#showme down %1}');
    t.e.input('#event {IAC SB GMCP char.vitals} {#showme vitals %1}');
    t.bus.emit('conn.state', { state: 'connecting', prev: 'idle' });
    t.bus.emit('conn.state', { state: 'login', prev: 'connecting' });
    t.bus.emit('gmcp.raw', { pkg: 'Char.Vitals', json: '{"hp":1}' });
    t.bus.emit('gmcp.raw', { pkg: 'Char.Name', json: '{}' });
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing', reason: 'bye' });
    expect(t.texts()).toEqual(['up mume', 'vitals {"hp":1}', 'down bye']);
  });
});

describe('loadProfile', () => {
  it('is atomic: the old store stays until the new one is complete, and its timers stop', () => {
    const t = setup();
    expect(t.e.loadProfile('#alias {a} {old};#ticker {t} {_send tick} {1}').ok).toBe(true);
    const bad = t.e.loadProfile('#alias {a} {new}\n#alias {b} {x');
    expect(bad).toEqual({ ok: false, reason: 'Unbalanced braces: the { on line 2 is never closed.' });
    t.e.input('a');
    expect(t.sent).toEqual(['old']);
    expect(t.e.loadProfile('#alias {a} {new}').ok).toBe(true);
    t.e.input('a');
    t.clock.advance(5000);
    expect(t.sent).toEqual(['old', 'new']);
  });

  it('reports inert, unknown and misplaced lines with line numbers and sends nothing', () => {
    const t = setup();
    const r = t.e.loadProfile('#nop hello\n#config {x} {y}\n\n#foo\nlook\n#alias {x} {y}\n#showme {hi}');
    expect(r).toEqual({
      ok: true,
      warnings: [
        'line 2: #config: Screen and terminal commands do nothing in the browser.',
        'line 4: Unknown command: #foo',
        'line 5: text outside a command is ignored: look',
      ],
    });
    expect(t.sent).toEqual([]);
    expect(t.texts()).toEqual(['hi']);
    expect(t.vars).toEqual([]);
    t.e.input('x');
    expect(t.sent).toEqual(['y']);
  });

  it('keeps runtime rules and variables for the session only', () => {
    const t = setup();
    t.e.loadProfile('#var a 1');
    t.e.input('#alias {z} {zz};#var b 2');
    t.e.loadProfile('#var a 1');
    t.e.input('z');
    expect(t.sent).toEqual(['z']);
    expect(t.e.getVariable('b')).toBeUndefined();
  });

  it('loads the synthetic PvP profile without warnings and runs it', () => {
    const t = setup();
    const r = t.e.loadProfile(readFileSync(new URL('./fixtures/pvp-shapes.tin', import.meta.url), 'utf8'));
    expect(r).toEqual({ ok: true, warnings: [] });
    t.e.input('fe troll;fb;fb now');
    t.e.input('_swap_cloak black');
    t.e.runMacro('F2');
    t.e.runMacro('Numpad0');
    t.e.input('ś;é');
    t.recv('Bob waves at you.');
    t.recv('Orc is stunned! Ha.');
    expect(t.sent).toEqual([
      'bash troll',
      'bash troll now',
      'remove grey',
      'put grey sack',
      'get black sack',
      'wear black',
      "cast 'chill' troll",
      'flee',
      'south',
      'north',
      'follow Bob',
    ]);
    expect(t.e.getVariable('cloak')).toBe('black');
    expect(t.texts()).toContain('Foe set to troll');
    expect(t.vars).toContainEqual(['foe', 'troll']);
  });
});

const KHAZDUL = readFileSync(new URL('../../src/profiles/khazdul.tin', import.meta.url), 'utf8');

/** The top-level `{…}` groups of a command, without their braces. */
function braceGroups(cmd: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < cmd.length; i++) {
    if (cmd[i] === '\\') i++;
    else if (cmd[i] === '{' && depth++ === 0) start = i + 1;
    else if (cmd[i] === '}' && --depth === 0) out.push(cmd.slice(start, i));
  }
  return out;
}

/** The first word of every command a body can send, through its #if chains. */
function sentWords(body: string): string[] {
  const out: string[] = [];
  for (const cmd of splitCommands(body)) {
    const word = cmd.trim().split(/\s+/)[0]!;
    if (!word.startsWith('#')) out.push(word);
    else if (/^#(if|elseif)$/i.test(word)) for (const g of braceGroups(cmd).slice(1)) out.push(...sentWords(g));
    else if (/^#else$/i.test(word)) for (const g of braceGroups(cmd)) out.push(...sentWords(g));
  }
  return out;
}

describe('the bundled reference profile (ADR 0024, 0036)', () => {
  it('loads and runs its aliases, macros, actions and highlights', () => {
    const t = setup();
    const r = t.e.loadProfile(KHAZDUL);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
    t.e.input('z *orc*');
    expect(t.texts().at(-1)).toBe('## TARGET: *orc*');
    t.e.input('bb;bb 2.troll');
    t.e.input('tw');
    t.e.input('caster;fball');
    expect(t.texts().at(-1)).toBe("## SPELL: 'fireball'");
    t.e.runMacro('F2');
    t.e.input('b2');
    t.recv('Bob raises his hand.');
    t.recv('Ann raises her hand.');
    t.recv('You feel - sanctuary.');
    expect(t.sent).toEqual([
      'bash *orc*',
      'bash *orc* 2.troll',
      'track warg',
      "cast normal 'fireball' *orc*",
      "cast normal 'blindness' 2.*orc*",
      'group Bob',
      'group Ann',
    ]);
    expect(t.shown.at(-1)!.line.runs).toEqual([{ start: 9, end: 20, fg: 13 }]);
  });

  it('sends scroll, door and equipment commands without stray spaces', () => {
    const t = setup();
    t.e.loadProfile(KHAZDUL);
    t.e.input('azure;azure 2.orc;rs;rook;dx;o;dx gate;3;of;ccr;ccr');
    expect(t.sent).toEqual([
      'get azurescroll all',
      'recite azurescroll',
      'get azurescroll all',
      'recite azurescroll 2.orc',
      'recite scroll',
      'get rock pack',
      'use rock exit',
      'open exit',
      'open gate',
      'order followers',
      'rem copperring',
      'get garnet-ring sable',
      'wear garnet-ring',
      'put copperring sable',
    ]);
    expect(t.texts().at(-1)).toBe('## SD1: exit  SD2: gate');
    expect(t.vars).toContainEqual(['ring', 'garnet-ring']);
  });

  it('is a clean example: typed entries and #nop only, no _send, readable keys', () => {
    expect(KHAZDUL).not.toContain('_send');
    const doc = parseProfile(KHAZDUL);
    expect(serialize(doc)).toBe(KHAZDUL);
    const odd = doc.nodes.filter((n) => n.type === 'passthrough' || (n.type === 'comment' && !/^#nop\b/.test(n.text)));
    expect(odd.map((n) => n.text)).toEqual([]);
    expect(listEntries(doc, 'macro').map((m) => m.pattern)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9']);
    for (const m of listEntries(doc, 'macro')) expect(normalizeKey(m.pattern)).toBe(m.pattern);
    // One command word style throughout.
    for (const kind of ENTRY_KINDS) for (const en of listEntries(doc, kind)) expect(en.word).toBe(kind);
  });

  it('declares every variable once and uses each of them', () => {
    const doc = parseProfile(KHAZDUL);
    const names = listEntries(doc, 'variable').map((v) => v.pattern);
    expect(new Set(names).size).toBe(names.length);
    const bodies = ENTRY_KINDS.filter((k) => k !== 'variable').flatMap((k) => listEntries(doc, k).map((en) => en.body));
    const unused = names.filter((n) => !bodies.some((b) => new RegExp(`\\$${n}\\b`).test(b)));
    expect(unused).toEqual([]);
  });

  it('sends no command that another alias would catch by its first word', () => {
    const doc = parseProfile(KHAZDUL);
    const aliases = listEntries(doc, 'alias');
    const names = new Set(aliases.map((a) => a.pattern));
    // Calls that are meant to run an alias: the `_` helpers and these three.
    const intended = (w: string) => w.startsWith('_') || w === 'z' || w === 'sd' || w === 'acontainer';
    const hits: string[] = [];
    let checked = 0;
    for (const kind of ['alias', 'macro', 'action'] as const) {
      for (const en of listEntries(doc, kind)) {
        for (const w of sentWords(en.body)) {
          checked++;
          if (intended(w)) expect(names.has(w), w).toBe(true);
          else if (names.has(w) || /^b\d+$/.test(w)) hits.push(`${kind} {${en.pattern}}: ${w}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(250);
    expect(hits).toEqual([]);
  });
});
