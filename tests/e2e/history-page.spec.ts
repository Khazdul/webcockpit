// Stage 45 (WP 45-A, ADR 0130): History in the new look on the demo
// backup: the table and the card, pills, keys and letters, the "?" box,
// Backup and a bad Restore, the run log and back, the run-log error box,
// the width cap and the narrow form.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  const res = await page.evaluate(async () => {
    const w = window as unknown as {
      __wc: { runs(): Promise<{ restore(b: Blob): Promise<{ added: number; skipped: number }> }> };
    };
    const lib = await w.__wc.runs();
    return lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  expect(res.added + res.skipped).toBe(4);
}

const hist = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
const rows = (page: Page) => hist(page).locator('.wc-lk-tr');
const cur = (page: Page) => hist(page).locator('.wc-lk-tr.is-on');
const btn = (page: Page, id: string) => hist(page).locator(`.wc-lk-btn[data-btn="${id}"]`);
const card = (page: Page) => hist(page).locator('.wc-hist-card');
const flash = (page: Page) => hist(page).locator('.wc-lk-flash');
const dialog = (page: Page, dlg: string) => page.locator(`.wc-lk-dialog[data-dlg="${dlg}"]`);

async function openHistory(page: Page): Promise<void> {
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  await expect(hist(page).locator('.wc-lk-hood-t').last()).toHaveText('History');
  // History loads its sessions asynchronously; keys before that are lost.
  await expect(rows(page)).toHaveCount(3);
}

