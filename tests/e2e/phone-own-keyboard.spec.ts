// Stage 53 (ADR 0138): an on-screen keyboard of our own for the command
// field of the phone's game layout, behind `?kbd=1` (the layout of the
// browser's language), `?kbd=sv` or `?kbd=en`.
//
// - Without `?kbd=` nothing differs: no `inputmode`, no keyboard, no
//   readout, no state class.
// - With it: the field asks the device for no keyboard
//   (`inputmode="none"`, `virtualkeyboardpolicy="manual"`); a pointer on it
//   opens ours and leaves the field focused; the keys type through the
//   input pane's editing API (Swedish and English, shift once and locked,
//   symbols, the digit row, history arrows, backspace with repeat, two
//   thumbs); Enter sends as the Enter key does (history) and the keyboard
//   stays; the fold key closes and blurs.
// - Layout: the page keeps its size; the allocator keeps whole rows free at
//   the bottom and the command row stands on the keyboard; one window size
//   for MUME on open, on close and on a fold of the digit row. Portrait: one
//   block over the full width, the compass and the hot keys above it as
//   with the keyboard down. Landscape: the block in the middle, K1 to K3
//   left of it, K4 to K6 right of it, the compass at the far right.
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
const block = (page: Page) => page.locator('.wc-ph-okb-block');
/** A key: a character, or `shift`, `back`, `fold`, `space`, `enter`, `sym`, `alt`, `digits`, `older`, `newer`. */
const key = (page: Page, k: string) => okb(page).locator([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
const hk = (page: Page, n: number) => page.locator(`.wc-ph-hk[data-hk="${n - 1}"]`);
const compass = (page: Page, cmd: string) => pad(page).locator(`.wc-ph-key[data-cmd="${cmd}"]`);
const digitsStored = (page: Page) => page.evaluate(() => window.__wc!.settings.get().phone.keyboard.digits);
/** The rows of keys on screen, as their keys' characters and acts. */
const rowsOf = (page: Page) =>
  okb(page)
    .locator('.wc-ph-okb-row')
    .evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll<HTMLElement>('.wc-ph-okb-k')].map((k) => k.dataset.ch ?? `<${k.dataset.act}>`).join('')));
const inputFocused = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains('wc-input-field') ?? false);
const layout = (page: Page) => page.evaluate(() => window.__wc!.app.cockpit.phoneGameLayout!);
const history = (page: Page) => page.evaluate(() => window.__wc!.app.input.getHistory());

const S21 = { width: 360, height: 800 };
const S21_LAND = { width: 800, height: 360 };
/** Slower than a double tap on shift (350 ms). */
const AFTER_DOUBLE_TAP_MS = 450;

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
async function enterMock(page: Page, kbd = '1'): Promise<Mock> {
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
  await page.goto(`/?phone=1&kbd=${kbd}`);
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

for (const query of ['', '&kbd=0', '&kbd=de']) test(`without ?kbd=1 nothing differs: no inputmode, no keyboard, no readout, no state ("${query}")`, async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page, query);
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
  // Nothing of the keyboard's arrangement on the layer or the page.
  expect(await page.locator('.wc-ph-layer').evaluate((el) => [el.getAttribute('data-okb'), el.style.getPropertyValue('--okb-lift'), document.documentElement.className.includes('okb')])).toEqual([null, '', false]);
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

  // English here (the browser's language), the digit row folded away. Every key has a name and
  // is out of the Tab order.
  await expect(okb(page)).toHaveAttribute('data-layout', 'en');
  const keys = okb(page).locator('.wc-ph-okb-k');
  expect(await rowsOf(page)).toEqual(['qwertyuiop', 'asdfghjkl', '<shift>zxcvbnm<back>', '<fold><sym><digits>;<space>.<enter>']);
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
  // Shift: one capital, then small again; a second, slow tap on shift takes it back.
  await type(page, 'back', 'back', 'shift');
  await expect(key(page, 'shift')).toHaveAttribute('aria-pressed', 'true');
  await type(page, 'g', 'o');
  await expect(key(page, 'shift')).toHaveAttribute('aria-pressed', 'false');
  await expect(field(page)).toHaveValue('Go');
  await type(page, 'shift');
  await page.waitForTimeout(AFTER_DOUBLE_TAP_MS);
  await type(page, 'shift');
  await expect(okb(page)).toHaveAttribute('data-shift', 'off');
  await type(page, 'space', 'n', ';', 'e', '.');
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

type KeyBox = { left: number; right: number; top: number; bottom: number; width: number; height: number };
const keyBoxes = (page: Page): Promise<KeyBox[]> => okb(page).locator('.wc-ph-okb-k').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as KeyBox));
const rects = (l: Locator): Promise<KeyBox[]> => l.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as KeyBox));
/** No two of the boxes overlap. */
function apart(boxes: KeyBox[], what: string): void {
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      expect(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5, `${what} ${i} and ${j} overlap`).toBe(true);
    }
}

