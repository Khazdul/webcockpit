// Stage 3 P3: the profile editor (lite + editor views) from the start page
// and the ESC menu, against a mocked MUME WebSocket.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';
import { dprTest, expectDpr } from './dpr';

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

const ped = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-ped');
const footer = (page: Page) => ped(page).locator('.wc-ped-footer');
const listRows = (page: Page) => ped(page).locator('.wc-ped-list .wc-tr');
const cursorRow = (page: Page) => ped(page).locator('.wc-ped-list .wc-tr.is-cur-focus, .wc-ped-list .wc-tr.is-cur');
const content = (page: Page) => ped(page).locator('.cm-content');
/** The buffer's text, line by line (the buffer is small, so every line is rendered). */
const bufferText = (page: Page) =>
  content(page).evaluate((el) => [...el.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));
const stored = (page: Page, name = 'default') =>
  page.evaluate((n) => window.__wc!.shell.profiles.get(n).then((r) => r?.text ?? null), name);

/** The hint area's warning, its wrapped lines joined. */
const warnText = (page: Page) =>
  ped(page)
    .locator('.wc-ped-warn')
    .allTextContents()
    .then((l) => l.map((x) => x.trim()).join(' '));

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Start page → Profile → EDIT on `default`. */
async function openFromStart(page: Page, text?: string): Promise<void> {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  if (text !== undefined) {
    await page.evaluate(async (t) => {
      await window.__wc!.shell.profiles.init();
      await window.__wc!.shell.profiles.save('default', t);
    }, text);
  }
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-title-row')).toHaveText('─── Profile ───');
  await page.locator('.wc-start [data-btn="EDIT"]').click();
  await expect(ped(page).locator('.wc-ped-title .wc-c-section')).toHaveText('─── Profile Editor: default ───');
  await expect(ped(page)).toHaveAttribute('data-mode', 'lite');
}

/** Selects a kind with the keyboard from the kind row and enters the list. */
async function kind(page: Page, name: string): Promise<void> {
  await ped(page).locator(`[data-kind="${name}"]`).first().click();
  await page.keyboard.press('ArrowDown');
  await expect(ped(page)).toHaveAttribute('data-zone', 'list');
}

async function toEditor(page: Page): Promise<void> {
  await ped(page).locator('[data-btn="EDITOR"]').click();
  await expect(ped(page)).toHaveAttribute('data-mode', 'editor');
  await expect(content(page)).toBeVisible();
}

test('lite → editor → lite → ESC saves; reload shows it', async ({ page }) => {
  const errors = watchErrors(page);
  await openFromStart(page, '#nop head\n\n#alias {b} {bee}\n#macro {F1} {one}\n');
  await kind(page, 'alias');
  await expect(listRows(page)).toHaveText([/^b\s+bee/, /\+ New entry/]);

  // n adds an entry and focuses Pattern; Tab goes to Commands.
  await page.keyboard.press('n');
  await expect(ped(page).locator('input[data-field="pattern"]')).toBeFocused();
  await page.keyboard.type('gv %1');
  await page.keyboard.press('Tab');
  await expect(ped(page).locator('textarea[data-field="body"]')).toBeFocused();
  await page.keyboard.type('get %1;');
  await page.keyboard.press('Enter');
  await page.keyboard.type('value %1');
  // New entries stay at the bottom of the list until a flip.
  await expect(listRows(page)).toHaveText([/^b\s+bee/, /^gv %1\s+get %1;…/, /\+ New entry/]);

  // Flip: the new alias sits after the last alias, the rest is untouched.
  await toEditor(page);
  await expect(content(page)).toContainText('#alias {gv %1} {    get %1;    value %1}');
  expect(await bufferText(page)).toBe(
    '#nop head\n\n#alias {b} {bee}\n#alias {gv %1} {\n    get %1;\n    value %1\n}\n#macro {F1} {one}\n',
  );
  await expect(footer(page)).toContainText('Ln 1, Col 1');

  // Edit the text: a new alias at the end, typed with auto-closed braces.
  await page.keyboard.press('Tab'); // toggle → buffer
  await expect(ped(page)).toHaveAttribute('data-zone', 'buffer');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('#alias {k');
  await page.keyboard.press('End');
  await page.keyboard.type(' {kill}');
  await expect(footer(page)).not.toContainText('unclosed');
  await page.keyboard.type(' {');
  await expect(footer(page)).not.toContainText('unclosed'); // auto-closed
  await page.keyboard.press('Backspace'); // removes the pair
  await page.keyboard.press('Backspace');
  await page.keyboard.type('{');
  await page.keyboard.press('Delete');
  await expect(footer(page)).toContainText('1 unclosed {');
  await page.keyboard.press('Backspace');
  await expect(footer(page)).not.toContainText('unclosed');
  await expect(footer(page)).toContainText('Ln 9, Col 18');

  // Back to lite: the list is re-read from the text.
  await ped(page).locator('[data-btn="LITE"]').click();
  await expect(ped(page)).toHaveAttribute('data-mode', 'lite');
  await kind(page, 'alias');
  await expect(listRows(page)).toHaveText([/^b\s+bee/, /^gv %1\s+get %1;…/, /^k\s+kill/, /\+ New entry/]);

  // ESC saves and flashes on the Profile frame.
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-flash')).toHaveText('Saved default.');
  const saved = '#nop head\n\n#alias {b} {bee}\n#alias {gv %1} {\n    get %1;\n    value %1\n}\n#macro {F1} {one}\n#alias {k} {kill}';
  expect(await stored(page)).toBe(saved);
  await page.reload();
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  expect(await stored(page)).toBe(saved);
  expect(errors).toEqual([]);
});

