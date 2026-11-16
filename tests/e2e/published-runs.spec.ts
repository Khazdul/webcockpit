// Stage 65 C3 (ADR 0155; round 13's picks 5 and 6 "as drawn"): Published
// runs as a view of its own and the owner row's reactions mark, on a
// desktop, against the account fake with `gallery` on (`?cloudtest`). The
// phone: phone-hall-of-fame.spec.ts. With `gallery` off the stage 64
// section is unchanged (share-link.spec.ts).
//
// - The Account page's section is one row: "4 runs · 2 listed · 475 views ·
//   2 new" and Published runs (U).
// - The view: per run the title, Listed / Link only, the stars and votes,
//   comments, views, date and size, what is new in gold with a mark at the
//   left; the hidden run's note. Opening it asks the news, then the list,
//   then posts `seen {reactions: newest}`; what was new stays shown until
//   it closes; the row and the owner row lose their mark.
// - Edit with the switch "Listed in the Community" (PATCH listed; 429).
// - Remove; empty.
// - The owner row's "· N new" (99+): a press opens the view straight away.
import { type Page, expect, test } from '@playwright/test';
import { DESKTOP, NAME, accountRow, btn, dialog, dialogError, frame, pageOf, watchErrors } from './account-pages';
import type { FakeAccountServer } from './cloud-account-fake';
import { fakeAccountApi } from './cloud-account-fake';
import { DAY, MB, apiLog, logInToAccount, pubRows, server, startPage, voter } from './community-pub';
import { pinDemoClock } from './demo-clock';

test.use({ viewport: DESKTOP });

const view = (page: Page) => pageOf(page, 'published');
const row = (page: Page, id: string) => frame(page).locator(`.wc-ac-pub[data-pub="${id}"]`);

/** fenwick's four runs of the mockup, with votes and comments by Norsy and Kuzzim; 2 new reactions. */
function seedRuns(s: FakeAccountServer): void {
  voter(s, 'Norsy');
  voter(s, 'Kuzzim');
  const now = s.now();
  s.addPub(NAME, { id: 'Zp6Wd3Fg5uNa', title: 'Trollshaws hoard run', views: 21, bytes: Math.round(1.9 * MB), state: 'hidden', created: now - 12 * DAY });
  s.addPub(NAME, { id: 'Hn4Kc8Vb1sYe', title: 'First crossing of the <b>Brandywine</b>', views: 5, bytes: 600 * 1024, created: now - 5 * DAY });
  s.addPub(NAME, { id: 'Qm7Rt2Lp9xWz', title: 'Gibur and the Witch-king’s lieutenant', views: 412, bytes: Math.round(2.4 * MB), created: now - DAY, listed: true, listedAt: now - DAY });
  s.addPub(NAME, { id: 'Ab3dE5fG7hJk', title: 'Clearing the ranger camp', views: 37, bytes: Math.round(1.2 * MB), created: now - 1000, listed: true, listedAt: now - 1000 });
  s.addVote('Norsy', 'Qm7Rt2Lp9xWz', 5, { ago: 20 * 3600_000 });
  s.addVote('Kuzzim', 'Qm7Rt2Lp9xWz', 4, { ago: 20 * 3600_000 });
  s.addComment('Norsy', 'Qm7Rt2Lp9xWz', 'Well led.', { ago: 20 * 3600_000 });
  // Seen up to an hour ago: the two below are new.
  s.seenTimes.set(NAME.toLowerCase(), { gallery: 0, reactions: now - 3600_000 });
  s.addVote('Norsy', 'Ab3dE5fG7hJk', 4, { ago: 600_000 });
  s.addComment('Kuzzim', 'Ab3dE5fG7hJk', 'The turn at the bridge is the best part.', { ago: 300_000 });
}

async function openView(page: Page): Promise<void> {
  await btn(page, 'PUBLISHED').click();
  await expect(view(page)).toBeVisible();
  await expect(pubRows(page).first()).toBeVisible();
}

