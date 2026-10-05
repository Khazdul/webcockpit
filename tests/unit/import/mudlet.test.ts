import { describe, expect, it } from 'vitest';
import { Bus } from '../../../src/core/bus';
import type { BusEvents, Line } from '../../../src/core/types';
import { FORMAT_NAMES } from '../../../src/import';
import { decodeControls, mudletRegex } from '../../../src/import/mudlet';
import { FakeScheduler, ScriptEngine } from '../../../src/script/engine';
import { body, countsMatch, file, fixture, keptBlock, load, one, run } from './helpers';

const profile = () => run(fixture('mudlet', 'profile.xml'));

/** An engine with the profile loaded: what it sends and shows. */
function engine(text: string) {
  const bus = new Bus();
  const sent: string[] = [];
  const shown: BusEvents['text.display'][] = [];
  const clock = new FakeScheduler();
  const e = new ScriptEngine({ send: (t) => sent.push(t), message: () => {}, scheduler: clock, now: () => 0 });
  e.attach(bus);
  bus.on('text.display', (d) => shown.push(d));
  expect(e.loadProfile(text).ok).toBe(true);
  const line = (text: string): Line => ({ text, runs: [], tags: [], prompt: false, raw: text, ts: 0 });
  const recv = (text: string) => bus.emit('text.line', line(text));
  const texts = () => shown.map((d) => d.line.text);
  return { e, sent, recv, texts, clock };
}

