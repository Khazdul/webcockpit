// The ESC menu, the phone's only since stage 30f (ADR 0112): Esc, `#menu`
// and a server drop open it; its header, keys, Continue, Statistics and
// Exit session. Moved here from the desktop specs (chrome, history,
// esc-click) when the menu bar took its place on desktop and tablet.
import { type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const overlay = (page: Page) => page.locator('.wc-overlay');
const menu = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden])');
const menuSel = (page: Page) => menu(page).locator('.wc-mrow.is-sel');
const startSel = (page: Page) => page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label');
const field = (page: Page) => page.locator('.wc-input-slot textarea, .wc-input-slot input').first();

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Enters MUME on `?phone=1` against a mock at the name prompt. */
async function enterMume(page: Page): Promise<{ server: () => WebSocketRoute; opened: () => number }> {
  let server: WebSocketRoute | null = null;
  let opened = 0;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    opened++;
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/?phone=1');
  await expect(startSel(page)).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  return { server: () => server!, opened: () => opened };
}

test('Esc opens the menu with its status header; the keys go to it; Esc and Continue close it', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page);
  await field(page).press('Escape');
  await expect(overlay(page)).toBeVisible();
  await expect(menuSel(page)).toHaveText('<< Continue >>');
  // The header wraps between its parts on a phone (ADR 0075 §3.2).
  await expect(page.locator('.wc-overlay .wc-esc-header').first()).toContainText('Profile: default');
  await expect(page.locator('.wc-overlay .wc-esc-header').first()).toContainText('Link:');
  // Keys go to the menu, not the game input.
  await page.keyboard.press('ArrowDown');
  await expect(menuSel(page)).toHaveText('<< Reconnect >>');
  await page.keyboard.type('xyz');
  await expect(field(page)).toHaveValue('');
  await page.keyboard.press('ArrowUp');
  await expect(menuSel(page)).toHaveText('<< Continue >>');
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeHidden();
  await field(page).press('Escape');
  await expect(overlay(page)).toBeVisible();
  await page.keyboard.press('Enter'); // Continue
  await expect(overlay(page)).toBeHidden();
  // #menu opens it too.
  await field(page).fill('#menu');
  await field(page).press('Enter');
  await expect(overlay(page)).toBeVisible();
  await expect(menuSel(page)).toHaveText('<< Continue >>');
  expect(errors).toEqual([]);
});

test('the selected profile shows in the header', async ({ page }) => {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => ws.send(Buffer.from([IAC, WILL, GMCP])));
  await page.goto('/?phone=1');
  await expect(startSel(page)).toHaveText('Enter MUME');
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.create('scout', '');
    window.__wc!.settings.update({ profile: 'scout' });
  });
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.locator('.wc-menu-btn').tap();
  await expect(page.locator('.wc-overlay .wc-esc-header').first()).toContainText('Profile: scout');
});

test('a server drop opens the menu with Reconnect selected; the notice is not there', async ({ page }) => {
  const m = await enterMume(page);
  await m.server().close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(overlay(page)).toBeVisible();
  await expect(menuSel(page)).toHaveText('<< Reconnect >>');
  await expect(page.locator('.wc-mb-disc')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(overlay(page)).toBeHidden();
  expect(m.opened()).toBe(2);
});

test('offline modes have the menu, with Reconnect selected', async ({ page }) => {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(page.locator('.wc-start')).toHaveCount(0);
  await field(page).press('Escape');
  await expect(overlay(page)).toBeVisible();
  await expect(menuSel(page)).toHaveText('<< Reconnect >>');
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeHidden();
});

test('Exit session asks first, returns to the start page and closes the connection', async ({ page }) => {
  const m = await enterMume(page);
  let closed = false;
  m.server().onClose(() => (closed = true));
  await field(page).press('Escape');
  await expect(overlay(page)).toBeVisible();
  await page.keyboard.press('End');
  await expect(menuSel(page)).toHaveText('<< Exit session >>');
  await page.keyboard.press('Enter');
  await expect(menu(page).locator('.wc-title-row')).toHaveText('─── Exit session ───');
  await expect(menu(page).locator('.wc-body')).toContainText('Attention! This terminates the current');
  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('<< Exit session >>');
  await page.keyboard.press('Enter');
  await page.keyboard.press('y');
  await expect(page.locator('.wc-start')).toBeVisible();
  await expect(startSel(page)).toHaveText('Enter MUME');
  await expect(page.locator('.wc-app')).toBeHidden();
  await expect(overlay(page)).toBeHidden();
  await expect.poll(() => closed).toBe(true);
});

test('Statistics shows the live run of a replay', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?fixture=gmcp-demo.log&speed=3&phone=1');
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: 'An orc scout is dead! R.I.P.' }).first()).toBeAttached({
    timeout: 20_000,
  });
  await page.locator('.wc-menu-btn').tap();
  await menu(page).locator('.wc-mrow[data-key="stats"]').tap();
  const stats = menu(page).locator('.wc-stats');
  await expect(stats.locator('.wc-stats-header').first()).toContainText('STATISTICS');
  await expect(stats).toContainText('An orc scout');
  await expect(stats).toContainText('★ Defeated an orc scout');
  // The replay ends while it is open: the data stays.
  await expect(stats).toContainText('Run ended', { timeout: 25_000 });
  await expect(stats).toContainText('An orc scout');
  await page.keyboard.press('Escape');
  await expect(menu(page).locator('.wc-mrow[data-key="stats"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Profile and Options → Scripts open their frames in the menu, not windows', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-app')).toBeVisible();
  await page.locator('.wc-menu-btn').tap();
  await menu(page).locator('.wc-mrow[data-key="profile"]').tap();
  // The editor in the new look, full screen in the menu (place `menu`, ADR 0127, 0128).
  const pe = menu(page).locator('.wc-pe');
  await expect(pe).toHaveAttribute('data-view', 'lite');
  await expect(pe).toHaveClass(/\bis-menu\b/);
  await expect(menu(page).locator('.wc-lk-box-full .wc-lk-hood-t')).toHaveText('Profile');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  // Back (top left) returns to the menu, as Esc does.
  await menu(page).locator('.wc-lk-back').tap();
  await expect(menu(page).locator('.wc-mrow[data-key="profile"]')).toBeVisible();
  await menu(page).locator('.wc-mrow[data-key="profile"]').tap();
  await expect(pe).toHaveAttribute('data-view', 'lite');
  await page.keyboard.press('Escape');
  await expect(menu(page).locator('.wc-mrow[data-key="options"]')).toBeVisible();
  await menu(page).locator('.wc-mrow[data-key="options"]').tap();
  // Options has no Spotlights row: its settings are in the reel's gear (ADR 0110).
  await expect(menu(page).locator('.wc-mrow[data-key="spotlights"]')).toHaveCount(0);
  await menu(page).locator('.wc-mrow[data-key="scripts"]').tap();
  // The lantern Scripts page in the menu place (stage 44): its hood and the page.
  await expect(menu(page).locator('.wc-lk-hood-t')).toHaveText('Scripts');
  await expect(menu(page).locator('.wc-scr')).toBeVisible();
  await expect(page.locator('.wc-win')).toHaveCount(0);
  expect(errors).toEqual([]);
});
