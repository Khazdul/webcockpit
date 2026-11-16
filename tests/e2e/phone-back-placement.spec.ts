// Stage 65, owner feedback round 2 (ADR 0155, "As built — feedback round 2,
// start-menu chrome"): on a phone a box's Back lay on the iron frame (its
// 40 px box grew up over the frame's top). Back is now drawn inside the lit
// window's inner border with air on every side, and its touch target (40 px
// on a phone, 44 px on a tablet) is an invisible ::before that grows upward
// only. Checked on several start-menu pages and the watch page, portrait
// and landscape, phone and tablet.
//
// `phone` project (Pixel 7: touch). Nothing reaches MUME.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { openWatch, setUp, watchBox } from './watch-page';

const AIR = 4;
const VIEWPORTS = [
  { width: 390, height: 844, target: 40 },
  { width: 844, height: 390, target: 40 },
  { width: 820, height: 1180, target: 44 },
  { width: 1180, height: 820, target: 44 },
];
const PAGES = ['profile', 'scripts', 'history', 'about'];

const startTop = (page: Page): Locator => page.locator('.wc-start .wc-frame:not([hidden])');

/**
 * `box`'s Back lies inside its window's inner border box (inside the
 * window's 1 px border) with at least `AIR` px on the top and left, and a
 * tap `target` px above its bottom edge still lands on it.
 */
async function backInside(box: Locator, target: number): Promise<void> {
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
    [g.b.left + 10, g.b.bottom - target + 1],
  );
  expect(hit, `touch target ${target} px high`).toBe(true);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

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
        await backInside(box, vp.target);
        await box.locator(':scope > .wc-lk-back').tap();
        await expect(startTop(page).locator('.wc-sm-item[data-key="enter"]')).toBeVisible();
      }
    });

    test('the watch page\'s Back lies inside the window, with air', async ({ page }) => {
      await setUp(page);
      await openWatch(page);
      await expect(watchBox(page).locator(':scope > .wc-lk-back')).toBeVisible();
      await backInside(watchBox(page), vp.target);
    });
  });
}
