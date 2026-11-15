// Stage 67 (spec §2.5, ADR 0149 and its addendum): the start menu in its
// three forms on a desktop. Form 1 is the page with no API (production
// today: no owner row, no Community); form 2 has the flag `accounts`
// (the fake account API with `?cloudtest`); form 3 adds Community (the
// flags `share` and `gallery`, stage 65 C1).
//
// - The rows, the rules and the letters of each form; E P S H A by key,
//   L and C doing nothing without Community, U nothing without accounts.
// - The owner row: "Guest · log in" → Log in; a name → the Account page;
//   no visible U; a long name gives way, the state never.
// - The mouse: hover moves the cursor, a click opens.
// - How the owner row comes in late: account-pages.spec.ts.
//
// With `WC_MENU_SHOTS=<dir>` the forms are saved as pictures there.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import { DESKTOP, SKY, accountRow, frame, pageOf, selectedRow } from './account-pages';
import { fakeAccountApi } from './cloud-account-fake';

test.use({ viewport: DESKTOP });

const rows = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm > li');
/** The menu's entries top to bottom: a row's key, or `rule`. */
const entries = (page: Page) =>
  rows(page).evaluateAll((els) => els.map((e) => (e.classList.contains('wc-sm-sep') ? 'rule' : (e as HTMLElement).dataset.key)));
const hood = (page: Page) => frame(page).locator('.wc-lk-hood-t');
const menuShown = (page: Page) => expect(frame(page).locator('.wc-sm')).toBeVisible();

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.WC_MENU_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`/?${SKY}${query}`);
  await expect(selectedRow(page).locator('.wc-sm-label')).toHaveText('Enter MUME');
}

/** Form 2 or 3: accounts on (the fake API), the owner row in. `name`: somebody is logged in here. */
async function openWithAccounts(page: Page, o: { name?: string; query?: string; community?: number } = {}): Promise<void> {
  const api = await fakeAccountApi(page);
  // Community (stage 65 C1): the flags, and `community` listed runs a guest has not seen.
  if (o.community !== undefined) {
    api.server.flags = { accounts: true, share: true, gallery: true };
    for (let i = 0; i < o.community; i++) api.server.addPub('nobody', { listed: true, listedAt: api.server.now() - (i + 1) * 60_000 });
  }
  if (o.name) await page.addInitScript((n) => localStorage.setItem('wc.account', JSON.stringify({ name: n })), o.name);
  await open(page, `&cloudtest${o.query ?? ''}`);
  await expect(accountRow(page)).toBeVisible();
  await page.mouse.move(5, 5);
}

const panelBox = async (page: Page) => (await page.locator('.wc-start .wc-sm-panel').boundingBox())!;

test('form 1 (no accounts, no Community): play, a rule, mine, About; the letters; L, C and U do nothing', async ({ page }) => {
  await open(page);
  expect(await entries(page)).toEqual(['enter', 'rule', 'profile', 'scripts', 'history', 'about']);
  // The letters, marked in the labels.
  expect(await page.locator('.wc-start .wc-sm-item u.wc-sk').allTextContents()).toEqual(['E', 'P', 'S', 'H', 'A']);
  await expect(page.locator('.wc-start .wc-sm-item[data-key="profile"] .wc-sm-note')).toHaveText('(default)');
  // The panel keeps its width and its place under the wordmark.
  const box = await panelBox(page);
  expect(box.width).toBe(360);
  expect(box.x).toBe((DESKTOP.width - 360) / 2);
  await shot(page, 'form1.desktop');

  for (const k of ['l', 'c', 'u']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
    await menuShown(page);
    await expect(selectedRow(page)).toHaveAttribute('data-key', 'enter');
  }
  // P, S, H, A open their pages; Esc comes back with the cursor on the row.
  for (const [k, key, title] of [
    ['p', 'profile', 'Profiles'],
    ['s', 'scripts', 'Scripts'],
    ['h', 'history', 'History'],
    ['a', 'about', 'About'],
  ] as const) {
    await page.keyboard.press(k);
    await expect(hood(page)).toHaveText(title);
    await page.keyboard.press('Escape');
    await menuShown(page);
    await expect(selectedRow(page)).toHaveAttribute('data-key', key);
  }
  // The arrows walk the rows (not the rule) and wrap.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'profile');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'about');
});