for (const lay of ['sv', 'en'] as const)
  test(`portrait (360 × 800, ${lay}): fixed rows at the bottom, the command row on the keyboard, the page the same size`, async ({ page }) => {
    const errors = watchErrors(page);
    await openPhone(page, `&kbd=${lay}`);
    await setScreen(page, S21);
    const appBox = await box(page.locator('#app'));
    const cockpit = await box(page.locator('.wc-cockpit'));
    const closed = await layout(page);
    const cells = await page.locator('.wc-cockpit').getAttribute('data-cells');
    const padClosed = await box(pad(page));
    const hotClosed = await box(hot(page));
    const fieldClosed = await box(field(page));
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
    console.log(`360 × 800 ${lay}: game rows ${closed.game.h} closed, ${open.game.h} open (keyboard ${open.bottom} rows, command row ${open.input.h})`);

    // The band over the full width, from under the command row to the bottom edge; the block fills it.
    const k = await box(okb(page));
    const row = await box(slot(page));
    expect(k.x).toBeCloseTo(cockpit.x, 0);
    expect(k.width).toBeCloseTo(cockpit.width, 0);
    expect(k.y).toBeCloseTo(row.y + row.height, 0);
    expect(k.y + k.height).toBeCloseTo(cockpit.y + cockpit.height, 0);
    const blk = await box(block(page));
    expect(blk.x).toBeCloseTo(0, 0);
    expect(blk.width).toBeCloseTo(360, 0);
    // The rows: eleven letters a row in Swedish, ten in English; at this width the arrows are on the bottom row.
    expect(await rowsOf(page)).toEqual(
      lay === 'sv'
        ? ['qwertyuiopå', 'asdfghjklöä', '<shift>zxcvbnm<back>', '<fold><sym><digits>;<space>.<older><newer><enter>']
        : ['qwertyuiop', 'asdfghjkl', '<shift>zxcvbnm<back>', '<fold><sym><digits>;<space>.<older><newer><enter>'],
    );
    // Keys: four rows, about 46 px high, inside the screen, none cut off or overlapping.
    const keys = await keyBoxes(page);
    for (const b of keys) {
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeLessThanOrEqual(52);
      expect(b.width).toBeGreaterThanOrEqual(28);
      expect(b.left).toBeGreaterThanOrEqual(k.x);
      expect(b.right).toBeLessThanOrEqual(k.x + k.width + 0.5);
      expect(b.top).toBeGreaterThanOrEqual(k.y);
      expect(b.bottom).toBeLessThanOrEqual(S21.height + 0.5);
    }
    apart(keys, 'keys');
    expect(new Set(keys.map((b) => Math.round(b.top))).size).toBe(4);
    // A letter key is a tenth or an eleventh of the width; space is the widest key and Enter the next.
    const letter = await box(key(page, 'q'));
    expect(letter.width).toBeCloseTo(356 / (lay === 'sv' ? 11 : 10), 0);
    const w = async (name: string): Promise<number> => (await box(key(page, name))).width;
    expect(await w('space')).toBeGreaterThanOrEqual(70);
    expect(await w('enter')).toBeGreaterThan(await w('fold'));
    // A key's cap stands in from its cell, and the caps do not touch.
    const caps = await rects(okb(page).locator('.wc-ph-okb-cap'));
    expect(caps).toHaveLength(keys.length);
    apart(caps, 'caps');

    // The compass and the hot keys stand as with the keyboard down, lifted by the keyboard's
    // height: the compass at the command row's level, the columns above it, the field ending left of it.
    await expect(pad(page)).toBeVisible();
    await expect(hot(page)).toBeVisible();
    const lift = k.height;
    const padOpen = await box(pad(page));
    const hotOpen = await box(hot(page));
    expect(padOpen.x).toBeCloseTo(padClosed.x, 0);
    expect(padOpen.y).toBeCloseTo(padClosed.y - lift, 0);
    expect([padOpen.width, padOpen.height]).toEqual([padClosed.width, padClosed.height]);
    expect(hotOpen.x).toBeCloseTo(hotClosed.x, 0);
    expect(hotOpen.y).toBeCloseTo(hotClosed.y - lift, 0);
    expect(padOpen.y + padOpen.height).toBeLessThanOrEqual(k.y);
    const f = await box(field(page));
    expect(f.width).toBeCloseTo(fieldClosed.width, 0);
    expect(f.x + f.width).toBeLessThan(padOpen.x);
    // The field is on screen, above the keyboard.
    expect(f.y + f.height).toBeLessThanOrEqual(k.y + 0.5);
    // The lens stays, above the command row and clear of the lifted hot keys.
    const lens = page.locator('.wc-ph-lens');
    await expect(lens).toBeVisible();
    const l = await box(lens);
    expect(l.y + l.height).toBeLessThanOrEqual(row.y + 0.5);
    expect(l.y + l.height).toBeLessThanOrEqual(hotOpen.y + 0.5);
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
    expect(await box(pad(page))).toEqual(padClosed);
    expect(await box(hot(page))).toEqual(hotClosed);
    await frames(page);
    expect(await sizes()).toHaveLength(2);
    // (The game text tells its own rows, which follow the pane's: the keyboard's rows less, then back.)
    const told = (await sizes()).map((t) => Number(t.split('x')[1]));
    expect(told[1]! - told[0]!).toBe(open.bottom);
    expect(errors).toEqual([]);
  });

