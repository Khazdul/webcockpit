// Stage 53 (ADR 0138): an on-screen keyboard of our own for the phone's
// game layout. It is the layout's only keyboard (`?kbd=0` went in round
// 53i); `?kbd=1` or `?kbd=debug` adds the readout, `?kbd=sv` / `?kbd=en` name the
// layout whatever the setting says (most cases here use one of them, so
// they do not depend on the browser's language). This file: the keyboard
// itself and the command field. The other fields (Comm, the hot key box,
// script panes), the settings and the vibration:
// phone-own-keyboard-fields.spec.ts.
//
// - The field asks the device for no keyboard
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
// - A visible area that shrinks (a split screen, a lower window, fullscreen
//   left) is nothing special: the layout uses the smaller area as on any
//   small screen, and ours stays, and opens, while it has room.
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

for (const query of ['', '&kbd=de']) test(`by default our keyboard is the game layout's: the field asks the device for none, a tap opens ours, no readout ("${query}")`, async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page, query);
  await expect(field(page)).toHaveAttribute('inputmode', 'none');
  await expect(field(page)).toHaveAttribute('virtualkeyboardpolicy', 'manual');
  await expect(okb(page)).toBeHidden();
  await expect(readout(page)).toHaveCount(0);
  await openKeyboard(page);
  await expect(html(page)).toHaveClass(/\bwc-okb\b/);
  expect(await inputFocused(page)).toBe(true);
  await type(page, 'l', 'o', 'o', 'k');
  await expect(field(page)).toHaveValue('look');
  expect((await layout(page)).bottom).toBeGreaterThan(0);
  await expect(readout(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the readout is a diagnostic: only with ?kbd=1 or ?kbd=debug', async ({ page }) => {
  for (const [query, shown] of [
    ['&kbd=debug', true],
    ['&kbd=1', true],
    ['&kbd=en', false],
    ['&kbd=sv', false],
  ] as const) {
    await openPhone(page, query);
    await expect(readout(page), query).toHaveCount(shown ? 1 : 0);
    if (shown) await expect(readout(page)).toContainText('| okb 0\n');
    // The keyboard is there either way.
    await expect(field(page)).toHaveAttribute('inputmode', 'none');
  }
});

test.describe('a tablet sent back to the desktop cockpit (`?tablet=desktop`)', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test('gets neither the game layout nor our keyboard', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/?replay&tablet=desktop');
    await expect(html(page)).not.toHaveClass(/\bwc-phone\b/);
    await expect(page.locator('.wc-cockpit')).toBeVisible();
    await expect(page.locator('.wc-cockpit[data-phone-game]')).toHaveCount(0);
    await expect(html(page)).not.toHaveClass(/\bwc-phone-game\b/);
    await expect(page.locator('.wc-ph-layer')).toHaveCount(0);
    await expect(okb(page)).toHaveCount(0);
    await expect(page.locator('.wc-input-field')).not.toHaveAttribute('inputmode');
    await page.locator('.wc-input-field').tap();
    await frames(page);
    await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
    expect(await page.evaluate(() => document.querySelectorAll('[inputmode="none"]').length)).toBe(0);
    expect(errors).toEqual([]);
  });
});

// The visible area can shrink for reasons that are no keyboard (a split screen, a window made
// lower, fullscreen left). Round 53e took a shrink right after a field tap for the device's
// keyboard and locked ours out; that guess is gone (ADR 0138, addendum 53e), and the device
// keyboard state itself went with the old phone layout (stage 55). What decides is the
// allocator's room (`tooSmall`), nothing else.

test('a split screen within a second of the field tap: our keyboard stays, the next tap finds it, and typing works', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page, '');
  await setScreen(page, S21);
  const t0 = Date.now();
  await openKeyboard(page);
  await page.setViewportSize({ width: 360, height: 560 });
  expect(Date.now() - t0).toBeLessThan(1000);
  await expect.poll(async () => (await box(page.locator('#app'))).height).toBe(560);
  await page.waitForTimeout(400);
  await frames(page);
  // Ours is still the keyboard, and the field kept the focus.
  await expect(html(page)).toHaveClass(/\bwc-okb\b/);
  await expect(okb(page)).toBeVisible();
  expect(await inputFocused(page)).toBe(true);
  await type(page, 'l');
  await expect(field(page)).toHaveValue('l');
  // Folded and tapped again in the lower window: it opens, and the keys type.
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await openKeyboard(page);
  await type(page, 'o');
  await expect(field(page)).toHaveValue('lo');
  // The keyboard and the field are inside the lower window.
  const k = await box(block(page));
  expect(k.y + k.height).toBeLessThanOrEqual(560 + 0.5);
  expect((await box(field(page))).y).toBeGreaterThanOrEqual(0);
  // Whole again: nothing folded, so the field is not blurred and ours is still there.
  await page.setViewportSize(S21);
  await frames(page);
  await expect(okb(page)).toBeVisible();
  expect(await inputFocused(page)).toBe(true);
  await type(page, 'k');
  await expect(field(page)).toHaveValue('lok');
  expect(errors).toEqual([]);
});

test('fullscreen left in landscape right after the field tap (800x360 to 800x280): our keyboard is still there to type with', async ({ page }) => {
  // A fake fullscreen state, as tests/e2e/phone-viewport-fullscreen.spec.ts has it.
  await page.addInitScript(() => {
    let full = true;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => (full ? document.documentElement : null) });
    (window as unknown as { __fs: (on: boolean) => void }).__fs = (on) => {
      full = on;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
  });
  const errors = watchErrors(page);
  await openPhone(page, '');
  await setScreen(page, S21_LAND);
  await openKeyboard(page);
  // The browser's bars come back: the event first, then the lower window.
  await page.evaluate(() => (window as unknown as { __fs: (on: boolean) => void }).__fs(false));
  await page.setViewportSize({ width: 800, height: 280 });
  await expect.poll(async () => (await box(page.locator('#app'))).height).toBe(280);
  // (Past the viewport module's settling after a fullscreen change, and the layer's.)
  await page.waitForTimeout(1000);
  await frames(page);
  // There is room for it at 280 px: it stayed, with the focus, and is not locked.
  await expect(okb(page)).toBeVisible();
  await expect(html(page)).toHaveClass(/\bwc-okb\b/);
  expect(await inputFocused(page)).toBe(true);
  await type(page, 'l', 'o', 'o', 'k');
  await expect(field(page)).toHaveValue('look');
  const k = await box(block(page));
  expect(k.y).toBeGreaterThanOrEqual(0);
  expect(k.y + k.height).toBeLessThanOrEqual(280 + 0.5);
  // Fold and tap: it opens again, here and at the full height.
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await openKeyboard(page);
  await key(page, 'fold').tap();
  await page.setViewportSize(S21_LAND);
  await expect.poll(async () => (await box(page.locator('#app'))).height).toBe(360);
  await openKeyboard(page);
  await type(page, 's');
  await expect(field(page)).toHaveValue('looks');
  expect(errors).toEqual([]);
});

