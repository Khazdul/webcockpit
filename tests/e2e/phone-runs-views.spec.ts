// Stage 63 C2 (ADR 0153; round 11's picks) on a phone: History's tags in
// the two-line rows and the card under the row, offline, the "does not
// fit" dialog over History, Log out's runs row, the delete warning, and
// the counts of Spotlights and Diary without Fetch all (a phone never
// fetches a library by itself). A guest's views as before. The desktop:
// runs-views.spec.ts. `phone` project (Pixel 7). `WC_C2_SHOTS=<dir>`
// saves a picture of each picked state there (390 px wide).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, type BrowserContext, type Page, devices, expect, test } from '@playwright/test';
import { NAME, PASSWORD, btn, dialog, watchErrors } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { accountRow } from './account-pages';
import { getIdb, logIn, spaceDbOf } from './sync-pages';
import { stubTurnstile } from './turnstile-stub';
import { DEMO_NOW } from './demo-clock';

test.setTimeout(180_000);

const DB = spaceDbOf(NAME);
const SHOTS = process.env.WC_C2_SHOTS;

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, `${name}.phone.jpg`), type: 'jpeg', quality: 80, scale: 'css' });
}

async function phone(browser: Browser, server: FakeAccountServer): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
  await ctx.clock.setSystemTime(DEMO_NOW);
  const page = await ctx.newPage();
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  return { ctx, page };
}

function runsServer(): FakeAccountServer {
  const server = new FakeAccountServer();
  server.flags = { accounts: true, sync: true, runs: true };
  return server;
}

async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

const top = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const hist = (page: Page) => top(page).locator('.wc-hist');
const rows = (page: Page) => hist(page).locator('.wc-lk-tr');
const card = (page: Page) => hist(page).locator('.wc-hist-card');
const cbtn = (page: Page, id: string) => card(page).locator(`[data-btn="${id}"]`);
const tags = (page: Page) => hist(page).locator('.wc-rc-tag');
const fit = (page: Page) => top(page).locator('[data-dlg="run-full"]');
const count = (page: Page) => top(page).locator('.wc-rc-count');
const states = async (page: Page): Promise<string[]> => (await getIdb(page, DB, 'runCloud')).map((r) => r.state as string).sort();

async function openHistory(page: Page, n: number): Promise<void> {
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').tap();
  await expect(hist(page)).toBeVisible();
  await expect(rows(page)).toHaveCount(n);
}

/** History's tab strip (the phone has no number keys). */
const tab = (page: Page, name: 'Sessions' | 'Spotlights' | 'Diary') => top(page).locator('.wc-htab', { hasText: name });

test('phone: tags in the rows, the card, offline, the delete warning; the counts without Fetch all', async ({ browser }) => {
  const server = runsServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await phone(browser, server);
  const errors = watchErrors(a.page);
  await logIn(a.page);
  await restoreDemo(a.page);
  await openHistory(a.page, 3);
  // Save the newest Gittan session (the chosen first row): with Rasta's two, three runs go up.
  await cbtn(a.page, 'SAVE').tap();
  const model = server.items(NAME);
  await expect.poll(() => model.bodies.size, { timeout: 20_000 }).toBe(3);
  await expect.poll(() => model.all().filter((i) => i.kind === 'run' && !i.deleted).length, { timeout: 20_000 }).toBe(3);
  await expect(tags(a.page)).toHaveCount(0);

  const b = await phone(browser, server);
  errors.push(...watchErrors(b.page));
  const page = b.page;
  await logIn(page);
  await expect.poll(() => states(page), { timeout: 20_000 }).toEqual(['remote', 'remote', 'remote']);
  await openHistory(page, 2);
  // The tag ends the row's first line, before Expires.
  await expect(tags(page)).toHaveCount(2);
  await expect(tags(page).first()).toHaveText(/^in the cloud · \d+ KB$/);
  const r0 = await rows(page).nth(0).locator('.wc-rc-tag').boundingBox();
  const exp0 = await rows(page).nth(0).locator('.wc-hist-exp').boundingBox();
  expect(Math.abs(r0!.y + r0!.height - (exp0!.y + exp0!.height))).toBeLessThan(6);
  expect(r0!.x + r0!.width).toBeLessThan(exp0!.x);
  await expect(card(page).locator('[data-note="remote"]')).toHaveText(/^In the cloud · \d+ KB$/);
  await expect(hist(page).locator('.wc-hist-storage')).toHaveText(/^This device .+ · Cloud 0 of 50 MB$/);
  await shot(page, 'hist-b-cloud');

  await cbtn(page, 'DELETE').tap();
  const del = top(page).locator('[data-dlg="delete"]');
  await expect(del.locator('.wc-hd-warn')).toHaveText('Delete this session? It is deleted on all your devices and in the cloud.');
  await shot(page, 'delete-cloud');
  await del.locator('[data-btn="CANCEL"]').tap();
  await expect(del).toHaveCount(0);

  await b.ctx.setOffline(true);
  await expect(tags(page).first()).toHaveText('in the cloud · offline');
  await expect(card(page).locator('.wc-rc-logsub')).toHaveText('Needs the network to open');
  await expect(cbtn(page, 'RUN LOG')).toHaveAttribute('aria-disabled', 'true');
  await expect(hist(page).locator('.wc-lk-flash')).toHaveText('Offline: sessions in the cloud cannot be opened.');
  await shot(page, 'hist-b-offline');
  await b.ctx.setOffline(false);
  await expect(tags(page).first()).toHaveText(/^in the cloud · \d+ KB$/);

  // The counts: the line, no Fetch all.
  await tab(page, 'Diary').tap();
  await expect(count(page)).toHaveText('2 sessions in the cloud are not counted');
  await expect(count(page).locator('[data-btn="FETCHALL"]')).toHaveCount(0);
  await tab(page, 'Spotlights').tap();
  await expect(count(page)).toHaveText('2 sessions in the cloud are not counted');
  await expect(count(page).locator('[data-btn="FETCHALL"]')).toHaveCount(0);
  await shot(page, 'count-phone');
  // Nothing was fetched by itself.
  expect(await states(page)).toEqual(['remote', 'remote', 'remote']);
  // Run log on the chosen session: stage 24's bar in the card, then the player.
  await page.route('**/api/u/runs/**', async (route) => {
    if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 1500));
    await route.fallback();
  });
  await tab(page, 'Sessions').tap();
  await expect(hist(page)).toBeVisible();
  await cbtn(page, 'RUN LOG').tap();
  await expect(card(page).locator('.wc-lk-load-l')).toHaveText(/^Fetching from the cloud…( [\d.]+ of [\d.]+ [KM]B)?$/);
  await shot(page, 'hist-b-fetch');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-rl-box .wc-rl-slot > .wc-player')).toHaveCount(1, { timeout: 20_000 });
  expect(errors).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});

