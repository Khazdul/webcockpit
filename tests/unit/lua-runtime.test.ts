// The Lua runtime (src/lua/, ADR 0051): sandbox, per-script environments,
// instruction budget, memory cap, error mapping and the raw C API bridge.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadLuaRuntime, type CallResult, type LuaRef, type LuaRuntime, type LuaScript } from '../../src/lua';

let rt: LuaRuntime;
/** Functions registered by scripts with `register(fn)`, in order. */
let registered: LuaRef[] = [];
let sent: string[] = [];

beforeAll(async () => {
  rt = await loadLuaRuntime();
  rt.defineFunction('register', (a) => {
    registered.push(a.function(1));
  });
  rt.defineFunction('send', (a) => {
    sent.push(a.string(1));
  });
  rt.defineFunction('boom', () => {
    throw new Error('boom from JS');
  });
  rt.defineFunction('echoTable', (a) => a.table(1));
  rt.defineFunction('add', (a) => a.number(1) + a.optNumber(2, 0));
});

afterAll(() => rt.close());

/** Loads `src` as `name`; fails the test on a load error. */
function load(name: string, src: string): LuaScript {
  const r = rt.loadScript(name, src);
  if (!r.ok) throw new Error(`${r.kind}: ${r.message}`);
  return r.script;
}

/** Loads a script whose body is `return function(...) <body> end` and calls it. */
function run(body: string, ...args: unknown[]): CallResult {
  registered = [];
  const s = load('t', `register(function(...) ${body} end)`);
  try {
    return s.call(registered[0]!, ...args);
  } finally {
    s.unload();
  }
}

function value(body: string, ...args: unknown[]): unknown {
  const r = run(body, ...args);
  if (!r.ok) throw new Error(`${r.kind}: ${r.message}`);
  return r.value;
}

describe('sandbox', () => {
  it('removes io, os, package, debug, load, require, dofile, collectgarbage', () => {
    for (const g of ['io', 'os', 'package', 'debug', 'load', 'loadstring', 'dofile', 'loadfile', 'require', 'collectgarbage', 'warn']) {
      expect(value(`return type(${g})`), g).toBe('nil');
    }
  });

  it('keeps the whitelisted base functions and libraries', () => {
    expect(value('return string.upper("abc") .. table.concat({1, 2}, ",") .. math.floor(2.5) .. utf8.char(229)')).toBe('ABC1,22å');
    expect(value('return coroutine.wrap(function() coroutine.yield(7) end)()')).toBe(7);
    expect(value('return select("#", pcall(error, "x"))')).toBe(2);
    expect(value('return ("abc"):upper()')).toBe('ABC');
  });

  it('removes string.dump', () => {
    expect(value('return type(string.dump)')).toBe('nil');
    expect(value('return type(("").dump)')).toBe('nil');
  });

  it('refuses bytecode', () => {
    const r = rt.loadScript('bin', '\x1bLua');
    expect(r.ok).toBe(false);
  });

  it('library tables are read-only', () => {
    const w = run('string.upper = function() return "pwned" end');
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.message).toMatch(/^t:1: attempt to modify read-only table 'string'/);
    const raw = run('rawset(string, "upper", 1)');
    expect(raw.ok).toBe(false);
    const ins = run('table.insert(math, 1)');
    expect(ins.ok).toBe(false);
    expect(value('return string.upper("ok")')).toBe('OK');
  });

  it('hides the metatables of proxies, environments and strings', () => {
    expect(value('return getmetatable(string)')).toBe(false);
    expect(value('return getmetatable(_ENV)')).toBe(false);
    expect(value('return getmetatable("")')).toBe(false);
    expect(run('setmetatable(string, {})').ok).toBe(false);
    expect(run('setmetatable(_ENV, nil)').ok).toBe(false);
  });

  it('pairs over a library works without exposing the real table', () => {
    expect(value('local n = 0 for k, v in pairs(math) do n = n + 1 end return n > 20')).toBe(true);
    expect(value('local f, s = pairs(string) return s')).toBe(undefined);
    expect(value('return rawget(string, "upper")')).toBe(undefined);
  });

  it('refuses __gc metatables', () => {
    const r = run('setmetatable({}, { __gc = function() while true do end end })');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('__gc');
    expect(value('return getmetatable(setmetatable({}, { __index = {a = 1} })).__index.a')).toBe(1);
  });

  it('_G is the script environment', () => {
    expect(value('x = 5 return _G.x + _ENV.x')).toBe(10);
  });
});

