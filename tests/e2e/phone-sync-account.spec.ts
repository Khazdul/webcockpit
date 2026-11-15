// Stage 62 C2 on a phone: the Account page's sync section fits the
// phone, and has no line of what follows the account (the owner's pick 3b,
// 2026-11-15). The desktop: sync-flows.spec.ts. Against the fake account API with the flags
// `accounts` and `sync` on. `phone` project (Pixel 7).
import { expect, test } from '@playwright/test';
import { NAME, PASSWORD, PHONE, frame } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { account, logIn } from './sync-pages';

test.use({ viewport: PHONE });
test.setTimeout(120_000);

test('phone: the Account page\'s sync section fits, with no line of what follows the account; no sideways scroll', async ({ page }) => {
  const server = new FakeAccountServer();
  server.flags = { accounts: true, sync: true };
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);
  await account(page);
  const section = frame(page).locator('[data-sync]');
  await expect(section).toBeVisible();
  await expect(frame(page).locator('[data-follows]')).toHaveCount(0);
  await section.scrollIntoViewIfNeeded();
  const b = (await section.boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(PHONE.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
