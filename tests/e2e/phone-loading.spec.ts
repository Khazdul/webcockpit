// Stage 24 round 1 (ADR 0083, ADR 0075 §3.2): on a phone grid under 45
// columns the first paint crops the banner as the app does, at the same
// place, and the app's banner takes over without a pixel changing.
import { expect, test } from '@playwright/test';
import { holdChrome, wordmarkClips } from './first-paint';

test('a cropped banner is painted where the app draws it', async ({ page }) => {
  // DejaVu 16 on a Pixel 7: 10 px cells, 41 columns.
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-wc-boot', 'ready');
  await page.evaluate(async () => {
    window.__wc!.settings.update({ appearance: { font: 'dejavu', size: 16 } });
    await window.__wc!.settings.flush();
  });
  const release = await holdChrome(page);
  await page.reload({ waitUntil: 'commit' });
  const first = page.locator('#wc-first .wcf-banner .wcf-line');
  await expect(first).toHaveCount(11);
  const width = await first.first().evaluate((e) => e.textContent!.length);
  expect(width).toBeLessThan(45);
  await page.evaluate(() => document.fonts.ready);
  const rects = await first.evaluateAll((els) => els.map((e) => JSON.stringify(e.getBoundingClientRect())));
  const clips = await wordmarkClips(page);
  const before = await Promise.all(clips.map((clip) => page.screenshot({ clip })));
  release();
  await expect(page.locator('html')).toHaveAttribute('data-wc-boot', 'ready');
  await expect(page.locator('#wc-first')).toHaveCount(0);
  const app = page.locator('.wc-start .wc-banner .wc-line');
  expect(await app.first().evaluate((e) => e.textContent!.length)).toBe(width);
  expect(await app.evaluateAll((els) => els.map((e) => JSON.stringify(e.getBoundingClientRect())))).toEqual(rects);
  const after = await Promise.all(clips.map((clip) => page.screenshot({ clip })));
  for (let i = 0; i < clips.length; i++) expect(after[i]!.equals(before[i]!), `wordmark part ${i}`).toBe(true);
});
