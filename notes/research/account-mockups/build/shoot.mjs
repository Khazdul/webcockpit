// Screenshots of every state, desktop (1440 × 900) and phone (390 × 844 @1.5x),
// from the combined file, as JPEG (PNG would be some 80 MB in the repository). Usage: node build/shoot.mjs [id-prefix …]
// (MK_SHOTS=<dir> writes elsewhere than shots/.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '../../../../node_modules/@playwright/test/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const file = pathToFileURL(path.join(root, 'account-mockups.html')).href;
const out = process.env.MK_SHOTS ?? path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);

const b = await chromium.launch();
const views = [
  ['d', await b.newContext({ viewport: { width: 1440, height: 900 } })],
  ['p', await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 })],
];
const first = await views[0][1].newPage();
await first.goto(file);
const states = await first.evaluate(() => window.MK_STATES);
await first.close();
const failed = [];
for (const [v, ctx] of views) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failed.push(`${v}: ${e.message}`));
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) failed.push(`network request: ${r.url()}`);
  });
  for (const s of states) {
    if (s.only && s.only !== v) continue;
    if (only.length && !only.some((p) => s.id.startsWith(p))) continue;
    await page.goto('about:blank');
    await page.goto(`${file}#${s.id}.${v}.bare`);
    const f = page.frameLocator('#sh-frame');
    await f.locator('.wc-start, .wc-app').first().waitFor();
    await page.evaluate(() => document.getElementById('sh-frame').contentDocument.fonts.ready);
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(out, `${s.id}.${v === 'd' ? 'desktop' : 'phone'}.jpg`), type: 'jpeg', quality: 70 });
  }
  await page.close();
}
await b.close();
if (failed.length) console.log('PROBLEMS\n' + [...new Set(failed)].join('\n'));
console.log('shots in', out);
