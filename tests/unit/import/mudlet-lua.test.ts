import { describe, expect, it } from 'vitest';
import {
  type BodyResult,
  type LuaEnv,
  type LuaFunction,
  LuaSyntaxError,
  analyseScript,
  checkFunction,
  convertColours,
  lex,
  literalPattern,
  parseLua,
  translateBody,
} from '../../../src/import/mudlet-lua';

const SCRIPT = `
mees = mees or "*orc*"
spell = "'lightning bolt'"

function setTarget(newTarget)
  mees = newTarget
  decho("<154,168,183>## TARGET: <255,255,255>" .. utf8.upper(mees) .. "\\n")
end

function setSpamdoor(sd_1, sd_2)
  if sd_2 then
    sd2 = sd_2
  end
  if sd_1 then
    sd = sd_1
  end
  sd = sd or ""
end

function fullName(a, b)
  return a .. "." .. b
end

function castSpell()
  if spell == "'blindness'" then
    MumeSpellTimers.attemptBlind(mees)
  end
  send("cast " .. spell .. " " .. mees)
end

function loop(n) loop(n) end
`;

function env(): LuaEnv {
  const functions = new Map<string, LuaFunction>();
  const a = analyseScript(SCRIPT);
  for (const f of a.functions) functions.set(f.name, f);
  return { functions, defined: new Set([...a.defined, 'MumeSpellTimers']), gate: (n, on) => [`#variable {g_${n}} {${on ? 1 : 0}}`] };
}

/** The commands joined with `;`, or the reason. */
function tr(code: string, trigger: string[] | null = null): string {
  const r = translateBody(code, env(), trigger ? { patterns: trigger } : null);
  return r.ok ? r.commands.join(';') : `KEPT: ${r.reason}`;
}

function full(code: string, trigger: string[] | null = null): BodyResult {
  return translateBody(code, env(), trigger ? { patterns: trigger } : null);
}

describe('Lua lexer and parser', () => {
  it('reads strings, long strings, comments and numbers', () => {
    const t = lex(`--[[ block
comment ]] x = [==[a]]b]==] .. "q\\"\\n\\65" -- tail
y = 0x10 + 1.5e2`);
    expect(t.filter((x) => x.t === 'str').map((x) => x.v)).toEqual(['a]]b', 'q"\nA']);
    expect(t.filter((x) => x.t === 'num').map((x) => x.v)).toEqual(['0x10', '1.5e2']);
    expect(t.find((x) => x.v === 'y')!.line).toBe(3);
  });

  it('parses the whole syntax and reports errors with a line', () => {
    expect(parseLua('for i = 1, 3 do x = {a = 1, [2] = "b", 3} end; repeat until true; local f = function(...) return ... end').length).toBe(3);
    expect(() => parseLua('if x then\nsend("a"\nend')).toThrow(LuaSyntaxError);
    expect(() => parseLua('if x then\nsend("a"\nend')).toThrow(/line 3/);
    expect(tr('send("a"')).toMatch(/^KEPT: Lua syntax error: line 1/);
  });
});

