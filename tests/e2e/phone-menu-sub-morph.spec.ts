// Stage 74 part C (ADR 0165) on a phone: the start menu's panel morphs to
// a sub-page's box and back (the desktop: menu-sub-morph.spec.ts). Here
// the proxy flies in pieces (ADR 0164), our own keyboard opens for the
// field that takes the focus at the mount, and the Account page is a tall
// box that reaches over the wordmark's place.
//
// - menu → Profile → Back: the plan runs in pieces, lands on the box, a
//   frame is always drawn, the wordmark keeps clear of it;
// - menu → Log in: the field has the focus from the mount, our keyboard
//   comes up, the proxy lands on the box as it then is, the keyboard
//   types into the field;
// - menu ↔ Account (tall): the wordmark fades before the frame flies over
//   its place, and comes back only when the menu's panel has landed.
//
// `phone` project (Pixel 7: a touch browser), the fake account API,
// `?cloudtest&phone=1`. Nothing reaches MUME.
import { type Page, expect, test } from '@playwright/test';
import { NAME, PASSWORD, PHONE, PHONE_Q, accountRow, btn, field, frame, link, okb, okbType, openStart, pageOf, watchErrors } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { morphDone } from './look';
import { blanks, brandOverFrame, edgesOf, landingGap, startMorphWatch, stopMorphWatch, watchMorph } from './menu-morph';

test.use({ viewport: PHONE });

const PANEL = '.wc-start .wc-frame:not([hidden]) .wc-sm-panel';
const SUB = '.wc-start .wc-frame:not([hidden]) .wc-lk-sub > .wc-lk-box';
const row = (page: Page, key: string) => page.locator(`.wc-start .wc-frame:not([hidden]) .wc-sm-item[data-key="${key}"]`);
const back = (page: Page) => frame(page).locator('.wc-lk-back');

