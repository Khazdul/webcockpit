import { describe, expect, it } from 'vitest';
import { powwowAttrs, powwowCommand, scanPowwow } from '../../../src/import/powwow';
import { body, countsMatch, keptBlock, load, one } from './helpers';

/** Imports Powwow lines (with the save-file header, so the format is Powwow). */
const pw = (text: string) => one('mume', `#savefile-version 6\n${text}`);
/** The items after the save-file header's. */
const its = (r: ReturnType<typeof pw>) => r.items.slice(1);

describe('powwow helpers', () => {
  it('resolves case-sensitive prefixes', () => {
    expect(powwowCommand('al')).toBe('alias');
    expect(powwowCommand('ac')).toBe('action');
    expect(powwowCommand('opt')).toBe('option');
    expect(powwowCommand('Alias')).toBe(null);
  });

  it('joins backslash-continued lines', () => {
    const st = scanPowwow({ name: 'f', text: '#alias a=one;\\\ntwo\n\n#alias b=x\n' });
    expect(st.map((s) => [s.line, s.text])).toEqual([
      [1, '#alias a=one;two'],
      [4, '#alias b=x'],
    ]);
  });

  it('maps mark attributes', () => {
    expect(powwowAttrs('bold red')).toBe('bold, red');
    expect(powwowAttrs('bold yellow on red')).toBe('bold, yellow, b red');
    expect(powwowAttrs('Yellow on Blue')).toBe('light yellow, b light blue');
    expect(powwowAttrs('inverse')).toBe('reverse');
    expect(powwowAttrs('sparkly')).toBe(null);
  });
});

