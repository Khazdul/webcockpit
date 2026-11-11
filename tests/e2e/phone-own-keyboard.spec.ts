// Stage 53a (ADR 0138): a rough on-screen keyboard of our own for the
// command field of the phone's game layout, behind `?kbd=1`.
//
// - Without `?kbd=1` nothing differs: no `inputmode`, no keyboard, no
//   readout, no state class.
// - With it: the field asks the device for no keyboard
//   (`inputmode="none"`, `virtualkeyboardpolicy="manual"`); a tap on it
//   opens ours and leaves the field focused; the keys type through the
//   input pane's editing API (shift, backspace with repeat, two thumbs);
//   Enter sends as the Enter key does (history) and the keyboard stays;
//   the fold key closes and blurs.
// - Layout: the page keeps its size; the allocator keeps whole rows free at
//   the bottom, the command row stands on the keyboard, the compass and the
//   hot keys are hidden meanwhile; one window size for MUME on open and one
//   on close; portrait and landscape, one block over the full width.
//
// `phone` project (Pixel 7; the owner's S21 sizes are set where the numbers
// matter). The sending cases play against a `page.routeWebSocket` mock; the
// rest use the offline cockpit. Nothing reaches MUME.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const pad = (page: Page) => page.locator('.wc-ph-pad');
const hot = (page: Page) => page.locator('.wc-ph-hot');
const okb = (page: Page) => page.locator('.wc-ph-okb');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const slot = (page: Page) => page.locator('.wc-cockpit > .wc-input-slot');
const readout = (page: Page) => page.locator('.wc-okb-readout');
const html = (page: Page) => page.locator('html');
/** A key: a character, or `shift`, `back`, `fold`, `space`, `enter`. */
const key = (page: Page, k: string) => okb(page).locator(k.length === 1 ? `.wc-ph-okb-k[data-ch="${k}"]` : `.wc-ph-okb-k[data-act="${k}"]`);
const inputFocused = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains('wc-input-field') ?? false);
const layout = (page: Page) => page.evaluate(() => window.__wc!.app.cockpit.phoneGameLayout!);
const history = (page: Page) => page.evaluate(() => window.__wc!.app.input.getHistory());

const S21 = { width: 360, height: 800 };
const S21_LAND = { width: 800, height: 360 };

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openPhone(page: Page, query = '&kbd=1'): Promise<void> {
  await page.goto(`/?replay&phone=1${query}`);
  await expect(html(page)).toHaveClass(/\bwc-phone\b/);
  await expect(pad(page)).toBeVisible();
}

/** Taps the command field and waits for our keyboard. */
async function openKeyboard(page: Page): Promise<void> {
  await field(page).tap();
  await expect(okb(page)).toBeVisible();
}

async function type(page: Page, ...keys: string[]): Promise<void> {
  for (const k of keys) await key(page, k).tap();
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

/** Two frames: the cockpit's relayout and what follows it. */
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** Fingers on keys through CDP (real touches): `points` are down together; `during` runs while they are. */
async function touches(page: Page, keys: Locator[], during: () => Promise<void> = async () => {}): Promise<void> {
  const pts: { x: number; y: number; id: number }[] = [];
  for (const [i, l] of keys.entries()) {
    const b = await box(l);
    pts.push({ x: b.x + b.width / 2, y: b.y + b.height / 2, id: i });
  }
  const cdp = await page.context().newCDPSession(page);
  try {
    // One after the other down (the earlier ones stay), then all up.
    for (let i = 1; i <= pts.length; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts.slice(0, i) });
    await during();
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
}

/** Another screen size, waited for until the app has taken it (phone-viewport.ts settles a moment after the resize). */
async function setScreen(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await expect.poll(async () => (await box(page.locator('#app'))).height).toBe(size.height);
  await expect.poll(async () => (await layout(page)).landscape).toBe(size.width > size.height);
  await frames(page);
}

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
  server: () => WebSocketRoute;
  login: () => Promise<void>;
}

