// The Profile list's dialogs on a phone (ADR 0128 addendum 2026-11-12;
// src/chrome/frames/profile-dialogs.tsx): New (the name, Blank or Copy, the
// profile to copy), Rename and Delete by tap at 360 × 800, 320 × 568 and
// 800 × 360. Each dialog lies inside the screen; its rows and buttons are
// big enough to tap; the name's field brings our own keyboard (stage 53,
// ADR 0139) and the dialog stands above it; the list steps need none; the
// copy list scrolls inside the dialog with many profiles.
//
// `phone` project. WC_SHOTS=<dir> saves screenshots
// (docs/stages/img/53-p-*.png). The keyboard's own behaviour in these
// fields is in phone-own-keyboard-pages.spec.ts.
import { type Locator, type Page, expect, test } from '@playwright/test';

const SHOTS = process.env.WC_SHOTS ?? '';

const SIZES = [
  { name: 'portrait', width: 360, height: 800 },
  { name: 'small', width: 320, height: 568 },
  { name: 'land', width: 800, height: 360 },
] as const;

const MANY = ['aragorn', 'boromir', 'celeborn', 'denethor', 'elrond', 'faramir', 'gimli', 'haldir', 'imrahil', 'legolas', 'meriadoc', 'peregrin', 'radagast', 'theoden'];

const html = (page: Page) => page.locator('html');
const okbHost = (page: Page) => page.locator('.wc-okb-page');
const okbKey = (page: Page, k: string) =>
  okbHost(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const dialog = (page: Page, dlg: string) => page.locator(`.wc-lk-dialog[data-dlg="${dlg}"]`);
const anyDialog = (page: Page) => page.locator('.wc-lk-dialog');
const plist = (page: Page) => page.locator('.wc-start .wc-frame .wc-pl');
const plRow = (page: Page, name: string) => plist(page).locator(`.wc-pl-row[data-name="${name}"]`);
const plFlash = (page: Page) => plist(page).locator('.wc-lk-flash');

const names = (page: Page) => page.evaluate(async () => (await window.__wc!.shell.profiles.list()).map((r) => r.name));
const textOf = (page: Page, name: string) => page.evaluate(async (n) => (await window.__wc!.shell.profiles.get(n))?.text, name);
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function type(page: Page, ...keys: string[]): Promise<void> {
  for (const k of keys) await okbKey(page, k).tap();
}

/** The Profile list on a phone, with `extra` profiles besides the stock ones. */
async function openProfiles(page: Page, extra: string[] = []): Promise<void> {
  await page.goto('/?phone=1&kbd=en');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (list) => {
    const p = window.__wc!.shell.profiles;
    await p.init();
    for (const n of list) await p.create(n, `#nop the text of ${n}\n`);
  }, extra);
  await page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm-item[data-key="profile"]').tap();
  await expect(plRow(page, 'default')).toBeVisible();
}

/** The bottom of the room: the keyboard's top edge when it is up, else the screen's. */
async function floor(page: Page): Promise<number> {
  const up = await okbHost(page).isVisible();
  return up ? (await okbHost(page).boundingBox())!.y : page.viewportSize()!.height;
}

/** `l` lies whole inside the screen, above the keyboard when it is up, and is at least `minH` high. */
async function expectInRoom(page: Page, l: Locator, minH = 0): Promise<void> {
  await expect(l).toBeVisible();
  const v = page.viewportSize()!;
  await expect
    .poll(async () => {
      const b = (await l.boundingBox())!;
      const bottom = await floor(page);
      return b.x >= 0 && b.y >= 0 && b.x + b.width <= v.width + 0.5 && b.y + b.height <= bottom + 0.5 && b.height >= minH;
    })
    .toBe(true);
}

