// Captures the real look from a running dev server into build/skel/ (stage 63,
// round 11), after round 10's. A Playwright "spec" only so that it can use the
// e2e fake of the account API (tests/e2e/cloud-account-fake.ts) with the flags
// `accounts`, `sync` and `runs` on. Logged in as `ole`, with invented runs
// restored into the account's space (seed.mjs): the start menu, History
// (Sessions, a session's Stats, Spotlights, Diary), History's Delete dialog,
// the Account page's Log out dialog with the device's runs; and, in a page of
// its own (a guest, a mocked game), the Exit popup (desktop) and the phone's
// exit sheet over the game. Throwaway tooling for the mockups only.
//
//   WC_E2E_PORT=5441 npx vite --port 5441 --strictPort      (never 5173)
//   npx playwright test -c notes/research/start-menu-mockups/round11/build/pw.config.ts
//
// Writes, per view (d = desktop 1440 × 900, p = phone 390 × 844):
//   <v>-html.json    the <html> element's attributes (the theme)
//   <v>-<page>.html  `#app` with the sky emptied; page = in, history, delete,
//                    stats, spot, diary, logout
//   <v>-sky.jpg      the sky alone (a fixed dusk)
//   <v>-game.jpg     the game with the Exit popup / exit sheet hidden
//   <v>-exit.json    the popup's (sheet host's) outerHTML, its box and its
//                    ancestors' classes, the game's <html> attributes
// and css.json (every stylesheet seen), icons.json (the kit's icons).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, type WebSocketRoute, devices, expect, test } from '@playwright/test';
import { FakeAccountServer, fakeAccountApi, seedAccount } from '../../../../../tests/e2e/cloud-account-fake';
import { stubTurnstile } from '../../../../../tests/e2e/turnstile-stub';
// @ts-expect-error plain ESM helper
import { seed } from './seed.mjs';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'skel');
const SKY = 'skyHour=19.1&skyMonth=0&skyDay=21&skyYear=3040&skyFreeze';
const NAME = 'ole';
const PASSWORD = 'correct horse battery';
fs.mkdirSync(out, { recursive: true });

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

async function run(page: Page, v: 'd' | 'p', touch: boolean): Promise<void> {
  page.on('pageerror', (e) => console.log(v, 'page error:', e.message));
  const server = new FakeAccountServer();
  server.flags = { accounts: true, sync: true, runs: true };
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
  await expect.poll(async () => (await ownerRow(page).textContent().catch(() => '')) ?? '', { timeout: 30_000 }).toMatch(/ole.*synced/i);
  console.log(v, 'seed', JSON.stringify(await seed(page)));
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'in', true);
  fs.writeFileSync(path.join(out, `${v}-html.json`), JSON.stringify(await page.evaluate(() => Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value]))), null, 1));

  // History: Sessions, the first (newest) session chosen.
  await tap('.wc-start .wc-sm-item[data-key="history"]');
  await expect(hist(page).locator('.wc-lk-tr').first()).toBeVisible({ timeout: 15_000 });
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'history', false);

  // Delete, over History.
  await tap(hist(page).locator('.wc-hist-card [data-btn="DELETE"]'));
  await expect(page.locator('.wc-lk-dialog[data-dlg="delete"]')).toBeVisible();
  await skeleton(page, v, 'delete', false, 1200);
  await tap(page.locator('.wc-lk-dialog[data-dlg="delete"] [data-btn="CANCEL"]'));
  await page.waitForTimeout(600);

  // The session's Stats.
  await tap(hist(page).locator('.wc-hist-card [data-btn="STATS"]'));
  await expect(frame(page).locator('.wc-hs-sec').first()).toBeVisible({ timeout: 15_000 });
  await skeleton(page, v, 'stats', false);
  await back();

  // Spotlights and Diary.
  await tap(frame(page).locator('.wc-htab[data-tab="spotlights"]'));
  await page.waitForSelector('.wc-start .wc-frame:not([hidden]) .wc-spw-card', { timeout: 20_000 }).catch(() => console.log(v, 'no spotlight cards'));
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'spot', false, 3000);
  await tap(frame(page).locator('.wc-htab[data-tab="diary"]'));
  await page.waitForSelector('.wc-start .wc-frame:not([hidden]) .wc-cred-book[data-ready="true"]', { timeout: 20_000 }).catch(() => console.log(v, 'no diary'));
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'diary', false, 3000);
  await back();
  await expect(ownerRow(page)).toBeVisible();

  // The Account page → Log out, with the device's runs.
  await tap('.wc-start .wc-sm-item[data-key="owner"]');
  await expect(frame(page).locator('[data-btn="LOGOUT"]')).toBeVisible({ timeout: 15_000 });
  await frame(page).locator('[data-btn="LOGOUT"]').click();
  await expect(frame(page).locator('[data-dlg="ac-logout"] [data-logout="some"]')).toBeVisible({ timeout: 30_000 });
  await skeleton(page, v, 'logout', false, 1200);
}

