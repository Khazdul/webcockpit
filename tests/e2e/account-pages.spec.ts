// Stage 60 part B (spec §7.2): the Account entry on the start page and
// the pages Log in, Create account, the recovery code and Recovery, on a
// desktop. Against the fake of the account API (cloud-account-fake.ts)
// and the fake Turnstile (turnstile-stub.ts), with `?cloudtest`. The
// phone and the tablet: phone-account-pages.spec.ts.
//
// - Flag off (or no API): the start page is today's. No row, U does
//   nothing, nothing asks `/api/auth` or Cloudflare.
// - The row comes in after the menu is drawn without moving anything
//   under a resting pointer and without taking the cursor.
// - A whole life: create → the code page (copy, download, the last
//   group) → the Account page → log out → log in.
// - Every failure a page has words for that the fake can make.
//
// With `WC_ACCOUNT_SHOTS=1` the states are saved as pictures
// (account-pages.ts `shot`).
import { readFile } from 'node:fs/promises';
import { type Page, expect, test } from '@playwright/test';
import {
  DESKTOP,
  NAME,
  PASSWORD,
  PASSWORD_2,
  accountRow,
  btn,
  dialog,
  field,
  fieldNote,
  fillCreate,
  formError,
  frame,
  link,
  logOut,
  menuRows,
  openAccount,
  openStart,
  pageOf,
  selectedRow,
  settled,
  shot,
  shownCode,
  watchErrors,
  wrongLogins,
} from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { passTurnstile, stubTurnstile } from './turnstile-stub';

test.use({ viewport: DESKTOP });

const ROWS = ['enter', 'profile', 'scripts', 'history', 'spotlights', 'credits', 'about'];
const ROWS_ON = ['enter', 'profile', 'scripts', 'history', 'spotlights', 'account', 'credits', 'about'];
const keysOf = (page: Page) => menuRows(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key));
const origin = (page: Page): string => new URL(page.url()).origin;

/** Logs in through the page (from Log in, the fields empty or prefilled). */
async function logIn(page: Page, name = NAME, password = PASSWORD): Promise<void> {
  await field(page, 'name').fill(name);
  await field(page, 'password').fill(password);
  await btn(page, 'LOGIN').click();
}

test('flag off: the start page is as it was; no row, U does nothing, nothing asks the account API or Cloudflare', async ({ page }) => {
  const errors = watchErrors(page);
  const api = await fakeAccountApi(page);
  api.server.flags = { accounts: false };
  const ts = await stubTurnstile(page);
  const asked: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) asked.push(new URL(r.url()).pathname);
  });
  await openStart(page);
  // The flags are asked on idle time: wait for the answer, then a little more.
  await expect.poll(() => asked).toContain('/api/config');
  await page.waitForTimeout(300);
  expect(await keysOf(page)).toEqual(ROWS);
  await page.keyboard.press('u');
  await page.waitForTimeout(200);
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'enter');
  await expect(frame(page).locator('.wc-sm')).toBeVisible();
  expect(asked.filter((p) => p.startsWith('/api/auth') || p.startsWith('/api/u'))).toEqual([]);
  expect(api.server.seen).toEqual([]);
  expect(ts.loads()).toBe(0);
  expect(errors).toEqual([]);
});

test('no cloud test hook (an automated browser): no request to the API at all, and no row', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) asked.push(r.url());
  });
  const ts = await stubTurnstile(page);
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.waitForTimeout(1200);
  expect(await keysOf(page)).toEqual(ROWS);
  await page.keyboard.press('u');
  await expect(frame(page).locator('.wc-sm')).toBeVisible();
  expect(asked).toEqual([]);
  expect(ts.loads()).toBe(0);
});

