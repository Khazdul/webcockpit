// The plain Lua docs (stage 10 feedback round 3): the reference matches
// the live sandbox in both directions, entries are complete and their
// examples and snippets compile; signature help finds the call and the
// argument; completion, hover and the manual cover Lua names.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { completeLua, nameAt } from '../../src/editor/lua-api';
import { LUA_KEYWORDS, LUA_LIBS, LUA_REF, LUA_REMOVED, LUA_SYNTAX } from '../../src/editor/lua-ref';
import { callContext, paramLabel, signatureFor } from '../../src/editor/lua-sig';
import { helpLayout, helpLineText } from '../../src/editor/help';
import { LUA_INDEX, indexLinkOf, manualSectionOf, scriptManualSections } from '../../src/editor/script-reference';
import { type LuaRef, type LuaRuntime, loadLuaRuntime } from '../../src/lua';

let rt: LuaRuntime;
let registered: LuaRef[] = [];

beforeAll(async () => {
  rt = await loadLuaRuntime();
  rt.defineFunction('register', (a) => {
    registered.push(a.function(1));
  });
});

afterAll(() => rt?.close());

/** Runs `body` as a function in a fresh script and returns its value. */
function value(body: string): unknown {
  registered = [];
  const r = rt.loadScript('t', `register(function() ${body} end)`);
  if (!r.ok) throw new Error(r.message);
  try {
    const c = r.script.call(registered[0]!);
    if (!c.ok) throw new Error(c.message);
    return c.value;
  } finally {
    r.script.unload();
  }
}

const names = (r: ReturnType<typeof completeLua>) => r?.options.map((o) => o.name) ?? null;
/** The call context at the end of `text`, as [callee, index]. */
const at = (text: string) => {
  const c = callContext(text);
  return c ? [c.method ? `:${c.callee}` : c.callee, c.index] : null;
};

describe('Lua reference against the sandbox', () => {
  it('documents only names a script can reach', () => {
    for (const d of LUA_REF) {
      const t = value(`return type(${d.name})`);
      expect(t, d.name).not.toBe('nil');
      if (d.kind === 'function') expect(t, d.name).toBe('function');
      if (d.kind === 'table') expect(t, d.name).toBe('table');
    }
  });

  it('documents every library member and base function the sandbox keeps', () => {
    const documented = new Set(LUA_REF.map((d) => d.name));
    for (const lib of LUA_LIBS) {
      const members = String(value(`local t = {} for k in pairs(${lib}) do t[#t + 1] = k end table.sort(t) return table.concat(t, " ")`)).split(' ');
      expect(members.length, lib).toBeGreaterThan(5);
      for (const m of members) expect(documented, `${lib}.${m}`).toContain(`${lib}.${m}`);
    }
    // Lua 5.4's base library: documented (print is ours), or gone.
    const base = [
      'assert', 'collectgarbage', 'dofile', 'error', 'getmetatable', 'ipairs', 'load', 'loadfile', 'next', 'pairs', 'pcall',
      'rawequal', 'rawget', 'rawlen', 'rawset', 'require', 'select', 'setmetatable', 'tonumber', 'tostring', 'type', 'warn',
      'xpcall', '_VERSION',
    ];
    for (const n of base) {
      const there = value(`return type(${n})`) !== 'nil';
      expect(documented.has(n), n).toBe(there);
    }
  });

  it('lists nothing the sandbox removes, and the removed names are gone', () => {
    const documented = new Set(LUA_REF.map((d) => d.name));
    for (const n of LUA_REMOVED) {
      expect(documented.has(n), n).toBe(false);
      expect(value(`return type(${n})`), n).toBe('nil');
    }
  });
});

describe('Lua reference entries', () => {
  it('has a signature, description, parameters and example for every function', () => {
    for (const d of LUA_REF) {
      expect(d.lua, d.name).toBe(true);
      expect(d.doc.length, d.name).toBeGreaterThan(10);
      expect(d.example, d.name).toBeTruthy();
      expect(d.example!.split('\n').length, d.name).toBeLessThanOrEqual(8);
      if (d.kind !== 'function') continue;
      expect(d.sig.startsWith(`${d.name}(`), d.name).toBe(true);
      expect(Array.isArray(d.params), d.name).toBe(true);
      for (const p of d.params!) expect(d.sig.includes(p.name), `${d.name}: ${p.name}`).toBe(true);
    }
  });

  it('explains patterns where patterns are taken', () => {
    for (const n of ['string.find', 'string.match', 'string.gmatch', 'string.gsub']) {
      const d = LUA_REF.find((e) => e.name === n)!;
      expect(d.params!.find((p) => p.name === 'pattern')!.doc, n).toMatch(/not a regular expression.*%a.*%d/);
      expect(d.more!.join(' '), n).toMatch(/too complex/);
    }
  });

  it('expands every keyword snippet to code that compiles', () => {
    for (const d of [...LUA_KEYWORDS, ...LUA_SYNTAX]) expect(d.doc.length, d.name).toBeGreaterThan(5);
    const snippets = LUA_KEYWORDS.flatMap((d) => (d.snippets ?? []).map((s) => ({ name: d.name, ...s })));
    expect(snippets.length).toBeGreaterThanOrEqual(10);
    for (const s of snippets) {
      const code = s.template.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\{\d*\}/g, '').replace(/\t/g, '  ');
      const src = s.template.startsWith('function(') ? `local f = ${code}` : code;
      expect(rt.check('snippet', src), `${s.detail}:\n${src}`).toEqual({ ok: true });
      expect(s.template).toMatch(/\$\{1/);
    }
  });
});