test('a flip without edits keeps the text byte for byte', async ({ page }) => {
  const text = '#ACTION {x}\n{\n    say hi\n}\n\n#nop keep me\n#gag {spam}\n\n#lua {print(1)}\n#alias {a} {b} {7}\n';
  await openFromStart(page, text);
  await toEditor(page);
  await ped(page).locator('[data-btn="LITE"]').click();
  await toEditor(page);
  // The inert #lua is marked, with its hint on hover.
  await expect(ped(page).locator('.wc-syn-inert')).toHaveText('#lua');
  await expect(ped(page).locator('.wc-syn-inert')).toHaveAttribute('title', /do nothing in the browser/);
  await page.keyboard.press('Escape');
  // Nothing changed: pops without saving.
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-title-row')).toHaveText('─── Profile ───');
  expect(await stored(page)).toBe(text);
});

test('macro key capture: F5 binds, Ctrl+W is rejected, ESC cancels a new entry', async ({ page }) => {
  await openFromStart(page, '#macro {F1} {one}\n');
  await kind(page, 'macro');
  await page.keyboard.press('n');
  const overlay = ped(page).locator('.wc-ped-overlay');
  await expect(overlay).toContainText('Press the key to bind…');
  await page.keyboard.press('Control+w');
  await expect(overlay.locator('.wc-ped-capture-error')).toHaveText('The browser keeps that key.');
  await page.keyboard.press('F5');
  await expect(overlay).toHaveCount(0);
  await expect(footer(page)).toHaveText('Bound to F5.');
  await expect(ped(page).locator('[data-field="key"]')).toHaveText('[ F5 ]');
  await expect(ped(page).locator('textarea[data-field="body"]')).toBeFocused();
  await page.keyboard.type('draw');
  await expect(listRows(page)).toHaveText([/^F1\s+one/, /^F5\s+draw/, /\+ New entry/]);

  // A key the input line uses warns in the hint area.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+a');
  await expect(ped(page).locator('[data-field="key"]')).toHaveText('[ Ctrl+a ]');
  await expect(ped(page).locator('.wc-ped-warn').first()).toContainText('Ctrl+a overrides the input line');

  // + New entry, then ESC: the entry is gone again.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(overlay).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
  await expect(listRows(page)).toHaveCount(3);

  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-flash')).toHaveText('Saved default.');
  expect(await stored(page)).toBe('#macro {F1} {one}\n#macro {Ctrl+A} {draw}\n');
});

test('macro key capture: printable keys bind and warn (ADR 0026)', async ({ page }) => {
  await openFromStart(page, '#macro {F1} {one}\n');
  await kind(page, 'macro');
  await page.keyboard.press('n');
  const overlay = ped(page).locator('.wc-ped-overlay');
  await expect(overlay).toContainText('Press the key to bind…');
  await page.keyboard.press('a');
  await expect(overlay).toHaveCount(0);
  await expect(footer(page)).toHaveText('Bound to a.');
  await expect(ped(page).locator('[data-field="key"]')).toHaveText('[ a ]');
  await expect.poll(() => warnText(page)).toBe('a overrides the input line (types text).');
  await page.keyboard.type('two');

  // + New entry, Shift+1.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(overlay).toBeVisible();
  await page.keyboard.press('Shift+Digit1');
  await expect(overlay).toHaveCount(0);
  await expect(ped(page).locator('[data-field="key"]')).toHaveText('[ Shift+1 ]');
  await expect.poll(() => warnText(page)).toBe('Shift+1 overrides the input line (types text).');
  await page.keyboard.type('three');

  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-flash')).toHaveText('Saved default.');
  expect(await stored(page)).toBe('#macro {F1} {one}\n#macro {A} {two}\n#macro {Shift+1} {three}\n');
});

test('highlight picker: styles, text and background swatches', async ({ page }) => {
  await openFromStart(page, '#highlight {bold one} {bold red}\n');
  await kind(page, 'highlight');
  // An unparseable body shows nothing selected and stays verbatim.
  await page.keyboard.press('Enter');
  await expect(ped(page).locator('.wc-ped-sw.is-on')).toHaveCount(0);
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-title-row')).toHaveText('─── Profile ───');

  await page.locator('.wc-start [data-btn="EDIT"]').click();
  await kind(page, 'highlight');
  await page.keyboard.press('n');
  await page.keyboard.type('^%1 enters');
  await page.keyboard.press('Tab'); // Style
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); // reverse
  await page.keyboard.press('Tab'); // Text
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); // green (dark)
  await page.keyboard.press('Tab'); // BG
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); // bright red
  await expect(ped(page).locator('.wc-ped-sw.is-on')).toHaveCount(3);
  await expect(listRows(page).nth(1)).toContainText('reverse green b Red');
  // Clicking a selected swatch clears it.
  await ped(page).locator('[data-swatch="bg-0-1"]').click();
  await expect(listRows(page).nth(1)).toContainText('reverse green');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-flash')).toHaveText('Saved default.');
  expect(await stored(page)).toBe('#highlight {bold one} {bold red}\n#highlight {^%1 enters} {reverse green}\n');
});

