// Stage 30b (ADR 0103): the Profile and Scripts windows over the cockpit:
// open from the bar and the commands, move, resize, snap to cells, focus
// that follows presses (keys back to the game after a click in the output
// or the input), two windows' z-order, places remembered across reloads,
// X and Esc through the editor's unsaved prompt, the Esc order in the
// input, and the Exit popup's warning. Stage 44 (ADR 0129): the Scripts
// window keeps its one Lykta frame on every page while the title and note
// follow the top frame (page, editor, manual), its sub-pages have a small
// Back, and X with unsaved script changes asks first.
import { type Page, expect, test } from '@playwright/test';
import { winNote, winTitle, winTop } from './look';

const field = (page: Page) => page.locator('.wc-input-field');
const icon = (page: Page, id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
const win = (page: Page, id: string) => page.locator(`.wc-win[data-win="${id}"]`);
const bar = (page: Page, id: string) => win(page, id).locator('.wc-win-bar');
const overlay = (page: Page) => page.locator('.wc-overlay');
const popup = (page: Page) => page.locator('.wc-pop');
/** The profile editor's views (they are up once the editor is; ADR 0128). */
const editorToggle = (page: Page) => win(page, 'profile').locator('.wc-frame:not([hidden]) .wc-pe .wc-pe-views');

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
  // The Lykta frame (ADR 0127): the title in the hood, the profile's name as the note.
  await expect(win(page, 'profile').locator('.wc-win-t')).toHaveText('Profile');
  await expect(win(page, 'profile').locator('.wc-win-n')).toHaveText('default');
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
  await expect(winTitle(page, 'scripts')).toHaveText('Scripts');
  await expect(winTop(page, 'scripts').locator('.wc-scr')).toBeVisible();
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
  // The focus stayed in the focused window: the dimmed one never takes it.
  expect(await page.evaluate(() => !!document.activeElement?.closest('.wc-win[data-win="profile"]'))).toBe(true);
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
  // A press in the window: its keys again (the input keeps its text; no page letter here).
  await win(page, 'scripts').locator('.wc-win-body').click({ position: { x: 30, y: 60 } });
  await expect(win(page, 'scripts')).toHaveAttribute('data-focused', '');
  await page.keyboard.type('zqz');
  await expect(field(page)).toHaveValue('look');
  // A press in the game, then Esc in the input with a window open: the
  // window's close request (no unsaved changes: it closes).
  await page.locator('.wc-game').click({ position: { x: 20, y: 20 } });
  await field(page).fill('');
  await page.keyboard.press('Escape');
  await expect(win(page, 'scripts')).toHaveCount(0);
  // Nothing open: Esc opens the Exit popup (ADR 0112); Esc again closes it.
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveClass(/wc-pop-exit/);
  await expect(overlay(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
});

test('the Esc order in the input: popup, then window, then the Exit popup', async ({ page }) => {
  await offline(page);
  await icon(page, 'scripts').click();
  await expect(win(page, 'scripts')).toBeVisible();
  await field(page).click();
  await icon(page, 'panes').click();
  await expect(popup(page)).toBeVisible();
  // The popup takes the keys (ADR 0108); a click in the game gives them back.
  await page.locator('.wc-output').click({ position: { x: 20, y: 20 } });
  await expect(field(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
  await expect(win(page, 'scripts')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(win(page, 'scripts')).toHaveCount(0);
  await expect(overlay(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveClass(/wc-pop-exit/);
  await expect(overlay(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
});

// ------------------------------------------------- the Scripts window (stage 44)

const WIN_SRC = `-- @name     wintest
-- @summary  A window test
-- @api      1
-- @setting  loud boolean false "Shout"

tempTrigger("A goblin is here.", function()
  send("look")
end)
`;

/** Adds the user script `wintest` to the library (turned off). */
async function addScript(page: Page): Promise<void> {
  await page.evaluate(async (src) => {
    const l = window.__wc!.shell.scripts as unknown as { init(): Promise<void>; create(n: string, s: string): Promise<unknown> };
    await l.init();
    await l.create('wintest', src);
  }, WIN_SRC);
}

const sourceOf = (page: Page, name: string) =>
  page.evaluate((n) => (window.__wc!.shell.scripts as unknown as { get(n: string): { source: string } | null }).get(n)?.source ?? null, name);

test('the Scripts window keeps one Lykta frame on every page; the title and note follow the top frame; X asks about unsaved changes', async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await addScript(page);
  await icon(page, 'scripts').click();
  const w = win(page, 'scripts');
  await expect(w).toHaveAttribute('data-focused', '');
  await expect(icon(page, 'scripts')).toHaveClass(/is-open/);
  const frame = await w.elementHandle();
  const top = winTop(page, 'scripts');
  // The page: a look frame on the free body, title Scripts, no note, no Back of its own.
  await expect(winTitle(page, 'scripts')).toHaveText('Scripts');
  await expect(winNote(page, 'scripts')).toHaveCount(0);
  await expect(top).toHaveClass(/wc-win-look/);
  await expect(top.locator('.wc-lk-back, .wc-lk-iback')).toHaveCount(0);
  await top.locator('.wc-scr-row[data-name="wintest"] .wc-scr-name').click();
  await expect(top.locator('.wc-scr-panel .wc-scr-title')).toHaveText('wintest');

  // Edit: the note is the script's name; a small Back; the same frame.
  await top.locator('.wc-scr-panel [data-btn="EDIT"]').click();
  const ed = top.locator('.wc-sed');
  await expect(ed).toHaveAttribute('data-script', 'wintest');
  await expect(winTitle(page, 'scripts')).toHaveText('Scripts');
  await expect(winNote(page, 'scripts')).toHaveText('wintest');
  await expect(top).toHaveClass(/wc-win-look/);
  await expect(top.locator('.wc-lk-iback')).toBeVisible();
  await expect(w.locator('.wc-win-hood')).toHaveCount(1);
  // A click in the buffer keeps the keys in the window (not the game input).
  await ed.locator('.cm-line', { hasText: 'send("look")' }).click();
  await expect(ed.locator('.cm-content')).toBeFocused();
  await expect(w).toHaveAttribute('data-focused', '');
  await page.keyboard.press('End');
  await page.keyboard.type(' -- x');
  await expect(winNote(page, 'scripts')).toHaveText('wintest •');

  // F1 at `send`: the manual, note Manual; Esc back to the editor with its buffer.
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('F1');
  await expect(top.locator('.wc-sman')).toBeVisible();
  await expect(winTitle(page, 'scripts')).toHaveText('Scripts');
  await expect(winNote(page, 'scripts')).toHaveText('Manual');
  await expect(top).toHaveClass(/wc-win-look/);
  await page.keyboard.press('Escape');
  await expect(top.locator('.wc-sman')).toHaveCount(0);
  await expect(ed).toBeVisible();
  await expect(winNote(page, 'scripts')).toHaveText('wintest •');
  await expect(ed.locator('.cm-content')).toContainText('send("look") -- x');
  expect(await frame!.evaluate((el) => el.isConnected)).toBe(true);

  // Unfocused, the window dims; a press on its bar takes the keys back.
  await page.locator('.wc-game').click({ position: { x: 20, y: 20 } });
  await expect(w).not.toHaveAttribute('data-focused', '');
  await expect(field(page)).toBeFocused();
  await bar(page, 'scripts').click({ position: { x: 30, y: 10 } });
  await expect(w).toHaveAttribute('data-focused', '');

  // X with unsaved changes: the prompt; Esc keeps editing, the window stays.
  const x = w.locator('.wc-win-x');
  const prompt = w.locator('.wc-lk-dialog[data-dlg="unsaved"]');
  await x.click();
  await expect(prompt).toContainText('Save changes to wintest?');
  await expect(w).toHaveAttribute('data-focused', '');
  await page.keyboard.press('Escape');
  await expect(prompt).toHaveCount(0);
  await expect(ed).toBeVisible();
  await expect(winNote(page, 'scripts')).toHaveText('wintest •');
  // X again, N: discarded, the window closes and the keys go to the game.
  await x.click();
  await expect(prompt).toBeVisible();
  await page.keyboard.press('n');
  await expect(w).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await expect(icon(page, 'scripts')).not.toHaveClass(/is-open/);
  expect(await sourceOf(page, 'wintest')).toBe(WIN_SRC);

  // Again: the small Back leaves the editor (no changes: no prompt); Esc on the page closes the window.
  await icon(page, 'scripts').click();
  await expect(w).toHaveAttribute('data-focused', '');
  await top.locator('.wc-scr-row[data-name="wintest"] .wc-scr-name').click();
  await top.locator('.wc-scr-panel [data-btn="EDIT"]').click();
  await expect(winNote(page, 'scripts')).toHaveText('wintest');
  await top.locator('.wc-lk-iback').click();
  await expect(top.locator('.wc-scr')).toBeVisible();
  await expect(winNote(page, 'scripts')).toHaveCount(0);
  // Esc: the panel's button row first (Edit was pressed there), then the index, then the window.
  await page.keyboard.press('Escape');
  await expect(top.locator('.wc-scr-row.is-cur')).toHaveAttribute('data-name', 'wintest');
  await page.keyboard.press('Escape');
  await expect(w).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  expect(errors).toEqual([]);
});

for (const paper of [false, true]) {
  test(`a small Scripts window${paper ? ' on Paper' : ''}: page, editor and manual stay inside; its place is kept`, async ({ page }) => {
    const errors = watchErrors(page);
    await offline(page);
    await icon(page, 'scripts').click();
    const w = win(page, 'scripts');
    await expect(w).toHaveAttribute('data-focused', '');
    if (paper) {
      await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
      await expect(page.locator('.wc-windows')).toHaveAttribute('data-light', '');
    }
    // The grip to the minimum.
    const g = (await w.locator('.wc-win-grip').boundingBox())!;
    await page.mouse.move(g.x + 5, g.y + 5);
    await page.mouse.down();
    await page.mouse.move(5, 5, { steps: 3 });
    await page.mouse.up();
    const small = await cells(page, 'scripts');
    expect(Math.round(small.w)).toBe(62);
    expect(Math.round(small.h)).toBe(20);
    const box = (await w.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(360);
    expect(box.height).toBeGreaterThanOrEqual(260);
    const top = winTop(page, 'scripts');
    /** The first visible `sel` lies inside the window's content box (nothing spills past its frame). */
    const inside = async (sel: string): Promise<boolean> =>
      w.evaluate((el, s) => {
        const c = el.querySelector('.wc-win-content')!.getBoundingClientRect();
        const r = el.querySelector(s)?.getBoundingClientRect();
        return !!r && r.width > 0 && r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5;
      }, sel);
    // The page at this width: the index alone (the drill-down), inside the window.
    await expect(top.locator('.wc-scr')).toHaveAttribute('data-w', 'narrow');
    expect(await inside('.wc-frame:not([hidden]) .wc-scr')).toBe(true);
    // A tap on a row drills into its panel; Edit opens the bundled script read-only.
    await top.locator('.wc-scr-row[data-name="almanac"] .wc-scr-name').click();
    // The panel opens at its top: the name and the buttons in view (a tap never scrolls it).
    await expect(top.locator('.wc-scr-panel .wc-scr-title')).toHaveText('almanac');
    expect(await top.locator('.wc-scr-panel').evaluate((el) => el.scrollTop)).toBe(0);
    expect(await inside('.wc-frame:not([hidden]) .wc-scr-panel [data-btn="EDIT"]')).toBe(true);
    await top.locator('.wc-scr-panel [data-btn="EDIT"]').click();
    await expect(top.locator('.wc-sed')).toHaveAttribute('data-script', 'almanac');
    await expect(winNote(page, 'scripts')).toHaveText('almanac');
    expect(await inside('.wc-frame:not([hidden]) .wc-sed-tools')).toBe(true);
    expect(await inside('.wc-frame:not([hidden]) .wc-sed-status')).toBe(true);
    await expect(top.locator('.wc-lk-iback')).toBeVisible();
    // The manual: its head inside, the contents behind their button.
    await top.locator('.wc-sed-tools [data-btn="MANUAL"]').click();
    await expect(winNote(page, 'scripts')).toHaveText('Manual');
    await expect(top.locator('.wc-sman [data-btn="contents"]')).toBeVisible();
    expect(await inside('.wc-frame:not([hidden]) .wc-sman .wc-lk-mhead')).toBe(true);
    // The same frame all along; on Paper the bronze one with a dark title.
    await expect(top).toHaveClass(/wc-win-look/);
    if (paper) {
      const luma = await winTitle(page, 'scripts').evaluate((el) => {
        const [r, g, b] = getComputedStyle(el).color.match(/\d+/g)!.map(Number);
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      });
      expect(luma).toBeLessThan(80);
    }
    // The place is stored: after a reload the window opens at the same size.
    await page.reload();
    await expect(field(page)).toBeFocused();
    await icon(page, 'scripts').click();
    await expect(w).toBeVisible();
    const again = await cells(page, 'scripts');
    expect(Math.round(again.w)).toBe(62);
    expect(Math.round(again.h)).toBe(20);
    expect(errors).toEqual([]);
  });
}

// ------------------------------------------------- live: unsaved changes

const IAC = 255;
const WILL = 251;
const GMCP = 201;

async function enterMume(page: Page, profile: string): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (t) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', t);
  }, profile);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(field(page)).toBeFocused();
}

const ped = (page: Page) => win(page, 'profile').locator('.wc-frame:not([hidden]) .wc-pe');
/** The editor's inline dialogs (stage 42's `Dialog`, drawn inside the window). */
const modal = (page: Page) => win(page, 'profile').locator('.wc-lk-dialog');
const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null));

/** Opens the Profile window from the bar and adds an alias `name` (unsaved). */
async function editAlias(page: Page, name: string): Promise<void> {
  await icon(page, 'profile').click();
  await expect(ped(page)).toHaveAttribute('data-view', 'lite');
  await page.keyboard.press('i');
  await expect(ped(page)).toHaveAttribute('data-kind', 'alias');
  await expect(ped(page)).toHaveAttribute('data-zone', 'list');
  await page.keyboard.press('n');
  await page.keyboard.type(name);
  await expect(ped(page).locator('[data-field="pattern"] input')).toHaveValue(name);
}

/** Opens the Profile window from the bar, in Editor, and types `line` at the end (unapplied). */
async function editText(page: Page, line: string): Promise<void> {
  await icon(page, 'profile').click();
  await ped(page).locator('.wc-pe-views [data-opt="editor"]').click();
  await expect(ped(page)).toHaveAttribute('data-view', 'editor');
  await expect(ped(page).locator('.cm-content')).toBeFocused();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(line);
  await expect(ped(page)).toHaveAttribute('data-unapplied', 'true');
}

test('X with unsaved changes asks Apply / Discard / Keep editing, as Esc does', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, '#alias {a} {b}\n');
  // A Lite edit applies where it is finished: X leaves the field, applies it and closes (ADR 0105, 0128).
  await editAlias(page, 'q');
  const x = win(page, 'profile').locator('.wc-win-x');
  await x.click();
  await expect(win(page, 'profile')).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await expect.poll(() => stored(page)).toBe('#alias {a} {b}\n#alias {q} {}\n');

  // An Editor edit waits for Ctrl+S: X asks.
  await editText(page, '#alias {w} {}');
  await x.click();
  const ask = modal(page).and(page.locator('[data-dlg="apply"]'));
  await expect(ask).toContainText('Apply changes to your profile?');
  await expect(win(page, 'profile')).toHaveAttribute('data-focused', '');
  // Keep editing: the window stays, and a later X still asks.
  await page.keyboard.press('Escape');
  await expect(modal(page)).toHaveCount(0);
  await expect(win(page, 'profile')).toBeVisible();
  await expect(ped(page)).toHaveAttribute('data-view', 'editor');
  await x.click();
  await expect(ask).toContainText('Apply changes to your profile?');
  await page.keyboard.press('n'); // discard: the window closes
  await expect(win(page, 'profile')).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  expect(await stored(page)).toBe('#alias {a} {b}\n#alias {q} {}\n');

  // Esc in the game input reaches the window: it takes the focus and asks; Y applies and closes.
  // (A Lite edit applies by itself when the game is clicked, ADR 0105; an Editor edit waits.)
  await editText(page, '#alias {r} {}\n');
  await page.locator('.wc-game').click({ position: { x: 20, y: 20 } });
  await expect(win(page, 'profile')).not.toHaveAttribute('data-focused', '');
  await page.keyboard.press('Escape');
  await expect(win(page, 'profile')).toHaveAttribute('data-focused', '');
  await expect(ask).toContainText('Apply changes to your profile?');
  await page.keyboard.press('y');
  await expect(win(page, 'profile')).toHaveCount(0);
  await expect.poll(() => stored(page)).toBe('#alias {a} {b}\n#alias {q} {}\n#alias {r} {}\n');
  expect(errors).toEqual([]);
});

test('Exit warns about unsaved changes in a window, then discards them; the windows close with the cockpit', async ({ page }) => {
  await enterMume(page, '#alias {a} {b}\n');
  await icon(page, 'scripts').click();
  await expect(win(page, 'scripts')).toBeVisible();
  // An entry that does not validate stays unapplied when the window loses the focus (ADR 0105).
  await editAlias(page, 's{');
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

test('the windows sit above a floating pane and below the bar popups', async ({ page }) => {
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