describe('environments', () => {
  it('isolate globals between scripts', () => {
    registered = [];
    const a = load('a', 'counter = 1 string = "mine" register(function() return counter end)');
    const b = load('b', 'register(function() return tostring(counter) .. type(string) end)');
    expect(a.call(registered[0]!)).toEqual({ ok: true, value: 1 });
    expect(b.call(registered[1]!)).toEqual({ ok: true, value: 'niltable' });
    a.unload();
    b.unload();
  });

  it('a script cannot reach another through the base', () => {
    registered = [];
    const a = load('a', 'register(function() setmetatable = nil; send = nil end)');
    expect(a.call(registered[0]!).ok).toBe(true);
    expect(value('return type(setmetatable) .. type(send)')).toBe('functionfunction');
    a.unload();
  });

  it('calls on an unloaded script fail cleanly', () => {
    registered = [];
    const a = load('gone', 'register(function() return 1 end)');
    a.unload();
    const r = a.call(registered[0]!);
    expect(r.ok).toBe(false);
  });
});

describe('budget', () => {
  it('aborts a runaway loop and the runtime stays usable', () => {
    const t0 = performance.now();
    const r = run('while true do end');
    expect(r).toMatchObject({ ok: false, kind: 'budget' });
    if (!r.ok) expect(r.message).toMatch(/^t:1: instruction budget exceeded/);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(value('return 1 + 1')).toBe(2);
  });

  it('pcall cannot swallow the abort', () => {
    const r = run('for i = 1, 3 do pcall(function() while true do end end) end return "escaped"');
    expect(r).toMatchObject({ ok: false, kind: 'budget' });
    const x = run('xpcall(function() while true do end end, function() while true do end end) return "escaped"');
    expect(x).toMatchObject({ ok: false, kind: 'budget' });
  });

  it('xpcall handlers run under the budget', () => {
    expect(value('return select(2, xpcall(error, function(e) return "handled " .. e end, "x"))')).toBe('handled x');
    expect(value('return xpcall(function(a, b) return a + b end, print, 1, 2)')).toBe(true);
    expect(run('xpcall(error, function() while true do end end)')).toMatchObject({ ok: false, kind: 'budget' });
  });

  it('refuses <close> variables', () => {
    const r = rt.loadScript('tbc', 'local a <const> = 1\nlocal f = coroutine.wrap(function()\n  local x <close> = setmetatable({}, { __close = function() while true do end end })\n  while true do end\nend)\nf()');
    expect(r).toMatchObject({ ok: false, kind: 'syntax', message: 'tbc:3: <close> variables are not allowed in scripts' });
    expect(rt.loadScript('tbc2', 'local a, b < --[[x]] close\n> = nil')).toMatchObject({ ok: false, kind: 'syntax' });
    // Text that only looks like the attribute is fine.
    const ok = rt.loadScript('tbc3', 's = "local x <close>" --[[ local y <close> ]] t = [==[local z <close>]==] u = 1 < 2');
    expect(ok.ok).toBe(true);
    if (ok.ok) ok.script.unload();
  });

  it('a coroutine cannot swallow the abort', () => {
    const r = run('local co = coroutine.create(function() while true do end end) local ok = coroutine.resume(co) return "escaped"');
    expect(r).toMatchObject({ ok: false, kind: 'budget' });
    const w = run('local f = coroutine.wrap(function() while true do end end) pcall(f) return "escaped"');
    expect(w).toMatchObject({ ok: false, kind: 'budget' });
  });

  it('a script top level is budgeted too', () => {
    const r = rt.loadScript('spin', 'while true do end');
    expect(r).toMatchObject({ ok: false, kind: 'budget' });
    expect(rt.stats().scripts).toBe(0);
  });

  it('a coroutine poisoned in one call works in the next', () => {
    registered = [];
    const s = load('co', `
      local co = coroutine.wrap(function() while true do for i = 1, 10 do end coroutine.yield(1) end end)
      register(function() return co() end)
      register(function() while true do co() end end)`);
    expect(s.call(registered[0]!)).toEqual({ ok: true, value: 1 });
    expect(s.call(registered[1]!)).toMatchObject({ ok: false, kind: 'budget' });
    // The coroutine is dead now (the abort ended it), but calling the
    // first function again reports a plain error, not a budget abort.
    expect(s.call(registered[0]!)).toMatchObject({ ok: false, kind: 'error' });
    s.unload();
  });

  it('loops under the budget run to the end', () => {
    expect(value('local n = 0 for i = 1, 100000 do n = n + i end return n')).toBe(5000050000);
  });
});

