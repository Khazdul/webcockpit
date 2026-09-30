// Does `content-visibility: auto` on chunks cost anything per frame in
// normal play? Real flush (production dist), ~20 000 rows of ordinary play,
// then blocks of 20 injections (combat / room / info mix) alternating with
// and without the CSS override, several times.
//   node perf/cvframes.ts [--browsers firefox,chromium] [--blocks 8] [--port 4204]
import { writeFileSync } from 'node:fs';
import { type BrowserName, f2, launch, loadavg, median, openBench, pause, pct, startServer } from './lib.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const browsers = arg('browsers', 'firefox,chromium').split(',') as BrowserName[];
const BLOCKS = Number(arg('blocks', '8'));
const PORT = Number(arg('port', '4204'));
const ROWS = Number(arg('rows', '21000'));
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const mix = ['combat', 'combat', 'room', 'combat', 'info'].map((n) => b64(oneShot(payloads().find((p) => p.name === n)!.lines)));
const play = playLines(ROWS, 1);
const chunks: string[] = [];
for (let i = 0; i < play.length; i += 1000) chunks.push(b64(oneShot(play.slice(i, i + 1000))));
const CV = '.wc-chunk{content-visibility:auto;contain-intrinsic-size:auto 3400px}';
const server = await startServer(arg('dist', 'dist'), PORT);
const out: Record<string, any> = {};
try {
  for (const bname of browsers) {
    const l = await launch(bname);
    try {
      const page = await openBench(l, `http://127.0.0.1:${PORT}/?bench`);
      await page.evaluate(installPerf);
      await page.evaluate(() => (window as any).__perf.connect());
      for (const c of chunks) await page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (ch) => ch.charCodeAt(0))), c);
      await page.evaluate(() => (window as any).__perf.drained());
      const res: Record<string, number[]> = { off: [], on: [] };
      const scr: Record<string, number[]> = { off: [], on: [] };
      const load: string[] = [];
      const first = Math.random() < 0.5 ? 0 : 1;
      for (let b = 0; b < BLOCKS * 2; b++) {
        const on = b % 2 === first;
        await page.evaluate(
          ([css, v]) => {
            let el = document.getElementById('cv-css');
            if (!el) {
              el = document.createElement('style');
              el.id = 'cv-css';
              document.head.appendChild(el);
            }
            el.textContent = v ? (css as string) : '';
          },
          [CV, on] as const,
        );
        await pause(300);
        load.push(loadavg());
        for (let i = 0; i < 20; i++) {
          const r = await page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (ch) => ch.charCodeAt(0))), mix[i % mix.length]!);
          if (i >= 2) {
            res[on ? 'on' : 'off']!.push(r.frame);
            scr[on ? 'on' : 'off']!.push(r.script);
          }
          await pause(40);
        }
      }
      const rows = await page.evaluate(() => (window as any).__wcBench.app.output.rows);
      console.log(`\n== ${bname}: ${rows} rows; frame (rAF → after rendering) median / p90 / p99, ms; script median`);
      for (const k of ['off', 'on']) console.log(`  cv ${k.padEnd(3)} ${f2(median(res[k]!))} / ${f2(pct(res[k]!, 90))} / ${f2(pct(res[k]!, 99))}   script ${f2(median(scr[k]!))}  n=${res[k]!.length}`);
      out[bname] = { res, scr, rows, load };
      await page.close();
    } finally {
      await l.browser.close();
    }
  }
} finally {
  server.close();
}
if (arg('out', '')) writeFileSync(arg('out', ''), JSON.stringify(out, null, 1));
