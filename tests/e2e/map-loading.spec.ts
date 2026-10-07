// Stage 24 (ADR 0083 "Map pane"): the Map pane's loading overlay. With
// arda.mm2 and the tiles held back by the test, the overlay shows a small
// modern bar (round 1) and what is being waited for, the bar advances, and the
// overlay leaves once the first complete frame is drawn. A tileset change
// whose tiles are slow shows it too.
//
// WC_MAP_SHOT_DIR=<dir> saves screenshots of the overlay (a wide pane, a
// narrow pane and a phone viewport).
import { expect, type Page, type Route, test } from '@playwright/test';

const SHOT_DIR = process.env.WC_MAP_SHOT_DIR;

/** Holds matching requests until `release()`; counts them. */
async function hold(page: Page, glob: string) {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  let seen = 0;
  await page.context().route(glob, async (route: Route) => {
    seen++;
    await gate;
    await route.fallback();
  });
  return { release: () => open(), seen: () => seen };
}

test('map overlay: progress while arda.mm2 and the tiles load, gone after the first frame', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const map = await hold(page, '**/map/arda.mm2');
  const tiles = await hold(page, '**/map/pixmaps/**');
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  const content = page.locator('.wc-app .wc-pane-map .wc-pane-content');
  const overlay = content.locator('.wc-map-loading');
  const label = overlay.locator('.wc-map-loading-label');

  // The download is held: the bar is empty and says so.
  await expect(overlay).toBeVisible({ timeout: 20_000 });
  await expect(label).toHaveText('Loading map…');
  await expect.poll(() => map.seen()).toBeGreaterThan(0);
  // The fill's visible width: it slides in from the left inside the track.
  const fillWidth = () =>
    overlay.locator('.wc-map-loading-fill').evaluate((el) => Math.max(0, el.getBoundingClientRect().right - el.parentElement!.getBoundingClientRect().left));
  expect(await fillWidth()).toBeLessThan(1);
  await expect(overlay).toHaveAttribute('data-pct', '0');
  // Small system UI text over a thin bar, at most 200 px and 60% of the pane; no glyphs.
  const look = await overlay.evaluate((el) => {
    const box = el.querySelector<HTMLElement>('.wc-map-loading-box')!;
    const bar = el.querySelector<HTMLElement>('.wc-map-loading-bar')!;
    const cs = getComputedStyle(box);
    const r = bar.getBoundingClientRect();
    return { font: cs.fontFamily, size: parseFloat(cs.fontSize), w: r.width, h: r.height, pane: el.getBoundingClientRect().width, text: el.textContent ?? '' };
  });
  expect(look.font).toMatch(/system-ui|sans-serif/);
  expect(look.size).toBeLessThanOrEqual(12);
  expect(look.h).toBeGreaterThanOrEqual(2);
  expect(look.h).toBeLessThanOrEqual(4);
  expect(look.w).toBeGreaterThan(100);
  expect(look.w).toBeLessThanOrEqual(Math.min(200, look.pane * 0.6) + 0.5);
  expect(look.text).not.toMatch(/[█░]/);

  // The map arrives; the tiles are still held: tile counts, the bar past the map's share.
  map.release();
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await expect(label).toHaveText(/^Loading tiles {2}\d+ \/ \d+$/, { timeout: 10_000 });
  const pct = Number(await overlay.getAttribute('data-pct'));
  expect(pct).toBeGreaterThan(50);
  expect(pct).toBeLessThan(100);
  // The fill eases to its share of the bar.
  await expect.poll(async () => Math.round((100 * (await fillWidth())) / look.w), { timeout: 2000 }).toBe(pct);
  if (SHOT_DIR) {
    await content.screenshot({ path: `${SHOT_DIR}/map-loading-${info.project.name}.png` });
    await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#fafafa', fg: '#222222' } }));
    await content.screenshot({ path: `${SHOT_DIR}/map-loading-light-${info.project.name}.png` });
  }
  // The overlay sits in the middle of the pane.
  const box = (await overlay.locator('.wc-map-loading-box').boundingBox())!;
  const pane = (await content.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - (pane.x + pane.width / 2))).toBeLessThan(4);
  expect(Math.abs(box.y + box.height / 2 - (pane.y + pane.height / 2))).toBeLessThan(4);

  // Tiles in: the first complete frame, and the overlay leaves.
  tiles.release();
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d+/, { timeout: 20_000 });
  await expect(overlay).toBeHidden({ timeout: 5000 });
  expect(errors).toEqual([]);
});

test('map overlay: hidden once drawn, shown while a slow tileset change loads', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  const content = page.locator('.wc-app .wc-pane-map .wc-pane-content');
  const overlay = content.locator('.wc-map-loading');
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d+/, { timeout: 30_000 });
  await expect(overlay).toBeHidden({ timeout: 5000 });

  const set = await hold(page, '**/map/tilesets/desert/**');
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { tileset: 'desert' } }));
  await expect(content).toHaveAttribute('data-map-tileset', 'desert');
  await expect(overlay).toBeVisible({ timeout: 5000 });
  await expect(overlay.locator('.wc-map-loading-label')).toHaveText(/^Loading tiles {2}\d+ \/ \d+$/);
  await expect.poll(() => set.seen()).toBeGreaterThan(10);
  set.release();
  await expect(overlay).toBeHidden({ timeout: 20_000 });
});
