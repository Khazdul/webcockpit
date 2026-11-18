// Stage 65 feedback round 3 (ADR 0156): the map of a shared run on the
// watch page zooms with the wheel and the page does not scroll. Since stage
// 71 (ADR 0160) the map is the desktop lens; since stage 73 its zoom is
// four levels, and the wheel over the lens (with or without Ctrl, a
// trackpad pinch) steps them one at a time; the page does not scroll and
// the player's cursor does not move. The touch side is
// phone-watch-map-zoom.spec.ts; the rest of the lens is watch-lens.spec.ts.
import { expect, test } from '@playwright/test';
import { openWatch, playing, replay, setUp } from './watch-page';
import { lensMap, mapSent, recordMapWorker } from './watch-map';

test("the wheel over the watch page's lens steps its zoom levels, Ctrl+wheel too; the page stays put", async ({ page }) => {
  test.setTimeout(60_000);
  await recordMapWorker(page);
  await setUp(page);
  await openWatch(page);
  await playing(page);
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
