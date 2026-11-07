// Stage 41d (ADR 0083, addendum 2026-11-07; ADR 0075 §3.2): on a phone the
// first paint shows the start page's sky (under the notch too) and its
// wordmark where the start page puts them, and the loading panel where the
// menu panel appears; the hand-over moves nothing.
import { expect, test } from '@playwright/test';
import { checkHandOver } from './first-paint';

test('the phone first paint: sky, wordmark and loading panel at the start page\'s places', async ({ page }) => {
  await checkHandOver(page, '?skyMonth=0&skyHour=22&skyWeather=snow&skyFreeze');
  await expect(page.locator('#wc-first')).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-banner')).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
});