// Round 53i review (F2): the close for lack of room is decided in the layout that finds the rows
// too low, so MUME gets the one window size of the lower window, not one with the keyboard's
// useless rows first (100x3, then 100x8).
test('a window made too low for the open keyboard (800 × 280 to 800 × 200): it closes with one window size', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page, '');
  await setScreen(page, { width: 800, height: 280 });
  await openKeyboard(page);
  await frames(page);
  const sizes = await watchSizes(page);
  await page.setViewportSize({ width: 800, height: 200 });
  await expect(okb(page)).toBeHidden();
  await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
  await page.waitForTimeout(900);
  const sent = await sizes();
  expect(sent).toHaveLength(1);
  // And that one is the lower window's own, without a reserve.
  const g = await layout(page);
  expect(g.bottom).toBe(0);
  expect(sent[0]!.endsWith(`x${await page.evaluate(() => window.__wc!.app.output.measureCells().rows)}`)).toBe(true);
  expect(await inputFocused(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('a window too low for our keyboard: it closes once, the field lets go, and nothing opens it again by itself', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page, '');
  await setScreen(page, S21_LAND);
  await openKeyboard(page);
  // How often it opens from here on.
  await page.evaluate(() => {
    const w = window as unknown as { __opens: number };
    w.__opens = 0;
    new MutationObserver((records) => {
      // (Each record's old value against the next one's, the last against the class as it is.)
      const seq = [...records.map((r) => r.oldValue ?? ''), document.documentElement.className].map((c) => /\bwc-okb\b/.test(c));
      for (let i = 1; i < seq.length; i++) if (seq[i] && !seq[i - 1]) w.__opens++;
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  });
  await page.setViewportSize({ width: 800, height: 150 });
  await expect(okb(page)).toBeHidden();
  await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
  await expect.poll(() => inputFocused(page)).toBe(false);
  // Through the viewport module's settling and well past it: closed, and never opened meanwhile.
  await page.waitForTimeout(1500);
  await expect(okb(page)).toBeHidden();
  expect(await inputFocused(page)).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { __opens: number }).__opens)).toBe(0);
  // A tap with no room opens nothing (the room is asked before anything moves: no layout, no
  // window size for MUME), and the field does not stay focused; it takes a new tap to try again.
  const sizesBefore = await page.evaluate(() => document.querySelector<HTMLElement>('.wc-cockpit')!.dataset.cells);
  await field(page).tap();
  await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
  await expect(okb(page)).toBeHidden();
  await expect.poll(() => inputFocused(page)).toBe(false);
  await page.waitForTimeout(600);
  await expect(okb(page)).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __opens: number }).__opens)).toBe(0);
  expect(await page.evaluate(() => document.querySelector<HTMLElement>('.wc-cockpit')!.dataset.cells)).toBe(sizesBefore);
  // Room again: the tap opens it and the keys type.
  await setScreen(page, S21_LAND);
  await openKeyboard(page);
  await type(page, 'l');
  await expect(field(page)).toHaveValue('l');
  // (The counter counts: this opening is in it.)
  expect(await page.evaluate(() => (window as unknown as { __opens: number }).__opens)).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('a visible area that shrinks with no field tapped (a split screen) is nothing special: ours opens, and an open one stays', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page, '');
  await setScreen(page, S21);
  // The window is made lower with nothing tapped: a tap on the field still opens our keyboard.
  await page.setViewportSize({ width: 360, height: 560 });
  await expect.poll(async () => (await box(page.locator('#app'))).height).toBe(560);
  // (Past the viewport module's settling: the shrink is not taken for a keyboard.)
  await page.waitForTimeout(400);
  await openKeyboard(page);
  await type(page, 'l');
  await expect(field(page)).toHaveValue('l');
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  await page.setViewportSize(S21);
  // Open for a while, then the window is made lower: ours stays, and the field keeps the focus.
  await openKeyboard(page);
  await page.waitForTimeout(2700);
  await page.setViewportSize({ width: 360, height: 560 });
  await expect.poll(async () => (await box(page.locator('#app'))).height).toBe(560);
  // (Past the viewport module's settling: the shrink is not taken for a keyboard.)
  await page.waitForTimeout(400);
  await frames(page);
  await expect(okb(page)).toBeVisible();
  expect(await inputFocused(page)).toBe(true);
  await type(page, 'o');
  await expect(field(page)).toHaveValue('lo');
  // Whole again: the field is not blurred (no device keyboard folded), and ours is still there.
  await page.setViewportSize(S21);
  await frames(page);
  await expect(okb(page)).toBeVisible();
  expect(await inputFocused(page)).toBe(true);
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
  expect(await inputFocused(page)).toBe(true);
  expect(await page.evaluate(() => (window.__wc!.shell as unknown as { phoneLayer: { ownKeyboardOpen: boolean } }).phoneLayer.ownKeyboardOpen)).toBe(true);
  // The readout: the focused field with its inputmode, our keyboard open, the device's not seen.
  await expect(readout(page)).toContainText('ae TEXTAREA im=none | okb 1\n');
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

