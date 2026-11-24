// Stage 77 G7c (ADR 0166 addendum 27): the Timers pane's herblore × and
// charm × on touch, in the phone's strip. The first tap on such a row shows
// its × and removes nothing (also where the × stands), a tap on the shown
// × removes, an untapped × goes after about 3 s. `phone` project (Pixel 7);
// the offline cockpit and the debug hooks on `game.timers`, nothing
// reaches MUME. The mouse's path stays in timers.spec.ts.
import { type Locator, type Page, expect, test } from '@playwright/test';

const pane = (page: Page) => page.locator('.wc-cockpit > .wc-pane-timers[data-phone-strip]');
const row = (page: Page, id: string) => pane(page).locator(`.wc-tm-items > [data-id="${id}"]`);

/** The demo played, the strip open with Timers as its one page, Herblores on; a charmie and a running herblore. */
async function open(page: Page): Promise<void> {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  // The layer's one-time phone defaults first, so they do not land on what is set here.
  await expect.poll(() => page.evaluate(() => window.__wc!.settings.get().phone.defaults)).toBe(3);
  await page.evaluate(() => {
    const s = window.__wc!.settings;
    s.update({
      timers: { groups: { herb: { enabled: true } } },
      phone: { strip: { panes: s.get().phone.strip.panes.map((e) => ({ ...e, on: e.id === 'timers' })) } },
    });
  });
  await page.evaluate(async () => {
    const text = await (await fetch('/__fixtures/gmcp-demo.log')).text();
    window.__wc!.app.startReplay(text, 'gmcp-demo.log', 0);
  });
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await page.evaluate(() => {
    const t = window.__wc!.app.game.timers;
    const now = Date.now();
    t.debugAdd({ id: 'c1', name: 'huge stone troll', group: 'charm', startedAt: now, expiresAt: now + 3_000_000, expected: 3_600_000, tracked: true } as never);
    t.addHerb('Healing');
  });
  await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
  await expect(pane(page)).toBeVisible();
  await expect(row(page, 'c1')).toBeVisible();
}

/** A tap where the row's × stands (its right end), whether shown or not. */
async function tapAtX(r: Locator): Promise<void> {
  const x = (await r.locator('.wc-tm-x').boundingBox())!;
  const b = (await r.boundingBox())!;
  await r.tap({ position: { x: x.x - b.x + x.width / 2, y: x.y - b.y + x.height / 2 } });
}

const herbOn = (page: Page): Promise<boolean | undefined> =>
  page.evaluate(() => window.__wc!.app.game.timers.view().herbs.find((h) => h.key === 'Healing')?.active);
const charms = (page: Page): Promise<number> => page.evaluate(() => window.__wc!.app.game.timers.view().cells.charm.length);

test('G7c (stage 77): a herblore row on touch: the first tap shows its ×, the second stops it; untapped it goes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  const herb = pane(page).locator('.wc-tm-items > .has-herbx');
  await expect(herb).toHaveCount(1);
  const x = herb.locator('.wc-tm-x');
  await expect(x).toBeHidden();
  expect(await herbOn(page)).toBe(true);
  // The first tap, where the × stands: it shows, nothing stops.
  await tapAtX(herb);
  await expect(x).toBeVisible();
  expect(await herbOn(page)).toBe(true);
  // Untapped, it goes by itself after about 3 s (the herblore runs on).
  const shown = Date.now();
  await expect(x).toBeHidden({ timeout: 7000 });
  expect(Date.now() - shown).toBeGreaterThanOrEqual(2000);
  expect(await herbOn(page)).toBe(true);
  // A tap shows it again; a tap on it stops the herblore.
  await herb.tap();
  await expect(x).toBeVisible();
  expect(await herbOn(page)).toBe(true);
  await x.tap();
  await expect(herb).toHaveCount(0);
  expect(await herbOn(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('G7c (stage 77): a charm row on touch: the first tap shows its ×, the second forgets it; untapped it goes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  const charm = row(page, 'c1');
  const x = charm.locator('.wc-tm-x');
  // On a phone the charm × is not shown before a tap.
  await expect(x).toBeHidden();
  await tapAtX(charm);
  await expect(x).toBeVisible();
  expect(await charms(page)).toBe(1);
  const shown = Date.now();
  await expect(x).toBeHidden({ timeout: 7000 });
  expect(Date.now() - shown).toBeGreaterThanOrEqual(2000);
  expect(await charms(page)).toBe(1);
  await charm.tap();
  await expect(x).toBeVisible();
  await x.tap();
  await expect(charm).toHaveCount(0);
  expect(await charms(page)).toBe(0);
  expect(errors).toEqual([]);
});
