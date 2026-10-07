// Stage 25 (ADR 0085 and its addendum): Options → Mapper → Background
// colour / Background colour code, two check-box rows. A named colour or
// a typed code is drawn by the map worker at once, the pane's CSS
// background follows, and the setting survives a reload. Dark paper, the
// one light colour, gets dark connection lines.
import { expect, type Page, test } from '@playwright/test';

/** Pixels of the map canvas that are exactly (±8) `rgb`. */
async function countColour(page: Page, rgb: readonly [number, number, number]): Promise<number> {
  const shot = await page.locator('.wc-pane-map canvas').screenshot();
  return page.evaluate(
    async ([png, [r, g, b]]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      let n = 0;
      for (let o = 0; o < d.length; o += 4) {
        if (Math.abs(d[o]! - r) <= 8 && Math.abs(d[o + 1]! - g) <= 8 && Math.abs(d[o + 2]! - b) <= 8) n++;
      }
      return n;
    },
    [shot.toString('base64'), rgb] as const,
  );
}

async function closeMenus(page: Page): Promise<void> {
  for (let i = 0; i < 6 && (await page.locator('.wc-frame:not([hidden])').count()) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }
  await expect(page.locator('.wc-frame:not([hidden])')).toHaveCount(0);
}

const MAGENTA = [255, 0, 255] as const;
const SLATE = [0x2e, 0x34, 0x36] as const;

test('Options → Mapper → Background colour rows: a typed colour is drawn live and kept over a reload', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  const content = page.locator('.wc-app .wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d/, { timeout: 30_000 });
  await expect(content).toHaveAttribute('data-map-bg', '#2e3436');
  await expect.poll(() => countColour(page, SLATE), { timeout: 10_000 }).toBeGreaterThan(1000);
  expect(await countColour(page, MAGENTA)).toBe(0);

  // ESC → Options → Mapper: two check-box rows (ADR 0085 addendum).
  await page.locator('.wc-input-field').focus();
  await page.keyboard.press('Escape');
  const frame = page.locator('.wc-frame:not([hidden])');
  await frame.locator('.wc-mrow[data-key="options"] .wc-label').click();
  await frame.locator('.wc-mrow[data-key="mapper"] .wc-label').click();
  const row = frame.locator('.wc-mrow[data-key="background"] .wc-label');
  const codeRow = frame.locator('.wc-mrow[data-key="backgroundCode"] .wc-label');
  await expect(row).toHaveText('[X] Background colour: Default');
  await expect(codeRow).toHaveText('[ ] Background colour code: none');
  // ← → cycle the named list: Black, then back to Default.
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(row).toHaveText('[X] Background colour: Black');
  await expect(content).toHaveAttribute('data-map-bg', '#000000');
  await page.keyboard.press('ArrowLeft');
  await expect(row).toHaveText('[X] Background colour: Default');
  // A click on the code row opens the validated prompt.
  await codeRow.click();
  await expect(frame.locator('.wc-title-row')).toHaveText('─── Map background colour ───');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('#ff00f');
  await page.keyboard.press('Enter');
  await expect(frame.locator('.wc-c-danger')).toHaveText('Use #rrggbb, e.g. #1c1c1c.');
  await page.keyboard.type('f');
  await page.keyboard.press('Enter');
  await expect(frame.locator('.wc-title-row')).toHaveText('─── Mapper ───');
  await expect(frame.locator('.wc-flash')).toHaveText('Map background set to #ff00ff.');
  await expect(codeRow).toHaveText('[X] Background colour code: #ff00ff');
  await expect(row).toHaveText('[ ] Background colour: Default');
  // A click on the named row checks it; → on the code row checks the remembered code again.
  await row.click();
  await expect(row).toHaveText('[X] Background colour: Default');
  await expect(codeRow).toHaveText('[ ] Background colour code: #ff00ff');
  await expect(content).toHaveAttribute('data-map-bg', '#2e3436');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(codeRow).toHaveText('[X] Background colour code: #ff00ff');
  await closeMenus(page);

  // Drawn at once, and the pane's own background (before a frame) follows.
  await expect(content).toHaveAttribute('data-map-bg', '#ff00ff');
  await expect.poll(() => countColour(page, MAGENTA), { timeout: 10_000 }).toBeGreaterThan(1000);
  expect(await content.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 0, 255)');

  // Kept over a reload: the worker starts with it.
  await page.reload();
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await expect(content).toHaveAttribute('data-map-bg', '#ff00ff');
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d/, { timeout: 30_000 });
  await expect.poll(() => countColour(page, MAGENTA), { timeout: 10_000 }).toBeGreaterThan(1000);
  expect(await page.evaluate(() => window.__wc!.settings.get().mapper.background)).toBe('#ff00ff');
  expect(errors).toEqual([]);
});

test('Dark paper: the map draws on it with dark lines (ADR 0085 addendum)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } }, mapper: { background: '#e8dfc8' } }));
  const content = page.locator('.wc-app .wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d/, { timeout: 30_000 });
  await expect(content).toHaveAttribute('data-map-bg', '#e8dfc8');
  // The paper itself, and the connection lines in dark grey (#262626), not white.
  await expect.poll(() => countColour(page, [0xe8, 0xdf, 0xc8]), { timeout: 10_000 }).toBeGreaterThan(1000);
  await expect.poll(() => countColour(page, [0x26, 0x26, 0x26]), { timeout: 10_000 }).toBeGreaterThan(50);
  await page.locator('.wc-pane-map').screenshot({ path: test.info().outputPath('dark-paper.png') });
  // A dark colour draws its lines white as before.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { background: '#000000' } }));
  await expect.poll(() => countColour(page, [0x26, 0x26, 0x26]), { timeout: 10_000 }).toBeLessThan(50);
  expect(errors).toEqual([]);
});
