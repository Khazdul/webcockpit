// Stage 71 (ADR 0160): a shared run on a computer plays with the desktop
// lens. The map is a round lens at the top right, always on; its keys:
// Group top left, fullscreen top right, Timers bottom right, the move
// handle bottom left. Group and Timers float at the bottom right, off at
// the start. A drag in the glass pans and lets go of the player (the follow
// key shows); the follow key or a double click follows again. The rim
// resizes. The control box has no Panes.
//
// Desktop projects (Chromium and Firefox), the watch page's frame.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { openWatch, playing, replay, setUp } from './watch-page';
import { lensMap, mapSent, recordMapWorker } from './watch-map';

const box = async (l: Locator): Promise<{ x: number; y: number; width: number; height: number }> => (await l.boundingBox())!;

async function follows(page: Page): Promise<boolean[]> {
  return (await mapSent(page)).filter((m) => m.t === 'follow').map((m) => m.on!);
}

test('the desktop lens: always on, its keys, Group and Timers at the bottom right, pan and follow, move, resize', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 860 });
  await recordMapWorker(page);
  await setUp(page);
  await openWatch(page);
  await playing(page);
  const r = replay(page);
  const lens = r.locator('.wc-dl');
  await expect(lens).toBeVisible();
  await lensMap(page);
  const frame = await box(page.locator('.wc-watch-slot iframe'));

  // At the top right of the player, its four keys; no follow key yet.
  const l0 = await box(lens);
  expect(l0.x + l0.width).toBeGreaterThan(frame.x + frame.width - 120);
  expect(l0.y).toBeLessThan(frame.y + 80);
  expect(l0.width).toBeGreaterThanOrEqual(200);
  expect(await r.locator('.wc-dl-key').evaluateAll((ks) => ks.map((k) => (k as HTMLElement).dataset.key))).toEqual(['group', 'fullscreen', 'timers', 'move']);
  await expect(r.locator('.wc-dl-follow')).toBeHidden();
  await expect(r.locator('.wc-dl-move')).toHaveAttribute('title', 'Drag to move the map');

  // The box: Fullscreen, no Panes.
  await r.locator('.wc-player').hover();
  await expect(r.locator('.wc-player-box [data-act="panes"]')).toHaveCount(0);
  await expect(r.locator('.wc-player-box [data-act="extra"]')).toHaveCount(1);

  // Group and Timers: off at the start, floating at the bottom right, Timers above Group.
  await expect(r.locator('.wc-pane[data-pane="group"]')).toBeHidden();
  await expect(r.locator('.wc-pane[data-pane="timers"]')).toBeHidden();
  await r.locator('.wc-dl-key[data-key="group"]').click();
  const group = r.locator('.wc-pane[data-pane="group"]');
  await expect(group).toBeVisible();
  await expect(group).toHaveAttribute('data-floating', '');
  await expect(r.locator('.wc-dl-key[data-key="group"]')).toHaveAttribute('aria-pressed', 'true');
  await r.locator('.wc-dl-key[data-key="timers"]').click();
  const timers = r.locator('.wc-pane[data-pane="timers"]');
  await expect(timers).toBeVisible();
  await expect
    .poll(async () => {
      const g = await box(group);
      const t = await box(timers);
      return t.y + t.height <= g.y + 1 && Math.abs(t.x - g.x) < 1;
    })
    .toBe(true);
  // The same height, and a row's air between them (stage 71, owner's feedback 1).
  const g = await box(group);
  const t0 = await box(timers);
  expect(Math.abs(t0.height - g.height)).toBeLessThan(2);
  expect(g.y - (t0.y + t0.height)).toBeGreaterThan(8);
  expect(g.x + g.width).toBeGreaterThan(frame.x + frame.width - 80);
  expect(g.y + g.height).toBeGreaterThan(frame.y + frame.height - 120);
  // Under the lens, not under it on screen.
  expect((await box(timers)).y).toBeGreaterThanOrEqual(l0.y + l0.height);
  await r.locator('.wc-dl-key[data-key="group"]').click();
  await expect(group).toBeHidden();
  await r.locator('.wc-dl-key[data-key="timers"]').click();
  await expect(timers).toBeHidden();

  // A drag in the glass pans and lets go of the player: the follow key shows.
  const cx = l0.x + l0.width / 2;
  const cy = l0.y + l0.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy + 10, { steps: 4 });
  await page.mouse.move(cx + 60, cy + 20, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await mapSent(page)).filter((m) => m.t === 'pan').length).toBeGreaterThan(0);
  await expect.poll(() => follows(page)).toEqual([false]);
  await expect(r.locator('.wc-dl-follow')).toBeVisible();
  // Its key follows again.
  await r.locator('.wc-dl-follow').click();
  await expect.poll(() => follows(page)).toEqual([false, true]);
  await expect(r.locator('.wc-dl-follow')).toBeHidden();
  // Again, and a double click on the map follows.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 40, cy - 30, { steps: 5 });
  await page.mouse.up();
  await expect(r.locator('.wc-dl-follow')).toBeVisible();
  await page.mouse.dblclick(cx - 20, cy + 30);
  await expect(r.locator('.wc-dl-follow')).toBeHidden();
  expect((await follows(page)).at(-1)).toBe(true);

  // The move handle moves the lens.
  const mv = await box(r.locator('.wc-dl-move'));
  await page.mouse.move(mv.x + mv.width / 2, mv.y + mv.height / 2);
  await page.mouse.down();
  await page.mouse.move(mv.x + mv.width / 2 - 100, mv.y + mv.height / 2 + 50, { steps: 5 });
  await page.mouse.move(mv.x + mv.width / 2 - 200, mv.y + mv.height / 2 + 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await box(lens)).x - l0.x)).toBe(-200);
  const l1 = await box(lens);
  expect(Math.round(l1.y - l0.y)).toBe(100);
  // The map pane went with it (its canvas's centre is the lens's, within a cell).
  const c1 = await box(r.locator('.wc-pane[data-pane="map"]'));
  expect(Math.abs(c1.x + c1.width / 2 - (l1.x + l1.width / 2))).toBeLessThan(2);

  // The rim: a resize cursor along the radius, and a drag outward makes the lens larger round its centre.
  const rx = l1.x + l1.width + 4;
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
  expect(errors).toEqual([]);
});
