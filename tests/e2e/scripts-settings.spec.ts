// Stage 38 (ADR 0121), restyled in stage 44a (round 7 C "Instrumentbrädan"):
// the Scripts page's panel. Settings are tiles whose controls save at once
// (and a running script sees them), Reset all, the help in its own column
// (or under the panel, or a drill-down step, by the page's own width), the
// keys and letters, and a narrow in-game window.
import { type Locator, type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

async function mockMume(page: Page): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const KNOBS = `-- @name     knobs
-- @summary  One setting of each kind
-- @api      1
-- @setting  loud  boolean false "Shout about it"
-- @setting  delay number 2 0..5 step 0.5 unit s "Seconds to wait"
-- @setting  size  choice small small|big "How big"
-- @setting  word  string hello "What to say"
-- @help     Knobs for the test.

registerAnonymousEventHandler("sysSettingChanged", function(_, name)
  echo("[set " .. name .. "=" .. tostring(settings[name]) .. "]")
end)
`;

const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const scriptsWin = (page: Page) => page.locator('.wc-win[data-win="scripts"] .wc-frame:not([hidden])');
const row = (f: Locator, name: string) => f.locator(`.wc-scr-row[data-name="${name}"]`);
const tile = (f: Locator, name: string) => f.locator(`.wc-scr-set[data-set="${name}"]`);
/** The keyboard's tile (its name, or null when the keys are elsewhere). */
const curTile = (f: Locator) => f.locator('.wc-scr-set.is-cur');
const kbButton = (f: Locator) => f.locator('.wc-lk-btn.is-sel');
const flash = (f: Locator) => f.locator('.wc-lk-flash');
const settingsOf = (page: Page, name: string) =>
  page.evaluate((n) => window.__wc!.shell.scripts.settingsOf(n), name) as Promise<Record<string, unknown>>;
const gameRows = (page: Page) => page.locator('.wc-rows .wc-row');
const scrollTop = (l: Locator) => l.evaluate((e) => e.scrollTop);

const hostSynced = (page: Page) =>
  page.evaluate(async () => {
    const app = window.__wc!.app as unknown as { scriptHost(): Promise<{ sync(): Promise<void> }> };
    await (await app.scriptHost()).sync();
  });

async function openStart(page: Page): Promise<void> {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
}

async function scriptsFromStart(page: Page): Promise<Locator> {
  await openStart(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const f = startFrame(page);
  await expect(f.locator('.wc-scr')).toBeVisible();
  return f;
}

/** In the game, the Scripts window open (with `knobs` on and running when asked). */
async function scriptsWindow(page: Page, knobs = true): Promise<Locator> {
  await openStart(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  if (knobs) {
    await page.evaluate(async (src) => {
      const l = window.__wc!.shell.scripts;
      await l.create('knobs', src);
      await l.setEnabled('knobs', true);
    }, KNOBS);
    await hostSynced(page);
  }
  await page.locator('.wc-mb[data-mb="scripts"]').click();
  const f = scriptsWin(page);
  await expect(f.locator('.wc-scr')).toBeVisible();
  if (!knobs) return f;
  await row(f, 'knobs').locator('.wc-scr-name').click();
  await expect(f.locator('.wc-scr-panel .wc-scr-title')).toHaveText('knobs');
  await expect(f.locator('.wc-scr-status')).toHaveText('on · running', { timeout: 10_000 });
  return f;
}

test('three widths: the help in its column, under the panel, and a drill-down step', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const f = await scriptsFromStart(page);
  const scr = f.locator('.wc-scr');
  await expect(scr).toHaveAttribute('data-w', 'wide');
  // New, Import and Manual in the foot; the script's buttons in its panel; no buttons in the rows.
  await expect(f.locator('.wc-scr-fbtns [data-btn]')).toHaveText([/New/, /Import/, /Manual/]);
  await expect(f.locator('.wc-scr-btns [data-btn]')).toHaveText([/Edit/, /Export/, /Rename/, /Delete/]);
  await expect(f.locator('.wc-scr-row [data-btn]')).toHaveCount(0);
  await expect(f.locator('.wc-scr-row.is-on')).toHaveAttribute('data-name', 'almanac');
  await expect(f.locator('.wc-scr-panel .wc-lk-sec')).toHaveText(['Settings', 'Commands']);
  // The help is its own column beside the panel, open.
  await expect(f.locator('.wc-scr-helpcol .wc-scr-help')).toBeVisible();
  await expect(f.locator('.wc-scr-helpcol .wc-lk-fold-h')).toHaveAttribute('aria-expanded', 'true');
  await expect(f.locator('.wc-scr-count')).toHaveText(/^\d+ scripts$/);
  // keymanager's hours: a stepper with its unit; bundled settings stay editable.
  await row(f, 'keymanager').click();
  await expect(tile(f, 'hours').locator('.wc-scr-val')).toHaveText('12');
  await expect(tile(f, 'hours').locator('.wc-scr-unit')).toHaveText('h');
  await expect(tile(f, 'hours').locator('[aria-label="More"]')).not.toHaveAttribute('aria-disabled', 'true');

  // Narrower: the help moves under the panel (one help, never two).
  await page.setViewportSize({ width: 980, height: 800 });
  await expect(scr).toHaveAttribute('data-w', 'mid');
  await expect(f.locator('.wc-scr-helpcol')).toHaveCount(0);
  await expect(f.locator('.wc-scr-panel .wc-scr-help')).toHaveCount(1);
  await expect(f.locator('.wc-scr-help')).toHaveCount(1);
  await expect(f.locator('.wc-scr-idx')).toBeVisible();

  // Narrow: the index alone; a click drills into the panel, All scripts goes back.
  await page.setViewportSize({ width: 560, height: 800 });
  await expect(scr).toHaveAttribute('data-w', 'narrow');
  await expect(f.locator('.wc-scr-panel')).toBeHidden();
  await row(f, 'mercenaries').click();
  await expect(f.locator('.wc-scr-panel')).toBeVisible();
  await expect(f.locator('.wc-scr-idx')).toBeHidden();
  await expect(curTile(f)).toHaveAttribute('data-set', 'autopay');
  await f.locator('[data-btn="LIST"]').click();
  await expect(f.locator('.wc-scr-idx')).toBeVisible();
  await expect(f.locator('.wc-scr-panel')).toBeHidden();
  // Enter drills in as well; Esc comes back to the index.
  await page.keyboard.press('Enter');
  await expect(f.locator('.wc-scr-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-scr-panel')).toBeHidden();
  await expect(f.locator('.wc-scr-row.is-cur')).toHaveAttribute('data-name', 'mercenaries');
  expect(errors).toEqual([]);
});

test('settings by keys save at once and the running script sees them', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsWindow(page);
  // → enters the panel on the first setting.
  await page.keyboard.press('ArrowRight');
  await expect(curTile(f)).toHaveAttribute('data-set', 'loud');

  // Boolean: Space flips; the tile shows it changed and its default.
  await page.keyboard.press(' ');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ loud: true });
  await expect(tile(f, 'loud').locator('[role="switch"]')).toHaveAttribute('aria-checked', 'true');
  await expect(tile(f, 'loud').locator('.wc-scr-chg')).toHaveCount(1);
  await expect(tile(f, 'loud').locator('.wc-scr-def')).toHaveText('default off');

  // Number: → steps by 0.5; a digit starts typing; Enter keeps (clamped to 0..5).
  await page.keyboard.press('ArrowDown');
  await expect(curTile(f)).toHaveAttribute('data-set', 'delay');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ delay: 2.5 });
  await page.keyboard.press('7');
  const num = tile(f, 'delay').locator('input.wc-scr-input');
  await expect(num).toHaveValue('7');
  await expect(num).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ delay: 5 });
  await expect(flash(f)).toHaveText('delay = 5 s');
  await expect(tile(f, 'delay').locator('[aria-label="More"]')).toHaveAttribute('aria-disabled', 'true');
  // Not a number: refused, the old value stays. Esc cancels typing.
  await page.keyboard.press('1');
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await expect(flash(f)).toHaveText('delay must be a number.');
  await page.keyboard.press('3');
  await page.keyboard.press('Escape');
  await expect(tile(f, 'delay').locator('input')).toHaveCount(0);
  expect(await settingsOf(page, 'knobs')).toMatchObject({ delay: 5 });
  // Esc ended the typing only: still in the panel.
  await expect(curTile(f)).toHaveAttribute('data-set', 'delay');

  // Choice: → picks the next option; Enter wraps around.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ size: 'big' });
  await expect(tile(f, 'size').locator('[role="radio"][aria-checked="true"]')).toHaveText('big');
  await page.keyboard.press('ArrowRight');
  expect(await settingsOf(page, 'knobs')).toMatchObject({ size: 'big' });

  // String: Enter edits, Enter keeps.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const input = tile(f, 'word').locator('input.wc-scr-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('hello');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('good bye');
  await page.keyboard.press('Enter');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ word: 'good bye' });
  await expect(tile(f, 'word').locator('.wc-scr-str')).toHaveText('good bye');
  await expect(flash(f)).toHaveText('word = good bye');

  // The running script got sysSettingChanged with the new values.
  for (const t of ['[set loud=true]', '[set delay=2.5]', '[set delay=5]', '[set size=big]', '[set word=good bye]']) {
    await expect(gameRows(page).filter({ hasText: t })).toHaveCount(1);
  }
  // Esc: the index, then the window closes.
  await page.keyboard.press('Escape');
  await expect(curTile(f)).toHaveCount(0);
  await expect(f.locator('.wc-scr-row.is-cur')).toHaveAttribute('data-name', 'knobs');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('settings by mouse, and Reset all', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsWindow(page);
  const reset = f.locator('[data-btn="RESET"]');
  await expect(reset).toHaveAttribute('aria-disabled', 'true');

  await tile(f, 'loud').locator('[role="switch"]').click();
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ loud: true });
  await tile(f, 'delay').locator('[aria-label="Less"]').click();
  await tile(f, 'delay').locator('[aria-label="Less"]').click();
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ delay: 1 });
  await tile(f, 'size').locator('[role="radio"]', { hasText: 'big' }).click();
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ size: 'big' });
  // A click on the value types over it.
  await tile(f, 'delay').locator('.wc-scr-val').click();
  const num = tile(f, 'delay').locator('input.wc-scr-input');
  await expect(num).toBeFocused();
  await page.keyboard.type('4.5');
  await page.keyboard.press('Enter');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ delay: 4.5 });
  await tile(f, 'word').locator('.wc-scr-str').click();
  await expect(tile(f, 'word').locator('input.wc-scr-input')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('yo');
  await page.keyboard.press('Enter');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ word: 'yo' });
  // A press on a tile puts the keyboard there.
  await tile(f, 'size').locator('.wc-scr-k').click();
  await expect(curTile(f)).toHaveAttribute('data-set', 'size');
  await expect(f.locator('.wc-scr-chg')).toHaveCount(4);

  // Reset all: every value back to its default, the script told of each.
  await expect(reset).not.toHaveAttribute('aria-disabled', 'true');
  await reset.click();
  await expect(flash(f)).toHaveText('Reset loud, delay, size, word to the defaults.');
  await expect.poll(() => settingsOf(page, 'knobs')).toEqual({ loud: false, delay: 2, size: 'small', word: 'hello' });
  await expect(reset).toHaveAttribute('aria-disabled', 'true');
  await expect(f.locator('.wc-scr-chg')).toHaveCount(0);
  for (const t of ['[set loud=false]', '[set delay=2]', '[set size=small]', '[set word=hello]']) {
    await expect(gameRows(page).filter({ hasText: t })).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('Reset all and the help fold by keys', async ({ page }) => {
  const f = await scriptsFromStart(page);
  await page.evaluate(() => window.__wc!.shell.scripts.setSetting('mercenaries', 'cost', '20'));
  await row(f, 'mercenaries').locator('.wc-scr-name').click();
  await expect(tile(f, 'cost').locator('.wc-scr-chg')).toHaveCount(1);
  await expect(tile(f, 'cost').locator('[role="radio"][aria-checked="true"]')).toHaveText('20');
  await expect(tile(f, 'cost').locator('.wc-scr-unit')).toHaveText('silver');
  await expect(tile(f, 'cost').locator('.wc-scr-def')).toHaveText('default 10 silver');
  // → the first setting, ↑ Reset all, Enter.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await expect(kbButton(f)).toHaveAttribute('data-btn', 'RESET');
  await page.keyboard.press('Enter');
  await expect(flash(f)).toHaveText('Reset cost to the default.');
  expect(await page.evaluate(() => window.__wc!.shell.scripts.settingsOf('mercenaries'))).toMatchObject({ cost: 10 });
  // End: the help fold; Enter folds it, again unfolds it (kept across scripts).
  await page.keyboard.press('End');
  const fold = f.locator('.wc-scr-helprule .wc-lk-fold');
  await expect(fold).toHaveClass(/is-cur/);
  await page.keyboard.press('Enter');
  await expect(fold.locator('.wc-lk-fold-h')).toHaveAttribute('aria-expanded', 'false');
  await expect(f.locator('.wc-scr-help')).toHaveCount(0);
  await row(f, 'keymanager').locator('.wc-scr-name').click();
  await expect(f.locator('.wc-scr-help')).toHaveCount(0);
  await fold.locator('.wc-lk-fold-h').click();
  await expect(f.locator('.wc-scr-help')).toHaveCount(1);
});

test('PgUp/PgDn and the wheel scroll the help: its column when wide, else the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 640 });
  const f = await scriptsFromStart(page);
  // keymanager's help is long; Settings and Commands stay in view.
  await row(f, 'keymanager').locator('.wc-scr-name').click();
  const help = f.locator('.wc-scr-helpcol .wc-scr-help');
  await expect(help).toContainText('Locate life gives a key');
  expect(await scrollTop(help)).toBe(0);
  await page.keyboard.press('PageDown');
  await expect.poll(() => scrollTop(help)).toBeGreaterThan(0);
  const after = await scrollTop(help);
  await page.keyboard.press('PageDown');
  await expect.poll(() => scrollTop(help)).toBeGreaterThan(after);
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  await expect.poll(() => scrollTop(help)).toBe(0);
  // The settings did not move.
  await expect(tile(f, 'hours')).toBeInViewport();
  // The wheel over the help.
  await help.hover();
  await page.mouse.wheel(0, 200);
  await expect.poll(() => scrollTop(help)).toBeGreaterThan(0);
  // The headings are set as headings; the command table is a table.
  await expect(help.locator('h4', { hasText: 'The safe key' })).toHaveCount(1);
  await expect(help.locator('.wc-scr-t2 dt', { hasText: 'locatel home' })).toHaveCount(1);

  // Narrower: the help is under the panel, and PgDn scrolls the panel.
  await page.setViewportSize({ width: 980, height: 640 });
  await expect(f.locator('.wc-scr')).toHaveAttribute('data-w', 'mid');
  const panel = f.locator('.wc-scr-panel');
  await expect.poll(() => scrollTop(panel)).toBe(0);
  await page.keyboard.press('PageDown');
  await expect.poll(() => scrollTop(panel)).toBeGreaterThan(0);
});

