// Stage 65 feedback round 3 (ADR 0156): the map of a shared run on the
// watch page zooms with the wheel and the page does not scroll. Since stage
// 71 (ADR 0160) the map is the desktop lens; since stage 73 its zoom is
// four levels, and the wheel over the lens (with or without Ctrl, a
// trackpad pinch) steps them one at a time; the page does not scroll and
// the player's cursor does not move. The touch side is
// phone-watch-map-zoom.spec.ts; the rest of the lens is watch-lens.spec.ts.
import { expect, test } from '@playwright/test';
import { openWatch, pausedInFrame, playing, replay, setUp, startRun } from './watch-page';
import { lensMap, mapSent, recordMapWorker } from './watch-map';

test("the wheel over the watch page's lens steps its zoom levels, Ctrl+wheel too; the page stays put", async ({ page }) => {
  test.setTimeout(60_000);
  await recordMapWorker(page);
  await setUp(page);
  await openWatch(page);
  await playing(page);
  await startRun(page);
  await lensMap(page);
  const r = replay(page);
  const level = async (): Promise<number> => Number(await r.locator('.wc-dl').getAttribute('data-level'));
  const b = (await r.locator('.wc-dl').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  const scrollY = await page.evaluate(() => window.scrollY);
  const lines = await r.locator('.wc-player').evaluate((el) => el.textContent?.length ?? 0);
  expect(await level()).toBe(0);
  const sent = async (): Promise<number> => (await mapSent(page)).filter((m) => m.t === 'zoomTo').length;
  const n0 = await sent();
  await page.mouse.wheel(0, 200);
  await expect.poll(level).toBe(1);
  await expect.poll(sent).toBe(n0 + 1);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, -100);
  await expect.poll(level).toBe(0);
  // Ctrl+wheel (a trackpad pinch): the small deltas gather to a step.
  await page.waitForTimeout(400);
  await page.keyboard.down('Control');
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 20);
  await page.keyboard.up('Control');
  await expect.poll(level).toBe(1);
  // No relative zoom: the levels are absolute.
  expect((await mapSent(page)).filter((m) => m.t === 'zoom')).toEqual([]);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  expect(await r.locator('.wc-player').evaluate((el) => el.textContent?.length ?? 0)).toBeGreaterThanOrEqual(lines);
});

// Stage 73 round 1: the wheel over the lens moved the paused player's
// cursor and scrolled the log under it (it bubbled to the player's root).
// Every wheel over the lens (the glass, the rim band, a dot, a touchpad's
// coasting in the rest after a step) only zooms.
test('paused, the wheel over the lens leaves the cursor and the log where they are', async ({ page }) => {
  test.setTimeout(60_000);
  await recordMapWorker(page);
  await setUp(page);
  await openWatch(page);
  await playing(page);
  await startRun(page);
  await lensMap(page);
  const r = replay(page);
  await page.waitForTimeout(1500);
  await r.locator('.wc-player').click({ position: { x: 100, y: 300 } });
  await page.keyboard.press('Space');
  await pausedInFrame(page);
  // The wheel over the log moves the cursor up: the log is scrolled back from its end.
  await page.mouse.move(100, 300);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
  await expect(r.locator('.wc-player-cursor')).toHaveCount(1);
  const level = async (): Promise<number> => Number(await r.locator('.wc-dl').getAttribute('data-level'));
  /** The cursor's line and every scroller's position. */
  const state = async (): Promise<string> =>
    r.locator('body').evaluate((b) => {
      const cur = b.querySelector('.wc-player-cursor');
      const rows = cur ? [...(cur.parentElement?.children ?? [])].indexOf(cur) : -1;
      const tops = [...b.querySelectorAll('.wc-scroller')].map((s) => s.scrollTop);
      return JSON.stringify({ rows, text: cur?.textContent, tops });
    });
  const s0 = await state();
  const b = (await r.locator('.wc-dl').boundingBox())!;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  // The glass.
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, 100);
  await expect.poll(level).toBe(1);
  // A touchpad's coasting in the rest after a step.
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 15);
  await page.waitForTimeout(400);
  // The rim band.
  await page.mouse.move(b.x + b.width - 2, cy);
  await expect(r.locator('.wc-dl-rim')).toHaveCSS('cursor', 'ew-resize');
  await page.mouse.wheel(0, 100);
  await expect.poll(level).toBe(2);
  await page.waitForTimeout(400);
  // A dot.
  const d = (await r.locator('.wc-dl-dot').nth(2).boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.wheel(0, -100);
  await expect.poll(level).toBe(1);
  await page.waitForTimeout(400);
  expect(await state()).toBe(s0);
  await pausedInFrame(page);
});
