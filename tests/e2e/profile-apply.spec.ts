// Stage 30b round 1 (ADR 0105): the Profile window applies its changes
// while it stays open. Lite applies where an edit is finished (here: a
// click in the game), Editor on Ctrl+S; an entry that does not validate is
// held back with a message; X asks only while something is unapplied;
// typed settings and script variables saved meanwhile are kept and shown.
// The editor in the new look (stage 43, ADR 0128): its flash and quiet
// status in the foot, the inline dialogs, the rail. Against a mocked MUME
// WebSocket.
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const field = (page: Page) => page.locator('.wc-input-field');
const icon = (page: Page, id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
const win = (page: Page) => page.locator('.wc-win[data-win="profile"]');
const ped = (page: Page) => win(page).locator('.wc-frame:not([hidden]) .wc-pe');
/** The editor's flash, in the middle of its foot. */
const flash = (page: Page) => ped(page).locator('.wc-pe-flash');
/** The quiet status at the foot's right ("All applied", "Modified · Ln 1, Col 1"). */
const status = (page: Page) => ped(page).locator('.wc-pe-status');
const dialog = (page: Page, dlg: string) => win(page).locator(`.wc-lk-dialog[data-dlg="${dlg}"]`);
const listRows = (page: Page) => ped(page).locator('.wc-pe-list .wc-pe-row');
/** The list as `pattern | body` per row, and `+ New alias` for the last. */
const listText = (page: Page) =>
  listRows(page).evaluateAll((els) =>
    els.map((e) =>
      e.matches('[data-row="new"]')
        ? `+ ${e.textContent!.trim()}`
        : `${e.querySelector('.wc-pe-l1')!.textContent!.trim()} | ${e.querySelector('.wc-pe-bod')!.textContent!.trim()}`,
    ),
  );
const toEditor = async (page: Page): Promise<void> => {
  await ped(page).locator('.wc-pe-views [data-opt="editor"]').click();
  await expect(ped(page)).toHaveAttribute('data-view', 'editor');
  await expect(ped(page).locator('.cm-content')).toBeFocused();
};
const bufferText = (page: Page) =>
  ped(page)
    .locator('.cm-content')
    .evaluate((el) => [...el.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));
const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null));

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Enters MUME with `profile` as `default`; returns what the game received. */
async function enterMume(page: Page, profile: string): Promise<() => string> {
  const received: Buffer[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
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
  return () => Buffer.concat(received).toString('utf8');
}

/** The Profile window from the bar, at the alias list. */
async function openAliases(page: Page): Promise<void> {
  await icon(page, 'profile').click();
  await expect(ped(page)).toHaveAttribute('data-view', 'lite');
  await page.keyboard.press('i');
  await expect(ped(page)).toHaveAttribute('data-kind', 'alias');
  await expect(ped(page)).toHaveAttribute('data-zone', 'list');
}

/** A click in the game text: the window loses the focus (a commit point in Lite). */
const clickGame = (page: Page) => page.locator('.wc-game').click({ position: { x: 20, y: 20 } });

/** Types a line in the game input; the click takes the keys from the window (ADR 0103). */
async function typeInGame(page: Page, line: string): Promise<void> {
  await field(page).click();
  await field(page).fill(line);
  await page.keyboard.press('Enter');
}

/** No apply or save line for the quiet applies, in the output or the UI pane. */
const noApplyLines = (page: Page) =>
  expect(page.locator('.wc-rows .wc-row, .wc-ui-row').filter({ hasText: /Profile default (applied|saved|updated)/ })).toHaveCount(0);

test('a Lite edit applies when the game is clicked; the alias works with the window open', async ({ page }) => {
  const errors = watchErrors(page);
  const sent = await enterMume(page, '#alias {a} {b}\n');
  await openAliases(page);
  await page.keyboard.press('n');
  await page.keyboard.type('gg');
  await page.keyboard.press('Tab');
  // A new entry waits for its Commands (an empty body would apply too early).
  await page.waitForTimeout(300);
  expect(await stored(page)).toBe('#alias {a} {b}\n');
  await page.keyboard.type('say hello');
  await clickGame(page);
  await expect(flash(page)).toHaveText('Applied');
  await expect(status(page)).toHaveText('All applied');
  await expect.poll(() => stored(page)).toBe('#alias {a} {b}\n#alias {gg} {say hello}\n');
  await expect(win(page)).toBeVisible();
  await typeInGame(page, 'gg');
  await expect.poll(sent).toContain('say hello\r\n');
  await expect(win(page)).toBeVisible();
  await noApplyLines(page);

  // Everything is applied: X closes at once.
  await win(page).locator('.wc-win-x').click();
  await expect(win(page)).toHaveCount(0);
  await noApplyLines(page);
  expect(errors).toEqual([]);
});

test('the Profile window: n on the rail adds an alias that applies; Ctrl+F and Del do nothing there (ADR 0119, 0128)', async ({ page }) => {
  const errors = watchErrors(page);
  const sent = await enterMume(page, '#alias {a} {b}\n');
  await icon(page, 'profile').click();
  await expect(ped(page)).toHaveAttribute('data-view', 'lite');
  await ped(page).locator('[data-rail="alias"]').click();
  await expect(ped(page)).toHaveAttribute('data-kind', 'alias');
  await expect(ped(page)).toHaveAttribute('data-zone', 'rail');
  // No key-hint rows (the kit's rule): the letters are marked in the labels.
  await expect(ped(page).locator('.wc-pe-foot')).not.toContainText('Tab');
  await page.keyboard.press('Control+f');
  await expect(ped(page)).toHaveAttribute('data-view', 'lite');
  await expect(ped(page).locator('.cm-search, .wc-lk-mfind')).toHaveCount(0);
  // Del deletes in the list only.
  await page.keyboard.press('Delete');
  expect(await listText(page)).toEqual(['a | b', '+ New alias']);
  await page.keyboard.press('n');
  await expect(ped(page).locator('[data-field="pattern"] input')).toBeFocused();
  await page.keyboard.type('gg');
  await page.keyboard.press('Tab');
  await page.keyboard.type('say hello');
  await clickGame(page);
  await expect.poll(() => stored(page)).toBe('#alias {a} {b}\n#alias {gg} {say hello}\n');
  await typeInGame(page, 'gg');
  await expect.poll(sent).toContain('say hello\r\n');
  expect(errors).toEqual([]);
});

test('Editor applies on Ctrl+S, marked Modified until then', async ({ page }) => {
  const sent = await enterMume(page, '#alias {a} {b}\n');
  await icon(page, 'profile').click();
  await toEditor(page);
  await expect(ped(page).locator('[data-btn="APPLY"]')).toBeVisible();
  await expect(status(page)).not.toContainText('Modified');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('#alias {k} {kill}');
  await expect(status(page)).toContainText('Modified');
  await expect(ped(page)).toHaveAttribute('data-unapplied', 'true');
  // A click in the game does not apply Editor's text.
  await clickGame(page);
  await page.waitForTimeout(300);
  expect(await stored(page)).toBe('#alias {a} {b}\n');
  await ped(page).locator('.cm-content').click();
  await page.keyboard.press('Control+s');
  await expect.poll(() => stored(page)).toBe('#alias {a} {b}\n#alias {k} {kill}');
  await expect(flash(page)).toHaveText('Applied');
  await expect(status(page)).not.toContainText('Modified');
  await expect(ped(page)).toHaveAttribute('data-unapplied', 'false');
  await typeInGame(page, 'k');
  await expect.poll(sent).toContain('kill\r\n');

  // A text that does not load is not applied, and says why.
  await ped(page).locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' {');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+s');
  await expect(flash(page)).toContainText('Not applied: Unbalanced braces');
  await expect(status(page)).toContainText('Modified');
  await expect(status(page)).toContainText('1 unclosed {');
  expect(await stored(page)).toBe('#alias {a} {b}\n#alias {k} {kill}');
  await noApplyLines(page);
});

