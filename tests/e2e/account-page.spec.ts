// Stage 60 part B (spec §7.2): the Account page and its dialogs on a
// desktop, against the fake of the account API (cloud-account-fake.ts)
// and the fake Turnstile, with `?cloudtest`. The other account pages:
// account-pages.spec.ts; the phone and the tablet:
// phone-account-page.spec.ts.
//
// - What the page shows for a fresh account, and what it does not show
//   yet (sync, storage, notices, the safety copy).
// - Devices: listed, this device first; a label is text; End, End all
//   others.
// - Change password, New recovery code (the gate, and the answer that was
//   lost), Delete account, Log out with the server down.
// - The session gone while the page is open; logged out in another tab;
//   a log out that overtakes the page's own question.
// - The keyboard alone.
//
// With `WC_ACCOUNT_SHOTS=1` the page and each dialog are saved as
// pictures (account-pages.ts `shot`).
import { type Page, expect, test } from '@playwright/test';
import {
  DESKTOP,
  NAME,
  PASSWORD,
  PASSWORD_2,
  accountRow,
  accountUnder,
  btn,
  dialog,
  dialogError,
  field,
  fieldNote,
  fillCreate,
  formError,
  frame,
  link,
  logOut,
  openAccount,
  pageOf,
  shot,
  shownCode,
  watchErrors,
} from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { passTurnstile, stubTurnstile } from './turnstile-stub';

test.use({ viewport: DESKTOP });

const DAY = 86_400_000;
const SHOTS = process.env.WC_ACCOUNT_SHOTS === '1';
const rows = (page: Page) => frame(page).locator('.wc-ac-dev');
const flash = (page: Page) => frame(page).locator('.wc-lk-flash');
const menuFlash = (page: Page) => page.locator('.wc-start .wc-sm-flash');
const selected = /\bis-sel\b/;

/** From the start page to the Account page of a seeded account. */
async function logIn(page: Page, password = PASSWORD): Promise<void> {
  await openAccount(page);
  await field(page, 'name').fill(NAME);
  await field(page, 'password').fill(password);
  await btn(page, 'LOGIN').click();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-head-since')).toContainText('Account since');
}

/** The Account page again from the start menu (it asks the server anew). */
async function reopen(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText(`(${NAME})`);
  await page.keyboard.press('u');
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-head-since')).toContainText('Account since');
}

test('a fresh account: the name, one device, the four groups; nothing of what does not exist yet; no scrolling', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);

  const acct = pageOf(page, 'account');
  await expect(frame(page).locator('[data-account-name]')).toHaveText(NAME);
  await expect(frame(page).locator('.wc-lk-sec')).toHaveText(['Devices', 'Password and recovery', 'Leaving']);
  // One device, marked, with when it logged in and nothing to end.
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAttribute('data-session', 'current');
  await expect(rows(page).first().locator('.wc-ac-dev-this')).toHaveText('this device');
  await expect(rows(page).first().locator('.wc-ac-dev-t')).toHaveText(/^Logged in \S.*\d{4}/);
  await expect(btn(page, 'END')).toHaveCount(0);
  await expect(btn(page, 'ENDALL')).toHaveCount(0);
  for (const id of ['PASSWORD', 'RECOVERY', 'LOGOUT', 'DELETE']) await expect(btn(page, id)).toBeVisible();
  await expect(acct).toContainText('Both ask for your password.');
  await expect(frame(page).locator('[data-suspended]')).toHaveCount(0);
  // Delete account is last, red, small, and has no key letter.
  await expect(btn(page, 'DELETE')).toHaveClass(/\bis-danger\b/);
  await expect(btn(page, 'DELETE')).toHaveClass(/\bis-small\b/);
  await expect(btn(page, 'DELETE')).not.toHaveAttribute('aria-keyshortcuts');
  const all = await acct.locator('[data-btn]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.btn));
  expect(all).toEqual(['PASSWORD', 'RECOVERY', 'LOGOUT', 'DELETE']);

  // Later stages' things are not here: sync, storage, notices, the safety copy, downloads.
  await expect(acct).not.toContainText(/sync|storage|\bMB\b|notice|gallery|safety|download|backup/i);
  await expect(acct.locator('.wc-lk-toggle')).toHaveCount(0);
  expect(server.requests('PATCH /api/u/account/prefs')).toHaveLength(0);

  // The box is whole inside the window and nothing scrolls.
  const box = (await frame(page).locator('.wc-lk-box').boundingBox())!;
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThan(DESKTOP.height);
  expect(await frame(page).locator('.wc-ac-body').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await shot(page, 'acct-fresh', 'desktop');
  expect(errors).toEqual([]);
});

test('a suspended account says so in one line', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD, { state: 'suspended' });
  await fakeAccountApi(page, { server });
  await logIn(page);
  await expect(frame(page).locator('[data-suspended]')).toHaveText('This account is suspended. It cannot publish runs or comment. Everything else works as before.');
});

