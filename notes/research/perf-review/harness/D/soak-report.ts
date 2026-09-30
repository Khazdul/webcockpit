// Summarises a soak result (perf/soak.ts output).
//
//   node perf/soak-report.ts <soak.json> [more.json …]
//
// Prints per checkpoint: memory, DOM, IndexedDB and the probe numbers; per
// loop: the in-play flush / frame / key → send / rAF-gap stats, layout and
// style time (Chromium), and GC pauses (Chromium --trace-gc on the page's
// main isolate; Firefox JS_GC_PROFILE on the page's content process).

import { readFileSync } from 'node:fs';

type J = any;

const f1 = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(1));
const f2 = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(2));
const f3 = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(3));
const med = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const pct = (xs: number[], p: number): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

for (const file of process.argv.slice(2)) {
  const r: J = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`\n=== ${file}\n${r.browser} ${r.version}, speed ${r.speed}×, loops ${r.loops}, map ${r.noMap ? 'off' : 'on'}, run ${(r.runMs / 60000).toFixed(1)} min`);
  const lines = r.loopInfo.map((l: J) => l.lines);
  console.log(`lines per loop: ${lines.join(', ')} (total ${sum(lines)})`);

  // ------------------------------------------------------------ checkpoints
  console.log('\nCheckpoints (after drain; Chromium: after forced GC)');
  console.log(
    'name          rows   nodes  listeners heapMB  rssRend/ContentMB  idbMB  chunks comm  runEv | std flush med/p95  frame med/p95  paint med/p95 | rgb flush/frame | burst ms gapMax flushMax | key med/p99/max | idle gapMax >34',
  );
  for (const c of r.checkpoints) {
    const p = c.probe;
    const rssMain = r.browser === 'chromium' ? c.rss.renderer : c.rss.content;
    console.log(
      [
        c.name.padEnd(12),
        String(c.pre.rows).padStart(6),
        String(c.dom?.nodes ?? c.pre.elements).padStart(7),
        String(c.dom?.jsEventListeners ?? '—').padStart(9),
        (c.heap ? f1(c.heap.usedSize / 1e6) : '—').padStart(6),
        f1(rssMain / 1024).padStart(8),
        f2(c.idb.usage / 1e6).padStart(7),
        String(c.idb.counts.runChunks ?? '—').padStart(6),
        String(c.idb.counts.comm ?? '—').padStart(5),
        String(c.idb.counts.runEvents ?? '—').padStart(6),
        '|',
        `${f2(p.std.script.med)}/${f2(p.std.script.p95)}`.padStart(11),
        `${f2(p.std.frame.med)}/${f2(p.std.frame.p95)}`.padStart(13),
        `${f1(p.std.toPaint.med)}/${f1(p.std.toPaint.p95)}`.padStart(12),
        '|',
        `${f1(p.rgb.script.med)}/${f1(p.rgb.frame.med)}`.padStart(11),
        '|',
        `${f1(p.burst.ms)} ${f1(p.burst.gapMax)} ${f1(p.burst.script?.max)}`.padStart(16),
        '|',
        `${f3(p.key.med)}/${f3(p.key.p99)}/${f3(p.key.max)}`.padStart(18),
        '|',
        `${f1(p.idle.max)} ${p.idle.over34}`,
      ].join(' '),
    );
  }

  // Lines delivered at each checkpoint (from the sample just before it) and
  // growth per 10 000 lines between the first full checkpoint and the last.
  {
    const cps = r.checkpoints;
    const at = (c: J): number => c.pre.delivered;
    const first = cps.find((c: J) => c.name.startsWith('cp1'));
    const last = cps[cps.length - 1];
    if (first && last && first !== last && first.heap) {
      const dl = at(last) - at(first);
      console.log(
        `growth cp1 → ${last.name} over ${dl} frames: heap ${f2((last.heap.usedSize - first.heap.usedSize) / 1e6)} MB, nodes ${last.dom.nodes - first.dom.nodes}, listeners ${last.dom.jsEventListeners - first.dom.jsEventListeners}, history ${last.pre.history - first.pre.history}, renderer RSS ${f1((last.rss.renderer - first.rss.renderer) / 1024)} MB`,
      );
    }
  }

  // Chromium memory-infra (after GC) and Firefox about:memory, per checkpoint.
  for (const c of r.checkpoints) {
    for (const [label, m] of [['before GC', c.memBeforeGc], ['after GC', c.mem]] as const) {
      if (!m?.processes) continue;
      for (const [pname, p] of Object.entries<any>(m.processes)) {
        if (!/Renderer/i.test(pname)) continue;
        const a = p.allocators;
        const top = ['blink_gc', 'partition_alloc', 'v8', 'malloc', 'cc', 'font_caches', 'skia', 'discardable', 'web_cache', 'gpu', 'blink_objects', 'shared_memory']
          .filter((k) => a[k] !== undefined)
          .map((k) => `${k} ${f1(a[k] / 1e6)}`)
          .join(', ');
        console.log(`  ${c.name} ${label} ${pname}: resident ${f1((p.resident ?? NaN) / 1e6)} MB; ${top}`);
      }
    }
  }

  // ------------------------------------------------------------ per loop
  console.log('\nIn play, per loop (samples every ~20 s):');
  const byLoop = new Map<string, J[]>();
  for (const s of r.samples) {
    if (!String(s.tag).startsWith('play')) continue;
    (byLoop.get(s.tag) ?? byLoop.set(s.tag, []).get(s.tag)!).push(s);
  }
  // CDP cumulative metrics: deltas between consecutive samples of a loop.
  for (const [tag, ss] of byLoop) {
    const fl = ss.filter((s) => s.flush);
    const flushMed = med(fl.map((s) => s.flush.med));
    const flushP95 = med(fl.map((s) => s.flush.p95));
    const flushMax = Math.max(...fl.map((s) => s.flush.max));
    const frameMed = med(fl.map((s) => s.frame.med));
    const frameP95 = med(fl.map((s) => s.frame.p95));
    const frameMax = Math.max(...fl.map((s) => s.frame.max));
    const ks = ss.filter((s) => s.key);
    const keyMed = med(ks.map((s) => s.key.med));
    const keyP99 = med(ks.map((s) => s.key.p99));
    const keyMax = Math.max(...ks.map((s) => s.key.max));
    const over34 = sum(ss.map((s) => s.gaps.over34));
    const over50 = sum(ss.map((s) => s.gaps.over50));
    const gapMax = Math.max(...ss.map((s) => s.gaps.max));
    const nFrames = sum(ss.map((s) => s.gaps.n));
    let layout = '';
    if (ss[0].cdp) {
      const first = ss[0].cdp;
      const last = ss[ss.length - 1].cdp;
      const wall = ss[ss.length - 1].tS - ss[0].tS;
      const d = (k: string): number => last[k] - first[k];
      layout = `; per wall-min: layout ${f1((d('LayoutDuration') * 1000 * 60) / wall)} ms (${f1((d('LayoutCount') * 60) / wall)}×), style ${f1((d('RecalcStyleDuration') * 1000 * 60) / wall)} ms, script ${f1((d('ScriptDuration') * 1000 * 60) / wall)} ms, task ${f1((d('TaskDuration') * 1000 * 60) / wall)} ms; heap used ${f1(first.JSHeapUsedSize / 1e6)}→${f1(last.JSHeapUsedSize / 1e6)} MB, nodes ${first.Nodes}→${last.Nodes}, listeners ${first.JSEventListeners}→${last.JSEventListeners}`;
    }
    const rssK = r.browser === 'chromium' ? 'renderer' : 'content';
    console.log(
      `${tag}: ${ss.length} samples; flush med ${f2(flushMed)} p95 ${f2(flushP95)} max ${f1(flushMax)}; frame med ${f2(frameMed)} p95 ${f2(frameP95)} max ${f1(frameMax)}; key med ${f3(keyMed)} p99 ${f3(keyP99)} max ${f2(keyMax)} (${sum(ks.map((s) => s.key.n))} typed); rAF gaps >34 ms ${over34}, >50 ms ${over50} of ${nFrames}, max ${f1(gapMax)}; rss ${f1(ss[0].rss[rssK] / 1024)}→${f1(ss[ss.length - 1].rss[rssK] / 1024)} MB; history ${ss[ss.length - 1].history}${layout}`,
    );
    // IndexedDB transactions / Web Storage writes during the loop (instrumented runs)
    if (ss[0].inst && ss[ss.length - 1].inst) {
      const a = ss[0].inst.io;
      const b = ss[ss.length - 1].inst.io;
      const wall = ss[ss.length - 1].tS - ss[0].tS;
      const d: string[] = [];
      for (const k of Object.keys(b.idbTx)) if (k.startsWith('readwrite')) d.push(`${k} ${((b.idbTx[k] - (a.idbTx[k] ?? 0)) * 60 / wall).toFixed(1)}/min`);
      for (const k of Object.keys(b.storage)) d.push(`${k} ${((b.storage[k] - (a.storage[k] ?? 0)) * 60 / wall).toFixed(1)}/min`);
      console.log(`   writes: ${d.join(', ')}; storage bytes ${(((b.storageBytes - a.storageBytes) / 1e6) * 60 / wall).toFixed(2)} MB/min; live timers ${ss[ss.length - 1].inst.counts.timeouts}, intervals ${ss[ss.length - 1].inst.counts.intervals}, listeners ${JSON.stringify(ss[ss.length - 1].inst.counts.listeners)}`);
    }
    // first vs last third of the loop
    const third = Math.max(1, Math.floor(fl.length / 3));
    const a = fl.slice(0, third);
    const b = fl.slice(-third);
    console.log(
      `   first third vs last third: flush p95 ${f2(med(a.map((s) => s.flush.p95)))} → ${f2(med(b.map((s) => s.flush.p95)))}, frame p95 ${f2(med(a.map((s) => s.frame.p95)))} → ${f2(med(b.map((s) => s.frame.p95)))}, frame med ${f2(med(a.map((s) => s.frame.med)))} → ${f2(med(b.map((s) => s.frame.med)))}`,
    );
  }

  // ------------------------------------------------------------ traces
  if (r.traces?.length) {
    console.log('\nTrace windows (Chromium, page main thread; n / p95 / max ms, sum ms):');
    const cell = (s: J): string => (s ? `${s.n}/${s.p95}/${s.max} Σ${s.sum}` : '—');
    for (const t of r.traces) {
      console.log(
        `${t.name} (${t.seconds} s): MajorGC ${cell(t.majorGC)}; FinalizeMC ${cell(t.finalizeMC)}; CppGC.AtomicMark ${cell(t.cppAtomicMark)}; incr. mark ${cell(t.incrementalMark)}; MinorGC ${cell(t.minorGC)}; sweep step ${cell(t.sweepStep)}; sweep finalize ${cell(t.sweepFinalize)}`,
      );
      console.log(
        `   style ${cell(t.style)}; layout ${cell(t.layout)}; prePaint ${cell(t.prePaint)}; paint ${cell(t.paint)}; rAF ${cell(t.raf)}; tasks ${t.tasks.n} (>16 ms ${t.tasks.over16}, >33 ${t.tasks.over33}, >50 ${t.tasks.over50}, max ${t.tasks.max})`,
      );
    }
  }

  // ------------------------------------------------------------ GC
  console.log('\nGC pauses by phase (--trace-gc / JS_GC_PROFILE):');
  if (r.browser === 'chromium') {
    // Main isolate = the one with the most lines in play phases.
    const iso = new Map<string, number>();
    for (const g of r.gcLines) {
      const m = /^\[(\d+):(0x[0-9a-f]+)\]/.exec(g.line);
      if (m) iso.set(m[2]!, (iso.get(m[2]!) ?? 0) + 1);
    }
    // The page isolate is the one the checkpoints' forced GCs ran on (the map
    // worker's isolate has as many or more scavenges).
    const forced = r.gcLines.find((g: J) => /low memory notification|heap profiler/.test(g.line));
    const main = (forced ? /^\[\d+:(0x[0-9a-f]+)\]/.exec(forced.line)?.[1] : undefined) ?? [...iso.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const phases = new Map<string, { minor: number[]; major: number[]; majorInc: number[]; forced: number[] }>();
    for (const g of r.gcLines) {
      if (!g.line.includes(main)) continue;
      const m = /ms: (Scavenge|Minor Mark-Sweep|Mark-Compact|Mark-Sweep)[^,]*?[\d.]+ \([\d.]+\) -> [\d.]+ \([\d.]+\) MB,(?: pooled: [\d.]+ MB,)? ([\d.]+) \/ ([\d.]+) ms(?:\s+\(\+ ([\d.]+) ms in \d+ steps)?/.exec(g.line);
      if (!m) continue;
      const ph = phases.get(g.phase) ?? phases.set(g.phase, { minor: [], major: [], majorInc: [], forced: [] }).get(g.phase)!;
      const pause = Number(m[2]);
      if (/low memory notification/.test(g.line)) ph.forced.push(pause);
      else if (m[1] === 'Scavenge' || m[1] === 'Minor Mark-Sweep') ph.minor.push(pause);
      else {
        ph.major.push(pause);
        ph.majorInc.push(Number(m[4] ?? 0));
      }
    }
    console.log(`(main isolate ${main})`);
    for (const [ph, v] of phases) {
      console.log(
        `${ph.padEnd(18)} minor ${v.minor.length} (med ${f2(med(v.minor))}, p95 ${f2(pct(v.minor, 0.95))}, max ${f2(Math.max(...v.minor, 0))}, >4 ms ${v.minor.filter((x) => x > 4).length}, >8 ms ${v.minor.filter((x) => x > 8).length}, >16 ms ${v.minor.filter((x) => x > 16).length}, sum ${f1(sum(v.minor))} ms); major ${v.major.length} (atomic pause med ${f2(med(v.major))}, max ${f2(Math.max(...v.major, 0))} ms; incremental ${f1(sum(v.majorInc))} ms); forced ${v.forced.length} (max ${f1(Math.max(...v.forced, 0))} ms)`,
      );
    }
  } else {
    // Content process = the PID with the most MajorGC lines besides the parent.
    const pids = new Map<string, number>();
    for (const g of r.gcLines) {
      const f = g.line.split(/\s+/);
      if (/^\d+$/.test(f[1])) pids.set(f[1], (pids.get(f[1]) ?? 0) + 1);
    }
    const ranked = [...pids.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`(pids by lines: ${ranked.map(([p, n]) => `${p}:${n}`).join(' ')})`);
    const pid = ranked[0]?.[0];
    const phases = new Map<string, { slices: number[]; minor: number[]; reasons: Map<string, number> }>();
    for (const g of r.gcLines) {
      const f = g.line.trim().split(/\s+/);
      if (f[1] !== pid) continue;
      const ph = phases.get(g.phase) ?? phases.set(g.phase, { slices: [], minor: [], reasons: new Map() }).get(g.phase)!;
      if (f[0] === 'MajorGC:') {
        // Columns: PID Runtime Timestamp Reason States [FSNR] SizeKB MllcKB Zs Cs Rs Budget total …
        const i = f.indexOf('->');
        // after "a -> b" there may be an FSNR flag; find Budget as the 6th number after SizeKB
        let j = i + 2;
        if (!/^\d/.test(f[j]!)) j++;
        const total = Number(f[j + 6]);
        ph.slices.push(total);
        ph.reasons.set(f[4]!, (ph.reasons.get(f[4]!) ?? 0) + 1);
      } else if (f[0] === 'MinorGC:') {
        const total = Number(f[9]);
        ph.minor.push(total / 1000);
      }
    }
    for (const [ph, v] of phases) {
      console.log(
        `${ph.padEnd(18)} major slices ${v.slices.length} (med ${f2(med(v.slices))}, p95 ${f2(pct(v.slices, 0.95))}, max ${f2(Math.max(...v.slices, 0))}, sum ${f1(sum(v.slices))} ms); minor ≥1 ms ${v.minor.length} (max ${f2(Math.max(...v.minor, 0))} ms, sum ${f1(sum(v.minor))}); reasons ${[...v.reasons.entries()].map(([k, n]) => `${k}:${n}`).join(' ')}`,
      );
    }
  }
}
