// The update notice and the superseded-storage notice (ADR 0025) in a
// production build. `release.json` is answered by the test (page.route),
// so the served directory is never changed.
import { expect, test } from '@playwright/test';

test('a newer release.json shows the update indicator and one output line', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let fetches = 0;
  await page.route('**/release.json', (route) => {
    fetches++;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: '99.0.0', commit: 'fffffff' }) });
  });
  await page.goto('./?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(page.locator('.wc-input-notice')).toBeHidden();

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const update = page.locator('.wc-input-notice .wc-notice-update');
  await expect(update).toHaveText('Update: 99.0.0');
  await expect(update).toHaveAttribute('title', /Reload \(F5\) when convenient/);
  const line = page.locator('.wc-rows .wc-row', { hasText: 'WebCockpit 99.0.0 is available' });
  await expect(line).toHaveText('[SYSTEM] WebCockpit 99.0.0 is available – reload (F5) when you are somewhere safe.');

  // Throttled: another focus within the minute does not fetch again, and the line is said once.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(200);
  expect(fetches).toBe(1);
  await expect(line).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('the same release shows nothing', async ({ page }) => {
  await page.goto('./?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  const served = page.waitForResponse('**/release.json');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await served).status()).toBe(200);
  await page.waitForTimeout(200);
  await expect(page.locator('.wc-input-notice')).toBeHidden();
});

test('a newer tab upgrading the database shows the storage notice', async ({ page }) => {
  await page.goto('./?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  // Settings have opened the database by now; a "newer tab" upgrades it.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('webcockpit', 1000);
        r.onsuccess = () => (r.result.close(), resolve());
        r.onerror = () => reject(r.error);
        r.onblocked = () => reject(new Error('blocked'));
      }),
  );
  await expect(page.locator('.wc-input-notice .wc-notice-storage')).toHaveText('Storage: not saved');
  await expect(page.locator('.wc-rows .wc-row', { hasText: 'Storage upgraded by a newer version' })).toHaveCount(1);
});
