// A production build served by a plain static file server that stands in
// for the host (scripts/static-server.ts; ADR 0028, ADR 0029, ADR 0144) or
// the deployed site: every file the app loads resolves with the right
// type, the map worker loads the bundled map, and nothing depends on the
// dev server. Neither host sends COOP/COEP, so the app is not cross-origin
// isolated. What differs between the hosts (cache headers, the security
// headers, the API) is checked per profile (profile.ts).
// The same tests run against a deployed Worker (WC_PROD_URL), so they
// assert only what Cloudflare itself promises, not what the local server
// happens to send.
// Paths are relative to the base (playwright.prod.config.ts): a leading
// `/` would escape it. Never open the base without a parameter here: that
// connects to MUME live.
import { expect, test } from '@playwright/test';
import { cloudflare } from './profile.ts';

/** GitHub Pages serves `.js` as `application/javascript`, Cloudflare as `text/javascript`; both work for modules. */
const JS = /^(text|application)\/javascript/;

/** The headers `public/_headers` puts on every static file on Cloudflare (ADR 0144). */
const SECURITY: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "frame-ancestors 'none'",
};

test('app at the base: assets, worker, map, fonts, not isolated', async ({ page }) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.url()} HTTP ${r.status()}`);
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('./?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await expect(page.locator('.wc-rows .wc-row').first()).toHaveText(/Offline replay mode/);
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(false);

  // The map worker (a module worker by URL) fetched arda.mm2 and drew tiles.
  const content = page.locator('.wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
  await expect(content).toHaveAttribute('data-map-rooms', /^\d{4,}$/);
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d+/, { timeout: 30_000 });

  // The bundled fonts load from fonts/ under the base.
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
  });
  expect(fonts.length).toBeGreaterThan(0);

  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test('files the export and the map fetch have the right types and headers', async ({ request, baseURL }) => {
  const check = async (path: string, type: RegExp | null): Promise<Record<string, string>> => {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    if (type) expect(r.headers()['content-type'], path).toMatch(type);
    if (cloudflare) expect(r.headers(), path).toMatchObject(SECURITY);
    return r.headers();
  };
  const index = await check('./', /^text\/html/);
  await check('replay/replay.js', JS);
  // The map is read as bytes, whatever the type. Pages says octet-stream;
  // Cloudflare does not know `.mm2` and sends no Content-Type at all.
  const map = await check('map/arda.mm2', cloudflare ? null : /^application\/octet-stream/);
  expect(map['content-type'] ?? 'application/octet-stream').toMatch(/^application\/octet-stream/);
  // A bundled tileset (ADR 0082) is deployed with the default pixmaps.
  await check('map/pixmaps/terrain-field.png', /^image\/png/);
  await check('map/tilesets/shimrod-winter/terrain-field.png', /^image\/png/);
  // The tileset picker's previews (ADR 0118).
  await check('map/tilesets/previews/default.png', /^image\/png/);
  await check('fonts/DejaVuSansMono.woff2', /^font\/woff2/);
  await check('fonts/JetBrainsMonoNL-Regular.woff2', /^font\/woff2/);
  // The GPL text About links to (ADR 0027).
  await check('LICENSE.txt', /^text\/plain/);
  expect(await (await request.get('LICENSE.txt')).text()).toContain('GNU GENERAL PUBLIC LICENSE');
  // The update check's manifest (ADR 0025): never immutable.
  const release = await check('release.json', /^application\/json/);
  expect(release['cache-control'] ?? '').not.toContain('immutable');
  expect(await (await request.get('release.json')).json()).toMatchObject({ version: expect.any(String), commit: expect.any(String) });

  // Hashed assets (the worker is among them). The HTML's asset URLs are
  // absolute, with the base.
  const html = await (await request.get('./')).text();
  const asset = /"([^"]*\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  expect(asset).toBeTruthy();
  expect(asset!.startsWith(`${new URL(baseURL!).pathname}assets/`), asset).toBe(true);
  const hashed = await check(asset!, JS);

  if (cloudflare) {
    // ADR 0144: hashed files for a year, the page and the manifest always
    // revalidated, so a release is seen at once.
    expect(hashed['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(index['cache-control']).toBe('no-cache');
    expect(release['cache-control']).toBe('no-cache');
    // Everything else: Cloudflare's default, revalidated by ETag.
    expect(map['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(release.etag).toBeTruthy();
    const again = await request.get('release.json', { headers: { 'If-None-Match': release.etag! } });
    expect(again.status()).toBe(304);
  }
  // (Pages caches everything for 10 minutes.)

  // Dev-only middleware is not part of the build.
  expect((await request.get('__fixtures/list')).status()).toBe(404);
});

test('the API: health says the release, config has no flags, the rest is a JSON 404', async ({ request }) => {
  test.skip(!cloudflare, 'GitHub Pages has no API');
  const release = (await (await request.get('release.json')).json()) as { version: string; commit: string };

  const health = await request.get('api/health');
  expect(health.status()).toBe(200);
  expect(health.headers()['content-type']).toMatch(/^application\/json/);
  expect(health.headers()['cache-control']).toBe('no-store');
  expect(await health.json()).toEqual({ ok: true, version: release.version, commit: release.commit });

  const config = await request.get('api/config');
  expect(config.status()).toBe(200);
  expect(config.headers()['cache-control']).toBe('no-store');
  expect(await config.json()).toEqual({ flags: {} });

  const unknown = await request.get('api/x');
  expect(unknown.status()).toBe(404);
  expect(unknown.headers()['content-type']).toMatch(/^application\/json/);
  expect(unknown.headers()['cache-control']).toBe('no-store');
  expect(await unknown.json()).toEqual({ error: 'not_found' });

  const wrong = await request.post('api/health');
  expect(wrong.status()).toBe(405);
  expect(await wrong.json()).toEqual({ error: 'method_not_allowed' });
});