test('the row comes in late: nothing moves under a resting pointer, the cursor stays, the box grows by one row', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeAccountApi(page);
  // The flags' answer is held back until the test lets it go.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/config', async (route) => {
    await held;
    await route.fallback();
  });
  await openStart(page);
  const panel = page.locator('.wc-start .wc-sm-panel');
  const before = (await panel.boundingBox())!;
  const rowBox = async (key: string) => (await page.locator(`.wc-start .wc-sm-item[data-key="${key}"]`).boundingBox())!;
  const creditsAt = await rowBox('credits');
  const spotAt = await rowBox('spotlights');

  // The pointer rests on Credits, which would move: the row waits.
  await page.mouse.move(creditsAt.x + 60, creditsAt.y + creditsAt.height / 2);
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'credits');
  release();
  await page.waitForTimeout(700);
  expect(await keysOf(page)).toEqual(ROWS);
  expect((await rowBox('credits')).y).toBe(creditsAt.y);

  // The pointer leaves for a row that does not move: the row comes in, the cursor is where the pointer put it.
  await page.mouse.move(spotAt.x + 60, spotAt.y + spotAt.height / 2);
  await expect(accountRow(page)).toBeVisible();
  expect(await keysOf(page)).toEqual(ROWS_ON);
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'spotlights');
  await expect(accountRow(page).locator('.wc-sm-label')).toHaveText('Account');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  await expect(accountRow(page)).toHaveAttribute('aria-keyshortcuts', 'U');
  await expect(accountRow(page).locator('u.wc-sk')).toHaveText('u');

  // One row more: the rows above stand still, the box is one row higher.
  const after = (await panel.boundingBox())!;
  const rowH = spotAt.height;
  expect(after.y).toBe(before.y);
  expect(after.height).toBeCloseTo(before.height + rowH, 0);
  expect((await rowBox('spotlights')).y).toBe(spotAt.y);
  expect((await rowBox('account')).y).toBeCloseTo(spotAt.y + rowH, 0);
  expect((await rowBox('credits')).y).toBeCloseTo(creditsAt.y + rowH, 0);
  expect(errors).toEqual([]);
});

test('the row comes in at once with no pointer on the menu, and a keyboard cursor below it stays on its row', async ({ page }) => {
  await fakeAccountApi(page);
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/config', async (route) => {
    await held;
    await route.fallback();
  });
  await openStart(page);
  await page.mouse.move(5, 5);
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'credits');
  release();
  await expect(accountRow(page)).toBeVisible();
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'credits');
  // The arrows walk through it; U opens Log in.
  await page.keyboard.press('ArrowUp');
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'account');
  await shot(page, 'a-sel', 'desktop');
  await page.keyboard.press('ArrowUp');
  await shot(page, 'a-out', 'desktop');
  await page.keyboard.press('u');
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(field(page, 'name')).toBeFocused();
});

