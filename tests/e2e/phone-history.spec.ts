// Stage 45 (WP 45-E, ADR 0130): History and its Statistics on a phone
// (touch, 390 × 844), the ground the TUI's "History swipes sideways to
// every column; Statistics stack their sides" test covered
// (phone-frames.spec.ts until stage 45): nothing wider than the screen,
// every cell of a two-line row in view, the sort list, the "?" box by tap,
// Statistics in one column with every table head inside the screen, and
// Back by tap to History as it was. The card's buttons and Export:
// phone-history-page.spec.ts; Rate and Delete: phone-history-dialogs.spec.ts;
// the player's Back by tap: phone-player.spec.ts.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

const W = 390;
const hist = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
const rows = (page: Page) => hist(page).locator('.wc-lk-tr');
const cur = (page: Page) => hist(page).locator('.wc-lk-tr.is-on');
const stats = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-hs-box');

/** The box lies inside the screen's width. */
async function inView(l: Locator): Promise<void> {
  const b = (await l.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(W + 0.5);
}

/** No sideways overflow in the element. */
const noSideways = (l: Locator) => l.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: W, height: 844 });
  await pinDemoClock(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').tap();
  await expect(rows(page)).toHaveCount(3);
});

test('History on a phone: every cell in view without sideways scrolling; the sort list; "?" by tap', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(hist(page).locator('.wc-hist-win')).toHaveClass(/is-narrow/);
  // Nothing scrolls sideways; every cell of the saved Rasta row is on the screen, its stars too.
  expect(await noSideways(hist(page).locator('.wc-hist-main'))).toBe(true);
  await inView(hist(page));
  const rasta = rows(page).nth(1);
  for (const c of ['char', 'date', 'time', 'dur', 'exp', 'rate']) await inView(rasta.locator(`.wc-hist-${c}`));
  await expect(rasta.locator('.wc-lk-star-on')).toHaveText('★★★★');
  // Two lines: the row is taller than one of a wide table.
  expect((await rasta.boundingBox())!.height).toBeGreaterThan(44);
  // The card under the chosen row, inside the screen.
  await inView(hist(page).locator('.wc-lk-tr.is-on + .wc-hist-card'));

  // The sort list: Character (A to Z), then Expires soonest; the chosen row follows its session.
  const sort = hist(page).locator('.wc-hist-sort select');
  await inView(sort);
  await rows(page).nth(1).tap();
  await expect(cur(page).locator('.wc-hist-char')).toHaveText('Rasta');
  await sort.selectOption({ label: 'Character' });
  await expect(rows(page).locator('.wc-hist-char')).toHaveText(['Gittan', 'Gittan', 'Rasta']);
  await expect(cur(page).locator('.wc-hist-char')).toHaveText('Rasta');
  await sort.selectOption({ label: 'Newest first' });
  await expect(rows(page).nth(0).locator('.wc-hist-date')).toHaveText('2026-09-27');

  // "?" by tap: the keys in a small box inside the screen; OK by tap closes it.
  await hist(page).locator('[data-btn="KEYS"]').tap();
  const keys = page.locator('.wc-lk-dialog[data-dlg="keys"]');
  await expect(keys).toBeVisible();
  await inView(keys);
  await keys.locator('[data-btn="OK"]').tap();
  await expect(keys).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Statistics on a phone: one column, every table inside the screen; Back by tap to History as it was', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await rows(page).nth(1).tap();
  await hist(page).locator('.wc-hist-card [data-btn="STATS"]').tap();
  await expect(stats(page).locator('[data-tbl="pvps"]')).toContainText('*Ibuki the Half-Elf*');
  // One column: Allies, Achievements, Kills, PvPs, the two charts and the ruler stacked, each full width.
  const secs = stats(page).locator('.wc-hs-sec');
  const n = await secs.count();
  expect(n).toBe(7);
  let lastY = -1;
  const x0 = (await secs.first().boundingBox())!.x;
  for (let i = 0; i < n; i++) {
    const b = (await secs.nth(i).boundingBox())!;
    expect(b.y).toBeGreaterThan(lastY);
    expect(Math.abs(b.x - x0)).toBeLessThan(1);
    expect(b.x + b.width).toBeLessThanOrEqual(W + 0.5);
    lastY = b.y;
  }
  // Every head of both tables on the screen; nothing scrolls sideways.
  for (const k of ['name', 'n', 'xpPer', 'xpTotal']) await inView(stats(page).locator(`[data-tbl="kills"] .wc-lk-th[data-key="${k}"]`));
  for (const k of ['name', 'n', 'xp']) await inView(stats(page).locator(`[data-tbl="pvps"] .wc-lk-th[data-key="${k}"]`));
  expect(await noSideways(stats(page).locator('.wc-hs-body'))).toBe(true);
  // The body scrolls down to the ruler.
  const ruler = stats(page).locator('.wc-hs-ruler-sec');
  await ruler.scrollIntoViewIfNeeded();
  await expect(ruler).toBeInViewport();
  // A tap on a head sorts.
  const name = stats(page).locator('[data-tbl="kills"] .wc-lk-th[data-key="name"]');
  await name.scrollIntoViewIfNeeded();
  await name.tap();
  await expect(name).toHaveAttribute('data-dir', '1');

  // Back by tap: History with its row and card.
  await stats(page).locator('.wc-lk-back').tap();
  await expect(stats(page)).toHaveCount(0);
  await expect(cur(page).locator('.wc-hist-char')).toHaveText('Rasta');
  await expect(hist(page).locator('.wc-lk-tr.is-on + .wc-hist-card .wc-hist-name')).toContainText('Rasta');
  expect(errors).toEqual([]);
});
