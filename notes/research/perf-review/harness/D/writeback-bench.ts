// Node timing of the profile write-back's synchronous work on the bundled
// khazdul profile (perf review D): parseProfile + setVariable + serialize,
// the main-thread part of every ProfileWriteBack flush (src/app/writeback.ts).
//
//   node perf/writeback-bench.ts

import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
      throw err;
    }
  },
});

const { parseProfile, serialize, setVariable } = await import('../src/script/doc/index');
const text = readFileSync(new URL('../src/profiles/khazdul.tin', import.meta.url), 'utf8');
const times: number[] = [];
for (let i = 0; i < 300; i++) {
  const t0 = performance.now();
  let doc = parseProfile(text);
  doc = setVariable(doc, 'target', `orc${i}`);
  const out = serialize(doc);
  times.push(performance.now() - t0);
  if (out.length < 10) throw new Error('bad');
}
const s = times.slice(50).sort((a, b) => a - b);
console.log(`khazdul ${text.length} chars: parse+set+serialize median ${s[Math.floor(s.length / 2)]!.toFixed(3)} ms, p95 ${s[Math.floor(s.length * 0.95)]!.toFixed(3)} ms, first ${times[0]!.toFixed(2)} ms`);
// UI ring JSON (1000 messages)
const msgs = Array.from({ length: 1000 }, (_, i) => ({ kind: 'state', tag: 'SPELL', parts: [{ value: `spell ${i}` }, ' up.'] }));
const j: number[] = [];
for (let i = 0; i < 200; i++) {
  const t0 = performance.now();
  JSON.stringify(msgs);
  j.push(performance.now() - t0);
}
j.sort((a, b) => a - b);
console.log(`UI ring JSON.stringify(1000): median ${j[100]!.toFixed(3)} ms, ${JSON.stringify(msgs).length} chars`);
