// Attribution of Firefox input delay from a Gecko profile written by
// `c-load.ts --gecko 1` (MOZ_PROFILER_STARTUP, 1 ms sampling, markers and
// IPC messages). For each scenario of the raw JSON:
//
//   node perf/c-gecko.ts <profile.json> <load-….json>
//
// - The page's main thread is the GeckoMain thread with the most keydown
//   DOMEvent markers; page time ↔ profile time via the `c-sync` UserTiming
//   marks (one per scenario, in order).
// - For each key: the window [Node press (mapped) + idle floor, first
//   listener] and what ran on the main thread in it (marker overlap by
//   kind), plus the sampled `eventDelay` (Gecko's own responsiveness
//   measure: how long an event posted at that moment would have waited).
// - The Juggler message that carries each key is a JSWindowActor message;
//   with the `ipcmessages` feature its IPC marker gives the time the message
//   reached the content process (I/O thread) and when the main thread ran it.
import { readFileSync } from 'node:fs';
import { f, pct, stats, maxOf } from './lib.ts';

const [profPath, rawPath] = process.argv.slice(2);
if (!profPath || !rawPath) throw new Error('usage: c-gecko.ts <profile.json> <load.json>');
const prof = JSON.parse(readFileSync(profPath, 'utf8'));
const raw = JSON.parse(readFileSync(rawPath, 'utf8')) as Record<string, any>;

type Thread = any;
const threads: { t: Thread; proc: string; startTime: number }[] = [];
const walk = (p: any): void => {
  for (const t of p.threads) threads.push({ t, proc: t.processName ?? '', startTime: p.meta.startTime });
  for (const c of p.processes ?? []) walk(c);
};
walk(prof);

interface Mk {
  name: string;
  s: number;
  e: number;
  data: any;
}

function markers(t: Thread): Mk[] {
  const m = t.markers;
  const sc = m.schema;
  const strs: string[] = t.stringTable ?? t.stringArray;
  const out: Mk[] = [];
  const open = new Map<string, Mk[]>();
  for (const d of m.data) {
    const name = strs[d[sc.name]]!;
    const ph = d[sc.phase];
    const data = d[sc.data];
    if (ph === 0) out.push({ name, s: d[sc.startTime], e: d[sc.startTime], data });
    else if (ph === 1) out.push({ name, s: d[sc.startTime], e: d[sc.endTime], data });
    else if (ph === 2) {
      const k = name + '|' + (data?.eventType ?? '');
      const st = open.get(k) ?? [];
      const mk = { name, s: d[sc.startTime], e: NaN, data };
      st.push(mk);
      open.set(k, st);
      out.push(mk);
    } else if (ph === 3) {
      const k = name + '|' + (data?.eventType ?? '');
      const st = open.get(k);
      const mk = st?.pop();
      if (mk) mk.e = d[sc.endTime] ?? d[sc.startTime];
    }
  }
  return out.filter((x) => Number.isFinite(x.e));
}

// Each scenario ran in its own page (and content process): the page
// threads are the GeckoMain threads with a `c-sync` mark, in time order.
const pages: { t: Thread; mk: Mk[]; proc: string; sync: number; abs: number; sTimes: number[]; sDelay: number[] }[] = [];
for (const { t, proc, startTime } of threads) {
  if (t.name !== 'GeckoMain') continue;
  const mk = markers(t);
  for (const x of mk) {
    if (x.data?.type === 'UserTiming' && x.data?.name === 'c-sync') {
      const smp = t.samples;
      const tIdx = smp.schema.time;
      const dIdx = smp.schema.eventDelay;
      pages.push({
        t,
        mk,
        proc,
        sync: x.s,
        abs: startTime + x.s,
        sTimes: smp.data.map((r: any[]) => r[tIdx]),
        sDelay: smp.data.map((r: any[]) => (dIdx === undefined ? NaN : r[dIdx])),
      });
    }
  }
}
pages.sort((a, b) => a.abs - b.abs);
console.log(`page threads with c-sync: ${pages.map((p) => `${p.proc} pid ${p.t.pid}`).join(', ')}`);

