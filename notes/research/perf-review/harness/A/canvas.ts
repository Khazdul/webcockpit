// Q6: canvas spike vs the DOM path for the same rows, same page, same DPR.
//   node perf/canvas.ts [--browsers firefox,chromium] [--rounds 8] [--port 4201]
import { writeFileSync } from 'node:fs';
import { type BrowserName, f2, launch, loadavg, median, minOf, openBench, pause, pct, startServer } from './lib.ts';
import { installCanvas } from './canvas-page.ts';
import { installLab } from './lab-page.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const browsers = arg('browsers', 'firefox,chromium').split(',') as BrowserName[];
const ROUNDS = Number(arg('rounds', '8'));
const PORT = Number(arg('port', '4201'));
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const want = ['p24a', 'p24s', 'combat', 'info'];
const shots = payloads().filter((p) => want.includes(p.name)).map((p) => ({ name: p.name, b64: b64(oneShot(p.lines)) }));
const server = await startServer(arg('dist', 'dist'), PORT);
const res: Record<string, Record<string, Array<Record<string, number>>>> = {};
const loads: string[] = [];
try {
  for (const bname of browsers) {
    const l = await launch(bname);
    try {
      const page = await openBench(l, `http://127.0.0.1:${PORT}/?bench`);
      await page.evaluate(installPerf);
      await page.evaluate(() => (window as any).__perf.connect());
      const pre = playLines(2000);
      for (let i = 0; i < pre.length; i += 200) {
        await page.evaluate((s) => (window as any).__perf.inject(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))), b64(oneShot(pre.slice(i, i + 200))));
      }
      await page.evaluate(() => (window as any).__perf.drained());
      await page.evaluate(installLab);
      for (const s of shots) await page.evaluate(([n, x]) => (window as any).__lab.capture(n, Uint8Array.from(atob(x!), (c) => c.charCodeAt(0))), [s.name, s.b64] as const);
      const add = (k: string, r: Record<string, number>) => ((res[bname] ??= {})[k] ??= []).push(r);
      loads.push(`${bname} dom: ${loadavg()}`);
      for (let r = 0; r < ROUNDS; r++) {
        await page.evaluate(() => (window as any).__lab.filler(400));
        await pause(100);
        for (const n of ['p24a', 'p24s', 'info', 'combat']) {
          add(`dom ${n}`, await page.evaluate((x) => (window as any).__lab.run('base', x), n));
          await pause(80);
          add(`dom combat after ${n}`, await page.evaluate(() => (window as any).__lab.run('base', 'combat')));
          await pause(80);
        }
      }
      await page.evaluate(installCanvas);
      await page.evaluate(() => (window as any).__lab.frames(5));
      loads.push(`${bname} canvas: ${loadavg()}`);
      for (let r = 0; r < ROUNDS; r++) {
        for (const n of ['p24a', 'p24s']) {
          add(`canvas full redraw 57 rows of ${n} (fillText per run)`, await page.evaluate((x) => (window as any).__canvas.full(x, true), n));
          await pause(60);
          add(`canvas full redraw 57 rows of ${n} (fillText per row if one fg)`, await page.evaluate((x) => (window as any).__canvas.full(x, false), n));
          await pause(60);
        }
        for (const n of ['p24a', 'p24s', 'info', 'combat']) {
          add(`canvas scroll + ${n}`, await page.evaluate((x) => (window as any).__canvas.scroll(x, true), n));
          await pause(60);
        }
      }
      await page.close();
    } finally {
      await l.browser.close();
    }
  }
} finally {
  server.close();
}
for (const [b, byK] of Object.entries(res)) {
  console.log(`\n== ${b}: median script / frame (rAF → after rendering) [min–p90 frame], ms`);
  for (const [k, xs] of Object.entries(byK)) {
    const fr = xs.map((x) => x.frame!);
    console.log(`  ${k.padEnd(62)} ${f2(median(xs.map((x) => x.script ?? x.build! + x.append! + x.scroll!)))} / ${f2(median(fr))}  [${f2(minOf(fr))}–${f2(pct(fr, 90))}] n=${xs.length}`);
  }
}
console.log('\nloadavg:', loads.join(' | '));
if (arg('out', '')) writeFileSync(arg('out', ''), JSON.stringify({ res, loads }, null, 1));