test('320 px wide: every key on screen, none overlapping, with the digit row up', async ({ page }) => {
  await openPhone(page, '&kbd=sv');
  await setScreen(page, { width: 320, height: 640 });
  await openKeyboard(page);
  await key(page, 'digits').tap();
  await expect(okb(page).locator('.wc-ph-okb-row')).toHaveCount(5);
  await frames(page);
  const k = await box(okb(page));
  const keys = await keyBoxes(page);
  apart(keys, 'keys');
  for (const b of keys) {
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(320.5);
    expect(b.bottom).toBeLessThanOrEqual(640.5);
    expect(b.top).toBeGreaterThanOrEqual(k.y);
    expect(b.width).toBeGreaterThanOrEqual(25);
    expect(b.height).toBeGreaterThanOrEqual(40);
  }
  // No label is cut off: a cap's text fits in its cap.
  expect(await okb(page).locator('.wc-ph-okb-cap').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent))).toEqual([]);
  // The game keeps rows, and the compass and the hot keys their place above the keyboard.
  expect((await layout(page)).game.h).toBeGreaterThanOrEqual(8);
  await expect(pad(page)).toBeVisible();
  await expect(hot(page)).toBeVisible();
  const p = await box(pad(page));
  expect(p.y + p.height).toBeLessThanOrEqual(k.y);
  await type(page, 'å', '1');
  await expect(field(page)).toHaveValue('å1');
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
  // Shift (also locked) and the symbols page do not outlive the keyboard.
  await type(page, 'shift', 'shift');
  await expect(okb(page)).toHaveAttribute('data-shift', 'lock');
  await key(page, 'sym').tap();
  await expect(okb(page)).toHaveAttribute('data-page', 'symbols');
  await key(page, 'fold').tap();
  await openKeyboard(page);
  await expect(okb(page)).toHaveAttribute('data-page', 'letters');
  await expect(key(page, 'shift')).toHaveAttribute('aria-pressed', 'false');
  await type(page, 'x');
  await expect(field(page)).toHaveValue('hix');
});

