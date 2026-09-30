// Lists markers of the content main thread in a Gecko profile around the
// frames after `inj:<name>` marks (names, durations, data), to see what a
// refresh tick is made of.
//   node perf/gecko-markers.ts <profile.json> [mark=combat] [n=2] [minMs=0.05]
import { readFileSync } from 'node:fs';
const [file, want = 'combat', nStr = '2', minStr = '0.05'] = process.argv.slice(2);
const prof = JSON.parse(readFileSync(file!, 'utf8'));
type T = any;
const threads: Array<{ proc: string; t: T; strings: string[] }> = [];
const collect = (p: any, proc: string) => {
  for (const t of p.threads ?? []) threads.push({ proc, t, strings: Array.isArray(t.stringTable) ? t.stringTable : (t.stringArray ?? []) });
  for (const c of p.processes ?? []) collect(c, `child:${c.threads?.[0]?.pid}`);
};
collect(prof, 'parent');
interface M {
  name: string;
  start: number;
  end: number;
  data: any;
}
function markers(x: { t: T; strings: string[] }): M[] {
  const m = x.t.markers;
  const s = m.schema;
  const out: M[] = [];
  const open = new Map<string, Array<{ start: number; data: any }>>();
  for (const row of m.data) {
    const name = x.strings[row[s.name]]!;
    const ph = row[s.phase];
    const data = row[s.data];
    if (ph === 0) out.push({ name, start: row[s.startTime], end: row[s.startTime], data });
    else if (ph === 1) out.push({ name, start: row[s.startTime], end: row[s.endTime], data });
    else if (ph === 2) (open.get(name) ?? open.set(name, []).get(name)!).push({ start: row[s.startTime], data });
    else if (ph === 3) {
      const o = open.get(name)?.pop();
      if (o) out.push({ name, start: o.start, end: row[s.endTime], data: o.data ?? data });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
const content = threads.find((x) => x.t.name === 'GeckoMain' && x.proc !== 'parent' && markers(x).some((m) => m.name === 'UserTiming' && String(m.data?.name).startsWith('inj:')))!;
const ms = markers(content);
const marks = ms.filter((m) => m.name === 'UserTiming' && m.data?.name === `inj:${want}`);
const min = Number(minStr);
for (const mk of marks.slice(0, Number(nStr))) {
  const ticks = ms.filter((m) => m.name === 'RefreshDriverTick' && m.start >= mk.start && m.start < mk.start + 60);
  const tick = ticks.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  if (!tick) continue;
  console.log(`\n--- tick after inj:${want} at ${tick.start.toFixed(1)}: ${(tick.end - tick.start).toFixed(2)} ms`);
  for (const m of ms) {
    if (m.start < tick.start - 0.01 || m.end > tick.end + 0.01) continue;
    const d = m.end - m.start;
    if (d < min && m.name !== 'UserTiming') continue;
    const data = m.data ? JSON.stringify(m.data).replace(/"type":"[^"]*",?/, '').slice(0, 160) : '';
    console.log(`${(m.start - tick.start).toFixed(2).padStart(7)} +${d.toFixed(2).padStart(6)} ${m.name} ${data}`);
  }
}
