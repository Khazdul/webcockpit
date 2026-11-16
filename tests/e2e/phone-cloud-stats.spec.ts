// Stage 59 (spec §7.6, ADR 0147) on a phone, with a stubbed API
// (cloud-stats.ts, `?cloudtest`): no "N online" by the almanac (stage 65
// feedback round 2, ADR 0155); the beat says `phone`; the privacy page at /privacy fits
// the width, with its contents as a strip of pills, and Back by tap.
import { type Page, expect, test } from '@playwright/test';
import { stubApi } from './cloud-stats';
import { lookBox, morphDone } from './look';

const date = (page: Page) => page.locator('.wc-start-almanac .wc-alm-d');
const menuRow = (page: Page, key: string) => page.locator(`.wc-start .wc-frame:not([hidden]) .wc-sm-item[data-key="${key}"]`);
const fitsWidth = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('phone: no "N online" by the almanac; a phone beat', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await stubApi(page, { flags: { stats: true }, stats: { online: 27, playing: 9 } });
  await page.goto('/?cloudtest');
  await expect(menuRow(page, 'enter')).toBeVisible();
  await expect.poll(() => api.beats.length).toBeGreaterThanOrEqual(1);
  expect(api.beats[0]).toMatchObject({ type: 'phone', browser: 'chrome', state: 'menu' });
  await expect(date(page)).toBeVisible();
  await expect(page.locator('.wc-start-almanac')).not.toContainText('online');
  expect(api.paths()).not.toContain('GET /api/stats/public');
  expect(await fitsWidth(page)).toBe(true);
  expect(errors).toEqual([]);
});

for (const width of [390, 360]) {
  test(`phone, ${width} wide: /privacy fits, its pills, Back by tap to the menu`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/privacy');
    await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('Privacy');
    await morphDone(page);
    await expect(lookBox(page).locator('.wc-lk-seg[aria-label="Contents"]')).toBeVisible();
    await expect(lookBox(page).locator('.wc-about-rail')).toBeHidden();
    await expect(lookBox(page).locator('[data-sec="sent"] dt').first()).toHaveText('Device');
    expect(await fitsWidth(page)).toBe(true);
    await lookBox(page).locator('.wc-lk-back').first().tap();
    await expect(menuRow(page, 'enter')).toBeVisible();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
    expect(errors).toEqual([]);
  });
}
