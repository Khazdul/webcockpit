// Screenshots of every state from the combined file, as JPEG: desktop
// (1440 × 900) and phone (390 × 844 @1.5x). Round 9, after round 8's. Usage: node build/shoot.mjs [id-prefix …]
// (MK_SHOTS=<dir> writes elsewhere than shots/.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '../../../../../node_modules/@playwright/test/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const file = pathToFileURL(path.join(root, 'start-menu-round9.html')).href;
const out = process.env.MK_SHOTS ?? path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);

const b = await chromium.launch();
const views = [
  ['d', 'desktop', await b.newContext({ viewport: { width: 1440, height: 900 } })],
  ['p', 'phone', await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 })],
];
const first = await views[0][2].newPage();
await first.goto(file);
const states = await first.evaluate(() => window.MK_STATES);
await first.close();
const failed = [];
let n = 0;
for (const [v, name, ctx] of views) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failed.push(`${v}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') failed.push(`${v} console: ${m.text()}`);
  });
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) failed.push(`network request: ${r.url()}`);
  });
  for (const s of states) {
    if (s.noshot || !s.views.includes(v)) continue;
    if (only.length && !only.some((p) => s.id.startsWith(p))) continue;
    await page.goto('about:blank');
    await page.goto(`${file}#${s.id}.${v}.bare`);
    const f = page.frameLocator('#sh-frame');
    await f.locator('.wc-start').first().waitFor();
    await page.evaluate(() => document.getElementById('sh-frame').contentDocument.fonts.ready);
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(out, `${s.id}.${name}.jpg`), type: 'jpeg', quality: 70 });
    n++;
  }
  await page.close();
}
await b.close();
if (failed.length) console.log('PROBLEMS\n' + [...new Set(failed)].join('\n'));
console.log(n, 'shots in', out);
