// Stage 19 part A (ADR 0075 §2): touch fixes, on a touch-emulating mobile
// browser. A desktop-size viewport with `?touch=1` until the phone layout
// (part B) fits the cockpit on a phone screen.
import { type Page, expect, test } from '@playwright/test';

test.use({ viewport: { width: 1000, height: 700 } });

const overlay = (page: Page) => page.locator('.wc-overlay');
const frame = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden])');
const menuTitle = (page: Page) => frame(page).locator('.wc-title-row .wc-c-section');
const inputFocused = (page: Page) =>
  page.evaluate(() => document.activeElement?.classList.contains('wc-input-field') ?? false);

async function openCockpit(page: Page): Promise<void> {
  await page.goto('/?replay&touch=1');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/\bwc-touch\b/);
}

test('the menu button opens the ESC menu by tap, without focusing the input', async ({ page }) => {
  await openCockpit(page);
  // Nothing has focused the input at start (no keyboard pops up).
  await page.locator('.wc-menu-btn').tap();
  await expect(overlay(page)).toBeVisible();
  // Continue/back closes without the input taking the focus.
  await frame(page).locator('.wc-footer .wc-esc-btn', { hasText: 'ESC Close' }).tap();
  await expect(overlay(page)).toBeHidden();
  expect(await inputFocused(page)).toBe(false);
});

test('a tap on a whole menu row selects it; a tap on ESC Back closes the frame', async ({ page }) => {
  await openCockpit(page);
  await page.locator('.wc-menu-btn').tap();
  await expect(overlay(page)).toBeVisible();
  // Tap the row's blank area, left of the label.
  const row = frame(page).locator('.wc-line', { has: page.locator('.wc-mrow[data-key="options"]') });
  await row.tap({ position: { x: 5, y: 5 } });
  await expect(menuTitle(page)).toHaveText('─── Options ───');
  await frame(page).locator('.wc-footer .wc-esc-btn', { hasText: 'ESC Back' }).tap();
  await expect(frame(page).locator('.wc-mrow[data-key="options"]')).toBeVisible();
});

test('a tap on the output does not focus the input; a tap on the input does', async ({ page }) => {
  await openCockpit(page);
  await page.locator('.wc-output').first().tap();
  await page.waitForTimeout(100);
  expect(await inputFocused(page)).toBe(false);
  await page.locator('.wc-input-field').tap();
  await expect(page.locator('.wc-input-field')).toBeFocused();
});
