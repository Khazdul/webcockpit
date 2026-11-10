// A new install on a phone (ADR 0081, ADR 0092): Hack 14, no UI pane,
// Character on, no weather, and the pane
// bar and Map search scripts are not enabled (so no UI, BAR or FIND pane).
import { expect, test } from '@playwright/test';

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

  // The live game has no tab strip since stage 51a (ADR 0136); what the strip showed is in the
  // settings checked above (Comm on, UI off) and in the scripts (no pane bar, no Map search).
  expect(s.panes.comm.on).toBe(true);
  await expect(page.locator('.wc-phone-tab')).toHaveCount(0);
  expect(await page.evaluate(() => window.__wc!.app.cockpit.scriptPanes())).toEqual([]);
  expect(errors).toEqual([]);
});
