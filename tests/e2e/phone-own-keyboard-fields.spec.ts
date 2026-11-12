// Stage 53d (ADR 0138 §1, §3, §6, §7): our own keyboard in the other text
// fields of the phone's game layout, its layout setting, and the keys'
// vibration. The keyboard is the layout's by default since round 53e
// (phone-own-keyboard.spec.ts has the gate); most cases here name the
// layout (`?kbd=en`) so they do not depend on the browser's language.
//
// - Comm's reply line and search field, the hot key box's Label and
//   Command, a script pane's field: each asks the device for no keyboard, a
//   tap on it opens ours for it, and the keys type through an adapter that
//   runs the field's own logic (an `input` event; never a key event).
//   Enter is the field's own action: the reply is sent, the box saves, the
//   script gets its submit; the search has none.
// - The layout with the keyboard up: Comm keeps its rows while it is typed
//   in (a short screen: the hot key columns give way to it); the hot key
//   box stands whole above the keyboard.
// - A field that goes away while it is typed in (Comm or its search
//   closed, the strip's page changed, a script's pane gone) hands the keys
//   back to the command line at once (53e).
// - With `?kbd=0` none of those fields is marked and nothing opens.
//
// `phone` project. The sending cases play against a `page.routeWebSocket`
// mock; nothing reaches MUME.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const pad = (page: Page) => page.locator('.wc-ph-pad');
const hot = (page: Page) => page.locator('.wc-ph-hot');
const okb = (page: Page) => page.locator('.wc-ph-okb');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const html = (page: Page) => page.locator('html');
const rb = (page: Page) => page.locator('.wc-ph-rb');
const label = (page: Page) => rb(page).locator('#wc-ph-rb-label');
const command = (page: Page) => rb(page).locator('#wc-ph-rb-command');
const key = (page: Page, k: string) => okb(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const hk = (page: Page, n: number) => page.locator(`.wc-ph-hk[data-hk="${n - 1}"]`);
const compass = (page: Page, cmd: string) => pad(page).locator(`.wc-ph-key[data-cmd="${cmd}"]`);
const layout = (page: Page) => page.evaluate(() => window.__wc!.app.cockpit.phoneGameLayout!);
const comm = (page: Page) => page.locator('.wc-pane[data-pane="comm"]');
const reply = (page: Page) => comm(page).locator('.wc-cm-rinput');
const search = (page: Page) => comm(page).locator('.wc-cm-sinput');
const sheet = (page: Page) => page.locator('.wc-ph-sheet');
const pageEl = (page: Page) => page.locator('.wc-ph-page');
const srow = (page: Page, id: string) => pageEl(page).locator(`[data-row="${id}"]`);
const rowsOf = (page: Page) =>
  okb(page)
    .locator('.wc-ph-okb-row')
    .evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll<HTMLElement>('.wc-ph-okb-k')].map((k) => k.dataset.ch ?? `<${k.dataset.act}>`).join('')));

const S21 = { width: 360, height: 800 };
const S21_LAND = { width: 800, height: 360 };

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openPhone(page: Page, query = '&kbd=en'): Promise<void> {
  await page.goto(`/?replay&phone=1${query}`);
  await expect(html(page)).toHaveClass(/\bwc-phone\b/);
  await expect(pad(page)).toBeVisible();
}

async function type(page: Page, ...keys: string[]): Promise<void> {
  for (const k of keys) await key(page, k).tap();
}

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function setScreen(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await expect.poll(async () => (await box(page.locator('#app'))).height).toBe(size.height);
  await expect.poll(async () => (await layout(page)).landscape).toBe(size.width > size.height);
  await frames(page);
}

/** Every window size told to the session (what becomes NAWS) from now on. */
async function watchSizes(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const s = window.__wc!.app.session;
    const log: string[] = ((window as unknown as { __sizes: string[] }).__sizes = []);
    const set = s.setWindowSize.bind(s);
    s.setWindowSize = (cols: number, rows: number) => {
      log.push(`${cols}x${rows}`);
      set(cols, rows);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __sizes: string[] }).__sizes);
}

/** Every keydown and keyup the page sees from now on (our keys must make none). */
async function watchKeys(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const log: string[] = ((window as unknown as { __keys: string[] }).__keys = []);
    for (const t of ['keydown', 'keyup', 'keypress']) window.addEventListener(t, (e) => log.push(`${t}:${(e as KeyboardEvent).key}`), true);
  });
  return () => page.evaluate(() => (window as unknown as { __keys: string[] }).__keys);
}

/** A hold on `l` through CDP (a real touch): the finger stays down until the box is open, then lifts. */
async function hold(page: Page, l: Locator): Promise<void> {
  const b = await box(l);
  const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 0 };
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await expect(rb(page)).toBeVisible();
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
}

/** A slow tap on `l` through CDP (a real finger): down, `ms` later up at the same place; the browser then makes its click where the finger was. */
async function slowTap(page: Page, l: Locator, ms = 150): Promise<void> {
  const b = await box(l);
  const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 0 };
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await page.waitForTimeout(ms);
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
}

