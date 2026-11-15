// Stage 65 C1 (round 13's pick 1b, the phone's form): the Community page
// on a phone, against the fake of the account API (community.ts). The
// tabs Runs · Hall of Fame · Runes; Runs shows New only, without sorting;
// the pager; a sender's runs; Random Runes on its tab; `runes` off: two
// tabs; the guest's counter on the menu. The desktop:
// community-page.spec.ts.
import { expect, test } from '@playwright/test';
import { ME, box, btnIn, cm, communityRow, logIn, noteField, notes, openCommunity, openStart, pager, rows, runes, setUp, shot } from './community';

const PHONE_Q = '&phone=1&kbd=en';
const tab = (page: import('@playwright/test').Page, id: string) => cm(page).locator(`.wc-cy-tabs [data-tab="${id}"]`);

test('the tabs: Runs (New only, no headings), Hall of Fame (the boxes), Runes; nothing scrolls sideways', async ({ page }) => {
  const s = await setUp(page);
  await logIn(page, s);
  await openCommunity(page, PHONE_Q);
  await expect(cm(page).locator('.wc-cy-tabs [role="tab"]')).toHaveText(['1Runs', '2Hall of Fame', '3Runes']);
  await expect(tab(page, 'runs')).toHaveAttribute('aria-selected', 'true');
  await expect(rows(page)).toHaveCount(10);
  await expect(cm(page).locator('.wc-cy-th')).toHaveCount(0);
  await expect(cm(page).locator('.wc-cy-list')).toHaveAttribute('data-sort', 'new');
  expect(await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))).toEqual(s.runs.slice(0, 10));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, 'in.phone');
  // The pager at the list's foot.
  await btnIn(cm(page), 'NEXT').tap();
  await expect(pager(page)).toHaveText('Page 2 of 3');
  await expect(rows(page).first()).toHaveAttribute('data-id', s.runs[10]!);
  // Hall of Fame: the boxes stacked.
  await tab(page, 'hof').tap();
  await expect(box(page, 'hof').locator('li')).toHaveCount(8);
  await expect(box(page, 'war')).toContainText('38 players on MUME');
  await expect(box(page, 'day')).toBeVisible();
  await shot(page, 'hof.phone');
  // Runes: the board and the field.
  await tab(page, 'runes').tap();
  await expect(notes(page)).toHaveCount(3);
  await noteField(page).tap();
  await noteField(page).fill('Orcs at the ford, bring light');
  await btnIn(runes(page), 'POST').tap();
  await expect(notes(page).first()).toHaveClass(/is-own/);
  expect([...s.server.notes.values()].some((n) => n.account === ME && n.text === 'Orcs at the ford, bring light')).toBe(true);
  await shot(page, 'runes.phone');
  // A tap opens a note's actions.
  await notes(page).nth(1).tap();
  await expect(btnIn(notes(page).nth(1), 'REPORT')).toBeVisible();
});

test('a sender’s runs from the Runs tab, and Back; a tap on a run opens it', async ({ page }) => {
  const s = await setUp(page);
  await openCommunity(page, PHONE_Q);
  const sender = (await rows(page).first().locator('.wc-cy-sender').textContent())!;
  await rows(page).first().locator('.wc-cy-sender').tap();
  await expect(cm(page).locator('.wc-cy-by-t')).toHaveText(`Runs by ${sender}`);
  await cm(page).locator('.wc-lk-back').tap();
  await expect(cm(page).locator('.wc-cy-by')).toHaveCount(0);
  await rows(page).first().locator('.wc-cy-p1').tap();
  await expect(page).toHaveURL(new RegExp(`/r/${s.runs[0]}\\?from=community`));
});

test('runes off: two tabs; the guest’s counter on the menu clears when the page is opened', async ({ page }) => {
  await setUp(page, { flags: { runes: false } });
  await openStart(page, PHONE_Q);
  await expect(communityRow(page).locator('.wc-sm-count')).toHaveText('23 new');
  await communityRow(page).tap();
  await expect(rows(page)).toHaveCount(10);
  await expect(cm(page).locator('.wc-cy-tabs [role="tab"]')).toHaveText(['1Runs', '2Hall of Fame']);
  await expect(runes(page)).toHaveCount(0);
  await cm(page).locator('.wc-lk-back').tap();
  await expect(communityRow(page).locator('.wc-sm-count')).toHaveCount(0);
});

test('a kept view sorted by Top asks the list once, as New, on a phone (review fix CR7)', async ({ page }) => {
  await setUp(page);
  const asked: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/api/gallery') asked.push(u.search);
  });
  await page.addInitScript(() => sessionStorage.setItem('wc.community.view', JSON.stringify({ sort: 'top', page: 1 })));
  await openStart(page, `${PHONE_Q}&community`);
  await expect(cm(page).locator('.wc-cy-list')).toHaveAttribute('data-state', 'list');
  await expect(cm(page).locator('.wc-cy-list')).toHaveAttribute('data-sort', 'new');
  await page.waitForTimeout(300);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain('sort=new');
});
