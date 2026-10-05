// A new install (ADR 0078): an empty browser starts with Hack 17 and bright
// bold, the right dock with Character over Group | Timers, then Comm, a
// frameless UI pane and the pane bar; the pane bar and Map search scripts
// run, the Map search pane is off (FIND dim) and opens under the map. A
// reload does not enable the scripts again once turned off. The rest of
// the suite starts as an existing install (legacy-state.ts).
import { type Page, expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1990, height: 1125 } });

const BAR = 'panebar/bar';
const FIND = 'mapsearch/main';
const pane = (page: Page, id: string) => page.locator(`.wc-pane[data-pane="${id}"]`);
const box = async (page: Page, id: string) => (await pane(page, id).boundingBox())!;

async function enabled(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__wc!.shell.scripts.enabledNames());
}

test('new install: Hack 17, the two-lane right dock, the pane bar on, Map search off until opened under the map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();

  const a = await page.evaluate(() => window.__wc!.settings.get().appearance);
  expect(a).toMatchObject({ font: 'hack', size: 17, boldBright: true });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-mono'))).toContain('Hack');

  // Both scripts run; the bar is the last row of the right dock.
  await expect.poll(() => enabled(page)).toEqual(['mapsearch', 'panebar']);
  await expect(pane(page, BAR)).toBeVisible();
  await expect(pane(page, FIND)).toBeHidden();
  const ch = await box(page, 'character');
  const group = await box(page, 'group');
  const timers = await box(page, 'timers');
  const comm = await box(page, 'comm');
  const ui = await box(page, 'ui');
  const bar = await box(page, BAR);
  // Group at the screen edge, Timers beside it, both under Character.
  expect(group.x).toBeGreaterThan(timers.x);
  expect(group.y).toBeCloseTo(timers.y, 0);
  expect(group.y).toBeGreaterThanOrEqual(ch.y + ch.height - 1);
  expect(comm.y).toBeGreaterThanOrEqual(group.y + group.height - 1);
  expect(comm.height).toBeGreaterThan(group.height);
  expect(ui.y).toBeGreaterThanOrEqual(comm.y + comm.height - 1);
  expect(bar.y).toBeGreaterThanOrEqual(ui.y + ui.height - 1);
  await expect(pane(page, 'ui')).not.toHaveAttribute('data-framed', '');
  await expect(pane(page, 'comm')).toHaveAttribute('data-framed', '');

  // FIND is dim: the pane is off.
  expect(await page.evaluate((id) => window.__wc!.settings.get().panes[id as 'map']?.on, FIND)).toBe(false);

  // Opened, it floats right under the map, as wide.
  await page.evaluate(() => window.__wc!.app.onCommand('mapsearch'));
  await expect(pane(page, FIND)).toBeVisible();
  const map = await box(page, 'map');
  const find = await box(page, FIND);
  expect(find.x).toBeCloseTo(map.x, 0);
  expect(find.width).toBeCloseTo(map.width, 0);
  expect(find.y).toBeCloseTo(map.y + map.height, 0);

  // Turned off, the pane bar stays off after a reload.
  await page.evaluate(() => window.__wc!.shell.scripts.setEnabled('panebar', false));
  await page.reload();
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await expect.poll(() => enabled(page)).toEqual(['mapsearch']);
  await expect(pane(page, BAR)).toBeHidden();
  expect(errors).toEqual([]);
});