describe('signature help', () => {
  it('finds the call and the argument at the cursor', () => {
    expect(at('send(')).toEqual(['send', 0]);
    expect(at('string.format("%d", ')).toEqual(['string.format', 1]);
    expect(at('local s = string.format("%d, %s", 1, ')).toEqual(['string.format', 2]);
    expect(at('send("a, b (c")')).toBeNull();
    expect(at('send("a, b (c", ')).toEqual(['send', 1]);
    expect(at('echo(string.rep("-", 3), ')).toEqual(['echo', 1]);
    expect(at('echo(string.rep("-", ')).toEqual(['string.rep', 1]);
    expect(at('echo(table.concat({ "a", "b" }, ')).toEqual(['table.concat', 1]);
    expect(at('echo(table.concat({ "a", ')).toBeNull();
    expect(at('send([[a, b]], ')).toEqual(['send', 1]);
    expect(at('send("x") -- echo(')).toBeNull();
    expect(at('send(x --[[ , ]] , ')).toEqual(['send', 1]);
  });

  it('handles method calls on names, strings and call results', () => {
    expect(at('local a = line:find(')).toEqual([':find', 0]);
    expect(at('line:match("^(%a+)", ')).toEqual([':match', 1]);
    expect(at('("x"):rep(3, ')).toEqual([':rep', 1]);
    expect(at('matches[2]:upper(')).toEqual([':upper', 0]);
    expect(at('gmcp.Char.Vitals.hp:fo(')).toEqual([':fo', 0]);
  });

  it('leaves function definitions and bodies out of the outer call', () => {
    expect(at('local function heal(who, ')).toBeNull();
    expect(at('tempTrigger("x", function(')).toBeNull();
    expect(at('tempTrigger("x", function()')).toBeNull();
    expect(at('tempTrigger("x", function()\n  send(')).toEqual(['send', 0]);
    expect(at('tempTrigger("x", function()\n  if a then send("y") end\nend, ')).toEqual(['tempTrigger', 2]);
    expect(at('tempTrigger("x", function()\n  for i = 1, 2 do\n    echo(i, ')).toEqual(['echo', 1]);
    expect(at('local t = { a = send(')).toEqual(['send', 0]);
  });

  it('builds the signature with the current parameter', () => {
    const sig = signatureFor(callContext('string.format("%d", ')!)!;
    expect(sig.name).toBe('string.format');
    expect(sig.params.map(paramLabel)).toEqual(['fmt', '...']);
    expect(sig.active).toBe(1);
    // Past the last parameter: `...` stays current; a fixed list has none.
    expect(signatureFor(callContext('string.format("%d", 1, 2, ')!)!.active).toBe(1);
    expect(signatureFor(callContext('send("a", ')!)!.active).toBe(-1);
    // A method drops `s`.
    const m = signatureFor(callContext('line:find("x", ')!)!;
    expect(m.name).toBe('s:find');
    expect(m.params.map(paramLabel)).toEqual(['pattern', '[init]', '[plain]']);
    expect(m.params[m.active]!.name).toBe('init');
    expect(m.returns).toMatch(/^ → start/);
    expect(signatureFor(callContext('tempTrigger("x", ')!)!.params[1]!.name).toBe('fn');
    expect(signatureFor(callContext('myOwn(')!)).toBeNull();
    expect(signatureFor(callContext('line:nothing(')!)).toBeNull();
  });
});

