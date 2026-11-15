// Stage 67 (spec §2.5, ADR 0149): the phone's start menu has the desktop's
// structure in portrait and in landscape: Enter MUME, the rule, the owner
// row (flag `accounts`), Profile, Scripts, History, the second rule and
// Community (only with the flags `share` and `gallery`, stage 65 C1), About.
// The owner row has a chevron and no key cap; a tap opens Log in. The
// desktop: start-menu.spec.ts. The game's menu sheet (unchanged, no
// account row): phone-account-pages.spec.ts.
//
// `phone` project (Pixel 7: a touch browser). Nothing reaches MUME.
//
// With `WC_MENU_SHOTS=<dir>` the views are saved as pictures there.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import { LANDSCAPE, OWNER_GUEST, PHONE, PHONE_Q, SKY, accountRow, frame, pageOf } from './account-pages';
import { fakeAccountApi } from './cloud-account-fake';

test.use({ viewport: PHONE });

const start = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const entries = (page: Page) =>
  start(page)
    .locator('.wc-sm > li')
    .evaluateAll((els) => els.map((e) => (e.classList.contains('wc-sm-sep') ? 'rule' : (e as HTMLElement).dataset.key)));

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.WC_MENU_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(dir, `${name}.png`), scale: 'css' });
}

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?${SKY}${PHONE_Q}${query}`);
  await expect(start(page).locator('.wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
}

for (const [view, size] of [
  ['portrait', PHONE],
  ['landscape', LANDSCAPE],
] as const) {
  test(`${view}: form 1 is the same structure as the desktop's; nothing scrolls sideways`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page, '');
    expect(await entries(page)).toEqual(['enter', 'rule', 'profile', 'scripts', 'history', 'about']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, `form1.${view}`);
  });

  test(`${view}: forms 2 and 3, the owner row with its chevron and no key cap; a tap opens Log in`, async ({ page }) => {
    await page.setViewportSize(size);
    const api = await fakeAccountApi(page);
    api.server.flags = { accounts: true, share: true, gallery: true };
    for (let i = 0; i < 3; i++) api.server.addPub('nobody', { listed: true, listedAt: api.server.now() - (i + 1) * 60_000 });
    await open(page, '&cloudtest');
    await expect(accountRow(page)).toBeVisible();
    await expect(start(page).locator('.wc-sm-item[data-key="community"]')).toBeVisible();
    expect(await entries(page)).toEqual(['enter', 'rule', 'owner', 'profile', 'scripts', 'history', 'rule', 'community', 'about']);
    await expect(accountRow(page)).toHaveText(OWNER_GUEST);
    await expect(accountRow(page).locator('.wc-so-chev')).toBeVisible();
    await expect(accountRow(page).locator('u.wc-sk, kbd')).toHaveCount(0);
    await expect(start(page).locator('.wc-sm-item[data-key="community"] .wc-sm-count')).toHaveText('3 new');
    // Every row inside the panel, the panel inside the window's width.
    const panel = (await start(page).locator('.wc-sm-panel').boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(size.width);
    const chev = (await accountRow(page).locator('.wc-so-chev').boundingBox())!;
    expect(chev.x + chev.width).toBeLessThan(panel.x + panel.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, `form3.${view}`);
    await accountRow(page).tap();
    await expect(pageOf(page, 'login')).toBeVisible();
    await expect(frame(page).locator('[data-page="login"]')).toBeVisible();
  });
}

test('portrait: the longest name allowed stays inside the owner row (an ellipsis if it must), the panel keeps its width', async ({ page }) => {
  await fakeAccountApi(page);
  await page.addInitScript(() => localStorage.setItem('wc.account', JSON.stringify({ name: 'olevongertten_arda20' })));
  await open(page, '&cloudtest');
  await expect(accountRow(page)).toBeVisible();
  const name = (await accountRow(page).locator('.wc-so-name').boundingBox())!;
  const chev = (await accountRow(page).locator('.wc-so-chev').boundingBox())!;
  const panel = (await start(page).locator('.wc-sm-panel').boundingBox())!;
  expect(name.x + name.width).toBeLessThanOrEqual(chev.x);
  expect(chev.x + chev.width).toBeLessThan(panel.x + panel.width);
  expect(panel.width).toBeLessThanOrEqual(PHONE.width - 32);
  await shot(page, 'form2-long.portrait');
});
