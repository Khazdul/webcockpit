// Desktop (ADR 0075 §2, owner-approved for desktop too): `ESC …` footer
// tokens are clickable and `#menu` opens the ESC menu.
import { type Page, expect, test } from '@playwright/test';

const overlay = (page: Page) => page.locator('.wc-overlay');
const menuTitle = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-title-row .wc-c-section');
const escToken = (page: Page, text: string) =>
  page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-footer .wc-esc-btn', { hasText: text });

test('#menu opens the ESC menu; a click on ESC Back and ESC Close goes back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?replay');
  const input = page.locator('.wc-input-field');
  await expect(input).toBeFocused();
  await page.keyboard.type('#menu');
  await page.keyboard.press('Enter');
  await expect(overlay(page)).toBeVisible();
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await expect(menuTitle(page)).toHaveText('─── Options ───');
  await escToken(page, 'ESC Back').click();
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow[data-key="options"]')).toBeVisible();
  await escToken(page, 'ESC Close').click();
  await expect(overlay(page)).toBeHidden();
  await expect(input).toBeFocused();
  // `#me` is still #message: no menu.
  await page.keyboard.type('#me');
  await page.keyboard.press('Enter');
  await expect(overlay(page)).toBeHidden();
  // No touch control on desktop.
  await expect(page.locator('.wc-menu-btn')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/wc-touch/);
  expect(errors).toEqual([]);
});
