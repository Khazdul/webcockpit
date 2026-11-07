// The profile editor's in-game hosts on touch devices (stage 43b, ADR
// 0128): on a phone `#profile` opens the ESC menu straight at the editor,
// full screen in the menu's place (the live line in its head, Back closes
// the menu), and a profile that cannot be opened leaves the failure and
// Edit on the menu's page; on a tablet (a desktop-size viewport with
// `?touch=1`) the Profile window works by taps and the soft keyboard types
// into its fields. Against a mocked MUME WebSocket.
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const overlay = (page: Page) => page.locator('.wc-overlay');
const menu = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden])');
const field = (page: Page) => page.locator('.wc-input-field');
const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null));

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Enters MUME at `url` with `profile` as `default`, by a tap on Enter MUME. */
async function enterMume(page: Page, url: string, profile: string): Promise<void> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto(url);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (t) => {
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', t);
  }, profile);
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
}

/** `#profile` in the game input. */
async function hashProfile(page: Page): Promise<void> {
  await field(page).fill('#profile');
  await field(page).press('Enter');
}

test('a phone: #profile opens the editor full screen in the menu; an edit applies; Back closes the menu', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, '/?phone=1', '#alias {a} {b}\n');
  await hashProfile(page);
  const pe = menu(page).locator('.wc-pe');
  await expect(pe).toHaveAttribute('data-view', 'lite');
  await expect(pe).toHaveClass(/\bis-menu\b/);
  await expect(pe).toHaveAttribute('data-layout', 'narrow');
  await expect(pe.locator('.wc-pe-live')).toHaveText('Connected · changes apply to the game');
  await expect(page.locator('.wc-win')).toHaveCount(0);
  // The editor fills the screen inside the menu's Lykta box.
  const view = page.viewportSize()!;
  const box = (await menu(page).locator('.wc-lk-box-full').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width + 0.5);
  await pe.locator('[data-rail="alias"]').tap();
  await pe.locator('.wc-pe-row').first().tap();
  await expect(pe).toHaveClass(/\bis-sheet\b/);
  const body = pe.locator('[data-field="body"] textarea');
  await body.tap();
  await expect(body).toBeFocused();
  await page.keyboard.type('x');
  await pe.locator('[data-btn="SHEET"]').tap();
  await expect.poll(() => stored(page)).toBe('#alias {a} {bx}\n');
  await expect(pe.locator('.wc-pe-status')).toHaveText('All applied');
  // Back: the editor leaves, and with it the menu (it was opened at the editor).
  await menu(page).locator('.wc-lk-back').tap();
  await expect(overlay(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('a phone: a profile that cannot be opened leaves the failure and Edit on the menu page', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page, '/?phone=1', '#alias {a} {b}\n');
  await page.evaluate(() => window.__wc!.settings.update({ profile: 'ghost' }));
  await hashProfile(page);
  const home = menu(page).locator('.wc-pw');
  await expect(home.locator('.wc-pw-flash')).toHaveText('No profile "ghost".');
  await expect(menu(page).locator('.wc-lk-hood-t')).toHaveText('Profile');
  // Edit tries again (and fails again); Back closes the menu.
  await home.locator('[data-btn="EDIT"]').tap();
  await expect(home.locator('.wc-pw-flash')).toHaveText('No profile "ghost".');
  expect((await home.locator('[data-btn="EDIT"]').boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await menu(page).locator('.wc-lk-back').tap();
  await expect(overlay(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test.describe('a tablet', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test('the Profile window by taps: a kind, a row, its field with the soft keyboard; a tap in the game applies', async ({ page }) => {
    const errors = watchErrors(page);
    await enterMume(page, '/?touch=1', '#alias {a} {b}\n#alias {k} {kill}\n');
    await expect(page.locator('html')).not.toHaveClass(/\bwc-phone\b/);
    await page.locator('.wc-mb[data-mb="profile"]').tap();
    const win = page.locator('.wc-win[data-win="profile"]');
    await expect(win).toHaveAttribute('data-focused', '');
    const pe = win.locator('.wc-frame:not([hidden]) .wc-pe');
    await expect(pe).toHaveAttribute('data-view', 'lite');
    await pe.locator('[data-rail="alias"]').tap();
    await expect(pe).toHaveAttribute('data-kind', 'alias');
    await pe.locator('.wc-pe-row').nth(1).tap();
    await expect(pe.locator('.wc-pe-row').nth(1)).toHaveClass(/\bis-on\b/);
    const body = pe.locator('[data-field="body"] textarea');
    await body.tap();
    await expect(body).toBeFocused();
    await page.keyboard.type(' orc');
    await expect(body).toHaveValue('kill orc');
    await expect(field(page)).toHaveValue('');
    // A tap in the game takes the window's focus: the edit applies (ADR 0105).
    await page.locator('.wc-game').tap({ position: { x: 20, y: 20 } });
    await expect(win).not.toHaveAttribute('data-focused', '');
    await expect.poll(() => stored(page)).toBe('#alias {a} {b}\n#alias {k} {kill orc}\n');
    // The X closes it (all applied).
    await win.locator('.wc-win-x').tap();
    await expect(win).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