test('devices: listed with this device first; a label is text; End one, End all others', async ({ page }) => {
  const errors = watchErrors(page);
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  // (40 characters: the longest label the server keeps.)
  const markup = '<img src=x onerror=alert(1)><b>&amp;</b>';
  server.addSession(NAME, 'Chrome on Windows', { madeAgo: 40 * DAY, usedAgo: 36 * DAY });
  server.addSession(NAME, 'Safari on iPhone', { madeAgo: 9 * DAY, usedAgo: 3.4 * DAY });
  server.addSession(NAME, markup, { madeAgo: 2 * DAY, usedAgo: 1.2 * DAY });
  await fakeAccountApi(page, { server });
  await logIn(page);

  // This device first, then the latest used first.
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).locator('[data-label]')).toHaveText([/ on /, markup, 'Safari on iPhone', 'Chrome on Windows']);
  await expect(rows(page).nth(0)).toHaveAttribute('data-session', 'current');
  await expect(rows(page).nth(0).locator('[data-btn]')).toHaveCount(0);
  // Times by the day, never finer (the server writes the last use once a day).
  await expect(rows(page).nth(1).locator('.wc-ac-dev-t')).toHaveText(/ · last used about a day ago$/);
  await expect(rows(page).nth(2).locator('.wc-ac-dev-t')).toHaveText(/^Logged in .* · last used about 3 days ago$/);
  await expect(rows(page).nth(3).locator('.wc-ac-dev-t')).toHaveText(/ · last used about 5 weeks ago$/);
  // The label with markup characters is text: no element came of it, nothing ran.
  await expect(rows(page).locator('img, b')).toHaveCount(0);
  await expect(btn(page, 'ENDALL')).toBeVisible();
  await expect(rows(page).locator('[data-btn="END"]')).toHaveCount(3);
  await shot(page, 'acct', 'desktop');

  // End the one with the markup label: the dialog names it, as text too.
  await rows(page).nth(1).locator('[data-btn="END"]').click();
  await expect(dialog(page, 'ac-end')).toBeVisible();
  await expect(dialog(page, 'ac-end').locator('.wc-lk-q')).toHaveText(`End the session on ${markup}?`);
  await expect(dialog(page, 'ac-end').locator('img')).toHaveCount(0);
  await expect(dialog(page, 'ac-end')).toContainText('That device is logged out. The data on it stays there, and it can log in again with the password.');
  // Cancel first (Esc): nothing is ended.
  await page.keyboard.press('Escape');
  await expect(pageOf(page, 'account')).toBeVisible();
  expect(server.sessionLabels(NAME)).toHaveLength(4);
  await rows(page).nth(1).locator('[data-btn="END"]').click();
  await btn(page, 'END').click();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(flash(page)).toHaveText('The session is ended.');
  await expect(rows(page)).toHaveCount(3);
  expect(server.sessionLabels(NAME)).not.toContain(markup);

  // E is the first other row's End (Safari), Enter its dialog's lit button.
  await page.keyboard.press('e');
  await expect(dialog(page, 'ac-end').locator('.wc-lk-q')).toHaveText('End the session on Safari on iPhone?');
  await shot(page, 'd-end', 'desktop');
  await page.keyboard.press('Escape');

  // End all others.
  await btn(page, 'ENDALL').click();
  await expect(dialog(page, 'ac-endall').locator('.wc-lk-q')).toHaveText('End the sessions on the 2 other devices?');
  await expect(dialog(page, 'ac-endall')).toContainText('Only this device stays logged in. Do this if a device is lost; then change the password.');
  await expect(btn(page, 'END')).toHaveText('End 2 sessions');
  await shot(page, 'd-endall', 'desktop');
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(flash(page)).toHaveText('The other sessions are ended.');
  await expect(rows(page)).toHaveCount(1);
  await expect(btn(page, 'ENDALL')).toHaveCount(0);
  expect(server.sessionLabels(NAME)).toHaveLength(1);
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});

test('ending a session fails honestly when the server is not reached, and the dialog stays', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  server.addSession(NAME, 'Safari on iPhone');
  await fakeAccountApi(page, { server });
  await logIn(page);
  server.fail = 'offline';
  server.failWhen = (r) => r.method === 'DELETE';
  await rows(page).nth(1).locator('[data-btn="END"]').click();
  await btn(page, 'END').click();
  await expect(dialogError(page)).toHaveText('The server was not reached. Check the connection, then try again.');
  server.fail = 'rate_limited';
  await btn(page, 'END').click();
  await expect(dialogError(page)).toHaveText('Too many tries from this network. Wait a minute, then try again.');
  server.fail = 'unavailable';
  await btn(page, 'END').click();
  await expect(dialogError(page)).toContainText('The account service has a problem right now.');
  server.fail = null;
  await btn(page, 'END').click();
  await expect(flash(page)).toHaveText('The session is ended.');
  await expect(rows(page)).toHaveCount(1);
});