/** Enters MUME on `?phone=1&kbd=1` against a mock, up to the login prompt. */
async function enterMock(page: Page): Promise<Mock> {
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
  await page.goto('/?phone=1&kbd=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(pad(page)).toBeVisible();
  return {
    sent,
    server: () => server!,
    login: async () => {
      server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
      await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
      await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
    },
  };
}

// ------------------------------------------------------------------ the gate

test('without ?kbd=1 nothing differs: no inputmode, no keyboard, no readout, no state', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page, '');
  await expect(field(page)).not.toHaveAttribute('inputmode');
  await expect(field(page)).not.toHaveAttribute('virtualkeyboardpolicy');
  await expect(okb(page)).toHaveCount(0);
  await expect(readout(page)).toHaveCount(0);
  const before = await layout(page);
  await field(page).tap();
  await expect.poll(() => inputFocused(page)).toBe(true);
  await frames(page);
  await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
  await expect(okb(page)).toHaveCount(0);
  await expect(pad(page)).toBeVisible();
  const after = await layout(page);
  expect(after.bottom).toBe(0);
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

test('?kbd=1 on a desktop does nothing: no keyboard, no inputmode', async ({ page }) => {
  await page.goto('/?replay&phone=0&kbd=1');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await expect(page.locator('.wc-input-field')).not.toHaveAttribute('inputmode');
  await expect(okb(page)).toHaveCount(0);
  await expect(readout(page)).toHaveCount(0);
});

// ------------------------------------------------------- opening and typing

test('a tap on the field opens our keyboard, the field focused and asking the device for none', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  // Marked from the start; the keyboard is there but closed.
  await expect(field(page)).toHaveAttribute('inputmode', 'none');
  await expect(field(page)).toHaveAttribute('virtualkeyboardpolicy', 'manual');
  await expect(okb(page)).toBeHidden();
  await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
  await expect(readout(page)).toContainText('okb 0');

  await openKeyboard(page);
  await expect(html(page)).toHaveClass(/\bwc-okb\b/);
  // Never the device keyboard's state.
  await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
  expect(await inputFocused(page)).toBe(true);
  expect(await page.evaluate(() => (window.__wc!.shell as unknown as { phoneLayer: { ownKeyboardOpen: boolean } }).phoneLayer.ownKeyboardOpen)).toBe(true);
  // The readout: the focused field with its inputmode, our keyboard open, the device's not seen.
  await expect(readout(page)).toContainText('ae TEXTAREA im=none | okb 1 | wc-kbd 0');
  await expect(readout(page)).toContainText(/vv [\d.]+ \/ inner [\d.]+ \| VK api [01]/);
  expect(await readout(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

  // Every key has a name and is out of the Tab order.
  const keys = okb(page).locator('.wc-ph-okb-k');
  await expect(keys).toHaveCount(10 + 9 + 9 + 5);
  expect(await keys.evaluateAll((els) => els.every((el) => (el.getAttribute('aria-label') ?? '') !== '' && (el as HTMLElement).tabIndex === -1))).toBe(true);
  await expect(key(page, 'fold')).toHaveAttribute('aria-label', 'Hide keyboard');
  expect(errors).toEqual([]);
});

test('keys type into the field: letters, shift for one capital, space, ; and ., backspace, at the caret', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await openKeyboard(page);
  await type(page, 'l', 'o', 'o', 'k');
  await expect(field(page)).toHaveValue('look');
  expect(await inputFocused(page)).toBe(true);
  await type(page, 'back', 'back');
  await expect(field(page)).toHaveValue('lo');
  // Shift: one capital, then small again; a second tap on shift takes it back.
  await type(page, 'back', 'back', 'shift');
  await expect(key(page, 'shift')).toHaveAttribute('aria-pressed', 'true');
  await type(page, 'g', 'o');
  await expect(key(page, 'shift')).toHaveAttribute('aria-pressed', 'false');
  await expect(field(page)).toHaveValue('Go');
  await type(page, 'shift', 'shift', 'space', 'n', ';', 'e', '.');
  await expect(field(page)).toHaveValue('Go n;e.');
  // At the caret, and over a selection.
  await field(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(2, 2));
  await type(page, 't');
  await expect(field(page)).toHaveValue('Got n;e.');
  expect(await field(page).evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([3, 3]);
  await type(page, 'back');
  await expect(field(page)).toHaveValue('Go n;e.');
  expect(await field(page).evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([2, 2]);
  await field(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(3, 8));
  await type(page, 's');
  await expect(field(page)).toHaveValue('Go s');
  await field(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 4));
  await type(page, 'back');
  await expect(field(page)).toHaveValue('');
  // Backspace in an empty line does nothing.
  await type(page, 'back');
  await expect(field(page)).toHaveValue('');
  expect(await inputFocused(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('a key makes no keyboard event: a macro bound to the letter does not run', async ({ page }) => {
  await openPhone(page);
  await page.evaluate(() => {
    const w = window as unknown as { __keys: string[] };
    w.__keys = [];
    document.addEventListener('keydown', (e) => w.__keys.push(e.key), true);
    document.addEventListener('keyup', (e) => w.__keys.push(e.key), true);
    document.addEventListener('keypress', (e) => w.__keys.push(e.key), true);
  });
  await openKeyboard(page);
  await type(page, 'n', 'enter', 'back', 'space');
  await expect(field(page)).toHaveValue(' ');
  expect(await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys)).toEqual([]);
});

test('backspace repeats while it is held and stops when the finger lifts', async ({ page }) => {
  await openPhone(page);
  await openKeyboard(page);
  const text = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz';
  await page.evaluate((t) => window.__wc!.app.input.insertText(t), text);
  await expect(field(page)).toHaveValue(text);
  let held = 0;
  await touches(page, [key(page, 'back')], async () => {
    // The press itself deletes one at once.
    await expect.poll(async () => (await field(page).inputValue()).length).toBe(text.length - 1);
    // Held: more go, by the timer.
    await expect.poll(async () => (await field(page).inputValue()).length, { timeout: 3000 }).toBeLessThan(text.length - 5);
    await expect(key(page, 'back')).toHaveClass(/\bis-down\b/);
    held = (await field(page).inputValue()).length;
  });
  await expect(key(page, 'back')).not.toHaveClass(/\bis-down\b/);
  const after = (await field(page).inputValue()).length;
  expect(after).toBeLessThanOrEqual(held);
  expect(after).toBeGreaterThan(0);
  // Lifted: nothing more goes.
  await page.waitForTimeout(300);
  expect((await field(page).inputValue()).length).toBe(after);
  expect(await inputFocused(page)).toBe(true);
});

test('two thumbs: a second key goes down before the first is up, and both type once', async ({ page }) => {
  await openPhone(page);
  await openKeyboard(page);
  await touches(page, [key(page, 'a'), key(page, 'b')], async () => {
    await expect(field(page)).toHaveValue('ab');
    await expect(key(page, 'a')).toHaveClass(/\bis-down\b/);
    await expect(key(page, 'b')).toHaveClass(/\bis-down\b/);
  });
  await expect(field(page)).toHaveValue('ab');
  await expect(okb(page).locator('.is-down')).toHaveCount(0);
  expect(await inputFocused(page)).toBe(true);
});

test('a physical keyboard types as before, and its focus alone opens nothing', async ({ page }) => {
  await openPhone(page);
  await page.keyboard.type('look');
  await expect(field(page)).toHaveValue('look');
  expect(await inputFocused(page)).toBe(true);
  await expect(okb(page)).toBeHidden();
  await page.keyboard.press('Enter');
  expect(await history(page)).toEqual(['look']);
  // Mixed with our keys.
  await openKeyboard(page);
  await type(page, 'n');
  await page.keyboard.type('e');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('w');
  await expect(field(page)).toHaveValue('nw');
});

test('a long line keeps its caret in view', async ({ page }) => {
  await openPhone(page);
  await setScreen(page, S21);
  await openKeyboard(page);
  for (let i = 0; i < 8; i++) await type(page, 'l', 'o', 'n', 'g', 'e', 'r', 'space');
  const read = () => field(page).evaluate((el: HTMLTextAreaElement) => ({ left: el.scrollLeft, width: el.clientWidth, full: el.scrollWidth, end: el.selectionEnd, n: el.value.length }));
  const s = await read();
  expect(s.end).toBe(s.n);
  expect(s.full).toBeGreaterThan(s.width);
  // Scrolled to the end, where the caret is (in the caret's frame after the key).
  await expect.poll(async () => (await read()).left).toBeGreaterThanOrEqual(s.full - s.width - 2);
  // A caret moved back to the start and typed at comes into view again.
  await field(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
  await type(page, 'x');
  await expect.poll(async () => (await read()).left).toBeLessThanOrEqual(10);
  // Backspace at the end brings the end back.
  await field(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
  await type(page, 'back');
  await expect.poll(async () => {
    const r = await read();
    return r.full - r.width - r.left;
  }).toBeLessThanOrEqual(2);
});

// --------------------------------------------------------------- the session

test('Enter sends the line as the Enter key does, with history, and the keyboard stays', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await enterMock(page);
  await m.login();
  await openKeyboard(page);
  await type(page, 'l', 'o', 'o', 'k', 'enter');
  await expect.poll(() => m.sent).toEqual(['look']);
  await expect(okb(page)).toBeVisible();
  await expect(html(page)).toHaveClass(/\bwc-okb\b/);
  expect(await inputFocused(page)).toBe(true);
  // As after the Enter key: the line stays, selected, and the next key replaces it.
  await expect(field(page)).toHaveValue('look');
  expect(await page.evaluate(() => window.__wc!.app.input.isRecallState())).toBe(true);
  expect(await history(page)).toEqual(['look']);
  // Enter again repeats it; then a new line.
  await type(page, 'enter', 'n', 'enter');
  await expect.poll(() => m.sent).toEqual(['look', 'look', 'n']);
  expect(await history(page)).toEqual(['look', 'n']);
  await expect(okb(page)).toBeVisible();
  // The physical arrow keys browse what our keys sent.
  await page.keyboard.press('ArrowUp');
  await expect(field(page)).toHaveValue('look');
  expect(errors).toEqual([]);
});

test('the password prompt: the swapped field asks for no keyboard either, our keys type the masked line, nothing is recorded', async ({ page }) => {
  const m = await enterMock(page);
  await openKeyboard(page);
  await type(page, 'shift', 'r', 'a', 's', 't', 'a', 'enter');
  await expect.poll(() => m.sent).toEqual(['Rasta']);
  m.server().send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, ECHO])]));
  await expect(field(page)).toHaveAttribute('type', 'password');
  await expect(field(page)).toHaveAttribute('inputmode', 'none');
  await expect(field(page)).toHaveAttribute('virtualkeyboardpolicy', 'manual');
  // The swap kept the focus and the keyboard.
  expect(await inputFocused(page)).toBe(true);
  await expect(okb(page)).toBeVisible();
  await expect(readout(page)).toContainText('ae INPUT im=none | okb 1');
  await type(page, 's', 'e', 'c', 'x', 'back', 'r', 'e', 't');
  await expect(field(page)).toHaveValue('secret');
  await expect(page.locator('.wc-input-mask')).toHaveText('••••••');
  await type(page, 'enter');
  await expect.poll(() => m.sent).toEqual(['Rasta', 'secret']);
  await expect(field(page)).toHaveValue('');
  expect(await history(page)).toEqual(['Rasta']);
  m.server().send(Buffer.from([IAC, WONT, ECHO]));
  await expect(field(page)).not.toHaveAttribute('type', 'password');
  await expect(field(page)).toHaveAttribute('inputmode', 'none');
  await expect(okb(page)).toBeVisible();
  expect(await inputFocused(page)).toBe(true);
});

// ---------------------------------------------------------------- the layout

test('portrait (360 × 800): fixed rows at the bottom, the command row on the keyboard, the page the same size', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await setScreen(page, S21);
  const appBox = await box(page.locator('#app'));
  const cockpit = await box(page.locator('.wc-cockpit'));
  const closed = await layout(page);
  const cells = await page.locator('.wc-cockpit').getAttribute('data-cells');
  const sizes = await watchSizes(page);

  await openKeyboard(page);
  const open = await layout(page);
  // The page and the cockpit keep their size; only the rows are shared anew.
  expect(await box(page.locator('#app'))).toEqual(appBox);
  expect(await box(page.locator('.wc-cockpit'))).toEqual(cockpit);
  expect(await page.locator('.wc-cockpit').getAttribute('data-cells')).toBe(cells);
  expect([open.rows, open.cols]).toEqual([closed.rows, closed.cols]);
  expect(open.bottom).toBeGreaterThan(0);
  expect(open.game.h).toBe(closed.game.h - open.bottom);
  expect(open.input.y + open.input.h + open.bottom).toBe(open.rows);
  // The game text keeps plenty of rows.
  expect(open.game.h).toBeGreaterThanOrEqual(20);
  console.log(`360 × 800: game rows ${closed.game.h} closed, ${open.game.h} open (keyboard ${open.bottom} rows, command row ${open.input.h})`);

  // One block over the full width, from under the command row to the bottom edge.
  const k = await box(okb(page));
  const row = await box(slot(page));
  expect(k.x).toBeCloseTo(cockpit.x, 0);
  expect(k.width).toBeCloseTo(cockpit.width, 0);
  expect(k.y).toBeCloseTo(row.y + row.height, 0);
  expect(k.y + k.height).toBeCloseTo(cockpit.y + cockpit.height, 0);
  // Keys: four rows, about 44 px high, inside the screen, none cut off or overlapping.
  const keys = await okb(page).locator('.wc-ph-okb-k').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number; width: number; height: number }));
  for (const b of keys) {
    expect(b.height).toBeGreaterThanOrEqual(43);
    expect(b.height).toBeLessThanOrEqual(52);
    expect(b.width).toBeGreaterThanOrEqual(28);
    expect(b.left).toBeGreaterThanOrEqual(k.x);
    expect(b.right).toBeLessThanOrEqual(k.x + k.width + 0.5);
    expect(b.top).toBeGreaterThanOrEqual(k.y);
    expect(b.bottom).toBeLessThanOrEqual(S21.height + 0.5);
  }
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i]!;
      const b = keys[j]!;
      const apart = a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;
      expect(apart, `keys ${i} and ${j} overlap`).toBe(true);
    }
  expect(new Set(keys.map((b) => Math.round(b.top))).size).toBe(4);

  // The compass and the hot keys are hidden, and the field takes the row's width.
  await expect(pad(page)).toBeHidden();
  await expect(hot(page)).toBeHidden();
  const f = await box(field(page));
  expect(f.x + f.width).toBeGreaterThan(cockpit.x + cockpit.width - 32);
  // The field is on screen, above the keyboard.
  expect(f.y + f.height).toBeLessThanOrEqual(k.y + 0.5);
  // The lens stays, inside the game text's rows.
  const lens = page.locator('.wc-ph-lens');
  if (await lens.isVisible()) {
    const l = await box(lens);
    expect(l.y + l.height).toBeLessThanOrEqual(row.y + 0.5);
  }
  // MUME got one new window size.
  await frames(page);
  expect(await sizes()).toHaveLength(1);

  // Folded: all back as it was, with one more window size.
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await expect(pad(page)).toBeVisible();
  await expect(hot(page)).toBeVisible();
  await expect.poll(() => layout(page)).toEqual(closed);
  expect(await box(page.locator('#app'))).toEqual(appBox);
  await frames(page);
  expect(await sizes()).toHaveLength(2);
  // (The game text tells its own rows, which follow the pane's: the keyboard's rows less, then back.)
  const told = (await sizes()).map((t) => Number(t.split('x')[1]));
  expect(told[1]! - told[0]!).toBe(open.bottom);
  expect(errors).toEqual([]);
});

