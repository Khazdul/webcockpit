// Stage 43d (ADR 0128 §43d, ADR 0075 addendum): the export editor on the
// phone. History → Export on the demo backup: the layout fits the screen
// (the bar wraps, the strip is hidden, the toggle and Export on one row),
// margin taps select and extend, Exclude by a tap, a comment written in the
// inline composer, and both formats exported (download events).
//
// Until stage 45 removes History's phone gate ("Export: desktop only.") the
// tests skip themselves; after the merge they run.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const exp = (page: Page) => frame(page).locator('.wc-exp');
const row = (page: Page, i: number) => frame(page).locator(`.wc-exp-row[data-item="${i}"]`);
const btn = (page: Page, id: string) => frame(page).locator(`[data-btn="${id}"]`);
const opt = (page: Page, id: string) => frame(page).locator(`[data-opt="${id}"]`);
const selHead = (page: Page) => frame(page).locator('.wc-exp-selhead');

/** The box lies inside the viewport. */
async function inView(page: Page, l: Locator): Promise<void> {
  const b = (await l.boundingBox())!;
  const w = page.viewportSize()!.width;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
}

/** Start page → History → Export on the Rasta session, by taps (the History steps: one helper, stage 45 owns them). */
async function openExport(page: Page): Promise<void> {
  await pinDemoClock(page);
  await page.goto('/?phone=1');
  await page.waitForFunction(() => window.__wc !== undefined);
  await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  await frame(page).locator('.wc-sm-item[data-key="history"]').tap();
  await expect(frame(page).locator('.wc-tr:not(.is-empty)')).toHaveCount(3);
  // Rasta is the second session; the old History's buttons sit off to the side on a phone.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await frame(page).locator('[data-btn="EXPORT"]').dispatchEvent('click');
  const gate = frame(page).getByText('Export: desktop only.');
  await expect(exp(page).or(gate)).toBeVisible();
  test.skip(await gate.isVisible(), 'History still gates Export on the phone (stage 45 removes the gate)');
  await expect(row(page, 0)).toBeVisible();
}

test('export editor on the phone: the layout fits; margin taps select; exclude; a comment', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openExport(page);
  const w = page.viewportSize()!.width;
  // Nothing wider than the screen; the strip is hidden; the bar's tools and the foot in reach.
  expect(await exp(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect(frame(page).locator('.wc-exp-map')).toBeHidden();
  for (const id of ['EXCLUDE', 'COMMENT', 'EDIT', 'DELETE', 'TITLE', 'EXPORT']) await inView(page, btn(page, id));
  await inView(page, opt(page, 'HTML'));
  await inView(page, opt(page, 'TEXT'));
  // The toggle and Export on one row; the selection heading on a line of its own.
  const seg = (await frame(page).locator('.wc-exp-outs .wc-lk-seg').boundingBox())!;
  const ex = (await btn(page, 'EXPORT').boundingBox())!;
  expect(Math.abs(seg.y + seg.height / 2 - (ex.y + ex.height / 2))).toBeLessThan(4);
  const sh = (await selHead(page).boundingBox())!;
  const tools = (await frame(page).locator('.wc-exp-tools').boundingBox())!;
  expect(sh.y + sh.height).toBeLessThanOrEqual(tools.y + 1);
  // Tap targets: the kit's 40 px on a coarse pointer.
  expect(ex.height).toBeGreaterThanOrEqual(39);
  expect(w).toBeLessThan(600);

  // A tap in the margin selects the line, a second extends; Exclude by a tap.
  const lb = (await frame(page).locator('.wc-exp-log').boundingBox())!;
  const r1 = (await row(page, 1).boundingBox())!;
  await page.touchscreen.tap(lb.x + 10, r1.y + r1.height / 2);
  await expect(selHead(page)).toHaveText('Selection · 1 line');
  const r3 = (await row(page, 3).boundingBox())!;
  await page.touchscreen.tap(lb.x + 10, r3.y + r3.height / 2);
  await expect(selHead(page)).toHaveText(/^Selection · \d+ lines$/);
  await btn(page, 'EXCLUDE').tap();
  await expect(row(page, 1)).toHaveAttribute('data-kind', 'excluded');
  await expect(row(page, 3)).toHaveAttribute('data-kind', 'excluded');
  // A tap on the text moves the cursor and clears the selection.
  const r5 = (await row(page, 5).boundingBox())!;
  await page.touchscreen.tap(lb.x + lb.width / 2, r5.y + Math.min(8, r5.height / 2));
  await expect(selHead(page)).toHaveText(/^Line · \d+$/);
  await expect(frame(page).locator('.wc-exp-row.is-sel')).toHaveCount(0);

  // A comment in the inline composer, saved by a tap.
  await btn(page, 'COMMENT').tap();
  const comp = frame(page).locator('.wc-exp-comp');
  await expect(comp).toBeVisible();
  await inView(page, comp.locator('textarea'));
  await comp.locator('textarea').fill('From the phone');
  await expect(comp.locator('.wc-exp-preview')).toHaveText('## From the phone');
  await comp.locator('[data-btn="SAVE"]').tap();
  await expect(comp).toHaveCount(0);
  await expect(frame(page).locator('.wc-exp-row[data-kind="comment"]')).toHaveText('## From the phone');
  await expect(frame(page).locator('.wc-exp-counts')).toContainText('1 comment');
  expect(errors).toEqual([]);
});

test('export editor on the phone: both formats download', async ({ page }) => {
  await openExport(page);
  // Plain text: choose, then Export.
  await opt(page, 'TEXT').tap();
  await expect(opt(page, 'TEXT')).toHaveAttribute('aria-checked', 'true');
  const txt = page.waitForEvent('download');
  await btn(page, 'EXPORT').tap();
  expect((await txt).suggestedFilename()).toMatch(/^mume-Rasta-.*\.txt$/);
  await expect(frame(page).locator('.wc-lk-flash')).toHaveText(/^Exported mume-Rasta-.*\.txt$/);
  // The HTML replay.
  await opt(page, 'HTML').tap();
  await expect(opt(page, 'HTML')).toHaveAttribute('aria-checked', 'true');
  const html = page.waitForEvent('download', { timeout: 60_000 });
  await btn(page, 'EXPORT').tap();
  expect((await html).suggestedFilename()).toMatch(/^mume-Rasta-.*\.html$/);
  // Back by a tap returns to History.
  await frame(page).locator('.wc-lk-back').first().tap();
  await expect(exp(page)).toHaveCount(0);
});