test('change password: a wrong current one, then the change; the other device is logged out and the new password logs in', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  server.addSession(NAME, 'Safari on iPhone');
  await fakeAccountApi(page, { server });
  if (SHOTS) {
    // Held a while, so that the Working state can be photographed.
    await page.route('**/api/u/account/password', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.fallback();
    });
  }
  await logIn(page);
  await expect(rows(page)).toHaveCount(2);

  await btn(page, 'PASSWORD').click();
  const dlg = dialog(page, 'ac-password');
  await expect(dlg).toBeVisible();
  await expect(field(page, 'current')).toBeFocused();
  for (const id of ['current', 'password', 'again']) await expect(field(page, id)).toHaveAttribute('type', 'password');
  await expect(field(page, 'current')).toHaveAttribute('autocomplete', 'current-password');
  await expect(field(page, 'password')).toHaveAttribute('autocomplete', 'new-password');
  await expect(dlg).toContainText('Your other devices are logged out. The recovery code stays the same.');
  await expect(fieldNote(page, 'password')).toHaveText('At least 10 characters. Not your MUME password.');
  await expect(btn(page, 'CHANGE')).toHaveAttribute('aria-disabled', 'true');
  // No key letters in a dialog with fields.
  await expect(dlg.locator('[aria-keyshortcuts]')).toHaveCount(0);
  await shot(page, 'd-password', 'desktop');

  // The same checks and the same strength hint as Create account.
  await field(page, 'current').fill('not the password');
  await field(page, 'password').fill('short');
  await field(page, 'again').fill('s');
  await expect(fieldNote(page, 'password')).toHaveText('5 characters: at least 10.');
  await field(page, 'password').fill(PASSWORD_2);
  await expect(frame(page).locator('[data-field="password"] [data-strength]')).toHaveAttribute('data-strength', 'fair');
  await field(page, 'again').fill(PASSWORD_2 + 'x');
  await expect(fieldNote(page, 'again')).toHaveText('The two passwords differ.');
  await expect(btn(page, 'CHANGE')).toHaveAttribute('aria-disabled', 'true');
  await field(page, 'again').fill(PASSWORD_2);
  await expect(btn(page, 'CHANGE')).not.toHaveAttribute('aria-disabled', 'true');

  // The current password is wrong: said once, the field cleared and focused, nothing changed.
  await btn(page, 'CHANGE').click();
  await expect(dialogError(page)).toHaveText('Wrong password.');
  await expect(field(page, 'current')).toHaveValue('');
  await expect(field(page, 'current')).toBeFocused();
  await expect(field(page, 'password')).toHaveValue(PASSWORD_2);
  expect(server.requests('POST /api/u/account/password')).toHaveLength(0);
  expect(server.sessionLabels(NAME)).toHaveLength(2);

  await page.keyboard.type(PASSWORD);
  await shot(page, 'd-password-filled', 'desktop');
  await page.keyboard.press('Enter');
  if (SHOTS) {
    await expect(frame(page).locator('.wc-ac-work[data-step="sending"]')).toBeVisible();
    await expect(dlg).toContainText('Two keys are made, one from the old password and one from the new: about twice as long as logging in.');
    await shot(page, 'd-password-working', 'desktop', { now: true });
  }
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(flash(page)).toHaveText('The password is changed. Your other devices were logged out.');
  await expect(rows(page)).toHaveCount(1);
  expect(server.sessionLabels(NAME)).toEqual([expect.stringMatching(/ on /)]);
  // Neither password ever reached the server.
  expect(server.saw(PASSWORD)).toBe(false);
  expect(server.saw(PASSWORD_2)).toBe(false);

  // Log out; the old password is refused, the new one logs in.
  await logOut(page);
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  await page.keyboard.press('u');
  await expect(pageOf(page, 'login')).toBeVisible();
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await expect(formError(page)).toHaveText('Wrong user name or password.');
  await page.keyboard.type(PASSWORD_2);
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'account')).toBeVisible();
  expect(errors).toEqual([]);
});

test('change password: the name locked by wrong tries elsewhere shows the wait', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);
  const origin = new URL(page.url()).origin;
  const other = server.browser();
  for (let i = 0; i < 10; i++) {
    other.request({
      method: 'POST',
      path: '/api/auth/login',
      search: '',
      headers: { 'x-wc': '1', origin, 'content-type': 'application/json' },
      body: JSON.stringify({ name: NAME, authKey: 'A'.repeat(43), label: 'Other device', turnstile: `lock-${i}-${Math.random()}` }),
      origin,
    });
  }
  await btn(page, 'PASSWORD').click();
  await field(page, 'current').fill(PASSWORD);
  await field(page, 'password').fill(PASSWORD_2);
  await field(page, 'again').fill(PASSWORD_2);
  await btn(page, 'CHANGE').click();
  const wait = frame(page).locator('.wc-ac-wait');
  await expect(wait).toBeVisible();
  await expect(wait.locator('.wc-ac-wait-n')).toHaveText(/^1[45]:\d\d$/);
  await expect(btn(page, 'CHANGE')).toHaveAttribute('aria-disabled', 'true');
  // Esc still closes the dialog.
  await page.keyboard.press('Escape');
  await expect(pageOf(page, 'account')).toBeVisible();
});

