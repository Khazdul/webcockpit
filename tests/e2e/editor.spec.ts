// The profile editor in the new look, direction B "Ryggen" (stage 43a,
// ADR 0128; stage 3 P3, ADR 0105, 0119): from the start page (the large
// box) and, in play, the menu bar's Profile window (ADR 0103), against a
// mocked MUME WebSocket. The rail, the letters, the Esc rule for fields,
// the sheet in one column, the quiet status, Editor and Help.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';
import { dprTest, expectDpr } from './dpr';
import { morphDone } from './look';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

async function mockMume(page: Page): Promise<{ server: () => WebSocketRoute | null }> {
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  return { server: () => server };
}

const pe = (page: Page) => page.locator('.wc-frame:not([hidden]) .wc-pe');
const flash = (page: Page) => pe(page).locator('.wc-pe-flash');
const status = (page: Page) => pe(page).locator('.wc-pe-status');
const rows = (page: Page) => pe(page).locator('.wc-pe-list .wc-pe-row');
const curRow = (page: Page) => pe(page).locator('.wc-pe-list .wc-pe-row.is-on');
const pattern = (page: Page) => pe(page).locator('[data-field="pattern"] input');
const body = (page: Page) => pe(page).locator('[data-field="body"] textarea');
const keyCell = (page: Page) => pe(page).locator('[data-field="key"]');
const content = (page: Page) => pe(page).locator('.cm-content');
const views = (page: Page, v: string) => pe(page).locator(`.wc-pe-views [data-opt="${v}"]`);
const dialog = (page: Page, dlg: string) => page.locator(`.wc-lk-dialog[data-dlg="${dlg}"]`);
const listFlash = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-flash');
/** The start page's top box's hood (not a dialog's): `Profiles` once the editor has left. */
const listHood = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-box > .wc-lk-hood .wc-lk-hood-t');
/** The buffer's text, line by line (the buffer is small, so every line is rendered). */
const bufferText = (page: Page) =>
  content(page).evaluate((el) => [...el.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));
const stored = (page: Page, name = 'default') =>
  page.evaluate((n) => window.__wc!.shell.profiles.get(n).then((r) => r?.text ?? null), name);
/** The list as `pattern | body` per row, and `+ New alias` for the last. */
const listText = (page: Page) =>
  rows(page).evaluateAll((els) =>
    els.map((e) =>
      e.matches('[data-row="new"]')
        ? `+ ${e.textContent!.trim()}`
        : `${e.querySelector('.wc-pe-l1')!.textContent!.trim()} | ${e.querySelector('.wc-pe-bod')!.textContent!.trim()}`,
    ),
  );
/** The manual's current section in the rail (its contents' lit entry). */
const railSection = (page: Page) => pe(page).locator('.wc-lk-mtoc li.is-on');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Start page → Profile → Edit on `default` (the large box, landed). */
async function openFromStart(page: Page, text?: string): Promise<void> {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  if (text !== undefined) {
    await page.evaluate(async (t) => {
      await window.__wc!.shell.profiles.init();
      await window.__wc!.shell.profiles.save('default', t);
    }, text);
  }
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(listHood(page)).toHaveText('Profiles');
  await page.locator('.wc-start [data-btn="EDIT"]').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await morphDone(page);
  await expect(pe(page).locator('.wc-pe-name')).toHaveText(/^default/);
}

/** Into the game, the bar's Profile window (ADR 0103). */
async function openWindow(page: Page, text: string, disconnect = false): Promise<void> {
  const mock = await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (t) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', t);
  }, text);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  if (disconnect) {
    await mock.server()!.close();
    await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  }
  await page.locator('.wc-mb[data-mb="profile"]').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
}

/** A kind by its letter; the keyboard goes to the list. */
async function kind(page: Page, name: string): Promise<void> {
  const letter = { action: 'a', alias: 'i', highlight: 'g', macro: 'm', substitute: 's' }[name]!;
  await page.keyboard.press(letter);
  await expect(pe(page)).toHaveAttribute('data-kind', name);
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
}

async function toEditor(page: Page): Promise<void> {
  await views(page, 'editor').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'editor');
  await expect(content(page)).toBeVisible();
}

async function toHelp(page: Page): Promise<void> {
  await views(page, 'help').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'help');
  await expect(pe(page).locator('.wc-lk-manual')).toBeVisible();
}