async function expectKeyboard(page: Page, up: boolean): Promise<void> {
  if (up) {
    await expect(okbHost(page)).toBeVisible();
    await expect(html(page)).toHaveClass(/\bwc-okb-pg\b/);
  } else {
    await expect(okbHost(page)).toBeHidden();
    await expect(html(page)).not.toHaveClass(/\bwc-okb-pg\b/);
  }
  await frames(page);
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

for (const size of SIZES) {
  test.describe(`${size.width} × ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    const tag = size.name === 'portrait' ? 'phone' : `phone-${size.name}`;

    test('New by tap: the name on our keyboard, a bad name, Back keeps it, Blank creates', async ({ page }) => {
      const errors = watchErrors(page);
      await openProfiles(page);
      await plist(page).locator('[data-btn="NEW"]').tap();
      const name = dialog(page, 'new');
      const field = name.locator('input');
      // The tap that opened the dialog focused its field: our keyboard, not the device's.
      await expect(field).toBeFocused();
      await expect(field).toHaveAttribute('inputmode', 'none');
      await expectKeyboard(page, true);
      await expectInRoom(page, name);
      await expectInRoom(page, field);
      for (const b of ['CANCEL', 'OK']) await expectInRoom(page, name.locator(`[data-btn="${b}"]`), 32);
      await shot(page, `53-p-new-keyboard-${tag}`);
      // Next on an empty name, then a taken one: the message, the keyboard stays, the buttons stay reachable.
      await name.locator('[data-btn="OK"]').tap();
      await expect(name.locator('[role="alert"]')).toHaveText('Enter a name.');
      await type(page, 'd', 'e', 'f', 'a', 'u', 'l', 't');
      await expect(name.locator('[role="alert"]')).toHaveCount(0);
      await okbKey(page, 'enter').tap();
      await expect(name.locator('[role="alert"]')).toHaveText('"default" already exists.');
      await expectKeyboard(page, true);
      await expectInRoom(page, name);
      for (const b of ['CANCEL', 'OK']) await expectInRoom(page, name.locator(`[data-btn="${b}"]`), 32);
      await shot(page, `53-p-new-error-keyboard-${tag}`);
      for (let i = 0; i < 7; i++) await okbKey(page, 'back').tap();
      await type(page, 'o', 'r', 'c');
      await okbKey(page, 'enter').tap();

      // Blank or Copy: no field, so no keyboard; the rows are big enough to tap.
      const how = dialog(page, 'new-how');
      await expect(how).toContainText('How should orc start?');
      await expectKeyboard(page, false);
      await expectInRoom(page, how);
      for (const k of ['blank', 'copy']) await expectInRoom(page, how.locator(`.wc-lk-row[data-k="${k}"]`), 40);
      await expectInRoom(page, how.locator('[data-btn="BACK"]'), 32);
      await shot(page, `53-p-how-${tag}`);
      expect(await names(page)).not.toContain('orc');
      // Back: the name is kept, and the keyboard is up for it again.
      await how.locator('[data-btn="BACK"]').tap();
      await expect(field).toHaveValue('orc');
      await expectKeyboard(page, true);
      await name.locator('[data-btn="OK"]').tap();
      await how.locator('.wc-lk-row[data-k="blank"]').tap();
      await expect(anyDialog(page)).toHaveCount(0);
      await expect(plFlash(page)).toHaveText('Created "orc".');
      await expect(plRow(page, 'orc')).toHaveClass(/is-on/);
      await expectKeyboard(page, false);
      expect(errors).toEqual([]);
    });

    test('Copy from existing with many profiles: the list scrolls under the finger, a tap copies', async ({ page }) => {
      const errors = watchErrors(page);
      await openProfiles(page, MANY);
      await plist(page).locator('[data-btn="NEW"]').tap();
      await expectKeyboard(page, true);
      await type(page, 'c', 'o', 'p', 'y');
      await okbKey(page, 'enter').tap();
      await dialog(page, 'new-how').locator('.wc-lk-row[data-k="copy"]').tap();
      const copy = dialog(page, 'new-copy');
      const rows = copy.locator('.wc-lk-row');
      await expect(rows).toHaveCount(MANY.length + 2);
      await expectKeyboard(page, false);
      await expectInRoom(page, copy);
      await expectInRoom(page, copy.locator('[data-btn="BACK"]'), 32);
      await expectInRoom(page, rows.first(), 40);
      // More rows than fit: the list scrolls inside the dialog (the dialog itself does not).
      const list = copy.locator('.wc-pd-copy');
      expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight + 40)).toBe(true);
      expect(await copy.locator('.wc-lk-dwin').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      await shot(page, `53-p-copy-${tag}`);
      const last = copy.locator('.wc-lk-row[data-name="theoden"]');
      await last.scrollIntoViewIfNeeded();
      await expectInRoom(page, last, 40);
      await expectInRoom(page, copy.locator('[data-btn="BACK"]'), 32);
      // Back, and in again: nothing was made. Then a tap on a row copies it.
      await copy.locator('[data-btn="BACK"]').tap();
      await expect(dialog(page, 'new-how')).toBeVisible();
      expect(await names(page)).not.toContain('copy');
      await dialog(page, 'new-how').locator('.wc-lk-row[data-k="copy"]').tap();
      await last.scrollIntoViewIfNeeded();
      await last.tap();
      await expect(anyDialog(page)).toHaveCount(0);
      await expect(plFlash(page)).toHaveText('Created "copy".');
      expect(await textOf(page, 'copy')).toBe('#nop the text of theoden\n');
      expect(errors).toEqual([]);
    });

    test('Rename and Delete by tap: inside the screen, the buttons big enough', async ({ page }) => {
      const errors = watchErrors(page);
      await openProfiles(page, ['gimli']);
      const row = plRow(page, 'gimli');
      await row.tap();
      await row.locator('[data-btn="RENAME"]').tap();
      const ren = dialog(page, 'rename');
      const field = ren.locator('input');
      await expect(field).toBeFocused();
      await expect(field).toHaveValue('gimli');
      await expectKeyboard(page, true);
      await expectInRoom(page, ren);
      await expectInRoom(page, field);
      for (const b of ['CANCEL', 'OK']) await expectInRoom(page, ren.locator(`[data-btn="${b}"]`), 32);
      await shot(page, `53-p-rename-keyboard-${tag}`);
      // Cancel closes it and the keyboard; the row is still the highlighted one.
      await ren.locator('[data-btn="CANCEL"]').tap();
      await expect(anyDialog(page)).toHaveCount(0);
      await expectKeyboard(page, false);
      await expect(row).toHaveClass(/is-on/);
      // The name is selected: the first key replaces it.
      await row.locator('[data-btn="RENAME"]').tap();
      await type(page, 'g', 'l', 'o', 'i', 'n');
      await expect(field).toHaveValue('gloin');
      await ren.locator('[data-btn="OK"]').tap();
      await expect(anyDialog(page)).toHaveCount(0);
      await expect(plFlash(page)).toHaveText('Renamed to "gloin".');
      await expectKeyboard(page, false);

      // Delete: Cancel, a tap on the veil, then Yes.
      const row2 = plRow(page, 'gloin');
      await expect(row2).toHaveClass(/is-on/);
      await row2.locator('[data-btn="DELETE"]').tap();
      const del = dialog(page, 'delete');
      await expect(del).toContainText('Delete profile gloin?');
      await expectKeyboard(page, false);
      await expectInRoom(page, del);
      for (const b of ['CANCEL', 'YES']) await expectInRoom(page, del.locator(`[data-btn="${b}"]`), 32);
      await shot(page, `53-p-delete-${tag}`);
      await del.locator('[data-btn="CANCEL"]').tap();
      await expect(anyDialog(page)).toHaveCount(0);
      await row2.locator('[data-btn="DELETE"]').tap();
      await page.locator('.wc-lk-veil').tap({ position: { x: 4, y: 4 } });
      await expect(anyDialog(page)).toHaveCount(0);
      expect(await names(page)).toContain('gloin');
      await row2.locator('[data-btn="DELETE"]').tap();
      await del.locator('[data-btn="YES"]').tap();
      await expect(anyDialog(page)).toHaveCount(0);
      await expect(plFlash(page)).toHaveText('Deleted "gloin".');
      expect(await names(page)).not.toContain('gloin');
      expect(errors).toEqual([]);
    });
  });
}
