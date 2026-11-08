// Stage 6 P1, stage 45 (ADR 0130): History in the new look with the demo
// backup (filter, sort, save, rate, stats, delete), the empty page, and
// Exit with rating (the menu bar's Exit popup, ADR 0099) on a mocked live
// session that History then lists as saved. The live run in play: the
// Statistics pane (statistics-pane.spec.ts) and, on the phone, ESC →
// Statistics (phone-esc-menu.spec.ts). History's keys box, Backup, a bad
// Restore, the run-log error box, the width cap and the narrow form:
// history-page.spec.ts; the small boxes in detail: history-dialogs.spec.ts.
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

/** The History page (a look frame; it stays drawn under its small boxes). */
const hist = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
const rows = (page: Page) => hist(page).locator('.wc-lk-tr');
const cur = (page: Page) => hist(page).locator('.wc-lk-tr.is-on');
const btn = (page: Page, id: string) => hist(page).locator(`.wc-lk-btn[data-btn="${id}"]`);
const flash = (page: Page) => hist(page).locator('.wc-lk-flash');
const head = (page: Page, key: string) => hist(page).locator(`.wc-lk-th[data-key="${key}"]`);
const dialog = (page: Page, dlg: string) => page.locator(`.wc-lk-dialog[data-dlg="${dlg}"]`);
/** The top box's hood title (History, Statistics, …). */
const hood = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-box > .wc-lk-hood .wc-lk-hood-t:not(.is-out)');

/** Start menu → History; waits for `n` rows (History reads its sessions asynchronously; keys before that are lost). */
async function openHistory(page: Page, n = 3): Promise<void> {
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  await expect(hood(page)).toHaveText('History');
  if (n > 0) await expect(rows(page)).toHaveCount(n);
}

test('History lists the demo sessions; filter, sort, save, rate, stats and delete', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openHistory(page);

  // Newest first: Gittan 09-27, Rasta 09-26 (two runs, saved ★★★★), Gittan 09-25.
  await expect(head(page, 'date')).toHaveAttribute('data-dir', '-1');
  await expect(rows(page).nth(0).locator('.wc-hist-char')).toHaveText('Gittan');
  await expect(rows(page).nth(0).locator('.wc-hist-date')).toHaveText('2026-09-27');
  await expect(rows(page).nth(0).locator('.wc-hist-time')).toHaveText('18:40');
  await expect(rows(page).nth(1).locator('.wc-hist-char')).toHaveText('Rasta');
  await expect(rows(page).nth(1).locator('.wc-hist-date')).toHaveText('2026-09-26');
  await expect(rows(page).nth(1).locator('.wc-hist-dur')).toHaveText('1h34m');
  await expect(rows(page).nth(1).locator('.wc-hist-exp')).toHaveText('Saved');
  await expect(rows(page).nth(1).locator('.wc-lk-star-on')).toHaveText('★★★★');
  await expect(rows(page).nth(2).locator('.wc-hist-exp')).toHaveText(/^\d+ days$/);
  await expect(hist(page).locator('.wc-hist-storage')).toContainText(/^Storage: .+ of .+$/);
  await expect(hist(page).locator('.wc-hist-pills [role="radio"]')).toHaveText(['All', 'Gittan', 'Rasta']);

  // Filter: → Gittan at once, the cursor on row 0; ← back to All.
  await page.keyboard.press('ArrowRight');
  await expect(rows(page)).toHaveCount(2);
  await expect(hist(page).locator('.wc-hist-pills [aria-checked="true"]')).toHaveText('Gittan');
  await expect(cur(page)).toHaveAttribute('data-i', '0');
  // A pill click filters too.
  await hist(page).locator('.wc-hist-pills [data-opt="Rasta"]').click();
  await expect(rows(page)).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(rows(page)).toHaveCount(3);
  await expect(hist(page).locator('.wc-hist-pills [aria-checked="true"]')).toHaveText('All');

  // Sort: the Dur. head → longest first (▾); again → shortest first (▴).
  await head(page, 'dur').click();
  await expect(head(page, 'dur')).toHaveAttribute('data-dir', '-1');
  await expect(head(page, 'date')).not.toHaveAttribute('data-dir', /./);
  await expect(rows(page).nth(0).locator('.wc-hist-char')).toHaveText('Rasta');
  await expect(rows(page).nth(2).locator('.wc-hist-dur')).toHaveText('12m');
  await head(page, 'dur').click();
  await expect(head(page, 'dur')).toHaveAttribute('data-dir', '1');
  await expect(rows(page).nth(0).locator('.wc-hist-dur')).toHaveText('12m');
  await head(page, 'dur').click();
  await expect(rows(page).nth(0).locator('.wc-hist-char')).toHaveText('Rasta');

  // Save the 35 min Gittan session (row 1 now): the cursor and the card follow it.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(cur(page).locator('.wc-hist-dur')).toHaveText('35m');
  await expect(cur(page).locator('.wc-hist-exp')).toHaveText(/days$/);
  await expect(hist(page).locator('.wc-hist-card')).toContainText(/Expires in \d+ days/);
  await btn(page, 'SAVE').click();
  await expect(cur(page).locator('.wc-hist-exp')).toHaveText('Saved');
  await expect(cur(page).locator('.wc-hist-dur')).toHaveText('35m');
  await expect(flash(page)).toHaveText('Saved.');
  await expect(btn(page, 'SAVE')).toHaveAttribute('aria-disabled', 'true');
  await expect(hist(page).locator('.wc-hist-card')).toContainText('Saved');

  // Rate it 2: the small box over the page, a click on the second star, Enter saves.
  await btn(page, 'RATE').click();
  const rate = dialog(page, 'rate');
  await expect(rate.locator('.wc-lk-hood-t')).toHaveText('Rate the session');
  await rate.locator('.wc-hd-stars > button[data-v="2"]').click();
  await page.keyboard.press('Enter');
  await expect(rate).toHaveCount(0);
  await expect(cur(page).locator('.wc-lk-star-on')).toHaveText('★★');
  await expect(flash(page)).toHaveText('Rated ★★.');

  // Stats of the Rasta session (Home: row 0), in the same box.
  await page.keyboard.press('Home');
  await expect(cur(page).locator('.wc-hist-char')).toHaveText('Rasta');
  await btn(page, 'STATS').click();
  await expect(hood(page)).toHaveText('Statistics');
  const stats = page.locator('.wc-start .wc-frame:not([hidden]) .wc-hs');
  await expect(stats.locator('.wc-hs-name')).toHaveText('Rasta');
  await expect(stats.locator('.wc-hs-when')).toContainText('Session details · Saturday, 26 September 2026 · 21:00 · 1h34m · 2 runs');
  await expect(stats.locator('.wc-hs-allies')).toContainText('Kuzzim');
  await expect(stats.locator('.wc-hs-ach')).toContainText('Reached level 42');
  await expect(stats.locator('[data-tbl="pvps"]')).toContainText('*Ibuki the Half-Elf*');
  await expect(stats.locator('[data-tbl="kills"]')).toContainText('A bloodthirsty b');
  const killsName = stats.locator('[data-tbl="kills"] .wc-lk-th[data-key="name"]');
  await killsName.click();
  await expect(killsName).toHaveAttribute('data-dir', '1');
  // Esc: History as it was (the sort, the cursor).
  await page.keyboard.press('Escape');
  await expect(hood(page)).toHaveText('History');
  await expect(head(page, 'dur')).toHaveAttribute('data-dir', '-1');
  await expect(cur(page).locator('.wc-hist-char')).toHaveText('Rasta');

  // Delete the 12 min Gittan session (the last row): any other key cancels, Y deletes.
  await page.keyboard.press('End');
  await expect(cur(page).locator('.wc-hist-dur')).toHaveText('12m');
  await btn(page, 'DELETE').click();
  const del = dialog(page, 'delete');
  await expect(del.locator('.wc-lk-hood-t')).toHaveText('Delete session');
  await page.keyboard.press('n');
  await expect(del).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  await page.keyboard.press('d');
  await expect(del).toBeVisible();
  await page.keyboard.press('y');
  await expect(rows(page)).toHaveCount(2);
  await expect(flash(page)).toHaveText('Session deleted.');
  // The cursor stays at the same index (now the last row).
  await expect(cur(page)).toHaveAttribute('data-i', '1');
  expect(errors).toEqual([]);
});

