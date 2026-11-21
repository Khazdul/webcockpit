// Motion check for the round 5 stage (a mockup tool): flies one notice in a
// real browser and prints the flight's trace, so the burner's lead over the
// motion and the frame pacing can be read as numbers, not guessed from stills.
//
//   node trace.mjs <skin-id|stub> [event=good] [browser=chromium|firefox] [pace=1]
//
// "stub" flies an empty box (tests the stage alone). Needs local.html
// (written by shot.mjs).
import { chromium, firefox } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [skin = 'stub', ev = 'good', which = 'chromium', pace = '1'] = process.argv.slice(2);
const browser = await (which === 'firefox' ? firefox : chromium).launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(join(here, 'local.html')).href + (skin === 'stub' ? '' : '#' + skin));
await page.waitForTimeout(500);
await page.evaluate(([skin, ev, pace]) => {
  if (skin === 'stub') {
    Harness.register({ id: 'stub', name: 'stub', create: (ctx) => ({ show() { const e = ctx.el('div'); e.style.height = '350px'; ctx.fly(e, { w: 200, h: 350 }); }, still: () => ctx.el('div'), clear() {} }) });
    Harness.choose('stub');
  }
  Harness.setPace(Number(pace));
  Harness.trace = [];
  Harness.fire(ev);
}, [skin, ev, pace]);
await page.waitForTimeout(10500 / Number(pace));
const tr = await page.evaluate(() => Harness.trace);
await browser.close();

const at = (ms) => tr.reduce((a, b) => (Math.abs(b.t - ms) < Math.abs(a.t - ms) ? b : a));
const first = (pred, from = 0) => tr.find((f) => f.t >= from && pred(f));
const leave = first((f) => f.phase === 'leave').t, read = first((f) => f.phase === 'read').t;
console.log(`${which}, ${skin}, ${ev}, pace ${pace}: ${tr.length} frames`);
console.log('  t(ms)  phase    climb(px/s)  burn');
for (let ms = 0; ms <= 10000; ms += 400) { const f = at(ms); console.log(`  ${String(f.t).padStart(5)}  ${f.phase.padEnd(7)}  ${String(-f.vy).padStart(6)}       ${'#'.repeat(Math.round(f.burn * 30))} ${f.burn}`); }
const low = first((f) => f.burn < 0.3), slow = first((f) => -f.vy < 90 * 0.3, 400);
const roar = first((f) => f.burn > 0.7, read + 500), climb = first((f) => -f.vy > 8, leave);
console.log(`arrival: flame under 0.3 at ${low.t} ms; the balloon reaches that slow a climb at ${slow.t} ms; it stops at ${read} ms  -> the flame leads by ${slow.t - low.t} ms`);
console.log(`leaving: flame over 0.7 at ${roar.t} ms; leave begins ${leave} ms; climbing over 8 px/s at ${climb.t} ms  -> the flame leads by ${climb.t - roar.t} ms`);
const gaps = tr.slice(1).map((f, i) => f.now - tr[i].now).sort((a, b) => a - b);
console.log(`frames: median ${gaps[gaps.length >> 1]} ms, 95th ${gaps[Math.floor(gaps.length * 0.95)]} ms, worst ${gaps.at(-1)} ms, over 34 ms: ${gaps.filter((g) => g > 34).length}`);
if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exit(2); }
