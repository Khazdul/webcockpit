// What is inside Chromium's longest major GCs? (perf review D)
//   node perf/gc-breakdown.ts <trace.json> [top=4]
// For the longest MajorGC events on the page's main thread: the nested
// events (same thread, inside its time span) by total duration, plus when
// each major GC ran and why (args).

import { readFileSync } from 'node:fs';

const [file, topS] = process.argv.slice(2);
const top = Number(topS ?? 4);
const ev = (JSON.parse(readFileSync(file!, 'utf8')) as { traceEvents: any[] }).traceEvents;
const mains = new Set(ev.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
const count = new Map<string, number>();
for (const e of ev) {
  const k = `${e.pid}:${e.tid}`;
  if (mains.has(k)) count.set(k, (count.get(k) ?? 0) + 1);
}
const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0];
const onMain = ev.filter((e) => `${e.pid}:${e.tid}` === main && e.ph === 'X');
const t0 = onMain.reduce((a, e) => Math.min(a, e.ts), Infinity);
const majors = onMain.filter((e) => e.name === 'MajorGC').sort((a, b) => b.dur - a.dur);
console.log(`major GCs on the main thread: ${majors.length}; durations (ms): ${majors.map((m) => (m.dur / 1000).toFixed(1)).join(', ')}`);
console.log(`at (s): ${[...majors].sort((a, b) => a.ts - b.ts).map((m) => ((m.ts - t0) / 1e6).toFixed(0)).join(', ')}`);
for (const m of majors.slice(0, top)) {
  const inside = onMain.filter((e) => e !== m && e.ts >= m.ts && e.ts + (e.dur ?? 0) <= m.ts + m.dur);
  const by = new Map<string, number>();
  for (const e of inside) by.set(e.name, (by.get(e.name) ?? 0) + (e.dur ?? 0) / 1000);
  const list = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  console.log(`\nMajorGC ${(m.dur / 1000).toFixed(1)} ms at ${((m.ts - t0) / 1e6).toFixed(1)} s, args ${JSON.stringify(m.args).slice(0, 300)}`);
  for (const [k, v] of list) console.log(`   ${v.toFixed(2).padStart(8)} ms  ${k}`);
}
