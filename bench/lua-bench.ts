// Lua runtime benchmark (ADR 0051 "Host bridge on the raw C API").
//
//   node bench/lua-bench.ts
//
// Times the bridge in src/lua on the paths user scripts will use, each
// with the count hook armed as in the app:
//   - a trigger callback: an 80-character line and 2 captures, the
//     Mudlet-style `matches` table built in Lua;
//   - a GMCP handler: a 10-field Char.Vitals object pushed as a table;
//   - Lua → JS: `send("kill orc")` from a Lua loop (cost per send);
//   - a runaway `while true do end` until the budget aborts it.
// ADR 0051 expects about 1–2 µs for the first two and well under 1 µs
// for the third.

import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
        try {
          return next(specifier + '.ts', context);
        } catch {
          return next(specifier + '/index.ts', context);
        }
      }
      throw err;
    }
  },
});

const { loadLuaRuntime } = await import('../src/lua');
type LuaRef = import('../src/lua').LuaRef;

const t0 = performance.now();
const rt = await loadLuaRuntime();
const startMs = performance.now() - t0;

const refs: LuaRef[] = [];
let sent = 0;
rt.defineFunction('register', (a) => {
  refs.push(a.function(1));
});
rt.defineFunction('send', (a) => {
  if (a.string(1).length > 0) sent++;
});

const r = rt.loadScript(
  'bench',
  `
  local hits = 0
  register(function(line, a, b)
    local matches = { line, a, b }
    if matches[2] == "Gandalf" then hits = hits + 1 end
    return hits
  end)
  register(function(v) return v.hp + v.mana end)
  register(function(n) for i = 1, n do send("kill orc") end end)
  register(function() while true do end end)
`,
);
if (!r.ok) throw new Error(r.message);
const script = r.script;
const [onLine, onVitals, sendLoop, spin] = refs as [LuaRef, LuaRef, LuaRef, LuaRef];

/** Median µs per call of `fn` over 5 rounds of `n` calls. */
function time(n: number, fn: () => void): number {
  for (let i = 0; i < Math.min(n, 5000); i++) fn();
  const rounds: number[] = [];
  for (let k = 0; k < 5; k++) {
    const t = performance.now();
    for (let i = 0; i < n; i++) fn();
    rounds.push(((performance.now() - t) / n) * 1000);
  }
  return rounds.sort((a, b) => a - b)[2]!;
}

const line = "Gandalf tells you 'Hello there, are you coming to the meeting at Bree?' (xx)".padEnd(80, '.');
const vitals = { hp: 120, maxhp: 150, mana: 80, maxmana: 100, mp: 90, maxmp: 120, xp: 12345, tp: 5, opponent: 'orc', wimpy: 20 };

const lineUs = time(100_000, () => {
  script.call(onLine, line, 'Gandalf', 'Hello there');
});
const vitalsUs = time(100_000, () => {
  script.call(onVitals, vitals);
});
const LOOP = 100_000;
const loopUs = time(5, () => {
  script.call(sendLoop, LOOP);
});
const sendUs = loopUs / LOOP;
const ts = performance.now();
const abort = script.call(spin);
const abortMs = performance.now() - ts;

const top = rt.stats().top;
console.log('lua-bench: wasmoon 1.16.0, raw C API bridge, count hook armed');
console.log(`  engine start (factory + engine + sandbox): ${startMs.toFixed(1)} ms`);
console.log(`  trigger call, 80-char line + 2 captures: ${lineUs.toFixed(2)} µs`);
console.log(`  GMCP call, 10-field table: ${vitalsUs.toFixed(2)} µs`);
console.log(`  Lua → JS send(str): ${sendUs.toFixed(3)} µs per send`);
console.log(`  runaway loop aborted after ${abortMs.toFixed(1)} ms (${abort.ok ? 'not aborted!' : abort.kind})`);
console.log(`  heap ${(rt.stats().memoryUsed / 1024).toFixed(0)} KB, stack top ${top}, ${sent} sends`);
rt.close();
