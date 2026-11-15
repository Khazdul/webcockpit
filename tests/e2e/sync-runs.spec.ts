// Stage 63 C1 (ADR 0153): runs in the cloud in the browser, against the
// e2e fake of the account API with its run endpoints (the in-memory model
// of tests/unit/cloud-sync-model.ts per account, the flags `accounts`,
// `sync` and `runs` on). Two pages in two browser contexts on one fake
// server are two devices of one account. The views (History's marks, the
// "does not fit" dialog, Log out's words) are stage 63 C2's
// (runs-views.spec.ts): here the flows are seen in the stores, the server
// and src/cloud/runs-view.ts.

import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test';
import { NAME, PASSWORD, btn, dialog, field, fillCreate, frame, link, openAccount, openStart, pageOf, shownCode, watchErrors } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { account, awayFromMenu, getIdb, logIn, menuFlash, syncNow, spaceDbOf } from './sync-pages';
import { stubTurnstile } from './turnstile-stub';
import { DEMO_NOW } from './demo-clock';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(150_000);

const DB = spaceDbOf(NAME);

async function device(browser: Browser, server: FakeAccountServer, viewport = { width: 1440, height: 900 }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport });
  // The demo's unsaved runs are within their 14 days (the sweep at a start page's first show keeps them).
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

/** The demo backup (4 runs: Rasta's two saved, two Gittan sessions unsaved) into the page's space. */
async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  const n = await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<{ added: number }> }> } };
    const lib = await w.__wc.runs();
    return (await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob())).added;
  });
  expect(n).toBe(4);
}

const hist = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
const rows = (page: Page) => hist(page).locator('.wc-lk-tr');
const cur = (page: Page) => hist(page).locator('.wc-lk-tr.is-on');
const hbtn = (page: Page, id: string) => hist(page).locator(`.wc-lk-btn[data-btn="${id}"]`);

async function openHistory(page: Page, n: number): Promise<void> {
  await awayFromMenu(page);
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  await expect(hist(page)).toBeVisible();
  await expect(rows(page)).toHaveCount(n);
}

/** Back to the start menu from History (one Esc; the menu's own Esc would hide it). */
async function toMenu(page: Page): Promise<void> {
  if (await hist(page).isVisible()) await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-sm-item[data-key="history"]')).toBeVisible();
}

const cloudRows = async (page: Page): Promise<Record<string, string>> =>
  Object.fromEntries((await getIdb(page, DB, 'runCloud')).map((r) => [r.runId as string, r.state as string]));
const runIds = async (page: Page, db = DB): Promise<string[]> => (await getIdb(page, db, 'runs')).map((r) => r.runId as string).sort();

/** What src/cloud/runs-view.ts says now (the page's own module). */
async function runsView(page: Page): Promise<{ on: boolean; notInCloudAfterMove: number; cloud: { used: number; limit: number } | null }> {
  return page.evaluate(async () => (await import('/src/cloud/runs-view.ts' as string)).runsView());
}

/** Starts collecting the "does not fit" events of the page. */
async function watchFits(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const m = await import('/src/cloud/runs-view.ts' as string);
    const w = window as unknown as { __fits?: unknown[] };
    w.__fits = [];
    m.onDoesNotFit((e: unknown) => w.__fits!.push(e));
  });
}
const fits = (page: Page): Promise<Record<string, unknown>[]> => page.evaluate(() => (window as unknown as { __fits?: Record<string, unknown>[] }).__fits ?? []);