test('new recovery code: the password, the code behind the last-group gate; Recovery then works with the new code only', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  const { recoveryCode: oldCode } = await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  await logIn(page);

  await page.keyboard.press('r');
  const ask = dialog(page, 'ac-newcode');
  await expect(ask).toBeVisible();
  // Said before the button is pressed: the old code stops working.
  await expect(ask).toContainText('The old code stops working at once. The new one is shown once, as the first was.');
  await expect(field(page, 'password')).toBeFocused();
  await expect(btn(page, 'MAKE')).toHaveAttribute('aria-disabled', 'true');
  await shot(page, 'd-newcode', 'desktop');
  await page.keyboard.type('not the password');
  await page.keyboard.press('Enter');
  await expect(dialogError(page)).toHaveText('Wrong password.');
  await expect(field(page, 'password')).toHaveValue('');
  await expect(field(page, 'password')).toBeFocused();
  expect(server.requests('POST /api/u/account/recovery')).toHaveLength(0);
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');

  const shown = dialog(page, 'ac-newcode-shown');
  await expect(shown).toBeVisible();
  await expect(shown).toContainText('Your new recovery code. The old one has stopped working.');
  const code = await shownCode(page);
  expect(code).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
  expect(code).not.toBe(oldCode);
  await expect(field(page, 'last')).toBeFocused();
  await shot(page, 'd-newcode-shown', 'desktop');
  // The gate: Done is dead, and neither Esc nor Enter closes the dialog.
  await expect(btn(page, 'DONE')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await expect(shown).toBeVisible();
  // Tab: Copy, Download, back to the field (Done is not lit yet).
  await page.keyboard.press('Tab');
  await expect(btn(page, 'COPY')).toHaveClass(selected);
  await page.keyboard.press('Tab');
  await expect(btn(page, 'DOWNLOAD')).toHaveClass(selected);
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toBe(`webcockpit-recovery-code-${NAME}.txt`);
  await page.keyboard.press('Tab');
  await expect(field(page, 'last')).toBeFocused();
  await page.keyboard.type('zzzz');
  await expect(btn(page, 'DONE')).toHaveAttribute('aria-disabled', 'true');
  await field(page, 'last').fill(code.slice(-4).toLowerCase());
  await expect(btn(page, 'DONE')).not.toHaveAttribute('aria-disabled', 'true');
  // The code is nowhere but on the page.
  const kept = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, location.href]));
  expect(kept).not.toContain(code);
  expect(server.saw(code)).toBe(false);
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(flash(page)).toHaveText('The new recovery code is in use. The old one no longer works.');

  // Recovery: the old code is refused, the new one sets a password.
  await logOut(page);
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  await page.keyboard.press('u');
  await link(page, 'recover').click();
  await expect(pageOf(page, 'recover')).toBeVisible();
  await field(page, 'code').fill(oldCode);
  await field(page, 'password').fill(PASSWORD_2);
  await field(page, 'again').fill(PASSWORD_2);
  await expect(btn(page, 'SET')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'SET').click();
  await expect(formError(page)).toHaveText('Wrong user name or recovery code.');
  await field(page, 'code').fill(code);
  await expect(btn(page, 'SET')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'SET').click();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(flash(page)).toHaveText('The new password is set. Every other device was logged out.');
  expect(errors).toEqual([]);
});

test('new recovery code: the answer is lost; the dialog says the old code may be dead and makes a new one again', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);
  const before = server.stored(NAME)!.recoveryAuth;

  // The server takes the new code and its answer never arrives.
  let drop = true;
  await page.route('**/api/u/account/recovery', async (route) => {
    if (drop) server.dropNextAnswer = true;
    drop = false;
    await route.fallback();
  });
  await btn(page, 'RECOVERY').click();
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'MAKE').click();
  const lost = frame(page).locator('[data-plate="lost"]');
  await expect(lost).toBeVisible();
  await expect(lost).toContainText('Your old recovery code may no longer work, and the new one was not shown.');
  await expect(lost).toContainText('Make a new code again now');
  await expect(dialog(page, 'ac-newcode-shown')).toHaveCount(0);
  // It is true: the server holds a code nobody has seen.
  const unseen = server.stored(NAME)!.recoveryAuth;
  expect(unseen).not.toBe(before);
  // The password is still in the field, and the button offers the way out.
  await expect(field(page, 'password')).toHaveValue(PASSWORD);
  await expect(btn(page, 'MAKE')).toHaveText('Make a new code again');
  await shot(page, 'd-newcode-lost', 'desktop');
  await btn(page, 'MAKE').click();
  await expect(dialog(page, 'ac-newcode-shown')).toBeVisible();
  const code = await shownCode(page);
  expect(server.stored(NAME)!.recoveryAuth).not.toBe(unseen);
  await field(page, 'last').fill(code.slice(-4));
  await btn(page, 'DONE').click();
  await expect(pageOf(page, 'account')).toBeVisible();
});

test('new recovery code: not reached before anything was sent is a plain failure, the old code untouched', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);
  const before = server.stored(NAME)!.recoveryAuth;
  server.fail = 'offline';
  await btn(page, 'RECOVERY').click();
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'MAKE').click();
  await expect(dialogError(page)).toHaveText('The server was not reached. Check the connection, then try again.');
  await expect(frame(page).locator('[data-plate="lost"]')).toHaveCount(0);
  expect(server.stored(NAME)!.recoveryAuth).toBe(before);
});

