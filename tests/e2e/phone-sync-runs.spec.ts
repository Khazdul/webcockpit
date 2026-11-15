// Stage 63 C1 (ADR 0153) on a phone: the save and open path of runs in
// the cloud. Phone A saves a session in History (it goes up); phone B
// lists it as cloud-only, and its Run log fetches it and plays. The
// desktop's flows: sync-runs.spec.ts. Against the fake account API with
// the flags `accounts`, `sync` and `runs` on. `phone` project (Pixel 7).
import { type Browser, type BrowserContext, type Page, devices, expect, test } from '@playwright/test';
import { NAME, PASSWORD, watchErrors } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { getIdb, logIn, spaceDbOf } from './sync-pages';
import { stubTurnstile } from './turnstile-stub';
import { DEMO_NOW } from './demo-clock';

test.setTimeout(150_000);

const DB = spaceDbOf(NAME);
const hist = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
const rows = (page: Page) => hist(page).locator('.wc-lk-tr');

async function phone(browser: Browser, server: FakeAccountServer): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  // The demo's unsaved runs are within their 14 days (the sweep at a start page's first show keeps them).
  await ctx.clock.setSystemTime(DEMO_NOW);
  const page = await ctx.newPage();
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  return { ctx, page };
}

const states = async (page: Page): Promise<string[]> => (await getIdb(page, DB, 'runCloud')).map((r) => r.state as string).sort();

test('phone: a session saved on one phone is in History on another, cloud-only; its Run log fetches it and plays', async ({ browser }) => {
  const server = new FakeAccountServer();
  server.flags = { accounts: true, sync: true, runs: true };
  await seedAccount(server, NAME, PASSWORD);
  const a = await phone(browser, server);
  const errors = watchErrors(a.page);
  await logIn(a.page);
  await a.page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await a.page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  await a.page.locator('.wc-start .wc-sm-item[data-key="history"]').tap();
  await expect(rows(a.page)).toHaveCount(3);
  // Save the newest Gittan session by tap (the first row is the chosen one; a tap on it would play it).
  await expect(rows(a.page).nth(0)).toHaveClass(/is-on/);
  await hist(a.page).locator('.wc-hist-card [data-btn="SAVE"]').tap();
  await expect(rows(a.page).nth(0).locator('.wc-hist-exp')).toHaveText('Saved');
  const model = server.items(NAME);
  await expect.poll(() => model.bodies.size, { timeout: 20_000 }).toBe(3);
  await expect.poll(() => states(a.page)).toEqual(['up', 'up', 'up']);
  await expect.poll(() => model.all().filter((i) => i.kind === 'run' && !i.deleted).length, { timeout: 20_000 }).toBe(3);

  // The other phone logs in: History lists the account's two saved sessions, only in the cloud.
  const b = await phone(browser, server);
  errors.push(...watchErrors(b.page));
  await logIn(b.page);
  await expect.poll(() => states(b.page), { timeout: 20_000 }).toEqual(['remote', 'remote', 'remote']);
  await b.page.locator('.wc-start .wc-sm-item[data-key="history"]').tap();
  await expect(rows(b.page)).toHaveCount(2);
  await expect(rows(b.page).nth(0)).toHaveClass(/is-on/);
  await expect(rows(b.page).nth(0).locator('.wc-hist-char')).toHaveText(/^Gittan/);
  await hist(b.page).locator('.wc-hist-card [data-btn="RUN LOG"]').tap();
  await expect(b.page.locator('.wc-start .wc-frame:not([hidden]) .wc-rl-box .wc-rl-slot > .wc-player')).toHaveCount(1, { timeout: 20_000 });
  expect(await states(b.page)).toEqual(['remote', 'remote', 'up']);
  // A phone fetched only what was opened.
  expect((await getIdb(b.page, DB, 'runs')).length).toBe(1);
  expect(errors).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});
