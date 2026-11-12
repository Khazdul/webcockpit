// The Profile list's dialogs in the new look (ADR 0128 addendum 2026-11-12;
// src/chrome/frames/profile-dialogs.tsx): New (the name, Blank or Copy, the
// profile to copy), Rename and Delete, each a kit `Dialog` over the list.
//
// - Keys: N / R / D open them; Enter confirms; Esc goes one step back (the
//   typed name is kept) and cancels at the first; B / C and ↑ ↓ + Enter in
//   the choice; ↑ ↓ PgUp PgDn Home End + Enter in the copy list; y/N on
//   Delete (any other key cancels). Afterwards the list has the keys again.
// - Pointer: every button and row by click; hover moves the list's cursor;
//   a click on the veil cancels Delete.
// - Validation messages for names; nothing is created before the last step.
// - Many profiles: the copy list scrolls inside the dialog, the cursor's row
//   is kept in view and the Back button stays on screen.
//
// WC_SHOTS=<dir> saves screenshots (docs/stages/img/53-p-*.png).
import { type Locator, type Page, expect, test } from '@playwright/test';
import { dialog, openFromMenu, openStart, startTop } from './look';

const SHOTS = process.env.WC_SHOTS ?? '';

const plist = (page: Page) => page.locator('.wc-start .wc-frame .wc-pl');
const plRow = (page: Page, name: string) => plist(page).locator(`.wc-pl-row[data-name="${name}"]`);
const plCursor = (page: Page) => plist(page).locator('.wc-pl-row.is-on');
const plFlash = (page: Page) => plist(page).locator('.wc-lk-flash');
const anyDialog = (page: Page) => page.locator('.wc-lk-dialog');
const alert = (d: Locator) => d.locator('[role="alert"]');

const names = (page: Page) => page.evaluate(async () => (await window.__wc!.shell.profiles.list()).map((r) => r.name));
const textOf = (page: Page, name: string) => page.evaluate(async (n) => (await window.__wc!.shell.profiles.get(n))?.text, name);
const selectedProfile = (page: Page) => page.evaluate(() => window.__wc!.settings.get().profile);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** The Profile list, with `extra` profiles (each with its own text) besides the two stock ones (`default`, `khazdul`). */
async function openProfiles(page: Page, extra: string[] = []): Promise<void> {
  await openStart(page);
  await page.evaluate(async (list) => {
    const p = window.__wc!.shell.profiles;
    await p.init();
    for (const n of list) await p.create(n, `#nop the text of ${n}\n`);
  }, extra);
  await openFromMenu(page, 'profile');
  await expect(plist(page).locator('.wc-lk-hood-t')).toHaveText('Profiles');
  await expect(plRow(page, 'default')).toBeVisible();
}

/** `l` lies whole inside the window. */
async function expectOnScreen(page: Page, l: Locator): Promise<void> {
  await expect(l).toBeVisible();
  const b = (await l.boundingBox())!;
  const v = page.viewportSize()!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(v.width + 0.5);
  expect(b.y + b.height).toBeLessThanOrEqual(v.height + 0.5);
}

/** The dialog's finished look (its small rise is over). */
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const MANY = ['aragorn', 'boromir', 'celeborn', 'denethor', 'elrond', 'faramir', 'gimli', 'haldir', 'imrahil', 'legolas', 'meriadoc', 'peregrin', 'radagast', 'theoden'];

