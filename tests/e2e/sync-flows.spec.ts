// Stage 61 part C: the sync's flows on the two spaces, in the browser,
// against the e2e fake of the account API with its sync endpoints (the
// in-memory model of tests/unit/cloud-sync-model.ts per account; the flag
// `sync` on). Two pages in two browser contexts on one fake server are
// two devices of one account. sync-worker.spec.ts runs the same kind of
// flows against a real local Worker (`npm run test:sync-worker`).

import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test';
import { NAME, PASSWORD, btn, dialog, field, fillCreate, frame, link, openAccount, openStart, pageOf, shownCode, watchErrors } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { account, awayFromMenu, getIdb, logIn, menuFlash, names, owner, profile, putIdb, spaceDbOf, submitLogin, syncNow } from './sync-pages';
import { stubTurnstile } from './turnstile-stub';

test.use({ viewport: { width: 1440, height: 900 } });
// Each test lives through several reloads and logins (a password's slow step each): Firefox under a full run needs the time.
test.setTimeout(120_000);

const DB = spaceDbOf(NAME);

/** A device: its own context and page on the fake server. */
async function device(browser: Browser, server: FakeAccountServer): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  return { ctx, page };
}

function syncServer(): FakeAccountServer {
  const server = new FakeAccountServer();
  server.flags = { accounts: true, sync: true };
  return server;
}