test.describe('forced colours (a high contrast mode)', () => {
  test.use({ forcedColors: 'active' });

  test('the password prompt: the masked line paints no password', async ({ page }) => {
    const m = await enterMock(page);
    await setScreen(page, S21);
    await openKeyboard(page);
    m.server().send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, ECHO])]));
    await expect(field(page)).toHaveClass(/\bwc-masked\b/);
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    // Without the bullets' overlay and our caret only the field's own text is left: two
    // passwords of one length must give the same picture. (A range cannot be selected in the
    // masked line here: it is collapsed at once.)
    await page.addStyleTag({ content: '.wc-input-mask, .wc-caret { visibility: hidden !important; }' });
    const shot = () => slot(page).locator('.wc-input-wrap').screenshot({ animations: 'disabled', caret: 'hide' });
    await type(page, 's', 'e', 'c', 'r', 'e', 't');
    await expect(field(page)).toHaveValue('secret');
    const first = await shot();
    for (let i = 0; i < 6; i++) await type(page, 'back');
    await type(page, 'm', 'm', 'm', 'm', 'm', 'm');
    await expect(field(page)).toHaveValue('mmmmmm');
    const second = await shot();
    expect(first.equals(second)).toBe(true);
  });
});

test('the password prompt: the same field, masked with bullets and no password field; our keys type it, nothing is recorded, the arrows are dimmed', async ({ page }) => {
  const m = await enterMock(page);
  await setScreen(page, S21);
  await openKeyboard(page);
  await type(page, 'shift', 'r', 'a', 's', 't', 'a', 'enter');
  await expect.poll(() => m.sent).toEqual(['Rasta']);
  await expect(key(page, 'older')).not.toHaveAttribute('aria-disabled');
  // Half a line typed when the prompt comes: it does not become the password.
  await type(page, 'l', 'o');
  m.server().send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, ECHO])]));
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  await expect(field(page)).toHaveValue('');
  // The desktop's way: the textarea stays, with the bullets over it. No `type="password"` element anywhere.
  expect(await field(page).evaluate((el) => el.tagName)).toBe('TEXTAREA');
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(field(page)).toHaveAttribute('inputmode', 'none');
  await expect(field(page)).toHaveAttribute('virtualkeyboardpolicy', 'manual');
  // The focus and the keyboard stayed.
  expect(await inputFocused(page)).toBe(true);
  await expect(okb(page)).toBeVisible();
  await expect(readout(page)).toContainText('ae TEXTAREA im=none | okb 1');
  // No history at the prompt: the arrows are dimmed (review finding D), and do nothing.
  await expect(key(page, 'older')).toHaveAttribute('aria-disabled', 'true');
  await expect(key(page, 'newer')).toHaveAttribute('aria-disabled', 'true');
  await type(page, 's', 'e', 'c', 'x', 'back', 'r', 'e', 't');
  await expect(field(page)).toHaveValue('secret');
  await expect(page.locator('.wc-input-mask')).toHaveText('••••••');
  await expect(page.locator('.wc-input-mask')).toBeVisible();
  // The typed text itself is not painted.
  expect(await field(page).evaluate((el) => getComputedStyle(el).color)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  // Nor is a selection of it (53d review): the selected text has no colour either, so the frame
  // before the selection is collapsed shows nothing readable. Its ground is a tint, not solid.
  const sel = await field(page).evaluate((el) => {
    const c = getComputedStyle(el, '::selection');
    return { color: c.color, background: c.backgroundColor };
  });
  expect(sel.color).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(sel.background).not.toMatch(/^rgb\(/);
  await key(page, 'older').tap({ force: true });
  await expect(field(page)).toHaveValue('secret');
  // A range selected in the masked line is collapsed at once (no selection toolbar is offered the password).
  await field(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 6));
  await expect.poll(() => field(page).evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([6, 6]);
  await type(page, 'enter');
  await expect.poll(() => m.sent).toEqual(['Rasta', 'secret']);
  await expect(field(page)).toHaveValue('');
  expect(await history(page)).toEqual(['Rasta']);
  // The prompt goes while the next try is half typed: the line is shown again, empty, and has its history back.
  await type(page, 'h', 'a', 'l');
  m.server().send(Buffer.from([IAC, WONT, ECHO]));
  await expect(field(page)).not.toHaveClass(/\bwc-masked\b/);
  await expect(field(page)).toHaveValue('');
  await expect(page.locator('.wc-input-mask')).toBeHidden();
  await expect(key(page, 'older')).not.toHaveAttribute('aria-disabled');
  await expect(field(page)).toHaveAttribute('inputmode', 'none');
  await expect(okb(page)).toBeVisible();
  expect(await inputFocused(page)).toBe(true);
  await type(page, 'older');
  await expect(field(page)).toHaveValue('Rasta');
  expect(m.sent).toEqual(['Rasta', 'secret']);
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

test('320 × 568 (the smallest phone), the default gate: every key on screen, the command field on the keyboard, the game keeps its rows', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page, '');
  await setScreen(page, { width: 320, height: 568 });
  await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(0);
  for (const digits of [false, true]) {
    console.log('STAYED', await okb(page).isVisible());
  if (!(await okb(page).isVisible())) await openKeyboard(page);
    if (digits) await key(page, 'digits').tap();
    await expect(okb(page).locator('.wc-ph-okb-row')).toHaveCount(digits ? 5 : 4);
    await frames(page);
    await expect(okb(page)).toBeVisible();
    const k = await box(okb(page));
    const keys = await keyBoxes(page);
    apart(keys, `keys, digits ${digits}`);
    for (const b of keys) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(320.5);
      expect(b.top).toBeGreaterThanOrEqual(k.y);
      expect(b.bottom).toBeLessThanOrEqual(568.5);
      expect(b.width).toBeGreaterThanOrEqual(25);
      expect(b.height).toBeGreaterThanOrEqual(36);
    }
    const g = await layout(page);
    console.log(`320 × 568, digits ${digits}: game rows ${g.game.h} of ${g.rows} (keyboard ${g.bottom} rows)`);
    expect(g.tooSmall).toBe(false);
    expect(g.game.h).toBeGreaterThanOrEqual(8);
    // The field stands on the keyboard, whole and on screen.
    const f = await box(field(page));
    expect(f.y + f.height).toBeLessThanOrEqual(k.y + 0.5);
    expect(f.x + f.width).toBeLessThanOrEqual(320.5);
    expect(await inputFocused(page)).toBe(true);
  }
  await type(page, 'l', '1');
  await expect(field(page)).toHaveValue('l1');
  await key(page, 'digits').tap();
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
  // The lens has its room on this screen, and keeps clear of the columns.
  const g = await layout(page);
  const top = Math.min(...after.map((b) => b.top));
  expect(g.lens).not.toBeNull();
  expect(g.lensHidden).toBe(false);
  const lens = page.locator('.wc-ph-lens');
  await expect(lens).toBeVisible();
  const l = await box(lens);
  expect(l.y + l.height).toBeLessThanOrEqual(top + 0.5);
  // With the digit row up there is less room: the lens shrinks or gives way to its key row, and
  // either way nothing reaches into the columns.
  await key(page, 'digits').tap();
  await expect.poll(() => rowsOf(page).then((r) => r.length)).toBe(5);
  await frames(page);
  const up = await rects(page.locator('.wc-ph-hk'));
  const upTop = Math.min(...up.map((b) => b.top));
  const upLeft = Math.min(...up.map((b) => b.left));
  const g2 = await layout(page);
  expect(g2.lens !== null || g2.lensHidden).toBe(true);
  for (const part of await rects(page.locator('.wc-ph-lens:visible, .wc-ph-satrow:visible .wc-ph-sat'))) expect(part.bottom <= upTop + 0.5 || part.right <= upLeft + 0.5).toBe(true);
  expect(await page.locator('.wc-ph-lens:visible, .wc-ph-satrow:visible .wc-ph-sat').count()).toBeGreaterThan(0);
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
  expect(groupLeft).toBeCloseTo(p.x - 8 - groupRight, 0);
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

for (const query of ['&kbd=sv', '']) test(`landscape at 800 × 280 (outside fullscreen): lower rows, everything in the band ("${query}")`, async ({ page }) => {
  await openPhone(page, query);
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
  // (800 x 360: the column has the rows above the keyboard for the strip.)
  expect(land.strip.h).toBeGreaterThan(0);
  const pane = page.locator('.wc-pane[data-phone-strip]');
  await expect(pane).toBeVisible();
  const p = await box(pane);
  expect(p.y + p.height).toBeLessThanOrEqual(k2.y + 0.5);
});

// ------------------------------------------------- layouts, pages, the keys

test('Swedish (?kbd=sv): å ä ö and their capitals, shift once and locked', async ({ page }) => {
  await openPhone(page, '&kbd=sv');
  await setScreen(page, S21);
  await openKeyboard(page);
  await expect(okb(page)).toHaveAttribute('data-layout', 'sv');
  await type(page, 'å', 'ä', 'ö');
  await expect(field(page)).toHaveValue('åäö');
  // One capital, then small again.
  await type(page, 'shift');
  await expect(okb(page)).toHaveAttribute('data-shift', 'once');
  expect(await key(page, 'å').evaluate((el) => getComputedStyle(el).textTransform)).toBe('uppercase');
  await type(page, 'å', 'ä');
  await expect(okb(page)).toHaveAttribute('data-shift', 'off');
  await expect(field(page)).toHaveValue('åäöÅä');
  // A double tap locks: every letter a capital until the next tap on shift.
  await type(page, 'shift', 'shift');
  await expect(okb(page)).toHaveAttribute('data-shift', 'lock');
  await expect(key(page, 'shift')).toHaveAttribute('aria-label', 'Shift, locked');
  await expect(key(page, 'shift')).toHaveAttribute('aria-pressed', 'true');
  await type(page, 'ö', 'ä', 'å', 'space', 'k', ';', 'back', '.');
  await expect(okb(page)).toHaveAttribute('data-shift', 'lock');
  await expect(field(page)).toHaveValue('åäöÅäÖÄÅ K.');
  await type(page, 'shift');
  await expect(okb(page)).toHaveAttribute('data-shift', 'off');
  await type(page, 'ö');
  await expect(field(page)).toHaveValue('åäöÅäÖÄÅ K.ö');
});

test('a single shift is used up by any character and by Enter, not by backspace', async ({ page }) => {
  await openPhone(page, '&kbd=en');
  await setScreen(page, S21);
  await openKeyboard(page);
  const once = async (): Promise<void> => {
    await page.waitForTimeout(AFTER_DOUBLE_TAP_MS);
    await type(page, 'shift');
    await expect(okb(page)).toHaveAttribute('data-shift', 'once');
  };
  await type(page, 'a', 'b');
  await once();
  await type(page, 'back');
  await expect(okb(page)).toHaveAttribute('data-shift', 'once');
  await type(page, 'c');
  await expect(field(page)).toHaveValue('aC');
  for (const k of ['space', ';', '.']) {
    await once();
    await type(page, k);
    await expect(okb(page)).toHaveAttribute('data-shift', 'off');
  }
  await once();
  await type(page, 'enter');
  await expect(okb(page)).toHaveAttribute('data-shift', 'off');
  // A symbol and a digit use it up too.
  await once();
  await type(page, 'sym', '#');
  await expect(okb(page)).toHaveAttribute('data-shift', 'off');
  await type(page, 'sym');
  await once();
  await type(page, 'sym', '1', 'sym');
  await expect(okb(page)).toHaveAttribute('data-shift', 'off');
  await type(page, 'x');
  await expect(field(page)).toHaveValue('#1x');
});

test('?kbd=1 follows the browser\'s language', async ({ browser }) => {
  for (const [locale, lay] of [['sv-SE', 'sv'], ['en-GB', 'en'], ['de-DE', 'en']] as const) {
    const ctx = await browser.newContext({ locale, viewport: S21, hasTouch: true, isMobile: true, baseURL: test.info().project.use.baseURL! });
    const page = await ctx.newPage();
    await openPhone(page);
    await openKeyboard(page);
    await expect(okb(page)).toHaveAttribute('data-layout', lay);
    await expect(key(page, 'å')).toHaveCount(lay === 'sv' ? 1 : 0);
    await ctx.close();
  }
});

test('the symbols page: the same rows, every symbol typed, the digits as its first row while the digit row is folded away', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page, '&kbd=sv');
  await setScreen(page, S21);
  await openKeyboard(page);
  const sizes = await watchSizes(page);
  const band = await box(okb(page));
  await key(page, 'sym').tap();
  await expect(okb(page)).toHaveAttribute('data-page', 'symbols');
  await expect(key(page, 'sym')).toHaveAttribute('aria-label', 'Letters');
  expect(await rowsOf(page)).toEqual(['1234567890', '#@$%&*()/_\\', '<alt>\'",-!?:<back>', '<fold><sym><digits>;<space>.<older><newer><enter>']);
  // The block keeps its height: nothing is laid out anew, and MUME hears nothing.
  expect(await box(okb(page))).toEqual(band);
  const typed = ['#', '2', "'", '"', '\\', '/', '(', ')', '_', '-', ';', '.'];
  await type(page, ...typed);
  await expect(field(page)).toHaveValue(typed.join(''));
  // The next page of symbols, and round again.
  await expect(key(page, 'alt')).toHaveText('1/2');
  await key(page, 'alt').tap();
  await expect(key(page, 'alt')).toHaveText('2/2');
  expect((await rowsOf(page)).slice(0, 3)).toEqual(['1234567890', '>~^|`', '<alt>{}[]+=<<back>']);
  await type(page, '{', '}', '|', '<', '>', '`');
  await expect(field(page)).toHaveValue(`${typed.join('')}{}|<>\``);
  await key(page, 'alt').tap();
  await expect(key(page, 'alt')).toHaveText('1/2');
  // Backspace and Enter work here as on the letters; the page stays until its key is tapped.
  await type(page, 'back', 'back');
  await expect(field(page)).toHaveValue(`${typed.join('')}{}|<`);
  await expect(okb(page)).toHaveAttribute('data-page', 'symbols');
  await key(page, 'sym').tap();
  await expect(okb(page)).toHaveAttribute('data-page', 'letters');
  await expect(key(page, 'q')).toBeVisible();
  expect(await inputFocused(page)).toBe(true);
  await frames(page);
  expect(await sizes()).toEqual([]);
  // Every symbol asked for is on some page (the digit row up: Swedish has them all on one).
  await key(page, 'digits').tap();
  await expect(okb(page).locator('.wc-ph-okb-row')).toHaveCount(5);
  await key(page, 'sym').tap();
  await expect(key(page, 'alt')).toHaveCount(0);
  const onPage = (await rowsOf(page)).join('');
  for (const ch of '\'",-_!?:/\\#@$%&*(){}[]+=<>~^|.;1234567890') expect(onPage, ch).toContain(ch);
  expect(errors).toEqual([]);
});

