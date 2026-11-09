// Stage 30d (ADR 0109) and stage 49 (ADR 0134): the Statistics pane.
// Switched on from the Panes popup it opens as a float over the game text:
// the header, four tiles, the Earlier list (every kill, newest at the
// bottom, following until scrolled up, then `↓ N new`) and the last kill's
// card with its rating; `No run yet` before a run, `ended` after one;
// clicks outside the list never take the game's keys. Uses the dev-only
// `window.__wc`.
import { type Page, expect, test } from '@playwright/test';

const SHOTS = process.env.WC_SHOTS;

const field = (page: Page) => page.locator('.wc-input-field');
const pane = (page: Page) => page.locator('.wc-pane[data-pane="statistics"]');
const view = (page: Page) => pane(page).locator('.wc-st');

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
  await expect(view(page)).toHaveAttribute('data-state', 'norun');
  await expect(view(page).locator('.wc-st-norun')).toHaveText('No run yet');
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

test('after a replay: header, tiles, list and card, `ended`, the keys stay with the game, small panes', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?fixture=gmcp-demo.log&speed=0');
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await expect(field(page)).toBeFocused();
  await togglePane(page);
  await expect(view(page)).toHaveAttribute('data-state', 'run');
  await expect(view(page)).toHaveAttribute('data-ended', '');
  const top = view(page).locator('.wc-st-top');
  await expect(top.locator('.wc-st-hot')).toHaveText('Rasta');
  await expect(top).toContainText(/L\d+/);
  await expect(top.locator('.wc-st-ended')).toBeVisible();
  await expect(top.locator('.wc-st-clock')).toHaveText(/^\d+:\d\d(:\d\d)?$/);
  await expect(view(page).locator('.wc-st-tile .wc-st-k')).toHaveText(['Avg / kill', 'Median', 'XP / h', 'Kills']);
  await expect(view(page).locator('.wc-st-card .wc-st-mob')).not.toBeEmpty();
  await expect(view(page).locator('.wc-st-card .wc-st-bigxp')).toHaveText(/^\+[\d.]+k?$/);
  if (SHOTS) await pane(page).screenshot({ path: `${SHOTS}/statistics-${test.info().project.name}.png` });

  // A press on the tiles or the card: the keys stay with the game input.
  await view(page).locator('.wc-st-tiles').click();
  await expect(field(page)).toBeFocused();
  await view(page).locator('.wc-st-card').click();
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('abc');
  await expect(field(page)).toHaveValue('abc');

  // Small: two by two tiles; short: the card without its scale, then no tiles.
  await placeFloat(page, 4, 2, 34, 30);
  await expect.poll(() => view(page).locator('.wc-st-tiles').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
  await placeFloat(page, 4, 2, 60, 9);
  await expect(view(page).locator('.wc-st-tiles')).toBeHidden();
  await expect(view(page).locator('.wc-st-card')).toBeVisible();

  // Reset layout forgets the place: the auto float again.
  await page.locator('.wc-mb[data-mb="panes"]').click();
  await page.locator('.wc-pop-foot [data-act="reset"]').click();
  await page.locator('.wc-pop-foot [data-act="reset-yes"]').click();
  await expect.poll(() => page.evaluate(() => window.__wc!.settings.get().layout.floating.find((f) => f.id === 'statistics')?.auto)).toBe(true);
  await expect(view(page)).toHaveAttribute('data-state', 'run');
  expect(errors).toEqual([]);
});

test('during a replay: the live run, a long list that follows and counts `↓ N new` when scrolled up, then `ended`', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?fixture=gmcp-demo.log&speed=3');
  await togglePane(page);
  await expect(view(page)).toHaveAttribute('data-state', 'run', { timeout: 20_000 });
  await expect(view(page)).not.toHaveAttribute('data-ended', '');
  // Sixty kills into the live run, as the deriver emits them.
  const emit = (n: number, from: number) =>
    page.evaluate(
      ([n, from]) => {
        const d = (window.__wc!.app as unknown as { runEvents: { events: readonly { type: string; us: number }[]; emit(e: unknown): void } }).runEvents;
        const last = d.events.at(-1)?.us ?? Date.now() * 1000;
        for (let i = 0; i < n; i++) {
          const us = last + (i + 1) * 1000;
          d.emit({ type: 'kill', us, logUs: us, mobName: `a stone troll ${from + i}`, xpDelta: 2000 + ((from + i) % 7) * 500 });
        }
      },
      [n, from] as const,
    );
  await emit(60, 0);
  const count = view(page).locator('.wc-st-count');
  await expect.poll(async () => Number(await count.textContent())).toBeGreaterThanOrEqual(59);
  await expect(view(page).locator('.wc-st-card .wc-st-mob')).toHaveText('a stone troll 59');
  await expect(view(page).locator('.wc-st-card .wc-st-badge')).toHaveText(/Poor|Meh|Good|Great|Superb/);
  // Virtual: far fewer rows in the DOM than kills; the last one is the newest.
  const rows = view(page).locator('.wc-st-row:not(.wc-st-probe)');
  expect(await rows.count()).toBeLessThan(45);
  await expect(view(page).locator('.wc-st-row.is-newest .wc-st-name')).toHaveText('a stone troll 58');
  // Scrolled up: new kills do not move the view; `↓ N new` counts them; a press returns.
  const scroll = view(page).locator('.wc-st-scroll');
  await scroll.evaluate((el) => (el.scrollTop = 0));
  await expect(view(page).locator('.wc-st-row .wc-st-name').filter({ hasText: /^a stone troll 0$/ })).toHaveCount(1);
  await emit(3, 60);
  const more = view(page).locator('.wc-st-more');
  await expect(more).toHaveText(/^↓ [1-3] new$/);
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(0);
  await more.click();
  await expect(more).toBeHidden();
  await expect.poll(() => scroll.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(5);
  await expect(field(page)).toBeFocused();
  await expect(view(page)).toHaveAttribute('data-ended', '', { timeout: 40_000 });
  expect(errors).toEqual([]);
});