test('a life: create account, the recovery code (copy, download, the last group), the Account page, log out, log in', async ({ page, context, browserName }) => {
  const errors = watchErrors(page);
  const api = await fakeAccountApi(page);
  const ts = await stubTurnstile(page);
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openAccount(page);

  // Log in → Create account. Nothing of Turnstile was loaded for Log in.
  await expect(pageOf(page, 'login')).toBeVisible();
  await shot(page, 'login-empty', 'desktop');
  expect(ts.loads()).toBe(0);
  await link(page, 'create').click();
  await expect(pageOf(page, 'create')).toBeVisible();
  await expect(field(page, 'name')).toBeFocused();
  await expect(frame(page).locator('.wc-fake-turnstile')).toBeVisible();
  expect(ts.loads()).toBe(1);
  expect((await ts.state(page)).last).toMatchObject({ sitekey: api.server.siteKey, theme: 'dark', size: 'normal' });
  await expect(btn(page, 'CREATE')).toHaveAttribute('aria-disabled', 'true');
  await expect(frame(page).locator('.wc-ac-points li')).toHaveCount(6);
  await shot(page, 'create-empty', 'desktop');
  // Nothing scrolls at 1440 × 900: the whole box is inside the window.
  const box = (await frame(page).locator('.wc-lk-box').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(DESKTOP.height);
  expect(await frame(page).locator('.wc-lk-sub').evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);

  // The format is said while typing; the passwords are checked.
  await field(page, 'name').fill('Olev the Great');
  await expect(fieldNote(page, 'name')).toHaveText('Only a–z, 0–9, _ and -. No spaces.');
  await field(page, 'password').fill('hunter2');
  await field(page, 'again').fill('hunter3');
  await expect(fieldNote(page, 'password')).toHaveText('7 characters: at least 10.');
  await expect(fieldNote(page, 'again')).toHaveText('The two passwords differ.');
  await expect(btn(page, 'CREATE')).toHaveAttribute('aria-disabled', 'true');
  await shot(page, 'create-bad', 'desktop');

  await fillCreate(page);
  await expect(fieldNote(page, 'password')).toContainText('21 characters');
  await expect(frame(page).locator('.wc-ac-strength')).toHaveAttribute('data-strength', 'good');
  // Still no token: the button waits for the check.
  await expect(btn(page, 'CREATE')).toHaveAttribute('aria-disabled', 'true');
  await passTurnstile(page);
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await shot(page, 'create-filled', 'desktop');
  await btn(page, 'CREATE').click();

  // The recovery code page: no Back, Esc does nothing, Continue waits for the last group.
  await expect(pageOf(page, 'code')).toBeVisible();
  expect(api.server.hasAccount(NAME)).toBe(true);
  const code = await shownCode(page);
  expect(code).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
  await expect(frame(page).locator('.wc-lk-back')).toHaveCount(0);
  await expect(btn(page, 'CONTINUE')).toHaveAttribute('aria-disabled', 'true');
  await expect(field(page, 'last')).toBeFocused();
  await shot(page, 'code-shown', 'desktop');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'code')).toBeVisible();
  // One row of six groups.
  const tops = await frame(page).locator('.wc-ac-code-p').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);

  // Copy.
  await btn(page, 'COPY').click();
  await expect(frame(page).locator('.wc-ac-code-flash')).toHaveText('Copied.');
  if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await shot(page, 'code-copied', 'desktop');

  // Download: the site, the name, the code and what it is for; never the password.
  const [download] = await Promise.all([page.waitForEvent('download'), btn(page, 'DOWNLOAD').click()]);
  expect(download.suggestedFilename()).toBe(`webcockpit-recovery-code-${NAME}.txt`);
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).toContain(code);
  expect(text).toContain(`User name:  ${NAME}`);
  expect(text).toContain(`Site:       ${new URL(page.url()).host}`);
  expect(text).toMatch(/forget the password/);
  expect(text).not.toContain(PASSWORD);

  // The last group: wrong, then right in lower case.
  await field(page, 'last').fill('zzzz');
  await expect(btn(page, 'CONTINUE')).toHaveAttribute('aria-disabled', 'true');
  await field(page, 'last').fill(code.slice(-4).toLowerCase());
  await expect(btn(page, 'CONTINUE')).not.toHaveAttribute('aria-disabled', 'true');
  await shot(page, 'code-confirmed', 'desktop');

  // The code is nowhere but on the page: not in storage, not in the address.
  const kept = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, location.href]));
  expect(kept).not.toContain(code);
  expect(kept).not.toContain(code.replace(/-/g, ''));
  expect(kept).not.toContain(PASSWORD);

  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('[data-account-name]')).toHaveText(NAME);
  await expect(frame(page).locator('.wc-ac-head-since')).toContainText('Account since');
  
  // Back: the row carries the name. The code page is gone for good.
  await page.keyboard.press('Escape');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText(`(${NAME})`);
  await settled(page);
  await shot(page, 'a-in', 'desktop');
  await page.keyboard.press('u');
  await expect(pageOf(page, 'account')).toBeVisible();

  // Log out: back on the menu, the row says "log in" again.
  await logOut(page);
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  await expect(page.locator('.wc-start .wc-sm-flash')).toHaveText('Logged out.');
  expect(api.server.sessionLabels(NAME)).toEqual([]);

  // Log in: the name is prefilled, the password has the focus.
  await page.keyboard.press('u');
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(field(page, 'name')).toHaveValue(NAME);
  await expect(field(page, 'password')).toBeFocused();
  await expect(field(page, 'password')).toHaveAttribute('type', 'password');
  await expect(field(page, 'password')).toHaveAttribute('autocomplete', 'current-password');
  await expect(field(page, 'name')).toHaveAttribute('autocomplete', 'username');
  await page.keyboard.type(PASSWORD);
  await shot(page, 'login-filled', 'desktop');
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('[data-account-name]')).toHaveText(NAME);
  expect(api.server.sessionLabels(NAME)).toHaveLength(1);
  // No password ever reached the server.
  expect(api.server.saw(PASSWORD)).toBe(false);
  expect(errors).toEqual([]);
});

