// Stage 30d (ADR 0109): the Statistics pane. Switched on from the Panes
// popup it opens as a float over the game text; wide it is the ESC frame's
// two sides, narrow one column that scrolls; `No run yet` before a run,
// `Run ended` after one; clicks in it never take the game's keys. Uses the
// dev-only `window.__wc`.
import { type Page, expect, test } from '@playwright/test';

const SHOTS = process.env.WC_SHOTS;

const field = (page: Page) => page.locator('.wc-input-field');
const pane = (page: Page) => page.locator('.wc-pane[data-pane="statistics"]');
const view = (page: Page) => pane(page).locator('.wc-stats-pane');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Switches Statistics with its row in the Panes popup, then closes the popup. */
async function togglePane(page: Page): Promise<void> {
  await page.locator('.wc-mb[data-mb="panes"]').click();
  const row = page.locator('.wc-pop-row[data-pane="statistics"]');
  await expect(row).toHaveText('Statistics');
  await row.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-pop')).toHaveCount(0);
}

/** Gives the Statistics float the outer rectangle `w` × `h` cells at (`x`, `y`). */
async function placeFloat(page: Page, x: number, y: number, w: number, h: number): Promise<void> {
  await page.evaluate(
    ([x, y, w, h]) =>
      window.__wc!.settings.update((d) => {
        d.layout.floating = d.layout.floating.map((f) => (f.id === 'statistics' ? { id: 'statistics', x, y, w, h } : f));
      }),
    [x, y, w, h] as const,
  );
}

test('switched on before any run: a centred float over the game text with `No run yet`; off again', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?replay');
  await expect(field(page)).toBeFocused();
  await expect(pane(page)).toBeHidden();
  expect(await page.evaluate(() => window.__wc!.settings.get().panes.statistics.on)).toBe(false);
  await togglePane(page);
  await expect(pane(page)).toBeVisible();
  await expect(pane(page)).toHaveAttribute('data-floating', '');
  await expect(view(page)).toHaveAttribute('data-layout', 'empty');
  await expect(view(page).locator('.wc-stats-norun')).toHaveText(/^\s*No run yet$/);
  // Inside the game pane, about centred over it.
  const g = (await page.locator('.wc-game').boundingBox())!;
  const p = (await pane(page).boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(g.x - 1);
  expect(p.x + p.width).toBeLessThanOrEqual(g.x + g.width + 1);
  expect(Math.abs(p.x + p.width / 2 - (g.x + g.width / 2))).toBeLessThan(20);
  // Its buttons: Colour, Border, Background and the cross; no Gear.
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
  await expect(pane(page).locator('.wc-pane-btn-gear')).toHaveCount(0);
  await expect(pane(page).locator('.wc-pane-btn')).toHaveCount(3);
  await expect(field(page)).toBeFocused();
  // Off again from the popup: hidden, and the auto place is kept.
  await togglePane(page);
  await expect(pane(page)).toBeHidden();
  expect(await page.evaluate(() => window.__wc!.settings.get().layout.floating.find((f) => f.id === 'statistics'))).toMatchObject({ auto: true });
  expect(errors).toEqual([]);
});

test('after a replay: the run, `Run ended`, sorting by a click, the keys stay with the game, narrow stacks and scrolls', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?fixture=gmcp-demo.log&speed=0');
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await expect(field(page)).toBeFocused();
  await togglePane(page);
  await expect(view(page)).toHaveAttribute('data-layout', 'wide');
  const header = view(page).locator('.wc-stats-header');
  await expect(header).toHaveText(/^\s*◆ STATISTICS — Rasta · Lvl \d+ · Run \d+m · Run ended$/);
  await expect(view(page)).toContainText('An orc scout');
  await expect(view(page)).toContainText('★ Defeated an orc scout');
  // No footer and no keys: the frame's `R Refresh` is not here.
  await expect(view(page)).not.toContainText('R Refresh');
  if (SHOTS) await pane(page).screenshot({ path: `${SHOTS}/statistics-wide-${test.info().project.name}.png` });

  // A click on a column title sorts; the keys stay with the game input.
  const name = view(page).locator('.wc-stat-sort[data-sort="name"]').first();
  await name.click();
  await expect(name).toHaveText('KILLS ▲');
  await expect(field(page)).toBeFocused();
  await view(page).locator('.wc-stat-rows').nth(2).click();
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('abc');
  await expect(field(page)).toHaveValue('abc');

  // Narrow: one column (ALLIES, ACHIEVEMENTS, KILLS, PvPs), the whole content scrolls by the wheel.
  await placeFloat(page, 4, 2, 40, 20);
  await expect(view(page)).toHaveAttribute('data-layout', 'narrow');
  await expect(header).toHaveText(/^\s*◆ Rasta · Run \d+m · Run ended$/);
  const titles = await view(page).evaluate((el) => {
    const want = ['ALLIES', 'ACHIEVEMENTS', 'KILLS', 'PvPs'];
    const lines = [...el.querySelectorAll('.wc-line')].map((l) => l.textContent?.trim() ?? '');
    return want.map((w) => lines.findIndex((t) => t.startsWith(w)));
  });
  expect(titles.every((i) => i >= 0)).toBe(true);
  expect([...titles].sort((a, b) => a - b)).toEqual(titles);
  const pageBox = view(page).locator('.wc-stats-page');
  const b = (await pageBox.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => pageBox.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(field(page)).toBeFocused();
  if (SHOTS) await pane(page).screenshot({ path: `${SHOTS}/statistics-narrow-${test.info().project.name}.png` });

  // Reset layout forgets the place: the auto float again.
  await page.locator('.wc-mb[data-mb="panes"]').click();
  await page.locator('.wc-pop-foot [data-act="reset"]').click();
  await page.locator('.wc-pop-foot [data-act="reset-yes"]').click();
  await expect.poll(() => page.evaluate(() => window.__wc!.settings.get().layout.floating.find((f) => f.id === 'statistics')?.auto)).toBe(true);
  await expect(view(page)).toHaveAttribute('data-layout', 'wide');
  expect(errors).toEqual([]);
});

test('during a replay: the live run, then `Run ended` without blanking', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?fixture=gmcp-demo.log&speed=3');
  await togglePane(page);
  await expect(view(page)).toContainText('An orc scout', { timeout: 20_000 });
  const header = view(page).locator('.wc-stats-header');
  await expect(header).toHaveText(/^\s*◆ STATISTICS — Rasta · Lvl \d+ · Run \d+m$/);
  await expect(header).toContainText('Run ended', { timeout: 25_000 });
  await expect(view(page)).toContainText('An orc scout');
  expect(errors).toEqual([]);
});
