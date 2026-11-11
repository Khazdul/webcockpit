// Stage 51e (ADR 0136 §8, §4, §9): the hot keys of the phone's layout in the
// live game.
//
// - The column: up to three round keys along the right edge above the
//   compass (K1 lowest); the K key left of N shows and hides it.
// - A tap sends the key's command as a typed line, exactly once, through
//   the keys' gate; a special sends `change wimpy <share of the current hp>`.
// - A hold opens the box (and sends nothing): Shown, Label, Command, the
//   quick picks, Custom, the two specials, Cancel and Save.
// - Hidden with the keyboard up, except an open box; the lens hides while
//   the box would collide with it.
//
// `phone` project (Pixel 7). The sending cases play against a
// `page.routeWebSocket` mock; the rest use the offline cockpit. Nothing
// reaches MUME.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const pad = (page: Page) => page.locator('.wc-ph-pad');
const hot = (page: Page) => page.locator('.wc-ph-hot');
const hk = (page: Page, n: 1 | 2 | 3) => page.locator(`.wc-ph-hk[data-hk="${n - 1}"]`);
const kKey = (page: Page) => page.locator('.wc-ph-key.is-tog');
const rb = (page: Page) => page.locator('.wc-ph-rb');
const label = (page: Page) => rb(page).locator('#wc-ph-rb-label');
const command = (page: Page) => rb(page).locator('#wc-ph-rb-command');
const chip = (page: Page, name: string) => rb(page).locator(`.wc-ph-chip[data-pick="${name}"]`);
const special = (page: Page, id: string) => rb(page).locator(`.wc-ph-chip[data-special="${id}"]`);
const shown = (page: Page) => rb(page).locator('.wc-ph-sw');
const bt = (page: Page, name: 'Cancel' | 'Save') => rb(page).locator('.wc-ph-bt', { hasText: name });
const lens = (page: Page) => page.locator('.wc-ph-lens');
const satrow = (page: Page) => page.locator('.wc-ph-satrow');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const hotkeys = (page: Page) => page.evaluate(() => window.__wc!.settings.get().phone.hotkeys);
const inputFocused = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains('wc-input-field') ?? false);

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openPhone(page: Page): Promise<void> {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(pad(page)).toBeVisible();
}

/**
 * A finger on `l`: down, then `during` (what happens while it is down; it
 * gets the finger's `move`), then up.
 */
async function finger(page: Page, l: Locator, during: (move: (dx: number) => Promise<void>) => Promise<void>): Promise<void> {
  const b = await box(l);
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const at = (type: 'touchStart' | 'touchMove' | 'touchEnd', px?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: px === undefined ? [] : [{ x: px, y, id: 0 }] });
  await at('touchStart', x);
  try {
    await during(async (dx) => {
      for (let i = 1; i <= 4; i++) await at('touchMove', x + (dx * i) / 4);
    });
  } finally {
    await at('touchEnd');
    await cdp.detach();
  }
}

/** A hold: the finger stays down until the box is open, then lifts. No fixed wait. */
const hold = (page: Page, l: Locator) => finger(page, l, () => expect(rb(page)).toBeVisible());
/** A short press: down and up back to back. */
const shortPress = (page: Page, l: Locator) => finger(page, l, async () => {});
/** A press that slides `dx` px off the key and stays down past the hold's time (the one fixed wait here: nothing must happen). */
const slideAway = (page: Page, l: Locator, dx: number) =>
  finger(page, l, async (move) => {
    await move(dx);
    await page.waitForTimeout(700);
  });

const IAC = 255;
const WILL = 251;
const WONT = 252;
const SB = 250;
const SE = 240;
const ECHO = 1;
const GMCP = 201;
const gmcp = (pkg: string, data: unknown): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);

interface Mock {
  /** The plain lines the client sent (commands; not telnet or GMCP). */
  sent: string[];
  opened: () => number;
  server: () => WebSocketRoute;
  login: () => Promise<void>;
}