test('ESC menu → Profile while disconnected saves directly', async ({ page }) => {
  const errors = watchErrors(page);
  const mock = await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', '#alias {a} {b}\n');
  });
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await mock.server()!.close();
  const menuSel = page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow.is-sel');
  await expect(menuSel).toHaveText('<< Reconnect >>');
  await page.locator('.wc-overlay .wc-mrow[data-key="profile"] .wc-label').click();
  await expect(ped(page).locator('.wc-ped-title .wc-c-section')).toHaveText('─── Profile Editor: default ───');
  await kind(page, 'alias');
  await page.keyboard.press('n');
  await page.keyboard.type('x');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-flash')).toHaveText('Saved default.');
  expect(await stored(page)).toBe('#alias {a} {b}\n#alias {x} {}\n');
  expect(errors).toEqual([]);
});

test('ESC menu → Profile while connected: Keep editing, Discard, Apply', async ({ page }) => {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', '#alias {a} {b}\n');
  });
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="profile"] .wc-label').click();
  await expect(ped(page)).toBeVisible();

  // Clean: ESC pops silently.
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow.is-sel')).toBeVisible();

  const modal = () => ped(page).locator('.wc-ped-overlay');
  await page.locator('.wc-overlay .wc-mrow[data-key="profile"] .wc-label').click();
  await kind(page, 'alias');
  await page.keyboard.press('n');
  await page.keyboard.type('y');
  await page.keyboard.press('Escape');
  await expect(modal()).toContainText('Apply changes to your profile?');
  await page.keyboard.press('Escape'); // keep editing
  await expect(modal()).toHaveCount(0);
  await expect(ped(page).locator('input[data-field="pattern"]')).toHaveValue('y');
  await page.keyboard.press('Escape');
  await page.keyboard.press('n'); // discard
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow.is-sel')).toBeVisible();
  expect(await stored(page)).toBe('#alias {a} {b}\n');

  await page.locator('.wc-overlay .wc-mrow[data-key="profile"] .wc-label').click();
  await kind(page, 'alias');
  await page.keyboard.press('n');
  await page.keyboard.type('z');
  await page.keyboard.press('Escape');
  await page.keyboard.press('y');
  // Apply swaps the live rule set, then saves.
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-flash')).toHaveText('Profile updated.');
  expect(await stored(page)).toBe('#alias {a} {b}\n#alias {z} {}\n');
  expect(await page.evaluate(() => window.__wc!.app.script.user.plainAlias('z') !== undefined)).toBe(true);
});

test('editor keys: line swap, undo, copy line, Tab and ↑ to the toggle', async ({ page }) => {
  await openFromStart(page, 'one\ntwo\nthree\n');
  await toEditor(page);
  await page.keyboard.press('Tab');
  await expect(ped(page)).toHaveAttribute('data-zone', 'buffer');
  await page.keyboard.press('ArrowDown');
  await expect(footer(page)).toContainText('Ln 2, Col 1');
  await page.keyboard.press('Alt+ArrowUp');
  expect(await bufferText(page)).toBe('two\none\nthree\n');
  await expect(footer(page)).toContainText('Ln 1, Col 1');
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
  await expect(footer(page)).toContainText('Copied');
  await page.keyboard.press('Control+x');
  await expect(footer(page)).toContainText('Cut');
  expect(await bufferText(page)).toBe('one\nthree\n');
  // Tab never inserts a tab: it moves to the toggle, and back.
  await page.keyboard.press('Tab');
  await expect(ped(page)).toHaveAttribute('data-zone', 'toggle');
  await page.keyboard.press('Tab');
  await expect(ped(page)).toHaveAttribute('data-zone', 'buffer');
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowUp');
  await expect(ped(page)).toHaveAttribute('data-zone', 'toggle');
  // ← on the toggle flips to LITE; the edited text is parsed back.
  await page.keyboard.press('ArrowLeft');
  await expect(ped(page)).toHaveAttribute('data-mode', 'lite');
  await page.keyboard.press('Escape');
  expect(await stored(page)).toBe('one\nthree\n');
});

// ---------------------------------------------------------------- HELP view

const helpRows = (page: Page) => ped(page).locator('.wc-ped-help .wc-ped-help-text');
const helpTopRow = (page: Page) => helpRows(page).first();
const helpMenu = (page: Page) => ped(page).locator('.wc-ped-menu');
const menuEntries = (page: Page) => helpMenu(page).locator('.wc-tr');
const menuEntry = (page: Page, heading: string) => helpMenu(page).locator(`.wc-tr[data-section="${heading}"]`);
const menuCurrent = (page: Page) => helpMenu(page).locator('.wc-tr.is-cur, .wc-tr.is-cur-focus');

async function toHelp(page: Page): Promise<void> {
  await ped(page).locator('[data-btn="HELP"]').click();
  await expect(ped(page)).toHaveAttribute('data-view', 'help');
  await expect(helpTopRow(page)).toHaveText('Writing a profile');
}

/** Presses `n` until the manual's top row is `heading`. */
async function jumpToHeading(page: Page, heading: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const top = (await helpTopRow(page).textContent())!;
    if (top === heading) break;
    await page.keyboard.press('n');
    await expect(helpTopRow(page)).not.toHaveText(top);
  }
  await expect(helpTopRow(page)).toHaveText(heading);
}

