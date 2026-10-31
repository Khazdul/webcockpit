// Stage 30b (ADR 0103): the Profile and Scripts windows over the cockpit:
// open from the bar and the commands, move, resize, snap to cells, focus
// that follows presses (keys back to the game after a click in the output
// or the input), two windows' z-order, places remembered across reloads,
// X and Esc through the editor's unsaved prompt, the Esc order in the
// input, and the Exit popup's warning.
import { type Page, expect, test } from '@playwright/test';

const field = (page: Page) => page.locator('.wc-input-field');
const icon = (page: Page, id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
const win = (page: Page, id: string) => page.locator(`.wc-win[data-win="${id}"]`);
const bar = (page: Page, id: string) => win(page, id).locator('.wc-win-bar');
const overlay = (page: Page) => page.locator('.wc-overlay');
const popup = (page: Page) => page.locator('.wc-pop');
/** The visible frame's title inside window `id`. */
const frameTitle = (page: Page, id: string) => win(page, id).locator('.wc-frame:not([hidden]) .wc-title-row .wc-c-section');
/** The profile editor's view toggle (it is up once the editor is). */
const editorToggle = (page: Page) => win(page, 'profile').locator('.wc-frame:not([hidden]) .wc-ped-toggle');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function offline(page: Page): Promise<void> {
  await page.goto('/?replay');
  await expect(field(page)).toBeFocused();
  await expect(page.locator('.wc-mb-bar')).toBeVisible();
}

async function cell(page: Page): Promise<{ w: number; h: number }> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { w: parseFloat(cs.getPropertyValue('--cell-w')), h: parseFloat(cs.getPropertyValue('--cell-h')) };
  });
}

/** Window `id`'s box in cells, relative to the cockpit element. */
async function cells(page: Page, id: string): Promise<{ x: number; y: number; w: number; h: number }> {
  return page.evaluate((id) => {
    const cs = getComputedStyle(document.documentElement);
    const cw = parseFloat(cs.getPropertyValue('--cell-w'));
    const ch = parseFloat(cs.getPropertyValue('--cell-h'));
    const o = document.querySelector('.wc-cockpit')!.getBoundingClientRect();
    const r = document.querySelector(`.wc-win[data-win="${id}"]`)!.getBoundingClientRect();
    return { x: (r.left - o.left) / cw, y: (r.top - o.top) / ch, w: r.width / cw, h: r.height / ch };
  }, id);
}

const whole = (n: number): boolean => Math.abs(n - Math.round(n)) < 0.01;

test('the bar opens the Profile window: the editor, focused, ~80% centred on whole cells', async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await icon(page, 'profile').click();
  await expect(win(page, 'profile')).toBeVisible();
  await expect(win(page, 'profile')).toHaveAttribute('data-focused', '');
  await expect(win(page, 'profile').locator('.wc-win-title')).toHaveText('Profile:default');
  await expect(editorToggle(page)).toBeVisible();
  await expect(overlay(page)).toBeHidden();
  await expect(icon(page, 'profile')).toHaveClass(/is-open/);
  const c = await cells(page, 'profile');
  for (const v of Object.values(c)) expect(whole(v)).toBe(true);
  const grid = await page.locator('.wc-cockpit').getAttribute('data-cells');
  const [cols, rows] = grid!.split('x').map(Number);
  expect(Math.round(c.w)).toBe(Math.max(62, Math.floor(cols! * 0.8)));
  expect(Math.round(c.h)).toBe(Math.max(20, Math.floor(rows! * 0.8)));
  expect(Math.abs(c.x - (cols! - c.w) / 2)).toBeLessThanOrEqual(1);
  // The window has the keys: they never reach the game input.
  await page.keyboard.press('ArrowRight');
  await expect(field(page)).toHaveValue('');
  expect(errors).toEqual([]);
});