test('New by keys: the name is validated, Esc goes one step back, B makes a blank profile', async ({ page }) => {
  const errors = watchErrors(page);
  await openProfiles(page);
  await page.keyboard.press('n');
  const name = dialog(page, 'new');
  await expect(name.locator('.wc-lk-hood-t')).toHaveText('New Profile');
  // The list stays drawn under the dialog; the field has the focus.
  await expect(plRow(page, 'default')).toBeVisible();
  const field = name.locator('input');
  await expect(field).toBeFocused();
  await expect(name.locator('.wc-lk-fhint')).toHaveText('letters, digits and _ · must start with a letter · max 32');
  // Letters are text here, not the list's shortcuts.
  await page.keyboard.type('nird');
  await expect(field).toHaveValue('nird');
  await expect(anyDialog(page)).toHaveCount(1);

  // Validation: each message, and it goes when the name changes.
  const bad: [string, string][] = [
    ['', 'Enter a name.'],
    ['9lives', 'The name must start with a letter.'],
    ['my name', 'Only letters, digits and _ are allowed.'],
    ['x'.repeat(33), 'At most 32 characters.'],
    ['default', '"default" already exists.'],
  ];
  for (const [value, message] of bad) {
    await field.fill(value);
    await expect(alert(name)).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(alert(name)).toHaveText(message);
    await expect(name).toBeVisible();
  }
  expect(await names(page)).toEqual(['default', 'khazdul']);

  // A good name: one step on. ↑ ↓ move (and wrap), nothing is created yet.
  await field.fill('ranger');
  await page.keyboard.press('Enter');
  const how = dialog(page, 'new-how');
  await expect(how).toContainText('How should ranger start?');
  await expect(name).toHaveCount(0);
  const opt = (k: string) => how.locator(`.wc-lk-row[data-k="${k}"]`);
  await expect(opt('blank')).toHaveClass(/is-on/);
  await page.keyboard.press('ArrowDown');
  await expect(opt('copy')).toHaveClass(/is-on/);
  await page.keyboard.press('ArrowDown');
  await expect(opt('blank')).toHaveClass(/is-on/);
  await page.keyboard.press('ArrowUp');
  await expect(opt('copy')).toHaveClass(/is-on/);
  expect(await names(page)).toEqual(['default', 'khazdul']);

  // Esc: back to the name, kept and selected (typing replaces it); Esc again: the list.
  await page.keyboard.press('Escape');
  await expect(field).toHaveValue('ranger');
  await expect(field).toBeFocused();
  await page.keyboard.type('scout');
  await expect(field).toHaveValue('scout');
  await page.keyboard.press('Enter');
  await expect(how).toContainText('How should scout start?');
  await page.keyboard.press('Escape');
  await expect(field).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(anyDialog(page)).toHaveCount(0);
  expect(await names(page)).toEqual(['default', 'khazdul']);
  // The list has the keys again: N opens a fresh, empty prompt.
  await page.keyboard.press('n');
  await expect(field).toHaveValue('');
  await page.keyboard.type('scout');
  await page.keyboard.press('Enter');
  // Enter on the cursor's row (Copy from existing), Esc back, then B.
  await expect(how).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog(page, 'new-copy')).toContainText('Copy scout from:');
  await page.keyboard.press('Escape');
  await expect(how).toBeVisible();
  await page.keyboard.press('b');
  await expect(anyDialog(page)).toHaveCount(0);
  await expect(plFlash(page)).toHaveText('Created "scout".');
  await expect.poll(() => selectedProfile(page)).toBe('scout');
  await expect(plCursor(page)).toHaveAttribute('data-name', 'scout');
  expect(await textOf(page, 'scout')).toBe(await textOf(page, 'default'));
  // The keys are the list's again.
  await page.keyboard.press('ArrowUp');
  await expect(plCursor(page)).toHaveAttribute('data-name', 'khazdul');
  expect(errors).toEqual([]);
});

test('New, Copy from existing with many profiles: the list scrolls, the keys walk it, Enter copies', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openProfiles(page, MANY);
  await page.keyboard.press('n');
  await page.keyboard.type('copycat');
  await page.keyboard.press('Enter');
  await expect(dialog(page, 'new-how')).toBeVisible();
  await page.keyboard.press('c');
  const copy = dialog(page, 'new-copy');
  const rows = copy.locator('.wc-lk-row');
  await expect(rows).toHaveCount(MANY.length + 2);
  const on = copy.locator('.wc-lk-row.is-on');
  await expect(on).toHaveAttribute('data-name', 'aragorn');
  // The selected profile is marked.
  await expect(copy.locator('.wc-lk-row[data-name="default"]')).toContainText('selected');
  // It scrolls inside the dialog; the dialog and its Back button stay on screen.
  const list = copy.locator('.wc-pd-copy');
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight + 40)).toBe(true);
  await expectOnScreen(page, copy);
  await expectOnScreen(page, copy.locator('[data-btn="BACK"]'));
  await shot(page, '53-p-copy-desktop');

  const inView = async (): Promise<boolean> => {
    const l = (await list.boundingBox())!;
    const r = (await on.boundingBox())!;
    return r.y >= l.y - 0.5 && r.y + r.height <= l.y + l.height + 0.5;
  };
  await page.keyboard.press('End');
  await expect(on).toHaveAttribute('data-name', 'theoden');
  await expect.poll(inView).toBe(true);
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // ↓ at the end wraps to the top; ↑ back to the end; PgUp ten up; Home.
  await page.keyboard.press('ArrowDown');
  await expect(on).toHaveAttribute('data-name', 'aragorn');
  await expect.poll(inView).toBe(true);
  await page.keyboard.press('ArrowUp');
  await expect(on).toHaveAttribute('data-name', 'theoden');
  await page.keyboard.press('PageUp');
  await expect(on).toHaveAttribute('data-name', 'elrond');
  await expect.poll(inView).toBe(true);
  await page.keyboard.press('PageDown');
  await expect(on).toHaveAttribute('data-name', 'theoden');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(on).toHaveAttribute('data-name', 'celeborn');
  expect(await names(page)).not.toContain('copycat');
  await page.keyboard.press('Enter');
  await expect(anyDialog(page)).toHaveCount(0);
  await expect(plFlash(page)).toHaveText('Created "copycat".');
  expect(await textOf(page, 'copycat')).toBe('#nop the text of celeborn\n');
  await expect.poll(() => selectedProfile(page)).toBe('copycat');
  await expect(plCursor(page)).toHaveAttribute('data-name', 'copycat');
  expect(errors).toEqual([]);
});