test('E enters MUME', async ({ page }) => {
  let opened = 0;
  await page.routeWebSocket('wss://mume.org/ws-play/', () => {
    opened++;
  });
  await open(page);
  await page.keyboard.press('e');
  await expect.poll(() => opened).toBe(1);
});

test('the mouse: hover moves the cursor, a click opens; About is a quiet row of its own', async ({ page }) => {
  await open(page);
  const history = page.locator('.wc-start .wc-sm-item[data-key="history"]');
  const hb = (await history.boundingBox())!;
  await page.mouse.move(hb.x + 40, hb.y + hb.height / 2);
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'history');
  const about = page.locator('.wc-start .wc-sm-item[data-key="about"]');
  const ab = (await about.boundingBox())!;
  // Lower than a row and smaller type, centred in the panel.
  expect(ab.height).toBeLessThan(hb.height);
  const panel = await panelBox(page);
  expect(Math.abs(ab.x + ab.width / 2 - (panel.x + panel.width / 2))).toBeLessThan(2);
  await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height / 2);
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'about');
  await about.click();
  await expect(hood(page)).toHaveText('About');
});

test('form 2, a guest: the owner row under the rule says "Guest · log in", no visible U; U and a click open Log in', async ({ page }) => {
  await openWithAccounts(page);
  expect(await entries(page)).toEqual(['enter', 'rule', 'owner', 'profile', 'scripts', 'history', 'about']);
  const row = accountRow(page);
  await expect(row).toHaveText('Guest · log in');
  await expect(row).toHaveAttribute('data-state', 'guest');
  await expect(row).toHaveAttribute('aria-keyshortcuts', 'U');
  await expect(row).toHaveAttribute('aria-label', 'Guest · log in');
  await expect(row.locator('u.wc-sk')).toHaveCount(0);
  await expect(row.locator('.wc-so-mark.is-key svg')).toHaveCount(1);
  await expect(row.locator('.wc-so-chev')).toBeVisible();
  // The letters of the other rows are unchanged.
  expect(await page.locator('.wc-start .wc-sm-item u.wc-sk').allTextContents()).toEqual(['E', 'P', 'S', 'H', 'A']);
  // A heading line: lower than a row, but larger than the mockup's 32 px; it reaches past the rows to the right.
  const rb = (await row.boundingBox())!;
  const pb = (await page.locator('.wc-start .wc-sm-item[data-key="profile"]').boundingBox())!;
  expect(rb.height).toBeGreaterThan(32);
  expect(rb.height).toBeLessThan(pb.height);
  expect(rb.x).toBe(pb.x);
  expect(rb.x + rb.width).toBeGreaterThan(pb.x + pb.width);
  await shot(page, 'form2-guest.desktop');

  // The cursor on it: the rule under the line lights, the chevron steps forward.
  await page.keyboard.press('ArrowDown');
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'owner');
  await expect.poll(() => row.evaluate((e) => getComputedStyle(e, '::after').opacity)).not.toBe('0');
  await shot(page, 'form2-guest-cursor.desktop');

  await page.keyboard.press('u');
  await expect(pageOf(page, 'login')).toBeVisible();
  await page.keyboard.press('Escape');
  await menuShown(page);
  await row.click();
  await expect(pageOf(page, 'login')).toBeVisible();
});

test('form 2, logged in: the name alone (no "synced" before sync exists); U opens the Account page', async ({ page }) => {
  await openWithAccounts(page, { name: 'Olev' });
  const row = accountRow(page);
  await expect(row).toHaveText('Olev');
  await expect(row).toHaveAttribute('data-state', 'name');
  await expect(row).not.toContainText('synced');
  await shot(page, 'form2-name.desktop');
  await page.keyboard.press('ArrowDown');
  await shot(page, 'form2-name-cursor.desktop');
  await page.keyboard.press('u');
  await expect(frame(page).locator('[data-page="account"], [data-page="login"]')).toBeVisible();
});

