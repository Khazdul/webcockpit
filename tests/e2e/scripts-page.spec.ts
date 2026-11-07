// Stage 10 P2: the Scripts page and the script editor (spec §2.10,
// ADR 0051), from the start page and the menu bar's Scripts window,
// against a mocked MUME. Stage 44a: the page in the lantern look (a large
// box, the index, the panel, dialogs as overlay frames). The editor's
// parts are checked through hooks that outlive its own restyle (44b):
// `.wc-sed[data-script][data-readonly]`, its text, the CodeMirror classes.
import { readFile } from 'node:fs/promises';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { morphDone } from './look';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

/** A mocked MUME that answers `look` with a goblin line. */
async function mockMume(page: Page): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage((m) => {
      const b = typeof m === 'string' ? Buffer.from(m) : m;
      if (b.toString('latin1').includes('look\r\n')) ws.send(Buffer.from('A goblin is here.\r\n'));
    });
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const SOURCE = (word: string) => `-- @name     pagetest
-- @summary  Spots goblins
-- @api      1
-- @setting  loud boolean false "Shout about it"
-- @help     Echoes when a goblin is here.

tempTrigger("A goblin is here.", function()
  echo("[goblin ${word}]")
end)
`;

const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
/** The Scripts window's visible frame (ADR 0103). */
const scriptsWin = (page: Page) => page.locator('.wc-win[data-win="scripts"] .wc-frame:not([hidden])');
const editor = (page: Page) => page.locator('.wc-frame:not([hidden]) .wc-sed');
const row = (f: Locator, name: string) => f.locator(`.wc-scr-row[data-name="${name}"]`);
const toggleOf = (f: Locator, name: string) => row(f, name).locator('.wc-scr-tog [role="switch"]');
/** The selected script (the lit row). */
const selected = (f: Locator) => f.locator('.wc-scr-row.is-on');
const flash = (f: Locator) => f.locator('.wc-lk-flash');
const dialog = (page: Page, dlg: string) => page.locator(`.wc-lk-dialog[data-dlg="${dlg}"]`);
const lib = <T,>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ([fn, args]) => {
      const l = window.__wc!.shell.scripts as unknown as Record<string, (...a: unknown[]) => unknown>;
      return Promise.resolve(l[fn as string]!(...(args as unknown[]))) as Promise<unknown>;
    },
    [fn, args] as const,
  ) as Promise<T>;

async function openStart(page: Page): Promise<void> {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
}

