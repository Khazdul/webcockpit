// Stage 65 feedback round 3 (ADR 0156): the owner could not pinch-zoom the
// map of a shared run on the watch page on his phone. The replay's frame
// decides no device flags, so its map pane took a finger for a mouse: one
// finger panned, a second was dropped and a pinch only panned. Now a
// finger's pointer takes the touch path wherever it lands: two fingers
// zoom around their midpoint, one pans, and the page itself never zooms.
//
// `phone` project (Pixel 7), CDP touches on the map's canvas in the frame,
// at a phone's and a tablet's size.
import { type Page, expect, test } from '@playwright/test';
import { openWatch, playing, setUp } from './watch-page';
import { mapSent, recordMapWorker, showMap, zoomSteps } from './watch-map';

async function pinchOn(page: Page, cx: number, cy: number, from: number, to: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  await touch('touchStart', [{ x: cx - from / 2, y: cy }, { x: cx + from / 2, y: cy }]);
  for (let i = 1; i <= 8; i++) {
    const d = from + ((to - from) * i) / 8;
    await touch('touchMove', [{ x: cx - d / 2, y: cy }, { x: cx + d / 2, y: cy }]);
  }
  await touch('touchEnd', []);
  await cdp.detach();
}

for (const [name, size] of [
  ['phone', { width: 412, height: 839 }],
  ['tablet', { width: 820, height: 1180 }],
] as const) {
  test(`${name}: a pinch on the watch page's map zooms the map in and out, not the page`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(size);
    await recordMapWorker(page);
    await setUp(page);
    await openWatch(page);
    await playing(page);
    const canvas = await showMap(page, true);
    const b = (await canvas.boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const span = Math.min(b.width, 200) - 20;

    // Apart: zoom in, around the fingers' midpoint.
    await pinchOn(page, cx, cy, span / 3, span);
    await expect.poll(() => zoomSteps(page)).toBeGreaterThan(1);
    const zin = await zoomSteps(page);
    const last = (await mapSent(page)).filter((m) => m.t === 'zoom').at(-1)!;
    expect(last.x!).toBeCloseTo(cx - b.x, 0);
    expect(last.y!).toBeCloseTo(cy - b.y, 0);
    // Together: zoom out by about as much.
    await pinchOn(page, cx, cy, span, span / 3);
    await expect.poll(() => zoomSteps(page)).toBeLessThan(zin - 1);
    expect(Math.abs(await zoomSteps(page))).toBeLessThan(0.5);
    // The page never zoomed.
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);

    // One finger still pans.
    const pans = (await mapSent(page)).filter((m) => m.t === 'pan').length;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 0 }] });
    for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 10, y: cy, id: 0 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await mapSent(page)).filter((m) => m.t === 'pan').length).toBeGreaterThan(pans);
  });
}
