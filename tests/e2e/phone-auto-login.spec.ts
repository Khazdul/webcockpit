// Round 54c (ADR 0141): automatic login for the session, on the phone's
// game layout at a phone's and a tablet's size.
//
// - The question comes up when a login typed by hand reaches the game, not
//   before. It takes no focus and no key.
// - Yes: a dead link found on resume reconnects and logs in with nothing
//   typed, whatever "Reconnect automatically" says; the menu's Reconnect
//   uses it too.
// - No: nothing is kept and the question does not come back.
// - A password MUME no longer takes, and the player's own Disconnect, wipe
//   the stored login.
// - The password is in no storage, not in the page, not in the history and
//   not in the game text.
//
// `phone` project (Pixel 7: a touch browser). MUME is `loginMock`
// (mume-login-mock.ts); nothing reaches the live game. The background is
// simulated: `visibilityState` is overridden and `visibilitychange`
// dispatched.
import { type Page, expect, test } from '@playwright/test';
import { type LoginMock, loginMock } from './mume-login-mock';

const PASSWORD = 'correct-horse-9';
const status = (page: Page) => page.locator('.wc-app');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const ask = (page: Page) => page.locator('.wc-ph-ask');
const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const sheet = (page: Page) => page.locator('.wc-ph-sheet');
type Layer = { loginArmed: boolean; menu: { close(now: boolean): void } };
/** Whether the session is armed (the shell's phone layer; null before it is mounted). */
const armed = (page: Page) => page.evaluate(() => (window.__wc!.shell as unknown as { phoneLayer: Layer | null }).phoneLayer?.loginArmed ?? null);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function visibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/** Types a line in the command field and sends it. */
async function send(page: Page, text: string): Promise<void> {
  await field(page).tap();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** Opens the page, enters MUME and stops at the name prompt. */
async function enter(page: Page, url: string, opts: Parameters<typeof loginMock>[1] = {}): Promise<LoginMock> {
  const m = await loginMock(page, opts);
  await page.goto(url);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  return m;
}

/** Logs in by hand: the name, then the password at the masked prompt. */
async function loginByHand(page: Page, password = PASSWORD): Promise<void> {
  await send(page, 'rasta');
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  await page.keyboard.type(password);
  await page.keyboard.press('Enter');
}

/** Everything the page could have written the password to that a script can read back. */
async function leaks(page: Page, password: string): Promise<string[]> {
  return page.evaluate(async (password) => {
    const found: string[] = [];
    const has = (v: unknown): boolean => {
      try {
        return (typeof v === 'string' ? v : (JSON.stringify(v) ?? '')).includes(password);
      } catch {
        return false;
      }
    };
    for (const [name, store] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]] as const) {
      for (let i = 0; i < store.length; i++) if (has(store.getItem(store.key(i)!))) found.push(`${name}:${store.key(i)}`);
    }
    if (has(document.documentElement.outerHTML)) found.push('DOM');
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) if (has(el.value)) found.push('a field');
    if (has(window.__wc!.app.input.getHistory())) found.push('history');
    if (has(window.__wc!.settings.get())) found.push('settings');
    if (has(document.cookie)) found.push('cookie');
    // IndexedDB: every text value of every store (binary run chunks are not searched).
    for (const info of await indexedDB.databases()) {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(info.name!);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      for (const name of Array.from(db.objectStoreNames)) {
        const all = await new Promise<unknown[]>((res, rej) => {
          const r = db.transaction(name).objectStore(name).getAll();
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        if (has(all)) found.push(`indexedDB:${info.name}/${name}`);
      }
      db.close();
    }
    return found;
  }, password);
}

