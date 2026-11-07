// Stage 7 P1, stage 33 (ADR 0115), stage 43d (ADR 0128 §43d): the export
// editor on the demo backup. History → Export on the Rasta session: the
// bar, a comment written inline in the log, exclude, the title inline in
// the foot, the format toggle (H / P only choose) and Export (O), both
// downloads, the edits back after Back and a reopen; mouse selection with
// auto-scroll; the page's width cap; a narrow window.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const cur = (page: Page) => frame(page).locator('.wc-tr.is-cur-focus, .wc-tr.is-cur');
const title = (page: Page) => frame(page).locator('.wc-title-row');
const exp = (page: Page) => frame(page).locator('.wc-exp');
const counts = (page: Page) => frame(page).locator('.wc-exp-counts');
const selHead = (page: Page) => frame(page).locator('.wc-exp-selhead');
const docTitle = (page: Page) => frame(page).locator('.wc-exp-title');
const fileName = (page: Page) => frame(page).locator('.wc-exp-fn');
const rows = (page: Page) => frame(page).locator('.wc-exp-row');
const row = (page: Page, i: number) => frame(page).locator(`.wc-exp-row[data-item="${i}"]`);
const curRow = (page: Page) => frame(page).locator('.wc-exp-row.is-cur').first();
const btn = (page: Page, id: string) => frame(page).locator(`[data-btn="${id}"]`);
const opt = (page: Page, id: string) => frame(page).locator(`[data-opt="${id}"]`);
const comp = (page: Page) => frame(page).locator('.wc-exp-comp');

async function openHistory(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  await expect(title(page)).toHaveText('─── History ───');
}

/** History → Export on the Rasta session (the History steps: one helper, stage 45 owns them). */
async function openEditor(page: Page): Promise<void> {
  // History loads its sessions asynchronously; keys before that are lost.
  await expect(frame(page).locator('.wc-tr:not(.is-empty)')).toHaveCount(3);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(cur(page)).toContainText('Rasta');
  await frame(page).locator('[data-btn="EXPORT"]').click();
  await expect(exp(page)).toBeVisible();
  await expect(rows(page).first()).toBeVisible();
}

const backToHistory = async (page: Page): Promise<void> => {
  await expect(title(page)).toHaveText('─── History ───');
};

