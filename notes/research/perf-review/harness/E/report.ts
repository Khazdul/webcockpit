// Summarises an e-harness results JSON: per browser and variant (build ×
// config), the median over runs (and min–max) of the key measures.
//
//   node perf/report.ts perf/results/<file>.json [--md]
import { readFileSync } from 'node:fs';

const file = process.argv[2]!;
const md = process.argv.includes('--md');
const J = JSON.parse(readFileSync(file, 'utf8')) as { scenario: string; secs: number; results: any[] };
const med = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const cell = (xs: number[], d = 2) => {
  const v = xs.filter((x) => Number.isFinite(x));
  return v.length ? `${f(med(v), d)} (${f(Math.min(...v), d)}–${f(Math.max(...v), d)})` : '—';
};

const groups = new Map<string, any[]>();
for (const r of J.results) {
  const k = `${r.browser}|${r.build}|${r.config}`;
  (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
}

const mainCpu = (r: any): number => {
  const rows = r.cpu as Array<{ proc: string; thread: string; ms: number }>;
  const want = r.browser === 'firefox' ? (x: any) => x.proc === 'content:tab' && x.thread.endsWith('[main]') : (x: any) => x.proc === 'renderer' && x.thread.endsWith('[main]');
  // Firefox has several tab processes; the busiest main thread is the page's.
  return Math.max(0, ...rows.filter(want).map((x) => x.ms));
};
const cpuOf = (r: any, proc: RegExp, thread: RegExp): number =>
  (r.cpu as Array<{ proc: string; thread: string; ms: number }>).filter((x) => proc.test(x.proc) && thread.test(x.thread)).reduce((s, x) => s + x.ms, 0);

const perMin = (r: any, v: number) => (v / (r.windowMs as number)) * 60_000;

const rows: string[][] = [];
const head = [
  'browser',
  'build',
  'config',
  'runs',
  'rAF frames/s',
  'frame ms O med',
  'frame ms OP med',
  'frame ms OP p95',
  'frame ms P med',
  'pane script ms/min',
  'renders/min',
  'main-thread CPU ms/min',
  'trace main busy ms/min',
  'recalc ms/min',
  'layout ms/min',
  'paint ms/min',
  'load1',
];
for (const [k, rs] of groups) {
  const [browser, build, config] = k.split('|');
  const P = rs.map((r) => r.page);
  const renders = rs.map((r) => perMin(r, Object.values(r.page.panes as Record<string, { n: number }>).reduce((s, p) => s + p.n, 0)));
  rows.push([
    browser!,
    build!,
    config!,
    String(rs.length),
    cell(P.map((p) => p.framesPerS), 1),
    cell(P.map((p) => p.frameMs.O.med)),
    cell(P.map((p) => p.frameMs.OP.med)),
    cell(P.map((p) => p.frameMs.OP.p95)),
    cell(P.map((p) => p.frameMs.P.med)),
    cell(rs.map((r) => perMin(r, r.page.paneScriptTotalMs)), 0),
    cell(renders, 0),
    cell(rs.map((r) => perMin(r, mainCpu(r))), 0),
    cell(rs.map((r) => (r.trace ? perMin(r, r.trace.mainTaskMs) : NaN)), 0),
    cell(rs.map((r) => (r.trace ? perMin(r, r.trace.recalc.sum) : NaN)), 1),
    cell(rs.map((r) => (r.trace ? perMin(r, r.trace.layout.sum) : NaN)), 1),
    cell(rs.map((r) => (r.trace ? perMin(r, r.trace.paint.sum) : NaN)), 1),
    cell(rs.map((r) => Number(String(r.load).split(' ')[0])), 1),
  ]);
}
if (md) {
  console.log(`| ${head.join(' | ')} |`);
  console.log(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) console.log(`| ${r.join(' | ')} |`);
} else {
  console.table(rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))));
}

