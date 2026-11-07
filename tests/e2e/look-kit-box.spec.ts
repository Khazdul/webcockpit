// Stage 42a (ADR 0127): layout B "Rummet växer" and the box variants, on
// the kit gallery's Box section. The menu grows into the large box (the
// wordmark lifts away, the almanac fades) and shrinks back; the page has
// its final size from its first frame; keys reach the page during a morph;
// reduced motion is a fade; a capped box is centred; a tall box reaches the
// bottom margin; two large boxes swap; the sky calms behind a large box.
import { type Page, expect, test } from '@playwright/test';
import { boxLogs, morphDone, morphProxy, openBoxDemo, openKit, reducedMotion, startTop } from './look';

const sky = 'skyMonth=4&skyHour=21&skyWeather=fair';

interface Watched {
  /** The proxy flew (it was shown at some point: a MutationObserver, not the frame sampling). */
  flew: boolean;
  /** Per animation frame (a headless browser under load paints few): the proxy, the top box's size, the wordmark. */
  frames: { proxy: boolean; box: string | null; brand: number }[];
}

/** Records, for `ms` after `act`, whether the proxy flew, and every frame the top box's size and the wordmark. */
async function watch(page: Page, act: () => Promise<void>, ms = 1500): Promise<Watched> {
  await page.evaluate((ms) => {
    const px = document.querySelector<HTMLElement>('.wc-lk-morph')!;
    const w: Watched = { flew: false, frames: [] };
    (window as unknown as { __watch: Watched }).__watch = w;
    const mo = new MutationObserver(() => {
      if (!px.hidden) w.flew = true;
    });
    mo.observe(px, { attributes: true, attributeFilter: ['hidden'] });
    setTimeout(() => mo.disconnect(), ms);
    const out = w.frames;
    const t0 = performance.now();
    const tick = (): void => {
      const box = document.querySelector('.wc-start .wc-frame:not([hidden]):last-child .wc-lk-box');
      const r = box?.getBoundingClientRect();
      out.push({
        proxy: !px.hidden && getComputedStyle(px).visibility === 'visible',
        box: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null,
        brand: Number(getComputedStyle(document.querySelector('.wc-start-brand')!).opacity),
      });
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  await act();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => (window as unknown as { __watch: Watched }).__watch);
}

test('the menu grows into the large box and shrinks back; the wordmark lifts away and settles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKit(page, 'box');
  await morphDone(page);
  const start = page.locator('.wc-start');
  await expect(start).toHaveClass(/\bis-large\b/);
  await expect(page.locator('.wc-start-brand')).toHaveCSS('opacity', '0');
  await expect(page.locator('.wc-start-almanac')).toHaveCSS('opacity', '0');

  // Back: the proxy shrinks into the panel, the menu and the wordmark come back.
  const close = await watch(page, () => page.keyboard.press('Escape'));
  expect(close.flew).toBe(true);
  await morphDone(page);
  await expect(start).toHaveClass(/\bis-main\b/);
  await expect(page.locator('.wc-start-brand')).toHaveCSS('opacity', '1');
  await expect(startTop(page).locator('.wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');

  // `k` on the menu opens the gallery again: the box has its final size from its first frame.
  const open = await watch(page, () => page.keyboard.press('k'));
  expect(open.flew).toBe(true);
  const sizes = [...new Set(open.frames.map((f) => f.box).filter((b) => b && b !== '360x399'))];
  expect(sizes).toHaveLength(1);
  // The wordmark lifts away while the box grows.
  expect(open.frames.at(-1)!.brand).toBe(0);
  await morphDone(page);
  await expect(startTop(page).locator('.wc-kit')).toBeVisible();
  expect(errors).toEqual([]);
});

test('every demo box measures one size from its mount, settles, and takes keys during the morph', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKit(page, 'box');
  await morphDone(page);
  // Large → tall normal: a close morph (the box shrinks to the tall box). Keys go to the new page at once.
  await openBoxDemo(page, 'tall');
  await expect(page.locator('.wc-start')).toHaveAttribute('data-lk-morph', 'close');
  await page.keyboard.press('x');
  await page.keyboard.press('x');
  await expect(startTop(page).locator('.wc-kb-keys')).toHaveAttribute('data-keys', '2');
  await expect(startTop(page).locator('.wc-kb-settled')).toHaveAttribute('data-settled', '1');
  await page.keyboard.press('Escape');
  await morphDone(page);
  for (const id of ['large', 'capped']) {
    await openBoxDemo(page, id);
    await expect(startTop(page).locator('.wc-kb-settled')).toHaveAttribute('data-settled', '1');
    await page.keyboard.press('Escape');
    await morphDone(page);
  }
  const logs = await boxLogs(page);
  expect(logs.map((l) => l.title)).toEqual(['Tall', 'Large', 'Capped']);
  for (const l of logs) {
    expect(l.sizes, l.title).toHaveLength(1);
    expect(l.settledAt, l.title).not.toBeNull();
  }
  expect(logs[0]!.keys).toBe(2);
});

test('with reduced motion the box fades: no proxy, nothing grows', async ({ page }) => {
  await reducedMotion(page);
  await openKit(page, 'box');
  await morphDone(page);
  const close = await watch(page, () => page.keyboard.press('Escape'), 800);
  expect(close.flew).toBe(false);
  expect(close.frames.some((f) => f.proxy)).toBe(false);
  await expect(page.locator('.wc-start')).toHaveClass(/\bis-main\b/);
  const open = await watch(page, () => page.keyboard.press('k'), 800);
  expect(open.flew).toBe(false);
  await expect(page.locator('.wc-start')).toHaveAttribute('data-lk-box', 'large');
  // Settled at once.
  await openBoxDemo(page, 'large');
  await expect(startTop(page).locator('.wc-kb-settled')).toHaveAttribute('data-settled', '1');
});

test('a capped box stops at 1180 px, centred, on a wide window; the sky stays at its full rate', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1200 });
  await page.goto(`/?kit=box&${sky}`);
  await expect(startTop(page).locator('.wc-kit-section[data-section="box"]')).toBeVisible();
  await morphDone(page);
  const box = await openBoxDemo(page, 'capped');
  await morphDone(page);
  const r = (await box.boundingBox())!;
  expect(Math.round(r.width)).toBe(1180);
  expect(Math.abs(r.x - (2560 - 1180) / 2)).toBeLessThan(1.5);
  await expect(page.locator('.wc-start-skyhost [data-sky-rate="calm"]')).toHaveCount(0);
});

