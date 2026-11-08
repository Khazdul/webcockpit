// Typed settings persist (ADR 0038): what is typed in the game input is in
// the Profile window (ADR 0103) at once, and still works after a page
// reload. Against a mocked MUME WebSocket.
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

// The Profile editor in the new look (stage 43, ADR 0128): `.wc-pe`, its
// kind on `data-kind`, its view on `data-view`.
const pe = (page: Page) => page.locator('.wc-win[data-win="profile"] .wc-frame:not([hidden]) .wc-pe');
/** The Lite list's entries (not the "New" sentinel), each by its exact pattern. */
const listRow = (page: Page, pattern: string) =>
  pe(page)
    .locator('.wc-pe-list .wc-pe-row:not(.wc-pe-new)')
    .filter({ has: page.locator('.wc-pe-pat', { hasText: new RegExp(`^${pattern}$`) }) });
const content = (page: Page) => pe(page).locator('.cm-content');
const bufferText = (page: Page) =>
  content(page).evaluate((el) => [...el.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));
const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null));

async function enterMume(page: Page): Promise<void> {
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
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

/** The bar's Profile (the Profile window, ADR 0103); returns once the editor shows the alias list. */
async function openProfile(page: Page): Promise<void> {
  await page.locator('.wc-mb[data-mb="profile"]').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'lite');
  await pe(page).locator('[data-rail="alias"]').click();
  await expect(pe(page)).toHaveAttribute('data-kind', 'alias');
}

/** Editor → game: the window closes with the editor (nothing edited, so nothing asks). */
async function backToGame(page: Page): Promise<void> {
  // In Editor the first Esc leaves the buffer for the views (ADR 0128, owner feedback 2026-11-08).
  if ((await pe(page).getAttribute('data-zone')) === 'buffer') {
    await page.keyboard.press('Escape');
    await expect(pe(page)).toHaveAttribute('data-zone', 'views');
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  await expect(page.locator('.wc-overlay')).toBeHidden();
}

test('a typed alias is in the Profile window at once, #unalias removes it, and it survives a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const received: Buffer[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', '#nop mine\n#alias {a} {b}\n');
  });
  await enterMume(page);

  await type(page, '#alias {zz} {say hi}');
  await openProfile(page);
  await expect(listRow(page, 'zz')).toHaveCount(1);
  await pe(page).locator('.wc-pe-views [data-opt="editor"]').click();
  await expect(pe(page)).toHaveAttribute('data-view', 'editor');
  await expect(content(page)).toBeFocused();
  expect(await bufferText(page)).toBe('#nop mine\n#alias {a} {b}\n#alias {zz} {say hi}\n');
  await backToGame(page);
  // Nothing was edited, so nothing was applied or re-saved.
  expect(await stored(page)).toBe('#nop mine\n#alias {a} {b}\n#alias {zz} {say hi}\n');

  await type(page, '#unalias zz');
  await openProfile(page);
  await expect(listRow(page, 'a')).toHaveCount(1);
  await expect(listRow(page, 'zz')).toHaveCount(0);
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
