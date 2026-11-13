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
// Stage 52: one to six keys (a setting), above three in a second column
// left of the first; a key's line may hold several commands; and the
// on-screen keyboard: no key raises it, and a field lets go of the focus
// when the keyboard goes down.
//
// `phone` project (Pixel 7). The sending cases play against a
// `page.routeWebSocket` mock; the rest use the offline cockpit. Nothing
// reaches MUME.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const pad = (page: Page) => page.locator('.wc-ph-pad');
const hot = (page: Page) => page.locator('.wc-ph-hot');
const hk = (page: Page, n: 1 | 2 | 3 | 4 | 5 | 6) => page.locator(`.wc-ph-hk[data-hk="${n - 1}"]`);
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

async function openPhone(page: Page, query = ''): Promise<void> {
  await page.goto(`/?replay&phone=1${query}`);
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
async function enterMock(page: Page, query = ''): Promise<Mock> {
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
  await page.goto(`/?phone=1${query}`);
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
  // Six slots are stored; three are in use.
  expect(await hotkeys(page)).toEqual([
    { label: 'asst', command: 'assist', special: null, shown: true },
    { label: 'bash', command: 'bash', special: null, shown: true },
    { label: 'wimp', command: '', special: 'wimpy50', shown: true },
    { label: 'resc', command: 'rescue', special: null, shown: true },
    { label: 'shot', command: 'shoot', special: null, shown: true },
    { label: 'rcvr', command: 'recover', special: null, shown: true },
  ]);
  expect(await page.evaluate(() => window.__wc!.settings.get().phone.hotkeyCount)).toBe(3);
  await expect(page.locator('.wc-ph-hot-col')).toHaveCount(1);
  // The mockup's geometry at portrait's 36 px keys: round, 3 px apart, 8 px from the right edge, the foot 130 px up.
  const c = await box(page.locator('.wc-cockpit'));
  const k1 = await box(hk(page, 1));
  const k2 = await box(hk(page, 2));
  const k3 = await box(hk(page, 3));
  for (const k of [k1, k2, k3]) {
    expect(k.width).toBeCloseTo(36, 0);
    expect(k.height).toBeCloseTo(36, 0);
    expect(c.x + c.width - (k.x + k.width)).toBeCloseTo(8, 0);
  }
  expect(c.y + c.height - (k1.y + k1.height)).toBeCloseTo(130, 0);
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
  expect(k.width).toBeCloseTo(36, 0);
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
  expect(errors).toEqual([]);
});

test('several commands on one key (stage 52): the box saves a line with the separator, and a tap sends it as typed', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await enterMock(page);
  await m.login();
  await hold(page, hk(page, 2));
  await command(page).fill('stand;bash');
  // No refusal: the line says what goes, Save stores it as written.
  await expect(rb(page).locator('.wc-ph-rb-say')).toHaveText('Would send now: stand;bash');
  await label(page).fill('sb');
  await bt(page, 'Save').tap();
  await expect(rb(page)).toBeHidden();
  await expect(rb(page).locator('.wc-ph-rb-err')).toBeHidden();
  expect((await hotkeys(page))[1]).toEqual({ label: 'sb', command: 'stand;bash', special: null, shown: true });
  await expect(hk(page, 2)).toHaveText('sb');
  await expect(hk(page, 2)).toHaveAttribute('aria-label', 'K2: stand;bash');
  // One tap: the line goes through the command line's path once, and the engine splits it there.
  const typed = await watchTyped(page);
  await hk(page, 2).tap();
  await expect.poll(() => m.sent).toEqual(['stand', 'bash']);
  expect(await typed()).toEqual(['stand;bash']);
  await expect(rows(page).filter({ hasText: 'Hot key:' })).toHaveCount(0);
  // An escaped separator is still one command.
  await hold(page, hk(page, 1));
  await command(page).fill('say a\\;b');
  await bt(page, 'Save').tap();
  await expect(rb(page)).toBeHidden();
  await hk(page, 1).tap();
  await expect.poll(() => m.sent.length).toBe(3);
  expect(m.sent[2]).toContain('say a');
  // Gated like every key: nothing at a password prompt.
  m.server().send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, ECHO])]));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.input.isPasswordMode())).toBe(true);
  await hk(page, 2).tap();
  m.server().send(Buffer.from([IAC, WONT, ECHO]));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.input.isPasswordMode())).toBe(false);
  await hk(page, 2).tap();
  await expect.poll(() => m.sent.length).toBe(5);
  expect(m.sent.slice(3)).toEqual(['stand', 'bash']);
  expect(await inputFocused(page)).toBe(false);
  expect(errors).toEqual([]);
});

