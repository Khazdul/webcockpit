// Stage 6 P1: History with the demo backup (filter, sort, save, rate,
// delete, stats), ESC → Statistics during a replay, and Exit with rating
// on a mocked live session that History then lists as saved.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  const res = await page.evaluate(async () => {
    const w = window as unknown as {
      __wc: { runs(): Promise<{ restore(b: Blob): Promise<{ added: number; skipped: number }> }> };
    };
    const lib = await w.__wc.runs();
    return lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  expect(res.added + res.skipped).toBe(4);
}

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const rows = (page: Page) => frame(page).locator('.wc-tr:not(.is-empty)');
const cur = (page: Page) => frame(page).locator('.wc-tr.is-cur-focus, .wc-tr.is-cur');
const btn = (page: Page, label: string) => frame(page).locator(`[data-btn="${label}"]`);

async function openHistory(page: Page): Promise<void> {
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.locator('.wc-start .wc-mrow[data-key="history"] .wc-label').click();
  await expect(frame(page).locator('.wc-title-row')).toHaveText('─── History ───');
}

test('History lists the demo sessions; filter, sort, save, rate, delete and stats', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openHistory(page);

  // Newest first: Gittan 09-27, Rasta 09-26 (two runs, saved ★★★★), Gittan 09-25.
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(0)).toContainText('Gittan 2026-09-27 18:40');
  await expect(rows(page).nth(1)).toContainText('Rasta  2026-09-26 21:00');
  await expect(rows(page).nth(1)).toContainText('Saved');
  await expect(rows(page).nth(1)).toContainText('★★★★');
  await expect(frame(page).locator('.wc-history-storage')).toContainText('Storage:');

  // Filter: ↑ to the pills, → Gittan.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await expect(rows(page)).toHaveCount(2);
  await expect(frame(page).locator('.wc-pills .wc-btn.is-sel-focus')).toHaveText(' Gittan ');
  await page.keyboard.press('ArrowLeft');
  await expect(rows(page)).toHaveCount(3);

  // Sort: Dur. header → longest first.
  await frame(page).locator('.wc-th', { hasText: 'Dur.' }).click();
  await expect(frame(page).locator('.wc-th', { hasText: 'Dur. ▼' })).toHaveCount(1);
  await expect(rows(page).nth(0)).toContainText('Rasta');
  await expect(rows(page).nth(2)).toContainText('12m');

  // Save the 35 min Gittan session (row 1 now), then rate it 2 with a click.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(cur(page)).toContainText('35m');
  await expect(cur(page)).toContainText('days');
  await btn(page, 'SAVE').click();
  await expect(cur(page)).toContainText('Saved');
  await expect(frame(page).locator('.wc-flash')).toHaveText('Saved.');
  await btn(page, 'RATE').click();
  await expect(frame(page).locator('.wc-title-row')).toHaveText('─── Rate the session ───');
  await frame(page).locator('[data-star="2"]').click();
  await page.keyboard.press('Enter');
  await expect(cur(page)).toContainText('★★');
  await expect(frame(page).locator('.wc-flash')).toHaveText('Rated ★★.');

  // Stats of the Rasta session: → from the buttons to the table, Home.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Home');
  await expect(cur(page)).toContainText('Rasta');
  await btn(page, 'STATS').click();
  const stats = frame(page).locator('.wc-stats');
  await expect(stats.locator('.wc-stats-header')).toHaveText(
    /^◆ Session details — Rasta · 2026-09-26 · 21:00 · 1h34m$/,
  );
  await expect(stats).toContainText('♦ Kuzzim');
  await expect(stats).toContainText('↑ Reached level 42');
  await expect(stats).toContainText('*Ibuki the Half-Elf*');
  await expect(stats).toContainText('A bloodthirsty b');
  await stats.locator('[data-sort="name"]').first().click();
  await expect(stats.locator('[data-sort="name"]').first()).toHaveText('KILLS ▲');
  await page.keyboard.press('Escape');
  await expect(frame(page).locator('.wc-title-row')).toHaveText('─── History ───');

  // Delete the 12 min Gittan session (last row).
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  await expect(cur(page)).toContainText('12m');
  await btn(page, 'DELETE').click();
  await expect(frame(page).locator('.wc-c-header')).toHaveText('─── Delete session ───');
  await page.keyboard.press('y');
  await expect(rows(page)).toHaveCount(2);
  await expect(frame(page).locator('.wc-flash')).toHaveText('Session deleted.');
  expect(errors).toEqual([]);
});

test('ESC → Statistics shows the live run of a replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fixture=gmcp-demo.log&speed=3');
  await expect(page.locator('.wc-pane[data-pane="ui"]')).toContainText('KILL: An orc scout', { timeout: 20_000 });
  await page.keyboard.press('Escape');
  const menu = page.locator('.wc-overlay .wc-frame:not([hidden])');
  await menu.locator('.wc-mrow[data-key="stats"] .wc-label').click();
  const stats = menu.locator('.wc-stats');
  await expect(stats.locator('.wc-stats-header')).toHaveText(/^◆ STATISTICS — Rasta · Lvl \d+ · Run \d+m/);
  await expect(stats).toContainText('An orc scout');
  await expect(stats).toContainText('★ Defeated an orc scout');
  await expect(stats).toContainText('R Refresh');
  // The replay ends while it is open: the data stays.
  await expect(stats.locator('.wc-stats-header')).toContainText('Run ended', { timeout: 25_000 });
  await expect(stats).toContainText('An orc scout');
  await page.keyboard.press('Escape');
  await expect(menu.locator('.wc-mrow[data-key="stats"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

test('Exit session with a rating saves the run; History lists it as saved', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let server: { send(b: Buffer): void } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  const name = 'Exitrater';
  server!.send(gmcp(`Char.Name {"name":"${name}","fullname":"${name} the Mock"}`));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', new RegExp(`^playing · ${name}`));
  server!.send(gmcp('Char.Vitals {"hp":100,"maxhp":100,"xp":5770000,"tp":41500}'));
  server!.send(bytes('An orc scout is dead! R.I.P.\r\n'));
  server!.send(gmcp('Char.Vitals {"xp":5860000}'));
  await expect(page.locator('.wc-pane[data-pane="ui"]')).toContainText('KILL: An orc scout');

  await page.keyboard.press('Escape');
  const menu = page.locator('.wc-overlay .wc-frame:not([hidden])');
  await expect(menu.locator('.wc-mrow[data-key="stats"]')).toHaveCount(1);
  await menu.locator('.wc-mrow[data-key="exit"] .wc-label').click();
  await expect(menu.locator('.wc-title-row')).toHaveText('─── Exit session ───');
  await expect(menu).toContainText('Rate & save this run (optional)');
  await page.keyboard.press('4');
  await page.keyboard.press('ArrowLeft');
  await expect(menu.locator('.wc-stars .wc-st-star')).toHaveCount(3);
  await page.keyboard.press('y');

  // Back on the start page; History lists the run as saved with ★★★.
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await openHistory(page);
  const row = rows(page).filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Saved');
  await expect(row).toContainText('★★★');
  expect(errors).toEqual([]);
});