test('Create account moves the device’s things; a second device gets them; log out brings the device back', async ({ browser }) => {
  const server = syncServer();
  const a = await device(browser, server);
  const errors = watchErrors(a.page);
  await openStart(a.page);
  await expect.poll(() => names(a.page, 'webcockpit')).toEqual(['default', 'khazdul']);
  await putIdb(a.page, 'webcockpit', 'profiles', [profile('w1', 'warrior')]);
  await putIdb(a.page, 'webcockpit', 'scripts', [{ id: 's1', name: 'hunt', source: '-- @name hunt\nprint(1)', enabled: false, created: 1, updated: 1 }]);

  await openAccount(a.page);
  await link(a.page, 'create').click();
  await fillCreate(a.page);
  await expect(btn(a.page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(a.page, 'CREATE').click();
  await expect(pageOf(a.page, 'code')).toBeVisible();
  const code = await shownCode(a.page);
  await field(a.page, 'last').fill(code.slice(-4));
  await awayFromMenu(a.page);
  await field(a.page, 'last').press('Enter');

  // The page reloads to the start menu in the account's space; the move's line, then the owner row synced.
  await expect(menuFlash(a.page)).toHaveText(`Moved into ${NAME}: 1 profile, 1 script. This device is back at its starting set.`, { timeout: 30_000 });
  expect(await owner(a.page)).toMatch(/synced/);
  // The profile and the script moved; the device's settings were copied as the account's own (stage 62, ADR 0152).
  expect(server.items(NAME).all().filter((i) => i.kind === 'profile' || i.kind === 'script')).toHaveLength(2);
  expect(await names(a.page, 'webcockpit')).toEqual(['default', 'khazdul']);
  expect(await names(a.page, 'webcockpit', 'scripts')).toEqual([]);
  expect(await names(a.page, DB)).toEqual(['default', 'khazdul', 'warrior']);
  // The message line took more than one line, and About moved down for it.
  expect(await menuFlash(a.page).evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(30);
  // The Account page: the sync section and the move's lasting line; the page scrolls.
  await account(a.page);
  await expect(frame(a.page).locator('[data-sync="synced"]')).toContainText('Synced');
  await expect(frame(a.page).locator('.wc-ac-sync-n')).toContainText('1 profile · 1 script');
  await expect(frame(a.page).locator('[data-moved]')).toHaveText('Moved here from this device when the account was made: 1 profile, 1 script.');
  await a.page.keyboard.press('Escape');

  // A second device logs in: the account's things, none of its own.
  const b = await device(browser, server);
  await openStart(b.page);
  await putIdb(b.page, 'webcockpit', 'profiles', [profile('b1', 'phoneonly')]);
  await logIn(b.page);
  await expect.poll(() => names(b.page, DB)).toEqual(['default', 'khazdul', 'warrior']);
  await expect.poll(() => names(b.page, DB, 'scripts')).toEqual(['hunt']);
  await b.page.keyboard.press('p');
  await expect(frame(b.page).locator('.wc-pl-row[data-name="warrior"]')).toBeVisible();
  await expect(frame(b.page).locator('.wc-pl-row[data-name="phoneonly"]')).toHaveCount(0);
  await b.page.keyboard.press('Escape');

  // Log out on A: everything is in the account; Enter logs out.
  await account(a.page);
  await btn(a.page, 'LOGOUT').click();
  await expect(dialog(a.page, 'ac-logout').locator('[data-logout="all"]')).toBeVisible({ timeout: 10_000 });
  await awayFromMenu(a.page);
  await a.page.keyboard.press('Enter');
  await expect(menuFlash(a.page)).toHaveText(`Logged out. Everything is in your account ${NAME}.`, { timeout: 30_000 });
  expect(await owner(a.page)).toBe('Guest · log in');
  expect(await a.page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain(DB);

  // B logs out too: its own thing is back.
  await account(b.page);
  await btn(b.page, 'LOGOUT').click();
  await expect(dialog(b.page, 'ac-logout').locator('[data-logout="all"]')).toBeVisible({ timeout: 10_000 });
  await awayFromMenu(b.page);
  await b.page.keyboard.press('Enter');
  await expect(menuFlash(b.page)).toContainText('Logged out.', { timeout: 30_000 });
  expect(await names(b.page, 'webcockpit')).toEqual(['default', 'khazdul', 'phoneonly']);
  expect(errors).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});

test('an edit on one device is on the other; the same profile changed on both keeps both, with the notice and the mark', async ({ browser }) => {
  const server = syncServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  const b = await device(browser, server);
  for (const d of [a, b]) {
    await openStart(d.page);
    await logIn(d.page);
  }
  await putIdb(a.page, DB, 'profiles', [profile('w1', 'warrior', '#nop one')]);
  await account(a.page);
  await syncNow(a.page);
  await account(b.page);
  await syncNow(b.page);
  await expect.poll(() => names(b.page, DB)).toContain('warrior');

  // Both change it; A's reaches the server first.
  await putIdb(a.page, DB, 'profiles', [profile('w1', 'warrior', '#nop from A', 2000)]);
  await putIdb(b.page, DB, 'profiles', [profile('w1', 'warrior', '#nop from B', 2001)]);
  await syncNow(a.page);
  await syncNow(b.page);
  const bNames = await names(b.page, DB);
  const copy = bNames.find((n) => n.startsWith('warrior_from_'));
  expect(copy).toMatch(/^warrior_from_Chrome_\d+[A-Z][a-z]{2}$|^warrior_from_Firefox_\d+[A-Z][a-z]{2}$/);
  // The notice waits for the start menu.
  await b.page.keyboard.press('Escape');
  await expect(menuFlash(b.page)).toHaveText(`warrior was changed on two devices. Both are kept: warrior and ${copy}.`);
  // The mark on the new copy in the Profile list, until it is opened.
  await b.page.keyboard.press('p');
  await expect(frame(b.page).locator(`.wc-pl-row[data-name="${copy}"] [data-kept-both]`)).toHaveText('kept both');
  await expect(frame(b.page).locator('.wc-pl-row[data-name="warrior"] [data-kept-both]')).toHaveCount(0);
  // A gets both.
  await syncNow(a.page);
  expect(await names(a.page, DB)).toContain(copy!);
  await a.ctx.close();
  await b.ctx.close();
});

test('a lost session: kept locked with a change (Remove asks), removed without one; a login to the same account unlocks', async ({ browser }) => {
  const server = syncServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  await openStart(a.page);
  await logIn(a.page);
  await putIdb(a.page, DB, 'profiles', [profile('w1', 'warrior')]);
  // The password is changed elsewhere before the change reaches the server.
  server.endSessions(NAME, 'password');
  await a.page.reload();
  await expect.poll(() => owner(a.page), { timeout: 30_000 }).toMatch(/logged out here/);
  const notice = a.page.locator('.wc-start .wc-sm-lock');
  await expect(notice).toContainText(`1 change is not in the account ${NAME} yet. It is kept on this device until you log in.`);
  // Remove asks first, Keep is the default.
  await a.page.keyboard.press('r');
  await expect(dialog(a.page, 'remove-copy')).toContainText('the profile warrior');
  await expect(dialog(a.page, 'remove-copy')).toContainText(`To keep them, log in to ${NAME} instead.`);
  await a.page.keyboard.press('Enter');
  await expect(dialog(a.page, 'remove-copy')).toHaveCount(0);
  await expect(notice).toBeVisible();
  // Log in (L): the same copy, opened again and synced.
  await a.page.keyboard.press('l');
  await expect(pageOf(a.page, 'login')).toBeVisible();
  await expect(field(a.page, 'name')).toHaveValue(NAME);
  await submitLogin(a.page);
  await expect.poll(() => server.items(NAME).all().filter((i) => i.kind === 'profile').length).toBe(1);

  // Lost again, with everything in the account: removed, and said.
  server.endSessions(NAME, 'ended');
  await a.page.reload();
  await expect(menuFlash(a.page)).toHaveText(`You were logged out of ${NAME} on this device.`, { timeout: 30_000 });
  expect(await owner(a.page)).toBe('Guest · log in');

  // Lost with a change, then Remove.
  await logIn(a.page);
  await putIdb(a.page, DB, 'profiles', [profile('m1', 'mage')]);
  server.endSessions(NAME, 'recovered');
  await a.page.reload();
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await a.page.keyboard.press('r');
  await dialog(a.page, 'remove-copy').locator('[data-btn="REMOVE"]').click();
  await expect(notice).toHaveCount(0);
  expect(await owner(a.page)).toBe('Guest · log in');
  expect(await a.page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain(DB);
  await a.ctx.close();
});

test('log out with a change the server has not got: the rows, Stay logged in; refused while a game runs in another tab', async ({ browser }) => {
  const server = syncServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  await openStart(a.page);
  await logIn(a.page);
  await expect.poll(() => owner(a.page), { timeout: 30_000 }).toMatch(/synced/);
  await account(a.page);
  // Round 10's 3a: what follows the account, this device first; synced, the page still shows whole at 1440 × 900
  // (Leaving's buttons inside the body's view without a scroll; only the empty message line under them is not).
  await expect(frame(a.page).locator('[data-sync="synced"]')).toBeVisible();
  await expect(frame(a.page).locator('[data-follows]')).toHaveText(
    'Follows the account: profiles, scripts, settings for desktop (this device), tablet and phone, script data, Comm history (7 days), timers.',
  );
  const box = (await frame(a.page).locator('.wc-lk-box').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  const view = (await frame(a.page).locator('.wc-ac-body').boundingBox())!;
  expect(await frame(a.page).locator('.wc-ac-body').evaluate((el) => el.scrollTop)).toBe(0);
  for (const id of ['LOGOUT', 'DELETE']) {
    const b = (await btn(a.page, id).boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(view.y + view.height);
  }
  // The dialog asks again at the last moment: a game that starts after it opened refuses the log out too.
  await btn(a.page, 'LOGOUT').click();
  await expect(dialog(a.page, 'ac-logout').locator('[data-logout="all"]')).toBeVisible({ timeout: 30_000 });
  // A game on the account's space elsewhere: its Web Lock is held.
  await a.page.evaluate((name) => {
    void navigator.locks.request(name, { mode: 'shared' }, () => new Promise(() => {}));
  }, `webcockpit-game@u-${NAME.toLowerCase()}`);
  await a.page.keyboard.press('Enter');
  await expect(dialog(a.page, 'ac-logout').locator('[data-logout="refused"]')).toHaveText('A game is running in another tab.');
  await a.page.keyboard.press('Enter');
  await expect(dialog(a.page, 'ac-logout')).toHaveCount(0);
  await btn(a.page, 'LOGOUT').click();
  // (This page holds the lock itself here, as a stand-in for the other tab: it holds no game lock of its own.)
  await expect(dialog(a.page, 'ac-logout').locator('[data-logout="refused"]')).toHaveText('A game is running in another tab.');
  await a.page.keyboard.press('Enter');
  await expect(dialog(a.page, 'ac-logout')).toHaveCount(0);
  // Delete account too.
  await btn(a.page, 'DELETE').click();
  await expect(dialog(a.page, 'ac-delete').locator('[data-delete="refused"]')).toHaveText('A game is running in another tab.');
  await a.page.keyboard.press('Enter');
  await expect(dialog(a.page, 'ac-delete')).toHaveCount(0);
  await a.page.reload();
  await expect.poll(() => owner(a.page), { timeout: 30_000 }).toMatch(/synced/);

  server.syncOffline = true;
  await putIdb(a.page, DB, 'profiles', [profile('w1', 'warrior')]);
  await account(a.page);
  await btn(a.page, 'LOGOUT').click();
  const rows = dialog(a.page, 'ac-logout').locator('[data-logout="some"]');
  await expect(rows).toBeVisible({ timeout: 30_000 });
  await expect(rows.locator('[data-row="changes"]')).toHaveText('1 change not synced (the server could not be reached)1 profile');
  // Round 10's 1a: the kinds on a quieter second line, under the first.
  const first = await rows.locator('[data-row="changes"] > span > span').first().boundingBox();
  const kinds = rows.locator('[data-row="changes"] [data-kinds]');
  await expect(kinds).toHaveText('1 profile');
  expect((await kinds.boundingBox())!.y).toBeGreaterThanOrEqual(first!.y + first!.height - 1);
  await a.page.keyboard.press('Enter');
  await expect(dialog(a.page, 'ac-logout')).toHaveCount(0);
  await expect(pageOf(a.page, 'account')).toBeVisible();
  // Offline is the state now.
  await expect(frame(a.page).locator('[data-sync="offline"]')).toContainText('1 change waits on this device.');
  await expect(frame(a.page).locator('[data-follows]')).toContainText('settings for desktop (this device)');
  await a.ctx.close();
});

test('Delete account hands the account’s things back to the device', async ({ browser }) => {
  const server = syncServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  await openStart(a.page);
  await putIdb(a.page, 'webcockpit', 'profiles', [profile('d1', 'warrior', '#nop device')]);
  await logIn(a.page);
  await putIdb(a.page, DB, 'profiles', [profile('w1', 'warrior', '#nop account'), profile('m1', 'mage')]);
  await putIdb(a.page, DB, 'runs', [{ runId: 'run-acc', character: 'Acc', startedUs: 1, saved: true }]);
  await account(a.page);
  await syncNow(a.page);
  await btn(a.page, 'DELETE').click();
  const dlg = dialog(a.page, 'ac-delete');
  await expect(dlg.locator('[data-delete="handback"]')).toHaveText(
    `What happens on this device: your profiles, scripts and runs in ${NAME} come back to this device as its own. A name that exists on both sides keeps both.`,
  );
  await field(a.page, 'password').fill(PASSWORD);
  await field(a.page, 'confirm').fill(NAME);
  await dlg.locator('[data-btn="DELETE"]').click();
  await expect(menuFlash(a.page)).toHaveText(`The account ${NAME} is deleted. Its profiles, scripts and runs are this device’s now.`, { timeout: 20_000 });
  expect(await names(a.page, 'webcockpit')).toEqual(['default', 'khazdul', 'mage', 'warrior', 'warrior_2']);
  expect((await getIdb(a.page, 'webcockpit', 'runs')).map((r) => r.runId)).toEqual(['run-acc']);
  await a.ctx.close();
});
