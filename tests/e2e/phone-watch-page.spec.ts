// Stage 64 C2 on a phone (round 12's pick 3a: the band stacks: title,
// details, the buttons; no description; stage 65: Back at the frame's top left): a guest watches a seeded run,
// one view; Report logged out and in; a state; Download; Back. The
// desktop's are in watch-page.spec.ts.
import { expect, test } from '@playwright/test';
import {
  ID,
  WATCHER,
  band,
  dialog,
  expectEnd,
  frameFillsWindow,
  frameIsFullscreen,
  guestWatches,
  logIn,
  noFrameFullscreen,
  openWatch,
  playing,
  replay,
  setUp,
  watchBtn,
} from './watch-page';

test.describe.configure({ timeout: 60_000 });

test('phone: a guest watches; the band stacks; Report says log in; Back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = await setUp(page);
  await guestWatches(page, s);
  await expect(page.locator('html')).toHaveClass(/wc-phone/);
  // Stacked: the buttons under the details, side by side, the short Download.
  await expect(watchBtn(page, 'DOWNLOAD')).toHaveText('Download');
  const title = (await band(page).locator('[data-watch="title"]').boundingBox())!;
  const report = (await watchBtn(page, 'REPORT').boundingBox())!;
  const download = (await watchBtn(page, 'DOWNLOAD').boundingBox())!;
  const back = (await watchBtn(page, 'BACK').boundingBox())!;
  expect(report.y).toBeGreaterThan(title.y + title.height);
  expect(Math.abs(report.y - download.y)).toBeLessThan(2);
  // Stage 65: Back at the frame's top left, above the title (the start menu's sub-pages' place).
  expect(back.y + back.height).toBeLessThanOrEqual(title.y + 1);
  expect(back.x).toBeLessThan(60);
  await expect(band(page).locator('[data-watch="description"]')).toBeHidden();
  // The replay fills the width under the band.
  const slot = (await page.locator('.wc-watch-slot').boundingBox())!;
  // Stage 65: inside the start page's frame, which fills the width.
  expect(slot.width).toBeGreaterThan(page.viewportSize()!.width - 40);
  await watchBtn(page, 'REPORT').tap();
  await expect(dialog(page, 'report-guest').locator('.wc-lk-q')).toHaveText('Log in to report.');
  await dialog(page, 'report-guest').locator('[data-btn="CLOSE"]').tap();
  await watchBtn(page, 'BACK').tap();
  await expect(page).toHaveURL(/\/\?cloudtest$/);
  expect(errors).toEqual([]);
});

test('phone: Report logged in, and Download', async ({ page }) => {
  const s = await setUp(page);
  await logIn(page, s, WATCHER);
  await openWatch(page);
  await playing(page);
  await watchBtn(page, 'REPORT').tap();
  const d = dialog(page, 'report');
  await d.locator('[data-reason="harassment"]').tap();
  await d.locator('[data-btn="SEND"]').tap();
  await expect(dialog(page, 'report-thanks').locator('.wc-lk-q')).toHaveText('Thank you.');
  expect(s.pubs.reports).toEqual([{ kind: 'run', target: ID, reason: 'harassment', account: WATCHER }]);
  await dialog(page, 'report-thanks').locator('[data-btn="CLOSE"]').tap();
  const [download] = await Promise.all([page.waitForEvent('download'), watchBtn(page, 'DOWNLOAD').tap()]);
  expect(download.suggestedFilename()).toBe('Clearing the ranger camp.html');
});

test('phone: the states keep their box', async ({ page }) => {
  const s = await setUp(page);
  s.pubs.setState(ID, 'removed');
  await openWatch(page);
  await expectEnd(page, 'This run was removed by its sender.', 'The link no longer leads anywhere.');
  const box = (await page.locator('.wc-watch [data-watch="end"]').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

// The owner's test of stage 64: the replay's Fullscreen on the watch page.
test('phone: Fullscreen puts the frame alone in fullscreen; without element fullscreen (the iPhone) it fills the window over the band', async ({ page }) => {
  await setUp(page);
  await openWatch(page);
  await playing(page);
  const fsButton = replay(page).locator('.wc-player-box [data-act="extra"]');
  await replay(page).locator('.wc-player').tap();
  await fsButton.tap();
  await expect.poll(() => frameIsFullscreen(page)).toBe(true);
  await expect(fsButton).toHaveAttribute('aria-label', 'Exit fullscreen (F)');
  await fsButton.tap();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(fsButton).toHaveAttribute('aria-label', 'Fullscreen (F)');

  await noFrameFullscreen(page);
  await fsButton.tap();
  await expect(page.locator('.wc-watch-slot')).toHaveClass(/is-filled/);
  await expect.poll(() => frameFillsWindow(page)).toBe(true);
  await expect(fsButton).toHaveAttribute('aria-label', 'Exit fullscreen (F)');
  await fsButton.tap();
  await expect(page.locator('.wc-watch-slot')).not.toHaveClass(/is-filled/);
  await expect(fsButton).toHaveAttribute('aria-label', 'Fullscreen (F)');
  await expect(band(page)).toBeVisible();
});
