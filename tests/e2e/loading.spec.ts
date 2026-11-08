// Stage 24 A (ADR 0083) and stage 41d (its 2026-11-07 addendum): the first
// paint in index.html (the start page's sky, its wordmark and a loading
// panel), the start page font gate, the hand-over and the reveal. `/`
// never connects until Enter MUME. At the hand-over the first paint's sky
// and wordmark go and the start page's identical ones, at the same place,
// are under them; the menu, the quote and the almanac fade in.
import { type Page, type Route, expect, test } from '@playwright/test';
import { checkHandOver, holdChrome } from './first-paint';
import { NO_STATE } from './legacy-state';

const rows = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm-item');

/** The page's animations, without the sky's and the wordmark's own (they run while the page shows). */
const PAGE_ANIMS = `document.getAnimations().filter((a) => {
  const t = a.effect && a.effect.target;
  return !(t && t.closest && t.closest('.wc-start-skyhost, .wc-start-brand'));
})`;

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
      const mount = document.querySelector('.wc-sm-item')?.closest<HTMLElement>('.wc-start-host > div');
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
  await page.waitForFunction(`${PAGE_ANIMS}.length === 0`);
}

test('the loader shows the boot steps and is removed once the start page is up', async ({ page }) => {
  const log: { file: string; at: number }[] = [];
  await delayFont(page, /\/fonts\/DejaVuSansMono\.woff2$/, 1200, log);
  await page.goto('/', { waitUntil: 'commit' });
  const loader = page.locator('#wc-boot');
  await expect(loader).toHaveCSS('opacity', '1');
  await expect(loader.locator('.bar .f')).toHaveCount(1);
  // Settings are read and the entry script has run: the line has moved.
  await expect.poll(async () => Number(await loader.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(40);
  await expect(loader.locator('.l')).toContainText('%');
  await revealed(page);
  await expect(rows(page)).toHaveCount(7);
});

test('the first paint shows the sky and the wordmark before the app loads; the hand-over moves nothing', async ({ page }) => {
  await checkHandOver(page, '?skyMonth=4&skyHour=7.3&skyWeather=clear&skyFreeze');
  await expect(page.locator('#wc-first')).toHaveCount(0);
  // The pixel banner is gone from the start page.
  await expect(page.locator('.wc-start .wc-banner')).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-start-skyhost')).toHaveCount(1);
  await expect(rows(page)).toHaveCount(7);
});

test('on a short window the first paint leaves the wordmark out, as the start page does', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 540 });
  const release = await holdChrome(page);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#wc-boot.wcf-panel')).toHaveCSS('opacity', '1');
  await expect(page.locator('#wc-first .wcf-brand')).toBeHidden();
  const top = await page.locator('#wc-boot').evaluate((e) => e.getBoundingClientRect().top);
  release();
  await expect(page.locator('html')).toHaveAttribute('data-wc-boot', 'ready');
  expect(await page.locator('.wc-sm-panel').evaluate((e) => e.getBoundingClientRect().top)).toBeCloseTo(top, 0);
});

test('the offline modes get the loading line alone, over the terminal background', async ({ page }) => {
  const release = await holdChrome(page);
  await page.goto('/?fixture=/fixtures/does-not-exist.txt', { waitUntil: 'commit' });
  await expect(page.locator('#wc-first.wcf-overlay #wc-boot')).toHaveCount(1);
  await expect(page.locator('#wc-first .wcf-sky, #wc-first .wcf-brand, #wc-boot.wcf-panel')).toHaveCount(0);
  release();
});

test('the start page fades in as one block over about 1.35 s', async ({ page }) => {
  const release = await holdChrome(page);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#wc-first .wcf-sky')).toHaveCount(1);
  release();
  await expect(page.locator('html')).toHaveAttribute('data-wc-boot', 'ready');
  const fades = await page.evaluate(() =>
    document.getAnimations().map((a) => {
      const t = (a.effect as KeyframeEffect).getComputedTiming();
      const el = (a.effect as KeyframeEffect).target as HTMLElement;
      return {
        end: Number(t.endTime),
        delay: Number(t.delay),
        main: el.classList.contains('wc-start-main'),
        almanac: el.classList.contains('wc-start-almanac'),
        loader: !!el.closest('#wc-first'),
        // the sky host or the wordmark's box themselves, not their own animations inside
        painted: el.matches('.wc-start-skyhost, .wc-start-scenery, .wc-start-brand'),
        inSky: !!el.closest('.wc-start-skyhost, .wc-start-brand'),
      };
    }).filter((f) => !f.loader && (f.painted || !f.inSky)),
  );
  // The menu and the almanac together: nothing leads. The sky and the
  // wordmark were on screen already (the first paint's), so they do not fade.
  expect(fades.some((f) => f.main)).toBe(true);
  expect(fades.some((f) => f.almanac)).toBe(true);
  expect(fades.some((f) => f.painted)).toBe(false);
  for (const f of fades) expect(f).toMatchObject({ delay: 0, end: fades[0]!.end });
  expect(fades[0]!.end).toBeGreaterThanOrEqual(1250);
  expect(fades[0]!.end).toBeLessThanOrEqual(1450);
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
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
});

