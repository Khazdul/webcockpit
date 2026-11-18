// Stage 71 (ADR 0160), reworked in stage 73: a shared run on a computer
// plays with the desktop lens. The map is a round lens at the top right,
// with no keys: a drag anywhere on it moves it, four dots at the bottom
// pick the zoom level, the wheel steps the levels, the rim resizes. Map
// (the lens), Group and Timers are the control box's Panes popup's, the map
// on and the two off at the start; Group and Timers float at the bottom
// right. The map is always inside the circle (stage 73's bug).
//
// Desktop projects (Chromium and Firefox), the watch page's frame.
import { type FrameLocator, type Locator, type Page, expect, test } from '@playwright/test';
import { openWatch, playing, replay, setUp, startRun } from './watch-page';
import { lensMap, mapSent, recordMapWorker } from './watch-map';

const box = async (l: Locator): Promise<{ x: number; y: number; width: number; height: number }> => (await l.boundingBox())!;

/** The zooms sent to the map worker (`zoomTo`), in order. */
async function zooms(page: Page): Promise<number[]> {
  return (await mapSent(page)).filter((m) => m.t === 'zoomTo').map((m) => m.zoom!);
}

/** The zoom of `rooms` across a lens `size` px wide (desk-lens.ts `deskLensZoom`). */
const zoomOf = (rooms: number, size: number): number => size / (rooms * 44);

/** The Panes popup's rows as `id:checked`, the popup left open. */
async function panesRows(r: FrameLocator): Promise<string[]> {
  const pop = r.locator('.wc-player-box .wc-pc-pop[data-pop="panes"]');
  if (!(await pop.isVisible())) await r.locator('.wc-player-box [data-act="panes"]').click();
  await expect(pop).toBeVisible();
  return pop.locator('[data-pane]').evaluateAll((bs) => bs.map((b) => `${(b as HTMLElement).dataset.pane}:${b.getAttribute('aria-checked')}`));
}

/**
 * Red pixels of a fill laid over the map pane's content that show outside
 * the lens's circle (more than 1.5 px out), and inside it. The map must
 * show only in the circle (stage 73's bug: it showed in the whole cells).
 */
async function redOutside(page: Page): Promise<{ out: number; inside: number }> {
  const r = replay(page);
  await r.locator('.wc-pane[data-pane="map"] .wc-pane-content').evaluate((c) => {
    if (c.querySelector('.zz-red')) return;
    const d = document.createElement('div');
    d.className = 'zz-red';
    d.style.cssText = 'position:absolute;inset:0;background:#f00;z-index:99;pointer-events:none';
    c.append(d);
  });
  await page.waitForTimeout(200);
  const lens = await box(r.locator('.wc-dl'));
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ shot, cx, cy, R }) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${shot}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let out = 0;
      let inside = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          if (!(d[i]! > 200 && d[i + 1]! < 60 && d[i + 2]! < 60)) continue;
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > R + 1.5) out++;
          else inside++;
        }
      }
      return { out, inside };
    },
    { shot, cx: lens.x + lens.width / 2, cy: lens.y + lens.height / 2, R: lens.width / 2 },
  );
}

/** The fill of `redOutside` taken away again. */
async function noRed(page: Page): Promise<void> {
  await replay(page).locator('.zz-red').evaluate((d) => d.remove());
}

