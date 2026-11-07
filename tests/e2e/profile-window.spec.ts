// The Profile window's content in the new look (stage 43b, ADR 0128, 0103
// addendum): the editor's head line follows the connection while it is
// open, the root page shows a failure with Edit, a window without the
// focus never takes the DOM focus (also on a re-render), typing in the
// editor never reaches the game input, and at the window's minimum size
// the one-column layout still shows the list, the sheet's fields and the
// dialogs. Against a mocked MUME WebSocket.
import { type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const field = (page: Page) => page.locator('.wc-input-field');
const icon = (page: Page, id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
const win = (page: Page) => page.locator('.wc-win[data-win="profile"]');
const pe = (page: Page) => win(page).locator('.wc-frame:not([hidden]) .wc-pe');
const root = (page: Page) => win(page).locator('.wc-frame:not([hidden]) .wc-pw');
const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null));
const inside = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Enters MUME with `profile` as `default`; returns the mock's socket. */
async function enterMume(page: Page, profile: string): Promise<() => WebSocketRoute> {
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
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
  return () => server!;
}

async function openWindow(page: Page): Promise<void> {
  await icon(page, 'profile').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await expect(win(page)).toHaveAttribute('data-focused', '');
}

test('the head line follows the connection while the window is open; Editor’s Apply becomes Save', async ({ page }) => {
  const errors = watchErrors(page);
  const server = await enterMume(page, '#alias {a} {b}\n');
  await openWindow(page);
  const line = pe(page).locator('.wc-pe-live');
  await expect(line).toHaveText('Connected · changes apply to the game');
  await expect(line).toHaveClass(/\bis-live\b/);
  await expect(pe(page).locator('.wc-pe-status')).toHaveText('All applied');
  await pe(page).locator('.wc-pe-views [data-opt="editor"]').click();
  await expect(pe(page).locator('[data-btn="APPLY"]')).toBeVisible();
  // The session ends with the window open: the line, the button and the status follow at once.
  await server().close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected/);
  await expect(line).toHaveText('Not connected · changes are saved');
  await expect(line).not.toHaveClass(/\bis-live\b/);
  await expect(pe(page).locator('[data-btn="SAVE"]')).toBeVisible();
  await pe(page).locator('.wc-pe-views [data-opt="lite"]').click();
  await expect(pe(page).locator('.wc-pe-status')).toHaveText('All saved');
  expect(errors).toEqual([]);
});

test('the root page: a profile that cannot be opened shows the failure and Edit; Esc closes', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, '#alias {a} {b}\n');
  await page.evaluate(() => window.__wc!.settings.update({ profile: 'ghost' }));
  await icon(page, 'profile').click();
  await expect(win(page)).toHaveAttribute('data-focused', '');
  await expect(win(page).locator('.wc-win-t')).toHaveText('Profile');
  await expect(win(page).locator('.wc-win-n')).toHaveText('ghost');
  await expect(root(page).locator('.wc-pw-name')).toHaveText('ghost');
  await expect(root(page).locator('.wc-pw-flash')).toHaveText('No profile "ghost".');
  // The failure stays on the page (the stack's flash fades after 3 s).
  await page.waitForTimeout(3300);
  await expect(root(page).locator('.wc-pw-flash')).toHaveText('No profile "ghost".');
  // Edit (E) tries again: the profile exists now, the editor opens.
  await page.evaluate(() => window.__wc!.shell.profiles.create('ghost', '#alias {g} {h}\n'));
  await page.keyboard.press('e');
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  // Leaving the editor cleanly closes the window.
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);
  // Again without the profile: Enter tries, Esc closes the window.
  await page.evaluate(() => window.__wc!.settings.update({ profile: 'ghost2' }));
  await icon(page, 'profile').click();
  await expect(root(page).locator('[data-btn="EDIT"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(root(page).locator('.wc-pw-flash')).toHaveText('No profile "ghost2".');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test('focus: typing in a field never reaches the game; a window without the focus never takes it, also on a re-render', async ({ page }) => {
  await enterMume(page, '#alias {a} {b}\n');
  await openWindow(page);
  await page.keyboard.press('i');
  await page.keyboard.press('Enter');
  const pattern = pe(page).locator('[data-field="pattern"] input');
  await expect(pattern).toBeFocused();
  await page.keyboard.type('xyz');
  await expect(pattern).toHaveValue('axyz');
  await expect(field(page)).toHaveValue('');
  // A press in the game: the window lets the focus go and the Lite edit applies (ADR 0105).
  await page.locator('.wc-game').click({ position: { x: 20, y: 20 } });
  await expect(win(page)).not.toHaveAttribute('data-focused', '');
  await expect(field(page)).toBeFocused();
  await expect.poll(() => stored(page)).toBe('#alias {axyz} {b}\n');
  // The window re-renders (its size follows the viewport): the field stays unfocused.
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.waitForTimeout(300);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('look');
  await expect(field(page)).toHaveValue('look');
  await expect(pattern).toHaveValue('axyz');
  // A press in the window gives it back the focus, and the keyboard returns to its field.
  await win(page).locator('.wc-win-bar').click({ position: { x: 30, y: 8 } });
  await expect(win(page)).toHaveAttribute('data-focused', '');
  await expect(pattern).toBeFocused();
});

