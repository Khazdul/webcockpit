// The profile editor B on a phone (stage 43a, ADR 0128): from the start
// page the editor lays itself out in one column, a tap opens an entry as a
// sheet ("‹ Aliases" back), the soft keyboard types into real fields, the
// kinds are a row of tabs, every target is a tap away, key capture says it
// is desktop only, and Help's sections are a dropdown. The in-game hosts
// (the ESC menu's Profile row, #profile) are 43b's specs.
import { type Page, expect, test } from '@playwright/test';
import { morphDone } from './look';

const pe = (page: Page) => page.locator('.wc-frame:not([hidden]) .wc-pe');
const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null));

/** Start page → Profile → a tap on the chosen profile's name opens the editor. */
async function openEditor(page: Page, text: string): Promise<void> {
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (t) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', t);
  }, text);
  await startFrame(page).locator('.wc-sm-item[data-key="profile"]').tap();
  await expect(startFrame(page).locator('.wc-lk-hood-t')).toHaveText('Profiles');
  await startFrame(page).locator('[data-btn="EDIT"]').tap();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await morphDone(page);
}

test('the editor on a phone: one column, a tap opens the entry as a sheet, typing in its fields', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openEditor(page, '#alias {gv %1} {get %1}\n#alias {k} {kill}\n#macro {F1} {bash}\n');
  await expect(pe(page)).toHaveAttribute('data-layout', 'narrow');
  // The box fits the screen; the rail is a row of tabs above the list.
  const view = page.viewportSize()!;
  const box = (await pe(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width);
  await pe(page).locator('[data-rail="alias"]').tap();
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  const rail = (await pe(page).locator('.wc-pe-rail').boundingBox())!;
  const list = (await pe(page).locator('.wc-pe-list').boundingBox())!;
  expect(rail.y + rail.height).toBeLessThanOrEqual(list.y + 1);
  // Targets are at least 40 px high (coarse pointer).
  for (const sel of ['.wc-pe-views [data-opt="lite"]', '[data-btn="NEW"]', '.wc-pe-row']) {
    expect((await pe(page).locator(sel).first().boundingBox())!.height).toBeGreaterThanOrEqual(40);
  }

  // A tap on a row opens it as a sheet over the list.
  await pe(page).locator('.wc-pe-row').nth(1).tap();
  await expect(pe(page)).toHaveClass(/is-sheet/);
  await expect(pe(page).locator('.wc-pe-list')).toBeHidden();
  const field = pe(page).locator('[data-field="body"] textarea');
  await field.tap();
  await expect(field).toBeFocused();
  await page.keyboard.type(' orc');
  await expect(field).toHaveValue('kill orc');
  // ‹ Aliases closes the sheet; leaving the field applied the edit.
  await pe(page).locator('[data-btn="SHEET"]').tap();
  await expect(pe(page)).not.toHaveClass(/is-sheet/);
  await expect.poll(() => stored(page)).toBe('#alias {gv %1} {get %1}\n#alias {k} {kill orc}\n#macro {F1} {bash}\n');
  await expect(pe(page).locator('.wc-pe-status')).toHaveText('All saved');

  // A new entry by its button: the sheet opens on its Pattern.
  await pe(page).locator('[data-btn="NEW"]').tap();
  await expect(pe(page).locator('[data-field="pattern"] input')).toBeFocused();
  await page.keyboard.type('zz');
  await pe(page).locator('[data-btn="SHEET"]').tap();
  await expect.poll(() => stored(page)).toContain('#alias {zz} {}');

  // Macros: key capture is desktop only.
  await pe(page).locator('[data-rail="macro"]').tap();
  await pe(page).locator('[data-btn="NEW"]').tap();
  await expect(pe(page).locator('.wc-pe-flash')).toHaveText('Key capture: desktop only.');
  await pe(page).locator('.wc-pe-row').first().tap();
  await expect(pe(page).locator('.wc-pe-keyhint')).toHaveText('Key capture: desktop only.');
  await pe(page).locator('[data-btn="SHEET"]').tap();

  // Help: the sections are a dropdown; Back leaves.
  await pe(page).locator('.wc-pe-views [data-opt="help"]').tap();
  await expect(pe(page).locator('.wc-pe-hsel select')).toBeVisible();
  await expect(pe(page).locator('.wc-lk-mtoc')).toBeHidden();
  await startFrame(page).locator('.wc-lk-back').first().tap();
  await expect(startFrame(page).locator('.wc-lk-box > .wc-lk-hood .wc-lk-hood-t')).toHaveText('Profiles');
  await expect(startFrame(page).locator('.wc-lk-flash')).toHaveText('Saved default.');
  expect(errors).toEqual([]);
});
