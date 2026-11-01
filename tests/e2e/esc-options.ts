// Options (the TUI settings frames) since stage 32: only in the phone's ESC
// menu. The start page lost its Options row, and desktop and tablet change
// settings in the menu bar's popups (ADR 0107). Desktop specs that test
// the frames themselves open them here with `?phone=1` forced on.
import { type Locator, type Page, expect } from '@playwright/test';

/** The ESC menu's open frame. */
export const menuFrame = (page: Page): Locator => page.locator('.wc-overlay .wc-frame:not([hidden])');
export const menuSel = (page: Page): Locator => menuFrame(page).locator('.wc-mrow.is-sel');
export const menuTitle = (page: Page): Locator => menuFrame(page).locator('.wc-title-row .wc-c-section');
export const menuFlash = (page: Page): Locator => menuFrame(page).locator('.wc-flash');

/**
 * An offline phone cockpit (`?replay&phone=1`, unless `goto` is false: the
 * page is already one), then ☰ → Options. `tap` uses taps (a touch
 * context), else clicks.
 */
export async function openEscOptions(page: Page, opts: { tap?: boolean; goto?: boolean } = {}): Promise<Locator> {
  if (opts.goto !== false) await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-app')).toBeVisible();
  const btn = page.locator('.wc-menu-btn');
  const row = menuFrame(page).locator('.wc-mrow[data-key="options"] .wc-label');
  if (opts.tap) {
    await btn.tap();
    await row.tap();
  } else {
    await btn.click();
    await row.click();
  }
  await expect(menuTitle(page)).toHaveText('─── Options ───');
  return menuFrame(page);
}
