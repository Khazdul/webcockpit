// Captures the real look from a running dev server into build/skel/ (stage 65,
// round 13), after round 12's. A Playwright "spec" only so that it can use the
// e2e fakes of the account API and the share links' read side
// (tests/e2e/cloud-account-fake.ts, cloud-pub-fake.ts) with the flags
// `accounts`, `sync`, `runs` and `share` on. Throwaway tooling for the mockups.
//
//   WC_E2E_PORT=5471 npx vite --port 5471 --strictPort      (never 5173)
//   npx playwright test -c notes/research/start-menu-mockups/round13/build/pw.config.ts
//
// Writes, per view (d = desktop 1440 × 900, p = phone 390 × 844):
//   <v>-html.json      the <html> element's attributes (the theme)
//   <v>-<page>.html    `#app` with the sky emptied; page = guest (the menu as a
//                      guest, `?community=3`), in (logged in, `?community=3`),
//                      hist (History, its big box), export, account (with four
//                      published runs in the fake), watch (the built watch page,
//                      logged in as another account; its frame emptied)
//   <v>-watch-html.json the watch page's <html> attributes
//   <v>-sky.jpg        the sky alone (a fixed dusk)
//   <v>-replay-<k>.jpg the HTML replay of the demo session (the dev app's
//                      exporter) playing, at the frame's size in variant k
// and css.json (every stylesheet seen), icons.json (the kit's icons).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Browser, type Page, devices, expect, test } from '@playwright/test';
import { FakeAccountServer, fakeAccountApi, seedAccount } from '../../../../../tests/e2e/cloud-account-fake';
import { stubTurnstile } from '../../../../../tests/e2e/turnstile-stub';
import { WATCHER, logIn, openWatch, playing, setUp } from '../../../../../tests/e2e/watch-page';
// @ts-expect-error plain ESM helper
import { seed } from './seed.mjs';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'skel');
const SKY = 'skyHour=19.1&skyMonth=0&skyDay=21&skyYear=3040&skyFreeze';
const NAME = 'fenwick';
const PASSWORD = 'correct horse battery';
fs.mkdirSync(out, { recursive: true });

/** The watch page's frame in each variant: [width, height] (desktop: under the built band of 104 px). */
const FRAME = {
  d: { a: [1440, 796], b: [1040, 796] },
  p: { a: [390, 560] },
} as const;

const sheets: { id: string; css: string }[] = [];
async function collectCss(page: Page): Promise<void> {
  const list = await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => ({ id: s.getAttribute('data-vite-dev-id') || '', css: s.textContent || '' })));
  for (const s of list) if (s.css && !sheets.some((x) => x.id === s.id && x.css === s.css)) sheets.push(s);
}

async function skeleton(page: Page, v: string, name: string, sky: boolean, wait = 2500): Promise<void> {
  await page.waitForTimeout(wait);
  await collectCss(page);
  if (sky) {
    const st = await page.addStyleTag({
      content: '.wc-start > :not(.wc-start-skyhost), .wc-okb-page, .wc-menu-host, .wc-ph-fs, .wc-fs-btn, [class*="fullscreen"] { visibility: hidden !important; }',
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, `${v}-sky.jpg`), type: 'jpeg', quality: 74 });
    await st.evaluate((el) => el.remove());
  }
  const html = await page.evaluate(() => {
    const app = document.getElementById('app')!.cloneNode(true) as HTMLElement;
    for (const h of app.querySelectorAll('.wc-start-skyhost')) h.innerHTML = '';
    for (const c of app.querySelectorAll('canvas, iframe')) c.remove();
    return app.outerHTML;
  });
  fs.writeFileSync(path.join(out, `${v}-${name}.html`), html);
}
const attrs = (page: Page) => page.evaluate(() => Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value])));

const frame = (p: Page) => p.locator('.wc-start .wc-frame:not([hidden])');
const ownerRow = (p: Page) => p.locator('.wc-start .wc-sm-item[data-key="owner"]');
const hist = (p: Page) => frame(p).locator('.wc-hist');

