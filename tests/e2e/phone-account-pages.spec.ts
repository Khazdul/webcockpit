// Stage 60 part B (spec §7.2, §2.12; ADR 0139, ADR 0140): the Account
// entry and the account pages on a phone and at a tablet's size. The
// desktop: account-pages.spec.ts. Against the fake account API and the
// fake Turnstile, `?cloudtest&phone=1`.
//
// - The start menu has the same row; the game's menu sheet has none.
// - Our own keyboard types a login (the name, Tab, the password, Enter):
//   the password field is masked and asks the device for no keyboard, and
//   the focused field and the button stay above our keyboard.
// - Create account is one column in a box that fills the screen; the
//   Turnstile box (300 × 65) fits at 390 px; the recovery code is two
//   rows of three.
// - Landscape, and a tablet-size window (the desktop's arrangement).
//
// `phone` project (Pixel 7: a touch browser). Nothing reaches MUME.
import { type Page, expect, test } from '@playwright/test';
import {
  LANDSCAPE,
  NAME,
  PASSWORD,
  PHONE,
  PHONE_Q as Q,
  TABLET,
  accountRow,
  box,
  btn,
  expectAbove,
  field,
  fillCreate,
  frame,
  frames,
  link,
  okb,
  okbHost as host,
  okbKey as key,
  okbType as type,
  openStart,
  pageOf,
  shot,
  shownCode,
  watchErrors,
} from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { passTurnstile, stubTurnstile } from './turnstile-stub';

test.use({ viewport: PHONE });


async function openLogin(page: Page, query = Q): Promise<void> {
  await openStart(page, query);
  await expect(accountRow(page)).toBeVisible();
  await accountRow(page).tap();
  await expect(pageOf(page, 'login')).toBeVisible();
}

test('phone: the start menu has the Account row; our keyboard types a login', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  // A password our keyboard's first page can type.
  const password = 'correct horse battery';
  await seedAccount(server, NAME, password);
  await fakeAccountApi(page, { server });
  const ts = await stubTurnstile(page);
  await openStart(page, Q);
  await expect(accountRow(page)).toBeVisible();
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText('(log in)');
  await shot(page, 'a-out', 'phone');
  await accountRow(page).tap();
  await expect(pageOf(page, 'login')).toBeVisible();

  // The fields ask the device for no keyboard; the password is masked.
  for (const id of ['name', 'password']) {
    await expect(field(page, id)).toHaveAttribute('inputmode', 'none');
    await expect(field(page, id)).toHaveAttribute('virtualkeyboardpolicy', 'manual');
  }
  await expect(field(page, 'password')).toHaveAttribute('type', 'password');

  // The tap that opened the page focused the name: our keyboard is up for it.
  await expect(field(page, 'name')).toBeFocused();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await expectAbove(page, field(page, 'name'));
  await type(page, 'olev');
  await expect(field(page, 'name')).toHaveValue('olev');
  await shot(page, 'login-typing', 'phone');
  // Tab: the password, the keyboard stays.
  await key(page, 'tab').tap();
  await expect(field(page, 'password')).toBeFocused();
  await expect(okb(page)).toBeVisible();
  await type(page, password);
  await expect(field(page, 'password')).toHaveValue(password);
  await frames(page);
  await expectAbove(page, field(page, 'password'));
  await expectAbove(page, btn(page, 'LOGIN'));
  // Nothing on the page shows the password: not the field's text, not the keyboard. (The keyboard's
  // readout, `?kbd=debug`, is the game layout's only, and prints a field's tag and input mode, never its value.)
  expect(await page.locator('body').innerText()).not.toContain(password);
  await expect(page.locator('.wc-okb-readout')).toHaveCount(0);
  // Tab again stays among the fields (the keyboard does not fold for a button).
  await key(page, 'tab').tap();
  await expect(field(page, 'name')).toBeFocused();
  await key(page, 'tab').tap();
  await expect(field(page, 'password')).toBeFocused();
  await key(page, 'enter').tap();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('[data-account-name]')).toHaveText(NAME);
  await expect(host(page)).toBeHidden();
  expect(ts.loads()).toBe(0);

  // Back: the row carries the name.
  await frame(page).locator('.wc-lk-back').tap();
  await expect(accountRow(page).locator('.wc-sm-note')).toHaveText(`(${NAME})`);
  await shot(page, 'a-in', 'phone');
  expect(errors).toEqual([]);
});

