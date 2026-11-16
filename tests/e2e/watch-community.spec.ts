// Stage 65 C2 (spec §7.8, ADR 0155; round 13's pick 3a with the owner's
// change): the watch page inside the start page's look (the still sky, the
// sub-page frame, Back at its top left, to the Community when the run came
// from there), the stars in the band (one's own vote set, changed and taken
// back; none on one's own run; a guest's "Log in to rate") and the comments
// under the replay (newest last, posting, Remove, Report with the comment
// quoted, a guest's "Log in to comment", none yet, Earlier comments past 50);
// with the flag `gallery` off, stage 64's page in the new frame. Desktop
// (Chromium and Firefox); the phone's in phone-watch-community.spec.ts.
import { type Page, expect, test } from '@playwright/test';
import { seedAccount } from './cloud-account-fake';
import { ID, SENDER, WATCHER, type WatchSetup, band, dialog, logIn, openWatch, playing, setUp, watchBox, watchBtn } from './watch-page';

test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

const stars = (page: Page) => page.locator('.wc-watch [data-watch="stars"]');
const comments = (page: Page) => page.locator('.wc-watch [data-watch="comments"]');
const comment = (page: Page, text: string) => comments(page).locator('.wc-watch-cm', { hasText: text });

/** Accounts that vote and comment (each must exist: the fake counts only live accounts' votes). */
async function others(s: WatchSetup, ...names: string[]): Promise<void> {
  for (const n of names) await seedAccount(s.api.server, n, 'correct horse battery');
}

/** The seeded run with three votes (5, 4, 4: 4.3) and two comments. */
async function social(s: WatchSetup): Promise<void> {
  await others(s, 'kuzzim', 'saelind', 'marrowfield');
  s.api.server.addVote('kuzzim', ID, 5);
  s.api.server.addVote('saelind', ID, 4);
  s.api.server.addVote('marrowfield', ID, 4);
  s.api.server.addComment('kuzzim', ID, 'I was the one at the ford.', { ago: 2 * 86_400_000 });
  s.api.server.addComment('saelind', ID, 'Lovely clean run.', { ago: 3 * 3_600_000 });
}

test('the frame: the still sky, the sub-page box with Back at its top left, the band and the replay inside it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setUp(page, { gallery: true });
  await openWatch(page);
  await playing(page);
  // No start page and no sky engine: the still sky's gradients on the page's host.
  await expect(page.locator('.wc-start')).toHaveCount(0);
  await expect(page.locator('.wc-start-skyhost canvas, canvas.wc-sky')).toHaveCount(0);
  expect(await page.locator('.wc-watch').evaluate((e) => getComputedStyle(e).backgroundImage)).toMatch(/gradient/);
  // The box: its hood and Back at its top left; the band and the frame inside its window.
  const box = (await watchBox(page).boundingBox())!;
  await expect(watchBox(page).locator('.wc-lk-hood-t')).toHaveText('Shared run');
  const back = (await watchBtn(page, 'BACK').boundingBox())!;
  expect(back.x - box.x).toBeLessThan(40);
  expect(back.y - box.y).toBeLessThan(40);
  const b = (await band(page).boundingBox())!;
  const slot = (await page.locator('.wc-watch-slot').boundingBox())!;
  for (const r of [b, slot]) {
    expect(r.x).toBeGreaterThan(box.x);
    expect(r.x + r.width).toBeLessThan(box.x + box.width);
  }
  expect(slot.y).toBeGreaterThanOrEqual(b.y + b.height - 1);
  // The band and the replay fill the first view; the comments are under it (the page scrolls).
  expect(slot.y + slot.height).toBeLessThanOrEqual(900);
  expect(slot.y + slot.height).toBeGreaterThan(820);
  expect((await comments(page).boundingBox())!.y).toBeGreaterThan(slot.y + slot.height);
  // Back: the start page.
  await watchBtn(page, 'BACK').click();
  await expect(page).toHaveURL(/\/\?cloudtest$/);
  expect(errors).toEqual([]);
});

test('Back goes to the Community when the run came from it (?from=community); B too', async ({ page }) => {
  await setUp(page, { gallery: true });
  await page.goto(`/r/${ID}?from=community&cloudtest`);
  await playing(page);
  await watchBtn(page, 'BACK').click();
  await expect(page).toHaveURL(/\/\?community&cloudtest$/);
  await page.goto(`/r/${ID}?from=community&cloudtest`);
  await playing(page);
  await band(page).locator('[data-watch="title"]').click();
  await page.keyboard.press('b');
  await expect(page).toHaveURL(/\/\?community&cloudtest$/);
});

