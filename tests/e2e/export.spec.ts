// Stage 7 P1: the export editor on the demo backup. History → EXPORT on
// the Rasta session: comment, exclude, title, format, the text download,
// and the edits back after BACK and a reopen.
import { type Page, expect, test } from '@playwright/test';

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const cur = (page: Page) => frame(page).locator('.wc-tr.is-cur-focus, .wc-tr.is-cur');
const title = (page: Page) => frame(page).locator('.wc-title-row');
const info = (page: Page) => frame(page).locator('.wc-exp-info');
const rows = (page: Page) => frame(page).locator('.wc-exp-row:not(.is-empty)');
const curRow = (page: Page) => frame(page).locator('.wc-exp-row.is-cur').first();

async function openHistory(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  await page.locator('.wc-start .wc-mrow[data-key="history"] .wc-label').click();
  await expect(title(page)).toHaveText('─── History ───');
}

async function openEditor(page: Page): Promise<void> {
  // History loads its sessions asynchronously; keys before that are lost.
  await expect(frame(page).locator('.wc-tr:not(.is-empty)')).toHaveCount(3);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(cur(page)).toContainText('Rasta');
  await frame(page).locator('[data-btn="EXPORT"]').click();
  await expect(title(page)).toHaveText('─── Export Editor ───');
  await expect(rows(page).first()).toBeVisible();
}

test('export editor: comment, exclude, title, format, text download, persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openHistory(page);
  await openEditor(page);

  await expect(info(page)).toHaveText(
    /^Rasta \(L42\) · 2026-09-26 · \d+ lines · 0 excluded · 0 comments · → mume-Rasta-2026-09-26T21-00-\d\d\.html$/,
  );
  // The player's login line is a row of its own, before the first game line.
  await expect(rows(page).first()).toContainText('[SYSTEM] Rasta logged in.');
  await expect(rows(page).first()).toHaveAttribute('data-kind', 'system');
  await expect(rows(page).first().locator('.wc-exp-sys')).toHaveText('[SYSTEM] Rasta logged in.');
  await expect(rows(page).nth(1)).toContainText('Reconnecting.');
  await expect(curRow(page)).toContainText('►');
  await expect(frame(page).locator('.wc-exp-map-row')).not.toHaveCount(0);

  // C: a comment before the first line.
  await page.keyboard.press('c');
  await expect(title(page)).toHaveText('─── Add comment ───');
  await page.keyboard.type('Start of the demo');
  await expect(frame(page).locator('.wc-exp-preview')).toHaveText('## Start of the demo');
  await expect(frame(page).locator('.wc-exp-hold')).toHaveText('Holds the replay for 3 s.');
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText('─── Export Editor ───');
  await expect(rows(page).first()).toHaveText(/^.{3}## Start of the demo/);
  await expect(curRow(page)).toHaveAttribute('data-kind', 'comment');
  await expect(frame(page).locator('[data-map-row="0"] .wc-exp-comment')).toHaveText('■');

  // End ↑ X: exclude the last line.
  await page.keyboard.press('End');
  await expect(curRow(page)).toHaveAttribute('data-kind', 'end');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('x');
  await expect(curRow(page)).toHaveAttribute('data-kind', 'excluded');
  await expect(curRow(page).locator('.wc-exp-bar')).toHaveText('▌');
  await expect(frame(page).locator('[data-btn="STOP EXCLUDING"]')).toBeVisible();
  await expect(info(page)).toContainText('· 1 excluded · 1 comments ·');

  // T: a title; F: text.
  await frame(page).locator('[data-btn="TITLE"]').click();
  await expect(title(page)).toHaveText('─── Export title ───');
  await page.keyboard.press('Control+u');
  await page.keyboard.type('Demo fight');
  await page.keyboard.press('Enter');
  await page.keyboard.press('f');
  await expect(info(page)).toContainText('→ Demo fight.txt');
  await expect(frame(page).locator('[data-btn="FORMAT: TEXT"]')).toBeVisible();

  // S: the text download.
  const download = page.waitForEvent('download');
  await page.keyboard.press('s');
  const file = await download;
  expect(file.suggestedFilename()).toBe('Demo fight.txt');
  const text = await (await file.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
  expect(text.startsWith('## Start of the demo\n[SYSTEM] Rasta logged in.\nReconnecting.\n')).toBe(true);
  expect(text).not.toContain('\x1b');
  expect(text).not.toContain('change width');
  await expect(frame(page).locator('.wc-flash')).toHaveText('Exported Demo fight.txt');

  // Map click jumps (the cursor lands near the top of the log).
  await frame(page).locator('[data-map-row="0"]').click();
  await expect(frame(page).locator('.wc-exp-row[data-item="0"]')).toBeVisible();

  // BACK returns to History with its cursor; the edits are back on reopen.
  await frame(page).locator('[data-btn="BACK"]').click();
  await expect(title(page)).toHaveText('─── History ───');
  await expect(cur(page)).toContainText('Rasta');
  await frame(page).locator('[data-btn="EXPORT"]').click();
  await expect(info(page)).toContainText('· 1 excluded · 1 comments · → Demo fight.txt');
  await expect(rows(page).first()).toHaveText(/^.{3}## Start of the demo/);

  // After a reload too (IndexedDB).
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.locator('.wc-start .wc-mrow[data-key="history"] .wc-label').click();
  await expect(title(page)).toHaveText('─── History ───');
  await openEditor(page);
  await expect(info(page)).toContainText('· 1 excluded · 1 comments · → Demo fight.txt');
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('─── History ───');
  expect(errors).toEqual([]);
});

test('export editor: excluding the login line drops it from the text export', async ({ page }) => {
  await openHistory(page);
  await openEditor(page);
  // X on the login row, X again on the next row: only the login row is excluded.
  await expect(curRow(page)).toHaveAttribute('data-kind', 'system');
  await page.keyboard.press('x');
  await expect(curRow(page)).toHaveAttribute('data-kind', 'excluded');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('x');
  await expect(rows(page).first()).toHaveAttribute('data-kind', 'excluded');
  await expect(rows(page).nth(1)).toHaveAttribute('data-kind', 'entry');
  await expect(info(page)).toContainText('· 1 excluded ·');
  await page.keyboard.press('f');
  const download = page.waitForEvent('download');
  await page.keyboard.press('s');
  const text = await (await (await download).createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
  expect(text.startsWith('Reconnecting.\n')).toBe(true);
  // The second run's login line is still there.
  expect(text.match(/^\[SYSTEM\] Rasta logged in\.$/gm)?.length).toBe(1);
});

test('export editor: HTML export reports the builder result in the feedback row', async ({ page }) => {
  await openHistory(page);
  await openEditor(page);
  await expect(frame(page).locator('[data-btn="FORMAT: HTML"]')).toBeVisible();
  await frame(page).locator('[data-btn="EXPORT"]').click();
  // Until P2's builder is merged the stub fails; afterwards a download starts.
  await expect(frame(page).locator('.wc-flash')).toHaveText(/^(Exported mume-Rasta-.*\.html|Export failed: .+)$/);
});
