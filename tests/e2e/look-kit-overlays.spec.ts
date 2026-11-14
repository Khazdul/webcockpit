// Stage 42c (ADR 0127): the kit's overlays, cursors, letters and the
// stack's new parts, in the kit gallery's Overlays section (`?kit=overlays`):
// overlay dialogs over the box (the box below drawn and inert), their keys,
// an inline dialog as a key layer, a popover, the Esc rule for fields, the
// list and grid cursors and the button zone.
import { type Page, expect, test } from '@playwright/test';
import {
  dialog,
  dialogButton,
  dialogSel,
  drawnBelow,
  kitOut,
  kitSection,
  openKit,
  overlayTop,
  startTop,
} from './look';

const section = (page: Page) => kitSection(page, 'overlays');

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const box = await openKit(page, 'overlays');
  await expect(section(page)).toBeVisible();
  return { box, errors };
}

test('an overlay dialog sits over the box: the box stays drawn and inert, the dialog has the keys', async ({ page }) => {
  const { errors } = await open(page);
  // The gallery's box wherever it is drawn (it is no longer the top frame under the dialog).
  const box = page.locator('.wc-start .wc-lk-box.wc-kit');
  await section(page).locator('.wc-lk-btn[data-btn="Q"]').click();
  const dlg = dialog(page, 'question');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.wc-lk-hood-t')).toHaveText('Delete');
  await expect(dlg).toHaveAttribute('role', 'dialog');
  // The top frame is the overlay; the gallery's frame is drawn under it, inert.
  await expect(startTop(page)).toHaveCount(1);
  await expect(overlayTop(page)).toHaveCount(1);
  await expect(drawnBelow(page)).toHaveCount(1);
  await expect(drawnBelow(page)).toHaveAttribute('inert', '');
  await expect(box).toBeVisible();
  // Centred over the box below (once its rise has ended).
  await dlg.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const b = (await box.boundingBox())!;
  const d = (await dlg.boundingBox())!;
  expect(Math.abs(d.x + d.width / 2 - (b.x + b.width / 2))).toBeLessThan(3);
  expect(Math.abs(d.y + d.height / 2 - (b.y + b.height / 2))).toBeLessThan(3);
  // The gallery's keys wait ('[' would switch the section).
  await page.keyboard.press('[');
  await expect(page.locator('.wc-start .wc-kit-section[data-section="overlays"]')).toBeVisible();
  // Y: its letter. The flash the dialog made shows on the page after the pop.
  await page.keyboard.press('y');
  await expect(dlg).toHaveCount(0);
  await expect(kitOut(page)).toHaveText('question: yes');
  await expect(section(page).locator('.wc-lk-flash')).toHaveText('Deleted “gibur”.');
  await expect(drawnBelow(page)).toHaveCount(0);
  // Esc cancels the dialog only; the gallery stays.
  await page.keyboard.press('q');
  await expect(dlg).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(kitOut(page)).toHaveText('question: cancelled');
  await expect(box).toBeVisible();
  expect(errors).toEqual([]);
});

