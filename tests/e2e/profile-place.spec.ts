// The profile editor remembers its place (stage 57, ADR 0143): the chosen
// kind, the marked row and the list's scroll offset come back on the next
// open, in the Profile window and on the start page (a phone:
// phone-profile-editor.spec.ts); an entry that is gone falls back quietly;
// a reload forgets. Against a mocked MUME WebSocket.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { morphDone } from './look';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const icon = (page: Page, id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
const win = (page: Page) => page.locator('.wc-win[data-win="profile"]');
const pe = (page: Page) => page.locator('.wc-frame:not([hidden]) .wc-pe');
const list = (page: Page) => pe(page).locator('.wc-pe-list');
const curRow = (page: Page) => list(page).locator('.wc-pe-row.is-on');
const startFrame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const hood = (page: Page) => startFrame(page).locator('.wc-lk-box > .wc-lk-hood .wc-lk-hood-t');
const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null));
const save = (page: Page, text: string) =>
  page.evaluate(async (t) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', t);
  }, text);
const scrollTop = (page: Page) => list(page).evaluate((el) => el.scrollTop);

/** 52 macros (more than a window shows) between a few entries of the other kinds. */
const MACROS =
  '#alias {k} {kill}\n#action {You are hungry.} {eat bread}\n' +
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => `#macro {Alt+${c}} {say alt ${i}}\n#macro {Ctrl+Alt+${c}} {say both ${i}}\n`).join('') +
  '#highlight {orc} {red}\n';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** The row is wholly inside the list's own view. */
async function expectInList(page: Page, row: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const l = (await list(page).boundingBox())!;
      const r = (await row.boundingBox())!;
      return r.y >= l.y - 1 && r.y + r.height <= l.y + l.height + 1;
    })
    .toBe(true);
}

async function enterMume(page: Page, profile: string): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await save(page, profile);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
}

async function openWindow(page: Page): Promise<void> {
  await icon(page, 'profile').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await expect(win(page)).toHaveAttribute('data-focused', '');
}

/** Start page → Profile (its list is up or comes up) → Edit. */
async function editFromStart(page: Page): Promise<void> {
  if ((await hood(page).count()) === 0 || (await hood(page).textContent()) !== 'Profiles') {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  }
  await expect(hood(page)).toHaveText('Profiles');
  await startFrame(page).locator('[data-btn="EDIT"]').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await morphDone(page);
}

test('the Profile window: closed and opened again, the kind, the marked row and the scroll are back', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, MACROS);
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'action');
  await page.keyboard.press('m');
  await expect(pe(page)).toHaveAttribute('data-kind', 'macro');
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown');
  await expect(curRow(page)).toHaveAttribute('data-i', '30');
  const body = (await curRow(page).locator('.wc-pe-bod').textContent())!;
  const key = (await curRow(page).locator('.wc-pe-kc').textContent())!;
  expect(await scrollTop(page)).toBeGreaterThan(0);

  // Edit its commands, leave the field (applies), close with Esc.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  const field = pe(page).locator('[data-field="body"] textarea');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(body);
  await page.keyboard.press('End');
  await page.keyboard.type(' now');
  await page.keyboard.press('Escape');
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await expect.poll(() => stored(page)).toContain(`{${body} now}`);
  const top = await scrollTop(page);
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);

  // Open again: Lite, the keyboard in the list, Macros, the same row marked and in view.
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'macro');
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await expect(curRow(page)).toHaveAttribute('data-i', '30');
  await expect(curRow(page).locator('.wc-pe-kc')).toHaveText(key);
  await expect(curRow(page).locator('.wc-pe-bod')).toHaveText(`${body} now`);
  await expectInList(page, curRow(page));
  // The offset is back (a fractional offset may round by a pixel).
  expect(Math.abs((await scrollTop(page)) - top)).toBeLessThanOrEqual(1);
  // Wide: the detail beside the list shows that entry.
  if ((await pe(page).getAttribute('data-layout')) !== 'narrow') await expect(field).toHaveValue(`${body} now`);

  // Another kind and row, left by X from Help: the last Lite place stands.
  await page.keyboard.press('i');
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await page.keyboard.press('h');
  await expect(pe(page)).toHaveAttribute('data-view', 'help');
  await win(page).locator('.wc-win-x').click();
  await expect(win(page)).toHaveCount(0);
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  // Macros kept its own row meanwhile.
  await page.keyboard.press('m');
  await expect(curRow(page).locator('.wc-pe-kc')).toHaveText(key);

  // Left from Editor with unapplied text, discarded: the place before Editor stands.
  await page.keyboard.press('e');
  await expect(pe(page).locator('.cm-content')).toBeFocused();
  await page.keyboard.type('#alias {zz} {zz}\n');
  await win(page).locator('.wc-win-x').click();
  await win(page).locator('.wc-lk-dialog[data-dlg="apply"] [data-btn="NO"]').click();
  await expect(win(page)).toHaveCount(0);
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'macro');
  await expect(curRow(page).locator('.wc-pe-kc')).toHaveText(key);
  await expectInList(page, curRow(page));
  expect(errors).toEqual([]);
});

