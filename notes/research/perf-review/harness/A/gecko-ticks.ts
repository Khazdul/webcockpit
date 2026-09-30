// Refresh-driver tick cadence in a Gecko profile's content process: how
// often does Firefox tick while the page is idle (between injections)?
//   node perf/gecko-ticks.ts <profile.json>
import { readFileSync } from 'node:fs';
const prof = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const threads: Array<{ proc: string; t: any; s: string[] }> = [];
const collect = (p: any, proc: string) => {
  for (const t of p.threads ?? []) threads.push({ proc, t, s: Array.isArray(t.stringTable) ? t.stringTable : [] });
  for (const c of p.processes ?? []) collect(c, 'child');
};
collect(prof, 'parent');
for (const x of threads.filter((y) => y.t.name === 'GeckoMain' && y.proc === 'child')) {
  const m = x.t.markers;
  const s = m.schema;
  const ticks: number[] = [];
  const marks: number[] = [];
  const paints: number[] = [];
  for (const row of m.data) {
    const name = x.s[row[s.name]];
    if (name === 'RefreshDriverTick' && (row[s.phase] === 1 || row[s.phase] === 2)) ticks.push(row[s.startTime]);
    if (name === 'UserTiming') marks.push(row[s.startTime]);
    if (name === 'DisplayList' && (row[s.phase] === 1 || row[s.phase] === 2)) paints.push(row[s.startTime]);
  }
  if (!marks.length) continue;
  ticks.sort((a, b) => a - b);
  let idleTicks = 0;
  let idlePaints = 0;
  for (const mk of marks) {
    idleTicks += ticks.filter((t) => t > mk + 60 && t < mk + 110).length;
    idlePaints += paints.filter((t) => t > mk + 60 && t < mk + 110).length;
  }
  console.log(`ticks ${ticks.length} over ${(ticks.at(-1)! - ticks[0]!).toFixed(0)} ms; ${marks.length} marks; in the 50 ms idle window after each mark: ${(idleTicks / marks.length).toFixed(2)} ticks, ${(idlePaints / marks.length).toFixed(2)} paints`);
  const gaps = ticks.slice(1).map((t, i) => t - ticks[i]!);
  const hist: Record<string, number> = {};
  for (const g of gaps) {
    const b = g < 20 ? '<20' : g < 40 ? '20-40' : g < 100 ? '40-100' : g < 300 ? '100-300' : '300+';
    hist[b] = (hist[b] ?? 0) + 1;
  }
  console.log('tick gap histogram (ms):', JSON.stringify(hist));
}
