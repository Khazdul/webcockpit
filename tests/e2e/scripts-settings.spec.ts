// Stage 38 (ADR 0121): the Scripts page's framed detail. The selected
// script joins the frame, settings are controls that save at once (and a
// running script sees them), RESET ALL, the help scrolls in its own box,
// and the in-game window's narrow layout.
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
const row = (f: Locator, name: string) => f.locator(`.wc-scr-row[data-script="${name}"]`);
const setting = (f: Locator, name: string) => f.locator(`.wc-scr-drow[data-row="set:${name}"]`);
const settingsOf = (page: Page, name: string) =>
  page.evaluate((n) => window.__wc!.shell.scripts.settingsOf(n), name) as Promise<Record<string, unknown>>;
const gameRows = (page: Page) => page.locator('.wc-rows .wc-row');

const hostSynced = (page: Page) =>
  page.evaluate(async () => {
    const app = window.__wc!.app as unknown as { scriptHost(): Promise<{ sync(): Promise<void> }> };
    await (await app.scriptHost()).sync();
  });

async function openStart(page: Page): Promise<void> {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
}

async function scriptsFromStart(page: Page): Promise<Locator> {
  await openStart(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const f = startFrame(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  return f;
}

/** In the game with `knobs` on and running, the Scripts window open on it. */
async function knobsRunning(page: Page): Promise<Locator> {
  await openStart(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.evaluate(async (src) => {
    const l = window.__wc!.shell.scripts;
    await l.create('knobs', src);
    await l.setEnabled('knobs', true);
  }, KNOBS);
  await hostSynced(page);
  await page.locator('.wc-mb[data-mb="scripts"]').click();
  const f = scriptsWin(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  await row(f, 'knobs').locator('.wc-scr-name').click();
  await expect(f.locator('.wc-scr-frame .wc-scr-title')).toHaveText('knobs');
  await expect(f.locator('.wc-scr-frame')).toContainText('● on · running', { timeout: 10_000 });
  return f;
}

test('the selected script has the panel fill beside the framed detail', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsFromStart(page);
  // NEW IMPORT MANUAL above the list; the script's buttons in the frame's top border.
  await expect(f.locator('.wc-scr-buttons [data-btn]')).toHaveText([/NEW/, /IMPORT/, /MANUAL/]);
  await expect(f.locator('.wc-scr-top [data-btn]')).toHaveText([/EDIT/, /EXPORT/, /RENAME/, /DELETE/]);
  await expect(f.locator('.wc-scr-row [data-btn]')).toHaveCount(0);
  // almanac first: its row is selected, its name in the border.
  await expect(f.locator('.wc-scr-row.is-sel')).toHaveAttribute('data-script', 'almanac');
  await expect(f.locator('.wc-scr-top')).toContainText('── almanac ──');
  await expect(f.locator('.wc-scr-frame')).toContainText('─ Settings');
  await expect(f.locator('.wc-scr-frame')).toContainText('─ Commands');
  await expect(f.locator('.wc-scr-frame')).toContainText('▾ Help');
  // The top border is as wide as the bottom one: its ┐ sits on the right edge.
  const cells = (l: Locator) => l.evaluate((e) => [...(e.textContent ?? '')].length);
  expect(await cells(f.locator('.wc-scr-top'))).toBe(await cells(f.locator('.wc-scr-frame > .wc-line').last()));
  // Down: the selection moves; the frame's left edge stays a whole line.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const tab = f.locator('.wc-scr-row.is-sel');
  await expect(tab).toHaveAttribute('data-script', 'keymanager');
  await expect(f.locator('.wc-scr-top')).toContainText('── keymanager ──');
  const edges = await f.locator('.wc-scr-list .wc-line > .wc-scr-line').allTextContents();
  expect(new Set(edges)).toEqual(new Set(['│']));
  // Bundled: RENAME and DELETE are off, its settings are not.
  await expect(f.locator('.wc-scr-top [data-btn="RENAME"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(setting(f, 'hours')).toContainText('◂ 12 ▸ h');
  // The selected row has the panel fill, as the frame.
  const fill = await tab.locator('.wc-scr-cells').evaluate((e) => getComputedStyle(e).backgroundColor);
  const panel = await f.locator('.wc-scr-detail').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(fill).toBe(panel);
  expect(fill).not.toBe('rgba(0, 0, 0, 0)');
  expect(errors).toEqual([]);
});

test('settings by keys save at once and the running script sees them', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await knobsRunning(page);
  // → enters the detail on the first setting.
  await page.keyboard.press('ArrowRight');
  await expect(setting(f, 'loud').locator('.wc-scr-cursor')).toHaveText('▸');
  await expect(f.locator('.wc-footer')).toContainText('←→ Switch');

  // Boolean: Space flips.
  await page.keyboard.press(' ');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ loud: true });
  await expect(setting(f, 'loud').locator('.wc-scr-sw-on')).toHaveText('ON');
  await expect(setting(f, 'loud')).toContainText('loud*');

  // Number: → steps by 0.5; a digit starts typing; Enter keeps (clamped to 0..5).
  await page.keyboard.press('ArrowDown');
  await expect(f.locator('.wc-footer')).toContainText('←→ Step');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ delay: 2.5 });
  await page.keyboard.press('7');
  await expect(setting(f, 'delay').locator('input.wc-scr-input')).toHaveValue('7');
  await expect(f.locator('.wc-footer')).toHaveText('Enter Keep · ESC Cancel');
  await page.keyboard.press('Enter');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ delay: 5 });
  await expect(f.locator('.wc-flash')).toHaveText('delay = 5 s');
  // Not a number: refused, the old value stays. Esc cancels typing.
  await page.keyboard.press('1');
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await expect(f.locator('.wc-flash')).toHaveText('delay must be a number.');
  await page.keyboard.press('3');
  await page.keyboard.press('Escape');
  await expect(setting(f, 'delay').locator('input')).toHaveCount(0);
  expect(await settingsOf(page, 'knobs')).toMatchObject({ delay: 5 });
  // Esc ended the typing only: still in the detail.
  await expect(setting(f, 'delay').locator('.wc-scr-cursor')).toHaveText('▸');

  // Choice: → picks the next option.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ size: 'big' });
  await expect(setting(f, 'size')).toContainText('( ) small  (•) big');

  // String: Enter edits, Enter keeps.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const input = setting(f, 'word').locator('input.wc-scr-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('hello');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('good bye');
  await page.keyboard.press('Enter');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ word: 'good bye' });
  await expect(setting(f, 'word')).toContainText('[good bye');

  // The running script got sysSettingChanged with the new values.
  for (const t of ['[set loud=true]', '[set delay=2.5]', '[set delay=5]', '[set size=big]', '[set word=good bye]']) {
    await expect(gameRows(page).filter({ hasText: t })).toHaveCount(1);
  }
  // Esc: the list, then the window closes.
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-scr-cursor', { hasText: '▸' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('settings by mouse, and RESET ALL', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await knobsRunning(page);
  const hit = (h: string) => f.locator(`[data-hit="${h}"]`);
  await expect(f.locator('.wc-scr-frame [data-btn="RESET ALL"]')).toHaveAttribute('aria-disabled', 'true');

  await hit('set:loud:on').click();
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ loud: true });
  await hit('set:delay:dec').click();
  await hit('set:delay:dec').click();
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ delay: 1 });
  await hit('set:size:opt:1').click();
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ size: 'big' });
  // A click on the value types over it.
  await hit('set:delay:type').click();
  const num = setting(f, 'delay').locator('input.wc-scr-input');
  await expect(num).toBeFocused();
  await page.keyboard.type('4.5');
  await page.keyboard.press('Enter');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ delay: 4.5 });
  await hit('set:word:edit').nth(1).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('yo');
  await page.keyboard.press('Enter');
  await expect.poll(() => settingsOf(page, 'knobs')).toMatchObject({ word: 'yo' });
  // A click on a row puts the cursor there.
  await setting(f, 'size').click();
  await expect(setting(f, 'size').locator('.wc-scr-cursor')).toHaveText('▸');

  // RESET ALL: every value back to its default, the script told of each.
  const reset = f.locator('.wc-scr-frame [data-btn="RESET ALL"]');
  await expect(reset).not.toHaveAttribute('aria-disabled', 'true');
  await reset.click();
  await expect(f.locator('.wc-flash')).toHaveText('Reset loud, delay, size, word to the defaults.');
  await expect.poll(() => settingsOf(page, 'knobs')).toEqual({ loud: false, delay: 2, size: 'small', word: 'hello' });
  await expect(reset).toHaveAttribute('aria-disabled', 'true');
  await expect(f.locator('.wc-scr-frame')).not.toContainText('*');
  for (const t of ['[set loud=false]', '[set delay=2]', '[set size=small]', '[set word=hello]']) {
    await expect(gameRows(page).filter({ hasText: t })).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('RESET ALL and the help fold by keys', async ({ page }) => {
  const f = await scriptsFromStart(page);
  await page.evaluate(() => window.__wc!.shell.scripts.setSetting('mercenaries', 'cost', '20'));
  await row(f, 'mercenaries').locator('.wc-scr-name').click();
  await expect(setting(f, 'cost')).toContainText('cost*');
  await expect(setting(f, 'cost')).toContainText('( ) 10  (•) 20 silver');
  // → the first setting, ↑ RESET ALL, Enter.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await expect(f.locator('.wc-scr-frame .wc-btn.is-sel-focus')).toHaveText(/RESET ALL/);
  await page.keyboard.press('Enter');
  await expect(f.locator('.wc-flash')).toHaveText('Reset cost to the default.');
  expect(await settingsOf(page, 'mercenaries')).toMatchObject({ cost: 10 });
  // End: the help fold; Enter folds it, again unfolds it.
  await page.keyboard.press('End');
  await expect(f.locator('.wc-scr-fold')).toHaveClass(/is-cursor/);
  await page.keyboard.press('Enter');
  await expect(f.locator('.wc-scr-fold')).toHaveText('▸ Help');
  await expect(f.locator('.wc-scr-helpbox')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(f.locator('.wc-scr-helpbox')).toHaveCount(1);
});

test('PgUp/PgDn and the wheel scroll the help in its own box', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  const f = await scriptsFromStart(page);
  // keymanager's help is long; Settings and Commands stay in view.
  await row(f, 'keymanager').locator('.wc-scr-name').click();
  const help = f.locator('.wc-scr-help');
  await expect(help).toContainText('Locate life gives a key');
  const top = () => help.evaluate((e) => e.scrollTop);
  expect(await top()).toBe(0);
  await expect(f.locator('.wc-scr-helpbox .wc-tui-bar')).toHaveCount(1);
  await page.keyboard.press('PageDown');
  await expect.poll(top).toBeGreaterThan(0);
  const after = await top();
  await page.keyboard.press('PageDown');
  await expect.poll(top).toBeGreaterThan(after);
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  await expect.poll(top).toBe(0);
  // The settings did not move.
  await expect(setting(f, 'hours')).toBeInViewport();
  // The wheel over the help box.
  await help.hover();
  await page.mouse.wheel(0, 200);
  await expect.poll(top).toBeGreaterThan(0);
  // The headings are in the section role.
  await expect(help.locator('.wc-c-section', { hasText: 'The safe key' })).toHaveCount(1);
});

test('a narrow Scripts window: buttons on their own row, labels under the controls', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 760, height: 620 });
  await openStart(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.locator('.wc-mb[data-mb="scripts"]').click();
  const f = scriptsWin(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  await row(f, 'mercenaries').locator('.wc-scr-name').click();
  await expect(f.locator('.wc-scr-frame .wc-scr-title')).toHaveText('mercenaries');
  // The buttons do not fit the border: a row of their own.
  await expect(f.locator('.wc-scr-top [data-btn]')).toHaveCount(0);
  await expect(f.locator('.wc-scr-drow .wc-scr-dbuttons [data-btn]')).toHaveText([/EDIT/, /EXPORT/, /RENAME/, /DELETE/]);
  const cells = (l: Locator) => l.evaluate((e) => [...(e.textContent ?? '')].length);
  expect(await cells(f.locator('.wc-scr-top'))).toBe(await cells(f.locator('.wc-scr-frame > .wc-line').last()));
  // A label on the row under its control.
  const cost = setting(f, 'cost');
  await expect(cost).not.toContainText('Per payment');
  await expect(f.locator('.wc-scr-drow', { hasText: 'Per payment' })).toHaveCount(1);
  // Every frame row fits inside the window.
  const win = (await page.locator('.wc-win[data-win="scripts"]').boundingBox())!;
  const frame = (await f.locator('.wc-scr-frame').boundingBox())!;
  expect(frame.x + frame.width).toBeLessThanOrEqual(win.x + win.width);
  // The keys reach the warn setting at the bottom: the frame scrolls to it.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await expect(setting(f, 'warn').locator('.wc-scr-cursor')).toHaveText('▸');
  await expect(setting(f, 'warn')).toBeInViewport();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => settingsOf(page, 'mercenaries')).toMatchObject({ warn: 4 });
  expect(errors).toEqual([]);
});
