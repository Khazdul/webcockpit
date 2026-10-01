// Output pane with a full scrollback (stage 8 part C, ADR 0044). The rows
// come straight from the bus (`sys.message`), so no fixture is needed.
// Offline page only: never open `/` without a parameter here.
import { type Page, expect, test } from '@playwright/test';

const scroller = (page: Page) => page.locator('.wc-output .wc-scroller');
const tailBar = (page: Page) => page.locator('.wc-output .wc-tail-bar');

/** Opens the offline page and fills the scrollback with `n` rows `row 0` … `row n-1`. */
async function fill(page: Page, n: number): Promise<void> {
  await page.goto('/?replay');
  await expect(page.locator('.wc-rows .wc-row').first()).toHaveText(/Offline replay mode/);
  await page.evaluate((n) => {
    const bus = window.__wc!.app.bus;
    for (let i = 0; i < n; i++) bus.emit('sys.message', { text: `row ${i}` });
  }, n);
  await expect(page.locator('.wc-rows .wc-row').last()).toHaveText(`[SYSTEM] row ${n - 1}`);
}

/** True when the view shows the live tail. */
function atTail(page: Page): Promise<boolean> {
  return scroller(page).evaluate((s) => s.scrollTop + s.clientHeight >= s.scrollHeight - 2);
}

test('PgUp and Esc enter and leave scroll mode with 20 000 rows of scrollback', async ({ page }) => {
  await fill(page, 20_500);
  expect(await page.evaluate(() => window.__wc!.app.output.rows)).toBeGreaterThanOrEqual(20_000);
  await expect.poll(() => atTail(page)).toBe(true);
  await expect(tailBar(page)).toBeHidden();

  // Rule 2 of ADR 0044: the scroll-mode class must not change an inherited
  // property of the rows, so they keep their own scrollbar-color.
  const rowColour = () => page.locator('.wc-rows .wc-row').last().evaluate((el) => getComputedStyle(el).scrollbarColor);
  const atTailColour = await rowColour();

  await page.locator('.wc-input-field').focus();
  await page.keyboard.press('PageUp');
  await expect(scroller(page)).toHaveClass(/wc-scrolled/);
  await expect(tailBar(page)).toBeVisible();
  expect(await atTail(page)).toBe(false);
  expect(await rowColour()).toBe(atTailColour);

  // New rows while scrolled back do not pull the view down.
  await page.evaluate(() => window.__wc!.app.bus.emit('sys.message', { text: 'while scrolled' }));
  await expect(tailBar(page)).toContainText('1 new line');
  expect(await atTail(page)).toBe(false);

  await page.keyboard.press('Escape');
  await expect(scroller(page)).not.toHaveClass(/wc-scrolled/);
  await expect(tailBar(page)).toBeHidden();
  await expect.poll(() => atTail(page)).toBe(true);
  await expect(page.locator('.wc-rows .wc-row').last()).toHaveText('[SYSTEM] while scrolled');
  expect(await rowColour()).toBe(atTailColour);
});