describe('completion and hover of plain Lua', () => {
  it('lists library members after string. table. math. utf8. coroutine.', () => {
    expect(names(completeLua('local s = string.'))).toContain('string.format');
    expect(names(completeLua('table.'))).toEqual(['table.concat', 'table.insert', 'table.move', 'table.pack', 'table.remove', 'table.sort', 'table.unpack']);
    expect(names(completeLua('math.fl'))).toEqual(['math.floor']);
    expect(names(completeLua('utf8.'))).toContain('utf8.len');
    expect(names(completeLua('coroutine.'))).toContain('coroutine.wrap');
    expect(completeLua('string.dum')).toBeNull();
  });

  it('offers string methods after x:', () => {
    const r = completeLua('if line:ma')!;
    expect(r.method).toBe(true);
    expect(names(r)).toEqual(['string.match']);
    expect(r.from).toBe(8);
    expect(names(completeLua('local n = ("x"):'))).toContain('string.upper');
    expect(names(completeLua('local n = ("x"):'))).not.toContain('string.char');
    expect(completeLua('send("a:')).toBeNull();
    expect(completeLua('::')).toBeNull();
  });

  it('offers keywords with snippets, but not once a keyword is typed', () => {
    expect(names(completeLua('fo'))).toEqual(['for']);
    expect(completeLua('fo')!.options[0]!.snippets!.length).toBe(3);
    expect(names(completeLua('  wh'))).toEqual(['while']);
    expect(completeLua('else')).toBeNull();
    expect(completeLua('local')).toBeNull();
    expect(names(completeLua('loc'))).toEqual(['local']);
    const t = names(completeLua('t'))!;
    expect(t.indexOf('then')).toBeGreaterThan(t.indexOf('tempTimer'));
    expect(t.indexOf('then')).toBeLessThan(t.indexOf('tostring'));
  });

  it('hovers Lua names, methods, keywords, operators and removed names', () => {
    expect(nameAt('for i, v in ipairs(t) do', 13)).toMatchObject({ from: 12, to: 18, doc: { name: 'ipairs' } });
    expect(nameAt('local a = line:find("x")', 16)).toMatchObject({ from: 15, to: 19, doc: { name: 'string.find' } });
    expect(nameAt('for i = 1, 2 do', 1)?.doc.name).toBe('for');
    expect(nameAt('echo("a" .. b)', 10)?.doc.name).toBe('..');
    expect(nameAt('local n = #list', 10)?.doc.name).toBe('#');
    expect(nameAt('if a ~= b then', 6)?.doc.name).toBe('~=');
    expect(nameAt('x = 1 -- note', 7)?.doc.name).toBe('--');
    expect(nameAt('local f = function(...) end', 20)?.doc.name).toBe('...');
    expect(nameAt('send("a .. b")', 8)).toBeNull();
    const os = nameAt('local t = os.time()', 13)!;
    expect(os.doc.name).toBe('os');
    expect(os.doc.removed).toBe(true);
    expect(os.doc.doc).toMatch(/Not available in scripts/);
    expect(nameAt('x = string.dump(f)', 12)?.doc.name).toBe('string.dump');
  });
});

describe('Lua in the manual', () => {
  it('has Lua basics and patterns in the guide, then the Lua reference with its index', () => {
    const all = scriptManualSections();
    const guide = all.filter((s) => s.group === 'guide').map((s) => s.heading);
    expect(guide.slice(0, 3)).toEqual(['Getting started', 'Lua basics', 'Lua patterns']);
    const lua = all.filter((s) => s.group === 'lua');
    expect(lua[0]!.heading).toBe(LUA_INDEX);
    expect(lua.length).toBe(1 + LUA_REF.filter((d) => d.kind !== 'table').length);
    expect(all.indexOf(lua[0]!)).toBeGreaterThan(all.findIndex((s) => s.group === 'reference'));
  });

  it('opens F1 at the right section for Lua names', () => {
    const all = scriptManualSections();
    expect(all[manualSectionOf('string.format')]).toMatchObject({ group: 'lua', heading: 'string.format' });
    expect(all[manualSectionOf('ipairs')]!.heading).toBe('ipairs');
    expect(all[manualSectionOf('string')]!.heading).toBe(LUA_INDEX);
    expect(all[manualSectionOf('for')]!.heading).toBe('Lua basics');
    expect(all[manualSectionOf('..')]!.heading).toBe('Lua basics');
    expect(all[manualSectionOf('os')]!.heading).toBe('Sandbox and limits');
    expect(all[manualSectionOf('send')]).toMatchObject({ group: 'reference', heading: 'send' });
    expect(manualSectionOf('myOwnThing')).toBe(-1);
  });

  it('links each index line to its entry', () => {
    const layout = helpLayout(80, scriptManualSections());
    const rows = layout.lines.map(helpLineText);
    const link = rows.map(indexLinkOf).filter((x) => x !== null);
    expect(link.length).toBe(LUA_REF.filter((d) => d.kind !== 'table').length);
    const fmt = link.find((l) => l!.name === 'string.format')!;
    expect(scriptManualSections()[fmt.section]!.heading).toBe('string.format');
    expect(rows.some((r) => r.startsWith('- string.format: Builds a string'))).toBe(true);
  });
});
