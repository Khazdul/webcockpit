// Stage 17 C1: foreign profile import (ADR 0073). Profile → IMPORT with a
// JMC file, the import report, then EDIT opens the new profile.
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const SAMPLE = fileURLToPath(new URL('../fixtures/import/e2e-sample.set', import.meta.url));

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const startTitle = (page: Page) => frame(page).locator('.wc-title-row .wc-c-section');
const ped = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-ped');

test('IMPORT a JMC file: report with format and counts, EDIT opens the profile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(startTitle(page)).toHaveText('─── Profile ───');

  const chooser = page.waitForEvent('filechooser');
  await page.locator('.wc-start [data-btn="IMPORT"]').click();
  await (await chooser).setFiles(SAMPLE);

  await expect(startTitle(page)).toHaveText('─── IMPORT REPORT ───');
  const head = frame(page).locator('.wc-import-head');
  await expect(head).toContainText('Profile  e2e_sample');
  await expect(head).toContainText('Format   JMC');
  const counts = (await head.textContent()) ?? '';
  const m = /Translated (\d+) · Kept (\d+) · Skipped (\d+) · Warnings (\d+)/.exec(counts);
  expect(m).not.toBeNull();
  expect(Number(m![1])).toBeGreaterThan(0);
  expect(Number(m![2]) + Number(m![3])).toBeGreaterThan(0);
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