test('delete account: the name typed wrong, a wrong password, then gone; the name cannot be registered again', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await stubTurnstile(page);
  await logIn(page);

  await btn(page, 'DELETE').click();
  const dlg = dialog(page, 'ac-delete');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.wc-lk-q')).toHaveText(`Delete the account ${NAME}?`);
  await expect(dlg).toContainText('What goes: the account and everything stored in it, at once and for good, and the login on every device.');
  await expect(dlg).toContainText(`The name ${NAME} can never be registered again, by you or anyone.`);
  await expect(dlg).toContainText('What stays: what is on this device. Your profiles, scripts and runs here are not touched.');
  await expect(field(page, 'password')).toBeFocused();
  // The cursor rests on Cancel; Delete is red, dead, and has no key letter.
  await expect(btn(page, 'CANCEL')).toHaveClass(selected);
  await expect(btn(page, 'DELETE')).toHaveClass(/\bis-danger\b/);
  await expect(btn(page, 'DELETE')).toHaveAttribute('aria-disabled', 'true');
  await expect(dlg.locator('[aria-keyshortcuts]')).toHaveCount(0);
  await shot(page, 'd-delete', 'desktop');

  // A wrong name: Delete stays dead, and the field says so once it is left.
  await field(page, 'password').fill('not the password');
  await field(page, 'confirm').fill('olaf');
  await field(page, 'password').focus();
  await expect(fieldNote(page, 'confirm')).toHaveText('That is not this account’s user name.');
  await expect(btn(page, 'DELETE')).toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'DELETE').click({ force: true });
  expect(server.requests('DELETE /api/u/account')).toHaveLength(0);
  // The right name (any case), a wrong password.
  await field(page, 'confirm').fill(NAME.toLowerCase());
  await expect(btn(page, 'DELETE')).not.toHaveAttribute('aria-disabled', 'true');
  await shot(page, 'd-delete-ready', 'desktop');
  await btn(page, 'DELETE').click();
  await expect(dialogError(page)).toHaveText('Wrong password.');
  await expect(field(page, 'password')).toHaveValue('');
  await expect(field(page, 'password')).toBeFocused();
  expect(server.hasAccount(NAME)).toBe(true);
  // The page under the dialog is still the account's.
  await expect(accountUnder(page)).toHaveCount(1);

  await page.keyboard.type(PASSWORD);
  await btn(page, 'DELETE').click();
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  await expect(menuFlash(page)).toHaveText(`The account ${NAME} is deleted. What is on this device is untouched.`);
  expect(server.hasAccount(NAME)).toBe(false);
  expect(server.saw(PASSWORD)).toBe(false);
  // Logged out locally, and the name is not offered again.
  expect(await page.evaluate(() => [localStorage.getItem('wc.account'), localStorage.getItem('wc.account.last')])).toEqual([null, null]);
  await page.keyboard.press('u');
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(field(page, 'name')).toHaveValue('');

  // The name is reserved for good.
  await link(page, 'create').click();
  await expect(pageOf(page, 'create')).toBeVisible();
  await fillCreate(page, NAME, PASSWORD);
  await passTurnstile(page);
  await btn(page, 'CREATE').click();
  await expect(fieldNote(page, 'name')).toHaveText(`The name ${NAME} is taken. Try another.`);
  expect(errors).toEqual([]);
});

test('log out: a plain confirm; with the server down the device is logged out anyway and the page says what that means', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);

  await btn(page, 'LOGOUT').click();
  const dlg = dialog(page, 'ac-logout');
  await expect(dlg.locator('.wc-lk-q')).toHaveText(`Log out of ${NAME} on this device?`);
  await expect(dlg.locator('.wc-lk-qn')).toHaveText('Your profiles, scripts and runs on this device stay as they are.');
  // No keep / remove choice yet.
  await expect(dlg.locator('[role="radio"], [role="radiogroup"]')).toHaveCount(0);
  await expect(btn(page, 'OUT')).toHaveAttribute('aria-keyshortcuts', 'L');
  await expect(btn(page, 'CANCEL')).toHaveAttribute('aria-keyshortcuts', 'C');
  await shot(page, 'd-logout', 'desktop');
  // C cancels.
  await page.keyboard.press('c');
  await expect(pageOf(page, 'account')).toBeVisible();
  expect(server.sessionLabels(NAME)).toHaveLength(1);

  server.fail = 'offline';
  await logOut(page);
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-notice')).toHaveText(
    'Logged out on this device. The server was not reached, so this session may still be listed on your other devices until it is ended there or runs out.',
  );
  expect(await page.evaluate(() => localStorage.getItem('wc.account'))).toBeNull();
  // The server still has the session.
  expect(server.sessionLabels(NAME)).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  expect(errors).toEqual([]);
});

