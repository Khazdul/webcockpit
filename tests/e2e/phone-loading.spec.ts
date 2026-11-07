// Stage 24 round 1 (ADR 0083, ADR 0075 §3.2): on a phone grid under 45
// columns the first paint crops the banner as the old start page did.
// Since stage 41 (ADR 0125) the start page has no pixel banner: at the
// hand-over the first paint's layer goes and the new page takes over (the
// first paint's redesign, 41d, makes the two match again).
import { expect, test } from '@playwright/test';
import { holdChrome } from './first-paint';

test('a cropped banner is painted first; the hand-over leaves the new start page', async ({ page }) => {
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
  release();
  await expect(page.locator('html')).toHaveAttribute('data-wc-boot', 'ready');
  await expect(page.locator('#wc-first')).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-banner')).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
});