test('New by pointer: the buttons and the rows; hover moves the copy list\'s cursor', async ({ page }) => {
  const errors = watchErrors(page);
  await openProfiles(page, ['gimli', 'legolas']);
  const newBtn = plist(page).locator('[data-btn="NEW"]');
  await newBtn.click();
  const name = dialog(page, 'new');
  await shot(page, '53-p-new-desktop');
  await name.locator('[data-btn="CANCEL"]').click();
  await expect(anyDialog(page)).toHaveCount(0);
  await newBtn.click();
  // Next on an empty name: the message; the dialog stays.
  await name.locator('[data-btn="OK"]').click();
  await expect(alert(name)).toHaveText('Enter a name.');
  await shot(page, '53-p-new-error-desktop');
  await name.locator('input').fill('dwarf');
  await name.locator('[data-btn="OK"]').click();
  const how = dialog(page, 'new-how');
  await expect(how).toBeVisible();
  await shot(page, '53-p-how-desktop');
  await how.locator('[data-btn="BACK"]').click();
  await expect(name.locator('input')).toHaveValue('dwarf');
  await name.locator('[data-btn="OK"]').click();
  await how.locator('.wc-lk-row[data-k="copy"]').click();
  const copy = dialog(page, 'new-copy');
  await expect(copy.locator('.wc-lk-row')).toHaveCount(4);
  await copy.locator('[data-btn="BACK"]').click();
  await expect(how).toBeVisible();
  await how.locator('.wc-lk-row[data-k="copy"]').click();
  await copy.locator('.wc-lk-row[data-name="legolas"]').hover();
  await expect(copy.locator('.wc-lk-row.is-on')).toHaveAttribute('data-name', 'legolas');
  expect(await names(page)).not.toContain('dwarf');
  await copy.locator('.wc-lk-row[data-name="gimli"]').click();
  await expect(anyDialog(page)).toHaveCount(0);
  await expect(plFlash(page)).toHaveText('Created "dwarf".');
  expect(await textOf(page, 'dwarf')).toBe('#nop the text of gimli\n');
  await expect(plCursor(page)).toHaveAttribute('data-name', 'dwarf');
  // Blank by a click.
  await newBtn.click();
  await name.locator('input').fill('elf');
  await page.keyboard.press('Enter');
  await how.locator('.wc-lk-row[data-k="blank"]').click();
  await expect(plFlash(page)).toHaveText('Created "elf".');
  expect(await textOf(page, 'elf')).toBe(await textOf(page, 'default'));
  expect(errors).toEqual([]);
});

