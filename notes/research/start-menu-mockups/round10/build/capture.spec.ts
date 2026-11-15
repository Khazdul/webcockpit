// Captures the real look from a running dev server into build/skel/ (stage 62,
// round 10), after round 9's. A Playwright "spec" only so that it can use the
// e2e fake of the account API (tests/e2e/cloud-account-fake.ts) with the flags
// `accounts` and `sync` on: the start menu logged in (the account's space,
// synced), the built Account page with its sync section, and the built Log out
// dialog in its two forms. Throwaway tooling for the mockups only.
//
//   npx vite --port 5431 --strictPort      (never 5173)
//   npx playwright test -c notes/research/start-menu-mockups/round10/build/pw.config.ts
//
// Writes, per view (d = desktop 1440 × 900, p = phone 390 × 844):
//   <v>-html.json    the <html> element's attributes (the theme)
//   <v>-<page>.html  `#app` with the sky emptied; page = in (the start menu,
//                    logged in), account, logout (all in the account),
//                    logoutsome (something not synced: the server offline)
//   <v>-sky.jpg      the sky alone (a fixed dusk)
// and css.json (every stylesheet seen), icons.json (the kit's icons).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, devices, expect, test } from '@playwright/test';
import { FakeAccountServer, fakeAccountApi, seedAccount } from '../../../../../tests/e2e/cloud-account-fake';
import { stubTurnstile } from '../../../../../tests/e2e/turnstile-stub';
import { putIdb, spaceDbOf, profile } from '../../../../../tests/e2e/sync-pages';

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

async function run(page: Page, v: 'd' | 'p', touch: boolean): Promise<void> {
  page.on('pageerror', (e) => console.log(v, 'page error:', e.message));
  const server = new FakeAccountServer();
  server.flags = { accounts: true, sync: true };
  await seedAccount(server, NAME, PASSWORD, { created: new Date(2026, 8, 30).getTime() });
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  const q = touch ? '&phone=1&kbd=en' : '';
  await page.goto(`/?cloudtest&${SKY}${q}`);
  await page.mouse.move(1, 1);
  await expect(ownerRow(page)).toBeVisible({ timeout: 15_000 });
  const tap = async (sel: string) => (touch ? page.locator(sel).tap() : page.locator(sel).click());

  // Log in: the page reloads into the account's space and syncs.
  await tap('.wc-start .wc-sm-item[data-key="owner"]');
  await frame(page).locator('[data-field="name"] input').fill(NAME);
  await frame(page).locator('[data-field="password"] input').fill(PASSWORD);
  await page.mouse.move(1, 1);
  await frame(page).locator('[data-field="password"] input').press('Enter');
  await expect.poll(async () => (await ownerRow(page).textContent().catch(() => '')) ?? '', { timeout: 30_000 }).toMatch(/ole.*synced/i);
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'in', true);
  fs.writeFileSync(path.join(out, `${v}-html.json`), JSON.stringify(await page.evaluate(() => Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value]))), null, 1));

  // The Account page, synced.
  await tap('.wc-start .wc-sm-item[data-key="owner"]');
  await expect(frame(page).locator('[data-sync="synced"]')).toBeVisible({ timeout: 15_000 });
  await skeleton(page, v, 'account', false);

  // Log out, everything in the account.
  await frame(page).locator('[data-btn="LOGOUT"]').click();
  await expect(frame(page).locator('[data-dlg="ac-logout"] [data-logout="all"]')).toBeVisible({ timeout: 15_000 });
  await skeleton(page, v, 'logout', false, 1200);
  await frame(page).locator('[data-btn="CANCEL"]').click();
  await frame(page).locator('[data-page="account"]').waitFor();

  // Log out with a change the server could not take.
  server.syncOffline = true;
  await putIdb(page, spaceDbOf(NAME), 'profiles', [profile('w1', 'warrior')]);
  await page.waitForTimeout(400);
  await frame(page).locator('[data-btn="LOGOUT"]').click();
  await expect(frame(page).locator('[data-dlg="ac-logout"] [data-logout="some"]')).toBeVisible({ timeout: 30_000 });
  await skeleton(page, v, 'logoutsome', false, 1200);
}

test.describe.configure({ mode: 'serial' });

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('capture', async ({ page }) => {
    test.setTimeout(150_000);
    await run(page, 'd', false);
    await page.goto(`/?${SKY}&kit=controls`);
    await page.waitForSelector('.wc-kitc-icons');
    await page.waitForTimeout(1500);
    await collectCss(page);
    const icons = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wc-kitc-icons li[data-icon]')].map((li) => [(li as HTMLElement).dataset.icon, li.querySelector('svg')!.outerHTML])));
    fs.writeFileSync(path.join(out, 'icons.json'), JSON.stringify({ icons }, null, 1));
  });
});

test.describe('phone', () => {
  test.use({ ...(({ defaultBrowserType: _d, ...rest }) => rest)(devices['iPhone 13']), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  test('capture', async ({ page }) => {
    test.setTimeout(150_000);
    await run(page, 'p', true);
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
