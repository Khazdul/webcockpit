// Stage 44c on a phone: the script manual from the Scripts page's Manual
// (a tap), as a large box over the start page: the text alone, the
// contents behind Contents with 40 px targets, the find on a row of its
// own inside the box, and no on-screen keyboard from a tap on the text.
import { type Page, expect, test } from '@playwright/test';

const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const manual = (page: Page) => page.locator('.wc-frame:not([hidden]) .wc-sman');

test('the manual on a phone: Contents, a tap on a section, the find inside the box, Back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(() => window.__wc!.shell.scripts!.init());
  await startFrame(page).locator('.wc-sm-item[data-key="scripts"]').tap();
  await startFrame(page).locator('[data-btn="MANUAL"]').tap();
  const m = manual(page);
  await expect(m).toBeVisible();
  await expect(m.locator(':scope > .wc-lk-hood')).toContainText('Script Manual');

  // The head: Contents, then the find under it; everything inside the box.
  const w = page.viewportSize()!.width;
  const contents = m.locator('[data-btn="contents"]');
  const field = m.locator('.wc-lk-mfind input');
  await expect(contents).toBeVisible();
  await expect(field).toBeVisible();
  for (const el of [contents, field, m.locator('.wc-lk-mfind [data-btn="next"]')]) {
    const b = (await el.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
    expect(b.height).toBeGreaterThanOrEqual(32);
  }

  // A tap on the text never focuses a field (no on-screen keyboard).
  await m.locator('.wc-lk-mtext section[aria-label="Getting started"] p').first().tap();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');

  // Contents: the list over the text, 40 px rows; a tap goes there and closes it.
  await contents.tap();
  const toc = m.locator('.wc-lk-mtoc');
  await expect(toc).toBeVisible();
  const row = toc.locator('li', { hasText: /^Timers$/ });
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await row.tap();
  await expect(toc).toBeHidden();
  await expect(m.locator('.wc-lk-mtext h3', { hasText: /^Timers$/ })).toBeInViewport();

  // Back at the top left: the Scripts page.
  await m.locator(':scope > .wc-lk-back').tap();
  await expect(manual(page)).toHaveCount(0);
  await expect(startFrame(page).locator('[data-btn="MANUAL"]')).toBeVisible();
  expect(errors).toEqual([]);
});