test('HELP from the start page: manual, scrolling, and back to LITE with edits intact', async ({ page }) => {
  const errors = watchErrors(page);
  await openFromStart(page, '#alias {b} {bee}\n#macro {F1} {one}\n');
  await expect(ped(page).locator('.wc-ped-toggle .wc-btn')).toHaveText([' LITE ', ' EDITOR ', ' HELP ']);
  await kind(page, 'alias');
  await page.keyboard.press('n');
  await page.keyboard.type('gv %1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('get %1');

  await toHelp(page);
  await expect(ped(page)).toHaveAttribute('data-mode', 'lite');
  await expect(ped(page)).toHaveAttribute('data-zone', 'toggle');
  await expect(ped(page).locator('[data-btn="HELP"]')).toHaveClass(/is-sel-focus/);
  await expect(footer(page)).toContainText('n/p Heading');
  await expect(ped(page).locator('.wc-ped-list')).toHaveCount(0);

  // Tab goes to the menu and on to the manual; n jumps from heading to heading.
  await page.keyboard.press('Tab');
  await expect(ped(page)).toHaveAttribute('data-zone', 'menu');
  await page.keyboard.press('Tab');
  await expect(ped(page)).toHaveAttribute('data-zone', 'help');
  await jumpToHeading(page, '#action');
  await expect(ped(page).locator('.wc-ped-help [data-kind="heading"]').first()).toHaveClass(/wc-line/);
  await expect(helpRows(page).nth(1)).toHaveText('#action {pattern} {commands} {priority}');
  await expect(ped(page).locator('.wc-ped-help [data-kind="code"] .wc-syn-cmd').first()).toHaveText('#action');
  await page.keyboard.press('n');
  await expect(helpTopRow(page)).toHaveText('#alias');
  await page.keyboard.press('p');
  await expect(helpTopRow(page)).toHaveText('#action');

  // ↓ ↑ one row, PgDn / PgUp a page, the wheel three rows, End / Home the ends.
  const second = await helpRows(page).nth(1).textContent();
  await page.keyboard.press('ArrowDown');
  await expect(helpTopRow(page)).toHaveText(second!);
  await page.keyboard.press('ArrowUp');
  await expect(helpTopRow(page)).toHaveText('#action');
  await page.keyboard.press('PageDown');
  await expect(helpTopRow(page)).not.toHaveText('#action');
  await page.keyboard.press('PageUp');
  await expect(helpTopRow(page)).toHaveText('#action');
  const fourth = await helpRows(page).nth(3).textContent();
  await ped(page).locator('.wc-ped-help').hover();
  await page.mouse.wheel(0, 100);
  await expect(helpTopRow(page)).toHaveText(fourth!);
  await page.keyboard.press('End');
  await expect(helpRows(page).last()).toContainText('on its line.');
  await expect(ped(page).locator('.wc-ped-help')).toContainText('#foreach');
  await page.keyboard.press('Home');
  await expect(helpTopRow(page)).toHaveText('Writing a profile');
  // The manual never names the deprecated helper (ADR 0036).
  await expect(ped(page).locator('.wc-ped-help')).not.toContainText('_send');
  // ↑ at the top leaves the manual for the toggle; Tab cycles back.
  await page.keyboard.press('ArrowUp');
  await expect(ped(page)).toHaveAttribute('data-zone', 'toggle');
  await page.keyboard.press('Shift+Tab');
  await expect(ped(page)).toHaveAttribute('data-zone', 'help');

  // Back to LITE with the mouse: the unsaved entry, its field and the kind are as they were.
  await ped(page).locator('[data-btn="LITE"]').click();
  await expect(ped(page)).toHaveAttribute('data-view', 'lite');
  await expect(listRows(page)).toHaveText([/^b\s+bee/, /^gv %1\s+get %1/, /\+ New entry/]);
  await expect(cursorRow(page)).toHaveText(/^gv %1/);
  await expect(ped(page).locator('input[data-field="pattern"]')).toHaveValue('gv %1');
  await expect(ped(page).locator('textarea[data-field="body"]')).toHaveValue('get %1');

  // With the keyboard the toggle walks LITE → EDITOR → HELP and back, flipping as usual.
  await page.keyboard.press('ArrowRight');
  await expect(ped(page)).toHaveAttribute('data-view', 'editor');
  await page.keyboard.press('ArrowRight');
  await expect(ped(page)).toHaveAttribute('data-view', 'help');
  await expect(ped(page)).toHaveAttribute('data-mode', 'editor');
  await page.keyboard.press('ArrowRight');
  await expect(ped(page)).toHaveAttribute('data-view', 'help');
  await page.keyboard.press('Enter');
  await expect(ped(page)).toHaveAttribute('data-zone', 'help');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowLeft');
  await expect(ped(page)).toHaveAttribute('data-view', 'editor');
  expect(await bufferText(page)).toBe('#alias {b} {bee}\n#alias {gv %1} {get %1}\n#macro {F1} {one}\n');
  await page.keyboard.press('ArrowLeft');
  await expect(ped(page)).toHaveAttribute('data-view', 'lite');

  // ESC in HELP saves and goes back, as in the other views.
  await toHelp(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-flash')).toHaveText('Saved default.');
  expect(await stored(page)).toBe('#alias {b} {bee}\n#alias {gv %1} {get %1}\n#macro {F1} {one}\n');
  expect(errors).toEqual([]);
});

test('HELP keeps the EDITOR buffer: text, cursor and undo history', async ({ page }) => {
  await openFromStart(page, 'one\ntwo\nthree\n');
  await toEditor(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('x');
  await expect(footer(page)).toContainText('Ln 2, Col 2');
  await toHelp(page);
  await expect(content(page)).toBeHidden();
  await ped(page).locator('[data-btn="EDITOR"]').click();
  await expect(ped(page)).toHaveAttribute('data-view', 'editor');
  await expect(content(page)).toBeVisible();
  expect(await bufferText(page)).toBe('one\nxtwo\nthree\n');
  await expect(footer(page)).toContainText('Ln 2, Col 2');
  await page.keyboard.press('Tab');
  await expect(ped(page)).toHaveAttribute('data-zone', 'buffer');
  await page.keyboard.press('Control+z');
  expect(await bufferText(page)).toBe('one\ntwo\nthree\n');
  // Unchanged again: ESC from HELP pops without saving.
  await toHelp(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-title-row')).toHaveText('─── Profile ───');
  expect(await stored(page)).toBe('one\ntwo\nthree\n');
});

test('ESC menu → Profile → HELP while connected: ESC asks to apply', async ({ page }) => {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', '#alias {a} {b}\n');
  });
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="profile"] .wc-label').click();
  await kind(page, 'alias');
  await page.keyboard.press('n');
  await page.keyboard.type('z');

  await toHelp(page);
  await page.keyboard.press('Tab');
  await jumpToHeading(page, '#action');
  // The menu and the manual fit the 80 % box: the menu starts inside it, the scrollbar ends inside it.
  const box = (await page.locator('.wc-overlay .wc-overlay-inner').boundingBox())!;
  const bar = (await ped(page).locator('.wc-ped-manual .wc-scroll-track').first().boundingBox())!;
  expect(bar.x + bar.width).toBeLessThanOrEqual(box.x + box.width);
  const menu = (await helpMenu(page).boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(box.x);
  expect(menu.x + menu.width).toBeLessThan(bar.x);
  await expect(menuCurrent(page)).toHaveText(/^ #action\s*$/);

  const modal = () => ped(page).locator('.wc-ped-overlay');
  await page.keyboard.press('Escape');
  await expect(modal()).toContainText('Apply changes to your profile?');
  await page.keyboard.press('Escape'); // keep editing: still in HELP, where it was
  await expect(modal()).toHaveCount(0);
  await expect(ped(page)).toHaveAttribute('data-view', 'help');
  await expect(helpTopRow(page)).toHaveText('#action');
  await page.keyboard.press('Escape');
  await page.keyboard.press('y');
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-flash')).toHaveText('Profile updated.');
  expect(await stored(page)).toBe('#alias {a} {b}\n#alias {z} {}\n');
});

test('HELP menu: click and keys jump to a section, the mark follows the manual', async ({ page }) => {
  const errors = watchErrors(page);
  await openFromStart(page, '#alias {a} {b}\n');
  await toHelp(page);
  await expect(helpMenu(page)).toBeVisible();
  await expect(menuCurrent(page)).toHaveText(/^ Writing a profile\s*$/);
  await expect(menuCurrent(page)).toHaveClass(/is-cur(?!-focus)/);
  // Every section is an entry, in manual order, under the two group labels.
  await expect(helpMenu(page).locator('.wc-ped-menu-label.wc-c-hint').filter({ hasText: /\S/ })).toHaveText([/Basics/, /Commands/]);
  await expect(menuEntries(page).nth(1)).toHaveText(/^ Braces and ;\s*$/);

  // A click puts the heading on the manual's top row and focuses the menu.
  await menuEntry(page, '#highlight').click();
  await expect(helpTopRow(page)).toHaveText('#highlight');
  await expect(helpRows(page).nth(1)).toHaveText('#highlight {pattern} {color} {priority}');
  await expect(ped(page)).toHaveAttribute('data-zone', 'menu');
  await expect(menuCurrent(page)).toHaveText(/^ #highlight\s*$/);
  await expect(menuCurrent(page)).toHaveClass(/is-cur-focus/);
  await expect(footer(page)).toContainText('↑↓ Section');

  // ↑ ↓ move the cursor and the manual with it.
  await page.keyboard.press('ArrowDown');
  await expect(helpTopRow(page)).toHaveText('#if');
  await expect(menuCurrent(page)).toHaveText(/^ #if\s*$/);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(helpTopRow(page)).toHaveText('#help');
  // → (or Enter) goes to the manual; the mark stays, grey, and follows scrolling.
  await page.keyboard.press('ArrowRight');
  await expect(ped(page)).toHaveAttribute('data-zone', 'help');
  await expect(footer(page)).toContainText('← Menu');
  await expect(menuCurrent(page)).toHaveText(/^ #help\s*$/);
  await expect(menuCurrent(page)).toHaveClass(/is-cur(?!-focus)/);
  await page.keyboard.press('ArrowUp');
  await expect(menuCurrent(page)).toHaveText(/^ #gag\s*$/);
  await page.keyboard.press('n');
  await expect(helpTopRow(page)).toHaveText('#help');
  await page.keyboard.press('n');
  await expect(menuCurrent(page)).toHaveText(/^ #highlight\s*$/);
  await page.keyboard.press('Home');
  await expect(menuCurrent(page)).toHaveText(/^ Writing a profile\s*$/);
  // ← goes back to the menu; ↑ on the first entry leaves for the toggle.
  await page.keyboard.press('ArrowLeft');
  await expect(ped(page)).toHaveAttribute('data-zone', 'menu');
  await page.keyboard.press('ArrowUp');
  await expect(ped(page)).toHaveAttribute('data-zone', 'toggle');
  await page.keyboard.press('Tab');
  await expect(ped(page)).toHaveAttribute('data-zone', 'menu');
  await page.keyboard.press('Shift+Tab');
  await expect(ped(page)).toHaveAttribute('data-zone', 'toggle');

  // The last section cannot reach the top row: it is shown and marked all the same.
  await page.keyboard.press('End');
  await helpMenu(page).hover();
  for (let i = 0; i < 15; i++) await page.mouse.wheel(0, 100);
  await menuEntry(page, 'Not supported').click();
  await expect(menuCurrent(page)).toHaveText(/^ Not supported\s*$/);
  await expect(helpRows(page).last()).toContainText('on its line.');
  await expect(ped(page).locator('.wc-ped-manual [data-kind="heading"] .wc-ped-help-text').last()).toHaveText('Not supported');
  await page.keyboard.press('p');
  await expect(menuCurrent(page)).toHaveText(/^ #variable\s*$/);
  expect(errors).toEqual([]);
});

test('HELP menu scrolls to keep the current section in view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 420 });
  await openFromStart(page, '#alias {a} {b}\n');
  await toHelp(page);
  await expect(menuEntry(page, '#variable')).toHaveCount(0);
  await expect(helpMenu(page).locator('.wc-scroll-thumb').first()).toBeVisible();
  await page.keyboard.press('End');
  await expect(menuCurrent(page)).toBeVisible();
  await expect(menuEntry(page, 'Writing a profile')).toHaveCount(0);
  // The wheel scrolls the menu alone; a click then jumps.
  await helpMenu(page).hover();
  for (let i = 0; i < 15; i++) await page.mouse.wheel(0, -100);
  await expect(menuEntry(page, 'Writing a profile')).toBeVisible();
  await expect(helpRows(page).last()).toContainText('on its line.');
  await menuEntry(page, 'Patterns').click();
  await expect(helpTopRow(page)).toHaveText('Patterns');
  // Walking down the menu brings the entries in, one by one, to the end.
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowDown');
  await expect(menuCurrent(page)).toHaveText(/^ Not supported\s*$/);
  await expect(menuCurrent(page)).toBeVisible();
});

test('HELP in a narrow window: no menu, the manual and its keys as before', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 620, height: 600 });
  await openFromStart(page, '#alias {a} {b}\n');
  await toHelp(page);
  await expect(helpMenu(page)).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(ped(page)).toHaveAttribute('data-zone', 'help');
  await jumpToHeading(page, '#highlight');
  await page.keyboard.press('ArrowLeft');
  await expect(ped(page)).toHaveAttribute('data-zone', 'help');
  await page.keyboard.press('p');
  await expect(helpTopRow(page)).toHaveText('#help');
  const view = page.viewportSize()!;
  const bar = (await ped(page).locator('.wc-ped-manual .wc-scroll-track').first().boundingBox())!;
  expect(bar.x + bar.width).toBeLessThanOrEqual(view.width);

  // Widening brings the menu in, on the same section; narrowing with the menu focused moves focus to the manual.
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect(menuCurrent(page)).toHaveText(/^ #help\s*$/);
  await expect(helpTopRow(page)).toHaveText('#help');
  await page.keyboard.press('ArrowLeft');
  await expect(ped(page)).toHaveAttribute('data-zone', 'menu');
  await page.setViewportSize({ width: 620, height: 600 });
  await expect(helpMenu(page)).toHaveCount(0);
  await expect(ped(page)).toHaveAttribute('data-zone', 'help');
  await expect(helpTopRow(page)).toHaveText('#help');
  expect(errors).toEqual([]);
});

// ------------------------------------------------- full width (ADR 0037)

const edges = async (l: Locator): Promise<{ left: number; right: number; width: number }> => {
  const b = (await l.boundingBox())!;
  return { left: b.x, right: b.x + b.width, width: b.width };
};
const LONG = Array.from({ length: 120 }, (_, i) => `#alias {a${i}} {say ${i}}`).join('\n') + '\n';

/** EDITOR and HELP at full size: the LITE block's left edge, the scrollbar in the frame's last cell. */
async function expectFullWidth(page: Page, manualAtColumn: boolean): Promise<void> {
  const frame = await edges(ped(page));
  await kind(page, 'alias');
  const lite = await edges(ped(page).locator('.wc-ped-list'));
  const toggle = await edges(ped(page).locator('.wc-ped-toggle'));
  expect(frame.right - toggle.right).toBeGreaterThan(20); // there is room to fill

  await toEditor(page);
  const buffer = await edges(ped(page).locator('.wc-ped-buffer'));
  const bar = await edges(ped(page).locator('.wc-ped-bufbar'));
  expect(buffer.left).toBeCloseTo(lite.left, 0);
  expect(bar.left).toBeCloseTo(buffer.right, 0);
  expect(bar.right).toBeCloseTo(frame.right, 0);
  // The toggle stays where it is in LITE.
  expect((await edges(ped(page).locator('.wc-ped-toggle'))).right).toBeCloseTo(toggle.right, 0);
  // The scrollbar still pages: a click on the track below the thumb.
  const thumbs = ped(page).locator('.wc-ped-bufbar .wc-scroll-thumb');
  const before = (await thumbs.first().boundingBox())!.y;
  await ped(page).locator('.wc-ped-bufbar .wc-scroll-track').last().dispatchEvent('mousedown');
  await expect.poll(async () => (await thumbs.first().boundingBox())!.y).toBeGreaterThan(before);

  await toHelp(page);
  const menu = await edges(helpMenu(page));
  const text = await edges(helpTopRow(page));
  const track = await edges(ped(page).locator('.wc-ped-manual .wc-scroll-track').last());
  expect(track.right).toBeCloseTo(frame.right, 0);
  expect(menu.right).toBeLessThan(text.left);
  if (manualAtColumn) expect(text.left).toBeCloseTo(lite.left, 0);
  // The manual is laid out to the new width: its rows end one blank cell before the scrollbar.
  expect(text.right).toBeCloseTo(track.left, 0);
  expect(text.width).toBeGreaterThan(toggle.right - lite.left);
  await ped(page).locator('.wc-ped-manual .wc-scroll-track').last().dispatchEvent('mousedown');
  await expect(helpTopRow(page)).not.toHaveText('Writing a profile');
  await menuEntry(page, '#alias').click();
  await expect(helpTopRow(page)).toHaveText('#alias');
}

test('EDITOR and HELP fill the frame to its last cell from the start page; LITE keeps its column', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 800 });
  await openFromStart(page, LONG);
  await expectFullWidth(page, true);
  // The frame ends in the window's last cell.
  const frame = await edges(ped(page));
  expect(1600 - frame.right).toBeLessThan(frame.width / 79);
  expect(errors).toEqual([]);
});

test('EDITOR and HELP fill the in-game box to its last cell', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 800 });
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.evaluate(async (t) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', t);
  }, LONG);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="profile"] .wc-label').click();
  await expectFullWidth(page, false);
  const box = (await page.locator('.wc-overlay .wc-overlay-inner').boundingBox())!;
  const track = await edges(ped(page).locator('.wc-ped-manual .wc-scroll-track').last());
  expect(track.right).toBeLessThanOrEqual(box.x + box.width);
  expect(errors).toEqual([]);
});