test('a narrow Scripts window: the index, then the panel with its buttons two by two', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 700, height: 620 });
  const f = await scriptsWindow(page, false);
  await expect(f.locator('.wc-scr')).toHaveAttribute('data-w', 'narrow');
  await expect(f.locator('.wc-scr-panel')).toBeHidden();
  await row(f, 'mercenaries').locator('.wc-scr-name').click();
  await expect(f.locator('.wc-scr-panel .wc-scr-title')).toHaveText('mercenaries');
  // The buttons two by two.
  const box = async (id: string) => (await f.locator(`.wc-scr-btns [data-btn="${id}"]`).boundingBox())!;
  const [edit, exp, ren] = [await box('EDIT'), await box('EXPORT'), await box('RENAME')];
  expect(Math.abs(edit.y - exp.y)).toBeLessThan(2);
  expect(ren.y).toBeGreaterThan(edit.y + edit.height - 1);
  expect(Math.abs(ren.x - edit.x)).toBeLessThan(2);
  // Every tile fits inside the window.
  const win = (await page.locator('.wc-win[data-win="scripts"]').boundingBox())!;
  const t = (await tile(f, 'cost').boundingBox())!;
  expect(t.x + t.width).toBeLessThanOrEqual(win.x + win.width);
  // The keys reach the warn setting at the bottom: the panel scrolls to it.
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await expect(curTile(f)).toHaveAttribute('data-set', 'warn');
  await expect(tile(f, 'warn')).toBeInViewport();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => settingsOf(page, 'mercenaries')).toMatchObject({ warn: 4 });
  // Esc: back to the index (the panel goes), then the window closes.
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-scr-idx')).toBeVisible();
  await expect(f.locator('.wc-scr-panel')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the letters N I M E X R D press the buttons, and none fires while a field is typed in', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsFromStart(page);
  const dialog = (dlg: string) => page.locator(`.wc-lk-dialog[data-dlg="${dlg}"]`);
  // The letters are marked in the labels.
  for (const [id, l] of [['NEW', 'N'], ['IMPORT', 'I'], ['MANUAL', 'M'], ['EDIT', 'E'], ['EXPORT', 'x'], ['RENAME', 'R'], ['DELETE', 'D']]) {
    await expect(f.locator(`[data-btn="${id}"] u.wc-sk`)).toHaveText(l!);
  }
  // N: the New dialog; letters typed in its field are text.
  await page.keyboard.press('n');
  await expect(dialog('new').locator('input')).toBeFocused();
  await page.keyboard.type('mexrdi');
  await expect(dialog('new').locator('input')).toHaveValue('mexrdi');
  await expect(page.locator('.wc-lk-dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog('new')).toHaveCount(0);
  // X: Export; R and D do nothing on a bundled script.
  await page.keyboard.press('x');
  await expect(dialog('export')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await page.keyboard.press('d');
  await expect(page.locator('.wc-lk-dialog')).toHaveCount(0);
  // I: the file picker.
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('i');
  await chooser;
  // A setting being typed in keeps its letters too.
  await page.locator('.wc-scr-row[data-name="mercenaries"]').click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await expect(curTile(f)).toHaveAttribute('data-set', 'warn');
  await page.keyboard.press('2');
  await page.keyboard.type('e');
  await expect(tile(f, 'warn').locator('input.wc-scr-input')).toHaveValue('2e');
  await page.keyboard.press('Escape');
  await expect(tile(f, 'warn').locator('input')).toHaveCount(0);
  // E: the editor on the selected script; M: the manual.
  await page.keyboard.press('e');
  await expect(page.locator('.wc-frame:not([hidden]) .wc-sed')).toHaveAttribute('data-script', 'mercenaries');
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-scr')).toBeVisible();
  await page.keyboard.press('m');
  await expect(startFrame(page)).toContainText('Script Manual');
  expect(errors).toEqual([]);
});
