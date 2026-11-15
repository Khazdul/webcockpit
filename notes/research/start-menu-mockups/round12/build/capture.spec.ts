// Captures the real look from a running dev server into build/skel/ (stage 64,
// round 12), after round 11's. A Playwright "spec" only so that it can use the
// e2e fake of the account API (tests/e2e/cloud-account-fake.ts) with the flags
// `accounts`, `sync`, `runs` and `share` on. Logged in as `fenwick`, with
// invented runs and the e2e demo backup restored into the account's space
// (seed.mjs): the start menu, History's export editor on the demo's two-run
// session, the Account page; and the HTML replay of that session (built by the
// dev app's `__wc.replayHtml`) opened as a file and photographed at the watch
// page's frame sizes. Throwaway tooling for the mockups only.
//
//   WC_E2E_PORT=5461 npx vite --port 5461 --strictPort      (never 5173)
//   npx playwright test -c notes/research/start-menu-mockups/round12/build/pw.config.ts
//
// Writes, per view (d = desktop 1440 × 900, p = phone 390 × 844):
//   <v>-html.json    the <html> element's attributes (the theme)
//   <v>-<page>.html  `#app` with the sky emptied; page = in, export, account
//   <v>-sky.jpg      the sky alone (a fixed dusk)
//   <v>-replay-<a|b>.jpg  the replay playing, at the frame's size in variant a / b
// and css.json (every stylesheet seen), icons.json (the kit's icons).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Browser, type Page, devices, expect, test } from '@playwright/test';
import { FakeAccountServer, fakeAccountApi, seedAccount } from '../../../../../tests/e2e/cloud-account-fake';
import { stubTurnstile } from '../../../../../tests/e2e/turnstile-stub';
// @ts-expect-error plain ESM helper
import { seed } from './seed.mjs';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'skel');
const SKY = 'skyHour=19.1&skyMonth=0&skyDay=21&skyYear=3040&skyFreeze';
const NAME = 'fenwick';
const PASSWORD = 'correct horse battery';
fs.mkdirSync(out, { recursive: true });

/** The watch page's frame sizes (states.js / mock.css draw the page around them). */
const FRAME = {
  d: { a: [1440, 796], b: [1440, 822] },
  p: { a: [390, 676], b: [390, 640] },
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
    for (const c of app.querySelectorAll('canvas')) c.remove();
    return app.outerHTML;
  });
  fs.writeFileSync(path.join(out, `${v}-${name}.html`), html);
}

const frame = (p: Page) => p.locator('.wc-start .wc-frame:not([hidden])');
const ownerRow = (p: Page) => p.locator('.wc-start .wc-sm-item[data-key="owner"]');
const hist = (p: Page) => frame(p).locator('.wc-hist');

async function run(page: Page, v: 'd' | 'p', touch: boolean, browser: Browser): Promise<void> {
  page.on('pageerror', (e) => console.log(v, 'page error:', e.message));
  const server = new FakeAccountServer();
  server.flags = { accounts: true, sync: true, runs: true, share: true } as typeof server.flags;
  await seedAccount(server, NAME, PASSWORD, { created: new Date(2026, 8, 30).getTime() });
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  const q = touch ? '&phone=1&kbd=en' : '';
  await page.goto(`/?cloudtest&${SKY}${q}`);
  await page.mouse.move(1, 1);
  await expect(ownerRow(page)).toBeVisible({ timeout: 15_000 });
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
  console.log(v, 'seed', JSON.stringify(await seed(page)));
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'in', true);
  fs.writeFileSync(path.join(out, `${v}-html.json`), JSON.stringify(await page.evaluate(() => Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value]))), null, 1));

  // History → the demo's two-run session (2026-09-26) → Export.
  await tap('.wc-start .wc-sm-item[data-key="history"]');
  await expect(hist(page).locator('.wc-lk-tr').first()).toBeVisible({ timeout: 15_000 });
  const demoRow = hist(page).locator('.wc-lk-tr', { hasText: '2026-09-26' }).first();
  await tap(demoRow);
  await page.waitForTimeout(500);
  await tap(hist(page).locator('.wc-hist-card [data-btn="EXPORT"]'));
  await expect(frame(page).locator('.wc-exp-row').first()).toBeVisible({ timeout: 20_000 });
  // A little into the log, past the login lines.
  await frame(page).locator('.wc-exp-log').evaluate((el) => (el.scrollTop = 520));
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'export', false, 1500);
  await back();
  await back();
  await expect(ownerRow(page)).toBeVisible();

  // The Account page.
  await tap('.wc-start .wc-sm-item[data-key="owner"]');
  await expect(frame(page).locator('[data-btn="LOGOUT"]')).toBeVisible({ timeout: 15_000 });
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'account', false, 2000);

  // The HTML replay of the demo session, photographed at the frame's sizes.
  const html = await page.evaluate(async () => {
    const w = window as unknown as {
      __wc: { runs(): Promise<{ listSessions(now: number): Promise<Array<{ id: string; runs: unknown[] }>> }>; replayHtml(o?: unknown): Promise<string> };
    };
    const lib = await w.__wc.runs();
    const s = (await lib.listSessions(Date.now() * 1000)).find((x) => x.runs.length > 1)!;
    return w.__wc.replayHtml({ session: s.id });
  });
  const file = path.join(os.tmpdir(), `wc-r12-replay-${v}.html`);
  fs.writeFileSync(file, html);
  for (const k of ['a', 'b'] as const) {
    const [w, h] = FRAME[v][k];
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
    await p.screenshot({ path: path.join(out, `${v}-replay-${k}.jpg`), type: 'jpeg', quality: 80 });
    await ctx.close();
  }
  fs.rmSync(file, { force: true });
}

const PHONE = { ...(({ defaultBrowserType: _d, ...rest }) => rest)(devices['iPhone 13']), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };

test.describe.configure({ mode: 'serial' });

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('capture', async ({ page, browser }) => {
    test.setTimeout(300_000);
    await run(page, 'd', false, browser);
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
  });
});

test.afterAll(() => {
  for (const s of sheets) s.id = s.id.replace(/^.*\/(src\/)/, '$1');
  const file = path.join(out, 'css.json');
  const old: { id: string; css: string }[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  for (const s of sheets) if (!old.some((x) => x.id === s.id && x.css === s.css)) old.push(s);
  fs.writeFileSync(file, JSON.stringify(old));
  console.log(old.map((s) => `${s.id} ${s.css.length}`).join('\n'));
});
