// The phone's menu in the live game. Until stage 51a this was the ESC menu
// (ADR 0112); since stage 51b (ADR 0136 §10) it is the bottom sheet of the
// phone layer: Esc, `#menu`, the menu key and a server drop open it; its
// status line, Reconnect, Profile, Scripts and Exit session. What the old
// spec guarded in the live game is asserted against the sheet here. The
// sheet's own controls (text size, themes) and the settings page are in
// phone-game-menu.spec.ts. Against a mocked MUME WebSocket.
import { type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const overlay = (page: Page) => page.locator('.wc-overlay');
const frame = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden])');
const sheet = (page: Page) => page.locator('.wc-ph-sheet');
const row = (page: Page, key: string) => sheet(page).locator(`[data-row="${key}"]`);
const menuKey = (page: Page) => page.locator('.wc-ph-menu');
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
  await expect(menuKey(page)).toBeVisible();
  return { server: () => server!, opened: () => opened };
}

test('Esc opens the sheet with its status line; Esc, a tap outside and the close key close it; #menu opens it', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page);
  await field(page).press('Escape');
  await expect(sheet(page)).toBeVisible();
  // The ESC menu's overlay is not what opens.
  await expect(overlay(page)).toBeHidden();
  await expect(sheet(page).locator('.wc-ph-status')).toContainText('default');
  await expect(sheet(page).locator('.wc-ph-status')).toContainText('Link:');
  // Connected: Reconnect is a plain row; every entry is there.
  await expect(row(page, 'reconnect')).not.toHaveClass(/\bis-lit\b/);
  for (const key of ['reconnect', 'profile', 'scripts', 'settings', 'exit']) await expect(row(page, key)).toBeVisible();
  // No Statistics row: it is a pane (ADR 0136 §10).
  await expect(sheet(page)).not.toContainText('Statistics');
  // Keys go to the menu, not the game input: nothing is typed or sent behind it.
  await page.keyboard.type('xyz');
  await page.keyboard.press('Enter');
  await expect(field(page)).toHaveValue('');
  await expect(sheet(page)).toBeVisible();
  // Esc closes it.
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  // The keys are the command line's again.
  await page.keyboard.type('ab');
  await expect(field(page)).toHaveValue('ab');
  await field(page).fill('');
  // The menu key opens it; a tap outside closes it.
  await menuKey(page).tap();
  await expect(sheet(page)).toBeVisible();
  await page.touchscreen.tap(100, 60);
  await expect(sheet(page)).toBeHidden();
  // The close key in its last row folds it down (stage 52; the sheet is not dragged, so a swipe on
  // its top band does nothing any more).
  await menuKey(page).tap();
  await expect(sheet(page)).toBeVisible();
  const top = (await sheet(page).locator('.wc-ph-sheet-top').boundingBox())!;
  const x = top.x + top.width / 2;
  const y = top.y + top.height / 2;
  await sheet(page).locator('.wc-ph-sheet-top').dispatchEvent('pointerdown', { clientX: x, clientY: y, pointerType: 'touch', isPrimary: true });
  await sheet(page).locator('.wc-ph-sheet-top').dispatchEvent('pointerup', { clientX: x, clientY: y + 80, pointerType: 'touch', isPrimary: true });
  await expect(sheet(page)).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Close menu' }).and(page.locator('.wc-ph-fold')).tap();
  await expect(sheet(page)).toBeHidden();
  // #menu opens it too, and the command field lets go of the focus (the on-screen keyboard closes).
  await field(page).tap();
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('#menu');
  await page.keyboard.press('Enter');
  await expect(sheet(page)).toBeVisible();
  await expect(field(page)).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  expect(errors).toEqual([]);
});

