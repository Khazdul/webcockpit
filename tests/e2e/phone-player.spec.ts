// Stage 45 (WP 45-D, ADR 0130): the run log player's Back on a phone
// (touch, 390 px wide). History → a tapped row's card → Run log, in the
// big box (owner feedback 2026-11-08); Back at
// the top left clear of the header and the compact box; hidden with the
// chrome, a tap on the text shows it; a tap on Back returns to History
// with its chosen row.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';
import { playerBack, playerClock } from './look';

const hist = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
const rows = (page: Page) => hist(page).locator('.wc-lk-tr');
const chrome = (page: Page) => page.locator('.wc-player-chrome');

type R = { x: number; y: number; width: number; height: number };
const meet = (a: R, b: R): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('the run log player on a phone: Back top left, clear of the header and the box, a tap returns to History', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await pinDemoClock(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').tap();
  await expect(rows(page)).toHaveCount(3);
  await rows(page).nth(1).tap();
  await expect(rows(page).nth(1)).toHaveClass(/is-on/);
  await hist(page).locator('.wc-hist-card [data-btn="RUN LOG"]').tap();

  const back = playerBack(page);
  await expect(back).toBeVisible();
  // In History's big box, the start page around it (stage 45 owner feedback, ADR 0130).
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-rl-box .wc-rl-slot > .wc-player')).toHaveCount(1);
  await expect(page.locator('.wc-start')).toBeVisible();
  await expect(chrome(page).locator('.wc-player-box')).toHaveAttribute('data-compact', '');
  // The compact box has no time readout (as before).
  await expect(playerClock(page)).toBeHidden();
  const b = (await back.boundingBox())!;
  const pl = (await page.locator('.wc-player').boundingBox())!;
  expect(b.x - pl.x).toBeLessThan(24);
  expect(b.y - pl.y).toBeLessThan(16);
  // The box nearly fills the phone's screen.
  expect(pl.width).toBeGreaterThan(390 * 0.9);
  // A finger fits it.
  expect(b.height).toBeGreaterThanOrEqual(24);
  // The header's left part starts right of it; the compact box is far below.
  await expect
    .poll(async () => {
      const l = (await chrome(page).locator('.wc-player-head-left').boundingBox())!;
      return l.x >= b.x + b.width;
    })
    .toBe(true);
  const left = (await chrome(page).locator('.wc-player-head-left').boundingBox())!;
  const box = (await chrome(page).locator('.wc-player-box').boundingBox())!;
  expect(meet(b, left)).toBe(false);
  expect(meet(b, box)).toBe(false);
  expect(left.x + left.width).toBeLessThanOrEqual(pl.x + pl.width + 0.5);

  // Playing, the chrome hides with Back; a tap on the game text shows it again.
  // (A tap where a hidden control sits presses it, Back as the box's buttons:
  // the chrome shows on pointerdown, before the click. Reported for wave 3.)
  await expect(chrome(page)).toHaveAttribute('data-hidden', '', { timeout: 9000 });
  await expect(back).toHaveCSS('pointer-events', 'none');
  await page.touchscreen.tap(195, 400);
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
  await expect(back).toHaveCSS('pointer-events', 'auto');
  await expect(page.locator('.wc-player')).toHaveCount(1);

  // A tap on Back: History with the same row chosen and its card under it.
  await back.tap();
  await expect(page.locator('.wc-player')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(1)).toHaveClass(/is-on/);
  await expect(hist(page).locator('.wc-lk-tr.is-on + .wc-hist-card .wc-hist-name')).toContainText('Rasta');
  expect(errors).toEqual([]);
});