test('phone: create account in one column, the Turnstile box fits, the code in two rows of three', async ({ page }) => {
  const errors = watchErrors(page);
  const api = await fakeAccountApi(page);
  const ts = await stubTurnstile(page);
  await openLogin(page);
  await shot(page, 'login-empty', 'phone');
  await link(page, 'create').tap();
  await expect(pageOf(page, 'create')).toBeVisible();
  // The box fills the screen and its body scrolls; one column: the six points under the form.
  const body = frame(page).locator('.wc-ac-body');
  await expect(body).toHaveClass(/\bwc-lk-scroll\b/);
  const form = await box(frame(page).locator('.wc-ac-col').first());
  const points = await box(frame(page).locator('.wc-ac-points-col'));
  expect(points.y).toBeGreaterThan(form.y + form.height - 1);
  expect(Math.abs(points.x - form.x)).toBeLessThan(2);
  // No sideways scroll anywhere.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // The keyboard came up for the name (the tap opened the page): fold it for the picture of the whole form.
  await expect(okb(page)).toBeVisible();
  await shot(page, 'create-typing', 'phone');
  await key(page, 'fold').tap();
  await expect(host(page)).toBeHidden();
  await shot(page, 'create-empty', 'phone');

  // The widget: 300 × 65, whole inside the box at 390 px.
  const widget = frame(page).locator('.wc-fake-turnstile');
  await widget.scrollIntoViewIfNeeded();
  const w = await box(widget);
  const win = await box(frame(page).locator('.wc-lk-win'));
  expect(Math.round(w.width)).toBe(300);
  expect(Math.round(w.height)).toBe(65);
  expect(w.x).toBeGreaterThanOrEqual(win.x);
  expect(w.x + w.width).toBeLessThanOrEqual(win.x + win.width);
  expect((await ts.state(page)).last).toMatchObject({ size: 'normal', theme: 'dark' });

  await fillCreate(page, 'phoney');
  await passTurnstile(page);
  await btn(page, 'CREATE').scrollIntoViewIfNeeded();
  await shot(page, 'create-end', 'phone');
  await btn(page, 'CREATE').tap();
  await expect(pageOf(page, 'code')).toBeVisible();
  expect(api.server.hasAccount('phoney')).toBe(true);

  // Two rows of three, no dashes; no Back.
  const code = await shownCode(page);
  const tops = await frame(page).locator('.wc-ac-code-p').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(2);
  expect(tops.filter((t) => t === tops[0])).toHaveLength(3);
  await expect(frame(page).locator('.wc-ac-code-d').first()).toBeHidden();
  await expect(frame(page).locator('.wc-lk-back')).toHaveCount(0);
  await shot(page, 'code-shown', 'phone');

  // The last group on our keyboard (letters and digits; any case).
  await field(page, 'last').tap();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await expectAbove(page, field(page, 'last'));
  await field(page, 'last').fill(code.slice(-4).toLowerCase());
  await shot(page, 'code-typing', 'phone');
  await expectAbove(page, btn(page, 'CONTINUE'));
  await btn(page, 'CONTINUE').tap();
  await expect(pageOf(page, 'account')).toBeVisible();
  expect(errors).toEqual([]);
});

