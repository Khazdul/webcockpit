// Stage 2 package C: start page, profiles, Options and the page flow,
// against a mocked MUME WebSocket (nothing reaches the real server). The
// ESC menu is the phone's since stage 30f (ADR 0112):
// tests/e2e/phone-esc-menu.spec.ts. Options left the start page in stage
// 32: its frames are tested in the phone's ESC menu (tests/e2e/esc-options.ts).
import { type Page, type WebSocketRoute, expect, test } from '@playwright/test';
import { menuFlash, menuFrame, menuSel, menuTitle, openEscOptions } from './esc-options';
import { lookBox } from './look';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

interface Mock {
  server: () => WebSocketRoute | null;
  opened: () => number;
}

async function mockMume(page: Page): Promise<Mock> {
  let server: WebSocketRoute | null = null;
  let opened = 0;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    opened++;
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  return { server: () => server, opened: () => opened };
}

const start = (page: Page) => page.locator('.wc-start');
const overlay = (page: Page) => page.locator('.wc-overlay');
const startSel = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm-item.is-sel .wc-sm-label');
const startRow = (page: Page, key: string) => page.locator(`.wc-start .wc-sm-item[data-key="${key}"]`);
/** The Profile list (the new look, ADR 0125). */
const plist = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-pl');
const plCursor = (page: Page) => plist(page).locator('.wc-pl-row.is-on');
const plFlash = (page: Page) => plist(page).locator('.wc-lk-flash');
const startTitle = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-title-row .wc-c-section');
const settings = (page: Page) => page.evaluate(() => window.__wc!.settings.get());

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openStart(page: Page): Promise<Mock> {
  const mock = await mockMume(page);
  await page.goto('/');
  await expect(startSel(page)).toHaveText('Enter MUME');
  return mock;
}

async function enterMume(page: Page): Promise<Mock> {
  const mock = await openStart(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  return mock;
}

test('start page: wordmark, menu, quote and almanac over the sky; no connection until Enter MUME', async ({ page }) => {
  const errors = watchErrors(page);
  const mock = await openStart(page);
  await expect(start(page)).toBeVisible();
  await expect(page.locator('.wc-start .wc-start-skyhost')).toHaveCount(1);
  await expect(page.locator('.wc-start .wc-start-brand .wc-wordmark')).toBeVisible();
  // No pixel banner and no key-hint row (stage 41).
  await expect(page.locator('.wc-start .wc-banner')).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-footer')).toHaveCount(0);
  const rows = page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm-item .wc-sm-label');
  // Stage 32: no Options; Scripts under Profile; Profile carries the profile's name.
  await expect(rows).toHaveText(['Enter MUME', 'Profile', 'Scripts', 'History', 'Spotlights', 'Credits', 'About']);
  await expect(startRow(page, 'profile').locator('.wc-sm-note')).toHaveText('(default)');
  await expect(page.locator('.wc-start .wc-sm-item u.wc-sk')).toHaveText(['E', 'P', 'S', 'H', 'l', 'C', 'A']);
  await expect(page.locator('.wc-start .wc-sm-quote cite')).not.toBeEmpty();
  await expect(page.locator('.wc-start .wc-start-almanac')).toContainText(/, the \d+(st|nd|rd|th) of /);
  await expect(page.locator('.wc-start .wc-start-almanac')).toContainText(/\d+:\d\d(am|pm) · (dawn|day|dusk|night) · T\.A\. \d+/);
  await expect(page.locator('.wc-start .wc-start-almanac')).toContainText(/WebCockpit \d+\.\d+\.\d+/);
  // The panel sits under the wordmark, the quote under the panel.
  const brand = await page.locator('.wc-start .wc-start-brand').boundingBox();
  const panel = await page.locator('.wc-start .wc-sm-panel').boundingBox();
  const quote = await page.locator('.wc-start .wc-sm-quote').boundingBox();
  expect(panel!.y).toBeGreaterThanOrEqual(brand!.y + brand!.height);
  expect(quote!.y).toBeGreaterThan(panel!.y + panel!.height);
  expect(mock.opened()).toBe(0);
  await expect(page.locator('.wc-app')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the almanac follows the game clock, a minute a second', async ({ page }) => {
  await openStart(page);
  const time = page.locator('.wc-start .wc-alm-m');
  const t0 = await time.textContent();
  await expect.poll(() => time.textContent(), { timeout: 4000 }).not.toBe(t0);
});

/** The wordmark sheen's animations, as `playState/iterations`. */
const sheenAnims = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest('[data-wcw="sheen-band"]'))
      .map((a) => `${a.playState}/${a.effect!.getComputedTiming().iterations}`),
  );