describe('Powwow import', () => {
  it('aliases: name=text, groups, escaped names, $0/$n', () => {
    const r = pw("#alias summ=cast 'summon' $0\n#alias pi={remove sword;draw}\n#alias \\==score\n#alias kk@pk=kill $1\n");
    expect(body(r)).toEqual([
      "#alias {summ} {cast 'summon' %0}",
      '#alias {pi} {remove sword;draw}',
      '#alias {=} {score}',
      '#class {pk} {open}',
      '#alias {kk} {kill %1}',
      '#class {pk} {close}',
    ]);
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('actions with #print do not gag; captures are renumbered in pattern order', () => {
    const r = pw("#action >+reply ^$1 tells you '&2'={#print;#alias re=t $1 \\$0}\n#action >+sw &2 hits $1 hard={#print;say $1 $2}\n");
    expect(body(r)).toEqual(["#action {^%S tells you '%2'} {#alias {re} {t %1 %%0}}", '#action {%1 hits %S hard} {say %2 %1}']);
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('actions without #print also gag the line; empty actions are gags', () => {
    const r = pw('#action >+hunger You are hungry.=eat bread\n#action >+clip ^Clip-clop=\n');
    expect(body(r)).toEqual(['#action {You are hungry.} {eat bread}', '#gag {You are hungry.}', '#gag {^Clip-clop}']);
    expect(its(r).map((i) => i.reason)).toEqual(['No #print: the line is also gagged', 'Action without commands → #gag']);
  });

  it('#option +autoprint turns the implicit gag off', () => {
    const r = pw('#option +autoprint -compact\n#action >+hunger You are hungry.=eat bread\n');
    expect(body(r)).toEqual(['#action {You are hungry.} {eat bread}']);
  });

  it('#print text shows other text instead of the line', () => {
    const r = pw('#action %+count ^([[:alpha:]]+) has ([[:digit:]]+) coins=#print $2 has $3\n');
    expect(body(r)).toEqual(['#action {^{[A-Za-z]+} has {[0-9]+} coins} {#showme {%1 has %2}}', '#gag {^{[A-Za-z]+} has {[0-9]+} coins}']);
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('disabled actions are kept as #nop with their translation', () => {
    const r = pw('#action >-BackFire Your spell backfired!={#print;emote swears}\n');
    expect(its(r)[0]).toMatchObject({ outcome: 'kept' });
    expect(keptBlock(r)).toEqual(['#nop {Disabled in Powwow (BackFire); translation: #action {Your spell backfired!} {emote swears}}']);
  });

  it('action groups become classes; first-match warning', () => {
    const r = pw('#action >+a@pk ^A=#print\n#action >+b@pk ^B={#print;x}\n#action >+c@pk ^C={#print;y}\n');
    expect(body(r)).toEqual(['#class {pk} {open}', '#action {^B} {x}', '#action {^C} {y}', '#class {pk} {close}']);
    expect(r.fileWarnings).toEqual([expect.stringMatching(/first matching action/)]);
    // `#print` alone: nothing to run, nothing to gag
    expect(its(r)[0]).toMatchObject({ outcome: 'skipped' });
  });

  it('patterns that build text at match time are kept', () => {
    const r = pw('#action >joke ("^$1 says")=wink $1\n#action >v ^${name} arrives=x\n');
    expect(its(r).map((i) => [i.outcome, i.reason])).toEqual([
      ['kept', 'Pattern built from an expression'],
      ['kept', 'Pattern substitutes variables at match time'],
    ]);
  });

  it('marks become highlights', () => {
    const r = pw('#mark  YOU=bold red\n#mark ^$ hits &=Yellow on Blue\n#mark x=sparkly\n');
    expect(body(r)).toEqual(['#highlight {YOU} {bold, red}', '#highlight {^%S hits %*} {light yellow, b light blue}']);
    expect(its(r)[2]).toMatchObject({ outcome: 'kept' });
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('binds become macros; edit functions are skipped', () => {
    const r = pw('#bind F01 ^[OP=flee\n#bind KP8 ^[Ox=n\n#bind up ^[OA=&prev-line\n#bind odd ^[[99~=x\n');
    expect(body(r)).toEqual(['#macro {F1} {flee}', '#macro {Numpad8} {n}']);
    expect(its(r).map((i) => i.outcome)).toEqual(['translated', 'translated', 'skipped', 'kept']);
  });

  it('variables, comments and #init', () => {
    const r = pw('#(@xp = 0, @tick = 61500)\n#($target = "orc", $-3 = "a b")\n#("Connect to MUME")\n#init ={#identify;look}\n');
    expect(body(r)).toEqual([
      '#variable {xp} {0}',
      '#variable {tick} {61500}',
      '#variable {target} {orc}',
      '#variable {pw_s3} {a b}',
      '#nop {Connect to MUME}',
      '#event {SESSION CONNECTED} {look}',
    ]);
    expect(its(r)[2]!.warning).toMatch(/#identify dropped/);
  });

  it('bodies: #in → #delay, #if/#else, simple maths, @vars', () => {
    const r = pw('#alias t={#in t1 (2500) say hi;#if (@hp < 10) flee;#else rest;#(@n = @n + 1);say @n $x}\n');
    expect(body(r)).toEqual(['#alias {t} {#delay {t1} {say hi} {2.5};#if {$hp < 10} {flee};#else {rest};#math {n} {$n + 1};say $n $x}']);
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });

  it('expressions it cannot translate are kept with a warning', () => {
    const r = pw('#alias t={#(@n = $x:1);#send ("x"+$y)}\n');
    expect(its(r)[0]!.outcome).toBe('translated');
    expect(its(r)[0]!.warning).toMatch(/Expression/);
  });

  it('client state is skipped; unknown and text lines are kept; counts match', () => {
    const r = pw('#host mume.org 4242\n#delim normal\n#setvar mem=1\n#option +compact\n#zzz\nhello\n#prompt %+d ^>=#print\n');
    expect(its(r).map((i) => i.outcome)).toEqual(['skipped', 'skipped', 'skipped', 'skipped', 'kept', 'kept', 'kept']);
    expect(countsMatch(r)).toBe(true);
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
  });
});