test('phone: recovery in one column; landscape keeps the focused field above our keyboard', async ({ page }) => {
  const server = new FakeAccountServer();
  const { recoveryCode } = await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  await openLogin(page);
  await link(page, 'recover').tap();
  await expect(pageOf(page, 'recover')).toBeVisible();
  // The two password fields are under each other on a phone.
  const a = await box(field(page, 'password'));
  const b = await box(field(page, 'again'));
  expect(b.y).toBeGreaterThan(a.y + a.height);
  await key(page, 'fold').tap();
  await shot(page, 'recover-empty', 'phone');

  // On its side: the form still works, the focused field is above the keyboard.
  await page.setViewportSize(LANDSCAPE);
  await frames(page);
  await field(page, 'name').tap();
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await expectAbove(page, field(page, 'name'));
  await field(page, 'name').fill(NAME);
  await field(page, 'code').tap();
  await frames(page);
  await expectAbove(page, field(page, 'code'));
  await field(page, 'code').fill(recoveryCode);
  await field(page, 'password').tap();
  await frames(page);
  await expectAbove(page, field(page, 'password'));
  await field(page, 'password').fill('a new long password');
  await field(page, 'again').tap();
  await frames(page);
  await expectAbove(page, field(page, 'again'));
  await field(page, 'again').fill('a new long password');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Upright again; Enter on our keyboard sets the password.
  await page.setViewportSize(PHONE);
  await frames(page);
  await field(page, 'again').tap();
  await expect(okb(page)).toBeVisible();
  await expect(btn(page, 'SET')).not.toHaveAttribute('aria-disabled', 'true');
  await key(page, 'enter').tap();
  await expect(pageOf(page, 'account')).toBeVisible();
});

test('phone: log in on its side', async ({ page }) => {
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await page.setViewportSize(LANDSCAPE);
  await openLogin(page);
  await expect(okb(page)).toBeVisible();
  await frames(page);
  await expectAbove(page, field(page, 'name'));
  await type(page, 'olev');
  await key(page, 'tab').tap();
  await expect(field(page, 'password')).toBeFocused();
  await frames(page);
  await expectAbove(page, field(page, 'password'));
  await type(page, PASSWORD);
  await key(page, 'enter').tap();
  await expect(pageOf(page, 'account')).toBeVisible();
});

test('tablet size: the row, and Create account in the desktop\'s two columns', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeAccountApi(page);
  await stubTurnstile(page);
  await page.setViewportSize(TABLET);
  await openStart(page, '&kbd=en');
  await expect(accountRow(page)).toBeVisible();
  // A thumb's height.
  expect((await box(accountRow(page))).height).toBeGreaterThanOrEqual(42);
  await accountRow(page).tap();
  await expect(pageOf(page, 'login')).toBeVisible();
  await link(page, 'create').tap();
  await expect(pageOf(page, 'create')).toBeVisible();
  const form = await box(frame(page).locator('.wc-ac-col').first());
  const points = await box(frame(page).locator('.wc-ac-points-col'));
  expect(points.x).toBeGreaterThan(form.x + form.width - 1);
  expect(Math.abs(points.y - form.y)).toBeLessThan(2);
  // The wordmark stays above the box (not the phone's full-screen box).
  await expect(frame(page).locator('.wc-ac-body')).not.toHaveClass(/\bwc-lk-scroll\b/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Our keyboard is the tablet's too: the focused field is above it.
  if (await okb(page).isVisible()) {
    await frames(page);
    await expectAbove(page, field(page, 'name'));
  }
  await fillCreate(page, 'tablet_one');
  await passTurnstile(page);
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  for (const id of ['CREATE']) expect((await box(btn(page, id))).height).toBeGreaterThanOrEqual(44);
  expect(errors).toEqual([]);
});

test('phone: the game\'s menu sheet has no Account row', async ({ page }) => {
  await fakeAccountApi(page);
  await page.goto('/?cloudtest&replay&phone=1');
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await page.locator('.wc-ph-menu').tap();
  const sheet = page.locator('.wc-ph-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-row="scripts"]')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(sheet.locator('[data-row="account"]')).toHaveCount(0);
  await expect(sheet).not.toContainText(/account/i);
});
