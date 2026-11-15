import { expect, test } from '@playwright/test';
import { DESKTOP } from './account-pages';
import { cm, logIn, noteField, openCommunity, rows, setUp, shot } from './community';

test.use({ viewport: DESKTOP });

test('look', async ({ page }) => {
  page.on('pageerror', (e) => console.log('ERR:', e.message));
  const s = await setUp(page);
  await logIn(page, s);
  await openCommunity(page);
  await expect(rows(page)).toHaveCount(10);
  await page.waitForTimeout(1500);
  await shot(page, 'in.desktop');
  await noteField(page).click();
  await page.keyboard.type('Selling a dwarven axe in Bree, ask Gittan. It is a very good axe and it has seen many orcs fall at the fords, over and over again, so ask soon.');
  await shot(page, 'write.desktop');
  await page.keyboard.press('Enter');
  await shot(page, 'posted.desktop');
  await expect(cm(page)).toBeVisible();
});

test('look guest 1024', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setUp(page);
  await openCommunity(page);
  await page.waitForTimeout(1500);
  await shot(page, 'guest.1024');
});