test('save on A uploads; on B the session is in History, opens (fetched) and plays; a delete on A deletes it on B', async ({ browser }) => {
  const server = runsServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  const b = await device(browser, server);
  const errors = [...watchErrors(a.page), ...watchErrors(b.page)];
  for (const d of [a, b]) {
    await openStart(d.page);
    await logIn(d.page);
  }
  const model = server.items(NAME);
  await restoreDemo(a.page);
  // History on A: save the 35 min Gittan session (the cursor on row 1 of newest first: Gittan 27th, Rasta, Gittan 25th).
  await openHistory(a.page, 3);
  await a.page.keyboard.press('Home');
  await a.page.keyboard.press('ArrowDown');
  await a.page.keyboard.press('ArrowDown');
  await expect(cur(a.page).locator('.wc-hist-char')).toHaveText(/^Gittan/);
  await hbtn(a.page, 'SAVE').click();
  await expect(cur(a.page).locator('.wc-hist-exp')).toHaveText('Saved');
  // The saved runs go up (Rasta's two were saved already): three bodies, three items.
  await expect.poll(() => model.bodies.size, { timeout: 20_000 }).toBe(3);
  await expect.poll(() => model.all().filter((i) => i.kind === 'run' && !i.deleted).length, { timeout: 20_000 }).toBe(3);
  await expect.poll(async () => Object.values(await cloudRows(a.page)).sort()).toEqual(['up', 'up', 'up']);
  expect((await runsView(a.page)).cloud).toMatchObject({ used: model.runBytes });

  // B: a sync brings the sessions as cloud-only rows; History lists them.
  await toMenu(b.page);
  await account(b.page);
  await syncNow(b.page);
  await expect.poll(async () => Object.values(await cloudRows(b.page)).sort()).toEqual(['remote', 'remote', 'remote']);
  expect(await runIds(b.page)).toEqual([]);
  await b.page.keyboard.press('Escape');
  await openHistory(b.page, 2);
  // Newest first: Rasta (26th), the saved Gittan (25th).
  await expect(rows(b.page).nth(0).locator('.wc-hist-char')).toHaveText(/^Rasta/);
  await expect(rows(b.page).nth(0).locator('.wc-hist-exp')).toHaveText('Saved');
  // Run log on Rasta's session: fetched first, then it plays.
  await b.page.keyboard.press('Home');
  await expect(cur(b.page).locator('.wc-hist-char')).toHaveText(/^Rasta/);
  await hbtn(b.page, 'RUN LOG').click();
  await expect(b.page.locator('.wc-start .wc-frame:not([hidden]) .wc-rl-box .wc-rl-slot > .wc-player')).toHaveCount(1, { timeout: 20_000 });
  const bRows = await cloudRows(b.page);
  expect(Object.values(bRows).sort()).toEqual(['remote', 'up', 'up']);
  expect((await runIds(b.page)).length).toBe(2);
  await b.page.keyboard.press('Escape');
  await expect(hist(b.page)).toBeVisible();

  // A deletes the Gittan session: on every device and in the cloud.
  await a.page.keyboard.press('Home');
  await expect(cur(a.page).locator('.wc-hist-char')).toHaveText(/^Gittan/);
  await a.page.keyboard.press('ArrowDown');
  await a.page.keyboard.press('ArrowDown');
  await expect(cur(a.page).locator('.wc-hist-exp')).toHaveText('Saved');
  await expect(cur(a.page).locator('.wc-hist-char')).toHaveText(/^Gittan/);
  await hbtn(a.page, 'DELETE').click();
  await expect(a.page.locator('.wc-lk-dialog[data-dlg="delete"]')).toBeVisible();
  await a.page.keyboard.press('y');
  await expect(rows(a.page)).toHaveCount(2);
  await expect.poll(() => model.bodies.size, { timeout: 20_000 }).toBe(2);
  expect(model.all().filter((i) => i.kind === 'run' && i.deleted)).toHaveLength(1);
  await toMenu(b.page);
  await account(b.page);
  await syncNow(b.page);
  await expect.poll(async () => Object.values(await cloudRows(b.page)).sort()).toEqual(['up', 'up']);
  await b.page.keyboard.press('Escape');
  await openHistory(b.page, 1);
  expect(errors).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});