test('Lite → Editor → Lite → Esc saves; reload shows it', async ({ page }) => {
  const errors = watchErrors(page);
  await openFromStart(page, '#nop head\n\n#alias {b} {bee}\n#macro {F1} {one}\n');
  await expect(status(page)).toHaveText('All saved');
  await kind(page, 'alias');
  expect(await listText(page)).toEqual(['b | bee', '+ New alias']);

  // N adds an entry and focuses Pattern; Tab goes to Commands.
  await page.keyboard.press('n');
  await expect(pattern(page)).toBeFocused();
  await page.keyboard.type('gv %1');
  await expect(status(page)).toHaveText('Editing');
  await page.keyboard.press('Tab');
  await expect(body(page)).toBeFocused();
  await page.keyboard.type('get %1;');
  await page.keyboard.press('Enter');
  await page.keyboard.type('value %1');
  // New entries stay at the bottom of the list until a flip.
  expect(await listText(page)).toEqual(['b | bee', 'gv %1 | get %1; …', '+ New alias']);
  // Esc leaves the field first (decision 6): the keyboard is back in the list and the edit applies.
  await page.keyboard.press('Escape');
  await expect(body(page)).not.toBeFocused();
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await expect(status(page)).toHaveText('All saved');
  await expect(flash(page)).toHaveText('Saved');

  // E: the Editor, the buffer has the keys; the new alias sits after the last alias.
  await page.keyboard.press('e');
  await expect(pe(page)).toHaveAttribute('data-view', 'editor');
  await expect(pe(page)).toHaveAttribute('data-zone', 'buffer');
  await expect(content(page)).toBeFocused();
  expect(await bufferText(page)).toBe('#nop head\n\n#alias {b} {bee}\n#alias {gv %1} {\n    get %1;\n    value %1\n}\n#macro {F1} {one}\n');
  await expect(status(page)).toContainText('Ln 1, Col 1');

  // Edit the text: a new alias at the end, typed with auto-closed braces.
  await page.keyboard.press('Control+End');
  await page.keyboard.type('#alias {k');
  await page.keyboard.press('End');
  await page.keyboard.type(' {kill}');
  await expect(status(page)).not.toContainText('unclosed');
  await page.keyboard.type(' {');
  await expect(status(page)).not.toContainText('unclosed'); // auto-closed
  await page.keyboard.press('Backspace'); // removes the pair
  await page.keyboard.press('Backspace');
  await page.keyboard.type('{');
  await page.keyboard.press('Delete');
  await expect(status(page)).toContainText('1 unclosed {');
  await page.keyboard.press('Backspace');
  await expect(status(page)).not.toContainText('unclosed');
  await expect(status(page)).toContainText('Modified');
  await expect(status(page)).toContainText('Ln 9, Col 18');

  // Esc leaves the buffer (the rail has the keys), L flips back to Lite: the list is re-read.
  await page.keyboard.press('Escape');
  await expect(pe(page)).toHaveAttribute('data-zone', 'rail');
  await page.keyboard.press('l');
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await kind(page, 'alias');
  expect(await listText(page)).toEqual(['b | bee', 'gv %1 | get %1; …', 'k | kill', '+ New alias']);

  // Esc leaves; the list flashes what this visit stored.
  await page.keyboard.press('Escape');
  await expect(listFlash(page)).toHaveText('Saved default.');
  const saved = '#nop head\n\n#alias {b} {bee}\n#alias {gv %1} {\n    get %1;\n    value %1\n}\n#macro {F1} {one}\n#alias {k} {kill}';
  expect(await stored(page)).toBe(saved);
  await page.reload();
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  expect(await stored(page)).toBe(saved);
  expect(errors).toEqual([]);
});