test('an entry that does not validate is held back; X asks only while something is unapplied', async ({ page }) => {
  await enterMume(page, '#alias {a} {b}\n');
  await openAliases(page);
  await page.keyboard.press('Enter'); // the entry's Pattern
  await page.keyboard.press('Tab'); // Commands
  await expect(ped(page).locator('[data-field="body"] textarea')).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(' {');
  await expect(ped(page).locator('.wc-pe-msg')).toHaveText('Unbalanced braces in Commands');
  await clickGame(page);
  await expect(flash(page)).toHaveText('Not applied: Unbalanced braces in Commands (alias a)');
  await expect(status(page)).toHaveText('Not applied');
  expect(await stored(page)).toBe('#alias {a} {b}\n');

  // X: the change cannot be applied, so the prompt only offers Discard and Keep editing.
  await win(page).locator('.wc-win-x').click();
  const held = dialog(page, 'not-applied');
  await expect(held).toContainText('Not applied: Unbalanced braces in Commands (alias a)');
  await expect(held.locator('[data-btn="YES"]')).toHaveCount(0);
  await expect(held.locator('[data-btn="NO"]')).toBeVisible();
  await expect(held.locator('[data-btn="KEEP"]')).toBeVisible();
  await page.keyboard.press('y'); // nothing to apply: Y does nothing here
  await expect(held).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(held).toHaveCount(0);
  await expect(win(page)).toBeVisible();

  // Fixed: applied at the next commit point, and X closes without asking.
  await ped(page).locator('[data-field="body"] textarea').click();
  await page.keyboard.press('End');
  await page.keyboard.type('}');
  await clickGame(page);
  await expect.poll(() => stored(page)).toBe('#alias {a} {b {}}\n');
  await win(page).locator('.wc-win-x').click();
  await expect(win(page)).toHaveCount(0);
});

