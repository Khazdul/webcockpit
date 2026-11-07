// Stage 44b (ADR 0129): the script editor on a phone. The box fills the
// width, the code is a size smaller, and Save, Find and Manual are tools
// in the well's corner, big enough to tap; a tap on Save or Manual never
// moves the focus into a field (no soft keyboard by mistake).
import { type Locator, type Page, expect, test } from '@playwright/test';

const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const editor = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sed');
const tool = (page: Page, id: string) => editor(page).locator(`.wc-sed-tools [data-btn="${id}"]`);
// A row of the Scripts page: the grid page's `data-script`, the lantern page's `data-name` (stage 44a).
const row = (f: Locator, name: string) => f.locator(`.wc-scr-row[data-script="${name}"], .wc-scr-row[data-name="${name}"]`);
const source = (page: Page) => page.evaluate(() => window.__wc!.shell.scripts!.list().find((s) => s.name === 'phoneed')!.source);

/** Start page → Scripts → the script `phoneed` → Edit, all by taps. */
async function openEditor(page: Page): Promise<void> {
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async () => {
    const l = window.__wc!.shell.scripts!;
    await l.init();
    if (!l.list().some((s) => s.name === 'phoneed')) await l.create('phoneed');
  });
  await startFrame(page).locator('.wc-sm-item[data-key="scripts"]').tap();
  const f = startFrame(page);
  await row(f, 'phoneed').locator('.wc-scr-name').tap();
  await f.locator('[data-btn="EDIT"]:visible').first().tap();
  await expect(editor(page)).toHaveAttribute('data-script', 'phoneed');
}

test('the editor on a phone: full width, the smaller code, the tools in reach', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openEditor(page);
  const vw = page.viewportSize()!.width;
  const well = (await editor(page).locator('.wc-sed-well').boundingBox())!;
  expect(well.x).toBeGreaterThanOrEqual(0);
  expect(well.x + well.width).toBeLessThanOrEqual(vw);
  expect(well.width).toBeGreaterThan(vw * 0.85);
  await expect(editor(page).locator('.cm-scroller')).toHaveCSS('font-size', '12.5px');
  for (const id of ['SAVE', 'FIND', 'MANUAL']) {
    const b = (await tool(page, id).boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(40);
    expect(b.width).toBeGreaterThanOrEqual(40);
    expect(b.x + b.width).toBeLessThanOrEqual(vw);
  }
  // No key hints on the phone either (the tools are the tap path).
  await expect(editor(page).locator('.wc-act-btn')).toHaveCount(0);

  // Type, then tap Save: saved, and the focus stays where it was.
  await editor(page).locator('.cm-content').tap();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('x = 1');
  const before = await page.evaluate(() => document.activeElement?.className ?? '');
  await tool(page, 'SAVE').tap();
  await expect.poll(() => source(page)).toContain('x = 1');
  expect(await page.evaluate(() => document.activeElement?.className ?? '')).toBe(before);

  // Find opens the find row (its field has the focus: that keyboard is wanted); its close tap shuts it.
  await tool(page, 'FIND').tap();
  const find = editor(page).locator('.wc-lk-search');
  await expect(find).toBeVisible();
  await find.locator('[data-btn="close"]').tap();
  await expect(find).toHaveCount(0);

  // Manual, and Back returns to the editor.
  await tool(page, 'MANUAL').tap();
  await expect(page.locator('.wc-frame:not([hidden]) .wc-sman')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeVisible();
  // The box's Back leaves the editor (no changes: no prompt).
  await startFrame(page).locator('.wc-lk-back').first().tap();
  await expect(editor(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