test('Rename: the old name selected, validation, the same name closes quietly, Esc cancels', async ({ page }) => {
  const errors = watchErrors(page);
  await openProfiles(page, ['gimli', 'legolas']);
  await page.keyboard.press('ArrowDown');
  await expect(plCursor(page)).toHaveAttribute('data-name', 'gimli');
  await page.keyboard.press('r');
  const dlg = dialog(page, 'rename');
  await expect(dlg.locator('.wc-lk-hood-t')).toHaveText('Rename Profile');
  await expect(dlg).toContainText('Rename “gimli” to:');
  const field = dlg.locator('input');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('gimli');
  await shot(page, '53-p-rename-desktop');
  // Esc cancels; the same name closes with nothing said.
  await page.keyboard.press('Escape');
  await expect(anyDialog(page)).toHaveCount(0);
  await page.keyboard.press('r');
  await page.keyboard.press('Enter');
  await expect(anyDialog(page)).toHaveCount(0);
  await expect(plFlash(page)).toHaveText('');
  expect(await names(page)).toContain('gimli');
  // The name is selected: typing replaces it. A taken name is refused.
  await page.keyboard.press('r');
  await page.keyboard.type('legolas');
  await expect(field).toHaveValue('legolas');
  await page.keyboard.press('Enter');
  await expect(alert(dlg)).toHaveText('"legolas" already exists.');
  await field.fill('gloin');
  await expect(alert(dlg)).toHaveCount(0);
  // By its button.
  await dlg.locator('[data-btn="OK"]').click();
  await expect(anyDialog(page)).toHaveCount(0);
  await expect(plFlash(page)).toHaveText('Renamed to "gloin".');
  await expect(plCursor(page)).toHaveAttribute('data-name', 'gloin');
  expect(await names(page)).toEqual(['default', 'gloin', 'khazdul', 'legolas']);
  // The selected profile follows its new name.
  await page.keyboard.press('s');
  await expect.poll(() => selectedProfile(page)).toBe('gloin');
  await page.keyboard.press('r');
  await page.keyboard.type('gloin2');
  await page.keyboard.press('Enter');
  await expect(plFlash(page)).toHaveText('Renamed to "gloin2".');
  await expect.poll(() => selectedProfile(page)).toBe('gloin2');
  // `default` has no Rename: R does nothing there.
  await page.keyboard.press('Home');
  await page.keyboard.press('r');
  await expect(anyDialog(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Delete: y deletes, every other key and the veil cancel; the buttons by click', async ({ page }) => {
  const errors = watchErrors(page);
  await openProfiles(page, ['gimli', 'legolas', 'pippin']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('d');
  const dlg = dialog(page, 'delete');
  await expect(dlg.locator('.wc-lk-hood-t')).toHaveText('Delete Profile');
  await expect(dlg).toContainText('Delete profile gimli?');
  await shot(page, '53-p-delete-desktop');
  // N, Enter (Cancel is the primary), Esc, any other key, a click on the veil, Cancel: all cancel.
  for (const k of ['n', 'Enter', 'Escape', 'x', ' ']) {
    await expect(dlg).toBeVisible();
    await page.keyboard.press(k);
    await expect(anyDialog(page)).toHaveCount(0);
    await page.keyboard.press('d');
  }
  await page.locator('.wc-lk-veil').click({ position: { x: 5, y: 5 } });
  await expect(anyDialog(page)).toHaveCount(0);
  await page.keyboard.press('d');
  await dlg.locator('[data-btn="CANCEL"]').click();
  await expect(anyDialog(page)).toHaveCount(0);
  expect(await names(page)).toEqual(['default', 'gimli', 'khazdul', 'legolas', 'pippin']);
  await expect(plCursor(page)).toHaveAttribute('data-name', 'gimli');
  // Y deletes; the highlight goes to the row below, and the keys are the list's.
  await page.keyboard.press('d');
  await page.keyboard.press('y');
  await expect(anyDialog(page)).toHaveCount(0);
  await expect(plFlash(page)).toHaveText('Deleted "gimli".');
  await expect(plCursor(page)).toHaveAttribute('data-name', 'khazdul');
  expect(await names(page)).toEqual(['default', 'khazdul', 'legolas', 'pippin']);
  await page.keyboard.press('End');
  await expect(plCursor(page)).toHaveAttribute('data-name', 'pippin');
  // The selected profile deleted by the button: `default` is selected again; at the end the highlight goes up.
  await page.keyboard.press('s');
  await expect.poll(() => selectedProfile(page)).toBe('pippin');
  await plCursor(page).locator('[data-btn="DELETE"]').click();
  await dlg.locator('[data-btn="YES"]').click();
  await expect(plFlash(page)).toHaveText('Deleted "pippin".');
  await expect.poll(() => selectedProfile(page)).toBe('default');
  await expect(plCursor(page)).toHaveAttribute('data-name', 'legolas');
  // `default` has no Delete: D does nothing there.
  await page.keyboard.press('Home');
  await page.keyboard.press('d');
  await expect(anyDialog(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1024, height: 600 },
  { width: 820, height: 1180 },
]) {
  test(`the dialogs fit a ${size.width} × ${size.height} window, centred over the list's box`, async ({ page }) => {
    await page.setViewportSize(size);
    await openProfiles(page, MANY);
    const box = (await startTop(page).locator('.wc-lk-box').first().boundingBox())!;
    const centred = async (d: Locator): Promise<void> => {
      await expectOnScreen(page, d);
      const b = (await d.boundingBox())!;
      expect(Math.abs(b.x + b.width / 2 - (box.x + box.width / 2))).toBeLessThan(2);
    };
    await page.keyboard.press('n');
    await centred(dialog(page, 'new'));
    await page.keyboard.type('fits');
    await page.keyboard.press('Enter');
    await centred(dialog(page, 'new-how'));
    await page.keyboard.press('c');
    await centred(dialog(page, 'new-copy'));
    await expectOnScreen(page, dialog(page, 'new-copy').locator('[data-btn="BACK"]'));
    await page.keyboard.press('End');
    await expectOnScreen(page, dialog(page, 'new-copy').locator('.wc-lk-row.is-on'));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('d');
    await centred(dialog(page, 'delete'));
    await page.keyboard.press('n');
    await page.keyboard.press('r');
    await centred(dialog(page, 'rename'));
  });
}
