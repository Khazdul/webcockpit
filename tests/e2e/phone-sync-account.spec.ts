// Stage 62 C2 (round 10, pick 3a) on a phone: the Account page's sync
// section names what follows the account with the phone first. The
// desktop: sync-flows.spec.ts. Against the fake account API with the flags
// `accounts` and `sync` on. `phone` project (Pixel 7).
import { expect, test } from '@playwright/test';
import { NAME, PASSWORD, PHONE, frame } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { account, logIn } from './sync-pages';

test.use({ viewport: PHONE });
test.setTimeout(120_000);

test('phone: the Account page says what follows the account, the phone first; no sideways scroll', async ({ page }) => {
  const server = new FakeAccountServer();
  server.flags = { accounts: true, sync: true };
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);
  await account(page);
  const line = frame(page).locator('[data-follows]');
  await expect(line).toHaveText(
    'Follows the account: profiles, scripts, settings for phone (this device), desktop and tablet, script data, Comm history (7 days), timers.',
  );
  await line.scrollIntoViewIfNeeded();
  const b = (await line.boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(PHONE.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