// Marker kinds for attribution, with a priority: the innermost / most
// specific wins when markers nest (a CC slice inside a message event).
// GCMajor and CC (phase 2/3) span a whole incremental collection, idle gaps
// included, so only their slices count.
function kind(m: Mk): [string, number] | null {
  const n = m.name;
  if (n === 'GCSlice') return ['GC major slice', 9];
  if (n === 'GCMinor') return ['GC minor (nursery)', 9];
  if (n === 'CCSlice') return ['CC slice (cycle collector: DOM garbage)', 9];
  if (n === 'ForgetSkippable') return ['CC forget-skippable', 9];
  if (n === 'Styles' || n === 'Reflow (interruptible)' || n === 'Reflow (sync)') return [n === 'Styles' ? 'style' : 'reflow', 7];
  if (n === 'DisplayList' || n === 'WrDisplayList' || n === 'Rasterize' || n === 'ForwardDPTransaction') return ['paint (display list)', 7];
  if (n === 'requestAnimationFrame callbacks') return ['rAF callbacks (output flush, panes, caret)', 6];
  if (n === 'RefreshDriverTick') return ['refresh tick, other', 5];
  if (n === 'setTimeout callback') return ['setTimeout callback', 4];
  if (n === 'DOMEvent') {
    const et = m.data?.eventType;
    if (et === 'keydown' || et === 'keyup' || et === 'keypress' || et === 'input' || et === 'beforeinput') return null;
    return [et === 'message' ? 'message event (replay slice / worker message)' : `DOM event ${et}`, 4];
  }
  if (n === 'Worker.postMessage') return ['Worker.postMessage', 8];
  return null;
}

function classifier(mk: Mk[]): (t: number) => string {
  const B = 5;
  const buckets = new Map<number, { s: number; e: number; k: string; p: number }[]>();
  for (const m of mk) {
    const k = kind(m);
    if (!k) continue;
    const it = { s: m.s, e: m.e, k: k[0], p: k[1] };
    for (let b = Math.floor(m.s / B); b <= Math.floor(m.e / B); b++) {
      const arr = buckets.get(b) ?? [];
      arr.push(it);
      buckets.set(b, arr);
    }
  }
  return (t) => {
    let best: { s: number; e: number; k: string; p: number } | null = null;
    for (const it of buckets.get(Math.floor(t / B)) ?? []) {
      if (it.s <= t && it.e > t && (!best || it.p > best.p || (it.p === best.p && it.e - it.s < best.e - best.s))) best = it;
    }
    return best ? best.k : 'no marker (JS or IPC without a marker, or idle)';
  };
}

