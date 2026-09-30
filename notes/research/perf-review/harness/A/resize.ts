// Width changes of the game pane at full scrollback (window resize, dock
// drag with live preview): every row re-wraps. Times the layout forced by a
// 1-cell width change of `.wc-game` (style write + scrollHeight read) and
// the whole frame, at ~2 000 and ~20 000 rows, with and without
// `content-visibility: auto` on chunks (CSS override).
//   node perf/resize.ts [--browsers firefox,chromium] [--n 10] [--port 4205]
import { writeFileSync } from 'node:fs';
import { type BrowserName, f1, launch, loadavg, maxOf, median, openBench, pause, startServer } from './lib.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const browsers = arg('browsers', 'firefox,chromium').split(',') as BrowserName[];
const N = Number(arg('n', '10'));
const PORT = Number(arg('port', '4205'));
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const play = playLines(21000, 1);
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
      const measure = async (label: string) => {
        const xs: Array<{ layout: number; frame: number }> = [];
        for (let i = 0; i < N; i++) {
          const r = await page.evaluate(
            (k) =>
              new Promise<{ layout: number; frame: number }>((resolve) => {
                const game = document.querySelector('.wc-game') as HTMLElement;
                const sc = document.querySelector('.wc-scroller') as HTMLElement;
                requestAnimationFrame(() => {
                  const t0 = performance.now();
                  const w = game.getBoundingClientRect().width;
                  game.style.width = `${w + (k % 2 ? 9 : -9)}px`;
                  void sc.scrollHeight;
                  const t1 = performance.now();
                  const ch = new MessageChannel();
                  ch.port1.onmessage = () => resolve({ layout: t1 - t0, frame: performance.now() - t0 });
                  ch.port2.postMessage(null);
                });
              }),
            i,
          );
          xs.push(r);
          await pause(150);
        }
        const res = { layout: median(xs.map((x) => x.layout)), layoutMax: maxOf(xs.map((x) => x.layout)), frame: median(xs.map((x) => x.frame)), frameMax: maxOf(xs.map((x) => x.frame)) };
        console.log(`  ${label.padEnd(34)} forced layout ${f1(res.layout)} ms (max ${f1(res.layoutMax)}), frame ${f1(res.frame)} ms (max ${f1(res.frameMax)})`);
        return res;
      };
      const setCv = (on: boolean) =>
        page.evaluate(
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
      console.log(`\n== ${bname} (${loadavg()})`);
      for (const c of chunks.slice(0, 2)) await page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (ch) => ch.charCodeAt(0))), c);
      await page.evaluate(() => (window as any).__perf.drained());
      const rows1 = await page.evaluate(() => (window as any).__wcBench.app.output.rows);
      const small = await measure(`${rows1} rows`);
      await setCv(true);
      await pause(300);
      const smallCv = await measure(`${rows1} rows, cv:auto`);
      await setCv(false);
      for (const c of chunks.slice(2)) await page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (ch) => ch.charCodeAt(0))), c);
      await page.evaluate(() => (window as any).__perf.drained());
      await pause(500);
      const rows2 = await page.evaluate(() => (window as any).__wcBench.app.output.rows);
      const full = await measure(`${rows2} rows`);
      await setCv(true);
      await pause(300);
      const fullCv = await measure(`${rows2} rows, cv:auto`);
      out[bname] = { small, smallCv, full, fullCv, rows1, rows2 };
      await page.close();
    } finally {
      await l.browser.close();
    }
  }
} finally {
  server.close();
}
if (arg('out', '')) writeFileSync(arg('out', ''), JSON.stringify(out, null, 1));