test('a new entry is found again where the next open sorts it; the New row is not remembered', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, '#alias {b} {2}\n#alias {d} {4}\n#alias {c} {3}\n');
  await openWindow(page);
  await page.keyboard.press('i');
  await page.keyboard.press('n');
  await page.keyboard.type('a');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1');
  await page.keyboard.press('Escape');
  // Pinned last while this visit lasts.
  await expect(curRow(page)).toHaveAttribute('data-i', '3');
  await expect.poll(() => stored(page)).toContain('#alias {a} {1}');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await expect(curRow(page)).toHaveAttribute('data-i', '0');
  await expect(curRow(page).locator('.wc-pe-pat')).toHaveText('a');

  // The New row: the next open marks the first row, as an open always did.
  await page.keyboard.press('End');
  await expect(curRow(page)).toHaveAttribute('data-row', 'new');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await expect(curRow(page)).toHaveAttribute('data-i', '0');
  expect(errors).toEqual([]);
});

test('a profile changed between the opens falls back quietly: the pattern, the row, an empty kind', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, '#alias {a} {1}\n#alias {b} {2}\n#alias {c} {3}\n#alias {d} {4}\n');
  await openWindow(page);
  await page.keyboard.press('i');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(curRow(page).locator('.wc-pe-pat')).toHaveText('c');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);

  // Moved in the text: found by its pattern.
  await save(page, '#alias {c} {3}\n#alias {x} {0}\n#alias {a} {1}\n');
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await expect(curRow(page).locator('.wc-pe-pat')).toHaveText('c');
  await expect(curRow(page)).toHaveAttribute('data-i', '1');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);

  // Gone: the row it was on, clamped to the list.
  await save(page, '#alias {a} {1}\n');
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await expect(list(page).locator('.wc-pe-row.is-on')).toHaveCount(1);
  await expect(curRow(page).locator('.wc-pe-pat')).toHaveText('a');
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);

  // The kind is empty: still the kind, nothing marked but the New row.
  await save(page, '#action {x} {y}\n');
  await openWindow(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
  await expect(list(page).locator('.wc-pe-row')).toHaveCount(1);
  await expect(curRow(page)).toHaveAttribute('data-row', 'new');
  expect(errors).toEqual([]);
});

test('the start page: Edit comes back to the kind and the row; a reload forgets', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.routeWebSocket('wss://mume.org/ws-play/', () => {});
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await save(page, MACROS);
  await editFromStart(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'action');
  await page.keyboard.press('m');
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowDown');
  const key = (await curRow(page).locator('.wc-pe-kc').textContent())!;
  const top = await scrollTop(page);
  expect(top).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(hood(page)).toHaveText('Profiles');

  await editFromStart(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'macro');
  await expect(pe(page)).toHaveAttribute('data-zone', 'list');
  await expect(curRow(page)).toHaveAttribute('data-i', '40');
  await expect(curRow(page).locator('.wc-pe-kc')).toHaveText(key);
  await expectInList(page, curRow(page));
  expect(Math.abs((await scrollTop(page)) - top)).toBeLessThanOrEqual(1);

  await page.reload();
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await editFromStart(page);
  await expect(pe(page)).toHaveAttribute('data-kind', 'action');
  await expect(curRow(page)).toHaveAttribute('data-i', '0');
  expect(errors).toEqual([]);
});