test('#profile and #scripts toggle: open, raise and focus, then close as X', async ({ page }) => {
  await offline(page);
  await field(page).fill('#scripts');
  await page.keyboard.press('Enter');
  await expect(win(page, 'scripts')).toHaveAttribute('data-focused', '');
  await expect(frameTitle(page, 'scripts')).toHaveText('─── Scripts ───');
  // A click in the output: the game has the keys again, the window stays, dimmed.
  await page.locator('.wc-game').click({ position: { x: 20, y: 20 } });
  await expect(win(page, 'scripts')).not.toHaveAttribute('data-focused', '');
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('abc');
  await expect(field(page)).toHaveValue('abc');
  await field(page).fill('#scripts');
  await page.keyboard.press('Enter');
  // Open but not focused: raised and focused.
  await expect(win(page, 'scripts')).toHaveAttribute('data-focused', '');
  // The bar's icon while it is focused: closed.
  await icon(page, 'scripts').click();
  await expect(win(page, 'scripts')).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await expect(icon(page, 'scripts')).not.toHaveClass(/is-open/);
});

test('drag moves and the grip resizes in whole cells, kept on screen and above the minimum', async ({ page }) => {
  await offline(page);
  await icon(page, 'scripts').click();
  await expect(win(page, 'scripts')).toBeVisible();
  const c = await cell(page);
  const before = await cells(page, 'scripts');
  const b = (await bar(page, 'scripts').boundingBox())!;
  // 5.4 cells right, 2.6 down: 5 and 3 whole cells.
  await page.mouse.move(b.x + 40, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 40 + c.w * 5.4, b.y + b.height / 2 + c.h * 2.6, { steps: 4 });
  await page.mouse.up();
  const moved = await cells(page, 'scripts');
  expect(Math.round(moved.x - before.x)).toBe(5);
  expect(Math.round(moved.y - before.y)).toBe(3);
  for (const v of Object.values(moved)) expect(whole(v)).toBe(true);
  // Far off the screen: kept fully on it.
  await page.mouse.move(b.x + 40 + c.w * 5, b.y + b.height / 2 + c.h * 3);
  await page.mouse.down();
  // (Released inside the page: Firefox drops a pointerup outside the viewport.)
  await page.mouse.move(1, 1, { steps: 3 });
  await page.mouse.up();
  const clamped = await cells(page, 'scripts');
  expect(Math.round(clamped.x)).toBe(0);
  expect(Math.round(clamped.y)).toBe(0);
  // The grip: two cells narrower and one shorter.
  const g = (await win(page, 'scripts').locator('.wc-win-grip').boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 - c.w * 2, g.y + g.height / 2 - c.h, { steps: 3 });
  await page.mouse.up();
  const resized = await cells(page, 'scripts');
  expect(Math.round(resized.w)).toBe(Math.round(clamped.w) - 2);
  expect(Math.round(resized.h)).toBe(Math.round(clamped.h) - 1);
  // Down to the minimum: 60 × 18 content cells, 62 × 20 outer.
  const g2 = (await win(page, 'scripts').locator('.wc-win-grip').boundingBox())!;
  await page.mouse.move(g2.x + 5, g2.y + 5);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 3 });
  await page.mouse.up();
  const min = await cells(page, 'scripts');
  expect(Math.round(min.w)).toBe(62);
  expect(Math.round(min.h)).toBe(20);
  // The left edge: one cell wider to the left would leave the screen; the right edge stays put.
  const right = min.x + min.w;
  const box = (await win(page, 'scripts').boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 3 + c.w * 4, box.y + box.height / 2, { steps: 2 });
  await page.mouse.up();
  const w2 = await cells(page, 'scripts');
  expect(Math.round(w2.x + w2.w)).toBe(Math.round(right));
  expect(Math.round(w2.w)).toBe(62);
});