test('at the minimum size: one column, the list, the sheet with both fields, and the dialogs fit', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, '#alias {a} {b}\n#alias {gv %1} {get %1;value %1}\n#alias {k} {kill %1}\n');
  await openWindow(page);
  // The grip far up and left: the window's minimum (60 × 18 content cells).
  const g = (await win(page).locator('.wc-win-grip').boundingBox())!;
  await page.mouse.move(g.x + 5, g.y + 5);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 3 });
  await page.mouse.up();
  await expect(pe(page)).toHaveAttribute('data-layout', 'narrow');
  const body = (await win(page).locator('.wc-win-body').boundingBox())!;
  expect((await pe(page).boundingBox())!.width).toBeLessThanOrEqual(640);
  await page.keyboard.press('i');
  // Rows of the list are in view, the foot too.
  const list = (await pe(page).locator('.wc-pe-list').boundingBox())!;
  expect(list.height).toBeGreaterThan(80);
  expect(inside((await pe(page).locator('.wc-pe-row').first().boundingBox())!, body)).toBe(true);
  expect(inside((await pe(page).locator('.wc-pe-foot').boundingBox())!, body)).toBe(true);
  // Enter opens the entry as a sheet; ↓ goes to Commands, which comes into the detail's view.
  await page.keyboard.press('Enter');
  await expect(pe(page)).toHaveClass(/\bis-sheet\b/);
  await page.keyboard.press('ArrowDown');
  const commands = pe(page).locator('[data-field="body"] textarea');
  await expect(commands).toBeFocused();
  await expect
    .poll(async () => {
      const c = (await commands.boundingBox())!;
      const d = (await pe(page).locator('.wc-pe-detail').boundingBox())!;
      return c.y >= d.y - 1 && c.y + 20 <= d.y + d.height;
    })
    .toBe(true);
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await expect(commands).toHaveValue('bx');
  // Esc leaves the field and the sheet: the list again.
  await page.keyboard.press('Escape');
  await expect(pe(page)).not.toHaveClass(/\bis-sheet\b/);
  await expect.poll(() => stored(page)).toBe('#alias {a} {bx}\n#alias {gv %1} {get %1;value %1}\n#alias {k} {kill %1}\n');
  // An Editor edit, then X: the dialog fits inside the window.
  await page.keyboard.press('e');
  await expect(pe(page).locator('.cm-content')).toBeFocused();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('#alias {z} {}');
  await win(page).locator('.wc-win-x').click();
  const ask = win(page).locator('.wc-lk-dialog[data-dlg="apply"]');
  await expect(ask).toContainText('Apply changes to your profile?');
  for (const id of ['YES', 'NO', 'KEEP']) expect(inside((await ask.locator(`[data-btn="${id}"]`).boundingBox())!, body)).toBe(true);
  await page.keyboard.press('y');
  await expect(win(page)).toHaveCount(0);
  await expect.poll(() => stored(page)).toBe('#alias {a} {bx}\n#alias {gv %1} {get %1;value %1}\n#alias {k} {kill %1}\n#alias {z} {}');
  expect(errors).toEqual([]);
});
