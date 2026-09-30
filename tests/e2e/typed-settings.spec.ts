// Typed settings persist (ADR 0038): what is typed in the game input is in
// ESC → Profile at once, and still works after a page reload. Against a
// mocked MUME WebSocket.
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const ped = (page: Page) => page.locator('.wc-frame:not([hidden]) > .wc-ped');
const listRows = (page: Page) => ped(page).locator('.wc-ped-list .wc-tr');
const content = (page: Page) => ped(page).locator('.cm-content');
const bufferText = (page: Page) =>
  content(page).evaluate((el) => [...el.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));
const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null));
const menuSel = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-mrow.is-sel');

async function enterMume(page: Page): Promise<void> {
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Profile default loaded.' })).toHaveCount(1);
}

async function type(page: Page, line: string): Promise<void> {
  await page.locator('.wc-input-field').focus();
  await page.keyboard.type(line);
  // The line stays in the field, selected; the next one types over it.
  await page.keyboard.press('Enter');
}

/** ESC → Profile; returns once the editor shows the alias list. */
async function openProfile(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.locator('.wc-overlay .wc-mrow[data-key="profile"] .wc-label').click();
  await expect(ped(page)).toHaveAttribute('data-mode', 'lite');
  await ped(page).locator('[data-kind="alias"]').first().click();
}

/** Editor → menu → game. */
async function backToGame(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden])')).toHaveCount(0);
}

test('a typed alias is in ESC → Profile at once, #unalias removes it, and it survives a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const received: Buffer[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', '#nop mine\n#alias {a} {b}\n');
  });
  await enterMume(page);

  await type(page, '#alias {zz} {say hi}');
  await openProfile(page);
  await expect(listRows(page).filter({ hasText: 'zz' })).toHaveCount(1);
  await ped(page).locator('[data-btn="EDITOR"]').click();
  await expect(content(page)).toBeVisible();
  expect(await bufferText(page)).toBe('#nop mine\n#alias {a} {b}\n#alias {zz} {say hi}\n');
  await backToGame(page);
  // Nothing was edited, so nothing was applied or re-saved.
  expect(await stored(page)).toBe('#nop mine\n#alias {a} {b}\n#alias {zz} {say hi}\n');

  await type(page, '#unalias zz');
  await openProfile(page);
  await expect(listRows(page).filter({ hasText: 'a' })).toHaveCount(1);
  await expect(listRows(page).filter({ hasText: 'zz' })).toHaveCount(0);
  await backToGame(page);
  expect(await stored(page)).toBe('#nop mine\n#alias {a} {b}\n');

  // Unbraced, and saved without waiting: the reload follows at once.
  await type(page, '#alias yy say yo');
  await expect.poll(() => stored(page)).toBe('#nop mine\n#alias {a} {b}\n#alias {yy} {say yo}\n');
  await page.reload();
  await enterMume(page);
  await type(page, 'yy');
  await expect.poll(() => Buffer.concat(received).toString('utf8')).toContain('say yo\r\n');
  expect(errors).toEqual([]);
});