test('two windows: a press raises one above the other; places survive a reload', async ({ page }) => {
  await offline(page);
  await icon(page, 'profile').click();
  await expect(editorToggle(page)).toBeVisible();
  await icon(page, 'scripts').click();
  await expect(win(page, 'scripts')).toHaveAttribute('data-focused', '');
  await expect(win(page, 'profile')).not.toHaveAttribute('data-focused', '');
  const p = await cells(page, 'profile');
  const s = await cells(page, 'scripts');
  // The second one stands a cell right and down of the first.
  expect(Math.round(s.x - p.x)).toBe(1);
  expect(Math.round(s.y - p.y)).toBe(1);
  const z = (id: string) => win(page, id).evaluate((el) => Number((el as HTMLElement).style.zIndex));
  expect(await z('scripts')).toBeGreaterThan(await z('profile'));
  // A press on Profile's title bar (its left end is not under Scripts, which stands a cell right and down).
  const pb = (await bar(page, 'profile').boundingBox())!;
  await page.mouse.click(pb.x + 30, pb.y + pb.height / 2);
  await expect(win(page, 'profile')).toHaveAttribute('data-focused', '');
  await expect(win(page, 'scripts')).not.toHaveAttribute('data-focused', '');
  expect(await z('profile')).toBeGreaterThan(await z('scripts'));
  // Move Profile, then reload: both places are remembered (the default Scripts place too once moved).
  const c = await cell(page);
  await page.mouse.move(pb.x + 30, pb.y + pb.height / 2);
  await page.mouse.down();
  await page.mouse.move(pb.x + 30 - c.w * 3, pb.y + pb.height / 2 - c.h * 2, { steps: 3 });
  await page.mouse.up();
  const moved = await cells(page, 'profile');
  await expect.poll(() => page.evaluate(() => localStorage.length)).toBeGreaterThan(0);
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(field(page)).toBeFocused();
  await icon(page, 'profile').click();
  await expect(win(page, 'profile')).toBeVisible();
  const again = await cells(page, 'profile');
  expect(Math.round(again.x)).toBe(Math.round(moved.x));
  expect(Math.round(again.y)).toBe(Math.round(moved.y));
  expect(Math.round(again.w)).toBe(Math.round(moved.w));
});

