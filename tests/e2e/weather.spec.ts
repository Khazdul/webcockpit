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
  // The blue day sky on its own (owner feedback 36).
  await expect(row(page, 'daySky')).toHaveText('[X] Blue day sky');
  await row(page, 'daySky').click();
  await expect(row(page, 'daySky')).toHaveText('[ ] Blue day sky');
  expect(await page.evaluate(() => window.__wc!.settings.get().weather)).toMatchObject({ sky: true, daySky: false });
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
  // Docked panes turn to light glass with the first frame: the pane colour at 55 % over a light blur,
  // the rim's blur in four strips (ADR 0091 "Frames", addendum: glass rim and nameplate); the float
  // holds its own canvas (opaque underneath) under the same glass (item 50).
  // Firefox (`data-weather-flat`): no blur, a denser tint (64 %, a float too).
  const glass = await page.locator('.wc-pane-character').evaluate((el) => {
    const f = getComputedStyle(el.querySelector('.wc-pane-frame')!, '::before');
    const strips = [...el.querySelectorAll('.wc-pane-blur > i')].map((s) => getComputedStyle(s).backdropFilter);
    const shown = getComputedStyle(el.querySelector('.wc-pane-blur')!).display !== 'none';
    return { bg: f.backgroundColor, blur: f.backdropFilter, strips, shown, flat: el.parentElement!.hasAttribute('data-weather-flat') };
  });
  const alpha = (a: string) => new RegExp(`^(rgba\\(0, 0, 0, ${a}\\)|color\\(srgb 0 0 0 \\/ ${a}\\))$`);
  expect(glass.flat).toBe(test.info().project.name === 'firefox');
  expect(glass.strips).toHaveLength(4);
  if (glass.flat) {
    expect(glass.bg).toMatch(alpha('0\\.64'));
    expect(glass.blur).toBe('none');
    expect(glass.shown).toBe(false);
  } else {
    expect(glass.bg).toMatch(alpha('0\\.55'));
    expect(glass.blur).toContain('blur(2.5px)');
    expect(glass.shown).toBe(true);
    for (const s of glass.strips) expect(s).toContain('blur(9px)');
  }
  await expect(group).toHaveAttribute('data-weather-see', '');
  expect(await fill()).toMatch(alpha(glass.flat ? '0\\.64' : '0\\.55'));
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

// Owner feedback 33: `#weather demo` plays every effect with a caption box,
// then hands the effects back to the game. `x40` (hidden) runs the wall
// clock 40 times faster.
test('#weather demo: turns the effects on, captions each step, ends unpinned and off again; #weather stop aborts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  const field = page.locator('.wc-input-field');
  const type = async (text: string): Promise<void> => {
    await field.fill(text);
    await page.keyboard.press('Enter');
  };
  const box = page.locator('.wc-cockpit > .wc-wdemo');
  const step = box.locator('.wc-wdemo-step');
  const state = () => page.evaluate(() => window.__wc!.app.weather!.controller?.state() ?? null);

  // Off before: the demo turns it on and off again.
  expect(await page.evaluate(() => window.__wc!.settings.get().weather.enabled)).toBe(false);
  await type('#weather demo x40');
  await expect(box).toBeVisible();
  await expect(box.locator('.wc-wdemo-title')).toHaveText('Weather demo');
  await expect(step).not.toHaveText('');
  await expect(box.locator('.wc-wdemo-hint')).toHaveText('#weather stop to end');
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  await expect(step).toHaveText('Sunset', { timeout: 5_000 });
  expect(await state()).toMatchObject({ clock: 'night' });
  await expect(box).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: 'Weather demo done; the effects are off again.' })).toHaveCount(1);
  expect(await page.evaluate(() => window.__wc!.settings.get().weather.enabled)).toBe(false);
  await expect(page.locator('.wc-cockpit > canvas.wc-weather-layer')).toHaveCount(0);

  // On before, with the game's values: unpinned afterwards, the game's values again.
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  await page.evaluate(() => {
    const bus = window.__wc!.app.bus;
    bus.emit('gmcp', { pkg: 'Char.Vitals', key: 'char.vitals', data: { weather: '~', fog: '-', position: 'resting' } });
  });
  await expect.poll(state).toMatchObject({ weather: '~', fog: '-', position: 'resting' });
  await type('#weather demo x40');
  await expect(box).toBeVisible();
  await expect.poll(state).toMatchObject({ position: 'standing' });
  await expect(box).toHaveCount(0, { timeout: 10_000 });
  expect(await state()).toMatchObject({ weather: '~', fog: '-', position: 'resting' });
  expect(await page.evaluate(() => window.__wc!.settings.get().weather.enabled)).toBe(true);

  // #weather stop ends it at once.
  await type('#weather demo');
  await expect(step).toHaveText('Night · moon and stars');
  expect(await state()).toMatchObject({ clock: 'night', weather: ' ' });
  await type('#weather stop');
  await expect(box).toHaveCount(0);
  expect(await state()).toMatchObject({ weather: '~', fog: '-', position: 'resting' });
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: 'Weather demo stopped.' })).toHaveCount(1);
  expect(errors).toEqual([]);
});