test('phone: "does not fit" over History, Download the run and Keep; Log out’s runs row', async ({ browser }) => {
  const server = runsServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await phone(browser, server);
  const errors = watchErrors(a.page);
  const page = a.page;
  await logIn(page);
  server.items(NAME).limits.runBytes = 64;
  await restoreDemo(page);
  await openHistory(page, 3);
  await cbtn(page, 'SAVE').tap();
  for (let i = 0; i < 2; i++) {
    await expect(fit(page)).toBeVisible({ timeout: 20_000 });
    await expect(fit(page).locator('[data-btn]')).toHaveText(['Download the run', 'Keep on this device']);
    if (i === 0) await shot(page, 'fit-a-history');
    const line = await fit(page).locator('.wc-rf-run').textContent();
    await fit(page).locator('[data-btn="KEEP"]').tap();
    if (i === 0) await expect(fit(page).locator('.wc-rf-run')).not.toHaveText(line!, { timeout: 10_000 }).catch(() => {});
  }
  await expect(fit(page)).toHaveCount(0);
  await expect(tags(page)).toHaveCount(2);
  await expect(tags(page).first()).toHaveText('not in the cloud');
  await expect(card(page).locator('[data-note="local"]')).toHaveText('not in the cloud: the cloud is full');
  await shot(page, 'hist-b-list');

  // Log out: back to the menu, the Account page, Log out.
  await top(page).locator('.wc-lk-back').first().tap();
  await expect(page.locator('.wc-start .wc-sm-item[data-key="history"]')).toBeVisible();
  await accountRow(page).tap();
  await btn(page, 'LOGOUT').tap();
  const row = dialog(page, 'ac-logout').locator('[data-row="saved"]');
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('3 saved runs not in the cloud');
  await expect(row.locator('[data-why]')).toHaveText('3 cloud full');
  await shot(page, 'logout-a');
  if (SHOTS) {
    // The start page's dialog with the mockup's numbers (an event of the page's own module).
    await page.keyboard.press('Escape');
    await top(page).locator('.wc-lk-back').first().tap();
    await expect(page.locator('.wc-start .wc-sm-item[data-key="history"]')).toBeVisible();
    const id = (await getIdb(page, DB, 'runs')).find((r) => r.saved)!.runId as string;
    await page.evaluate(async (runId) => {
      const m = await import('/src/cloud/runs-view.ts' as string);
      m.emitDoesNotFit({ runId, sessionId: `${runId}#shot`, used: 49 * 1024 * 1024, limit: 50 * 1024 * 1024, size: 2.1 * 1024 * 1024, reason: 'quota', where: 'start' });
    }, id);
    await expect(fit(page)).toBeVisible();
    await shot(page, 'fit-a-start');
  }
  expect(errors).toEqual([]);
  await a.ctx.close();
});

test('phone: a guest’s History, Spotlights and Diary as before', async ({ browser }) => {
  const server = runsServer();
  const a = await phone(browser, server);
  const errors = watchErrors(a.page);
  await a.page.goto('/');
  await restoreDemo(a.page);
  await openHistory(a.page, 3);
  await expect(tags(a.page)).toHaveCount(0);
  await expect(hist(a.page).locator('.wc-hist-storage')).toHaveText(/^Storage: /);
  await tab(a.page, 'Spotlights').tap();
  await expect(top(a.page).locator('.wc-spw-foot')).toBeVisible();
  await expect(count(a.page)).toHaveCount(0);
  await tab(a.page, 'Diary').tap();
  await expect(top(a.page).locator('.wc-cred-foot')).toBeVisible();
  await expect(count(a.page)).toHaveCount(0);
  expect(errors).toEqual([]);
  await a.ctx.close();
});
