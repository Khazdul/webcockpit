// Stage 19 part A (ADR 0075 §2): touch fixes, on a touch-emulating mobile
// browser. The menu button is the phone's only since stage 30f (ADR 0112):
// a tablet (a desktop-size viewport with `?touch=1`) has the menu bar and
// no `☰`. Since stage 51b (ADR 0136 §10) the phone's menu in the live game
// is the bottom sheet: the two phone cases are asserted against it.
import { type Page, expect, test } from '@playwright/test';

const overlay = (page: Page) => page.locator('.wc-overlay');
const sheet = (page: Page) => page.locator('.wc-ph-sheet');
const inputFocused = (page: Page) =>
  page.evaluate(() => document.activeElement?.classList.contains('wc-input-field') ?? false);

async function openPhone(page: Page): Promise<void> {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
}

test('the menu button opens the menu sheet by tap, without focusing the input', async ({ page }) => {
  await openPhone(page);
  // Nothing has focused the input at start (no keyboard pops up).
  await page.locator('.wc-ph-menu').tap();
  await expect(sheet(page)).toBeVisible();
  expect(await inputFocused(page)).toBe(false);
  // A tap outside closes it without the input taking the focus.
  await page.touchscreen.tap(100, 60);
  await expect(sheet(page)).toBeHidden();
  expect(await inputFocused(page)).toBe(false);
});

test('a tap on a whole sheet row opens it; a tap on Back returns to the sheet', async ({ page }) => {
  await openPhone(page);
  await page.locator('.wc-ph-menu').tap();
  await expect(sheet(page)).toBeVisible();
  // Tap the row's blank area, right of the label; the row is a finger high.
  const row = sheet(page).locator('[data-row="settings"]');
  const b = (await row.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(44);
  await row.tap({ position: { x: b.width * 0.6, y: 5 } });
  await expect(page.locator('.wc-ph-page')).toBeVisible();
  await page.locator('.wc-ph-page .wc-ph-back').tap();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator('[data-row="settings"]')).toBeVisible();
  expect(await inputFocused(page)).toBe(false);
});

test.describe('a tablet sent back to the desktop cockpit (`?tablet=desktop`)', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  async function openTablet(page: Page): Promise<void> {
    await page.goto('/?replay&tablet=desktop');
    await expect(page.locator('.wc-app')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/\bwc-touch\b/);
    await expect(page.locator('html')).not.toHaveClass(/\bwc-phone\b/);
  }

  test('has the menu bar and no ☰; the bar works by tap; no ESC menu', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openTablet(page);
    await expect(page.locator('.wc-mb-bar')).toBeVisible();
    await expect(page.locator('.wc-menu-btn')).toHaveCount(0);
    await page.locator('.wc-mb[data-mb="panes"]').tap();
    await expect(page.locator('.wc-pop')).toHaveCount(1);
    await page.locator('.wc-mb[data-mb="panes"]').tap();
    await expect(page.locator('.wc-pop')).toHaveCount(0);
    await page.locator('.wc-mb[data-mb="scripts"]').tap();
    await expect(page.locator('.wc-win[data-win="scripts"]')).toHaveCount(1);
    // A keyboard's Esc closes the window, then opens the Exit popup, never the ESC menu.
    await page.locator('.wc-input-field').press('Escape');
    await expect(page.locator('.wc-win')).toHaveCount(0);
    await page.locator('.wc-input-field').press('Escape');
    await expect(page.locator('.wc-pop-exit')).toBeVisible();
    await expect(overlay(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a tap on the output does not focus the input; a tap on the input does', async ({ page }) => {
    await openTablet(page);
    await page.locator('.wc-output').first().tap();
    await page.waitForTimeout(100);
    expect(await inputFocused(page)).toBe(false);
    await page.locator('.wc-input-field').tap();
    await expect(page.locator('.wc-input-field')).toBeFocused();
  });
});
