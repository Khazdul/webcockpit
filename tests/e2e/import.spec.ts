// Stage 17 C1: foreign profile import (ADR 0073). Stage 20 C1: Mudlet
// (ADR 0076), a profile save (.xml) and an exported package archive
// (.mpackage, unpacked in the import UI). Stage 43c (ADR 0128, ADR 0073
// addendum): Import opens its own page (a drop zone, Choose files…, the
// formats); the receipt follows in the same box with OK only, and OK goes
// back to the list with the new profile highlighted.
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const SAMPLE = fileURLToPath(new URL('../fixtures/import/e2e-sample.set', import.meta.url));
const MUDLET_XML = fileURLToPath(new URL('../fixtures/import/mudlet/profile.xml', import.meta.url));
const MUDLET_PKG = fileURLToPath(new URL('../fixtures/import/mudlet/MyHighlights.mpackage', import.meta.url));

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const hood = (page: Page) => frame(page).locator('.wc-lk-hood-t:not(.is-out)');
const receipt = (page: Page) => frame(page).locator('.wc-imp-rc');

/** Opens Profile from the start menu with a fake MUME behind it. */
async function openProfileList(page: Page): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(hood(page)).toHaveText('Profiles');
}

/** Import → the import page → Choose files… with `file`; waits for the receipt and returns its counts. */
async function importFile(page: Page, file: string): Promise<{ translated: number; kept: number; skipped: number }> {
  // (The listener first: Chromium's chooser interception is set up asynchronously.)
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.wc-start [data-btn="IMPORT"]').click();
  await expect(hood(page)).toHaveText('Import');
  await frame(page).locator('[data-btn="CHOOSE"]').click();
  await (await chooser).setFiles(file);
  await expect(receipt(page)).toBeVisible();
  const sum = frame(page).locator('.wc-imp-sum');
  const n = async (k: string): Promise<number> => Number(await sum.getAttribute(`data-${k}`));
  return { translated: await n('translated'), kept: await n('kept'), skipped: await n('skipped') };
}

/** OK on the receipt: the list, the flash, the new profile highlighted and selected. */
async function okToList(page: Page, name: string, entry: string): Promise<void> {
  await expect(frame(page).locator('[data-btn="EDIT"]')).toHaveCount(0);
  await frame(page).locator('[data-btn="OK"]').click();
  await expect(hood(page)).toHaveText('Profiles');
  await expect(frame(page).locator('.wc-lk-flash')).toHaveText(`Imported "${name}" from ${entry}.`);
  await expect(frame(page).locator('.wc-pl-row.is-on')).toHaveAttribute('data-name', name);
  await expect.poll(() => page.evaluate(() => window.__wc!.settings.get().profile)).toBe(name);
}

const profileText = (page: Page, name: string) =>
  page.evaluate((n) => window.__wc!.shell.profiles.get(n).then((r) => r?.text ?? ''), name);

test('IMPORT a JMC file: the import page, the receipt with format and counts, OK back to the list', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openProfileList(page);
  // The page before the picker: the lead, the drop zone, the formats.
  await page.locator('.wc-start [data-btn="IMPORT"]').click();
  await expect(hood(page)).toHaveText('Import');
  await expect(frame(page).locator('.wc-imp-drop')).toContainText('Drop the files here');
  await expect(frame(page).locator('.wc-imp-fmts > li')).toHaveCount(4);
  // Esc goes back to the list.
  await page.keyboard.press('Escape');
  await expect(hood(page)).toHaveText('Profiles');

  const c = await importFile(page, SAMPLE);
  await expect(frame(page).locator('.wc-imp-name')).toHaveText('e2e_sample');
  await expect(frame(page).locator('.wc-imp-from')).toHaveText('a new profile from e2e-sample.set');
  await expect(frame(page).locator('.wc-imp-f')).toHaveText('JMC');
  expect(c.translated).toBeGreaterThan(0);
  expect(c.kept + c.skipped).toBeGreaterThan(0);
  await expect(frame(page).locator('.wc-imp-sum')).toContainText(`${c.translated} settings were translated`);
  // The first group is open, with `file:line` items.
  await expect(frame(page).locator('.wc-imp-grp').first().locator('.wc-imp-grp-h')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(frame(page).locator('.wc-imp-acc')).toContainText('e2e-sample.set:');

  await okToList(page, 'e2e_sample', 'e2e-sample.set');
  const text = await profileText(page, 'e2e_sample');
  expect(text).toContain('Imported from');
  expect(text).toContain('#alias');
  expect(errors).toEqual([]);
});