describe('memory', () => {
  it('a memory bomb gives out-of-memory and the runtime stays usable', () => {
    const before = rt.stats().memoryUsed;
    const r = run('local s = string.rep("x", 1e6) for i = 1, 30 do s = s .. s end return #s');
    expect(r).toMatchObject({ ok: false, kind: 'memory' });
    expect(rt.stats().memoryUsed).toBeLessThan(before + 2 * 1024 * 1024);
    expect(value('return string.rep("ab", 3)')).toBe('ababab');
  });

  it('a table bomb in a global is out-of-memory too', () => {
    const r = rt.loadScript('tbomb', 't = {} for i = 1, 1e6 do t[i] = string.rep("x", 1000) .. i end');
    expect(r).toMatchObject({ ok: false, kind: 'memory' });
    expect(value('return "alive"')).toBe('alive');
  });
});

describe('errors', () => {
  it('syntax errors carry name:line', () => {
    const r = rt.loadScript('triggers/hp', 'x = 1\nfunction f(\n');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('syntax');
      expect(r.message).toMatch(/^triggers\/hp:3: /);
    }
  });

  it('runtime errors carry name:line', () => {
    registered = [];
    const s = load('looter', 'local function bad(a)\n  return a.b.c\nend\nregister(bad)');
    const r = s.call(registered[0]!, {});
    expect(r).toMatchObject({ ok: false, kind: 'error' });
    if (!r.ok) expect(r.message).toMatch(/^looter:2: attempt to index a nil value/);
    s.unload();
  });

  it('error() with a table value', () => {
    const r = run('error({})');
    expect(r).toMatchObject({ ok: false, kind: 'error', message: '(error object is a table value)' });
  });

  it('a JS exception in a host function becomes a Lua error at the caller', () => {
    const r = run('\nboom()');
    expect(r).toMatchObject({ ok: false, kind: 'error' });
    if (!r.ok) expect(r.message).toBe('t:2: boom from JS');
    expect(value('local ok, e = pcall(boom) return tostring(ok) .. " " .. e')).toBe('false boom from JS');
  });

  it('bad arguments to host functions are Lua errors', () => {
    const r = run('send(nil)');
    expect(r).toMatchObject({ ok: false, kind: 'error' });
    if (!r.ok) expect(r.message).toBe("t:1: bad argument #1 to 'send' (string expected, got nil)");
    expect(run('register(1)').ok).toBe(false);
    expect(value('return add(2, "3")')).toBe(5);
  });

  it('a top-level error releases what the script registered', () => {
    const top = rt.stats().top;
    const r = rt.loadScript('half', 'register(function() end) error("stop")');
    expect(r).toMatchObject({ ok: false, kind: 'error', message: 'half:1: stop' });
    expect(rt.stats()).toMatchObject({ top, scripts: 0 });
  });
});