test('EDITOR in a narrow window keeps the centred column', async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 600 });
  await openFromStart(page, LONG);
  const toggle = await edges(ped(page).locator('.wc-ped-toggle'));
  await toEditor(page);
  const bar = await edges(ped(page).locator('.wc-ped-bufbar'));
  expect(bar.right).toBeCloseTo(toggle.right, 0);
  expect((await edges(ped(page))).right - bar.right).toBeGreaterThan(bar.width / 2);
});

// ------------------------------------------- every character is visible

/**
 * How much of an underscore shows in cells `cols` of a text that starts at
 * `loc`'s left edge: lit pixels in the lower part of the cell (plus two
 * pixels below it, where a neighbouring row of the same background would
 * still show it), as a fraction of the cell width. Cell 2 must hold a
 * letter without a descender (the background sample). About 1 for a
 * DejaVu `_`, 0 when it is clipped or painted over.
 */
async function underscoreInk(page: Page, loc: Locator, cols: number[], fromText = false): Promise<number[]> {
  const cell = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { w: parseFloat(cs.getPropertyValue('--cell-w')), h: parseFloat(cs.getPropertyValue('--cell-h')) };
  });
  const b = (await loc.boundingBox())!;
  // `fromText`: the text starts at its first character, not at the box's left edge (CodeMirror's line padding).
  if (fromText)
    b.x = await loc.evaluate((el) => {
      const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!;
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, 1);
      return r.getBoundingClientRect().left;
    });
  const n = Math.max(...cols, 2) + 1;
  const png = await page.screenshot({ clip: { x: b.x, y: b.y, width: cell.w * n, height: cell.h + 2 } });
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
      const rowBg = px(refX, Math.floor(ch * 0.97) - 1);
      return cols.map((col) => {
        let ink = 0;
        for (let y = Math.floor(ch * 0.6); y < cv.height; y++) {
          const bg = px(refX, y);
          // A pixel row that belongs to a neighbour with another background hides the glyph.
          if (diff(bg, rowBg) > 60) continue;
          for (let x = Math.floor(col * cw); x < Math.min(cv.width, Math.floor((col + 1) * cw)); x++) if (diff(px(x, y), bg) > 120) ink++;
        }
        return ink / cw;
      });
    },
    { b64: png.toString('base64'), cols, n, frac: cell.h / (cell.h + 2) },
  );
}

