// Stage 65, owner feedback round 2 (ADR 0155, "As built — feedback round 2,
// start-menu chrome"): on a phone a box's Back lay on the iron frame (its
// 40 px box grew up over the frame's top). Back is now drawn inside the lit
// window's inner border with air on every side, and its 40 px touch target
// is an invisible ::before that grows upward only. Checked on several
// start-menu pages and the watch page, portrait and landscape.
//
// `phone` project (Pixel 7: touch). Nothing reaches MUME.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { openWatch, setUp, watchBox } from './watch-page';

const AIR = 4;
const TARGET = 40;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];
const PAGES = ['profile', 'scripts', 'history', 'about'];

const startTop = (page: Page): Locator => page.locator('.wc-start .wc-frame:not([hidden])');

/**
 * `box`'s Back lies inside its window's inner border box (inside the
 * window's 1 px border) with at least `AIR` px on the top and left, and a
 * tap `TARGET` px above its bottom edge still lands on it.
 */
async function backInside(box: Locator): Promise<void> {
  const g = await box.evaluate((el) => {
    const back = el.querySelector<HTMLElement>(':scope > .wc-lk-back')!;
    const win = el.querySelector<HTMLElement>(':scope > .wc-lk-win')!;
    const b = back.getBoundingClientRect();
    const w = win.getBoundingClientRect();
    const cs = getComputedStyle(win);
    const inner = {
      left: w.left + parseFloat(cs.borderLeftWidth),
      top: w.top + parseFloat(cs.borderTopWidth),
      right: w.right - parseFloat(cs.borderRightWidth),
    };
    return { b: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, inner };
  });
  expect(g.b.top - g.inner.top, 'air above Back').toBeGreaterThanOrEqual(AIR);
  expect(g.b.left - g.inner.left, 'air left of Back').toBeGreaterThanOrEqual(AIR);
  expect(g.inner.right - g.b.right, 'air right of Back').toBeGreaterThanOrEqual(AIR);
  // The touch target: a finger's height, from Back's bottom edge upward.
  const hit = await box.page().evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.closest('.wc-lk-back') !== null,
    [g.b.left + 10, g.b.bottom - TARGET + 1],
  );
  expect(hit, 'touch target 40 px high').toBe(true);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}×${vp.height}`, () => {
    test.use({ viewport: vp });

    test('a start-menu page\'s Back lies inside the window, with air', async ({ page }) => {
      await page.goto('/?phone=1');
      await expect(startTop(page).locator('.wc-sm-item[data-key="enter"]')).toBeVisible();
      for (const key of PAGES) {
        const row = startTop(page).locator(`.wc-sm-item[data-key="${key}"]`);
        await row.tap();
        await expect(row).toBeHidden();
        const box = startTop(page).locator('.wc-lk-box').first();
        await expect(page.locator('.wc-start')).not.toHaveAttribute('data-lk-morph', /./, { timeout: 5000 });
        await expect(box.locator(':scope > .wc-lk-back')).toBeVisible();
        await backInside(box);
        await box.locator(':scope > .wc-lk-back').tap();
        await expect(startTop(page).locator('.wc-sm-item[data-key="enter"]')).toBeVisible();
      }
    });

    test('the watch page\'s Back lies inside the window, with air', async ({ page }) => {
      await setUp(page);
      await openWatch(page);
      await expect(watchBox(page).locator(':scope > .wc-lk-back')).toBeVisible();
      await backInside(watchBox(page));
    });
  });
}
