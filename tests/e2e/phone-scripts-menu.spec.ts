// Stage 44d (ADR 0129): the Scripts pages in the phone's menu (no windows
// on a phone, ADR 0112). Since stage 51b (ADR 0136 §10) the way in is the
// menu sheet's Scripts row (ESC → Options → Scripts before), and Back from
// the index returns to the game. The look frames
// render in the `menu` place: the full-screen box with its Back. The index
// alone, a tap opens a script's panel, its settings change by tap and the
// running script sees the new value at once; Edit and the Manual open in the
// same place, and Back walks down again. Every target is at least 40 px
// high, and no tap on a row, a switch or a button puts the focus in a
// field (no soft keyboard by mistake).
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const SOURCE = `-- @name     phonemenu
-- @summary  Says how loud it is
-- @api      1
-- @setting  loud boolean false "Shout about it"

tempTrigger("A goblin is here.", function()
  echo("[loud=" .. tostring(settings.loud) .. "]")
end)
`;

/** The ESC menu's visible look frame (full screen, place `menu`). */
const menuLook = (page: Page) => page.locator('.wc-overlay .wc-frame.wc-menu-look:not([hidden])');
const menu = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden])');
const back = (page: Page) => menuLook(page).locator('.wc-lk-back').first();
const rows = (page: Page) => page.locator('.wc-rows .wc-row');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** True when the focus is in something that opens the soft keyboard. */
const typing = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  });

/** At least 40 px high and inside the viewport: a touch target. */
async function tappable(page: Page, l: Locator): Promise<void> {
  const b = (await l.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(40);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
}

/** Enters MUME on `?phone=1` with the script `phonemenu` on; returns the mocked server. */
async function enterMume(page: Page): Promise<() => WebSocketRoute> {
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (src) => {
    const l = window.__wc!.shell.scripts!;
    await l.init();
    await l.create('phonemenu', src);
    await l.setEnabled('phonemenu', true);
  }, SOURCE);
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  return () => server!;
}

/** The menu key → Scripts, all by taps. */
async function openScripts(page: Page): Promise<Locator> {
  await page.locator('.wc-ph-menu').tap();
  const row = page.locator('.wc-ph-sheet [data-row="scripts"]');
  // The row says how many scripts are on, and is a finger high.
  await expect(row.locator('.wc-ph-row-v')).toHaveText('1 on');
  await tappable(page, row);
  await row.tap();
  const f = menuLook(page);
  await expect(f.locator('.wc-scr')).toBeVisible();
  return f;
}