test('a flip without edits keeps the text byte for byte', async ({ page }) => {
  const text = '#ACTION {x}\n{\n    say hi\n}\n\n#nop keep me\n#gag {spam}\n\n#lua {print(1)}\n#alias {a} {b} {7}\n';
  await openFromStart(page, text);
  await toEditor(page);
  await views(page, 'lite').click();
  await toEditor(page);
  // The inert #lua is marked, with its hint on hover.
  await expect(pe(page).locator('.wc-syn-inert')).toHaveText('#lua');
  await expect(pe(page).locator('.wc-syn-inert')).toHaveAttribute('title', /other forms do nothing/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Nothing changed: pops without saving.
  await expect(listHood(page)).toHaveText('Profiles');
  expect(await stored(page)).toBe(text);
});

test('Editor: Ctrl+F finds and replaces; Esc closes the panel, leaves the buffer, then the editor', async ({ page }) => {
  const text = '#alias {k} {kill orc}\n#action {An orc arrives.} {kill orc}\n';
  await openFromStart(page, text);
  await toEditor(page);
  await content(page).click();
  await page.keyboard.press('Control+f');
  const panel = pe(page).locator('.wc-lk-search');
  await expect(panel.locator('[data-field=find] input')).toBeFocused();
  await page.keyboard.type('orc');
  await expect(panel.locator('.wc-search-count')).toHaveText(/1 of 3/);
  await expect(pe(page).locator('.cm-searchMatch')).toHaveCount(3);
  await page.keyboard.press('Control+h');
  await expect(panel.locator('[data-field=replace] input')).toBeFocused();
  await page.keyboard.type('troll');
  await panel.locator('[data-btn=all]').click();
  await expect.poll(() => bufferText(page)).toBe('#alias {k} {kill troll}\n#action {An troll arrives.} {kill troll}\n');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(content(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pe(page)).toHaveAttribute('data-zone', 'rail');
  await expect(content(page)).not.toBeFocused();
  // The Find button opens it again.
  await pe(page).locator('[data-btn="FIND"]').click();
  await expect(panel.locator('[data-field=find] input')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(listHood(page)).toHaveText('Profiles');
  expect(await stored(page)).toContain('kill troll');
});

test('the rail and the letters: kinds, new, delete; Del only in the list', async ({ page }) => {
  const errors = watchErrors(page);
  await openFromStart(page, '#action {orc} {kill orc}\n#macro {F1} {one}\n');
  // The rail lists the kinds with their counts; the cursor starts in the list.
  await expect(pe(page).locator('[data-rail]')).toHaveText([/^Actions\s*1$/, /^Aliases\s*0$/, /^Highlights\s*0$/, /^Macros\s*1$/, /^Substitutes\s*0$/]);
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await expect(curRow(page)).toHaveAttribute('data-id', /\d+/);

  // A click on a kind gives the rail the keys: ↑↓ switch the kind, → goes to the list.
  await pe(page).locator('[data-rail="alias"]').click();
  await expect(pe(page)).toHaveAttribute('data-zone', 'rail');
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await page.keyboard.press('ArrowUp');
  await expect(pe(page)).toHaveAttribute('data-kind', 'action');
  // Del in the rail deletes nothing.
  await page.keyboard.press('Delete');
  expect(await listText(page)).toEqual(['orc | kill orc', '+ New action']);
  await page.keyboard.press('ArrowRight');
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');

  // N: a new action, Pattern focused.
  await page.keyboard.press('n');
  await expect(pattern(page)).toBeFocused();
  await expect(pattern(page)).toHaveValue('');
  await page.keyboard.type('troll');
  expect(await listText(page)).toEqual(['orc | kill orc', 'troll | ', '+ New action']);
  // Letters type in a field: d is text there.
  await page.keyboard.type('d');
  await expect(pattern(page)).toHaveValue('trolld');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Escape');
  await expect.poll(() => stored(page)).toBe('#action {orc} {kill orc}\n#action {troll} {}\n#macro {F1} {one}\n');
  // Del in the list deletes the entry under the cursor.
  await page.keyboard.press('Delete');
  expect(await listText(page)).toEqual(['orc | kill orc', '+ New action']);
  await expect.poll(() => stored(page)).toBe('#action {orc} {kill orc}\n#macro {F1} {one}\n');
  // D (and the Delete button) on the New row: nothing.
  await page.keyboard.press('End');
  await expect(pe(page).locator('[data-btn="DELETE"]')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('d');
  expect(await listText(page)).toEqual(['orc | kill orc', '+ New action']);

  // A macro: N starts key capture.
  await kind(page, 'macro');
  await page.keyboard.press('n');
  await expect(dialog(page, 'bind')).toContainText('Press the key to bind…');
  await page.keyboard.press('F5');
  await expect(dialog(page, 'bind')).toHaveCount(0);
  await expect(body(page)).toBeFocused();
  await page.keyboard.type('draw');
  expect(await listText(page)).toEqual(['F1 | one', 'F5 | draw', '+ New macro']);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(listFlash(page)).toHaveText('Saved default.');
  expect(await stored(page)).toBe('#action {orc} {kill orc}\n#macro {F1} {one}\n#macro {F5} {draw}\n');
  expect(errors).toEqual([]);
});

test('macro key capture: F5 binds, Ctrl+W is rejected, Esc cancels a new entry', async ({ page }) => {
  await openFromStart(page, '#macro {F1} {one}\n');
  await kind(page, 'macro');
  await page.keyboard.press('n');
  const bind = dialog(page, 'bind');
  await expect(bind).toContainText('Press the key to bind…');
  await expect(bind).toContainText('For the new macro.');
  await page.keyboard.press('Control+w');
  await expect(bind.locator('.wc-lk-dialog-err')).toHaveText('The browser keeps that key.');
  await page.keyboard.press('Enter');
  await expect(bind.locator('.wc-lk-dialog-err')).toHaveText('Enter sends the input line.');
  await page.keyboard.press('F5');
  await expect(bind).toHaveCount(0);
  await expect(flash(page)).toHaveText('Bound to F5.');
  await expect(keyCell(page)).toHaveText('F5');
  await expect(body(page)).toBeFocused();
  await page.keyboard.type('draw');
  expect(await listText(page)).toEqual(['F1 | one', 'F5 | draw', '+ New macro']);

  // A key the input line uses warns under the detail; Enter on the Key cell captures again.
  await page.keyboard.press('Shift+Tab');
  await expect(keyCell(page)).toHaveClass(/is-sel/);
  await page.keyboard.press('Enter');
  await expect(bind).toContainText('For the macro on F5.');
  await page.keyboard.press('Control+a');
  await expect(keyCell(page)).toHaveText('Ctrl+a');
  await expect(pe(page).locator('.wc-pe-warn')).toContainText('Ctrl+a overrides the input line');

  // The New row, then Esc in the capture: the new entry is gone again.
  await page.keyboard.press('Escape');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(bind).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bind).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');

  await page.keyboard.press('Escape');
  await expect(listFlash(page)).toHaveText('Saved default.');
  expect(await stored(page)).toBe('#macro {F1} {one}\n#macro {Ctrl+A} {draw}\n');
});

test('macro key capture: printable keys bind and warn (ADR 0026)', async ({ page }) => {
  await openFromStart(page, '#macro {F1} {one}\n');
  await kind(page, 'macro');
  await page.keyboard.press('n');
  const bind = dialog(page, 'bind');
  await expect(bind).toBeVisible();
  await page.keyboard.press('a');
  await expect(bind).toHaveCount(0);
  await expect(flash(page)).toHaveText('Bound to a.');
  await expect(keyCell(page)).toHaveText('a');
  await expect(pe(page).locator('.wc-pe-warn')).toHaveText('a overrides the input line (types text).');
  await page.keyboard.type('two');

  // The New row, Shift+1.
  await page.keyboard.press('Escape');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(bind).toBeVisible();
  await page.keyboard.press('Shift+Digit1');
  await expect(bind).toHaveCount(0);
  await expect(keyCell(page)).toHaveText('Shift+1');
  await expect(pe(page).locator('.wc-pe-warn')).toHaveText('Shift+1 overrides the input line (types text).');
  await page.keyboard.type('three');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(listFlash(page)).toHaveText('Saved default.');
  expect(await stored(page)).toBe('#macro {F1} {one}\n#macro {A} {two}\n#macro {Shift+1} {three}\n');
});

test('highlight picker: styles, text and background swatches, Shows as', async ({ page }) => {
  await openFromStart(page, '#highlight {bold one} {bold red}\n');
  await kind(page, 'highlight');
  // A body the picker cannot read shows nothing chosen, says so, and stays verbatim.
  await page.keyboard.press('Enter');
  await expect(pattern(page)).toBeFocused();
  await expect(pe(page).locator('.wc-pe-sw.is-on')).toHaveCount(0);
  await expect(pe(page).locator('.wc-pe-verb')).toContainText('Kept as written: bold red.');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(listHood(page)).toHaveText('Profiles');

  await page.locator('.wc-start [data-btn="EDIT"]').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await morphDone(page);
  await kind(page, 'highlight');
  await page.keyboard.press('n');
  await page.keyboard.type('^%1 enters');
  await page.keyboard.press('Tab'); // Style
  await expect(pe(page).locator('.wc-pe-style.is-sel')).toHaveAttribute('data-style', 'underscore');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); // reverse
  await expect(pe(page).locator('[data-style="reverse"] [role="checkbox"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Tab'); // Text
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); // green (dark)
  await page.keyboard.press('Tab'); // Background
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); // bright red
  await expect(pe(page).locator('.wc-pe-sw.is-on')).toHaveCount(2);
  await expect(rows(page).nth(1)).toContainText('reverse green b Red');
  await expect(pe(page).locator('.wc-pe-shows .wc-pe-sample')).toHaveText('… enters');
  // A click on a chosen swatch clears it.
  await pe(page).locator('[data-swatch="bg-0-1"]').click();
  await expect(rows(page).nth(1)).toContainText('reverse green');
  await expect(pe(page).locator('.wc-pe-sw.is-on')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(listFlash(page)).toHaveText('Saved default.');
  expect(await stored(page)).toBe('#highlight {bold one} {bold red}\n#highlight {^%1 enters} {reverse green}\n');
});

test('Esc in a field leaves the field first; the status says what is applied', async ({ page }) => {
  await openFromStart(page, '#alias {a} {b}\n#alias {gv} {x}\n');
  await kind(page, 'alias');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(pattern(page)).toBeFocused();
  await expect(pe(page)).toHaveAttribute('data-zone', 'detail');
  // ↓ (or Enter) to Commands; an unbalanced body is flagged and held back.
  await page.keyboard.press('ArrowDown');
  await expect(body(page)).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(' {');
  await expect(pe(page).locator('.wc-pe-msg')).toHaveText('Unbalanced braces in Commands');
  await expect(status(page)).toHaveText('Editing');
  await page.keyboard.press('Escape');
  await expect(body(page)).not.toBeFocused();
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await expect(flash(page)).toHaveText('Not applied: Unbalanced braces in Commands (alias gv)');
  await expect(status(page)).toHaveText('Not applied');
  await expect(curRow(page).locator('.wc-pe-flag.is-bad')).toHaveCount(1);
  expect(await stored(page)).toBe('#alias {a} {b}\n#alias {gv} {x}\n');
  // Not live: Esc then asks only because nothing could be saved.
  await page.keyboard.press('Escape');
  const held = dialog(page, 'not-applied');
  await expect(held).toContainText('Not applied: Unbalanced braces in Commands (alias gv)');
  await page.keyboard.press('Escape'); // keep editing
  await expect(held).toHaveCount(0);
  await expect(pe(page)).toBeVisible();
  // ← at the start of a field goes back to the list; Ctrl+S tries again.
  await page.keyboard.press('ArrowRight');
  await expect(pattern(page)).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await page.keyboard.press('Escape');
  await page.keyboard.press('n'); // discard
  await expect(listHood(page)).toHaveText('Profiles');
  expect(await stored(page)).toBe('#alias {a} {b}\n#alias {gv} {x}\n');
});

test('the mouse: a click moves between the fields; a click elsewhere applies', async ({ page }) => {
  await openFromStart(page, '#alias {a} {b}\n');
  await kind(page, 'alias');
  await pattern(page).click();
  await expect(pattern(page)).toBeFocused();
  await expect(pe(page)).toHaveAttribute('data-zone', 'detail');
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await body(page).click();
  await expect(body(page)).toBeFocused();
  await page.keyboard.type('y');
  await pattern(page).click();
  await expect(pattern(page)).toBeFocused();
  await expect.poll(() => stored(page)).toBe('#alias {ax} {by}\n');
  // A click on a kind leaves the field.
  await pe(page).locator('[data-rail="action"]').click();
  await expect(pattern(page)).toBeHidden();
  await expect(pe(page)).toHaveAttribute('data-zone', 'rail');
  await expect(pe(page).locator('input:focus, textarea:focus')).toHaveCount(0);
});

test('the Profile window while disconnected saves directly', async ({ page }) => {
  const errors = watchErrors(page);
  await openWindow(page, '#alias {a} {b}\n', true);
  await expect(pe(page).locator('.wc-pe-live')).toHaveText('Not connected · changes are saved');
  await kind(page, 'alias');
  await page.keyboard.press('n');
  await page.keyboard.type('x');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Saved, and the Profile window (ADR 0103) closes with the editor.
  await expect(page.locator('.wc-win[data-win="profile"]')).toHaveCount(0);
  expect(await stored(page)).toBe('#alias {a} {b}\n#alias {x} {}\n');
  expect(errors).toEqual([]);
});

test('the Profile window while connected: Lite applies in place, Editor asks: Keep editing, Discard, Apply', async ({ page }) => {
  await openWindow(page, '#alias {a} {b}\n');
  await expect(pe(page).locator('.wc-pe-live')).toHaveText('Connected · changes apply to the game');
  await expect(status(page)).toHaveText('All applied');
  const win = page.locator('.wc-win[data-win="profile"]');
  const field = page.locator('.wc-input-field');

  // Clean: Esc leaves silently and the window closes.
  await page.keyboard.press('Escape');
  await expect(win).toHaveCount(0);
  await expect(field).toBeFocused();

  const reopen = async () => {
    await field.fill('#profile');
    await page.keyboard.press('Enter');
    await expect(pe(page)).toBeVisible();
  };
  // Lite: leaving the field applies (ADR 0105).
  await reopen();
  await kind(page, 'alias');
  await page.keyboard.press('n');
  await page.keyboard.type('y');
  await page.keyboard.press('Escape');
  await expect(flash(page)).toHaveText('Applied');
  await expect.poll(() => stored(page)).toBe('#alias {a} {b}\n#alias {y} {}\n');

  // Editor: an edit stays unapplied until Ctrl+S; Esc asks.
  await page.keyboard.press('e');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('#alias {w} {x}');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const ask = dialog(page, 'apply');
  await expect(ask).toContainText('Apply changes to your profile?');
  await page.keyboard.press('Escape'); // keep editing
  await expect(ask).toHaveCount(0);
  await expect(pe(page)).toHaveAttribute('data-view', 'editor');
  await page.keyboard.press('Escape');
  await page.keyboard.press('n'); // discard
  await expect(win).toHaveCount(0);
  expect(await stored(page)).toBe('#alias {a} {b}\n#alias {y} {}\n');

  await reopen();
  await page.keyboard.press('e');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('#alias {z} {}');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(ask).toBeVisible();
  await page.keyboard.press('y');
  // Apply swaps the live rule set, then saves; the window closes.
  await expect(win).toHaveCount(0);
  await expect.poll(() => stored(page)).toBe('#alias {a} {b}\n#alias {y} {}\n#alias {z} {}');
  expect(await page.evaluate(() => window.__wc!.app.script.user.plainAlias('z') !== undefined)).toBe(true);
});

test('Editor keys: line swap, undo, copy line, the Tab ring, ← on the views flips', async ({ page }) => {
  await openFromStart(page, 'one\ntwo\nthree\n');
  await page.keyboard.press('e');
  await expect(pe(page)).toHaveAttribute('data-zone', 'buffer');
  await page.keyboard.press('ArrowDown');
  await expect(status(page)).toContainText('Ln 2, Col 1');
  await page.keyboard.press('Alt+ArrowUp');
  expect(await bufferText(page)).toBe('two\none\nthree\n');
  await expect(status(page)).toContainText('Ln 1, Col 1');
  await page.keyboard.press('Control+z');
  expect(await bufferText(page)).toBe('one\ntwo\nthree\n');
  await page.keyboard.type('x');
  expect(await bufferText(page)).toBe('one\nxtwo\nthree\n');
  await page.keyboard.press('Control+z');
  expect(await bufferText(page)).toBe('one\ntwo\nthree\n');
  await page.keyboard.press('Control+y');
  expect(await bufferText(page)).toBe('one\nxtwo\nthree\n');
  // Ctrl+C with no selection copies the line.
  await page.keyboard.press('Control+c');
  await expect(flash(page)).toHaveText('Copied');
  await page.keyboard.press('Control+x');
  await expect(flash(page)).toHaveText('Cut');
  expect(await bufferText(page)).toBe('one\nthree\n');
  // Tab never inserts a tab: buffer → views → rail → buffer.
  await page.keyboard.press('Tab');
  await expect(pe(page)).toHaveAttribute('data-zone', 'views');
  await expect(views(page, 'editor')).toHaveClass(/is-sel/);
  await page.keyboard.press('Tab');
  await expect(pe(page)).toHaveAttribute('data-zone', 'rail');
  await page.keyboard.press('Tab');
  await expect(pe(page)).toHaveAttribute('data-zone', 'buffer');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(pe(page)).toHaveAttribute('data-zone', 'views');
  // ← on the views flips to Lite; the edited text is parsed back and saved (ADR 0105).
  await page.keyboard.press('ArrowLeft');
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await expect(pe(page)).toHaveAttribute('data-zone', 'views');
  await expect.poll(() => stored(page)).toBe('one\nthree\n');
  await page.keyboard.press('Escape');
  await expect(listFlash(page)).toHaveText('Saved default.');
});

test('Editor rail: the text sections in order; a click puts the line at the top and the cursor on it', async ({ page }) => {
  const errors = watchErrors(page);
  const text = '#nop {Gibur, a warrior.}\n\n#variable {t} {orc}\n\n#nop ---- actions ----\n#action {x} {y}\n\n#alias {a} {b}\n#ticker {t} {score} {60}\n';
  await openFromStart(page, text);
  await page.keyboard.press('e');
  const items = pe(page).locator('[data-rail="text"]');
  await expect(items).toHaveText([/Gibur, a warrior\.\s*1/, /Variables\s*3/, /Actions\s*5/, /Aliases\s*8/, /Timers & events\s*9/]);
  await items.filter({ hasText: 'Aliases' }).click();
  await expect(status(page)).toContainText('Ln 8, Col 1');
  await expect(pe(page)).toHaveAttribute('data-zone', 'buffer');
  await expect(items.filter({ hasText: 'Aliases' })).toHaveClass(/is-on/);
  // Typing a new kind adds its section after a rest (debounced).
  await page.keyboard.press('Control+End');
  await page.keyboard.type('#macro {F1} {bash}\n');
  await expect(items.filter({ hasText: 'Macros' })).toHaveText(/Macros\s*10/);
  // The rail's keys: Esc to the rail, ↑ to a section, Enter jumps there.
  await page.keyboard.press('Escape');
  await expect(pe(page)).toHaveAttribute('data-zone', 'rail');
  await page.keyboard.press('Home');
  await expect(items.first()).toHaveClass(/is-cur/);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(status(page)).toContainText('Ln 3, Col 1');
  await expect(pe(page)).toHaveAttribute('data-zone', 'buffer');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- Help

test('Help from the start page: the manual, its headings in the rail, n / p, and back to Lite with edits intact', async ({ page }) => {
  const errors = watchErrors(page);
  await openFromStart(page, '#alias {b} {bee}\n#macro {F1} {one}\n');
  await expect(pe(page).locator('.wc-pe-views [role="radio"]')).toHaveText(['Lite', 'Editor', 'Help']);
  await kind(page, 'alias');
  await page.keyboard.press('n');
  await page.keyboard.type('gv %1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('get %1');
  // H is text in the field: Esc first, then H.
  await page.keyboard.press('Escape');
  await page.keyboard.press('h');
  await expect(pe(page)).toHaveAttribute('data-view', 'help');
  await expect(pe(page)).toHaveAttribute('data-mode', 'lite');
  await expect(pe(page)).toHaveAttribute('data-zone', 'help');
  await expect(pe(page).locator('.wc-pe-list')).toHaveCount(0);
  await expect(pe(page).locator('.wc-lk-mtext section').first()).toContainText('Writing a profile');
  await expect(railSection(page)).toHaveText('Writing a profile');
  // n / p walk the headings; the rail follows.
  await page.keyboard.press('n');
  await expect(railSection(page)).toHaveText('Braces and ;');
  await page.keyboard.press('p');
  await expect(railSection(page)).toHaveText('Writing a profile');
  // A click in the rail goes there.
  await pe(page).locator('.wc-lk-mtoc li', { hasText: /^#action$/ }).click();
  await expect(railSection(page)).toHaveText('#action');
  await expect(pe(page).locator('.wc-lk-mtext section h3', { hasText: /^#action$/ })).toBeInViewport();
  // The rail's keys: ← from the manual, ↓ the next section, → back to the text.
  await expect(pe(page)).toHaveAttribute('data-zone', 'help');
  await page.keyboard.press('ArrowLeft');
  await expect(pe(page)).toHaveAttribute('data-zone', 'rail');
  await expect(pe(page).locator('.wc-lk-mtoc')).toHaveClass(/is-zone/);
  await page.keyboard.press('ArrowDown');
  await expect(railSection(page)).toHaveText('#alias');
  await page.keyboard.press('ArrowRight');
  await expect(pe(page)).toHaveAttribute('data-zone', 'help');
  // L: back to Lite, the edit is still there.
  await page.keyboard.press('l');
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  expect(await listText(page)).toEqual(['b | bee', 'gv %1 | get %1', '+ New alias']);
  await page.keyboard.press('h');
  await expect(railSection(page)).toHaveText('#alias');
  await page.keyboard.press('Escape');
  await expect(listFlash(page)).toHaveText('Saved default.');
  expect(await stored(page)).toBe('#alias {b} {bee}\n#alias {gv %1} {get %1}\n#macro {F1} {one}\n');
  expect(errors).toEqual([]);
});

test('Help keeps the Editor buffer: text, cursor and undo history', async ({ page }) => {
  await openFromStart(page, 'one\ntwo\nthree\n');
  await page.keyboard.press('e');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('x');
  await expect(status(page)).toContainText('Ln 2, Col 2');
  await toHelp(page);
  await expect(content(page)).toBeHidden();
  await views(page, 'editor').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'editor');
  await expect(content(page)).toBeVisible();
  expect(await bufferText(page)).toBe('one\nxtwo\nthree\n');
  await expect(status(page)).toContainText('Ln 2, Col 2');
  await expect(pe(page)).toHaveAttribute('data-zone', 'buffer');
  await page.keyboard.press('Control+z');
  expect(await bufferText(page)).toBe('one\ntwo\nthree\n');
  // Unchanged again: Esc from Help pops without saving.
  await toHelp(page);
  await page.keyboard.press('Escape');
  await expect(listHood(page)).toHaveText('Profiles');
  expect(await stored(page)).toBe('one\ntwo\nthree\n');
});

test('the Profile window → Help while connected: Lite applies on the way, Editor asks', async ({ page }) => {
  await openWindow(page, '#alias {a} {b}\n');
  await kind(page, 'alias');
  await page.keyboard.press('n');
  await page.keyboard.type('z');
  // Leaving the field for Help applies the new alias (ADR 0105).
  await toHelp(page);
  await expect.poll(() => stored(page)).toBe('#alias {a} {b}\n#alias {z} {}\n');
  await pe(page).locator('.wc-lk-mtoc li', { hasText: /^#action$/ }).click();
  await expect(railSection(page)).toHaveText('#action');
  // The manual fits the window.
  const box = (await page.locator('.wc-win[data-win="profile"] .wc-win-body').boundingBox())!;
  const man = (await pe(page).locator('.wc-lk-manual').boundingBox())!;
  expect(man.x + man.width).toBeLessThanOrEqual(box.x + box.width + 1);

  // An Editor edit stays unapplied over Help: Esc there asks.
  await views(page, 'editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('#alias {w} {x}');
  await views(page, 'help').click();
  await expect(railSection(page)).toHaveText('#action');
  const ask = dialog(page, 'apply');
  await page.keyboard.press('Escape');
  await expect(ask).toContainText('Apply changes to your profile?');
  await page.keyboard.press('Escape'); // keep editing: still in Help, where it was
  await expect(ask).toHaveCount(0);
  await expect(pe(page)).toHaveAttribute('data-view', 'help');
  await expect(railSection(page)).toHaveText('#action');
  await page.keyboard.press('Escape');
  await page.keyboard.press('y');
  await expect(page.locator('.wc-win[data-win="profile"]')).toHaveCount(0);
  await expect.poll(() => stored(page)).toBe('#alias {a} {b}\n#alias {z} {}\n#alias {w} {x}');
});

// ------------------------------------------------- layouts (ADR 0128)

test('wide: rail | list | detail; Commands takes the height; the warning sits under it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 800 });
  await openFromStart(page, '#alias {gv %1} {get %1;value %1}\n#macro {Ctrl+a} {score}\n');
  await expect(pe(page)).toHaveAttribute('data-layout', 'wide');
  await kind(page, 'alias');
  const rail = (await pe(page).locator('.wc-pe-rail').boundingBox())!;
  const list = (await pe(page).locator('.wc-pe-list').boundingBox())!;
  const detail = (await pe(page).locator('.wc-pe-detail').boundingBox())!;
  expect(rail.x + rail.width).toBeLessThanOrEqual(list.x);
  expect(list.x + list.width).toBeLessThanOrEqual(detail.x);
  expect(Math.abs(rail.y - list.y)).toBeLessThan(4);
  const bodyBox = (await body(page).boundingBox())!;
  expect(bodyBox.height).toBeGreaterThan(300);
  // No key-hint rows anywhere.
  await expect(pe(page)).not.toContainText('Tab Cycle');
  await expect(pe(page)).not.toContainText('ESC Back');
  await kind(page, 'macro');
  const warn = pe(page).locator('.wc-pe-warn');
  await expect(warn).toHaveText('Ctrl+a overrides the input line (selects all).');
  const b = (await body(page).boundingBox())!;
  expect((await warn.boundingBox())!.y).toBeGreaterThanOrEqual(b.y + b.height);
  await expect(pe(page).locator('.wc-pe-row.is-on .wc-pe-kc')).toHaveText('Ctrl+a');
  expect(errors).toEqual([]);
});

test('narrower: the rail becomes a row; then one column, the entry opens as a sheet', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 900, height: 760 });
  await openFromStart(page, '#alias {gv %1} {get %1;value %1}\n#alias {k} {kill}\n');
  await expect(pe(page)).toHaveAttribute('data-layout', 'mid');
  const rail = (await pe(page).locator('.wc-pe-rail').boundingBox())!;
  const list = (await pe(page).locator('.wc-pe-list').boundingBox())!;
  expect(rail.y + rail.height).toBeLessThanOrEqual(list.y + 1);
  // The row's keys: ← → switch the kind, ↓ goes to the list.
  await pe(page).locator('[data-rail="action"]').click();
  await page.keyboard.press('ArrowRight');
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await page.keyboard.press('ArrowDown');
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await expect(pe(page).locator('.wc-pe-detail')).toBeVisible();

  await page.setViewportSize({ width: 560, height: 760 });
  await expect(pe(page)).toHaveAttribute('data-layout', 'narrow');
  await expect(pe(page).locator('.wc-pe-detail')).toBeHidden();
  // Enter opens the entry as a sheet over the list, with the kind's back button.
  await page.keyboard.press('Enter');
  await expect(pe(page)).toHaveClass(/is-sheet/);
  await expect(pattern(page)).toBeFocused();
  await expect(pe(page).locator('.wc-pe-list')).toBeHidden();
  const back = pe(page).locator('[data-btn="SHEET"]');
  await expect(back).toHaveText('Aliases');
  await back.click();
  await expect(pe(page)).not.toHaveClass(/is-sheet/);
  await expect(pe(page).locator('.wc-pe-list')).toBeVisible();
  // A tap (a click) on a row opens it in one column; Esc closes the sheet (and leaves the field).
  await rows(page).nth(1).click();
  await expect(pe(page)).toHaveClass(/is-sheet/);
  await expect(pattern(page)).toHaveValue('k');
  await page.keyboard.press('Escape');
  await expect(pe(page)).not.toHaveClass(/is-sheet/);
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  // Help in one column: the sections are a dropdown.
  await page.keyboard.press('h');
  await expect(pe(page).locator('.wc-pe-hsel select')).toBeVisible();
  await expect(pe(page).locator('.wc-lk-mtoc')).toBeHidden();
  await pe(page).locator('.wc-pe-hsel select').selectOption({ label: '#alias' });
  await expect(pe(page).locator('.wc-pe-hsel select')).toHaveValue(/\d+/);
  await expect(pe(page).locator('.wc-lk-mtext section h3', { hasText: /^#alias$/ })).toBeInViewport();
  expect(errors).toEqual([]);
});

test('Editor and Help fill the main column; Lite keeps the rail, the list and the detail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await openFromStart(page, Array.from({ length: 120 }, (_, i) => `#alias {a${i}} {say ${i}}`).join('\n') + '\n');
  const cols = (await pe(page).locator('.wc-pe-cols').boundingBox())!;
  await page.keyboard.press('e');
  const buf = (await pe(page).locator('.wc-pe-buf').boundingBox())!;
  expect(buf.x + buf.width).toBeCloseTo(cols.x + cols.width, 0);
  // The buffer scrolls natively (no TUI scrollbar).
  const scroller = pe(page).locator('.cm-scroller');
  await scroller.hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('h');
  const man = (await pe(page).locator('.wc-lk-manual').boundingBox())!;
  expect(man.x + man.width).toBeCloseTo(cols.x + cols.width, 0);
});

test('Lite list scrolls by pixels; the cursor stays in view; hover never moves it', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  const text = Array.from({ length: 40 }, (_, i) => `#action {goblin ${i}} {say hi ${i}}`).join('\n') + '\n';
  await openFromStart(page, text);
  const box = pe(page).locator('.wc-pe-list');
  const m = await box.evaluate((el) => ({ top: el.scrollTop, over: el.scrollHeight - el.clientHeight }));
  expect(m.over).toBeGreaterThan(0);
  await box.hover();
  await page.mouse.wheel(0, 5);
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(m.top);
  const first = await curRow(page).getAttribute('data-i');
  await rows(page).nth(3).hover();
  await expect(curRow(page)).toHaveAttribute('data-i', first!);
  // End: the cursor on the New row, pulled into view; Home back to the top.
  await page.keyboard.press('End');
  await expect(curRow(page)).toHaveAttribute('data-row', 'new');
  await expect(curRow(page)).toBeInViewport({ ratio: 0.9 });
  await page.keyboard.press('Home');
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBe(0);
  // A click selects a row; a second click on it opens it.
  await rows(page).nth(3).click();
  await expect(curRow(page)).toHaveAttribute('data-i', '3');
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await rows(page).nth(3).click();
  await expect(pattern(page)).toBeFocused();
});

test('Editor shows the whole stored text of the bundled khazdul profile', async ({ page }) => {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  // The seeded khazdul text, as a first run stores it, under the profile that Edit opens.
  const text = await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    const t = (await window.__wc!.shell.profiles.get('khazdul'))!.text;
    await window.__wc!.shell.profiles.save('default', t);
    return t;
  });
  expect(text).toContain('{_show_class}');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.locator('.wc-start [data-btn="EDIT"]').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await morphDone(page);

  // Lite lists the alias, leading underscore included.
  await kind(page, 'alias');
  const row = rows(page).filter({ has: page.locator('.wc-pe-pat', { hasText: /^_show_class$/ }) });
  await expect(row).toHaveCount(1);
  await row.click();
  await row.click();
  await expect(pattern(page)).toHaveValue('_show_class');

  // The buffer holds the stored text exactly (read from its state: only the lines in view are drawn).
  await page.keyboard.press('Escape');
  await page.keyboard.press('e');
  const state = await content(page).evaluate((el) => {
    type Held = { view?: { state: { doc: { toString(): string; lines: number } } } };
    const v = ((el as unknown as { cmTile?: Held; cmView?: Held }).cmTile ?? (el as unknown as { cmView?: Held }).cmView)?.view;
    return v ? { text: v.state.doc.toString(), lines: v.state.doc.lines } : null;
  });
  expect(state).not.toBeNull();
  expect(state!.text).toBe(text);
  // The rail lists the text's sections.
  await expect(pe(page).locator('[data-rail="text"]:not(.is-note)', { hasText: 'Aliases' })).toHaveCount(1);

  // Nothing was edited: Esc leaves the buffer, Esc pops without saving.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(listHood(page)).toHaveText('Profiles');
  expect(await stored(page)).toBe(text);
});

// ------------------------------------------- every character is visible

/**
 * How much of an underscore shows in characters `cols` of `loc`'s first
 * text: lit pixels in the lower part of the line (plus two pixels below
 * it), as a fraction of a character's width. Character 2 must be a letter
 * without a descender (the background sample). About 1 for a DejaVu `_`,
 * 0 when it is clipped or painted over (ADR 0037, ADR 0043). The rows sit
 * at fractional pixels in the new look, so a dim row's underscore is
 * anti-aliased over two pixel rows: a faint pixel counts (the threshold is
 * well above the background's noise).
 */
async function underscoreInk(page: Page, loc: Locator, cols: number[]): Promise<number[]> {
  const m = await loc.evaluate((el) => {
    const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!;
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 1);
    const c = r.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { x: c.left, w: c.width, y: b.top, h: b.height };
  });
  const n = Math.max(...cols, 2) + 1;
  const png = await page.screenshot({ clip: { x: m.x, y: m.y, width: m.w * n, height: m.h + 2 } });
  return page.evaluate(
    async ({ b64, cols, n, frac }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const cv = document.createElement('canvas');
      cv.width = bmp.width;
      cv.height = bmp.height;
      const g = cv.getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      const px = (x: number, y: number): number[] => [d[(y * cv.width + x) * 4]!, d[(y * cv.width + x) * 4 + 1]!, d[(y * cv.width + x) * 4 + 2]!];
      const diff = (p: number[], q: number[]): number => Math.abs(p[0]! - q[0]!) + Math.abs(p[1]! - q[1]!) + Math.abs(p[2]! - q[2]!);
      const cw = cv.width / n;
      const ch = cv.height * frac;
      const refX = Math.floor(2.5 * cw);
      return cols.map((col) => {
        let ink = 0;
        for (let y = Math.floor(ch * 0.55); y < cv.height; y++) {
          const bg = px(refX, y);
          for (let x = Math.floor(col * cw); x < Math.min(cv.width, Math.floor((col + 1) * cw)); x++) if (diff(px(x, y), bg) > 40) ink++;
        }
        return ink / cw;
      });
    },
    { b64: png.toString('base64'), cols, n, frac: m.h / (m.h + 2) },
  );
}

const UNDERSCORES = '#alias {_show_acontainer} {x}\n#alias {_show_class} {_hhhh_}\n#alias {_show_spell} {y}\n';

for (const dpr of [1, 1.5]) {
  dprTest.describe(`underscores at device pixel ratio ${dpr}`, () => {
    dprTest.use({ dpr });
    dprTest('every underscore shows in the Lite rows and the Editor lines, in both fonts', async ({ dprPage: page }) => {
      await openFromStart(page, UNDERSCORES);
      await expectDpr(page, dpr);
      await kind(page, 'alias');
      for (const [font, size] of [['dejavu', 15], ['dejavu', 10], ['jetbrains', 15]] as const) {
        await page.evaluate(([f, s]) => window.__wc!.settings.update({ appearance: { font: f as 'dejavu', size: s as number } }), [font, size] as const);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        // `_show_class`: underscores in characters 0 and 5; character 2 (`h`) is the background sample.
        for (const i of [0, 1, 2]) {
          // Polled: the rows re-lay out after a font change.
          await expect
            .poll(async () => Math.min(...(await underscoreInk(page, rows(page).nth(i).locator('.wc-pe-pat'), [0, 5]))), {
              message: `Lite row ${i}, ${font} ${size}`,
              timeout: 3000,
            })
            .toBeGreaterThan(0.5);
        }
      }
      await page.keyboard.press('e');
      const line = (n: number) => content(page).locator('.cm-line').nth(n);
      await expect(line(1)).toHaveText('#alias {_show_class} {_hhhh_}');
      // The cursor on the third line: its highlight is the background right below line 2.
      await line(2).click();
      await expect(line(2)).toHaveClass(/cm-activeLine/);
      for (const [font, size] of [['dejavu', 15], ['jetbrains', 15]] as const) {
        await page.evaluate(([f, s]) => window.__wc!.settings.update({ appearance: { font: f as 'dejavu', size: s as number } }), [font, size] as const);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        // `#alias {_show_class}`: underscores in characters 8 and 13; character 2 (`l`) is the background sample.
        await expect
          .poll(async () => Math.min(...(await underscoreInk(page, line(1), [8, 13]))), { message: `Editor line, ${font} ${size}`, timeout: 3000 })
          .toBeGreaterThan(0.5);
      }
    });
  });
}
