// The Content-Security-Policy walk (ADR 0144, "As built (stage 60): the
// CSP"): the app's main surfaces in a production build, served with the
// policy of `public/_headers`, and not one violation. While the policy is
// report-only nothing is blocked, so the collector (csp.ts) is what says
// that it could be enforced; enforced, the same walk says that nothing
// broke (and only then are the workers really tried: csp.ts).
//
//   locally           npm run build:site -- --skip-live
//                     WC_PROD_DIR=dist-site npx playwright test -c playwright.prod.config.ts csp
//   enforced, locally the same with WC_PROD_CSP=enforce (the local server
//                     then sends the report-only policy as the enforced one:
//                     the rehearsal of the switch in scripts/csp.ts)
//   a deployed site   WC_PROD_URL=https://staging.mumecockpit.com npm run test:prod -- csp
//
// Read-only on a deployed site, as the rest of test:prod: the game's
// socket, the link probe and the usage beat are answered here (csp.ts),
// so nothing is sent to MUME and nothing is counted; no account is made,
// and what the walk stores (a restored demo backup, a script's switch)
// stays in the test browser's own storage.
//
// Not walked: the account pages (Turnstile's script and frame), which do
// not exist yet; they get their own steps here when they do.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type Browser, type BrowserContext, type Page, devices, expect, test } from '@playwright/test';
import { type CspWatch, keepQuiet, mockMume, watchCsp } from './csp.ts';
import { cloudflare } from './profile.ts';

test.skip(!cloudflare, 'GitHub Pages sends no policy');

/** The demo backup (two characters, five spotlights) and the day after it: later, its unsaved runs are swept (14 days). */
const DEMO_BACKUP = new URL('../fixtures/runs-demo.jsonl.gz', import.meta.url);
const DEMO_NOW = new Date(2026, 8, 28, 12, 0, 0);

const top = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const menuItem = (page: Page, key: string) => top(page).locator(`.wc-sm-item[data-key="${key}"]`);
const hood = (page: Page) => top(page).locator('.wc-lk-hood-t:not(.is-out)').last();
const rows = (page: Page) => page.locator('.wc-rows .wc-row');

interface Walk {
  page: Page;
  csp: CspWatch;
  errors: string[];
}

/** A page with the collector on and MUME mocked, at the start menu. */
async function start(page: Page, query = ''): Promise<Walk & { mume: Awaited<ReturnType<typeof mockMume>> }> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const csp = await watchCsp(page);
  const mume = await mockMume(page);
  await page.goto(`./${query}`);
  await expect(top(page).locator('.wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  return { page, csp, errors, mume };
}

async function done(w: Walk): Promise<void> {
  await w.csp.clean();
  expect(w.errors).toEqual([]);
}

/** Opens a start menu page and waits for its title. */
async function open(page: Page, key: string, title: string): Promise<void> {
  await menuItem(page, key).click();
  await expect(hood(page)).toHaveText(title);
}

/** History with the demo backup restored (the page's clock at the demo's time). */
async function historyWithDemo(page: Page): Promise<void> {
  await open(page, 'history', 'History');
  await top(page)
    .locator('.wc-history-file')
    .setInputFiles({ name: 'runs-demo.jsonl.gz', mimeType: 'application/gzip', buffer: readFileSync(DEMO_BACKUP) });
  await expect(top(page).locator('.wc-hist .wc-lk-tr')).toHaveCount(3);
}

test('the policy is sent with every static file and names the inline scripts of the page', async ({ request }) => {
  const policyOf = (headers: Record<string, string>): string => {
    const enforced = headers['content-security-policy'] ?? '';
    const reported = headers['content-security-policy-report-only'] ?? '';
    // Enforced or not, clickjacking is refused (ADR 0144).
    expect(enforced).toContain("frame-ancestors 'none'");
    const full = reported || enforced;
    expect(full).toContain("default-src 'none'");
    expect(full).not.toContain('INLINE-SCRIPTS');
    return full;
  };
  for (const path of ['./', 'privacy']) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    const policy = policyOf(r.headers());
    // Every inline script of the page as served (also by whatever stands in front of the files) is in the policy by hash.
    const html = await r.text();
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter((m) => !/\bsrc\s*=/i.test(m[1]!)).map((m) => m[2]!);
    expect(inline.length, path).toBeGreaterThan(0);
    for (const text of inline) expect(policy, path).toContain(`'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`);
  }
  // Scripts (the workers among them take their policy from their own answer) and the 404 page.
  const html = await (await request.get('./')).text();
  const asset = /"([^"]*\/assets\/[^"]+\.js)"/.exec(html)![1]!;
  policyOf((await request.get(asset)).headers());
  const missing = await request.get('no-such-page-csp');
  expect(missing.status()).toBe(404);
  policyOf(missing.headers());
});

