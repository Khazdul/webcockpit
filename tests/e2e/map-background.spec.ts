// Stage 25 (ADR 0085 and its addenda): Options → Mapper → Background
// colour, one cycler row over the named colours (typed codes removed in
// round 3). The chosen colour is drawn by the map worker at once, the
// pane's CSS background follows, and the setting survives a reload. Dark
// paper and White, the light colours, get dark connection lines.
import { expect, type Page, test } from '@playwright/test';

/** Pixels of the map canvas that are exactly (±8) `rgb`. */
async function countColour(page: Page, rgb: readonly [number, number, number]): Promise<number> {
  // Below the title row: a framed map fills its frame up to the line, and the pane title lies over its top edge (ADR 0091 "Frames").
  const r = (await page.locator('.wc-pane-map canvas').boundingBox())!;
  const skip = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.wc-cockpit')!).getPropertyValue('--cell-h')));
  const shot = await page.screenshot({ clip: { x: r.x, y: r.y + skip, width: r.width, height: r.height - skip } });
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

const SLATE = [0x2e, 0x34, 0x36] as const;
const MAROON = [0x2e, 0x12, 0x14] as const;

test('Options → Mapper → Background colour: a named colour is drawn live and kept over a reload', async ({ page }) => {
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
  const maroonBefore = await countColour(page, MAROON);

  // ESC → Options → Mapper: one cycler row, no colour code row.
  await page.locator('.wc-input-field').focus();
  await page.keyboard.press('Escape');
  const frame = page.locator('.wc-frame:not([hidden])');
  await frame.locator('.wc-mrow[data-key="options"] .wc-label').click();
  await frame.locator('.wc-mrow[data-key="mapper"] .wc-label').click();
  const row = frame.locator('.wc-mrow[data-key="background"] .wc-label');
  await expect(row).toHaveText('Background colour: Default');
  await expect(frame.locator('.wc-mrow[data-key="backgroundCode"]')).toHaveCount(0);
  // ← → cycle the named list: Black, back to Default, then ← past Transparent, White, Dark paper and Dark purple to Maroon.
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(row).toHaveText('Background colour: Black');
  await expect(content).toHaveAttribute('data-map-bg', '#000000');
  await page.keyboard.press('ArrowLeft');
  await expect(row).toHaveText('Background colour: Default');
  await page.keyboard.press('ArrowLeft');
  await expect(row).toHaveText('Background colour: Transparent');
  // Transparent: the map draws on the pane's own background, the terminal's here.
  const termBg = await page.evaluate(() => window.__wc!.settings.get().appearance.bg.toLowerCase());
  await expect(content).toHaveAttribute('data-map-bg', termBg);
  await page.keyboard.press('ArrowLeft');
  await expect(row).toHaveText('Background colour: White');
  await expect(content).toHaveAttribute('data-map-bg', '#ffffff');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  await expect(row).toHaveText('Background colour: Maroon');
  await closeMenus(page);

  // Drawn at once, and the pane's own background (before a frame) follows.
  await expect(content).toHaveAttribute('data-map-bg', '#2e1214');
  await expect.poll(() => countColour(page, MAROON), { timeout: 10_000 }).toBeGreaterThan(maroonBefore + 1000);
  expect(await content.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(46, 18, 20)');

  // Kept over a reload: the worker starts with it.
  await page.reload();
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await expect(content).toHaveAttribute('data-map-bg', '#2e1214');
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d/, { timeout: 30_000 });
  await expect.poll(() => countColour(page, MAROON), { timeout: 10_000 }).toBeGreaterThan(maroonBefore + 1000);
  expect(await page.evaluate(() => window.__wc!.settings.get().mapper)).not.toHaveProperty('backgroundCode');
  expect(await page.evaluate(() => window.__wc!.settings.get().mapper.background)).toBe('#2e1214');
  expect(errors).toEqual([]);
});

test('Dark paper and White: the map draws on them with dark lines (ADR 0085 addenda)', async ({ page }) => {
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
  // White, the other light choice: the white page, the same dark lines.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { background: '#ffffff' } }));
  await expect(content).toHaveAttribute('data-map-bg', '#ffffff');
  await expect.poll(() => countColour(page, [0xff, 0xff, 0xff]), { timeout: 10_000 }).toBeGreaterThan(1000);
  await expect.poll(() => countColour(page, [0x26, 0x26, 0x26]), { timeout: 10_000 }).toBeGreaterThan(50);
  await page.locator('.wc-pane-map').screenshot({ path: test.info().outputPath('white.png') });
  const onWhite = await countColour(page, [0x26, 0x26, 0x26]);
  // A dark colour draws its lines white as before: what is left of that grey is the tiles' own
  // antialiased edges (~1/3 of the white page's count since the map fills its frame, ADR 0091).
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { background: '#000000' } }));
  await expect.poll(() => countColour(page, [0x26, 0x26, 0x26]), { timeout: 10_000 }).toBeLessThan(onWhite / 2);
  expect(errors).toEqual([]);
});