for (const [size, viewport, url] of [
  ['a phone', { width: 412, height: 915 }, '/?phone=1'],
  ['a phone on its side', { width: 800, height: 360 }, '/?phone=1'],
  ['a tablet', { width: 820, height: 1180 }, '/'],
  ['a tablet on its side', { width: 1180, height: 820 }, '/'],
] as const) {
  test.describe(size, () => {
    test.use({ viewport });

    test('the question comes after the login, not before; it takes no key and covers no key of the layout', async ({ page }) => {
      const errors = watchErrors(page);
      const m = await enter(page, url);
      await expect(ask(page)).toBeHidden();
      await send(page, 'rasta');
      await expect(field(page)).toHaveClass(/\bwc-masked\b/);
      await expect(ask(page)).toBeHidden();
      await page.keyboard.type(PASSWORD);
      await expect(ask(page)).toBeHidden();
      await page.keyboard.press('Enter');
      await expect(status(page)).toHaveAttribute('data-status', /^playing/);
      await expect(ask(page)).toBeVisible();
      await expect(ask(page).locator('.wc-ph-ask-q')).toHaveText('Log in automatically as Rasta for the rest of this session?');
      await expect(ask(page).locator('.wc-ph-ask-n')).toHaveText("Your name and password are kept in this page's memory only. They are gone when the page is closed or reloaded.");
      expect(await armed(page)).toBe(false);
      // The command line kept the focus, and what is typed goes to the game: Y and N are not answers.
      await expect(field(page)).toBeFocused();
      await page.keyboard.type('yell n');
      await page.keyboard.press('Enter');
      await expect.poll(() => m.sent[0]).toEqual(['rasta', PASSWORD, 'yell n']);
      await expect(ask(page)).toBeVisible();
      // Inside the screen, over none of the layout's keys, the command row or the lens.
      const card = (await ask(page).boundingBox())!;
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
      expect(card.y + card.height).toBeLessThanOrEqual(viewport.height);
      for (const sel of ['.wc-ph-lens', '.wc-ph-satrow', '.wc-ph-pad', '.wc-ph-hot', '.wc-ph-menu', '.wc-input-slot', '.wc-ph-okb']) {
        for (const el of await page.locator(sel).all()) {
          if (!(await el.isVisible())) continue;
          const b = (await el.boundingBox())!;
          const apart = b.x >= card.x + card.width || b.x + b.width <= card.x || b.y >= card.y + card.height || b.y + b.height <= card.y;
          expect(apart, `${sel} is clear of the question`).toBe(true);
        }
      }
      // Both keys are whole inside the card and above the command row (a low screen lays the card out low).
      const inputTop = (await page.locator('.wc-cockpit > .wc-input-slot').boundingBox())!.y;
      for (const act of ['yes', 'no']) {
        const b = (await ask(page).locator(`[data-act="${act}"]`).boundingBox())!;
        expect(b.y).toBeGreaterThanOrEqual(card.y);
        expect(b.y + b.height).toBeLessThanOrEqual(Math.min(card.y + card.height, inputTop));
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
      // A tap on the game text beside it is the game's (the card has no veil).
      expect(await page.evaluate(() => document.querySelector('.wc-ph-ask')!.getAttribute('aria-modal'))).toBeNull();
      await ask(page).locator('[data-act="yes"]').tap();
      await expect(ask(page)).toBeHidden();
      expect(await armed(page)).toBe(true);
      await expect(field(page)).toBeFocused();
      await expect(rows(page).filter({ hasText: 'Automatic login is on for Rasta' })).toHaveCount(1);
      expect(await leaks(page, PASSWORD)).toEqual([]);
      expect(errors).toEqual([]);
    });

    test('Yes: a dead link found on resume reconnects and logs in with nothing typed', async ({ page }) => {
      const errors = watchErrors(page);
      const m = await enter(page, url);
      expect(await page.evaluate(() => window.__wc!.settings.get().phone.autoReconnect)).toBe(false);
      await loginByHand(page);
      await ask(page).locator('[data-act="yes"]').tap();
      // The link dies in the background: the resume check's ping gets no answer.
      await visibility(page, 'hidden');
      m.answer = false;
      await visibility(page, 'visible');
      await expect.poll(() => m.opened(), { timeout: 10_000 }).toBe(2);
      m.answer = true;
      await expect(status(page)).toHaveAttribute('data-status', /^playing/);
      expect(m.sent[1]).toEqual(['Rasta', PASSWORD]);
      await expect(rows(page).filter({ hasText: '[SYSTEM] Logging in as Rasta…' })).toHaveCount(1);
      await expect(rows(page).filter({ hasText: '[SYSTEM] Logged in as Rasta.' })).toHaveCount(1);
      await expect(ask(page)).toBeHidden();
      await expect(sheet(page)).toBeHidden();
      expect(await armed(page)).toBe(true);
      // The password is not in the game text (no echo), the history or any storage.
      expect(await page.locator('.wc-rows').innerText()).not.toContain(PASSWORD);
      expect(await page.evaluate(() => window.__wc!.app.input.getHistory())).toEqual(['rasta']);
      expect(await leaks(page, PASSWORD)).toEqual([]);
      // A link that drops while hidden: again, once.
      await visibility(page, 'hidden');
      void m.server().close();
      await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
      await visibility(page, 'visible');
      await expect(status(page)).toHaveAttribute('data-status', /^playing/);
      expect(m.opened()).toBe(3);
      expect(m.sent[2]).toEqual(['Rasta', PASSWORD]);
      expect(errors).toEqual([]);
    });
  });
}

test('Yes: a drop in view opens the sheet, and its Reconnect logs in', async ({ page }) => {
  const m = await enter(page, '/?phone=1');
  await loginByHand(page);
  await ask(page).locator('[data-act="yes"]').tap();
  void m.server().close();
  await expect(sheet(page)).toBeVisible();
  expect(m.opened()).toBe(1);
  await sheet(page).locator('[data-row="reconnect"]').tap();
  await expect(status(page)).toHaveAttribute('data-status', /^playing/);
  expect(m.sent[1]).toEqual(['Rasta', PASSWORD]);
  expect(await armed(page)).toBe(true);
});

test('No: nothing is kept, nothing reconnects by itself, and the question does not come back', async ({ page }) => {
  const m = await enter(page, '/?phone=1');
  await loginByHand(page);
  await ask(page).locator('[data-act="no"]').tap();
  await expect(ask(page)).toBeHidden();
  expect(await armed(page)).toBe(false);
  expect(await leaks(page, PASSWORD)).toEqual([]);
  // A link that dropped while hidden: the sheet with Reconnect, as before this round.
  await visibility(page, 'hidden');
  void m.server().close();
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  await visibility(page, 'visible');
  await page.waitForTimeout(500);
  expect(m.opened()).toBe(1);
  // Reconnect: MUME's own prompt, nothing sent; a login by hand as the same character asks nothing.
  await page.evaluate(() => window.__wc!.app.onCommand('#reconnect'));
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  await page.waitForTimeout(300);
  expect(m.sent[1]).toEqual([]);
  await page.evaluate(() => (window.__wc!.shell as unknown as { phoneLayer: Layer }).phoneLayer.menu.close(true));
  await loginByHand(page);
  await expect(status(page)).toHaveAttribute('data-status', /^playing/);
  await page.waitForTimeout(300);
  await expect.poll(() => armed(page)).toBe(false);
  await expect(ask(page)).toBeHidden();
});

test('a wrong password by hand asks nothing; the right one after it does', async ({ page }) => {
  const m = await enter(page, '/?phone=1');
  await loginByHand(page, 'not-the-password');
  await expect(rows(page).filter({ hasText: 'Wrong password.' })).toHaveCount(1);
  await expect(ask(page)).toBeHidden();
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await expect(ask(page)).toBeVisible();
  await ask(page).locator('[data-act="yes"]').tap();
  // The one kept is the one MUME took.
  void m.server().close();
  await sheet(page).locator('[data-row="reconnect"]').tap();
  await expect(status(page)).toHaveAttribute('data-status', /^playing/);
  expect(m.sent[1]).toEqual(['Rasta', PASSWORD]);
});

test('MUME no longer takes the stored password: one try, then it is forgotten and MUME\'s own prompt is left', async ({ page }) => {
  const m = await enter(page, '/?phone=1');
  await loginByHand(page);
  await ask(page).locator('[data-act="yes"]').tap();
  m.password = 'changed-elsewhere';
  await visibility(page, 'hidden');
  void m.server().close();
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  await visibility(page, 'visible');
  await expect(rows(page).filter({ hasText: '[SYSTEM] Automatic login stopped: MUME asked for the password again. The saved login is forgotten.' })).toHaveCount(1);
  expect(m.sent[1]).toEqual(['Rasta', PASSWORD]);
  expect(await armed(page)).toBe(false);
  // Left at MUME's password prompt, masked, for the player.
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  await page.waitForTimeout(500);
  expect(m.sent[1]).toEqual(['Rasta', PASSWORD]);
  expect(m.opened()).toBe(2);
  // The next drop found on resume does not reconnect (the setting is off, nothing is armed).
  await visibility(page, 'hidden');
  void m.server().close();
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  await visibility(page, 'visible');
  await page.waitForTimeout(500);
  expect(m.opened()).toBe(2);
});

test('the player\'s own Disconnect wipes it: nothing reconnects, and the next connection is MUME\'s own prompt', async ({ page }) => {
  const m = await enter(page, '/?phone=1');
  await loginByHand(page);
  await ask(page).locator('[data-act="yes"]').tap();
  expect(await armed(page)).toBe(true);
  await page.evaluate(() => window.__wc!.app.onCommand('#disconnect'));
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  expect(await armed(page)).toBe(false);
  await visibility(page, 'hidden');
  await visibility(page, 'visible');
  await page.waitForTimeout(500);
  expect(m.opened()).toBe(1);
  await page.evaluate(() => window.__wc!.app.onCommand('#reconnect'));
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  await page.waitForTimeout(500);
  expect(m.sent[1]).toEqual([]);
});

test('Exit session wipes it', async ({ page }) => {
  await enter(page, '/?phone=1');
  await loginByHand(page);
  await ask(page).locator('[data-act="yes"]').tap();
  await page.evaluate(() => window.__wc!.shell.exitSession());
  await expect(page.locator('.wc-start')).toBeVisible();
  expect(await armed(page)).toBe(false);
});

test('a replay asks nothing and uses nothing', async ({ page }) => {
  await page.goto('/?fixture=gmcp-demo.log&speed=0&phone=1');
  await expect(rows(page).filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await expect.poll(() => armed(page)).toBe(false);
  await expect(ask(page)).toBeHidden();
});