test('the collector sees a violation, and the game socket and the link probe are allowed', async ({ page, context }) => {
  const csp = await watchCsp(page);
  // Not `mockMume`: this test needs the browser's own WebSocket.
  await keepQuiet(page);
  await page.goto('./?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await csp.clean();

  // Offline, so nothing leaves the machine: the policy is checked before the network is.
  await context.setOffline(true);
  const socket = (url: string): Promise<string> =>
    page.evaluate(
      (url) =>
        new Promise<string>((resolve) => {
          try {
            const ws = new WebSocket(url, 'binary');
            ws.onopen = () => resolve('open');
            ws.onerror = () => resolve('error');
            ws.onclose = () => resolve('close');
          } catch (e) {
            resolve(`threw ${(e as Error).name}`);
          }
        }),
      url,
    );
  // The game (src/net/ws-transport.ts MUME_WS_URL) and the link probe (src/net/link-probe.ts).
  expect(await socket('wss://mume.org/ws-play/')).not.toBe('open');
  await page.evaluate(() => fetch('https://mume.org/favicon.ico?lp=csp', { method: 'HEAD', mode: 'no-cors', cache: 'no-store' }).catch(() => undefined));
  await csp.clean();

  // The controls: another host, an inline script, eval.
  await socket('wss://example.invalid/');
  await page.evaluate(() => fetch('https://example.invalid/x', { mode: 'no-cors' }).catch(() => undefined));
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__cspInline = 1';
    document.head.append(s);
  });
  await expect.poll(() => csp.violations.filter((v) => !v.startsWith('console:')).map((v) => v.split(' ')[0]).sort()).toEqual(['connect-src', 'connect-src', 'script-src-elem']);
  expect(csp.violations.join('\n')).toContain('example.invalid');
});

test('the start page and every page of its menu', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.clock.setSystemTime(DEMO_NOW);
  const w = await start(page);

  await open(page, 'profile', 'Profiles');
  await top(page).locator('[data-btn="EDIT"]').click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(hood(page)).toHaveText('Profiles');
  await page.keyboard.press('Escape');

  await open(page, 'credits', 'Credits');
  await page.keyboard.press('Escape');

  await open(page, 'about', 'About');
  await page.keyboard.press('Escape');
  await expect(menuItem(page, 'about')).toBeVisible();
  await done(w);
});

test('the privacy page and the 404 page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const csp = await watchCsp(page);
  await mockMume(page);
  await page.goto('privacy');
  await expect(hood(page)).toHaveText(/Privacy/);
  await page.goto('no-such-page-csp');
  await expect(page.locator('body')).toContainText('404');
  await csp.clean();
  expect(errors).toEqual([]);
});

test('Scripts: the code editor, the manual', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 820 });
  const w = await start(page);
  await open(page, 'scripts', 'Scripts');
  await top(page).locator('[data-btn="EDIT"]').click();
  const editor = page.locator('.wc-frame:not([hidden]) .wc-sed');
  await expect(editor.locator('.cm-content')).toBeVisible();
  await expect(editor.locator('.cm-line').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await top(page).locator('[data-btn="MANUAL"]').click();
  await page.waitForTimeout(800);
  await done(w);
});

test('History: restore, the log player, the export editor and its downloads, a backup; Spotlights', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.clock.setSystemTime(DEMO_NOW);
  const w = await start(page);
  await historyWithDemo(page);
  const hist = top(page).locator('.wc-hist');

  // A backup: a download from a blob: URL.
  const backup = page.waitForEvent('download');
  await page.keyboard.press('b');
  expect((await backup).suggestedFilename()).toMatch(/^webcockpit-runs-.*\.jsonl\.gz$/);

  // The log player (its map pane loads the map in the worker).
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(hist.locator('.wc-lk-tr.is-on')).toContainText('Rasta');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-player')).toBeVisible();
  await expect(page.locator('.wc-player .wc-output .wc-row').first()).toBeVisible();
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-player')).toHaveCount(0);

  // The export editor: the HTML replay (the replay bundle and the fonts fetched as text and bytes) and the plain text.
  await hist.locator('[data-btn="EXPORT"]').click();
  await expect(top(page).locator('.wc-exp-row').first()).toBeVisible();
  const html = page.waitForEvent('download', { timeout: 60_000 });
  await page.keyboard.press('o');
  expect((await html).suggestedFilename()).toMatch(/\.html$/);
  await page.keyboard.press('p');
  const text = page.waitForEvent('download');
  await page.keyboard.press('o');
  expect((await text).suggestedFilename()).toMatch(/\.txt$/);
  await page.keyboard.press('Escape');
  await expect(hood(page)).toHaveText('History');
  await page.keyboard.press('Escape');

  await open(page, 'spotlights', 'Spotlights');
  await top(page).locator('[data-btn="PLAY"]').click();
  await expect(page.locator('.wc-player')).toBeVisible();
  await page.waitForTimeout(1500);
  await done(w);
});