test('the fold key closes and blurs; the text stays; a tap opens again', async ({ page }) => {
  await openPhone(page);
  await openKeyboard(page);
  await type(page, 'h', 'i');
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
  expect(await inputFocused(page)).toBe(false);
  await expect(readout(page)).toContainText('okb 0');
  await expect(readout(page)).not.toContainText('ae TEXTAREA');
  await expect(field(page)).toHaveValue('hi');
  await expect(pad(page)).toBeVisible();
  // The fold's tap ended on nothing else: no menu, no command.
  await expect(page.locator('.wc-ph-sheet')).toHaveCount(0);
  await openKeyboard(page);
  expect(await inputFocused(page)).toBe(true);
  await type(page, 'shift');
  await key(page, 'fold').tap();
  // Shift does not outlive the keyboard.
  await openKeyboard(page);
  await expect(key(page, 'shift')).toHaveAttribute('aria-pressed', 'false');
  await type(page, 'x');
  await expect(field(page)).toHaveValue('hix');
});

test('a compass key is not reachable while it is open, and sends again after', async ({ page }) => {
  const m = await enterMock(page);
  await m.login();
  await openKeyboard(page);
  await expect(pad(page)).toBeHidden();
  await key(page, 'fold').tap();
  await expect(pad(page)).toBeVisible();
  await pad(page).locator('.wc-ph-key[data-cmd="north"]').tap();
  await expect.poll(() => m.sent).toEqual(['north']);
  // The compass key did not bring the keyboard back.
  await expect(okb(page)).toBeHidden();
  expect(await inputFocused(page)).toBe(false);
});

