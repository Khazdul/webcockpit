// Stage 2 package C: start page, profiles, Options, ESC menu and the page
// flow, against a mocked MUME WebSocket (nothing reaches the real server).
import { type Page, type WebSocketRoute, expect, test } from '@playwright/test';

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
const startSel = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-mrow.is-sel');
const menuSel = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow.is-sel');
const startTitle = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-title-row .wc-c-section');
const startFlash = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-flash');
const settings = (page: Page) => page.evaluate(() => window.__wc!.settings.get());

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openStart(page: Page): Promise<Mock> {
  const mock = await mockMume(page);
  await page.goto('/');
  await expect(startSel(page)).toHaveText('<< Enter MUME >>');
  return mock;
}

async function enterMume(page: Page): Promise<Mock> {
  const mock = await openStart(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  return mock;
}

test('start page: banner, menu and quote; no connection until Enter MUME', async ({ page }) => {
  const errors = watchErrors(page);
  const mock = await openStart(page);
  await expect(start(page)).toBeVisible();
  await expect(page.locator('.wc-start .wc-banner .wc-line')).toHaveCount(11);
  await expect(page.locator('.wc-start .wc-banner [data-star]')).toHaveCount(13);
  const rows = page.locator('.wc-start .wc-frame:not([hidden]) .wc-mrow');
  await expect(rows).toHaveText([
    '<< Enter MUME >>',
    '   Profile   ',
    '   Scripts   ',
    '   Options   ',
    '   History   ',
    '   Spotlights   ',
    '   Credits   ',
    '   About   ',
  ]);
  await expect(page.locator('.wc-start .wc-c-quote-attr')).toHaveText(/^— /);
  await expect(page.locator('.wc-start .wc-footer')).toHaveText('↑↓ Navigate · Enter/Space Select');
  // Rows sit on whole cells.
  const cellH = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h')));
  const h = await rows.first().evaluate((el) => el.parentElement!.getBoundingClientRect().height);
  expect(h).toBe(cellH);
  expect(mock.opened()).toBe(0);
  await expect(page.locator('.wc-app')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('stars twinkle only while the start page shows', async ({ page }) => {
  await openStart(page);
  // Speed time up: the twinkle is driven by performance.now().
  const looks = await page.evaluate(async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      document.querySelectorAll('.wc-start [data-star]').forEach((el) => seen.add(el.className + el.textContent));
      await new Promise((r) => setTimeout(r, 100));
    }
    return seen.size;
  });
  expect(looks).toBeGreaterThan(3);
});

test('keyboard navigation, Credits, About and ESC', async ({ page }) => {
  await openStart(page);
  await page.keyboard.press('ArrowUp');
  await expect(startSel(page)).toHaveText('<< About >>');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  // No runs stored: the Credits empty state; any key returns.
  await expect(startTitle(page)).toHaveText('─── Credits ───');
  await page.keyboard.press('Enter');
  await expect(startSel(page)).toHaveText('<< Credits >>');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(startTitle(page)).toHaveText('─── About ───');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-title-row')).toContainText(/─── About ─── \d+\.\d+\.\d+/);
  await page.keyboard.press('Escape');
  await expect(startSel(page)).toHaveText('<< About >>');
  // ESC on the main page does nothing.
  await page.keyboard.press('Escape');
  await expect(startSel(page)).toHaveText('<< About >>');
  // Hover lightens without moving the cursor; clicking selects and activates.
  await page.locator('.wc-start .wc-mrow[data-key="options"]').hover();
  await expect(startSel(page)).toHaveText('<< About >>');
  await page.locator('.wc-start .wc-mrow[data-key="options"] .wc-label').click();
  await expect(startTitle(page)).toHaveText('─── Options ───');
});

test('Enter MUME shows the cockpit and connects; ESC opens and closes the menu', async ({ page }) => {
  const mock = await enterMume(page);
  expect(mock.opened()).toBe(1);
  await expect(start(page)).toBeHidden();
  const field = page.locator('.wc-input-field');
  await expect(field).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeVisible();
  await expect(menuSel(page)).toHaveText('<< Continue >>');
  await expect(page.locator('.wc-overlay .wc-esc-header')).toContainText('Profile: default');
  await expect(page.locator('.wc-overlay .wc-esc-header')).toContainText('Link:');
  // Keys go to the menu, not the game input.
  await page.keyboard.press('ArrowDown');
  await expect(menuSel(page)).toHaveText('<< Reconnect >>');
  await page.keyboard.type('xyz');
  await expect(field).toHaveValue('');
  // Clicking outside the box keeps focus in the menu.
  await page.mouse.click(5, 5);
  await page.keyboard.press('ArrowUp');
  await expect(menuSel(page)).toHaveText('<< Continue >>');

  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeHidden();
  await expect(field).toBeFocused();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter'); // Continue
  await expect(overlay(page)).toBeHidden();
  await expect(field).toBeFocused();
});

test('the menu opens by itself on a disconnect, with Reconnect selected', async ({ page }) => {
  const mock = await enterMume(page);
  await mock.server()!.close();
  await expect(overlay(page)).toBeVisible();
  await expect(menuSel(page)).toHaveText('<< Reconnect >>');
  await expect(page.locator('.wc-overlay .wc-mrow[data-key="continue"]')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(overlay(page)).toBeHidden();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  expect(mock.opened()).toBe(2);
  // A user disconnect does not open it.
  await page.locator('.wc-input-field').fill('#disconnect');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await page.waitForTimeout(300);
  await expect(overlay(page)).toBeHidden();
});

test('no auto-open when the first connection never reaches login', async ({ page }) => {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    void ws.close();
  });
  await page.goto('/');
  await expect(startSel(page)).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await page.waitForTimeout(300);
  await expect(overlay(page)).toHaveCount(0);
});

test('Exit session returns to the start page and closes the connection', async ({ page }) => {
  const mock = await enterMume(page);
  let closed = false;
  mock.server()!.onClose(() => (closed = true));
  await page.keyboard.press('Escape');
  await page.keyboard.press('End');
  await expect(menuSel(page)).toHaveText('<< Exit session >>');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-title-row')).toHaveText('─── Exit session ───');
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-body .wc-c-err')).toHaveText('Attention! This terminates the current session.');
  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('<< Exit session >>');
  await page.keyboard.press('Enter');
  await page.keyboard.press('y');
  await expect(start(page)).toBeVisible();
  await expect(startSel(page)).toHaveText('<< Enter MUME >>');
  await expect(page.locator('.wc-app')).toBeHidden();
  await expect(overlay(page)).toBeHidden();
  await expect.poll(() => closed).toBe(true);
  // And back in again.
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
});

test('Options → Panes toggles panes and borders live', async ({ page }) => {
  await openStart(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // Panes
  await expect(startTitle(page)).toHaveText('─── Panes ───');
  await page.keyboard.press('Enter'); // General
  await expect(startTitle(page)).toHaveText('─── General ───');
  // Character is on with None: Enter on its checked cell turns it off.
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await settings(page)).panes.character.on).toBe(false);
  // Timers → Blue.
  await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await settings(page)).panes.timers).toEqual({ on: true, color: 'blue', border: true });
  // Border column by mouse.
  await page.locator('.wc-start .wc-check[title="Comm: border"]').click();
  await expect.poll(async () => (await settings(page)).panes.comm.border).toBe(false);
  // No corner style row: the frames are always quadrant.
  await expect(page.locator('.wc-start')).not.toContainText('Corner style');
  // Reset layout (the click moved the cursor to Comm; UI, Map, then Reset).
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      d.layout.docks.right.size = 40;
      d.layout.docks.right.panes = d.layout.docks.right.panes.filter((p) => p.id !== 'comm');
      d.layout.floating = [{ id: 'comm', x: 5, y: 5, w: 30, h: 10 }];
    }),
  );
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(startSel(page)).toHaveText('<< Reset layout >>');
  await page.keyboard.press('Enter');
  await expect(startFlash(page)).toHaveText('Layout reset.');
  await expect.poll(async () => (await settings(page)).layout.docks.right.size).toBe(33);
  // Every side pane docked in the right column again; the map floats (off).
  expect((await settings(page)).layout.floating.map((f) => f.id)).toEqual(['map']);
  expect((await settings(page)).layout.docks.right.panes.map((p) => p.id)).toEqual(['character', 'timers', 'group', 'comm', 'ui']);
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('Options → Appearance changes the font size live, also from the ESC menu', async ({ page }) => {
  await enterMume(page);
  const fontSize = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-size'));
  const before = await fontSize();
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // past Mapper
  await page.keyboard.press('Enter'); // Appearance
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-title-row')).toHaveText('─── Appearance ───');
  await page.keyboard.press('ArrowDown');
  await expect(menuSel(page)).toHaveText('<< Size: 15 >>');
  // Enter is inert on a stepper.
  await page.keyboard.press('Enter');
  await expect(menuSel(page)).toHaveText('<< Size: 15 >>');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(menuSel(page)).toHaveText('<< Size: 20 >>');
  await expect.poll(fontSize).not.toBe(before);
  expect((await settings(page)).appearance.size).toBe(20);
  // Background cycler, live.
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  await expect(menuSel(page)).toHaveText('<< Background: black >>');
  await page.keyboard.press('Enter');
  await expect(menuSel(page)).toHaveText('<< Background: red >>');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--term-bg')))
    .toBe('#1a0e0e');
  // ANSI palette (past Input color and Scrollback): edit colour 9.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-title-row')).toHaveText('─── ANSI 9: bright red ───');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('#abc');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await settings(page)).appearance.ansi[9]).toBe('#aabbcc');
  // Reset appearance.
  await page.locator('.wc-overlay .wc-mrow[data-key="reset"] .wc-label').click();
  await expect.poll(async () => (await settings(page)).appearance.size).toBe(15);
  await expect.poll(fontSize).toBe(before);
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('profiles: create, rename, delete, export and import', async ({ page }) => {
  await openStart(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(startTitle(page)).toHaveText('─── Profile ───');
  const table = page.locator('.wc-start .wc-frame:not([hidden]) .wc-table');
  await expect(table.locator('.wc-tr.is-cur-focus')).toContainText('default');
  await expect(page.locator('.wc-start [data-btn="SELECT"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.wc-start [data-btn="EDIT"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.wc-start [data-btn="DELETE"]')).toHaveAttribute('aria-disabled', 'true');

  // NEW: invalid name, then a good one, then Blank.
  await page.keyboard.press('Tab');
  await expect(page.locator('.wc-start .wc-btn.is-sel-focus')).toHaveText(/NEW/);
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
  await expect(startFlash(page)).toHaveText('Created "ranger".');
  await expect.poll(async () => (await settings(page)).profile).toBe('ranger');
  await expect(table.locator('.wc-tr.is-cur-focus')).toContainText('ranger');
  await expect(table.locator('.wc-tr.is-cur-focus')).toContainText('✓');

  // RENAME.
  await page.locator('.wc-start [data-btn="RENAME"]').click();
  await expect(startTitle(page)).toHaveText('─── Rename Profile ───');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('hunter');
  await page.keyboard.press('Enter');
  await expect(startFlash(page)).toHaveText('Renamed to "hunter".');
  await expect.poll(async () => (await settings(page)).profile).toBe('hunter');
  await expect(table).not.toContainText('ranger');

  // EXPORT.
  const download = page.waitForEvent('download');
  await page.locator('.wc-start [data-btn="EXPORT"]').click();
  expect((await download).suggestedFilename()).toBe('hunter.tin');
  await expect(startFlash(page)).toHaveText('Exported hunter.tin.');

  // DELETE: any other key cancels, y deletes.
  await page.locator('.wc-start [data-btn="DELETE"]').click();
  await expect(page.locator('.wc-start .wc-frame:not([hidden])')).toContainText("Delete profile 'hunter'?  (y/N)");
  await page.keyboard.press('x');
  await expect(startTitle(page)).toHaveText('─── Profile ───');
  await page.locator('.wc-start [data-btn="DELETE"]').click();
  await page.keyboard.press('y');
  await expect(startFlash(page)).toHaveText('Deleted "hunter".');
  await expect.poll(async () => (await settings(page)).profile).toBe('default');
  await expect(table).not.toContainText('hunter');

  // IMPORT: name from the file, _2 on a collision, becomes selected.
  for (const expected of ['My_Warrior', 'My_Warrior_2']) {
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.wc-start [data-btn="IMPORT"]').click();
    await (await chooser).setFiles({
      name: 'My Warrior.tin',
      mimeType: 'text/plain',
      buffer: Buffer.from('#alias {k} {kill %1}\n'),
    });
    await expect(startFlash(page)).toHaveText(`Imported "${expected}" from My Warrior.tin.`);
    await expect.poll(async () => (await settings(page)).profile).toBe(expected);
  }
  const text = await page.evaluate(() => window.__wc!.shell.profiles.get('My_Warrior').then((r) => r?.text));
  expect(text).toBe('#alias {k} {kill %1}\n');

  // SELECT by keyboard in the table, then the ESC header shows it.
  await page.keyboard.press('Home');
  await expect(table.locator('.wc-tr.is-cur-focus')).toContainText('default');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await settings(page)).profile).toBe('default');
});

test('the selected profile shows in the ESC menu header', async ({ page }) => {
  await openStart(page);
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.create('scout', '');
    window.__wc!.settings.update({ profile: 'scout' });
  });
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay .wc-esc-header')).toContainText('Profile: scout');
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
  await expect(startSel(page)).toHaveText('<< Enter MUME >>');
});

test('offline modes skip the start page and still have the ESC menu', async ({ page }) => {
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(start(page)).toHaveCount(0);
  await expect(page.locator('.wc-input-field')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeVisible();
  await expect(menuSel(page)).toHaveText('<< Reconnect >>');
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeHidden();
  await expect(page.locator('.wc-input-field')).toBeFocused();
});
