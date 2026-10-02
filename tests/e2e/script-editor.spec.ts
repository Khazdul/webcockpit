// Stage 10 feedback round 1: the script editor's find and replace (Ctrl+F,
// our panel instead of the browser's find), live errors (header and
// compile-only syntax checks while typing, the running script's last
// error on its line) and the Scripts page's syntax check of a script that
// is off. Nothing reaches the real server.
import { type Locator, type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

/** Screenshots for the owner and for review (WC_SHOTS overrides the folder). */
const SHOTS = process.env.WC_SHOTS ?? '';

async function mockMume(page: Page): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage(() => {});
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const SOURCE = `-- @name     finder
-- @summary  Find test
-- @api      1

tempTrigger("A goblin is here.", function()
  echo("[goblin]")
end)
tempAlias("^gob$", function() send("kill goblin") end)
`;

const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const editor = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sed');
const panel = (page: Page) => editor(page).locator('.wc-search');
const row = (f: Locator, name: string) => f.locator(`.wc-scr-row[data-script="${name}"]`);
const lib = <T,>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ([fn, args]) => {
      const l = window.__wc!.shell.scripts as unknown as Record<string, (...a: unknown[]) => unknown>;
      return Promise.resolve(l[fn as string]!(...(args as unknown[]))) as Promise<unknown>;
    },
    [fn, args] as const,
  ) as Promise<T>;

const bufferText = (page: Page) =>
  editor(page)
    .locator('.cm-content')
    .evaluate((el) => [...el.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));

/** Start page → Scripts; the library holds `source` as a user script first. */
async function scriptsPage(page: Page, source = SOURCE): Promise<Locator> {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await lib(page, 'init');
  await lib(page, 'create', 'finder', source);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const f = startFrame(page);
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  return f;
}

async function openEditor(page: Page, f: Locator, name = 'finder'): Promise<void> {
  await row(f, name).locator('[data-btn="EDIT"]').click();
  await expect(editor(page)).toHaveAttribute('data-script', name);
  await expect(editor(page).locator('.cm-content')).toBeFocused();
}

async function paper(page: Page): Promise<void> {
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
}

