// Stage 30a (ADR 0099, ADR 0100): the menu bar at the right end of the
// input row on desktop: clock, icons, tooltips, the Panes and Exit popups,
// and `#panes`. Profile and Scripts open windows since 30b (ADR 0103;
// tests/e2e/windows.spec.ts), Settings its popup since 30c (ADR 0107;
// tests/e2e/settings-popup.spec.ts). There is no ESC menu beside it since
// 30f (ADR 0112; tests/e2e/esc-click.spec.ts).
import { type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const bar = (page: Page) => page.locator('.wc-mb-bar');
const icon = (page: Page, id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
const tip = (page: Page) => page.locator('.wc-mb-tip');
const popup = (page: Page) => page.locator('.wc-pop');
const overlay = (page: Page) => page.locator('.wc-overlay');
const field = (page: Page) => page.locator('.wc-input-field');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function offline(page: Page): Promise<void> {
  await page.goto('/?replay');
  await expect(field(page)).toBeFocused();
  await expect(bar(page)).toBeVisible();
}

async function enterMume(page: Page): Promise<() => WebSocketRoute | null> {
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  return () => server;
}

test('the bar sits at the end of the input row on the cell grid, with no touch controls', async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await expect(page.locator('.wc-mb-sep')).toHaveCount(2);
  const ids = await page.locator('.wc-mb').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.mb));
  expect(ids).toEqual(['profile', 'scripts', 'panes', 'settings', 'fullscreen', 'exit']);
  await expect(page.locator('.wc-menu-btn')).toHaveCount(0);
  await expect(page.locator('.wc-fs-btn')).toHaveCount(0);
  const geo = await page.evaluate(() => {
    const cw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-w'));
    const ch = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h'));
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    return { cw, ch, bar: r('.wc-mb-bar'), row: r('.wc-input'), field: r('.wc-input-field') };
  });
  // One cell high, a whole number of cells wide, flush with the row's end.
  expect(geo.bar.height).toBeCloseTo(geo.ch, 1);
  expect(Math.abs(geo.bar.width / geo.cw - Math.round(geo.bar.width / geo.cw))).toBeLessThan(0.01);
  expect(geo.bar.right).toBeCloseTo(geo.row.right, 1);
  const fieldCells = geo.field.width / geo.cw;
  expect(Math.abs(fieldCells - Math.round(fieldCells))).toBeLessThan(0.01);
  // The icons are not in the Tab order; a click on one never focuses it, and its popup takes the keys (ADR 0108).
  expect(await page.locator('.wc-mb, .wc-mb-rc').evaluateAll((els) => els.map((e) => (e as HTMLElement).tabIndex))).toEqual(
    Array(7).fill(-1),
  );
  await icon(page, 'panes').click();
  await expect(page.locator('.wc-pop-row').first()).toBeFocused();
  expect(errors).toEqual([]);
});

test('tooltips: the profile, the buttons and the clock', async ({ page }) => {
  await offline(page);
  await icon(page, 'profile').hover();
  await expect(tip(page)).toHaveText('Profile: default');
  await icon(page, 'exit').hover();
  await expect(tip(page)).toHaveText('Exit to main menu');
  await icon(page, 'fullscreen').hover();
  await expect(tip(page)).toHaveText('Fullscreen');
  await page.locator('.wc-mb-clock').hover();
  await expect(tip(page)).toHaveText(/^(Day in |Night in |Game clock unknown: type time)/);
  // The tooltip stands above the bar.
  const t = (await tip(page).boundingBox())!;
  const b = (await bar(page).boundingBox())!;
  expect(t.y + t.height).toBeLessThanOrEqual(b.y);
  await page.mouse.move(5, 5);
  await expect(tip(page)).toBeHidden();
});