describe('values', () => {
  it('unicode roundtrips both ways', () => {
    const s = 'Räksmörgås åäö ÅÄÖ ┌─┐│└┘ ▓▒░ 漢字 🐉';
    sent = [];
    expect(value('send(...) return ... .. "|" .. #(...)', s)).toBe(`${s}|${new TextEncoder().encode(s).length}`);
    expect(sent).toEqual([s]);
    expect(value('return "åäö ┌─┐"')).toBe('åäö ┌─┐');
    const long = 'å'.repeat(5000);
    expect(value('return ...', long)).toBe(long);
  });

  it('passes numbers, booleans and nil', () => {
    expect(value('return math.type(...)', 5)).toBe('integer');
    expect(value('return math.type(...)', 1.5)).toBe('float');
    expect(value('return tostring(...)', 120)).toBe('120');
    expect(value('local a, b, c = ... return tostring(a) .. tostring(b) .. tostring(c)', true, null, undefined)).toBe('truenilnil');
    expect(value('return nil')).toBe(undefined);
    expect(value('return false')).toBe(false);
  });

  it('pushes a nested GMCP-like object as a table', () => {
    const msg = {
      hp: 120,
      maxhp: 150,
      name: 'Gandalf',
      flags: ['sleeping', 'hungry'],
      room: { id: 4711, exits: { n: true, s: false }, title: 'Bree — Inn' },
      empty: {},
      skip: null,
    };
    expect(value('local m = ... return m.hp + m.maxhp', msg)).toBe(270);
    expect(value('local m = ... return m.flags[2] .. #m.flags .. m.room.title .. m.room.id', msg)).toBe('hungry2Bree — Inn4711');
    expect(value('local m = ... return tostring(m.room.exits.n) .. tostring(m.room.exits.s) .. type(m.empty) .. type(m.skip)', msg)).toBe(
      'truefalsetablenil',
    );
    expect(value('return echoTable(...)', msg)).toEqual({ ...msg, skip: undefined, empty: {} });
  });

  it('converts returned tables', () => {
    expect(value('return {1, 2, "x"}')).toEqual([1, 2, 'x']);
    expect(value('return {a = 1, b = {c = "d"}}')).toEqual({ a: 1, b: { c: 'd' } });
    expect(value('return {[1] = "a", [3] = "c"}')).toEqual({ 1: 'a', 3: 'c' });
  });

  it('refuses cyclic tables', () => {
    const r = run('local t = {} t.t = t return t');
    expect(r).toMatchObject({ ok: false, kind: 'error' });
    const o: Record<string, unknown> = {};
    o.o = o;
    expect(run('return 1', o)).toMatchObject({ ok: false, kind: 'error' });
    expect(rt.stats().top).toBe(0);
  });

  it('setGlobal reaches every script through the base', () => {
    rt.setGlobal(['gmcp', 'Char', 'Vitals'], { hp: 10 });
    rt.setGlobal(['gmcp', 'Room'], { id: 1 });
    expect(value('return gmcp.Char.Vitals.hp + gmcp.Room.id')).toBe(11);
    rt.setGlobal('answer', 42);
    expect(value('return answer')).toBe(42);
  });
});

describe('references', () => {
  it('load/unload and calls do not grow the stack, registry or heap', () => {
    const top = rt.stats().top;
    const run1 = () => {
      registered = [];
      const s = load('cycle', 'local n = 0 register(function(l, a, b) n = n + #l return n end) register(function() end)');
      s.call(registered[0]!, 'line', 'a', 'b');
      s.unload();
    };
    for (let i = 0; i < 1000; i++) run1();
    const mem0 = rt.stats().memoryUsed;
    for (let i = 0; i < 10000; i++) run1();
    expect(rt.stats().top).toBe(top);
    expect(rt.stats().scripts).toBe(0);
    expect(rt.stats().memoryUsed).toBeLessThan(mem0 + 512 * 1024);

    registered = [];
    const s = load('calls', 'register(function(l, a, b) return #l + #a + #b end)');
    for (let i = 0; i < 10000; i++) s.call(registered[0]!, 'x'.repeat(80), 'cap1', 'cap2');
    expect(s.call(registered[0]!, 'x'.repeat(80), 'cap1', 'cap2')).toEqual({ ok: true, value: 88 });
    expect(rt.stats().top).toBe(top);
    s.unload();
  });

  it('release drops one reference', () => {
    registered = [];
    const s = load('rel', 'register(function() return 1 end) register(function() return 2 end)');
    s.release(registered[0]!);
    expect(s.call(registered[1]!)).toEqual({ ok: true, value: 2 });
    s.unload();
  });

  it('current is the running script', () => {
    let seen: string | null = null;
    rt.defineFunction('whoami', () => {
      seen = rt.current?.name ?? null;
    });
    registered = [];
    const s = load('me', 'whoami()');
    expect(seen).toBe('me');
    expect(rt.current).toBe(null);
    s.unload();
  });

  it('host functions can call back into Lua (nested calls)', () => {
    registered = [];
    let inner: LuaScript | null = null;
    rt.defineFunction('callBack', (a) => {
      const r = inner!.call(a.function(1), 'nested');
      return r.ok ? r.value : `fail:${r.ok ? '' : r.kind}`;
    });
    inner = load('nest', 'register(function() return callBack(function(x) return x .. "!" end) end)');
    expect(inner.call(registered[0]!)).toEqual({ ok: true, value: 'nested!' });
    registered = [];
    inner.unload();
    inner = load('nest2', 'register(function() return callBack(function() while true do end end) end)');
    expect(inner.call(registered[0]!)).toMatchObject({ ok: false, kind: 'budget', message: 'nest2: instruction budget exceeded' });
    expect(value('return "alive"')).toBe('alive');
    inner.unload();
  });
});
