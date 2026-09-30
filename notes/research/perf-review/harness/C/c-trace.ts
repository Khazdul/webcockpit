// Offline attribution of Chromium input delay from a trace saved by
// `c-load.ts --trace 1` and that run's raw JSON.
//
//   node perf/c-trace.ts <trace-chromium-<scen>-<tag>.json> <load-<tag>-….json> <scenario>
//
// - Main thread: the CrRendererMain thread with the most keydown
//   EventDispatch events. Top-level tasks: ThreadControllerImpl::RunTask
//   not nested in another task.
// - Page clock ↔ trace clock: the i-th keydown EventDispatch start vs the
//   i-th key's first-listener time (median offset).
// - Each key's wait [event.timeStamp, first listener] is sampled every
//   0.1 ms and each sample is classified by the innermost known event
//   covering it (GC > style/layout > paint/prepaint/layerize/commit >
//   script > other work in a task > idle / IPC).
import { readFileSync } from 'node:fs';
import { f, pct } from './lib.ts';

const [tracePath, rawPath, scen] = process.argv.slice(2);
if (!tracePath || !rawPath || !scen) throw new Error('usage: c-trace.ts <trace.json> <load.json> <scenario>');
type Ev = { name: string; cat: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: any };
const all = (JSON.parse(readFileSync(tracePath, 'utf8')) as { traceEvents: Ev[] }).traceEvents;
const raw = JSON.parse(readFileSync(rawPath, 'utf8'))[`chromium/${scen}`];
const keys = raw.c.keys as { ts: number; t0: number; key: string; send: number }[];

