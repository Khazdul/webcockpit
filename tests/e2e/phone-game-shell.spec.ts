// Stage 51a (ADR 0136 §2, §3, §7, §9): the shell of the phone's layout in
// the live game: no tab strip and no panes, the command row with the menu
// key, the compass, the fight card, the keyboard-up state. On the `phone`
// project (Pixel 7: touch, mobile viewport) with `?phone=1`. Nothing
// reaches MUME: the offline cockpit replays tests/fixtures/gmcp-demo.log
// (cut inside its fight where a fight is wanted), and the compass test
// plays against a `page.routeWebSocket` mock.
import { type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const cockpit = (page: Page) => page.locator('.wc-cockpit[data-phone-game]');
const pad = (page: Page) => page.locator('.wc-ph-pad');
const key = (page: Page, cmd: string) => page.locator(`.wc-ph-key[data-cmd="${cmd}"]`);
const fight = (page: Page) => page.locator('.wc-ph-fight');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const menuKey = (page: Page) => page.locator('.wc-ph-menu');
const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const inputFocused = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains('wc-input-field') ?? false);

type Box = { x: number; y: number; width: number; height: number };
const box = async (page: Page, sel: string): Promise<Box> => (await page.locator(sel).first().boundingBox())!;

/** The offline cockpit on a phone, the phone layer mounted. */
async function openPhone(page: Page): Promise<void> {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(cockpit(page)).toBeVisible();
  await expect(pad(page)).toBeVisible();
}

/** Replays the GMCP demo, whole or up to the line before the first one holding `cut`. */
async function play(page: Page, cut?: string): Promise<void> {
  const before = await rows(page).filter({ hasText: '[SYSTEM] Replay finished.' }).count();
  await page.evaluate(async (cut) => {
    let text = await (await fetch('/__fixtures/gmcp-demo.log')).text();
    if (cut !== undefined) {
      const lines = text.split('\n');
      const at = lines.findIndex((l) => l.includes(cut));
      if (at < 0) throw new Error(`no line with ${cut}`);
      text = lines.slice(0, at).join('\n') + '\n';
    }
    window.__wc!.app.startReplay(text, 'gmcp-demo.log', 0);
  }, cut);
  await expect(rows(page).filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(before + 1);
}

/** Lines of the demo inside its fight. */
const YOU_TANK = 'Group.Update {"id":3,"hp":61}'; // just before the mercenary's rescue
const MERC_TANKS = '"opponent-hits":"dying"'; // the mercenary tanks, the scout is wounded

/** The scale of a bar's fill (0–1). */
const fill = (page: Page, side: 'left' | 'right') =>
  fight(page)
    .locator(`.wc-ph-fight-side.is-${side} .wc-ph-bar > i`)
    .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);

test('the live game on a phone: the game text and the command row; no tab strip, no pane but the map lens, no clock', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openPhone(page);
  await play(page);
  await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(0);
  await expect(page.locator('.wc-phone-tabs')).toHaveCount(0);
  // The one pane shown is the map, as the lens (stage 51c).
  await expect(page.locator('.wc-pane:not([hidden])')).toHaveCount(1);
  await expect(page.locator('.wc-pane-map')).toBeVisible();
  await expect(page.locator('.wc-menubar')).toHaveCount(0);
  await expect(page.locator('.wc-input-clock')).toBeHidden();
  await expect(page.locator('.wc-input-prompt')).toBeHidden();
  // Nothing to drag, resize or close.
  await expect(page.locator('.wc-pane-grip, .wc-pane-close, .wc-float-handle, .wc-handle')).toHaveCount(0);
  // The game text is as wide as the cockpit and starts at its top.
  const c = await box(page, '.wc-cockpit');
  const g = await box(page, '.wc-game');
  expect(Math.abs(g.width - c.width)).toBeLessThan(10);
  expect(Math.abs(g.y - c.y)).toBeLessThan(1);
  // The command row lies right under it.
  const slot = await box(page, '.wc-input-slot');
  expect(Math.abs(slot.y - (g.y + g.height))).toBeLessThan(1);
  // The old `☰` at the row's end is gone; the menu key is the one menu button.
  await expect(page.locator('.wc-menu-btn')).toHaveCount(1);
  // Ctrl+1…9 select no tab and are not typed.
  await page.keyboard.press('Control+2');
  await expect(page.locator('.wc-game')).toBeVisible();
  await expect(field(page)).toHaveValue('');
  expect(errors).toEqual([]);
});