describe('statements', () => {
  it('send, expandAlias and sendAll become commands; the echo flag is dropped', () => {
    expect(tr('send("get rock pack")\nsend("use rock", false)\nexpandAlias("k orc")\nsendAll("n", "e", false)')).toBe('get rock pack;use rock;k orc;n;e');
  });

  it('globals and matches substitute; literal text is escaped', () => {
    expect(tr('send("cast " .. SS .. " \'sleep\' " .. matches[2] .. "." .. mees)')).toBe("cast $SS 'sleep' %1.$mees");
    expect(tr('send(sd .. "x" .. matches[2] .. "5")')).toBe('${sd}x%015');
    expect(tr('send("a;b {c} $d 50% &e 5%1")')).toBe('a\\;b \\{c\\} \\$d 50% \\&e 5\\%1');
    expect(tr('send(matches[1])')).toBe('%0');
  });

  it('assignments: #variable, #math, defaults and booleans', () => {
    expect(tr('abody = "fur-cloak"\nlocal n = tonumber(matches[3])\nx = nil\nok = true')).toBe(
      '#variable {abody} {fur-cloak};#variable {n} {%2};#variable {x} {};#variable {ok} {1}',
    );
    expect(tr('count = count + 1\nhalf = (hp - 2) * 3')).toBe('#math {count} {$count + 1};#math {half} {($hp - 2) * 3}');
    expect(tr('char = matches[2] or char')).toBe('#if {"%1" != ""} {#variable {char} {%1}}');
    expect(tr('target = target or "orc"')).toBe('#if {"$target" == ""} {#variable {target} {orc}}');
    expect(tr('sd = sd or ""')).toBe('');
    expect(tr('x = matches[2] or "none"')).toBe('#if {"%1" != ""} {#variable {x} {%1}} #else {#variable {x} {none}}');
    expect(tr('mode = fast and "quick" or "normal"')).toBe(
      '#if {"$fast" != "" && "$fast" != "0"} {#variable {mode} {quick}} #else {#variable {mode} {normal}}',
    );
    expect(tr('big = hp > 100')).toBe('#if {$hp > 100} {#variable {big} {1}} #else {#variable {big} {0}}');
  });

  it('if/elseif/else with string, numeric, nil and truth tests', () => {
    expect(tr('if class == "warrior" then send("bash") elseif class ~= "thief" then send("kick") else send("shoot") end')).toBe(
      '#if {"$class" == "warrior"} {bash} #elseif {"$class" != "thief"} {kick} #else {shoot}',
    );
    expect(tr('if tonumber(matches[3]) > 120 and not resting then send("wake") end')).toBe(
      '#if {%2 > 120 && !("$resting" != "" && "$resting" != "0")} {wake}',
    );
    expect(tr('if matches[2] then send("a") end')).toBe('#if {"%1" != ""} {a}');
    expect(tr('if x == nil then send("a") end\nif y == true then send("b") end\nif z ~= 3 then send("c") end')).toBe(
      '#if {"$x" == ""} {a};#if {"$y" != "" && "$y" != "0"} {b};#if {$z != 3} {c}',
    );
    expect(tr('if mees == "*orc*" then send("x") end')).toBe('#if {"*orc*" == "$mees"} {x}');
  });

  it('folds constant conditions', () => {
    expect(tr('if true then send("a") else send("b") end')).toBe('a');
    expect(tr('if nil then send("a") elseif x then send("b") end')).toBe('#if {"$x" != "" && "$x" != "0"} {b}');
    expect(tr('if false then send("a") end')).toBe('');
  });

  it('splits a statement on an `or` value', () => {
    expect(tr('send("get rock pack")\nif matches[2] then send("use rock "..sd.." "..matches[2] or "") else send("use rock "..sd) end')).toBe(
      'get rock pack;#if {"%1" != ""} {use rock $sd %1} #else {use rock $sd}',
    );
    expect(tr('send("recite scroll "..(matches[2] or ""))')).toBe('recite scroll %1');
    expect(tr('send("kill " .. (target or "orc"))')).toBe('#if {"$target" != "" && "$target" != "0"} {kill $target} #else {kill orc}');
  });

  it('echo, cecho, decho and hecho become #showme with our colour codes', () => {
    expect(tr('cecho("## Character set to: <green>"..char)')).toBe('#showme {## Character set to: <F00ff00>$char}');
    expect(tr('decho("<154,168,183>## SPELL: <b><255,255,255:0,0,128>" .. spell .. "<r>\\n")')).toBe(
      '#showme {<F9aa8b7>## SPELL: <Fffffff><B000080>$spell<088>}',
    );
    expect(tr('hecho("#ff0000red #,00ff00green#r")')).toBe('#showme {<Fff0000>red <B00ff00>green<088>}');
    expect(tr('echo("\\nline one\\nline two\\n")')).toBe('#showme {};#showme {line one};#showme {line two}');
    expect(tr('cecho("main", "<white>x")')).toBe('#showme {<Fffffff>x}');
    expect(tr('cecho("chat", "x")')).toBe('KEPT: Cecho to a window');
    const r = full('cecho("<nosuchcolour>x")');
    expect(r.ok && r.warnings).toEqual(['Unknown colour nosuchcolour left as text.']);
  });

  it('tempTimer with a function or code string becomes #delay', () => {
    expect(tr('tempTimer(2, function() send("stand") end)')).toBe('#delay {2} {stand}');
    expect(tr('tempTimer(0.5, [[send("look")]])')).toBe('#delay {0.5} {look}');
    expect(tr('t = tempTimer(2, function() send("x") end)')).toBe('KEPT: Uses tempTimer');
    expect(tr('tempTimer(2, function() send("x") end, true)')).toBe('KEPT: Repeating tempTimer');
  });

  it('enable/disable calls use the caller gate', () => {
    expect(tr('enableTrigger("hidescore2")\ndisableAlias("x")')).toBe('#variable {g_hidescore2} {1};#variable {g_x} {0}');
    expect(tr('enableTrigger(name)')).toBe('KEPT: EnableTrigger with a computed name');
  });

  it('keeps what is outside the subset, naming the first construct', () => {
    expect(tr('for i = 1, 3 do send("x") end')).toBe('KEPT: For loop');
    expect(tr('t = tempRegexTrigger("^x$", function() send("y") end)')).toBe('KEPT: Uses tempRegexTrigger');
    expect(tr('speedwalk("n;s")')).toBe('KEPT: Uses speedwalk');
    expect(tr('MumeSpellTimers.attemptBlind(x)')).toBe('KEPT: Calls MumeSpellTimers.attemptBlind');
    expect(tr('x = math.min(a, b)')).toBe('KEPT: Uses math.min');
    expect(tr('autoStab.dir = "n"')).toBe('KEPT: Assigns to a table field');
    expect(tr('return\nsend("x")')).toBe('x');
    expect(tr('if x then return end\nsend("y")')).toBe('KEPT: Return before the end');
    expect(tr('send("a")\nreturn true')).toBe('a');
    expect(tr('send(#list)')).toBe('KEPT: Uses # (length)');
    expect(tr('deleteLine()')).toBe('KEPT: Uses deleteLine outside a trigger');
  });
});