const UNDERSCORES = '#alias {_show_acontainer} {x}\n#alias {_show_class} {_hhhh_}\n#alias {_show_spell} {y}\n';

/** The owner's report (ADR 0037): `_show_class` lost its underscores in LITE. */
async function expectUnderscores(page: Page, font: 'dejavu' | 'jetbrains', size: number): Promise<void> {
  await page.evaluate(([f, s]) => window.__wc!.settings.update({ appearance: { font: f as 'dejavu', size: s as number } }), [font, size] as const);
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-size')))
    .not.toBe('');
  await page.waitForTimeout(150);
  const where = `${font} ${size}`;
  const input = ped(page).locator('input[data-field="pattern"]');
  await expect(input).toHaveValue('_show_class');
  const rows = listRows(page);
  await expect(rows).toHaveText([/^_show_a…/, /^_show_c…/, /^_show_s…/, /\+ New entry/]);
  await expect(cursorRow(page)).toHaveText(/^_show_c…/);
  const targets: Array<[string, Locator]> = [
    ['Pattern box', input],
    ['row above the cursor band', rows.nth(0)],
    ['cursor row', rows.nth(1)],
    ['row below the cursor band', rows.nth(2)],
    ['Commands box', ped(page).locator('textarea[data-field="body"]')],
  ];
  for (const [name, loc] of targets) {
    const ink = await underscoreInk(page, loc, [0, 5]);
    expect(Math.min(...ink), `${name}, ${where}: underscore ink ${ink.map((v) => v.toFixed(2)).join(' / ')}`).toBeGreaterThan(0.5);
  }
}

