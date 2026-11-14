// Stage 60 part B (spec §7.2, §2.12; ADR 0139, ADR 0140): the Account
// page and its dialogs on a phone and at a tablet's size. The desktop:
// account-page.spec.ts. Against the fake account API,
// `?cloudtest&phone=1`.
//
// - The page is one column in a box that fills the screen, the groups in
//   the mockup's order with Leaving last; its body scrolls.
// - The dialogs' fields take our own keyboard; the focused field and the
//   dialog's buttons stay above it, upright and on the phone's side.
// - A tablet-size window gets the desktop's box under the wordmark.
//
// `phone` project (Pixel 7: a touch browser). Nothing reaches MUME.
import { type Page, expect, test } from '@playwright/test';
import {
  LANDSCAPE,
  NAME,
  PASSWORD,
  PASSWORD_2,
  PHONE,
  PHONE_Q,
  TABLET,
  accountRow,
  box,
  btn,
  dialog,
  dialogError,
  expectAbove,
  field,
  frame,
  frames,
  okb,
  okbHost,
  okbKey,
  okbType,
  openStart,
  pageOf,
  shot,
  shownCode,
  watchErrors,
} from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';

test.use({ viewport: PHONE });

const DAY = 86_400_000;
const rows = (page: Page) => frame(page).locator('.wc-ac-dev');
const flash = (page: Page) => frame(page).locator('.wc-lk-flash');

/** From the start page to the Account page of a seeded account (the fields filled directly: the keyboard's typing is the other spec's). */
async function logIn(page: Page, query = PHONE_Q): Promise<void> {
  await openStart(page, query);
  await expect(accountRow(page)).toBeVisible();
  await accountRow(page).tap();
  await expect(pageOf(page, 'login')).toBeVisible();
  await field(page, 'name').fill(NAME);
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'LOGIN').tap();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-head-since')).toContainText('Account since');
}

/** A server with the account and three other devices. */
async function withDevices(): Promise<FakeAccountServer> {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  server.addSession(NAME, 'Chrome on Windows', { madeAgo: 40 * DAY, usedAgo: 36 * DAY });
  server.addSession(NAME, 'Safari on iPhone', { madeAgo: 9 * DAY, usedAgo: 3.4 * DAY });
  server.addSession(NAME, 'Firefox on Linux', { madeAgo: 2 * DAY, usedAgo: 1.2 * DAY });
  return server;
}