describe('inlining Script functions', () => {
  it('substitutes the arguments, folding constant ones', () => {
    expect(tr('setTarget(matches[2])')).toBe('#variable {mees} {%1};#showme {<F9aa8b7>## TARGET: <Fffffff>$mees}');
    expect(tr('setSpamdoor(matches[2], matches[3])')).toBe('#if {"%2" != ""} {#variable {sd2} {%2}};#if {"%1" != ""} {#variable {sd} {%1}}');
    expect(tr('setSpamdoor("exit", matches[2])')).toBe('#if {"%1" != ""} {#variable {sd2} {%1}};#variable {sd} {exit}');
    expect(tr('setSpamdoor()')).toBe('');
    const r = full('setTarget("*orc*")');
    expect(r.ok && r.warnings).toEqual(['Upper/lower case conversion dropped.']);
  });

  it('inlines a single-return function as a value', () => {
    expect(tr('send("cast sleep " .. fullName(matches[2], mees))')).toBe('cast sleep %1.$mees');
  });

  it('a function that is not in the subset keeps the caller, with the reason', () => {
    expect(tr('castSpell()')).toBe('KEPT: Calls MumeSpellTimers.attemptBlind (in castSpell)');
    expect(tr('loop(1)')).toBe('KEPT: Calls loop recursively (in loop)');
    expect(tr('unknownFunction()')).toBe('KEPT: Uses unknownFunction');
  });

  it('arguments are closed: a parameter never captures a caller name', () => {
    // fullName's parameters are a and b; the caller passes globals named b and a.
    expect(tr('send(fullName(b, a))')).toBe('$b.$a');
  });
});