test('log in: one message for a wrong name or password; Turnstile after three failures; the lock counts down', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  const ts = await stubTurnstile(page);
  await openAccount(page);

  // A name that has no account and a wrong password say the same.
  await logIn(page, 'nobody', 'some password or other');
  await expect(formError(page)).toHaveText('Wrong user name or password.');
  await expect(field(page, 'password')).toHaveValue('');
  await expect(field(page, 'password')).toBeFocused();
  await logIn(page, NAME, 'not the password');
  await expect(formError(page)).toHaveText('Wrong user name or password.');
  await expect(field(page, 'password')).toHaveValue('');
  await expect(field(page, 'password')).toBeFocused();
  await shot(page, 'login-error', 'desktop');
  expect(ts.loads()).toBe(0);

  // Two more wrong tries for the name; the fourth is asked for the check before it is looked at.
  for (let i = 0; i < 2; i++) {
    await page.keyboard.type(`wrong password ${i}`);
    await page.keyboard.press('Enter');
    await expect(formError(page)).toHaveText('Wrong user name or password.');
    await expect(field(page, 'password')).toHaveValue('');
  }
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await expect(frame(page).locator('.wc-fake-turnstile')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-ask')).toHaveText('Three wrong tries. Show that you are a person, then try again.');
  expect(ts.loads()).toBe(1);
  // The password stays (the same flow is sent again with the token), the button waits for the check.
  await expect(field(page, 'password')).toHaveValue(PASSWORD);
  await expect(btn(page, 'LOGIN')).toHaveAttribute('aria-disabled', 'true');
  await shot(page, 'login-turnstile', 'desktop');
  const params = server.requests('/api/auth/params').length;
  await passTurnstile(page);
  await btn(page, 'LOGIN').click();
  await expect(pageOf(page, 'account')).toBeVisible();
  // The second submit derived nothing anew: no second question for the salt.
  expect(server.requests('/api/auth/params').length).toBe(params);

  // Log out; another device makes ten wrong tries: the name is locked.
  await logOut(page);
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  wrongLogins(server, NAME, 10, origin(page));
  await page.keyboard.press('u');
  await expect(pageOf(page, 'login')).toBeVisible();
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  const wait = frame(page).locator('.wc-ac-wait');
  await expect(wait).toBeVisible();
  await expect(wait.locator('.wc-ac-wait-t')).toHaveText('Too many wrong tries');
  await expect(wait).toContainText('Nobody can log in to this name until the time is up, from any device. Nothing is wrong with the account.');
  await expect(wait.locator('.wc-ac-wait-n')).toHaveText(/^1[45]:\d\d$/);
  const first = await wait.locator('.wc-ac-wait-n').textContent();
  await expect(wait.locator('.wc-ac-wait-n')).not.toHaveText(first!);
  await expect(btn(page, 'LOGIN')).toHaveAttribute('aria-disabled', 'true');
  await expect(field(page, 'password')).toBeDisabled();
  await shot(page, 'login-locked', 'desktop');

  // Nearly all of the wait passes on the server; asked again, the page counts the rest down and opens up.
  server.advance(15 * 60_000 - 2500);
  await field(page, 'name').fill(NAME);
  await expect(wait).toBeHidden();
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'LOGIN').click();
  await expect(wait.locator('.wc-ac-wait-n')).toHaveText(/^0:0[0-3]$/);
  server.advance(5000);
  await expect(wait).toBeHidden({ timeout: 8000 });
  await expect(field(page, 'password')).toBeFocused();
  // The same flow goes through now (the window of wrong tries is over with the lock).
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'account')).toBeVisible();
  expect(errors).toEqual([]);
});

test('create account: a taken name is said after the answer, on the name; the same form goes on with another', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  await openAccount(page);
  await link(page, 'create').click();
  await fillCreate(page, 'olev');
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'CREATE').click();
  await expect(fieldNote(page, 'name')).toHaveText('The name olev is taken. Try another.');
  await expect(field(page, 'name')).toBeFocused();
  await expect(btn(page, 'CREATE')).toHaveAttribute('aria-disabled', 'true');
  await shot(page, 'create-taken', 'desktop');
  // The passwords are still there; another name goes through (a new token came by itself).
  await field(page, 'name').fill('olev2');
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'code')).toBeVisible();
  expect(server.hasAccount('olev2')).toBe(true);
});