test('the menu sheet → Scripts: the index, a panel by tap, a setting the running script sees; Edit, Manual and Back', async ({ page }) => {
  const errors = watchErrors(page);
  const server = await enterMume(page);
  const f = await openScripts(page);
  // The full-screen box: its hood and Back, the index alone (the drill-down width), no window.
  await expect(f.locator('.wc-lk-hood-t')).toHaveText('Scripts');
  await expect(f.locator('.wc-scr')).toHaveAttribute('data-w', 'narrow');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  await tappable(page, back(page));
  for (const r of await f.locator('.wc-scr-row').all()) await tappable(page, r);
  for (const b of ['NEW', 'IMPORT', 'MANUAL']) await tappable(page, f.locator(`.wc-scr-foot [data-btn="${b}"]`));
  expect(await typing(page)).toBe(false);

  // A tap on the row: its panel with the state, the buttons and the settings.
  await f.locator('.wc-scr-row[data-name="phonemenu"] .wc-scr-name').tap();
  await expect(f.locator('.wc-scr-panel .wc-scr-title')).toHaveText('phonemenu');
  await expect(f.locator('.wc-scr-status')).toHaveText('on · running', { timeout: 10_000 });
  await expect(f.locator('.wc-scr-idx')).toBeHidden();
  for (const b of ['LIST', 'EDIT', 'EXPORT', 'RENAME', 'DELETE']) await tappable(page, f.locator(`.wc-scr-panel [data-btn="${b}"]`));
  expect(await typing(page)).toBe(false);

  // The setting's switch by tap: saved at once, the running script sees it.
  const tile = f.locator('.wc-scr-set[data-set="loud"]');
  await tile.locator('[role="switch"]').tap();
  await expect(tile.locator('[role="switch"]')).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(() => page.evaluate(() => window.__wc!.shell.scripts!.settingsOf('phonemenu').loud))
    .toBe(true);
  expect(await typing(page)).toBe(false);
  server().send('A goblin is here.\r\n');
  await expect(rows(page).filter({ hasText: '[loud=true]' })).toHaveCount(1);

  // Edit: the editor in the same place, its Back; the Manual from its tools, Back to the editor.
  await f.locator('.wc-scr-panel [data-btn="EDIT"]').tap();
  const ed = menuLook(page).locator('.wc-sed');
  await expect(ed).toHaveAttribute('data-script', 'phonemenu');
  await expect(menuLook(page).locator('.wc-lk-hood-t')).toHaveText('phonemenu');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  // (Edit puts the focus in the buffer, as before stage 44: that keyboard is asked for.)
  await expect(ed.locator('.cm-content')).toBeFocused();
  for (const id of ['SAVE', 'FIND', 'MANUAL']) await tappable(page, ed.locator(`.wc-sed-tools [data-btn="${id}"]`));
  await ed.locator('.wc-sed-tools [data-btn="MANUAL"]').tap();
  await expect(menuLook(page).locator('.wc-sman')).toBeVisible();
  await expect(menuLook(page).locator('.wc-lk-hood-t')).toHaveText('Script Manual');
  await tappable(page, back(page));
  expect(await typing(page)).toBe(false);
  await back(page).tap();
  await expect(ed).toBeVisible();
  await back(page).tap();
  await expect(ed).toHaveCount(0);

  // The page again on the panel; All scripts goes to the index, Back to the game.
  await expect(f.locator('.wc-scr-panel .wc-scr-title')).toHaveText('phonemenu');
  await f.locator('.wc-scr-panel [data-btn="LIST"]').tap();
  await expect(f.locator('.wc-scr-idx')).toBeVisible();
  await back(page).tap();
  await expect(page.locator('.wc-overlay')).toBeHidden();
  await expect(page.locator('.wc-ph-sheet')).toBeHidden();
  expect(errors).toEqual([]);
});

const TYPED = `-- @name     phonetyped
-- @summary  A number and a word
-- @api      1
-- @setting  warn number 5 0..30 unit min "Warn before the end"
-- @setting  word string hello "What to say"
`;

test('a typed setting is kept when the tile is left by touch: All scripts, or a tap elsewhere', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (src) => {
    const l = window.__wc!.shell.scripts!;
    await l.init();
    await l.create('phonetyped', src);
  }, TYPED);
  const settings = () => page.evaluate(() => window.__wc!.shell.scripts!.settingsOf('phonetyped'));
  const f = page.locator('.wc-start .wc-frame:not([hidden])');
  await f.locator('.wc-sm-item[data-key="scripts"]').tap();
  await expect(f.locator('.wc-scr')).toHaveAttribute('data-w', 'narrow');
  await f.locator('.wc-scr-row[data-name="phonetyped"] .wc-scr-name').tap();
  // The number: a tap on its value types over it; then All scripts, with no Enter.
  const warn = f.locator('.wc-scr-set[data-set="warn"]');
  await warn.locator('.wc-scr-val').tap();
  await expect(warn.locator('input.wc-scr-input')).toBeFocused();
  await page.keyboard.type('7');
  await f.locator('.wc-scr-panel [data-btn="LIST"]').tap();
  await expect.poll(settings).toMatchObject({ warn: 7 });
  await expect(f.locator('.wc-lk-flash')).toHaveText('warn = 7 min');
  await expect(f.locator('.wc-scr-idx')).toBeVisible();
  // The word: a tap on the panel's empty space ends the typing and keeps it (no field left open).
  await f.locator('.wc-scr-row[data-name="phonetyped"] .wc-scr-name').tap();
  const word = f.locator('.wc-scr-set[data-set="word"]');
  await word.locator('.wc-scr-str').tap();
  await expect(word.locator('input.wc-scr-input')).toBeFocused();
  await page.keyboard.type(' you');
  await f.locator('.wc-scr-panel .wc-scr-summary').tap();
  await expect.poll(settings).toMatchObject({ word: 'hello you' });
  await expect(f.locator('input.wc-scr-input')).toHaveCount(0);
  expect(await typing(page)).toBe(false);
  expect(errors).toEqual([]);
});
