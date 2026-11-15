// Stage 63 C2 (ADR 0153; round 11's picks): the views of runs in the
// cloud on a desktop, against the e2e fake of the account API with the
// flags `accounts`, `sync` and `runs` on. Two pages in two browser
// contexts on one fake server are two devices of one account.
//
// - History (pick 2b): the tags, the card's notes, the storage line, the
//   fetch on open with stage 24's bar, offline.
// - "Does not fit" (pick 1a): over History (no Open History), on the
//   start page after an Exit (Open History), Download the run.
// - Log out (pick 3a), the delete warning (pick 4), the counts of
//   Spotlights and Diary with Fetch all (pick 5), the move's line.
// - Guests and the flag `runs` off: every view as before.
// - The Exit popup's saved run goes up at once (no wait for a sync).
//
// `WC_C2_SHOTS=<dir>` saves a picture of each picked state there.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test';
import { NAME, PASSWORD, btn, dialog, field, fillCreate, link, openAccount, openStart, pageOf, shownCode, watchErrors } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { account, awayFromMenu, getIdb, logIn, menuFlash, spaceDbOf } from './sync-pages';
import { stubTurnstile } from './turnstile-stub';
import { DEMO_NOW } from './demo-clock';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(180_000);

const DB = spaceDbOf(NAME);
const SHOTS = process.env.WC_C2_SHOTS;
const MIB = 1024 * 1024;

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, `${name}.desktop.jpg`), type: 'jpeg', quality: 80 });
}

async function device(browser: Browser, server: FakeAccountServer): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.clock.setSystemTime(DEMO_NOW);
  const page = await ctx.newPage();
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  return { ctx, page };
}

function runsServer(runs = true): FakeAccountServer {
  const server = new FakeAccountServer();
  server.flags = { accounts: true, sync: true, runs };
  return server;
}

/** The demo backup (Rasta's session of two saved runs, two Gittan sessions unsaved) into the page's space. */
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
const cur = (page: Page) => hist(page).locator('.wc-lk-tr.is-on');
const card = (page: Page) => hist(page).locator('.wc-hist-card');
const hbtn = (page: Page, id: string) => hist(page).locator(`.wc-lk-btn[data-btn="${id}"]`);
const tags = (page: Page) => hist(page).locator('.wc-rc-tag');
const storage = (page: Page) => hist(page).locator('.wc-hist-storage');
const fit = (page: Page) => top(page).locator('[data-dlg="run-full"]');
const count = (page: Page) => top(page).locator('.wc-rc-count');
const rowOf = (page: Page, name: string) => rows(page).filter({ has: page.locator('.wc-hist-char', { hasText: name }) });

async function openHistory(page: Page, n: number): Promise<void> {
  await awayFromMenu(page);
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  await expect(hist(page)).toBeVisible();
  await expect(rows(page)).toHaveCount(n);
}

async function toMenu(page: Page): Promise<void> {
  if (await hist(page).isVisible()) await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-sm-item[data-key="history"]')).toBeVisible();
}

const states = async (page: Page): Promise<string[]> => (await getIdb(page, DB, 'runCloud')).map((r) => r.state as string).sort();

/** The run bodies' GETs wait `ms` (stage 24's bar stays long enough to be seen). */
async function slowFetches(page: Page, ms: number): Promise<void> {
  await page.route('**/api/u/runs/**', async (route) => {
    if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, ms));
    await route.fallback();
  });
}

/** Notes whether an element matching `sel` was ever in the page. */
async function watchFor(page: Page, sel: string): Promise<void> {
  await page.evaluate((s) => {
    const w = window as unknown as { __seen?: Record<string, boolean> };
    w.__seen ??= {};
    const look = (): void => {
      if (document.querySelector(s)) w.__seen![s] = true;
    };
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true });
    look();
  }, sel);
}
const seen = (page: Page, sel: string) => page.evaluate((s) => !!(window as unknown as { __seen?: Record<string, boolean> }).__seen?.[s], sel);

/** A "does not fit" event of the page's own module (a picture of the dialog with the mockup's numbers). */
async function emitFit(page: Page, o: { sessionId: string; runId: string; where: 'start' | 'history' }): Promise<void> {
  await page.evaluate(async (e) => {
    const m = await import('/src/cloud/runs-view.ts' as string);
    m.emitDoesNotFit({ ...e, used: 49 * 1024 * 1024, limit: 50 * 1024 * 1024, size: 2.1 * 1024 * 1024, reason: 'quota' });
  }, o);
}

