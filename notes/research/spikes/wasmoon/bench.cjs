const { LuaFactory, LuaLibraries } = require('wasmoon');
const now = () => performance.now();
const mem = () => { global.gc && global.gc(); const m = process.memoryUsage(); return { rss: m.rss, heap: m.heapUsed, ab: m.arrayBuffers }; };
const MB = (b) => (b / 1048576).toFixed(2) + ' MB';
const out = {};
function bench(name, n, fn) {
  for (let i = 0; i < Math.min(n, 5000); i++) fn(i); // warmup
  const t = now();
  for (let i = 0; i < n; i++) fn(i);
  const us = ((now() - t) / n) * 1000;
  out[name] = us.toFixed(3) + ' us/call';
  console.log(name, us.toFixed(3), 'us/call');
}

const SAFE = `
local keep = { assert=1, error=1, ipairs=1, next=1, pairs=1, pcall=1, print=1, rawequal=1, rawget=1, rawlen=1, rawset=1,
  select=1, setmetatable=1, getmetatable=1, tonumber=1, tostring=1, type=1, xpcall=1, _G=1, _VERSION=1,
  string=1, table=1, math=1, utf8=1, coroutine=1 }
for k in pairs(_G) do if not keep[k] then _G[k] = nil end end
string.dump = nil
`;

