// Contact sheets of the portrait stage (a mockup tool, as
// notes/research/balloons/round5/shot.mjs).
//
//   node notes/research/portraits/stage/shot.mjs <group|all> [out-dir] [port]
//
// Needs the worktree's Vite dev server on <port> (default $WC_E2E_PORT, else
// 5191; never 5173, the owner's). Writes <out-dir>/<group>.png (the whole
// sheet at 2×) and <out-dir>/<group>-medium.png (only the Medium columns at
// 3×, to judge the small size). Exits 2 on any page error.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [group = 'all', outDir = join(here, '..', 'sheets'), port = process.env.WC_E2E_PORT ?? '5191'] = process.argv.slice(2);
if (port === '5173') { console.error('never 5173'); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const url = (extra = '') => `http://localhost:${port}/notes/research/portraits/stage/?g=${group}${extra}`;

const browser = await chromium.launch();
const errors = [];
async function sheet(file, extra, scale) {
  const page = await browser.newPage({ viewport: { width: 2400, height: 1200 }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url(extra));
  await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 60000 });
  await page.locator('table.sheet').screenshot({ path: join(outDir, file) });
  await page.close();
}
await sheet(`${group}.png`, '', 2);
await sheet(`${group}-medium.png`, '&raw=0&medium=1', 3);
await browser.close();
if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exit(2); }
console.log('ok', join(outDir, `${group}.png`));
