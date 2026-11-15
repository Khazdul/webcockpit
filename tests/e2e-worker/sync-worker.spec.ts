// Stage 61 part C: the sync's flows on two browser contexts (two devices)
// against a real local Worker with a local D1 (playwright.sync-worker.config.ts,
// `npm run test:sync-worker`). One account, made in this run (the address
// may make three an hour), lives through all of it: Create account with
// things, a second device logs in and has them, an edit goes across, the
// same profile changed on both keeps both, a lost session with and without
// a change not in the account (locked, unlocked by a login), log out, and
// Delete account handing the things back. Stage 62: a settings change
// and a Comm message go across too. Stage 63 (ADR 0153, the flag `runs`):
// a saved run uploads to the local R2, is listed, is fetched on the second
// device, and a delete takes it off both and out of R2. Stage 64 (ADR
// 0154, the flag `share`): a link made on A (the rules ticked, the payload
// in the local R2) is watched by a guest on /r/<id>, counted once, and
// says it was removed after A removes it.

import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test';
import { PASSWORD, btn, dialog, field, fillCreate, frame, link, openAccount, openStart, pageOf, shownCode, watchErrors } from '../e2e/account-pages';
import { account, awayFromMenu, getIdb, logIn, menuFlash, names, owner, profile, putIdb, spaceDbOf, submitLogin, syncNow } from '../e2e/sync-pages';
import { stubTurnstile } from '../e2e/turnstile-stub';
import { demoPayload } from '../e2e/cloud-pub-fake';

test.use({ viewport: { width: 1440, height: 900 } });

async function device(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await stubTurnstile(page, { auto: true });
  return { ctx, page };
}

