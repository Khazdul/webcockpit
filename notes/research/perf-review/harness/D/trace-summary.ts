// Summarises a Chromium DevTools trace (perf review D): GC and rendering
// events on the page's main thread (the CrRendererMain with the most events).
// Used by perf/scrollback-gc.ts; perf/soak.ts has the same code inline.

export type Stat = { n: number; sum: number; p95: number; max: number } | null;

export const TRACE_CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.gc', 'disabled-by-default-v8.gc', 'cppgc', 'blink_gc', 'toplevel'];

export function summarizeTrace(buf: Buffer, name: string): Record<string, unknown> {
  const ev = (JSON.parse(buf.toString()) as { traceEvents: any[] }).traceEvents;
  const mains = new Set(ev.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
  const count = new Map<string, number>();
  for (const e of ev) {
    const k = `${e.pid}:${e.tid}`;
    if (mains.has(k)) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const by = new Map<string, number[]>();
  let t0 = Infinity;
  let t1 = 0;
  for (const e of ev) {
    if (e.ph !== 'X' || `${e.pid}:${e.tid}` !== main) continue;
    t0 = Math.min(t0, e.ts);
    t1 = Math.max(t1, e.ts + (e.dur ?? 0));
    (by.get(e.name) ?? by.set(e.name, []).get(e.name)!).push((e.dur ?? 0) / 1000);
  }
  const st = (n: string): Stat => {
    const v = by.get(n);
    if (!v?.length) return null;
    v.sort((a, b) => a - b);
    return { n: v.length, sum: +v.reduce((a, b) => a + b, 0).toFixed(1), p95: +v[Math.floor(v.length * 0.95)]!.toFixed(2), max: +v[v.length - 1]!.toFixed(2) };
  };
  const tasks = by.get('RunTask') ?? [];
  return {
    name,
    seconds: +((t1 - t0) / 1e6).toFixed(1),
    majorGC: st('MajorGC'),
    finalizeMC: st('V8.GCFinalizeMC'),
    cppAtomicMark: st('CppGC.AtomicMark'),
    incrementalMark: st('V8.GC_MC_INCREMENTAL'),
    minorGC: st('MinorGC'),
    scavenger: st('V8.GCScavenger'),
    sweepStep: st('CppGC.IncrementalSweep'),
    sweepFinalize: st('CppGC.SweepFinalizeSweptPages'),
    style: st('UpdateLayoutTree'),
    layout: st('Layout'),
    paint: st('Paint'),
    prePaint: st('PrePaint'),
    raf: st('FireAnimationFrame'),
    tasks: { n: tasks.length, over16: tasks.filter((d) => d > 16).length, over33: tasks.filter((d) => d > 33).length, over50: tasks.filter((d) => d > 50).length, max: +Math.max(0, ...tasks).toFixed(1) },
  };
}

export function formatTrace(t: any): string {
  const cell = (s: Stat): string => (s ? `${s.n}/${s.p95}/${s.max} Σ${s.sum}` : '—');
  return (
    `${t.name} (${t.seconds} s): MajorGC ${cell(t.majorGC)}; FinalizeMC ${cell(t.finalizeMC)}; CppGC.AtomicMark ${cell(t.cppAtomicMark)}; incr. mark ${cell(t.incrementalMark)}; MinorGC ${cell(t.minorGC)}; sweep step ${cell(t.sweepStep)}; sweep finalize ${cell(t.sweepFinalize)}\n` +
    `   style ${cell(t.style)}; layout ${cell(t.layout)}; prePaint ${cell(t.prePaint)}; paint ${cell(t.paint)}; rAF ${cell(t.raf)}; tasks ${t.tasks.n} (>16 ms ${t.tasks.over16}, >33 ${t.tasks.over33}, >50 ${t.tasks.over50}, max ${t.tasks.max})`
  );
}