test('the menu key closes it: the sheet does not lie over an open keyboard', async ({ page }) => {
  await openPhone(page);
  await openKeyboard(page);
  await page.locator('.wc-ph-menu').tap();
  await expect(page.locator('.wc-ph-sheet')).toBeVisible();
  await expect(okb(page)).toBeHidden();
  await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
  expect((await layout(page)).bottom).toBe(0);
});

test('landscape (800 × 360): one block over the full width, lower keys, the game keeps its rows', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await setScreen(page, S21_LAND);
  const closed = await layout(page);
  const appBox = await box(page.locator('#app'));
  await openKeyboard(page);
  const open = await layout(page);
  expect(open.landscape).toBe(true);
  expect(await box(page.locator('#app'))).toEqual(appBox);
  expect(open.rows).toBe(closed.rows);
  expect(open.input.y + open.input.h + open.bottom).toBe(open.rows);
  expect(open.game.h).toBeGreaterThanOrEqual(6);
  console.log(`800 × 360: game rows ${closed.game.h} closed, ${open.game.h} open (keyboard ${open.bottom} rows, command row ${open.input.h})`);
  const cockpit = await box(page.locator('.wc-cockpit'));
  const k = await box(okb(page));
  const row = await box(slot(page));
  expect(k.x).toBeCloseTo(cockpit.x, 0);
  expect(k.width).toBeCloseTo(cockpit.width, 0);
  expect(k.y).toBeCloseTo(row.y + row.height, 0);
  expect(k.y + k.height).toBeCloseTo(cockpit.y + cockpit.height, 0);
  // Not split: every row's keys run from edge to edge without a hole in the middle.
  const keys = await okb(page).locator('.wc-ph-okb-k').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number; height: number }));
  const byRow = new Map<number, typeof keys>();
  for (const b of keys) byRow.set(Math.round(b.top), [...(byRow.get(Math.round(b.top)) ?? []), b]);
  expect(byRow.size).toBe(4);
  for (const r of byRow.values()) {
    r.sort((a, b) => a.left - b.left);
    for (let i = 1; i < r.length; i++) expect(r[i]!.left - r[i - 1]!.right).toBeLessThanOrEqual(6);
    for (const b of r) {
      expect(b.height).toBeGreaterThanOrEqual(30);
      expect(b.height).toBeLessThanOrEqual(40);
      expect(b.bottom).toBeLessThanOrEqual(S21_LAND.height + 0.5);
    }
  }
  await expect(pad(page)).toBeHidden();
  await expect(hot(page)).toBeHidden();
  // The lens (or its key row) stays off the command row.
  const lens = page.locator('.wc-ph-lens');
  if (await lens.isVisible()) {
    for (const sat of await lens.locator('.wc-ph-sat').all()) {
      if (!(await sat.isVisible())) continue;
      const s = await box(sat);
      expect(s.y + s.height).toBeLessThanOrEqual(row.y + 3);
    }
  }
  await type(page, 'h', 'i');
  await expect(field(page)).toHaveValue('hi');
  expect(await inputFocused(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('a rotation keeps it open and lays it out anew, with no window size of its own', async ({ page }) => {
  await openPhone(page);
  await setScreen(page, S21);
  await openKeyboard(page);
  await type(page, 'h', 'i');
  const portrait = await layout(page);
  await frames(page);
  const sizes = await watchSizes(page);
  await setScreen(page, S21_LAND);
  await expect(okb(page)).toBeVisible();
  await expect(html(page)).toHaveClass(/\bwc-okb\b/);
  expect(await inputFocused(page)).toBe(true);
  await expect(field(page)).toHaveValue('hi');
  const land = await layout(page);
  expect(land.bottom).toBeGreaterThan(0);
  expect(land.bottom).toBeLessThan(portrait.bottom);
  const k = await box(okb(page));
  const row = await box(slot(page));
  expect(k.y).toBeCloseTo(row.y + row.height, 0);
  expect(k.y + k.height).toBeLessThanOrEqual(S21_LAND.height + 0.5);
  await frames(page);
  // The rotation tells MUME what a rotation without the keyboard does, and no more: the new
  // width at once and the new height when the page has taken it (phone-viewport.ts settles after
  // the resize; here the two come as two sizes, on a device often as one). The keyboard adds none.
  const told = await sizes();
  expect(told.length).toBeGreaterThanOrEqual(1);
  expect(told.length).toBeLessThanOrEqual(2);
  expect(Number(told.at(-1)!.split('x')[1])).toBeLessThan(land.game.h + 1);
  // And back.
  await setScreen(page, S21);
  await expect(okb(page)).toBeVisible();
  await expect.poll(() => layout(page)).toEqual(portrait);
});

test('the strip and Comm open with the keyboard up end above it (portrait and landscape)', async ({ page }) => {
  await openPhone(page);
  await setScreen(page, S21);
  await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
  await expect(page.locator('.wc-pane[data-phone-strip]')).toBeVisible();
  await openKeyboard(page);
  const g = await layout(page);
  expect(g.strip.h).toBeGreaterThan(0);
  expect(g.strip.h + g.fight.h + g.comm.h + g.game.h + g.input.h + g.bottom).toBe(g.rows);
  const k = await box(okb(page));
  const strip = await box(page.locator('.wc-pane[data-phone-strip]'));
  expect(strip.y + strip.height).toBeLessThanOrEqual(k.y);
  await setScreen(page, S21_LAND);
  const land = await layout(page);
  // The column, when it has the rows, ends above the keyboard too.
  expect(land.side.h).toBeLessThanOrEqual(land.rows - land.bottom);
  const k2 = await box(okb(page));
  const pane = page.locator('.wc-pane[data-phone-strip]');
  if (await pane.isVisible()) {
    const p = await box(pane);
    expect(p.y + p.height).toBeLessThanOrEqual(k2.y + 0.5);
  }
});