/** Enters MUME on `?phone=1` against a mock, up to the login prompt. No `Char.Vitals` yet. */
async function enterMock(page: Page): Promise<Mock> {
  let server: WebSocketRoute | null = null;
  let opened = 0;
  const sent: string[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    opened++;
    ws.onMessage((m) => {
      const t = (typeof m === 'string' ? Buffer.from(m) : m).toString('latin1');
      if (!t.startsWith('\xff')) sent.push(...t.split(/\r?\n/).filter((l) => l !== '' && !l.startsWith('change width')));
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
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
      server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
      await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
      await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
    },
  };
}

/** Every line the App got as a typed command from now on. */
async function watchTyped(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const app = window.__wc!.app;
    const log: string[] = ((window as unknown as { __typed: string[] }).__typed = []);
    const typed = app.onCommand.bind(app);
    app.onCommand = (text: string) => {
      log.push(text);
      return typed(text);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __typed: string[] }).__typed);
}

// ------------------------------------------------------------- the column

test('defaults: wimp, bash and asst in a column above the compass, K1 lowest; the K key left of N, lit', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await expect(hot(page)).toBeVisible();
  // Top to bottom: K3, K2, K1.
  await expect(hot(page).locator('.wc-ph-hk')).toHaveText(['wimp', 'bash', 'asst']);
  await expect(hk(page, 1)).toHaveAttribute('aria-label', 'K1: assist');
  await expect(hk(page, 2)).toHaveAttribute('aria-label', 'K2: bash');
  await expect(hk(page, 3)).toHaveAttribute('aria-label', 'K3: wimpy at half of current HP');
  expect(await hotkeys(page)).toEqual([
    { label: 'asst', command: 'assist', special: null, shown: true },
    { label: 'bash', command: 'bash', special: null, shown: true },
    { label: 'wimp', command: '', special: 'wimpy50', shown: true },
  ]);
  // The mockup's geometry: 40 px round keys, 3 px apart, 8 px from the right edge, the foot 142 px up.
  const c = await box(page.locator('.wc-cockpit'));
  const k1 = await box(hk(page, 1));
  const k2 = await box(hk(page, 2));
  const k3 = await box(hk(page, 3));
  for (const k of [k1, k2, k3]) {
    expect(k.width).toBeCloseTo(40, 0);
    expect(k.height).toBeCloseTo(40, 0);
    expect(c.x + c.width - (k.x + k.width)).toBeCloseTo(8, 0);
  }
  expect(c.y + c.height - (k1.y + k1.height)).toBeCloseTo(142, 0);
  expect(k1.y - (k2.y + k2.height)).toBeCloseTo(3, 0);
  expect(k2.y - (k3.y + k3.height)).toBeCloseTo(3, 0);
  expect(await hk(page, 1).evaluate((el) => getComputedStyle(el).borderRadius)).toBe('50%');
  // The column stands above the compass, clear of it.
  const p = await box(pad(page));
  expect(k1.y + k1.height).toBeLessThanOrEqual(p.y);
  // The K key: the compass's first cell, a 24 px ring, lit while the column shows.
  const k = await box(kKey(page));
  expect(k.x - p.x).toBeCloseTo(0, 0);
  expect(k.y - p.y).toBeCloseTo(0, 0);
  expect(k.width).toBeCloseTo(40, 0);
  const ring = await box(kKey(page).locator('.wc-ph-kk'));
  expect(ring.width).toBeCloseTo(24, 0);
  expect(ring.height).toBeCloseTo(24, 0);
  await expect(kKey(page)).toHaveText('K');
  await expect(kKey(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(kKey(page)).toHaveAttribute('aria-label', 'Hide hot keys');
  await expect(rb(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('the K key hides and shows the column, and the choice is kept over a reload', async ({ page }) => {
  await openPhone(page);
  await kKey(page).tap();
  await expect(hot(page)).toBeHidden();
  await expect(kKey(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(kKey(page)).toHaveAttribute('aria-label', 'Show hot keys');
  expect(await page.evaluate(() => window.__wc!.settings.get().phone.hotkeysOpen)).toBe(false);
  // The K key takes no focus and types nothing.
  expect(await inputFocused(page)).toBe(false);
  await expect(field(page)).toHaveValue('');
  await page.evaluate(() => window.__wc!.settings.flush());
  await openPhone(page);
  await expect(kKey(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(hot(page)).toBeHidden();
  await kKey(page).tap();
  await expect(hot(page)).toBeVisible();
  await expect(hot(page).locator('.wc-ph-hk')).toHaveCount(3);
  await expect(kKey(page)).toHaveAttribute('aria-pressed', 'true');
});

test('the keyboard up: the column and the K key step aside, and come back', async ({ page }) => {
  await openPhone(page);
  const size = page.viewportSize()!;
  await field(page).tap();
  await page.setViewportSize({ width: size.width, height: size.height - 320 });
  await expect(page.locator('html')).toHaveClass(/\bwc-kbd\b/);
  await expect(hot(page)).toBeHidden();
  await expect(kKey(page)).toBeHidden();
  await page.setViewportSize(size);
  await expect(page.locator('html')).not.toHaveClass(/\bwc-kbd\b/);
  await expect(hot(page)).toBeVisible();
  await expect(kKey(page)).toBeVisible();
});

// ---------------------------------------------------------------- sending

test('a tap sends the key\'s command once, as typed and echoed, and never focuses the field', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await enterMock(page);
  await m.login();
  const typed = await watchTyped(page);
  await hk(page, 1).tap();
  await expect.poll(() => m.sent).toEqual(['assist']);
  await hk(page, 2).tap();
  await expect.poll(() => m.sent).toEqual(['assist', 'bash']);
  // One command per tap, also when tapped again and again.
  for (let i = 0; i < 3; i++) await hk(page, 2).tap();
  await expect.poll(() => m.sent).toEqual(['assist', 'bash', 'bash', 'bash', 'bash']);
  await page.waitForTimeout(700);
  expect(m.sent).toEqual(['assist', 'bash', 'bash', 'bash', 'bash']);
  expect(await typed()).toEqual(['assist', 'bash', 'bash', 'bash', 'bash']);
  await expect(rows(page).filter({ hasText: /^assist$/ })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: /^bash$/ })).toHaveCount(4);
  // No box, no focus, no keyboard, nothing in the field.
  await expect(rb(page)).toBeHidden();
  expect(await inputFocused(page)).toBe(false);
  await expect(field(page)).toHaveValue('');
  await expect(page.locator('html')).not.toHaveClass(/\bwc-kbd\b/);
  expect(errors).toEqual([]);
});

test('one command per tap: the box refuses a line with the separator, and a stored one sends nothing', async ({ page }) => {
  const m = await enterMock(page);
  await m.login();
  // The box: a line the command line would split into two is not saved.
  await hold(page, hk(page, 2));
  await command(page).fill('stand;bash');
  await expect(rb(page).locator('.wc-ph-rb-say')).toHaveText('Would send nothing: more than one command');
  await bt(page, 'Save').tap();
  await expect(rb(page).locator('.wc-ph-rb-err')).toHaveText('One command per key. Use an alias for more.');
  await expect(rb(page)).toBeVisible();
  expect((await hotkeys(page))[1]!.command).toBe('bash');
  // One command is: an escaped separator does not split.
  await command(page).fill('say a\\;b');
  await expect(rb(page).locator('.wc-ph-rb-err')).toBeHidden();
  await bt(page, 'Save').tap();
  await expect(rb(page)).toBeHidden();
  expect((await hotkeys(page))[1]!.command).toBe('say a\\;b');
  // A stored value with the separator (edited by hand, or older): the tap sends nothing and says so, once per tap.
  await page.evaluate(() => {
    const s = window.__wc!.settings;
    const keys = s.get().phone.hotkeys;
    s.update({ phone: { hotkeys: [keys[0]!, { label: 'sb', command: 'stand;bash', special: null, shown: true }, keys[2]!] } });
  });
  await expect(hk(page, 2)).toHaveText('sb');
  const typed = await watchTyped(page);
  await hk(page, 2).tap();
  await expect(rows(page).filter({ hasText: 'Hot key: one command per key, so nothing was sent. Use an alias for more.' })).toHaveCount(1);
  expect(m.sent).toEqual([]);
  expect(await typed()).toEqual([]);
  // The notice is gated like the keys: none at a password prompt.
  m.server().send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, ECHO])]));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.input.isPasswordMode())).toBe(true);
  await hk(page, 2).tap();
  await hk(page, 1).tap();
  m.server().send(Buffer.from([IAC, WONT, ECHO]));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.input.isPasswordMode())).toBe(false);
  // The other keys are untouched: a single command still goes as typed.
  await hk(page, 1).tap();
  await expect.poll(() => m.sent).toEqual(['assist']);
  expect(await typed()).toEqual(['assist']);
  await expect(rows(page).filter({ hasText: 'Hot key:' })).toHaveCount(1);
});

