// Stage 9 P0 (ADR 0020): the Map pane is on by default, floats at its
// default spot, loads the bundled arda.mm2 in the worker
// and takes pointer input without stealing the input line's focus.
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SHOT_DIR = process.env.WC_MAP_SHOT_DIR;

test('map pane: on by default, floats top-right, worker loads arda.mm2', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  // On by default (owner test 2).
  const pane = page.locator('.wc-pane-map');
  await expect(pane).toBeVisible();
  const content = pane.locator('.wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await expect(content).toHaveAttribute('data-map-rooms', '30074');

  // Placement: floating, flush with the game pane's top-right corner,
  // about 50 % × 35 % of the window.
  const geo = await page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    return { map: r('.wc-pane-map').toJSON(), game: r('.wc-game').toJSON(), cockpit: r('.wc-cockpit').toJSON() };
  });
  expect(await pane.getAttribute('data-floating')).not.toBeNull();
  expect(Math.abs(geo.map.right - geo.game.right)).toBeLessThan(2);
  expect(Math.abs(geo.map.top - geo.game.top)).toBeLessThan(2);
  expect(geo.map.width / geo.cockpit.width).toBeGreaterThan(0.2);
  expect(geo.map.width / geo.cockpit.width).toBeLessThan(0.3);
  expect(geo.map.height / geo.cockpit.height).toBeGreaterThan(0.22);
  expect(geo.map.height / geo.cockpit.height).toBeLessThan(0.32);

  // Drag and wheel on the canvas: the map moves and zooms, no error, the
  // input keeps the focus.
  await page.locator('.wc-input-field').focus();
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d+/, { timeout: 20_000 });
  const c = await content.boundingBox();
  const shot0 = await content.screenshot();
  await page.mouse.move(c!.x + c!.width / 2, c!.y + c!.height / 2);
  await page.mouse.down();
  await page.mouse.move(c!.x + c!.width / 2 + 60, c!.y + c!.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await content.screenshot()).equals(shot0), { timeout: 5000 }).toBe(false);
  const shot1 = await content.screenshot();
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await content.screenshot()).equals(shot1), { timeout: 5000 }).toBe(false);
  await expect(page.locator('.wc-input-field')).toBeFocused();
  // The pane did not move (the drag was inside the content, not on the title row).
  const after = await pane.boundingBox();
  expect(Math.round(after!.x)).toBe(Math.round(geo.map.x));

  // The worker drew MMapper's background (#2e3436) into the canvas.
  const shot = await content.screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/map-pane-canvas.png` : undefined });
  expect(shot.byteLength).toBeGreaterThan(0);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/map-pane-p0-${test.info().project.name}.png` });

  expect(errors).toEqual([]);
});

test('the HTML replay starts the inline map worker from file://', async ({ page, browser }, info) => {
  // Build a replay of the demo session in the dev app.
  await page.goto('/');
  await page.waitForFunction(() => window.__wc !== undefined);
  const html = await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
    return window.__wc!.replayHtml();
  });
  const path = info.outputPath('replay.html');
  writeFileSync(path, html);
  const context = await browser.newContext({ viewport: { width: 1400, height: 820 }, offline: true });
  await context.route(/^(https?|wss?):/, (r) => r.abort());
  const p = await context.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`file://${path}`);
  await p.waitForFunction(() => (window as unknown as { __wcReplay?: unknown }).__wcReplay != null);
  // P3 embeds the map; until then the worker starts (WebGL2 up) and loads nothing.
  // The player's own settings store (a copy of the page settings, private to PlayerHost).
  await p.evaluate(() =>
    (window as unknown as { __wcReplay: { host: { store: { update(p: object): void } } } }).__wcReplay.host.store.update({
      panes: { map: { on: true } },
    }),
  );
  const content = p.locator('.wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'ready', { timeout: 15_000 });
  expect(errors).toEqual([]);
  await context.close();
});

test('script map marks: a scry marks its room on the map for 15 s (ADR 0057)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  const content = page.locator('.wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  // Locate the player: the map-demo walk ends on Hill Road.
  await page.evaluate(async () => {
    const text = await (await fetch('/__fixtures/map-demo.log')).text();
    window.__wc!.app.startReplay(text, 'map-demo.log', 0);
  });
  await expect(content).toHaveAttribute('data-map-room', '26971', { timeout: 15_000 });
  const input = page.locator('.wc-input-field');
  await input.focus();
  await page.keyboard.type('#script enable keymanager');
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const bus = window.__wc!.app.bus;
    const data = { name: 'Gittan', fullname: 'Gittan the Tester' };
    bus.emit('gmcp.raw', { pkg: 'Char.Name', json: JSON.stringify(data) });
    bus.emit('gmcp', { pkg: 'Char.Name', key: 'char.name', data });
  });
  await expect(page.locator('.wc-pane[data-pane="keymanager/keys"]')).toContainText('0 keys');
  // A scry's lines, as MUME sends them (format from the Mudlet script).
  const t0 = Date.now();
  await page.evaluate(() => {
    const bus = window.__wc!.app.bus;
    const line = (text: string) => bus.emit('text.line', { text, runs: [], tags: [], prompt: false, raw: text, ts: 0 });
    line('You let your inner eye find the area... and you see:');
    line('Hill Road');
    line('');
    line('Ok.');
  });
  await expect(content).toHaveAttribute('data-map-marks', '1', { timeout: 5000 });
  await expect(page.locator('.wc-output')).toContainText(/TV scry: scried; (on the map|\d+ rooms named "Hill Road")/);
  if (SHOT_DIR) {
    await page.waitForTimeout(600);
    await content.screenshot({ path: `${SHOT_DIR}/map-mark-${test.info().project.name}.png` });
  }
  // The blink ends after 15 s and the scry's TV closes with it; the mark
  // lingers (steady, 3 min; its end is covered by the unit tests).
  const tvScry = page.locator('.wc-pane[data-pane="keymanager/~tv_scry"]');
  await expect(tvScry).toBeVisible();
  await expect(tvScry).toHaveCount(0, { timeout: 25_000 });
  expect(Date.now() - t0).toBeGreaterThan(14_000);
  await page.waitForTimeout(1500);
  await expect(content).toHaveAttribute('data-map-marks', '1');
  // Map pane off: nothing is marked, the KEYS line says so.
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: false } } }));
  await page.evaluate(() => {
    const bus = window.__wc!.app.bus;
    const line = (text: string) => bus.emit('text.line', { text, runs: [], tags: [], prompt: false, raw: text, ts: 0 });
    line('You let your inner eye find the area... and you see:');
    line('Hill Road');
    line('');
    line('Ok.');
  });
  await expect(page.locator('.wc-output')).toContainText('TV scry: scried (map off).');
  expect(errors).toEqual([]);
});