test('recovery: a wrong code, then the right one sets a new password, logs every other device out and keeps the code', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  const { recoveryCode } = await seedAccount(server, NAME, PASSWORD);
  server.addSession(NAME, 'Another device');
  await fakeAccountApi(page, { server });
  await stubTurnstile(page);
  await openAccount(page);
  await field(page, 'name').fill(NAME);
  await link(page, 'recover').click();
  await expect(pageOf(page, 'recover')).toBeVisible();
  // The name came along; the code has the focus.
  await expect(field(page, 'name')).toHaveValue(NAME);
  await expect(field(page, 'code')).toBeFocused();
  await expect(frame(page).locator('.wc-fake-turnstile')).toBeVisible();
  await expect(pageOf(page, 'recover')).toContainText('Every device is logged out, this one logs in. The recovery code stays the same.');
  await expect(pageOf(page, 'recover')).toContainText('Lost the code too?');
  await field(page, 'name').fill('');
  await shot(page, 'recover-empty', 'desktop');
  await field(page, 'name').fill(NAME);

  // A code that is no code is said at the field; a wrong one by the server.
  await field(page, 'code').fill('K7QM-2XHD');
  await field(page, 'password').fill(PASSWORD_2);
  await expect(fieldNote(page, 'code')).toHaveText('A recovery code is six groups of four letters and digits.');
  const wrong = recoveryCode.slice(0, -1) + (recoveryCode.endsWith('7') ? '8' : '7');
  await field(page, 'code').fill(wrong);
  await field(page, 'again').fill(PASSWORD_2);
  await passTurnstile(page);
  await btn(page, 'SET').click();
  await expect(formError(page)).toHaveText('Wrong user name or recovery code.');
  await expect(field(page, 'code')).toBeFocused();
  await shot(page, 'recover-error', 'desktop');

  // The right code, in lower case and without dashes.
  await field(page, 'code').fill(recoveryCode.replace(/-/g, '').toLowerCase());
  await expect(formError(page)).toHaveCount(0);
  await passTurnstile(page);
  await shot(page, 'recover-filled', 'desktop');
  await btn(page, 'SET').click();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('.wc-lk-flash')).toHaveText('The new password is set. Every other device was logged out.');
  expect(server.sessionLabels(NAME)).toHaveLength(1);
  expect(server.sessionLabels(NAME)).not.toContain('Another device');

  // The new password logs in, and the code is still the account's.
  await logOut(page);
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  await page.keyboard.press('u');
  await expect(pageOf(page, 'login')).toBeVisible();
  await page.keyboard.type(PASSWORD_2);
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'account')).toBeVisible();
  expect(server.saw(recoveryCode)).toBe(false);
  expect(errors).toEqual([]);
});

test('the service down, offline, and limits: honest words, the form stays usable', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  await openAccount(page);

  server.fail = 'unavailable';
  await logIn(page);
  await expect(formError(page)).toHaveText('The account service has a problem right now. Nothing is wrong with your account or with what is on this device. Try again later.');
  await expect(field(page, 'password')).toHaveValue(PASSWORD);
  await shot(page, 'login-down', 'desktop');
  server.fail = 'offline';
  await btn(page, 'LOGIN').click();
  await expect(formError(page)).toHaveText('The server was not reached. Check the connection, then try again.');
  server.fail = 'rate_limited';
  await btn(page, 'LOGIN').click();
  await expect(formError(page)).toHaveText('Too many tries from this network. Wait a minute, then try again.');
  server.fail = 'garbage';
  await btn(page, 'LOGIN').click();
  await expect(formError(page)).toHaveText('The server’s answer was not understood. Reload the page and try again.');
  // The key the server keeps does not open: not a typing mistake, and said so.
  server.fail = null;
  server.corruptWrap(NAME);
  await btn(page, 'LOGIN').click();
  await expect(formError(page)).toContainText('The password is right, but the account’s key on the server is damaged');
  await expect(field(page, 'password')).toHaveValue(PASSWORD);

  // Create account: three an hour.
  await link(page, 'create').click();
  server.registrationsLeft = 0;
  await fillCreate(page, 'thirdone');
  await btn(page, 'CREATE').click();
  await expect(formError(page)).toContainText('Too many accounts were made from this network');
  // Turnstile's own service is down.
  server.registrationsLeft = 3;
  server.turnstileDown = true;
  await btn(page, 'CREATE').click();
  await expect(formError(page)).toContainText('The account service has a problem right now.');
  // A token the server refuses.
  server.turnstileDown = false;
  server.fail = null;
  expect(server.hasAccount('thirdone')).toBe(false);
});

