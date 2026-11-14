// Stage 59 (spec §7.6, ADR 0147): the cloud client against a stubbed API
// (cloud-stats.ts; `?cloudtest`). "N online" by the almanac when the flag
// is on and the numbers answer, absent otherwise, and the almanac's own
// lines never move; the beat's body and its state; no API request at all
// in an automated browser without the hook. About's "What the site knows"
// and the privacy page, from About and at /privacy. The phone:
// phone-cloud-stats.spec.ts.
import { type Page, expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { stubApi } from './cloud-stats';
import { backTo, lookBox, morphDone, openFromMenu, startTop } from './look';

const online = (page: Page) => page.locator('.wc-start-almanac .wc-alm-o');
const date = (page: Page) => page.locator('.wc-start-almanac .wc-alm-d');
const menuSel = (page: Page) => startTop(page).locator('.wc-sm-item.is-sel .wc-sm-label');
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, query = '?cloudtest'): Promise<void> {
  await page.goto('/' + query);
  await expect(menuSel(page)).toHaveText('Enter MUME');
}

test('flag on: "N online" above the almanac\'s date; the date does not move; a menu beat of five fields', async ({ page, browserName }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await stubApi(page, { flags: { stats: true }, stats: { online: 12, playing: 3 } });
  await open(page);
  await expect(online(page)).toHaveText('12 online');
  // Above the date, inside the almanac, at its right edge.
  const o = (await online(page).boundingBox())!;
  const d = (await date(page).boundingBox())!;
  expect(o.y + o.height).toBeLessThanOrEqual(d.y + 1);
  expect(Math.abs(o.x + o.width - (d.x + d.width))).toBeLessThan(2);
  expect(o.x + o.width).toBeLessThanOrEqual(1440);

  // The same page without the line: the date sits exactly where it was.
  const other = await page.context().newPage();
  await other.setViewportSize({ width: 1440, height: 900 });
  await stubApi(other, { flags: {} });
  await open(other);
  await expect(date(other)).toBeVisible();
  const d2 = (await date(other).boundingBox())!;
  expect(Math.round(d2.y)).toBe(Math.round(d.y));
  await other.close();

  // The beat: once at load, exactly the five fields.
  await expect.poll(() => api.beats.length).toBeGreaterThanOrEqual(1);
  const beat = api.beats[0]!;
  expect(Object.keys(beat).sort()).toEqual(['browser', 'device', 'state', 'type', 'version']);
  expect(beat).toEqual({
    device: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    version,
    type: 'desktop',
    browser: browserName === 'firefox' ? 'firefox' : 'chrome',
    state: 'menu',
  });
  expect(await page.evaluate(() => localStorage.getItem('wc.device'))).toBe(beat.device);
  const req = api.requests.find((r) => r.url().endsWith('/api/beat'))!;
  expect(req.headers()['content-type']).toBe('application/json');
  expect(req.headers().cookie).toBeUndefined();
  // The flags once; the numbers; nothing else.
  expect(api.paths().filter((p) => p === 'GET /api/config')).toHaveLength(1);
  expect(new Set(api.paths())).toEqual(new Set(['GET /api/config', 'GET /api/stats/public', 'POST /api/beat']));
  expect(errors).toEqual([]);
});

const ABSENT: [string, Parameters<typeof stubApi>[1]][] = [
  ['the flag off', { flags: {}, stats: { online: 5, playing: 1 } }],
  ['config 404', { flags: 404, stats: { online: 5, playing: 1 } }],
  ['config unreachable', { flags: 'abort', stats: { online: 5, playing: 1 } }],
  ['stats 404', { flags: { stats: true }, stats: 404 }],
  ['stats 500', { flags: { stats: true }, stats: 500 }],
  ['stats unreachable', { flags: { stats: true }, stats: 'abort' }],
];

