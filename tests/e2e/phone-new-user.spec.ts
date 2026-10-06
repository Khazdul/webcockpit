// A new install on a phone (ADR 0081): Hack 14, no UI pane, and the pane
// bar and Map search scripts are not enabled. The tab strip has no UI,
// BAR or FIND tab.
import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('new install on a phone: Hack 14, no UI pane, no bundled scripts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fixture=gmcp-demo.log&speed=0&phone=1');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);

  const s = await page.evaluate(() => window.__wc!.settings.get());
  expect(s.appearance).toMatchObject({ font: 'hack', size: 14 });
  expect(s.panes.ui.on).toBe(false);
  // Give a seeding (if any) time to land, then check none happened.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__wc!.shell.scripts.enabledNames())).toEqual([]);

  const tabs = (await page.locator('.wc-phone-tab').allTextContents()).map((t) => t.trim());
  expect(tabs).toContain('COMM');
  expect(tabs).not.toContain('UI');
  expect(tabs).not.toContain('BAR');
  expect(tabs).not.toContain('FIND');
  expect(errors).toEqual([]);
});