test('the special: unknown hp sends nothing and says so; then wimpy at half of the CURRENT hp', async ({ page }) => {
  const m = await enterMock(page);
  await m.login();
  // No Char.Vitals yet: nothing to take half of.
  await hk(page, 3).tap();
  await expect(rows(page).filter({ hasText: 'Hot key: your hit points are not known yet, so no wimpy was set.' })).toHaveCount(1);
  expect(m.sent).toEqual([]);
  // 149 of 172: half of the current hit points, floored; not of the maximum.
  m.server().send(gmcp('Char.Vitals', { hp: 149, maxhp: 172 }));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.game.char.vitals.get('hp'))).toBe(149);
  await hk(page, 3).tap();
  await expect.poll(() => m.sent).toEqual(['change wimpy 74']);
  await expect(rows(page).filter({ hasText: /^change wimpy 74$/ })).toHaveCount(1);
  // The hit points change (a partial update): the next press follows.
  m.server().send(gmcp('Char.Vitals', { hp: 61 }));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.game.char.vitals.get('hp'))).toBe(61);
  await hk(page, 3).tap();
  await expect.poll(() => m.sent).toEqual(['change wimpy 74', 'change wimpy 30']);
  // A quarter, picked in the box.
  await hold(page, hk(page, 3));
  await expect(rb(page).locator('.wc-ph-rb-say')).toHaveText('Would send now: change wimpy 30');
  await special(page, 'wimpy25').tap();
  await expect(rb(page).locator('.wc-ph-rb-say')).toHaveText('Would send now: change wimpy 15');
  await bt(page, 'Save').tap();
  await hk(page, 3).tap();
  await expect.poll(() => m.sent).toEqual(['change wimpy 74', 'change wimpy 30', 'change wimpy 15']);
  // One notice only, from the first press.
  await expect(rows(page).filter({ hasText: 'Hot key:' })).toHaveCount(1);
});