test('the session gone while the page is open: a dialog\'s try sends the player to Log in and says why', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  server.addSession(NAME, 'Safari on iPhone');
  await fakeAccountApi(page, { server });
  await logIn(page);
  // Ended from another device.
  server.endSessions(NAME);
  await page.keyboard.press('o');
  await expect(dialog(page, 'ac-endall')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-notice')).toContainText('You were logged out here');
  await expect(field(page, 'name')).toHaveValue(NAME);
  // Nothing of the dialog or the Account page is left under Log in.
  await expect(page.locator('.wc-start [data-dlg]')).toHaveCount(0);
  await expect(accountUnder(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
});

test('the session gone while Change password is filled in: Log in, and no password is left on the page', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);
  await btn(page, 'PASSWORD').click();
  await field(page, 'current').fill(PASSWORD);
  await field(page, 'password').fill(PASSWORD_2);
  await field(page, 'again').fill(PASSWORD_2);
  server.endSessions(NAME);
  await btn(page, 'CHANGE').click();
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-notice')).toContainText('You were logged out here');
  await expect(field(page, 'password')).toHaveValue('');
  expect(await page.locator('input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).not.toContain(PASSWORD_2);
});

test('two tabs: logged out in the other one, this page leaves and says so', async ({ context, page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  const api = await fakeAccountApi(page, { server });
  await logIn(page);
  // A dialog is open in this tab when it happens.
  await btn(page, 'PASSWORD').click();
  await expect(dialog(page, 'ac-password')).toBeVisible();
  await field(page, 'current').fill(PASSWORD);

  // The other tab is the same browser: the same storage, the same cookie.
  const other = await context.newPage();
  const api2 = await fakeAccountApi(other, { server });
  api2.browser.cookie = api.browser.cookie;
  await other.goto(page.url());
  await expect(accountRow(other).locator('.wc-sm-note')).toHaveText(`(${NAME})`);
  await accountRow(other).click();
  await expect(pageOf(other, 'account')).toBeVisible();
  await logOut(other);
  await expect(accountRow(other).locator('.wc-sm-note')).toHaveText('(log in)');

  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  await expect(menuFlash(page)).toHaveText('Logged out in another tab.');
  await expect(page.locator('.wc-start [data-dlg]')).toHaveCount(0);
  await expect(accountUnder(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a log out wins over the page\'s own question to the server', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);
  await page.keyboard.press('Escape');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText(`(${NAME})`);
  // The session is gone on the server, and the page's question about it is slow.
  server.endSessions(NAME);
  await page.route('**/api/u/account', async (route) => {
    if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 700));
    await route.fallback();
  });
  await page.keyboard.press('u');
  await expect(pageOf(page, 'account')).toBeVisible();
  await page.keyboard.press('l');
  await expect(dialog(page, 'ac-logout')).toBeVisible();
  await page.keyboard.press('l');
  // The menu and "Logged out.", not Log in with "you were logged out".
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  await expect(menuFlash(page)).toHaveText('Logged out.');
  await page.waitForTimeout(900);
  await expect(page.locator('.wc-start [data-page="login"]')).toHaveCount(0);
});

test('the server not reached when the page opens: honest words and Try again', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);
  await page.keyboard.press('Escape');
  server.fail = 'unavailable';
  await page.keyboard.press('u');
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(formError(page)).toContainText('The account service has a problem right now. Nothing is wrong with your account or with what is on this device.');
  // The name is known from the device; leaving still works.
  await expect(frame(page).locator('[data-account-name]')).toHaveText(NAME);
  await expect(btn(page, 'LOGOUT')).toBeVisible();
  server.fail = null;
  await page.keyboard.press('t');
  await expect(rows(page)).toHaveCount(1);
  await expect(formError(page)).toHaveCount(0);
});

