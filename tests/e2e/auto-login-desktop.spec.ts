// Round 54c (ADR 0141): automatic login for the session is the phone's
// game layout's only. On a desktop a login never shows the question, the
// session's login tap has no listener, and a dropped link is as before.
import { expect, test } from '@playwright/test';
import { loginMock } from './mume-login-mock';

test('desktop: a login shows no question and nothing listens to what is sent at the login prompts', async ({ page }) => {
  const m = await loginMock(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.keyboard.press('Enter');
  const field = page.locator('.wc-input-field');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(field).toBeFocused();
  await page.keyboard.type('rasta');
  await page.keyboard.press('Enter');
  await expect(field).toHaveClass(/wc-masked/);
  await page.keyboard.type('correct-horse-9');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  await page.waitForTimeout(500);
  await expect(page.locator('.wc-ph-ask')).toHaveCount(0);
  expect(await page.evaluate(() => window.__wc!.app.session.loginTap)).toBeNull();
  // A dropped link: no reconnect by itself, and Enter's reconnect is MUME's own prompt.
  void m.server().close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await page.waitForTimeout(500);
  expect(m.opened()).toBe(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.waitForTimeout(500);
  expect(m.sent[1]).toEqual([]);
});