test('the gate: nothing is sent or said at a login or password prompt, nor while disconnected', async ({ page }) => {
  const m = await enterMock(page);
  // The name prompt: not in play yet.
  m.server().send(Buffer.from('By what name do you wish to be known? '));
  await hk(page, 1).tap();
  await hk(page, 3).tap();
  // The password prompt: MUME echoes, the command line is masked.
  m.server().send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, ECHO])]));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.input.isPasswordMode())).toBe(true);
  await hk(page, 1).tap();
  await hk(page, 2).tap();
  await hk(page, 3).tap();
  await m.login();
  await hk(page, 2).tap();
  await hk(page, 3).tap();
  await page.waitForTimeout(300);
  expect(m.sent).toEqual([]);
  await expect(rows(page).filter({ hasText: /^(assist|bash)$/ })).toHaveCount(0);
  await expect(rows(page).filter({ hasText: 'Hot key:' })).toHaveCount(0);
  await expect(field(page)).toHaveValue('');
  // MUME stops echoing: the keys are live.
  m.server().send(Buffer.from([IAC, WONT, ECHO]));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.input.isPasswordMode())).toBe(false);
  await hk(page, 2).tap();
  await expect.poll(() => m.sent).toEqual(['bash']);
  // The link drops: the menu opens with Reconnect; close it without reconnecting.
  await m.server().close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(page.locator('.wc-ph-sheet')).toBeVisible();
  await page.touchscreen.tap(100, 60);
  await expect(page.locator('.wc-ph-sheet')).toBeHidden();
  await hk(page, 1).tap();
  await hk(page, 2).tap();
  await hk(page, 3).tap();
  await page.waitForTimeout(500);
  expect(m.sent).toEqual(['bash']);
  expect(m.opened()).toBe(1);
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(rows(page).filter({ hasText: 'Hot key:' })).toHaveCount(0);
});

