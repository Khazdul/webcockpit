// Dumps the renderer main-thread events of the longest animation-frame task
// in a Chromium trace (nested, with durations and args), for inspection.
//   node perf/trace-dump.ts <trace.json> [minMs=0.05]
import { readFileSync } from 'node:fs';
type Ev = { name: string; cat: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: any };
const ev = (JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { traceEvents: Ev[] }).traceEvents;
const min = Number(process.argv[3] ?? 0.05) * 1000;
const threads = new Map<string, string>();
for (const e of ev) if (e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args?.name);
const mains = [...threads].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k);
const key = mains.find((k) => ev.some((e) => `${e.pid}:${e.tid}` === k && e.name === 'FireAnimationFrame'))!;
const onMain = ev.filter((e) => `${e.pid}:${e.tid}` === key && e.ph === 'X').sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
const raf = onMain.filter((e) => e.name === 'FireAnimationFrame').sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0))[0]!;
const task = onMain
  .filter((e) => e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask')
  .filter((e) => e.ts <= raf.ts && e.ts + (e.dur ?? 0) >= raf.ts + (raf.dur ?? 0))
  .sort((a, b) => (a.dur ?? 0) - (b.dur ?? 0))[0]!;
const t0 = task.ts;
const t1 = task.ts + (task.dur ?? 0);
const stack: Ev[] = [];
for (const e of onMain) {
  if (e.ts < t0 || e.ts > t1) continue;
  if ((e.dur ?? 0) < min) continue;
  while (stack.length && stack[stack.length - 1]!.ts + (stack[stack.length - 1]!.dur ?? 0) <= e.ts) stack.pop();
  const a = e.args?.data ?? e.args ?? {};
  const s = JSON.stringify(a).slice(0, 140);
  console.log(`${' '.repeat(stack.length * 2)}${((e.ts - t0) / 1000).toFixed(2).padStart(7)} +${((e.dur ?? 0) / 1000).toFixed(2).padStart(6)} ${e.name} ${s === '{}' ? '' : s}`);
  stack.push(e);
}
