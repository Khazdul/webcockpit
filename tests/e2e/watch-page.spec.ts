// Stage 64 C2 (spec §7.7, ADR 0154 "The watch page"; round 12's picks 3a
// and 5): `/r/<id>` boots straight into the watch page, a band over the
// sandboxed replay. A guest watches a seeded run; every state; one view
// per page load; Report logged in and out; Download as HTML makes a file
// that plays; Back; `?admin`. Desktop (Chromium and Firefox); the phone's
// in phone-watch-page.spec.ts.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { demoPayload } from './cloud-pub-fake';
import {
  ID,
  SENDER,
  WATCHER,
  band,
  dialog,
  endBox,
  expectEnd,
  guestWatches,
  logIn,
  openWatch,
  playing,
  replay,
  setUp,
  watchBtn,
} from './watch-page';

test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('a guest watches a seeded run: no start page, the band, the replay, one view; Back to the start page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = await setUp(page);
  await guestWatches(page, s);
  // No start page and no cockpit under it.
  await expect(page.locator('.wc-start')).toHaveCount(0);
  await expect(page.locator('#wc-first')).toHaveCount(0);
  await expect(band(page).locator('[data-watch="description"]')).toHaveText('Norsy and Kuzzim join at the ford; the rangers first, then the acolytes.');
  await expect(page).toHaveTitle('Clearing the ranger camp · WebCockpit');
  // The frame is the sandboxed one.
  await expect(page.locator('.wc-watch-slot iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(replay(page).locator('.wc-player')).toContainText('hardened ranger');
  // The page asked the public meta and payload only.
  expect(s.pubs.payloadRequests).toEqual([`/api/pub/${ID}/payload`]);
  await watchBtn(page, 'BACK').click();
  await expect(page).toHaveURL(/\/\?cloudtest$/);
  await expect(page.locator('.wc-start .wc-sm-item').first()).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('a reload counts again only as the server says: one request per page load', async ({ page }) => {
  const s = await setUp(page);
  await openWatch(page);
  await playing(page);
  await expect.poll(() => s.pubs.viewRequests.length).toBe(1);
  await page.reload();
  await playing(page);
  await expect.poll(() => s.pubs.viewRequests.length).toBe(2);
  // The same device on the same day: the server counts it once.
  expect(s.pubs.views).toHaveLength(1);
  expect(s.pubs.viewRequests[0]!.device).toBe(s.pubs.viewRequests[1]!.device);
});

test('every value is text: markup in the title, description, sender and character stays text', async ({ page }) => {
  const s = await setUp(page);
  const html = '<img src=x onerror="window.__pwned=1"><b>bold</b>';
  s.pubs.add({ id: 'Hostile00000', owner: SENDER, title: `T ${html}`, description: `D ${html}`, character: `C ${html}`, payload: demoPayload() });
  await openWatch(page, 'Hostile00000');
  await playing(page);
  await expect(band(page).locator('[data-watch="title"]')).toHaveText(`T ${html}`);
  await expect(band(page).locator('[data-watch="description"]')).toHaveText(`D ${html}`);
  await expect(band(page).locator('img, b:not([data-watch])')).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
});

test.describe('the states', () => {
  test('removed (410)', async ({ page }) => {
    const s = await setUp(page);
    s.pubs.setState(ID, 'removed');
    await openWatch(page);
    await expectEnd(page, 'This run was removed by its sender.', 'The link no longer leads anywhere.');
    await expect(page.locator('.wc-watch-slot')).toHaveCount(0);
  });

  test('hidden (451) for a guest, and for a watcher who is not its sender', async ({ page }) => {
    const s = await setUp(page);
    s.pubs.setState(ID, 'hidden');
    await logIn(page, s, WATCHER);
    await openWatch(page);
    await expectEnd(page, 'This run is hidden.', 'It was hidden after reports and waits for a look.');
    expect(s.pubs.payloadRequests).toEqual([]);
  });

  test('hidden, its sender: the run plays with the note, no Report, no view', async ({ page }) => {
    const s = await setUp(page);
    s.pubs.setState(ID, 'hidden');
    await logIn(page, s, SENDER);
    await openWatch(page);
    await playing(page);
    await expect(band(page).locator('[data-watch="owner-note"]')).toHaveText(
      'Hidden after reports. Only you can watch it until we have looked; nothing is needed from you.',
    );
    await expect(watchBtn(page, 'REPORT')).toHaveCount(0);
    expect(s.pubs.payloadRequests).toEqual([`/api/u/pub/${ID}/payload`]);
    await page.waitForTimeout(500);
    expect(s.pubs.viewRequests).toEqual([]);
  });

  test('unknown: a 404, and an address that is no id', async ({ page }) => {
    await setUp(page);
    await openWatch(page, 'Zz9Zz9Zz9Zz9');
    await expectEnd(page, 'There is no run at this link.', 'Check the address, or ask whoever sent it.');
    await openWatch(page, 'not-an-id');
    await expectEnd(page, 'There is no run at this link.');
    await page.goto('/r/a.b?cloudtest');
    await expectEnd(page, 'There is no run at this link.');
  });

  test('"This link does not work yet." with the flag share off', async ({ page }) => {
    const s = await setUp(page, { share: false });
    await openWatch(page);
    await expectEnd(page, 'This link does not work yet.', 'Shared runs open soon. Until then the link leads nowhere.');
    expect(s.pubs.payloadRequests).toEqual([]);
  });

  test('a failed request says so and Try again loads the run', async ({ page }) => {
    const s = await setUp(page);
    s.pubs.failPublic = 503;
    await openWatch(page);
    await expectEnd(page, 'The run could not be loaded.', 'Check the connection and try again.');
    s.pubs.failPublic = null;
    await endBox(page).locator('[data-btn="RETRY"]').click();
    await playing(page);
  });

  test('a failed /api/config is a failure with Try again, which asks for it again (review fix CR1)', async ({ page }) => {
    await setUp(page);
    let configs = 0;
    await page.route('**/api/config', async (route) => {
      configs++;
      if (configs === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' });
      return route.fallback();
    });
    await openWatch(page);
    await expectEnd(page, 'The run could not be loaded.', 'Check the connection and try again.');
    await endBox(page).locator('[data-btn="RETRY"]').click();
    await playing(page);
    expect(configs).toBe(2);
  });

  test('a payload the page refuses: its one line, no frame', async ({ page }) => {
    const s = await setUp(page);
    s.pubs.add({ id: 'Broken000000', owner: SENDER, payload: new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3, 4, 5, 6, 7]) });
    s.pubs.add({ id: 'NotReplay000', owner: SENDER, payload: { schema: 99, nothing: true } });
    await openWatch(page, 'Broken000000');
    await expectEnd(page, 'This replay could not be read (damaged data).');
    await expect(page.locator('iframe')).toHaveCount(0);
    await openWatch(page, 'NotReplay000');
    await expectEnd(page, 'This replay could not be read (not a valid replay).', 'The link works, but this run cannot be played. Tell whoever sent it.');
  });

  test('loading: the band first, the bar in the frame', async ({ page }) => {
    await setUp(page);
    // The payload waits until the test lets it go.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(`**/api/pub/${ID}/payload`, async (route) => {
      await held;
      await route.fallback();
    });
    await openWatch(page);
    await expect(band(page).locator('[data-watch="title"]')).toHaveText('Clearing the ranger camp');
    await expect(page.locator('.wc-watch-wait .wc-lk-load-l')).toHaveText(/^Loading the run…/);
    await expect(watchBtn(page, 'DOWNLOAD')).toHaveAttribute('aria-disabled', 'true');
    release();
    await playing(page);
    await expect(page.locator('.wc-watch-wait')).toHaveCount(0);
  });
});