/**
 * Map pixels (below the title row) that change when what lies behind the
 * canvas changes from magenta to green: the pixels the map leaves (partly)
 * clear. Also the pixel count.
 */
async function seeThrough(page: Page): Promise<{ clear: number; total: number }> {
  const r = (await page.locator('.wc-pane-map canvas').boundingBox())!;
  const skip = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.wc-cockpit')!).getPropertyValue('--cell-h')));
  const clip = { x: r.x, y: r.y + skip, width: r.width, height: r.height - skip };
  const behind = (c: string) =>
    page.evaluate((c) => {
      let s = document.getElementById('behind-map');
      if (!s) document.head.append((s = Object.assign(document.createElement('style'), { id: 'behind-map' })));
      s.textContent = `.wc-pane-map, .wc-pane-map > .wc-pane-frame::before { background: ${c} !important; }`;
    }, c);
  await behind('#ff00ff');
  const a = (await page.screenshot({ clip })).toString('base64');
  await behind('#00ff00');
  const b = (await page.screenshot({ clip })).toString('base64');
  await page.evaluate(() => document.getElementById('behind-map')?.remove());
  return page.evaluate(
    async ([a, b]) => {
      const pixels = async (png: string) => {
        const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
        const ctx = new OffscreenCanvas(img.width, img.height).getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const [da, db] = [await pixels(a), await pixels(b)];
      let clear = 0;
      for (let o = 0; o < da.length; o += 4) {
        if (Math.abs(da[o]! - db[o]!) + Math.abs(da[o + 1]! - db[o + 1]!) + Math.abs(da[o + 2]! - db[o + 2]!) > 6) clear++;
      }
      return { clear, total: da.length / 4 };
    },
    [a, b] as const,
  );
}

test('Transparent: the map leaves its empty space clear, tiles opaque, and follows the theme and the pane tint (ADR 0085 addenda)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  const pane = page.locator('.wc-app .wc-pane-map');
  const content = pane.locator('.wc-pane-content');
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d/, { timeout: 30_000 });
  // An opaque colour (the default): nothing behind the canvas shows (polled: the labels may still be coming in).
  await expect.poll(async () => (await seeThrough(page)).clear, { timeout: 10_000 }).toBe(0);
  // The map settles: the replay places the player (before that the map is all slate) and the count stops changing.
  const all = (await seeThrough(page)).total;
  let slate = -1;
  await expect
    .poll(
      async () => {
        const n = await countColour(page, SLATE);
        const same = n === slate && n < all * 0.8;
        slate = n;
        return same;
      },
      { timeout: 15_000, intervals: [500] },
    )
    .toBe(true);
  expect(slate).toBeGreaterThan(1000);

  await page.evaluate(() => window.__wc!.settings.update({ mapper: { background: 'transparent' } }));
  await expect(content).toHaveAttribute('data-map-transparent', '');
  expect(await content.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  // The empty space (where the default drew its slate) is clear; the tiles, lines and marks are not.
  await expect.poll(async () => (await seeThrough(page)).clear, { timeout: 10_000 }).toBeGreaterThan(slate * 0.9);
  const { clear, total } = await seeThrough(page);
  expect(total - clear).toBeGreaterThan(1000);
  expect(clear).toBeLessThan(slate * 1.2);
  // Without anything behind, it looks as before: the pane's fill (the terminal background) where the slate was.
  const termBg = await page.evaluate(() => window.__wc!.settings.get().appearance.bg.toLowerCase());
  await expect(content).toHaveAttribute('data-map-bg', termBg);
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as [number, number, number];
  expect(await countColour(page, hex(termBg))).toBeGreaterThan(slate * 0.9);

  // The colour the map fades lower layers into and picks its lines by follows the pane: a paper theme, then a tint.
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8' } }));
  await expect(content).toHaveAttribute('data-map-bg', '#f4ecd8');
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { color: 'blue' } } }));
  await expect(content).toHaveAttribute('data-map-bg', '#0e141c');
  await expect.poll(() => countColour(page, [0x0e, 0x14, 0x1c]), { timeout: 10_000 }).toBeGreaterThan(slate * 0.9);
  // Back to a colour: opaque again.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { background: '#2e1214' } }));
  await expect(content).not.toHaveAttribute('data-map-transparent');
  await expect.poll(async () => (await seeThrough(page)).clear, { timeout: 10_000 }).toBe(0);
  expect(errors).toEqual([]);
});
