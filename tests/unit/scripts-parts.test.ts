// Pure parts of the script library (ADR 0051 P1): the header parser,
// trigger patterns, script colours, the #script/#lua forms and the hang
// guard's marker.

import { describe, expect, it } from 'vitest';
import { TRUECOLOR, isTrueColor, shadeColor, shadeRoleOf } from '../../src/core/types';
import { tokenizeLine } from '../../src/editor/syntax';
import { scriptCommandArgs } from '../../src/script/commands';
import { matchPattern } from '../../src/script/engine';
import { mudletColor, parseCecho, parseScriptColor } from '../../src/scripts/colors';
import { HANG_KEY, HangGuard } from '../../src/scripts/guard';
import { apiProblem, convertSetting, parseHeader, withHeaderName } from '../../src/scripts/header';
import { regexLiteral, regexPattern, substringPattern } from '../../src/scripts/patterns';

describe('header', () => {
  const SRC = `-- @name     coinlooter
-- @summary  Loots coins from corpses
-- @api      1
-- @alias    cl  toggle on/off
-- @key      F5  loot now
-- @setting  delay number 0.5 "Seconds before looting"
-- @setting  greet string "hello there" Said on arrival
-- @setting  quiet boolean off
-- @help     Kill something.
-- @help     It loots.
-- @future   ignored
-- a plain comment

local x = 1
-- @help not header
`;

  it('reads every tag of the leading comment block', () => {
    const { header, problems } = parseHeader(SRC);
    expect(problems).toEqual([]);
    expect(header).toEqual({
      name: 'coinlooter',
      summary: 'Loots coins from corpses',
      api: 1,
      aliases: [{ name: 'cl', text: 'toggle on/off' }],
      keys: [{ key: 'F5', text: 'loot now' }],
      settings: [
        { name: 'delay', type: 'number', default: 0.5, label: 'Seconds before looting' },
        { name: 'greet', type: 'string', default: 'hello there', label: 'Said on arrival' },
        { name: 'quiet', type: 'boolean', default: false, label: '' },
      ],
      help: ['Kill something.', 'It loots.'],
    });
  });

  it('reports bad settings and skips them', () => {
    const { header, problems } = parseHeader('-- @setting x number abc\n-- @setting y colour red\n-- @setting 9z string a\n-- @setting\n-- @setting ok number 1\n-- @setting ok number 2');
    expect(header.settings.map((s) => s.name)).toEqual(['ok']);
    expect(problems).toEqual([
      'line 1: @setting x: the default abc is not a number.',
      'line 2: @setting y: the type must be number, string or boolean.',
      'line 3: @setting 9z: the name may hold letters, digits and _ only.',
      'line 4: @setting needs a name, a type and a default.',
      'line 6: @setting ok is declared twice.',
    ]);
  });

  it('checks @api', () => {
    expect(apiProblem(parseHeader('-- @api 1').header)).toBe(null);
    expect(apiProblem(parseHeader('print(1)').header)).toBe('the header needs "-- @api 1".');
    expect(apiProblem(parseHeader('-- @api two').header)).toBe('the header needs "-- @api 1".');
    expect(apiProblem(parseHeader('-- @api 2').header)).toBe('it was written for @api 2; this WebCockpit runs @api 1.');
  });

  it('stops at code and block comments; a shebang line is skipped', () => {
    expect(parseHeader('#!lua\n\n-- @name a\nx = 1\n-- @name b').header.name).toBe('a');
    expect(parseHeader('--[[\n-- @name a\n]]').header.name).toBe(null);
  });

  it('converts setting values', () => {
    expect(convertSetting('number', ' 2.5 ')).toBe(2.5);
    expect(convertSetting('number', '')).toBe(null);
    expect(convertSetting('boolean', 'On')).toBe(true);
    expect(convertSetting('boolean', 'no')).toBe(false);
    expect(convertSetting('boolean', 'maybe')).toBe(null);
    expect(convertSetting('string', ' x ')).toBe(' x ');
  });

  it('rewrites or adds the @name line', () => {
    expect(withHeaderName('-- @name   old  \n-- @api 1\nx()', 'new')).toBe('-- @name   new  \n-- @api 1\nx()');
    expect(withHeaderName('-- @api 1\nx()', 'n')).toBe('-- @name     n\n-- @api 1\nx()');
    expect(withHeaderName('x()\n-- @name late', 'n')).toBe('-- @name     n\nx()\n-- @name late');
  });
});