test('focus follows presses: input, output, the other window; keys go where the press was', async ({ page }) => {
  await offline(page);
  await icon(page, 'scripts').click();
  await expect(win(page, 'scripts')).toHaveAttribute('data-focused', '');
  // A press in the input field: the game's keys.
  await field(page).click();
  await expect(win(page, 'scripts')).not.toHaveAttribute('data-focused', '');
  await page.keyboard.type('look');
  await expect(field(page)).toHaveValue('look');
  // A press in the window: its keys again (↓ moves its cursor, the input keeps its text).
  await win(page, 'scripts').locator('.wc-win-body').click({ position: { x: 30, y: 60 } });
  await expect(win(page, 'scripts')).toHaveAttribute('data-focused', '');
  await page.keyboard.type('xyz');
  await expect(field(page)).toHaveValue('look');
  // The ESC menu takes the focus from the window.
  await page.locator('.wc-game').click({ position: { x: 20, y: 20 } });
  await field(page).fill('');
  await page.keyboard.press('Escape');
  // Esc in the input with a window open: the window's close request (no unsaved changes: it closes).
  await expect(win(page, 'scripts')).toHaveCount(0);
  await expect(overlay(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeVisible();
});

test('the Esc order in the input: popup, then window, then the ESC menu', async ({ page }) => {
  await offline(page);
  await icon(page, 'scripts').click();
  await expect(win(page, 'scripts')).toBeVisible();
  await field(page).click();
  await icon(page, 'panes').click();
  await expect(popup(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
  await expect(win(page, 'scripts')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(win(page, 'scripts')).toHaveCount(0);
  await expect(overlay(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeVisible();
});

test('the ESC menu Profile and Options → Scripts open the windows and close the menu', async ({ page }) => {
  await offline(page);
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeVisible();
  await page.locator('.wc-overlay .wc-mrow[data-key="profile"] .wc-label').click();
  await expect(overlay(page)).toBeHidden();
  await expect(win(page, 'profile')).toHaveAttribute('data-focused', '');
  await expect(editorToggle(page)).toBeVisible();
  // Opening the menu takes the window's focus.
  await page.locator('.wc-game').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Escape'); // the window closes first
  await expect(win(page, 'profile')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeVisible();
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await page.locator('.wc-overlay .wc-mrow[data-key="scripts"] .wc-label').click();
  await expect(overlay(page)).toBeHidden();
  await expect(win(page, 'scripts')).toHaveAttribute('data-focused', '');
});

// ------------------------------------------------- live: unsaved changes

const IAC = 255;
const WILL = 251;
const GMCP = 201;

async function enterMume(page: Page, profile: string): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.evaluate(async (t) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', t);
  }, profile);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(field(page)).toBeFocused();
}

const ped = (page: Page) => win(page, 'profile').locator('.wc-frame:not([hidden]) > .wc-ped');
const modal = (page: Page) => ped(page).locator('.wc-ped-overlay');
const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null));

/** Opens the Profile window from the bar and adds an alias `name` (unsaved). */
async function editAlias(page: Page, name: string): Promise<void> {
  await icon(page, 'profile').click();
  await expect(ped(page)).toHaveAttribute('data-mode', 'lite');
  await ped(page).locator('[data-kind="alias"]').first().click();
  await page.keyboard.press('ArrowDown');
  await expect(ped(page)).toHaveAttribute('data-zone', 'list');
  await page.keyboard.press('n');
  await page.keyboard.type(name);
  await expect(ped(page).locator('input[data-field="pattern"]')).toHaveValue(name);
}

test('X with unsaved changes asks Apply / Discard / Keep editing, as Esc does', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, '#alias {a} {b}\n');
  await editAlias(page, 'q');
  const x = win(page, 'profile').locator('.wc-win-x');
  await x.click();
  await expect(modal(page)).toContainText('Apply changes to your profile?');
  await expect(win(page, 'profile')).toHaveAttribute('data-focused', '');
  // Keep editing: the window stays, and a later Esc out of the editor still asks.
  await page.keyboard.press('Escape');
  await expect(modal(page)).toHaveCount(0);
  await expect(win(page, 'profile')).toBeVisible();
  await x.click();
  await expect(modal(page)).toContainText('Apply changes to your profile?');
  await page.keyboard.press('n'); // discard: the window closes
  await expect(win(page, 'profile')).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  expect(await stored(page)).toBe('#alias {a} {b}\n');

  // Esc in the game input reaches the window: it takes the focus and asks; Y applies and closes.
  await editAlias(page, 'r');
  await page.locator('.wc-game').click({ position: { x: 20, y: 20 } });
  await expect(win(page, 'profile')).not.toHaveAttribute('data-focused', '');
  await page.keyboard.press('Escape');
  await expect(win(page, 'profile')).toHaveAttribute('data-focused', '');
  await expect(modal(page)).toContainText('Apply changes to your profile?');
  await page.keyboard.press('y');
  await expect(win(page, 'profile')).toHaveCount(0);
  await expect.poll(() => stored(page)).toBe('#alias {a} {b}\n#alias {r} {}\n');
  expect(errors).toEqual([]);
});

test('Exit warns about unsaved changes in a window, then discards them; the windows close with the cockpit', async ({ page }) => {
  await enterMume(page, '#alias {a} {b}\n');
  await icon(page, 'scripts').click();
  await expect(win(page, 'scripts')).toBeVisible();
  await editAlias(page, 's');
  await icon(page, 'exit').click();
  await expect(page.locator('.wc-pop-exit')).toBeFocused();
  await expect(page.locator('.wc-pop-warn')).toHaveText('Unsaved changes in an open window will be lost.');
  await page.keyboard.press('y');
  await expect(page.locator('.wc-start')).toBeVisible();
  await expect(page.locator('.wc-win')).toHaveCount(0);
  expect(await stored(page)).toBe('#alias {a} {b}\n');
  // Back in: no window is open, and without unsaved changes there is no warning.
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(page.locator('.wc-win')).toHaveCount(0);
  await icon(page, 'scripts').click();
  await expect(win(page, 'scripts')).toBeVisible();
  await icon(page, 'exit').click();
  await expect(page.locator('.wc-pop-exit')).toBeVisible();
  await expect(page.locator('.wc-pop-warn')).toHaveCount(0);
});

test('the windows sit above a floating pane and below the bar popups and the ESC menu', async ({ page }) => {
  await offline(page);
  await icon(page, 'scripts').click();
  await expect(win(page, 'scripts')).toBeVisible();
  const box = (await win(page, 'scripts').boundingBox())!;
  // What is on top at the window's centre: the window, not a pane.
  const top = await page.evaluate(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('.wc-win'), [box.x + box.width / 2, box.y + box.height / 2]);
  expect(top).toBe(true);
  const z = await page.evaluate(() => getComputedStyle(document.querySelector('.wc-windows')!).zIndex);
  expect(Number(z)).toBeGreaterThan(10);
  expect(Number(z)).toBeLessThan(100);
  // A window kept fully on screen when the viewport shrinks.
  await page.setViewportSize({ width: 700, height: 420 });
  await expect
    .poll(async () => {
      const r = (await win(page, 'scripts').boundingBox())!;
      const vp = page.viewportSize()!;
      return r.x >= 0 && r.y >= 0 && r.x + r.width <= vp.width + 0.5 && r.y + r.height <= vp.height + 0.5;
    })
    .toBe(true);
});
