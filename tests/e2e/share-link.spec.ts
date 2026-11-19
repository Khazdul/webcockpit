// Stage 64 C1 (spec §7.7, ADR 0154; round 12's picks 1a, 2a, 4a): a run
// shared as a link from the export editor, and Published runs on the
// Account page, on a desktop, against the fake of the account API with the
// flag `share` (cloud-account-fake.ts, `?cloudtest`). The phone:
// phone-share-link.spec.ts.
//
// - A guest sees Link greyed; a press, L and a pointer over it say "Log in
//   to share". With `share` off there is no Link.
// - The first share: the rules' tick in the dialog, then the link with
//   Copy. What went to the server during it: the tick, then one POST whose
//   body is the 4-byte length, the meta and the gzip of a payload with only
//   the whitelisted settings; nothing of the doc, the runs or the keys.
// - The second share: no rules, one POST.
// - The refusals: too large (known before Create link: nothing is sent),
//   150 reached (with Open Account), offline (Try again).
// - Published runs: the list (a hidden run's note), Copy, Edit, Remove,
//   empty; no section with `share` off.
import { writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { PREVIEW_MAX_BYTES, isPreviewPng } from '../../shared/cloud/preview';
import { type Page, type Request, expect, test } from '@playwright/test';
import { REPLAY_SETTINGS_KEYS } from '../../src/share/replay-settings';
import { validatePayload } from '../../src/replay/validate';
import { DESKTOP, NAME, PASSWORD, accountRow, btn, dialog, dialogError, field, frame, openAccount, openStart, pageOf, watchErrors } from './account-pages';
import { FakeAccountServer, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { pinDemoClock } from './demo-clock';

test.use({ viewport: DESKTOP });

const exp = (page: Page) => frame(page).locator('.wc-exp');
const opt = (page: Page, id: string) => frame(page).locator(`.wc-exp-outs [data-opt="${id}"]`);
const flash = (page: Page) => frame(page).locator('.wc-exp-flash');
const share = (page: Page) => dialog(page, 'share');
const done = (page: Page) => dialog(page, 'share-done');
const pubRows = (page: Page) => frame(page).locator('.wc-ac-pub');
const MB = 1024 * 1024;

async function server(o: { share?: boolean } = {}): Promise<FakeAccountServer> {
  const s = new FakeAccountServer();
  s.flags = { accounts: true, share: o.share ?? true };
  await seedAccount(s, NAME, PASSWORD);
  return s;
}

/** The demo runs restored (before any page of the app asks for them). */
async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__wc !== undefined);
  await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

/** Logs in from the start page (the Account page), then back to the start menu. */
async function logIn(page: Page): Promise<void> {
  await openAccount(page);
  await field(page, 'name').fill(NAME);
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'LOGIN').click();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(frame(page).locator('.wc-ac-head-since')).toContainText('Account since');
  await page.keyboard.press('Escape');
  await expect(accountRow(page)).toHaveText(NAME);
}

/** Start menu → History → Share on the Rasta session. */
async function openEditor(page: Page): Promise<void> {
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  const hist = frame(page).locator('.wc-hist');
  await expect(hist.locator('.wc-lk-tr')).toHaveCount(3);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(hist.locator('.wc-lk-tr.is-on')).toContainText('Rasta');
  await hist.locator('[data-btn="EXPORT"]').click();
  await expect(exp(page)).toBeVisible();
  await expect(frame(page).locator('.wc-exp-row').first()).toBeVisible();
}

async function start(page: Page, s: FakeAccountServer, o: { login?: boolean } = {}): Promise<void> {
  await pinDemoClock(page);
  await fakeAccountApi(page, { server: s });
  await openStart(page);
  await restoreDemo(page);
  if (o.login !== false) await logIn(page);
  await openEditor(page);
}

/** Every request to the API from now on (method, path, the body's bytes). */
function apiLog(page: Page): { method: string; path: string; body: Buffer | null }[] {
  const log: { method: string; path: string; body: Buffer | null }[] = [];
  page.on('request', (r: Request) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) log.push({ method: r.method(), path: u.pathname, body: r.postDataBuffer() });
  });
  return log;
}