describe('patterns', () => {
  it('a substring matches literally', () => {
    const c = substringPattern('a.b (x)');
    expect(matchPattern(c, 'see a.b (x) here')?.args).toEqual(['a.b (x)']);
    expect(matchPattern(c, 'aXb (x)')).toBe(null);
    expect(c.literal).toBe('a.b (x)');
    expect(() => substringPattern('')).toThrow('the substring is empty');
  });

  it('a regex fills one argument per group', () => {
    const c = regexPattern("^(\\w+) tells you '(.*)'(!)?$");
    expect(matchPattern(c, "Bob tells you 'hi'")?.args).toEqual(["Bob tells you 'hi'", 'Bob', 'hi', '']);
    expect(c.maxArg).toBe(3);
    expect(c.literal).toBe(" tells you '");
    expect(() => regexPattern('(')).toThrow(/^bad regex/);
  });

  it('regex literals are conservative', () => {
    expect(regexLiteral('You receive (\\d+) experience')).toBe('You receive ');
    expect(regexLiteral('a|b')).toBe('');
    expect(regexLiteral('colou?r')).toBe('colo');
    expect(regexLiteral('ab+c')).toBe('a');
    expect(regexLiteral('x{2}yz')).toBe('yz');
    expect(regexLiteral('[abc]def\\.g')).toBe('def.g');
    expect(regexLiteral('(?<who>\\w+) says')).toBe(' says');
    expect(regexLiteral('foo(?!bar)')).toBe('');
    expect(regexLiteral('(?:north|south) exit')).toBe('');
    expect(regexLiteral('\\bword\\b')).toBe('word');
  });
});

describe('colours', () => {
  it('cecho understands Mudlet names, rgb, ansi and tt++ codes', () => {
    const red = TRUECOLOR | 0xff0000;
    expect(parseCecho('<red>a<reset>b')).toEqual({ text: 'ab', runs: [{ start: 0, end: 1, fg: red }] });
    expect(parseCecho('<white:red>x').runs).toEqual([{ start: 0, end: 1, fg: TRUECOLOR | 0xffffff, bg: red }]);
    expect(parseCecho('<:blue>x<r>y').runs).toEqual([{ start: 0, end: 1, bg: TRUECOLOR | 0x0000ff }]);
    expect(parseCecho('<10,20,30>x').runs).toEqual([{ start: 0, end: 1, fg: TRUECOLOR | 0x0a141e }]);
    expect(parseCecho('<ansi_light_red>x<ansi_123>y').runs).toEqual([
      { start: 0, end: 1, fg: 9 },
      { start: 1, end: 2, fg: 123 },
    ]);
    expect(parseCecho('<138>x<Faa0000>y').runs).toEqual([
      { start: 0, end: 1, bold: true, fg: 3 },
      { start: 1, end: 2, bold: true, fg: TRUECOLOR | 0xaa0000 },
    ]);
    expect(parseCecho('a <s> <nocolour> c').text).toBe('a <s> <nocolour> c');
    expect(parseCecho('<#ff8800>x<#000000:#0000ff>y').runs).toEqual([
      { start: 0, end: 1, fg: TRUECOLOR | 0xff8800 },
      { start: 1, end: 2, fg: TRUECOLOR | 0, bg: TRUECOLOR | 0x0000ff },
    ]);
    expect(parseCecho('<#ff88>x').text).toBe('<#ff88>x');
  });

  it('cecho <b>, <i> and <u> switch bold, italic and underline on and off', () => {
    const red = TRUECOLOR | 0xff0000;
    expect(parseCecho('<b>bold</b> <red><i>it<u>u</i>x</u>y<reset>z')).toEqual({
      text: 'bold ituxyz',
      runs: [
        { start: 0, end: 4, bold: true },
        { start: 5, end: 7, fg: red, italic: true },
        { start: 7, end: 8, fg: red, italic: true, underline: true },
        { start: 8, end: 9, fg: red, underline: true },
        { start: 9, end: 10, fg: red },
      ],
    });
    expect(parseCecho('<B>x</B>').runs).toEqual([{ start: 0, end: 1, bold: true }]);
  });

  it('shade roles (<@dim>) only in pane text; unknown @names stay text (ADR 0065)', () => {
    const S = { shades: true };
    expect(parseCecho('<@text:@dim>ab<reset>c', S).runs).toEqual([{ start: 0, end: 2, fg: shadeColor('vtext'), bg: shadeColor('dim') }]);
    expect(parseCecho('<:@track>x', S).runs).toEqual([{ start: 0, end: 1, bg: shadeColor('track') }]);
    expect(parseCecho('<@bg>x<@glow:red>y', S).runs).toEqual([
      { start: 0, end: 1, fg: shadeColor('paneBg') },
      { start: 1, end: 2, fg: shadeColor('glow'), bg: TRUECOLOR | 0xff0000 },
    ]);
    expect(parseCecho('<@foo>x', S)).toEqual({ text: '<@foo>x', runs: [] });
    expect(parseCecho('<@dim>x')).toEqual({ text: '<@dim>x', runs: [] });
    expect(parseScriptColor('@dim')).toBe(null);
    expect(shadeRoleOf(shadeColor('label'))).toBe('label');
    expect(shadeRoleOf(TRUECOLOR | 0xffffff)).toBe(null);
    expect(isTrueColor(shadeColor('mid'))).toBe(false);
  });

  it('highlight colours: profile names first, then Mudlet names', () => {
    expect(parseScriptColor('light red')).toEqual({ fg: 9 });
    expect(parseScriptColor('red')).toEqual({ fg: 1 });
    expect(parseScriptColor('dodger_blue')).toEqual({ fg: TRUECOLOR | 0x1e90ff });
    expect(parseScriptColor('nothing')).toBe(null);
    expect(parseScriptColor('#ff8800')).toEqual({ fg: TRUECOLOR | 0xff8800 });
    expect(parseScriptColor('#ffffff:#000080')).toEqual({ fg: TRUECOLOR | 0xffffff, bg: TRUECOLOR | 0x000080 });
    expect(parseScriptColor('<b><orange>')).toEqual({ fg: TRUECOLOR | 0xffa500, bold: true });
    expect(parseScriptColor('<#00ff00>')).toEqual({ fg: TRUECOLOR | 0x00ff00 });
    expect(parseScriptColor('<F88ff00>')).toEqual({ fg: TRUECOLOR | 0x88ff00 });
    expect(parseScriptColor('<u>')).toEqual({ underline: true });
    expect(parseScriptColor('<nothing>')).toBe(null);
    expect(parseScriptColor('<red> text')).toBe(null);
    expect(parseScriptColor('#12345')).toBe(null);
    expect(mudletColor('Light Blue')).toBe(TRUECOLOR | 0xadd8e6);
    expect(mudletColor('300,0,0')).toBe(null);
  });
});

