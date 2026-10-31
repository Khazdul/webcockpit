// A new install (ADR 0078, ADR 0092): an empty browser starts with Hack 17
// and bright bold, the right dock with the map (Character above it, off)
// over Group | Timers, then Comm and a frameless UI pane (off); the
// weather on, Shimrod on a transparent map. The Map search script runs
// (the only bundled script on; the pane bar is gone, ADR 0111), the Map
// search pane is off and opens at the game pane's top-right corner. A
// reload does not enable the script again once turned off. The rest of the suite starts as an existing
// install (legacy-state.ts).
import { type Page, expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1990, height: 1125 } });

const FIND = 'mapsearch/main';
const pane = (page: Page, id: string) => page.locator(`.wc-pane[data-pane="${id}"]`);
const box = async (page: Page, id: string) => (await pane(page, id).boundingBox())!;

async function enabled(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__wc!.shell.scripts.enabledNames());
}

test('new install: Hack 17, the docked map over two lanes, the weather on, Map search off until opened at the corner', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();

  const s = await page.evaluate(() => window.__wc!.settings.get());
  expect(s.appearance).toMatchObject({ font: 'hack', size: 17, boldBright: true });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-mono'))).toContain('Hack');
  // ADR 0092: the weather on, Shimrod on a transparent map; Character and UI off.
  expect(s.weather.enabled).toBe(true);
  expect(s.mapper).toMatchObject({ tileset: 'shimrod', background: 'transparent' });
  expect(s.panes.character.on).toBe(false);
  expect(s.panes.ui.on).toBe(false);
  expect(s.layout.floating.map((f) => f.id)).toEqual([FIND, 'statistics']);
  expect(s.panes.statistics.on).toBe(false);
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);

  // Map search runs, the only bundled script on; no pane bar (ADR 0111).
  await expect.poll(() => enabled(page)).toEqual(['mapsearch']);
  expect(await page.evaluate(() => window.__wc!.shell.scripts.get('panebar'))).toBeNull();
  expect('panebar/bar' in s.panes).toBe(false);
  await expect(pane(page, FIND)).toBeHidden();
  await expect(pane(page, 'character')).toBeHidden();
  await expect(pane(page, 'ui')).toBeHidden();
  const map = await box(page, 'map');
  const group = await box(page, 'group');
  const timers = await box(page, 'timers');
  const comm = await box(page, 'comm');
  // The map docked across the dock at the top; Group at the screen edge, Timers beside it, both under the map.
  expect(map.y).toBeLessThan(1);
  expect(map.x).toBeCloseTo(timers.x, 0);
  expect(map.width).toBeCloseTo(timers.width + group.width, 0);
  expect(group.x).toBeGreaterThan(timers.x);
  expect(group.y).toBeCloseTo(timers.y, 0);
  expect(group.y).toBeGreaterThanOrEqual(map.y + map.height - 1);
  expect(comm.y).toBeGreaterThanOrEqual(group.y + group.height - 1);
  expect(map.height).toBeGreaterThan(group.height);
  // The owner's window is wide (ADR 0102): Comm is the dock's last pane and runs down
  // beside the input row, which ends at the game pane's right edge with the menu bar
  // at its end, left of the dock.
  expect(await page.evaluate(() => window.__wc!.app.cockpit.layout?.inputSpan)).toBe('game');
  const input = (await page.locator('.wc-input-slot').boundingBox())!;
  const gamePane = (await page.locator('.wc-game').boundingBox())!;
  expect(comm.y + comm.height).toBeCloseTo(input.y + input.height, 0);
  expect(input.x + input.width).toBeCloseTo(gamePane.x + gamePane.width, 0);
  const menubar = (await page.locator('.wc-menubar').boundingBox())!;
  expect(menubar.x + menubar.width).toBeCloseTo(input.x + input.width, 0);
  expect(menubar.x + menubar.width).toBeLessThan(comm.x);
  await expect(pane(page, 'comm')).toHaveAttribute('data-framed', '');

  // The Map search pane is off.
  expect(await page.evaluate((id) => window.__wc!.settings.get().panes[id as 'map']?.on, FIND)).toBe(false);

  // Opened, it floats at the game pane's top-right corner (no map float to sit under).
  await page.evaluate(() => window.__wc!.app.onCommand('mapsearch'));
  await expect(pane(page, FIND)).toBeVisible();
  const game = (await page.locator('.wc-game').boundingBox())!;
  const find = await box(page, FIND);
  expect(find.y).toBeCloseTo(game.y, 0);
  expect(find.x + find.width).toBeCloseTo(game.x + game.width, 0);
  expect(find.x + find.width).toBeLessThanOrEqual(map.x);

  // Turned off, Map search stays off after a reload.
  await page.evaluate(() => window.__wc!.shell.scripts.setEnabled('mapsearch', false));
  await page.reload();
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await expect.poll(() => enabled(page)).toEqual([]);
  await expect(pane(page, FIND)).toBeHidden();
  expect(errors).toEqual([]);
});