/** A's saved sessions go up; B logs in and has them only in the cloud. */
async function twoDevices(browser: Browser, server: FakeAccountServer) {
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  const errors = watchErrors(a.page);
  await logIn(a.page);
  await restoreDemo(a.page);
  await openHistory(a.page, 3);
  // Save the 25th's Gittan session (the last row): with Rasta's two, three runs go up.
  await a.page.keyboard.press('End');
  await hbtn(a.page, 'SAVE').click();
  await expect(cur(a.page).locator('.wc-hist-exp')).toHaveText('Saved');
  const model = server.items(NAME);
  await expect.poll(() => model.bodies.size, { timeout: 20_000 }).toBe(3);
  await expect.poll(() => model.all().filter((i) => i.kind === 'run' && !i.deleted).length, { timeout: 20_000 }).toBe(3);
  // A run in step carries no tag.
  await expect(tags(a.page)).toHaveCount(0);
  const b = await device(browser, server);
  errors.push(...watchErrors(b.page));
  await logIn(b.page);
  await expect.poll(() => states(b.page), { timeout: 20_000 }).toEqual(['remote', 'remote', 'remote']);
  return { a, b, errors, model };
}

test('History on another device: tags, the card, the storage line, offline, the fetch with the bar; the delete warning; the counts and Fetch all', async ({ browser }) => {
  const server = runsServer();
  const { a, b, errors, model } = await twoDevices(browser, server);
  const page = b.page;
  await slowFetches(page, 1500);
  await openHistory(page, 2);
  // Pick 2b: a quiet tag beside the name, the body's size.
  await expect(tags(page)).toHaveCount(2);
  await expect(rowOf(page, 'Rasta').locator('.wc-rc-tag')).toHaveText(/^in the cloud · \d+ KB$/);
  await expect(rowOf(page, 'Gittan').locator('.wc-rc-tag')).toHaveText(/^in the cloud · \d+ KB$/);
  await expect(storage(page)).toHaveText(/^This device .+ · Cloud 0 of 50 MB$/);
  await page.keyboard.press('Home');
  await expect(cur(page).locator('.wc-hist-char')).toContainText('Rasta');
  await expect(card(page).locator('[data-note="remote"]')).toHaveText(/^In the cloud · \d+ KB$/);
  await expect(card(page).locator('.wc-rc-logsub')).toHaveText('Fetched when opened');
  await shot(page, 'hist-b-cloud');

  // Pick 4: logged in, a saved session is deleted everywhere.
  await hbtn(page, 'DELETE').click();
  const del = top(page).locator('[data-dlg="delete"]');
  await expect(del.locator('.wc-hd-warn')).toHaveText('Delete this session? It is deleted on all your devices and in the cloud.');
  await shot(page, 'delete-cloud');
  await del.locator('[data-btn="CANCEL"]').click();
  await expect(del).toHaveCount(0);

  // Offline: the tags say the network is needed, the card why, and Run log does not open.
  await b.ctx.setOffline(true);
  await expect(rowOf(page, 'Rasta').locator('.wc-rc-tag')).toHaveText('in the cloud · needs the network');
  await expect(card(page).locator('.wc-rc-logsub')).toHaveText('Needs the network to open');
  await expect(hist(page).locator('.wc-lk-flash')).toHaveText('Offline: sessions in the cloud cannot be opened.');
  await expect(hbtn(page, 'RUN LOG')).toHaveAttribute('aria-disabled', 'true');
  await expect(hbtn(page, 'STATS')).toHaveAttribute('aria-disabled', 'true');
  await expect(hbtn(page, 'RATE')).not.toHaveAttribute('aria-disabled', 'true');
  await shot(page, 'hist-b-offline');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await expect(hist(page)).toBeVisible();
  expect(await states(page)).toEqual(['remote', 'remote', 'remote']);
  await b.ctx.setOffline(false);
  await expect(rowOf(page, 'Rasta').locator('.wc-rc-tag')).toHaveText(/^in the cloud · \d+ KB$/);

  // Pick 5 before anything is fetched: the Diary's foot names the sessions it leaves out, Fetch all on a desktop.
  await page.keyboard.press('3');
  await expect(count(page)).toHaveText(/^2 sessions in the cloud are not counted\s*Fetch all$/);

  // Run log fetches first, with stage 24's bar in the card, then plays.
  await page.keyboard.press('1');
  await expect(hist(page)).toBeVisible();
  await page.keyboard.press('Home');
  await watchFor(page, '.wc-hist-card .wc-lk-load');
  await hbtn(page, 'RUN LOG').click();
  await expect(card(page).locator('.wc-lk-load-l')).toHaveText(/^Fetching from the cloud…( [\d.]+ of [\d.]+ [KM]B)?$/);
  await expect(hbtn(page, 'DELETE')).toHaveAttribute('aria-disabled', 'true');
  await shot(page, 'hist-b-fetch');
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-rl-box .wc-rl-slot > .wc-player')).toHaveCount(1, { timeout: 20_000 });
  expect(await seen(page, '.wc-hist-card .wc-lk-load')).toBe(true);
  await page.keyboard.press('Escape');
  await expect(hist(page)).toBeVisible();
  // Fetched: on this device like any run, no tag.
  await expect(rowOf(page, 'Rasta').locator('.wc-rc-tag')).toHaveCount(0);
  await expect(tags(page)).toHaveCount(1);
  await shot(page, 'hist-b-list');

  // The counts: Diary, then Spotlights, whose Fetch all brings the rest.
  await page.keyboard.press('3');
  await expect(count(page)).toHaveText(/^1 session in the cloud is not counted\s*Fetch all$/);
  await shot(page, 'count-diary');
  await page.keyboard.press('2');
  await expect(count(page)).toContainText('1 session in the cloud is not counted');
  await shot(page, 'count-spot');
  await watchFor(page, '.wc-rc-count.is-busy');
  await count(page).locator('[data-btn="FETCHALL"]').click();
  await expect(top(page).locator('.wc-rc-count.is-busy .wc-lk-load-l')).toHaveText(/^Fetching 1 session…( [\d.]+ of [\d.]+ [KM]B)?$/);
  await shot(page, 'count-spot-fetch');
  await expect.poll(() => states(page), { timeout: 20_000 }).toEqual(['up', 'up', 'up']);
  await expect(top(page).locator('.wc-spw-foot')).toBeVisible();
  await expect(count(page)).toHaveCount(0);
  await page.keyboard.press('3');
  await expect(top(page).locator('.wc-cred-foot')).toBeVisible();
  await expect(count(page)).toHaveCount(0);
  // Statistics says nothing of the cloud (pick 5).
  await page.keyboard.press('1');
  await hbtn(page, 'STATS').click();
  await expect(top(page).locator('.wc-hs-head')).toBeVisible();
  await expect(count(page)).toHaveCount(0);
  expect(model.bodies.size).toBe(3);
  expect(errors).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});