const DAY = 86_400_000;
const PUBS = [
  { title: 'Clearing the ranger camp', id: 'Ab3dE5fG7hJk', views: 37, ago: 0, bytes: 1_240_000, lengthS: 4500, level: 42, character: 'Rasta' },
  { title: 'Gibur and the Witch-king’s lieutenant', id: 'Qm7Rt2Lp9xWz', views: 112, ago: 1, bytes: 2_420_000, lengthS: 14640, level: 41, character: 'Gibur' },
  { title: 'First crossing of the Brandywine', id: 'Hn4Kc8Vb1sYe', views: 5, ago: 5, bytes: 610_000, lengthS: 4680, level: 12, character: 'Gittan' },
  { title: 'Trollshaws hoard run', id: 'Zp6Wd3Fg5uNa', views: 21, ago: 12, bytes: 1_930_000, lengthS: 10260, level: 28, character: 'Rasta' },
];

async function run(page: Page, v: 'd' | 'p', touch: boolean, browser: Browser): Promise<void> {
  page.on('pageerror', (e) => console.log(v, 'page error:', e.message));
  const server = new FakeAccountServer();
  server.flags = { accounts: true, sync: true, runs: true, share: true } as typeof server.flags;
  await seedAccount(server, NAME, PASSWORD, { created: new Date(2026, 8, 30).getTime() });
  const now = Date.now();
  for (const p of PUBS)
    server.addPub(NAME, { id: p.id, title: p.title, character: p.character, level: p.level, lengthS: p.lengthS, views: p.views, bytes: p.bytes, created: now - p.ago * DAY - 3_600_000 });
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  const q = touch ? '&phone=1&kbd=en' : '';
  await page.goto(`/?cloudtest&community=3&${SKY}${q}`);
  await page.mouse.move(1, 1);
  await expect(ownerRow(page)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await skeleton(page, v, 'guest', false, 1500);
  const tap = async (sel: string | ReturnType<Page['locator']>) => {
    const l = typeof sel === 'string' ? page.locator(sel) : sel;
    return touch ? l.tap() : l.click();
  };
  const back = async () => {
    if (touch) await frame(page).locator('.wc-lk-back').first().tap();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
  };

  // Log in: the page reloads into the account's space and syncs.
  await tap('.wc-start .wc-sm-item[data-key="owner"]');
  await frame(page).locator('[data-field="name"] input').fill(NAME);
  await frame(page).locator('[data-field="password"] input').fill(PASSWORD);
  await page.mouse.move(1, 1);
  await frame(page).locator('[data-field="password"] input').press('Enter');
  await expect.poll(async () => (await ownerRow(page).textContent().catch(() => '')) ?? '', { timeout: 30_000 }).toMatch(/fenwick.*synced/i);
  console.log(v, 'url', page.url());
  console.log(v, 'seed', JSON.stringify(await seed(page)));
  // The login's reload drops the query: once more with the counter and the fixed sky.
  await page.goto(`/?cloudtest&community=3&${SKY}${q}`);
  await expect.poll(async () => (await ownerRow(page).textContent().catch(() => '')) ?? '', { timeout: 30_000 }).toMatch(/fenwick.*synced/i);
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'in', true);
  fs.writeFileSync(path.join(out, `${v}-html.json`), JSON.stringify(await attrs(page), null, 1));

  // History (its big box, for the Community page) → the demo's session → Export.
  await tap('.wc-start .wc-sm-item[data-key="history"]');
  await expect(hist(page).locator('.wc-lk-tr').first()).toBeVisible({ timeout: 15_000 });
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'hist', false, 1500);
  const demoRow = hist(page).locator('.wc-lk-tr', { hasText: '2026-09-26' }).first();
  await tap(demoRow);
  await page.waitForTimeout(500);
  await tap(hist(page).locator('.wc-hist-card [data-btn="EXPORT"]'));
  await expect(frame(page).locator('.wc-exp-row').first()).toBeVisible({ timeout: 20_000 });
  await frame(page).locator('.wc-exp-log').evaluate((el) => (el.scrollTop = 520));
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'export', false, 1500);
  await back();
  await back();
  await expect(ownerRow(page)).toBeVisible();

  // The Account page, with its Published runs section.
  await tap('.wc-start .wc-sm-item[data-key="owner"]');
  await expect(frame(page).locator('[data-btn="LOGOUT"]')).toBeVisible({ timeout: 15_000 });
  await expect(frame(page).getByText('Trollshaws hoard run')).toBeVisible({ timeout: 15_000 });
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'account', false, 2000);

  // The HTML replay of the demo session (the dev app's exporter), photographed at the frame's sizes.
  const html = await page.evaluate(async () => {
    const w = window as unknown as {
      __wc: { runs(): Promise<{ listSessions(now: number): Promise<Array<{ id: string; runs: unknown[] }>> }>; replayHtml(o?: unknown): Promise<string> };
    };
    const lib = await w.__wc.runs();
    const s = (await lib.listSessions(Date.now() * 1000)).find((x) => x.runs.length > 1)!;
    return w.__wc.replayHtml({ session: s.id });
  });
  const file = path.join(os.tmpdir(), `wc-r13-replay-${v}.html`);
  fs.writeFileSync(file, html);
  for (const [k, [w, h]] of Object.entries(FRAME[v] as Record<string, readonly [number, number]>)) {
    const ctx = await browser.newContext(touch ? { ...PHONE, viewport: { width: w, height: h } } : { viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.goto(pathToFileURL(file).href);
    await p.waitForFunction(() => {
      const g = window as unknown as { __wcReplay?: { host: { engine: { duration: number } | null } } };
      return !!g.__wcReplay?.host.engine && g.__wcReplay.host.engine.duration > 0;
    });
    await p.evaluate(() => {
      const e = (window as unknown as { __wcReplay: { host: { engine: { duration: number; seek(p: number): void } } } }).__wcReplay.host.engine;
      e.seek(e.duration * 0.42);
    });
    await p.waitForFunction(() => !(window as unknown as { __wcReplay: { host: { engine: { seeking: boolean } } } }).__wcReplay.host.engine.seeking, null, { timeout: 30_000 });
    await p.mouse.move(w / 2, h / 2);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(out, `${v}-replay-${k}.jpg`), type: 'jpeg', quality: 78 });
    await ctx.close();
  }
  fs.rmSync(file, { force: true });
}