test('a typed #alias while the window is open shows up and survives an editor apply', async ({ page }) => {
  const errors = watchErrors(page);
  const sent = await enterMume(page, '#alias {a} {b}\n');
  await openAliases(page);
  await typeInGame(page, '#alias {zz} {say hi}');
  await expect.poll(() => listText(page)).toEqual(['a | b', 'zz | say hi', '+ New alias']);

  // Edit `a` in the window and apply by clicking the game: zz stays.
  // A click on the row the cursor is on opens it (ADR 0128); a click on Commands types there.
  await listRows(page).first().click();
  await ped(page).locator('[data-field="body"] textarea').click();
  await expect(ped(page).locator('[data-field="body"] textarea')).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await clickGame(page);
  await expect.poll(() => stored(page)).toBe('#alias {a} {bx}\n#alias {zz} {say hi}\n');
  await typeInGame(page, 'zz');
  await expect.poll(sent).toContain('say hi\r\n');
  await typeInGame(page, 'a');
  await expect.poll(sent).toContain('bx\r\n');

  // In Editor too, with a change of its own waiting: both are kept.
  await toEditor(page);
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('#nop mine\n');
  await typeInGame(page, '#alias {yy} {say yo}');
  await expect.poll(() => bufferText(page)).toBe('#nop mine\n#alias {a} {bx}\n#alias {zz} {say hi}\n#alias {yy} {say yo}\n');
  await expect(status(page)).toContainText('Modified');
  await ped(page).locator('.cm-content').click();
  await page.keyboard.press('Control+s');
  await expect.poll(() => stored(page)).toBe('#nop mine\n#alias {a} {bx}\n#alias {zz} {say hi}\n#alias {yy} {say yo}\n');
  await noApplyLines(page);
  expect(errors).toEqual([]);
});

test('a variable a script set is neither lost nor reset by an apply', async ({ page }) => {
  await enterMume(page, '#variable {hp} {10}\n#alias {set} {#variable {hp} {%1}}\n#alias {t} {#variable {target} {%1}}\n#alias {a} {b}\n');
  await typeInGame(page, 'set 3');
  await typeInGame(page, 't orc');
  await openAliases(page);
  // A click on the row the cursor is on opens it (ADR 0128); a click on Commands types there.
  await listRows(page).first().click();
  await ped(page).locator('[data-field="body"] textarea').click();
  await expect(ped(page).locator('[data-field="body"] textarea')).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await clickGame(page);
  await expect.poll(() => stored(page)).toBe(
    '#variable {hp} {3}\n#alias {set} {#variable {hp} {%1}}\n#alias {t} {#variable {target} {%1}}\n#alias {a} {bx}\n',
  );
  expect(await page.evaluate(() => [window.__wc!.app.script.getVariable('hp'), window.__wc!.app.script.getVariable('target')])).toEqual([
    '3',
    'orc',
  ]);
});
