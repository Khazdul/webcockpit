// How long do heavy rows keep later frames expensive? After a block of rows
// (plain filler, the 24-bit page with today's spans, the same structure with
// class-only spans, or the page as one gradient per row), N small combat
// frames (4 rows each) are rendered one by one and each frame is timed
// (rAF start → after rendering). As the heavy rows scroll up and out of the
// viewport / cull rect / display port, the cost should fall back.
//
//   node perf/nextframe.ts [--browsers firefox,chromium] [--reps 4] [--steps 100] [--port 4209]
import { writeFileSync } from 'node:fs';
import { type BrowserName, f2, launch, loadavg, median, openBench, pause, startServer } from './lib.ts';
import { installLab } from './lab-page.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const browsers = arg('browsers', 'firefox,chromium').split(',') as BrowserName[];
const REPS = Number(arg('reps', '4'));
const STEPS = Number(arg('steps', '100'));
const PORT = Number(arg('port', '4209'));
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const want = ['p24a', 'p16x', 'combat', 'p24s'];
const shots = payloads().filter((p) => want.includes(p.name)).map((p) => ({ name: p.name, b64: b64(oneShot(p.lines)) }));
const CSSES: Record<string, string> = {
  '': '',
  cv: '.wc-chunk{content-visibility:auto;contain-intrinsic-size:auto 3400px}',
  wc: '.wc-chunk{will-change:transform}',
  strict: '.wc-row{contain:layout paint style}',
};
const blockSet = arg('blocks', 'plain,spans,classes,gradient').split(',');
const cssSet = arg('css', '').split(',');
const allBlocks: Record<string, { label: string; builder: string; payload: string }> = {
  plain: { label: 'plain(p24s)', builder: 'base', payload: 'p24s' },
  spans: { label: 'p24a spans (today)', builder: 'base', payload: 'p24a' },
  classes: { label: 'p16x class spans', builder: 'base', payload: 'p16x' },
  gradient: { label: 'p24a as gradient', builder: 'gradient', payload: 'p24a' },
};
const blocks: Array<{ label: string; builder: string; payload: string; css: string }> = [];
for (const c of cssSet)
  for (const b of blockSet) blocks.push({ ...allBlocks[b]!, label: allBlocks[b]!.label + (c ? ` +${c}` : ''), css: CSSES[c]! });
const server = await startServer(arg('dist', 'dist'), PORT);
const out: Record<string, Record<string, number[][]>> = {};
const loads: string[] = [];
try {
  for (const bname of browsers) {
    const l = await launch(bname);
    try {
      const page = await openBench(l, `http://127.0.0.1:${PORT}/?bench`);
      if (arg('map', 'on') === 'off') {
        await page.evaluate(() => (window as any).__wcBench.settings.update({ panes: { map: { on: false } } }));
        await pause(300);
      }
      await page.evaluate(installPerf);
      await page.evaluate(() => (window as any).__perf.connect());
      const pre = playLines(2000);
      for (let i = 0; i < pre.length; i += 200) {
        await page.evaluate((s) => (window as any).__perf.inject(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))), b64(oneShot(pre.slice(i, i + 200))));
      }
      await page.evaluate(() => (window as any).__perf.drained());
      await page.evaluate(installLab);
      for (const s of shots) await page.evaluate(([n, x]) => (window as any).__lab.capture(n, Uint8Array.from(atob(x!), (c) => c.charCodeAt(0))), [s.name, s.b64] as const);
      for (let rep = 0; rep < REPS; rep++) {
        loads.push(`${bname} rep${rep}: ${loadavg()}`);
        for (const b of [...blocks].sort(() => Math.random() - 0.5)) {
          await page.evaluate((css) => (window as any).__lab.setCss(css), b.css);
          await page.evaluate(() => (window as any).__lab.filler(500));
          await pause(150);
          // Two pages' worth (92 rows) fill the 57-row viewport.
          await page.evaluate(([bl, p]) => (window as any).__lab.run(bl, p), [b.builder, b.payload] as const);
          await page.evaluate(([bl, p]) => (window as any).__lab.run(bl, p), [b.builder, b.payload] as const);
          await pause(150);
          const frames: number[] = [];
          for (let i = 0; i < STEPS; i++) {
            const r = await page.evaluate(() => (window as any).__lab.run('base', 'combat'));
            frames.push(r.frame);
            await pause(25);
          }
          ((out[bname] ??= {})[b.label] ??= []).push(frames);
        }
        await page.evaluate(() => {
          const rows = document.querySelector('.wc-rows')!;
          let n = document.querySelectorAll('.wc-rows .wc-row').length;
          while (n > 20000 && rows.firstElementChild) {
            n -= rows.firstElementChild.childElementCount;
            rows.firstElementChild.remove();
          }
        });
      }
      await page.close();
    } finally {
      await l.browser.close();
    }
  }
} finally {
  server.close();
}
// Per block: median over reps of the frame at each step, then summarised in windows of 5 frames (20 rows).
for (const [bname, byB] of Object.entries(out)) {
  console.log(`\n== ${bname}: combat frame time (ms, median over reps) by frames since the block (each frame adds 4 rows)`);
  const W = 5;
  const header = [];
  for (let i = 0; i < STEPS; i += W) header.push(`${i}-${i + W - 1}`.padStart(8));
  console.log('  block'.padEnd(24) + header.join(''));
  for (const [label, reps] of Object.entries(byB)) {
    const perStep = Array.from({ length: STEPS }, (_, i) => median(reps.map((r) => r[i]!)));
    const cells = [];
    for (let i = 0; i < STEPS; i += W) cells.push(f2(median(perStep.slice(i, i + W))).padStart(8));
    console.log(`  ${label.padEnd(22)}${cells.join('')}`);
  }
}
console.log('\nloadavg:', loads.join(' | '));
if (arg('out', '')) writeFileSync(arg('out', ''), JSON.stringify({ out, loads }, null, 1));