test('the command row: the menu key far left, the field ending left of the compass; thumb-size targets', async ({ page }) => {
  await openPhone(page);
  const c = await box(page, '.wc-cockpit');
  const m = await box(page, '.wc-ph-menu');
  const f = await box(page, '.wc-input-slot > .wc-input');
  const p = await box(page, '.wc-ph-pad');
  const slot = await box(page, '.wc-input-slot');
  // The menu key: 44 px, 8 px from the left edge.
  expect(m.width).toBeCloseTo(44, 0);
  expect(m.height).toBeCloseTo(44, 0);
  expect(m.x - c.x).toBeCloseTo(8, 0);
  // The field: 44 px high, right of the key, ending left of the compass.
  expect(f.height).toBeCloseTo(44, 0);
  expect(f.x).toBeGreaterThanOrEqual(m.x + m.width + 7);
  expect(f.x + f.width).toBeLessThanOrEqual(p.x - 7);
  expect(f.width).toBeGreaterThan(120);
  // Both are centred in the row and inside it.
  for (const b of [m, f]) {
    expect(b.y).toBeGreaterThanOrEqual(slot.y - 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(slot.y + slot.height + 0.5);
    expect(Math.abs(b.y + b.height / 2 - (slot.y + slot.height / 2))).toBeLessThan(1);
  }
  // The row is whole cell rows, no more than the targets need.
  const cellH = await page.evaluate(() => window.__wc!.cells.get().h);
  expect(slot.height / cellH).toBeCloseTo(Math.ceil(50 / cellH), 1);
  await expect(field(page)).toHaveAttribute('placeholder', 'Command');
  // No history key, nothing right of the field but the compass.
  await expect(page.locator('.wc-input-slot button')).toHaveCount(1);
});

test('the compass: a 3 × 3 grid of 40 px keys from the bottom edge, right; the cell left of N is empty', async ({ page }) => {
  await openPhone(page);
  const c = await box(page, '.wc-cockpit');
  const p = await box(page, '.wc-ph-pad');
  expect(p.width).toBeCloseTo(126, 0);
  expect(p.height).toBeCloseTo(126, 0);
  expect(c.x + c.width - (p.x + p.width)).toBeCloseTo(8, 0);
  expect(c.y + c.height - (p.y + p.height)).toBeCloseTo(8, 0);
  // N, U / W, eye, E / F, S, D at the mockup's places; no ninth key.
  const places: Record<string, [number, number]> = {
    north: [1, 0],
    up: [2, 0],
    west: [0, 1],
    look: [1, 1],
    east: [2, 1],
    flee: [0, 2],
    south: [1, 2],
    down: [2, 2],
  };
  await expect(page.locator('.wc-ph-pad > *')).toHaveCount(8);
  for (const [cmd, [col, row]] of Object.entries(places)) {
    const k = (await key(page, cmd).boundingBox())!;
    expect(k.width).toBeCloseTo(40, 0);
    expect(k.height).toBeCloseTo(40, 0);
    expect(k.x - p.x).toBeCloseTo(col * 43, 0);
    expect(k.y - p.y).toBeCloseTo(row * 43, 0);
    await expect(key(page, cmd)).toBeEnabled();
  }
  expect((await key(page, 'north').textContent())!.trim()).toBe('N');
  expect((await key(page, 'flee').textContent())!.trim()).toBe('F');
  await expect(key(page, 'look').locator('svg')).toHaveCount(1);
  await expect(key(page, 'look')).toHaveAttribute('aria-label', 'Look');
});

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const ECHO = 1;
const GMCP = 201;
const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));

interface Mock {
  /** The plain lines the client sent (typed commands; not telnet or GMCP). */
  sent: string[];
  /** Sockets opened so far. */
  opened: () => number;
  server: () => WebSocketRoute;
  /** MUME names the character: the session is `playing`. */
  login: () => Promise<void>;
}