test('the digit row: its key folds it up and down, one window size each, and it is remembered across a reload', async ({ page }) => {
  await openPhone(page, '&kbd=sv');
  await setScreen(page, S21);
  expect(await digitsStored(page)).toBe(false);
  await openKeyboard(page);
  const folded = await layout(page);
  const appBox = await box(page.locator('#app'));
  await expect(key(page, 'digits')).toHaveAttribute('aria-pressed', 'false');
  await expect(okb(page).locator('.wc-ph-okb-row')).toHaveCount(4);
  await frames(page);
  const sizes = await watchSizes(page);

  await key(page, 'digits').tap();
  await expect(okb(page).locator('.wc-ph-okb-row')).toHaveCount(5);
  await expect(key(page, 'digits')).toHaveAttribute('aria-pressed', 'true');
  expect((await rowsOf(page))[0]).toBe('1234567890');
  await expect.poll(async () => (await layout(page)).bottom).toBeGreaterThan(folded.bottom);
  const up = await layout(page);
  // One more row of keys: the game text gives exactly those rows, the page keeps its size.
  expect(up.game.h + up.bottom).toBe(folded.game.h + folded.bottom);
  expect(await box(page.locator('#app'))).toEqual(appBox);
  const k = await box(okb(page));
  const row = await box(slot(page));
  expect(k.y).toBeCloseTo(row.y + row.height, 0);
  const keys = await keyBoxes(page);
  expect(new Set(keys.map((b) => Math.round(b.top))).size).toBe(5);
  for (const b of keys) expect(b.height).toBeGreaterThanOrEqual(44);
  await frames(page);
  expect(await sizes()).toHaveLength(1);
  expect(await digitsStored(page)).toBe(true);
  expect(await inputFocused(page)).toBe(true);
  // The compass follows the taller keyboard.
  const p = await box(pad(page));
  expect(p.y + p.height).toBeLessThanOrEqual(k.y);
  expect(p.y + p.height).toBeGreaterThan(k.y - 12);
  await type(page, 'g', 'space', '2', '.', 'k');
  await expect(field(page)).toHaveValue('g 2.k');

  // Down again: one more size, the layout as before.
  await key(page, 'digits').tap();
  await expect(okb(page).locator('.wc-ph-okb-row')).toHaveCount(4);
  await expect.poll(() => layout(page)).toEqual(folded);
  await frames(page);
  expect(await sizes()).toHaveLength(2);

  // Up, and remembered: after a reload the keyboard opens with it.
  await key(page, 'digits').tap();
  await expect(okb(page).locator('.wc-ph-okb-row')).toHaveCount(5);
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(pad(page)).toBeVisible();
  await expect.poll(() => digitsStored(page)).toBe(true);
  await openKeyboard(page);
  await expect(okb(page).locator('.wc-ph-okb-row')).toHaveCount(5);
  await expect(key(page, 'digits')).toHaveAttribute('aria-pressed', 'true');
  expect((await layout(page)).bottom).toBe(up.bottom);
});