(async () => {
  const m0 = mem();
  let t = now();
  const factory = new LuaFactory();
  const lua = await factory.createEngine();
  const tFirst = now() - t;
  const m1 = mem();
  t = now();
  const lua2 = await factory.createEngine();
  const tSecond = now() - t;
  t = now();
  const f2 = new LuaFactory();
  const lua3 = await f2.createEngine();
  const tSecondFactory = now() - t;
  const m2 = mem();
  console.log({ tFirst, tSecond, tSecondFactory });
  console.log('mem after first factory+engine', MB(m1.rss - m0.rss), 'rss', MB(m1.ab - m0.ab), 'arraybuffers');
  console.log('mem after 2nd engine + 2nd factory', MB(m2.rss - m1.rss), 'rss', MB(m2.ab - m1.ab), 'ab');
  console.log('lua heap KB (engine1, collectgarbage count)', lua.doStringSync('return collectgarbage("count")'));

  // ---- 7 sync
  const r = lua.doStringSync('return 1+1');
  console.log('doStringSync returns', r, '(not a promise:', !(r instanceof Promise), ')');

  // ---- 3 call cost
  lua.doStringSync(SAFE);
  console.log('globals after sandbox:', lua.doStringSync('local t={} for k in pairs(_G) do t[#t+1]=k end table.sort(t) return table.concat(t,",")'));
  let sent = 0;
  lua.global.set('send', (s) => { sent += s.length; });
  lua.doStringSync(`
    hits = 0
    function onLine(line, caps) if caps and caps[1] == "Gandalf" then hits = hits + 1 end
      if line:find("tells you", 1, true) then return true end return false end
    function callSend() send("kill orc") end
    function onVitals(v) return v.hp + v.mana end
    function noop() end
  `);
  const line = 'Gandalf tells you \'Hello there, are you coming to the meeting at Bree?\' (xx)'.padEnd(80, '.');
  const caps = ['Gandalf', 'Hello there'];
  const onLine = lua.global.get('onLine');
  const noop = lua.global.get('noop');
  bench('A wasmoon fn wrapper noop()', 100000, () => noop());
  bench('B wasmoon fn wrapper onLine(80ch, caps[2])', 100000, () => onLine(line, caps));
  bench('C wasmoon fn wrapper onLine(80ch) no caps', 100000, () => onLine(line));
  const callSend = lua.global.get('callSend');
  bench('D JS->Lua->JS send(str)', 100000, () => callSend());
  lua.doStringSync('function sendLoop(n) for i=1,n do send("kill orc") end end');
  const sendLoop = lua.global.get('sendLoop');
  { const t = now(); sendLoop(100000); const us = (now() - t) * 1000 / 100000; out['E Lua->JS send(str) inner loop'] = us.toFixed(3) + ' us/call'; console.log('E Lua->JS send in loop', us); }
  const vitals = { hp: 120, maxhp: 150, mana: 80, maxmana: 100, mp: 90, maxmp: 120, xp: 12345, tp: 5, opponent: 'orc', wimpy: 20 };
  const onVitals = lua.global.get('onVitals');
  console.log('onVitals ->', onVitals(vitals));
  bench('F onVitals(10-field object)', 100000, () => onVitals(vitals));

  // ---- raw C API path (bypasses per-call thread creation)
  const L = lua.global.address, C = lua.global.lua;
  C.lua_getglobal(L, 'onLine');
  const ref = C.luaL_ref(L, -1001000); // LUA_REGISTRYINDEX
  const refB = BigInt(ref);
  function rawOnLine(s, c) {
    C.lua_rawgeti(L, -1001000, refB);
    C.lua_pushstring(L, s);
    C.lua_createtable(L, c.length, 0);
    for (let i = 0; i < c.length; i++) { C.lua_pushstring(L, c[i]); C.lua_rawseti(L, -2, BigInt(i + 1)); }
    const st = C.lua_pcallk(L, 2, 1, 0, 0, null);
    if (st !== 0) { const e = C.lua_tolstring(L, -1, null); C.lua_settop(L, -2); throw new Error(e); }
    const v = C.lua_toboolean(L, -1);
    C.lua_settop(L, -2);
    return v !== 0;
  }
  console.log('raw onLine ->', rawOnLine(line, caps));
  bench('G raw C-API onLine(80ch, caps[2])', 100000, () => rawOnLine(line, caps));

  // 500 rules in Lua: realistic - one Lua call per line, Lua iterates patterns
  lua.doStringSync(`
    local pats = {}
    for i=1,500 do pats[i] = "^You hit the creature" .. i .. " (%w+)" end
    function matchAll(line) local n=0 for i=1,#pats do if line:find(pats[i]) then n=n+1 end end return n end`);
  const matchAll = lua.global.get('matchAll');
  bench('H one call, 500 Lua patterns per line', 10000, () => matchAll(line));

  // ---- 4 sandbox + instruction budget
  const mod = lua.global.lua.module;
  let budgetHit = 0, poisoned = false;
  const BUDGET = 1_000_000;
  const hook = mod.addFunction((Lp, ar) => {
    budgetHit++;
    if (!poisoned) { poisoned = true; C.lua_sethook(L, hook, 8, 1); } // every further instruction errors -> pcall can't swallow it
    C.lua_pushstring(Lp, 'instruction budget exceeded');
    C.lua_error(Lp);
  }, 'vii');
  function guardedCall(name) {
    poisoned = false;
    C.lua_sethook(L, hook, 8 /*Count*/, BUDGET);
    C.lua_getglobal(L, name);
    const st = C.lua_pcallk(L, 0, 1, 0, 0, null);
    C.lua_sethook(L, null, 0, 0);
    const v = C.lua_tolstring(L, -1, null); C.lua_settop(L, -2);
    if (st !== 0) throw new Error(v);
    return v;
  }
  lua.doStringSync('function spin() while true do end end function ok() return "alive" end');
  t = now();
  try { guardedCall('spin'); console.log('spin returned??'); } catch (e) { console.log('infinite loop aborted after', (now() - t).toFixed(2), 'ms:', String(e.message || e)); out['budget abort 1M instr'] = (now() - t).toFixed(2) + ' ms'; }
  console.log('engine still alive:', guardedCall('ok'), 'wrapper ok():', lua.global.get('ok')(), 'stack top', lua.global.getTop());
  lua.doStringSync('function sneaky() for i=1,3 do pcall(function() while true do end end) end return "escaped" end');
  try { console.log('sneaky ->', guardedCall('sneaky')); } catch (e) { console.log('sneaky (pcall-swallow attempt) aborted:', e.message); }
  lua.doStringSync('function cospin() local co = coroutine.create(function() while true do end end) return tostring(coroutine.resume(co)) end');
  try { console.log('cospin ->', guardedCall('cospin')); } catch (e) { console.log('cospin aborted:', e.message); }
  lua.doStringSync('function strbomb() local s = string.rep("x", 1e6) for i=1,30 do s = s .. s end return #s end');
  try { console.log('strbomb ->', guardedCall('strbomb')); } catch (e) { console.log('strbomb:', e.message); }
  console.log('alive after all:', guardedCall('ok'));
  // wasmoon built-in time-based functionTimeout on wrappers
  const lt = await factory.createEngine({ functionTimeout: 50 });
  lt.doStringSync('function spin() while true do end end function ok() return "alive" end');
  t = now();
  try { lt.global.get('spin')(); } catch (e) { console.log('functionTimeout=50ms abort after', (now() - t).toFixed(1), 'ms:', e.message); }
  console.log('functionTimeout engine alive:', lt.global.get('ok')());
  // optimized raw string push: encodeInto preallocated buffer + _lua_pushlstring
  const BUF = mod._malloc(4096);
  const enc = new TextEncoder();
  C.lua_getglobal(L, 'onLine'); const ref2 = BigInt(C.luaL_ref(L, -1001000));
  function fastOnLine(s) {
    mod._lua_rawgeti(L, -1001000, ref2);
    const { written } = enc.encodeInto(s, mod.HEAPU8.subarray(BUF, BUF + 4096));
    mod._lua_pushlstring(L, BUF, written);
    const st = mod._lua_pcallk(L, 1, 1, 0, 0, 0);
    const v = mod._lua_toboolean(L, -1); mod._lua_settop(L, -2);
    if (st !== 0) throw new Error('lua error');
    return v !== 0;
  }
  console.log('fastOnLine ->', fastOnLine(line));
  bench('I raw _exports + encodeInto onLine(80ch)', 100000, () => fastOnLine(line));
  C.lua_sethook(L, hook, 8, BUDGET);
  bench('I2 same with count hook armed', 100000, () => fastOnLine(line));
  C.lua_sethook(L, null, 0, 0);
  bench('B2 onLine with count hook armed', 100000, () => onLine(line, caps));

  // ---- 6 errors
  try { lua.doStringSync('local x = nil\nlocal y = x.foo'); } catch (e) { console.log('err doStringSync:', e.message); }
  lua.global.loadString('function bad(a)\n  return a.b.c\nend', '@triggers/hp.lua'); lua.global.runSync();
  try { lua.global.get('bad')({}); } catch (e) { console.log('err named chunk:', e.message); }
  try { lua.doStringSync('function syn(\n'); } catch (e) { console.log('syntax err:', e.message); }
  lua.global.set('jsThrow', () => { throw new Error('boom from JS'); });
  try { lua.doStringSync('jsThrow()'); } catch (e) { console.log('js err through lua:', e.message); }
  console.log('pcall catches JS error:', lua.doStringSync('local ok, e = pcall(jsThrow) return tostring(ok) .. " " .. tostring(e)'));

  // ---- 5 isolation
  // a) separate engines on the same factory (same wasm instance/memory)
  let mA = mem(); t = now();
  const engines = [];
  for (let i = 0; i < 100; i++) { const e = await factory.createEngine({traceAllocations:true}); e.doStringSync(SAFE); engines.push(e); }
  const perEngine = (now() - t) / 100; let mB = mem();
  console.log('engine/script: ms', perEngine.toFixed(3), 'rss/engine', MB((mB.rss - mA.rss) / 100), 'lua heap', engines[0].global.getMemoryUsed && engines[0].global.getMemoryUsed());
  out['separate engine per script'] = perEngine.toFixed(3) + ' ms, ' + ((mB.rss - mA.rss) / 100 / 1024).toFixed(0) + ' KB rss';
  // b) _ENV per script in one engine
  lua.doStringSync(`
    local base = { string=string, table=table, math=math, utf8=utf8, pairs=pairs, ipairs=ipairs, tostring=tostring, tonumber=tonumber,
      type=type, pcall=pcall, error=error, select=select, next=next, print=print, send=send, setmetatable=setmetatable }
    function makeEnv() return setmetatable({}, { __index = base }) end
    envs = {}
    function loadScript(id, src, name) local env = makeEnv() local f, e = load(src, name, "t", env) if not f then error(e) end f() envs[id]=env end
  `);
  // load was removed by SAFE; re-test with a host-side loader instead: keep load captured by host before stripping.
  mA = mem(); t = now();
  const lua4 = await factory.createEngine();
  lua4.global.set('send', (s) => {});
  lua4.doStringSync(`
    local load, setmetatable = load, setmetatable
    local base = { string=string, table=table, math=math, utf8=utf8, pairs=pairs, ipairs=ipairs, tostring=tostring, tonumber=tonumber,
      type=type, pcall=pcall, error=error, select=select, next=next, print=print, send=send }
    envs = {}
    function __host_loadScript(id, src, name) local env = setmetatable({}, { __index = base }) local f, e = load(src, "=" .. name, "t", env) if not f then error(e, 0) end f() envs[id]=env end
  `);
  const hostLoad = lua4.global.get('__host_loadScript');
  t = now(); const m4a = lua4.doStringSync('return collectgarbage("count")'); mA = mem();
  for (let i = 0; i < 100; i++) hostLoad(i, `count = 0 function onLine(l) count = count + 1 if l:find("tells you") then send("x") end end`, 'script' + i);
  const perEnv = (now() - t) / 100; mB = mem();
  console.log('_ENV/script: ms', perEnv.toFixed(3), 'lua KB/env', ((lua4.doStringSync('collectgarbage() return collectgarbage("count")')-m4a)/100).toFixed(2), 'rss/env', MB((mB.rss - mA.rss) / 100));
  out['_ENV per script'] = perEnv.toFixed(3) + ' ms load+run';
  console.log('isolation check: script1.count after script0 set?', lua4.doStringSync('envs[0].count = 5 return tostring(envs[1].count) .. " " .. tostring(count)'));
  console.log('base shared table mutable? (string.x = 1 from script leaks)', lua4.doStringSync('envs[0].string.evil = 1 return tostring(envs[1].string.evil)'));

  // ---- 8 leak check: repeated calls with object args
  const mLeak0 = mem(); const refs0 = lua.global.lua.getLastRefIndex();
  for (let i = 0; i < 200000; i++) onVitals(vitals);
  for (let i = 0; i < 200000; i++) onLine(line, caps);
  const mLeak1 = mem();
  console.log('leak: rss delta after 400k calls', MB(mLeak1.rss - mLeak0.rss), 'refIndex', refs0, '->', lua.global.lua.getLastRefIndex(), 'wasm mem', MB(mod.HEAPU8 ? mod.HEAPU8.length : 0));
  console.log(JSON.stringify(out, null, 1));
})();