test('the longest name allowed stays inside the owner row (an ellipsis if it must); the panel keeps its width', async ({ page }) => {
  await openWithAccounts(page, { name: 'olevongertten_arda20' });
  const row = accountRow(page);
  await expect(row).toHaveAttribute('aria-label', 'olevongertten_arda20');
  const name = row.locator('.wc-so-name');
  expect(await name.evaluate((e) => getComputedStyle(e).textOverflow)).toBe('ellipsis');
  const nb = (await name.boundingBox())!;
  const cb = (await row.locator('.wc-so-chev').boundingBox())!;
  const panel = await panelBox(page);
  expect(panel.width).toBe(360);
  expect(nb.x + nb.width).toBeLessThanOrEqual(cb.x);
  expect(cb.x + cb.width).toBeLessThan(panel.x + panel.width - 12);
  await shot(page, 'form2-long.desktop');
});

test('the kit gallery draws every owner row state; a long name with a state gives way, the state and the news never', async ({ page }) => {
  await page.goto(`/?${SKY}&kit=menu`);
  const section = page.locator('.wc-kit-section[data-section="menu"]');
  await expect(section).toBeVisible();
  const owners = section.locator('.wc-sm-owner');
  await expect(owners).toHaveCount(11);
  expect(await owners.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.state))).toEqual([
    'guest',
    'name',
    'synced',
    'syncing',
    'offline',
    'attention',
    'attention',
    'locked',
    'synced',
    'attention',
    'synced',
  ]);
  const longest = owners.nth(9);
  await expect(longest).toHaveAttribute('aria-label', 'olevongertten · storage full · 2 new');
  const cut = (sel: string) => longest.locator(sel).evaluate((e) => e.scrollWidth > e.clientWidth + 0.5);
  expect(await cut('.wc-so-name')).toBe(true);
  expect(await cut('.wc-so-state')).toBe(false);
  expect(await cut('.wc-so-news')).toBe(false);
  await expect(longest.locator('.wc-so-state')).toHaveText(' · storage full');
  await shot(page, 'kit-owner-states.desktop');
  await page.keyboard.press('c');
  await expect(section.locator('.wc-sm-owner.is-sel')).toHaveCount(11);
  await shot(page, 'kit-owner-states-cursor.desktop');
});

test('form 3: a second rule parts Community; its counter in gold; C opens it; the arrows walk all rows', async ({ page }) => {
  await openWithAccounts(page, { community: 3 });
  await expect(page.locator('.wc-start .wc-sm-item[data-key="community"]')).toBeVisible();
  expect(await entries(page)).toEqual(['enter', 'rule', 'owner', 'profile', 'scripts', 'history', 'rule', 'community', 'about']);
  const com = page.locator('.wc-start .wc-sm-item[data-key="community"]');
  await expect(com.locator('.wc-sm-label')).toHaveText('Community');
  await expect(com).toBeVisible();
  await expect(com.locator('.wc-sm-count')).toHaveText('3 new');
  expect(await com.locator('.wc-sm-count').evaluate((e) => getComputedStyle(e).fontStyle)).toBe('italic');
  expect(await page.locator('.wc-start .wc-sm-item u.wc-sk').allTextContents()).toEqual(['E', 'P', 'S', 'H', 'C', 'A']);
  // The counter takes no width of the rows' column: the rows stand where they do without it.
  const withCount = (await page.locator('.wc-start .wc-sm-item[data-key="profile"]').boundingBox())!;
  await shot(page, 'form3.desktop');
  await page.keyboard.press('c');
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'community');
  await expect(frame(page).locator('.wc-cy')).toBeVisible();
  await expect(frame(page).locator('.wc-cy-row')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'community');
  await shot(page, 'form3-cursor-community.desktop');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'community');
  await page.keyboard.press('ArrowUp');
  await expect(selectedRow(page)).toHaveAttribute('data-key', 'history');

  // Seen (the page was opened): no counter, after a reload too; the rows do not move.
  await expect(com.locator('.wc-sm-count')).toHaveCount(0);
  await page.goto(`/?${SKY}&cloudtest`);
  await expect(accountRow(page)).toBeVisible();
  await expect(com).toBeVisible();
  await page.waitForTimeout(500);
  await expect(com.locator('.wc-sm-count')).toHaveCount(0);
  const without = (await page.locator('.wc-start .wc-sm-item[data-key="profile"]').boundingBox())!;
  expect(without.x).toBe(withCount.x);
});