test('where the arrows stand: on the bottom row at 360 px, on the digit row where its keys are wide enough', async ({ page }) => {
  await openPhone(page, '&kbd=en');
  await setScreen(page, S21);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { keyboard: { digits: true } } }));
  await openKeyboard(page);
  expect(await rowsOf(page)).toEqual(['1234567890', 'qwertyuiop', 'asdfghjkl', '<shift>zxcvbnm<back>', '<fold><sym><digits>;<space>.<older><newer><enter>']);
  for (const b of await rects(okb(page).locator('.wc-ph-okb-row.is-digits .wc-ph-okb-k'))) expect(b.width).toBeGreaterThanOrEqual(30);
  // 412 px (a Pixel 7): twelve keys of 34 px.
  await setScreen(page, { width: 412, height: 839 });
  expect(await rowsOf(page)).toEqual(['1234567890<older><newer>', 'qwertyuiop', 'asdfghjkl', '<shift>zxcvbnm<back>', '<fold><sym><digits>;<space>.<enter>']);
  for (const b of await rects(okb(page).locator('.wc-ph-okb-row.is-digits .wc-ph-okb-k'))) expect(b.width).toBeGreaterThanOrEqual(30);
  // Landscape: the compressed block's digit row holds them too.
  await setScreen(page, S21_LAND);
  expect((await rowsOf(page))[0]).toBe('1234567890<older><newer>');
  const g = await layout(page);
  console.log(`800 × 360 with the digit row: game rows ${g.game.h} of ${g.rows}`);
});