describe('trigger line idioms', () => {
  const P = ['^You are fighting {.*}$'];

  it('deleteLine gags; moveCursor belongs to the idiom', () => {
    const r = full('moveCursor(0, getLineCount())\ndeleteLine()\nsend("x")', P);
    expect(r.ok && [r.commands, r.gag]).toEqual([['x'], true]);
  });

  it('selectString + fg/bg/setBold → #highlight; replace → #substitute', () => {
    const r = full('selectString("fighting", 1)\nfg("red")\nbg("navy")\nsetBold(true)\nresetFormat()\nselectString("orc", 1)\nreplace("ORC")\ndeselect()', P);
    expect(r.ok && r.highlights).toEqual([{ pattern: 'fighting', colour: '<Fff0000><B000080><188>' }]);
    expect(r.ok && r.substitutes).toEqual([{ pattern: 'orc', text: 'ORC' }]);
    expect(r.ok && r.commands).toEqual([]);
  });

  it('selectCurrentLine and replaceLine work on the whole line', () => {
    const r = full('selectCurrentLine()\nsetFgColor(255, 128, 0)\ndeselect()\ncreplaceLine("<yellow>" .. matches[2])', ['You are fighting {.*}']);
    expect(r.ok && r.highlights).toEqual([{ pattern: '^%!*You are fighting {.*}%!*$', colour: '<Fff8000>' }]);
    expect(r.ok && r.substitutes).toEqual([{ pattern: '^%!*You are fighting {.*}%!*$', text: '<Fffff00>%1' }]);
  });

  it('idioms inside a condition or without a selection are kept', () => {
    expect(tr('if x then deleteLine() end', P)).toBe('KEPT: Uses deleteLine inside a condition or function');
    expect(tr('fg("red")', P)).toBe('KEPT: Fg without a selection');
    expect(tr('selectString(matches[2], 1)\nfg("red")', P)).toBe('KEPT: SelectString with a computed argument');
    expect(tr('selectString("x", 1)\nfg("blurple")', P)).toBe('KEPT: Unknown colour blurple');
  });
});

describe('Scripts', () => {
  it('splits functions, defaults and other statements', () => {
    const a = analyseScript(SCRIPT + '\ncoin = coin or {}\nfunction coin.loot() end\nsend("hi")');
    expect(a.functions.map((f) => f.name)).toEqual(['setTarget', 'setSpamdoor', 'fullName', 'castSpell', 'loop']);
    expect(a.defaults).toEqual([
      { name: 'mees', value: '*orc*', conditional: true },
      { name: 'spell', value: "'lightning bolt'", conditional: false },
    ]);
    expect(a.other.length).toBe(3);
    expect(a.defined).toContain('coin.loot');
    expect(analyseScript('function (').error).toMatch(/^Lua syntax error/);
  });

  it('checkFunction tells whether a function is in the subset', () => {
    const e = env();
    expect(checkFunction(e.functions.get('setTarget')!, e)).toBeNull();
    expect(checkFunction(e.functions.get('castSpell')!, e)).toBe('Calls MumeSpellTimers.attemptBlind (in castSpell)');
  });
});

describe('helpers', () => {
  it('convertColours handles the three tag styles', () => {
    expect(convertColours('cecho', '<red:white>a<:blue>b<reset>c<b>d</b>')).toBe('<Fff0000><Bffffff>a<B0000ff>b<088>cd');
    expect(convertColours('decho', '<1,2,3>a<:4,5,6>b')).toBe('<F010203>a<B040506>b');
    expect(convertColours('hecho', '|cff0000a#,00ff00b')).toBe('<Fff0000>a<B00ff00>b');
    expect(convertColours('echo', '<red>a')).toBe('<red>a');
  });

  it('literalPattern escapes pattern syntax and a leading ^', () => {
    expect(literalPattern('^50% {x} $hp$')).toBe('\\^50\\% \\{x\\} \\$hp\\$');
  });
});