test('a guest sees Link greyed: a press, L and a pointer over it say "Log in to share"', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page, await server(), { login: false });
  await expect(opt(page, 'LINK')).toBeVisible();
  await expect(opt(page, 'LINK')).toHaveAttribute('aria-disabled', 'true');
  await expect(opt(page, 'LINK')).toHaveAttribute('aria-keyshortcuts', 'L');
  // The order: HTML replay, Plain text, Link.
  await expect(frame(page).locator('.wc-exp-outs .wc-lk-opt')).toHaveText(['HTML replay', 'Plain text', 'Link']);
  await opt(page, 'LINK').hover();
  await expect(frame(page).locator('.wc-exp-tip')).toHaveText('Log in to share');
  // (The option is aria-disabled: a real press still lands on it.)
  await opt(page, 'LINK').click({ force: true });
  await expect(flash(page)).toContainText('Log in to share. Account is on the start page.');
  await expect(opt(page, 'HTML')).toHaveAttribute('aria-checked', 'true');
  await page.mouse.move(1, 1);
  await expect(frame(page).locator('.wc-exp-tip')).toHaveCount(0);
  await page.keyboard.press('l');
  await expect(flash(page)).toContainText('Log in to share');
  // The file is still chosen (no dialog); the action reads Download (ADR 0155 W1).
  await expect(exp(page)).toHaveAttribute('data-format', 'html');
  await expect(btn(page, 'EXPORT')).toHaveText('Download');
  expect(errors).toEqual([]);
});

test('with share off there is no Link', async ({ page }) => {
  await start(page, await server({ share: false }));
  await expect(frame(page).locator('.wc-exp-outs .wc-lk-opt')).toHaveText(['HTML replay', 'Plain text']);
  await page.keyboard.press('l');
  await expect(exp(page)).toHaveAttribute('data-format', 'html');
});

