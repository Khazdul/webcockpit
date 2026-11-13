// The run log player on a phone, the way the player gets there (stage 45,
// ADR 0130; stage 55): History → a tapped row's card → Run log, in the big
// box. It has the phone's layout, and its control box is a bar docked at
// the bottom of the box: no Back at the top left; the bar's first key is
// the way out, and it stays while the rest of the chrome hides. A tap on
// it, and Esc, return to History with its chosen row. (The layout itself:
// tests/e2e/phone-player-layout.spec.ts.)
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';
import { playerBack, playerClock } from './look';

const hist = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
const rows = (page: Page) => hist(page).locator('.wc-lk-tr');
const chrome = (page: Page) => page.locator('.wc-player-chrome');
const bar = (page: Page) => page.locator('.wc-player-box');
const out = (page: Page) => bar(page).locator('.wc-pc-row [data-act="close"]');

async function openRunLog(page: Page): Promise<void> {
  await rows(page).nth(1).tap();
  await expect(rows(page).nth(1)).toHaveClass(/is-on/);
  await hist(page).locator('.wc-hist-card [data-btn="RUN LOG"]').tap();
  await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-rl-box .wc-rl-slot > .wc-player')).toHaveCount(1);
  await expect(bar(page)).toHaveAttribute('data-docked', '');
}

for (const width of [390, 360]) {
  test(`${width} wide: the run log player in History's box: the phone layout, the bar docked with every key and the time; its first key and Esc return to History`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 844 });
    await pinDemoClock(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
    await page.evaluate(async () => {
      const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
      await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
    });
    await page.locator('.wc-start .wc-sm-item[data-key="history"]').tap();
    await expect(rows(page)).toHaveCount(3);
    await openRunLog(page);

    // In History's big box, the start page around it; the box nearly fills the phone's screen.
    await expect(page.locator('.wc-start')).toBeVisible();
    const pl = (await page.locator('.wc-player').boundingBox())!;
    expect(pl.width).toBeGreaterThan(width * 0.9);
    // The phone's layout: the lens's keys; no Back at the top left, and none of the box's own.
    await expect(page.locator('.wc-player .wc-cockpit')).toHaveAttribute('data-phone-game', '');
    await expect(page.locator('.wc-player .wc-ph-sat[data-sat="panes"]:visible')).toHaveCount(1);
    await expect(playerBack(page)).toHaveCount(0);
    await expect(page.locator('.wc-rl-box > .wc-lk-back')).toBeHidden();
    // The lens's keys are clear of the hood plate over the box's top edge.
    const hood = (await page.locator('.wc-start .wc-frame:not([hidden]) .wc-rl-box .wc-lk-hood').first().boundingBox())!;
    const panes = (await page.locator('.wc-player .wc-ph-sat[data-sat="panes"]:visible').boundingBox())!;
    expect(panes.y).toBeGreaterThanOrEqual(hood.y + hood.height - 0.5);

    // The bar: at the box's bottom over its whole width, the way out first, the time shown.
    const b = (await bar(page).boundingBox())!;
    expect(Math.abs(b.y + b.height - (pl.y + pl.height))).toBeLessThan(1);
    expect(Math.abs(b.x - pl.x)).toBeLessThan(1);
    expect(Math.abs(b.x + b.width - (pl.x + pl.width))).toBeLessThan(1);
    await expect(bar(page)).not.toHaveAttribute('data-tight', '');
    await expect(playerClock(page)).toBeVisible();
    const keys = bar(page).locator('.wc-pc-row button:visible');
    expect(await keys.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.act))).toEqual(['close', 'back', 'play', 'fwd', 'display']);
    for (const k of await keys.all()) {
      const r = (await k.boundingBox())!;
      expect(r.height).toBeGreaterThanOrEqual(43.5);
      expect(r.width).toBeGreaterThanOrEqual(39.5);
      expect(r.x).toBeGreaterThanOrEqual(b.x - 0.5);
      expect(r.x + r.width).toBeLessThanOrEqual(b.x + b.width + 0.5);
    }
    const o = (await out(page).boundingBox())!;
    expect(o.x - pl.x).toBeLessThan(12);
    // The markers beside the rail end above the bar.
    for (const m of await chrome(page).locator('.wc-player-mark').all()) {
      const r = (await m.boundingBox())!;
      expect(r.y + r.height).toBeLessThanOrEqual(b.y + 0.5);
    }

    // Playing, the rest of the chrome hides; the bar stays, and a tap on the game text shows the rest again.
    await expect(chrome(page)).toHaveAttribute('data-hidden', '', { timeout: 9000 });
    await expect(out(page)).toBeVisible();
    await expect(out(page)).toHaveCSS('pointer-events', 'auto');
    await page.touchscreen.tap(pl.x + pl.width / 3, pl.y + pl.height / 2);
    await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
    await expect(page.locator('.wc-player')).toHaveCount(1);

    // The way out by tap: History with the same row chosen and its card under it.
    await out(page).tap();
    await expect(page.locator('.wc-player')).toHaveCount(0);
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).nth(1)).toHaveClass(/is-on/);
    await expect(hist(page).locator('.wc-lk-tr.is-on + .wc-hist-card .wc-hist-name')).toContainText('Rasta');

    // Esc (a keyboard on the phone or tablet) does the same; with Display open it closes that first.
    await hist(page).locator('.wc-hist-card [data-btn="RUN LOG"]').tap();
    await expect(bar(page)).toHaveAttribute('data-docked', '');
    await bar(page).locator('[data-act="display"]').tap();
    await expect(bar(page).locator('.wc-pc-pop[data-pop="display"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(bar(page).locator('.wc-pc-pop[data-pop="display"]')).toBeHidden();
    await expect(page.locator('.wc-player')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.wc-player')).toHaveCount(0);
    await expect(rows(page).nth(1)).toHaveClass(/is-on/);
    expect(errors).toEqual([]);
  });
}
