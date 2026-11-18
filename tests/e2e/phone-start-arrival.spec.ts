// Stage 73 part D on a phone (Pixel 7): the watch page's Back to
// `<base>?community` shows the Community page at once, never the start
// menu (start-arrival.spec.ts: the desktop, a tablet, the Account page).
import { test } from '@playwright/test';
import { PHONE_Q } from './account-pages';
import { communityArrival } from './start-arrival';

test.describe.configure({ timeout: 60_000 });

test('a phone: <base>?community shows the Community at once, never the menu; Esc lands on the menu', async ({ page }) => {
  await communityArrival(page, PHONE_Q);
});