test('the desktop lens: no keys, the Panes popup has Map, Group and Timers; drag moves; dots and wheel zoom; rim resizes', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 860 });
  await recordMapWorker(page);
  await setUp(page);
  await openWatch(page);
  await playing(page);
  await startRun(page);
  const r = replay(page);
  const lens = r.locator('.wc-dl');
  await expect(lens).toBeVisible();
  await lensMap(page);
  const frame = await box(page.locator('.wc-watch-slot iframe'));

  // At the top right of the player, two rows down; no keys; four dots, the nearest lit.
  const l0 = await box(lens);
  expect(l0.x + l0.width).toBeGreaterThan(frame.x + frame.width - 120);
  expect(l0.y).toBeGreaterThan(frame.y + 30);
  expect(l0.y).toBeLessThan(frame.y + 100);
  expect(l0.width).toBeGreaterThanOrEqual(200);
  await expect(r.locator('.wc-dl-key, .wc-dl-follow, .wc-dl-move')).toHaveCount(0);
  const dots = r.locator('.wc-dl-dot');
  await expect(dots).toHaveCount(4);
  expect(await dots.evaluateAll((ds) => ds.map((d) => d.getAttribute('aria-pressed')))).toEqual(['true', 'false', 'false', 'false']);
  // The dots at the bottom centre of the glass.
  const d0 = await box(dots.first());
  const d3 = await box(dots.last());
  expect(Math.abs((d0.x + d3.x + d3.width) / 2 - (l0.x + l0.width / 2))).toBeLessThan(2);
  expect(d0.y).toBeGreaterThan(l0.y + l0.height - 40);
  // The nearest level's zoom: eight rooms across.
  await expect.poll(async () => (await zooms(page)).at(-1)).toBeCloseTo(zoomOf(8, l0.width), 4);

  // The Panes popup: Map (on), Group and Timers (off), with Fullscreen beside it.
  await r.locator('.wc-player').hover();
  await expect(r.locator('.wc-player-box [data-act="extra"]')).toHaveCount(1);
  expect(await panesRows(r)).toEqual(['timers:false', 'group:false', 'map:true']);
  const pop = r.locator('.wc-player-box .wc-pc-pop[data-pop="panes"]');
  const group = r.locator('.wc-pane[data-pane="group"]');
  const timers = r.locator('.wc-pane[data-pane="timers"]');
  await expect(group).toBeHidden();
  await expect(timers).toBeHidden();
  await pop.locator('[data-pane="group"]').click();
  await pop.locator('[data-pane="timers"]').click();
  await expect(group).toBeVisible();
  await expect(timers).toBeVisible();
  await expect(group).toHaveAttribute('data-floating', '');
  // Floating at the bottom right, Timers above Group, the same height, a row's air between, under the lens.
  await expect
    .poll(async () => {
      const g = await box(group);
      const t = await box(timers);
      return t.y + t.height <= g.y + 1 && Math.abs(t.x - g.x) < 1;
    })
    .toBe(true);
  const g = await box(group);
  const t0 = await box(timers);
  expect(Math.abs(t0.height - g.height)).toBeLessThan(2);
  expect(g.y - (t0.y + t0.height)).toBeGreaterThan(8);
  expect(g.x + g.width).toBeGreaterThan(frame.x + frame.width - 80);
  expect(t0.y).toBeGreaterThanOrEqual(l0.y + l0.height);
  // Map off: the lens and the map go; on again: back where it was.
  await pop.locator('[data-pane="map"]').click();
  await expect(lens).toBeHidden();
  await expect(r.locator('.wc-pane[data-pane="map"]')).toBeHidden();
  await pop.locator('[data-pane="map"]').click();
  await expect(lens).toBeVisible();
  await expect(r.locator('.wc-pane[data-pane="map"][data-desk-lens]')).toBeVisible();
  expect(await box(lens)).toEqual(l0);
  await pop.locator('[data-pane="group"]').click();
  await pop.locator('[data-pane="timers"]').click();
  await expect(group).toBeHidden();
  await expect(timers).toBeHidden();
  await r.locator('.wc-player-box [data-act="panes"]').click();
  await expect(pop).toBeHidden();

  // A drag anywhere on the glass moves the lens (no pan); the map pane goes with it.
  const cx = l0.x + l0.width / 2;
  const cy = l0.y + l0.height / 2;
  await page.mouse.move(cx + 30, cy - 40);
  await page.mouse.down();
  await page.mouse.move(cx + 30 - 100, cy - 40 + 50, { steps: 5 });
  await page.mouse.move(cx + 30 - 200, cy - 40 + 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await box(lens)).x - l0.x)).toBe(-200);
  const l1 = await box(lens);
  expect(Math.round(l1.y - l0.y)).toBe(100);
  expect((await mapSent(page)).filter((m) => m.t === 'pan' || m.t === 'zoom')).toEqual([]);
  const c1 = await box(r.locator('.wc-pane[data-pane="map"]'));
  expect(Math.abs(c1.x + c1.width / 2 - (l1.x + l1.width / 2))).toBeLessThan(2);
  expect(Math.abs(c1.y + c1.height / 2 - (l1.y + l1.height / 2))).toBeLessThan(2);

  // A dot picks its level; the wheel steps one level a notch, clamped.
  await dots.nth(2).click();
  await expect(dots.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await zooms(page)).at(-1)).toBeCloseTo(zoomOf(24, l1.width), 4);
  await expect(lens).toBeVisible();
  expect(await box(lens)).toEqual(l1);
  await page.mouse.move(cx - 200, cy + 100);
  await page.mouse.wheel(0, -100);
  await expect(dots.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 100);
  await expect(dots.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 100);
  await expect(dots.nth(3)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(400);
  await expect(dots.nth(3)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await zooms(page)).at(-1)).toBeCloseTo(zoomOf(44, l1.width), 4);

  // The rim: a resize cursor along the radius, and a drag outward makes the lens larger round
  // its centre; the rim wins over the glass's drag in its band, and the zoom follows the size.
  const rx = l1.x + l1.width - 2;
  const ry = l1.y + l1.height / 2;
  await page.mouse.move(rx, ry);
  await expect(r.locator('.wc-dl-rim')).toHaveCSS('cursor', 'ew-resize');
  await page.mouse.down();
  await page.mouse.move(rx + 20, ry, { steps: 4 });
  await page.mouse.move(rx + 40, ry, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await box(lens)).width - l1.width)).toBe(80);
  const l2 = await box(lens);
  expect(Math.abs(l2.x + l2.width / 2 - (l1.x + l1.width / 2))).toBeLessThan(1.5);
  await expect.poll(async () => (await zooms(page)).at(-1)).toBeCloseTo(zoomOf(44, l2.width), 4);

  // The map's canvas is masked to the circle, and nothing of the pane shows outside it.
  expect(await r.locator('.wc-pane[data-pane="map"] canvas').evaluate((c) => getComputedStyle(c).maskImage)).toContain('radial-gradient');
  const red = await redOutside(page);
  expect(red.inside).toBeGreaterThan(1000);
  expect(red.out).toBe(0);
  await noRed(page);
  expect(errors).toEqual([]);
});

