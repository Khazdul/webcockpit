// Q5: the catch-up case. rAF stops while the tab is hidden; on return the
// pane has a backlog. Here a backlog of N lines of ordinary play is fed as
// one socket frame (the same queue state the pane has after a hidden
// period), and every flush until it drained is timed (script, phases from
// the harness timing patch, rAF start → after rendering) together with the
// rAF gaps (the frames the user sees) and the time until the newest line is
// on screen.
//
//   node perf/catchup.ts [--variants base,slice] [--browsers firefox,chromium]
//        [--sizes 200,500,1000,2000,5000] [--reps 4] [--port 4202]
import { writeFileSync } from 'node:fs';
import { type BrowserName, f1, launch, loadavg, maxOf, median, openBench, pause, pct, startServer } from './lib.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const browsers = arg('browsers', 'firefox,chromium').split(',') as BrowserName[];
// `dist` or `dist@cap` (cap = rows per frame via the harness knob globalThis.__wcMaxRows).
const variants = arg('variants', 'base').split(',');
const sizes = arg('sizes', '200,500,1000,2000,5000').split(',').map(Number);
const REPS = Number(arg('reps', '4'));
const PORT = Number(arg('port', '4202'));
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
// Different play for each size and rep would change the work; use one stretch.
const backlog = new Map(sizes.map((n) => [n, b64(oneShot(playLines(n, 30000)))]));
const pre = playLines(2000);
const preChunks: string[] = [];
for (let i = 0; i < pre.length; i += 200) preChunks.push(b64(oneShot(pre.slice(i, i + 200))));

const server = await startServer(new URL('./dists/', import.meta.url).pathname, PORT);
const res: Record<string, Record<string, Record<number, any[]>>> = {};
const loads: string[] = [];
try {
  for (const bname of browsers) {
    const l = await launch(bname);
    try {
      for (let rep = 0; rep < REPS; rep++) {
        loads.push(`${bname} rep${rep}: ${loadavg()}`);
        for (const v of [...variants].sort(() => Math.random() - 0.5)) {
          const [dist, cap] = v.split('@');
          const page = await openBench(l, `http://127.0.0.1:${PORT}/${dist}/?bench`);
          await page.evaluate(() => ((globalThis as any).__wcFlushT = []));
          if (cap) await page.evaluate((c) => ((globalThis as any).__wcMaxRows = c), Number(cap.replace('cv', '') || '1000'));
          // `dist@<cap>cv`: also content-visibility: auto on chunks.
          if (cap?.endsWith('cv')) {
            await page.addStyleTag({ content: '.wc-chunk{content-visibility:auto;contain-intrinsic-size:auto 3400px}' });
          }
          await page.evaluate(installPerf);
          await page.evaluate(() => (window as any).__perf.connect());
          for (const c of preChunks) await page.evaluate((s) => (window as any).__perf.inject(Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0))), c);
          await page.evaluate(() => (window as any).__perf.drained());
          for (const n of [...sizes].sort(() => Math.random() - 0.5)) {
            const r = await page.evaluate(async (s) => {
              const perf = (window as any).__perf;
              const probe = perf.probe;
              const f0 = probe.flushes.length;
              const T = (globalThis as any).__wcFlushT as any[];
              const tf0 = T.length;
              perf.monStart();
              const t0 = performance.now();
              probe.sock.onData(Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0)));
              const ingest = performance.now() - t0;
              await perf.drained();
              const gaps = perf.monStop();
              const fl = probe.flushes.slice(f0).filter((f: any) => f.start >= t0);
              const ph = T.slice(tf0);
              const last = fl[fl.length - 1];
              return {
                ingest,
                flushes: fl.map((f: any) => ({ script: f.script, frame: f.frame })),
                phases: ph,
                gaps,
                // Receipt → the last flush (with the newest line) rendered.
                newest: last ? last.start + last.frame - t0 : 0,
                // Receipt → the first flush rendered (something moved).
                first: fl[0] ? fl[0].start + fl[0].frame - t0 : 0,
              };
            }, backlog.get(n)!);
            (((res[bname] ??= {})[v] ??= {})[n] ??= []).push(r);
            await pause(300);
          }
          await page.close();
        }
      }
    } finally {
      await l.browser.close();
    }
  }
} finally {
  server.close();
}
for (const [bname, byV] of Object.entries(res)) {
  console.log(`\n== ${bname}`);
  console.log('  variant  lines  flushes  max frame (rAF→painted)  max rAF gap  gaps>50ms  frames>16.7  ingest  receipt→first painted  receipt→newest painted   [per flush: rows, script, frame (median of reps, first 3 flushes)]');
  for (const [v, byN] of Object.entries(byV)) {
    for (const n of sizes) {
      const xs = byN[n] ?? [];
      if (!xs.length) continue;
      const first3 = [0, 1, 2]
        .map((i) => {
          const fs = xs.map((x) => x.flushes[i]).filter(Boolean);
          const ps = xs.map((x) => x.phases[i]).filter(Boolean);
          if (!fs.length) return '';
          return `${median(ps.map((p: any) => p.rows))}r ${f1(median(fs.map((f: any) => f.script)))}/${f1(median(fs.map((f: any) => f.frame)))}`;
        })
        .filter(Boolean)
        .join(', ');
      console.log(
        `  ${v.padEnd(8)} ${String(n).padStart(5)}  ${f1(median(xs.map((x) => x.flushes.length))).padStart(7)}  ${f1(median(xs.map((x) => maxOf(x.flushes.map((f: any) => f.frame))))).padStart(22)}  ${f1(median(xs.map((x) => maxOf(x.gaps)))).padStart(11)}  ${f1(median(xs.map((x) => x.gaps.filter((g: number) => g > 50).length))).padStart(9)}  ${f1(median(xs.map((x) => x.gaps.filter((g: number) => g > 16.7 * 1.5).length))).padStart(11)}  ${f1(median(xs.map((x) => x.ingest))).padStart(6)}  ${f1(median(xs.map((x) => x.first))).padStart(20)}  ${f1(median(xs.map((x) => x.newest))).padStart(22)}   [${first3}]`,
      );
    }
  }
}
console.log('\nloadavg:', loads.join(' | '));
if (arg('out', '')) writeFileSync(arg('out', ''), JSON.stringify({ res, loads }, null, 1));
void pct;