test('a dialog’s buttons: Tab and ← → walk them, Enter presses the walked one, a click presses', async ({ page }) => {
  await open(page);
  await page.keyboard.press('q');
  await expect(dialog(page, 'question')).toBeVisible();
  expect(await dialogSel(page, 'question')).toBeNull();
  await page.keyboard.press('Tab');
  await expect(dialogButton(page, 'question', 'NO')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('ArrowLeft');
  await expect(dialogButton(page, 'question', 'YES')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(kitOut(page)).toHaveText('question: no');
  await page.keyboard.press('q');
  await dialogButton(page, 'question', 'NO').click();
  await expect(kitOut(page)).toHaveText('question: no');
  await expect(dialog(page, 'question')).toHaveCount(0);
});

test('an input dialog: the field keeps its letters, Enter is the primary, the error shows, Esc cancels', async ({ page }) => {
  await open(page);
  await page.keyboard.press('i');
  const dlg = dialog(page, 'input');
  const input = dlg.locator('[data-field="name"] input');
  await expect(input).toBeFocused();
  // "c" is Cancel's letter, but it is text in the field.
  await page.keyboard.type('abc');
  await expect(input).toHaveValue('abc');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await expect(dlg.locator('.wc-lk-dialog-err')).toHaveText('A name is needed.');
  await page.keyboard.type('Brego');
  await expect(dlg.locator('.wc-lk-dialog-err')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(kitOut(page)).toHaveText('input: Brego');
  await page.keyboard.press('i');
  await expect(dlg.locator('input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(kitOut(page)).toHaveText('input: cancelled');
  await expect(section(page)).toBeVisible();
});

test('an error dialog, an any-key dialog and the keys box', async ({ page }) => {
  await open(page);
  await page.keyboard.press('e');
  await expect(dialog(page, 'error').locator('[role="alert"]')).toHaveText('The file is not a profile backup.');
  await page.keyboard.press('Enter');
  await expect(kitOut(page)).toHaveText('error: ok');
  await page.keyboard.press('a');
  await expect(dialog(page, 'anykey')).toBeVisible();
  await page.keyboard.press('Shift');
  await expect(dialog(page, 'anykey')).toBeVisible();
  await page.keyboard.press('x');
  await expect(dialog(page, 'anykey')).toHaveCount(0);
  await expect(kitOut(page)).toHaveText('anykey: closed');
  await page.keyboard.press('k');
  const keys = dialog(page, 'keys');
  await expect(keys.locator('dt')).toHaveCount(6);
  await expect(keys.locator('dt').first()).toHaveText('↑ ↓');
  await page.keyboard.press('ArrowDown');
  await expect(keys).toHaveCount(0);
  await expect(section(page)).toBeVisible();
});

test('an inline dialog covers its panel only and holds the page’s keys until it closes', async ({ page }) => {
  await open(page);
  await page.keyboard.press('l');
  const dlg = dialog(page, 'inline');
  await expect(dlg).toBeVisible();
  // Inside the panel, not an overlay frame.
  await expect(overlayTop(page)).toHaveCount(0);
  const panel = (await section(page).locator('.wc-kit-ov-inline').boundingBox())!;
  const d = (await dlg.boundingBox())!;
  expect(d.y).toBeGreaterThanOrEqual(panel.y);
  expect(d.y + d.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
  await page.keyboard.press(']');
  await expect(section(page)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(dialogButton(page, 'inline', 'DISCARD')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('k');
  await expect(dlg).toHaveCount(0);
  await expect(kitOut(page)).toHaveText('inline: keep');
  await page.keyboard.press('l');
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(kitOut(page)).toHaveText('inline: cancelled');
  await expect(section(page)).toBeVisible();
});

test('a popover hangs under its button; its field keeps its keys; Esc and a press outside close it', async ({ page }) => {
  await open(page);
  const anchor = section(page).locator('.wc-lk-btn[data-btn="P"]');
  await anchor.click();
  const pop = section(page).locator('.wc-lk-pop');
  await expect(pop).toBeVisible();
  const a = (await anchor.boundingBox())!;
  const p = (await pop.boundingBox())!;
  expect(p.y).toBeGreaterThanOrEqual(a.y + a.height);
  expect(p.y).toBeLessThan(a.y + a.height + 20);
  await expect(pop).toHaveAttribute('data-wc-own-keys', '');
  // Its controls work by pointer.
  await pop.locator('[data-field="loop"]').click();
  await expect(pop.locator('[data-field="loop"]')).toHaveAttribute('aria-checked', 'true');
  // Typed keys stay in its field (the gallery's ']' does not switch the section).
  const note = pop.locator('[data-field="note"] input');
  await note.click();
  await page.keyboard.type('a]b');
  await expect(note).toHaveValue('a]b');
  await expect(section(page)).toBeVisible();
  // Esc in its field closes it (not the gallery).
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(section(page)).toBeVisible();
  // A press outside closes it; the anchor's own click toggles it.
  await anchor.click();
  await expect(pop).toBeVisible();
  await section(page).locator('.wc-lk-txt').first().click();
  await expect(pop).toHaveCount(0);
  await anchor.click();
  await expect(pop).toBeVisible();
  await anchor.click();
  await expect(pop).toHaveCount(0);
  // Esc from the page (a key layer) closes it; the next Esc goes back.
  await page.keyboard.press('p');
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(section(page)).toBeVisible();
});

test('the Esc rule: Esc in a field of a look page lets go of the field; the next Esc goes back', async ({ page }) => {
  await open(page);
  const filter = section(page).locator('[data-field="filter"] input');
  await filter.click();
  await page.keyboard.type('2');
  await expect(section(page).locator('[data-kit-list] .wc-lk-row')).toHaveCount(12);
  // Letters are text in the field: 'q' opens no dialog.
  await page.keyboard.type('q');
  await expect(dialog(page, 'question')).toHaveCount(0);
  await page.keyboard.press('Backspace');
  // ↓ from the field still moves the list.
  await page.keyboard.press('ArrowDown');
  await expect(section(page).locator('[data-kit-list] .wc-lk-row.is-on')).toHaveText('Row 12');
  await page.keyboard.press('Escape');
  await expect(filter).not.toBeFocused();
  await expect(section(page)).toBeVisible();
  await expect(filter).toHaveValue('2');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-kit')).toHaveCount(0);
  await expect(startTop(page).locator('.wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
});

test('the list cursor: a pointer move highlights without scrolling, keys scroll; the button zone walks', async ({ page }) => {
  await open(page);
  const list = section(page).locator('[data-kit-list]');
  await list.scrollIntoViewIfNeeded();
  const row = (n: number) => list.locator(`.wc-lk-row[data-i="${n}"]`);
  await row(3).hover();
  await expect(row(3)).toHaveClass(/\bis-on\b/);
  expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
  await page.keyboard.press('End');
  await expect(row(29)).toHaveClass(/\bis-on\b/);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(kitOut(page)).toHaveText('list: Row 30');
  // The zone: Tab to the buttons, → walks, Enter presses; the row is idle meanwhile.
  await page.keyboard.press('Tab');
  const btn = (id: string) => section(page).locator(`.wc-lk-btn[data-btn="${id}"]`);
  await expect(btn('OPEN')).toHaveClass(/\bis-sel\b/);
  await expect(row(29)).toHaveClass(/\bis-idle\b/);
  await page.keyboard.press('ArrowRight');
  await expect(btn('RENAME')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('Enter');
  await expect(kitOut(page)).toHaveText('zone: rename Row 30');
  // A disabled button is skipped.
  await section(page).locator('[data-field="rename-on"]').click();
  await expect(btn('RENAME')).toHaveClass(/\bis-disabled\b/);
  await expect(btn('DELETE')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('ArrowLeft');
  await expect(btn('OPEN')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(section(page).locator('.wc-lk-btn.is-sel')).toHaveCount(0);
  await page.keyboard.press('ArrowUp');
  await expect(row(28)).toHaveClass(/\bis-on\b/);
  // A click on a row activates it.
  await row(27).click();
  await expect(kitOut(page)).toHaveText('list: Row 28');
});

test('the grid cursor walks the grid in two dimensions', async ({ page }) => {
  await open(page);
  const grid = section(page).locator('[data-kit-grid]');
  await grid.scrollIntoViewIfNeeded();
  const cols = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
  expect(cols).toBeGreaterThan(1);
  await page.keyboard.press('g');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(grid.locator('.wc-lk-row.is-on')).toHaveAttribute('data-i', String(1 + cols));
  await page.keyboard.press('Enter');
  await expect(kitOut(page)).toHaveText(`grid: Cell ${2 + cols}`);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await expect(grid.locator('.wc-lk-row.is-on')).toHaveAttribute('data-i', '0');
});

test('a dialog’s buttons are not pressed by key repeat; another key than the one that opened it answers at once', async ({ page }) => {
  await open(page);
  await page.keyboard.press('q');
  const dlg = dialog(page, 'question');
  await expect(dlg).toBeVisible();
  // A held key's repeats (letter, Enter, Space) press nothing.
  for (const [key, code] of [
    ['y', 'KeyY'],
    ['Enter', 'Enter'],
    [' ', 'Space'],
  ] as const) {
    await page.evaluate(([k, c]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: c, repeat: true, bubbles: true, cancelable: true })), [key, code] as const);
  }
  await page.waitForTimeout(100);
  await expect(dlg).toBeVisible();
  await expect(kitOut(page)).not.toHaveText('question: yes');
  // A real press of another key than the opening one: at once.
  await page.keyboard.press('y');
  await expect(dlg).toHaveCount(0);
  await expect(kitOut(page)).toHaveText('question: yes');
});
