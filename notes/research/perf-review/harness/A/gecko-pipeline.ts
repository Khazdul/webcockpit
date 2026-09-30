// Follows a refresh tick through WebRender in a Gecko profile: for the tick
// after each `inj:<name>` mark, prints the markers on the parent process's
// WR threads (scene builder, render backend, renderer, compositor) in the
// 60 ms after the tick started, relative to the tick start.
//   node perf/gecko-pipeline.ts <profile.json> [mark=combat] [n=2]
import { readFileSync } from 'node:fs';
const [file, want = 'combat', nStr = '2'] = process.argv.slice(2);
const prof = JSON.parse(readFileSync(file!, 'utf8'));
const threads: Array<{ proc: string; t: any; strings: string[] }> = [];
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
function markers(x: { t: any; strings: string[] }): M[] {
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
// Profile times are relative to each process's start; align with meta.startTime.
const parentStart = prof.meta.startTime as number;
const content = threads.find((x) => x.t.name === 'GeckoMain' && x.proc !== 'parent' && markers(x).some((m) => m.name === 'UserTiming' && String(m.data?.name).startsWith('inj:')))!;
const childMeta = (prof.processes as any[]).find((c) => c.threads?.some((t: any) => t === content.t))?.meta;
const offset = (childMeta?.startTime ?? parentStart) - parentStart; // child time + offset = parent time
const cms = markers(content);
const wr = threads.filter((x) => x.proc === 'parent' && /WRSceneBuilder#|WRRenderBackend#|^Renderer$|^Compositor$|SwComposite|VsyncIOThread|SoftwareVsyncThread/.test(x.t.name));
const marks = cms.filter((m) => m.name === 'UserTiming' && m.data?.name === `inj:${want}`);
for (const mk of marks.slice(0, Number(nStr))) {
  const ticks = cms.filter((m) => m.name === 'RefreshDriverTick' && m.start >= mk.start && m.start < mk.start + 60);
  const tick = ticks.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  if (!tick) continue;
  const t0 = tick.start + offset;
  console.log(`\n--- tick (content) ${(tick.end - tick.start).toFixed(2)} ms; WR threads, ms from tick start:`);
  const rows: string[] = [];
  for (const x of wr) {
    for (const m of markers(x)) {
      if (m.start < t0 || m.start > t0 + 60) continue;
      if (m.end - m.start < 0.05) continue;
      rows.push(`${(m.start - t0).toFixed(2).padStart(7)} +${(m.end - m.start).toFixed(2).padStart(6)} ${x.t.name.padEnd(18)} ${m.name} ${m.data ? JSON.stringify(m.data).replace(/"type":"[^"]*",?/, '').slice(0, 100) : ''}`);
    }
  }
  rows.sort((a, b) => parseFloat(a) - parseFloat(b));
  console.log(rows.slice(0, 40).join('\n'));
}
