// Q1/Q4 Chromium breakdown: a DevTools trace around one-shot injections of
// each payload; per-phase time on the renderer main thread (rAF script,
// style, layout, pre-paint, paint, layerize, commit), the compositor and
// raster threads, and the viz/GPU side, for the frame that rendered it.
//
//   node perf/trace-chromium.ts [--port 4203] [--dist dist] [--reps 5] [--gpu]
//        [--only p24a,p24s] [--keep /path/trace.json]
import { writeFileSync } from 'node:fs';
import { f1, f2, launch, loadavg, median, openBench, pageFacts, pause, startServer } from './lib.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const PORT = Number(arg('port', '4203'));
const DIST = arg('dist', 'dist');
const REPS = Number(arg('reps', '5'));
const only = arg('only', '');
const keep = arg('keep', '');
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const shots = payloads()
  .filter((p) => !only || only.split(',').includes(p.name))
  .map((p) => ({ name: p.name, b64: b64(oneShot(p.lines)) }));
const prefill = playLines(2000);

type Ev = { name: string; cat: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: any };

const VARIANT = arg('variant', '');
const server = await startServer(VARIANT ? new URL('./dists/', import.meta.url).pathname : DIST, PORT);
const l = await launch(process.argv.includes('--gpu') ? 'chromium-gpu' : 'chromium');
const out: Record<string, any> = { loadavgStart: loadavg() };
try {
  const page = await openBench(l, `http://127.0.0.1:${PORT}/${VARIANT ? VARIANT + '/' : ''}?bench`);
  await page.evaluate(installPerf);
  await page.evaluate(() => (window as any).__perf.connect());
  for (let i = 0; i < prefill.length; i += 200) {
    await page.evaluate((s) => (window as any).__perf.inject(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))), b64(oneShot(prefill.slice(i, i + 200))));
  }
  await page.evaluate(() => (window as any).__perf.drained());
  console.log(JSON.stringify(await pageFacts(page)));
  const cats = [
    'devtools.timeline',
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-devtools.timeline.frame',
    'blink',
    'cc',
    'gpu',
    'viz',
    'toplevel',
    'benchmark',
    'blink.user_timing',
  ];
  const agg: Record<string, Record<string, number[]>> = {};
  for (let rep = 0; rep < REPS; rep++) {
    for (const s of shots) {
      await page.evaluate(() => performance.mark('inj-start'));
      await browser().startTracing(page, { categories: cats });
      await pause(50);
      const r: any = await page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (c) => c.charCodeAt(0))), s.b64);
      await pause(150);
      const buf = await browser().stopTracing();
      const trace = JSON.parse(buf.toString()) as { traceEvents: Ev[] };
      if (keep && rep === REPS - 1) writeFileSync(keep.replace('.json', `-${s.name}.json`), buf);
      const ev = trace.traceEvents;
      const threads = new Map<string, string>();
      for (const e of ev) if (e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args?.name);
      const main = [...threads].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k);
      // The renderer that owns the page: the main thread with FireAnimationFrame events.
      const mainKey = main.find((k) => ev.some((e) => `${e.pid}:${e.tid}` === k && e.name === 'FireAnimationFrame')) ?? main[0]!;
      const rpid = Number(mainKey.split(':')[0]);
      // The frame: the FireAnimationFrame that ran our flush (the longest one), then the
      // rendering work after it on the main thread until the next idle.
      const onMain = ev.filter((e) => `${e.pid}:${e.tid}` === mainKey && e.ph === 'X');
      const rafs = onMain.filter((e) => e.name === 'FireAnimationFrame').sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0));
      const raf = rafs[0];
      if (!raf) {
        console.log(`${s.name}: no FireAnimationFrame found`);
        continue;
      }
      // The enclosing task (the BeginMainFrame / animation frame task).
      const task = onMain
        .filter((e) => (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.ts <= raf.ts && e.ts + (e.dur ?? 0) >= raf.ts + (raf.dur ?? 0))
        .sort((a, b) => (a.dur ?? 0) - (b.dur ?? 0))[0];
      const t0 = task ? task.ts : raf.ts;
      const t1 = task ? task.ts + (task.dur ?? 0) : raf.ts + (raf.dur ?? 0);
      const inTask = onMain.filter((e) => e.ts >= t0 && e.ts + (e.dur ?? 0) <= t1);
      // Outermost events of each name only (Paint nests Paint).
      const outer = (names: string[]) =>
        inTask.filter((e) => names.includes(e.name) && !inTask.some((p) => p !== e && names.includes(p.name) && p.ts <= e.ts && p.ts + (p.dur ?? 0) >= e.ts + (e.dur ?? 0) && (p.dur ?? 0) > (e.dur ?? 0)));
      const sum = (names: string[]) => outer(names).reduce((a, e) => a + (e.dur ?? 0) / 1000, 0);
      // Top-level only for nested events (UpdateLayoutTree inside the rAF = forced).
      const inRaf = (e: Ev) => e.ts >= raf.ts && e.ts + (e.dur ?? 0) <= raf.ts + (raf.dur ?? 0);
      const forcedStyle = outer(['UpdateLayoutTree']).filter(inRaf).reduce((a, e) => a + (e.dur ?? 0) / 1000, 0);
      const forcedLayout = outer(['Layout']).filter(inRaf).reduce((a, e) => a + (e.dur ?? 0) / 1000, 0);
      const row: Record<string, number> = {
        task: (t1 - t0) / 1000,
        raf: (raf.dur ?? 0) / 1000,
        'raf:dom': (raf.dur ?? 0) / 1000 - forcedStyle - forcedLayout,
        'raf:forcedStyle': forcedStyle,
        'raf:forcedLayout': forcedLayout,
        style: sum(['UpdateLayoutTree']) - forcedStyle,
        layout: sum(['Layout']) - forcedLayout,
        prePaint: sum(['PrePaint']),
        paint: sum(['Paint']),
        layerize: sum(['Layerize']),
        commit: sum(['Commit']),
        injectToPaint: r.toPaint,
        script: r.script,
        frame: r.frame,
      };
      // Raster / compositor / GPU after the main-thread frame (next 100 ms).
      const after = ev.filter((e) => e.ph === 'X' && e.ts >= t0 && e.ts <= t1 + 100_000);
      const byThread = (pred: (n: string) => boolean, names: string[]) =>
        after.filter((e) => pred(threads.get(`${e.pid}:${e.tid}`) ?? '') && names.includes(e.name)).reduce((a, e) => a + (e.dur ?? 0) / 1000, 0);
      row.raster = byThread((n) => /Raster|CompositorTileWorker/i.test(n), ['RasterTask', 'TaskGraphRunner::RunTask']);
      row.rasterTasks = after.filter((e) => e.name === 'RasterTask' && e.pid === rpid).length;
      row.gpuOrViz = byThread((n) => /VizCompositorThread|CrGpuMain|GpuMain/i.test(n), ['DrawFrame', 'Display::DrawAndSwap', 'SkiaOutputSurfaceImplOnGpu::SwapBuffers', 'GPUTask', 'CommandBufferStub::OnAsyncFlush']);
      // Presentation of the frame (PipelineReporter / Graphics.Pipeline) if present.
      for (const [k, v] of Object.entries(row)) ((agg[s.name] ??= {})[k] ??= []).push(v);
      await pause(200);
    }
  }
  console.log(`loadavg ${loadavg()}`);
  const keys = ['task', 'raf', 'raf:dom', 'raf:forcedStyle', 'raf:forcedLayout', 'style', 'layout', 'prePaint', 'paint', 'layerize', 'commit', 'raster', 'rasterTasks', 'gpuOrViz', 'script', 'frame', 'injectToPaint'];
  const short: Record<string, string> = { 'raf:forcedStyle': 'fStyle', 'raf:forcedLayout': 'fLayout', 'raf:dom': 'dom', rasterTasks: 'rTasks', injectToPaint: 'toPaint' };
  console.log('payload  ' + keys.map((k) => (short[k] ?? k).padStart(9)).join(''));
  for (const [name, m] of Object.entries(agg)) {
    console.log(name.padEnd(9) + keys.map((k) => f2(median(m[k] ?? [])).padStart(9)).join(''));
  }
  out.agg = agg;
  out.loadavgEnd = loadavg();
  writeFileSync(arg('out', '/dev/null'), JSON.stringify(out, null, 1));
} finally {
  await l.browser.close();
  server.close();
}
function browser() {
  return l.browser;
}
void f1;