describe('#script and #lua forms', () => {
  it('known #script subcommands and #lua with two arguments run; the rest stays inert', () => {
    expect(scriptCommandArgs('script', ' LIST')).toEqual(['list']);
    expect(scriptCommandArgs('script', 'set {coin looter} delay {1 2}')).toEqual(['set', 'coin looter', 'delay', '1 2']);
    expect(scriptCommandArgs('script', '{var} {ls -l}')).toBe(null);
    expect(scriptCommandArgs('script', '')).toBe(null);
    expect(scriptCommandArgs('lua', '{looter} {toggle} {on fast}')).toEqual(['looter', 'toggle', 'on fast']);
    expect(scriptCommandArgs('lua', '{print("x")}')).toBe(null);
    expect(scriptCommandArgs('system', 'list')).toBe(null);
  });

  it('the editor hints only the inert forms', () => {
    const hint = (s: string) => tokenizeLine(s).find((t) => t.cls === 'cmd')?.hint;
    expect(hint('#script {var} {ls}')).toMatch(/do nothing/);
    expect(hint('#script enable looter')).toBe(undefined);
    expect(hint('#lua {looter} {toggle};#script {x} {y}')).toBe(undefined);
    expect(hint('#lua {code}')).toMatch(/do nothing/);
  });
});

describe('hang guard', () => {
  function storage() {
    const m = new Map<string, string>();
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    } as unknown as Storage & { m: Map<string, string> };
  }

  it('enter/exit names the running script and clears after the task', async () => {
    const s = storage();
    const g = new HangGuard(s);
    const a = g.enter('a');
    const b = g.enter('b');
    expect(s.m.get(HANG_KEY)).toBe('b');
    g.exit(b);
    expect(s.m.get(HANG_KEY)).toBe('a');
    g.exit(a);
    await Promise.resolve();
    expect(s.m.has(HANG_KEY)).toBe(false);
  });

  it('a pinned load keeps its mark across tasks until unpinned', async () => {
    const s = storage();
    const g = new HangGuard(s);
    await g.pin('loader');
    expect(s.m.get(HANG_KEY)).toBe('loader');
    g.exit(g.enter('other'));
    await Promise.resolve();
    expect(s.m.get(HANG_KEY)).toBe('loader');
    g.unpin();
    expect(s.m.has(HANG_KEY)).toBe(false);
  });

  it('takeLeftover reads and removes an old mark', () => {
    const s = storage();
    s.m.set(HANG_KEY, 'x');
    const g = new HangGuard(s);
    expect(g.takeLeftover()).toBe('x');
    expect(g.takeLeftover()).toBe(null);
    expect(new HangGuard(null).takeLeftover()).toBe(null);
  });
});