test('phone: menu → Profile → Back morphs in pieces: the proxy lands on the box, a frame is always drawn, the wordmark keeps clear', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeAccountApi(page);
  await openStart(page, PHONE_Q);
  await expect(page.locator('.wc-lk-morph.wc-lk-px'), 'the proxy is in pieces on a phone').toBeAttached();
  // (The owner row comes with the account flags: the panel has its height once it is there.)
  await expect(accountRow(page)).toBeVisible();
  const panel = await edgesOf(page, PANEL);

  const there = await watchMorph(page, () => row(page, 'profile').tap());
  expect(there.plans).toEqual(['swap']);
  expect(there.flew).toBe(true);
  expect(there.blank, blanks(there)).toBe(0);
  expect(brandOverFrame(there)).toEqual([]);
  await expect(page.locator(SUB)).toBeVisible();
  expect(landingGap(there, await edgesOf(page, SUB)), 'the proxy landed on the box').toBeLessThan(2);
  await expect(page.locator('.wc-start')).toHaveAttribute('data-lk-box', 'normal');
  await expect(page.locator('.wc-start-brand')).toBeVisible();

  const home = await watchMorph(page, () => back(page).tap());
  expect(home.plans).toEqual(['swap']);
  expect(home.flew).toBe(true);
  expect(home.blank, blanks(home)).toBe(0);
  expect(brandOverFrame(home)).toEqual([]);
  await expect(page.locator(PANEL)).toBeVisible();
  expect(landingGap(home, await edgesOf(page, PANEL))).toBeLessThan(2);
  expect(await edgesOf(page, PANEL)).toEqual(panel);
  await expect(row(page, 'profile')).toHaveCSS('opacity', '1');
  await expect(page.locator('.wc-start .wc-frame')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('phone: menu → About → Back on the one clock, in pieces: the wordmark is gone before the frame reaches it and back after it', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeAccountApi(page);
  await openStart(page, PHONE_Q);
  await expect(accountRow(page)).toBeVisible();
  const panel = await edgesOf(page, PANEL);
  const LARGE = '.wc-start .wc-frame:not([hidden]) .wc-lk-large > .wc-lk-box';

  const there = await watchMorph(page, () => row(page, 'about').tap());
  expect(there.plans).toEqual(['open']);
  expect(there.flew).toBe(true);
  expect(there.blank, blanks(there)).toBe(0);
  expect(brandOverFrame(there), 'the wordmark over the frame, opening').toEqual([]);
  await expect(page.locator(LARGE)).toBeVisible();
  expect(landingGap(there, await edgesOf(page, LARGE))).toBeLessThan(2);

  const home = await watchMorph(page, () => back(page).tap());
  expect(home.plans).toEqual(['close']);
  expect(home.flew).toBe(true);
  expect(home.blank, blanks(home)).toBe(0);
  expect(brandOverFrame(home), 'the wordmark over the frame, closing').toEqual([]);
  await expect(page.locator(PANEL)).toBeVisible();
  expect(landingGap(home, panel)).toBeLessThan(2);
  await expect(page.locator('.wc-start-brand')).toHaveCSS('opacity', '1');
  await expect(page.locator('.wc-start-almanac')).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

test('phone: menu → Log in morphs; the field has the focus from the mount, our keyboard comes up and the proxy lands on the box', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeAccountApi(page);
  await openStart(page, PHONE_Q);
  await expect(accountRow(page)).toBeVisible();
  await startMorphWatch(page);
  await accountRow(page).tap();
  await expect(page.locator('.wc-start')).toHaveAttribute('data-lk-morph', 'swap');
  await expect(field(page, 'name')).toBeFocused();
  await expect(okb(page), 'our keyboard is up during the flight').toBeVisible();
  await morphDone(page);
  const w = await stopMorphWatch(page);
  expect(w.plans).toEqual(['swap']);
  expect(w.flew).toBe(true);
  expect(w.blank, blanks(w)).toBe(0);
  expect(brandOverFrame(w)).toEqual([]);
  const planned = w.frames.filter((f) => f.plan);
  expect([...new Set(planned.map((f) => f.focus))]).toEqual(['input[name]']);
  // The box as our keyboard left it: the proxy landed there, and the box is above the keyboard.
  await expect(pageOf(page, 'login')).toBeVisible();
  const box = await edgesOf(page, SUB);
  expect(landingGap(w, box), 'the proxy landed on the box').toBeLessThan(2);
  await okbType(page, 'olev');
  await expect(field(page, 'name')).toHaveValue('olev');

  // On to Create account (a tall box on a phone) and back: the wordmark is never over the frame.
  const taller = await watchMorph(page, () => link(page, 'create').tap());
  expect(taller.plans).toEqual(['swap']);
  expect(brandOverFrame(taller), 'the wordmark over the frame, Log in → Create account').toEqual([]);
  await expect(page.locator('.wc-start')).toHaveAttribute('data-lk-box', 'tall');
  await expect(page.locator('.wc-start-brand')).toBeHidden();
  const lower = await watchMorph(page, () => back(page).tap());
  expect(lower.plans).toEqual(['swap']);
  expect(brandOverFrame(lower), 'the wordmark over the frame, Create account → Log in').toEqual([]);
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(page.locator('.wc-start-brand')).toBeVisible();
  await expect(page.locator('.wc-start-brand')).toHaveCSS('opacity', '1');

  const home = await watchMorph(page, () => back(page).tap());
  expect(home.plans).toEqual(['swap']);
  expect(home.flew).toBe(true);
  expect(home.blank, blanks(home)).toBe(0);
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(okb(page)).toBeHidden();
  await expect(accountRow(page)).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

test('phone: menu ↔ Account (a tall box): the wordmark fades before the frame flies over its place and comes back after the landing', async ({ page }) => {
  const errors = watchErrors(page);
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD);
  await fakeAccountApi(page, { server });
  await openStart(page, PHONE_Q);
  await expect(accountRow(page)).toBeVisible();
  await accountRow(page).tap();
  await expect(pageOf(page, 'login')).toBeVisible();
  await field(page, 'name').fill(NAME);
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'LOGIN').tap();
  await expect(pageOf(page, 'account')).toBeVisible();
  await morphDone(page);
  const start = page.locator('.wc-start');
  await expect(start).toHaveAttribute('data-lk-box', 'tall');
  await expect(page.locator('.wc-start-brand')).toBeHidden();
  const brandPlace = await edgesOf(page, '.wc-start-brand > *');
  const tall = await edgesOf(page, SUB);
  expect(tall[1], 'the tall box reaches over the wordmark’s place').toBeLessThan(brandPlace[3]);

  // Back: the wordmark stays away until the panel has landed.
  const home = await watchMorph(page, () => back(page).tap());
  expect(home.plans).toEqual(['swap']);
  expect(home.flew).toBe(true);
  expect(home.blank, blanks(home)).toBe(0);
  expect(brandOverFrame(home), 'the wordmark over the frame on the way back').toEqual([]);
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(page.locator('.wc-start-brand')).toBeVisible();
  await expect(page.locator('.wc-start-brand')).toHaveCSS('opacity', '1');
  await expect(page.locator('.wc-start-almanac')).toHaveCSS('opacity', '1');
  expect(landingGap(home, await edgesOf(page, PANEL))).toBeLessThan(2);

  // The owner row again (logged in: the Account page): the wordmark is gone before the frame reaches it.
  const there = await watchMorph(page, () => accountRow(page).tap());
  expect(there.plans).toEqual(['swap']);
  expect(there.flew).toBe(true);
  expect(there.blank, blanks(there)).toBe(0);
  expect(brandOverFrame(there), 'the wordmark over the frame on the way in').toEqual([]);
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(start).toHaveAttribute('data-lk-box', 'tall');
  await expect(page.locator('.wc-start-brand')).toBeHidden();
  await expect(page.locator('.wc-start-almanac')).toBeHidden();
  expect(landingGap(there, await edgesOf(page, SUB))).toBeLessThan(2);
  expect(await edgesOf(page, SUB)).toEqual(tall);
  expect(errors).toEqual([]);
});
