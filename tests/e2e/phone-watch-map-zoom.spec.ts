// Stage 65 feedback round 3 (ADR 0156): the owner could not pinch-zoom the
// map of a shared run on the watch page on his phone. The replay's frame
// decides no device flags, so its map pane took a finger for a mouse: one
// finger panned, a second was dropped and a pinch only panned. Now a
// finger's pointer takes the touch path wherever it lands: two fingers
// zoom around their midpoint, one pans, and the page itself never zooms.
//
// Since stage 71 (ADR 0160) a shared run on a phone or tablet plays in the
// phone layout and the map is the phone's lens: a pinch on its glass steps
// the lens's zoom levels (ADR 0156, `zoomTo`) and the page never zooms.
//
// `phone` project (Pixel 7), CDP touches on the lens in the frame, at a
// phone's and a tablet's size.
import { type Page, expect, test } from '@playwright/test';
import { openWatch, playing, replay, setUp } from './watch-page';
import { mapSent, recordMapWorker } from './watch-map';

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
    const glass = replay(page).locator('.wc-ph-lens-glass');
    await expect(glass).toBeVisible();
    await expect(replay(page).locator('.wc-pane[data-pane="map"] .wc-pane-content')).toHaveAttribute('data-map-state', /ready|loaded/);
    const b = (await glass.boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const span = b.width - 30;
    const zooms = async (): Promise<number[]> => (await mapSent(page)).filter((m) => m.t === 'zoomTo').map((m) => m.zoom!);
    const level = (): Promise<string | null> => replay(page).locator('.wc-ph-lens').getAttribute('data-level');
    await expect.poll(level).toBe('z1');
    // Together: one level or more further out (a smaller zoom).
    await pinchOn(page, cx, cy, span, span / 3);
    await expect.poll(level).not.toBe('z1');
    const out = (await zooms()).at(-1)!;
    // Apart: back to the nearest.
    await pinchOn(page, cx, cy, span / 3, span);
    await expect.poll(level).toBe('z1');
    expect((await zooms()).at(-1)!).toBeGreaterThan(out);
    // The page never zoomed.
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  });
}
