const { LuaFactory } = require('wasmoon');
const now = () => performance.now();
function bench(name, n, fn) { for (let i = 0; i < 5000; i++) fn(i); const t = now(); for (let i = 0; i < n; i++) fn(i); console.log(name, (((now() - t) / n) * 1000).toFixed(3), 'us/call'); }
(async () => {
  const f = new LuaFactory();
  // stack leak
  const e = await f.createEngine();
  const top0 = e.global.getTop(); for (let i = 0; i < 1000; i++) e.doStringSync('return 1, 2'); console.log('doStringSync stack leak: top', top0, '->', e.global.getTop());
  // memory cap
  const m = await f.createEngine({ traceAllocations: true });
  m.global.setMemoryMax(8 * 1024 * 1024);
  try { m.doStringSync('local s = string.rep("x", 1e6) for i=1,30 do s = s .. s end'); } catch (err) { console.log('memoryMax 8MB:', err.message); }
  console.log('after cap alive:', m.doStringSync('return "ok"'), 'used', m.global.getMemoryUsed());
  m.doStringSync('function onLine(l) return l:find("tells you", 1, true) ~= nil end');
  e.doStringSync('function onLine(l) return l:find("tells you", 1, true) ~= nil end');
  const line = 'Gandalf tells you hello'.padEnd(80, '.');
  bench('wrapper onLine traceAllocations=false', 100000, (() => { const fn = e.global.get('onLine'); return () => fn(line); })());
  bench('wrapper onLine traceAllocations=true ', 100000, (() => { const fn = m.global.get('onLine'); return () => fn(line); })());
  // raw table push of a 10-field vitals object
  const mod = e.global.lua.module, L = e.global.address;
  e.doStringSync('function onVitals(v) return v.hp + v.mana end');
  const keys = ['hp', 'maxhp', 'mana', 'maxmana', 'mp', 'maxmp', 'xp', 'tp', 'opponent', 'wimpy'];
  const enc = new TextEncoder(); const dec = new TextDecoder(); const kptr = {};
  for (const k of keys) { const b = enc.encode(k + '\0'); const p = mod._malloc(b.length); mod.HEAPU8.set(b, p); kptr[k] = p; }
  const BUF = mod._malloc(4096);
  const vit = { hp: 120, maxhp: 150, mana: 80, maxmana: 100, mp: 90, maxmp: 120, xp: 12345, tp: 5, opponent: 'orc', wimpy: 20 };
  mod._lua_getglobal(L, kptr.hp) // dummy
  mod._lua_settop(L, -2);
  const nameP = mod._malloc(16); mod.HEAPU8.set(enc.encode('onVitals\0'), nameP);
  function pushObj(o) {
    mod._lua_createtable(L, 0, 10);
    for (const k in o) {
      const v = o[k];
      let kp = kptr[k];
      if (typeof v === 'number') mod._lua_pushnumber(L, v);
      else { const { written } = enc.encodeInto(String(v), mod.HEAPU8.subarray(BUF, BUF + 4096)); mod._lua_pushlstring(L, BUF, written); }
      mod._lua_setfield(L, -2, kp);
    }
  }
  function rawVitals(o) { mod._lua_getglobal(L, nameP); pushObj(o); const st = mod._lua_pcallk(L, 1, 1, 0, 0, 0); const r = mod._lua_tonumberx(L, -1, 0); mod._lua_settop(L, -2); return r; }
  console.log('rawVitals ->', rawVitals(vit));
  bench('raw push 10-field table + call', 100000, () => rawVitals(vit));
  // JSON string path: Lua-side would need a json decoder; measure lua string push cost of JSON only
  const js = JSON.stringify(vit);
  bench('encodeInto+pushlstring of 150B JSON (no decode)', 100000, () => { const { written } = enc.encodeInto(js, mod.HEAPU8.subarray(BUF, BUF + 4096)); mod._lua_pushlstring(L, BUF, written); mod._lua_settop(L, -2); });
  // Lua->JS raw cclosure: use addFunction directly
  let sent = 0;
  const sendFn = mod.addFunction((Ls) => { const p = mod._lua_tolstring(Ls, 1, 0); sent++; return 0; }, 'ii');
  mod._lua_pushcclosure(L, sendFn, 0); const sp = mod._malloc(8); mod.HEAPU8.set(enc.encode('rsend\0'), sp); mod._lua_setglobal(L, sp);
  e.doStringSync('function rloop(n) for i=1,n do rsend("kill orc") end end');
  const rl = e.global.get('rloop'); rl(1000); let t = now(); rl(100000); console.log('raw Lua->JS cclosure call (ptr only, no string decode)', ((now() - t) / 100).toFixed(3), 'us/call');
  const sendFn2 = mod.addFunction((Ls) => { const p = mod._lua_tolstring(Ls, 1, 0); const lp = 4000; const p2 = mod._lua_tolstring(Ls, 1, BUF+lp); const n = mod.HEAPU32[(BUF+lp)>>2]; const s = dec.decode(mod.HEAPU8.subarray(p2, p2+n)); sent += s.length; return 0; }, 'ii');
  mod._lua_pushcclosure(L, sendFn2, 0); mod._lua_setglobal(L, sp);
  rl(1000); t = now(); rl(100000); console.log('raw Lua->JS cclosure call + UTF8ToString', ((now() - t) / 100).toFixed(3), 'us/call');
})();