/** Enters MUME on `?phone=1` against a mock; the session waits at the login prompt. */
async function enterMock(page: Page): Promise<Mock> {
  let server: WebSocketRoute | null = null;
  let opened = 0;
  const sent: string[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    opened++;
    ws.onMessage((m) => {
      const text = (typeof m === 'string' ? Buffer.from(m) : m).toString('latin1');
      // Typed commands are plain lines; telnet negotiation and GMCP start with IAC.
      // The client's own `change width …` after login is not a key's command.
      if (!text.startsWith('\xff')) sent.push(...text.split(/\r?\n/).filter((l) => l !== '' && !l.startsWith('change width')));
    });
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(pad(page)).toBeVisible();
  return {
    sent,
    opened: () => opened,
    server: () => server!,
    login: async () => {
      server!.send(bytes([IAC, SB, GMCP], 'Char.Name {"name":"Tester","fullname":"Tester the Mock"}', [IAC, SE]));
      await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
    },
  };
}

test('each compass key sends its command to the game as typed, echoed; a tap never focuses the field', async ({ page }) => {
  const m = await enterMock(page);
  const sent = m.sent;
  await m.login();
  await expect(pad(page)).toBeVisible();
  // Every command goes through the App's typed-command path.
  await page.evaluate(() => {
    const app = window.__wc!.app;
    const log: string[] = ((window as unknown as { __typed: string[] }).__typed = []);
    const typed = app.onCommand.bind(app);
    app.onCommand = (text: string) => {
      log.push(text);
      return typed(text);
    };
  });
  const before = sent.length;
  const cmds = ['north', 'west', 'east', 'south', 'up', 'down', 'look', 'flee'];
  for (const cmd of cmds) {
    await key(page, cmd).tap();
    await expect.poll(() => sent.slice(before)).toContain(cmd);
    expect(await inputFocused(page)).toBe(false);
  }
  expect(sent.slice(before)).toEqual(cmds);
  expect(await page.evaluate(() => (window as unknown as { __typed: string[] }).__typed)).toEqual(cmds);
  // The echo shows, as for a typed command.
  await expect(rows(page).filter({ hasText: /^north$/ })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: /^flee$/ })).toHaveCount(1);
  // A direction can be spammed: every tap is sent, whatever the room's exits.
  for (let i = 0; i < 3; i++) await key(page, 'north').tap();
  await expect.poll(() => sent.slice(before).filter((c) => c === 'north').length).toBe(4);
  // Nothing was typed into the field, and it never got the focus.
  await expect(field(page)).toHaveValue('');
  expect(await inputFocused(page)).toBe(false);
  await expect(page.locator('html')).not.toHaveClass(/\bwc-kbd\b/);
});

test('a tap at the login and password prompts sends nothing; in play it sends', async ({ page }) => {
  const m = await enterMock(page);
  // The name prompt: not in play yet.
  m.server().send(bytes('By what name do you wish to be known? '));
  await key(page, 'north').tap();
  await key(page, 'look').tap();
  // The password prompt: MUME echoes, the command line is masked.
  m.server().send(bytes('Password: ', [IAC, WILL, ECHO]));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.input.isPasswordMode())).toBe(true);
  await key(page, 'north').tap();
  await key(page, 'flee').tap();
  await page.waitForTimeout(200);
  expect(m.sent).toEqual([]);
  await expect(rows(page).filter({ hasText: /^(north|look|flee)$/ })).toHaveCount(0);
  await expect(field(page)).toHaveValue('');
  // Password mode alone holds the keys back, also once the session plays.
  await m.login();
  await key(page, 'north').tap();
  await page.waitForTimeout(200);
  expect(m.sent).toEqual([]);
  // MUME stops echoing: the keys are live.
  m.server().send(bytes([IAC, 252, ECHO]));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.input.isPasswordMode())).toBe(false);
  await key(page, 'north').tap();
  await expect.poll(() => m.sent).toEqual(['north']);
});

test('a tap while disconnected sends nothing and opens no connection', async ({ page }) => {
  const m = await enterMock(page);
  await m.login();
  await key(page, 'south').tap();
  await expect.poll(() => m.sent).toEqual(['south']);
  // The link drops: the menu opens with Reconnect; close it without reconnecting.
  await m.server().close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(page.locator('.wc-ph-sheet')).toBeVisible();
  await page.touchscreen.tap(100, 60);
  await expect(page.locator('.wc-ph-sheet')).toBeHidden();
  for (const cmd of ['north', 'look', 'flee']) await key(page, cmd).tap();
  await page.waitForTimeout(500);
  expect(m.opened()).toBe(1);
  expect(m.sent).toEqual(['south']);
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(rows(page).filter({ hasText: 'Connecting to MUME' })).toHaveCount(1);
});

