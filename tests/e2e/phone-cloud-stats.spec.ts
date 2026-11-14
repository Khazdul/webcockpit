// Stage 59 (spec §7.6, ADR 0147) on a phone: "N online" by the almanac,
// inside the window and above the date, with a stubbed API (cloud-stats.ts,
// `?cloudtest`); the beat says `phone`; the privacy page at /privacy fits
// the width, with its contents as a strip of pills, and Back by tap.
import { type Page, expect, test } from '@playwright/test';
import { stubApi } from './cloud-stats';
import { lookBox, morphDone } from './look';

const online = (page: Page) => page.locator('.wc-start-almanac .wc-alm-o');
const date = (page: Page) => page.locator('.wc-start-almanac .wc-alm-d');
const menuRow = (page: Page, key: string) => page.locator(`.wc-start .wc-frame:not([hidden]) .wc-sm-item[data-key="${key}"]`);
const fitsWidth = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('phone: "N online" above the date, inside the window; a phone beat', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await stubApi(page, { flags: { stats: true }, stats: { online: 27, playing: 9 } });
  await page.goto('/?cloudtest');
  await expect(menuRow(page, 'enter')).toBeVisible();
  await expect(online(page)).toHaveText('27 online');
  const o = (await online(page).boundingBox())!;
  const d = (await date(page).boundingBox())!;
  expect(o.y + o.height).toBeLessThanOrEqual(d.y + 1);
  expect(o.x).toBeGreaterThanOrEqual(0);
  expect(o.x + o.width).toBeLessThanOrEqual(390);
  expect(await fitsWidth(page)).toBe(true);
  await expect.poll(() => api.beats.length).toBeGreaterThanOrEqual(1);
  expect(api.beats[0]).toMatchObject({ type: 'phone', browser: 'chrome', state: 'menu' });
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