const IAC = 255, WILL = 251, SB = 250, SE = 240, GMCP = 201;
const gmcp = (payload: string): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(payload, 'utf8'), Buffer.from([IAC, SE])]);
const TEXT = [
  'The Old Forest Road',
  'The road runs east and west between dark firs. To the north the trees',
  'thin out toward the river; far to the east the Misty Mountains rise.',
  'Exits: east, west.',
  '',
  'An orc scout arrives from the east.',
  'You slash an orc scout extremely hard.',
  'An orc scout tries to stab you, but misses.',
  'You pierce an orc scout very hard.',
  'An orc scout is dead! R.I.P.',
  'You receive your share of experience.',
  '',
];

/** A guest in a mocked game, the Exit popup (desktop) or exit sheet (phone) open: the game as a picture, the popup as DOM. */
async function game(page: Page, v: 'd' | 'p', touch: boolean): Promise<void> {
  page.on('pageerror', (e) => console.log(v, 'game page error:', e.message));
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto(`/?${SKY}${touch ? '&phone=1&kbd=en' : ''}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  if (touch) await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  else await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  server!.send(gmcp('Char.Name {"name":"Gibur","fullname":"Gibur the Bold"}'));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  server!.send(gmcp('Char.Vitals {"hp":182,"maxhp":200,"mana":40,"maxmana":60,"mp":118,"maxmp":140,"xp":5770000,"tp":41500}'));
  server!.send(Buffer.from(TEXT.join('\r\n') + '\r\n'));
  server!.send(gmcp('Char.Vitals {"xp":5860000}'));
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  let sel: string;
  if (touch) {
    await page.locator('.wc-ph-menu').tap();
    await page.locator('.wc-ph-sheet [data-row="exit"]').tap();
    await expect(page.locator('.wc-ph-exitsheet')).toBeVisible();
    await page.locator('.wc-ph-exitsheet').getByRole('button', { name: '4 stars' }).tap();
    sel = '.wc-ph-menu-host';
  } else {
    await page.locator('.wc-mb[data-mb="exit"]').click();
    await expect(page.locator('.wc-pop-exit')).toBeFocused();
    await page.keyboard.press('4');
    sel = '.wc-pop-exit';
  }
  await page.mouse.move(700, 300);
  await page.waitForTimeout(800);
  await collectCss(page);
  const info = await page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLElement;
    const r = el.getBoundingClientRect();
    const chain: { tag: string; attrs: Record<string, string> }[] = [];
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) chain.unshift({ tag: p.tagName.toLowerCase(), attrs: Object.fromEntries([...p.attributes].filter((a) => a.name !== 'id').map((a) => [a.name, a.value])) });
    const attrs = Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value]));
    const bodyCls = document.body.className;
    return { html: el.outerHTML, box: { x: r.x, y: r.y, w: r.width, h: r.height }, chain, attrs, bodyCls, vw: innerWidth, vh: innerHeight };
  }, sel);
  fs.writeFileSync(path.join(out, `${v}-exit.json`), JSON.stringify(info, null, 1));
  const st = await page.addStyleTag({ content: `${sel} { visibility: hidden !important; }` });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, `${v}-game.jpg`), type: 'jpeg', quality: 76 });
  await st.evaluate((el) => el.remove());
}

test.describe.configure({ mode: 'serial' });

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('capture', async ({ page }) => {
    test.setTimeout(240_000);
    await run(page, 'd', false);
    await page.goto(`/?${SKY}&kit=controls`);
    await page.waitForSelector('.wc-kitc-icons');
    await page.waitForTimeout(1500);
    await collectCss(page);
    const icons = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wc-kitc-icons li[data-icon]')].map((li) => [(li as HTMLElement).dataset.icon, li.querySelector('svg')!.outerHTML])));
    fs.writeFileSync(path.join(out, 'icons.json'), JSON.stringify({ icons }, null, 1));
  });
  test('game', async ({ page }) => {
    test.setTimeout(120_000);
    await game(page, 'd', false);
  });
});

const PHONE = { ...(({ defaultBrowserType: _d, ...rest }) => rest)(devices['iPhone 13']), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
test.describe('phone', () => {
  test.use(PHONE);
  test('capture', async ({ page }) => {
    test.setTimeout(240_000);
    await run(page, 'p', true);
  });
  test('game', async ({ page }) => {
    test.setTimeout(120_000);
    await game(page, 'p', true);
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
