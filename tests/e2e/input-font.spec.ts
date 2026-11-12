// Stage 53, round 53j: the phone's game layout gives its command field a
// text size of its own (tests/e2e/phone-round-53j.spec.ts). On a computer and
// a tablet nothing changed: the command line's text is the font size
// setting's, as the game text's, and the sent line stays selected through a
// blur (the phone keeps it without a selection there).
import { type Page, expect, test } from '@playwright/test';

const field = (page: Page) => page.locator('.wc-input-field');
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

test('desktop: the command line\'s text follows the font size setting, and its caret the cockpit\'s cell', async ({ page }) => {
  await page.goto('/?replay');
  await expect(field(page)).toBeFocused();
  await expect(page.locator('.wc-input')).not.toHaveClass(/\bwc-input-own-font\b/);
  const seen: number[] = [];
  for (const size of [10, 20]) {
    await page.evaluate((n) => window.__wc!.settings.update({ appearance: { size: n } }), size);
    await expect.poll(() => page.evaluate(() => Math.round(window.__wc!.cells.get().px))).toBeGreaterThanOrEqual(size - 1);
    await frames(page);
    const cell = await page.evaluate(() => window.__wc!.cells.get());
    expect(Math.abs(cell.px - size)).toBeLessThan(1.5);
    const px = await field(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(px).toBeCloseTo(cell.px, 1);
    seen.push(px);
    await field(page).fill('kill');
    await frames(page);
    const f = (await field(page).boundingBox())!;
    const c = (await page.locator('.wc-input .wc-caret').boundingBox())!;
    expect(Math.abs(c.x - (f.x + 4 * cell.w))).toBeLessThanOrEqual(0.75);
    // (No width of its own is published on the pane: the cockpit's cell is the line's.)
    expect(await page.locator('.wc-input').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--cell-w'))).toBe('');
    await field(page).fill('');
  }
  expect(seen[1]! - seen[0]!).toBeGreaterThan(8);
});

test('desktop: the sent line stays selected, through a blur too (nothing is "kept" without a selection)', async ({ page }) => {
  await page.goto('/?replay');
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('look');
  await page.keyboard.press('Enter');
  const sel = () => field(page).evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]);
  expect(await sel()).toEqual([0, 4]);
  await field(page).evaluate((el: HTMLInputElement) => el.blur());
  expect(await sel()).toEqual([0, 4]);
  expect(await page.evaluate(() => window.__wc!.app.input.isKept())).toBe(false);
  await expect(field(page)).not.toHaveClass(/\bwc-input-kept\b/);
  await field(page).focus();
  await page.keyboard.type('n');
  await expect(field(page)).toHaveValue('n');
});
