// Screenshots of one skin in the round 5 stage (a mockup tool).
//
//   node shot.mjs <skin-id> <out-dir> [sky=night]
//   node shot.mjs <skin-id> <out-dir> <sky> <event> <ms>[,<ms>…]   one event (or
//     several, '+' between: superb+death), a stage shot at each time: -<event>-<ms>.png
//
// Writes <out-dir>/<skin>-<sky>-sheet.png (every notice at rest), and stage
// shots: -read.png (a superb kill and a death, readable), -burst.png (four
// kills joined), -moments.png (level up, achievement, poor), -leave.png (a
// good kill 8.3 s in, on its way out). Also writes local.html beside
// index.html: the same page with a doctype, for opening from disk.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [skin, outDir = join(here, 'shots'), sky = 'night', oneEv, oneMs] = process.argv.slice(2);
if (!skin) { console.error('usage: node shot.mjs <skin-id> <out-dir> [sky]'); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const local = join(here, 'local.html');
writeFileSync(local, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>\n${readFileSync(join(here, 'index.html'), 'utf8')}\n</body></html>\n`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(local).href + '#' + skin);
await page.evaluate(() => document.fonts.ready);
await page.evaluate((s) => Harness.setSky(s), sky);
const name = (part) => join(outDir, `${skin}-${sky}-${part}.png`);
const stage = page.locator('#stage');
const fire = (...evs) => page.evaluate((list) => list.forEach((e) => Harness.fire(e)), evs);

await page.waitForTimeout(600);
if (oneEv) {
  await fire(...oneEv.split('+'));
  let at = 0;
  for (const ms of oneMs.split(',').map(Number)) { await page.waitForTimeout(ms - at); at = ms; await stage.screenshot({ path: name(`${oneEv}-${ms}`) }); }
  await browser.close();
  if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exit(2); }
  console.log('ok', outDir); process.exit(0);
}
await page.locator('#sheet').screenshot({ path: name('sheet') });

await fire('superb'); await page.waitForTimeout(900); await fire('death');
await page.waitForTimeout(4300); await stage.screenshot({ path: name('read') });
await fire('clear');

await fire('burst'); await page.waitForTimeout(5400); await stage.screenshot({ path: name('burst') });
await fire('clear');

await fire('levelup'); await page.waitForTimeout(800); await fire('achievement'); await page.waitForTimeout(800); await fire('poor');
await page.waitForTimeout(4000); await stage.screenshot({ path: name('moments') });
await fire('clear');

await fire('good'); await page.waitForTimeout(8300); await stage.screenshot({ path: name('leave') });

await browser.close();
if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exit(2); }
console.log('ok', outDir);
