// Stage 24 A (ADR 0083): the first paint in index.html (the banner and the
// loading bar), the start page font gate, the hand-over and the reveal.
// `/` never connects until Enter MUME.
import { type Page, type Route, expect, test } from '@playwright/test';
import { holdChrome, wordmarkClips } from './first-paint';

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
      // The start page's mount (beside the first paint) is held at opacity 0 until the reveal.
      const mount = document.querySelector('.wc-mrow')?.closest<HTMLElement>('.wc-start-host > div');
      if (!ready && mount && getComputedStyle(mount).opacity !== '0') {
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

test('the banner is painted before the app loads, and the app banner takes its place pixel for pixel', async ({ page }) => {
  const release = await holdChrome(page);
  await page.goto('/', { waitUntil: 'commit' });
  const first = page.locator('#wc-first .wcf-banner .wcf-line');
  await expect(first).toHaveCount(11);
  await expect(page.locator('#wc-boot')).toHaveCSS('opacity', '1');
  // No menu row yet; the bar sits below the banner.
  await expect(page.locator('.wc-mrow')).toHaveCount(0);
  const bannerBottom = await first.last().evaluate((e) => e.getBoundingClientRect().bottom);
  const barTop = await page.locator('#wc-boot .bar').evaluate((e) => e.getBoundingClientRect().top);
  expect(barTop).toBeGreaterThan(bannerBottom);
  await page.evaluate(() => document.fonts.ready);
  const rects = await first.evaluateAll((els) => els.map((e) => JSON.stringify(e.getBoundingClientRect())));
  const clips = await wordmarkClips(page);
  const before = await Promise.all(clips.map((clip) => page.screenshot({ clip })));
  release();
  await revealed(page);
  await expect(page.locator('#wc-first')).toHaveCount(0);
  const app = page.locator('.wc-start .wc-banner .wc-line');
  expect(await app.evaluateAll((els) => els.map((e) => JSON.stringify(e.getBoundingClientRect())))).toEqual(rects);
  const after = await Promise.all(clips.map((clip) => page.screenshot({ clip })));
  for (let i = 0; i < clips.length; i++) expect(after[i]!.equals(before[i]!), `wordmark part ${i}`).toBe(true);
});

test('the menu fades in over about 2 s, the banner does not', async ({ page }) => {
  const release = await holdChrome(page);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#wc-first .wcf-banner')).toHaveCount(1);
  release();
  await expect(page.locator('html')).toHaveAttribute('data-wc-boot', 'ready');
  const fades = await page.evaluate(() =>
    document.getAnimations().map((a) => {
      const t = (a.effect as KeyframeEffect).getComputedTiming();
      const el = (a.effect as KeyframeEffect).target as HTMLElement;
      return { end: Number(t.endTime), duration: Number(t.duration), banner: el.classList.contains('wc-banner'), loader: el.id === 'wc-boot' };
    }).filter((f) => !f.loader),
  );
  expect(fades.length).toBeGreaterThan(5);
  expect(fades.some((f) => f.banner)).toBe(false);
  expect(Math.max(...fades.map((f) => f.end))).toBeGreaterThanOrEqual(1800);
  expect(Math.max(...fades.map((f) => f.end))).toBeLessThanOrEqual(2200);
  expect(Math.min(...fades.map((f) => f.duration))).toBeGreaterThanOrEqual(1000);
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