test('Ctrl+F opens our find panel: find, next, previous, replace, all; ESC closes it before the editor', async ({ page }, info) => {
  const errors = watchErrors(page);
  // Our listener runs first at window capture: it reads whether the page
  // prevented the browser's own find.
  await page.addInitScript(() => {
    const w = window as unknown as { ctrlF: boolean[] };
    w.ctrlF = [];
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'f') setTimeout(() => w.ctrlF.push(e.defaultPrevented));
      },
      true,
    );
  });
  const f = await scriptsPage(page);
  await openEditor(page, f);
  await expect(editor(page).locator('.wc-ped-footer')).toContainText('Ctrl+F Find');

  await page.keyboard.press('Control+f');
  await expect(panel(page)).toBeVisible();
  const find = panel(page).getByRole('textbox', { name: 'Find' });
  await expect(find).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { ctrlF: boolean[] }).ctrlF)).toEqual([true]);

  await page.keyboard.type('goblin');
  await expect(panel(page).locator('.wc-search-count')).toHaveText(/1 of 3/);
  await expect(editor(page).locator('.cm-searchMatch')).toHaveCount(3);
  await expect(editor(page).locator('.cm-searchMatch-selected')).toHaveText('goblin');
  await page.keyboard.press('Enter');
  await expect(panel(page).locator('.wc-search-count')).toHaveText(/2 of 3/);
  await page.keyboard.press('F3');
  await expect(panel(page).locator('.wc-search-count')).toHaveText(/3 of 3/);
  await page.keyboard.press('Shift+Enter');
  await expect(panel(page).locator('.wc-search-count')).toHaveText(/2 of 3/);
  await page.keyboard.press('Shift+F3');
  await expect(panel(page).locator('.wc-search-count')).toHaveText(/1 of 3/);
  // Match case: "Goblin" finds nothing then.
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Goblin');
  await expect(panel(page).locator('.wc-search-count')).toHaveText(/\d of 3/);
  await page.keyboard.press('Alt+c');
  await expect(panel(page).locator('[data-toggle="caseSensitive"]')).toHaveClass(/is-on/);
  await expect(panel(page).locator('.wc-search-count')).toHaveText(/No matches/);
  await page.keyboard.press('Alt+c');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('goblin');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/search-dark-${info.project.name}.png` });

  // Replace: Ctrl+H moves to the field; Enter replaces the current match.
  await page.keyboard.press('Control+h');
  const repl = panel(page).getByRole('textbox', { name: 'Replace' });
  await expect(repl).toBeFocused();
  await page.keyboard.type('orc');
  await page.keyboard.press('Enter');
  await expect.poll(() => bufferText(page)).toContain('A orc is here.');
  await expect(panel(page).locator('.wc-search-count')).toHaveText(/1 of 2/);
  await panel(page).locator('[data-btn="ALL"]').click();
  await expect.poll(() => bufferText(page)).not.toContain('goblin');
  expect(await bufferText(page)).toContain('send("kill orc")');
  await expect(panel(page).locator('.wc-search-count')).toHaveText(/No matches/);

  // ESC closes the panel and returns to the text; the editor stays.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('.cm-content')).toBeFocused();
  // Ctrl+F from the text again, ESC from the text closes it too.
  await page.keyboard.press('Control+f');
  await expect(panel(page)).toBeVisible();
  await expect(find).toBeFocused();
  await editor(page).locator('.cm-content').click();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(editor(page)).toBeVisible();
  // The second ESC is the editor's: unsaved changes, so it asks.
  await page.keyboard.press('Escape');
  await expect(editor(page).locator('.wc-ped-overlay')).toContainText('Save changes to finder?');
  await page.keyboard.press('n');
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  expect(await lib<{ source: string }>(page, 'get', 'finder').then((s) => s.source)).toBe(SOURCE);
  expect(errors).toEqual([]);
});

test('read-only scripts can be searched, not replaced', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsPage(page);
  await openEditor(page, f, 'coinlooter');
  await page.keyboard.press('Control+f');
  await expect(panel(page).getByRole('textbox', { name: 'Find' })).toBeFocused();
  await expect(panel(page).getByRole('textbox', { name: 'Replace' })).toHaveCount(0);
  await page.keyboard.type('coins');
  await expect(panel(page).locator('.wc-search-count')).toHaveText(/1 of \d+/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  expect(errors).toEqual([]);
});

test('live errors: a syntax error is marked while typing and cleared when fixed, without saving', async ({ page }, info) => {
  const errors = watchErrors(page);
  const f = await scriptsPage(page);
  await openEditor(page, f);
  const marker = editor(page).locator('.cm-gutter-lint .cm-lint-marker-error');
  await expect(marker).toHaveCount(0);

  // Line 6 loses its closing parenthesis.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await expect(marker).toHaveCount(1);
  await expect(editor(page).locator('.wc-diag-line')).toHaveCount(1);
  await expect(editor(page).locator('.wc-sed-problem')).toContainText(/^Ln 7: Syntax error: '\)' expected \(to close '\(' at line 6\) near 'end'/);
  await expect(editor(page).locator('.cm-lintRange-error')).toHaveText('end');
  await marker.hover();
  await expect(page.locator('.cm-tooltip-lint')).toContainText('Syntax error');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/error-dark-${info.project.name}.png` });
  await paper(page);
  await marker.hover();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/error-light-${info.project.name}.png` });

  // Fixed: gone, still unsaved.
  await editor(page).locator('.cm-content').click();
  await page.keyboard.press('Control+z');
  await expect(marker).toHaveCount(0);
  await expect(editor(page).locator('.wc-diag-line')).toHaveCount(0);
  await expect(editor(page).locator('.wc-sed-problem')).toHaveCount(0);

  // A header problem: @api removed.
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Delete');
  await expect(editor(page).locator('.wc-sed-problem')).toContainText('Ln 1: Header: Cannot load: the header needs "-- @api 1".');
  expect(await lib<{ source: string }>(page, 'get', 'finder').then((s) => s.source)).toBe(SOURCE);
  // Light chrome, search panel open too.
  await page.keyboard.press('Control+f');
  await page.keyboard.type('goblin');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/search-light-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('runtime errors of the saved script are marked on their line, live, until the line is edited', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsPage(page);
  await openEditor(page, f);
  // The host reports an error while the editor is open.
  await lib(page, 'setError', 'finder', "finder:8: attempt to call a nil value (global 'sendd')");
  const marker = editor(page).locator('.cm-gutter-lint .cm-lint-marker-error');
  await expect(marker).toHaveCount(1);
  await expect(editor(page).locator('.cm-lintRange.wc-diag-runtime')).toHaveText('tempAlias("^gob$", function() send("kill goblin") end)');
  await expect(editor(page).locator('.wc-sed-status')).toHaveAttribute('title', "Ln 8: Runtime error (saved version): attempt to call a nil value (global 'sendd')");
  await marker.hover();
  await expect(page.locator('.cm-tooltip-lint')).toContainText('Runtime error (saved version)');

  // Lines added above: the mark moves with its line.
  await editor(page).locator('.cm-content').click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Enter');
  await expect(editor(page).locator('.wc-sed-problem')).toContainText('Ln 9: Runtime error');
  await expect(marker).toHaveCount(1);
  // Editing the line drops it.
  await editor(page).locator('.cm-line', { hasText: 'tempAlias' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await expect(marker).toHaveCount(0);
  await expect(editor(page).locator('.wc-sed-problem')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the Scripts page shows a syntax error of a script that is off', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsPage(page, SOURCE.replace('end)\ntempAlias', 'end\ntempAlias'));
  await expect(f.locator('.wc-scr-error')).toContainText(/^\s*Syntax error: finder:\d+: /);
  await row(f, 'finder').locator('.wc-scr-name').click();
  await expect(f.locator('.wc-scr-help')).toContainText('Syntax error: finder:');
  expect(await lib<{ enabled: boolean }>(page, 'get', 'finder').then((s) => s.enabled)).toBe(false);
  expect(errors).toEqual([]);
});

// -------------------------------------------------------------- MANUAL

const manual = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sman');
/** The text of the manual's top row (it scrolls natively). */
const manualTop = (page: Page) =>
  manual(page)
    .locator('.wc-ped-manual-rows')
    .evaluate((el) => {
      const t = el.scrollTop;
      return ([...el.children] as HTMLElement[]).find((c) => c.offsetTop >= t - 1)?.textContent ?? '';
    });

test('MANUAL: from the editor (button and F1 at the name under the cursor) and from the Scripts page', async ({ page }, info) => {
  const errors = watchErrors(page);
  const f = await scriptsPage(page);
  await openEditor(page, f);
  // CLOSE is gone; MANUAL took its place and the footer names F1.
  await expect(editor(page).locator('[data-btn="CLOSE"]')).toHaveCount(0);
  await expect(editor(page).locator('.wc-ped-footer')).toContainText('F1 Manual');

  // Search open, cursor inside tempTrigger on line 5: F1 opens its reference entry.
  await page.keyboard.press('Control+f');
  await page.keyboard.type('goblin');
  await editor(page).locator('.cm-line', { hasText: 'tempTrigger' }).click({ position: { x: 30, y: 5 } });
  await page.keyboard.press('F1');
  await expect(manual(page)).toBeVisible();
  // Near the end of A–Z the entry cannot reach the top row: it is in view and marked.
  await expect(manual(page).locator('.wc-ped-menu .wc-tr.is-cur')).toHaveText(/^ tempTrigger\s*$/);
  await expect(manual(page).locator('[data-kind="heading"]', { hasText: /^tempTrigger$/ })).toBeInViewport();
  await expect(manual(page).locator('.wc-ped-manual')).toContainText('tempTrigger(substring, fn)');
  await expect(manual(page).locator('.wc-ped-menu-label').filter({ hasText: /\S/ })).toHaveText([/Guide/, /API reference/]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/manual-dark-${info.project.name}.png` });

  // The wheel scrolls by pixels, not rows.
  const rows = manual(page).locator('.wc-ped-manual-rows');
  const before = await rows.evaluate((el) => el.scrollTop);
  await rows.hover();
  await page.mouse.wheel(0, -6);
  await expect.poll(() => rows.evaluate((el) => el.scrollTop)).toBeLessThan(before);
  const cell = await rows.locator('.wc-line').first().evaluate((el) => el.getBoundingClientRect().height);
  expect(before - (await rows.evaluate((el) => el.scrollTop))).toBeLessThan(cell);
  // n / p jump between headings; Tab goes to the menu.
  await page.keyboard.press('p');
  await expect.poll(() => manualTop(page)).toBe('tempTimer');
  await page.keyboard.press('Tab');
  await expect(manual(page)).toHaveAttribute('data-zone', 'menu');

  // ESC: back in the editor with the search panel, its query and the cursor.
  await page.keyboard.press('Escape');
  await expect(manual(page)).toHaveCount(0);
  await expect(editor(page)).toBeVisible();
  await expect(panel(page).getByRole('textbox', { name: 'Find' })).toHaveValue('goblin');
  await expect(editor(page).locator('.wc-ped-footer')).toContainText('Ln 5,');

  // MANUAL button: the start of the guide.
  await editor(page).locator('[data-btn="MANUAL"]').click();
  await expect.poll(() => manualTop(page)).toBe('Getting started');
  await paper(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/manual-light-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');

  // The Scripts page has MANUAL in its button row.
  await f.locator('[data-btn="MANUAL"]').click();
  await expect(manual(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(f.locator('.wc-title-row')).toHaveText('─── Scripts ───');
  expect(errors).toEqual([]);
});
