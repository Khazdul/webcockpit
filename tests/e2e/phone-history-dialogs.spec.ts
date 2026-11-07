// Stage 45 (WP 45-C, ADR 0130): History's Rate and Delete boxes on a phone
// (touch, 390 px): inside the screen, the stars and buttons tappable, a
// tap sets the rating (no hover peek), Save and "Yes, delete" by tap.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    const lib = await w.__wc.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

const hist = (page: Page) => page.locator('.wc-start .wc-frame .wc-hist');
const rows = (page: Page) => hist(page).locator('.wc-lk-tr');
const dialog = (page: Page, dlg: string) => page.locator(`.wc-lk-dialog[data-dlg="${dlg}"]`);

async function inScreen(page: Page, sel: ReturnType<Page['locator']>, minH: number): Promise<void> {
  const b = (await sel.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(minH);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(390);
}

test('Rate and Delete on a phone: tappable, inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').tap();
  await expect(rows(page)).toHaveCount(3);

  // Rate the first (unsaved) session, already chosen (a tap on it would open its log): tap a star, tap Save.
  await expect(rows(page).nth(0)).toHaveClass(/is-on/);
  await hist(page).locator('.wc-hist-card [data-btn="RATE"]').tap();
  const rate = dialog(page, 'rate');
  await expect(rate).toBeVisible();
  await inScreen(page, rate, 100);
  for (let i = 1; i <= 5; i++) await inScreen(page, rate.locator(`.wc-hd-stars > button[data-v="${i}"]`), 40);
  await inScreen(page, rate.locator('[data-btn="SAVE"]'), 32);
  await rate.locator('.wc-hd-stars > button[data-v="3"]').tap();
  await expect(rate.locator('.wc-hd-stars > button.is-lit')).toHaveCount(3);
  await expect(rate.locator('.wc-hd-stars > button.is-peek')).toHaveCount(0);
  await rate.locator('[data-btn="SAVE"]').tap();
  await expect(rate).toHaveCount(0);
  await expect(hist(page).locator('.wc-lk-flash')).toHaveText('Rated ★★★.');

  // Delete the last session by tap.
  await rows(page).nth(2).tap();
  await hist(page).locator('.wc-hist-card [data-btn="DELETE"]').tap();
  const del = dialog(page, 'delete');
  await expect(del).toBeVisible();
  await inScreen(page, del, 100);
  await inScreen(page, del.locator('[data-btn="DELETE"]'), 32);
  await inScreen(page, del.locator('[data-btn="CANCEL"]'), 32);
  await del.locator('[data-btn="DELETE"]').tap();
  await expect(rows(page)).toHaveCount(2);
  await expect(hist(page).locator('.wc-lk-flash')).toHaveText('Session deleted.');
});
