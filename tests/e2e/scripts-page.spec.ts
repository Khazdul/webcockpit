// Stage 10 P2: the Scripts page and the script editor (spec §2.10,
// ADR 0051), from the start page and the ESC menu, against a mocked MUME.
import { readFile } from 'node:fs/promises';
import { type Locator, type Page, expect, test } from '@playwright/test';

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
const menuFrame = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden])');
const editor = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sed');
const row = (f: Locator, name: string) => f.locator(`.wc-scr-row[data-script="${name}"]`);
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
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
}

/** Start page → Options → Scripts with the keyboard (Scripts is last in the Options hub). */
async function scriptsFromStart(page: Page): Promise<Locator> {
  await openStart(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Options >>');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-mrow.is-sel')).toHaveText('<< Scripts >>');
  await page.keyboard.press('Enter');
  const f = startFrame(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  return f;
}

/** ESC menu (open) → Options → Scripts. */
async function openScriptsFromEsc(page: Page): Promise<void> {
  await page.locator('.wc-overlay .wc-mrow[data-key="options"] .wc-label').click();
  await menuFrame(page).locator('.wc-mrow[data-key="scripts"] .wc-label').click();
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
  await expect(looter.locator('.wc-scr-lock')).toHaveCount(1);
  // The cursor starts on the first script; its help is on the right.
  await expect(f.locator('.wc-scr-name.is-cur')).toHaveText(/^coinlooter\s*$/);
  const help = f.locator('.wc-scr-help');
  await expect(help).toContainText('bundled · read-only');
  await expect(help).toContainText('#script set coinlooter delay');
  // Bundled: RENAME and DELETE are off.
  await expect(f.locator('[data-btn="RENAME"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(f.locator('[data-btn="DELETE"]')).toHaveAttribute('aria-disabled', 'true');

  // Enter on the toggle turns it on (global, stored), again turns it off.
  await page.keyboard.press('Enter');
  await expect(looter.locator('.wc-check')).toHaveClass(/is-on/);
  await expect(f.locator('.wc-flash')).toHaveText('coinlooter is on. It runs when you enter MUME.');
  expect(await lib<string[]>(page, 'enabledNames')).toEqual(['coinlooter']);
  await page.keyboard.press('Enter');
  await expect(looter.locator('.wc-check')).not.toHaveClass(/is-on/);

  // → EDIT, Enter: the read-only editor.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(editor(page)).toHaveAttribute('data-readonly', 'true');
  await expect(editor(page).locator('.wc-ped-title')).toContainText('─── Script Editor: coinlooter ───');
  const before = await bufferText(page);
  await page.keyboard.type('xyz');
  expect(await bufferText(page)).toBe(before);
  await expect(editor(page).locator('[data-btn="SAVE"]')).toHaveCount(0);

  // DUPLICATE opens the editable copy in its place.
  await editor(page).locator('[data-btn="DUPLICATE"]').click();
  await expect(editor(page)).toHaveAttribute('data-script', 'coinlooter-copy');
  await expect(editor(page)).toHaveAttribute('data-readonly', 'false');
  await expect(editor(page).locator('.wc-ped-footer')).toContainText('Duplicated as coinlooter-copy');
  expect(await bufferText(page)).toContain('-- @name     coinlooter-copy');
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  await expect(row(f, 'coinlooter-copy')).toBeVisible();
  await expect(row(f, 'coinlooter-copy').locator('.wc-scr-lock')).toHaveCount(0);
  await expect(f.locator('.wc-scr-name.is-cur')).toHaveText(/^coinlooter-copy\s*$/);
  expect(errors).toEqual([]);
});

test('ESC menu → Scripts: new script, edit, save, enable; its trigger works and a save reloads it', async ({ page }) => {
  const errors = watchErrors(page);
  await openStart(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.keyboard.press('Escape');
  // Scripts is not in the ESC menu itself but under Options.
  await expect(page.locator('.wc-overlay .wc-mrow[data-key="options"]')).toBeVisible();
  await expect(menuFrame(page).locator('.wc-mrow[data-key="scripts"]')).toHaveCount(0);
  await openScriptsFromEsc(page);
  const f = menuFrame(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');

  // NEW: name prompt, then the editor on the template.
  await f.locator('[data-btn="NEW"]').click();
  await expect(f.locator('.wc-title-row')).toHaveText('─── New Script ───');
  await page.keyboard.type('9bad');
  await page.keyboard.press('Enter');
  await expect(f.locator('.wc-c-danger')).toHaveText('The name must start with a letter.');
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
  await expect(editor(page).locator('.wc-ped-overlay')).toContainText('Save changes to pagetest?');
  await page.keyboard.press('Escape');
  await expect(editor(page).locator('.wc-ped-overlay')).toHaveCount(0);

  await setBuffer(page, SOURCE('seen'));
  await page.keyboard.press('ControlOrMeta+s');
  await expect(editor(page).locator('.wc-ped-footer')).toContainText('Saved. Turn it on in the list to run it.');
  expect(await lib<{ source: string }>(page, 'get', 'pagetest').then((s) => s.source)).toBe(SOURCE('seen'));
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  await expect(f.locator('.wc-scr-name.is-cur')).toHaveText(/^pagetest\s*$/);
  await expect(f.locator('.wc-scr-help')).toContainText('#script set pagetest loud false');

  // Turn it on with the mouse; the host starts it.
  await row(f, 'pagetest').locator('.wc-check').click();
  await expect(row(f, 'pagetest').locator('.wc-scr-mark')).toHaveText('●', { timeout: 10_000 });
  await expect(f.locator('.wc-scr-help')).toContainText('● on · running');

  // Back to the game: the trigger fires.
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay')).toBeHidden();
  const rows = page.locator('.wc-rows .wc-row');
  await page.keyboard.type('look');
  await page.keyboard.press('Enter');
  await expect(rows.filter({ hasText: '[goblin seen]' })).toHaveCount(1);

  // Edit and save while it runs: it reloads at once.
  await page.keyboard.press('Escape');
  await openScriptsFromEsc(page);
  await expect(row(f, 'pagetest')).toBeVisible();
  await row(f, 'pagetest').locator('[data-btn="EDIT"]').click();
  await expect(editor(page)).toHaveAttribute('data-script', 'pagetest');
  await editor(page).locator('.cm-content').click();
  await setBuffer(page, SOURCE('again'));
  await page.keyboard.press('ControlOrMeta+s');
  await expect(editor(page).locator('.wc-ped-footer')).toContainText('Saved. The script reloads.');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay')).toBeHidden();
  await hostSynced(page);
  await page.keyboard.type('look');
  await page.keyboard.press('Enter');
  await expect(rows.filter({ hasText: '[goblin again]' })).toHaveCount(1);
  await expect(rows.filter({ hasText: '[goblin seen]' })).toHaveCount(1);

  // A runtime error shows on the editor's status row and under the list row.
  await page.keyboard.press('Escape');
  await openScriptsFromEsc(page);
  await row(f, 'pagetest').locator('[data-btn="EDIT"]').click();
  await editor(page).locator('.cm-content').click();
  await setBuffer(page, SOURCE('again').replace('echo(', 'ecko('));
  await page.keyboard.press('ControlOrMeta+s');
  await expect(editor(page).locator('.wc-ped-footer')).toContainText('Saved. The script reloads.');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay')).toBeHidden();
  await hostSynced(page);
  await page.keyboard.type('look');
  await page.keyboard.press('Enter');
  await expect.poll(() => lib<{ lastError: string | null }>(page, 'get', 'pagetest').then((s) => s.lastError)).toMatch(/^pagetest:8:/);
  await page.keyboard.press('Escape');
  await openScriptsFromEsc(page);
  await expect(f.locator('.wc-scr-error')).toContainText('pagetest:8:');
  await row(f, 'pagetest').locator('[data-btn="EDIT"]').click();
  // … and on its line in the editor (lua-lint.ts).
  await expect(editor(page).locator('.wc-sed-status')).toHaveAttribute('title', /^Ln 8: Runtime error \(saved version\): /);
  await expect(editor(page).locator('.cm-lintRange.wc-diag-runtime')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('import shows the code and a warning first; export downloads the .lua file', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsFromStart(page);

  const chooser = page.waitForEvent('filechooser');
  await f.locator('[data-btn="IMPORT"]').click();
  await (await chooser).setFiles({ name: 'goblins.lua', mimeType: 'text/plain', buffer: Buffer.from(SOURCE('imported')) });
  await expect(f.locator('.wc-title-row')).toHaveText('─── Import Script ───');
  await expect(f.locator('.wc-c-err').first()).toHaveText('This script can send commands to the game as you.');
  await expect(f.locator('.wc-scr-import')).toContainText('echo("[goblin imported]")');
  // ESC cancels: nothing is added.
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  expect(await lib(page, 'get', 'pagetest')).toBeNull();

  const again = page.waitForEvent('filechooser');
  await f.locator('[data-btn="IMPORT"]').click();
  await (await again).setFiles({ name: 'goblins.lua', mimeType: 'text/plain', buffer: Buffer.from(SOURCE('imported')) });
  await expect(f.locator('.wc-title-row')).toHaveText('─── Import Script ───');
  await page.keyboard.press('y');
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  await expect(f.locator('.wc-flash')).toHaveText('Imported pagetest from goblins.lua. It is off until you turn it on.');
  await expect(f.locator('.wc-scr-name.is-cur')).toHaveText(/^pagetest\s*$/);
  await expect(row(f, 'pagetest').locator('.wc-check')).not.toHaveClass(/is-on/);

  // EXPORT asks: this script, or all of them. Enter takes this script.
  await f.locator('[data-btn="EXPORT"]').click();
  await expect(f.locator('.wc-title-row')).toHaveText('─── Export Scripts ───');
  await expect(f.locator('.wc-mrow.is-sel')).toHaveText('<< This script (pagetest.lua) >>');
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const d = await download;
  expect(d.suggestedFilename()).toBe('pagetest.lua');
  expect(await readFile(await d.path(), 'utf8')).toBe(SOURCE('imported'));
  await expect(f.locator('.wc-flash')).toHaveText('Exported pagetest.lua.');

  // Keyboard: the button row has the focus after the click; → → to DELETE, Enter, y.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(f.locator('.wc-btn.is-sel-focus')).toHaveText(/DELETE/);
  await page.keyboard.press('Enter');
  await expect(f.locator('.wc-title-row')).toHaveText('─── Delete Script ───');
  await page.keyboard.press('y');
  await expect(f.locator('.wc-flash')).toHaveText('Deleted pagetest.');
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
  await expect(f.locator('.wc-title-row')).toHaveText('─── Export Scripts ───');
  const download = page.waitForEvent('download');
  await f.locator('.wc-mrow[data-key="all"] .wc-label').click();
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
  await expect(f.locator('.wc-flash')).toHaveText(`Exported 1 script and all settings to ${d.suggestedFilename()}.`);

  // Lose the script, then restore the backup through IMPORT.
  await lib(page, 'remove', 'pagetest');
  await expect(row(f, 'pagetest')).toHaveCount(0);
  const chooser = page.waitForEvent('filechooser');
  await f.locator('[data-btn="IMPORT"]').click();
  await (await chooser).setFiles({ name: d.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(f.locator('.wc-title-row')).toHaveText('─── Restore Scripts ───');
  await expect(f.locator('.wc-c-err').first()).toHaveText('These scripts can send commands to the game as you.');
  await expect(f).toContainText('1 script: pagetest');
  await page.keyboard.press('y');
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  await expect(f.locator('.wc-flash')).toHaveText('Restored 1 script, settings and data of 1. Restored scripts are off.');
  await expect(row(f, 'pagetest').locator('.wc-check')).not.toHaveClass(/is-on/);
  expect(await lib(page, 'get', 'pagetest')).toMatchObject({ source: SOURCE('backed up'), enabled: false, settings: { loud: true } });

  // A file that is not a backup is refused with a reason.
  const bad = page.waitForEvent('filechooser');
  await f.locator('[data-btn="IMPORT"]').click();
  await (await bad).setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"type":"webcockpit-scripts","schema":9}') });
  await expect(f.locator('.wc-flash')).toHaveText('Restore failed: Unknown backup version 9.');
  expect(errors).toEqual([]);
});
