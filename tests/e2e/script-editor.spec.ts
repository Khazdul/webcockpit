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
// The editor's root (`display: contents`, the frame's child; stage 44b).
const editor = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-sed');
const panel = (page: Page) => editor(page).locator('.wc-search');
const unsaved = (page: Page) => editor(page).locator('.wc-lk-dialog[data-dlg="unsaved"]');
const flash = (page: Page) => editor(page).locator('.wc-lk-flash');
// A row of the Scripts page: the grid page's `data-script`, the lantern page's `data-name` (stage 44a).
const row = (f: Locator, name: string) => f.locator(`.wc-scr-row[data-script="${name}"], .wc-scr-row[data-name="${name}"]`);
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

/** The Scripts page is the top frame again (the editor gone). */
async function backOnPage(page: Page): Promise<void> {
  await expect(editor(page)).toHaveCount(0);
  await expect(startFrame(page).locator('.wc-scr').first()).toBeVisible();
}

/** Start page → Scripts; the library holds `source` as a user script first. */
async function scriptsPage(page: Page, source = SOURCE): Promise<Locator> {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await lib(page, 'init');
  await lib(page, 'create', 'finder', source);
  // Scripts, under Profile on the start page (stage 32).
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Scripts');
  await page.keyboard.press('Enter');
  const f = startFrame(page);
  await expect(f.locator('.wc-scr')).toBeVisible();
  return f;
}

async function openEditor(page: Page, f: Locator, name = 'finder'): Promise<void> {
  await row(f, name).locator('.wc-scr-name').click();
  await f.locator('.wc-scr-panel [data-btn="EDIT"]').click();
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
  // No key hints (stage 44): the Find tool's tooltip names the keys.
  await expect(editor(page).locator('.wc-sed-tools [data-btn="FIND"]')).toHaveAttribute('title', 'Find and replace (Ctrl+F, Ctrl+H)');

  await page.keyboard.press('Control+f');
  await expect(panel(page)).toBeVisible();
  // The lantern find row at the top of the well; the tools hide while it is open.
  await expect(panel(page)).toHaveClass(/wc-lk-search/);
  await expect(editor(page).locator('.wc-sed-tools')).toBeHidden();
  const find = panel(page).getByRole('textbox', { name: 'Find' });
  await expect(find).toBeFocused();
  // (The listener records on a timer: poll it.)
  await expect.poll(() => page.evaluate(() => (window as unknown as { ctrlF: boolean[] }).ctrlF)).toEqual([true]);

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
  await expect(panel(page).locator('[data-opt="case"]')).toHaveAttribute('aria-checked', 'true');
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
  await panel(page).locator('[data-btn="all"]').click();
  await expect.poll(() => bufferText(page)).not.toContain('goblin');
  expect(await bufferText(page)).toContain('send("kill orc")');
  await expect(panel(page).locator('.wc-search-count')).toHaveText(/No matches/);

  // ESC closes the panel and returns to the text; the editor stays, the tools are back.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('.wc-sed-tools')).toBeVisible();
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
  await expect(unsaved(page)).toContainText('Save changes to finder?');
  await page.keyboard.press('n');
  await backOnPage(page);
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
  await backOnPage(page);
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

test('the unsaved prompt: Keep editing stays, Y saves and leaves, N discards; Back asks too', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsPage(page);
  await openEditor(page, f);
  const box = startFrame(page).locator('.wc-lk-box');
  // The hood carries the name, with a dot while there are unsaved changes.
  await expect(box.locator('.wc-lk-hood-t:not(.is-out)')).toHaveText('finder');
  await page.keyboard.type('-- one\n');
  await expect(box.locator('.wc-lk-hood-t:not(.is-out)')).toHaveText('finder •');
  await expect(editor(page).locator('.wc-sed-pos')).toContainText(/Modified\s*·\s*Ln 2, Col 1/);

  // Esc asks; Esc again keeps editing, the buffer has the keys back.
  await page.keyboard.press('Escape');
  await expect(unsaved(page)).toContainText('Unsaved changes');
  await expect(unsaved(page)).toContainText('Save changes to finder?');
  await expect(unsaved(page).locator('[data-btn="YES"]')).toHaveClass(/is-primary/);
  await page.keyboard.press('Escape');
  await expect(unsaved(page)).toHaveCount(0);
  await expect(editor(page).locator('.cm-content')).toBeFocused();
  // Keep editing by its button; the letters never reach the buffer.
  await page.keyboard.press('Escape');
  await unsaved(page).locator('[data-btn="KEEP"]').click();
  await expect(unsaved(page)).toHaveCount(0);
  await page.keyboard.type('x');
  expect(await bufferText(page)).toMatch(/^-- one\nx-- @name/);

  // Back (top left) asks too; N discards and leaves.
  await startFrame(page).locator('.wc-lk-back').first().click();
  await expect(unsaved(page)).toBeVisible();
  await page.keyboard.press('n');
  await backOnPage(page);
  expect(await lib<{ source: string }>(page, 'get', 'finder').then((s) => s.source)).toBe(SOURCE);

  // Y saves and leaves, with the page's flash.
  await openEditor(page, f);
  await page.keyboard.type('-- two\n');
  await page.keyboard.press('Escape');
  await expect(unsaved(page)).toBeVisible();
  await page.keyboard.press('y');
  await backOnPage(page);
  await expect.poll(() => lib<{ source: string }>(page, 'get', 'finder').then((s) => s.source)).toBe('-- two\n' + SOURCE);
  expect(errors).toEqual([]);
});