test('"does not fit": over History without Open History, Download the run, once per session; the tags, the card, Log out’s row', async ({ browser }) => {
  const server = runsServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  const errors = watchErrors(a.page);
  const page = a.page;
  await logIn(page);
  server.items(NAME).limits.runBytes = 64;
  await restoreDemo(page);
  await openHistory(page, 3);
  await page.keyboard.press('End');
  await hbtn(page, 'SAVE').click();
  // Two sessions do not fit (the saved Gittan here, Rasta's two runs): two dialogs, one after the other.
  const told: string[] = [];
  for (let i = 0; i < 2; i++) {
    await expect(fit(page)).toBeVisible({ timeout: 20_000 });
    if (i > 0) await expect(fit(page).locator('.wc-rf-run')).not.toHaveText(told[0]!);
    told.push((await fit(page).locator('.wc-rf-run').textContent())!);
    await expect(fit(page).locator('.wc-lk-hood-t')).toHaveText('Cloud storage full');
    await expect(fit(page).locator('.wc-lk-q')).toHaveText('Your cloud storage is full (0 of 0 MB).');
    await expect(fit(page).locator('.wc-lk-qn')).toHaveText('The run is saved on this device.');
    await expect(fit(page).locator('.wc-rf-run')).toContainText(/(Rasta|Gittan) · \w+day, 2\d September · /);
    await expect(fit(page).locator('[data-btn]')).toHaveCount(2);
    await expect(fit(page).locator('[data-btn="HISTORY"]')).toHaveCount(0);
    if (i === 0) {
      const dl = page.waitForEvent('download');
      await fit(page).locator('[data-btn="DOWNLOAD"]').click();
      expect((await dl).suggestedFilename()).toMatch(/^webcockpit-runs-\d{4}-\d\d-\d\d\.jsonl\.gz$/);
      await expect(fit(page)).toBeVisible();
      await page.keyboard.press('Enter');
    } else {
      await page.keyboard.press('Escape');
    }
  }
  await expect(fit(page)).toHaveCount(0);
  expect(told.map((t) => t.split(' · ')[0]).sort()).toEqual(['Gittan', 'Rasta']);
  await page.waitForTimeout(1000);
  await expect(fit(page)).toHaveCount(0);
  expect(await states(page)).toEqual(['full', 'full', 'full']);
  // Pick 2b: "not in the cloud", and why in the card.
  await expect(tags(page)).toHaveCount(2);
  await expect(rowOf(page, 'Rasta').locator('.wc-rc-tag')).toHaveText('not in the cloud');
  await expect(cur(page).locator('.wc-rc-tag')).toHaveText('not in the cloud');
  await expect(card(page).locator('[data-note="local"]')).toHaveText('not in the cloud: the cloud is full');
  await expect(storage(page)).toHaveText(/^This device .+ · Cloud 0 of 0 MB$/);
  // The picture with the mockup's numbers: an event for the session on screen.
  if (SHOTS) {
    await shot(page, 'hist-b-local');
    const id = (await getIdb(page, DB, 'runs')).find((r) => r.character === 'Gittan' && r.saved)!.runId as string;
    await emitFit(page, { sessionId: `${id}#shot`, runId: id, where: 'history' });
    await expect(fit(page)).toBeVisible();
    await shot(page, 'fit-a-history');
    await page.keyboard.press('Escape');
  }

  // Pick 3a: Log out's runs row, the reasons in its second line.
  await toMenu(page);
  await account(page);
  await btn(page, 'LOGOUT').click();
  const out = dialog(page, 'ac-logout');
  const row = out.locator('[data-row="saved"]');
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toHaveClass(/is-two/);
  await expect(row.locator('b')).toHaveText('3 saved runs');
  await expect(row).toContainText('3 saved runs not in the cloud');
  await expect(row.locator('[data-why]')).toHaveText('3 cloud full');
  await expect(out.locator('[data-row="unsaved"]')).toContainText('unsaved run');
  await shot(page, 'logout-a');
  // Download gives exactly those runs.
  const dl = page.waitForEvent('download');
  await out.locator('[data-btn="DOWNLOAD"]').click();
  expect((await dl).suggestedFilename()).toMatch(/^webcockpit-runs-/);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
  await a.ctx.close();
});