test('logged in: rate, change, take back; the vote is there again after a reload', async ({ page }) => {
  const s = await setUp(page, { gallery: true });
  await social(s);
  await logIn(page, s, WATCHER);
  await openWatch(page);
  await playing(page);
  const st = stars(page);
  await expect(st).toHaveAttribute('data-role', 'voter');
  await expect(st.locator('[data-watch="stars-mine"]')).toHaveText('Rate this run');
  await expect(st.locator('[data-watch="stars-mean"]')).toHaveText('4.3 · 3 votes');
  await expect(st.locator('button.is-lit')).toHaveCount(0);
  // The stars sit in the band, between the details and the buttons.
  const id = (await band(page).locator('.wc-watch-id').boundingBox())!;
  const r = (await st.boundingBox())!;
  const rep = (await watchBtn(page, 'REPORT').boundingBox())!;
  expect(r.x).toBeGreaterThan(id.x + id.width - 1);
  expect(r.x + r.width).toBeLessThan(rep.x);

  await st.locator('[data-v="2"]').click();
  await expect(st.locator('[data-watch="stars-mine"]')).toHaveText('Your stars: two');
  await expect(st.locator('button.is-lit')).toHaveCount(2);
  await expect(st.locator('[data-watch="stars-mean"]')).toHaveText('3.8 · 4 votes');
  await expect(band(page).locator('.wc-watch-flash')).toHaveText('You gave two stars.');
  await st.locator('[data-v="5"]').click();
  await expect(st.locator('[data-watch="stars-mine"]')).toHaveText('Your stars: five');
  await expect(st.locator('[data-watch="stars-mean"]')).toHaveText('4.5 · 4 votes');
  expect(s.api.server.votes.get(ID)!.get(WATCHER.toLowerCase())!.stars).toBe(5);
  await page.reload();
  await playing(page);
  await expect(stars(page).locator('[data-watch="stars-mine"]')).toHaveText('Your stars: five');
  await expect(stars(page).locator('button.is-lit')).toHaveCount(5);
  // A click on one's own vote takes it back.
  await stars(page).locator('[data-v="5"]').click();
  await expect(stars(page).locator('[data-watch="stars-mine"]')).toHaveText('Rate this run');
  await expect(stars(page).locator('[data-watch="stars-mean"]')).toHaveText('4.3 · 3 votes');
  expect(s.api.server.votes.get(ID)!.has(WATCHER.toLowerCase())).toBe(false);
});

test('one\'s own run: the mean and "your run", no stars to give; Remove on every comment, no Report', async ({ page }) => {
  const s = await setUp(page, { gallery: true });
  await social(s);
  await logIn(page, s, SENDER);
  await openWatch(page);
  await playing(page);
  await expect(stars(page)).toHaveAttribute('data-role', 'own');
  await expect(stars(page).locator('[role="radio"]')).toHaveCount(0);
  await expect(stars(page).locator('.wc-watch-rate-l')).toHaveText('3 votes · your run');
  await expect(stars(page).locator('.wc-watch-rate-static b')).toHaveText('4.3');
  await expect(comments(page).locator('[data-btn="REMOVE"]')).toHaveCount(2);
  await expect(comments(page).locator('[data-btn="REPORT-COMMENT"]')).toHaveCount(0);
  // The sender removes another's comment.
  await comment(page, 'Lovely clean run.').locator('[data-btn="REMOVE"]').click();
  await expect(comment(page, 'Lovely clean run.')).toHaveCount(0);
  expect([...s.api.server.comments.values()].map((c) => c.text)).toEqual(['I was the one at the ford.']);
  await expect(comments(page).locator('[data-watch="comments-count"]')).toHaveText('1');
});

test('a guest: the mean and "Log in to rate"; the comments without Remove or Report; "Log in to comment"', async ({ page }) => {
  const s = await setUp(page, { gallery: true });
  await social(s);
  await openWatch(page);
  await playing(page);
  await expect(stars(page)).toHaveAttribute('data-role', 'guest');
  await expect(stars(page).locator('.wc-watch-rate-l')).toHaveText('3 votes · Log in to rate');
  await expect(comments(page).locator('.wc-watch-cm')).toHaveCount(2);
  // Newest last, the writer and the age.
  await expect(comments(page).locator('[data-watch="writer"]')).toHaveText(['kuzzim', 'saelind']);
  await expect(comments(page).locator('.wc-watch-cm time')).toHaveText(['2 days ago', '3 h ago']);
  await expect(comments(page).locator('[data-btn="REMOVE"], [data-btn="REPORT-COMMENT"]')).toHaveCount(0);
  await expect(comments(page).locator('[data-watch="comment-guest"]')).toContainText('Comments come from accounts.');
  await expect(comments(page).locator('[data-watch="comment-form"]')).toHaveCount(0);
  // Log in to comment: the start page's Log in, and back to the run after it.
  await comments(page).locator('[data-btn="LOGIN-COMMENT"]').click();
  await expect(page).toHaveURL(/\/\?cloudtest$/);
  await expect(page.locator('.wc-start [data-page="login"]')).toBeVisible({ timeout: 15_000 });
  const note = await page.evaluate(() => JSON.parse(sessionStorage.getItem('wc.watch.back') ?? 'null') as { back: string } | null);
  expect(note?.back).toBe(`/r/${ID}?cloudtest`);
});

