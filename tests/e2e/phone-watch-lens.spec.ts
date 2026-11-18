// Stage 71 (ADR 0160): a shared run on a phone or tablet plays in the
// game's phone layout with the lens at the top right, always on. The lens
// has the panes key (top left) and the fullscreen key (top right), no Comm
// key. The control box has neither Fullscreen nor Panes (since stage 73 it
// floats as on a computer: phone-watch-box.spec.ts).
// The panes area is off at the start; the panes key opens it (at the top in
// portrait, at the left in landscape), and a swipe goes between Group and
// Timers.
//
// `phone` project (Pixel 7), the watch page's frame, in portrait and in
// landscape.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { openWatch, playing, replay, setUp } from './watch-page';

const box = async (l: Locator): Promise<{ x: number; y: number; width: number; height: number }> => (await l.boundingBox())!;

/** A sideways swipe on `l` with one finger (CDP touches), `dx` px. */
async function swipe(page: Page, l: Locator, dx: number): Promise<void> {
  const b = await box(l);
  const y = b.y + b.height / 2;
  const x0 = b.x + b.width / 2 - dx / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y, id: 0 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 8, y, id: 0 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

for (const [name, size] of [
  ['portrait', { width: 412, height: 839 }],
  ['landscape', { width: 839, height: 412 }],
] as const) {
  test(`phone ${name}: the shared run plays in the phone layout with the lens, its two keys, the panes off at the start`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(size);
    await setUp(page);
    await openWatch(page);
    await playing(page);
    const r = replay(page);
    // The phone layout, with the phone layer over it.
    await expect(r.locator('.wc-cockpit[data-phone-game]')).toBeVisible();
    const lens = r.locator('.wc-ph-lens');
    await expect(lens).toBeVisible();
    const frame = await box(page.locator('.wc-watch-slot iframe'));
    const l = await box(lens);
    // At the top right.
    expect(l.x + l.width).toBeGreaterThan(frame.x + frame.width * 0.75);
    expect(l.y).toBeLessThan(frame.y + frame.height / 3);
    // Its keys: panes and fullscreen, no Comm.
    expect(await lens.locator('.wc-ph-sat').evaluateAll((ks) => ks.map((k) => (k as HTMLElement).dataset.sat))).toEqual(['panes', 'fullscreen']);
    // The control box: neither Fullscreen nor Panes.
    const bar = r.locator('.wc-player-box');
    await expect(bar.locator('.wc-pc-play')).toBeVisible();
    await expect(bar.locator('[data-act="extra"]')).toHaveCount(0);
    await expect(bar.locator('[data-act="panes"]')).toHaveCount(0);
    await page.screenshot({ path: `docs/stages/img/71-phone-${name}.png` });

    // The panes area is off at the start; the panes key opens it on Group.
    await expect(r.locator('.wc-pane[data-phone-strip]')).toHaveCount(0);
    const panes = lens.locator('.wc-ph-sat[data-sat="panes"]');
    await expect(panes).toHaveAttribute('aria-pressed', 'false');
    await panes.tap();
    await expect(panes).toHaveAttribute('aria-pressed', 'true');
    const strip = r.locator('.wc-pane[data-phone-strip]');
    await expect(strip).toHaveAttribute('data-pane', 'group');
    const s = await box(strip);
    if (name === 'portrait') {
      // At the top, the whole width.
      expect(s.y).toBeLessThan(frame.y + 40);
      expect(s.width).toBeGreaterThan(frame.width * 0.8);
    } else {
      // At the left.
      expect(s.x).toBeLessThan(frame.x + 10);
      expect(s.width).toBeLessThan(frame.width * 0.6);
    }
    await page.screenshot({ path: `docs/stages/img/71-phone-${name}-panes.png` });
    // A swipe goes to Timers, and back.
    await swipe(page, strip, -160);
    await expect(strip).toHaveAttribute('data-pane', 'timers');
    await swipe(page, strip, 160);
    await expect(strip).toHaveAttribute('data-pane', 'group');
    // The key closes it again.
    await panes.tap();
    await expect(r.locator('.wc-pane[data-phone-strip]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('phone: the lens\'s fullscreen key puts the frame in fullscreen and back', async ({ page }) => {
  await setUp(page);
  await openWatch(page);
  await playing(page);
  const key = replay(page).locator('.wc-ph-lens .wc-ph-sat[data-sat="fullscreen"]');
  await key.tap();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement !== null && document.fullscreenElement === document.querySelector('.wc-watch-slot iframe')))
    .toBe(true);
  await key.tap();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
});