test('the Account page keeps one row; the view: chips, stars, comments, views, what is new; seen after the list', async ({ page }) => {
  const errors = watchErrors(page);
  const s = await server();
  seedRuns(s);
  await pinDemoClock(page);
  await fakeAccountApi(page, { server: s });
  await logInToAccount(page);

  await expect(frame(page).locator('.wc-lk-sec')).toHaveText(['Published logs', 'Devices', 'Password and recovery', 'Leaving']);
  await expect(frame(page).locator('[data-pub-summary]')).toHaveText('4 logs · 2 listed · 475 views · 2 new');
  await expect(frame(page).locator('[data-pub-summary] [data-pub-new]')).toHaveText('2 new');
  await expect(frame(page).locator('[data-page="account"] .wc-ac-pub')).toHaveCount(0);
  await expect(btn(page, 'PUBLISHED')).toHaveText('Published logs');

  const log = apiLog(page);
  // U opens it.
  await page.keyboard.press('u');
  await expect(view(page)).toBeVisible();
  await expect(frame(page).locator('.wc-lk-hood-t')).toHaveText('Published logs');
  await expect(pubRows(page)).toHaveCount(4);
  await expect(view(page).locator('[data-account-name]')).toHaveText(NAME);
  await expect(view(page).locator('[data-pub-head]')).toHaveText(/^4 of 150 · 6\.\d MB, not counted against your 50 MB · 2 new since you last looked$/);

  const camp = row(page, 'Ab3dE5fG7hJk');
  await expect(camp.locator('[data-pub-title]')).toHaveText('Clearing the ranger camp');
  await expect(camp.locator('[data-pub-chip]')).toHaveText('Listed');
  await expect(camp.locator('[data-pub-stars]')).toHaveText(/4\.0 · 1 vote$/);
  await expect(camp.locator('[data-pub-comments]')).toHaveText('1');
  await expect(camp.locator('[data-pub-views]')).toHaveText('37 views');
  await expect(camp.locator('[data-pub-new]')).toHaveText('1 vote · 1 comment new');
  await expect(camp).toHaveClass(/is-new/);

  const gibur = row(page, 'Qm7Rt2Lp9xWz');
  await expect(gibur.locator('[data-pub-stars]')).toHaveText(/4\.5 · 2 votes$/);
  await expect(gibur.locator('[data-pub-stars] .wc-lk-star-on')).toHaveText('★★★★★');
  await expect(gibur.locator('[data-pub-new]')).toHaveCount(0);
  await expect(gibur).not.toHaveClass(/is-new/);

  const ford = row(page, 'Hn4Kc8Vb1sYe');
  // Markup in a title is text.
  await expect(ford.locator('[data-pub-title]')).toHaveText('First crossing of the <b>Brandywine</b>');
  await expect(ford.locator('[data-pub-chip]')).toHaveText('Link only');
  await expect(ford.locator('[data-pub-stars]')).toHaveText('no votes');
  await expect(ford.locator('[data-pub-views]')).toHaveText('5 views');
  await expect(ford.locator('.wc-ac-pub-r')).toContainText('0.6 MB');

  const hoard = row(page, 'Zp6Wd3Fg5uNa');
  await expect(hoard.locator('[data-pub-hidden]')).toHaveText('Hidden after reports. Only you can watch it until we have looked.');
  await expect(hoard.locator('[data-btn="EDIT"]')).toHaveCount(0);

  // The news, then the list, then seen with the newest reaction's time.
  await expect.poll(() => log.filter((r) => r.path.startsWith('/api/u/community/') || r.path === '/api/u/pub').map((r) => `${r.method} ${r.path}`)).toEqual([
    'GET /api/u/community/news',
    'GET /api/u/pub',
    'POST /api/u/community/seen',
  ]);
  const seen = JSON.parse(log.find((r) => r.path === '/api/u/community/seen')!.body!) as { reactions: number };
  expect(Object.keys(seen)).toEqual(['reactions']);
  expect(seen.reactions).toBe(s.now() - 300_000);
  expect(s.seenTimes.get(NAME.toLowerCase())!.reactions).toBe(s.now() - 300_000);

  // What was new stays until the view closes, also after the list is asked again (an edit).
  await camp.locator('[data-btn="EDIT"]').click();
  const edit = dialog(page, 'pub-edit');
  await edit.locator('[data-field="title"] input').fill('Clearing the camp');
  await btn(page, 'SAVE').click();
  await expect(edit).toHaveCount(0);
  await expect(camp.locator('[data-pub-title]')).toHaveText('Clearing the camp');
  await expect(camp.locator('[data-pub-new]')).toHaveText('1 vote · 1 comment new');

  // Back: the Account page's row has nothing new now.
  await page.keyboard.press('Escape');
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('[data-pub-summary]')).toHaveText('4 logs · 2 listed · 475 views');

  // Again: nothing is new.
  await openView(page);
  await expect(view(page).locator('[data-pub-new]')).toHaveCount(0);
  await expect(view(page).locator('.wc-ac-pub.is-new')).toHaveCount(0);
  await expect(view(page).locator('[data-pub-head]')).toHaveText(/not counted against your 50 MB$/);
  expect(errors).toEqual([]);
});

