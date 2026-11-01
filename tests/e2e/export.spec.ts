// Stage 7 P1, stage 33 (ADR 0115): the export editor on the demo backup.
// History → EXPORT on the Rasta session: comment, exclude, title, the two
// export buttons, the text download, the edits back after BACK and a
// reopen; mouse selection with auto-scroll; the widths; a narrow grid.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const cur = (page: Page) => frame(page).locator('.wc-tr.is-cur-focus, .wc-tr.is-cur');
const title = (page: Page) => frame(page).locator('.wc-title-row');
const panel = (page: Page) => frame(page).locator('.wc-exp-panel');
const counts = (page: Page) => frame(page).locator('.wc-exp-counts');
const selHead = (page: Page) => frame(page).locator('.wc-exp-selhead');
const docTitle = (page: Page) => frame(page).locator('.wc-exp-title');
const rows = (page: Page) => frame(page).locator('.wc-exp-row:not(.is-empty)');
const curRow = (page: Page) => frame(page).locator('.wc-exp-row.is-cur').first();

async function openHistory(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
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

test('export editor: comment, exclude, title, text download, persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openHistory(page);
  await openEditor(page);

  await expect(panel(page)).toContainText('Rasta (L42)');
  await expect(panel(page)).toContainText(/2026-09-26 · \d+ lines/);
  await expect(counts(page)).toHaveText('0 excluded · 0 comments');
  await expect(docTitle(page)).toHaveText(/^mume-Rasta-2026-09-26T21-00-\d\d$/);
  // The player's login line is a row of its own, before the first game line.
  await expect(rows(page).first()).toContainText('[SYSTEM] Rasta logged in.');
  await expect(rows(page).first()).toHaveAttribute('data-kind', 'system');
  await expect(rows(page).first().locator('.wc-exp-sys')).toHaveText('[SYSTEM] Rasta logged in.');
  await expect(rows(page).nth(1)).toContainText('Reconnecting.');
  await expect(curRow(page)).toContainText('►');
  await expect(frame(page).locator('.wc-exp-map-row')).not.toHaveCount(0);
  // No button column left of the log: the log starts one cell from the edge.
  await expect(frame(page).locator('.wc-btncol')).toHaveCount(0);

  // C: a comment before the first line.
  await page.keyboard.press('c');
  await expect(title(page)).toHaveText('─── Add comment ───');
  await page.keyboard.type('Start of the demo');
  await expect(frame(page).locator('.wc-exp-preview')).toHaveText('## Start of the demo');
  await expect(frame(page).locator('.wc-exp-hold')).toHaveText('Holds the replay for 3 s.');
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText('─── Export Editor ───');
  await expect(rows(page).first()).toHaveText(/^.{2}## Start of the demo/);
  await expect(curRow(page)).toHaveAttribute('data-kind', 'comment');
  await expect(selHead(page)).toHaveText('COMMENT');
  await expect(frame(page).locator('[data-btn="EDIT COMMENT"]')).toBeVisible();
  await expect(frame(page).locator('[data-map-row="0"] .wc-exp-comment')).toHaveText('■');

  // End ↑ X: exclude the last line.
  await page.keyboard.press('End');
  await expect(curRow(page)).toHaveAttribute('data-kind', 'end');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('x');
  await expect(curRow(page)).toHaveAttribute('data-kind', 'excluded');
  await expect(curRow(page).locator('.wc-exp-bar')).toHaveText('▌');
  await expect(frame(page).locator('[data-btn="INCLUDE"]')).toBeVisible();
  await expect(counts(page)).toHaveText('1 excluded · 1 comment');

  // EDIT TITLE: a title.
  await frame(page).locator('[data-btn="EDIT TITLE"]').click();
  await expect(title(page)).toHaveText('─── Export title ───');
  await page.keyboard.press('Control+u');
  await page.keyboard.type('Demo fight');
  await page.keyboard.press('Enter');
  await expect(docTitle(page)).toHaveText('Demo fight');

  // TEXT FILE: the text download; the button is marked as the last used.
  const download = page.waitForEvent('download');
  await frame(page).locator('[data-btn="TEXT FILE"]').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Demo fight.txt');
  const text = await (await file.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
  expect(text.startsWith('## Start of the demo\n[SYSTEM] Rasta logged in.\nReconnecting.\n')).toBe(true);
  expect(text).not.toContain('\x1b');
  expect(text).not.toContain('change width');
  await expect(frame(page).locator('.wc-flash')).toHaveText('Exported Demo fight.txt');
  await expect(frame(page).locator('.wc-exp-last')).toHaveText(' ◄ last');
  await expect(frame(page).locator('.wc-line:has([data-btn="TEXT FILE"]) .wc-exp-last')).toBeVisible();

  // Map click jumps (the cursor lands near the top of the log).
  await frame(page).locator('[data-map-row="0"]').click();
  await expect(frame(page).locator('.wc-exp-row[data-item="0"]')).toBeVisible();

  // BACK returns to History with its cursor; the edits are back on reopen.
  await frame(page).locator('[data-btn="BACK"]').click();
  await expect(title(page)).toHaveText('─── History ───');
  await expect(cur(page)).toContainText('Rasta');
  await frame(page).locator('[data-btn="EXPORT"]').click();
  await expect(counts(page)).toHaveText('1 excluded · 1 comment');
  await expect(docTitle(page)).toHaveText('Demo fight');
  await expect(rows(page).first()).toHaveText(/^.{2}## Start of the demo/);

  // After a reload too (IndexedDB).
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.locator('.wc-start .wc-mrow[data-key="history"] .wc-label').click();
  await expect(title(page)).toHaveText('─── History ───');
  await openEditor(page);
  await expect(counts(page)).toHaveText('1 excluded · 1 comment');
  await expect(frame(page).locator('.wc-line:has([data-btn="TEXT FILE"]) .wc-exp-last')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('─── History ───');
  expect(errors).toEqual([]);
});

test('export editor: excluding the login line drops it from the text export', async ({ page }) => {
  await openHistory(page);
  await openEditor(page);
  // X on the login row: only that row is excluded.
  await expect(curRow(page)).toHaveAttribute('data-kind', 'system');
  await page.keyboard.press('x');
  await expect(curRow(page)).toHaveAttribute('data-kind', 'excluded');
  await expect(rows(page).nth(1)).toHaveAttribute('data-kind', 'entry');
  await expect(counts(page)).toContainText('1 excluded ·');
  const download = page.waitForEvent('download');
  await page.keyboard.press('p');
  const text = await (await (await download).createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
  expect(text.startsWith('Reconnecting.\n')).toBe(true);
  // The second run's login line is still there.
  expect(text.match(/^\[SYSTEM\] Rasta logged in\.$/gm)?.length).toBe(1);
});

test('export editor: HTML REPLAY reports the builder result in the feedback row', async ({ page }) => {
  await openHistory(page);
  await openEditor(page);
  await expect(frame(page).locator('.wc-line:has([data-btn="HTML REPLAY"]) .wc-exp-last')).toBeVisible();
  await frame(page).locator('[data-btn="HTML REPLAY"]').click();
  await expect(frame(page).locator('.wc-flash')).toHaveText(/^(Exported mume-Rasta-.*\.html|Export failed: .+)$/);
});

test('export editor: a drag in the margin selects and scrolls; Shift+click extends; Esc clears first', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openHistory(page);
  await openEditor(page);
  const log = frame(page).locator('.wc-exp-log');
  const lb = (await log.boundingBox())!;
  const r2 = (await frame(page).locator('.wc-exp-row[data-item="2"]').boundingBox())!;
  const r5 = (await frame(page).locator('.wc-exp-row[data-item="5"]').boundingBox())!;
  // Press in the margin of row 2, drag to row 5.
  await page.mouse.move(lb.x + 3, r2.y + r2.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + 3, r5.y + r5.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(selHead(page)).toHaveText(/^SELECTION · \d+ lines$/);
  await expect(frame(page).locator('.wc-exp-row[data-item="2"]')).toHaveClass(/is-sel/);
  await expect(frame(page).locator('.wc-exp-row[data-item="5"]')).toHaveClass(/is-cur/);
  await expect(frame(page).locator('.wc-exp-row[data-item="1"]')).not.toHaveClass(/is-sel/);
  await page.keyboard.press('x');
  await expect(frame(page).locator('.wc-exp-row[data-item="3"]')).toHaveAttribute('data-kind', 'excluded');
  await expect(frame(page).locator('.wc-exp-row[data-item="1"]')).not.toHaveAttribute('data-kind', 'excluded');
  await expect(frame(page).locator('[data-btn="INCLUDE"]')).toBeVisible();
  // Esc clears the selection, the editor stays.
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('─── Export Editor ───');
  await expect(frame(page).locator('.wc-exp-row.is-sel')).toHaveCount(0);

  // A press without movement on a text row moves the cursor; Shift+click extends.
  const r8 = (await frame(page).locator('.wc-exp-row[data-item="8"]').boundingBox())!;
  await page.mouse.click(lb.x + 100, r8.y + r8.height / 2);
  await expect(frame(page).locator('.wc-exp-row[data-item="8"]')).toHaveClass(/is-cur/);
  await expect(selHead(page)).toHaveText(/^LINE · \d+$/);
  const r10 = (await frame(page).locator('.wc-exp-row[data-item="10"]').boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.click(lb.x + 100, r10.y + r10.height / 2);
  await page.keyboard.up('Shift');
  await expect(selHead(page)).toHaveText(/^SELECTION · 3 lines$/);

  // A drag below the log scrolls it and the selection follows.
  const t0 = await log.evaluate((el) => el.scrollTop);
  await page.mouse.move(lb.x + 100, r8.y + r8.height / 2);
  await page.mouse.down();
  // Just below the log (still inside the window: Firefox sends no moves from outside it).
  await page.mouse.move(lb.x + 100, lb.y + lb.height + 12, { steps: 3 });
  await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBeGreaterThan(t0 + 200);
  await page.mouse.up();
  const n = Number((await selHead(page).textContent())!.match(/(\d+) lines/)![1]);
  expect(n).toBeGreaterThan(20);
  await expect(frame(page).locator('.wc-exp-row.is-cur')).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('─── History ───');
  expect(errors).toEqual([]);
});

test('export editor: the log fills the width beside the panel; a narrow window puts the panel above', async ({ page }) => {
  await openHistory(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openEditor(page);
  const vw = 1600;
  const log = (await frame(page).locator('.wc-exp-log').boundingBox())!;
  const pnl = (await panel(page).boundingBox())!;
  // The log starts near the left edge and the panel ends near the right edge.
  expect(log.x).toBeLessThan(40);
  expect(pnl.x + pnl.width).toBeGreaterThan(vw - 40);
  expect(log.width).toBeGreaterThan(vw - pnl.width - 120);
  // Narrow: the summary and the buttons above the log.
  await page.setViewportSize({ width: 700, height: 800 });
  await expect(panel(page)).toHaveCount(0);
  await expect(frame(page).locator('.wc-exp-summary')).toContainText('Rasta (L42)');
  await expect(frame(page).locator('[data-btn="HTML REPLAY"]')).toBeVisible();
  await page.keyboard.press('ArrowDown', { delay: 0 });
  await page.keyboard.press('Shift+ArrowDown');
  await expect(frame(page).locator('.wc-exp-summary')).toContainText('· 2 selected');
  await page.keyboard.press('x');
  await expect(frame(page).locator('.wc-exp-summary')).toContainText('2 excluded');
});