test('portrait: the compass and the hot keys send while it is open, and the field keeps its focus and its text', async ({ page }) => {
  const m = await enterMock(page);
  await m.login();
  await setScreen(page, S21);
  await openKeyboard(page);
  await type(page, 'h', 'i');
  await expect(pad(page)).toBeVisible();
  await compass(page, 'north').tap();
  await expect.poll(() => m.sent).toEqual(['north']);
  // K1 is `assist` by default.
  await hk(page, 1).tap();
  await expect.poll(() => m.sent).toEqual(['north', 'assist']);
  await expect(field(page)).toHaveValue('hi');
  expect(await inputFocused(page)).toBe(true);
  await expect(okb(page)).toBeVisible();
  expect(await history(page)).toEqual([]);
  // The K key hides and shows the columns as ever; hidden, the field keeps its width (the compass is still there).
  const f = await box(field(page));
  await pad(page).locator('.wc-ph-key.is-tog').tap();
  await expect(hot(page)).toBeHidden();
  expect((await box(field(page))).width).toBeCloseTo(f.width, 0);
  await pad(page).locator('.wc-ph-key.is-tog').tap();
  await expect(hot(page)).toBeVisible();
  expect(await inputFocused(page)).toBe(true);
  await expect(okb(page)).toBeVisible();
  // Folded: they send as before, and bring nothing up.
  await key(page, 'fold').tap();
  await compass(page, 'south').tap();
  await expect.poll(() => m.sent).toEqual(['north', 'assist', 'south']);
  await expect(okb(page)).toBeHidden();
  expect(await inputFocused(page)).toBe(false);
});

test('portrait, six hot keys: both columns above the compass, lifted, clear of the lens', async ({ page }) => {
  await openPhone(page, '&kbd=sv');
  await setScreen(page, S21);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
  await expect(hk(page, 6)).toBeVisible();
  const before = await rects(page.locator('.wc-ph-hk'));
  await openKeyboard(page);
  const k = await box(okb(page));
  const after = await rects(page.locator('.wc-ph-hk'));
  expect(after).toHaveLength(6);
  for (const [i, b] of after.entries()) {
    expect(b.left).toBeCloseTo(before[i]!.left, 0);
    expect(b.top).toBeCloseTo(before[i]!.top - k.height, 0);
    expect(b.width).toBe(before[i]!.width);
  }
  // The lens (or, with no room, its key row) keeps clear of the columns.
  const g = await layout(page);
  const top = Math.min(...after.map((b) => b.top));
  const lens = page.locator('.wc-ph-lens');
  if (g.lens) {
    const l = await box(lens);
    expect(l.y + l.height).toBeLessThanOrEqual(top + 0.5);
  } else {
    expect(g.lensHidden).toBe(true);
    for (const sat of await rects(page.locator('.wc-ph-satrow .wc-ph-sat'))) expect(sat.bottom <= top + 0.5 || sat.right <= Math.min(...after.map((b) => b.left)) + 0.5).toBe(true);
  }
});

test('portrait: the strip, the fight card and Comm end above the lifted hot keys', async ({ page }) => {
  await openPhone(page);
  await setScreen(page, S21);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { commRows: 200, stripRows: 200 } }));
  await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
  await expect(page.locator('.wc-pane[data-phone-strip]')).toBeVisible();
  await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
  await expect(page.locator('.wc-pane[data-pane="comm"]')).toBeVisible();
  const closed = await layout(page);
  await openKeyboard(page);
  const g = await layout(page);
  expect(g.strip.h + g.comm.h).toBeGreaterThan(0);
  expect(g.strip.h + g.comm.h).toBeLessThan(closed.strip.h + closed.comm.h);
  // The game text begins at or above the top of the place of three keys.
  const cell = (await box(page.locator('.wc-cockpit'))).height / g.rows;
  const top = Math.min(...(await rects(page.locator('.wc-ph-hk'))).map((b) => b.top));
  expect(g.game.y * cell).toBeLessThanOrEqual(top + 0.5);
  expect(g.game.h).toBeGreaterThanOrEqual(8);
});

