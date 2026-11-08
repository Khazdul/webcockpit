// Desktop (ADR 0075 §2, owner-approved for desktop too): `ESC …` footer
// tokens are clickable; the lantern pages (stage 44 on: Scripts) have a
// Back button that does the same. Since stage 30f (ADR 0112) there is no ESC menu
// where the menu bar exists: Esc with nothing open opens nothing and `#menu`
// prints a hint. The tablet (no `☰`): tests/e2e/phone-touch.spec.ts.
import { type Page, expect, test } from '@playwright/test';

const overlay = (page: Page) => page.locator('.wc-overlay');
const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
/** The top lantern box's Back (stage 42's `.wc-lk-back`). */
const boxBack = (page: Page) => startFrame(page).locator('.wc-lk-back').first();
const HINT = 'The ESC menu is gone: use the menu bar, or #profile, #scripts, #panes, #settings, #fullscreen, #exit.';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('a click on Back goes back (the start page)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="scripts"]').click();
  await expect(startFrame(page).locator('.wc-lk-box .wc-lk-hood-t')).toHaveText('Scripts');
  await boxBack(page).click();
  // Back on the main menu, the cursor on Scripts.
  await expect(startFrame(page).locator('.wc-sm-item[data-key="enter"]')).toBeVisible();
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Scripts');
  expect(errors).toEqual([]);
});

test('Esc with nothing open opens the Exit popup, not a menu; #menu prints the hint', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?replay');
  const input = page.locator('.wc-input-field');
  await expect(input).toBeFocused();
  await expect(page.locator('.wc-mb-bar')).toBeVisible();
  // Esc opens the Exit popup as the bar's Exit does; Esc again closes it.
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-pop-exit')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-pop')).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(overlay(page)).toHaveCount(0);
  await expect(input).toBeFocused();
  await page.keyboard.type('#menu');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-output .wc-row', { hasText: HINT })).toHaveCount(1);
  await page.waitForTimeout(300);
  await expect(overlay(page)).toHaveCount(0);
  await expect(input).toBeFocused();
  // `#me` is still #message: no hint, no menu.
  await page.keyboard.type('#me');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-output .wc-row', { hasText: HINT })).toHaveCount(1);
  await expect(overlay(page)).toHaveCount(0);
  // No touch control on desktop.
  await expect(page.locator('.wc-menu-btn')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/wc-touch/);
  expect(errors).toEqual([]);
});