test('Turnstile: not loadable (with a retry), an error, a token that ran out', async ({ page }) => {
  await fakeAccountApi(page);
  const ts = await stubTurnstile(page, { blocked: true });
  await openAccount(page);
  await link(page, 'create').click();
  const note = frame(page).locator('.wc-ac-ts-note');
  await expect(note).toContainText('could not be loaded');
  await expect(note).toContainText('challenges.cloudflare.com');
  await fillCreate(page);
  await expect(btn(page, 'CREATE')).toHaveAttribute('aria-disabled', 'true');
  await shot(page, 'create-blocked', 'desktop');
  // Try again loads it anew.
  ts.block(false);
  await link(page, 'ts-retry').click();
  await expect(frame(page).locator('.wc-fake-turnstile')).toBeVisible();
  await expect(note).toHaveCount(0);
  expect(ts.loads()).toBe(2);
  await passTurnstile(page);
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  // The token runs out: the button waits again, the page says so.
  await ts.expire(page);
  await expect(note).toHaveText('The check ran out. It is being done again.');
  await expect(btn(page, 'CREATE')).toHaveAttribute('aria-disabled', 'true');
  // The widget reports an error.
  await ts.fail(page, '300030');
  await expect(note).toContainText('The check could not be done (300030).');
  await link(page, 'ts-retry').click();
  await passTurnstile(page);
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  // By keys: Tab from the last field stops at the widget's door; the browser's own Tab goes in, Space passes it.
  await ts.expire(page);
  await field(page, 'again').focus();
  await page.keyboard.press('Tab');
  await expect(frame(page).locator('.wc-ac-ts-door')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(frame(page).locator('.wc-fake-turnstile')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  // Passed: the keyboard is the page's again (Enter would press Create, Esc leaves).
  await expect(frame(page).locator('.wc-fake-turnstile')).not.toBeFocused();
  // Shift+Tab from the door is the last field; Esc on the door gives the keys back to the page.
  await ts.expire(page);
  await field(page, 'again').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(field(page, 'again')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(frame(page).locator('.wc-ac-ts-door')).not.toBeFocused();
  await expect(pageOf(page, 'create')).toBeVisible();
  await passTurnstile(page);
  // Leaving the page removes the widget.
  const before = await ts.state(page);
  await page.keyboard.press('Escape');
  await expect(pageOf(page, 'login')).toBeVisible();
  const after = await ts.state(page);
  expect(after.widgets).toBe(0);
  expect(after.removed).toBe(before.removed + 1);
});

test('a token the server refuses: a new one is asked for, and the next try goes through', async ({ page }) => {
  const api = await fakeAccountApi(page);
  const ts = await stubTurnstile(page);
  await openAccount(page);
  await link(page, 'create').click();
  await fillCreate(page);
  await ts.nextToken(page, 'bad-token');
  await passTurnstile(page);
  await btn(page, 'CREATE').click();
  await expect(formError(page)).toHaveText('The check that you are a person did not pass. Do it once more, then try again.');
  await expect(btn(page, 'CREATE')).toHaveAttribute('aria-disabled', 'true');
  expect(api.server.hasAccount(NAME)).toBe(false);
  await passTurnstile(page);
  await btn(page, 'CREATE').click();
  await expect(pageOf(page, 'code')).toBeVisible();
});

test('working: the bar and the sentence while the key is made; Cancel stops it before anything is sent', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  // The salt's answer is held back: the flow stands in its first step.
  let release: () => void = () => {};
  let held = new Promise<void>((r) => (release = r));
  await page.route('**/api/auth/params*', async (route) => {
    await held;
    await route.fallback();
  });
  await openAccount(page);
  await field(page, 'name').fill(NAME);
  await field(page, 'password').fill(PASSWORD);
  await page.keyboard.press('Enter');
  const work = frame(page).locator('.wc-ac-work');
  await expect(work).toBeVisible();
  await expect(work.locator('.wc-ac-work-t')).toHaveText('Working…');
  await expect(work.locator('.wc-ac-work-s')).toContainText('Making your key on this device.');
  await expect(field(page, 'password')).toBeDisabled();
  await expect(btn(page, 'LOGIN')).toHaveCount(0);
  await shot(page, 'login-working', 'desktop');
  // Keys are held while it works; Esc is Cancel.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  release();
  await expect(work).toBeHidden();
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(formError(page)).toHaveCount(0);
  await expect(field(page, 'password')).toHaveValue(PASSWORD);
  expect(server.requests('/api/auth/login')).toHaveLength(0);
  // Again, without cancelling.
  held = Promise.resolve();
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'account')).toBeVisible();
});