test('a very low portrait screen: the hot key columns give way first, then the compass', async ({ page }) => {
  await openPhone(page, '&kbd=en');
  // 360 × 440: room for the compass above the keyboard, not for three hot keys over it.
  await setScreen(page, { width: 360, height: 440 });
  await openKeyboard(page);
  await expect(okb(page)).toBeVisible();
  await expect(hot(page)).toBeHidden();
  await expect(pad(page)).toBeVisible();
  await expect(page.locator('.wc-ph-layer')).toHaveAttribute('data-okb-nok', '');
  const padBox = await box(pad(page));
  expect(padBox.y).toBeGreaterThanOrEqual(0);
  // 320 × 330 with the digit row: not the compass either, and the field takes the full width.
  await key(page, 'fold').tap();
  await page.evaluate(() => window.__wc!.settings.update({ phone: { keyboard: { digits: true } } }));
  await setScreen(page, { width: 320, height: 330 });
  await openKeyboard(page);
  await expect(pad(page)).toBeHidden();
  await expect(hot(page)).toBeHidden();
  await expect(html(page)).toHaveClass(/\bwc-okb-wide\b/);
  const f = await box(field(page));
  expect(f.x + f.width).toBeGreaterThan(320 - 32);
  await type(page, 'o', 'k');
  await expect(field(page)).toHaveValue('ok');
  // Closed again, everything is back.
  await key(page, 'fold').tap();
  await expect(html(page)).not.toHaveClass(/\bwc-okb-wide\b/);
  await setScreen(page, S21);
  await expect(pad(page)).toBeVisible();
  await expect(hot(page)).toBeVisible();
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

// ----------------------------------------------------------------- landscape

test('landscape (800 × 360, six hot keys): the block in the middle, K1 to K3 left of it, K4 to K6 right, the compass at the far right', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await enterMock(page, 'sv');
  await m.login();
  await setScreen(page, S21_LAND);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
  await expect(hk(page, 6)).toBeVisible();
  await frames(page);
  const closed = await layout(page);
  const appBox = await box(page.locator('#app'));
  const sizes = await watchSizes(page);
  await openKeyboard(page);
  const open = await layout(page);
  expect(open.landscape).toBe(true);
  expect(await box(page.locator('#app'))).toEqual(appBox);
  expect(open.rows).toBe(closed.rows);
  expect(open.input.y + open.input.h + open.bottom).toBe(open.rows);
  // No fewer rows of game text than round 53a's full-width keyboard left (10 of 21 with a new phone's text size).
  console.log(`800 × 360: game rows ${closed.game.h} closed, ${open.game.h} open of ${open.rows} (keyboard ${open.bottom} rows, command row ${open.input.h})`);
  expect(open.game.h).toBeGreaterThanOrEqual(6);
  expect(open.bottom * (360 / open.rows)).toBeLessThanOrEqual(148 + 360 / open.rows);
  await frames(page);
  expect(await sizes()).toHaveLength(1);

  const cockpit = await box(page.locator('.wc-cockpit'));
  const band = await box(okb(page));
  const row = await box(slot(page));
  // The band: the full width, from under the command row to the bottom edge.
  expect(band.x).toBeCloseTo(cockpit.x, 0);
  expect(band.width).toBeCloseTo(cockpit.width, 0);
  expect(band.y).toBeCloseTo(row.y + row.height, 0);
  expect(band.y + band.height).toBeCloseTo(cockpit.y + cockpit.height, 0);
  // The block: compressed, its letter keys at most 46 px wide, one piece (no hole in a row).
  const blk = await box(block(page));
  expect(blk.width).toBeLessThanOrEqual(11 * 46 + 4.5);
  expect(blk.width).toBeGreaterThanOrEqual(11 * 36);
  expect((await box(key(page, 'q'))).width).toBeLessThanOrEqual(46.5);
  const keys = await keyBoxes(page);
  apart(keys, 'keys');
  const byRow = new Map<number, KeyBox[]>();
  for (const b of keys) byRow.set(Math.round(b.top), [...(byRow.get(Math.round(b.top)) ?? []), b]);
  expect(byRow.size).toBe(4);
  for (const r of byRow.values()) {
    r.sort((a, b) => a.left - b.left);
    for (let i = 1; i < r.length; i++) expect(r[i]!.left - r[i - 1]!.right).toBeLessThanOrEqual(1);
    for (const b of r) {
      expect(b.height).toBeGreaterThanOrEqual(30);
      expect(b.height).toBeLessThanOrEqual(40);
      expect(b.left).toBeGreaterThanOrEqual(blk.x - 0.5);
      expect(b.right).toBeLessThanOrEqual(blk.x + blk.width + 0.5);
      expect(b.bottom).toBeLessThanOrEqual(S21_LAND.height + 0.5);
    }
  }
  // Left to right: K1 to K3, the block, K4 to K6, the compass; all inside the band's height.
  const left = await rects(page.locator('.wc-ph-hot-col:not(.is-second) .wc-ph-hk'));
  const right = await rects(page.locator('.wc-ph-hot-col.is-second .wc-ph-hk'));
  const p = await box(pad(page));
  expect(left).toHaveLength(3);
  expect(right).toHaveLength(3);
  for (const b of left) {
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(blk.x);
  }
  for (const b of right) {
    expect(b.left).toBeGreaterThanOrEqual(blk.x + blk.width);
    expect(b.right).toBeLessThanOrEqual(p.x);
  }
  expect(p.x + p.width).toBeCloseTo(800 - 8, 0);
  for (const b of [...left, ...right, { top: p.y, bottom: p.y + p.height }]) {
    expect(b.top).toBeGreaterThanOrEqual(band.y);
    expect(b.bottom).toBeLessThanOrEqual(band.y + band.height + 0.5);
  }
  // K1 lowest in its column, K4 lowest in its.
  expect((await box(hk(page, 1))).y).toBeGreaterThan((await box(hk(page, 3))).y);
  expect((await box(hk(page, 4))).y).toBeGreaterThan((await box(hk(page, 6))).y);
  expect((await box(hk(page, 1))).x).toBeLessThan(blk.x);
  expect((await box(hk(page, 4))).x).toBeGreaterThan(blk.x + blk.width);
  // The block and its columns stand in the middle of what the compass leaves.
  const groupLeft = Math.min(...left.map((b) => b.left));
  const groupRight = Math.max(...right.map((b) => b.right));
  expect(groupLeft - 8).toBeCloseTo(p.x - 8 - groupRight, 0);
  // The field takes the row's full width.
  const f = await box(field(page));
  expect(f.x + f.width).toBeGreaterThan(cockpit.x + cockpit.width - 32);
  // The lens (or its key row) stays off the command row.
  for (const sat of await rects(page.locator('.wc-ph-sat:visible'))) expect(sat.bottom).toBeLessThanOrEqual(row.y + 3);

  // A hot key and a compass key send; the field keeps its focus and its text.
  await type(page, 'h', 'å');
  await hk(page, 1).tap();
  await hk(page, 4).tap();
  await compass(page, 'east').tap();
  await expect.poll(() => m.sent).toEqual(['assist', 'rescue', 'east']);
  await expect(field(page)).toHaveValue('hå');
  expect(await inputFocused(page)).toBe(true);
  await expect(okb(page)).toBeVisible();

  // The K key hides the columns: the block moves into the middle of what the compass leaves, and back.
  await pad(page).locator('.wc-ph-key.is-tog').tap();
  await expect(hot(page)).toBeHidden();
  const alone = await box(block(page));
  expect(alone.width).toBeCloseTo(blk.width, 0);
  expect(alone.x).toBeCloseTo((p.x - 8 - alone.width) / 2, 0);
  expect(await inputFocused(page)).toBe(true);
  await pad(page).locator('.wc-ph-key.is-tog').tap();
  await expect(hk(page, 1)).toBeVisible();
  expect((await box(block(page))).x).toBeCloseTo(blk.x, 0);
  // Neither the taps nor the K key told MUME a window size.
  await frames(page);
  expect(await sizes()).toHaveLength(1);

  // Folded: the keys are back above the compass at the right edge.
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await expect.poll(() => layout(page)).toEqual(closed);
  expect((await box(hk(page, 1))).x).toBeGreaterThan(700);
  expect(errors).toEqual([]);
});

test('landscape: fewer hot keys make fewer keys in the columns, and an empty column takes no width', async ({ page }) => {
  await openPhone(page, '&kbd=en');
  await setScreen(page, S21_LAND);
  // Three keys (the default): only the column left of the block.
  await openKeyboard(page);
  const blk3 = await box(block(page));
  await expect(page.locator('.wc-ph-hk:visible')).toHaveCount(3);
  for (const b of await rects(page.locator('.wc-ph-hk'))) expect(b.right).toBeLessThanOrEqual(blk3.x);
  // English: ten letters a row, so a narrower block than Swedish's.
  expect(blk3.width).toBeLessThanOrEqual(10 * 46 + 4.5);
  // K2 not shown: two keys left.
  await page.evaluate(() => {
    const s = window.__wc!.settings;
    s.update({ phone: { hotkeys: s.get().phone.hotkeys.map((k, i) => (i === 1 ? { ...k, shown: false } : k)) } });
  });
  await expect(page.locator('.wc-ph-hk:visible')).toHaveCount(2);
  expect((await box(block(page))).x).toBeCloseTo(blk3.x, 0);
  // Five keys, K1 to K3 all hidden: only the column right of the block, and the block moves left.
  await page.evaluate(() => {
    const s = window.__wc!.settings;
    s.update({ phone: { hotkeyCount: 5, hotkeys: s.get().phone.hotkeys.map((k, i) => ({ ...k, shown: i >= 3 })) } });
  });
  await expect(page.locator('.wc-ph-hk:visible')).toHaveCount(2);
  const blkR = await box(block(page));
  expect(blkR.x).toBeLessThan(blk3.x);
  for (const b of await rects(page.locator('.wc-ph-hk'))) expect(b.left).toBeGreaterThanOrEqual(blkR.x + blkR.width);
  await expect(okb(page)).toBeVisible();
});

test('a narrow landscape screen (568 × 320): the hot key columns give way, the compass stays; narrower still, the compass too', async ({ page }) => {
  await openPhone(page, '&kbd=sv');
  await setScreen(page, { width: 568, height: 320 });
  await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
  await openKeyboard(page);
  await expect(hot(page)).toBeHidden();
  await expect(pad(page)).toBeVisible();
  const blk = await box(block(page));
  const p = await box(pad(page));
  expect(blk.x).toBeGreaterThanOrEqual(0);
  expect(blk.x + blk.width).toBeLessThanOrEqual(p.x);
  expect((await box(key(page, 'q'))).width).toBeGreaterThanOrEqual(36);
  apart(await keyBoxes(page), 'keys');
  await type(page, 'ö');
  await expect(field(page)).toHaveValue('ö');
  await compass(page, 'north').tap();
  expect(await inputFocused(page)).toBe(true);
  // Folded: the columns are back.
  await key(page, 'fold').tap();
  await expect(hot(page)).toBeVisible();
  // 500 px: not the compass either; the block has the width.
  await setScreen(page, { width: 500, height: 320 });
  await openKeyboard(page);
  await expect(pad(page)).toBeHidden();
  await expect(hot(page)).toBeHidden();
  const wide = await box(block(page));
  expect(wide.x).toBeGreaterThanOrEqual(0);
  expect(wide.x + wide.width).toBeLessThanOrEqual(500.5);
  expect((await box(key(page, 'q'))).width).toBeGreaterThanOrEqual(36);
});

test('landscape at 800 × 280 (outside fullscreen): lower rows, everything in the band', async ({ page }) => {
  await openPhone(page, '&kbd=sv');
  await setScreen(page, { width: 800, height: 280 });
  await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
  await openKeyboard(page);
  const g = await layout(page);
  console.log(`800 × 280: game rows ${g.game.h} of ${g.rows} (keyboard ${g.bottom} rows)`);
  expect(g.game.h).toBeGreaterThanOrEqual(4);
  const band = await box(okb(page));
  expect(band.height).toBeLessThanOrEqual(132 + 280 / g.rows);
  for (const b of [...(await rects(page.locator('.wc-ph-hk'))), ...(await rects(pad(page)))]) {
    expect(b.top).toBeGreaterThanOrEqual(band.y);
    expect(b.bottom).toBeLessThanOrEqual(280.5);
  }
  expect(await rects(page.locator('.wc-ph-hk'))).toHaveLength(6);
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