// Per pane: renders per minute and median render ms, per variant.
console.log('\nper pane: renders/min, render ms median (p95), in output frame %');
for (const [k, rs] of groups) {
  const out: string[] = [];
  for (const id of ['character', 'timers', 'group', 'comm', 'ui']) {
    const ps = rs.map((r) => r.page.panes[id]).filter(Boolean);
    if (!ps.length) continue;
    out.push(
      `${id} ${f(med(rs.map((r, i) => perMin(r, r.page.panes[id]?.n ?? 0))), 0)}/min ${f(med(ps.map((p: any) => p.med)))} (${f(med(ps.map((p: any) => p.p95)))}) ms ${f(med(ps.map((p: any) => (100 * p.inOutputFrame) / p.n)), 0)}%`,
    );
  }
  console.log(`  ${k}: ${out.join('; ')}`);
}
// Other threads (median ms/min).
console.log('\nother threads, CPU ms/min (median over runs)');
for (const [k, rs] of groups) {
  const b = rs[0].browser;
  const pick =
    b === 'firefox'
      ? [
          ['content Worker', /content:tab/, /DOM Worker/],
          ['parent main', /^parent$/, /\[main\]/],
          ['Renderer', /^parent$/, /^Renderer/],
          ['SwComposite', /^parent$/, /SwComposite/],
          ['WRRenderBackend', /^parent$/, /WRRende/],
          ['Compositor', /^parent$/, /^Compositor/],
          ['CanvasRenderer', /^parent$/, /CanvasRenderer/],
        ]
      : [
          ['renderer Compositor', /^renderer$/, /^Compositor/],
          ['DedicatedWorker', /^renderer$/, /DedicatedWorker/],
          ['raster', /^renderer$/, /CompositorTileW|ThreadPoolForeg/],
          ['gpu main', /^gpu-process$/, /\[main\]/],
          ['gpu Viz', /^gpu-process$/, /VizCompositor/],
        ];
  console.log(`  ${k}: ${pick.map(([n, p, t]) => `${n} ${f(med(rs.map((r) => perMin(r, cpuOf(r, p as RegExp, t as RegExp)))), 0)}`).join('; ')}`);
}
if (J.results.some((r) => r.trace)) {
  console.log('\nchromium trace (median over runs): main frames/s (Commit), compositor BeginFrame/s, DrawFrame/s, main busy ms/min, recalc/min');
  for (const [k, rs] of groups) {
    const ts = rs.map((r) => r.trace).filter(Boolean);
    if (!ts.length) continue;
    console.log(
      `  ${k}: main ${f(med(ts.map((t: any) => t.mainFramesPerS)), 1)}; comp begin ${f(med(ts.map((t: any) => t.compBeginFramesPerS ?? NaN)), 1)}; comp draw ${f(med(ts.map((t: any) => t.compDrawFramesPerS ?? NaN)), 1)}; busy ${f(med(rs.map((r) => perMin(r, r.trace.mainTaskMs))), 0)}; recalc ${f(med(ts.map((t: any) => t.recalc.perS * 60)), 0)}/min`,
    );
  }
}
if (J.results.some((r) => r.latency)) {
  console.log('\nlatency (median over runs of the per-run median / p95): receipt → painted ms; receipt → flush start (wait) ms');
  for (const [k, rs] of groups) {
    const ls = rs.map((r) => r.latency).filter(Boolean);
    console.log(
      `  ${k}: toPaint med ${f(med(ls.map((l: any) => l.toPaint.med)))} p95 ${f(med(ls.map((l: any) => l.toPaint.p95)))} max ${f(Math.max(...ls.map((l: any) => l.toPaint.max)))}; wait med ${f(med(ls.map((l: any) => l.wait.med)))} p95 ${f(med(ls.map((l: any) => l.wait.p95)))}; n ${ls.map((l: any) => l.n).join('/')}`,
    );
  }
}
if (J.results.some((r) => r.ffprof)) {
  console.log('\nfirefox profiler (median over runs): refresh ticks/s, content main CPU ms/min, Styles ms/min, DisplayList ms/min');
  for (const [k, rs] of groups) {
    const ff = rs.map((r) => r.ffprof).filter(Boolean);
    if (!ff.length) continue;
    const pm = (fn: (x: any) => number) => f(med(ff.map((x: any) => (fn(x) / x.windowMs) * 60_000)), 0);
    console.log(
      `  ${k}: ticks/s ${f(med(ff.map((x: any) => x.markers.RefreshDriverTick?.perS ?? 0)), 1)}; cpu ${pm((x) => x.cpuMs ?? NaN)}; Styles ${pm((x) => x.markers.Styles?.ms ?? 0)}; DisplayList ${pm((x) => x.markers.DisplayList?.ms ?? 0)}; parent Renderer ${pm((x) => x.parentCpu?.Renderer ?? 0)}; SwComposite ${pm((x) => x.parentCpu?.SwComposite ?? 0)}`,
    );
  }
}
