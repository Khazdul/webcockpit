// Stage 19 part B (ADR 0075 §3): the phone layout. `?phone=1` on the
// `phone` project (Pixel 7: touch, mobile viewport), with the offline GMCP
// demo so the side panes have content.
//
// Since stage 51a (ADR 0136) the live game on a phone has no tab strip:
// what is left here is what still holds there (the guard, the visible
// area, the menu, landscape, the start page). The new shell has its own
// spec (phone-game-shell.spec.ts); the tab strip cases moved to the run
// log player, which keeps the strip (phone-player-tabs.spec.ts).
import { type Page, expect, test } from '@playwright/test';

const DEMO = '/?fixture=gmcp-demo.log&speed=0&phone=1';

const tooSmall = (page: Page) => page.locator('.wc-too-small:not([hidden]), .wc-start-too-small');

async function openDemo(page: Page, query = ''): Promise<void> {
  await page.goto(DEMO + query);
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
}

/** The input line lies inside the visible area. */
async function inputVisible(page: Page): Promise<void> {
  const input = page.locator('.wc-input-slot');
  await expect(input).toBeVisible();
  const box = (await input.boundingBox())!;
  const h = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThanOrEqual(h + 0.5);
}

test('portrait: the game full width, the input at the bottom; no arranging', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openDemo(page);
  await expect(tooSmall(page)).toHaveCount(0);
  // The game view is as wide as the cockpit; no side pane is shown.
  const cockpit = (await page.locator('.wc-cockpit').boundingBox())!;
  const game = (await page.locator('.wc-game').boundingBox())!;
  expect(Math.abs(game.width - cockpit.width)).toBeLessThan(10);
  // (The map pane is the lens since stage 51c; no side pane is shown.)
  await expect(page.locator('.wc-pane:not([hidden]):not(.wc-pane-map)')).toHaveCount(0);
  await inputVisible(page);
  // Nothing to drag, resize or close.
  await expect(page.locator('.wc-pane-grip, .wc-pane-close, .wc-float-handle, .wc-handle')).toHaveCount(0);
  // Nothing here writes the layout.
  const layout = await page.evaluate(() => JSON.stringify(window.__wc!.settings.get().layout));
  await page.locator('.wc-output').first().tap();
  expect(await page.evaluate(() => JSON.stringify(window.__wc!.settings.get().layout))).toBe(layout);
  expect(errors).toEqual([]);
});

test('the phone has the menu key and no menu bar (ADR 0099, ADR 0136 §9)', async ({ page }) => {
  await openDemo(page);
  await expect(page.locator('.wc-menubar')).toHaveCount(0);
  await expect(page.locator('.wc-ph-menu')).toBeVisible();
  await expect(page.locator('.wc-menu-btn')).toHaveCount(1);
  // #panes opens the phone's settings page (its Panes group comes in stage 51d).
  const field = page.locator('.wc-input-slot textarea, .wc-input-slot input').first();
  await field.fill('#panes');
  await field.press('Enter');
  await expect(page.locator('.wc-ph-page')).toBeVisible();
});

test('the menu key opens the menu sheet from the bottom edge, over the whole width', async ({ page }) => {
  await openDemo(page);
  await page.locator('.wc-ph-menu').tap();
  const sheet = page.locator('.wc-ph-sheet');
  await expect(sheet).toBeVisible();
  const c = (await page.locator('.wc-cockpit').boundingBox())!;
  const b = (await sheet.boundingBox())!;
  expect(Math.abs(b.width - c.width)).toBeLessThan(1);
  expect(Math.abs(b.y + b.height - (c.y + c.height))).toBeLessThan(1);
  expect(b.y).toBeGreaterThanOrEqual(c.y);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('a shorter visible area (keyboard) keeps the input visible and never shows too small', async ({ page }) => {
  // The device's keyboard (the old path, `?kbd=0`; ADR 0138 §9: it stays until the release decision).
  await openDemo(page, '&kbd=0');
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 400 });
  await page.waitForTimeout(400);
  await expect(tooSmall(page)).toHaveCount(0);
  await inputVisible(page);
  // Very short (a landscape keyboard): the guard is off while the keyboard is up.
  await page.setViewportSize({ width: size.width, height: 120 });
  await page.waitForTimeout(400);
  await expect(page.locator('html')).toHaveClass(/\bwc-kbd\b/);
  await expect(tooSmall(page)).toHaveCount(0);
  await inputVisible(page);
  // Keyboard down again.
  await page.setViewportSize(size);
  await page.waitForTimeout(400);
  await expect(page.locator('html')).not.toHaveClass(/\bwc-kbd\b/);
  await inputVisible(page);
});

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('fits without too small; the game and the input show', async ({ page }) => {
    await openDemo(page);
    await expect(tooSmall(page)).toHaveCount(0);
    await inputVisible(page);
    await expect(page.locator('.wc-game')).toBeVisible();
  });
});

test('the start page opens on a portrait phone without too small', async ({ page }) => {
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await expect(tooSmall(page)).toHaveCount(0);
});
