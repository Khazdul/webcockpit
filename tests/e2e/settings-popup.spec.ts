// Stage 30c (ADR 0107): the Settings popup above the menu bar's Settings
// icon: open, close and toggle (icon, `#settings`, X, Esc); one popup at a
// time with Panes; the Esc order in the input; the focus on open (ADR
// 0108) and the keys in it; live changes through its controls; one size
// for every tab. The pane Appearance page gone from Options → Panes on
// desktop: chrome.spec.ts.
import { type Page, expect, test } from '@playwright/test';

const field = (page: Page) => page.locator('.wc-input-field');
const icon = (page: Page, id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
const pop = (page: Page) => page.locator('.wc-sp-settings');
const anyPop = (page: Page) => page.locator('.wc-pop');
const overlay = (page: Page) => page.locator('.wc-overlay');
const tab = (page: Page, id: string) => page.locator(`.wc-ck-tab[data-tab="${id}"]`);
const page_ = (page: Page, id: string) => page.locator(`.wc-sp-page[data-page="${id}"]`);
const settings = (page: Page) => page.evaluate(() => window.__wc!.settings.get());

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

test('the icon, #settings, X and Esc open and close it above the Settings icon', async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await icon(page, 'settings').click();
  await expect(pop(page)).toBeVisible();
  await expect(icon(page, 'settings')).toHaveClass(/is-open/);
  // It takes the keys when it opens, on its selected tab (ADR 0108).
  await expect(tab(page, 'appearance')).toBeFocused();
  // Above the icon, its right edge at most at the bar's end.
  const p = (await pop(page).boundingBox())!;
  const i = (await icon(page, 'settings').boundingBox())!;
  const b = (await page.locator('.wc-mb-bar').boundingBox())!;
  expect(p.y + p.height).toBeLessThanOrEqual(b.y);
  expect(p.x).toBeLessThanOrEqual(i.x + 0.5);
  expect(p.x + p.width).toBeLessThanOrEqual(b.x + b.width + 0.5);
  // No tooltip on the icon while its popup is open.
  await icon(page, 'settings').hover();
  await page.waitForTimeout(500);
  await expect(page.locator('.wc-mb-tip')).toBeHidden();
  // The icon toggles.
  await icon(page, 'settings').click();
  await expect(anyPop(page)).toHaveCount(0);
  await expect(icon(page, 'settings')).not.toHaveClass(/is-open/);
  // #settings toggles.
  await command(page, '#settings');
  await expect(pop(page)).toBeVisible();
  await command(page, '#settings');
  await expect(anyPop(page)).toHaveCount(0);
  // The X closes; the input has the keys.
  await command(page, '#settings');
  await pop(page).locator('.wc-pop-x').click();
  await expect(anyPop(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  // The icon's close gives the keys back too.
  await icon(page, 'settings').click();
  await icon(page, 'settings').click();
  await expect(anyPop(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  // Esc inside it closes it and gives the keys back.
  await icon(page, 'settings').click();
  await pop(page).locator('.wc-pop-title').click();
  await page.keyboard.press('Escape');
  await expect(anyPop(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await expect(overlay(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('one popup at a time with Panes and Exit; #menu leaves it open', async ({ page }) => {
  await offline(page);
  await icon(page, 'panes').click();
  await expect(page.locator('.wc-pop-panes')).toBeVisible();
  await icon(page, 'settings').click();
  await expect(pop(page)).toBeVisible();
  await expect(page.locator('.wc-pop-panes')).toHaveCount(0);
  await expect(icon(page, 'panes')).not.toHaveClass(/is-open/);
  await icon(page, 'panes').click();
  await expect(page.locator('.wc-pop-panes')).toBeVisible();
  await expect(pop(page)).toHaveCount(0);
  await expect(icon(page, 'settings')).not.toHaveClass(/is-open/);
  await command(page, '#settings');
  await expect(pop(page)).toBeVisible();
  await command(page, '#exit');
  await expect(page.locator('.wc-pop-exit')).toBeVisible();
  await expect(pop(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(anyPop(page)).toHaveCount(0);
  // #menu only prints its hint (ADR 0112): no ESC menu to close it.
  await icon(page, 'settings').click();
  await command(page, '#menu');
  await expect(page.locator('.wc-output .wc-row', { hasText: 'The ESC menu is gone' })).toHaveCount(1);
  await expect(pop(page)).toBeVisible();
  await expect(overlay(page)).toHaveCount(0);
});

test('Esc in the input: the popup first, then the window, then nothing', async ({ page }) => {
  await offline(page);
  await icon(page, 'scripts').click();
  await expect(page.locator('.wc-win[data-win="scripts"]')).toBeVisible();
  // A click in the output gives the keys back to the game.
  await page.locator('.wc-output').click({ position: { x: 20, y: 20 } });
  await expect(field(page)).toBeFocused();
  await icon(page, 'settings').click();
  await expect(pop(page)).toBeVisible();
  // The popup has the keys; a click in the game gives them back, and Esc in the input closes it first.
  await page.locator('.wc-output').click({ position: { x: 20, y: 20 } });
  await expect(field(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(anyPop(page)).toHaveCount(0);
  await expect(page.locator('.wc-win[data-win="scripts"]')).toBeVisible();
  await expect(overlay(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(overlay(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
});

test('it takes the keys when it opens and after a click in it; a click in the game gives them back', async ({ page }) => {
  await offline(page);
  await field(page).fill('look');
  await icon(page, 'settings').click();
  await expect(tab(page, 'appearance')).toBeFocused();
  // It has the keys: typing goes nowhere near the input.
  await page.keyboard.type('xy');
  await expect(field(page)).toHaveValue('look');
  await tab(page, 'input').click();
  await expect(page_(page, 'input')).toBeVisible();
  // The press kept the keys.
  await page.keyboard.type('xy');
  await expect(field(page)).toHaveValue('look');
  // ←→ move between the tabs from the keyboard.
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'mapper')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'input')).toHaveAttribute('aria-selected', 'true');
  // A click in the game text gives the keys back and leaves it open.
  await page.locator('.wc-output').click({ position: { x: 20, y: 20 } });
  await expect(field(page)).toBeFocused();
  await expect(pop(page)).toBeVisible();
  await page.keyboard.type(' x');
  await expect(field(page)).toHaveValue('look x');
});

test('switching tabs does not move or resize it', async ({ page }) => {
  await offline(page);
  await icon(page, 'settings').click();
  const boxes = [];
  for (const t of ['appearance', 'input', 'mapper', 'weather', 'appearance']) {
    await tab(page, t).click();
    await expect(page_(page, t)).toBeVisible();
    boxes.push(await pop(page).boundingBox());
  }
  for (const b of boxes) expect(b).toEqual(boxes[0]);
  // Choosing a palette colour (its hex field shows) does not move it either.
  await page.locator('.wc-ck-pc[data-index="3"]').click();
  await expect(page.locator('.wc-sp-hexrow')).not.toHaveClass(/is-off/);
  expect(await pop(page).boundingBox()).toEqual(boxes[0]);
});

test('changes go to the settings store at once', async ({ page }) => {
  const errors = watchErrors(page);
  // The browser's colour picker is a native window that takes the keys; count its openings instead.
  await page.addInitScript(() => {
    (window as unknown as { pickerOpened: number }).pickerOpened = 0;
    HTMLInputElement.prototype.showPicker = function () {
      (window as unknown as { pickerOpened: number }).pickerOpened++;
    };
  });
  await offline(page);
  await icon(page, 'settings').click();
  await tab(page, 'appearance').click();
  const size0 = (await settings(page)).appearance.size;
  // The Size slider from the keyboard, after a click on it.
  const size = page.locator('.wc-ck-rng[aria-label="Size"]');
  await size.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await settings(page)).appearance.size).toBe(size0 + 1);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-size'))).not.toBe('');
  // A drag on it: the popup keeps its scale while held.
  const fs0 = await pop(page).evaluate((el) => getComputedStyle(el).fontSize);
  const r = (await size.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.9, r.y + r.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await settings(page)).appearance.size).toBeGreaterThan(size0 + 10);
  expect(await pop(page).evaluate((el) => getComputedStyle(el).fontSize)).toBe(fs0);
  await page.mouse.up();
  await expect.poll(() => pop(page).evaluate((el) => getComputedStyle(el).fontSize)).not.toBe(fs0);
  // Back to the size it had, by keyboard (Home is the minimum).
  await size.focus();
  for (let i = 0; i < 40 && (await settings(page)).appearance.size > size0; i++) await page.keyboard.press('ArrowLeft');
  expect((await settings(page)).appearance.size).toBe(size0);
  // A toggle.
  const bold0 = (await settings(page)).appearance.boldBright;
  await page.locator('.wc-ck-tg[aria-label="Bold brightens colours"]').click();
  expect((await settings(page)).appearance.boldBright).toBe(!bold0);
  // A dropdown: the paper background brings its font colour.
  await page.locator('.wc-ck-dd[aria-label="Background"]').click();
  await page.locator('.wc-ck-list .wc-ck-opt', { hasText: 'Paper' }).click();
  await expect.poll(async () => (await settings(page)).appearance.bg).toBe('#f4ecd8');
  expect((await settings(page)).appearance.fg).toBe('#000000');
  // By keyboard: Enter opens, ↑ moves, Enter picks; Esc closes the list only.
  await page.locator('.wc-ck-dd[aria-label="Background"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-ck-list')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-ck-list')).toHaveCount(0);
  await expect(pop(page)).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await settings(page)).appearance.bg).toBe('#000000');
  // A palette colour: a click chooses it and puts the keys in its hex field;
  // the browser's picker opens only from the Picker button (its input applies live).
  await page.locator('.wc-ck-pc[data-index="1"]').click();
  await expect(page.locator('.wc-ck-hex')).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { pickerOpened: number }).pickerOpened)).toBe(0);
  await page.keyboard.type('#a0b0c0');
  await expect.poll(async () => (await settings(page)).appearance.ansi[1]).toBe('#a0b0c0');
  await page.locator('.wc-sp-pick').click();
  expect(await page.evaluate(() => (window as unknown as { pickerOpened: number }).pickerOpened)).toBe(1);
  await page.locator('.wc-sp-picker').evaluate((el: HTMLInputElement) => {
    el.value = '#abcdef';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(async () => (await settings(page)).appearance.ansi[1]).toBe('#abcdef');
  const hex = page.locator('.wc-ck-hex');
  await expect(hex).toHaveValue('#abcdef');
  await hex.fill('#123456');
  await expect.poll(async () => (await settings(page)).appearance.ansi[1]).toBe('#123456');
  await hex.fill('zz');
  await page.keyboard.press('Enter');
  await expect(hex).toHaveClass(/is-bad/);
  expect((await settings(page)).appearance.ansi[1]).toBe('#123456');
  await page.locator('.wc-sp-resetpal').click();
  await expect.poll(async () => (await settings(page)).appearance.ansi[1]).toBe('#800000');
  // Text input: the segmented cursor style.
  await tab(page, 'input').click();
  await page.locator('.wc-ck-sg[data-value="underline"]').click();
  expect((await settings(page)).appearance.cursorStyle).toBe('underline');
  // Mapper: room notes.
  await tab(page, 'mapper').click();
  const notes0 = (await settings(page)).mapper.notes;
  await page.locator('.wc-ck-tg[aria-label="Room notes"]').click();
  expect((await settings(page)).mapper.notes).toBe(!notes0);
  await expect(page.locator('.wc-sp-mapfile')).toContainText('(bundled)');
  // Weather: the master switch dims the rest.
  await tab(page, 'weather').click();
  const on0 = (await settings(page)).weather.enabled;
  await page.locator('.wc-ck-tg[aria-label="Weather effects"]').click();
  expect((await settings(page)).weather.enabled).toBe(!on0);
  await expect(page.locator('.wc-sp-wx-fog')).toHaveClass(on0 ? /is-dim/ : /^(?!.*is-dim)/);
  expect(errors).toEqual([]);
});