const mains = new Set(all.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
const kd = new Map<string, Ev[]>();
for (const e of all) {
  if (e.name === 'EventDispatch' && e.args?.data?.type === 'keydown' && mains.has(`${e.pid}:${e.tid}`)) {
    const k = `${e.pid}:${e.tid}`;
    kd.set(k, [...(kd.get(k) ?? []), e]);
  }
}
const [main, kdEvents] = [...kd].sort((a, b) => b[1].length - a[1].length)[0]!;
kdEvents.sort((a, b) => a.ts - b.ts);
const ev = all.filter((e) => `${e.pid}:${e.tid}` === main && e.ph === 'X' && e.dur !== undefined).sort((a, b) => a.ts - b.ts);
// Offset: trace µs = page ms * 1000 + off. keydown EventDispatch starts ~at the first listener.
const n = Math.min(kdEvents.length, keys.length);
const offs: number[] = [];
for (let i = 0; i < n; i++) offs.push(kdEvents[i]!.ts - keys[i]!.t0 * 1000);
const off = pct(offs, 50);
const spread = pct(offs.map((o) => Math.abs(o - off)), 90);
console.log(`${scen}: main ${main}, ${kdEvents.length} keydown dispatches for ${keys.length} keys; clock offset spread p90 ${f(spread / 1000, 3)} ms`);

// Top-level tasks.
const runs = ev.filter((e) => e.name === 'ThreadControllerImpl::RunTask');
const top: Ev[] = [];
let end = -1;
for (const t of runs) {
  if (t.ts >= end) {
    top.push(t);
    end = t.ts + t.dur!;
  }
}
const span = top.length ? top.at(-1)!.ts + top.at(-1)!.dur! - top[0]!.ts : 1;
const durs = top.map((t) => t.dur! / 1000);
const busy = durs.reduce((a, b) => a + b, 0);
console.log(`  top-level tasks ${top.length} over ${f(span / 1e6, 1)} s: busy ${f((busy / (span / 1000)) * 100, 1)} %; > 16 ms ${durs.filter((d) => d > 16).length}, > 50 ms ${durs.filter((d) => d > 50).length}, longest ${f(Math.max(0, ...durs.slice().sort((a, b) => b - a).slice(0, 1)))} ms; expected wait of a key at a random moment Σd²/2T ${f(durs.reduce((a, d) => a + d * d, 0) / (2 * (span / 1000)))} ms`);

// Category intervals.
function cat(e: Ev): [string, number] | null {
  const nm = e.name;
  if (nm === 'MajorGC' || nm === 'MinorGC' || nm.startsWith('V8.GC') || nm === 'BlinkGC.AtomicPhase' || nm.startsWith('BlinkGC') || nm === 'ThreadState::performIdleLazySweep') return ['GC', 6];
  if (nm === 'UpdateLayoutTree' || nm === 'RecalculateStyles') return ['style', 5];
  if (nm === 'Layout') return ['layout', 5];
  if (nm === 'Paint' || nm === 'PaintImage' || nm === 'PrePaint' || nm === 'Layerize' || nm === 'Commit' || nm === 'UpdateLayer' || nm === 'CompositeLayers' || nm === 'LayerTreeHost::UpdateLayers') return ['paint/prepaint/layerize/commit', 4];
  if (nm === 'HitTest') return ['hit test (mouse boundary events)', 4];
  if (nm === 'FunctionCall' || nm === 'EvaluateScript' || nm === 'v8.run' || nm === 'v8.callFunction' || nm === 'RunMicrotasks' || nm === 'V8.Execute') return ['script', 3];
  if (nm === 'FireAnimationFrame' || nm === 'TimerFire' || nm === 'EventDispatch') return ['script', 2];
  if (nm === 'ThreadControllerImpl::RunTask') return ['other work in a task', 1];
  return null;
}
const cats: { s: number; e: number; c: string; p: number; name: string; fn?: string }[] = [];
for (const e of ev) {
  const c = cat(e);
  if (!c) continue;
  cats.push({ s: e.ts, e: e.ts + e.dur!, c: c[0], p: c[1], name: e.name, fn: e.name === 'FunctionCall' ? `${e.args?.data?.functionName || '?'}@${String(e.args?.data?.url || '').split('/').pop()}` : undefined });
}
// For fast lookup, bucket by 5 ms.
const B = 5000;
const buckets = new Map<number, typeof cats>();
for (const c of cats) {
  for (let b = Math.floor(c.s / B); b <= Math.floor(c.e / B); b++) {
    const arr = buckets.get(b) ?? [];
    arr.push(c);
    buckets.set(b, arr);
  }
}
function classify(t: number): { c: string; fn: string } {
  const arr = buckets.get(Math.floor(t / B)) ?? [];
  let best: (typeof cats)[number] | null = null;
  let fn = '';
  for (const c of arr) {
    if (c.s <= t && c.e > t) {
      if (!best || c.p > best.p || (c.p === best.p && c.e - c.s < best.e - best.s)) best = c;
      if (c.fn && (!fn || c.name === 'FunctionCall')) fn = c.fn;
    }
  }
  return { c: best ? best.c : 'idle / IPC / not on the main thread', fn };
}
const total = new Map<string, number>();
const fns = new Map<string, number>();
let delayed = 0;
let waitAll = 0;
for (let i = 0; i < keys.length; i++) {
  const k = keys[i]!;
  const a = k.ts * 1000 + off;
  const b = k.t0 * 1000 + off;
  const w = (b - a) / 1000;
  if (w <= 4) continue;
  delayed++;
  waitAll += w;
  for (let t = a; t < b; t += 100) {
    const r = classify(t);
    total.set(r.c, (total.get(r.c) ?? 0) + 0.1);
    if (r.fn && (r.c === 'script' || r.c === 'GC' || r.c === 'layout' || r.c === 'style')) fns.set(`${r.c} in ${r.fn}`, (fns.get(`${r.c} in ${r.fn}`) ?? 0) + 0.1);
  }
}
console.log(`  keys waiting > 4 ms: ${delayed} of ${keys.length}, ${f(waitAll, 1)} ms in all; the wait by what the main thread was doing:`);
for (const [c, ms] of [...total].sort((a, b) => b[1] - a[1])) console.log(`    ${c}: ${f(ms, 1)} ms (${f((ms / waitAll) * 100, 0)} %)`);
console.log(`  by function (script/GC/style/layout samples): ${[...fns].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${f(v, 1)}`).join('; ')}`);
// Whole-scenario main-thread breakdown.
const whole = new Map<string, number>();
for (const t of top) {
  for (let x = t.ts; x < t.ts + t.dur!; x += 100) {
    const r = classify(x);
    whole.set(r.c, (whole.get(r.c) ?? 0) + 0.1);
  }
}
console.log(`  main-thread time over the scenario: ${[...whole].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f(v, 0)} ms`).join('; ')}`);
