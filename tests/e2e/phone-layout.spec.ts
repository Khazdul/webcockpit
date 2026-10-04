// Stage 19 part B (ADR 0075 §3): the phone layout. `?phone=1` on the
// `phone` project (Pixel 7: touch, mobile viewport), with the offline GMCP
// demo so the side panes have content.
import { type Page, expect, test } from '@playwright/test';

const DEMO = '/?fixture=gmcp-demo.log&speed=0&phone=1';

const tab = (page: Page, id: string) => page.locator(`.wc-phone-tab[data-tab="${id}"]`);
const pane = (page: Page, id: string) => page.locator(`.wc-pane[data-pane="${id}"]`);
const tooSmall = (page: Page) => page.locator('.wc-too-small:not([hidden]), .wc-start-too-small');

async function openDemo(page: Page): Promise<void> {
  await page.goto(DEMO);
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

test('portrait: tab strip, the game full width, the input at the bottom; no arranging', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openDemo(page);
  await expect(tooSmall(page)).toHaveCount(0);
  const tabs = await page.locator('.wc-phone-tab').allTextContents();
  expect(tabs.map((t) => t.trim()).slice(0, 6)).toEqual(['GAME', 'CHAR', 'TIME', 'GRP', 'COMM', 'UI']);
  await expect(tab(page, 'game')).toHaveClass(/is-active/);
  // The game view is as wide as the cockpit; no side pane is shown.
  const cockpit = (await page.locator('.wc-cockpit').boundingBox())!;
  const game = (await page.locator('.wc-game').boundingBox())!;
  expect(Math.abs(game.width - cockpit.width)).toBeLessThan(10);
  await expect(page.locator('.wc-pane:not([hidden])')).toHaveCount(0);
  await inputVisible(page);
  // Nothing to drag, resize or close.
  await expect(page.locator('.wc-pane-grip, .wc-pane-close, .wc-float-handle, .wc-handle')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('tapping COMM shows the comm pane full width; GAME comes back at the same scroll position', async ({ page }) => {
  await openDemo(page);
  const scroller = page.locator('.wc-game .wc-scroller');
  await scroller.evaluate((el) => (el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 200)));
  const before = await scroller.evaluate((el) => el.scrollTop);
  const cols = await page.locator('.wc-cockpit').getAttribute('data-cells');
  const layoutJson = () => page.evaluate(() => JSON.stringify(window.__wc!.settings.get().layout));
  const layout = await layoutJson();

  await tab(page, 'comm').tap();
  await expect(tab(page, 'comm')).toHaveClass(/is-active/);
  await expect(pane(page, 'comm')).toBeVisible();
  await expect(pane(page, 'comm')).toContainText("ready when you are");
  await expect(page.locator('.wc-game')).toBeHidden();
  const p = (await pane(page, 'comm').boundingBox())!;
  const c = (await page.locator('.wc-cockpit').boundingBox())!;
  expect(Math.abs(p.width - c.width)).toBeLessThan(10);
  await inputVisible(page);

  await tab(page, 'game').tap();
  await expect(page.locator('.wc-game')).toBeVisible();
  await expect(pane(page, 'comm')).toBeHidden();
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
  // The cell grid (and with it NAWS) did not change.
  await expect(page.locator('.wc-cockpit')).toHaveAttribute('data-cells', cols!);
  // Switching tabs never wrote the layout.
  expect(await layoutJson()).toBe(layout);
});

test('the ☰ button opens the ESC menu over the whole screen', async ({ page }) => {
  await openDemo(page);
  await page.locator('.wc-menu-btn').tap();
  await expect(page.locator('.wc-overlay')).toBeVisible();
  await expect(page.locator('.wc-overlay .wc-mrow[data-key="options"]')).toBeVisible();
  await page.locator('.wc-overlay .wc-footer .wc-esc-btn', { hasText: 'ESC Close' }).tap();
  await expect(page.locator('.wc-overlay')).toBeHidden();
});

test('a shorter visible area (keyboard) keeps the input visible and never shows too small', async ({ page }) => {
  await openDemo(page);
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 400 });
  await page.waitForTimeout(400);
  await expect(tooSmall(page)).toHaveCount(0);
  await inputVisible(page);
  await expect(page.locator('.wc-phone-tabs')).toBeVisible();
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

  test('fits without too small; tabs and the input work', async ({ page }) => {
    await openDemo(page);
    await expect(tooSmall(page)).toHaveCount(0);
    await expect(tab(page, 'game')).toBeVisible();
    await inputVisible(page);
    await tab(page, 'character').tap();
    await expect(pane(page, 'character')).toBeVisible();
    await tab(page, 'game').tap();
    await expect(page.locator('.wc-game')).toBeVisible();
  });
});

test('the start page opens on a portrait phone without too small', async ({ page }) => {
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await expect(tooSmall(page)).toHaveCount(0);
});
