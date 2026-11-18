// Stage 73 part D (the owner's report of 2026-11-18; ADR 0155 addendum
// 2026-11-18, src/chrome/start-arrival.ts): the watch page's Back for a
// run opened from the Community page (`<base>?community`) or the Account
// page (`<base>?account`, `?account=published`) lands on that page
// straight away. A sampler started before the first paint looks at every
// frame until the page shows: the start menu is never visible, nor the
// morph's proxy, nor (the Community) the wordmark or the first paint's
// menu panel. Esc from the page still lands on the menu. Not allowed
// (a guest's `?account`, `gallery` off): the menu shows as before.
import { expect, test } from '@playwright/test';
import { NAME, PASSWORD, SKY, btn, field, openAccount, pageOf } from './account-pages';
import { seedAccount } from './cloud-account-fake';
import { cm, setUp } from './community';
import { communityArrival, menuShown, sample, seen } from './start-arrival';

test.describe.configure({ timeout: 60_000 });

test('<base>?community shows the Community at once, never the menu; Esc lands on the menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await communityArrival(page);
});

test('a tablet (?tablet=phone): <base>?community shows the Community at once, never the menu', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await communityArrival(page, '&tablet=phone&kbd=en');
});

test('<base>?account and ?account=published, logged in: the Account page (its Published runs) at once, never the menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = await setUp(page);
  // Logged in through Log in (the Account page needs the account's keys on this device).
  await seedAccount(s.server, NAME, PASSWORD);
  await openAccount(page);
  await field(page, 'name').fill(NAME);
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'LOGIN').click();
  await expect(pageOf(page, 'account')).toBeVisible();
  await sample(page, '.wc-start .wc-frame:not([hidden]) [data-page="account"]');
  await page.goto(`/?cloudtest&${SKY}&account`);
  await expect(pageOf(page, 'account')).toBeVisible();
  const a = await seen(page);
  expect(a.menu, 'the start menu was visible on the way').toBe(0);
  expect(a.proxy, 'the morph ran from the menu').toBe(0);
  expect(a.firstPanel, 'the first paint drew the menu panel').toBe(0);
  await page.keyboard.press('Escape');
  await expect(menuShown(page)).toBeVisible();

  await sample(page, '.wc-start .wc-frame:not([hidden]) [data-page="published"]');
  await page.goto(`/?cloudtest&${SKY}&account=published`);
  await expect(pageOf(page, 'published')).toBeVisible();
  const b = await seen(page);
  expect(b.menu, 'the start menu was visible on the way').toBe(0);
  expect(b.proxy, 'the morph ran from the menu').toBe(0);
});

test('not allowed: a guest’s ?account and ?community with the flag gallery off show the menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setUp(page, { flags: { gallery: false } });
  await page.goto(`/?cloudtest&${SKY}&account`);
  await expect(menuShown(page)).toBeVisible();
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await expect(page.locator('.wc-start.is-arriving')).toHaveCount(0);
  await page.goto(`/?cloudtest&${SKY}&community`);
  await expect(menuShown(page)).toBeVisible();
  await expect(page.locator('.wc-start.is-arriving')).toHaveCount(0);
  await expect(cm(page)).toHaveCount(0);
  // The menu takes keys again: ↓ moves the cursor off Enter MUME.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel')).not.toHaveAttribute('data-key', 'enter');
});
