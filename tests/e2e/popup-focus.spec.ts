// Stage 30c round 1 (ADR 0108): Tab in the game never moves the focus,
// and the bar and gear popups take the focus when they open: Tab cycles
// inside them, the arrows, Space and Page Up/Down work there, a click on a
// control keeps the keys there, Esc gives them back to the game.
import { type Page, expect, test } from '@playwright/test';

const field = (page: Page) => page.locator('.wc-input-field');
const icon = (page: Page, id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
const anyPop = (page: Page) => page.locator('.wc-pop');
const panesPop = (page: Page) => page.locator('.wc-pop-panes');
const settingsPop = (page: Page) => page.locator('.wc-sp-settings');
const row = (page: Page, id: string) => page.locator(`.wc-pop-row[data-pane="${id}"]`);
const win = (page: Page, id: string) => page.locator(`.wc-win[data-win="${id}"]`);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function offline(page: Page): Promise<void> {
  await page.goto('/?replay');
  await expect(field(page)).toBeFocused();
  await expect(page.locator('.wc-mb-bar')).toBeVisible();
}

async function command(page: Page, text: string): Promise<void> {
  await field(page).fill(text);
  await page.keyboard.press('Enter');
}

/** True while the focus is inside `sel`. */
const focusIn = (page: Page, sel: string) => page.evaluate((s) => !!document.activeElement?.closest(s), sel);

test('Tab and Shift+Tab in the game never move the focus', async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    await expect(field(page)).toBeFocused();
  }
  await page.keyboard.type('say hi');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue('say hi');
  // A stray focus (the page's body) is given back to the game by Tab.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press('Tab');
  await expect(field(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test('#panes takes the focus: ↑↓ move, Space toggles, the focus stays; Esc gives it back', async ({ page }) => {
  await offline(page);
  await command(page, '#panes');
  await expect(panesPop(page)).toBeVisible();
  await expect(row(page, 'character')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const id = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.pane!);
  const before = await row(page, id).getAttribute('aria-pressed');
  await page.keyboard.press('Space');
  await expect(row(page, id)).not.toHaveAttribute('aria-pressed', before!);
  await expect(row(page, id)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row(page, id)).toHaveAttribute('aria-pressed', before!);
  await expect(row(page, id)).toBeFocused();
  // Tab and Shift+Tab never leave it.
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
    expect(await focusIn(page, '.wc-pop-panes')).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(anyPop(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
});

test('a mouse toggle in Panes keeps the focus in it; a click in the game gives it back', async ({ page }) => {
  await offline(page);
  await icon(page, 'panes').click();
  await row(page, 'timers').click();
  await expect(page.locator('.wc-pane-timers')).toBeHidden();
  await expect(row(page, 'timers')).toBeFocused();
  await row(page, 'timers').click();
  await expect(page.locator('.wc-pane-timers')).toBeVisible();
  await expect(row(page, 'timers')).toBeFocused();
  // Keys go on from the row pressed.
  await page.keyboard.press('ArrowDown');
  expect(await focusIn(page, '.wc-pop-panes')).toBe(true);
  await expect(row(page, 'timers')).not.toBeFocused();
  await page.locator('.wc-output').click({ position: { x: 20, y: 20 } });
  await expect(field(page)).toBeFocused();
  await expect(panesPop(page)).toBeVisible();
  // A click in it takes the keys again.
  await row(page, 'timers').click();
  await expect(row(page, 'timers')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(anyPop(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
});

test('Settings: Tab cycles inside it without leaving; Page Down never scrolls the game', async ({ page }) => {
  await offline(page);
  await command(page, '#settings');
  await expect(settingsPop(page)).toBeVisible();
  await expect(page.locator('.wc-ck-tab[data-tab="appearance"]')).toBeFocused();
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    expect(await focusIn(page, '.wc-sp-settings')).toBe(true);
    seen.add(await page.evaluate(() => document.activeElement!.outerHTML.slice(0, 80)));
  }
  // It went round (the controls of the visible page and the X, then the tab again).
  expect(seen.size).toBeGreaterThan(8);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await focusIn(page, '.wc-sp-settings')).toBe(true);
  }
  // Page Down / Up stay in the popup: the game text is not scrolled back.
  await page.locator('.wc-ck-tab[data-tab="input"]').focus();
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  expect(await focusIn(page, '.wc-sp-settings')).toBe(true);
  await page.locator('.wc-output').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Escape');
  await expect(anyPop(page)).toHaveCount(0);
  await expect(page.locator('.wc-overlay')).toBeHidden();
});

test('Settings on a short screen: Page Down scrolls its body', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 420 });
  await offline(page);
  await command(page, '#settings');
  const body = settingsPop(page).locator('.wc-sp-body');
  const scrolls = await body.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  test.skip(!scrolls, 'the popup fits the screen');
  await page.keyboard.press('PageDown');
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('PageUp');
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await focusIn(page, '.wc-sp-settings')).toBe(true);
});

test('the gear popup takes the focus; Tab cycles in it; its X gives the keys back', async ({ page }) => {
  await offline(page);
  const b = (await page.locator('.wc-pane-group').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.locator('.wc-pane-group > .wc-pane-btn-gear').click();
  const pop = page.locator('.wc-sp-gear-group');
  await expect(pop).toBeVisible();
  await expect(pop.locator('.wc-sp-body :focus')).toHaveCount(1);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await focusIn(page, '.wc-sp-gear-group')).toBe(true);
  }
  await pop.locator('.wc-pop-x').click();
  await expect(anyPop(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
});

test('a popup opened while a window has the focus takes it; closing gives the keys to the game', async ({ page }) => {
  await offline(page);
  await icon(page, 'scripts').click();
  await expect(win(page, 'scripts')).toHaveAttribute('data-focused', '');
  await icon(page, 'settings').click();
  await expect(settingsPop(page)).toBeVisible();
  await expect(win(page, 'scripts')).not.toHaveAttribute('data-focused', '');
  expect(await focusIn(page, '.wc-sp-settings')).toBe(true);
  // Keys work in the popup, not in the window behind it.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.wc-ck-tab[data-tab="input"]')).toHaveAttribute('aria-selected', 'true');
  await expect(win(page, 'scripts')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(anyPop(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await expect(win(page, 'scripts')).not.toHaveAttribute('data-focused', '');
});

test('a macro opens a popup with the focus in it', async ({ page }) => {
  await offline(page);
  await command(page, '#macro {F7} {#panes}');
  await field(page).fill('');
  await page.keyboard.press('F7');
  await expect(panesPop(page)).toBeVisible();
  await expect(row(page, 'character')).toBeFocused();
  // A macro bound to Tab runs too.
  await page.keyboard.press('Escape');
  await command(page, '#macro {Tab} {#exit}');
  await page.keyboard.press('Tab');
  await expect(page.locator('.wc-pop-exit')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(field(page)).toBeFocused();
});