test('IMPORT a Mudlet profile save: receipt with format, packages and kept items', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openProfileList(page);
  const c = await importFile(page, MUDLET_XML);
  await expect(frame(page).locator('.wc-imp-name')).toHaveText('profile');
  await expect(frame(page).locator('.wc-imp-f')).toHaveText('Mudlet');
  expect(c.translated).toBeGreaterThan(0);
  expect(c.kept).toBeGreaterThan(0);
  expect(c.skipped).toBeGreaterThan(0);
  // Open every group (Tab walks the headers, Space folds), then read them.
  const acc = frame(page).locator('.wc-imp-acc');
  const heads = acc.locator('.wc-imp-grp-h');
  const count = await heads.count();
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    await expect(acc.locator('.wc-imp-grp').nth(i)).toHaveClass(/is-sel/);
    if ((await heads.nth(i).getAttribute('aria-expanded')) === 'false') await page.keyboard.press('Space');
    await expect(heads.nth(i)).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(acc).toContainText('Multiline (AND) trigger');
  await expect(acc).toContainText('WebCockpit has a built-in Key manager');
  await expect(acc).toContainText('Package Port Key Library');
  // Tab on to OK; Enter is OK.
  await page.keyboard.press('Tab');
  await expect(frame(page).locator('[data-btn="OK"]')).toHaveClass(/is-sel/);
  await page.keyboard.press('Enter');
  await expect(hood(page)).toHaveText('Profiles');
  await expect(frame(page).locator('.wc-pl-row.is-on')).toHaveAttribute('data-name', 'profile');
  const text = await profileText(page, 'profile');
  expect(text).toContain('Imported from Mudlet file profile.xml');
  expect(text).toContain('#alias {^qd$} {get draught pack;quaff draught}');
  expect(errors).toEqual([]);
});

test('IMPORT a Mudlet .mpackage: unpacked, named after the archive', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openProfileList(page);
  const c = await importFile(page, MUDLET_PKG);
  await expect(frame(page).locator('.wc-imp-name')).toHaveText('MyHighlights');
  await expect(frame(page).locator('.wc-imp-f')).toHaveText('Mudlet');
  expect(c.translated).toBeGreaterThan(0);
  // O is OK.
  await page.keyboard.press('o');
  await expect(hood(page)).toHaveText('Profiles');
  await expect.poll(() => page.evaluate(() => window.__wc!.settings.get().profile)).toBe('MyHighlights');
  expect(await profileText(page, 'MyHighlights')).toContain('#alias {^hl$}');
  expect(errors).toEqual([]);
});

test('IMPORT: files dropped on the box are imported; a broken archive fails on the page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openProfileList(page);
  await page.keyboard.press('i');
  await expect(hood(page)).toHaveText('Import');

  const drop = async (name: string, bytes: number[]): Promise<void> => {
    const dt = await page.evaluateHandle(
      ([n, b]) => {
        const d = new DataTransfer();
        d.items.add(new File([new Uint8Array(b)], n));
        return d;
      },
      [name, bytes] as const,
    );
    const zone = frame(page).locator('.wc-imp-drop');
    await zone.dispatchEvent('dragenter', { dataTransfer: dt });
    await expect(zone).toHaveClass(/is-over/);
    await zone.dispatchEvent('dragover', { dataTransfer: dt });
    await zone.dispatchEvent('drop', { dataTransfer: dt });
  };

  // A "zip" that cannot be read: the error stays on the page, with the file under it.
  await drop('rasta.mpackage', [0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
  const err = frame(page).locator('.wc-imp-err');
  await expect(err).toContainText('Import failed: rasta.mpackage could not be unpacked');
  await expect(frame(page).locator('.wc-imp-err-files')).toHaveText('rasta.mpackage');
  await expect(hood(page)).toHaveText('Import');
  await expect(frame(page).locator('[data-btn="CHOOSE"]')).toBeVisible();

  // A native profile dropped: the short receipt; Esc is OK.
  await drop('My Warrior.tin', [...Buffer.from('#alias {k} {kill %1}\n')]);
  await expect(frame(page).locator('.wc-imp-ok')).toContainText('TinTin++, 1 line, nothing changed.');
  await page.keyboard.press('Escape');
  await expect(hood(page)).toHaveText('Profiles');
  await expect(frame(page).locator('.wc-lk-flash')).toHaveText('Imported "My_Warrior" from My Warrior.tin.');
  await expect(frame(page).locator('.wc-pl-row.is-on')).toHaveAttribute('data-name', 'My_Warrior');
  expect(errors).toEqual([]);
});