test.describe('Report', () => {
  test('logged out: "Log in to report" with the abuse address; Log in opens the start page\'s Log in', async ({ page }) => {
    await setUp(page);
    await openWatch(page);
    await playing(page);
    await watchBtn(page, 'REPORT').click();
    const d = dialog(page, 'report-guest');
    await expect(d.locator('.wc-lk-q')).toHaveText('Log in to report.');
    await expect(d.locator('.wc-lk-qn')).toHaveText('Reports come from accounts, one per run. Without an account, write to abuse@mumecockpit.com with the link.');
    await expect(d.locator('a.wc-watch-mail')).toHaveAttribute('href', 'mailto:abuse@mumecockpit.com');
    await d.locator('[data-btn="CLOSE"]').click();
    await expect(d).toHaveCount(0);
    await watchBtn(page, 'REPORT').click();
    await dialog(page, 'report-guest').locator('[data-btn="LOGIN"]').click();
    await expect(page).toHaveURL(/\/\?cloudtest$/);
    await expect(page.locator('.wc-start [data-page="login"]')).toBeVisible({ timeout: 15_000 });
    const note = await page.evaluate(() => JSON.parse(sessionStorage.getItem('wc.watch.back') ?? 'null') as { back: string; step: string } | null);
    expect(note).toMatchObject({ back: `/r/${ID}?cloudtest`, step: 'return' });
  });

  test('logged in: a reason and a text, thanks; again: already reported', async ({ page }) => {
    const s = await setUp(page);
    await logIn(page, s, WATCHER);
    await openWatch(page);
    await playing(page);
    await watchBtn(page, 'REPORT').click();
    const d = dialog(page, 'report');
    await expect(d.locator('.wc-lk-hood-t')).toHaveText('Report this run');
    await expect(d).toContainText('What is wrong with “Clearing the ranger camp”?');
    await expect(d.locator('[role="radio"]')).toHaveText(['Harassment', 'Real-life information about someone', 'Breaks MUME’s rules', 'Other']);
    await expect(d).toContainText('The sender is not told who reported.');
    await expect(d.locator('[data-btn="SEND"]')).toHaveAttribute('aria-disabled', 'true');
    await d.locator('[data-reason="real_life"]').click();
    await expect(d.locator('[data-reason="real_life"]')).toHaveAttribute('aria-checked', 'true');
    await d.locator('[data-field="report-text"] textarea').fill('His real name is in the narrates.');
    await expect(d.locator('.wc-watch-count')).toHaveText('33 / 500');
    await d.locator('[data-btn="SEND"]').click();
    const t = dialog(page, 'report-thanks');
    await expect(t.locator('.wc-lk-q')).toHaveText('Thank you.');
    await expect(t.locator('.wc-lk-qn')).toHaveText('We look at every report. A run that breaks the rules is removed; one that many report is hidden until then.');
    expect(s.pubs.reports).toEqual([{ kind: 'run', target: ID, reason: 'real_life', text: 'His real name is in the narrates.', account: WATCHER }]);
    await t.locator('[data-btn="CLOSE"]').click();
    await watchBtn(page, 'REPORT').click();
    await expect(dialog(page, 'report-already').locator('.wc-lk-q')).toHaveText('You have already reported this run.');
  });

  test('logged in: the server\'s 409 is "already reported"; its 429 is a line in the dialog; the keys', async ({ page }) => {
    const s = await setUp(page);
    await logIn(page, s, WATCHER);
    s.pubs.reports.push({ kind: 'run', target: ID, reason: 'other', account: WATCHER });
    await openWatch(page);
    await playing(page);
    // R opens it from the page (the replay has the keys once it plays: a click on the band gives them back).
    await band(page).locator('[data-watch="title"]').click();
    await page.keyboard.press('r');
    const d = dialog(page, 'report');
    await expect(d).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(d.locator('[data-reason="harassment"]')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(d.locator('[data-reason="real_life"]')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Enter');
    await expect(dialog(page, 'report-already')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page, 'report-already')).toHaveCount(0);
    // Another run, 30 reports today already.
    s.pubs.reports = Array.from({ length: 30 }, (_, i) => ({ kind: 'run' as const, target: `Other${String(i).padStart(7, '0')}`, reason: 'other' as const, account: WATCHER }));
    await page.reload();
    await playing(page);
    await watchBtn(page, 'REPORT').click();
    await dialog(page, 'report').locator('[data-reason="rules"]').click();
    await dialog(page, 'report').locator('[data-btn="SEND"]').click();
    await expect(dialog(page, 'report').locator('.wc-lk-dialog-err')).toHaveText('You have sent the most reports a day. Try again tomorrow.');
  });

  test('not on one\'s own run', async ({ page }) => {
    const s = await setUp(page);
    await logIn(page, s, SENDER);
    await openWatch(page);
    await playing(page);
    await expect(watchBtn(page, 'REPORT')).toHaveCount(0);
  });
});

test('Download as HTML makes the exporter\'s file, and it plays', async ({ page, context }, info) => {
  await setUp(page);
  await openWatch(page);
  await playing(page);
  const [download] = await Promise.all([page.waitForEvent('download'), watchBtn(page, 'DOWNLOAD').click()]);
  expect(download.suggestedFilename()).toBe('Clearing the ranger camp.html');
  const file = info.outputPath('replay.html');
  await download.saveAs(file);
  const html = readFileSync(file, 'utf8');
  expect(html).toMatch(/^<!doctype html>/i);
  const p2 = await context.newPage();
  await p2.goto(`file://${file}`);
  await expect(p2.locator('.wc-player')).toBeVisible({ timeout: 20_000 });
  await expect(p2.locator('.wc-player')).toContainText('hardened ranger');
});

test.describe('?admin', () => {
  test('the admin watches a hidden run through the admin\'s endpoints, with a note; nothing is counted', async ({ page }) => {
    const s = await setUp(page);
    s.pubs.setState(ID, 'hidden');
    await openWatch(page, ID, '&admin');
    await playing(page);
    await expect(band(page).locator('[data-watch="admin-note"]')).toHaveText('Admin view. This run is hidden from everyone else.');
    await expect(watchBtn(page, 'REPORT')).toHaveCount(0);
    expect(s.pubs.payloadRequests).toEqual([`/api/admin/pub/${ID}/payload`]);
    await page.waitForTimeout(500);
    expect(s.pubs.viewRequests).toEqual([]);
  });

  test('without Access: the admin\'s words', async ({ page }) => {
    const s = await setUp(page);
    s.pubs.adminAllowed = false;
    await openWatch(page, ID, '&admin');
    await expectEnd(page, 'This view is for the admin.', 'Open the link without ?admin to watch it as anyone does.');
  });
});

test('a tablet-sized window: the band in one row, the replay under it', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setUp(page);
  await openWatch(page);
  await playing(page);
  const b = (await band(page).boundingBox())!;
  const f = (await page.locator('.wc-watch-slot').boundingBox())!;
  expect(b.height).toBeLessThan(130);
  expect(f.y).toBeGreaterThanOrEqual(b.y + b.height - 1);
  expect(f.height).toBeGreaterThan(600);
  await expect(watchBtn(page, 'DOWNLOAD')).toHaveText('Download as HTML');
});

test('/privacy says what a share link makes public with the flag share on; About gives the abuse address', async ({ page }) => {
  const s = await setUp(page);
  await page.goto('/privacy?cloudtest');
  await expect(page.locator('.wc-about-h', { hasText: 'SHARE LINKS' })).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.wc-about-rail [data-sec-link="share"]')).toHaveText('Share links');
  await expect(page.locator('.wc-about-sec[data-sec="share"] a[href="mailto:abuse@mumecockpit.com"]')).toHaveCount(1);
  // Off: not there.
  s.api.server.flags = { accounts: true, share: false };
  await page.reload();
  await expect(page.locator('.wc-about-h', { hasText: 'ACCOUNTS' })).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.wc-about-h', { hasText: 'SHARE LINKS' })).toHaveCount(0);
});