test('export editor: comment, exclude, title, both formats, persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openHistory(page);
  await openEditor(page);

  await expect(frame(page).locator('.wc-lk-hood-t:not(.is-out)')).toHaveText('Export');
  await expect(frame(page).locator('.wc-exp-name')).toHaveText('Rasta');
  await expect(counts(page)).toHaveText(/^Level 42 · 2026-09-26 · [\d,]+ lines · 0 excluded · 0 comments$/);
  await expect(docTitle(page)).toHaveText(/^mume-Rasta-2026-09-26T21-00-\d\d$/);
  await expect(fileName(page)).toHaveText(/\.html$/);
  await expect(opt(page, 'HTML')).toHaveAttribute('aria-checked', 'true');
  await expect(opt(page, 'TEXT')).toHaveAttribute('aria-checked', 'false');
  // The player's login line is a row of its own, before the first game line.
  await expect(rows(page).first()).toHaveText('[SYSTEM] Rasta logged in.');
  await expect(rows(page).first()).toHaveAttribute('data-kind', 'system');
  await expect(rows(page).first().locator('.wc-exp-sys')).toHaveText('[SYSTEM] Rasta logged in.');
  await expect(row(page, 1)).toContainText('Reconnecting.');
  await expect(curRow(page)).toHaveAttribute('data-item', '0');
  await expect(selHead(page)).toHaveText('Line · 1');
  // The overview strip with its thumb and the event letters.
  await expect(frame(page).locator('.wc-exp-map .wc-exp-thumb')).toBeVisible();
  await expect(frame(page).locator('.wc-exp-map [data-mark]')).not.toHaveCount(0);

  // C: a comment written in the log, before the first line.
  await page.keyboard.press('c');
  await expect(comp(page)).toBeVisible();
  await expect(comp(page)).toContainText('Add comment');
  const ta = comp(page).locator('textarea');
  await expect(ta).toBeFocused();
  // The composer sits in the log, above the line it comes before.
  const cb = (await comp(page).boundingBox())!;
  const r0 = (await row(page, 0).boundingBox())!;
  expect(cb.y + cb.height).toBeLessThanOrEqual(r0.y + 1);
  await page.keyboard.type('Start of the demo');
  await expect(comp(page).locator('.wc-exp-preview')).toHaveText('## Start of the demo');
  await expect(comp(page).locator('.wc-exp-hold')).toHaveText('Holds the replay for 3 s.');
  await expect(comp(page).locator('.wc-exp-count')).toHaveText('17 / 600');
  await page.keyboard.press('Enter');
  await expect(comp(page)).toHaveCount(0);
  await expect(rows(page).first()).toHaveText('## Start of the demo');
  await expect(curRow(page)).toHaveAttribute('data-kind', 'comment');
  await expect(selHead(page)).toHaveText('Comment');
  await expect(btn(page, 'EDIT')).not.toHaveAttribute('aria-disabled');
  await expect(frame(page).locator('.wc-exp-map .wc-exp-mc')).toHaveCount(1);

  // End ↑ X: exclude the last line.
  await page.keyboard.press('End');
  await expect(curRow(page)).toHaveAttribute('data-kind', 'end');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('x');
  await expect(curRow(page)).toHaveAttribute('data-kind', 'excluded');
  await expect(btn(page, 'INCLUDE')).toBeVisible();
  await expect(counts(page)).toHaveText(/· 1 excluded · 1 comment$/);
  await expect(frame(page).locator('.wc-exp-map .wc-exp-mx')).toHaveCount(1);

  // The title, inline in the foot (its button).
  await btn(page, 'TITLE').click();
  const tf = frame(page).locator('[data-field="title"] input');
  await expect(tf).toBeFocused();
  await page.keyboard.press('Control+u');
  await expect(frame(page).locator('.wc-exp-thint')).toHaveText('Empty: the default title.');
  await page.keyboard.type('Demo fight');
  await expect(frame(page).locator('.wc-exp-thint')).toHaveText('File: Demo fight.html');
  await page.keyboard.press('Enter');
  await expect(docTitle(page)).toHaveText('Demo fight');

  // P chooses the plain text (no download); O exports it.
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.keyboard.press('p');
  await expect(opt(page, 'TEXT')).toHaveAttribute('aria-checked', 'true');
  await expect(fileName(page)).toHaveText('Demo fight.txt');
  await page.waitForTimeout(300);
  expect(downloads).toBe(0);
  const download = page.waitForEvent('download');
  await page.keyboard.press('o');
  const file = await download;
  expect(file.suggestedFilename()).toBe('Demo fight.txt');
  const text = await (await file.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
  expect(text.startsWith('## Start of the demo\n[SYSTEM] Rasta logged in.\nReconnecting.\n')).toBe(true);
  expect(text).not.toContain('\x1b');
  expect(text).not.toContain('change width');
  await expect(frame(page).locator('.wc-lk-flash')).toHaveText('Exported Demo fight.txt');

  // A press on the strip's top jumps there.
  const map = (await frame(page).locator('.wc-exp-map').boundingBox())!;
  await page.mouse.click(map.x + map.width / 2, map.y + 2);
  await expect(row(page, 0)).toBeInViewport();

  // Back returns to History with its cursor; the edits are back on reopen.
  await frame(page).locator('.wc-lk-back').first().click();
  await backToHistory(page);
  await expect(cur(page)).toContainText('Rasta');
  await frame(page).locator('[data-btn="EXPORT"]').click();
  await expect(counts(page)).toHaveText(/· 1 excluded · 1 comment$/);
  await expect(docTitle(page)).toHaveText('Demo fight');
  await expect(opt(page, 'TEXT')).toHaveAttribute('aria-checked', 'true');
  await expect(rows(page).first()).toHaveText('## Start of the demo');

  // After a reload too (IndexedDB).
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  await backToHistory(page);
  await openEditor(page);
  await expect(counts(page)).toHaveText(/· 1 excluded · 1 comment$/);
  await expect(opt(page, 'TEXT')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await backToHistory(page);
  expect(errors).toEqual([]);
});

test('export editor: excluding the login line drops it from the text export', async ({ page }) => {
  await openHistory(page);
  await openEditor(page);
  // X on the login row: only that row is excluded.
  await expect(curRow(page)).toHaveAttribute('data-kind', 'system');
  await page.keyboard.press('x');
  await expect(curRow(page)).toHaveAttribute('data-kind', 'excluded');
  await expect(row(page, 1)).toHaveAttribute('data-kind', 'entry');
  await expect(counts(page)).toContainText('1 excluded ·');
  await opt(page, 'TEXT').click();
  const download = page.waitForEvent('download');
  await btn(page, 'EXPORT').click();
  const text = await (await (await download).createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
  expect(text.startsWith('Reconnecting.\n')).toBe(true);
  // The second run's login line is still there.
  expect(text.match(/^\[SYSTEM\] Rasta logged in\.$/gm)?.length).toBe(1);
});

test('export editor: Export builds the HTML replay and reports it in the flash', async ({ page }) => {
  await openHistory(page);
  await openEditor(page);
  await expect(opt(page, 'HTML')).toHaveAttribute('aria-checked', 'true');
  const download = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
  await page.keyboard.press('o');
  await expect(frame(page).locator('.wc-lk-flash')).toHaveText(/^(Exported mume-Rasta-.*\.html|Export failed: .+)$/, { timeout: 60_000 });
  const flash = (await frame(page).locator('.wc-lk-flash').textContent()) ?? '';
  if (flash.startsWith('Exported')) expect((await download)?.suggestedFilename()).toMatch(/^mume-Rasta-.*\.html$/);
});

test('export editor: a drag in the margin selects and scrolls; Shift+click extends; Esc clears first', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openHistory(page);
  await openEditor(page);
  const log = frame(page).locator('.wc-exp-log');
  const lb = (await log.boundingBox())!;
  const r2 = (await row(page, 2).boundingBox())!;
  const r5 = (await row(page, 5).boundingBox())!;
  // Press in the margin of row 2, drag to row 5.
  await page.mouse.move(lb.x + 5, r2.y + r2.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + 5, r5.y + r5.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(selHead(page)).toHaveText(/^Selection · \d+ lines$/);
  await expect(row(page, 2)).toHaveClass(/is-sel/);
  await expect(row(page, 5)).toHaveClass(/is-cur/);
  await expect(row(page, 1)).not.toHaveClass(/is-sel/);
  await page.keyboard.press('x');
  await expect(row(page, 3)).toHaveAttribute('data-kind', 'excluded');
  await expect(row(page, 1)).not.toHaveAttribute('data-kind', 'excluded');
  await expect(btn(page, 'INCLUDE')).toBeVisible();
  // Esc clears the selection, the editor stays.
  await page.keyboard.press('Escape');
  await expect(exp(page)).toBeVisible();
  await expect(frame(page).locator('.wc-exp-row.is-sel')).toHaveCount(0);

  // A press without movement on a text row moves the cursor; Shift+click extends.
  const r8 = (await row(page, 8).boundingBox())!;
  await page.mouse.click(lb.x + 100, r8.y + r8.height / 2);
  await expect(row(page, 8)).toHaveClass(/is-cur/);
  await expect(selHead(page)).toHaveText(/^Line · \d+$/);
  const r10 = (await row(page, 10).boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.click(lb.x + 100, r10.y + r10.height / 2);
  await page.keyboard.up('Shift');
  await expect(selHead(page)).toHaveText(/^Selection · 3 lines$/);

  // A drag below the log scrolls it and the selection follows.
  const t0 = await log.evaluate((el) => el.scrollTop);
  await page.mouse.move(lb.x + 100, r8.y + r8.height / 2);
  await page.mouse.down();
  // Just below the log (still inside the window: Firefox sends no moves from outside it).
  await page.mouse.move(lb.x + 100, lb.y + lb.height + 12, { steps: 3 });
  await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBeGreaterThan(t0 + 200);
  await page.mouse.up();
  const n = Number((await selHead(page).textContent())!.match(/(\d+) lines/)![1]);
  expect(n).toBeGreaterThan(10);
  await expect(frame(page).locator('.wc-exp-row.is-cur')).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await backToHistory(page);
  expect(errors).toEqual([]);
});

test('export editor: Tab walks the buttons; the inline title and composer keep their keys', async ({ page }) => {
  await openHistory(page);
  await openEditor(page);
  const sel = () => frame(page).locator('.wc-exp .is-sel');
  await page.keyboard.press('Tab');
  await expect(sel()).toHaveAttribute('data-btn', 'EXCLUDE');
  await page.keyboard.press('ArrowRight');
  await expect(sel()).toHaveAttribute('data-btn', 'COMMENT');
  await page.keyboard.press('ArrowRight');
  await expect(sel()).toHaveAttribute('data-btn', 'TITLE');
  await page.keyboard.press('ArrowRight');
  await expect(sel()).toHaveAttribute('data-opt', 'HTML');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(opt(page, 'TEXT')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(sel()).toHaveAttribute('data-btn', 'EXPORT');
  // Back to the title and open it with Enter: letters typed there are text.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(frame(page).locator('[data-field="title"] input')).toBeFocused();
  await page.keyboard.press('Control+u');
  await page.keyboard.type('xcdo');
  await expect(counts(page)).toHaveText(/· 0 excluded · 0 comments$/);
  // Esc cancels the field; the next Esc clears nothing and leaves.
  await page.keyboard.press('Escape');
  await expect(frame(page).locator('[data-field="title"]')).toHaveCount(0);
  await expect(docTitle(page)).toHaveText(/^mume-Rasta-/);
  await page.keyboard.press('Escape');
  await backToHistory(page);
});

test('export editor: the page caps its width on a wide window; a narrow window drops the strip', async ({ page }) => {
  await openHistory(page);
  await page.setViewportSize({ width: 2400, height: 1200 });
  await openEditor(page);
  const box = (await frame(page).locator('.wc-lk-box').first().boundingBox())!;
  const pg = (await exp(page).boundingBox())!;
  // The box is full width; the page inside it is capped and centred.
  expect(box.width).toBeGreaterThan(2300);
  expect(pg.width).toBeLessThanOrEqual(1320);
  expect(Math.abs(pg.x + pg.width / 2 - (box.x + box.width / 2))).toBeLessThan(4);
  // The log wraps at 120 columns (its measured wrap width), and no rendered line is longer.
  await expect(frame(page).locator('.wc-exp-log')).toHaveAttribute('data-cols', '120');
  const longest = await frame(page)
    .locator('.wc-exp-ln')
    .evaluateAll((els) => Math.max(...els.map((e) => (e.textContent ?? '').length)));
  expect(longest).toBeLessThanOrEqual(120);
  await expect(frame(page).locator('.wc-exp-map')).toBeVisible();
  // Narrow: the strip goes, the selection heading takes its own line.
  await page.setViewportSize({ width: 700, height: 800 });
  await expect(frame(page).locator('.wc-exp-map')).toBeHidden();
  await expect.poll(async () => Number(await frame(page).locator('.wc-exp-log').getAttribute('data-cols'))).toBeLessThan(90);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(selHead(page)).toHaveText('Selection · 2 lines');
  await page.keyboard.press('x');
  await expect(counts(page)).toContainText('2 excluded');
  await expect(btn(page, 'EXPORT')).toBeVisible();
});
