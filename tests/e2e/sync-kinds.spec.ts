// Stage 62 part C1: the sync of the small kinds in the browser (ADR 0152),
// against the e2e fake of the account API (the flags `accounts` and `sync`
// on). Each context is a device of one account: two desktops share their
// settings, a phone (`phone=1` kept on every load) keeps its own; Comm
// written during a game on one desktop reaches the other's Comm pane after
// the game is left; a character's timers follow; pulled settings wait
// during play and apply on the start page with the message line's words
// (round 10, the owner's pick 2b with 2c).

import { type Browser, type BrowserContext, type Page, type WebSocketRoute, expect, test } from '@playwright/test';
import { NAME, PASSWORD, watchErrors } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { account, getIdb, logIn, menuFlash, putIdb, spaceDbOf, syncNow } from './sync-pages';
import { stubTurnstile } from './turnstile-stub';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(150_000);

const DB = spaceDbOf(NAME);
const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;

const gmcp = (pkg: string, data: unknown): Buffer =>
  Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`), Buffer.from([IAC, SE])]);

interface Device {
  ctx: BrowserContext;
  page: Page;
  /** The game's socket (after Enter MUME). */
  game: () => WebSocketRoute;
}

async function device(browser: Browser, server: FakeAccountServer, o: { phone?: boolean } = {}): Promise<Device> {
  const ctx = await browser.newContext({ viewport: o.phone ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  if (o.phone) {
    // A phone on every load, the sync's reloads included (they keep only `?cloudtest`).
    await ctx.addInitScript(() => {
      const u = new URL(location.href);
      if (!u.searchParams.has('phone')) {
        u.searchParams.set('phone', '1');
        history.replaceState(history.state, '', u.toString());
      }
    });
  }
  const page = await ctx.newPage();
  await fakeAccountApi(page, { server });
  await stubTurnstile(page, { auto: true });
  let ws: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (route) => {
    ws = route;
    route.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  return { ctx, page, game: () => ws! };
}

function syncServer(): FakeAccountServer {
  const server = new FakeAccountServer();
  server.flags = { accounts: true, sync: true };
  return server;
}

const size = (page: Page): Promise<number> => page.evaluate(() => window.__wc!.settings.get().appearance.size);
const setSize = (page: Page, n: number): Promise<void> => page.evaluate((v) => window.__wc!.settings.update({ appearance: { size: v } }), n);
const kinds = (server: FakeAccountServer, kind: string): number => server.items(NAME).all().filter((i) => i.kind === kind && !i.deleted).length;
/** The highest `seq` of the account's `kind` items (0: none): a push after a mark is a higher one. */
const lastSeq = (server: FakeAccountServer, kind: string): number => Math.max(0, ...server.items(NAME).all().filter((i) => i.kind === kind).map((i) => i.seq));
const comm = (page: Page) => page.locator('.wc-pane[data-pane="comm"]');

/** Enter MUME from the start menu and be the character `name`. */
async function play(d: Device, name: string): Promise<void> {
  await d.page.bringToFront();
  await d.page.mouse.move(1, 1);
  await d.page.locator('.wc-start .wc-sm-item[data-key="enter"]').click();
  await expect(d.page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  d.game().send(gmcp('Char.Name', { name, fullname: `${name} the Tester` }));
  await expect(comm(d.page)).toHaveAttribute('data-active', '');
}

/** The tab hidden (or visible again) as far as the page knows: `visibilityState` and its event. */
const setHidden = (page: Page, hidden: boolean): Promise<void> =>
  page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

/** This type's settings record in the sync store: pulled and waiting for the game (stage 62 review). */
const heldSettings = async (page: Page): Promise<boolean> =>
  (await getIdb(page, DB, 'sync')).some((r) => {
    const rec = (r as { rec?: { kind?: string; state?: string; waited?: boolean } }).rec;
    return rec?.kind === 'settings' && rec.state === 'held' && rec.waited === true;
  });

/** Exit (the bar's popup, Y): back to the start page. */
async function leave(d: Device): Promise<void> {
  await d.page.locator('.wc-mb[data-mb="exit"]').click();
  await d.page.keyboard.press('y');
  await expect(d.page.locator('.wc-start')).toBeVisible();
}

test('two desktops share settings, a phone keeps its own; pulled settings say where they came from', async ({ browser }) => {
  const server = syncServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  const b = await device(browser, server);
  const p = await device(browser, server, { phone: true });
  const errors = [...watchErrors(a.page), ...watchErrors(b.page)];
  for (const d of [a, b, p]) await logIn(d.page);
  expect(await p.page.evaluate(() => document.documentElement.classList.contains('wc-phone'))).toBe(true);
  const phoneSize = await size(p.page);
  // A desktop's change: pushed 5 s after it was stored.
  const want = phoneSize === 21 ? 22 : 21;
  // Each login's copy of the device settings met none of its type in the account: the first desktop's and the phone's are pushed.
  await expect.poll(() => kinds(server, 'settings'), { timeout: 30_000 }).toBe(2);
  await a.page.waitForTimeout(6000);
  let mark = lastSeq(server, 'settings');
  await setSize(a.page, want);
  await expect.poll(() => lastSeq(server, 'settings'), { timeout: 30_000 }).toBeGreaterThan(mark);
  // The other desktop takes it at its next sync, on the start menu, and says from where.
  await account(b.page);
  await syncNow(b.page);
  await expect.poll(() => size(b.page)).toBe(want);
  await b.page.keyboard.press('Escape');
  await expect(menuFlash(b.page)).toHaveText(/^Settings from desktop, (Chrome|Firefox)\.$/);
  // The phone keeps its own, and holds the desktops' in the account's store.
  await p.page.reload();
  await expect.poll(async () => (await getIdb(p.page, DB, 'settings')).length, { timeout: 30_000 }).toBeGreaterThan(0);
  const desktopRow = async (): Promise<number | null> => {
    const row = (await getIdb(p.page, DB, 'settings')).find((r) => r.type === 'desktop') as { record?: { appearance?: { size?: number } } } | undefined;
    return row?.record?.appearance?.size ?? null;
  };
  await expect.poll(desktopRow, { timeout: 30_000 }).toBe(want);
  expect(await size(p.page)).toBe(phoneSize);
  // The phone's own settings are an item of their own.
  mark = lastSeq(server, 'settings');
  await setSize(p.page, phoneSize + 1);
  await expect.poll(() => lastSeq(server, 'settings'), { timeout: 30_000 }).toBeGreaterThan(mark);
  expect(kinds(server, 'settings')).toBe(2);
  await account(a.page);
  await syncNow(a.page);
  expect(await size(a.page)).toBe(want);
  expect(errors).toEqual([]);
  for (const d of [a, b, p]) await d.ctx.close();
});

test('during play: Comm and timers go on on the next desktop; pulled settings wait for the start page', async ({ browser }) => {
  const server = syncServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  const b = await device(browser, server);
  const errors = [...watchErrors(a.page), ...watchErrors(b.page)];
  for (const d of [a, b]) await logIn(d.page);
  const before = await size(a.page);

  await play(a, 'Testchar');
  a.game().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: "Gibur tells you 'over here'" }));
  await expect(comm(a.page).locator('.wc-cm-ent[data-key="gibur"]')).toBeVisible();
  await putIdb(a.page, DB, 'timers', [{ character: 'Testchar', savedAt: Date.now() - 30_000, state: { v: 1, trackers: {} } }]);

  // B changes the settings while A plays.
  await expect.poll(() => kinds(server, 'settings'), { timeout: 30_000 }).toBe(1);
  const mark = lastSeq(server, 'settings');
  await setSize(b.page, before + 3);
  await expect.poll(() => lastSeq(server, 'settings'), { timeout: 30_000 }).toBeGreaterThan(mark);
  // A's tab is hidden (a sync of the play schedule): Comm goes, the pulled settings wait.
  await setHidden(a.page, true);
  await expect.poll(() => kinds(server, 'comm'), { timeout: 30_000 }).toBe(1);
  await expect.poll(() => kinds(server, 'timers'), { timeout: 30_000 }).toBe(1);
  await a.page.waitForTimeout(1000);
  expect(await size(a.page)).toBe(before);
  await setHidden(a.page, false);

  // The game is left: they apply, and the line says they waited.
  await leave(a);
  await expect(menuFlash(a.page)).toHaveText(/^Settings from desktop, (Chrome|Firefox), held until the game ended\.$/, { timeout: 30_000 });
  expect(await size(a.page)).toBe(before + 3);

  // B takes up the game: Testchar's Comm and timers are there.
  await account(b.page);
  await syncNow(b.page);
  await expect.poll(async () => (await getIdb(b.page, DB, 'timers')).map((r) => r.character)).toEqual(['Testchar']);
  await b.page.keyboard.press('Escape');
  await play(b, 'Testchar');
  await expect(comm(b.page).locator('.wc-cm-ent[data-key="gibur"]')).toBeVisible();
  expect(errors).toEqual([]);
  for (const d of [a, b]) await d.ctx.close();
});

test('a game left before the start page has faded out: what was held for it comes in (stage 62 review, F7)', async ({ browser }) => {
  const server = syncServer();
  await seedAccount(server, NAME, PASSWORD);
  const a = await device(browser, server);
  const b = await device(browser, server);
  const errors = [...watchErrors(a.page), ...watchErrors(b.page)];
  for (const d of [a, b]) await logIn(d.page);
  const before = await size(a.page);
  await expect.poll(() => kinds(server, 'settings'), { timeout: 30_000 }).toBe(1);

  // Enter MUME; the start page's leave never ends (as in a tab put away during the fade).
  await a.page.bringToFront();
  await a.page.mouse.move(1, 1);
  await a.page.locator('.wc-start .wc-sm-item[data-key="enter"]').click();
  await a.page.evaluate(() => document.getAnimations().forEach((x) => x.pause()));
  await expect(a.page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);

  // B changes the settings; A, in the game, pulls them when hidden and holds them.
  const mark = lastSeq(server, 'settings');
  await setSize(b.page, before + 2);
  await expect.poll(() => lastSeq(server, 'settings'), { timeout: 30_000 }).toBeGreaterThan(mark);
  await setHidden(a.page, true);
  await expect.poll(() => heldSettings(a.page), { timeout: 30_000 }).toBe(true);
  await setHidden(a.page, false);
  expect(await size(a.page)).toBe(before);

  // Back on the start page: the game was left for the sync too.
  await leave(a);
  await expect(menuFlash(a.page)).toHaveText(/^Settings from desktop, (Chrome|Firefox), held until the game ended\.$/, { timeout: 30_000 });
  expect(await size(a.page)).toBe(before + 2);
  expect(errors).toEqual([]);
  for (const d of [a, b]) await d.ctx.close();
});