const keyScenarios = Object.keys(raw);
const order = keyScenarios.filter((k) => k.startsWith('firefox/'));
// One c-sync per scenario before the keys (plus none for tracing in Firefox).
for (let si = 0; si < order.length; si++) {
  const r = raw[order[si]!];
  const c = r.c;
  const nk = r.nk as { kind: string; nodeT: number }[];
  const off = (r.off.off + r.off2.off) / 2;
  const pg = pages[si];
  if (!pg || r.syncPage === undefined) {
    console.log(`${order[si]}: no page thread / sync`);
    continue;
  }
  const syncProf = pg.sync;
  const mk = pg.mk;
  const sTimes = pg.sTimes;
  const sDelay = pg.sDelay;
  const toProf = (page: number) => syncProf + (page - r.syncPage);
  const toPage = (nodeT: number) => nodeT + off - c.timeOrigin;
  const n = Math.min(c.keys.length, nk.length);
  const delays = [];
  for (let i = 0; i < n; i++) delays.push(c.keys[i].t0 - toPage(nk[i]!.nodeT));
  const floor = pct(delays, 5);
  const cls = classifier(mk);
  const by = new Map<string, { n: number; ms: number }>();
  const ex: string[] = [];
  const ed: number[] = [];
  let delayed = 0;
  for (let i = 0; i < n; i++) {
    const k = c.keys[i];
    const a = toProf(toPage(nk[i]!.nodeT) + floor);
    const b = toProf(k.t0);
    const d = b - a;
    // eventDelay at the press moment (nearest sample).
    let lo = 0;
    let hi = sTimes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sTimes[mid]! < a) lo = mid + 1;
      else hi = mid;
    }
    if (Math.abs(sTimes[lo]! - a) < 2) ed.push(sDelay[lo]!);
    if (d <= 4) continue;
    delayed++;
    const over = new Map<string, number>();
    for (let x = a; x < b; x += 0.1) {
      const kd = cls(x);
      over.set(kd, (over.get(kd) ?? 0) + 0.1);
    }
    for (const [kd, v] of over) {
      const e = by.get(kd) ?? { n: 0, ms: 0 };
      e.n++;
      e.ms += v;
      by.set(kd, e);
    }
    if (ex.length < 8) ex.push(`delay ${f(d, 1)} ms: ${[...over].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([x, v]) => `${x} ${f(v, 1)}`).join(', ') || '—'}`);
  }
  // Responsiveness over the key phase: eventDelay samples between the first and last key.
  const t0 = toProf(c.keys[0]?.t0 ?? 0);
  const t1 = toProf(c.keys[n - 1]?.t0 ?? 0);
  const phase = sDelay.filter((_, i) => sTimes[i]! >= t0 && sTimes[i]! <= t1 && Number.isFinite(sDelay[i]!));
  const es = stats(phase);
  console.log(`\n### ${order[si]}: ${n} keys; floor (p5 of Node→listener) ${f(floor)} ms; keys delayed > 4 ms beyond it: ${delayed}`);
  console.log(`  eventDelay samples over the key phase (1 ms sampling): median ${f(es.median)} / p95 ${f(es.p95)} / p99 ${f(es.p99)} / max ${f(es.max)} ms (n=${es.n}); at the key presses: median ${f(pct(ed, 50))} / p95 ${f(pct(ed, 95))} / max ${f(maxOf(ed))}`);
  console.log('  the wait, by what the main thread was doing (keys touched, ms):');
  for (const [k, v] of [...by].sort((x, y) => y[1].ms - x[1].ms)) console.log(`    ${k}: ${v.n}, ${f(v.ms, 1)} ms`);
  for (const x of ex) console.log(`    e.g. ${x}`);
  // What the main thread spent its time on during the key phase (0.2 ms sampling).
  const whole = new Map<string, number>();
  for (let x = t0; x < t1; x += 0.2) {
    const k = cls(x);
    whole.set(k, (whole.get(k) ?? 0) + 0.2);
  }
  const longest = new Map<string, number>();
  for (const m of mk) {
    if (m.e < t0 || m.s > t1) continue;
    const k = kind(m);
    if (!k) continue;
    longest.set(k[0], Math.max(longest.get(k[0]) ?? 0, m.e - m.s));
  }
  // Top-level tasks (markers not nested in a longer one): an input event
  // with input priority waits for the rest of the running task, so for a
  // key at a random moment the expected wait is Σd²/2T (no queue effects,
  // unlike the Juggler-injected keys, which queue at normal priority).
  const TASK = new Set(['RefreshDriverTick', 'DOMEvent', 'setTimeout callback', 'setInterval callback', 'GCSlice', 'GCMinor', 'CCSlice', 'ForgetSkippable', 'IdleRunnable', 'Worker.postMessage']);
  const cand = mk.filter((m) => TASK.has(m.name) && m.e > t0 && m.s < t1 && m.e - m.s >= 0.05).sort((x, y) => x.s - y.s || y.e - x.e);
  const tops: Mk[] = [];
  let endT = -Infinity;
  for (const m of cand) {
    if (m.s < endT && m.e <= endT) continue; // nested in the current top-level task
    tops.push(m);
    endT = Math.max(endT, m.e);
  }
  const td = tops.map((m) => m.e - m.s);
  const T = t1 - t0;
  const byName = new Map<string, { n: number; ms: number; max: number }>();
  for (const m of tops) {
    const k = m.name === 'DOMEvent' ? `DOMEvent ${m.data?.eventType}` : m.name;
    const e = byName.get(k) ?? { n: 0, ms: 0, max: 0 };
    e.n++;
    e.ms += m.e - m.s;
    e.max = Math.max(e.max, m.e - m.s);
    byName.set(k, e);
  }
  console.log(`  top-level tasks (markers): ${tops.length}, busy ${f((td.reduce((a, b) => a + b, 0) / T) * 100, 1)} %, > 16 ms ${td.filter((d) => d > 16).length}, > 50 ms ${td.filter((d) => d > 50).length}, longest ${f(maxOf(td))} ms; expected wait of an input-priority key at a random moment Σd²/2T ${f(td.reduce((a, d) => a + d * d, 0) / (2 * T))} ms`);
  console.log(`    longest by kind: ${[...byName].sort((x, y) => y[1].max - x[1].max).slice(0, 6).map(([k, v]) => `${k} ×${v.n} max ${f(v.max, 1)}`).join('; ')}`);
  console.log(`  main thread over ${f((t1 - t0) / 1000, 1)} s: ${[...whole].filter(([k]) => !k.startsWith('no marker')).sort((x, y) => y[1] - x[1]).slice(0, 9).map(([k, v]) => `${k} ${f(v, 0)} ms (longest ${f(longest.get(k) ?? 0, 1)})`).join('; ')}`);
}
