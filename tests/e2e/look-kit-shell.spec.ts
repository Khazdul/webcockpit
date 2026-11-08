// Stage 42-0 (ADR 0127): the kit gallery's shell. `?kit` opens it over the
// start menu on the dev server, Esc and Back return to the menu, and the
// start page without `?kit` has none of it.
import { expect, test } from '@playwright/test';
import { backTo, lookBox, openKit, openStart, startTop } from './look';

test('?kit opens the gallery over the menu; Back and Esc return to it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const box = await openKit(page);
  await expect(box).toHaveAttribute('aria-label', 'Kit');
  await expect(box.locator('.wc-lk-tabs[role="tablist"][aria-label="Kit sections"]')).toBeAttached();
  await backTo(page);
  await expect(startTop(page).locator('.wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  // Once per page load: the menu stays.
  await page.waitForTimeout(100);
  await expect(page.locator('.wc-kit')).toHaveCount(0);
  await openKit(page);
  await backTo(page, { key: true });
  await expect(lookBox(page)).toHaveClass(/wc-sm-panel/);
  expect(errors).toEqual([]);
});

test('the start page without ?kit opens no gallery', async ({ page }) => {
  await openStart(page);
  await page.waitForTimeout(200);
  await expect(page.locator('.wc-kit')).toHaveCount(0);
  await expect(page.locator('.wc-start')).toHaveClass(/\bwc-look\b/);
});
