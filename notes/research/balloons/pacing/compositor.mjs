// What the compositor presents while balloons fly (stage 79, ADR 0168): node compositor.mjs <kinds,comma> <out dir> [shot at s=5,9]
// PORT=<dev server port, default 5199>. Headed Firefox on Hyprland only. The page cannot count its compositor's frames
// (measure.mjs counts the main thread's), so WebRender's own profiler overlay is switched on (its FPS counter is the
// compositor's) and the browser's window, and nothing else of the screen, is photographed with grim at the given times
// after the launch. Read the numbers off the pictures. Also printed: the main thread's frames in the same seconds.
// Not yet run with the screen in use: on 2026-11-26 the screen was locked (the picture showed the lock screen, and a
// locked screen also halves every headed frame rate), so the overlay and its counters are unverified.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { firefox } from '@playwright/test';

const [kind = 'great', out = '.', atS = '5,9'] = process.argv.slice(2);
const port = process.env.PORT ?? '5199';
const browser = await firefox.launch({ headless: false, firefoxUserPrefs: { 'gfx.webrender.debug.profiler': true, 'gfx.webrender.debug.profiler-ui': 'FPS,Frame times,GPU time' } });
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();
await page.goto(`http://localhost:${port}/?replay`);
await page.locator('.wc-app').waitFor();
await page.evaluate(() => window.__wc.settings.update({ weather: { enabled: true, balloons: true } }));
await page.locator('.wc-cockpit > .wc-balloons').first().waitFor({ state: 'attached' });
await page.waitForTimeout(3000);

// this browser's own window: the client whose process descends from this one
const mine = (pid) => {
  for (let p = pid, i = 0; p > 1 && i < 12; i++) {
    if (p === process.pid) return true;
    try { p = Number(/PPid:\s+(\d+)/.exec(readFileSync(`/proc/${p}/status`, 'utf8'))[1]); } catch { return false; }
  }
  return false;
};
const win = JSON.parse(execFileSync('hyprctl', ['clients', '-j'], { encoding: 'utf8' })).find((c) => mine(c.pid));
if (!win) throw new Error('the browser window was not found');
const geom = `${win.at[0]},${win.at[1]} ${win.size[0]}x${win.size[1]}`;
const shot = (name) => execFileSync('grim', ['-g', geom, `${out}/${name}.png`]);

await page.evaluate(() => { const tr = (window.__tr = []); const loop = (ts) => { tr.push(ts); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
await page.waitForTimeout(2000);
shot('idle');
const t0 = await page.evaluate(() => performance.now());
for (const k of kind.split(',')) { await page.locator('.wc-input-field').fill(`#weather balloon ${k}`); await page.keyboard.press('Enter'); await page.waitForTimeout(400); }
let waited = 0.4 * kind.split(',').length;
for (const at of atS.split(',').map(Number)) {
  await page.waitForTimeout(Math.max(0, at - waited) * 1000);
  waited = at;
  shot(`at-${at}s`);
}
const tr = await page.evaluate(() => window.__tr);
const inline = await page.evaluate(() => [...document.querySelectorAll('.wc-balloon')].map((b) => (b.style.transform ? 'inline' : 'animation')).join(' '));
await browser.close();
const fps = (a, b) => { const f = tr.filter((t) => t >= a && t < b); return f.length > 2 ? ((f.length - 1) / ((f.at(-1) - f[0]) / 1000)).toFixed(1) : 'n/a'; };
console.log(`window ${geom}; the flights: ${inline}`);
console.log(`main thread frames (rAF): idle ${fps(t0 - 2000, t0)} fps; with ${kind}: ${fps(t0 + 2000, t0 + waited * 1000)} fps`);
