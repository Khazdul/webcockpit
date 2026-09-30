// Why does Chromium repaint whole chunks for a 4-row flush? Traces a few
// combat injections with paint-invalidation tracking and prints, per frame,
// the Paint events (layer node, clip, duration) and the invalidation
// reasons recorded for chunk / row objects.
//   node perf/trace-invalidation.ts [--port 4204] [--dist dist] [--payload combat] [--n 3]
import { writeFileSync } from 'node:fs';
import { launch, openBench, pause, startServer } from './lib.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const PORT = Number(arg('port', '4204'));
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const pl = payloads().find((p) => p.name === arg('payload', 'combat'))!;
const shot = b64(oneShot(pl.lines));
type Ev = { name: string; cat: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: any };

const server = await startServer(arg('dist', 'dist'), PORT);
const l = await launch('chromium');
try {
  const page = await openBench(l, `http://127.0.0.1:${PORT}/?bench`);
  await page.evaluate(installPerf);
  await page.evaluate(() => (window as any).__perf.connect());
  const pre = playLines(Number(arg('prefill', '2000')));
  for (let i = 0; i < pre.length; i += 200) {
    await page.evaluate((s) => (window as any).__perf.inject(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))), b64(oneShot(pre.slice(i, i + 200))));
  }
  await page.evaluate(() => (window as any).__perf.drained());
  await l.browser.startTracing(page, {
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.invalidationTracking',
      'blink',
      'cc',
    ],
  });
  for (let i = 0; i < Number(arg('n', '3')); i++) {
    await page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (c) => c.charCodeAt(0))), shot);
    await pause(200);
  }
  const buf = await l.browser.stopTracing();
  if (arg('keep', '')) writeFileSync(arg('keep', ''), buf);
  const ev = (JSON.parse(buf.toString()) as { traceEvents: Ev[] }).traceEvents.sort((a, b) => a.ts - b.ts);
  const names = new Map<string, number>();
  for (const e of ev) if (/Invalidation/.test(e.name)) names.set(e.name, (names.get(e.name) ?? 0) + 1);
  console.log('invalidation event counts:', Object.fromEntries(names));
  const t0 = ev.find((e) => e.name === 'FireAnimationFrame')?.ts ?? ev[0]!.ts;
  for (const e of ev) {
    if (e.name === 'Paint' && e.ph === 'X') {
      const d = e.args?.data ?? {};
      console.log(`${((e.ts - t0) / 1000).toFixed(1).padStart(8)} Paint ${((e.dur ?? 0) / 1000).toFixed(2)} ms ${d.nodeName} #${d.nodeId} clip ${JSON.stringify(d.clip)}`);
    } else if (e.name === 'FireAnimationFrame' && e.ph === 'X') {
      console.log(`${((e.ts - t0) / 1000).toFixed(1).padStart(8)} ---- rAF ${((e.dur ?? 0) / 1000).toFixed(2)} ms`);
    } else if (e.name === 'PaintInvalidationTracking' || e.name === 'LayoutInvalidationTracking' || e.name === 'ScrollInvalidationTracking') {
      const d = e.args?.data ?? {};
      if (/wc-chunk|wc-rows|wc-scroller|wc-row|#document|HTML/.test(d.nodeName ?? '') || e.name !== 'PaintInvalidationTracking')
        console.log(`${((e.ts - t0) / 1000).toFixed(1).padStart(8)}   ${e.name} ${d.nodeName ?? ''} #${d.nodeId ?? ''} ${d.reason ?? ''}`);
    }
  }
} finally {
  await l.browser.close();
  server.close();
}