test('taps on the game text, a key and the fight card do not focus the field; a tap on the field does', async ({ page }) => {
  await openPhone(page);
  await play(page, YOU_TANK);
  await expect(fight(page)).toBeVisible();
  await page.locator('.wc-output').first().tap({ position: { x: 40, y: 200 } });
  await key(page, 'look').tap();
  await fight(page).tap();
  // The empty cell left of N swallows a near miss.
  const p = await box(page, '.wc-ph-pad');
  await page.touchscreen.tap(p.x + 20, p.y + 20);
  await page.waitForTimeout(150);
  expect(await inputFocused(page)).toBe(false);
  await field(page).tap();
  await expect(field(page)).toBeFocused();
});

test('the menu key opens the menu sheet without focusing the field', async ({ page }) => {
  await openPhone(page);
  await menuKey(page).tap();
  await expect(page.locator('.wc-ph-sheet')).toBeVisible();
  expect(await inputFocused(page)).toBe(false);
  await page.touchscreen.tap(100, 60);
  await expect(page.locator('.wc-ph-sheet')).toBeHidden();
  expect(await inputFocused(page)).toBe(false);
});

test('the fight card shows with the fight and goes with it: two names, two bars, two rows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openPhone(page);
  await expect(fight(page)).toBeHidden();
  const cellH = await page.evaluate(() => window.__wc!.cells.get().h);
  const walking = await box(page, '.wc-game');

  // Inside the fight, you tank: You (158 of 172 hp) against the scout (hurt).
  await play(page, YOU_TANK);
  await expect(fight(page)).toBeVisible();
  await expect(fight(page).locator('.wc-ph-fight-side.is-left .wc-ph-fight-name')).toHaveText('You');
  await expect(fight(page).locator('.wc-ph-fight-side.is-right .wc-ph-fight-name')).toHaveText('an orc scout');
  expect(await fill(page, 'left')).toBeCloseTo(0.92, 2);
  expect(await fill(page, 'right')).toBeCloseTo(0.65, 2);
  // Names and bars only: no percent, no condition word, no numbers.
  expect(await fight(page).innerText()).not.toMatch(/%|\d|hurt|fine/i);
  // Two rows at the very top, full width; the game text starts under it.
  const c = await box(page, '.wc-cockpit');
  const card = (await fight(page).boundingBox())!;
  expect(card.y - c.y).toBeLessThan(1);
  expect(card.height).toBeCloseTo(2 * cellH, 0);
  expect(card.width).toBeCloseTo(c.width, 0);
  const fighting = await box(page, '.wc-game');
  expect(fighting.y).toBeCloseTo(card.y + card.height, 0);
  expect(fighting.height).toBeCloseTo(walking.height - 2 * cellH, 0);
  // The command row did not move.
  const slot = await box(page, '.wc-input-slot');
  expect(slot.y).toBeCloseTo(fighting.y + fighting.height, 0);

  // Later in the same fight the mercenary tanks: its name and its HP from the group model
  // (`buffer-hits` said wounded since its last number: the band's midpoint); the scout is wounded.
  await play(page, MERC_TANKS);
  await expect(fight(page).locator('.wc-ph-fight-side.is-left .wc-ph-fight-name')).toHaveText('a citizen mercenary');
  expect(await fill(page, 'left')).toBeCloseTo(0.36, 2);
  expect(await fill(page, 'right')).toBeCloseTo(0.45, 2);

  // The whole demo: the scout dies, the card goes and the text gets its rows back.
  await play(page);
  await expect(fight(page)).toBeHidden();
  await expect.poll(async () => (await box(page, '.wc-game')).height).toBeCloseTo(walking.height, 0);
  expect((await box(page, '.wc-game')).y).toBeCloseTo(walking.y, 0);
  expect(errors).toEqual([]);
});

