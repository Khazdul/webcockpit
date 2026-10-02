// Host object classes in the Lua runtime (ADR 0053): userdata with
// methods called with `:`, identity per id, several results.

import { expect, it } from 'vitest';
import { loadLuaRuntime, LuaMulti, LuaObject } from '../../src/lua';
it('defines a class whose objects keep their identity and take methods with :', async () => {
  const rt = await loadLuaRuntime();
  const log: string[] = [];
  const cls = rt.defineClass('Pane', {
    echo: (a) => { log.push(`${a.object(1, cls)}:${a.string(2)}`); },
    size: (a) => new LuaMulti(a.object(1, cls), 7),
  });
  rt.defineFunction('make', (a) => new LuaObject(cls, a.number(1)));
  rt.defineFunction('out', (a) => { log.push(a.string(1)); });
  const r = rt.loadScript('t', `
    local p = make(5)
    p:echo("hi")
    local r, c = p:size()
    out(r .. "," .. c)
    out(tostring(make(5) == p))
    out(tostring(type(p)))
    out(tostring(getmetatable(p)))
    local ok, e = pcall(function() p.echo("x") end)
    out(e)
    ok, e = pcall(function() p.foo = 1 end)
    out(tostring(ok))
  `);
  expect(r.ok, r.ok ? '' : r.message).toBe(true);
  expect(log).toEqual(['5:hi', '5,7', 'true', 'userdata', 'false', expect.stringContaining("pane expected, got string; call it as pane:echo"), 'false']);
  expect(rt.stats().top).toBe(0);
});