test('keyboard only: Tab walks the fields, the button and the links; Enter presses; Esc leaves', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  await openStart(page);
  await expect(accountRow(page)).toBeVisible();
  await page.keyboard.press('u');
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(field(page, 'name')).toBeFocused();
  // A letter is text here, not a shortcut.
  await page.keyboard.type('Olev');
  await expect(field(page, 'name')).toHaveValue('Olev');
  await page.keyboard.press('Tab');
  await expect(field(page, 'password')).toBeFocused();
  await page.keyboard.type('x');
  // Tab: the button, the two links, and round to the name.
  await page.keyboard.press('Tab');
  await expect(btn(page, 'LOGIN')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('Tab');
  await expect(link(page, 'create')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('Tab');
  await expect(link(page, 'recover')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('Tab');
  await expect(field(page, 'name')).toBeFocused();
  await expect(link(page, 'recover')).not.toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('Shift+Tab');
  await expect(link(page, 'recover')).toHaveClass(/\bis-sel\b/);
  // Enter on a link goes there; Esc on Recovery comes back to Log in with the name.
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'recover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(field(page, 'name')).toHaveValue('Olev');
  // Create account by keys alone (the name came back with us, so the password has the focus).
  await expect(field(page, 'password')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(link(page, 'create')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('Space');
  await expect(pageOf(page, 'create')).toBeVisible();
  await page.keyboard.type('keys_only');
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'code')).toBeVisible();
  await expect(field(page, 'last')).toBeFocused();
  const code = await shownCode(page);
  // Tab: Copy, Download (Continue is not lit yet), back to the field.
  await page.keyboard.press('Tab');
  await expect(btn(page, 'COPY')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('Tab');
  await expect(btn(page, 'DOWNLOAD')).toHaveClass(/\bis-sel\b/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toContain('keys_only');
  await page.keyboard.press('Tab');
  await expect(field(page, 'last')).toBeFocused();
  await page.keyboard.type(code.slice(-4));
  await page.keyboard.press('Enter');
  await expect(pageOf(page, 'account')).toBeVisible();
  // The Account page has no fields: its letter works. L asks, Enter (or L, after a moment: a doubled
  // L is not an answer, account-page.spec.ts "review 7") logs out.
  await page.keyboard.press('l');
  await expect(dialog(page, 'ac-logout')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  // Esc from Log in is the start menu, the cursor on the Account row.
  await page.keyboard.press('u');
  await expect(pageOf(page, 'login')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'account');
  expect(errors).toEqual([]);
});

test('a session that is gone: the Account page sends the player to Log in and says why', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await openAccount(page);
  await logIn(page);
  await expect(pageOf(page, 'account')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText(`(${NAME})`);
  // Ended from another device.
  server.endSessions(NAME);
  await page.keyboard.press('u');
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-notice')).toContainText('You were logged out here');
  await expect(field(page, 'name')).toHaveValue(NAME);
  await page.keyboard.press('Escape');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
});

// ------------------------------------------------------------ after the review of the client (ADR 0145)

test('review 1: while the registration is on its way Back and Esc do not leave Create account, and the recovery code is shown', async ({ page }) => {
  const errors = watchErrors(page);
  const api = await fakeAccountApi(page);
  await stubTurnstile(page, { auto: true });
  await openAccount(page);
  await link(page, 'create').click();
  await fillCreate(page);
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  // The server makes the account and its answer is held back: the page stands in "Almost done."
  const hold = api.holdNext('/api/auth/register');
  await btn(page, 'CREATE').click();
  await hold.arrived;
  const work = frame(page).locator('.wc-ac-work');
  await expect(work).toHaveAttribute('data-step', 'sending');
  await expect(work.locator('[data-link="cancel"]')).toHaveCount(0);
  expect(api.server.hasAccount(NAME)).toBe(true);
  // The box's back arrow, and Esc: neither leaves, neither cancels.
  await frame(page).locator('.wc-lk-back').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await expect(pageOf(page, 'create')).toBeVisible();
  await expect(pageOf(page, 'login')).toHaveCount(0);
  hold.release();
  await expect(pageOf(page, 'code')).toBeVisible();
  const code = await shownCode(page);
  expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
  // The code page has no way out but the last group.
  await page.keyboard.press('Escape');
  await expect(pageOf(page, 'code')).toBeVisible();
  await field(page, 'last').fill(code.slice(-4));
  await btn(page, 'CONTINUE').click();
  await expect(pageOf(page, 'account')).toBeVisible();
  expect(errors).toEqual([]);
});

test('review 1: Back while the key is still being made is Cancel: the page stays and nothing was sent', async ({ page }) => {
  const api = await fakeAccountApi(page);
  await stubTurnstile(page, { auto: true });
  await openAccount(page);
  await link(page, 'create').click();
  await fillCreate(page);
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'CREATE').click();
  await expect(frame(page).locator('.wc-ac-work')).toBeVisible();
  // (The key may be made and the account with it before the click lands: then the code page is up and has no Back.)
  await frame(page)
    .locator('.wc-lk-back')
    .click({ timeout: 2000 })
    .catch(() => {});
  // Cancelled (when the click came before the request left) or made: never the Log in page with a lost code.
  await expect(frame(page).locator('[data-page="create"] [data-btn="CREATE"], [data-page="code"]')).toBeVisible();
  if ((await pageOf(page, 'create').count()) > 0) expect(api.server.hasAccount(NAME)).toBe(false);
});

test('review 3: a registration whose answer is lost says "may or may not"; Create again finds the account and shows its code', async ({ page }) => {
  const server = new FakeAccountServer();
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  await openAccount(page);
  // The connection drops after the request left; then: the status arrives and the body does not.
  for (const [lose, name] of [
    ['connection', 'Olev'],
    ['body', 'Bera'],
  ] as const) {
    await link(page, 'create').click();
    await fillCreate(page, name);
    await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
    let once = true;
    await page.route('**/api/auth/register', async (route) => {
      if (once) server.loseNextAnswer = lose;
      once = false;
      await route.fallback();
    });
    await btn(page, 'CREATE').click();
    await expect(formError(page), lose).toHaveText('The server’s answer did not arrive. The account may or may not have been made: press Create account again and it will be found.');
    expect(server.hasAccount(name)).toBe(true);
    // The password touched and put back as it was: still the same try.
    await field(page, 'password').fill(PASSWORD + 'x');
    await field(page, 'password').fill(PASSWORD);
    await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
    await btn(page, 'CREATE').click();
    await expect(pageOf(page, 'code'), lose).toBeVisible();
    const code = await shownCode(page);
    await field(page, 'last').fill(code.slice(-4));
    await btn(page, 'CONTINUE').click();
    await expect(pageOf(page, 'account')).toBeVisible();
    await expect(frame(page).locator('[data-account-name]')).toHaveText(name);
    await page.unroute('**/api/auth/register');
    // Out again for the next round.
    await logOut(page);
    await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
    await accountRow(page).click();
    await expect(pageOf(page, 'login')).toBeVisible();
  }
});

test('review 3b: after a lost answer another password or another name does not forget that the account may exist', async ({ page }) => {
  const server = new FakeAccountServer();
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  await openAccount(page);
  await link(page, 'create').click();
  await fillCreate(page);
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  server.loseNextAnswer = 'connection';
  // (The config and the Turnstile are in: the next account request is the registration.)
  await btn(page, 'CREATE').click();
  await expect(formError(page)).toContainText('may or may not have been made');
  // Another password: a new try that cannot prove the account is its own. Not a bare "taken".
  await field(page, 'password').fill(PASSWORD_2);
  await field(page, 'again').fill(PASSWORD_2);
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'CREATE').click();
  await expect(fieldNote(page, 'name')).toContainText(`The name ${NAME} is taken, perhaps by your own earlier try`);
  await expect(fieldNote(page, 'name')).toContainText(`Try logging in as ${NAME} with the password you typed then`);
  // Another name: the first one is not forgotten.
  await field(page, 'name').fill('Olev2');
  await expect(frame(page).locator('[data-maybe]')).toContainText(`The earlier try may have made the account ${NAME}`);
  // And it is true: the first password logs in.
  await link(page, 'login').click();
  await field(page, 'name').fill(NAME);
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'LOGIN').click();
  await expect(pageOf(page, 'account')).toBeVisible();
});

test('review 4: localStorage takes no hint (full or blocked): the login holds, the Account page opens, the row follows, and a reload finds the keys', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k.startsWith('wc.account')) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
  });
  await openAccount(page);
  await field(page, 'name').fill(NAME);
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'LOGIN').click();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('[data-account-name]')).toHaveText(NAME);
  expect(await page.evaluate(() => localStorage.getItem('wc.account'))).toBeNull();
  await page.keyboard.press('Escape');
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText(`(${NAME})`);
  expect(server.sessionLabels(NAME)).toHaveLength(1);
  // A reload: the row cannot know, and the account pages find the keys.
  await openAccount(page);
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-head-since')).toContainText('Account since');
  expect(server.sessionLabels(NAME)).toHaveLength(1);
  // Log out is offered and works.
  await logOut(page);
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  expect(server.sessionLabels(NAME)).toHaveLength(0);
});