test('phone: the Account page is one column that fills the screen and scrolls, Leaving last; End a session by touch', async ({ page }) => {
  const errors = watchErrors(page);
  const server = await withDevices();
  await fakeAccountApi(page, { server });
  await logIn(page);
  await expect(okbHost(page)).toBeHidden();

  // The box fills the screen (no wordmark above it) and its body scrolls.
  const body = frame(page).locator('.wc-ac-body');
  await expect(body).toHaveClass(/\bwc-lk-scroll\b/);
  const b = await box(frame(page).locator('.wc-lk-box'));
  expect(b.y).toBeLessThan(30);
  expect(b.height).toBeGreaterThan(PHONE.height - 60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // The device list is part of the page's scroll, not a scroller of its own.
  expect(await frame(page).locator('.wc-ac-devs').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);

  // One column, in order: the head, Devices, Password and recovery, Leaving; Delete account the last thing.
  await expect(rows(page)).toHaveCount(4);
  const order = ['.wc-ac-head', '[data-rule="devices"]', '.wc-ac-devs', '[data-rule="password"]', '[data-btn="PASSWORD"]', '[data-rule="leaving"]', '[data-btn="LOGOUT"]'];
  const tops = await Promise.all(order.map(async (sel) => frame(page).locator(sel).evaluate((el) => el.getBoundingClientRect().top)));
  expect([...tops].sort((x, y) => x - y)).toEqual(tops);
  const del = await frame(page).locator('[data-btn="DELETE"]').evaluate((el) => el.getBoundingClientRect().bottom);
  const lowest = await frame(page).locator('.wc-ac-acct [data-btn]').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
  expect(del).toBeGreaterThanOrEqual(lowest - 12);
  // Later stages' things are not here.
  await expect(pageOf(page, 'account')).not.toContainText(/sync|storage|notice|gallery|safety|download/i);
  // Touch targets.
  for (const l of [btn(page, 'ENDALL'), rows(page).nth(1).locator('[data-btn="END"]'), btn(page, 'PASSWORD'), btn(page, 'LOGOUT'), btn(page, 'DELETE')]) {
    expect((await box(l)).height).toBeGreaterThanOrEqual(40);
  }
  await shot(page, 'acct', 'phone');
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(btn(page, 'DELETE')).toBeInViewport();

  // End one: the dialog is whole on the screen; the row goes.
  await body.evaluate((el) => el.scrollTo(0, 0));
  await rows(page).nth(1).locator('[data-btn="END"]').tap();
  const end = dialog(page, 'ac-end');
  await expect(end.locator('.wc-lk-q')).toHaveText('End the session on Firefox on Linux?');
  const d = await box(end);
  expect(d.x).toBeGreaterThanOrEqual(0);
  expect(d.x + d.width).toBeLessThanOrEqual(PHONE.width);
  expect(d.y + d.height).toBeLessThanOrEqual(PHONE.height);
  await shot(page, 'd-end', 'phone');
  await btn(page, 'END').tap();
  await expect(flash(page)).toHaveText('The session is ended.');
  await expect(rows(page)).toHaveCount(3);
  // End all others.
  await btn(page, 'ENDALL').tap();
  await expect(dialog(page, 'ac-endall').locator('.wc-lk-q')).toHaveText('End the sessions on the 2 other devices?');
  await shot(page, 'd-endall', 'phone');
  await btn(page, 'END').tap();
  await expect(rows(page)).toHaveCount(1);
  expect(server.sessionLabels(NAME)).toHaveLength(1);

  // Log out: a plain confirm.
  await btn(page, 'LOGOUT').tap();
  await expect(dialog(page, 'ac-logout')).toBeVisible();
  await shot(page, 'd-logout', 'phone');
  await btn(page, 'OUT').tap();
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  expect(errors).toEqual([]);
});

test('phone: our keyboard types a password change; the focused field and the buttons stay above it', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);

  await btn(page, 'PASSWORD').tap();
  const dlg = dialog(page, 'ac-password');
  await expect(dlg).toBeVisible();
  // The tap that opened the dialog focused its first field: our keyboard is up for it.
  await expect(field(page, 'current')).toBeFocused();
  await expect(okb(page)).toBeVisible();
  for (const id of ['current', 'password', 'again']) {
    await expect(field(page, id)).toHaveAttribute('inputmode', 'none');
    await expect(field(page, id)).toHaveAttribute('type', 'password');
  }
  await frames(page);
  await expectAbove(page, field(page, 'current'));
  await expectAbove(page, btn(page, 'CANCEL'));
  await expectAbove(page, btn(page, 'CHANGE'));
  // The dialog is whole between the top of the screen and the keyboard.
  await expectAbove(page, dlg);
  await shot(page, 'd-password', 'phone');

  await okbType(page, PASSWORD);
  await expect(field(page, 'current')).toHaveValue(PASSWORD);
  await okbKey(page, 'tab').tap();
  await expect(field(page, 'password')).toBeFocused();
  await frames(page);
  await expectAbove(page, field(page, 'password'));
  await okbType(page, PASSWORD_2);
  await okbKey(page, 'tab').tap();
  await expect(field(page, 'again')).toBeFocused();
  await frames(page);
  await expectAbove(page, field(page, 'again'));
  await okbType(page, PASSWORD_2);
  await expect(field(page, 'again')).toHaveValue(PASSWORD_2);
  await expect(btn(page, 'CHANGE')).not.toHaveAttribute('aria-disabled', 'true');
  await expectAbove(page, btn(page, 'CHANGE'));
  // Nothing on the page shows a password.
  const text = await page.locator('body').innerText();
  expect(text).not.toContain(PASSWORD);
  expect(text).not.toContain(PASSWORD_2);
  // Tab stays among the fields (the keyboard does not fold for a button).
  await okbKey(page, 'tab').tap();
  await expect(field(page, 'current')).toBeFocused();
  await expect(okb(page)).toBeVisible();
  await shot(page, 'd-password-filled', 'phone');
  // Enter on our keyboard is the lit button.
  await okbKey(page, 'enter').tap();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(flash(page)).toHaveText('The password is changed. Your other devices were logged out.');
  await expect(okbHost(page)).toBeHidden();
  expect(server.saw(PASSWORD_2)).toBe(false);
  expect(errors).toEqual([]);
});