test('the first share: the rules ticked in the dialog, the link with Copy; only the tick and the cut went to the server', async ({ page, context, browserName }) => {
  const errors = watchErrors(page);
  const s = await server();
  await start(page, s);
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Link chosen by its letter: the file row says Title, the title is the character and date.
  await page.keyboard.press('l');
  await expect(opt(page, 'LINK')).toHaveAttribute('aria-checked', 'true');
  await expect(exp(page)).toHaveAttribute('data-format', 'link');
  await expect(frame(page).locator('.wc-exp-flabel')).toHaveText('Title');
  await expect(frame(page).locator('.wc-exp-title')).toHaveText('Rasta · 26 September 2026');
  await expect(frame(page).locator('.wc-exp-fn em')).toHaveCount(0);

  // The action reads Share with Link chosen, its letter S (ADR 0155 W1).
  await expect(btn(page, 'EXPORT')).toHaveText('Share');
  await expect(btn(page, 'EXPORT')).toHaveAttribute('aria-keyshortcuts', 'S');
  const log = apiLog(page);
  await page.keyboard.press('s');
  await expect(share(page)).toBeVisible();
  await expect(share(page).locator('.wc-lk-hood-t')).toHaveText('Share as a link');
  await expect(share(page).locator('[data-field="title"] input')).toHaveValue('Rasta · 26 September 2026');
  await expect(share(page).locator('[data-field="title"] .wc-lk-fhint')).toHaveText('From the character and date; yours to change.');
  await expect(share(page).locator('[data-field="desc"] textarea')).toHaveAttribute('placeholder', 'Optional: what happens, who is in it');
  await expect(share(page).locator('.wc-sh-count')).toHaveText('0 / 500');
  await expect(share(page).locator('.wc-sh-size')).toHaveText(/^\d+(\.\d)? (KB|MB) of 5 MB$/);
  await expect(share(page).locator('.wc-sh-anyone')).toHaveText('Anyone with the link can watch this.');
  await expect(share(page).locator('.wc-sh-rules-h')).toHaveText('The rules, once for your account');
  await expect(share(page).locator('.wc-sh-rules-l li')).toHaveCount(5);
  await expect(share(page).locator('[data-field="rules"]')).toHaveText('I have read this and agree');
  // Create link waits for the tick.
  await expect(btn(page, 'CREATE')).toHaveText('Create link');
  await expect(btn(page, 'CREATE')).toHaveAttribute('aria-disabled', 'true');

  await share(page).locator('[data-field="title"] input').fill('Clearing the ranger camp');
  await share(page).locator('[data-field="desc"] textarea').fill('Norsy and Kuzzim join at the ford.');
  await expect(share(page).locator('.wc-sh-count')).toHaveText('34 / 500');
  await share(page).locator('[data-field="rules"]').click();
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'CREATE').click();

  await expect(done(page)).toBeVisible();
  await expect(done(page).locator('.wc-lk-hood-t')).toHaveText('Link created');
  await expect(done(page).locator('[data-pub-title]')).toHaveText('Clearing the ranger camp');
  const id = s.pubsOf(NAME)[0]!.id;
  const origin = new URL(page.url()).origin;
  await expect(done(page).locator('[data-field="link"] input')).toHaveValue(`${origin}/r/${id}`);
  await expect(done(page).locator('.wc-sh-note')).toHaveText(
    'Anyone with the link can watch this. You find it again, and can remove it, on the Account page under Published logs.',
  );
  await btn(page, 'COPY').click();
  await expect(done(page).locator('.wc-sh-copied')).toHaveText(/^(Copied\.|Could not copy here: select the link and copy it\.)$/);
  if (browserName === 'chromium') {
    await expect(done(page).locator('.wc-sh-copied')).toHaveText('Copied.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/r/${id}`);
  }

  // The server holds the tick and the run.
  expect(s.stored(NAME)!.prefs.rulesAccepted).toBe(true);
  expect(s.pubsOf(NAME)).toHaveLength(1);
  expect(s.pubsOf(NAME)[0]).toMatchObject({ title: 'Clearing the ranger camp', description: 'Norsy and Kuzzim join at the ford.', character: 'Rasta', listed: false });

  // What went to the API while the dialog was up: the account (a GET), the tick, the one POST.
  // (The preview image's PUT comes after the link, in the background: checked below.)
  const writes = log.filter((r) => r.method !== 'GET' && !r.path.endsWith('/preview'));
  expect(writes.map((r) => `${r.method} ${r.path}`)).toEqual(['PATCH /api/u/account/prefs', 'POST /api/u/pub']);
  expect(log.filter((r) => r.method === 'GET').map((r) => r.path)).toEqual(['/api/u/account']);
  expect(JSON.parse(writes[0]!.body!.toString('utf8'))).toEqual({ rulesAccepted: true });
  const body = writes[1]!.body!;
  const n = body.readUInt32BE(0);
  const meta = JSON.parse(body.subarray(4, 4 + n).toString('utf8')) as Record<string, unknown>;
  expect(Object.keys(meta).sort()).toEqual(['character', 'description', 'key', 'lengthS', 'level', 'listed', 'title']);
  expect(meta).toMatchObject({ title: 'Clearing the ranger camp', description: 'Norsy and Kuzzim join at the ford.', character: 'Rasta', listed: false });
  const gz = body.subarray(4 + n);
  expect([gz[0], gz[1]]).toEqual([0x1f, 0x8b]);
  expect(Buffer.from(s.pubUploads[0]!.payload).equals(gz)).toBe(true);
  const json = gunzipSync(gz).toString('utf8');
  const payload = JSON.parse(json) as Record<string, unknown>;
  // A schema-1 replay payload with only the whitelisted settings, as the watch page will read it.
  expect(() => validatePayload(payload)).not.toThrow();
  expect(Object.keys(payload.settings as object).sort()).toEqual([...REPLAY_SETTINGS_KEYS].sort());
  expect(Object.keys(payload).every((k) => ['schema', 'title', 'character', 'level', 'startUs', 'settings', 'runs', 'comments', 'cuts', 'markers', 'hiddenSys', 'map'].includes(k))).toBe(true);
  // Nothing of the export doc, the run library's records or the account's keys.
  expect(json).not.toMatch(/"sessionId"|"excludes"|"runId"|"sealed"|"endedUs"|wrapPw|authKey|dataKey|"profile"|"spotlights"|"phone"/);
  expect(body.length).toBe(4 + n + gz.length);

  // The link preview image (ADR 0158): drawn here after the link and sent as one PUT of a PNG.
  await expect.poll(() => s.pubPreviews.has(id), { timeout: 15_000 }).toBe(true);
  const preview = s.pubPreviews.get(id)!;
  expect(preview.length).toBeLessThanOrEqual(PREVIEW_MAX_BYTES);
  expect(isPreviewPng(preview)).toBe(true);
  expect(log.filter((r) => r.path.endsWith('/preview')).map((r) => `${r.method} ${r.path}`)).toEqual([`PUT /api/u/pub/${id}/preview`]);
  // `WC_PREVIEW_SAMPLE=<file>` keeps the image to look at.
  if (process.env.WC_PREVIEW_SAMPLE) writeFileSync(process.env.WC_PREVIEW_SAMPLE, preview);

  await btn(page, 'DONE').click();
  await expect(done(page)).toHaveCount(0);
  await expect(exp(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('Esc cancels the dialog; Link stays chosen; nothing was sent', async ({ page }) => {
  const s = await server();
  await start(page, s);
  await opt(page, 'LINK').click();
  await btn(page, 'EXPORT').click();
  await expect(share(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(share(page)).toHaveCount(0);
  await expect(exp(page)).toHaveAttribute('data-format', 'link');
  expect(s.pubUploads).toHaveLength(0);
  expect(s.requests('PATCH /api/u/account/prefs')).toHaveLength(0);
});

test('the second share: the form alone, Enter creates the link with one POST', async ({ page }) => {
  const s = await server();
  await start(page, s);
  // First share: ticks the rules.
  await opt(page, 'LINK').click();
  await btn(page, 'EXPORT').click();
  await share(page).locator('[data-field="rules"]').click();
  await btn(page, 'CREATE').click();
  await btn(page, 'DONE').click();
  await expect(done(page)).toHaveCount(0);

  const log = apiLog(page);
  await btn(page, 'EXPORT').click();
  await expect(share(page)).toBeVisible();
  await expect(share(page).locator('[data-rules]')).toHaveCount(0);
  await expect(share(page).locator('.wc-sh-size')).toHaveText(/ of 5 MB$/);
  // The title field has the focus: Enter creates the link.
  await expect(share(page).locator('[data-field="title"] input')).toBeFocused();
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(done(page)).toBeVisible();
  expect(log.filter((r) => r.method !== 'GET' && !r.path.endsWith('/preview')).map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/u/pub']);
  expect(s.pubsOf(NAME)).toHaveLength(2);
  // A link's doc keeps no link: the export doc's format stays as stored.
  await page.keyboard.press('Escape');
  await expect(done(page)).toHaveCount(0);
});

test('the refusals: too large (nothing sent), 150 reached (Open Account), offline (Try again)', async ({ page }) => {
  const errors = watchErrors(page);
  const s = await server();
  await start(page, s);
  await opt(page, 'LINK').click();

  // Too large: the account's limit is below the payload; the dialog knows before Create link.
  s.setLimits(NAME, { payloadMaxBytes: 1024 });
  const log = apiLog(page);
  await btn(page, 'EXPORT').click();
  await expect(share(page).locator('.wc-sh-size')).toHaveClass(/is-over/);
  await expect(share(page).locator('.wc-sh-size')).toHaveText(/^\d+(\.\d)? (KB|MB) of 1 KB$/);
  await expect(dialogError(page)).toHaveText('Too large: a link holds at most 1 KB. Exclude more of the log and try again.');
  await share(page).locator('[data-field="rules"]').click();
  await expect(btn(page, 'CREATE')).toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'CANCEL').click();
  expect(log.filter((r) => r.method !== 'GET')).toEqual([]);

  // 150 reached: the server's answer, with the way to the Account page.
  s.setLimits(NAME, { payloadMaxBytes: 5 * MB });
  for (let i = 0; i < 150; i++) s.addPub(NAME, { title: `Run ${i}` });
  await btn(page, 'EXPORT').click();
  await share(page).locator('[data-field="rules"]').click();
  await btn(page, 'CREATE').click();
  await expect(dialogError(page)).toHaveText('You have 150 published logs, the most an account can hold. Remove one on the Account page first.');
  await expect(btn(page, 'ACCOUNT')).toHaveText('Open Account');
  await expect(btn(page, 'CREATE')).toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'CANCEL').click();
  for (const p of s.pubsOf(NAME)) s.pubs.delete(p.id);

  // Offline: the form stays filled; Create link becomes Try again, and works when the network is back.
  s.pubOffline = true;
  await btn(page, 'EXPORT').click();
  await expect(share(page).locator('[data-rules]')).toHaveCount(0);
  await share(page).locator('[data-field="title"] input').fill('Offline run');
  await btn(page, 'CREATE').click();
  await expect(dialogError(page)).toHaveText('Offline: the link could not be made. Try again when you are online.');
  await expect(btn(page, 'CREATE')).toHaveText('Try again');
  await expect(share(page).locator('[data-field="title"] input')).toHaveValue('Offline run');
  s.pubOffline = false;
  await btn(page, 'CREATE').click();
  await expect(done(page)).toBeVisible();
  expect(s.pubsOf(NAME).map((p) => p.title)).toEqual(['Offline run']);
  await btn(page, 'DONE').click();
  for (const p of s.pubsOf(NAME)) s.pubs.delete(p.id);

  // The answer lost on the way back (the run was made): Try again sends the dialog's key
  // again and gets that run, not a second one (review fix CR3).
  const before = s.pubUploads.length;
  s.pubLoseAnswer = true;
  await btn(page, 'EXPORT').click();
  await share(page).locator('[data-field="title"] input').fill('Lost answer');
  await btn(page, 'CREATE').click();
  await expect(btn(page, 'CREATE')).toHaveText('Try again');
  await btn(page, 'CREATE').click();
  await expect(done(page)).toBeVisible();
  expect(s.pubsOf(NAME).map((p) => p.title)).toEqual(['Lost answer']);
  const keys = s.pubUploads.slice(before).map((u) => (u.meta as { key?: unknown }).key);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{16,32}$/);
  expect(keys[1]).toBe(keys[0]);
  expect(errors).toEqual([]);
});

test('150 reached: Open Account goes to the Account page with Published runs', async ({ page }) => {
  const s = await server();
  await start(page, s);
  for (let i = 0; i < 150; i++) s.addPub(NAME, { title: `Run ${i}` });
  await opt(page, 'LINK').click();
  await btn(page, 'EXPORT').click();
  await share(page).locator('[data-field="rules"]').click();
  await btn(page, 'CREATE').click();
  await btn(page, 'ACCOUNT').click();
  await expect(pageOf(page, 'account')).toBeVisible();
  await expect(pubRows(page)).toHaveCount(150);
  await expect(frame(page).locator('.wc-ac-pub-foot')).toContainText('150 of 150');
});

// ------------------------------------------------------------ Published runs

/** The Account page of the logged-in account (from the start menu). */
async function openAccountPage(page: Page, s: FakeAccountServer): Promise<void> {
  await fakeAccountApi(page, { server: s });
  await openAccount(page);
  await field(page, 'name').fill(NAME);
  await field(page, 'password').fill(PASSWORD);
  await btn(page, 'LOGIN').click();
  await expect(pageOf(page, 'account')).toBeVisible();
}

test('Published runs: the list after Sync, a hidden run, Copy, Edit, Remove, empty', async ({ page, context, browserName }) => {
  const errors = watchErrors(page);
  const s = await server();
  // Milliseconds, as the Worker sends them.
  const day = 86_400_000;
  const now = Date.now();
  s.addPub(NAME, { id: 'Zp6Wd3Fg5uNa', title: 'Trollshaws hoard run', views: 21, bytes: Math.round(1.9 * 1024 * 1024), state: 'hidden', created: now - 12 * day });
  s.addPub(NAME, { id: 'Hn4Kc8Vb1sYe', title: 'First crossing of the <b>Brandywine</b>', views: 1, bytes: 600 * 1024, created: now - 5 * day });
  s.addPub(NAME, { id: 'Ab3dE5fG7hJk', title: 'Clearing the ranger camp', description: 'At the ford.', views: 37, bytes: Math.round(1.2 * 1024 * 1024), created: now });
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openAccountPage(page, s);

  await expect(frame(page).locator('.wc-lk-sec')).toHaveText(['Published logs', 'Devices', 'Password and recovery', 'Leaving']);
  await expect(pubRows(page)).toHaveCount(3);
  await expect(pubRows(page).locator('[data-pub-title]')).toHaveText(['Clearing the ranger camp', 'First crossing of the <b>Brandywine</b>', 'Trollshaws hoard run']);
  await expect(pubRows(page).nth(0).locator('.wc-ac-pub-fig')).toHaveText(/^37 views · .+ 20\d\d · 1\.2 MB · link only$/);
  await expect(pubRows(page).nth(1).locator('.wc-ac-pub-fig')).toHaveText(/^1 view · .+ · 0\.6 MB · link only$/);
  await expect(pubRows(page).nth(0).locator('.wc-ac-pub-url')).toHaveText('/r/Ab3dE5fG7hJk');
  // The hidden run: dimmed, the flag and its note.
  await expect(pubRows(page).nth(2)).toHaveClass(/is-hidden/);
  await expect(pubRows(page).nth(2).locator('[data-pub-hidden]')).toHaveText('Hidden after reports. Only you can watch it until we have looked.');
  await expect(pubRows(page).nth(0).locator('[data-pub-hidden]')).toHaveCount(0);
  // A hidden run has no Edit (the Worker refuses it: 403 hidden, review fix S7).
  await expect(pubRows(page).nth(2).locator('[data-btn="EDIT"]')).toHaveCount(0);
  await expect(pubRows(page).nth(2).locator('[data-btn="REMOVE"]')).toHaveCount(1);
  await expect(frame(page).locator('.wc-ac-pub-foot')).toHaveText('3 of 150 · 3.7 MB · links do not count against your 50 MB.');
  // Markup in a title stays text.
  await expect(pubRows(page).nth(1).locator('b')).toHaveCount(0);

  // Copy.
  await pubRows(page).nth(0).locator('[data-btn="COPY"]').click();
  await expect(frame(page).locator('.wc-ac-flash')).toHaveText(/Copied the link\.|Could not copy here/);
  if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(page.url()).origin}/r/Ab3dE5fG7hJk`);

  // Edit: the title and the description; Save changes the row and the server's run.
  await pubRows(page).nth(0).locator('[data-btn="EDIT"]').click();
  const edit = dialog(page, 'pub-edit');
  await expect(edit.locator('.wc-lk-hood-t')).toHaveText('Edit');
  await expect(edit.locator('[data-field="title"] input')).toHaveValue('Clearing the ranger camp');
  await expect(edit.locator('[data-field="desc"] textarea')).toHaveValue('At the ford.');
  await expect(edit.locator('.wc-ac-pub-count')).toHaveText('12 / 500');
  await expect(edit.locator('.wc-ac-pub-note')).toHaveText(/^The log itself stays as it was cut\. localhost:\d+\/r\/Ab3dE5fG7hJk$/);
  await expect(btn(page, 'SAVE')).toHaveAttribute('aria-disabled', 'true');
  await edit.locator('[data-field="title"] input').fill('The ranger camp, cleared');
  await edit.locator('[data-field="desc"] textarea').fill('At the ford, at dusk.');
  await btn(page, 'SAVE').click();
  await expect(edit).toHaveCount(0);
  await expect(pubRows(page).nth(0).locator('[data-pub-title]')).toHaveText('The ranger camp, cleared');
  expect(s.pubsOf(NAME)[0]).toMatchObject({ title: 'The ranger camp, cleared', description: 'At the ford, at dusk.' });

  // Remove: the question first; Cancel keeps it.
  await pubRows(page).nth(1).locator('[data-btn="REMOVE"]').click();
  const rm = dialog(page, 'pub-remove');
  await expect(rm.locator('.wc-lk-q')).toHaveText('Remove “First crossing of the <b>Brandywine</b>”?');
  await expect(rm.locator('.wc-lk-qn')).toHaveText(
    'The link stops working; whoever opens it is told that the log was removed by its sender. This cannot be undone.',
  );
  await rm.locator('[data-btn="CANCEL"]').click();
  await expect(pubRows(page)).toHaveCount(3);
  await pubRows(page).nth(1).locator('[data-btn="REMOVE"]').click();
  await dialog(page, 'pub-remove').locator('[data-btn="REMOVE"]').click();
  await expect(pubRows(page)).toHaveCount(2);
  expect(s.pubsOf(NAME).map((p) => p.id)).toEqual(['Ab3dE5fG7hJk', 'Zp6Wd3Fg5uNa']);

  // The last ones removed: the empty state.
  for (let i = 0; i < 2; i++) {
    await pubRows(page).first().locator('[data-btn="REMOVE"]').click();
    await dialog(page, 'pub-remove').locator('[data-btn="REMOVE"]').click();
    await expect(pubRows(page)).toHaveCount(1 - i);
  }
  await expect(frame(page).locator('[data-pub-empty]')).toHaveText('No published logs yet. In History, Share a session and choose Link.');
  await expect(frame(page).locator('[data-pub-empty] b')).toHaveText('Link');
  expect(errors).toEqual([]);
});

test('Published runs by keyboard: Tab reaches the title, then a row\'s buttons, Enter opens Edit', async ({ page }) => {
  const s = await server();
  s.addPub(NAME, { id: 'Ab3dE5fG7hJk', title: 'Clearing the ranger camp' });
  await openAccountPage(page, s);
  await expect(pubRows(page)).toHaveCount(1);
  // The title first (it opens the watch page, ADR 0155 W1).
  await page.keyboard.press('Tab');
  await expect(pubRows(page).locator('[data-pub-title]')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('Tab');
  await expect(pubRows(page).locator('[data-btn="COPY"]')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('Tab');
  await expect(pubRows(page).locator('[data-btn="EDIT"]')).toHaveClass(/\bis-sel\b/);
  await page.keyboard.press('Enter');
  await expect(dialog(page, 'pub-edit')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page, 'pub-edit')).toHaveCount(0);
});

test('Published runs: no section with share off', async ({ page }) => {
  const s = await server({ share: false });
  await openAccountPage(page, s);
  await expect(frame(page).locator('.wc-ac-head-since')).toContainText('Account since');
  await expect(frame(page).locator('.wc-lk-sec')).toHaveText(['Devices', 'Password and recovery', 'Leaving']);
  expect(s.seen.some((r) => r.path.startsWith('/api/u/pub'))).toBe(false);
});

// The owner's feedback on stage 65 (ADR 0155 W1), with `gallery` off: the
// title opens the watch page; its Back comes to the Account page again.
// Since stage 74 (ADR 0163) the run is a frame on the start surface: Back
// is the browser's, so the address is the start page's own again.
test('Published runs: a press on the title opens the watch page; Back returns to the Account page', async ({ page }) => {
  const s = await server();
  s.addPub(NAME, { id: 'Ab3dE5fG7hJk', title: 'Clearing the ranger camp' });
  await openAccountPage(page, s);
  const title = pubRows(page).locator('[data-pub-title]');
  await expect(title).toHaveAttribute('href', '/r/Ab3dE5fG7hJk?from=account&cloudtest');
  const start = page.url();
  await title.click();
  await expect(page).toHaveURL(/\/r\/Ab3dE5fG7hJk\?from=account&cloudtest$/);
  await page.locator('.wc-watch [data-btn="BACK"]').first().click();
  await expect(pageOf(page, 'account')).toBeVisible({ timeout: 15_000 });
  await expect(pubRows(page)).toHaveCount(1);
  await expect(page).toHaveURL(start);
});