test('Edit lists and unlists with the switch; the 10-a-day refusal is said in the dialog', async ({ page }) => {
  const errors = watchErrors(page);
  const s = await server();
  seedRuns(s);
  await startPage(page, s, { login: false });
  await logInToAccount(page);
  await openView(page);
  const log = apiLog(page);

  // Unlist the listed one: only `listed` goes.
  await row(page, 'Ab3dE5fG7hJk').locator('[data-btn="EDIT"]').click();
  const edit = dialog(page, 'pub-edit');
  const sw = edit.locator('[data-field="listed"]');
  await expect(sw).toHaveAttribute('role', 'switch');
  await expect(sw).toHaveAttribute('aria-label', 'Listed in the Community');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(edit.locator('.wc-ac-pub-note')).toContainText('Off: only people with the link can watch it. The stars and comments stay.');
  await expect(btn(page, 'SAVE')).toHaveAttribute('aria-disabled', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await btn(page, 'SAVE').click();
  await expect(edit).toHaveCount(0);
  await expect(row(page, 'Ab3dE5fG7hJk').locator('[data-pub-chip]')).toHaveText('Link only');
  expect(log.filter((r) => r.method === 'PATCH').map((r) => [r.path, r.body])).toEqual([['/api/u/pub/Ab3dE5fG7hJk', '{"listed":false}']]);
  const listedAt = s.pubsOf(NAME).find((p) => p.id === 'Ab3dE5fG7hJk')!.listedAt;

  // List it again by the keyboard: Tab to the switch, Space, Enter saves; listedAt is kept.
  await row(page, 'Ab3dE5fG7hJk').locator('[data-btn="EDIT"]').click();
  await expect(edit).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(edit.locator('.wc-ac-pub-listrow')).toHaveClass(/is-cur/);
  await page.keyboard.press('Space');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(edit).toHaveCount(0);
  await expect(row(page, 'Ab3dE5fG7hJk').locator('[data-pub-chip]')).toHaveText('Listed');
  expect(s.pubsOf(NAME).find((p) => p.id === 'Ab3dE5fG7hJk')!.listedAt).toBe(listedAt);

  // A first listing past the day's 10: the refusal in the dialog, nothing changed.
  // (The camp's first listing was today: nine more make ten.)
  for (let i = 0; i < 9; i++) s.addPub(NAME, { title: `Today ${i}`, listed: true, listedAt: s.now() - i });
  await page.keyboard.press('Escape');
  await openView(page);
  await row(page, 'Hn4Kc8Vb1sYe').locator('[data-btn="EDIT"]').click();
  await edit.locator('[data-field="listed"]').click();
  await btn(page, 'SAVE').click();
  await expect(dialogError(page)).toHaveText('You have listed as many logs as you may today. List it tomorrow; turn the switch off to save the rest now.');
  expect(s.pubsOf(NAME).find((p) => p.id === 'Hn4Kc8Vb1sYe')!.listed).toBe(false);
  await page.keyboard.press('Escape');
  await expect(edit).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Remove in the view; the last one gone leaves the empty line, and the Account page says how', async ({ page }) => {
  const errors = watchErrors(page);
  const s = await server();
  s.addPub(NAME, { id: 'Ab3dE5fG7hJk', title: 'Clearing the ranger camp', listed: true });
  await startPage(page, s, { login: false });
  await logInToAccount(page);
  await expect(frame(page).locator('[data-pub-summary]')).toHaveText('1 log · 1 listed · 0 views');
  await openView(page);
  await row(page, 'Ab3dE5fG7hJk').locator('[data-btn="REMOVE"]').click();
  await expect(dialog(page, 'pub-remove')).toBeVisible();
  await btn(page, 'REMOVE').click();
  await expect(dialog(page, 'pub-remove')).toHaveCount(0);
  await expect(frame(page).locator('.wc-ac-flash')).toHaveText('Removed. The link now says so.');
  await expect(pubRows(page)).toHaveCount(0);
  await expect(view(page).locator('[data-pub-empty]')).toHaveText('None yet. In History, Share a session and choose Link or Hall of Fame.');
  expect(s.pubsOf(NAME)).toHaveLength(0);
  await frame(page).locator('.wc-lk-back').first().click();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('[data-pub-empty]')).toHaveText('None yet. In History, Share a session and choose Link or Hall of Fame.');
  await expect(btn(page, 'PUBLISHED')).toHaveCount(0);
  // U does nothing without runs.
  await page.keyboard.press('u');
  await expect(view(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the owner row: "· 2 new" in gold; a press opens Published runs straight away, which clears it', async ({ page }) => {
  const errors = watchErrors(page);
  const s = await server();
  seedRuns(s);
  await startPage(page, s);
  const news = accountRow(page).locator('.wc-so-news');
  await expect(news).toHaveText(' · 2 new');
  await expect(accountRow(page)).toHaveAttribute('aria-label', `${NAME} · 2 new`);
  await page.mouse.move(1, 1);
  await accountRow(page).click();
  await expect(view(page)).toBeVisible();
  await expect(row(page, 'Ab3dE5fG7hJk').locator('[data-pub-new]')).toHaveText('1 vote · 1 comment new');
  await expect(view(page).locator('[data-account-name]')).toHaveText(NAME);
  await expect.poll(() => s.seenTimes.get(NAME.toLowerCase())!.reactions).toBe(s.now() - 300_000);
  // Back goes to the menu, whose row has lost the mark.
  await page.keyboard.press('Escape');
  await expect(accountRow(page)).toBeVisible();
  await expect(news).toHaveCount(0);
  await expect(accountRow(page)).toHaveText(NAME);
  // Without news a press opens the Account page.
  await accountRow(page).click();
  await expect(pageOf(page, 'account')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the owner row stops at 99+; nothing for a guest; nothing asked with gallery off', async ({ page }) => {
  const s = await server();
  voter(s, 'Norsy');
  const id = s.addPub(NAME, { title: 'Popular', listed: true });
  for (let i = 0; i < 120; i++) s.addComment('Norsy', id, `Nice ${i}.`, { ago: i });
  await startPage(page, s);
  await expect(accountRow(page).locator('.wc-so-news')).toHaveText(' · 99+ new');

  const off = await server({ gallery: false });
  seedRuns(off);
  const page2 = await page.context().newPage();
  const log = apiLog(page2);
  await startPage(page2, off);
  await expect(accountRow(page2)).toHaveText(NAME);
  await page2.waitForTimeout(500);
  expect(log.filter((r) => r.path.startsWith('/api/u/community/'))).toEqual([]);
  await page2.close();
});

// The owner's feedback on stage 65 (ADR 0155 W1): a press on a run's title
// opens its watch page in this tab; the watch page's Back comes to Published
// runs again. The title is a stop of the view's ring (Tab, Enter).
test('a press on the title opens the watch page; its Back returns to Published runs; Tab and Enter reach it too', async ({ page }) => {
  const errors = watchErrors(page);
  const s = await server();
  seedRuns(s);
  await startPage(page, s, { login: false });
  await logInToAccount(page);
  await openView(page);
  const title = row(page, 'Ab3dE5fG7hJk').locator('[data-pub-title]');
  await expect(title).toHaveAttribute('href', '/r/Ab3dE5fG7hJk?from=published&cloudtest');
  await title.click();
  await expect(page).toHaveURL(/\/r\/Ab3dE5fG7hJk\?from=published&cloudtest$/);
  await expect(page.locator('.wc-watch')).toBeVisible();
  await page.locator('.wc-watch [data-btn="BACK"]').first().click();
  // The start page, then Published runs over it; the query leaves the address.
  await expect(view(page)).toBeVisible({ timeout: 15_000 });
  await expect(pubRows(page)).toHaveCount(4);
  await expect(page).toHaveURL(/\/\?cloudtest$/);
  // The keyboard: Tab walks to the first run's title (the first stop), Enter opens it.
  const first = pubRows(page).first().locator('[data-pub-title]');
  const href = (await first.getAttribute('href'))!;
  await page.keyboard.press('Tab');
  await expect(first).toHaveClass(/is-sel/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[?]/g, '\\?')}$`));
  expect(errors).toEqual([]);
});