test('the arrows recall the history, as the Up and Down keys do', async ({ page }) => {
  const m = await enterMock(page);
  await m.login();
  await setScreen(page, S21);
  await openKeyboard(page);
  await type(page, 'l', 'enter', 'n', 'enter', 'e', 'enter');
  await expect.poll(() => m.sent).toEqual(['l', 'n', 'e']);
  // Just sent: `e` stands selected, so the first arrow goes one further back.
  await type(page, 'older');
  await expect(field(page)).toHaveValue('n');
  await type(page, 'older');
  await expect(field(page)).toHaveValue('l');
  await type(page, 'older');
  await expect(field(page)).toHaveValue('l');
  await type(page, 'newer');
  await expect(field(page)).toHaveValue('n');
  expect(await inputFocused(page)).toBe(true);
  // Enter sends the recalled line; a key replaces it (it stands selected).
  await type(page, 'enter');
  await expect.poll(() => m.sent).toEqual(['l', 'n', 'e', 'n']);
  await type(page, 'older', 'w');
  await expect(field(page)).toHaveValue('w');
  // A draft is kept while browsing.
  await type(page, 'older', 'older', 'newer', 'newer');
  await expect(field(page)).toHaveValue('w');
  // No keyboard event was made up, and nothing was sent by the arrows.
  expect(m.sent).toEqual(['l', 'n', 'e', 'n']);
});

test('the password prompt: the arrows recall nothing', async ({ page }) => {
  const m = await enterMock(page);
  await setScreen(page, S21);
  await openKeyboard(page);
  await type(page, 'shift', 'r', 'a', 'enter');
  await expect.poll(() => m.sent).toEqual(['Ra']);
  m.server().send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, ECHO])]));
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  await expect(okb(page)).toBeVisible();
  // (Dimmed: Playwright taps them only when forced. A press still does nothing.)
  await type(page, 'p', 'w');
  await key(page, 'older').tap({ force: true });
  await expect(field(page)).toHaveValue('pw');
  await key(page, 'newer').tap({ force: true });
  await expect(field(page)).toHaveValue('pw');
  // Shift and the symbols work in the masked line.
  await type(page, 'shift', 'x', 'sym', '#');
  await expect(field(page)).toHaveValue('pwX#');
  await expect(page.locator('.wc-input-mask')).toHaveText('••••');
  await type(page, 'enter');
  await expect.poll(() => m.sent).toEqual(['Ra', 'pwX#']);
  expect(await history(page)).toEqual(['Ra']);
});

// ------------------------------------------------- the review's findings (53a)

test('a held backspace stops when the page is hidden, when the window loses the focus, and when the keyboard closes', async ({ page }) => {
  await openPhone(page);
  await openKeyboard(page);
  const fill = () => page.evaluate(() => window.__wc!.app.input.insertText('x'.repeat(200)));
  const len = async (): Promise<number> => (await field(page).inputValue()).length;
  const stops = async (how: () => Promise<void>): Promise<void> => {
    await fill();
    await touches(page, [key(page, 'back')], async () => {
      const start = await len();
      await expect.poll(len, { timeout: 3000 }).toBeLessThan(start - 5);
      await how();
      await expect(okb(page).locator('.is-down')).toHaveCount(0);
      const at = await len();
      // The finger is still down: nothing more goes.
      await page.waitForTimeout(300);
      expect(await len()).toBe(at);
      expect(at).toBeGreaterThan(0);
    });
  };
  await stops(() => page.evaluate(() => void document.dispatchEvent(new Event('visibilitychange'))));
  await stops(() => page.evaluate(() => void window.dispatchEvent(new Event('blur'))));
  // Closed with the key held (the menu opens over it).
  await stops(async () => {
    await page.evaluate(() => (window.__wc!.shell as unknown as { phoneLayer: { menu: { open(): void } } }).phoneLayer.menu.open());
    await expect(okb(page)).toBeHidden();
  });
});

test('a touch that is cancelled stops the repeat', async ({ page }) => {
  await openPhone(page);
  await openKeyboard(page);
  await page.evaluate(() => window.__wc!.app.input.insertText('x'.repeat(200)));
  const len = async (): Promise<number> => (await field(page).inputValue()).length;
  const b = await box(key(page, 'back'));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 0 }] });
  await expect.poll(len, { timeout: 3000 }).toBeLessThan(190);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await cdp.detach();
  await expect(okb(page).locator('.is-down')).toHaveCount(0);
  const at = await len();
  await page.waitForTimeout(300);
  expect(await len()).toBe(at);
});

test('a text field that is not ours closes our keyboard; a control that is no text field leaves it', async ({ page }) => {
  await openPhone(page);
  await setScreen(page, S21);
  await openKeyboard(page);
  await type(page, 'h', 'i');
  expect((await layout(page)).bottom).toBeGreaterThan(0);
  // No such field is in the game layout itself since round 53d; one put there (outside every pane and the box) stands for it.
  await page.evaluate(() => {
    const f = document.createElement('input');
    f.type = 'text';
    f.id = 'okb-test-foreign';
    document.querySelector('.wc-cockpit')!.append(f);
    f.focus();
  });
  await expect(okb(page)).toBeHidden();
  await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
  await expect.poll(async () => (await layout(page)).bottom).toBe(0);
  // It keeps its focus and is not marked; the command line keeps its text; nothing of the arrangement is left behind.
  await expect(page.locator('#okb-test-foreign')).toBeFocused();
  await expect(page.locator('#okb-test-foreign')).not.toHaveAttribute('inputmode');
  await expect(field(page)).toHaveValue('hi');
  expect(await page.locator('.wc-ph-layer').evaluate((el) => [el.getAttribute('data-okb'), el.style.getPropertyValue('--okb-lift'), document.documentElement.style.getPropertyValue('--wc-okb-h')])).toEqual([null, '', '']);
  await expect(pad(page)).toBeVisible();
  await page.evaluate(() => document.getElementById('okb-test-foreign')!.remove());
  // A tap on the command field brings ours back.
  await openKeyboard(page);
  expect(await inputFocused(page)).toBe(true);
  // A control that is not a text field leaves it open.
  await page.evaluate(() => {
    const b = document.createElement('input');
    b.type = 'checkbox';
    b.id = 'okb-test-box';
    document.querySelector('.wc-cockpit')!.append(b);
    b.focus();
  });
  await expect(okb(page)).toBeVisible();
  await page.evaluate(() => document.getElementById('okb-test-box')!.remove());
});

