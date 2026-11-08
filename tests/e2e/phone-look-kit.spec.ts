// Stage 42, wave 3 (ADR 0127): the kit on a phone (touch, 390 px wide).
// A dialog in the ESC menu lies over its page, which stays drawn; a box's
// Back (40 px high for a finger) never reaches the page's first line; the
// fullscreen button steps aside while a large box is up; the run log
// player's Back sits under the pane tab strip; a sortable table head is a
// finger's height.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';
import { menuLook, playerBack } from './look';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const menu = (page: Page) => page.locator('.wc-overlay .wc-frame:not([hidden])');
const startTop = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Enters MUME on `?phone=1` (a mocked server). */
async function enterMume(page: Page): Promise<() => WebSocketRoute> {
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  return () => server!;
}

/** Back's bottom edge is above the first row of the page under it (`row`), and a tap at the row's top lands on the row. */
async function backClears(page: Page, box: Locator, row: Locator): Promise<void> {
  const back = (await box.locator('.wc-lk-back').first().boundingBox())!;
  expect(back.height).toBeGreaterThanOrEqual(40);
  const r = (await row.boundingBox())!;
  expect(back.y + back.height).toBeLessThanOrEqual(r.y + 0.5);
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.wc-lk-back') !== null, [back.x + 10, r.y + 2]);
  expect(hit).toBe(false);
}

test('ESC menu → Options → Scripts: Back clears the first row; New lies over the page, which stays drawn', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMume(page);
  await page.locator('.wc-menu-btn').tap();
  await menu(page).locator('.wc-mrow[data-key="options"]').tap();
  await menu(page).locator('.wc-mrow[data-key="scripts"]').tap();
  const f = menuLook(page);
  await expect(f.locator('.wc-scr')).toBeVisible();
  await backClears(page, f, f.locator('.wc-scr-row').first());

  await f.locator('[data-btn="NEW"]').tap();
  const dlg = page.locator('.wc-lk-dialog[data-dlg="new"]');
  await expect(dlg).toBeVisible();
  const under = page.locator('.wc-overlay .wc-frame.wc-menu-look[data-under]');
  await expect(under).toHaveCount(1);
  await expect(under).not.toHaveCSS('display', 'none');
  await expect(under.locator('.wc-scr')).toBeVisible();
  // The dialog centres over the page's box.
  const g = await page.evaluate(() => {
    const p = document.querySelector('.wc-overlay .wc-frame[data-under] .wc-lk-box')!.getBoundingClientRect();
    const d = document.querySelector('.wc-lk-dialog')!.getBoundingClientRect();
    return Math.abs(d.left + d.width / 2 - (p.left + p.width / 2));
  });
  expect(g).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('the start page: a large box hides the fullscreen button; Back clears the Scripts page', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  // The fullscreen button (src/ui/fullscreen-button.ts) where the browser allows page
  // fullscreen; a stand-in with its class where the test browser does not (the CSS is under test).
  await page.evaluate(() => {
    if (document.querySelector('.wc-fs-btn')) return;
    const b = document.createElement('button');
    b.className = 'wc-fs-btn';
    b.textContent = '⛶';
    document.body.append(b);
  });
  const fs = page.locator('.wc-fs-btn');
  await expect(fs).toBeVisible();
  await page.locator('.wc-start .wc-sm-item[data-key="scripts"]').tap();
  const f = startTop(page);
  await expect(f.locator('.wc-lk-box-large .wc-scr')).toBeVisible();
  await expect(page.locator('.wc-start')).toHaveAttribute('data-lk-box', 'large');
  await expect(fs).toBeHidden();
  await backClears(page, f, f.locator('.wc-scr-row').first());
  await f.locator('.wc-lk-back').first().tap();
  await expect(page.locator('.wc-start')).toHaveClass(/\bis-main\b/);
  await expect(fs).toBeVisible();
  expect(errors).toEqual([]);
});

test('History: Stats heads are a finger high; the run log player\'s Back is clear of the pane tabs', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await pinDemoClock(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').tap();
  const hist = startTop(page).locator('.wc-hist');
  const rows = hist.locator('.wc-lk-tr');
  await expect(rows).toHaveCount(3);
  await rows.nth(1).tap();
  await expect(rows.nth(1)).toHaveClass(/is-on/);

  // Stats: every sortable head is about 40 px high for a finger, and a tap sorts.
  await hist.locator('.wc-hist-card [data-btn="STATS"]').tap();
  const heads = startTop(page).locator('.wc-lk-th.is-sort');
  await expect(heads.first()).toBeVisible();
  for (const b of await heads.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(b).toBeGreaterThanOrEqual(40);
  await startTop(page).locator('.wc-lk-back').first().tap();
  await expect(rows).toHaveCount(3);

  // The run log player: Back under the tab strip; a tap on a tab is the tab's.
  await hist.locator('.wc-hist-card [data-btn="RUN LOG"]').tap();
  const back = playerBack(page);
  await expect(back).toBeVisible();
  const tabs = page.locator('.wc-player .wc-phone-tabs');
  await expect(tabs).toBeVisible();
  const t = (await tabs.boundingBox())!;
  const b = (await back.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(t.y + t.height - 0.5);
  for (const tab of await tabs.locator('.wc-phone-tab').all()) {
    const r = (await tab.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.wc-pv-back') !== null, [r.x + r.width / 2, r.y + r.height / 2]);
    expect(hit).toBe(false);
  }
  // Playing, the chrome hides; a tap where Back was shows it and presses nothing.
  const chrome = page.locator('.wc-player-chrome');
  await expect(chrome).toHaveAttribute('data-hidden', '', { timeout: 9000 });
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await expect(chrome).not.toHaveAttribute('data-hidden', '');
  await page.waitForTimeout(500);
  await expect(page.locator('.wc-player')).toHaveCount(1);
  // Shown, Back is Back.
  await back.tap();
  await expect(page.locator('.wc-player')).toHaveCount(0);
  await expect(rows).toHaveCount(3);
  expect(errors).toEqual([]);
});