test('History with no runs: the empty page; only Restore and "?" are on', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await openHistory(page, 0);
  await expect(hist(page).locator('.wc-hist-note')).toHaveText('No runs recorded yet.');
  await expect(hist(page).locator('.wc-hist-card')).toHaveText(
    'Recorded sessions show here. Restore brings back a backup from another browser.',
  );
  await expect(rows(page)).toHaveCount(0);
  await expect(hist(page).locator('.wc-hist-pills [role="radio"]')).toHaveText(['All']);
  const enabled = hist(page).locator('.wc-lk-btn[data-btn]:not([aria-disabled="true"])');
  await expect(enabled).toHaveCount(2);
  await expect(btn(page, 'KEYS')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(btn(page, 'RESTORE')).not.toHaveAttribute('aria-disabled', 'true');
  // Letters of the off actions do nothing; Tab reaches Restore only.
  await page.keyboard.press('t');
  await page.keyboard.press('b');
  await expect(hood(page)).toHaveText('History');
  await page.keyboard.press('Tab');
  await expect(hist(page).locator('.wc-lk-btn.is-sel')).toHaveAttribute('data-btn', 'RESTORE');
  // Restore of the demo backup fills the page.
  await hist(page).locator('.wc-history-file').setInputFiles('tests/fixtures/runs-demo.jsonl.gz');
  await expect(flash(page)).toHaveText('Restored 4 runs (0 already present).');
  await expect(rows(page)).toHaveCount(3);
  await expect(btn(page, 'BACKUP')).not.toHaveAttribute('aria-disabled', 'true');
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

test('Exit with a rating saves the run; History lists it as saved', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let server: { send(b: Buffer): void } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  await page.goto('/');
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
  await expect(pop).toContainText('Rate & save this run (optional)');
  await page.keyboard.press('4');
  await page.keyboard.press('ArrowLeft');
  await expect(pop.locator('.wc-pop-star.is-on')).toHaveCount(3);
  await page.keyboard.press('y');

  // Back on the start page; History lists the run as saved with ★★★.
  await openHistory(page, 0);
  const row = rows(page).filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.wc-hist-exp')).toHaveText('Saved');
  await expect(row.locator('.wc-lk-star-on')).toHaveText('★★★');
  await expect(hist(page).locator('.wc-hist-card .wc-hist-name')).toContainText(name);
  expect(errors).toEqual([]);
});