test('a held hot key folds our keyboard and opens its box; a tap on the command field closes the box and opens ours', async ({ page }) => {
  for (const size of [S21, S21_LAND]) {
    await openPhone(page);
    await setScreen(page, size);
    await openKeyboard(page);
    await type(page, 'h', 'i');
    await touches(page, [hk(page, 1)], async () => {
      await expect(page.locator('.wc-ph-rb')).toBeVisible();
    });
    await expect(okb(page)).toBeHidden();
    await expect(html(page)).not.toHaveClass(/\bwc-okb\b/);
    await expect(page.locator('.wc-ph-rb')).toBeVisible();
    await expect.poll(async () => (await layout(page)).bottom).toBe(0);
    await expect(field(page)).toHaveValue('hi');
    // The release did not end as a tap on what moved under the finger: nothing came back up, no menu.
    await frames(page);
    await expect(okb(page)).toBeHidden();
    expect(await inputFocused(page)).toBe(false);
    await expect(page.locator('.wc-ph-sheet')).toHaveCount(0);
    // The box stands where it does with the keyboard down, on screen.
    const rb = await box(page.locator('.wc-ph-rb'));
    expect(rb.y).toBeGreaterThanOrEqual(0);
    expect(rb.y + rb.height).toBeLessThanOrEqual(size.height + 0.5);
    await field(page).tap();
    await expect(okb(page)).toBeVisible();
    await expect(page.locator('.wc-ph-rb')).toBeHidden();
    expect(await inputFocused(page)).toBe(true);
  }
});

test('a key pressed with the field blurred gives it the focus back', async ({ page }) => {
  await openPhone(page);
  await setScreen(page, S21);
  await openKeyboard(page);
  await type(page, 'a');
  await field(page).evaluate((el: HTMLElement) => el.blur());
  expect(await inputFocused(page)).toBe(false);
  await expect(okb(page)).toBeVisible();
  await type(page, 'b');
  expect(await inputFocused(page)).toBe(true);
  await expect(field(page)).toHaveValue('ab');
  // Backspace, an arrow and Enter too; shift alone does not need the field.
  for (const k of ['back', 'older', 'enter']) {
    await field(page).evaluate((el: HTMLElement) => el.blur());
    await type(page, k);
    expect(await inputFocused(page), k).toBe(true);
  }
  // No device keyboard was asked for on the way.
  await expect(field(page)).toHaveAttribute('inputmode', 'none');
});

test('a long press that focuses the field opens our keyboard; a focus without a pointer does not', async ({ page }) => {
  await openPhone(page);
  // No pointer: a script's (or a physical key's) focus.
  await field(page).evaluate((el: HTMLElement) => el.focus());
  expect(await inputFocused(page)).toBe(true);
  await frames(page);
  await expect(okb(page)).toBeHidden();
  await field(page).evaluate((el: HTMLElement) => el.blur());
  // A finger held on the field: the browser focuses it during the hold, and no click follows.
  const b = await box(field(page));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 0 }] });
  await field(page).evaluate((el: HTMLElement) => el.focus());
  await expect(okb(page)).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await cdp.detach();
  await expect(okb(page)).toBeVisible();
  expect(await inputFocused(page)).toBe(true);
  // Long after a pointer, a focus without one opens nothing again.
  await key(page, 'fold').tap();
  await page.waitForTimeout(900);
  await field(page).evaluate((el: HTMLElement) => el.focus());
  await frames(page);
  await expect(okb(page)).toBeHidden();
});

test('landscape with the left column open: the column ends above the band, the block stays in the middle', async ({ page }) => {
  await openPhone(page, '&kbd=sv');
  await setScreen(page, S21_LAND);
  await openKeyboard(page);
  const plain = await box(block(page));
  await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
  await expect(page.locator('.wc-pane[data-phone-strip]')).toBeVisible();
  await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
  await expect.poll(async () => (await layout(page)).side.w).toBeGreaterThan(0);
  const g = await layout(page);
  expect(g.side.h).toBe(g.rows - g.bottom);
  const band = await box(okb(page));
  expect(band.x).toBe(0);
  expect(band.width).toBe(800);
  for (const pane of await rects(page.locator('.wc-pane[data-phone-strip], .wc-pane[data-pane="comm"]'))) if (pane.height > 0) expect(pane.bottom).toBeLessThanOrEqual(band.y + 0.5);
  expect(await box(block(page))).toEqual(plain);
  await expect(okb(page)).toBeVisible();
  // The fight card too.
  await type(page, 'ä');
  await expect(field(page)).toHaveValue('ä');
});

// ------------------------------------------- the review's findings (53b + 53c)