test('a guest\'s "Log in to rate" opens Log in', async ({ page }) => {
  const s = await setUp(page, { gallery: true });
  await social(s);
  await openWatch(page);
  await playing(page);
  await stars(page).locator('[data-btn="LOGIN-RATE"]').click();
  await expect(page.locator('.wc-start [data-page="login"]')).toBeVisible({ timeout: 15_000 });
});

test('logged in: post a comment (cleaned and trimmed), remove it; report another\'s with it quoted', async ({ page }) => {
  const s = await setUp(page, { gallery: true });
  await social(s);
  await logIn(page, s, WATCHER);
  await openWatch(page);
  await playing(page);
  const form = comments(page).locator('[data-watch="comment-form"]');
  const field = form.locator('textarea');
  await expect(form.locator('[data-btn="POST"]')).toHaveAttribute('aria-disabled', 'true');
  // A zero width space and a soft hyphen are taken out as it is typed; the spaces around go when it is sent.
  await field.fill('  The turn​ at the bri­dge is the best part.  ');
  await expect(field).toHaveValue('  The turn at the bridge is the best part.  ');
  await expect(form.locator('.wc-watch-ccount')).toHaveText('44 / 1000');
  await form.locator('[data-btn="POST"]').click();
  await expect(comments(page).locator('.wc-watch-cm').last()).toContainText('The turn at the bridge is the best part.');
  await expect(comments(page).locator('.wc-watch-cm').last()).toHaveClass(/is-own/);
  await expect(comments(page).locator('.wc-watch-cm').last().locator('[data-watch="writer"]')).toHaveText(WATCHER);
  await expect(field).toHaveValue('');
  expect([...s.api.server.comments.values()].at(-1)!.text).toBe('The turn at the bridge is the best part.');
  await expect(comments(page).locator('[data-watch="comments-count"]')).toHaveText('3');
  // Only one's own has Remove; the others have Report.
  await expect(comments(page).locator('[data-btn="REMOVE"]')).toHaveCount(1);
  await expect(comments(page).locator('[data-btn="REPORT-COMMENT"]')).toHaveCount(2);
  await comments(page).locator('.wc-watch-cm.is-own [data-btn="REMOVE"]').click();
  await expect(comments(page).locator('.wc-watch-cm.is-own')).toHaveCount(0);
  expect([...s.api.server.comments.values()]).toHaveLength(2);

  // Report: the stage 64 dialog with the comment quoted, kind `comment`.
  await comment(page, 'Lovely clean run.').locator('[data-btn="REPORT-COMMENT"]').click();
  const d = dialog(page, 'report');
  await expect(d.locator('.wc-lk-hood-t')).toHaveText('Report this comment');
  await expect(d).toContainText('What is wrong with this comment by saelind?');
  await expect(d.locator('[data-watch="quote"]')).toHaveText('Lovely clean run.');
  await expect(d).toContainText('The writer is not told who reported.');
  await d.locator('[data-reason="harassment"]').click();
  await d.locator('[data-field="report-text"] textarea').fill('Not nice.');
  await d.locator('[data-btn="SEND"]').click();
  await expect(dialog(page, 'report-thanks').locator('.wc-lk-qn')).toHaveText(
    'We look at every report. A comment that breaks the rules is removed; one that many report is hidden until then.',
  );
  const target = [...s.api.server.comments.values()].find((c) => c.text === 'Lovely clean run.')!.id;
  expect(s.api.server.commentReports).toEqual([{ account: WATCHER, target, reason: 'harassment', text: 'Not nice.' }]);
  await dialog(page, 'report-thanks').locator('[data-btn="CLOSE"]').click();
  await comment(page, 'Lovely clean run.').locator('[data-btn="REPORT-COMMENT"]').click();
  await expect(dialog(page, 'report-already').locator('.wc-lk-q')).toHaveText('You have already reported this comment.');
});

