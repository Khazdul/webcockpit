// Writes notes/research/portraits/mockup.html: the stage's sheet as one
// standalone file (opens from disk, no server), every portrait in Large and
// Medium, dark and Paper, man and woman, in the card's real frame. The baked
// images are re-encoded as WebP data URLs to keep the file small.
//
//   node notes/research/portraits/stage/mockup.mjs [port]
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = process.argv[2] ?? process.env.WC_E2E_PORT ?? '5191';
if (port === '5173') { console.error('never 5173'); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${port}/notes/research/portraits/stage/?g=all&raw=0&mock=1`);
await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 180000 });
const html = await page.evaluate(async () => {
  // Re-encode every baked image (PNG) as WebP.
  for (const img of document.querySelectorAll('img')) {
    if (!img.src.startsWith('data:image/png')) continue;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    img.src = c.toDataURL('image/webp', 0.86);
  }
  const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  // The XL column is left out (the mockup is Large and Medium).
  const t = document.querySelector('table.sheet').cloneNode(true);
  const xl = [...t.rows[0].cells].map((c, i) => (/XL/.test(c.textContent) ? i : -1)).filter((i) => i >= 0).reverse();
  for (const row of t.rows) for (const i of xl) row.cells[i]?.remove();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portrait Mockup</title><style>${css}</style></head><body><h1>WebCockpit portraits — the night pass</h1><p class="note">Every portrait in the Character card's round frame with its level ring: Large (100 px) and Medium (40 px), dark and Paper, man and woman. The neutral figure is one. Baked once as the app does; this page is a snapshot (WebP), open it from disk.</p>${t.outerHTML}</body></html>`;
});
await browser.close();
const out = join(here, '..', 'mockup.html');
writeFileSync(out, html);
console.log('wrote', out, (html.length / 1048576).toFixed(1), 'MB');
