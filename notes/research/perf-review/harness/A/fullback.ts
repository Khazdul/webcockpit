// Frame cost vs scrollback fill, and the chunk-trim frames at the 20 000-row
// cap (A12, long sessions). Real flush of the base build (harness timing
// patch). Phase 1: ~2 000 rows present; phase 2: filled past 20 000 rows so
// every 50th combat flush (4 rows) drops a 200-row chunk from the top.
//   node perf/fullback.ts [--browsers firefox,chromium] [--n 300] [--port 4203]
import { writeFileSync } from 'node:fs';
import { type BrowserName, f2, launch, loadavg, maxOf, median, openBench, pause, pct, startServer } from './lib.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const browsers = arg('browsers', 'firefox,chromium').split(',') as BrowserName[];
const N = Number(arg('n', '300'));
const PORT = Number(arg('port', '4203'));
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const combat = b64(oneShot(payloads().find((p) => p.name === 'combat')!.lines));
const info = b64(oneShot(payloads().find((p) => p.name === 'info')!.lines));
const play = playLines(22000, 1);
const chunks: string[] = [];
for (let i = 0; i < play.length; i += 1000) chunks.push(b64(oneShot(play.slice(i, i + 1000))));
const server = await startServer(new URL('./dists/', import.meta.url).pathname, PORT);
const out: Record<string, any> = {};
try {
  for (const bname of browsers) {
    const l = await launch(bname);
    try {
      const page = await openBench(l, `http://127.0.0.1:${PORT}/base/?bench`);
      await page.evaluate(() => ((globalThis as any).__wcFlushT = []));
      await page.evaluate(installPerf);
      await page.evaluate(() => (window as any).__perf.connect());
      const measure = async (label: string) => {
        const recs: any[] = [];
        for (let i = 0; i < N; i++) {
          const rows0 = await page.evaluate(() => (window as any).__wcBench.app.output.rows);
          const r = await page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (c) => c.charCodeAt(0))), i % 10 === 9 ? info : combat);
          const rows1 = await page.evaluate(() => (window as any).__wcBench.app.output.rows);
          const ph = await page.evaluate((st) => (globalThis as any).__wcFlushT.find((x: any) => Math.abs(x.start - st) < 0.5), r.flushStart);
          recs.push({ ...r, ph, trimmed: ph && ph.rows > rows1 - rows0 ? 1 : 0, rows: rows1 });
          await pause(40);
        }
        const trim = recs.filter((x) => x.trimmed);
        const rest = recs.filter((x) => !x.trimmed);
        const s = (xs: any[], k: (x: any) => number) => `${f2(median(xs.map(k)))} / p95 ${f2(pct(xs.map(k), 95))} / max ${f2(maxOf(xs.map(k)))}`;
        console.log(`  ${label}: rows ${recs[recs.length - 1].rows}; ${rest.length} normal flushes: frame ${s(rest, (x) => x.frame)}; script ${s(rest, (x) => x.script)}`);
        if (trim.length) console.log(`  ${label}: ${trim.length} trim flushes: frame ${s(trim, (x) => x.frame)}; script ${s(trim, (x) => x.script)}; append ${s(trim, (x) => x.ph?.append ?? NaN)}`);
        return recs;
      };
      console.log(`\n== ${bname} (${loadavg()})`);
      for (const c of chunks.slice(0, 2)) await page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (ch) => ch.charCodeAt(0))), c);
      await page.evaluate(() => (window as any).__perf.drained());
      const small = await measure('~2 000 rows');
      for (const c of chunks.slice(2)) await page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (ch) => ch.charCodeAt(0))), c);
      await page.evaluate(() => (window as any).__perf.drained());
      await pause(500);
      const full = await measure('at the 20 000 cap');
      out[bname] = { small, full, load: loadavg() };
      await page.close();
    } finally {
      await l.browser.close();
    }
  }
} finally {
  server.close();
}
if (arg('out', '')) writeFileSync(arg('out', ''), JSON.stringify(out, null, 1));
