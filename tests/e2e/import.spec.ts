// Stage 17 C1: foreign profile import (ADR 0073). Profile → IMPORT with a
// JMC file, the import report, then EDIT opens the new profile.
// Stage 20 C1: Mudlet (ADR 0076), a profile save (.xml) and an exported
// package archive (.mpackage, unpacked in the import UI).
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const SAMPLE = fileURLToPath(new URL('../fixtures/import/e2e-sample.set', import.meta.url));
const MUDLET_XML = fileURLToPath(new URL('../fixtures/import/mudlet/profile.xml', import.meta.url));
const MUDLET_PKG = fileURLToPath(new URL('../fixtures/import/mudlet/MyHighlights.mpackage', import.meta.url));

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const startTitle = (page: Page) => frame(page).locator('.wc-title-row .wc-c-section');
const ped = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-ped');

/** Opens Profile from the start menu with a fake MUME behind it. */
async function openProfilePicker(page: Page): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(startTitle(page)).toHaveText('─── Profile ───');
}

/** IMPORT with `file`; waits for the report and returns its counts. */
async function importFile(page: Page, file: string): Promise<number[]> {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.wc-start [data-btn="IMPORT"]').click();
  await (await chooser).setFiles(file);
  await expect(startTitle(page)).toHaveText('─── IMPORT REPORT ───');
  const counts = (await frame(page).locator('.wc-import-head').textContent()) ?? '';
  const m = /Translated (\d+) · Kept (\d+) · Skipped (\d+) · Warnings (\d+)/.exec(counts);
  expect(m).not.toBeNull();
  return m!.slice(1).map(Number);
}

test('IMPORT a JMC file: report with format and counts, EDIT opens the profile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openProfilePicker(page);
  const [translated, kept, skipped] = await importFile(page, SAMPLE);
  const head = frame(page).locator('.wc-import-head');
  await expect(head).toContainText('Profile  e2e_sample');
  await expect(head).toContainText('Format   JMC');
  expect(translated).toBeGreaterThan(0);
  expect(kept! + skipped!).toBeGreaterThan(0);
  await expect(frame(page).locator('.wc-import-list')).toContainText('e2e-sample.set:');
  await expect.poll(() => page.evaluate(() => window.__wc!.settings.get().profile)).toBe('e2e_sample');

  // EDIT opens the profile editor on the new profile; its text is the import.
  await frame(page).locator('[data-btn="EDIT"]').click();
  await expect(ped(page).locator('.wc-ped-title .wc-c-section')).toHaveText('─── Profile Editor: e2e_sample ───');
  await ped(page).locator('[data-btn="EDITOR"]').click();
  await expect(ped(page)).toHaveAttribute('data-mode', 'editor');
  const content = ped(page).locator('.cm-content');
  await expect(content).toContainText('Imported from');
  await expect(content).toContainText('#alias');
  expect(errors).toEqual([]);
});

test('IMPORT a Mudlet profile save: report with format, packages and kept items, EDIT shows a translated alias', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openProfilePicker(page);
  const [translated, kept, skipped] = await importFile(page, MUDLET_XML);
  const head = frame(page).locator('.wc-import-head');
  await expect(head).toContainText('Profile  profile');
  await expect(head).toContainText('Format   Mudlet');
  expect(translated).toBeGreaterThan(0);
  expect(kept).toBeGreaterThan(0);
  expect(skipped).toBeGreaterThan(0);
  const list = frame(page).locator('.wc-import-list');
  await expect(list).toContainText('Multiline (AND) trigger');
  await expect(list).toContainText('WebCockpit has a built-in Key manager');
  await expect(list).toContainText('Package Port Key Library');

  await frame(page).locator('[data-btn="EDIT"]').click();
  await expect(ped(page).locator('.wc-ped-title .wc-c-section')).toHaveText('─── Profile Editor: profile ───');
  await ped(page).locator('[data-btn="EDITOR"]').click();
  await expect(ped(page)).toHaveAttribute('data-mode', 'editor');
  const content = ped(page).locator('.cm-content');
  await expect(content).toContainText('Imported from Mudlet file profile.xml');
  await expect(content).toContainText('#alias {^qd$} {get draught pack;quaff draught}');
  expect(errors).toEqual([]);
});

test('IMPORT a Mudlet .mpackage: unpacked, named after the archive', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openProfilePicker(page);
  const [translated] = await importFile(page, MUDLET_PKG);
  const head = frame(page).locator('.wc-import-head');
  await expect(head).toContainText('Profile  MyHighlights');
  await expect(head).toContainText('Format   Mudlet');
  expect(translated).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__wc!.settings.get().profile)).toBe('MyHighlights');

  await frame(page).locator('[data-btn="EDIT"]').click();
  await ped(page).locator('[data-btn="EDITOR"]').click();
  await expect(ped(page)).toHaveAttribute('data-mode', 'editor');
  await expect(ped(page).locator('.cm-content')).toContainText('#alias {^hl$}');
  expect(errors).toEqual([]);
});