for (const dpr of [1, 1.5]) {
  dprTest.describe(`underscores at device pixel ratio ${dpr}`, () => {
    dprTest.use({ dpr });
    dprTest('every underscore of an entry shows in LITE, in both fonts and at several sizes', async ({ dprPage: page }) => {
      await openFromStart(page, UNDERSCORES);
      await expectDpr(page, dpr);
      await kind(page, 'alias');
      await listRows(page).nth(1).click();
      for (const [font, size] of [['dejavu', 15], ['dejavu', 10], ['dejavu', 13], ['jetbrains', 15], ['dejavu', 20]] as const) {
        await expectUnderscores(page, font, size);
      }
    });

    // ADR 0043: CodeMirror's lines, the one above the cursor's highlighted line too.
    dprTest('every underscore shows in EDITOR, also on the line above the active line', async ({ dprPage: page }) => {
      await openFromStart(page, UNDERSCORES);
      await expectDpr(page, dpr);
      await toEditor(page);
      const line = (n: number) => content(page).locator('.cm-line').nth(n);
      await expect(line(1)).toHaveText('#alias {_show_class} {_hhhh_}');
      // The cursor on the third line: its highlight is the background right below line 2.
      await line(2).click();
      await expect(line(2)).toHaveClass(/cm-activeLine/);
      for (const [font, size] of [['dejavu', 15], ['dejavu', 10], ['dejavu', 13], ['dejavu', 20], ['jetbrains', 15]] as const) {
        await page.evaluate(([f, s]) => window.__wc!.settings.update({ appearance: { font: f as 'dejavu', size: s as number } }), [font, size] as const);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        // `#alias {_show_class}`: underscores in cells 8 and 13; cell 2 (`l`) is the background sample.
        const ink = await underscoreInk(page, line(1), [8, 13], true);
        expect(Math.min(...ink), `EDITOR line, ${font} ${size}: underscore ink ${ink.map((v) => v.toFixed(2)).join(' / ')}`).toBeGreaterThan(0.5);
      }
    });
  });
}