/** A minimal MudletPackage around one section's XML. */
function pkg(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE MudletPackage>\n<MudletPackage version="1.001">\n${inner}\n</MudletPackage>\n`;
}

describe('Mudlet: detection and report', () => {
  it('detects a profile save and names the format', () => {
    const r = profile();
    expect(r.format).toBe('mudlet');
    expect(FORMAT_NAMES[r.format]).toBe('Mudlet');
    expect(r.signals).toEqual(['MudletPackage version 1.001', 'profile save']);
    expect(r.profileText.split('\n')[0]).toBe('#nop {Imported from Mudlet file profile.xml on 2026-10-04. See the import report.}');
    expect(countsMatch(r)).toBe(true);
    expect(r.counts).toMatchObject({ translated: 37, kept: 15, skipped: 2 });
  });

  it('report items carry the XML start line and `<kind> <name>  <pattern>`', () => {
    const r = profile();
    expect(r.items.find((i) => i.source === 'Trigger hunger  You are hungry.')).toMatchObject({ file: 'profile.xml', line: 31, outcome: 'translated' });
    expect(r.items.find((i) => i.source.startsWith('Alias rook'))).toMatchObject({ source: 'Alias rook  ^rook(?: (.+))?$', line: 527 });
    expect(r.items.find((i) => i.source === 'Key north  Numpad8')?.outcome).toBe('translated');
  });

  it('skips installed packages with the built-in replacement, counting their items', () => {
    const skipped = profile().items.filter((i) => i.outcome === 'skipped');
    expect(skipped.map((i) => [i.source, i.reason])).toEqual([
      ['Package generic_mapper', "Mudlet's own package, not needed (2 items)"],
      ['Package Port Key Library v1_1_1', 'WebCockpit has a built-in Key manager (1 item)'],
    ]);
  });

  it('warns once about globals without a start value', () => {
    expect(profile().fileWarnings).toEqual(['No start value in Mudlet for abody, sd2, class; they start empty.']);
  });

  it('warns when a send would now run an alias', () => {
    const it = profile().items.find((i) => i.source.startsWith('Alias cl '));
    expect(it?.warning).toBe('Sends "c", which an alias here also matches: tt++ runs the alias, Mudlet\'s send() did not.');
  });

  it('a Mudlet file is not mixed with other formats', () => {
    const r = run(fixture('mudlet', 'package.xml'), file('old.tin', '#alias {k} {kill %1}\n'), fixture('mudlet', 'profile.xml'));
    expect(r.format).toBe('mudlet');
    expect(r.entry).toBe('package.xml');
    expect(r.items.find((i) => i.file === 'old.tin')).toMatchObject({ outcome: 'skipped', reason: 'Not a Mudlet file (a Mudlet import does not mix formats)' });
    expect(r.profileText).toContain('#nop {--- profile.xml ---}');
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('an unreadable XML file is kept with the reason', () => {
    const r = one('broken.xml', '<?xml version="1.0"?>\n<!DOCTYPE MudletPackage>\n<MudletPackage version="1.0">\n<AliasPackage>\n</MudletPackage>\n');
    expect(r.format).toBe('mudlet');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.reason).toMatch(/^Not a readable Mudlet XML file \(XML line 5: end tag <\/MudletPackage> does not match <AliasPackage>\)$/);
  });
});

describe('Mudlet: translation', () => {
  it('rules, folders as classes, start values first', () => {
    const b = body(profile());
    expect(b.slice(0, 11)).toEqual([
      '#variable {sd} {exit}',
      '#variable {kills} {0}',
      '#variable {afk} {0}',
      '#variable {mudlet_on_autoloot} {0}',
      '#variable {mudlet_on_hideScore} {0}',
      '#variable {mudlet_gate_hideScore} {%!{(?!)}}',
      '#variable {abody} {}',
      '#variable {mees} {*orc*}',
      '#variable {sd2} {}',
      '#variable {class} {}',
      '#action {%*} {#if {$mudlet_on_hideScore} {#variable {mudlet_gate_hideScore} {}} #else {#variable {mudlet_gate_hideScore} {%!{(?!)}}}} {1}',
    ]);
    expect(b).toContain('#class {Combat} {open}');
    expect(b).toContain('#class {Keys} {open}');
    for (const l of [
      '#action {You are hungry.} {eat bread}',
      "#action {^{\\w+} tells you '{.*}'$} {#showme {<Fffff00>[tell] <Fffffff>%1: %2}}",
      '#action {^You flee head over heels} {stand;look}',
      '#action {^You are thirsty.$} {drink water}',
      '#highlight {%!{\\b}Balrog%!{\\b}} {<Fff0000>}',
      '#highlight {troll} {<Fff0000>}',
      '#highlight {fighting} {<Fff0000><188>}',
      '#substitute {orc} {ORC}',
      '#substitute {^HP:{\\d+} MV:{\\d+}$} {<F00ff00>HP %1 <F00ffff>MV %2}',
      '#gag {^The {\\w+} %!{(?:ducks|dodges)} your attack.$}',
      '#action {^You are stunned} {#delay {3} {stand}}',
      '#action {You feel hungry} {eat bread}',
      '#action {You are starving} {eat bread}',
      '#ticker {autosave} {save} {300}',
      '#alias {^k {.+}$} {kill %1}',
      '#alias {^rook%!{(?: |$)}{.*}$} {get rock pack;#if {"%1" != ""} {use rock $sd %1} #else {use rock $sd}}',
      '#alias {^eq$} {remove all;wear all}',
      '#alias {^cnt$} {#math {kills} {$kills + 1};#showme {Kills: $kills}}',
      '#alias {^z%!{[ \\t]*}{.*}$} {#if {"%1" == ""} {#showme {<F9aa8b7>## TARGET: <Fffffff>$mees}} #else {#variable {mees} {%1};#showme {<F9aa8b7>## TARGET: <Fffffff>$mees}}}',
      '#macro {F1} {hit $mees}',
      "#macro {Alt+1} {cast 'cure light'}",
      '#macro {Numpad8} {north}',
      '#macro {Ctrl+S} {save}',
      '#macro {F4} {#if {"$class" == "warrior"} {kick} #elseif {"$class" == "caster"} {shoot $mees} #else {#variable {class} {caster};shoot $mees}}',
    ]) {
      expect(b).toContain(l);
    }
  });

  it('gates: enable/disable set mudlet_on_, gated bodies test it, gated gags use the pattern gate', () => {
    const b = body(profile());
    expect(b).toContain('#alias {^loot on$} {#variable {mudlet_on_autoloot} {1};#showme {<F00ff00>Autoloot on}}');
    expect(b).toContain('#action {^{.+} is dead! R.I.P.$} {#if {$mudlet_on_autoloot} {get all corpse}}');
    expect(b).toContain('#action {^HIDE {\\d+}$} {#if {$mudlet_on_hideScore} {#variable {mudlet_on_hideScore} {0}}}');
    expect(b).toContain('#gag {^${mudlet_gate_hideScore}HIDE {\\d+}$}');
    // A commented-out enableTrigger does not make a gate.
    expect(b.join('\n')).not.toContain('neverMentioned');
  });

  it('keeps what it cannot translate, with the reason and the source', () => {
    const k = keptBlock(profile()).join('\n');
    expect(k).toContain('#nop {Multiline (AND) trigger (Trigger two lines): You are bleeding | 1 | You feel weak\nsend("flee")}');
    expect(k).toContain('#nop {Lua function pattern (Trigger prompt check): return isPrompt()');
    expect(k).toContain('#nop {Uses tempRegexTrigger (Trigger autochant): ^You start chanting\\.$');
    expect(k).toContain('#nop {Trigger chain (children run only after it fires) (Trigger chain head): ^You begin to search}');
    expect(k).toContain('#nop {Part of the trigger chain chain head (Trigger chain child): You find a door');
    expect(k).toContain('#nop {Disabled in Mudlet (Trigger old trigger): #action {^Hello there$} {say hi}}');
    expect(k).toContain('#nop {Offset timer (runs once after its parent) (Timer once later): 00:00:02.500');
    expect(k).toContain('#nop {For loop (Alias repeat .a): ^(.*?)([0-9]+)a\\.(.*)$\nlocal num = tonumber(matches[3])');
    expect(k).toContain('#nop {Toolbar button (Action Flee): flee}');
    expect(k).toContain('#nop {Event handler script (gmcp.Char.Vitals) (Script vitals): function onVitals()');
    expect(k).toContain("#nop {Key 'Å' (code 197) depends on the keyboard layout (Key aring): keyCode 197 keyModifier 33554432\ncommand: draw sword}");
    expect(k).toContain('#nop {Table variable (Variable blindList): blindList}');
  });

  it('own Scripts are consumed when every function is in the subset', () => {
    const r = profile();
    expect(r.items.find((i) => i.source === 'Script targets')).toMatchObject({ outcome: 'translated' });
    expect(r.items.find((i) => i.source === 'Script coinLooter')).toMatchObject({ outcome: 'kept', reason: 'Uses a table' });
  });

  it('an exported package (no profile save, only packages) is imported, not skipped', () => {
    const r = run(fixture('mudlet', 'package.xml'));
    expect(r.counts).toMatchObject({ translated: 4, kept: 0, skipped: 0 });
    expect(body(r)).toEqual([
      '#class {MyHighlights} {open}',
      '#highlight {%!{(?<=^.*)\\(MIN\\)(?=.*$)}} {<F00ffff><B000000>}',
      '#highlight {^A pair of tiny eyes gleam at you from the shadows%!{.}} {<F00ffff><B000000>}',
      '#highlight {^- shield} {<B000080>}',
      '#highlight {- stored spell%!{.*}} {<B000080>}',
      "#action {%!{[^\\(\\)]*} ({\\w*}) says 'If you still need my help, you must pay me again%!{.}'} {give 10 silver %1}",
      '#alias {^hl$} {#showme {<F00ffff>Highlights loaded.}}',
      '#class {MyHighlights} {close}',
    ]);
  });

  it('a package WebCockpit replaces is skipped even when exported alone', () => {
    const r = one(
      'MumeSpellTimers.xml',
      pkg('<ScriptPackage>\n<ScriptGroup isActive="yes" isFolder="yes"><name>MumeSpellTimers</name><packageName>MumeSpellTimers</packageName><script></script>\n<Script isActive="yes" isFolder="no"><name>timers</name><packageName></packageName><script>x = 1</script></Script>\n</ScriptGroup>\n</ScriptPackage>'),
    );
    expect(r.items.map((i) => [i.outcome, i.reason])).toEqual([['skipped', 'WebCockpit shows spell timers in the Timers pane (1 item)']]);
  });

  it('decodes format 1.001 control pictures', () => {
    expect(decodeControls('a￼␛[1mb￼␡')).toBe('a\x1b[1mb\x7f');
  });

  it('mudletRegex: plain patterns, the optional tail, (?i), and %!{} when no arguments are needed', () => {
    const p = (re: string, args = true) => {
      const r = mudletRegex(re, args);
      return r.ok ? r.pattern : `KEPT: ${r.reason}`;
    };
    expect(p('^c$')).toBe('^c$');
    expect(p('^of (.+)$')).toBe('^of {.+}$');
    expect(p('^id(?: (.+))?$')).toBe('^id%!{(?: |$)}{.*}$');
    expect(p('^br(\\s.+)?$')).toBe('^br{(?:\\s.+)?}$');
    expect(p('(?i)^hello (\\w+)$')).toBe('^%ihello {\\w+}$');
    expect(p('^(a|b)(c)$')).toBe('^{a|b}{c}$');
    expect(p('^((a)b)$')).toBe('KEPT: Regex with nested capture groups');
    expect(p('^((a)b)$', false)).toBe('%!{^((a)b)$}');
    expect(p('^x|y$', false)).toBe('%!{^x|y$}');
  });
});

describe('Mudlet: behaviour in the engine', () => {
  it('aliases run their translated bodies', () => {
    const t = engine(profile().profileText);
    t.e.input('k orc');
    t.e.input('rook');
    t.e.input('rook bob');
    t.e.input('rookie');
    t.e.input('sd north door');
    t.e.input('c');
    expect(t.sent).toEqual(['kill orc', 'get rock pack', 'use rock exit', 'get rock pack', 'use rock exit bob', 'rookie', 'close north']);
  });

  it('a gated trigger fires only while switched on', () => {
    const t = engine(profile().profileText);
    t.recv('An orc is dead! R.I.P.');
    t.e.input('loot on');
    t.recv('An orc is dead! R.I.P.');
    t.e.input('loot off');
    t.recv('An orc is dead! R.I.P.');
    expect(t.sent).toEqual(['get all corpse']);
  });

  it('a gated gag that disables itself gags its own line, then stops', () => {
    const t = engine(profile().profileText);
    t.recv('HIDE 1');
    t.e.input('hs');
    t.recv('HIDE 2');
    t.recv('HIDE 3');
    expect(t.sent).toEqual(['score']);
    expect(t.texts().filter((x) => x.startsWith('HIDE'))).toEqual(['HIDE 1', 'HIDE 3']);
  });

  it('keys, delays and line edits work', () => {
    const t = engine(profile().profileText);
    t.e.runMacro('F4');
    t.e.runMacro('F4');
    t.recv('You are stunned!');
    t.clock.advance(3000);
    t.recv('The orc ducks your attack.');
    t.recv('HP:10 MV:20');
    expect(t.sent).toEqual(['shoot *orc*', 'shoot *orc*', 'stand']);
    expect(t.texts()).toContain('HP 10 MV 20');
    expect(t.texts()).not.toContain('The orc ducks your attack.');
  });
});