test('phone: a new recovery code in its dialog: two rows of three, the last group on our keyboard', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);

  await btn(page, 'RECOVERY').tap();
  await expect(dialog(page, 'ac-newcode')).toBeVisible();
  await expect(field(page, 'password')).toBeFocused();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await expectAbove(page, field(page, 'password'));
  await expectAbove(page, btn(page, 'MAKE'));
  await shot(page, 'd-newcode', 'phone');
  await okbType(page, PASSWORD);
  await okbKey(page, 'enter').tap();

  const shown = dialog(page, 'ac-newcode-shown');
  await expect(shown).toBeVisible();
  const code = await shownCode(page);
  const tops = await frame(page).locator('.wc-ac-code-p').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(2);
  const d = await box(shown);
  expect(d.x).toBeGreaterThanOrEqual(0);
  expect(d.x + d.width).toBeLessThanOrEqual(PHONE.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // The last group: its field and Done above the keyboard.
  await field(page, 'last').tap();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await expectAbove(page, field(page, 'last'));
  await okbKey(page, 'esc').tap();
  await expect(shown).toBeVisible();
  await field(page, 'last').fill(code.slice(-4).toLowerCase());
  await expectAbove(page, btn(page, 'DONE'));
  await shot(page, 'd-newcode-typing', 'phone');
  await okbKey(page, 'fold').tap();
  await expect(okbHost(page)).toBeHidden();
  await shot(page, 'd-newcode-shown', 'phone');
  await btn(page, 'DONE').tap();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(flash(page)).toHaveText('The new recovery code is in use. The old one no longer works.');
  expect(errors).toEqual([]);
});

test('phone: delete account; Enter on our keyboard cancels, the red button deletes', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await logIn(page);
  const body = frame(page).locator('.wc-ac-body');
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));

  await btn(page, 'DELETE').tap();
  const dlg = dialog(page, 'ac-delete');
  await expect(dlg).toBeVisible();
  await expect(field(page, 'password')).toBeFocused();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await expectAbove(page, field(page, 'password'));
  await expectAbove(page, btn(page, 'CANCEL'));
  await expectAbove(page, btn(page, 'DELETE'));
  await shot(page, 'd-delete', 'phone');
  await okbType(page, PASSWORD);
  await okbKey(page, 'tab').tap();
  await expect(field(page, 'confirm')).toBeFocused();
  await frames(page);
  await expectAbove(page, field(page, 'confirm'));
  await okbType(page, 'olev');
  await expect(btn(page, 'DELETE')).not.toHaveAttribute('aria-disabled', 'true');
  await expectAbove(page, btn(page, 'DELETE'));
  await shot(page, 'd-delete-ready', 'phone');
  // Enter never deletes by default.
  await okbKey(page, 'enter').tap();
  await expect(pageOf(page, 'account')).toBeVisible();
  expect(server.hasAccount(NAME)).toBe(true);

  // Again, a wrong password first; then the red button.
  await btn(page, 'DELETE').tap();
  await field(page, 'password').fill('not the password');
  await field(page, 'confirm').fill(NAME);
  await btn(page, 'DELETE').tap();
  await expect(dialogError(page)).toHaveText('Wrong password.');
  await frames(page);
  // In sight, over the buttons (and above our keyboard where it stands: it folds while the fields are off).
  await expect(dialogError(page)).toBeInViewport({ ratio: 1 });
  if (await okb(page).isVisible()) await expectAbove(page, dialogError(page));
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'DELETE').tap();
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  await expect(page.locator('.wc-start .wc-sm-flash')).toHaveText(`The account ${NAME} is deleted. What is on this device is untouched.`);
  expect(server.hasAccount(NAME)).toBe(false);
  expect(errors).toEqual([]);
});

