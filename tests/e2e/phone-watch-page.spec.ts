// Stage 64 C2 on a phone (round 12's pick 3a: the band stacks: title,
// details, the buttons; no description; stage 65: Back at the frame's top left): a guest watches a seeded run,
// one view; Report logged out and in; a state; no Download, a paused
// start (stage 65 W1); Back. The
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
  pausedInFrame,
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
  // Stacked: Report under the details (no Download since W1).
  await expect(watchBtn(page, 'DOWNLOAD')).toHaveCount(0);
  await pausedInFrame(page);
  const title = (await band(page).locator('[data-watch="title"]').boundingBox())!;
  const report = (await watchBtn(page, 'REPORT').boundingBox())!;
  const back = (await watchBtn(page, 'BACK').boundingBox())!;
  expect(report.y).toBeGreaterThan(title.y + title.height);
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

test('phone: Report logged in; the run starts paused and Play starts it', async ({ page }) => {
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
  await pausedInFrame(page);
  await expect(replay(page).locator('.wc-player')).toContainText('hardened ranger');
  await page.waitForTimeout(1_000);
  await pausedInFrame(page);
  // Play starts it. The box floats at the frame's foot (stage 73), under the
  // fold of the scrolling page: scrolled into view first.
  await page.locator('.wc-watch-page').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await replay(page).locator('.wc-pc-play').tap();
  await expect(replay(page).locator('.wc-pc-play')).toHaveAttribute('data-playing', 'true');
});

test('phone: the states keep their box', async ({ page }) => {
  const s = await setUp(page);
  s.pubs.setState(ID, 'removed');
  await openWatch(page);
  await expectEnd(page, 'This log was removed by its sender.', 'The link no longer leads anywhere.');
  const box = (await page.locator('.wc-watch [data-watch="end"]').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

// The owner's test of stage 64: the replay's Fullscreen on the watch page. Since stage 71 (ADR
// 0160) it is the lens's top right key on a phone; the box has none.
test('phone: Fullscreen puts the frame alone in fullscreen; without element fullscreen (the iPhone) it fills the window over the band', async ({ page }) => {
  await setUp(page);
  await openWatch(page);
  await playing(page);
  await expect(replay(page).locator('.wc-player-box [data-act="extra"]')).toHaveCount(0);
  const fsButton = replay(page).locator('.wc-ph-lens .wc-ph-sat[data-sat="fullscreen"]');
  await fsButton.tap();
  await expect.poll(() => frameIsFullscreen(page)).toBe(true);
  await fsButton.tap();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();

  await noFrameFullscreen(page);
  await fsButton.tap();
  await expect(page.locator('.wc-watch-slot')).toHaveClass(/is-filled/);
  await expect.poll(() => frameFillsWindow(page)).toBe(true);
  await fsButton.tap();
  await expect(page.locator('.wc-watch-slot')).not.toHaveClass(/is-filled/);
  await expect(band(page)).toBeVisible();
});

// Stage 65 feedback round 2 had Map, Timers and Group each shown alone and together from the
// Panes popup; since stage 71 (ADR 0160) the map is the lens and Group and Timers are the strip's
// pages: phone-watch-lens.spec.ts.

// Stage 65 feedback round 2: on a 360 px phone the narrow box dropped Fullscreen. Since stage 71
// it is the lens's key: there, inside the frame, down to a 360 px portrait phone.
for (const width of [360, 390]) {
  test(`phone portrait ${width} px: the lens keeps Fullscreen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await setUp(page, { gallery: true });
    await openWatch(page);
    await playing(page);
    const fsButton = replay(page).locator('.wc-ph-lens .wc-ph-sat[data-sat="fullscreen"]');
    await expect(fsButton).toBeVisible();
    await expect(fsButton).toHaveAttribute('aria-label', 'Fullscreen');
    // The whole key inside the frame.
    const frame = (await page.locator('.wc-watch-slot iframe').boundingBox())!;
    const b = (await fsButton.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(frame.x);
    expect(b.x + b.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(b.y).toBeGreaterThanOrEqual(frame.y);
    await fsButton.tap();
    await expect.poll(() => frameIsFullscreen(page)).toBe(true);
  });
}