test('the keyboard up: the compass steps aside and the field takes the full width', async ({ page }) => {
  await openPhone(page);
  await play(page, YOU_TANK);
  const size = page.viewportSize()!;
  const narrow = await box(page, '.wc-input-slot > .wc-input');
  await field(page).tap();
  await page.setViewportSize({ width: size.width, height: size.height - 320 });
  await expect(page.locator('html')).toHaveClass(/\bwc-kbd\b/);
  await expect(pad(page)).toBeHidden();
  const c = await box(page, '.wc-cockpit');
  await expect.poll(async () => (await box(page, '.wc-input-slot > .wc-input')).width).toBeGreaterThan(narrow.width + 100);
  const f = await box(page, '.wc-input-slot > .wc-input');
  const m = await box(page, '.wc-ph-menu');
  expect(f.x).toBeGreaterThanOrEqual(m.x + m.width + 7);
  expect(c.x + c.width - (f.x + f.width)).toBeLessThan(cellGap(c.width));
  expect(f.height).toBeCloseTo(44, 0);
  // The row sits in the visible area, the fight card stays.
  const h = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
  expect(f.y + f.height).toBeLessThanOrEqual(h + 0.5);
  await expect(fight(page)).toBeVisible();
  await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(0);
  // Typing works as before: the line is sent on Enter and recalled by history.
  await page.keyboard.type('look');
  await expect(field(page)).toHaveValue('look');
  await page.keyboard.press('Enter');
  await page.keyboard.type('x');
  await page.keyboard.press('ArrowUp');
  await expect(field(page)).toHaveValue('look');
  // Keyboard down: the compass is back and the field ends left of it again.
  await page.setViewportSize(size);
  await expect(page.locator('html')).not.toHaveClass(/\bwc-kbd\b/);
  await expect(pad(page)).toBeVisible();
  const p = await box(page, '.wc-ph-pad');
  await expect.poll(async () => {
    const b = await box(page, '.wc-input-slot > .wc-input');
    return b.x + b.width <= p.x - 7;
  }).toBe(true);
});

/** The field's right edge may stop short of the cockpit's by the 8 px gutter and the last part cell. */
const cellGap = (width: number): number => 8 + (width % 20) + 20;

test('a very short visible area (a landscape keyboard) never shows too small; the row stays visible', async ({ page }) => {
  await openPhone(page);
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 120 });
  await expect(page.locator('html')).toHaveClass(/\bwc-kbd\b/);
  await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(0);
  const slot = await box(page, '.wc-input-slot');
  const h = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
  expect(slot.y).toBeGreaterThan(0);
  expect(slot.y + slot.height).toBeLessThanOrEqual(h + 0.5);
  await expect(page.locator('.wc-game')).toBeVisible();
});

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('the same layout as it is: the row, the compass and the fight card fit', async ({ page }) => {
    await openPhone(page);
    await play(page, YOU_TANK);
    await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(0);
    await expect(fight(page)).toBeVisible();
    const c = await box(page, '.wc-cockpit');
    const p = await box(page, '.wc-ph-pad');
    const f = await box(page, '.wc-input-slot > .wc-input');
    expect(p.y).toBeGreaterThan(c.y);
    expect(f.x + f.width).toBeLessThanOrEqual(p.x - 7);
    expect((await box(page, '.wc-game')).height).toBeGreaterThan(100);
  });
});

test('the fullscreen corner button is hidden in the game layout and stays on the start page', async ({ page }) => {
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  // The real button where the browser allows page fullscreen (installed once the
  // start page is up); a stand-in with its class where the test browser does not
  // (the CSS is under test).
  await page
    .locator('.wc-fs-btn')
    .waitFor({ state: 'attached', timeout: 2000 })
    .catch(() => {});
  await page.evaluate(() => {
    if (document.querySelector('.wc-fs-btn')) return;
    const b = document.createElement('button');
    b.className = 'wc-fs-btn';
    document.body.append(b);
  });
  const fs = page.locator('.wc-fs-btn');
  await expect(fs).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/\bwc-phone-game\b/);
  await page.routeWebSocket('wss://mume.org/ws-play/', () => {});
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(pad(page)).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/\bwc-phone-game\b/);
  await expect(fs).toBeHidden();
});

test.describe('a tablet', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test('keeps the menu bar and its panes: no phone layer, no phone game marker', async ({ page }) => {
    await page.goto('/?fixture=gmcp-demo.log&speed=0&touch=1');
    await expect(page.locator('html')).toHaveClass(/\bwc-touch\b/);
    await expect(page.locator('html')).not.toHaveClass(/\bwc-phone\b/);
    await expect(rows(page).filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
    await expect(page.locator('.wc-mb-bar')).toBeVisible();
    await expect(page.locator('.wc-cockpit[data-phone-game]')).toHaveCount(0);
    await expect(page.locator('.wc-ph-layer, .wc-ph-menu, .wc-ph-pad')).toHaveCount(0);
    await expect(page.locator('.wc-pane:not([hidden])').first()).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/\bwc-phone-game\b/);
  });
});