// ---------------------------------------------------------------- the box

test('a hold opens the box left of the column and sends nothing; a press that slides away does neither', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await enterMock(page);
  await m.login();
  // A short press sends on its release; a long one does not.
  await shortPress(page, hk(page, 2));
  await expect.poll(() => m.sent).toEqual(['bash']);
  await hold(page, hk(page, 1));
  await expect(rb(page)).toBeVisible();
  await expect(rb(page)).toHaveAttribute('role', 'dialog');
  await expect(rb(page)).toHaveAttribute('aria-label', 'Change hot key K1');
  await expect(hk(page, 1)).toHaveClass(/\bis-held\b/);
  await expect(hk(page, 1)).toHaveAttribute('aria-expanded', 'true');
  // The finger has lifted (`hold` ends with it): the release sent nothing.
  expect(m.sent).toEqual(['bash']);
  // What the box holds: Shown, Label, Command, the picks, Custom, the two specials, Cancel and Save.
  await expect(rb(page).locator('.wc-ph-rb-k')).toHaveText('K1');
  await expect(shown(page)).toHaveAttribute('role', 'switch');
  await expect(shown(page)).toHaveAttribute('aria-checked', 'true');
  await expect(label(page)).toHaveValue('asst');
  await expect(command(page)).toHaveValue('assist');
  await expect(rb(page).locator('.wc-ph-chips .wc-ph-chip')).toHaveText(['assist', 'bash', 'rescue', 'shoot', 'recover', 'Custom']);
  await expect(rb(page).locator('.wc-ph-chip', { hasText: /look/i })).toHaveCount(0);
  await expect(rb(page).locator('.wc-ph-spec .wc-ph-chip')).toHaveText([/wimpy 50\s% of current\sHP/, /wimpy 25\s% of current\sHP/]);
  await expect(chip(page, 'assist')).toHaveAttribute('aria-pressed', 'true');
  await expect(bt(page, 'Cancel')).toBeVisible();
  await expect(bt(page, 'Save')).toBeVisible();
  // Left of the column, on the screen, and it took no focus (no keyboard).
  const b = await box(rb(page));
  const col = await box(hot(page));
  expect(b.x + b.width).toBeLessThanOrEqual(col.x);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  await expect(rb(page).locator(':focus')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await expect(page.locator('html')).not.toHaveClass(/\bwc-kbd\b/);
  // A press on another hot key while it is open closes it (no save) and sends nothing.
  await hk(page, 2).tap();
  await expect(rb(page)).toBeHidden();
  await expect(hk(page, 1)).not.toHaveClass(/\bis-held\b/);
  expect(m.sent).toEqual(['bash']);
  // A compass key under an open box still works: the box closes and the key sends.
  await hold(page, hk(page, 1));
  await expect(rb(page)).toBeVisible();
  await page.locator('.wc-ph-key[data-cmd="flee"]').tap();
  await expect(rb(page)).toBeHidden();
  await expect.poll(() => m.sent).toEqual(['bash', 'flee']);
  // A press that slides off the key: no command, no box.
  await slideAway(page, hk(page, 1), -90);
  await expect(rb(page)).toBeHidden();
  expect(m.sent).toEqual(['bash', 'flee']);
  expect(errors).toEqual([]);
});

