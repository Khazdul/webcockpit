// ADR 0106 on a phone: a finger on a `░█` thumb drags it (pointer capture,
// `touch-action: none` on the bar), the About page's TuiScrollbar as the case.
import { type Page, expect, test } from '@playwright/test';

const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');

test('a touch drag on the About thumb scrolls the text in proportion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await startFrame(page).locator('.wc-sm-item[data-key="about"]').tap();
  await expect(startFrame(page).locator('.wc-title-row')).toContainText('─── About ───');
  const bar = startFrame(page).locator('.wc-tui-bar');
  const scroller = startFrame(page).locator('.wc-about-text');
  const thumb = bar.locator('.wc-scroll-thumb').first();
  await expect(thumb).toBeVisible();
  const box = (await thumb.boundingBox())!;
  const n = await bar.locator('.wc-scroll-thumb, .wc-scroll-track').count();
  const size = await bar.locator('.wc-scroll-thumb').count();
  const max = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(max).toBeGreaterThan(0);

  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y?: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: y === undefined ? [] : [{ x: box.x + box.width / 2, y, id: 0 }],
    });
  const y0 = box.y + box.height / 2;
  const dy = 2 * box.height;
  await touch('touchStart', y0);
  for (let i = 1; i <= 4; i++) await touch('touchMove', y0 + (dy * i) / 4);
  const want = (dy * max) / ((n - size) * box.height);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(want / 2);
  expect(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - want)).toBeLessThanOrEqual(box.height * 1.5);
  await touch('touchEnd');
  expect(errors).toEqual([]);
});
