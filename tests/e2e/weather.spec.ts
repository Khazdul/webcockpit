// Stage 28 (trial, ADR 0091): Options → Weather effects loads and unloads
// the engine live, and the bridge follows GMCP.
import { type Page, expect, test } from '@playwright/test';

const layers = (page: Page) => page.locator('.wc-cockpit > canvas.wc-weather-layer');
const row = (page: Page, key: string) => page.locator(`.wc-overlay .wc-frame:not([hidden]) .wc-mrow[data-key="${key}"] .wc-label`);

test('Options → Weather effects turns the engine on and off live; the bridge follows GMCP', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(layers(page)).toHaveCount(0);

  await page.keyboard.press('Escape');
  await row(page, 'options').click();
  await row(page, 'weather').click();
  await expect(page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-title-row')).toContainText('Weather effects');
  await expect(row(page, 'enabled')).toHaveText('[ ] Weather effects');
  await row(page, 'enabled').click();
  expect(await page.evaluate(() => window.__wc!.settings.get().weather.enabled)).toBe(true);

  // Three canvases (back, mid, front); the worker's first frame marks the cockpit.
  await expect(layers(page)).toHaveCount(3);
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);

  // GMCP reaches the engine through the bridge.
  const state = () => page.evaluate(() => window.__wc!.app.weather!.controller?.state() ?? null);
  await page.evaluate(() => {
    const bus = window.__wc!.app.bus;
    bus.emit('gmcp', { pkg: 'Char.Vitals', key: 'char.vitals', data: { weather: '"', fog: '=', position: 'sleeping' } });
    bus.emit('gmcp', { pkg: 'Event.Sun', key: 'event.sun', data: { what: 'set' } });
  });
  await expect.poll(state).toMatchObject({ weather: '"', fog: '=', position: 'sleeping', clock: 'night' });

  // A category and an appearance change apply live without errors.
  await row(page, 'fog').click();
  expect(await page.evaluate(() => window.__wc!.settings.get().weather.fog)).toBe(false);
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
  const stats = await page.evaluate(() => window.__wc!.app.weather!.controller!.engine.stats());
  expect(stats.n).toBeGreaterThan(0);

  // Off: the worker, the canvases and the attribute are gone.
  await row(page, 'enabled').click();
  await expect(layers(page)).toHaveCount(0);
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__wc!.app.weather!.controller)).toBeNull();
  expect(errors).toEqual([]);
});

test('panes are see-through with weather on: docked at once, a float once its place is painted, not over another float', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?replay');
  await expect(page.locator('.wc-pane-character')).toBeVisible();
  // Group floats over the game text.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      const R = d.layout.docks.right;
      for (const l of [R.head, ...R.lanes.map((x) => x.panes), R.tail]) {
        const i = l.findIndex((p) => p.id === 'group');
        if (i >= 0) l.splice(i, 1);
      }
      d.layout.floating = [...d.layout.floating, { id: 'group', x: 5, y: 8, w: 36, h: 12 }];
      d.panes.group.on = true;
    }),
  );
  const group = page.locator('.wc-pane-group');
  const fill = () => group.evaluate((el) => getComputedStyle(el.querySelector('.wc-pane-frame')!).backgroundColor);
  await expect(group).toHaveAttribute('data-floating', '');
  expect(await fill()).toBe('rgb(0, 0, 0)');

  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  // Docked panes go see-through with the first frame; the float once the worker has painted under it.
  expect(await page.locator('.wc-pane-character .wc-pane-frame').evaluate((f) => getComputedStyle(f).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect(group).toHaveAttribute('data-weather-see', '');
  expect(await fill()).toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('canvas.wc-weather-mid')).toBeVisible();

  // Moving it: opaque from the relayout on (before it is painted), see-through again once the worker catches up.
  const right = await page.evaluate(() => {
    window.__wc!.settings.update((d) => {
      d.layout.floating = d.layout.floating.map((f) => (f.id === 'group' ? { ...f, x: 9, y: 14 } : f));
    });
    window.__wc!.app.cockpit.relayoutNow();
    return document.querySelector('.wc-pane-group')!.hasAttribute('data-weather-see');
  });
  expect(right).toBe(false);
  await expect(group).toHaveAttribute('data-weather-see', '');

  // Over the map (another float): both stay opaque.
  await page.evaluate(() => {
    const m = document.querySelector<HTMLElement>('.wc-pane-map')!;
    const cs = getComputedStyle(document.querySelector('.wc-cockpit')!);
    const cw = parseFloat(cs.getPropertyValue('--cell-w')), ch = parseFloat(cs.getPropertyValue('--cell-h'));
    const x = Math.round(parseFloat(m.style.left) / cw) - 10, y = Math.round(parseFloat(m.style.top) / ch) + 3;
    window.__wc!.settings.update((d) => {
      d.layout.floating = d.layout.floating.map((f) => (f.id === 'group' ? { ...f, x, y } : f));
    });
  });
  await expect(group).not.toHaveAttribute('data-weather-see');
  await expect(page.locator('.wc-pane-map')).not.toHaveAttribute('data-weather-see');
  expect(await fill()).toBe('rgb(0, 0, 0)');

  // Off: everything opaque again.
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: false } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(0);
  await expect(page.locator('.wc-pane[data-weather-see]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