test('the wordmark sheen passes once in a while and rests in between', async ({ page }) => {
  await openStart(page);
  // ADR 0126 addendum: one finite pass a few seconds after the page shows, no running animation otherwise.
  expect(await sheenAnims(page)).toEqual([]);
  await expect.poll(() => sheenAnims(page), { timeout: 10_000, intervals: [200] }).toEqual(['running/1']);
  await expect.poll(() => sheenAnims(page), { timeout: 10_000, intervals: [200] }).toEqual([]);
  await page.waitForTimeout(1500);
  expect(await sheenAnims(page)).toEqual([]);
});

test('a sheen pass running on Enter MUME stops with the leaving page', async ({ page }) => {
  await openStart(page);
  await expect.poll(() => sheenAnims(page), { timeout: 10_000, intervals: [200] }).toEqual(['running/1']);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-start.is-leaving')).toHaveCount(1);
  await expect.poll(() => sheenAnims(page), { timeout: 1000, intervals: [100] }).toEqual([]);
});

test('keyboard navigation, Credits, About and ESC', async ({ page }) => {
  await openStart(page);
  await page.keyboard.press('ArrowUp');
  await expect(startSel(page)).toHaveText('About');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  // No runs stored: the Credits book's no-data page (stage 47); other keys stay, Esc returns.
  await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('Credits');
  await expect(lookBox(page).locator('.wc-cred-book')).toHaveAttribute('data-state', 'no_data');
  await page.keyboard.press('Enter');
  await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('Credits');
  await page.keyboard.press('Escape');
  await expect(startSel(page)).toHaveText('Credits');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  // About: the leaf with the version at its head (stage 47).
  await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('About');
  await expect(lookBox(page).locator('.wc-about-ver')).toHaveText(/^WebCockpit \d+\.\d+\.\d+/);
  await page.keyboard.press('Escape');
  await expect(startSel(page)).toHaveText('About');
  // ESC on the main page does nothing.
  await page.keyboard.press('Escape');
  await expect(startSel(page)).toHaveText('About');
  // A letter goes straight to its row.
  await page.keyboard.press('c');
  await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('Credits');
  await page.keyboard.press('Escape');
  await expect(startSel(page)).toHaveText('Credits');
  // Hover selects; clicking selects and activates.
  await startRow(page, 'history').hover();
  await expect(startSel(page)).toHaveText('History');
  await startRow(page, 'scripts').click();
  await expect(startTitle(page)).toHaveText('─── Scripts ───');
});

