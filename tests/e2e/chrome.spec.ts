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
  await expect(startSel(page)).toHaveText('<< Reset layout >>');
  await page.keyboard.press('Enter');
  await expect(startFlash(page)).toHaveText('Layout reset.');
  // The default layout (ADR 0078): Character over Group | Timers, then Comm,
  // UI and the pane bar; the map and Map search float.
  await expect.poll(async () => (await settings(page)).layout.docks.right.lanes.map((l) => l.size)).toEqual([20, 20]);
  const right = (await settings(page)).layout.docks.right;
  expect(right.head.map((p) => p.id)).toEqual(['character']);
  expect(right.lanes.map((l) => l.panes.map((p) => p.id))).toEqual([['group'], ['timers']]);
  expect(right.tail.map((p) => p.id)).toEqual(['comm', 'ui', 'panebar/bar']);
  expect((await settings(page)).layout.floating.map((f) => f.id)).toEqual(['map', 'mapsearch/main']);
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
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-title-row')).toHaveText('─── ANSI 9: bright red ───');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('#abc');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await settings(page)).appearance.ansi[9]).toBe('#aabbcc');
  // Reset appearance: the defaults of a new install (Hack 17, ADR 0078).
  await page.locator('.wc-overlay .wc-mrow[data-key="reset"] .wc-label').click();
  await expect.poll(async () => (await settings(page)).appearance.size).toBe(17);
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

  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  const row = (k: string) => page.locator(`.wc-overlay .wc-frame:not([hidden]) .wc-mrow[data-key="${k}"] .wc-label`);
  await row('textinput').click();
  await expect(row('autoclear')).toHaveText('[ ] Auto-clear input');
  await row('autoclear').click();
  await expect(row('autoclear')).toHaveText('[X] Auto-clear input');
  await row('autosuggest').click();
  await expect(row('autosuggest')).toHaveText('[X] Input autosuggest');
  expect((await settings(page)).input).toEqual({ autoClear: true, autosuggest: true });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeHidden();
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
  await openStart(page);
  const sel = startSel(page);
  const rows = page.locator('.wc-start .wc-frame:not([hidden]) .wc-mrow .wc-label');
  const row = (k: string) => page.locator(`.wc-start .wc-frame:not([hidden]) .wc-mrow[data-key="${k}"] .wc-label`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(sel).toHaveText('<< Options >>');
  await page.keyboard.press('Enter');
  // The hub: Text input right after Appearance; the toggles are gone from it.
  await expect(rows).toHaveText(['Panes', 'Mapper', 'Appearance', 'Text input', 'Spotlights', 'Scripts', 'Back']);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(sel).toHaveText('<< Text input >>');
  await page.keyboard.press('Enter');
  await expect(startTitle(page)).toHaveText('─── Text input ───');
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
  await expect(startSel(page)).toHaveText('<< Enter MUME >>');
  s = await settings(page);
  expect(s.input).toEqual({ autoClear: false, autosuggest: true });
  expect([s.appearance.cursorStyle, s.appearance.cursorBlink]).toEqual(['block', false]);

  // Back row and ESC both return to the hub with Text input selected.
  await page.locator('.wc-start .wc-mrow[data-key="options"] .wc-label').click();
  await row('textinput').click();
  await row('back').click();
  await expect(sel).toHaveText('<< Text input >>');
  await page.keyboard.press('Enter');
  await expect(startTitle(page)).toHaveText('─── Text input ───');
  await page.keyboard.press('Escape');
  await expect(sel).toHaveText('<< Text input >>');

  // Appearance no longer lists the cursor rows.
  await row('appearance').click();
  await expect(startTitle(page)).toHaveText('─── Appearance ───');
  const frame = page.locator('.wc-start .wc-frame:not([hidden])');
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
  await openStart(page);
  await page.locator('.wc-start .wc-mrow[data-key="options"] .wc-label').click();
  await page.locator('.wc-start .wc-frame:not([hidden]) .wc-mrow[data-key="appearance"] .wc-label').click();
  const orc = page.locator('.wc-start .wc-frame:not([hidden]) .wc-preview .wc-preview-text.wc-bold');
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
  await openStart(page);
  await page.locator('.wc-start .wc-mrow[data-key="options"] .wc-label').click();
  await page.locator('.wc-start .wc-frame:not([hidden]) .wc-mrow[data-key="appearance"] .wc-label').click();
  const lines = page.locator('.wc-start .wc-frame:not([hidden]) .wc-preview .wc-preview-text');
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
  const box = page.locator('.wc-start .wc-frame:not([hidden]) .wc-preview .wc-line');
  await expect(box.first()).toHaveText('┌' + '─'.repeat(52) + '┐');
  await expect(box.last()).toBeInViewport({ ratio: 1 });
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

  // IMPORT: name from the file, _2 on a collision, becomes selected; the
  // report frame (stage 17) comes first.
  for (const expected of ['My_Warrior', 'My_Warrior_2']) {
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.wc-start [data-btn="IMPORT"]').click();
    await (await chooser).setFiles({
      name: 'My Warrior.tin',
      mimeType: 'text/plain',
      buffer: Buffer.from('#alias {k} {kill %1}\n'),
    });
    // A native profile: the short import report, then OK (ESC) back to the picker.
    await expect(startTitle(page)).toHaveText('─── IMPORT REPORT ───');
    await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-import-head')).toContainText('nothing changed');
    await page.keyboard.press('Escape');
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

test('profiles: Enter or a click on the selected profile edits it, on another selects it', async ({ page }) => {
  await openStart(page);
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.create('scout', '');
  });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(startTitle(page)).toHaveText('─── Profile ───');
  const frame = page.locator('.wc-start .wc-frame:not([hidden])');
  const table = frame.locator('.wc-table');
  const editorTitle = page.locator('.wc-frame:not([hidden]) > .wc-ped .wc-ped-title .wc-c-section');
  await expect(table.locator('.wc-tr.is-cur-focus')).toContainText('default');
  await expect(frame.locator('.wc-footer')).toContainText('Enter Edit');

  // Keyboard: Enter on the selected profile opens the editor, like EDIT.
  await page.keyboard.press('Enter');
  await expect(editorTitle).toHaveText('─── Profile Editor: default ───');
  await page.keyboard.press('Escape');
  await expect(startTitle(page)).toHaveText('─── Profile ───');

  // Enter on another profile selects it; a second Enter edits it.
  await page.keyboard.press('End');
  await expect(table.locator('.wc-tr.is-cur-focus')).toContainText('scout');
  await expect(frame.locator('.wc-footer')).toContainText('Enter Select');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await settings(page)).profile).toBe('scout');
  await expect(startTitle(page)).toHaveText('─── Profile ───');
  await page.keyboard.press('Enter');
  await expect(editorTitle).toHaveText('─── Profile Editor: scout ───');
  await page.keyboard.press('Escape');
  await expect(startTitle(page)).toHaveText('─── Profile ───');

  // Mouse: the first click on a row selects it, the second edits it.
  await table.locator('.wc-tr', { hasText: 'default' }).click();
  await expect.poll(async () => (await settings(page)).profile).toBe('default');
  await expect(startTitle(page)).toHaveText('─── Profile ───');
  await table.locator('.wc-tr', { hasText: 'default' }).click();
  await expect(editorTitle).toHaveText('─── Profile Editor: default ───');
  await page.keyboard.press('Escape');
  await expect(startTitle(page)).toHaveText('─── Profile ───');
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
