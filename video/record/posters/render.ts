// Renders the poster pages (p1.html …) to 2560 × 1440 PNGs.
//   node render.ts [p1 p2 …]   → /home/ole/proj/webcockpit/video/out/posters-0.23/
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const HERE = new URL('./', import.meta.url).pathname;
const OUT = '/home/ole/proj/webcockpit/video/out/posters-0.23/';
mkdirSync(OUT, { recursive: true });
// the stones of the fight card, for p3 (a file:// page cannot fetch JSON)
const all: Record<string, unknown> = {};
for (const f of ['fight-status', ...readdirSync(`${HERE}shots`).filter((n) => /^med-.*\.json$/.test(n)).map((n) => n.slice(0, -5))])
  for (const s of JSON.parse(readFileSync(`${HERE}shots/${f}.json`, 'utf8')) as { name: string }[]) all[s.name.toLowerCase()] ??= s;
writeFileSync(`${HERE}shots/stones-all.js`, `window.STONES = ${JSON.stringify(all)};`);
const NAMES: Record<string, string> = { p1: '1-faces-of-arda', p2: '2-status-stats-lore', p3: '3-the-stones' };
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(NAMES);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
try {
  for (const p of want) {
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.warn(`  ${p}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && console.warn(`  ${p}: ${m.text()}`));
    await page.goto(`file://${HERE}${p}.html`);
    await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}${NAMES[p]}.png` });
    console.log(`${OUT}${NAMES[p]}.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
