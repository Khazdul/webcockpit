// Stage 65 C2 on a phone (round 13's pick 3a, the owner's change): the
// frame fills the width, Back at its top left, the stars under the band's
// title and details, the comments under the replay; a voter rates, a guest
// reads "Log in to rate" and "Log in to comment"; a comment is posted.
// The desktop's are in watch-community.spec.ts.
import { expect, test } from '@playwright/test';
import { seedAccount } from './cloud-account-fake';
import { ID, WATCHER, band, logIn, openWatch, playing, setUp, watchBox, watchBtn } from './watch-page';

test.describe.configure({ timeout: 60_000 });

test('phone: the frame fills the width; the stars under the title; the comments under the replay; a guest\'s lines', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = await setUp(page, { gallery: true });
  await seedAccount(s.api.server, 'kuzzim', 'correct horse battery');
  s.api.server.addVote('kuzzim', ID, 4);
  s.api.server.addComment('kuzzim', ID, 'I was the one at the ford.', { ago: 86_400_000 * 2 });
  await openWatch(page);
  await playing(page);
  const vw = page.viewportSize()!.width;
  const box = (await watchBox(page).boundingBox())!;
  expect(box.width).toBeGreaterThan(vw - 16);
  const slot = (await page.locator('.wc-watch-slot').boundingBox())!;
  expect(slot.width).toBeGreaterThan(vw - 40);
  const title = (await band(page).locator('[data-watch="title"]').boundingBox())!;
  const meta = (await band(page).locator('[data-watch="meta"]').boundingBox())!;
  const stars = page.locator('.wc-watch [data-watch="stars"]');
  const st = (await stars.boundingBox())!;
  const report = (await watchBtn(page, 'REPORT').boundingBox())!;
  expect(st.y).toBeGreaterThan(title.y + title.height - 1);
  expect(st.y).toBeGreaterThanOrEqual(meta.y + meta.height - 1);
  expect(report.y).toBeGreaterThan(st.y + st.height - 1);
  const back = (await watchBtn(page, 'BACK').boundingBox())!;
  expect(back.y + back.height).toBeLessThanOrEqual(title.y + 1);
  await expect(stars.locator('.wc-watch-rate-l')).toHaveText('1 vote · Log in to rate');
  const comments = page.locator('.wc-watch [data-watch="comments"]');
  await comments.scrollIntoViewIfNeeded();
  expect((await comments.boundingBox())!.y).toBeGreaterThan((await page.locator('.wc-watch-slot').boundingBox())!.y);
  await expect(comments.locator('.wc-watch-cm')).toHaveCount(1);
  await expect(comments.locator('[data-watch="comment-guest"]')).toContainText('Comments come from accounts.');
  await expect(comments.locator('[data-btn="LOGIN-COMMENT"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('phone: a voter rates and posts a comment', async ({ page }) => {
  const s = await setUp(page, { gallery: true });
  await logIn(page, s, WATCHER);
  await openWatch(page);
  await playing(page);
  const stars = page.locator('.wc-watch [data-watch="stars"]');
  await stars.locator('[data-v="3"]').tap();
  await expect(stars.locator('[data-watch="stars-mine"]')).toHaveText('Your stars: three');
  await expect(stars.locator('[data-watch="stars-mean"]')).toHaveText('3.0 · 1 vote');
  const comments = page.locator('.wc-watch [data-watch="comments"]');
  await expect(comments.locator('[data-watch="comments-none"]')).toHaveText('No comments yet.');
  await comments.locator('textarea').fill('Lovely run.');
  await comments.locator('[data-btn="POST"]').tap();
  await expect(comments.locator('.wc-watch-cm')).toHaveCount(1);
  await expect(comments.locator('[data-watch="comment-text"]')).toHaveText('Lovely run.');
  expect([...s.api.server.comments.values()].map((c) => c.text)).toEqual(['Lovely run.']);
});