test('a refused comment says why; a refused vote too', async ({ page }) => {
  const s = await setUp(page, { gallery: true });
  await social(s);
  await logIn(page, s, WATCHER);
  s.api.server.setLimits(WATCHER, { commentsPerHour: 0, votesPerHour: 0 });
  // The vote limit counts other runs' votes: one in the last hour.
  s.api.server.addVote(WATCHER, 'Other0000000', 3);
  await openWatch(page);
  await playing(page);
  await comments(page).locator('textarea').fill('Hello');
  await comments(page).locator('[data-btn="POST"]').click();
  await expect(comments(page).locator('[data-watch="comments-error"]')).toHaveText('You have written many comments this hour. Try again later.');
  await stars(page).locator('[data-v="3"]').click();
  await expect(band(page).locator('.wc-watch-flash')).toHaveText('You have rated many runs this hour. Try again later.');
  await expect(stars(page).locator('[data-watch="stars-mine"]')).toHaveText('Rate this run');
});

test('no comments yet; markup in a comment stays text', async ({ page }) => {
  const s = await setUp(page, { gallery: true });
  await openWatch(page);
  await playing(page);
  await expect(comments(page).locator('[data-watch="comments-none"]')).toHaveText('No comments yet.');
  await expect(stars(page).locator('.wc-watch-rate-l')).toHaveText('No votes yet · Log in to rate');
  await others(s, 'kuzzim');
  s.api.server.addComment('kuzzim', ID, '<img src=x onerror="window.__pwned=1"><b>bold</b> https://evil.example');
  await page.reload();
  await playing(page);
  await expect(comments(page).locator('[data-watch="comment-text"]')).toHaveText('<img src=x onerror="window.__pwned=1"><b>bold</b> https://evil.example');
  await expect(comments(page).locator('img, b:not([data-watch]), a')).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
});

test('past 50: the newest 50 first, Earlier comments before them, none skipped when one goes meanwhile (review fix CR1)', async ({ page }) => {
  const s = await setUp(page, { gallery: true });
  await others(s, 'kuzzim');
  for (let i = 1; i <= 120; i++) s.api.server.addComment('kuzzim', ID, `Comment ${i}`, { ago: (200 - i) * 60_000 });
  await openWatch(page);
  await playing(page);
  const items = comments(page).locator('.wc-watch-cm');
  await expect(items).toHaveCount(50);
  await expect(items.first()).toContainText('Comment 71');
  await expect(items.last()).toContainText('Comment 120');
  await expect(comments(page).locator('[data-watch="comments-count"]')).toHaveText('120');
  // One of the shown ones is removed by its writer meanwhile: Earlier still brings 21–70.
  s.api.server.removeComment(ID, 'Comment 100');
  await comments(page).locator('[data-btn="EARLIER"]').click();
  await expect(items).toHaveCount(100);
  await expect(items.first()).toContainText('Comment 21');
  await expect(items.nth(49)).toContainText('Comment 70');
  await comments(page).locator('[data-btn="EARLIER"]').click();
  await expect(items).toHaveCount(120);
  await expect(items.first()).toContainText('Comment 1');
  await expect(comments(page).locator('[data-btn="EARLIER"]')).toHaveCount(0);
});

test('the flag gallery off: stage 64\'s page in the frame, no stars, no comments, no scrolling', async ({ page }) => {
  const s = await setUp(page);
  await social(s);
  await logIn(page, s, WATCHER);
  const asked: string[] = [];
  page.on('request', (r) => asked.push(new URL(r.url()).pathname));
  await openWatch(page);
  await playing(page);
  await expect(watchBox(page)).toBeVisible();
  await expect(stars(page)).toHaveCount(0);
  await expect(comments(page)).toHaveCount(0);
  await expect(watchBtn(page, 'REPORT')).toBeVisible();
  const h = await page.locator('.wc-watch-page').evaluate((e) => [e.scrollHeight, e.clientHeight]);
  expect(h[0]).toBeLessThanOrEqual(h[1]!);
  // No community request was made.
  expect(asked.filter((p) => /\/(comments|vote)$/.test(p))).toEqual([]);
});

test('a comment’s text is clipped to its box: a stored tower of marks paints over nothing (review fix S1)', async ({ page }) => {
  const s = await setUp(page, { gallery: true });
  await others(s, 'kuzzim');
  // An old row from before the rule (the fake stores what it is given).
  s.api.server.addComment('kuzzim', ID, `x${'\u0310\u0311\u0312\u200d'.repeat(60)}`, { ago: 120_000 });
  s.api.server.addComment('kuzzim', ID, 'Below it', { ago: 60_000 });
  await openWatch(page);
  await playing(page);
  const texts = comments(page).locator('[data-watch="comment-text"]');
  await expect(texts).toHaveCount(2);
  expect(await texts.first().evaluate((el) => getComputedStyle(el).overflow)).toBe('hidden');
});