test('Enter MUME shows the cockpit and connects; Esc opens the Exit popup, no menu (ADR 0112)', async ({ page }) => {
  const mock = await enterMume(page);
  expect(mock.opened()).toBe(1);
  await expect(start(page)).toBeHidden({ timeout: 10_000 });
  const field = page.locator('.wc-input-field');
  await expect(field).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-pop-exit')).toBeVisible();
  await expect(overlay(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-pop')).toHaveCount(0);
  // The keys stay with the game input.
  await expect(field).toBeFocused();
  await page.keyboard.type('xyz');
  await expect(field).toHaveValue('xyz');
});

test('a disconnect shows the Disconnected notice and opens no menu (ADR 0100, 0112); Enter or its button reconnects', async ({ page }) => {
  const mock = await enterMume(page);
  const notice = page.locator('.wc-mb-disc');
  await expect(notice).toBeHidden();
  await mock.server()!.close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(notice).toBeVisible();
  await expect(notice).toHaveText('DisconnectedReconnect Enter');
  await page.waitForTimeout(300);
  await expect(overlay(page)).toHaveCount(0);
  // Enter in the input reconnects (spec §2.2).
  await expect(page.locator('.wc-input-field')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(notice).toBeHidden();
  expect(mock.opened()).toBe(2);
  // A user disconnect shows it too (ADR 0100); its button reconnects.
  await page.locator('.wc-input-field').fill('#disconnect');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(notice).toBeVisible();
  await expect(overlay(page)).toHaveCount(0);
  await page.locator('.wc-mb-rc').click();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(notice).toBeHidden();
  await expect(page.locator('.wc-input-field')).toBeFocused();
  expect(mock.opened()).toBe(3);
});

test('no auto-open when the first connection never reaches login', async ({ page }) => {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    void ws.close();
  });
  await page.goto('/');
  await expect(startSel(page)).toHaveText('Enter MUME');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await page.waitForTimeout(300);
  await expect(overlay(page)).toHaveCount(0);
});

test('Exit returns to the start page and closes the connection; Enter MUME again', async ({ page }) => {
  const mock = await enterMume(page);
  let closed = false;
  mock.server()!.onClose(() => (closed = true));
  // The bar's Exit popup (ADR 0099); the phone's Exit session: phone-esc-menu.spec.ts.
  await page.locator('.wc-mb[data-mb="exit"]').click();
  await expect(page.locator('.wc-pop-exit')).toBeFocused();
  await page.keyboard.press('y');
  await expect(start(page)).toBeVisible();
  await expect(startSel(page)).toHaveText('Enter MUME');
  await expect(page.locator('.wc-app')).toBeHidden();
  await expect(overlay(page)).toBeHidden();
  await expect.poll(() => closed).toBe(true);
  // And back in again.
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
});

test('Options → Panes in the phone\'s ESC menu: the pane grid toggles panes and borders live', async ({ page }) => {
  // Desktop and tablet have no pane grid: the Panes popup and the pane
  // buttons hold it (ADR 0107; the hub's rows there: tests/unit/chrome-mapper).
  // The phone keeps it, in the ESC menu's Options.
  await openEscOptions(page);
  await page.keyboard.press('Enter'); // Panes
  await expect(menuTitle(page)).toHaveText('─── Panes ───');
  await expect(menuFrame(page).locator('.wc-mrow .wc-label')).toHaveText(['Appearance', 'Timers', 'Communication', 'Group', 'Back']);
  await page.keyboard.press('Enter'); // Appearance
  await expect(menuTitle(page)).toHaveText('─── Pane appearance ───');
  // The untinted column is "Plain", explained under the grid (stage 25 round 2).
  await expect(menuFrame(page)).toContainText('Plain  Red');
  await expect(menuFrame(page).locator('.wc-panes-hint')).toHaveText('Plain: the main window background.');
  await expect(menuFrame(page).locator('.wc-check[title="Character: Plain"]')).toHaveCount(1);
  // Character is on with Plain: Enter on its checked cell turns it off.
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await settings(page)).panes.character.on).toBe(false);
  // Timers → Blue.
  await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await settings(page)).panes.timers).toEqual({ on: true, color: 'blue', border: true, glass: true });
  // Border column by mouse.
  await menuFrame(page).locator('.wc-check[title="Comm: border"]').click();
  await expect.poll(async () => (await settings(page)).panes.comm.border).toBe(false);
  // No corner style row: the frames are always quadrant.
  await expect(menuFrame(page)).not.toContainText('Corner style');
  // Reset layout (the click moved the cursor to Comm; UI, Map, then Reset).
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const lane = d.layout.docks.right.lanes[0]!;
      lane.size = 40;
      // A second column and a spanning pane (ADR 0067) go too.
      const ui = lane.panes.filter((p) => p.id === 'ui');
      const group = lane.panes.filter((p) => p.id === 'group');
      lane.panes = lane.panes.filter((p) => p.id !== 'comm' && p.id !== 'ui' && p.id !== 'group');
      d.layout.docks.right.lanes.push({ size: 20, panes: ui });
      d.layout.docks.right.head = group;
      d.layout.floating = [{ id: 'comm', x: 5, y: 5, w: 30, h: 10 }];
    }),
  );
  await expect.poll(async () => (await settings(page)).layout.docks.right.head.map((p) => p.id)).toEqual(['group']);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(menuSel(page)).toHaveText('<< Reset layout >>');
  await page.keyboard.press('Enter');
  await expect(menuFlash(page)).toHaveText('Layout reset.');
  // The default layout (ADR 0078, ADR 0092): Character and the map over
  // Group | Timers, then Comm and UI; Map search and Statistics float (ADR 0109).
  await expect.poll(async () => (await settings(page)).layout.docks.right.lanes.map((l) => l.size)).toEqual([25, 25]);
  const right = (await settings(page)).layout.docks.right;
  expect(right.head.map((p) => p.id)).toEqual(['character', 'map']);
  expect(right.lanes.map((l) => l.panes.map((p) => p.id))).toEqual([['group'], ['timers']]);
  expect(right.tail.map((p) => p.id)).toEqual(['comm', 'ui']);
  expect((await settings(page)).layout.floating.map((f) => f.id)).toEqual(['mapsearch/main', 'statistics']);
  // Reset layout leaves the toggles alone: Character is still off.
  expect((await settings(page)).panes.character.on).toBe(false);
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('Options → Appearance changes the font size live', async ({ page }) => {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-app')).toBeVisible();
  const fontSize = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-size'));
  const before = await fontSize();
  await openEscOptions(page, { goto: false });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // past Mapper
  await page.keyboard.press('Enter'); // Appearance
  await expect(menuTitle(page)).toHaveText('─── Appearance ───');
  await page.keyboard.press('ArrowDown');
  await expect(menuSel(page)).toHaveText('<< Size: 15 >>');
  // Enter is inert on a stepper.
  await page.keyboard.press('Enter');
  await expect(menuSel(page)).toHaveText('<< Size: 15 >>');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(menuSel(page)).toHaveText('<< Size: 20 >>');
  await expect.poll(fontSize).not.toBe(before);
  expect((await settings(page)).appearance.size).toBe(20);
  // Background cycler, live (past Padding and Font color).
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(menuSel(page)).toHaveText('<< Background: black >>');
  await page.keyboard.press('Enter');
  await expect(menuSel(page)).toHaveText('<< Background: red >>');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--term-bg')))
    .toBe('#1a0e0e');
  // Paper (back past black, wrapping) picks ink and the paper palette too;
  // leaving it puts the defaults back.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(menuSel(page)).toHaveText('<< Background: paper >>');
  await expect.poll(async () => (await settings(page)).appearance.fg).toBe('#000000');
  expect((await settings(page)).appearance.ansi[7]).toBe('#4a4538');
  await page.keyboard.press('ArrowRight');
  await expect(menuSel(page)).toHaveText('<< Background: black >>');
  await expect.poll(async () => (await settings(page)).appearance.fg).toBe('#c0c0c0');
  expect((await settings(page)).appearance.ansi[7]).toBe('#c0c0c0');
  await page.keyboard.press('ArrowRight');
  // ANSI palette (past Input color, Bold brightens and Scrollback): edit colour 9.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(menuFrame(page).locator('.wc-title-row')).toHaveText('─── ANSI 9: bright red ───');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('#abc');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await settings(page)).appearance.ansi[9]).toBe('#aabbcc');
  // Reset appearance: the defaults of a new install (Hack, ADR 0078), the
  // phone's smaller size (14, ADR 0081).
  await menuFrame(page).locator('.wc-mrow[data-key="reset"] .wc-label').click();
  await expect.poll(async () => (await settings(page)).appearance.size).toBe(14);
  expect((await settings(page)).appearance.font).toBe('hack');
  await expect.poll(fontSize).not.toBe(before);
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('Options → Text input: auto-clear and autosuggest apply live (ADR 0063, 0066)', async ({ page }) => {
  await enterMume(page);
  const field = page.locator('.wc-input-field');
  const ghost = page.locator('.wc-input-ghost');
  await field.focus();
  await page.keyboard.type('kill orc the great');
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('kill orc the great');

  // In play: the Settings popup's Text input tab (ADR 0107); the start page's frame below.
  await page.locator('.wc-mb[data-mb="settings"]').click();
  await page.locator('.wc-ck-tab[data-tab="input"]').click();
  const toggle = (label: string) => page.locator(`.wc-sp-settings .wc-ck-tg[aria-label="${label}"]`);
  await expect(toggle('Auto-clear input')).toHaveAttribute('aria-checked', 'false');
  await toggle('Auto-clear input').click();
  await expect(toggle('Auto-clear input')).toHaveAttribute('aria-checked', 'true');
  await toggle('Autosuggest').click();
  await expect(toggle('Autosuggest')).toHaveAttribute('aria-checked', 'true');
  expect((await settings(page)).input).toEqual({ autoClear: true, autosuggest: true });
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-pop')).toHaveCount(0);
  await expect(field).toBeFocused();

  // Autosuggest: greyed after a space, Tab takes a word, Right the rest.
  await page.keyboard.press('Control+a');
  await page.keyboard.type('kill');
  await expect(ghost).toBeHidden();
  await page.keyboard.type(' ');
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveText('orc the great');
  // The ghost starts where the caret stands, right after the line.
  const xs = await page.evaluate(() => {
    const g = document.querySelector('.wc-input-ghost')!;
    const r = document.createRange();
    r.selectNodeContents(g);
    return [r.getClientRects()[0]!.left, document.querySelector('.wc-caret')!.getBoundingClientRect().left];
  });
  expect(Math.abs(xs[0]! - xs[1]!)).toBeLessThan(1);
  await page.keyboard.press('Tab');
  await expect(field).toHaveValue('kill orc');
  await expect(field).toBeFocused();
  await expect(ghost).toHaveText(' the great');
  await page.keyboard.press('ArrowRight');
  await expect(field).toHaveValue('kill orc the great');
  await expect(ghost).toBeHidden();
  // Auto-clear: Enter leaves the line empty; Up still recalls.
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('');
  await page.keyboard.press('ArrowUp');
  await expect(field).toHaveValue('kill orc the great');
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('Options → Text input: menu, keyboard and mouse toggles, persisted (ADR 0066)', async ({ page }) => {
  const errors = watchErrors(page);
  const sel = menuSel(page);
  const rows = menuFrame(page).locator('.wc-mrow .wc-label');
  const row = (k: string) => menuFrame(page).locator(`.wc-mrow[data-key="${k}"] .wc-label`);
  await openEscOptions(page);
  // The hub: Text input right after Appearance; the toggles are gone from it.
  await expect(rows).toHaveText(['Panes', 'Mapper', 'Appearance', 'Text input', 'Scripts', 'Weather effects', 'Back']);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(sel).toHaveText('<< Text input >>');
  await page.keyboard.press('Enter');
  await expect(menuTitle(page)).toHaveText('─── Text input ───');
  await expect(rows).toHaveText(['[ ] Auto-clear input', '[ ] Input autosuggest', 'Cursor style: beam', 'Cursor blink: On', 'Back']);

  // Keyboard: Enter and Space flip the toggles, ←→ cycle the cursor rows.
  await expect(sel).toHaveText('<< [ ] Auto-clear input >>');
  await page.keyboard.press('Enter');
  await expect(sel).toHaveText('<< [X] Auto-clear input >>');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press(' ');
  await expect(sel).toHaveText('<< [X] Input autosuggest >>');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(sel).toHaveText('<< Cursor style: underline >>');
  await page.keyboard.press('ArrowRight');
  await expect(sel).toHaveText('<< Cursor style: block >>');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(sel).toHaveText('<< Cursor blink: Off >>');
  let s = await settings(page);
  expect(s.input).toEqual({ autoClear: true, autosuggest: true });
  expect([s.appearance.cursorStyle, s.appearance.cursorBlink]).toEqual(['block', false]);

  // Mouse: a click on a toggle moves the cursor there and flips it.
  await row('autoclear').click();
  await expect(sel).toHaveText('<< [ ] Auto-clear input >>');

  // Persisted across a reload.
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-app')).toBeVisible();
  s = await settings(page);
  expect(s.input).toEqual({ autoClear: false, autosuggest: true });
  expect([s.appearance.cursorStyle, s.appearance.cursorBlink]).toEqual(['block', false]);

  // Back row and ESC both return to the hub with Text input selected.
  await openEscOptions(page, { goto: false });
  await row('textinput').click();
  await row('back').click();
  await expect(sel).toHaveText('<< Text input >>');
  await page.keyboard.press('Enter');
  await expect(menuTitle(page)).toHaveText('─── Text input ───');
  await page.keyboard.press('Escape');
  await expect(sel).toHaveText('<< Text input >>');

  // Appearance no longer lists the cursor rows.
  await row('appearance').click();
  await expect(menuTitle(page)).toHaveText('─── Appearance ───');
  const frame = menuFrame(page);
  await expect(frame.locator('.wc-mrow[data-key="font"]')).toBeVisible();
  for (const k of ['cursor', 'blink', 'autoclear', 'autosuggest']) await expect(frame.locator(`.wc-mrow[data-key="${k}"]`)).toHaveCount(0);
  await expect(frame).not.toContainText('Cursor');
  await page.evaluate(async () => {
    window.__wc!.settings.reset();
    await window.__wc!.settings.flush();
  });
  expect(errors).toEqual([]);
});

test('Options → Appearance: the bold orc in the preview follows "Bold brightens colours"', async ({ page }) => {
  await openEscOptions(page);
  await menuFrame(page).locator('.wc-mrow[data-key="appearance"] .wc-label').click();
  const orc = menuFrame(page).locator('.wc-preview .wc-preview-text.wc-bold');
  await expect(orc).toHaveText('*an Orc*');
  await expect(orc.locator('xpath=..')).toHaveText(/│ \*an Orc\*, wielding a scimitar, is standing here\. *│/);
  const colourOf = () => orc.evaluate((el) => getComputedStyle(el).color);
  const ansi = (i: number) =>
    page.evaluate((n) => {
      const probe = document.createElement('span');
      probe.style.color = `var(--ansi-${n})`;
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }, i);
  expect(await orc.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700');
  expect(await colourOf()).toBe(await ansi(1));
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      d.appearance.boldBright = true;
    }),
  );
  await expect.poll(colourOf).toBe(await ansi(9));
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('Options → Appearance: the preview ends with Elrond in palette yellow and fits at 800 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEscOptions(page);
  await menuFrame(page).locator('.wc-mrow[data-key="appearance"] .wc-label').click();
  const lines = menuFrame(page).locator('.wc-preview .wc-preview-text');
  const elrond = lines.last();
  await expect(elrond).toHaveText(/^ Elrond narrates 'The road goes ever on and on\.' *$/);
  const colourOf = () => elrond.evaluate((el) => getComputedStyle(el).color);
  const ansi3 = () =>
    page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ansi-3)';
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
  expect(await colourOf()).toBe(await ansi3());
  expect(await colourOf()).toBe('rgb(128, 128, 0)');
  // It follows the palette (themes set it too).
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      d.appearance.ansi[3] = '#aabb00';
    }),
  );
  await expect.poll(colourOf).toBe('rgb(170, 187, 0)');
  // The box keeps its width and the whole box is on screen.
  const box = menuFrame(page).locator('.wc-preview .wc-line');
  await expect(box.first()).toHaveText('┌' + '─'.repeat(52) + '┐');
  await expect(box.last()).toBeInViewport({ ratio: 1 });
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('profiles: create, rename, delete, export and import', async ({ page }) => {
  await openStart(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(plist(page).locator('.wc-lk-hood-t')).toHaveText('Profiles');
  await expect(plCursor(page)).toContainText('default');
  await expect(plCursor(page).locator('.wc-pl-tag')).toHaveText('Selected');
  // The highlighted row's buttons (no Select on the selected profile); the page's at the foot.
  await expect(plist(page).locator('.wc-pl-acts')).toHaveCount(1);
  await expect(plCursor(page).locator('[data-btn="SELECT"]')).toHaveCount(0);
  await expect(plCursor(page).locator('[data-btn="EDIT"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(plCursor(page).locator('[data-btn="DELETE"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(plist(page).locator('.wc-pl-btns .wc-lk-btn')).toHaveText([/New/, /Import/, /Export/]);

  // NEW: invalid name, then a good one, then Blank. Tab: the row's Edit, then New.
  await page.keyboard.press('Tab');
  await expect(plist(page).locator('.wc-lk-btn.is-sel')).toHaveText(/Edit/);
  await page.keyboard.press('Tab');
  await expect(plist(page).locator('.wc-lk-btn.is-sel')).toHaveText(/New/);
  await page.keyboard.press('Enter');
  await expect(startTitle(page)).toHaveText('─── Create New Profile ───');
  await page.keyboard.type('9lives');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-start .wc-c-danger')).toHaveText('The name must start with a letter.');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('ranger');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-start .wc-frame:not([hidden])')).toContainText('Name: ranger');
  await page.keyboard.press('b');
  await expect(plFlash(page)).toHaveText('Created "ranger".');
  await expect.poll(async () => (await settings(page)).profile).toBe('ranger');
  await expect(plCursor(page)).toContainText('ranger');
  await expect(plCursor(page).locator('.wc-pl-tag')).toHaveText('Selected');

  // RENAME (its letter).
  await page.keyboard.press('r');
  await expect(startTitle(page)).toHaveText('─── Rename Profile ───');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('hunter');
  await page.keyboard.press('Enter');
  await expect(plFlash(page)).toHaveText('Renamed to "hunter".');
  await expect.poll(async () => (await settings(page)).profile).toBe('hunter');
  await expect(plist(page)).not.toContainText('ranger');

  // EXPORT.
  const download = page.waitForEvent('download');
  await page.locator('.wc-start [data-btn="EXPORT"]').click();
  expect((await download).suggestedFilename()).toBe('hunter.tin');
  await expect(plFlash(page)).toHaveText('Exported hunter.tin.');

  // DELETE: any other key cancels, y deletes.
  await page.locator('.wc-start [data-btn="DELETE"]').click();
  await expect(page.locator('.wc-start .wc-frame:not([hidden])')).toContainText("Delete profile 'hunter'?  (y/N)");
  await page.keyboard.press('x');
  await expect(plist(page).locator('.wc-lk-hood-t')).toHaveText('Profiles');
  await page.locator('.wc-start [data-btn="DELETE"]').click();
  await page.keyboard.press('y');
  await expect(plFlash(page)).toHaveText('Deleted "hunter".');
  await expect.poll(async () => (await settings(page)).profile).toBe('default');
  await expect(plist(page)).not.toContainText('hunter');

  // IMPORT: name from the file, _2 on a collision, becomes selected; the
  // import page (stage 43c: Choose files… opens the picker, Enter too) and
  // the receipt come first.
  for (const expected of ['My_Warrior', 'My_Warrior_2']) {
    // (The listener first: Chromium's chooser interception is set up asynchronously.)
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.wc-start [data-btn="IMPORT"]').click();
    await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-hood-t:not(.is-out)')).toHaveText('Import');
    await page.keyboard.press('Enter');
    await (await chooser).setFiles({
      name: 'My Warrior.tin',
      mimeType: 'text/plain',
      buffer: Buffer.from('#alias {k} {kill %1}\n'),
    });
    // A native profile: the short receipt, then OK (ESC) back to the list.
    await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-imp-ok')).toContainText('nothing changed');
    await page.keyboard.press('Escape');
    await expect(plFlash(page)).toHaveText(`Imported "${expected}" from My Warrior.tin.`);
    await expect.poll(async () => (await settings(page)).profile).toBe(expected);
  }
  const text = await page.evaluate(() => window.__wc!.shell.profiles.get('My_Warrior').then((r) => r?.text));
  expect(text).toBe('#alias {k} {kill %1}\n');

  // SELECT by keyboard in the list.
  await page.keyboard.press('Home');
  await expect(plCursor(page)).toContainText('default');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await settings(page)).profile).toBe('default');
  // Back returns to the menu, Profile still chosen.
  await plist(page).locator('.wc-lk-back').click();
  await expect(startSel(page)).toHaveText('Profile');
});

test('profiles: Enter or a click on the selected profile edits it, on another selects it', async ({ page }) => {
  await openStart(page);
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.create('scout', '');
  });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(plist(page).locator('.wc-lk-hood-t')).toHaveText('Profiles');
  const row = (name: string) => plist(page).locator(`.wc-pl-row[data-name="${name}"]`);
  const editorTitle = page.locator('.wc-frame:not([hidden]) > .wc-ped .wc-ped-title .wc-c-section');
  await expect(plCursor(page)).toContainText('default');

  // Keyboard: Enter on the selected profile opens the editor, like Edit.
  await page.keyboard.press('Enter');
  await expect(editorTitle).toHaveText('─── Profile Editor: default ───');
  await page.keyboard.press('Escape');
  await expect(plist(page)).toBeVisible();

  // Enter on another profile selects it; a second Enter edits it.
  await page.keyboard.press('End');
  await expect(plCursor(page)).toContainText('scout');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await settings(page)).profile).toBe('scout');
  await expect(plist(page)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(editorTitle).toHaveText('─── Profile Editor: scout ───');
  await page.keyboard.press('Escape');
  await expect(plist(page)).toBeVisible();

  // Mouse: hover highlights; a click on the highlighted row (its name: the
  // buttons sit in its middle) selects it, the next edits it.
  await row('default').hover();
  await expect(plCursor(page)).toContainText('default');
  await row('default').locator('.wc-pl-n').click();
  await expect.poll(async () => (await settings(page)).profile).toBe('default');
  await expect(plist(page)).toBeVisible();
  await row('default').locator('.wc-pl-n').click();
  await expect(editorTitle).toHaveText('─── Profile Editor: default ───');
  await page.keyboard.press('Escape');
  await expect(plist(page)).toBeVisible();
  // The row's own buttons show on the hovered row only: Select there, then it goes.
  await row('scout').hover();
  await expect(row('default').locator('.wc-lk-btn')).toHaveCount(0);
  await row('scout').locator('[data-btn="SELECT"]').click();
  await expect.poll(async () => (await settings(page)).profile).toBe('scout');
  await expect(row('scout').locator('[data-btn="SELECT"]')).toHaveCount(0);
  await expect(row('scout').locator('.wc-pl-tag')).toHaveText('Selected');
  // Its Edit opens the editor.
  await row('scout').locator('[data-btn="EDIT"]').click();
  await expect(editorTitle).toHaveText('─── Profile Editor: scout ───');
  await page.keyboard.press('Escape');
  await expect(plist(page)).toBeVisible();
  // Esc returns to the menu.
  await page.keyboard.press('Escape');
  await expect(startSel(page)).toHaveText('Profile');
});

test('the selected profile shows in the bar\'s Profile tooltip', async ({ page }) => {
  await openStart(page);
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.create('scout', '');
    window.__wc!.settings.update({ profile: 'scout' });
  });
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.locator('.wc-mb[data-mb="profile"]').hover();
  await expect(page.locator('.wc-mb-tip')).toHaveText('Profile: scout');
});

test('too small a window shows a notice instead of the menu', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 200 });
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-start-too-small')).toContainText('Window too small');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await expect(page.locator('.wc-app')).toHaveCount(0);
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect(startSel(page)).toHaveText('Enter MUME');
});

test('offline modes skip the start page; the bar is there and Esc opens the Exit popup, no menu', async ({ page }) => {
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(start(page)).toHaveCount(0);
  await expect(page.locator('.wc-input-field')).toBeFocused();
  await expect(page.locator('.wc-mb-bar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-pop-exit')).toBeVisible();
  await expect(overlay(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-pop')).toHaveCount(0);
  await expect(page.locator('.wc-input-field')).toBeFocused();
});
