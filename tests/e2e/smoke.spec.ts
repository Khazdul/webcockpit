// Browser smoke tests against replay mode (spec §4). Never open `/` without
// a parameter here: that connects to MUME live.
import { type Page, expect, test } from '@playwright/test';
import { smallestFixture } from './fixtures';

const fixture = smallestFixture();

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const app = (page: Page) => page.locator('.wc-app');
const field = (page: Page) => page.locator('.wc-input-field');

async function replayDone(page: Page, speed = 0): Promise<void> {
  await page.goto(`/?fixture=${encodeURIComponent(fixture!.rel)}&speed=${speed}`);
  await expect(rows(page).filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
}

test('offline page loads, is cross-origin isolated and does not connect', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(rows(page).first()).toHaveText(/Offline replay mode/);
  await expect(app(page)).toHaveAttribute('data-status', /^idle/);
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
  await expect(field(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test('built-in commands print locally', async ({ page }) => {
  await page.goto('/?replay');
  await field(page).fill('#help');
  await page.keyboard.press('Enter');
  // The list comes from the manual (tests/e2e/help.spec.ts has the details).
  await expect(rows(page).filter({ hasText: /^Commands$/ })).toHaveCount(1);
  await expect(page.locator('.wc-rows .wc-help').filter({ hasText: '#replay' })).toHaveCount(0);
  await field(page).fill('#blah');
  await page.keyboard.press('Enter');
  await expect(rows(page).last()).toHaveText('[SYSTEM] Unknown command: #blah');
});

test.describe('fixture replay', () => {
  test.skip(!fixture, 'no replay fixtures available');

  test('renders ANSI colours as spans and prompts', async ({ page }) => {
    const errors = watchErrors(page);
    await replayDone(page);
    expect(await rows(page).count()).toBeGreaterThan(10);
    expect(await page.locator('.wc-rows span[class*="wc-f"]').count()).toBeGreaterThan(0);
    expect(await page.locator('.wc-rows .wc-prompt').count()).toBeGreaterThan(0);
    // Colour comes from the DOS palette, not inherited default grey.
    const colour = await page
      .locator('.wc-rows span.wc-f2, .wc-rows span.wc-f3, .wc-rows span.wc-f6')
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(colour).not.toBe('rgb(192, 192, 192)');
    expect(errors).toEqual([]);
  });

  test('status reads replay while replaying', async ({ page }) => {
    await page.goto(`/?fixture=${encodeURIComponent(fixture!.rel)}&speed=1`);
    await expect(app(page)).toHaveAttribute('data-status', /^replay/);
    await expect(app(page)).toHaveAttribute('data-status', /capture: idle/);
  });

  test('input: recall state and history', async ({ page }) => {
    await replayDone(page);
    const f = field(page);
    await page.keyboard.type('look');
    await page.keyboard.press('Enter');
    await expect(f).toHaveValue('look');
    const sel = await f.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]);
    expect(sel).toEqual([0, 4]);
    // Typing replaces the recalled line.
    await page.keyboard.type('score');
    await expect(f).toHaveValue('score');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await expect(f).toHaveValue('look');
    await page.keyboard.press('ArrowDown');
    await expect(f).toHaveValue('score');
  });

  test('PageUp shows the live-tail bar and PageDown returns', async ({ page }) => {
    // Just above the 60 × 18-cell minimum (ADR 0010).
    await page.setViewportSize({ width: 900, height: 360 });
    await replayDone(page);
    const bar = page.locator('.wc-tail-bar');
    const scroller = page.locator('.wc-scroller').first();
    await expect(bar).toBeHidden();
    // The scrollbar shows only while scrolled back (owner, 2026-09-28).
    await expect(scroller).not.toHaveClass(/wc-scrolled/);
    await page.keyboard.press('PageUp');
    await expect(bar).toBeVisible();
    await expect(scroller).toHaveClass(/wc-scrolled/);
    await expect(bar).toContainText('PgDn');
    for (let i = 0; i < 50 && (await bar.isVisible()); i++) await page.keyboard.press('PageDown');
    await expect(bar).toBeHidden();
    await expect(scroller).not.toHaveClass(/wc-scrolled/);
    await page.keyboard.press('PageUp');
    await expect(bar).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(bar).toBeHidden();
  });
});