// ------------------------------------------------- one to six keys (stage 52)

const count = (page: Page) => page.evaluate(() => window.__wc!.settings.get().phone.hotkeyCount);

test('Settings → Quick buttons → Number of K keys: 1 to 6; above three a second column directly left of the first, K4 lowest', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await page.locator('.wc-ph-menu').tap();
  await page.locator('.wc-ph-sheet [data-row="settings"]').tap();
  const row = page.locator('.wc-ph-page [data-group="compass"] [data-row="hotkey-count"]');
  await expect(row.locator('.wc-ph-srow-t')).toHaveText('Number of K keys');
  await expect(row.locator('.wc-ph-step-val')).toHaveText('3');
  const more = row.getByRole('button', { name: 'More K keys' });
  const less = row.getByRole('button', { name: 'Fewer K keys' });
  for (const k of [more, less]) expect((await box(k)).height).toBeGreaterThanOrEqual(44);
  for (let i = 0; i < 3; i++) await more.tap();
  await expect(row.locator('.wc-ph-step-val')).toHaveText('6');
  await expect(more).toHaveAttribute('aria-disabled', 'true');
  expect(await count(page)).toBe(6);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-ph-sheet')).toBeHidden();
  // Two columns: the second (K6, K5, K4 from the top) left of the first, one gap apart.
  await expect(page.locator('.wc-ph-hot-col')).toHaveCount(2);
  await expect(page.locator('.wc-ph-hot-col.is-second .wc-ph-hk')).toHaveText(['rcvr', 'shot', 'resc']);
  await expect(page.locator('.wc-ph-hot-col:not(.is-second) .wc-ph-hk')).toHaveText(['wimp', 'bash', 'asst']);
  await expect(hk(page, 4)).toHaveAttribute('aria-label', 'K4: rescue');
  await expect(hk(page, 5)).toHaveAttribute('aria-label', 'K5: shoot');
  await expect(hk(page, 6)).toHaveAttribute('aria-label', 'K6: recover');
  const c = await box(page.locator('.wc-cockpit'));
  const p = await box(pad(page));
  for (const [right, left] of [[1, 4], [2, 5], [3, 6]] as const) {
    const a = await box(hk(page, right));
    const b = await box(hk(page, left));
    expect(b.width).toBeCloseTo(36, 0);
    expect(b.height).toBeCloseTo(36, 0);
    expect(b.y).toBeCloseTo(a.y, 0);
    expect(a.x - (b.x + b.width)).toBeCloseTo(3, 0);
    expect(c.x + c.width - (a.x + a.width)).toBeCloseTo(8, 0);
    // Above the compass, and not left of it (the command field's room is untouched).
    expect(b.y + b.height).toBeLessThanOrEqual(p.y);
    expect(b.x).toBeGreaterThanOrEqual(p.x - 0.5);
  }
  const k4 = await box(hk(page, 4));
  expect(c.y + c.height - (k4.y + k4.height)).toBeCloseTo(130, 0);
  expect(await hk(page, 4).evaluate((el) => getComputedStyle(el).borderRadius)).toBe('50%');
  // The lens keeps clear of both columns.
  const l = await box(page.locator('.wc-ph-lens'));
  expect(l.y + l.height).toBeLessThanOrEqual((await box(hk(page, 6))).y);
  // The K key shows and hides all of them.
  await kKey(page).tap();
  await expect(hot(page)).toBeHidden();
  await expect(page.locator('.wc-ph-hk:visible')).toHaveCount(0);
  await kKey(page).tap();
  await expect(page.locator('.wc-ph-hk:visible')).toHaveCount(6);
  // Kept over a reload.
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(pad(page)).toBeVisible();
  await expect(page.locator('.wc-ph-hk')).toHaveCount(6);
  // Fewer: the slots above the count are neither shown nor reachable, and keep what they hold.
  for (const [n, labels] of [[5, ['shot', 'resc']], [4, ['resc']]] as const) {
    await page.evaluate((n) => window.__wc!.settings.update({ phone: { hotkeyCount: n } }), n);
    await expect(page.locator('.wc-ph-hot-col.is-second .wc-ph-hk')).toHaveText([...labels]);
    await expect(page.locator('.wc-ph-hk')).toHaveCount(n);
  }
  await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 1 } }));
  await expect(page.locator('.wc-ph-hot-col')).toHaveCount(1);
  await expect(page.locator('.wc-ph-hk')).toHaveText(['asst']);
  expect((await hotkeys(page)).map((k) => k.label)).toEqual(['asst', 'bash', 'wimp', 'resc', 'shot', 'rcvr']);
  expect(errors).toEqual([]);
});