test('History: table and card, pills, keys, the keys box, Backup, a bad Restore, the run log and back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openHistory(page);

  // Newest first: Gittan 09-27, Rasta 09-26 (two runs, saved ★★★★), Gittan 09-25.
  await expect(rows(page).nth(0)).toContainText('Gittan2026-09-2718:40');
  await expect(rows(page).nth(1)).toContainText('Rasta2026-09-2621:00');
  await expect(rows(page).nth(1).locator('.wc-hist-exp')).toHaveText('Saved');
  await expect(rows(page).nth(1).locator('.wc-lk-star-on')).toHaveText('★★★★');
  await expect(hist(page).locator('.wc-hist-storage')).toContainText('Storage:');
  await expect(hist(page).locator('.wc-lk-th[data-key="date"]')).toHaveAttribute('data-dir', '-1');
  // No key-hint row.
  await expect(hist(page).locator('.wc-footer')).toHaveCount(0);

  // The card follows the cursor.
  await expect(card(page).locator('.wc-hist-name')).toContainText('Gittan');
  await page.keyboard.press('ArrowDown');
  await expect(cur(page)).toContainText('Rasta');
  await expect(card(page).locator('.wc-hist-name')).toContainText('Rasta');
  await expect(card(page)).toContainText('1 h 34 min · 2 runs');
  await expect(card(page)).toContainText('Saved');
  await expect(btn(page, 'SAVE')).toHaveAttribute('aria-disabled', 'true');

  // ← → change the pill at once.
  await page.keyboard.press('ArrowRight');
  await expect(rows(page)).toHaveCount(2);
  await expect(hist(page).locator('.wc-hist-pills [aria-checked="true"]')).toHaveText('Gittan');
  await page.keyboard.press('ArrowLeft');
  await expect(rows(page)).toHaveCount(3);

  // A head click sorts (Dur. ▾: longest first), the cursor keeps its row.
  await page.keyboard.press('ArrowDown');
  await expect(cur(page)).toContainText('Rasta');
  await hist(page).locator('.wc-lk-th[data-key="dur"]').click();
  await expect(hist(page).locator('.wc-lk-th[data-key="dur"]')).toHaveAttribute('data-dir', '-1');
  await expect(rows(page).nth(0)).toContainText('Rasta');
  await expect(cur(page)).toContainText('Rasta');

  // Tab: the buttons (the row dims); → walks; Shift+Tab back to the rows.
  await page.keyboard.press('Tab');
  await expect(hist(page).locator('.wc-lk-btn.is-sel')).toHaveAttribute('data-btn', 'RUN LOG');
  await expect(cur(page)).toHaveClass(/is-idle/);
  await page.keyboard.press('ArrowRight');
  await expect(hist(page).locator('.wc-lk-btn.is-sel')).toHaveAttribute('data-btn', 'STATS');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(hist(page).locator('.wc-lk-btn.is-sel')).toHaveCount(0);

  // "?": the keys in a small box over the page; any key closes it.
  await page.keyboard.press('?');
  await expect(dialog(page, 'keys')).toContainText('Character');
  await page.keyboard.press('Escape');
  await expect(dialog(page, 'keys')).toHaveCount(0);
  await btn(page, 'KEYS').click();
  await expect(dialog(page, 'keys')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(dialog(page, 'keys')).toHaveCount(0);

  // B: a backup download.
  const download = page.waitForEvent('download');
  await page.keyboard.press('b');
  expect((await download).suggestedFilename()).toMatch(/^webcockpit-runs-.*\.jsonl\.gz$/);
  await expect(flash(page)).toContainText(/^Saved webcockpit-runs-.*\.jsonl\.gz\.$/);

  // Restore of a file that is no backup: a failure in the flash, the list kept.
  await hist(page).locator('.wc-history-file').setInputFiles({
    name: 'nope.jsonl.gz',
    mimeType: 'application/gzip',
    buffer: Buffer.from('this is not a backup'),
  });
  await expect(flash(page)).toContainText('Restore failed:');
  await expect(rows(page)).toHaveCount(3);

  // Enter: the run log player in the same big box (the start page stays); Esc: History exactly as it was.
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-player')).toBeVisible();
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-rl-box .wc-rl-slot > .wc-player')).toHaveCount(1);
  await expect(page.locator('.wc-start')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-player')).toHaveCount(0);
  await expect(cur(page)).toContainText('Rasta');
  await expect(hist(page).locator('.wc-lk-th[data-key="dur"]')).toHaveAttribute('data-dir', '-1');

  // Esc: back to the menu.
  await page.keyboard.press('Escape');
  await expect(hist(page)).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-sm-item[data-key="history"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a run log that cannot open shows the error box', async ({ page }) => {
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  // Remove the Rasta session's captured text (its runs stay listed with a log).
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('webcockpit');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('runChunks', 'readwrite');
          const store = tx.objectStore('runChunks');
          const cur = store.openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c) return;
            if (String((c.value as { runId: string }).runId).startsWith('Rasta/')) c.delete();
            c.continue();
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await openHistory(page);
  await page.keyboard.press('ArrowDown');
  await expect(cur(page)).toContainText('Rasta');
  await page.keyboard.press('r');
  const box = dialog(page, 'runlog-error');
  await expect(box).toBeVisible();
  await expect(box).toContainText('This run log could not be opened.');
  await expect(box).toContainText('The run data may be damaged.');
  // The page stays drawn under it; OK closes it.
  await expect(page.locator('.wc-start .wc-frame[data-under] .wc-hist')).toHaveCount(1);
  await box.locator('[data-btn="OK"]').click();
  await expect(box).toHaveCount(0);
  await expect(cur(page)).toContainText('Rasta');
});

test('the width cap: the box stops at its content width, centred, on a wide window', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openHistory(page);
  await expect(page.locator('.wc-start[data-lk-morph]')).toHaveCount(0);
  const b = (await hist(page).boundingBox())!;
  expect(b.width).toBeLessThanOrEqual(1180);
  expect(b.width).toBeGreaterThan(1100);
  expect(Math.abs(b.x + b.width / 2 - 1280)).toBeLessThan(2);
  expect(b.height).toBeGreaterThan(1300);
  // The card sits at the right of the table.
  const t = (await hist(page).locator('.wc-hist-tablewrap').boundingBox())!;
  const c = (await card(page).boundingBox())!;
  expect(c.x).toBeGreaterThan(t.x + t.width);
});

test('the narrow form: no heads, a sort list, the card under the chosen row', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openHistory(page);
  await expect(hist(page).locator('.wc-hist-win')).toHaveClass(/is-narrow/);
  await expect(hist(page).locator('.wc-lk-throw')).toBeHidden();
  const sort = hist(page).locator('.wc-hist-sort select');
  await expect(sort).toHaveValue('date:-1');
  // The card follows the chosen row.
  await expect(hist(page).locator('.wc-lk-tr.is-on + .wc-hist-card')).toHaveCount(1);
  await rows(page).nth(2).click();
  await expect(rows(page).nth(2)).toHaveClass(/is-on/);
  await expect(hist(page).locator('.wc-lk-tr.is-on + .wc-hist-card')).toHaveCount(1);
  // The sort list: Longest first.
  await sort.selectOption('dur:-1');
  await expect(rows(page).nth(0)).toContainText('Rasta');
  await expect(cur(page)).toContainText('Gittan2026-09-25');
  // The card's buttons wrap in a row.
  const a = (await btn(page, 'RUN LOG').boundingBox())!;
  const s = (await btn(page, 'STATS').boundingBox())!;
  expect(Math.abs(a.y - s.y)).toBeLessThan(2);
});
