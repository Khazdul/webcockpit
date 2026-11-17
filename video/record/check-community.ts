// Checks the captured community content as a recording page sees it
// (record/lib/community.ts), off camera:
//
//   WC_VIDEO_PORT=5191 node record/check-community.ts      → out/community-check/*.png
//
// The start page, the Community page (a guest, the site's flags), the list
// sorted by stars, the watch page of the newest real run, and the phone's
// dashboard. Fails when a page shows a name or line of the e2e fakes' own
// seeds (tests/e2e/community.ts): only the captured content may show.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { devServer } from '../../scripts/lib/dev-server.ts';
import { sleep, startMenu } from '../../scripts/lib/mume-feed.ts';
import { DEFAULT_MODE, MODES, launch, newPage } from './lib/browser.ts';
import { communityServer, serveCommunity } from './lib/community.ts';

const VIDEO = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(VIDEO, 'out', 'community-check');
const PORT = Number(process.env.WC_VIDEO_PORT ?? 5191);
const BASE = `http://localhost:${PORT}`;
/** The e2e fakes' invented community (tests/e2e/community.ts, scripts/screenshots.ts): none of it may show. */
const FAKE_SEEDS = ['fenwick', 'marrowfield', 'brego', 'saelind', 'quillon', 'hollin', 'tamsin', 'kuzzim', 'galdor', 'orrin', 'Grishvak', 'Arwenel', 'Durlin', 'Witch-king', 'ranger camp', 'lembas', 'Nice fight'];

mkdirSync(OUT, { recursive: true });
const server = await devServer(PORT);
const browser = await launch(MODES[DEFAULT_MODE]!);
const problems: string[] = [];

async function shot(page: Page, name: string): Promise<void> {
  await sleep(1500);
  const text = await page.evaluate(() => document.body.innerText + [...document.querySelectorAll('iframe')].map((f) => f.contentDocument?.body?.innerText ?? '').join('\n'));
  for (const s of FAKE_SEEDS) if (text.toLowerCase().includes(s.toLowerCase())) problems.push(`${name}: shows the fake seed "${s}"`);
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${file}`);
}

async function morphDone(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector('.wc-start')?.hasAttribute('data-lk-morph'));
  await page.locator('.wc-lk-morph').waitFor({ state: 'hidden' });
}

const cy = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-cy');

async function openCommunity(page: Page): Promise<void> {
  await page.goto('/?cloudtest');
  await startMenu(page);
  await page.mouse.move(1, 1);
  await page.locator('.wc-start .wc-sm-item[data-key="community"]').waitFor();
  await morphDone(page);
}

try {
  const c = await communityServer();
  const run = c.runs[0];
  if (!run) throw new Error('the capture has no listed run');
  console.log(`captured ${new Date(c.capture.capturedAt).toISOString()} from ${c.capture.site}: ${c.runs.length} run(s), ${c.capture.runes.notes.length} note(s)`);

  // Desktop: the start page, the Community page, the list by stars, the watch page.
  {
    const { ctx, page } = await newPage(browser, MODES[DEFAULT_MODE]!, BASE, { now: c.pageNow(5), seed: 1 });
    await serveCommunity(page, c);
    await openCommunity(page);
    await shot(page, '1-start');
    await page.keyboard.press('c');
    await cy(page).waitFor();
    await page.waitForFunction(() => {
      const l = document.querySelector('.wc-start .wc-frame:not([hidden]) .wc-cy .wc-cy-list');
      return l !== null && l.getAttribute('data-state') !== 'loading';
    });
    await cy(page).locator('.wc-cy-row').first().waitFor();
    await cy(page).locator('.wc-cy-note').first().waitFor();
    await cy(page).locator('[data-box="players"]').waitFor();
    await morphDone(page);
    await page.mouse.move(1595, 895);
    await shot(page, '2-community');
    // The list by stars (Top: what the Hall of Fame ranks by).
    await cy(page).locator('.wc-cy-th[data-sort="top"]').click();
    await sleep(500);
    await page.mouse.move(1595, 895);
    await shot(page, '3-community-by-stars');
    // The run's watch page, as a press on its row opens it.
    await cy(page).locator('.wc-cy-row').first().click();
    await page.waitForURL(`**/r/${run.id}**`);
    await page.locator('.wc-watch-page[data-watch="playing"]').waitFor({ timeout: 30_000 });
    await page.frameLocator('.wc-watch-slot iframe').locator('.wc-player').waitFor({ timeout: 30_000 });
    await sleep(3000);
    await page.mouse.move(1595, 895);
    await shot(page, '4-watch');
    await ctx.close();
  }

  // The phone's dashboard (the Hall of Fame has its own sub-page there).
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, baseURL: BASE, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await serveCommunity(page, c);
    await openCommunity(page);
    await page.keyboard.press('c');
    await cy(page).waitFor();
    await cy(page).locator('[data-box="newest"]').waitFor();
    await sleep(1000);
    await shot(page, '5-phone-community');
    await ctx.close();
  }
} finally {
  await browser.close();
  server?.kill();
}

if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('no fake seed shown');