test('with the sheet open no key reaches the game: an Alt or Ctrl macro sends nothing', async ({ page }) => {
  const sent: string[] = [];
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => {
      const text = (typeof m === 'string' ? Buffer.from(m) : m).toString('latin1');
      if (!text.startsWith('\xff')) sent.push(...text.split(/\r?\n/).filter((l) => l !== '' && !l.startsWith('change width')));
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto('/?phone=1');
  await expect(startSel(page)).toHaveText('Enter MUME');
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', '#macro {Alt+q} {quaff}\n#macro {Ctrl+g} {growl}\n#macro {F3} {flee}\n');
  });
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  server!.send(Buffer.concat([Buffer.from([IAC, 250, GMCP]), Buffer.from('Char.Name {"name":"Tester","fullname":"Tester the Mock"}'), Buffer.from([IAC, 240])]));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  await expect(menuKey(page)).toBeVisible();
  // The macros work in the game.
  await page.keyboard.press('Alt+q');
  await expect.poll(() => sent).toEqual(['quaff']);
  await menuKey(page).tap();
  await expect(sheet(page)).toBeVisible();
  for (const key of ['Alt+q', 'Control+g', 'F3', 'x', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(300);
  expect(sent).toEqual(['quaff']);
  await expect(field(page)).toHaveValue('');
  await expect(sheet(page)).toBeVisible();
  // Closed, they are the game's again.
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  await page.keyboard.press('Control+g');
  await expect.poll(() => sent).toEqual(['quaff', 'growl']);
});

test('the link drops while the settings page is open: the sheet takes over with Reconnect lit', async ({ page }) => {
  const m = await enterMume(page);
  await menuKey(page).tap();
  await row(page, 'settings').tap();
  await expect(page.locator('.wc-ph-page')).toBeVisible();
  await m.server().close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(page.locator('.wc-ph-page')).toBeHidden();
  await expect(sheet(page)).toBeVisible();
  await expect(row(page, 'reconnect')).toHaveClass(/\bis-lit\b/);
  await row(page, 'reconnect').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  expect(m.opened()).toBe(2);
});

test('the link drops while the sheet is open: it stays, and Reconnect lights up', async ({ page }) => {
  const m = await enterMume(page);
  await menuKey(page).tap();
  await expect(row(page, 'reconnect')).not.toHaveClass(/\bis-lit\b/);
  await m.server().close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(sheet(page)).toBeVisible();
  await expect(row(page, 'reconnect')).toHaveClass(/\bis-lit\b/);
});

test('the phone layer cannot be loaded: a cover with Reload, and no old menu (stage 55)', async ({ page }) => {
  // The dev server serves the phone layer's chunk as this module.
  let fail = true;
  await page.route(/\/src\/phone\/index\.ts/, (route) => (fail ? route.abort() : route.continue()));
  await page.goto('/?replay&phone=1');
  const cover = page.locator('.wc-phone-failed');
  await expect(cover).toBeVisible();
  await expect(cover).toHaveCount(1);
  await expect(cover.locator('p')).toHaveText('The phone layout could not be loaded. Check the connection and reload.');
  // It covers the whole page, over the cockpit.
  const box = (await cover.boundingBox())!;
  const view = page.viewportSize()!;
  expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, view.width, view.height]);
  expect(await page.evaluate(() => document.elementFromPoint(40, 40)?.closest('.wc-phone-failed') !== null)).toBe(true);
  // Nothing behind it: no ESC menu, no phone layer.
  await expect(page.locator('.wc-ph-menu, .wc-ph-pad, .wc-ph-menu-host')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__wc!.shell.openMenu());
  await page.waitForTimeout(300);
  await expect(overlay(page)).toBeHidden();
  // A touch-size Reload button reloads the page: with the chunk back, the layout is there.
  const reload = cover.locator('button');
  await expect(reload).toHaveText('Reload');
  const rb = (await reload.boundingBox())!;
  expect(rb.height).toBeGreaterThanOrEqual(44);
  expect(rb.width).toBeGreaterThanOrEqual(44);
  fail = false;
  await reload.tap();
  await expect(menuKey(page)).toBeVisible();
  await expect(page.locator('.wc-phone-failed')).toHaveCount(0);
});

test('the cover follows the theme: dark, and light on Paper (stage 55)', async ({ page }) => {
  await page.route(/\/src\/phone\/index\.ts/, (route) => route.abort());
  await page.goto('/?replay&phone=1');
  const cover = page.locator('.wc-phone-failed');
  await expect(cover).toBeVisible();
  const colours = () => cover.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  expect(await colours()).toEqual(['rgb(0, 0, 0)', 'rgb(192, 192, 192)']);
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
  await expect.poll(colours).toEqual(['rgb(244, 236, 216)', 'rgb(0, 0, 0)']);
  await page.evaluate(() => window.__wc!.settings.reset());
});

test('the selected profile shows in the status line and on the Profile row', async ({ page }) => {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => ws.send(Buffer.from([IAC, WILL, GMCP])));
  await page.goto('/?phone=1');
  await expect(startSel(page)).toHaveText('Enter MUME');
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.create('scout', '');
    window.__wc!.settings.update({ profile: 'scout' });
  });
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await menuKey(page).tap();
  await expect(sheet(page).locator('.wc-ph-status')).toContainText('scout');
  await expect(row(page, 'profile').locator('.wc-ph-row-v')).toHaveText('scout');
});

test('the character shows in the status line once MUME names it', async ({ page }) => {
  const m = await enterMume(page);
  m.server().send(Buffer.concat([Buffer.from([IAC, 250, GMCP]), Buffer.from('Char.Name {"name":"Tester","fullname":"Tester the Mock"}'), Buffer.from([IAC, 240])]));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  await menuKey(page).tap();
  await expect(sheet(page).locator('.wc-ph-status-t')).toHaveText(/^Tester · default · Link: /);
});

test('a server drop opens the sheet with Reconnect lit; a tap on it reconnects; the notice is not there', async ({ page }) => {
  const m = await enterMume(page);
  await m.server().close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(sheet(page)).toBeVisible();
  await expect(overlay(page)).toBeHidden();
  await expect(row(page, 'reconnect')).toHaveClass(/\bis-lit\b/);
  await expect(row(page, 'reconnect')).toContainText('Not connected');
  // Reconnect is the first row.
  await expect(sheet(page).locator('.wc-ph-rows > *').first()).toHaveAttribute('data-row', 'reconnect');
  await expect(page.locator('.wc-mb-disc')).toHaveCount(0);
  await row(page, 'reconnect').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(sheet(page)).toBeHidden();
  expect(m.opened()).toBe(2);
});