test('EDITOR shows the whole stored text of the bundled khazdul profile', async ({ page }) => {
  await mockMume(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  // The seeded khazdul text, as a first run stores it, under the profile that EDIT opens.
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
  await expect(ped(page)).toHaveAttribute('data-mode', 'lite');

  // LITE lists the alias, leading underscore included.
  await kind(page, 'alias');
  const row = listRows(page).filter({ hasText: /^_show_c…/ });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(ped(page).locator('input[data-field="pattern"]')).toHaveValue('_show_class');

  // The buffer holds the stored text exactly (CodeMirror only renders the
  // lines in view, so the document is read from its state).
  await toEditor(page);
  const state = await content(page).evaluate((el) => {
    type Held = { view?: { state: { doc: { toString(): string; lines: number } } } };
    const v = ((el as unknown as { cmTile?: Held; cmView?: Held }).cmTile ?? (el as unknown as { cmView?: Held }).cmView)?.view;
    return v ? { text: v.state.doc.toString(), lines: v.state.doc.lines } : null;
  });
  expect(state).not.toBeNull();
  expect(state!.text).toBe(text);

  // Scrolling to the end renders every line on the way; the alias line is among them.
  const seen = new Set<string>();
  const scroller = ped(page).locator('.cm-scroller');
  for (let i = 0; i < 400; i++) {
    for (const l of await content(page).locator('.cm-line').allTextContents()) seen.add(l);
    const moved = await scroller.evaluate((s) => {
      const before = s.scrollTop;
      s.scrollTop += Math.max(1, s.clientHeight - 40);
      return s.scrollTop > before;
    });
    if (!moved) break;
    await page.waitForTimeout(20);
  }
  for (const l of await content(page).locator('.cm-line').allTextContents()) seen.add(l);
  const want = new Set(text.split('\n').filter((l) => l.trim() !== ''));
  expect([...want].filter((l) => !seen.has(l))).toEqual([]);
  expect([...seen].some((l) => /^#alias \{_show_class\}/i.test(l))).toBe(true);

  // Nothing was edited: ESC pops without saving and the text is untouched.
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-title-row')).toHaveText('─── Profile ───');
  expect(await stored(page)).toBe(text);
});
