import { expect, test } from '@playwright/test';
import { cm, logIn, openCommunity, rows, setUp, shot } from './community';

test('look phone', async ({ page }) => {
  const s = await setUp(page);
  await logIn(page, s);
  await openCommunity(page, '&phone=1&kbd=en');
  await expect(rows(page)).toHaveCount(10);
  await page.waitForTimeout(1500);
  await shot(page, 'in.phone');
  await cm(page).locator('[data-tab="hof"]').tap();
  await shot(page, 'hof.phone');
  await cm(page).locator('[data-tab="runes"]').tap();
  await shot(page, 'runes.phone');
});