/**
 * Records per frame, in the page, every menu row's effective opacity (its
 * own and its ancestors'), and the font faces still loading.
 */
async function sampleRows(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type S = { ready: boolean; rows: number[]; sel: number; loading: string[] };
    const log: S[] = [];
    (window as unknown as { __rows: S[] }).__rows = log;
    const eff = (el: Element): number => {
      let o = 1;
      for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    let readyAt = 0;
    const tick = (): void => {
      const rows = [...document.querySelectorAll('.wc-start-main .wc-sm-item')];
      const ready = document.documentElement.dataset.wcBoot === 'ready';
      if (rows.length) {
        log.push({
          ready,
          rows: rows.map(eff),
          sel: rows.findIndex((r) => r.classList.contains('is-sel')),
          loading: [...document.fonts].filter((f) => f.status === 'loading').map((f) => `${f.family} ${f.weight}`),
        });
      }
      if (ready && !readyAt) readyAt = performance.now();
      if (!readyAt || performance.now() - readyAt < 2500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

test.describe('a new install (Hack, with the DejaVu fallback face)', () => {
  test.use({ storageState: NO_STATE });

  // Owner, stage 24 rounds 1 and 2: on Regular 3G `<< Enter MUME >>` showed
  // first and the other rows came later. The fallback face (DejaVu Sans
  // Mono, for glyphs Hack lacks) began loading only when the start page
  // was laid out, after the gate; while it loaded, font-display: block hid
  // every regular-weight text, so only the bold selected row (and the
  // italic quote) faded in.
  test('slow fallback face: no row shows before the others, at any moment', async ({ page }) => {
    const log: { file: string; at: number }[] = [];
    await sampleRows(page);
    await delayFont(page, /\/fonts\/DejaVuSansMono\.woff2$/, 2500, log);
    await page.goto('/', { waitUntil: 'commit' });
    // Not a pixel check: Playwright's screenshots wait for the fonts, so they never show the hidden rows.
    await expect(page.locator('html')).toHaveAttribute('data-wc-boot', 'ready', { timeout: 15_000 });
    await revealed(page);
    const samples = await page.evaluate(() => (window as unknown as { __rows: { ready: boolean; rows: number[]; sel: number; loading: string[] }[] }).__rows);
    expect(log.map((l) => l.file)).toContain('/fonts/DejaVuSansMono.woff2');
    // Enough frames to judge (headless Firefox under parallel load draws the sky and the glass slowly).
    expect(samples.length).toBeGreaterThan(10);
    for (const s of samples) {
      const top = Math.max(...s.rows);
      if (!s.ready) expect(top, 'a menu row before the reveal').toBe(0);
      // The selected row (or any row) never leads the others.
      expect(top - Math.min(...s.rows), `rows ${s.rows.join(' ')}, selected ${s.sel}`).toBeLessThanOrEqual(0.02);
      // A face still loading hides all text of its style: none while the rows are on screen.
      if (top > 0) expect(s.loading, 'a font face loading while the menu shows').toEqual([]);
    }
    expect(samples.some((s) => s.ready && Math.max(...s.rows) > 0 && Math.max(...s.rows) < 1)).toBe(true);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the start page appears without fades', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-wc-boot', 'ready');
    expect(await page.evaluate(`${PAGE_ANIMS}.filter((a) => a.playState === 'running').length`)).toBe(0);
    await expect(rows(page)).toHaveCount(7);
  });
});

test('returning to the start page from the game does not fade again', async ({ page }) => {
  await page.routeWebSocket('wss://mume.org/ws-play/', () => {});
  await page.goto('/');
  await revealed(page);
  await expect(page.locator('.wc-start-sky')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toBeVisible();
  // The sky engine is not kept while the game runs (ADR 0125 addendum);
  // it goes when Enter MUME's transition is over.
  await expect(page.locator('.wc-start-sky')).toHaveCount(0, { timeout: 10_000 });
  // Enter MUME's own short fade of the cockpit.
  await page.waitForFunction(`${PAGE_ANIMS}.length === 0`);
  await page.evaluate(() => window.__wc!.shell.exitSession());
  await expect(rows(page)).toHaveCount(7);
  await expect(page.locator('.wc-start-sky')).toHaveCount(1);
  expect(await page.evaluate(`${PAGE_ANIMS}.filter((a) => a.playState === 'running').length`)).toBe(0);
});