test('the keyboard alone: the page\'s buttons, a dialog with fields, and Enter never deletes by default', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  server.addSession(NAME, 'Safari on iPhone');
  await fakeAccountApi(page, { server });
  await openAccount(page);
  await page.keyboard.type(NAME);
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(rows(page)).toHaveCount(2);

  // Tab walks every button in order, round; Enter with no cursor does nothing.
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-start [data-dlg]')).toHaveCount(0);
  const order = ['ENDALL', 'END', 'PASSWORD', 'RECOVERY', 'LOGOUT', 'DELETE'];
  for (const id of order) {
    await page.keyboard.press('Tab');
    await expect(btn(page, id)).toHaveClass(selected);
    await expect(frame(page).locator('[data-btn].is-sel')).toHaveCount(1);
  }
  // The cursor on a device row marks the row too.
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await expect(rows(page).nth(1)).toHaveClass(/\bis-cur\b/);
  await page.keyboard.press('Shift+Tab');
  await expect(btn(page, 'ENDALL')).toHaveClass(selected);
  await page.keyboard.press('ArrowUp');
  await expect(btn(page, 'DELETE')).toHaveClass(selected);

  // Delete account by the keyboard: Enter opens it; the cursor rests on Cancel, and Enter there cancels.
  await page.keyboard.press('Enter');
  await expect(dialog(page, 'ac-delete')).toBeVisible();
  await expect(field(page, 'password')).toBeFocused();
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Tab');
  await expect(field(page, 'confirm')).toBeFocused();
  await page.keyboard.type(NAME);
  await expect(btn(page, 'DELETE')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(btn(page, 'CANCEL')).toHaveClass(selected);
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'account')).toBeVisible();
  expect(server.hasAccount(NAME)).toBe(true);
  expect(server.requests('DELETE /api/u/account')).toHaveLength(0);
  // Again: Tab, Tab reaches Cancel, a third Delete; Shift+Tab goes back; Esc closes.
  await page.keyboard.press('Enter');
  await expect(dialog(page, 'ac-delete')).toBeVisible();
  // (A new dialog: nothing of the last one's fields is left.)
  await expect(field(page, 'password')).toHaveValue('');
  await expect(field(page, 'confirm')).toHaveValue('');
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Tab');
  await page.keyboard.type(NAME);
  await page.keyboard.press('Tab');
  await expect(btn(page, 'CANCEL')).toHaveClass(selected);
  await expect(btn(page, 'DELETE')).not.toHaveClass(selected);
  await page.keyboard.press('Tab');
  await expect(btn(page, 'DELETE')).toHaveClass(selected);
  await expect(btn(page, 'CANCEL')).not.toHaveClass(selected);
  await page.keyboard.press('Shift+Tab');
  await expect(btn(page, 'CANCEL')).toHaveClass(selected);
  await page.keyboard.press('Shift+Tab');
  await expect(field(page, 'confirm')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pageOf(page, 'account')).toBeVisible();

  // Change password: P, the three fields with Tab, Enter.
  await page.keyboard.press('p');
  await expect(field(page, 'current')).toBeFocused();
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Tab');
  await expect(field(page, 'password')).toBeFocused();
  // A letter in a field is text, not a key of the page under the dialog.
  await page.keyboard.type(PASSWORD_2);
  await page.keyboard.press('Tab');
  await expect(field(page, 'again')).toBeFocused();
  await page.keyboard.type(PASSWORD_2);
  await page.keyboard.press('Tab');
  await expect(btn(page, 'CANCEL')).toHaveClass(selected);
  await page.keyboard.press('Tab');
  await expect(btn(page, 'CHANGE')).toHaveClass(selected);
  await page.keyboard.press('Tab');
  await expect(field(page, 'current')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(flash(page)).toHaveText('The password is changed. Your other devices were logged out.');
  await expect(rows(page)).toHaveCount(1);

  // Log out: L, the buttons walk with Tab and the arrows, Enter is the lit one.
  await page.keyboard.press('l');
  await expect(dialog(page, 'ac-logout')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(frame(page).locator('[data-btn].is-sel')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(pageOf(page, 'account')).toBeVisible();
  await page.keyboard.press('l');
  await page.keyboard.press('Enter');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  await expect(menuFlash(page)).toHaveText('Logged out.');
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------ after the review of the client (ADR 0145)

test('review 3c: a password change or a delete whose answer is lost says "may or may not", never "not reached"', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);
  const loseOnce = async (path: string, lose: 'connection' | 'body' | 'none'): Promise<void> => {
    await page.unroute('**/api/u/account/password');
    await page.unroute('**/api/u/account');
    let once = true;
    await page.route(path, async (route) => {
      // (`GET /api/u/account` is the page's own question: only the request that changes something is lost.)
      if (once && route.request().method() !== 'GET' && lose !== 'none') {
        once = false;
        server.loseNextAnswer = lose;
      }
      await route.fallback();
    });
  };

  // Change password: the connection drops after the request left. The server has changed it.
  await loseOnce('**/api/u/account/password', 'connection');
  await btn(page, 'PASSWORD').click();
  await field(page, 'current').fill(PASSWORD);
  await field(page, 'password').fill(PASSWORD_2);
  await field(page, 'again').fill(PASSWORD_2);
  await btn(page, 'CHANGE').click();
  await expect(dialogError(page)).toContainText('The change may or may not have been made.');
  await expect(dialogError(page)).toContainText('try the new password first');
  await expect(dialogError(page)).not.toContainText('was not reached');
  await page.keyboard.press('Escape');
  await expect(dialog(page, 'ac-password')).toHaveCount(0);

  // Delete account, the same (and the page's own question after it does not get through either, so the
  // dialog is still there to be read: with the server back, that question finds the session gone).
  await loseOnce('**/api/u/account', 'connection');
  await btn(page, 'DELETE').click();
  await field(page, 'password').fill(PASSWORD_2);
  await field(page, 'confirm').fill(NAME);
  server.fail = 'offline';
  server.failWhen = (req) => req.method === 'GET' && req.path === '/api/u/account' && !server.hasAccount(NAME);
  await btn(page, 'DELETE').last().click();
  await expect(dialogError(page)).toContainText('The account may or may not have been deleted');
  await expect(dialogError(page)).not.toContainText('was not reached');
  expect(server.hasAccount(NAME)).toBe(false);
  // Trying again finds the session gone: Log in says so.
  server.fail = null;
  await field(page, 'password').fill(PASSWORD_2);
  await btn(page, 'DELETE').last().click();
  await expect(pageOf(page, 'login')).toBeVisible();
});

test('review 4: the hint is gone and the keys are here (localStorage cleared): not a log out; the hint is put back', async ({ context, page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  const api = await fakeAccountApi(page, { server });
  await logIn(page);
  // Another tab of the same browser clears the storage: this tab hears a storage event with no key.
  const other = await context.newPage();
  const api2 = await fakeAccountApi(other, { server });
  api2.browser.cookie = api.browser.cookie;
  await other.goto(page.url());
  await other.evaluate(() => localStorage.clear());
  await expect.poll(() => page.evaluate(() => localStorage.getItem('wc.account'))).toBe(`{"name":"${NAME}"}`);
  await expect(pageOf(page, 'account')).toBeVisible();
  // The keys and the session are as they were.
  await reopen(page);
  expect(server.sessionLabels(NAME)).toHaveLength(1);

  // The hint removed with no event at all, and a reload: the row says "log in", the account pages know better.
  await page.evaluate(() => localStorage.removeItem('wc.account'));
  await openAccount(page);
  await expect(pageOf(page, 'account')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText(`(${NAME})`);
});

test('review 5: the session is another account\'s than the keys on this device: logged out, and Log in says why', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await seedAccount(server, 'Bera', PASSWORD_2);
  const api = await fakeAccountApi(page, { server });
  await logIn(page);
  // Bera's session in this browser's cookie (two tabs that logged in at once, or a cookie from elsewhere).
  const other = server.browser();
  const origin = new URL(page.url()).origin;
  other.request({
    method: 'POST',
    path: '/api/auth/login',
    search: '',
    headers: { 'x-wc': '1', origin, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Bera', authKey: server.stored('Bera')!.authKey, label: 'Other tab' }),
    origin,
  });
  expect(other.cookie).not.toBeNull();
  api.browser.cookie = other.cookie;
  await page.keyboard.press('Escape');
  await page.keyboard.press('u');
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-notice, [data-notice]').first()).toContainText('another account');
  await page.keyboard.press('Escape');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  // That session was ended too: nothing of Bera's is left open from here.
  expect(server.sessionLabels('Bera')).toEqual([]);
});

test('review 6: "End all others" with accounts switched off on the server fails honestly; it is not "ended"', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  server.addSession(NAME, 'Safari on iPhone');
  await fakeAccountApi(page, { server });
  await logIn(page);
  await btn(page, 'ENDALL').click();
  await expect(dialog(page, 'ac-endall')).toBeVisible();
  // (The page's config is in already: the flag only changes what the account endpoints answer, 404 `not_found`.)
  server.flags = { accounts: false };
  await btn(page, 'END').last().click();
  await expect(dialogError(page)).toHaveText('Accounts are switched off right now. Try again later.');
  await expect(dialog(page, 'ac-endall')).toBeVisible();
  await expect(flash(page)).toHaveCount(0);
  server.flags = { accounts: true };
  expect(server.sessionLabels(NAME)).toHaveLength(2);
});

test('review 7: a held or doubled letter does not answer the dialog it opened', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  server.addSession(NAME, 'Safari on iPhone');
  await fakeAccountApi(page, { server });
  await logIn(page);
  await expect(rows(page)).toHaveCount(2);

  // L held: Log out opens, and the repeats do not confirm it.
  await page.keyboard.down('l');
  await expect(dialog(page, 'ac-logout')).toBeVisible();
  for (let i = 0; i < 5; i++) await page.keyboard.down('l');
  await page.keyboard.up('l');
  await page.waitForTimeout(150);
  await expect(dialog(page, 'ac-logout')).toBeVisible();
  expect(server.sessionLabels(NAME)).toHaveLength(2);
  await page.keyboard.press('Escape');
  await expect(dialog(page, 'ac-logout')).toHaveCount(0);

  // L doubled (two quick presses): the second one is not the answer either.
  await page.keyboard.press('l');
  await page.keyboard.press('l');
  await expect(dialog(page, 'ac-logout')).toBeVisible();
  await page.waitForTimeout(150);
  await expect(dialog(page, 'ac-logout')).toBeVisible();
  expect(server.sessionLabels(NAME)).toHaveLength(2);
  await page.keyboard.press('Escape');

  // E for End session, the same.
  await page.keyboard.press('e');
  await page.keyboard.press('e');
  await expect(dialog(page, 'ac-end')).toBeVisible();
  await page.waitForTimeout(150);
  await expect(dialog(page, 'ac-end')).toBeVisible();
  expect(server.sessionLabels(NAME)).toHaveLength(2);
  // Another key answers at once (C: Cancel), and the letter itself does after a moment.
  await page.keyboard.press('c');
  await expect(dialog(page, 'ac-end')).toHaveCount(0);
  await page.keyboard.press('e');
  await expect(dialog(page, 'ac-end')).toBeVisible();
  await page.waitForTimeout(450);
  await page.keyboard.press('e');
  await expect(dialog(page, 'ac-end')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);

  // Enter held on a button: the dialog opens once and is not answered.
  for (const _ of [0, 1, 2]) await page.keyboard.press('Tab');
  await expect(btn(page, 'LOGOUT')).toHaveClass(selected);
  await page.keyboard.down('Enter');
  await expect(dialog(page, 'ac-logout')).toBeVisible();
  for (let i = 0; i < 4; i++) await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await page.waitForTimeout(150);
  await expect(dialog(page, 'ac-logout')).toBeVisible();
  expect(server.sessionLabels(NAME)).toHaveLength(1);
});

test('review 9: a new recovery code on screen is not closed by a log out in another tab; once its last group is typed the page follows', async ({ context, page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  const api = await fakeAccountApi(page, { server });
  await logIn(page);
  await btn(page, 'RECOVERY').click();
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'MAKE').click();
  await expect(dialog(page, 'ac-newcode-shown')).toBeVisible();
  const code = await shownCode(page);

  const other = await context.newPage();
  const api2 = await fakeAccountApi(other, { server });
  api2.browser.cookie = api.browser.cookie;
  await other.goto(page.url());
  await accountRow(other).click();
  await expect(pageOf(other, 'account')).toBeVisible();
  await logOut(other);
  await expect(accountRow(other).locator('.wc-sm-note')).toHaveText('(log in)');

  // This tab heard of it (the hint is gone here too) and the code is still up.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('wc.account'))).toBeNull();
  await page.waitForTimeout(300);
  await expect(dialog(page, 'ac-newcode-shown')).toBeVisible();
  expect(await shownCode(page)).toBe(code);
  // The last group typed: now the page leaves, and says why.
  await field(page, 'last').fill(code.slice(-4));
  await expect(menuFlash(page)).toHaveText('Logged out in another tab.');
  await expect(page.locator('.wc-start [data-dlg]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
