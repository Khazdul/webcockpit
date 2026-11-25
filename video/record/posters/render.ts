// Renders the poster pages (p1.html …): 2560 × 1440 CSS px at
// deviceScaleFactor POSTER_DSF (default 2: 5120 × 2880, so neither the
// film's 1080p nor its 4K render ever enlarges them). It reports, per page,
// the smallest ratio of an image's own pixels to the device pixels it is
// drawn at: below 1 the shot is enlarged (recapture it larger, capture.ts).
//   node record/posters/render.ts [p1 p2 …]   → video/public/posters/ (POSTER_OUT)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const HERE = new URL('./', import.meta.url).pathname;
const OUT = process.env.POSTER_OUT ?? new URL('../../public/posters/', import.meta.url).pathname;
const DSF = Number(process.env.POSTER_DSF ?? 2);
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
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: DSF });
    page.on('pageerror', (e) => console.warn(`  ${p}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && console.warn(`  ${p}: ${m.text()}`));
    await page.goto(`file://${HERE}${p}.html`);
    await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const ratios = await page.evaluate((dsf) => {
      const out: { src: string; ratio: number }[] = [];
      for (const img of document.querySelectorAll('img')) {
        const r = img.getBoundingClientRect();
        if (!r.width || !img.naturalWidth) continue;
        out.push({ src: img.src.split('/').pop() ?? '', ratio: Math.min(img.naturalWidth / (r.width * dsf), img.naturalHeight / (r.height * dsf)) });
      }
      return out.sort((a, b) => a.ratio - b.ratio);
    }, DSF);
    const low = ratios.filter((x) => x.ratio < 0.999);
    console.log(`  ${p}: ${ratios.length} images, the least ratio ${ratios[0]?.ratio.toFixed(2)} (${ratios[0]?.src})${low.length ? `; enlarged: ${low.map((x) => `${x.src} ${x.ratio.toFixed(2)}`).join(', ')}` : ''}`);
    await page.screenshot({ path: `${OUT}${NAMES[p]}.png` });
    console.log(`${OUT}${NAMES[p]}.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