test('Create account moves the device’s runs into the account; the saved ones upload; History looks the same', async ({ browser }) => {
  const server = runsServer();
  const a = await device(browser, server);
  const errors = watchErrors(a.page);
  await openStart(a.page);
  await restoreDemo(a.page);
  await openHistory(a.page, 3);
  const before = await rows(a.page).allTextContents();
  await toMenu(a.page);

  await openAccount(a.page);
  await link(a.page, 'create').click();
  await fillCreate(a.page);
  await expect(btn(a.page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(a.page, 'CREATE').click();
  await expect(pageOf(a.page, 'code')).toBeVisible();
  const code = await shownCode(a.page);
  await field(a.page, 'last').fill(code.slice(-4));
  await awayFromMenu(a.page);
  await field(a.page, 'last').press('Enter');
  // The move's line names the runs (no profiles or scripts of its own here).
  await expect(menuFlash(a.page)).toHaveText(`Moved into ${NAME}: 4 runs. This device is back at its starting set.`, { timeout: 30_000 });
  expect(await runIds(a.page, 'webcockpit')).toEqual([]);
  expect((await runIds(a.page)).length).toBe(4);
  // The saved ones (Rasta's two) go up.
  const model = server.items(NAME);
  await expect.poll(() => model.bodies.size, { timeout: 20_000 }).toBe(2);
  await expect.poll(() => model.all().filter((i) => i.kind === 'run' && !i.deleted).length, { timeout: 20_000 }).toBe(2);
  expect((await runsView(a.page)).notInCloudAfterMove).toBe(0);
  await openHistory(a.page, 3);
  expect(await rows(a.page).allTextContents()).toEqual(before);
  expect(errors).toEqual([]);
  await a.ctx.close();
});

test('a run over the limit stays on the device, says "does not fit" once where it was saved, and Log out lists it', async ({ browser }) => {
  const server = runsServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  const errors = watchErrors(a.page);
  await openStart(a.page);
  await logIn(a.page);
  const model = server.items(NAME);
  model.limits.runBytes = 64;
  await watchFits(a.page);
  await restoreDemo(a.page);
  await openHistory(a.page, 3);
  // Saving the 12 min Gittan session queues Rasta's saved ones too: none fits.
  await a.page.keyboard.press('End');
  await hbtn(a.page, 'SAVE').click();
  await expect(cur(a.page).locator('.wc-hist-exp')).toHaveText('Saved');
  await expect.poll(async () => Object.values(await cloudRows(a.page)).sort(), { timeout: 20_000 }).toEqual(['full', 'full', 'full']);
  expect(model.bodies.size).toBe(0);
  const told = await fits(a.page);
  expect(told).toHaveLength(3);
  for (const e of told) expect(e).toMatchObject({ reason: 'quota', limit: 64 });
  // Gittan's was saved in History, Rasta's two before: each run is told once, two sessions.
  expect(new Set(told.map((e) => e.sessionId)).size).toBe(2);
  // The views (stage 63 C2) tell each session once in a dialog: Keep closes them.
  for (let i = 0; i < 2; i++) {
    await expect(a.page.locator('.wc-start .wc-frame:not([hidden]) [data-dlg="run-full"]')).toBeVisible();
    await a.page.keyboard.press('Enter');
    await a.page.waitForTimeout(300);
  }
  await expect(a.page.locator('[data-dlg="run-full"]')).toHaveCount(0);
  // Log out: the three saved runs are not in the cloud.
  await toMenu(a.page);
  await account(a.page);
  await btn(a.page, 'LOGOUT').click();
  const out = dialog(a.page, 'ac-logout');
  await expect(out.locator('[data-logout="some"]')).toBeVisible({ timeout: 15_000 });
  await expect(out.locator('[data-row="saved"]')).toContainText('3');
  await a.page.keyboard.press('Escape');
  // Room again: they go up, without a second word.
  model.limits.runBytes = 50 * 1024 * 1024;
  await expect(frame(a.page).locator('[data-sync]')).toBeVisible();
  await syncNow(a.page);
  await expect.poll(() => model.bodies.size, { timeout: 20_000 }).toBe(3);
  expect(await fits(a.page)).toHaveLength(3);
  expect(errors).toEqual([]);
  await a.ctx.close();
});