test('two devices of one account on the real Worker: move, edit, keep both, lost session, log out, delete', async ({ browser }) => {
  const name = `sync${Date.now().toString(36).slice(-6)}`;
  const DB = spaceDbOf(name);
  const a = await device(browser);
  const errors = watchErrors(a.page);
  await openStart(a.page);
  await expect.poll(() => names(a.page, 'webcockpit')).toEqual(['default', 'khazdul']);
  await putIdb(a.page, 'webcockpit', 'profiles', [profile('w1', 'warrior')]);
  await putIdb(a.page, 'webcockpit', 'scripts', [{ id: 's1', name: 'hunt', source: '-- @name hunt\nprint(1)', enabled: false, created: 1, updated: 1 }]);

  // Create account on A: the move.
  await openAccount(a.page);
  await link(a.page, 'create').click();
  await fillCreate(a.page, name);
  await expect(btn(a.page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(a.page, 'CREATE').click();
  await expect(pageOf(a.page, 'code')).toBeVisible({ timeout: 30_000 });
  const code = await shownCode(a.page);
  await field(a.page, 'last').fill(code.slice(-4));
  await awayFromMenu(a.page);
  await field(a.page, 'last').press('Enter');
  await expect(menuFlash(a.page)).toHaveText(`Moved into ${name}: 1 profile, 1 script. This device is back at its starting set.`, { timeout: 30_000 });
  expect(await names(a.page, 'webcockpit')).toEqual(['default', 'khazdul']);

  // B logs in: the account's things, none of its own.
  const b = await device(browser);
  await openStart(b.page);
  await putIdb(b.page, 'webcockpit', 'profiles', [profile('b1', 'phoneonly')]);
  await logIn(b.page, name);
  await expect.poll(() => names(b.page, DB)).toEqual(['default', 'khazdul', 'warrior']);
  await expect.poll(() => names(b.page, DB, 'scripts')).toEqual(['hunt']);

  // An edit on A reaches B.
  await putIdb(a.page, DB, 'profiles', [profile('w1', 'warrior', '#nop edited on A', 2000)]);
  await account(a.page);
  await syncNow(a.page);
  await account(b.page);
  await syncNow(b.page);
  const warriorOnB = async (): Promise<unknown> => (await getIdb(b.page, DB, 'profiles')).find((p) => p.name === 'warrior')?.text;
  await expect.poll(warriorOnB).toBe('#nop edited on A');

  // Stage 62: a settings change and a Comm message on A reach B (settings per device type, Comm per day, gzip).
  await a.page.keyboard.press('Escape');
  const size = (p: Page): Promise<number> => p.evaluate(() => window.__wc!.settings.get().appearance.size);
  const want = (await size(a.page)) === 21 ? 22 : 21;
  await a.page.evaluate((v) => window.__wc!.settings.update({ appearance: { size: v } }), want);
  await expect.poll(async () => (await getIdb(a.page, DB, 'settings')).some((r) => (r as { appearance?: { size?: number } }).appearance?.size === want)).toBe(true);
  const tell = { character: 'Testchar', ts: Date.now() - 1000, channel: 'tells', talker: 'Gibur', talkerType: 'player', destination: null, text: "Gibur tells you 'across'" };
  await putIdb(a.page, DB, 'comm', [tell]);
  await account(a.page);
  await syncNow(a.page);
  await b.page.keyboard.press('Escape');
  await account(b.page);
  await syncNow(b.page);
  await expect.poll(() => size(b.page)).toBe(want);
  await expect.poll(async () => (await getIdb(b.page, DB, 'comm')).map((r) => r.text)).toEqual([tell.text]);
  await b.page.keyboard.press('Escape');
  await expect(b.page.locator('.wc-start').getByText(/Settings from/)).toHaveCount(0); // applied quietly (pick 2a)
  await account(b.page);

  // Stage 63: a saved run on A goes up (R2 of the local Worker), is listed, B fetches it; a delete takes it everywhere.
  const RUN = 'Testchar/run-1';
  const T = Date.now() * 1000 - 3_600_000_000;
  await putIdb(a.page, DB, 'runChunks', [{ runId: RUN, seq: 0, firstUs: T, lastUs: T + 1000, text: 'You are in a dark room.\n' }]);
  await putIdb(a.page, DB, 'runEvents', [{ runId: RUN, seq: 0, event: { type: 'run_start', us: T } }]);
  await putIdb(a.page, DB, 'runs', [{ runId: RUN, character: 'Testchar', startedUs: T, endedUs: T + 2000, sealed: true, bytes: 24, lines: 1, saved: true, rating: 3, savedUs: T + 2000 }]);
  const stateOn = async (p: Page): Promise<unknown> => (await getIdb(p, DB, 'runCloud')).find((r) => r.runId === RUN)?.state;
  await syncNow(a.page); // a sync that ends synced starts the queue
  await expect.poll(() => stateOn(a.page), { timeout: 20_000 }).toBe('up');
  const listed = (p: Page): Promise<number> =>
    p.evaluate(async () => ((await (await fetch('/api/u/runs', { credentials: 'same-origin' })).json()) as { bodies: unknown[] }).bodies.length);
  await expect.poll(() => listed(a.page), { timeout: 20_000 }).toBe(1);
  await syncNow(a.page); // the item (its push may be in flight already)
  await b.page.keyboard.press('Escape');
  await account(b.page);
  await syncNow(b.page);
  await expect.poll(() => stateOn(b.page), { timeout: 20_000 }).toBe('remote');
  const got = await b.page.evaluate(async (id) => (await import('/src/cloud/runs-view.ts' as string)).fetchSession(id), RUN);
  expect(got).toMatchObject({ ok: true, fetched: 1 });
  expect(await stateOn(b.page)).toBe('up');
  expect((await getIdb(b.page, DB, 'runChunks')).map((c) => c.text)).toEqual(['You are in a dark room.\n']);
  expect((await getIdb(b.page, DB, 'runs')).find((r) => r.runId === RUN)).toMatchObject({ rating: 3, saved: true });
  await a.page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    for (const s of await lib.listSessions(Date.now() * 1000)) if (s.character === 'Testchar') await lib.remove(s);
  });
  await expect.poll(() => listed(a.page), { timeout: 20_000 }).toBe(0);
  await syncNow(b.page);
  await expect.poll(() => stateOn(b.page), { timeout: 20_000 }).toBeUndefined();
  expect((await getIdb(b.page, DB, 'runs')).filter((r) => r.runId === RUN)).toEqual([]);

  // Stage 64: a share link made on A, watched by a guest, removed.
  const made = await a.page.evaluate(async (payload) => {
    const gz = new Uint8Array(await new Response(new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const h = { 'X-WC': '1', 'Content-Type': 'application/json' };
    const prefs = await fetch('/api/u/account/prefs', { method: 'PATCH', headers: h, body: JSON.stringify({ rulesAccepted: true }), credentials: 'same-origin' });
    const { pubBody } = await import('/src/cloud/pub/api.ts' as string);
    const body = pubBody({ title: 'Clearing the ranger camp', description: 'A test link.', character: 'Rasta', level: 42, lengthS: 5, listed: false, key: 'syncworkerkey0001' }, gz);
    const res = await fetch('/api/u/pub', { method: 'POST', headers: { 'X-WC': '1', 'Content-Type': 'application/octet-stream' }, body, credentials: 'same-origin' });
    return { prefs: prefs.status, status: res.status, id: ((await res.json()) as { pub?: { id: string } }).pub?.id };
  }, demoPayload());
  expect(made).toMatchObject({ prefs: 200, status: 200 });
  const g = await device(browser);
  await g.page.goto(`/r/${made.id}?cloudtest`);
  await expect(g.page.locator('[data-watch="title"]')).toHaveText('Clearing the ranger camp', { timeout: 30_000 });
  await expect(g.page.locator('[data-watch="sender"]')).toHaveText(name);
  await expect(g.page.locator('.wc-watch-page')).toHaveAttribute('data-watch', 'playing', { timeout: 30_000 });
  const views = (): Promise<number> => g.page.evaluate(async (id) => ((await (await fetch(`/api/pub/${id}`)).json()) as { views: number }).views, made.id);
  await expect.poll(views, { timeout: 15_000 }).toBe(1);
  const removed = await a.page.evaluate(async (id) => (await fetch(`/api/u/pub/${id}`, { method: 'DELETE', headers: { 'X-WC': '1' }, credentials: 'same-origin' })).status, made.id);
  expect(removed).toBe(204);
  await g.page.reload();
  await expect(g.page.locator('[data-watch="end"]')).toContainText('removed', { timeout: 30_000 });
  await g.ctx.close();

  // The same profile changed on both: keep both.
  await putIdb(a.page, DB, 'profiles', [profile('w1', 'warrior', '#nop A again', 3000)]);
  await putIdb(b.page, DB, 'profiles', [profile('w1', 'warrior', '#nop B', 3001)]);
  await syncNow(a.page);
  await syncNow(b.page);
  const copy = (await names(b.page, DB)).find((n) => n.startsWith('warrior_from_'));
  expect(copy).toBeDefined();
  await b.page.keyboard.press('Escape');
  await expect(menuFlash(b.page)).toHaveText(`warrior was changed on two devices. Both are kept: warrior and ${copy}.`);
  await syncNow(a.page);
  expect(await names(a.page, DB)).toContain(copy!);

  // A lost session with a change not in the account: A ends B's session; B keeps its copy locked.
  await putIdb(b.page, DB, 'profiles', [profile('m1', 'mage')]);
  const endB = async (): Promise<void> => {
    await a.page.keyboard.press('Escape');
    await account(a.page);
    await frame(a.page).locator('.wc-ac-dev[data-session="other"] [data-btn="END"]').first().click();
    await dialog(a.page, 'ac-end').locator('[data-btn="END"]').click();
    await expect(frame(a.page).locator('.wc-ac-dev[data-session="other"]')).toHaveCount(0);
  };
  await endB();
  await awayFromMenu(b.page);
  await b.page.reload();
  await expect.poll(() => owner(b.page), { timeout: 20_000 }).toMatch(/logged out here/);
  await expect(b.page.locator('.wc-start .wc-sm-lock')).toContainText(`1 change is not in the account ${name} yet.`);
  // A login to the same account unlocks it and syncs the change.
  await b.page.keyboard.press('l');
  await expect(field(b.page, 'name')).toHaveValue(name);
  await submitLogin(b.page, name);
  await syncNow(a.page);
  expect(await names(a.page, DB)).toContain('mage');

  // Lost again with everything in the account: removed, and said; B's own thing is back.
  await endB();
  await awayFromMenu(b.page);
  await b.page.reload();
  await expect(menuFlash(b.page)).toHaveText(`You were logged out of ${name} on this device.`, { timeout: 20_000 });
  expect(await names(b.page, 'webcockpit')).toEqual(['default', 'khazdul', 'phoneonly']);

  // Log out on A, and log in again: the device's starting set, then the account's things.
  await a.page.keyboard.press('Escape');
  await account(a.page);
  await btn(a.page, 'LOGOUT').click();
  await expect(dialog(a.page, 'ac-logout').locator('[data-logout="all"]')).toBeVisible({ timeout: 15_000 });
  await awayFromMenu(a.page);
  await a.page.keyboard.press('Enter');
  await expect(menuFlash(a.page)).toHaveText(`Logged out. Everything is in your account ${name}.`, { timeout: 20_000 });
  expect(await names(a.page, 'webcockpit')).toEqual(['default', 'khazdul']);
  await logIn(a.page, name);
  await expect.poll(() => names(a.page, DB)).toEqual(['default', 'khazdul', 'mage', 'warrior', copy!].sort());

  // Delete account on A: its things become the device's.
  await account(a.page);
  await btn(a.page, 'DELETE').click();
  await field(a.page, 'password').fill(PASSWORD);
  await field(a.page, 'confirm').fill(name);
  await dialog(a.page, 'ac-delete').locator('[data-btn="DELETE"]').click();
  await expect(menuFlash(a.page)).toHaveText(`The account ${name} is deleted. Its profiles, scripts and runs are this device’s now.`, { timeout: 30_000 });
  expect(await names(a.page, 'webcockpit')).toEqual(['default', 'khazdul', 'mage', 'warrior', copy!].sort());
  expect(await names(a.page, 'webcockpit', 'scripts')).toEqual(['hunt']);
  expect(errors).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});
