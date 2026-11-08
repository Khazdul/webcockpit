// Stage 45 (WP 45-C, ADR 0130): History's small boxes over the page on the
// demo backup: Rate (keys, a click, hover peeks, Enter saves), Delete (any
// other key cancels, Y deletes), the "?" button's keys box; each a small
// Lykta box centred over History's box with the page drawn under a veil.
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
const cur = (page: Page) => hist(page).locator('.wc-lk-tr.is-on');
const flash = (page: Page) => hist(page).locator('.wc-lk-flash');
const dialog = (page: Page, dlg: string) => page.locator(`.wc-lk-dialog[data-dlg="${dlg}"]`);
const lit = (page: Page) => dialog(page, 'rate').locator('.wc-hd-stars > button.is-lit');

async function openHistory(page: Page): Promise<void> {
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  await expect(rows(page)).toHaveCount(3);
}

/** The dialog lies inside History's box, centred on it (± a few px). */
async function centredOverBox(page: Page, dlg: string): Promise<void> {
  const box = (await hist(page).boundingBox())!;
  const d = (await dialog(page, dlg).boundingBox())!;
  expect(d.x).toBeGreaterThanOrEqual(box.x);
  expect(d.x + d.width).toBeLessThanOrEqual(box.x + box.width + 1);
  expect(Math.abs(d.x + d.width / 2 - (box.x + box.width / 2))).toBeLessThan(4);
}

test('Rate: keys, a click, hover peeks; Enter saves an unsaved session', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHistory(page);
  // Row 0 is the newest Gittan session (unsaved).
  await expect(cur(page)).toContainText('Gittan');
  await page.keyboard.press('a');
  await expect(dialog(page, 'rate')).toBeVisible();
  await expect(dialog(page, 'rate').locator('.wc-lk-hood-t')).toHaveText('Rate the session');
  await expect(dialog(page, 'rate').locator('.wc-hd-line')).toHaveText(/^Gittan · 2026-09-27 · 18:40 · \d+m$/);
  await centredOverBox(page, 'rate');
  // The page stays drawn under the veil.
  await expect(hist(page)).toBeVisible();
  await expect(lit(page)).toHaveCount(0);
  await page.keyboard.press('4');
  await expect(lit(page)).toHaveCount(4);
  await expect(dialog(page, 'rate').locator('.wc-hd-val')).toHaveText('Four stars');
  await page.keyboard.press('ArrowLeft');
  await expect(lit(page)).toHaveCount(3);
  // Hover peeks without setting: the stars' outline only; the words keep naming the rating Save stores.
  await dialog(page, 'rate').locator('.wc-hd-stars > button[data-v="5"]').hover();
  await expect(dialog(page, 'rate').locator('.wc-hd-stars > button.is-peek')).toHaveCount(5);
  await expect(dialog(page, 'rate').locator('.wc-hd-val')).toHaveText('Three stars');
  await expect(lit(page)).toHaveCount(3);
  await page.mouse.move(5, 5);
  await expect(dialog(page, 'rate').locator('.wc-hd-stars > button.is-peek')).toHaveCount(0);
  // A click sets; Esc cancels (nothing saved).
  await dialog(page, 'rate').locator('.wc-hd-stars > button[data-v="2"]').click();
  await expect(lit(page)).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(dialog(page, 'rate')).toHaveCount(0);
  await expect(cur(page).locator('.wc-hist-exp')).not.toHaveText('Saved');
  // Again: 2 by a click, Enter saves the unsaved session with its rating.
  await hist(page).locator('.wc-hist-card [data-btn="RATE"]').click();
  await dialog(page, 'rate').locator('.wc-hd-stars > button[data-v="2"]').click();
  await page.keyboard.press('Enter');
  await expect(dialog(page, 'rate')).toHaveCount(0);
  await expect(flash(page)).toHaveText('Rated ★★.');
  await expect(cur(page).locator('.wc-hist-exp')).toHaveText('Saved');
  await expect(cur(page).locator('.wc-lk-star-on')).toHaveText('★★');
  expect(errors).toEqual([]);
});

test('Delete: any other key cancels, Y deletes; the keys box from the "?" button', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHistory(page);
  // The saved Rasta session: its box says so.
  await page.keyboard.press('ArrowDown');
  await expect(cur(page)).toContainText('Rasta');
  await page.keyboard.press('d');
  const del = dialog(page, 'delete');
  await expect(del).toBeVisible();
  await expect(del.locator('.wc-lk-hood-t')).toHaveText('Delete session');
  await expect(del.locator('.wc-hd-kv')).toContainText('Rasta');
  await expect(del.locator('.wc-hd-kv')).toContainText('1 h 34 min');
  await expect(del.locator('.wc-lk-gold')).toHaveText('yes — ★★★★');
  await expect(del.locator('.wc-hd-warn')).toContainText('cannot be undone');
  await centredOverBox(page, 'delete');
  await page.keyboard.press('Enter');
  await expect(del).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  // Cancel by the button.
  await page.keyboard.press('d');
  await del.locator('[data-btn="CANCEL"]').click();
  await expect(del).toHaveCount(0);
  // The last (oldest) session: Y deletes; the cursor stays at the same index.
  await page.keyboard.press('End');
  await page.keyboard.press('d');
  await expect(del).toBeVisible();
  await page.keyboard.press('y');
  await expect(rows(page)).toHaveCount(2);
  await expect(flash(page)).toHaveText('Session deleted.');
  await expect(cur(page)).toContainText('Rasta');

  // "?" by the button: the keys in two columns; a click on the veil closes it.
  await hist(page).locator('[data-btn="KEYS"]').click();
  const keys = dialog(page, 'keys');
  await expect(keys).toBeVisible();
  await expect(keys.locator('.wc-lk-kh-row', { hasText: 'Export' }).locator('dt')).toHaveText('X');
  await expect(keys.locator('.wc-lk-kh-row', { hasText: 'Character' }).locator('dt')).toHaveText('← →');
  await page.mouse.click(5, 450);
  await expect(keys).toHaveCount(0);
  expect(errors).toEqual([]);
});