// ------------------------------------------------------------ the Exit popup

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const bytes = (...parts: (number[] | string)[]): Buffer => Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

/** Logged in, a mocked game: a run with a kill, then Exit with a rating (Y). */
async function playAndExit(page: Page): Promise<void> {
  let server: { send(b: Buffer): void } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  await logIn(page);
  await awayFromMenu(page);
  await page.keyboard.press('Home');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  const name = 'Exitrater';
  server!.send(gmcp(`Char.Name {"name":"${name}","fullname":"${name} the Mock"}`));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', new RegExp(`^playing · ${name}`));
  server!.send(gmcp('Char.Vitals {"hp":100,"maxhp":100,"xp":5770000,"tp":41500}'));
  server!.send(bytes('An orc scout is dead! R.I.P.\r\n'));
  server!.send(gmcp('Char.Vitals {"xp":5860000}'));
  await expect(page.locator('.wc-pane[data-pane="ui"]')).toContainText('KILL: An orc scout');
  await page.locator('.wc-mb[data-mb="exit"]').click();
  const pop = page.locator('.wc-pop-exit');
  await expect(pop).toBeFocused();
  await page.keyboard.press('4');
  await page.keyboard.press('y');
  await expect(page.locator('.wc-start .wc-sm-item[data-key="history"]')).toBeVisible();
}

test('the Exit popup’s saved run goes up within seconds of the game’s end (not at the next sync)', async ({ browser }) => {
  const server = runsServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  const errors = watchErrors(a.page);
  await playAndExit(a.page);
  const model = server.items(NAME);
  // The period's sync is minutes away; the seal starts the queue.
  await expect.poll(() => model.bodies.size, { timeout: 8_000 }).toBe(1);
  await expect.poll(() => states(a.page), { timeout: 8_000 }).toEqual(['up']);
  await expect(fit(a.page)).toHaveCount(0);
  expect(errors).toEqual([]);
  await a.ctx.close();
});