/** Whether Comm is told to keep its rows for the keyboard's target (`Cockpit.setPhoneCommKeep`). */
const commKeep = (page: Page) => page.evaluate(() => (window.__wc!.app.cockpit as unknown as { pgCommKeep: boolean }).pgCommKeep);

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const gmcp = (pkg: string, data: unknown): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);

interface Mock {
  sent: string[];
  server: () => WebSocketRoute;
}

/** Enters MUME on `?phone=1` (with `query`) against a mock and logs in; `before` runs on the start page. */
async function play(page: Page, query = '&kbd=en', before: () => Promise<void> = async () => {}): Promise<Mock> {
  let server: WebSocketRoute | null = null;
  const sent: string[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => {
      const t = (typeof m === 'string' ? Buffer.from(m) : m).toString('latin1');
      if (!t.startsWith('\xff')) sent.push(...t.split(/\r?\n/).filter((l) => l !== '' && !l.startsWith('change width')));
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto(`/?phone=1${query}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await before();
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(pad(page)).toBeVisible();
  server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
  return { sent, server: () => server! };
}

/** A tell from Gibur, Comm opened on that chat: the reply line is there. */
async function openTell(page: Page, m: Mock): Promise<void> {
  m.server().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: "Gibur tells you 'you at the ford?'" }));
  await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
  await expect(comm(page)).toBeVisible();
  await comm(page).locator('.wc-cm-ent[aria-label^="Gibur"]').tap();
  await expect(reply(page)).toBeVisible();
}

// ------------------------------------------------------------------- Comm

test('Comm\'s reply line: a tap opens our keyboard for it, a tell is typed with our keys and sent with our Enter', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, S21);
  await openTell(page, m);
  // The field asks the device for no keyboard before it is ever tapped.
  await expect(reply(page)).toHaveAttribute('inputmode', 'none');
  await expect(reply(page)).toHaveAttribute('virtualkeyboardpolicy', 'manual');
  const sizes = await watchSizes(page);
  const keys = await watchKeys(page);
  await reply(page).tap();
  await expect(okb(page)).toBeVisible();
  await expect(reply(page)).toBeFocused();
  await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
  // One window size for the opening.
  await frames(page);
  expect(await sizes()).toHaveLength(1);
  // The reply line has no history: the arrows are dimmed.
  await expect(key(page, 'older')).toHaveAttribute('aria-disabled', 'true');
  await expect(key(page, 'newer')).toHaveAttribute('aria-disabled', 'true');
  await type(page, 'shift', 'y', 'e', 's', 'space', 'a', 't', 'x', 'back', 'space', 'f', 'o', 'r', 'd');
  await expect(reply(page)).toHaveValue('Yes at ford');
  await expect(field(page)).toHaveValue('');
  // The reply line is on screen above the keyboard, inside Comm.
  const r = await box(reply(page));
  const k = await box(okb(page));
  expect(r.y + r.height).toBeLessThanOrEqual(k.y + 0.5);
  expect(r.y).toBeGreaterThanOrEqual(0);
  await type(page, 'enter');
  await expect.poll(() => m.sent).toEqual(['tell Gibur Yes at ford']);
  // Sent: the line is empty, keeps the focus and the keyboard for the next one.
  await expect(reply(page)).toHaveValue('');
  await expect(reply(page)).toBeFocused();
  await expect(okb(page)).toBeVisible();
  await type(page, 'o', 'k', 'enter');
  await expect.poll(() => m.sent).toEqual(['tell Gibur Yes at ford', 'tell Gibur ok']);
  // Nothing of it went into the command line's history, and no key event was made up.
  expect(await page.evaluate(() => window.__wc!.app.input.getHistory())).toEqual([]);
  expect(await keys()).toEqual([]);
  // A tap on the command field: the same keyboard, now typing there, with its history arrows.
  await field(page).tap();
  await expect(field(page)).toBeFocused();
  await expect(key(page, 'older')).not.toHaveAttribute('aria-disabled');
  await type(page, 'l');
  await expect(field(page)).toHaveValue('l');
  await expect(reply(page)).toHaveValue('');
  await frames(page);
  expect(await sizes()).toHaveLength(1);
  // The fold key closes it and blurs the field it typed in.
  await reply(page).tap();
  await expect(reply(page)).toBeFocused();
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await expect(reply(page)).not.toBeFocused();
  expect(errors).toEqual([]);
});

test('Comm\'s search: its key opens our keyboard for the field, typing filters as when typed, Enter does nothing', async ({ page }) => {
  const m = await play(page);
  await setScreen(page, S21);
  await openTell(page, m);
  m.server().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Dorn', 'talker-type': 'player', text: "Dorn tells you 'bring arrows'" }));
  await expect(search(page)).toHaveAttribute('inputmode', 'none');
  // The search key focuses the field: our keyboard opens for it (a focus that a pointer brought).
  await comm(page).locator('.wc-cm-sbtn').tap();
  await expect(search(page)).toBeFocused();
  await expect(okb(page)).toBeVisible();
  await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
  await type(page, 'a', 'r', 'r', 'o', 'w');
  await expect(search(page)).toHaveValue('arrow');
  // The field's own `input` listener ran: the results list the message.
  const results = comm(page).locator('.wc-cm-results');
  await expect(results).toBeVisible();
  await expect(results).toContainText('bring arrows');
  await expect(results).not.toContainText('ford');
  // Enter has no action in the search field (as the Enter key has none).
  await type(page, 'enter');
  await expect(search(page)).toHaveValue('arrow');
  await expect(results).toContainText('bring arrows');
  await type(page, 'back', 'back', 'back', 'back', 'back', 'f', 'o', 'r', 'd');
  await expect(search(page)).toHaveValue('ford');
  await expect(results).toContainText('ford');
  expect(m.sent).toEqual([]);
  // The search closes (its key): the field is gone, and the keys type in the command line again.
  await comm(page).locator('.wc-cm-sclear').tap();
  await expect(search(page)).toBeHidden();
  await expect(okb(page)).toBeVisible();
  await type(page, 'n');
  await expect(field(page)).toHaveValue('n');
  await expect(search(page)).toHaveValue('');
});

test('a short portrait screen: Comm keeps its rows while its reply is typed in, the hot key columns give way; one window size per change', async ({ page }) => {
  const m = await play(page);
  await setScreen(page, { width: 360, height: 520 });
  await openTell(page, m);
  const closed = await layout(page);
  expect(closed.comm.h).toBeGreaterThanOrEqual(6);
  // The command field: Comm has no room above the lifted hot keys and gives way (as before 53d).
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  const line = await layout(page);
  expect(line.bottom).toBeGreaterThan(0);
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await frames(page);
  await expect(reply(page)).toBeVisible();
  // The reply line: Comm stays at its least rows or more; the columns are what gives way.
  const sizes = await watchSizes(page);
  await reply(page).tap();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  const g = await layout(page);
  expect(g.comm.h).toBeGreaterThanOrEqual(6);
  expect(g.game.h).toBeGreaterThanOrEqual(3);
  await expect(reply(page)).toBeVisible();
  await expect(reply(page)).toBeFocused();
  const r = await box(reply(page));
  const k = await box(okb(page));
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.y + r.height).toBeLessThanOrEqual(k.y + 0.5);
  if (g.overLimit) {
    await expect(hot(page)).toBeHidden();
    await expect(page.locator('.wc-ph-layer')).toHaveAttribute('data-okb-nok', '');
  }
  expect(line.comm.h === 0 ? g.overLimit : true).toBe(true);
  expect(await sizes()).toHaveLength(1);
  await type(page, 'h', 'i', 'enter');
  await expect.poll(() => m.sent).toEqual(['tell Gibur hi']);
  // Closed again: one more size, and the columns are back.
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await frames(page);
  expect(await sizes()).toHaveLength(2);
  await expect(hot(page)).toBeVisible();
  await expect(page.locator('.wc-ph-layer')).not.toHaveAttribute('data-okb-nok');
});

test('a low portrait window with six K keys and Comm open: a fold of the digit row is one window size (review finding A)', async ({ page }) => {
  await openPhone(page);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
  await setScreen(page, { width: 320, height: 480 });
  await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
  await frames(page);
  const sizes = await watchSizes(page);
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await frames(page);
  expect(await sizes()).toHaveLength(1);
  for (const n of [5, 4, 5]) {
    const before = (await sizes()).length;
    await key(page, 'digits').tap();
    await expect.poll(() => rowsOf(page).then((r) => r.length)).toBe(n);
    await frames(page);
    await frames(page);
    expect((await sizes()).length - before).toBeLessThanOrEqual(1);
  }
  // The same on a screen where the columns come and go with the digit row.
  for (const h of [440, 520, 560, 600]) {
    await setScreen(page, { width: 320, height: h });
    if (!(await okb(page).isVisible())) await field(page).tap();
    await expect(okb(page)).toBeVisible();
    await frames(page);
    for (let i = 0; i < 2; i++) {
      const before = (await sizes()).length;
      await key(page, 'digits').tap();
      await frames(page);
      await frames(page);
      expect((await sizes()).length - before, `${h} px, toggle ${i}`).toBeLessThanOrEqual(1);
    }
  }
});

test('landscape: the reply line is typed in from the band, in Comm\'s column above it', async ({ page }) => {
  const m = await play(page);
  await setScreen(page, S21_LAND);
  await openTell(page, m);
  await reply(page).tap();
  await expect(okb(page)).toBeVisible();
  await expect(reply(page)).toBeFocused();
  await type(page, 'o', 'n', 'space', 'm', 'y', 'space', 'w', 'a', 'y');
  await expect(reply(page)).toHaveValue('on my way');
  const r = await box(reply(page));
  const k = await box(okb(page));
  expect(r.y + r.height).toBeLessThanOrEqual(k.y + 0.5);
  await type(page, 'enter');
  await expect.poll(() => m.sent).toEqual(['tell Gibur on my way']);
});

// ----------------------------------------------------------- the hot key box

for (const size of [S21, S21_LAND]) {
  test(`the hot key box (${size.width} × ${size.height}): a tap in a field opens our keyboard with the box staying; label and command typed, Enter saves, the key sends the new command`, async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, size);
    await hold(page, hk(page, 1));
    await expect(rb(page)).toBeVisible();
    await expect(okb(page)).toBeHidden();
    await expect(label(page)).toHaveAttribute('inputmode', 'none');
    await expect(command(page)).toHaveAttribute('inputmode', 'none');
    const keys = await watchKeys(page);
    // The Command field: our keyboard, the box still open and whole above it.
    await command(page).tap();
    await expect(okb(page)).toBeVisible();
    await expect(rb(page)).toBeVisible();
    await expect(command(page)).toBeFocused();
    await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
    await frames(page);
    const b = await box(rb(page));
    const k = await box(okb(page));
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(k.y + 0.5);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(size.width + 0.5);
    // Both fields are on screen in it.
    for (const f of [label(page), command(page)]) {
      const fb = await box(f);
      expect(fb.y).toBeGreaterThanOrEqual(b.y);
      expect(fb.y + fb.height).toBeLessThanOrEqual(k.y + 0.5);
    }
    // A key of ours is a press outside the box: it does not close it.
    // (The tap put the caret where the finger was: to the end, then everything is taken away.)
    const was = await command(page).inputValue();
    await command(page).evaluate((el: HTMLInputElement) => el.setSelectionRange(el.value.length, el.value.length));
    for (let i = 0; i < [...was].length; i++) await key(page, 'back').tap();
    await expect(command(page)).toHaveValue('');
    await expect(rb(page)).toBeVisible();
    await type(page, 'k', 'i', 'c', 'k', 'space', 'o', 'r', 'c');
    await expect(command(page)).toHaveValue('kick orc');
    // The field's own logic ran: "Would send now" follows.
    await expect(rb(page).locator('.wc-ph-rb-say')).toContainText('kick orc');
    // The Label field: the keys follow the tap; its own cleaning holds it to four characters.
    await label(page).tap();
    await expect(label(page)).toBeFocused();
    await expect(okb(page)).toBeVisible();
    const lab = await label(page).inputValue();
    await label(page).evaluate((el: HTMLInputElement) => el.setSelectionRange(el.value.length, el.value.length));
    for (let i = 0; i < [...lab].length; i++) await key(page, 'back').tap();
    await expect(label(page)).toHaveValue('');
    await type(page, 'shift', 'k', 'i', 'c', 'k', 's');
    await expect(label(page)).toHaveValue('Kick');
    expect(await keys()).toEqual([]);
    // Enter is the box's Save: the box closes, and the keyboard with it (as the screen was before the box).
    await type(page, 'enter');
    await expect(rb(page)).toBeHidden();
    await expect(okb(page)).toBeHidden();
    await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
    await expect.poll(async () => (await layout(page)).bottom).toBe(0);
    expect(await page.evaluate(() => window.__wc!.settings.get().phone.hotkeys[0])).toMatchObject({ label: 'Kick', command: 'kick orc' });
    // The release of the finger on Enter did not end as a tap on what moved under it.
    await frames(page);
    await expect(okb(page)).toBeHidden();
    await expect(sheet(page)).toHaveCount(0);
    expect(m.sent).toEqual([]);
    await expect(hk(page, 1)).toHaveText('Kick');
    await hk(page, 1).tap();
    await expect.poll(() => m.sent).toEqual(['kick orc']);
    expect(errors).toEqual([]);
  });
}

for (const size of [S21, S21_LAND]) {
  test(`Enter as Save with a slow finger (${size.width} × ${size.height}): the release does not end as a tap on what moved under it (53d review)`, async ({ page }) => {
    const errors = watchErrors(page);
    await openPhone(page);
    await setScreen(page, size);
    await hold(page, hk(page, 1));
    await command(page).tap();
    await expect(okb(page)).toBeVisible();
    await expect(rb(page)).toBeVisible();
    await type(page, 'x');
    await frames(page);
    const sizes = await watchSizes(page);
    // The finger rests on Enter: the box is saved and closes with the keyboard at the press,
    // the rows move, and the finger lifts over whatever stands there now.
    await slowTap(page, key(page, 'enter'));
    await expect(rb(page)).toBeHidden();
    await expect(okb(page)).toBeHidden();
    // Nothing comes back: no keyboard, no focus in the command field, no menu, one window size.
    await page.waitForTimeout(350);
    await frames(page);
    await expect(okb(page)).toBeHidden();
    await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
    await expect(field(page)).not.toBeFocused();
    await expect(sheet(page)).toHaveCount(0);
    expect((await layout(page)).bottom).toBe(0);
    expect(await sizes()).toHaveLength(1);
    expect(await page.evaluate(() => window.__wc!.settings.get().phone.hotkeys[0]!.command)).toMatch(/x/);
    // The next tap is not lost.
    await field(page).tap();
    await expect(okb(page)).toBeVisible();
    await expect(field(page)).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('the hot key box and the keyboard: Cancel and a press outside close both; a tap on the command field hands the keyboard over', async ({ page }) => {
  await openPhone(page);
  await setScreen(page, S21);
  // Cancel.
  await hold(page, hk(page, 2));
  await command(page).tap();
  await expect(okb(page)).toBeVisible();
  await type(page, 'x');
  await rb(page).getByRole('button', { name: 'Cancel' }).tap();
  await expect(rb(page)).toBeHidden();
  await expect(okb(page)).toBeHidden();
  const stored = await page.evaluate(() => window.__wc!.settings.get().phone.hotkeys[1]!.command);
  expect(stored).not.toContain('x');
  // A press outside (the game text).
  await hold(page, hk(page, 2));
  await label(page).tap();
  await expect(okb(page)).toBeVisible();
  await page.locator('.wc-game').tap({ position: { x: 40, y: 60 } });
  await expect(rb(page)).toBeHidden();
  await expect(okb(page)).toBeHidden();
  await expect.poll(async () => (await layout(page)).bottom).toBe(0);
  // A tap on the command field: the box closes, the keyboard stays and types in the line, with no size in between.
  await hold(page, hk(page, 2));
  await command(page).tap();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  const sizes = await watchSizes(page);
  await field(page).tap();
  await expect(rb(page)).toBeHidden();
  await expect(okb(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  await type(page, 'o', 'k');
  await expect(field(page)).toHaveValue('ok');
  await frames(page);
  expect(await sizes()).toEqual([]);
  // A hold with the keyboard open still folds it and opens the box (53c).
  await hold(page, hk(page, 1));
  await expect(rb(page)).toBeVisible();
  await expect(okb(page)).toBeHidden();
});

// ------------------------------------------------------- a script pane's field

test('a script pane\'s field: typed with our keys, the script hears each change and the submit, and the keys go back to the command line', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page, '&kbd=en', async () => {
    await page.evaluate(async (src) => {
      const l = window.__wc!.shell.scripts!;
      await l.init();
      await l.create('ask', src);
      await l.setEnabled('ask', true);
    }, `-- @name ask\n-- @api 1\nlocal p = createPane{id = "main", title = "Ask", dock = "right", rows = 3, cols = 24}\np:setLine(1, " Name: ")\np:setInput(1, 8, 12, { value = "", placeholder = "name", onSubmit = function(t) send("got " .. t) end, onChange = function(t) p:setLine(2, " now: " .. t) end })\n`);
  });
  await setScreen(page, S21);
  await expect.poll(() => page.evaluate(() => window.__wc!.app.cockpit.scriptPanes().map((p) => p.id))).toEqual(['ask/main']);
  await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
  await page.evaluate(() => window.__wc!.settings.update({ phone: { stripRows: 8 } }));
  // The script's pane is the strip's last page.
  const dots = page.locator('.wc-ph-strip-band .wc-ph-strip-dots > i');
  await expect.poll(() => dots.count()).toBeGreaterThan(1);
  await page.keyboard.press(`Control+${await dots.count()}`);
  const pane = page.locator('.wc-pane[data-pane="ask/main"]');
  await expect(pane).toBeVisible();
  const f = pane.locator('input.wc-spane-field');
  await expect(f).toBeVisible();
  const keys = await watchKeys(page);
  await f.tap();
  await expect(f).toHaveAttribute('inputmode', 'none');
  await expect(okb(page)).toBeVisible();
  await expect(f).toBeFocused();
  await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
  await type(page, 'c', 'a', 'v', 'x', 'back', 'e');
  await expect(f).toHaveValue('cave');
  // The script's onChange ran for what was typed.
  await expect(pane).toContainText('now: cave');
  expect(await keys()).toEqual([]);
  await type(page, 'enter');
  await expect.poll(() => m.sent).toEqual(['got cave']);
  // As on a computer the keys go back to the command line; the keyboard stays.
  await expect(okb(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  await type(page, 'l');
  await expect(field(page)).toHaveValue('l');
  await expect(f).toHaveValue('cave');
  expect(errors).toEqual([]);
});

// ------------------------------------------- a target that goes away (53e)

test('Comm closed with its key while the reply is typed in, on a short portrait screen: the keys are the command line\'s at once, and MUME gets one window size', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, { width: 360, height: 520 });
  await openTell(page, m);
  await reply(page).tap();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await frames(page);
  expect(await commKeep(page)).toBe(true);
  await expect(key(page, 'older')).toHaveAttribute('aria-disabled', 'true');
  const before = await layout(page);
  expect(before.comm.h).toBeGreaterThanOrEqual(6);
  const sizes = await watchSizes(page);
  await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
  await expect(comm(page)).toBeHidden();
  // With no key pressed: the arrows are lit, Comm keeps nothing, the caret is in the command line.
  await expect(key(page, 'older')).not.toHaveAttribute('aria-disabled');
  await expect(key(page, 'newer')).not.toHaveAttribute('aria-disabled');
  expect(await commKeep(page)).toBe(false);
  await expect(field(page)).toBeFocused();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await frames(page);
  await page.waitForTimeout(200);
  const after = await layout(page);
  expect(after.comm.h).toBe(0);
  expect(after.overLimit).toBe(false);
  expect(after.game.h).toBeGreaterThan(before.game.h);
  // One layout took Comm's rows and what it kept for the reply: never two sizes.
  expect(await sizes()).toHaveLength(1);
  await type(page, 'l');
  await expect(field(page)).toHaveValue('l');
  expect(await sizes()).toHaveLength(1);
  expect(errors).toEqual([]);
});

for (const size of [S21, { width: 360, height: 520 }]) {
  test(`Comm's search closed while it is typed in (${size.width} × ${size.height}): the keys are the command line's at once, at most one window size`, async ({ page }) => {
    const m = await play(page);
    await setScreen(page, size);
    await openTell(page, m);
    await comm(page).locator('.wc-cm-sbtn').tap();
    await expect(search(page)).toBeFocused();
    await expect(okb(page)).toBeVisible();
    await type(page, 'f', 'o');
    await frames(page);
    await frames(page);
    expect(await commKeep(page)).toBe(true);
    await expect(key(page, 'older')).toHaveAttribute('aria-disabled', 'true');
    const sizes = await watchSizes(page);
    await comm(page).locator('.wc-cm-sclear').tap();
    await expect(search(page)).toBeHidden();
    await expect(key(page, 'older')).not.toHaveAttribute('aria-disabled');
    expect(await commKeep(page)).toBe(false);
    await expect(field(page)).toBeFocused();
    await expect(okb(page)).toBeVisible();
    await frames(page);
    await frames(page);
    await page.waitForTimeout(200);
    expect((await sizes()).length).toBeLessThanOrEqual(1);
    await type(page, 'n');
    await expect(field(page)).toHaveValue('n');
    await expect(search(page)).toHaveValue('');
  });
}

test('a script pane\'s field that goes away while it is typed in (the strip\'s page changed; the script switched off): the keys are the command line\'s at once', async ({ page }) => {
  const errors = watchErrors(page);
  await play(page, '&kbd=en', async () => {
    await page.evaluate(async (src) => {
      const l = window.__wc!.shell.scripts!;
      await l.init();
      await l.create('ask', src);
      await l.setEnabled('ask', true);
    }, `-- @name ask\n-- @api 1\nlocal p = createPane{id = "main", title = "Ask", dock = "right", rows = 3, cols = 24}\np:setLine(1, " Name: ")\np:setInput(1, 8, 12, { value = "", placeholder = "name" })\n`);
  });
  await setScreen(page, S21);
  await expect.poll(() => page.evaluate(() => window.__wc!.app.cockpit.scriptPanes().map((p) => p.id))).toEqual(['ask/main']);
  await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
  await page.evaluate(() => window.__wc!.settings.update({ phone: { stripRows: 8 } }));
  const dots = page.locator('.wc-ph-strip-band .wc-ph-strip-dots > i');
  await expect.poll(() => dots.count()).toBeGreaterThan(1);
  const last = await dots.count();
  const pane = page.locator('.wc-pane[data-pane="ask/main"]');
  const f = pane.locator('input.wc-spane-field');
  const openField = async (): Promise<void> => {
    await page.keyboard.press(`Control+${last}`);
    await expect(f).toBeVisible();
    await f.tap();
    await expect(okb(page)).toBeVisible();
    await expect(f).toBeFocused();
    await expect(key(page, 'older')).toHaveAttribute('aria-disabled', 'true');
  };
  // Another page of the strip: the field's pane is no longer shown.
  await openField();
  await frames(page);
  const sizes = await watchSizes(page);
  // (A swipe to the right, under the field: the page before.)
  const pb = await box(pane);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: pb.y + pb.height * 0.6, id: 0 }] });
  await touch('touchStart', pb.x + pb.width * 0.25);
  for (let i = 1; i <= 4; i++) await touch('touchMove', pb.x + pb.width * 0.25 + 40 * i);
  await touch('touchEnd');
  await cdp.detach();
  await expect(pane).toBeHidden();
  await expect(key(page, 'older')).not.toHaveAttribute('aria-disabled');
  await expect(field(page)).toBeFocused();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await frames(page);
  expect(await sizes()).toEqual([]);
  await type(page, 'l');
  await expect(field(page)).toHaveValue('l');
  // The script is switched off: its pane, and the field with it, is taken away.
  await openField();
  await page.evaluate(() => window.__wc!.shell.scripts!.setEnabled('ask', false));
  await expect(pane).toHaveCount(0);
  await expect(key(page, 'older')).not.toHaveAttribute('aria-disabled');
  await expect(okb(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  await type(page, 'o');
  await expect(field(page)).toHaveValue('lo');
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------ the settings

async function openSettings(page: Page): Promise<void> {
  await page.locator('.wc-ph-menu').tap();
  await expect(sheet(page)).toBeVisible();
  await sheet(page).locator('[data-row="settings"]').tap();
  await expect(pageEl(page)).toBeVisible();
}

test('Settings, Keyboard: Layout switches Swedish and English live, is stored, and ?kbd=sv still overrides', async ({ browser }) => {
  const ctx = await browser.newContext({ ...S21_CTX, locale: 'en-GB' });
  const page = await ctx.newPage();
  await openPhone(page, '&kbd=1');
  await field(page).tap();
  await expect(okb(page)).toHaveAttribute('data-layout', 'en');
  expect((await rowsOf(page))[0]).toBe('qwertyuiop');
  // The menu closes the keyboard; the group is there, after Quick buttons, showing the layout in use.
  await openSettings(page);
  await expect(okb(page)).toBeHidden();
  const groups = await pageEl(page).locator('[data-group]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.group));
  expect(groups.slice(0, 3)).toEqual(['text', 'compass', 'keyboard']);
  const row = srow(page, 'keyboard-layout');
  await row.scrollIntoViewIfNeeded();
  await expect(row.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.__wc!.settings.get().phone.keyboard.layout)).toBe('auto');
  await row.getByRole('radio', { name: 'Swedish' }).tap();
  await expect(row.getByRole('radio', { name: 'Swedish' })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.__wc!.settings.get().phone.keyboard.layout)).toBe('sv');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(pageEl(page)).toHaveCount(0);
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  await expect(okb(page)).toHaveAttribute('data-layout', 'sv');
  expect((await rowsOf(page)).slice(0, 2)).toEqual(['qwertyuiopå', 'asdfghjklöä']);
  await type(page, 'å');
  await expect(field(page)).toHaveValue('å');
  // Live, with the keyboard open: English again, and every key on screen.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { keyboard: { layout: 'en' } } }));
  await expect(okb(page)).toHaveAttribute('data-layout', 'en');
  expect((await rowsOf(page))[0]).toBe('qwertyuiop');
  const blockBox = await box(page.locator('.wc-ph-okb-block'));
  expect(blockBox.x).toBeGreaterThanOrEqual(0);
  expect(blockBox.x + blockBox.width).toBeLessThanOrEqual(360.5);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { keyboard: { layout: 'sv' } } }));
  await expect(okb(page)).toHaveAttribute('data-layout', 'sv');
  // Stored: it comes back after a reload. `?kbd=en` names a layout for a test and wins over it.
  await page.waitForTimeout(400);
  await openPhone(page, '&kbd=1');
  await field(page).tap();
  await expect(okb(page)).toHaveAttribute('data-layout', 'sv');
  await openPhone(page, '&kbd=en');
  await field(page).tap();
  await expect(okb(page)).toHaveAttribute('data-layout', 'en');
  await ctx.close();
});

const S21_CTX = { viewport: S21, hasTouch: true, isMobile: true } as const;

/** Replaces `navigator.vibrate` with a stub that records its calls (or removes it), before the page's scripts run. */
async function stubVibrate(page: Page, has = true): Promise<() => Promise<number[]>> {
  await page.addInitScript((on) => {
    const w = window as unknown as { __vib: number[] };
    w.__vib = [];
    if (on) {
      Object.defineProperty(Navigator.prototype, 'vibrate', {
        configurable: true,
        value: (ms: number) => {
          w.__vib.push(ms);
          return true;
        },
      });
    } else {
      delete (Navigator.prototype as unknown as { vibrate?: unknown }).vibrate;
    }
  }, has);
  return () => page.evaluate(() => (window as unknown as { __vib: number[] }).__vib);
}

test('Vibrate on key press: off by default and silent; on, one short pulse per press of a keyboard key, a compass key and a hot key', async ({ page }) => {
  const errors = watchErrors(page);
  const vib = await stubVibrate(page);
  await openPhone(page);
  await setScreen(page, S21);
  expect(await page.evaluate(() => window.__wc!.settings.get().phone.vibrate)).toBe(false);
  // Off: never.
  await field(page).tap();
  await type(page, 'a', 'shift', 'b', 'back', 'enter');
  await compass(page, 'north').tap();
  await hk(page, 1).tap();
  expect(await vib()).toEqual([]);
  await key(page, 'fold').tap();
  // The row is in Quick buttons; switched on there.
  await openSettings(page);
  const row = srow(page, 'vibrate');
  await expect(row).toBeVisible();
  await expect(row.locator('.wc-ph-srow-t')).toHaveText('Vibrate on key press');
  expect(await pageEl(page).locator('[data-group="compass"] [data-row]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.row))).toEqual(['hotkey-count', 'vibrate']);
  await row.getByRole('switch').tap();
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.__wc!.settings.get().phone.vibrate)).toBe(true);
  // (The switch itself is no key.)
  expect(await vib()).toEqual([]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(pageEl(page)).toHaveCount(0);
  // On: one pulse for each press.
  await compass(page, 'north').tap();
  expect(await vib()).toHaveLength(1);
  await hk(page, 1).tap();
  expect(await vib()).toHaveLength(2);
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
  expect(await vib()).toHaveLength(2);
  await type(page, 'a', 'shift', 'space', 'back', 'enter');
  const pulses = await vib();
  expect(pulses).toHaveLength(7);
  // Short, and the same every time.
  expect(new Set(pulses).size).toBe(1);
  expect(pulses[0]).toBeGreaterThanOrEqual(20);
  expect(pulses[0]).toBeLessThanOrEqual(40);
  // Off again: silent.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { vibrate: false } }));
  await type(page, 'a');
  await compass(page, 'south').tap();
  expect(await vib()).toHaveLength(7);
  expect(errors).toEqual([]);
});

test('a held backspace pulses once, not at every repeat', async ({ page }) => {
  const vib = await stubVibrate(page);
  await openPhone(page);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { vibrate: true } }));
  await field(page).tap();
  await type(page, 'a', 'b', 'c', 'd', 'e', 'f');
  const before = (await vib()).length;
  const b = await box(key(page, 'back'));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 0 }] });
  await expect(field(page)).toHaveValue('');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  expect((await vib()).length - before).toBe(1);
});

test('with ?kbd=0 the vibration works for the compass and the hot keys, and its row is there; the Keyboard group is not', async ({ page }) => {
  const vib = await stubVibrate(page);
  await openPhone(page, '&kbd=0');
  await setScreen(page, S21);
  await openSettings(page);
  await expect(pageEl(page).locator('[data-group="keyboard"]')).toHaveCount(0);
  await expect(srow(page, 'vibrate')).toBeVisible();
  await srow(page, 'vibrate').getByRole('switch').tap();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(pageEl(page)).toHaveCount(0);
  await compass(page, 'east').tap();
  await hk(page, 2).tap();
  expect(await vib()).toHaveLength(2);
  await expect(okb(page)).toHaveCount(0);
});

test('a browser without navigator.vibrate: no row, and the keys work without a pulse', async ({ page }) => {
  const errors = watchErrors(page);
  await stubVibrate(page, false);
  await openPhone(page);
  expect(await page.evaluate(() => 'vibrate' in navigator)).toBe(false);
  // Even with the stored setting on (settings moved from another phone).
  await page.evaluate(() => window.__wc!.settings.update({ phone: { vibrate: true } }));
  await field(page).tap();
  await type(page, 'o', 'k');
  await expect(field(page)).toHaveValue('ok');
  await compass(page, 'north').tap();
  await hk(page, 1).tap();
  await openSettings(page);
  await expect(srow(page, 'hotkey-count')).toBeVisible();
  await expect(srow(page, 'vibrate')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------ the gate

test('with ?kbd=0 nothing of this is there: no field is marked, nothing opens, the password prompt swaps in its password field', async ({ page }) => {
  const errors = watchErrors(page);
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto('/?phone=1&kbd=0');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(pad(page)).toBeVisible();
  // The password prompt: the phone's swapped-in password field, as before.
  server!.send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, 1])]));
  await expect(field(page)).toHaveAttribute('type', 'password');
  await expect(field(page)).not.toHaveAttribute('inputmode');
  server!.send(Buffer.from([IAC, 252, 1]));
  await expect(field(page)).not.toHaveAttribute('type', 'password');
  server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
  await setScreen(page, S21);
  server!.send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: "Gibur tells you 'you at the ford?'" }));
  await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
  await comm(page).locator('.wc-cm-ent[aria-label^="Gibur"]').tap();
  await expect(reply(page)).toBeVisible();
  for (const f of [reply(page), search(page)]) {
    await expect(f).not.toHaveAttribute('inputmode');
    await expect(f).not.toHaveAttribute('virtualkeyboardpolicy');
  }
  await reply(page).tap();
  await expect(reply(page)).toBeFocused();
  await frames(page);
  await expect(okb(page)).toHaveCount(0);
  await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
  expect((await layout(page)).bottom).toBe(0);
  await reply(page).evaluate((el: HTMLElement) => el.blur());
  // (Comm closed: the box has its place.)
  await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
  await expect(comm(page)).toBeHidden();
  await hold(page, hk(page, 1));
  await expect(label(page)).not.toHaveAttribute('inputmode');
  await expect(command(page)).not.toHaveAttribute('inputmode');
  expect(await page.evaluate(() => document.querySelectorAll('[inputmode="none"]').length)).toBe(0);
  expect(errors).toEqual([]);
});