test('offline modes have the sheet, with Reconnect lit', async ({ page }) => {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(page.locator('.wc-start')).toHaveCount(0);
  await expect(menuKey(page)).toBeVisible();
  await field(page).press('Escape');
  await expect(sheet(page)).toBeVisible();
  await expect(row(page, 'reconnect')).toHaveClass(/\bis-lit\b/);
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
});

test('Exit session asks first, returns to the start page and closes the connection', async ({ page }) => {
  const m = await enterMume(page);
  let closed = false;
  m.server().onClose(() => (closed = true));
  await field(page).press('Escape');
  await expect(sheet(page)).toBeVisible();
  await row(page, 'exit').tap();
  // The confirmation in the phone's own sheet (stage 52): the ESC menu's overlay is not used.
  const ex = page.locator('.wc-ph-exitsheet');
  await expect(ex).toBeVisible();
  await expect(ex.locator('.wc-ph-hood')).toHaveText('Exit session');
  await expect(ex).toContainText('Attention! This terminates the current');
  await expect(overlay(page)).toBeHidden();
  // Esc: back to the menu it was opened from; the session is untouched.
  await page.keyboard.press('Escape');
  await expect(ex).toHaveCount(0);
  await expect(sheet(page).locator('.wc-ph-hood')).toHaveText('Menu');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await row(page, 'exit').tap();
  await expect(ex).toBeVisible();
  await page.keyboard.press('y');
  await expect(page.locator('.wc-start')).toBeVisible();
  await expect(startSel(page)).toHaveText('Enter MUME');
  await expect(page.locator('.wc-app')).toBeHidden();
  await expect(overlay(page)).toBeHidden();
  await expect(sheet(page)).toBeHidden();
  await expect.poll(() => closed).toBe(true);
});

// (The old menu's Statistics row became a page of the pane strip in stage 51d: its case, the live run of a
// replay, is in phone-game-panes.spec.ts.)

test('Profile and Scripts open their pages from the sheet, full screen, not windows; Back returns to the game', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-app')).toBeVisible();
  await menuKey(page).tap();
  await row(page, 'profile').tap();
  await expect(sheet(page)).toBeHidden();
  // The editor in the new look, full screen in the menu's place (ADR 0127, 0128).
  const pe = frame(page).locator('.wc-pe');
  await expect(pe).toHaveAttribute('data-view', 'lite');
  await expect(pe).toHaveClass(/\bis-menu\b/);
  await expect(frame(page).locator('.wc-lk-box-full .wc-lk-hood-t')).toHaveText('Profile');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  // Back (top left) leaves the editor, and with it the overlay: the game again.
  await frame(page).locator('.wc-lk-back').tap();
  await expect(overlay(page)).toBeHidden();
  await expect(sheet(page)).toBeHidden();
  // Esc leaves it too.
  await menuKey(page).tap();
  await row(page, 'profile').tap();
  await expect(pe).toHaveAttribute('data-view', 'lite');
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeHidden();
  // Scripts: the lantern Scripts page (stage 44), its hood and the page.
  await menuKey(page).tap();
  await row(page, 'scripts').tap();
  await expect(frame(page).locator('.wc-lk-hood-t')).toHaveText('Scripts');
  await expect(frame(page).locator('.wc-scr')).toBeVisible();
  await expect(page.locator('.wc-win')).toHaveCount(0);
  await frame(page).locator('.wc-lk-back').first().tap();
  await expect(overlay(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('#profile, #scripts and #exit open their pages; #settings and #panes open the settings page', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?replay&phone=1');
  await expect(menuKey(page)).toBeVisible();
  const type = async (cmd: string): Promise<void> => {
    await field(page).fill(cmd);
    await field(page).press('Enter');
  };
  await type('#profile');
  await expect(frame(page).locator('.wc-pe')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeHidden();
  await type('#scripts');
  await expect(frame(page).locator('.wc-scr')).toBeVisible();
  await frame(page).locator('.wc-lk-back').first().tap();
  await expect(overlay(page)).toBeHidden();
  // `#exit`: the phone's own confirmation (stage 52); Esc returns to the game.
  await type('#exit');
  await expect(page.locator('.wc-ph-exitsheet')).toBeVisible();
  await expect(overlay(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-ph-menu-host')).toBeHidden();
  // The phone's own settings page; opened by a command, Esc returns to the game.
  for (const cmd of ['#settings', '#panes']) {
    await type(cmd);
    await expect(page.locator('.wc-ph-page')).toBeVisible();
    await expect(overlay(page)).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('.wc-ph-page')).toBeHidden();
    await expect(sheet(page)).toBeHidden();
  }
  expect(errors).toEqual([]);
});
