// A production build served from a site root by a plain static file
// server (ADR 0022): every file the app loads resolves with the right
// type, the page is cross-origin isolated, the map worker loads the
// bundled map, and nothing depends on the dev server.
// Never open `/` without a parameter here: that connects to MUME live.
import { expect, test } from '@playwright/test';

test('app at the site root: assets, worker, map, fonts, isolation', async ({ page }) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.url()} HTTP ${r.status()}`);
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(page.locator('.wc-rows .wc-row').first()).toHaveText(/Offline replay mode/);
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);

  // The map worker (a module worker by URL) fetched arda.mm2 and drew tiles.
  const content = page.locator('.wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
  await expect(content).toHaveAttribute('data-map-rooms', /^\d{4,}$/);
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d+/, { timeout: 30_000 });

  // The bundled fonts load from /fonts/.
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
  });
  expect(fonts.length).toBeGreaterThan(0);

  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test('files the export and the map fetch have the right types and headers', async ({ request }) => {
  const check = async (path: string, type: RegExp): Promise<Record<string, string>> => {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    expect(r.headers()['content-type'], path).toMatch(type);
    expect(r.headers()['cross-origin-embedder-policy'], path).toBe('require-corp');
    expect(r.headers()['cross-origin-opener-policy'], path).toBe('same-origin');
    return r.headers();
  };
  const index = await check('/', /^text\/html/);
  expect(index['cache-control']).toBe('no-cache');
  await check('/replay/replay.js', /^text\/javascript/);
  await check('/map/arda.mm2', /^application\/octet-stream/);
  await check('/fonts/DejaVuSansMono.woff2', /^font\/woff2/);
  await check('/fonts/JetBrainsMonoNL-Regular.woff2', /^font\/woff2/);
  // The GPL text About links to (ADR 0027).
  await check('/LICENSE.txt', /^text\/plain/);
  expect(await (await request.get('/LICENSE.txt')).text()).toContain('GNU GENERAL PUBLIC LICENSE');
  // The update check's manifest (ADR 0025): revalidated, never immutable.
  const release = await check('/release.json', /^application\/json/);
  expect(release['cache-control']).toBe('no-cache');
  expect(await (await request.get('/release.json')).json()).toMatchObject({ version: expect.any(String), commit: expect.any(String) });

  // Hashed assets: long immutable caching; the worker is among them.
  const html = await (await request.get('/')).text();
  const asset = /\/assets\/[^"]+\.js/.exec(html)?.[0];
  expect(asset).toBeTruthy();
  expect((await check(asset!, /^text\/javascript/))['cache-control']).toContain('immutable');

  // Dev-only middleware is not part of the build.
  expect((await request.get('/__fixtures/list')).status()).toBe(404);
});
