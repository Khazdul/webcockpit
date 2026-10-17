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

  // Two canvases (back, front); the worker's first frame marks the cockpit.
  await expect(layers(page)).toHaveCount(2);
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

test('panes are see-through with weather on: docked at once, a float at once and while it moves, over another float too', async ({ page }) => {
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
  const fill = () => group.evaluate((el) => getComputedStyle(el.querySelector('.wc-pane-frame')!, '::before').backgroundColor);
  /** The float's own weather canvas: its first child, opaque in CSS (the terminal background). */
  const own = (sel: string) =>
    page.evaluate((s) => {
      const el = document.querySelector(s)!;
      const c = el.firstElementChild as HTMLElement;
      return c.classList.contains('wc-weather-float') ? getComputedStyle(c).backgroundColor : null;
    }, sel);
  await expect(group).toHaveAttribute('data-floating', '');
  expect(await fill()).toBe('rgb(0, 0, 0)');

  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  // Docked panes go see-through with the first frame; the float holds its own canvas (opaque underneath).
  expect(await page.locator('.wc-pane-character .wc-pane-frame').evaluate((f) => getComputedStyle(f, '::before').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect(group).toHaveAttribute('data-weather-see', '');
  expect(await fill()).toBe('rgba(0, 0, 0, 0)');
  expect(await own('.wc-pane-group')).toBe('rgb(0, 0, 0)');
  await expect(page.locator('.wc-pane-character > canvas.wc-weather-float')).toHaveCount(0);

  // Moving it: see-through in the same frame, its canvas moves with it.
  const moved = await page.evaluate(() => {
    window.__wc!.settings.update((d) => {
      d.layout.floating = d.layout.floating.map((f) => (f.id === 'group' ? { ...f, x: 9, y: 14 } : f));
    });
    window.__wc!.app.cockpit.relayoutNow();
    const g = document.querySelector('.wc-pane-group')!;
    return [g.hasAttribute('data-weather-see'), g.firstElementChild!.classList.contains('wc-weather-float')];
  });
  expect(moved).toEqual([true, true]);

  // Over the map (another float): both stay see-through, each with its own canvas.
  await page.evaluate(() => {
    const m = document.querySelector<HTMLElement>('.wc-pane-map')!;
    const cs = getComputedStyle(document.querySelector('.wc-cockpit')!);
    const cw = parseFloat(cs.getPropertyValue('--cell-w')), ch = parseFloat(cs.getPropertyValue('--cell-h'));
    const x = Math.round(parseFloat(m.style.left) / cw) - 10, y = Math.round(parseFloat(m.style.top) / ch) + 3;
    window.__wc!.settings.update((d) => {
      d.layout.floating = d.layout.floating.map((f) => (f.id === 'group' ? { ...f, x, y } : f));
    });
  });
  await expect(group).toHaveAttribute('data-weather-see', '');
  await expect(page.locator('.wc-pane-map')).toHaveAttribute('data-weather-see', '');
  expect(await own('.wc-pane-map')).toBe('rgb(0, 0, 0)');

  // Docked again: no canvas, no mark.
  await page.evaluate(() =>
    window.__wc!.settings.update((d) => {
      d.layout.floating = d.layout.floating.filter((f) => f.id !== 'group');
      d.layout.docks.right.tail.unshift({ id: 'group', desired: 10 });
    }),
  );
  await expect(group).not.toHaveAttribute('data-floating');
  await expect(group).not.toHaveAttribute('data-weather-see');
  await expect(page.locator('.wc-pane-group > canvas.wc-weather-float')).toHaveCount(0);

  // Off: everything opaque again.
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: false } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(0);
  await expect(page.locator('.wc-pane[data-weather-see]')).toHaveCount(0);
  await expect(page.locator('canvas.wc-weather-float')).toHaveCount(0);
  expect(errors).toEqual([]);
});
