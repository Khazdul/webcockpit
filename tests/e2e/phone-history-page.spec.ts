// Stage 45 (WP 45-A, ADR 0130): History on a phone (touch, 390 px wide):
// two-line rows, the sort list, a tap selects and opens the card under
// the row, its buttons tappable, Export opens the Export editor (no
// phone gate any more), Back by tap.
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

const hist = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
const rows = (page: Page) => hist(page).locator('.wc-lk-tr');

test('History on a phone: rows, the card under the tapped row, Export, Back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').tap();
  await expect(rows(page)).toHaveCount(3);
  await expect(hist(page).locator('.wc-hist-win')).toHaveClass(/is-narrow/);
  await expect(hist(page).locator('.wc-lk-throw')).toBeHidden();
  await expect(hist(page).locator('.wc-hist-sort select')).toBeVisible();

  // A tap selects a row and opens its card under it (nothing plays).
  await rows(page).nth(1).tap();
  await expect(rows(page).nth(1)).toHaveClass(/is-on/);
  await expect(hist(page).locator('.wc-lk-tr.is-on + .wc-hist-card .wc-hist-name')).toContainText('Rasta');
  await expect(page.locator('.wc-player')).toHaveCount(0);
  // The card's buttons are tappable (≥ 32 px) and inside the screen.
  for (const id of ['RUN LOG', 'STATS', 'RATE', 'SAVE', 'EXPORT', 'DELETE']) {
    const b = (await hist(page).locator(`.wc-hist-card [data-btn="${id}"]`).boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(32);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
  }
  // The head clears Back.
  const back = (await hist(page).locator('.wc-lk-back').boundingBox())!;
  const pills = (await hist(page).locator('.wc-hist-pills').boundingBox())!;
  expect(pills.y).toBeGreaterThanOrEqual(back.y + back.height - 1);

  // Export opens the Export editor on the phone too.
  await hist(page).locator('.wc-hist-card [data-btn="EXPORT"]').tap();
  await expect(hist(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(hist(page)).toHaveCount(1);
  await expect(rows(page).nth(1)).toHaveClass(/is-on/);

  // Back by tap: the menu.
  await hist(page).locator('.wc-lk-back').tap();
  await expect(hist(page)).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-sm-item[data-key="history"]')).toBeVisible();
});