/** Start page → Scripts with the keyboard (under Profile since stage 32): a large box. */
async function scriptsFromStart(page: Page): Promise<Locator> {
  await openStart(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Scripts');
  await page.keyboard.press('Enter');
  const f = startFrame(page);
  await expect(f.locator('.wc-lk-box-large .wc-scr')).toBeVisible();
  await expect(f.locator('.wc-lk-hood-t')).toHaveText('Scripts');
  return f;
}

/** The menu bar's Scripts: the Scripts window (ADR 0103). */
async function openScriptsWindow(page: Page): Promise<void> {
  await page.locator('.wc-mb[data-mb="scripts"]').click();
}

/** Replaces the buffer's text (one input event: no auto-indent or bracket closing). */
async function setBuffer(page: Page, text: string): Promise<void> {
  await expect(editor(page).locator('.cm-content')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
}

/** Resolves when the script host has applied every library change (a save's reload). */
const hostSynced = (page: Page) =>
  page.evaluate(async () => {
    const app = window.__wc!.app as unknown as { scriptHost(): Promise<{ sync(): Promise<void> }> };
    await (await app.scriptHost()).sync();
  });

const bufferText = (page: Page) =>
  editor(page)
    .locator('.cm-content')
    .evaluate((el) => [...el.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));

test('Scripts from the start page: bundled coin looter, help, toggle, read-only editor, duplicate', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsFromStart(page);
  const looter = row(f, 'coinlooter');
  await expect(looter).toBeVisible();
  await expect(looter.locator('.wc-scr-lock')).toHaveAttribute('title', 'Bundled with WebCockpit: read-only. Duplicate it to change it.');
  // The cursor starts on the first script (almanac); Down moves it to the
  // coin looter, whose panel and help show beside the index.
  await expect(selected(f)).toHaveAttribute('data-name', 'almanac');
  await page.keyboard.press('ArrowDown');
  await expect(selected(f)).toHaveAttribute('data-name', 'coinlooter');
  const panel = f.locator('.wc-scr-panel');
  await expect(panel.locator('.wc-scr-title')).toHaveText('coinlooter');
  await expect(panel).toContainText('bundled · read-only');
  await expect(panel).toContainText('Seconds to wait before looting');
  await expect(f).not.toContainText('#script set coinlooter');
  // Bundled: Rename and Delete are off, with the reason.
  await expect(f.locator('[data-btn="RENAME"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(f.locator('[data-btn="DELETE"]')).toHaveAttribute('title', 'Bundled scripts are read-only');

  // Enter on the row turns it on (global, stored), again turns it off.
  await page.keyboard.press('Enter');
  await expect(toggleOf(f, 'coinlooter')).toHaveAttribute('aria-checked', 'true');
  await expect(flash(f)).toHaveText('coinlooter is on. It runs when you enter MUME.');
  await expect(panel.locator('.wc-scr-status')).toHaveText('on · at login');
  expect(await lib<string[]>(page, 'enabledNames')).toEqual(['coinlooter']);
  await page.keyboard.press('Enter');
  await expect(toggleOf(f, 'coinlooter')).toHaveAttribute('aria-checked', 'false');

  // → into the panel (its first setting), Home to its buttons, Enter on Edit: the read-only editor.
  await page.keyboard.press('ArrowRight');
  await expect(f.locator('.wc-scr-set.is-cur')).toHaveAttribute('data-set', 'auto');
  await page.keyboard.press('Home');
  await expect(f.locator('.wc-lk-btn.is-sel')).toHaveAttribute('data-btn', 'EDIT');
  await page.keyboard.press('Enter');
  await expect(editor(page)).toHaveAttribute('data-readonly', 'true');
  await expect(editor(page)).toHaveAttribute('data-script', 'coinlooter');
  // The box's morph first: the buffer is drawn in full, and has the focus again in Firefox.
  await morphDone(page);
  await expect(editor(page).locator('.cm-content')).toBeFocused();
  const before = await bufferText(page);
  await page.keyboard.type('xyz');
  expect(await bufferText(page)).toBe(before);
  await expect(editor(page).locator('[data-btn="SAVE"]')).toHaveCount(0);

  // Duplicate opens the editable copy in its place.
  await editor(page).locator('[data-btn="DUPLICATE"]').click();
  await expect(editor(page)).toHaveAttribute('data-script', 'coinlooter-copy');
  await expect(editor(page)).toHaveAttribute('data-readonly', 'false');
  await expect(editor(page)).toContainText('Duplicated as coinlooter-copy');
  expect(await bufferText(page)).toContain('-- @name     coinlooter-copy');
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-scr')).toBeVisible();
  await expect(row(f, 'coinlooter-copy')).toBeVisible();
  await expect(row(f, 'coinlooter-copy').locator('.wc-scr-lock')).toHaveCount(0);
  await expect(selected(f)).toHaveAttribute('data-name', 'coinlooter-copy');
  // Back from the editor the keys are on the panel's button row: Esc goes to the index first.
  await expect(f.locator('.wc-lk-btn.is-sel')).toHaveAttribute('data-btn', 'EDIT');
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-scr-row.is-cur')).toHaveAttribute('data-name', 'coinlooter-copy');
  expect(errors).toEqual([]);
});

test('the Scripts window: new script, edit, save, enable; its trigger works and a save reloads it', async ({ page }) => {
  const errors = watchErrors(page);
  await openStart(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await openScriptsWindow(page);
  const f = scriptsWin(page);
  await expect(f.locator('.wc-scr')).toBeVisible();
  await expect(page.locator('.wc-win[data-win="scripts"] .wc-win-t')).toHaveText('Scripts');
  // The window's root page has no Back of its own.
  await expect(f.locator('.wc-lk-back')).toHaveCount(0);

  // New: the name dialog over the page, then the editor on the template.
  await f.locator('[data-btn="NEW"]').click();
  await expect(dialog(page, 'new')).toBeVisible();
  await expect(page.locator('.wc-win[data-win="scripts"] .wc-frame[data-under] .wc-scr')).toHaveCount(1);
  // The field takes the focus a moment after the dialog shows (the kit's Field autoFocus).
  await expect(dialog(page, 'new').locator('input')).toBeFocused();
  await page.keyboard.type('9bad');
  await page.keyboard.press('Enter');
  await expect(dialog(page, 'new').locator('.wc-lk-dialog-err')).toHaveText('The name must start with a letter.');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('pagetest');
  await page.keyboard.press('Enter');
  await expect(editor(page)).toHaveAttribute('data-script', 'pagetest');
  expect(await bufferText(page)).toContain('-- @name     pagetest');

  // Completion of an API name.
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('tempTi');
  await expect(page.locator('.cm-tooltip-autocomplete li[aria-selected]')).toContainText('tempTimer');
  // CodeMirror ignores Enter for a moment after the list opens (interactionDelay).
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  expect(await bufferText(page)).toMatch(/tempTimer$/);

  // Unsaved changes: ESC asks; ESC again keeps editing.
  await page.keyboard.press('Escape');
  await expect(editor(page)).toContainText('Save changes to pagetest?');
  await page.keyboard.press('Escape');
  await expect(editor(page)).not.toContainText('Save changes to pagetest?');

  await setBuffer(page, SOURCE('seen'));
  await page.keyboard.press('ControlOrMeta+s');
  await expect(editor(page)).toContainText('Saved. Turn it on in the list to run it.');
  expect(await lib<{ source: string }>(page, 'get', 'pagetest').then((s) => s.source)).toBe(SOURCE('seen'));
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-scr')).toBeVisible();
  await expect(selected(f)).toHaveAttribute('data-name', 'pagetest');
  await expect(f.locator('.wc-scr-set[data-set="loud"]')).toContainText('Shout about it');

  // Turn it on with the mouse; the host starts it.
  await toggleOf(f, 'pagetest').click();
  await expect(row(f, 'pagetest').locator('.wc-scr-mark.is-ok')).toHaveCount(1, { timeout: 10_000 });
  await expect(f.locator('.wc-scr-status')).toHaveText('on · running');
  await expect(f.locator('.wc-scr-count')).toContainText(/scripts · \d+ running/);

  // Esc: the panel (the editor was opened from it), then the window closes;
  // back in the game the trigger fires.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  await expect(page.locator('.wc-overlay')).toBeHidden();
  const rows = page.locator('.wc-rows .wc-row');
  await page.keyboard.type('look');
  await page.keyboard.press('Enter');
  await expect(rows.filter({ hasText: '[goblin seen]' })).toHaveCount(1);

  // Edit and save while it runs: it reloads at once.
  await openScriptsWindow(page);
  await row(f, 'pagetest').locator('.wc-scr-name').click();
  await expect(f.locator('.wc-scr-panel .wc-scr-title')).toHaveText('pagetest');
  await f.locator('.wc-scr-panel [data-btn="EDIT"]').click();
  await expect(editor(page)).toHaveAttribute('data-script', 'pagetest');
  await editor(page).locator('.cm-content').click();
  await setBuffer(page, SOURCE('again'));
  await page.keyboard.press('ControlOrMeta+s');
  await expect(editor(page)).toContainText('Saved. The script reloads.');
  // Esc: the editor, the panel (Edit was pressed there), the window.
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  await expect(page.locator('.wc-overlay')).toBeHidden();
  await hostSynced(page);
  await page.keyboard.type('look');
  await page.keyboard.press('Enter');
  await expect(rows.filter({ hasText: '[goblin again]' })).toHaveCount(1);
  await expect(rows.filter({ hasText: '[goblin seen]' })).toHaveCount(1);

  // A runtime error shows under the list row and in the editor.
  await openScriptsWindow(page);
  await row(f, 'pagetest').locator('.wc-scr-name').click();
  await f.locator('.wc-scr-panel [data-btn="EDIT"]').click();
  await editor(page).locator('.cm-content').click();
  await setBuffer(page, SOURCE('again').replace('echo(', 'ecko('));
  await page.keyboard.press('ControlOrMeta+s');
  await expect(editor(page)).toContainText('Saved. The script reloads.');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  await expect(page.locator('.wc-overlay')).toBeHidden();
  await hostSynced(page);
  await page.keyboard.type('look');
  await page.keyboard.press('Enter');
  await expect.poll(() => lib<{ lastError: string | null }>(page, 'get', 'pagetest').then((s) => s.lastError)).toMatch(/^pagetest:8:/);
  await openScriptsWindow(page);
  await expect(row(f, 'pagetest').locator('.wc-scr-error')).toContainText('pagetest:8:');
  await expect(row(f, 'pagetest').locator('.wc-scr-error')).toHaveAttribute('title', /^pagetest:8:/);
  await row(f, 'pagetest').locator('.wc-scr-name').click();
  await expect(f.locator('.wc-scr-problem')).toContainText('Last error: pagetest:8:');
  await f.locator('.wc-scr-panel [data-btn="EDIT"]').click();
  // … and on its line in the editor (lua-lint.ts).
  await expect(editor(page)).toContainText('Runtime error (saved version)');
  await expect(editor(page).locator('.cm-lintRange.wc-diag-runtime')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('import shows the code and a warning first; export downloads the .lua file', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsFromStart(page);

  const chooser = page.waitForEvent('filechooser');
  await f.locator('[data-btn="IMPORT"]').click();
  await (await chooser).setFiles({ name: 'goblins.lua', mimeType: 'text/plain', buffer: Buffer.from(SOURCE('imported')) });
  const imp = dialog(page, 'import');
  await expect(imp.locator('.wc-lk-hood-t')).toHaveText('Import Script');
  await expect(imp.locator('.wc-scr-warn')).toHaveText('This script can send commands to the game as you.');
  await expect(imp).toContainText('Read goblins.lua before you import it. It is added turned off.');
  await expect(imp.locator('.wc-scr-src')).toContainText('echo("[goblin imported]")');
  await expect(imp.locator('.wc-scr-gut')).toContainText('9');
  // ESC cancels: nothing is added.
  await page.keyboard.press('Escape');
  await expect(imp).toHaveCount(0);
  expect(await lib(page, 'get', 'pagetest')).toBeNull();

  const again = page.waitForEvent('filechooser');
  await f.locator('[data-btn="IMPORT"]').click();
  await (await again).setFiles({ name: 'goblins.lua', mimeType: 'text/plain', buffer: Buffer.from(SOURCE('imported')) });
  await expect(imp).toBeVisible();
  await page.keyboard.press('y');
  await expect(imp).toHaveCount(0);
  await expect(flash(f)).toHaveText('Imported pagetest from goblins.lua. It is off until you turn it on.');
  await expect(selected(f)).toHaveAttribute('data-name', 'pagetest');
  await expect(toggleOf(f, 'pagetest')).toHaveAttribute('aria-checked', 'false');

  // Export asks: this script, or all of them. Enter takes this script.
  await f.locator('[data-btn="EXPORT"]').click();
  const exp = dialog(page, 'export');
  await expect(exp.locator('.wc-lk-row.is-on')).toHaveAttribute('data-k', 'one');
  await expect(exp.locator('.wc-lk-row[data-k="one"]')).toContainText('pagetest.lua');
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const d = await download;
  expect(d.suggestedFilename()).toBe('pagetest.lua');
  expect(await readFile(await d.path(), 'utf8')).toBe(SOURCE('imported'));
  await expect(flash(f)).toHaveText('Exported pagetest.lua.');

  // Keyboard: the panel's button row has the keys after the click; → → to Delete, Enter, y.
  await expect(f.locator('.wc-lk-btn.is-sel')).toHaveAttribute('data-btn', 'EXPORT');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(f.locator('.wc-lk-btn.is-sel')).toHaveAttribute('data-btn', 'DELETE');
  await page.keyboard.press('Enter');
  await expect(dialog(page, 'delete')).toContainText('Delete script pagetest?');
  await expect(dialog(page, 'delete')).toContainText('Its settings and saved data go too.');
  await page.keyboard.press('y');
  await expect(flash(f)).toHaveText('Deleted pagetest.');
  expect(await lib(page, 'get', 'pagetest')).toBeNull();
  expect(errors).toEqual([]);
});

test('export all writes one backup file; import restores it, turned off, with settings and data', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsFromStart(page);
  await lib(page, 'create', 'pagetest', SOURCE('backed up'));
  await lib(page, 'setEnabled', 'pagetest', true);
  await lib(page, 'setSetting', 'pagetest', 'loud', 'true');
  await lib(page, 'setSetting', 'coinlooter', 'delay', '0.5');

  await f.locator('[data-btn="EXPORT"]').click();
  await expect(dialog(page, 'export')).toContainText('A backup holds your own scripts');
  const download = page.waitForEvent('download');
  await dialog(page, 'export').locator('.wc-lk-row[data-k="all"]').click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^webcockpit-scripts-\d{4}-\d\d-\d\d\.json$/);
  const text = await readFile(await d.path(), 'utf8');
  const file = JSON.parse(text) as { type: string; scripts: { name: string; source: string; enabled: boolean }[]; data: { name: string; settings: Record<string, unknown> }[] };
  expect(file.type).toBe('webcockpit-scripts');
  expect(file.scripts).toEqual([expect.objectContaining({ name: 'pagetest', source: SOURCE('backed up'), enabled: true })]);
  expect(file.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'pagetest', settings: { loud: true } }),
      expect.objectContaining({ name: 'coinlooter', settings: { delay: 0.5 } }),
    ]),
  );
  await expect(flash(f)).toHaveText(`Exported 1 script and all settings to ${d.suggestedFilename()}.`);

  // Lose the script, then restore the backup through Import.
  await lib(page, 'remove', 'pagetest');
  await expect(row(f, 'pagetest')).toHaveCount(0);
  const chooser = page.waitForEvent('filechooser');
  await f.locator('[data-btn="IMPORT"]').click();
  await (await chooser).setFiles({ name: d.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(text) });
  const res = dialog(page, 'restore');
  await expect(res.locator('.wc-lk-hood-t')).toHaveText('Restore Scripts');
  await expect(res.locator('.wc-scr-warn')).toHaveText('These scripts can send commands to the game as you.');
  await expect(res).toContainText(`Restore from ${d.suggestedFilename()}?`);
  await expect(res).toContainText('1 script: pagetest');
  await page.keyboard.press('y');
  await expect(res).toHaveCount(0);
  await expect(flash(f)).toHaveText('Restored 1 script, settings and data of 1. Restored scripts are off.');
  await expect(toggleOf(f, 'pagetest')).toHaveAttribute('aria-checked', 'false');
  expect(await lib(page, 'get', 'pagetest')).toMatchObject({ source: SOURCE('backed up'), enabled: false, settings: { loud: true } });

  // A file that is not a backup is refused with a reason.
  const bad = page.waitForEvent('filechooser');
  await f.locator('[data-btn="IMPORT"]').click();
  await (await bad).setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"type":"webcockpit-scripts","schema":9}') });
  await expect(flash(f)).toHaveText('Restore failed: Unknown backup version 9.');
  expect(errors).toEqual([]);
});