test('"does not fit" after an Exit: on the start page, Open History opens History', async ({ browser }) => {
  const server = runsServer();
  await seedAccount(server, NAME, PASSWORD);
  server.items(NAME).limits.runBytes = 64;
  const a = await device(browser, server);
  const errors = watchErrors(a.page);
  const page = a.page;
  await playAndExit(page);
  await expect(fit(page)).toBeVisible({ timeout: 15_000 });
  await expect(fit(page).locator('.wc-rf-run b')).toHaveText('Exitrater');
  await expect(fit(page).locator('[data-btn]')).toHaveText(['Download the run', 'Open History', 'Keep on this device']);
  await expect(fit(page).locator('.wc-lk-btn.is-primary')).toHaveAttribute('data-btn', 'KEEP');
  await shot(page, 'fit-a-start-real');
  await page.keyboard.press('h');
  await expect(hist(page)).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).locator('.wc-rc-tag')).toHaveText('not in the cloud');
  await expect(fit(page)).toHaveCount(0);
  if (SHOTS) {
    await toMenu(page);
    const id = (await getIdb(page, DB, 'runs'))[0]!.runId as string;
    await emitFit(page, { sessionId: `${id}#shot`, runId: id, where: 'start' });
    await expect(fit(page)).toBeVisible();
    await shot(page, 'fit-a-start');
    await page.keyboard.press('Enter');
  }
  expect(errors).toEqual([]);
  await a.ctx.close();
});

test('Create account: moved runs that do not fit get one start-menu line, no dialog', async ({ browser }) => {
  const server = runsServer();
  server.items(NAME).limits.runBytes = 64;
  const a = await device(browser, server);
  const errors = watchErrors(a.page);
  const page = a.page;
  await openStart(page);
  await restoreDemo(page);
  await openAccount(page);
  await link(page, 'create').click();
  await fillCreate(page);
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'CREATE').click();
  await expect(pageOf(page, 'code')).toBeVisible();
  const code = await shownCode(page);
  await field(page, 'last').fill(code.slice(-4));
  await awayFromMenu(page);
  await field(page, 'last').press('Enter');
  await expect(menuFlash(page)).toHaveText('2 runs are not in the cloud: it is full.', { timeout: 30_000 });
  await expect(fit(page)).toHaveCount(0);
  expect(await states(page)).toEqual(['full', 'full']);
  // Said once: a reload does not say it again.
  await page.reload();
  await expect(page.locator('.wc-start .wc-sm-item[data-key="history"]')).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(menuFlash(page)).not.toHaveText('2 runs are not in the cloud: it is full.');
  await expect(fit(page)).toHaveCount(0);
  expect(errors).toEqual([]);
  await a.ctx.close();
});

// ------------------------------------------------------------ as before

/** History, its Delete dialog, Spotlights and Diary say nothing of the cloud. */
async function asBefore(page: Page): Promise<void> {
  await openHistory(page, 3);
  await expect(tags(page)).toHaveCount(0);
  await expect(storage(page)).toHaveText(/^Storage: /);
  await expect(card(page).locator('[data-note]')).toHaveCount(0);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(cur(page).locator('.wc-hist-exp')).toHaveText('Saved');
  await hbtn(page, 'DELETE').click();
  await expect(top(page).locator('[data-dlg="delete"] .wc-hd-warn')).toHaveText("This will permanently delete the session's logs and run data. This cannot be undone.");
  await top(page).locator('[data-dlg="delete"] [data-btn="CANCEL"]').click();
  await page.keyboard.press('2');
  await expect(top(page).locator('.wc-spw-foot')).toBeVisible();
  await expect(count(page)).toHaveCount(0);
  await page.keyboard.press('3');
  await expect(top(page).locator('.wc-cred-foot')).toBeVisible();
  await expect(count(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
}

test('a guest: every view as before', async ({ browser }) => {
  const server = runsServer();
  const a = await device(browser, server);
  const errors = watchErrors(a.page);
  await openStart(a.page);
  await restoreDemo(a.page);
  await asBefore(a.page);
  expect(errors).toEqual([]);
  await a.ctx.close();
});

test('logged in with the flag `runs` off: every view as before, Log out’s row as before', async ({ browser }) => {
  const server = runsServer(false);
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  const errors = watchErrors(a.page);
  await logIn(a.page);
  await restoreDemo(a.page);
  await asBefore(a.page);
  await account(a.page);
  await btn(a.page, 'LOGOUT').click();
  const row = dialog(a.page, 'ac-logout').locator('[data-row="saved"]');
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toHaveText('2 saved runs on this device only');
  await expect(row).not.toHaveClass(/is-two/);
  await a.page.keyboard.press('Escape');
  expect(errors).toEqual([]);
  await a.ctx.close();
});