test('the game against a mocked MUME: login, the map, Lua, the windows of the menu bar', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const w = await start(page);
  const wasm = page.waitForResponse(/\/assets\/[^/]+\.wasm$/);
  await page.keyboard.press('Enter');
  const app = page.locator('.wc-app');
  await expect(app).toHaveAttribute('data-status', /^login/);
  w.mume.login();
  await expect(app).toHaveAttribute('data-status', /^playing/);

  // The map worker fetched the bundled map and drew its tiles.
  const map = page.locator('.wc-pane-map .wc-pane-content');
  await expect(map).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
  await expect(map).toHaveAttribute('data-map-drawn-ms', /\d+/, { timeout: 30_000 });

  const field = page.locator('.wc-input-field');
  const type = async (text: string): Promise<void> => {
    await field.fill(text);
    await page.keyboard.press('Enter');
  };
  // A command to the game and its answer.
  await type('look');
  await expect(rows(page).filter({ hasText: 'A goblin is here.' })).toHaveCount(1);
  // Lua: the WebAssembly module is compiled and runs (`'wasm-unsafe-eval'`).
  // (mapsearch, bundled and on by default, has made its pane from Lua; a second script is turned on here.)
  expect((await wasm).status()).toBe(200);
  await expect(page.locator('.wc-pane-script[data-pane="mapsearch/main"]')).toHaveCount(1);
  await type('#script enable almanac');
  await expect(rows(page).filter({ hasText: '[SYSTEM] Script almanac turned on.' })).toHaveCount(1);
  await expect(page.locator('.wc-pane-script')).toHaveCount(2);
  await type('#script help almanac');
  await type('#help');

  // The weather worker.
  await type('#weather demo x40');
  await expect(page.locator('.wc-cockpit > .wc-wdemo')).toBeVisible();
  await type('#weather stop');

  for (const mb of ['profile', 'scripts', 'panes']) {
    await page.locator(`.wc-mb[data-mb="${mb}"]`).click();
    await page.waitForTimeout(700);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  // Settings → Mapper: the tileset previews (images), and a file that is no map through the map tools worker.
  await page.locator('.wc-mb[data-mb="settings"]').click();
  await page.locator('.wc-ck-tab[data-tab="mapper"]').click();
  const pop = page.locator('.wc-sp-settings');
  await expect(pop.locator('.wc-sp-mapfile')).toHaveText('arda.mm2 (bundled)');
  await pop.locator('.wc-sp-mapfile-input').setInputFiles({ name: 'junk.mm2', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3]) });
  await expect(pop.locator('.wc-sp-mapnote')).toHaveText(/^Import failed/);
  await done(w);
});

/** A phone: a touch context of a phone's size (Chromium also as a mobile browser), the phone profile forced. */
async function phonePage(browser: Browser, browserName: string, baseURL: string): Promise<{ context: BrowserContext; page: Page }> {
  const pixel = devices['Pixel 7'];
  const context = await browser.newContext(
    browserName === 'chromium' ? { ...pixel, baseURL } : { viewport: pixel.viewport, hasTouch: true, baseURL },
  );
  return { context, page: await context.newPage() };
}

test('the phone profile: the start page, the game, its menu', async ({ browser, browserName, baseURL }) => {
  const { context, page } = await phonePage(browser, browserName, baseURL!);
  try {
    const w = await start(page, '?phone=1');
    await menuItem(page, 'enter').tap();
    const app = page.locator('.wc-app');
    await expect(app).toHaveAttribute('data-status', /^login/);
    w.mume.login();
    await expect(app).toHaveAttribute('data-status', /^playing/);
    await expect(page.locator('.wc-ph-pad')).toBeVisible();
    await page.locator('.wc-ph-key[data-cmd="look"]').tap();
    await expect(rows(page).filter({ hasText: 'A goblin is here.' })).toHaveCount(1);
    // The map lens (the phone's map), then the menu's sheet.
    await expect(page.locator('.wc-ph-lens')).toBeVisible();
    await page.waitForTimeout(1500);
    await page.locator('.wc-ph-menu').tap();
    await expect(page.locator('.wc-ph-sheet')).toBeVisible();
    await done(w);
  } finally {
    await context.close();
  }
});
