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
  // Play (the bar shows on a tap) starts it.
  await replay(page).locator('.wc-player').tap();
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

// Stage 65 feedback round 2: in portrait the replay is a 60-column player; the Map alone (a span
// over both default lanes) collapsed its dock, beside Group it showed. Every pane alone and
// together shows now (src/layout/allocate.ts `squeezeSides`).
test('phone portrait: Map, Timers and Group each show alone and together', async ({ page }) => {
  await setUp(page);
  await openWatch(page);
  await playing(page);
  const r = replay(page);
  const box = r.locator('.wc-player-box');
  const pop = box.locator('.wc-pc-pop[data-pop="panes"]');
  const shown = (): Promise<string[]> =>
    r.locator('.wc-pane[data-pane]:visible').evaluateAll((ps) => ps.map((p) => (p as HTMLElement).dataset.pane!).sort());
  const toggle = async (id: string): Promise<void> => {
    if (!(await pop.isVisible())) {
      await r.locator('.wc-player').tap();
      await box.locator('[data-act="panes"]').tap();
    }
    await pop.locator(`[data-pane="${id}"]`).tap();
  };
  expect(page.viewportSize()!.width).toBeLessThan(page.viewportSize()!.height);
  await expect.poll(shown).toEqual([]);
  for (const [id, want] of [
    ['map', ['map']],
    ['map', []],
    ['timers', ['timers']],
    ['map', ['map', 'timers']],
    ['timers', ['map']],
    ['group', ['group', 'map']],
    ['map', ['group']],
    ['group', []],
  ] as const) {
    await toggle(id);
    await expect.poll(shown, `${id} → ${want.join('+')}`).toEqual([...want]);
  }
  // The map has room to draw in.
  await toggle('map');
  await expect.poll(shown).toEqual(['map']);
  const map = (await r.locator('.wc-pane[data-pane="map"]').boundingBox())!;
  expect(map.width).toBeGreaterThan(100);
  expect(map.height).toBeGreaterThan(100);
});
