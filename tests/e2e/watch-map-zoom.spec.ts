// Stage 65 feedback round 3 (ADR 0156): the map of a shared run on the
// watch page zooms on the desktop as in the cockpit (ADR 0059): every wheel
// event over it, with or without Ctrl (a trackpad pinch), zooms around the
// pointer; the page does not scroll and the player's cursor does not move.
// The touch side is phone-watch-map-zoom.spec.ts. Since stage 71 (ADR 0160)
// the map is the desktop lens, always shown; the rest of the lens is
// watch-lens.spec.ts.
import { expect, test } from '@playwright/test';
import { openWatch, playing, replay, setUp, startRun } from './watch-page';
import { lensMap, recordMapWorker, zoomSteps } from './watch-map';

test("the wheel over the watch page's map zooms it, Ctrl+wheel too; the page stays put", async ({ page }) => {
  test.setTimeout(60_000);
  await recordMapWorker(page);
  await setUp(page);
  await openWatch(page);
  await playing(page);
  await startRun(page);
  const canvas = await lensMap(page);
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  const scrollY = await page.evaluate(() => window.scrollY);
  const lines = await replay(page).locator('.wc-player').evaluate((el) => el.textContent?.length ?? 0);
  await page.mouse.wheel(0, -200);
  await expect.poll(() => zoomSteps(page)).toBeGreaterThan(1.5);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => zoomSteps(page)).toBeLessThan(-1.5);
  // Ctrl+wheel (a trackpad pinch): zooms as well.
  const before = await zoomSteps(page);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -30);
  await page.keyboard.up('Control');
  await expect.poll(() => zoomSteps(page)).toBeGreaterThan(before);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  expect(await replay(page).locator('.wc-player').evaluate((el) => el.textContent?.length ?? 0)).toBeGreaterThanOrEqual(lines);
});