test('Panes: the switch hides and shows a pane; Esc closes the popup, then opens nothing', async ({ page }) => {
  await offline(page);
  await expect(page.locator('.wc-pane-timers')).toBeVisible();
  await icon(page, 'panes').click();
  await expect(popup(page)).toBeVisible();
  const rows = page.locator('.wc-pop-row');
  await expect(rows.first()).toHaveText('Character');
  const timers = page.locator('.wc-pop-row[data-pane="timers"]');
  await expect(timers).toHaveAttribute('aria-pressed', 'true');
  await timers.click();
  await expect(timers).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.wc-pane-timers')).toBeHidden();
  await timers.click();
  await expect(page.locator('.wc-pane-timers')).toBeVisible();
  // The popup is above the bar and inside the window.
  const p = (await popup(page).boundingBox())!;
  const b = (await bar(page).boundingBox())!;
  expect(p.y + p.height).toBeLessThanOrEqual(b.y);
  expect(p.x).toBeGreaterThanOrEqual(0);
  // A click on a switch keeps the keys in it (ADR 0108); Esc closes it and gives the game its keys back.
  await expect(timers).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await expect(overlay(page)).toBeHidden();
  // Opened by the icon it has the keys; a click in the game gives them back and leaves it open; Esc in the input closes it first.
  await icon(page, 'panes').click();
  await expect(page.locator('.wc-pop-row').first()).toBeFocused();
  await page.locator('.wc-output').click({ position: { x: 20, y: 20 } });
  await expect(field(page)).toBeFocused();
  await expect(popup(page)).toBeVisible();
  await page.keyboard.type('abc');
  await expect(field(page)).toHaveValue('abc');
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
  await expect(overlay(page)).toBeHidden();
  // With nothing open Esc does nothing (ADR 0112).
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(overlay(page)).toHaveCount(0);
  await expect(popup(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
});

test('#panes opens and closes the popup; the icon toggles it; Reset layout asks first', async ({ page }) => {
  await offline(page);
  await page.keyboard.type('#panes');
  await page.keyboard.press('Enter');
  await expect(popup(page)).toBeVisible();
  // It takes the keys (ADR 0108).
  await expect(page.locator('.wc-pop-row').first()).toBeFocused();
  await page.locator('.wc-pop-foot [data-act="reset"]').click();
  await expect(page.locator('.wc-pop-foot')).toHaveText('Reset layout?ResetCancel');
  await page.locator('.wc-pop-foot [data-act="reset-no"]').click();
  await expect(page.locator('.wc-pop-foot')).toHaveText('Reset layout');
  await icon(page, 'panes').click();
  await expect(popup(page)).toHaveCount(0);
  await icon(page, 'panes').click();
  await expect(popup(page)).toBeVisible();
  await page.locator('.wc-pop-x').click();
  await expect(popup(page)).toHaveCount(0);
  await field(page).fill('#panes');
  await page.keyboard.press('Enter');
  await expect(popup(page)).toBeVisible();
  await field(page).fill('#panes');
  await page.keyboard.press('Enter');
  await expect(popup(page)).toHaveCount(0);
});

test('Settings opens its popup (ADR 0107); Scripts and Profile open their windows (ADR 0103)', async ({ page }) => {
  await offline(page);
  await icon(page, 'settings').click();
  await expect(page.locator('.wc-sp-settings')).toBeVisible();
  await expect(overlay(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await icon(page, 'scripts').click();
  await expect(overlay(page)).toBeHidden();
  const scripts = page.locator('.wc-win[data-win="scripts"]');
  await expect(scripts.locator('.wc-frame:not([hidden]) .wc-title-row .wc-c-section')).toHaveText('─── Scripts ───');
  await page.keyboard.press('Escape');
  await expect(scripts).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await field(page).fill('#profile');
  await page.keyboard.press('Enter');
  const ped = page.locator('.wc-win[data-win="profile"] .wc-frame:not([hidden]) > .wc-ped');
  await expect(ped.locator('.wc-ped-title .wc-c-section')).toHaveText('─── Profile Editor: default ───');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  await expect(overlay(page)).toBeHidden();
  await expect(field(page)).toBeFocused();
});

test('Exit: the popup takes the keys; Esc cancels, Y returns to the start page', async ({ page }) => {
  const errors = watchErrors(page);
  const server = await enterMume(page);
  let closed = false;
  server()!.onClose(() => (closed = true));
  await icon(page, 'exit').click();
  await expect(page.locator('.wc-pop-exit')).toBeVisible();
  await expect(page.locator('.wc-pop-ask')).toHaveText('Exit to main menu?');
  await expect(page.locator('.wc-pop-exit')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await field(page).fill('#exit');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-pop-exit')).toBeFocused();
  await page.keyboard.press('y');
  await expect(page.locator('.wc-start')).toBeVisible();
  await expect(page.locator('.wc-app')).toBeHidden();
  await expect.poll(() => closed).toBe(true);
  await expect(popup(page)).toHaveCount(0);
  // And back in again.
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  expect(errors).toEqual([]);
});
