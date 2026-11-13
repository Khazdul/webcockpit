// A new install on a phone (ADR 0081, ADR 0092): Hack 14, no UI pane,
// Character on, no weather, and the pane
// bar and Map search scripts are not enabled (so no UI, BAR or FIND pane).
import { expect, test } from '@playwright/test';
import { DESKTOP_SITE_WINDOW, phoneScreenPage } from './phone-screen';

test.use({ storageState: { cookies: [], origins: [] } });

test('new install on a phone: Hack 14, no UI pane, Character on, no weather, no bundled scripts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fixture=gmcp-demo.log&speed=0&phone=1');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);

  const s = await page.evaluate(() => window.__wc!.settings.get());
  expect(s.appearance).toMatchObject({ font: 'hack', size: 14 });
  expect(s.panes.ui.on).toBe(false);
  // ADR 0092 on a phone: Character on, the weather off; Shimrod on a transparent map.
  expect(s.panes.character.on).toBe(true);
  expect(s.weather.enabled).toBe(false);
  expect(s.mapper).toMatchObject({ tileset: 'shimrod', background: 'transparent' });
  // Give a seeding (if any) time to land, then check none happened.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__wc!.shell.scripts.enabledNames())).toEqual([]);

  // What the old tab strip showed is in the settings checked above (Comm on, UI off) and in
  // the scripts (no pane bar, no Map search).
  expect(s.panes.comm.on).toBe(true);
  expect(await page.evaluate(() => window.__wc!.app.cockpit.scriptPanes())).toEqual([]);
  expect(errors).toEqual([]);
});

// Stage 55: the defaults follow the device, not the mode. A first visit in
// the browser's "Desktop site" mode (the phone's screen, a wide window) gets
// the desktop cockpit, but what it stores is a phone's: it follows the phone
// back to its normal mode. (tests/e2e/phone-screen.ts: the screen apart from the window.)
test('a first visit in Desktop-site mode: the desktop cockpit, with the phone\'s new-user settings and no bundled scripts', async ({ browser }) => {
  const { context, page } = await phoneScreenPage(browser, { viewport: DESKTOP_SITE_WINDOW, storage: 'new' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fixture=gmcp-demo.log&speed=0');
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await expect(page.locator('html')).not.toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('html')).toHaveClass(/\bwc-touch\b/);
  await expect(page.locator('.wc-mb-bar')).toBeVisible();

  const s = await page.evaluate(() => window.__wc!.settings.get());
  expect(s.appearance).toMatchObject({ font: 'hack', size: 14 });
  expect(s.panes.ui.on).toBe(false);
  expect(s.panes.character.on).toBe(true);
  expect(s.weather.enabled).toBe(false);
  expect(s.mapper).toMatchObject({ tileset: 'shimrod', background: 'transparent' });
  // Give a seeding (if any) time to land, then check none happened.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__wc!.shell.scripts.enabledNames())).toEqual([]);

  // What is stored is a phone's: back in its normal mode the phone reads the same.
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { cursorBlink: false } }));
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.setViewportSize({ width: 412, height: 839 });
  await page.goto('/?fixture=gmcp-demo.log&speed=0');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  const back = await page.evaluate(() => window.__wc!.settings.get());
  expect(back.appearance).toMatchObject({ font: 'hack', size: 14, cursorBlink: false });
  expect(back.weather.enabled).toBe(false);
  expect(back.panes.ui.on).toBe(false);
  expect(errors).toEqual([]);
  await context.close();
});