test('a large box over most of the view calms the sky; Back restores its rate', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/?kit=box&${sky}`);
  await expect(startTop(page).locator('.wc-kit-section[data-section="box"]')).toBeVisible();
  await expect(page.locator('.wc-start-skyhost [data-sky-rate="calm"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start-skyhost [data-sky-rate="full"]')).toHaveCount(1);
});

test('a tall box grows to the bottom margin under the smaller wordmark', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKit(page, 'box');
  await morphDone(page);
  const box = await openBoxDemo(page, 'tall');
  await morphDone(page);
  await expect(page.locator('.wc-start')).toHaveClass(/\bis-sub\b/);
  const r = (await box.boundingBox())!;
  const brand = (await page.locator('.wc-start-brand .wc-wordmark').boundingBox())!;
  expect(r.y).toBeGreaterThan(brand.y + brand.height * 0.5);
  // The bottom margin: --lk-box-m (clamp(12px, 1.9vw, 28px) = 27.36 px at 1440).
  expect(900 - (r.y + r.height)).toBeGreaterThan(10);
  expect(900 - (r.y + r.height)).toBeLessThan(30);
});

test('two large boxes swap: the box stays, a new width morphs, Back returns', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKit(page, 'box');
  await morphDone(page);
  const history = await openBoxDemo(page, 'swap');
  await morphDone(page);
  expect(Math.round((await history.boundingBox())!.width)).toBe(1180);
  const swap = await watch(page, () => page.keyboard.press('n'), 900);
  expect(swap.flew).toBe(true);
  // The wordmark never shows between the two.
  expect(swap.frames.every((f) => f.brand === 0)).toBe(true);
  const top = startTop(page).locator('.wc-lk-box');
  await expect(top.locator('.wc-lk-hood-t')).toHaveText('Export');
  await morphDone(page);
  expect(Math.round((await top.boundingBox())!.width)).toBeGreaterThan(1300);
  await page.keyboard.press('Escape');
  await morphDone(page);
  await expect(startTop(page).locator('.wc-lk-box .wc-lk-hood-t')).toHaveText('History');
  await expect(morphProxy(page)).toBeHidden();
});