test('the Scripts page shows a syntax error of a script that is off', async ({ page }) => {
  const errors = watchErrors(page);
  const f = await scriptsPage(page, SOURCE.replace('end)\ntempAlias', 'end\ntempAlias'));
  // The index is narrow (ADR 0121): the row shows the start, its title and the panel the whole message.
  await expect(row(f, 'finder').locator('.wc-scr-error')).toContainText(/^Syntax error: /);
  await expect(row(f, 'finder').locator('.wc-scr-error')).toHaveAttribute('title', /^Syntax error: finder:\d+: /);
  await row(f, 'finder').locator('.wc-scr-name').click();
  await expect(f.locator('.wc-scr-panel .wc-scr-problem')).toContainText('Syntax error: finder:');
  expect(await lib<{ enabled: boolean }>(page, 'get', 'finder').then((s) => s.enabled)).toBe(false);
  expect(errors).toEqual([]);
});

// -------------------------------------------------------------- MANUAL

const manual = (page: Page) => page.locator('.wc-frame:not([hidden]) .wc-sman');
/** The heading of the manual's section at the top of its text (stage 44: the lantern reader). */
const manualTop = (page: Page) =>
  manual(page)
    .locator('.wc-lk-mtext')
    .evaluate((el) => {
      const top = el.getBoundingClientRect().top;
      const s = [...el.querySelectorAll('section[data-i]')].find((c) => c.getBoundingClientRect().bottom > top + 24);
      return s?.getAttribute('aria-label') ?? '';
    });

test('MANUAL: from the editor (F1 at the name under the cursor, else at the start) and from the Scripts page', async ({ page }, info) => {
  const errors = watchErrors(page);
  const f = await scriptsPage(page);
  await openEditor(page, f);

  // Search open, cursor inside tempTrigger on line 5: F1 opens its reference entry.
  await page.keyboard.press('Control+f');
  await page.keyboard.type('goblin');
  await editor(page).locator('.cm-line', { hasText: 'tempTrigger' }).click({ position: { x: 30, y: 5 } });
  await page.keyboard.press('F1');
  await expect(manual(page)).toBeVisible();
  // The large box's hood names it; the entry is at the top and lit in the contents.
  await expect(manual(page).locator(':scope > .wc-lk-hood')).toContainText('Script Manual');
  await expect(manual(page).locator('.wc-lk-mtoc li.is-on')).toHaveText('tempTrigger');
  await expect.poll(() => manualTop(page)).toBe('tempTrigger');
  await expect(manual(page).locator('.wc-lk-mtext h3', { hasText: /^tempTrigger$/ })).toBeInViewport();
  await expect(manual(page).locator('.wc-lk-mtext section[aria-label="tempTrigger"]')).toContainText('tempTrigger(substring, fn)');
  await expect(manual(page).locator('.wc-lk-mgrp-t')).toHaveText(['Guide', 'API reference', 'Lua reference']);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/manual-dark-${info.project.name}.png` });

  // The wheel scrolls the text natively, by pixels.
  const text = manual(page).locator('.wc-lk-mtext');
  const before = await text.evaluate((el) => el.scrollTop);
  await text.hover();
  await page.mouse.wheel(0, -6);
  await expect.poll(() => text.evaluate((el) => el.scrollTop)).toBeLessThan(before);
  expect(before - (await text.evaluate((el) => el.scrollTop))).toBeLessThan(40);
  // n / p jump between headings; Tab goes to the contents.
  await page.keyboard.press('p');
  await expect.poll(() => manualTop(page)).toBe('tempTimer');
  await expect(manual(page).locator('.wc-lk-mtoc li.is-on')).toHaveText('tempTimer');
  await page.keyboard.press('n');
  await expect.poll(() => manualTop(page)).toBe('tempTrigger');
  await page.keyboard.press('Tab');
  await expect(manual(page).locator('.wc-lk-manual')).toHaveAttribute('data-zone', 'toc');
  // ↑ in the contents: the section before.
  await page.keyboard.press('ArrowUp');
  await expect(manual(page).locator('.wc-lk-mtoc li.is-on')).toHaveText('tempTimer');
  await expect.poll(() => manualTop(page)).toBe('tempTimer');

  // Esc: back in the editor with its search query and the cursor.
  await page.keyboard.press('Escape');
  await expect(manual(page)).toHaveCount(0);
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('.wc-search input').first()).toHaveValue('goblin');
  await expect(editor(page)).toContainText('Ln 5,');

  // F1 away from any name: the start of the guide.
  await editor(page).locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('F1');
  await expect.poll(() => manualTop(page)).toBe('Getting started');
  await expect(manual(page).locator('.wc-lk-mtoc li.is-on')).toHaveText('Getting started');
  // Back at the top left goes back too.
  await f.locator('.wc-sman > .wc-lk-back').click();
  await expect(manual(page)).toHaveCount(0);
  await expect(editor(page)).toBeVisible();
  // Esc leaves the editor (its search first).
  const pageManual = f.locator('[data-btn="MANUAL"]');
  for (let i = 0; i < 3 && !(await pageManual.isVisible()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  await expect(pageManual).toBeVisible();

  // The Scripts page has Manual among its page buttons: the guide's start.
  await pageManual.click();
  await expect(manual(page)).toBeVisible();
  await expect.poll(() => manualTop(page)).toBe('Getting started');
  await page.keyboard.press('Escape');
  await expect(manual(page)).toHaveCount(0);
  await expect(pageManual).toBeVisible();
  expect(errors).toEqual([]);
});