test('a pick and Save change the key, and it is kept over a reload; Cancel discards', async ({ page }) => {
  await openPhone(page);
  const before = await hotkeys(page);
  // Cancel: nothing changes.
  await hold(page, hk(page, 2));
  await chip(page, 'rescue').tap();
  await expect(command(page)).toHaveValue('rescue');
  await expect(label(page)).toHaveValue('resc');
  await bt(page, 'Cancel').tap();
  await expect(rb(page)).toBeHidden();
  await expect(hk(page, 2)).toHaveText('bash');
  expect(await hotkeys(page)).toEqual(before);
  // Opened again it shows the key as stored, not the dropped draft.
  await hold(page, hk(page, 2));
  await expect(command(page)).toHaveValue('bash');
  await expect(chip(page, 'bash')).toHaveAttribute('aria-pressed', 'true');
  // Esc is Cancel too, and does not open the menu.
  await page.keyboard.press('Escape');
  await expect(rb(page)).toBeHidden();
  await expect(page.locator('.wc-ph-sheet')).toBeHidden();
  // Save.
  await hold(page, hk(page, 2));
  await chip(page, 'rescue').tap();
  await expect(chip(page, 'rescue')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'bash')).toHaveAttribute('aria-pressed', 'false');
  await bt(page, 'Save').tap();
  await expect(rb(page)).toBeHidden();
  await expect(hk(page, 2)).toHaveText('resc');
  await expect(hk(page, 2)).toHaveAttribute('aria-label', 'K2: rescue');
  expect((await hotkeys(page))[1]).toEqual({ label: 'resc', command: 'rescue', special: null, shown: true });
  // Not in the profile: the phone's own settings only.
  await page.evaluate(() => window.__wc!.settings.flush());
  await openPhone(page);
  await expect(hot(page).locator('.wc-ph-hk')).toHaveText(['wimp', 'resc', 'asst']);
  expect((await hotkeys(page))[1]).toEqual({ label: 'resc', command: 'rescue', special: null, shown: true });
});

test('Custom puts the cursor in Command; what is typed in the box never reaches the command line', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await hold(page, hk(page, 3));
  // A special shows as a token; Custom gives the field back, focused.
  await expect(rb(page).locator('.wc-ph-rb-tok')).toBeVisible();
  await expect(command(page)).toBeHidden();
  await expect(special(page, 'wimpy50')).toHaveAttribute('aria-pressed', 'true');
  await chip(page, 'Custom'.toLowerCase()).tap();
  await expect(command(page)).toBeVisible();
  await expect(command(page)).toBeFocused();
  await expect(rb(page).locator('.wc-ph-rb-tok')).toBeHidden();
  await expect(special(page, 'wimpy50')).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(page, 'custom')).toHaveAttribute('aria-pressed', 'true');
  // The keyboard comes up: the box stays, whole, in the visible area; the column and the K key go.
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: size.height - 320 });
  await expect(page.locator('html')).toHaveClass(/\bwc-kbd\b/);
  await expect(rb(page)).toBeVisible();
  await expect(hot(page)).toBeHidden();
  await expect(kKey(page)).toBeHidden();
  await expect
    .poll(async () => {
      const b = await box(rb(page));
      const f = await box(page.locator('.wc-input-slot'));
      return b.y >= 0 && b.y + b.height <= f.y + 1;
    })
    .toBe(true);
  await expect(command(page)).toBeFocused();
  // Typing goes to the box's field: not to the command line, and no macro or page key runs.
  await page.keyboard.type('kill orc');
  await expect(command(page)).toHaveValue('kill orc');
  await expect(field(page)).toHaveValue('');
  await page.keyboard.press('Control+2');
  await expect(page.locator('.wc-cockpit > .wc-pane[data-phone-strip]')).toHaveCount(0);
  await expect(rb(page).locator('.wc-ph-rb-say')).toHaveText('Would send now: kill orc');
  await label(page).tap();
  await label(page).fill('');
  await page.keyboard.type('killer');
  // Four characters at most, cut as it is typed; characters as a reader counts them (a flag is one).
  await expect(label(page)).toHaveValue('kill');
  await label(page).fill('🇸🇪🇸🇪🇸🇪🇸🇪🇸🇪');
  await expect(label(page)).toHaveValue('🇸🇪🇸🇪🇸🇪🇸🇪');
  await label(page).fill('killer');
  await expect(label(page)).toHaveValue('kill');
  await expect(field(page)).toHaveValue('');
  // Enter in a field saves.
  await page.keyboard.press('Enter');
  await expect(rb(page)).toBeHidden();
  await page.setViewportSize(size);
  await expect(hot(page)).toBeVisible();
  await expect(hk(page, 3)).toHaveText('kill');
  expect((await hotkeys(page))[2]).toEqual({ label: 'kill', command: 'kill orc', special: null, shown: true });
  await expect(field(page)).toHaveValue('');
  // An empty command is not saved: the box says why and stays.
  await hold(page, hk(page, 3));
  await command(page).fill('');
  await bt(page, 'Save').tap();
  await expect(rb(page).locator('.wc-ph-rb-err')).toHaveText('Give the key a command, or pick one.');
  await expect(rb(page)).toBeVisible();
  await bt(page, 'Cancel').tap();
  expect((await hotkeys(page))[2]!.command).toBe('kill orc');
  expect(errors).toEqual([]);
});

