// Stage 65 C3 (ADR 0155; round 13's picks 4, 5 and 6) on a phone: the four
// formats fit one row and a guest's tap on Hall of Fame says why; a
// publication by taps; the owner row's mark opens Published runs by a tap,
// the rows stack, Edit's switch lists. The desktop: hall-of-fame.spec.ts,
// published-runs.spec.ts. `?cloudtest&phone=1`.
import { type Page, expect, test } from '@playwright/test';
import { NAME, PHONE, accountRow, btn, dialog, frame, pageOf, watchErrors } from './account-pages';
import { DAY, MB, exp, inView, openEditorPhone, opt, pubRows, server, startPage, voter } from './community-pub';

test.use({ viewport: PHONE });

const share = (page: Page) => dialog(page, 'share');
const done = (page: Page) => dialog(page, 'share-done');

test('phone: the four formats fit; a guest taps Hall of Fame and is told to log in', async ({ page }) => {
  const errors = watchErrors(page);
  await startPage(page, await server(), { login: false, phone: true });
  await openEditorPhone(page);
  for (const id of ['HTML', 'TEXT', 'LINK', 'HOF']) await inView(page, opt(page, id));
  await inView(page, btn(page, 'EXPORT'));
  await opt(page, 'HOF').tap({ force: true });
  await expect(frame(page).locator('.wc-exp-flash')).toContainText('Log in to publish. Account is on the start page.');
  await expect(exp(page)).toHaveAttribute('data-format', 'html');
  expect(errors).toEqual([]);
});

test('phone: publish to the Hall of Fame by taps', async ({ page }) => {
  const errors = watchErrors(page);
  const s = await server();
  await startPage(page, s, { phone: true });
  await openEditorPhone(page);
  await opt(page, 'HOF').tap();
  await expect(exp(page)).toHaveAttribute('data-format', 'hof');
  await btn(page, 'EXPORT').tap();
  await expect(share(page).locator('.wc-lk-hood-t')).toHaveText('Publish to the Hall of Fame');
  await inView(page, share(page));
  await share(page).locator('[data-field="rules"]').tap();
  await inView(page, btn(page, 'PUBLISH'));
  await btn(page, 'PUBLISH').tap();
  await expect(done(page).locator('.wc-lk-hood-t')).toHaveText('Published');
  await inView(page, btn(page, 'COMMUNITY'));
  expect(s.pubsOf(NAME)[0]).toMatchObject({ listed: true });
  await btn(page, 'DONE').tap();
  await expect(done(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('phone: the owner row\'s mark opens Published runs; the rows fit; Edit lists by a tap', async ({ page }) => {
  const errors = watchErrors(page);
  const s = await server();
  voter(s, 'Norsy');
  s.addPub(NAME, { id: 'Hn4Kc8Vb1sYe', title: 'First crossing of the Brandywine', bytes: Math.round(0.6 * MB), created: s.now() - 5 * DAY });
  s.addPub(NAME, { id: 'Ab3dE5fG7hJk', title: 'Clearing the ranger camp', listed: true, views: 37 });
  s.addComment('Norsy', 'Ab3dE5fG7hJk', 'Well done.', { ago: 1000 });
  await startPage(page, s, { phone: true });
  await expect(accountRow(page).locator('.wc-so-news')).toHaveText(' · 1 new');
  await accountRow(page).tap();
  await expect(pageOf(page, 'published')).toBeVisible();
  await expect(pubRows(page)).toHaveCount(2);
  for (const r of await pubRows(page).all()) await inView(page, r);
  const camp = frame(page).locator('.wc-ac-pub[data-pub="Ab3dE5fG7hJk"]');
  await expect(camp.locator('[data-pub-new]')).toHaveText('1 comment new');
  await inView(page, camp.locator('[data-btn="REMOVE"]'));
  const ford = frame(page).locator('.wc-ac-pub[data-pub="Hn4Kc8Vb1sYe"]');
  await ford.locator('[data-btn="EDIT"]').tap();
  const edit = dialog(page, 'pub-edit');
  await inView(page, edit);
  await edit.locator('[data-field="listed"]').tap();
  await btn(page, 'SAVE').tap();
  await expect(edit).toHaveCount(0);
  await expect(ford.locator('[data-pub-chip]')).toHaveText('Listed');
  await frame(page).locator('.wc-lk-back').first().tap();
  await expect(accountRow(page)).toHaveText(NAME);
  expect(errors).toEqual([]);
});
