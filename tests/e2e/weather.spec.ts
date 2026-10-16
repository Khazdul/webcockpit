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

  // Two canvases; the worker's first frame marks the cockpit.
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