// Stage 73's bug: the map showed outside the lens. The map pane's shift, its circle and the
// dressing come from the box the pane's cells were laid out for, through resizes, a seek that
// rebuilds the App, and a lens moved and resized; and the canvas is masked to the circle.
test('the map stays inside the lens through window resizes, a backward seek, a move and a resize', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1400, height: 860 });
  await recordMapWorker(page);
  await setUp(page);
  await openWatch(page);
  await playing(page);
  await startRun(page);
  const r = replay(page);
  const lens = r.locator('.wc-dl');
  await expect(lens).toBeVisible();
  await lensMap(page);
  const check = async (what: string): Promise<void> => {
    await expect(lens).toBeVisible();
    // The map pane's centre is the lens's (the shift is the laid out box's).
    await expect
      .poll(async () => {
        const l = await box(lens);
        const m = await box(r.locator('.wc-pane[data-pane="map"]'));
        return Math.max(Math.abs(m.x + m.width / 2 - (l.x + l.width / 2)), Math.abs(m.y + m.height / 2 - (l.y + l.height / 2))) < 2;
      }, { message: what })
      .toBe(true);
    const red = await redOutside(page);
    expect(red.out, what).toBe(0);
    expect(red.inside, what).toBeGreaterThan(1000);
    await noRed(page);
  };
  await check('at the start');
  for (const [w, h] of [
    [1100, 700],
    [1600, 980],
    [1400, 860],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    await check(`resized to ${w}×${h}`);
  }
  // Play a little, then seek back (a new App and map worker): the lens keeps its place and level.
  await r.locator('.wc-dl-dot').nth(1).click();
  const before = await box(lens);
  await r.locator('.wc-player').click({ position: { x: 100, y: 300 } });
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  await check('after a backward seek');
  expect(await box(lens)).toEqual(before);
  await expect(r.locator('.wc-dl-dot').nth(1)).toHaveAttribute('aria-pressed', 'true');
  // Moved and resized in quick steps.
  const l = await box(lens);
  await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(l.x + l.width / 2 - 40 * i, l.y + l.height / 2 + 25 * i);
  await page.mouse.up();
  await check('after a move');
  const m = await box(lens);
  await page.mouse.move(m.x + m.width - 2, m.y + m.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(m.x + m.width - 2 + 15 * i, m.y + m.height / 2);
  await page.mouse.up();
  await check('after a resize');
});