for (const [name, answers] of ABSENT) {
  test(`no line with ${name}; the page is as before`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const api = await stubApi(page, answers);
    await open(page);
    // The flags have been asked (and the numbers, when the flag is on): settled.
    await expect.poll(() => api.paths().includes('GET /api/config')).toBe(true);
    if (answers?.flags && typeof answers.flags === 'object' && answers.flags.stats) {
      await expect.poll(() => api.paths().includes('GET /api/stats/public')).toBe(true);
    }
    await page.waitForTimeout(500);
    await expect(date(page)).toBeVisible();
    await expect(online(page)).toHaveCount(0);
    // Without the flag: no numbers and no beat.
    if (!(answers?.flags && typeof answers.flags === 'object' && answers.flags.stats)) {
      expect(api.paths()).toEqual(['GET /api/config']);
    }
    expect(errors).toEqual([]);
  });
}

test('an automated browser without the test hook makes no API request', async ({ page }) => {
  const api = await stubApi(page, { flags: { stats: true }, stats: { online: 3, playing: 0 } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '');
  await page.waitForTimeout(3500);
  await expect(online(page)).toHaveCount(0);
  expect(api.paths()).toEqual([]);
});

test('Enter MUME: a beat with state playing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.from('\r\nBy what name do you wish to be known? ', 'latin1'));
  });
  const api = await stubApi(page, { flags: { stats: true }, stats: { online: 1, playing: 0 } });
  await open(page);
  await expect.poll(() => api.beats.map((b) => b.state)).toEqual(['menu']);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-input-field')).toBeFocused();
  await expect.poll(() => api.beats.map((b) => b.state), { timeout: 10_000 }).toEqual(['menu', 'playing']);
  expect(new Set(api.beats.map((b) => b.device)).size).toBe(1);
});

test("About: What the site knows; its link opens the privacy page; Esc goes back to About", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '');
  await openFromMenu(page, 'about');
  await morphDone(page);
  const sec = lookBox(page).locator('[data-sec="knows"]');
  await expect(sec.locator('.wc-about-h')).toHaveText('WHAT THE SITE KNOWS');
  await expect(sec).toContainText('No IP address is kept');
  await lookBox(page).locator('.wc-about-rail [data-sec-link="knows"]').click();
  await sec.locator('a', { hasText: 'privacy page' }).click();
  await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('Privacy');
  await morphDone(page);
  await expect(lookBox(page).locator('.wc-about-h').first()).toHaveText('WHAT IS SENT');
  await expect(lookBox(page).locator('[data-sec="sent"] dt')).toHaveText(['Device', 'Version', 'Device type', 'Browser', 'State']);
  await expect(lookBox(page).locator('a[href="mailto:abuse@mumecockpit.com"]').first()).toBeVisible();
  // The address stays the page's own (opened from About, not at /privacy).
  expect(new URL(page.url()).pathname).toBe('/');
  await backTo(page, { key: true });
  await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('About');
  expect(errors).toEqual([]);
});

test('/privacy opens the privacy page over the start menu; Back leaves it for the menu at /', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/privacy');
  await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('Privacy');
  await expect(page).toHaveTitle('WebCockpit');
  await morphDone(page);
  await expect(lookBox(page).locator('.wc-about-ver')).toHaveText(/^Last changed /);
  await expect(lookBox(page).locator('.wc-about-rail .wc-about-row')).toHaveCount(8);
  await expect(lookBox(page)).toContainText('No IP address is stored');
  await expect(lookBox(page)).toContainText('abuse@mumecockpit.com');
  // A letter jumps (R: Removing it).
  await page.keyboard.press('r');
  await expect(lookBox(page).locator('.wc-about-rail .wc-about-row.is-on')).toHaveAttribute('data-sec-link', 'remove');
  await backTo(page);
  await expect(menuSel(page)).toHaveText('Enter MUME');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  expect(errors).toEqual([]);
});

test('a tablet (the phone layout on a large window): the line by the almanac, inside the window', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await stubApi(page, { flags: { stats: true }, stats: { online: 4, playing: 1 } });
  await open(page, '?cloudtest&tablet=phone');
  await expect(online(page)).toHaveText('4 online');
  const o = (await online(page).boundingBox())!;
  const d = (await date(page).boundingBox())!;
  expect(o.y + o.height).toBeLessThanOrEqual(d.y + 1);
  expect(o.x + o.width).toBeLessThanOrEqual(1024);
});
