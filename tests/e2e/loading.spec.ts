// Stage 24 A (ADR 0083): the boot loader in index.html and the start page
// font gate and reveal. `/` never connects until Enter MUME.
import { type Page, type Route, expect, test } from '@playwright/test';

const rows = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-mrow');

/** Holds font files matching `name` for `ms` before serving them. */
async function delayFont(page: Page, name: RegExp, ms: number, log: { file: string; at: number }[]): Promise<void> {
  await page.route(name, async (route: Route) => {
    await new Promise((r) => setTimeout(r, ms));
    log.push({ file: new URL(route.request().url()).pathname, at: Date.now() });
    await route.continue();
  });
}

/**
 * Records, in the page, whether a menu row was ever shown before the
 * reveal, and which faces were loaded when the reveal happened.
 */
async function watchReveal(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __reveal: { early: boolean; regular?: boolean; bold?: boolean; loaderSeen: boolean } };
    w.__reveal = { early: false, loaderSeen: false };
    const tick = (): void => {
      const ready = document.documentElement.dataset.wcBoot === 'ready';
      if (document.getElementById('wc-boot')) w.__reveal.loaderSeen = true;
      const host = document.querySelector<HTMLElement>('.wc-start-host');
      if (!ready && host && document.querySelector('.wc-mrow') && getComputedStyle(host).opacity !== '0') {
        w.__reveal.early = true;
      }
      if (ready && w.__reveal.regular === undefined) {
        w.__reveal.regular = document.fonts.check('15px "DejaVu Sans Mono"', '█');
        w.__reveal.bold = document.fonts.check('bold 15px "DejaVu Sans Mono"', '█');
      }
      if (!ready) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function revealed(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-wc-boot', 'ready');
  await expect(page.locator('#wc-boot')).toHaveCount(0);
  // The fades have finished.
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

test('the loader shows the boot steps and is removed once the start page is up', async ({ page }) => {
  const log: { file: string; at: number }[] = [];
  await delayFont(page, /\/fonts\/DejaVuSansMono\.woff2$/, 1200, log);
  await page.goto('/', { waitUntil: 'commit' });
  const loader = page.locator('#wc-boot');
  await expect(loader).toHaveCSS('opacity', '1');
  await expect(loader.locator('.bar .f, .bar .t')).toHaveCount(2);
  // Settings are read and the entry script has run: the bar has moved.
  await expect.poll(async () => Number(await loader.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(40);
  await revealed(page);
  await expect(rows(page)).toHaveCount(7);
});

test('after the reveal every menu row is shown in full', async ({ page }) => {
  await page.goto('/');
  await revealed(page);
  await expect(rows(page)).toHaveCount(7);
  for (const el of await rows(page).all()) {
    await expect(el).toBeVisible();
    expect(await el.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  }
  expect(await page.locator('.wc-start-host').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
});

test('slow fonts: the menu waits for both the regular and the bold face, then shows them together', async ({ page }) => {
  const log: { file: string; at: number }[] = [];
  await watchReveal(page);
  // Bold first, as on a phone where it happened to land first.
  await delayFont(page, /\/fonts\/DejaVuSansMono-Bold\.woff2$/, 400, log);
  await delayFont(page, /\/fonts\/DejaVuSansMono\.woff2$/, 1600, log);
  await page.goto('/');
  await revealed(page);
  const r = await page.evaluate(() => (window as unknown as { __reveal: object }).__reveal);
  expect(r).toMatchObject({ early: false, regular: true, bold: true, loaderSeen: true });
  expect(log.map((l) => l.file).sort()).toEqual(['/fonts/DejaVuSansMono-Bold.woff2', '/fonts/DejaVuSansMono.woff2']);
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the start page appears without fades', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-wc-boot', 'ready');
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
    await expect(rows(page)).toHaveCount(7);
  });
});

test('returning to the start page from the game does not fade again', async ({ page }) => {
  await page.routeWebSocket('wss://mume.org/ws-play/', () => {});
  await page.goto('/');
  await revealed(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toBeVisible();
  await page.evaluate(() => window.__wc!.shell.exitSession());
  await expect(rows(page)).toHaveCount(7);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});
