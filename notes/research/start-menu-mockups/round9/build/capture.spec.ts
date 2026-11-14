// Captures the real look from a running dev server into build/skel/ (stage 61,
// round 9), after round 8's capture.mjs. A Playwright "spec" only so that it
// can use the e2e fake of the account API (tests/e2e/cloud-account-fake.ts)
// to show the start page with accounts on, the Account page and its dialogs.
// Throwaway tooling for the mockups only.
//
//   npx vite --port 5394 --strictPort      (never 5173)
//   npx playwright test -c notes/research/start-menu-mockups/round9/build/pw.config.ts
//
// Writes, per view (d = desktop 1440 × 900, p = phone 390 × 844):
//   <v>-html.json    the <html> element's attributes (the theme)
//   <v>-<page>.html  `#app` with the sky emptied; page = main (guest), in
//                    (logged in), account, logout, delete, profiles
//   <v>-sky.jpg      the sky alone (a fixed dusk)
// and css.json (every stylesheet seen), icons.json (the kit's icons), owner.json
// (the gallery's owner rows by state, the built DOM of each).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, devices, expect, test } from '@playwright/test';
import { FakeAccountServer, fakeAccountApi, seedAccount } from '../../../../../tests/e2e/cloud-account-fake';
import { stubTurnstile } from '../../../../../tests/e2e/turnstile-stub';

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

async function run(page: Page, v: 'd' | 'p', touch: boolean): Promise<void> {
  page.on('pageerror', (e) => console.log(v, 'page error:', e.message));
  const server = new FakeAccountServer();
  await seedAccount(server, NAME, PASSWORD, { created: new Date(2026, 8, 30).getTime() });
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  const q = touch ? '&phone=1&kbd=en' : '';
  await page.goto(`/?cloudtest&${SKY}${q}`);
  await page.locator('.wc-start .wc-sm-item[data-key="owner"]').waitFor();
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'main', true);
  fs.writeFileSync(path.join(out, `${v}-html.json`), JSON.stringify(await page.evaluate(() => Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value]))), null, 1));

  // Profiles (the device's own, the seeds).
  const tap = async (sel: string) => (touch ? page.locator(sel).tap() : page.locator(sel).click());
  await tap('.wc-start .wc-sm-item[data-key="profile"]');
  await frame(page).locator('.wc-pl-row').first().waitFor();
  await skeleton(page, v, 'profiles', false);
  if (touch) await frame(page).locator('.wc-lk-back').first().tap();
  else await page.keyboard.press('Escape');
  await page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm-item').first().waitFor();
  await page.waitForTimeout(900);

  // Log in, to the Account page.
  await page.mouse.move(1, 1);
  await tap('.wc-start .wc-sm-item[data-key="owner"]');
  await frame(page).locator('[data-field="name"] input').fill(NAME);
  await frame(page).locator('[data-field="password"] input').fill(PASSWORD);
  await frame(page).locator('[data-btn="LOGIN"]').click();
  await expect(frame(page).locator('[data-page="account"]')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-head-since')).toContainText('Account since');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
  // (Esc on a phone: the page's own Back.)
  if (await frame(page).locator('[data-page="account"]').isVisible()) await frame(page).locator('.wc-lk-back').first().click();
  await page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm-item').first().waitFor();
  await page.mouse.move(1, 1);
  await skeleton(page, v, 'in', false);
  await tap('.wc-start .wc-sm-item[data-key="owner"]');
  await expect(frame(page).locator('.wc-ac-head-since')).toContainText('Account since');
  await skeleton(page, v, 'account', false);
  await frame(page).locator('[data-btn="LOGOUT"]').click();
  await frame(page).locator('[data-dlg="ac-logout"]').waitFor();
  await skeleton(page, v, 'logout', false, 1500);
  await frame(page).locator('[data-btn="CANCEL"]').click();
  await frame(page).locator('[data-page="account"]').waitFor();
  await page.waitForTimeout(600);
  await frame(page).locator('[data-btn="DELETE"]').click();
  await frame(page).locator('[data-dlg="ac-delete"]').waitFor();
  await skeleton(page, v, 'delete', false, 1500);
}

test.describe.configure({ mode: 'serial' });

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('capture', async ({ page }) => {
    test.setTimeout(120_000);
    await run(page, 'd', false);
    // The kit gallery: the icons by name; the owner rows by state.
    await page.goto(`/?${SKY}&kit=controls`);
    await page.waitForSelector('.wc-kitc-icons');
    await page.waitForTimeout(1500);
    await collectCss(page);
    const icons = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wc-kitc-icons li[data-icon]')].map((li) => [(li as HTMLElement).dataset.icon, li.querySelector('svg')!.outerHTML])));
    fs.writeFileSync(path.join(out, 'icons.json'), JSON.stringify({ icons }, null, 1));
    await page.goto(`/?${SKY}&kit=menu`);
    await page.waitForTimeout(2500);
    await collectCss(page);
    const owner = await page.evaluate(() => [...document.querySelectorAll('.wc-sm-item[data-key="owner"]')].map((li) => li.outerHTML));
    fs.writeFileSync(path.join(out, 'owner.json'), JSON.stringify(owner, null, 1));
  });
});

test.describe('phone', () => {
  test.use({ ...(({ defaultBrowserType: _d, ...rest }) => rest)(devices['iPhone 13']), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  test('capture', async ({ page }) => {
    test.setTimeout(120_000);
    await run(page, 'p', true);
  });
});

test.afterAll(() => {
  for (const s of sheets) s.id = s.id.replace(/^.*\/(src\/)/, '$1');
  const file = path.join(out, 'css.json');
  // Both tests add to the same file (they run in one worker, in turn).
  const old: { id: string; css: string }[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  for (const s of sheets) if (!old.some((x) => x.id === s.id && x.css === s.css)) old.push(s);
  fs.writeFileSync(file, JSON.stringify(old));
  console.log(old.map((s) => `${s.id} ${s.css.length}`).join('\n'));
});