test('Shown off removes a key; with none shown the K key opens the box for K1', async ({ page }) => {
  await openPhone(page);
  await hold(page, hk(page, 2));
  await shown(page).tap();
  await expect(shown(page)).toHaveAttribute('aria-checked', 'false');
  await bt(page, 'Save').tap();
  await expect(hot(page).locator('.wc-ph-hk')).toHaveText(['wimp', 'asst']);
  // The two left stand together from the foot: K1 lowest, K3 right above it.
  const c = await box(page.locator('.wc-cockpit'));
  const k1 = await box(hk(page, 1));
  const k3 = await box(hk(page, 3));
  expect(c.y + c.height - (k1.y + k1.height)).toBeCloseTo(142, 0);
  expect(k1.y - (k3.y + k3.height)).toBeCloseTo(3, 0);
  // The hidden key keeps what it was set to.
  expect((await hotkeys(page))[1]).toEqual({ label: 'bash', command: 'bash', special: null, shown: false });
  for (const n of [1, 3] as const) {
    await hold(page, hk(page, n));
    await shown(page).tap();
    await bt(page, 'Save').tap();
    await expect(rb(page)).toBeHidden();
  }
  await expect(hot(page)).toBeHidden();
  // No key to show: the K key is not lit, and is not dead either.
  await expect(kKey(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(kKey(page)).toHaveAttribute('aria-label', 'Set up hot keys');
  await kKey(page).tap();
  await expect(rb(page)).toBeVisible();
  await expect(rb(page)).toHaveAttribute('aria-label', 'Change hot key K1');
  await expect(shown(page)).toHaveAttribute('aria-checked', 'false');
  await expect(command(page)).toHaveValue('assist');
  expect(await page.evaluate(() => window.__wc!.settings.get().phone.hotkeysOpen)).toBe(true);
  // K again closes it.
  await kKey(page).tap();
  await expect(rb(page)).toBeHidden();
  await kKey(page).tap();
  await shown(page).tap();
  await bt(page, 'Save').tap();
  await expect(hot(page).locator('.wc-ph-hk')).toHaveText(['asst']);
  await expect(kKey(page)).toHaveAttribute('aria-pressed', 'true');
});

test('the box gives way to the menu: a dropped link opens the sheet over it, and the first Esc closes the sheet', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await enterMock(page);
  await m.login();
  await hold(page, hk(page, 2));
  await chip(page, 'rescue').tap();
  await expect(rb(page)).toBeVisible();
  // The link drops: the menu opens with Reconnect. The box is gone, unsaved.
  await m.server().close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(page.locator('.wc-ph-sheet')).toBeVisible();
  await expect(rb(page)).toBeHidden();
  await expect(hk(page, 2)).not.toHaveClass(/\bis-held\b/);
  expect((await hotkeys(page))[1]!.command).toBe('bash');
  // One Esc: the sheet closes (the box holds no key listener any more).
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-ph-sheet')).toBeHidden();
  await expect(rb(page)).toBeHidden();
  // The menu key does the same to an open box.
  await hold(page, hk(page, 2));
  await page.locator('.wc-ph-menu').tap();
  await expect(page.locator('.wc-ph-sheet')).toBeVisible();
  await expect(rb(page)).toBeHidden();
  expect(errors).toEqual([]);
});

// --------------------------------------------------------------- the lens

test('the lens hides while the box would collide with it, and returns when the box closes', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await expect(lens(page)).toBeVisible();
  const l = await box(lens(page));
  // On the tall screen the box stands below the lens: both show.
  await hold(page, hk(page, 3));
  await expect(rb(page)).toBeVisible();
  expect((await box(rb(page))).y).toBeGreaterThan(l.y + l.height);
  await expect(lens(page)).toBeVisible();
  // The keyboard up (Custom): the box moves up over the command row, into the lens's place.
  await chip(page, 'custom').tap();
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: size.height - 320 });
  await expect(page.locator('html')).toHaveClass(/\bwc-kbd\b/);
  await expect(lens(page)).toBeHidden();
  await expect(page.locator('.wc-cockpit > .wc-pane[data-pane="map"]')).toBeHidden();
  // Its keys stay, as a row.
  await expect(satrow(page)).toBeVisible();
  await expect(rb(page)).toBeVisible();
  // The box closes (the keyboard still up): the lens is back.
  await bt(page, 'Cancel').tap();
  await expect(rb(page)).toBeHidden();
  await expect(lens(page)).toBeVisible();
  await expect(satrow(page)).toBeHidden();
  await page.setViewportSize(size);
  await expect(lens(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('a short screen: the box scrolls inside the visible area and its buttons can be reached', async ({ page }) => {
  await openPhone(page);
  await hold(page, hk(page, 1));
  await expect(rb(page)).toBeVisible();
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 360 });
  await expect
    .poll(async () => {
      const b = await box(rb(page));
      return b.y >= 0 && b.y + b.height <= 360;
    })
    .toBe(true);
  await bt(page, 'Save').scrollIntoViewIfNeeded();
  const s = await box(bt(page, 'Save'));
  expect(s.y).toBeGreaterThanOrEqual(0);
  expect(s.y + s.height).toBeLessThanOrEqual(360);
  await bt(page, 'Cancel').tap();
  await expect(rb(page)).toBeHidden();
});

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('the column shown and the strip open: the lens stays hidden, its keys a row clear of the column; the strip takes an open box\'s place', async ({ page }) => {
    const errors = watchErrors(page);
    await openPhone(page);
    // 390 px high: three hot keys reach into the lens's place (ADR 0136 §4).
    await expect(hot(page)).toBeVisible();
    await expect(lens(page)).toBeHidden();
    await expect(satrow(page)).toBeVisible();
    await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
    const strip = page.locator('.wc-cockpit > .wc-pane[data-phone-strip]');
    await expect(strip).toHaveAttribute('data-pane', 'timers');
    await expect(lens(page)).toBeHidden();
    await expect(satrow(page)).toBeVisible();
    await expect(hot(page)).toBeVisible();
    await expect(hot(page).locator('.wc-ph-hk')).toHaveCount(3);
    // Nothing overlaps: the strip above, the key row under it, the column under the row.
    const s = await box(strip);
    const r = await box(satrow(page));
    const col = await box(hot(page));
    expect(r.y).toBeGreaterThanOrEqual(s.y + s.height);
    expect(col.y).toBeGreaterThanOrEqual(s.y + s.height);
    expect(r.y + r.height <= col.y + 1 || r.x + r.width <= col.x).toBe(true);
    // With the K key the column goes; the 150 px lens still has no room under the strip.
    await kKey(page).tap();
    await expect(hot(page)).toBeHidden();
    await expect(lens(page)).toBeHidden();
    // The strip closed and the column hidden: the lens is back.
    await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
    await expect(strip).toHaveCount(0);
    await expect(lens(page)).toBeVisible();
    await kKey(page).tap();
    await expect(lens(page)).toBeHidden();
    // An open box (it fills the short screen) gives way when the strip opens into its place.
    await hold(page, hk(page, 1));
    await expect(rb(page)).toBeVisible();
    await page.keyboard.press('Control+1');
    await expect(strip).toHaveCount(1);
    await expect(rb(page)).toBeHidden();
    expect(errors).toEqual([]);
  });
});