test('no dead zone in the block: the edges of the English second row are `a` and `l`, and a press on the rim or an empty place goes to the nearest key of that row', async ({ page }) => {
  await openPhone(page, '&kbd=en');
  await setScreen(page, S21);
  await openKeyboard(page);
  const b = await box(block(page));
  const a = await box(key(page, 'a'));
  const l = await box(key(page, 'l'));
  const q = await box(key(page, 'q'));
  // The caps stand in from the edges as before (half a key), but the keys reach them.
  expect(a.x).toBeLessThanOrEqual(b.x + 2.5);
  expect(l.x + l.width).toBeGreaterThanOrEqual(b.x + b.width - 2.5);
  const cap = await box(key(page, 'a').locator('.wc-ph-okb-cap'));
  expect(cap.x).toBeGreaterThan(q.x + q.width / 2 - 1);
  expect(cap.width).toBeCloseTo((await box(key(page, 's').locator('.wc-ph-okb-cap'))).width, 0);
  const y = a.y + a.height / 2;
  await page.touchscreen.tap(b.x + 5, y);
  await expect(field(page)).toHaveValue('a');
  await page.touchscreen.tap(b.x + b.width - 5, y);
  await expect(field(page)).toHaveValue('al');
  // The block's rim (its 2 px of padding): the nearest key of the row at that height.
  await page.touchscreen.tap(b.x + 0.5, q.y + q.height / 2);
  await expect(field(page)).toHaveValue('alq');
  await page.touchscreen.tap(q.x + q.width / 2 + q.width, b.y + 0.5);
  await expect(field(page)).toHaveValue('alqw');
  // The symbols' second page has empty places: a press there types the nearest key of its row.
  // (With the digit row up English has two symbols on its second page: five places are empty.)
  await type(page, 'digits', 'sym', 'alt');
  const rows = await rowsOf(page);
  expect(rows).toHaveLength(5);
  const third = rows[3]!;
  const last = [...third.replace(/<[a-z]+>/g, '')].at(-1)!;
  const lastBox = await box(key(page, last));
  const back = await box(key(page, 'back'));
  // (The page is short: its last key is not next to backspace.)
  expect(back.x - (lastBox.x + lastBox.width)).toBeGreaterThan(8);
  await page.touchscreen.tap(lastBox.x + lastBox.width + 6, lastBox.y + lastBox.height / 2);
  await expect(field(page)).toHaveValue(`alqw${last}`);
  // A press on the band beside the block is no key's (`nearest` answers inside the block only).
  await setScreen(page, S21_LAND);
  await expect(okb(page)).toBeVisible();
  const before = await field(page).inputValue();
  await okb(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch', clientX: r.left + 2, clientY: r.top + r.height / 2 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 77, pointerType: 'touch', clientX: r.left + 2, clientY: r.top + r.height / 2 }));
  });
  await frames(page);
  await expect(field(page)).toHaveValue(before);
});

test('landscape, 300 to 312 px high: the compass and the hot keys stay inside the band (small keys there)', async ({ page }) => {
  await openPhone(page, '&kbd=en');
  await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
  for (const height of [300, 304, 308, 312, 320, 360]) {
    await setScreen(page, { width: 800, height });
    console.log('STAYED', await okb(page).isVisible());
  if (!(await okb(page).isVisible())) await openKeyboard(page);
    await frames(page);
    const k = await box(okb(page));
    const p = await box(pad(page));
    expect(p.y, `${height}: the compass's top`).toBeGreaterThanOrEqual(k.y - 0.5);
    expect(p.y + p.height, `${height}: the compass's foot`).toBeLessThanOrEqual(height + 0.5);
    for (const b of await rects(page.locator('.wc-ph-hk'))) {
      expect(b.top, `${height}: a hot key's top`).toBeGreaterThanOrEqual(k.y - 0.5);
      expect(b.bottom).toBeLessThanOrEqual(height + 0.5);
    }
    // The compass, the columns and the block do not overlap.
    apart([...(await rects(pad(page))), ...(await rects(page.locator('.wc-ph-hot-col'))), ...(await rects(block(page)))], `${height}: band part`);
  }
  // Closed, the keys have the screen's own size again.
  await setScreen(page, { width: 800, height: 304 });
  const open = (await box(compass(page, 'north'))).width;
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  const closed = (await box(compass(page, 'north'))).width;
  expect(closed).toBeGreaterThanOrEqual(open);
  expect(await page.locator('.wc-ph-layer').evaluate((el) => el.style.getPropertyValue('--ph-ck'))).toBe('');
});

test('landscape: the block does not move when the K key hides and shows both columns', async ({ page }) => {
  await openPhone(page, '&kbd=sv');
  await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
  await setScreen(page, S21_LAND);
  await openKeyboard(page);
  await frames(page);
  const sizes = await watchSizes(page);
  const shown = await box(block(page));
  await expect(hot(page).locator('.wc-ph-hk')).toHaveCount(6);
  await pad(page).locator('.wc-ph-key.is-tog').tap();
  await expect(page.locator('.wc-ph-hk:visible')).toHaveCount(0);
  await frames(page);
  const hidden = await box(block(page));
  expect(hidden.x).toBeCloseTo(shown.x, 1);
  expect(hidden.width).toBeCloseTo(shown.width, 1);
  await pad(page).locator('.wc-ph-key.is-tog').tap();
  await expect(page.locator('.wc-ph-hk:visible')).toHaveCount(6);
  await frames(page);
  expect((await box(block(page))).x).toBeCloseTo(shown.x, 1);
  expect(await sizes()).toEqual([]);
});

test('the safe area: the keys end inside it, and the keyboard\'s ground goes on to the screen\'s edge under it', async ({ page }) => {
  await openPhone(page, '&kbd=en');
  await setScreen(page, S21);
  // An iPhone's home indicator, through CDP (where this Chromium can emulate it).
  const cdp = await page.context().newCDPSession(page);
  const ok = await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: { bottom: 34 } } as never).then(
    () => true,
    () => false,
  );
  test.skip(!ok, 'this browser cannot emulate safe-area insets');
  await expect.poll(async () => (await box(page.locator('.wc-cockpit'))).height).toBeLessThan(800);
  await frames(page);
  await openKeyboard(page);
  await frames(page);
  const k = await box(okb(page));
  expect(k.y + k.height).toBeCloseTo(800 - 34, 0);
  for (const b of await keyBoxes(page)) expect(b.bottom).toBeLessThanOrEqual(800 - 34 + 0.5);
  // The ground behind: from the keyboard's top to the screen's bottom edge, in the keyboard's colour.
  const ground = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('app')!, '::after');
    return { height: parseFloat(cs.height), bottom: cs.bottom, bg: cs.backgroundColor, content: cs.content };
  });
  expect(ground.content).not.toBe('none');
  expect(ground.bottom).toBe('0px');
  expect(ground.height).toBeCloseTo(k.height + 34, 0);
  expect(ground.bg).toBe(await okb(page).evaluate((el) => getComputedStyle(el).backgroundColor));
  // Closed: no ground.
  await key(page, 'fold').tap();
  await expect(okb(page)).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('app')!, '::after').content)).toBe('none');
  await cdp.detach();
});