test('phone on its side: the page scrolls; a dialog keeps the focused field and its buttons above our keyboard', async ({ page }) => {
  const errors = watchErrors(page);
  const server = await withDevices();
  await fakeAccountApi(page, { server });
  await page.setViewportSize(LANDSCAPE);
  await logIn(page);
  const body = frame(page).locator('.wc-ac-body');
  await expect(body).toHaveClass(/\bwc-lk-scroll\b/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(btn(page, 'DELETE')).toBeInViewport();
  await body.evaluate((el) => el.scrollTo(0, 0));
  await btn(page, 'PASSWORD').scrollIntoViewIfNeeded();

  await btn(page, 'PASSWORD').tap();
  await expect(dialog(page, 'ac-password')).toBeVisible();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  for (const id of ['current', 'password', 'again']) {
    await field(page, id).tap();
    await frames(page);
    await expectAbove(page, field(page, id));
    await field(page, id).fill(id === 'current' ? PASSWORD : PASSWORD_2);
    // The buttons do not scroll away with the fields.
    await expectAbove(page, btn(page, 'CANCEL'));
    await expectAbove(page, btn(page, 'CHANGE'));
  }
  await expectAbove(page, dialog(page, 'ac-password'));
  await shot(page, 'd-password-side', 'phone');
  await btn(page, 'CHANGE').tap();
  await expect(flash(page)).toHaveText('The password is changed. Your other devices were logged out.');
  expect(errors).toEqual([]);
});

test('tablet size: the desktop\'s box under the wordmark; a dialog with fields is whole on the screen', async ({ page }) => {
  const errors = watchErrors(page);
  const server = await withDevices();
  await fakeAccountApi(page, { server });
  await page.setViewportSize(TABLET);
  await logIn(page, '&kbd=en');
  // Not the phone's full-screen box: the box is as high as its content and the body does not scroll.
  await expect(frame(page).locator('.wc-ac-body')).not.toHaveClass(/\bwc-lk-scroll\b/);
  const b = await box(frame(page).locator('.wc-lk-box'));
  expect(b.y).toBeGreaterThan(100);
  expect(b.width).toBeLessThanOrEqual(600);
  expect(b.y + b.height).toBeLessThan(TABLET.height);
  await expect(rows(page)).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const id of ['PASSWORD', 'RECOVERY', 'LOGOUT']) expect((await box(btn(page, id))).height).toBeGreaterThanOrEqual(44);

  await btn(page, 'DELETE').tap();
  const dlg = dialog(page, 'ac-delete');
  await expect(dlg).toBeVisible();
  const d = await box(dlg);
  expect(d.y).toBeGreaterThanOrEqual(0);
  expect(d.y + d.height).toBeLessThanOrEqual(TABLET.height);
  // Our keyboard is the tablet's too: the focused field and the buttons are above it.
  if (await okb(page).isVisible()) {
    await frames(page);
    await expectAbove(page, field(page, 'password'));
    await expectAbove(page, btn(page, 'DELETE'));
  }
  await field(page, 'password').fill(PASSWORD);
  await field(page, 'confirm').fill(NAME);
  await btn(page, 'DELETE').tap();
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  expect(errors).toEqual([]);
});