test('six keys: a key of the second column sends its command; held, its box stands left of both columns and saves that slot', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await enterMock(page);
  await m.login();
  await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
  await expect(page.locator('.wc-ph-hk')).toHaveCount(6);
  await hk(page, 4).tap();
  await hk(page, 6).tap();
  await hk(page, 1).tap();
  await expect.poll(() => m.sent).toEqual(['rescue', 'recover', 'assist']);
  expect(await inputFocused(page)).toBe(false);
  // The box of K5: left of both columns, its notch at K5's height.
  await hold(page, hk(page, 5));
  await expect(rb(page).locator('.wc-ph-rb-k')).toHaveText('K5');
  await expect(hk(page, 5)).toHaveClass(/\bis-held\b/);
  const b = await box(rb(page));
  for (const n of [1, 2, 3, 4, 5, 6] as const) expect(b.x + b.width).toBeLessThanOrEqual((await box(hk(page, n))).x);
  const notch = await box(rb(page).locator('.wc-ph-rb-n'));
  const k5 = await box(hk(page, 5));
  expect(Math.abs(notch.y + notch.height / 2 - (k5.y + k5.height / 2))).toBeLessThan(3);
  await chip(page, 'bash').tap();
  await bt(page, 'Save').tap();
  await expect(rb(page)).toBeHidden();
  expect((await hotkeys(page))[4]).toEqual({ label: 'bash', command: 'bash', special: null, shown: true });
  await expect(hk(page, 5)).toHaveText('bash');
  // A key of the first column while the second stands between: no notch (it would point at the wrong key).
  await hold(page, hk(page, 2));
  await expect(rb(page).locator('.wc-ph-rb-k')).toHaveText('K2');
  await expect(rb(page).locator('.wc-ph-rb-n')).toBeHidden();
  // Hidden by its own switch: K5 leaves no hole (K6 moves down), the first column stays.
  await bt(page, 'Cancel').tap();
  await hold(page, hk(page, 5));
  await shown(page).tap();
  await bt(page, 'Save').tap();
  await expect(page.locator('.wc-ph-hot-col.is-second .wc-ph-hk')).toHaveText(['rcvr', 'resc']);
  expect((await box(hk(page, 6))).y).toBeCloseTo((await box(hk(page, 2))).y, 0);
  expect(errors).toEqual([]);
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
  // (Short on the chip, which has little width; said in full to a screen reader.)
  await expect(rb(page).locator('.wc-ph-spec .wc-ph-chip')).toHaveText([/wimpy 50\s% HP/, /wimpy 25\s% HP/]);
  await expect(special(page, 'wimpy50')).toHaveAttribute('aria-label', /wimpy 50\s% of current\sHP/);
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

test('Custom empties both fields and puts the cursor in Label; what is typed in the box never reaches the command line', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await hold(page, hk(page, 3));
  // A special shows as a token; Custom gives the field back, and the cursor is in the Label (stage 55).
  await expect(rb(page).locator('.wc-ph-rb-tok')).toBeVisible();
  await expect(command(page)).toBeHidden();
  await expect(special(page, 'wimpy50')).toHaveAttribute('aria-pressed', 'true');
  await chip(page, 'Custom'.toLowerCase()).tap();
  await expect(command(page)).toBeVisible();
  await expect(label(page)).toBeFocused();
  await expect(label(page)).toHaveValue('');
  await expect(command(page)).toHaveValue('');
  await expect(rb(page).locator('.wc-ph-rb-tok')).toBeHidden();
  await expect(special(page, 'wimpy50')).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(page, 'custom')).toHaveAttribute('aria-pressed', 'true');
  // (Our keyboard comes up for the field, the box staying whole above it: phone-own-keyboard-fields.spec.ts.)
  await expect(rb(page)).toBeVisible();
  await expect(label(page)).toBeFocused();
  // Typing goes to the box's field: not to the command line, and no macro or page key runs.
  await page.keyboard.type('ko');
  await expect(label(page)).toHaveValue('ko');
  // Enter in the Label while the Command is still to be written: on to the Command, nothing saved.
  await page.keyboard.press('Enter');
  await expect(rb(page)).toBeVisible();
  await expect(command(page)).toBeFocused();
  expect((await hotkeys(page))[2]!.special).toBe('wimpy50');
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
  // Enter in a field saves (the Label too, now that the key has its command).
  await page.keyboard.press('Enter');
  await expect(rb(page)).toBeHidden();
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
  expect(c.y + c.height - (k1.y + k1.height)).toBeCloseTo(130, 0);
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
  // Custom: our keyboard comes up for the Command field, and the box stands above it, in the lens's place.
  await chip(page, 'custom').tap();
  await expect(page.locator('html')).toHaveClass(/\bwc-okb\b/);
  await expect(lens(page)).toBeHidden();
  await expect(page.locator('.wc-cockpit > .wc-pane[data-pane="map"]')).toBeHidden();
  // Its keys stay, as a row.
  await expect(satrow(page)).toBeVisible();
  await expect(rb(page)).toBeVisible();
  // The box closes (and the keyboard with it): the lens is back.
  await bt(page, 'Cancel').tap();
  await expect(rb(page)).toBeHidden();
  await expect(lens(page)).toBeVisible();
  await expect(satrow(page)).toBeHidden();
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

  // Stage 52c: the lens stands left of the column (tests/e2e/phone-game-landscape.spec.ts has the
  // layout); here the hot keys' own part of it.
  test('the lens shows beside the column, with or without it; an open box hides the lens and its key row, and stays right of the strip\'s column', async ({ page }) => {
    const errors = watchErrors(page);
    await openPhone(page);
    await expect(hot(page)).toBeVisible();
    // 44 px keys; the lens at its full size (163 px on a 390 px short side), left of the column.
    expect((await box(hk(page, 1))).width).toBeCloseTo(44, 0);
    await expect(lens(page)).toBeVisible();
    await expect(satrow(page)).toBeHidden();
    const l = await box(lens(page));
    expect(l.width).toBeCloseTo(163, 0);
    expect(l.x + l.width).toBeLessThanOrEqual((await box(hot(page))).x);
    // K: the column goes, the lens stays where it is.
    await kKey(page).tap();
    await expect(hot(page)).toBeHidden();
    await expect(lens(page)).toBeVisible();
    expect((await box(lens(page))).x).toBeCloseTo(l.x, 0);
    await kKey(page).tap();
    await expect(hot(page)).toBeVisible();
    // The box fills the short screen's height: the lens gives way, and no key row lies on the box.
    await hold(page, hk(page, 1));
    await expect(rb(page)).toBeVisible();
    await expect(lens(page)).toBeHidden();
    await expect(satrow(page)).toBeHidden();
    // The strip opens as a column from the left: the box has room right of it and stays.
    await page.keyboard.press('Control+1');
    const strip = page.locator('.wc-cockpit > .wc-pane[data-phone-strip]');
    await expect(strip).toHaveCount(1);
    await expect(rb(page)).toBeVisible();
    const s = await box(strip);
    const b = await box(rb(page));
    expect(b.x).toBeGreaterThanOrEqual(s.x + s.width - 0.5);
    expect(b.x + b.width).toBeLessThanOrEqual((await box(hot(page))).x);
    // At the column's greatest width too (the box narrows to what is left).
    await page.evaluate(() => window.__wc!.settings.update({ phone: { sideCols: 200 } }));
    await expect.poll(async () => (await box(strip)).width).toBeGreaterThan(s.width);
    const s2 = await box(strip);
    const b2 = await box(rb(page));
    await expect(rb(page)).toBeVisible();
    expect(b2.x).toBeGreaterThanOrEqual(s2.x + s2.width - 0.5);
    expect(b2.width).toBeGreaterThanOrEqual(200);
    await bt(page, 'Cancel').scrollIntoViewIfNeeded();
    await bt(page, 'Cancel').tap();
    await expect(rb(page)).toBeHidden();
    await expect(lens(page)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// ------------------------------------------------- a hold with no room

/**
 * Records, from now on, every change of what a box makes way with (the lens,
 * its key row, the map's pane, the hot keys' lit state), each layout and
 * each window size sent to MUME.
 */
async function watchScreen(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __seen: string[] };
    w.__seen = [];
    const mo = new MutationObserver((ms) => {
      for (const m of ms) {
        const t = m.target as HTMLElement;
        w.__seen.push(`${t.classList[0] ?? t.tagName} ${m.attributeName}=${t.getAttribute(m.attributeName!)}`);
      }
    });
    for (const el of document.querySelectorAll('.wc-ph-lens, .wc-ph-satrow, .wc-cockpit > .wc-pane[data-pane="map"]')) mo.observe(el, { attributes: true });
    mo.observe(document.querySelector('.wc-ph-hot')!, { attributes: true, subtree: true });
    window.__wc!.app.cockpit.onLayout(() => w.__seen.push('layout'));
    const s = window.__wc!.app.session;
    const orig = s.setWindowSize.bind(s);
    s.setWindowSize = (c: number, r: number) => {
      w.__seen.push(`naws ${c}x${r}`);
      return orig(c, r);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __seen: string[] }).__seen.slice());
}

/** A press that stays down well past the hold's time (a fixed wait: the box may not come). */
const longPress = (page: Page, l: Locator) => finger(page, l, () => page.waitForTimeout(900));

// Round 53j: what is above the game text and would lie under the box is taken out of the layout
// for the box (Comm first, then the strip's pane) and comes back when the box closes. Before
// that round such a hold was refused (stage 53d, 53e, 53i). A hold is still refused, with nothing
// changed, where the box has no room whatever is taken out.
const pgLayout = (page: Page) => page.evaluate(() => window.__wc!.app.cockpit.phoneGameLayout!);

test.describe('a hold with panes above the game text: they give way to the box', () => {
  /** Rows of a pane that the box cannot clear at 360 × 800. */
  const TALL = 26;
  test.use({ viewport: { width: 360, height: 800 } });

  for (const [what, open, part] of [
    // (Taller than they open: the box is low since stage 55, and clears them as they come.)
    [
      'a tall Comm',
      async (page: Page) => {
        await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
        await page.evaluate((rows) => window.__wc!.settings.update({ phone: { commRows: rows } }), TALL);
      },
      'comm',
    ],
    [
      'a tall strip pane',
      async (page: Page) => {
        await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
        await page.evaluate((rows) => window.__wc!.settings.update({ phone: { stripRows: rows } }), TALL);
      },
      'strip',
    ],
  ] as const) {
    test(`portrait, ${what} open: the box opens and ${what} is out of the layout meanwhile; one window size out and one back`, async ({ page }) => {
      const errors = watchErrors(page);
      await openPhone(page);
      await expect(lens(page)).toBeVisible();
      await open(page);
      await expect(page.locator('.wc-ph-comm-band, .wc-ph-strip').locator('visible=true').first()).toBeVisible();
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      const was = await pgLayout(page);
      expect(was[part].h).toBeGreaterThan(0);
      expect(was.hidden).toEqual({ strip: false, comm: false });
      const seen = await watchScreen(page);
      await hold(page, hk(page, 1));
      await expect(rb(page)).toBeVisible();
      await expect(hk(page, 1)).toHaveClass(/\bis-held\b/);
      const g = await pgLayout(page);
      expect(g.hidden[part]).toBe(true);
      expect(g[part].h).toBe(0);
      expect(g.game.h).toBe(was.game.h + was[part].h);
      // The box is whole on screen, clear of what is above the game text.
      const b = await box(rb(page));
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect((await seen()).filter((e) => e.startsWith('naws'))).toHaveLength(1);
      // Cancel: everything back as it was, in one layout.
      await bt(page, 'Cancel').tap();
      await expect(rb(page)).toBeHidden();
      await expect.poll(async () => (await pgLayout(page)).hidden).toEqual({ strip: false, comm: false });
      const back = await pgLayout(page);
      expect([back.strip, back.comm, back.game]).toEqual([was.strip, was.comm, was.game]);
      expect((await seen()).filter((e) => e.startsWith('naws'))).toHaveLength(2);
      await expect(page.locator(part === 'comm' ? '.wc-ph-sat[data-sat="comm"]:visible' : '.wc-ph-sat[data-sat="panes"]:visible')).toHaveAttribute('aria-pressed', 'true');
      expect(errors).toEqual([]);
    });
  }

  test('portrait, a tall Comm and our keyboard open: the hold folds the keyboard and opens the box, Comm out of the layout; one window size', async ({ page }) => {
    const errors = watchErrors(page);
    await openPhone(page);
    await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
    await page.evaluate((rows) => window.__wc!.settings.update({ phone: { commRows: rows } }), TALL);
    await field(page).tap();
    await expect(page.locator('.wc-ph-okb')).toBeVisible();
    await expect(hk(page, 1)).toBeVisible();
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const seen = await watchScreen(page);
    await hold(page, hk(page, 1));
    await expect(rb(page)).toBeVisible();
    await expect(page.locator('.wc-ph-okb')).toBeHidden();
    await expect(page.locator('html')).not.toHaveClass(/\bwc-okb\b/);
    const g = await pgLayout(page);
    expect([g.bottom, g.hidden.comm, g.comm.h]).toEqual([0, true, 0]);
    expect((await seen()).filter((e) => e.startsWith('naws'))).toHaveLength(1);
    // The finger's release did not open the keyboard again, and Cancel brings Comm back.
    await page.waitForTimeout(300);
    await expect(page.locator('.wc-ph-okb')).toBeHidden();
    await bt(page, 'Cancel').tap();
    await expect.poll(async () => (await pgLayout(page)).comm.h).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

test.describe('a refused hold with our keyboard and Comm open (portrait)', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  // Stage 56 (left by 53e): the hold's answer is worked out on the layouts that would be, before
  // the keyboard folds. No real screen was found where a K key shows over our keyboard and the box
  // has no room without it (360 and 412 wide, 280 to 800 high, a fight, six keys), so the layout
  // that would be is made to have none here: the fight card is reported 40 rows taller.
  test('the box has no room on the layout without the keyboard: nothing changes, the keyboard stays up; with room again the same hold opens the box', async ({ page }) => {
    const errors = watchErrors(page);
    await openPhone(page);
    await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
    await field(page).tap();
    const okb = page.locator('.wc-ph-okb');
    await expect(okb).toBeVisible();
    await expect(hk(page, 1)).toBeVisible();
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.evaluate(() => {
      const c = window.__wc!.app.cockpit;
      const w = window as unknown as { __asked: number; __real: typeof c.phoneGameLayoutIf; __okb: string[] };
      w.__asked = 0;
      w.__real = c.phoneGameLayoutIf.bind(c);
      c.phoneGameLayoutIf = (ask) => {
        w.__asked++;
        const g = w.__real(ask);
        return g && { ...g, fight: { ...g.fight, h: g.fight.h + 40 }, game: { ...g.game, y: g.game.y + 40 } };
      };
      // Every change of the keyboard, the page's keyboard class and Comm's pane.
      w.__okb = [];
      const mo = new MutationObserver((ms) => {
        for (const m of ms) w.__okb.push(`${(m.target as HTMLElement).classList[0] ?? (m.target as HTMLElement).tagName} ${m.attributeName}`);
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      mo.observe(document.querySelector('.wc-ph-okb')!, { attributes: true });
      mo.observe(document.querySelector('.wc-cockpit > .wc-pane[data-pane="comm"]')!, { attributes: true });
    });
    const was = await pgLayout(page);
    expect(was.bottom).toBeGreaterThan(0);
    expect(was.comm.h).toBeGreaterThan(0);
    const at = await box(okb);
    const seen = await watchScreen(page);
    await longPress(page, hk(page, 1));
    expect(await page.evaluate(() => (window as unknown as { __asked: number }).__asked)).toBeGreaterThan(0);
    await expect(rb(page)).toBeHidden();
    // Nothing at all: no layout, no window size, nothing shown or hidden, the keyboard where it was.
    expect(await seen()).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __okb: string[] }).__okb)).toEqual([]);
    expect(await pgLayout(page)).toEqual(was);
    await expect(okb).toBeVisible();
    expect(await box(okb)).toEqual(at);
    await expect(page.locator('html')).toHaveClass(/\bwc-okb\b/);
    await expect(hk(page, 1)).not.toHaveClass(/\bis-held\b/);
    // The keyboard still types.
    await okb.locator('.wc-ph-okb-k[data-ch="q"]').tap();
    await expect(field(page)).toHaveValue('q');
    // With room (the real layouts): the same hold folds the keyboard and opens the box.
    await page.evaluate(() => {
      window.__wc!.app.cockpit.phoneGameLayoutIf = (window as unknown as { __real: never }).__real;
    });
    await hold(page, hk(page, 1));
    await expect(rb(page)).toBeVisible();
    await expect(okb).toBeHidden();
    expect(errors).toEqual([]);
  });
});

// Stage 56, after 56a: landscape too. There the box stands right of the left column, and the
// column always ends well left of the hot keys (the cockpit's `setPhoneSideClear`), so on a real
// screen the hold is never refused for room: the first test of each pair. The answer is still
// worked out before the keyboard folds, on the layout that would be without it; no real screen
// makes that one refuse, so the second test gives the layout without the keyboard a column that
// reaches the right edge (both as the layout that would be and as the one laid out).
for (const [name, viewport, query] of [
  ['a phone on its side (844 × 390)', { width: 844, height: 390 }, 'phone=1&kbd=en'],
  ['a tablet on its side (1180 × 820)', { width: 1180, height: 820 }, 'tablet=phone&kbd=en'],
] as const) {
  test.describe(`a hold with our keyboard up in landscape, ${name}`, () => {
    test.use({ viewport });

    for (const comm of [false, true]) {
      const what = comm ? 'the keyboard and Comm' : 'the keyboard alone';

      /** The cockpit in landscape with our keyboard up (and Comm in the left column), settled. */
      const open = async (page: Page): Promise<Locator> => {
        await page.goto(`/?replay&${query}`);
        await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
        await expect(pad(page)).toBeVisible();
        if (comm) await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
        await field(page).tap();
        const okb = page.locator('.wc-ph-okb');
        await expect(okb).toBeVisible();
        await expect(hk(page, 1)).toBeVisible();
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        const g = await pgLayout(page);
        expect([g.landscape, g.bottom > 0, g.side.w > 0]).toEqual([true, true, comm]);
        return okb;
      };

      test(`${what}: the hold folds the keyboard and opens the box right of the column; one window size; Comm stays`, async ({ page }) => {
        const errors = watchErrors(page);
        const okb = await open(page);
        const was = await pgLayout(page);
        const seen = await watchScreen(page);
        await hold(page, hk(page, 1));
        await expect(rb(page)).toBeVisible();
        await expect(okb).toBeHidden();
        await expect(page.locator('html')).not.toHaveClass(/\bwc-okb\b/);
        const g = await pgLayout(page);
        expect([g.bottom, g.hidden, g.side.w, g.comm.h > 0]).toEqual([0, { strip: false, comm: false }, was.side.w, comm]);
        const b = await box(rb(page));
        expect(b.x).toBeGreaterThanOrEqual(g.side.w * (await page.evaluate(() => window.__wc!.cells.get().w)) - 0.5);
        expect(b.width).toBeGreaterThanOrEqual(200);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect((await seen()).filter((e) => e.startsWith('naws'))).toHaveLength(1);
        // The finger's release did not open the keyboard again.
        await page.waitForTimeout(300);
        await expect(okb).toBeHidden();
        expect(errors).toEqual([]);
      });

      test(`${what}, no room on the layout without the keyboard: nothing changes, the keyboard stays up and types`, async ({ page }) => {
        const errors = watchErrors(page);
        const okb = await open(page);
        await page.evaluate(() => {
          const c = window.__wc!.app.cockpit;
          type G = NonNullable<typeof c.phoneGameLayout>;
          const w = window as unknown as { __asked: number; __okb: string[] };
          // A layout without the keyboard has a left column over the whole width.
          const full = <T extends G | null>(g: T): T => (g && g.bottom === 0 ? { ...g, side: { ...g.side, w: g.game.x + g.game.w } } : g);
          const realIf = c.phoneGameLayoutIf.bind(c);
          w.__asked = 0;
          c.phoneGameLayoutIf = (ask) => {
            w.__asked++;
            return full(realIf(ask));
          };
          const real = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(c), 'phoneGameLayout')!.get!;
          Object.defineProperty(c, 'phoneGameLayout', { configurable: true, get: () => full(real.call(c) as G | null) });
          // Every change of the keyboard, the page's keyboard class, the box and Comm's pane.
          w.__okb = [];
          const mo = new MutationObserver((ms) => {
            for (const m of ms) w.__okb.push(`${(m.target as HTMLElement).classList[0] ?? (m.target as HTMLElement).tagName} ${m.attributeName}`);
          });
          mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
          mo.observe(document.querySelector('.wc-ph-okb')!, { attributes: true });
          mo.observe(document.querySelector('.wc-cockpit > .wc-pane[data-pane="comm"]')!, { attributes: true });
        });
        const was = await pgLayout(page);
        expect(was.bottom).toBeGreaterThan(0);
        const at = await box(okb);
        const focused = await inputFocused(page);
        const seen = await watchScreen(page);
        await longPress(page, hk(page, 1));
        await expect(rb(page)).toBeHidden();
        // Nothing at all: no layout, no window size, nothing shown or hidden, the keyboard where it was.
        await expect(okb).toBeVisible();
        expect(await seen()).toEqual([]);
        expect(await page.evaluate(() => (window as unknown as { __okb: string[] }).__okb)).toEqual([]);
        expect(await pgLayout(page)).toEqual(was);
        expect(await box(okb)).toEqual(at);
        await expect(page.locator('html')).toHaveClass(/\bwc-okb\b/);
        await expect(hk(page, 1)).not.toHaveClass(/\bis-held\b/);
        expect(await inputFocused(page)).toBe(focused);
        // (And the answer came from the layout that would be.)
        expect(await page.evaluate(() => (window as unknown as { __asked: number }).__asked)).toBeGreaterThan(0);
        // The keyboard still types.
        await okb.locator('.wc-ph-okb-k[data-ch="q"]').tap();
        await expect(field(page)).toHaveValue('q');
        expect(errors).toEqual([]);
      });
    }
  });
}

test.describe('a hold with no room for the box', () => {
  // A screen so low that the box would be under its least height beside the columns, though the
  // layout itself still fits (a split screen): nothing above the game text to take out helps.
  test.use({ viewport: { width: 300, height: 310 } });

  test('portrait, a low screen: no box, and nothing on screen changes (the lens does not blink); nothing is sent', async ({ page }) => {
    const errors = watchErrors(page);
    await openPhone(page);
    await page.evaluate(() => window.__wc!.settings.update({ appearance: { size: 10 } }));
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    expect((await pgLayout(page)).tooSmall).toBe(false);
    await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const was = await pgLayout(page);
    const sent = await page.evaluate(() => window.__wc!.app.output.measureCells().rows);
    const seen = await watchScreen(page);
    await longPress(page, hk(page, 1));
    await expect(rb(page)).toBeHidden();
    expect(await seen()).toEqual([]);
    expect(await pgLayout(page)).toEqual(was);
    expect(await page.evaluate(() => window.__wc!.app.output.measureCells().rows)).toBe(sent);
    // The key is as it was: the K key still folds the column.
    await expect(hk(page, 1)).not.toHaveClass(/\bis-held\b/);
    await kKey(page).tap();
    await expect(hot(page)).toBeHidden();
    expect(errors).toEqual([]);
  });
});
