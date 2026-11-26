// Does a balloon keep flying while the main thread is busy? (stage 79, ADR 0168): node stall.mjs <firefox|chromium> [stall ms=700] [at ms=2500] [kinds,comma=great]
// PORT=<dev server port, default 5199>. Headless; the page cannot see its own compositor, so the balloon is watched from
// outside: Playwright's video of the page (25 pictures a second, taken from what the browser presents). A magenta bar is
// stuck to the top of the balloon's wrapper (`.wc-balloon::before`); `at` ms after the launch (the arrival, about 100 px/s)
// the page's main thread is blocked for `stall` ms by a busy loop. Printed: the bar's row in each picture round the block,
// the longest time the bar stood still while it should rise, and the largest step between two pictures. A flight that
// needs the main thread stands still for the whole block and then jumps; one on the compositor rises in every picture.
// With more kinds the first balloon carries the bar and the others load the machine; with a block of 0 ms and a CPU quota
// (systemd-run --user --scope -p CPUQuota=100% node stall.mjs ...) ROUGH says how evenly the balloon was presented:
// the mean change of its step from one picture to the next, px (0: a perfectly even rise).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox } from '@playwright/test';

const [which = 'firefox', stallS = '700', atS = '2500', kinds = 'great'] = process.argv.slice(2);
const stall = Number(stallS), at = Number(atS);
const port = process.env.PORT ?? '5199';
const W = 1280, H = 720;
const dir = mkdtempSync(join(tmpdir(), 'wc-stall-'));
const browser = await (which === 'firefox' ? firefox : chromium).launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } });
const page = await ctx.newPage();
await page.goto(`http://localhost:${port}/?replay`);
await page.locator('.wc-app').waitFor();
await page.evaluate(() => window.__wc.settings.update({ weather: { enabled: true, balloons: true } }));
await page.locator('.wc-cockpit > .wc-balloons').first().waitFor({ state: 'attached' });
await page.addStyleTag({ content: '.wc-balloons-front>.wc-balloon:first-child::before{content:"";position:absolute;left:0;top:0;width:204px;height:14px;background:#f0f;z-index:99}' });
await page.waitForTimeout(2500);
const t0 = Date.now();
for (const k of kinds.split(',')) {
  await page.locator('.wc-input-field').fill(`#weather balloon ${k}`);
  await page.keyboard.press('Enter');
  await page.locator('.wc-balloon').first().waitFor({ state: 'attached' });
  await page.waitForTimeout(400);
}
await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
// the block, and what the main thread's own frames saw of it
const seen = await page.evaluate(async (ms) => {
  const gaps = [];
  let last = 0, on = true;
  const loop = (ts) => { if (last) gaps.push(ts - last); last = ts; if (on) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  await new Promise((r) => setTimeout(r, 200));
  const t0 = performance.now();
  while (performance.now() - t0 < ms);
  await new Promise((r) => setTimeout(r, 300));
  on = false;
  const b = document.querySelector('.wc-balloon');
  return { worstFrame: Math.max(...gaps), animations: b.getAnimations().length, inline: b.style.transform !== '' };
}, stall);
await page.waitForTimeout(600);
await ctx.close();
await browser.close();

// every picture of the video as raw RGB; the bar's top row in each
const video = join(dir, readdirSync(dir).find((f) => f.endsWith('.webm')));
const raw = spawnSync('ffmpeg', ['-v', 'error', '-i', video, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 2 ** 31 - 1 }).stdout;
rmSync(dir, { recursive: true, force: true });
const size = W * H * 3, n = Math.floor(raw.length / size);
const rows = [];
for (let i = 0; i < n; i++) {
  let row = -1;
  for (let y = 0; y < H && row < 0; y++) {
    let hits = 0;
    for (let x = 0; x < W; x++) {
      const o = i * size + (y * W + x) * 3;
      if (raw[o] > 170 && raw[o + 1] < 110 && raw[o + 2] > 170) hits++;
    }
    if (hits > 60) row = y;
  }
  rows.push(row);
}
// from the first picture with the bar to the last one in which it moved (the video's end repeats its last picture)
const first = rows.findIndex((r) => r >= 0), all = rows.slice(first).filter((r) => r >= 0);
let end = all.length;
while (end > 1 && all[end - 1] === all[end - 2]) end--;
const up = all.slice(0, end);
let still = 0, longest = 0, step = 0, rough = 0;
for (let i = 2; i < up.length; i++) rough += Math.abs(up[i] - 2 * up[i - 1] + up[i - 2]);
for (let i = 1; i < up.length; i++) {
  if (up[i] === up[i - 1]) still++;
  else still = 0;
  longest = Math.max(longest, still);
  step = Math.max(step, Math.abs(up[i] - up[i - 1]));
}
console.log(`${which}: a ${stall} ms block ${at} ms into the flight; the main thread's worst frame ${seen.worstFrame.toFixed(0)} ms; animations on the wrapper ${seen.animations}, inline transform ${seen.inline}`);
console.log(`  the bar's row per picture (25/s): ${up.join(' ')}`);
console.log(`  STALL ${which}: stood still for at most ${longest * 40} ms, the largest step ${step} px in ${up.length} pictures`);
console.log(`  ROUGH ${which}: ${(rough / Math.max(1, up.length - 2)).toFixed(2)} px a picture`);