/** The built watch page, logged in as another account: its DOM (the frame emptied). */
async function watch(browser: Browser, v: 'd' | 'p', touch: boolean): Promise<void> {
  const base = touch ? { ...PHONE } : { viewport: { width: 1440, height: 900 } };
  const open = async (w: number, h: number) => {
    const ctx = await browser.newContext({ ...base, viewport: { width: w, height: h }, baseURL: 'http://localhost:5471' });
    const page = await ctx.newPage();
    const s = await setUp(page);
    await logIn(page, s, WATCHER);
    await openWatch(page, undefined, touch ? '&phone=1&kbd=en' : '');
    await playing(page);
    await page.waitForTimeout(1200);
    return { ctx, page };
  };
  const first = await open(touch ? 390 : 1440, touch ? 844 : 900);
  await collectCss(first.page);
  const bandH = await first.page.locator('.wc-watch-band').evaluate((el) => el.getBoundingClientRect().height);
  console.log(v, 'band', bandH);
  await skeleton(first.page, v, 'watch', false, 300);
  fs.writeFileSync(path.join(out, `${v}-watch-html.json`), JSON.stringify(await attrs(first.page), null, 1));
  await first.ctx.close();
}

const PHONE = { ...(({ defaultBrowserType: _d, ...rest }) => rest)(devices['iPhone 13']), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };

test.describe.configure({ mode: 'serial' });

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('capture', async ({ page, browser }) => {
    test.setTimeout(300_000);
    await run(page, 'd', false, browser);
    await watch(browser, 'd', false);
    await page.goto(`/?${SKY}&kit=controls`);
    await page.waitForSelector('.wc-kitc-icons');
    await page.waitForTimeout(1500);
    await collectCss(page);
    const icons = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wc-kitc-icons li[data-icon]')].map((li) => [(li as HTMLElement).dataset.icon, li.querySelector('svg')!.outerHTML])));
    fs.writeFileSync(path.join(out, 'icons.json'), JSON.stringify({ icons }, null, 1));
  });
});

test.describe('phone', () => {
  test.use(PHONE);
  test('capture', async ({ page, browser }) => {
    test.setTimeout(300_000);
    await run(page, 'p', true, browser);
    await watch(browser, 'p', true);
  });
});

test.afterAll(() => {
  for (const s of sheets) s.id = s.id.replace(/^.*\/(src\/)/, '$1');
  const file = path.join(out, 'css.json');
  fs.writeFileSync(file, JSON.stringify(sheets));
  console.log(sheets.map((s) => `${s.id} ${s.css.length}`).join('\n'));
});
