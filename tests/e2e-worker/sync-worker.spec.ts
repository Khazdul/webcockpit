// Stage 61 part C: the sync's flows on two browser contexts (two devices)
// against a real local Worker with a local D1 (playwright.sync-worker.config.ts,
// `npm run test:sync-worker`). One account, made in this run (the address
// may make three an hour), lives through all of it: Create account with
// things, a second device logs in and has them, an edit goes across, the
// same profile changed on both keeps both, a lost session with and without
// a change not in the account (locked, unlocked by a login), log out, and
// Delete account handing the things back.

import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test';
import { PASSWORD, btn, dialog, field, fillCreate, frame, link, openAccount, openStart, pageOf, shownCode, watchErrors } from '../e2e/account-pages';
import { account, awayFromMenu, logIn, menuFlash, names, owner, profile, putIdb, spaceDbOf, submitLogin, syncNow } from '../e2e/sync-pages';
import { stubTurnstile } from '../e2e/turnstile-stub';

test.use({ viewport: { width: 1440, height: 900 } });

async function device(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await stubTurnstile(page, { auto: true });
  return { ctx, page };
}

test('two devices of one account on the real Worker: move, edit, keep both, lost session, log out, delete', async ({ browser }) => {
  const name = `sync${Date.now().toString(36).slice(-6)}`;
  const DB = spaceDbOf(name);
  const a = await device(browser);
  const errors = watchErrors(a.page);
  await openStart(a.page);
  await expect.poll(() => names(a.page, 'webcockpit')).toEqual(['default', 'khazdul']);
  await putIdb(a.page, 'webcockpit', 'profiles', [profile('w1', 'warrior')]);
  await putIdb(a.page, 'webcockpit', 'scripts', [{ id: 's1', name: 'hunt', source: '-- @name hunt\nprint(1)', enabled: false, created: 1, updated: 1 }]);

  // Create account on A: the move.
  await openAccount(a.page);
  await link(a.page, 'create').click();
  await fillCreate(a.page, name);
  await expect(btn(a.page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(a.page, 'CREATE').click();
  await expect(pageOf(a.page, 'code')).toBeVisible({ timeout: 30_000 });
  const code = await shownCode(a.page);
  await field(a.page, 'last').fill(code.slice(-4));
  await awayFromMenu(a.page);
  await field(a.page, 'last').press('Enter');
  await expect(menuFlash(a.page)).toHaveText(`Moved into ${name}: 1 profile, 1 script. This device is back at its starting set.`, { timeout: 30_000 });
  expect(await names(a.page, 'webcockpit')).toEqual(['default', 'khazdul']);

  // B logs in: the account's things, none of its own.
  const b = await device(browser);
  await openStart(b.page);
  await putIdb(b.page, 'webcockpit', 'profiles', [profile('b1', 'phoneonly')]);
  await logIn(b.page, name);
  await expect.poll(() => names(b.page, DB)).toEqual(['default', 'khazdul', 'warrior']);
  await expect.poll(() => names(b.page, DB, 'scripts')).toEqual(['hunt']);

  // An edit on A reaches B.
  await putIdb(a.page, DB, 'profiles', [profile('w1', 'warrior', '#nop edited on A', 2000)]);
  await account(a.page);
  await syncNow(a.page);
  await account(b.page);
  await syncNow(b.page);
  const warriorOnB = async (): Promise<unknown> => (await (await import('../e2e/sync-pages')).getIdb(b.page, DB, 'profiles')).find((p) => p.name === 'warrior')?.text;
  await expect.poll(warriorOnB).toBe('#nop edited on A');

  // The same profile changed on both: keep both.
  await putIdb(a.page, DB, 'profiles', [profile('w1', 'warrior', '#nop A again', 3000)]);
  await putIdb(b.page, DB, 'profiles', [profile('w1', 'warrior', '#nop B', 3001)]);
  await syncNow(a.page);
  await syncNow(b.page);
  const copy = (await names(b.page, DB)).find((n) => n.startsWith('warrior_from_'));
  expect(copy).toBeDefined();
  await b.page.keyboard.press('Escape');
  await expect(menuFlash(b.page)).toHaveText(`warrior was changed on two devices. Both are kept: warrior and ${copy}.`);
  await syncNow(a.page);
  expect(await names(a.page, DB)).toContain(copy!);

  // A lost session with a change not in the account: A ends B's session; B keeps its copy locked.
  await putIdb(b.page, DB, 'profiles', [profile('m1', 'mage')]);
  const endB = async (): Promise<void> => {
    await a.page.keyboard.press('Escape');
    await account(a.page);
    await frame(a.page).locator('.wc-ac-dev[data-session="other"] [data-btn="END"]').first().click();
    await dialog(a.page, 'ac-end').locator('[data-btn="END"]').click();
    await expect(frame(a.page).locator('.wc-ac-dev[data-session="other"]')).toHaveCount(0);
  };
  await endB();
  await awayFromMenu(b.page);
  await b.page.reload();
  await expect.poll(() => owner(b.page), { timeout: 20_000 }).toMatch(/logged out here/);
  await expect(b.page.locator('.wc-start .wc-sm-lock')).toContainText(`1 change is not in the account ${name} yet.`);
  // A login to the same account unlocks it and syncs the change.
  await b.page.keyboard.press('l');
  await expect(field(b.page, 'name')).toHaveValue(name);
  await submitLogin(b.page, name);
  await syncNow(a.page);
  expect(await names(a.page, DB)).toContain('mage');

  // Lost again with everything in the account: removed, and said; B's own thing is back.
  await endB();
  await awayFromMenu(b.page);
  await b.page.reload();
  await expect(menuFlash(b.page)).toHaveText(`You were logged out of ${name} on this device.`, { timeout: 20_000 });
  expect(await names(b.page, 'webcockpit')).toEqual(['default', 'khazdul', 'phoneonly']);

  // Log out on A, and log in again: the device's starting set, then the account's things.
  await a.page.keyboard.press('Escape');
  await account(a.page);
  await btn(a.page, 'LOGOUT').click();
  await expect(dialog(a.page, 'ac-logout').locator('[data-logout="all"]')).toBeVisible({ timeout: 15_000 });
  await awayFromMenu(a.page);
  await a.page.keyboard.press('Enter');
  await expect(menuFlash(a.page)).toHaveText(`Logged out. Everything is in your account ${name}.`, { timeout: 20_000 });
  expect(await names(a.page, 'webcockpit')).toEqual(['default', 'khazdul']);
  await logIn(a.page, name);
  await expect.poll(() => names(a.page, DB)).toEqual(['default', 'khazdul', 'mage', 'warrior', copy!].sort());

  // Delete account on A: its things become the device's.
  await account(a.page);
  await btn(a.page, 'DELETE').click();
  await field(a.page, 'password').fill(PASSWORD);
  await field(a.page, 'confirm').fill(name);
  await dialog(a.page, 'ac-delete').locator('[data-btn="DELETE"]').click();
  await expect(menuFlash(a.page)).toHaveText(`The account ${name} is deleted. Its profiles, scripts and runs are this device’s now.`, { timeout: 30_000 });
  expect(await names(a.page, 'webcockpit')).toEqual(['default', 'khazdul', 'mage', 'warrior', copy!].sort());
  expect(await names(a.page, 'webcockpit', 'scripts')).toEqual(['hunt']);
  expect(errors).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});
