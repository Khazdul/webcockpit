// The Character card on a phone (stage 77 part D): the strip, the landscape
// column beside the resize band's grip, and the poll's switch on the
// settings page. `phone` project; the offline cockpit, nothing reaches MUME.
import { type Page, expect, test } from '@playwright/test';

const pane = (page: Page) => page.locator('.wc-cockpit > .wc-pane-character[data-phone-strip]');
const tab = (page: Page, id: string) => pane(page).locator(`.wc-cc-tab[data-tab="${id}"]`);

/** The demo played, the strip open with Character as its one page. */
async function open(page: Page): Promise<void> {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await page.evaluate(() => {
    const s = window.__wc!.settings;
    s.update({ phone: { strip: { panes: s.get().phone.strip.panes.map((e) => ({ ...e, on: e.id === 'character' })) } } });
  });
  await page.evaluate(async () => {
    const text = await (await fetch('/__fixtures/gmcp-demo.log')).text();
    window.__wc!.app.startReplay(text, 'gmcp-demo.log', 0);
  });
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
  await expect(pane(page).locator('.wc-cc-name')).toHaveText('Rasta');
}

async function everyTab(page: Page): Promise<void> {
  for (const id of ['stats', 'lore', 'status']) {
    await tab(page, id).tap();
    await expect(tab(page, id)).toHaveAttribute('aria-selected', 'true');
    // No keyboard comes up.
    expect(await page.evaluate(() => document.activeElement?.classList.contains('wc-cc-tab') ?? false)).toBe(false);
  }
}

/** The round 12–14 card (F2b): the portrait, the cells, the shields and the stones' row, inside the pane. */
async function sameCard(page: Page): Promise<void> {
  await expect(pane(page).locator('.wc-cc-left')).toHaveAttribute('data-form', 'portrait');
  await expect(pane(page).locator('.wc-cc-status')).toHaveAttribute('data-form', 'cells');
  await expect(pane(page).locator('.wc-cc-status .wc-cc-shield')).toHaveCount(4);
  await expect(pane(page).locator('.wc-cc-status .wc-cc-shield').first()).toBeVisible();
  await expect(pane(page).locator('.wc-cc-stones')).toBeVisible();
  const card = (await pane(page).locator('.wc-cc').boundingBox())!;
  for (const sel of ['.wc-cc-stones', '.wc-cc-shields', '.wc-cc-left']) {
    const b = (await pane(page).locator(sel).boundingBox())!;
    expect(b.x + b.width, sel).toBeLessThanOrEqual(card.x + card.width + 0.5);
    expect(b.y + b.height, sel).toBeLessThanOrEqual(card.y + card.height + 0.5);
  }
}

test('the strip: the same card; the tabs take a finger', async ({ page }) => {
  await open(page);
  await sameCard(page);
  await everyTab(page);
  expect((await tab(page, 'status').boundingBox())!.width).toBeGreaterThanOrEqual(24);
});

test('H2: the strip’s cells in heat (round 16 C): the value in its step’s colour, the track, the corner mark', async ({ page }) => {
  await open(page);
  const f = (k: string) => pane(page).locator(`.wc-cc-f[data-key="${k}"]`);
  // The demo ends aggressive (Mood's fifth), normal, careful, peanuts.
  await expect(f('mood')).toHaveAttribute('data-heat', '4');
  expect(await f('mood').locator('.wc-cc-word').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(242, 135, 74)');
  await expect(f('weight')).toHaveAttribute('data-heat', '0');
  expect(await f('weight').locator('.wc-cc-word').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(111, 211, 138)');
  await expect(f('mood').locator('.wc-cc-ht')).toBeVisible();
  await expect(f('mood').locator('.wc-cc-hs')).toHaveCount(6);
  await expect(f('mood').locator('.wc-cc-cm')).toBeVisible();
  await expect(f('weight').locator('.wc-cc-cm')).toHaveCount(0);
  // The low strip's flat compact rows: the value keeps its colour, no track.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { stripRows: 3 } }));
  await expect(pane(page).locator('.wc-cc')).toHaveAttribute('data-step', 'compact');
  expect(await f('mood').locator('.wc-cc-word').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(242, 135, 74)');
});

test('a low strip: the steps and the compact card as on the desktop, no tabs (F2c)', async ({ page }) => {
  await open(page);
  const inside = async (): Promise<void> => {
    const card = (await pane(page).locator('.wc-cc').boundingBox())!;
    for (const sel of ['.wc-cc-main', '.wc-cc-stones', '.wc-cc-status', '.wc-cc-foot']) {
      const e = pane(page).locator(sel);
      if (!(await e.isVisible())) continue;
      const b = (await e.boundingBox())!;
      expect(b.x + b.width, sel).toBeLessThanOrEqual(card.x + card.width + 0.5);
      expect(b.y + b.height, sel).toBeLessThanOrEqual(card.y + card.height + 0.5);
    }
  };
  for (const rows of [5, 4, 3]) {
    await page.evaluate((rows) => window.__wc!.settings.update({ phone: { stripRows: rows } }), rows);
    await expect(pane(page).locator('.wc-cc-tabs')).toBeHidden();
    await inside();
  }
  await expect(pane(page).locator('.wc-cc')).toHaveAttribute('data-step', 'compact');
  await expect(pane(page).locator('.wc-cc-status .wc-cc-lt')).toHaveText(['M', 'C', 'A', 'W']);
  await expect(pane(page).locator('.wc-cc-stones .wc-cc-icons')).toBeVisible();
  // Tall again: the tabs come back.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { stripRows: null } }));
  await expect(pane(page).locator('.wc-cc-tabs')).toBeVisible();
  await sameCard(page);
});

// Stage 77 G7 and G7b (ADR 0166 point 158): on touch the first tap shows the
// ×, a tap on it stops the herblore; an untapped × goes after 3 s.
test('G7 (stage 77): a herblore stone on touch: the first tap shows its ×, the second stops it', async ({ page }) => {
  await open(page);
  await pane(page).locator('.wc-cc-st[data-k="add"]').tap();
  const menu = page.locator('.wc-tm-menu[aria-label="Herblores"]');
  await expect(menu).toBeVisible();
  const key = (await menu.locator('.wc-tm-mi').first().getAttribute('data-key'))!;
  await menu.locator('.wc-tm-mi').first().tap();
  await expect(menu).toHaveCount(0);
  const herb = pane(page).locator('.wc-cc-st[data-k="stone"][data-tone="herb"]');
  await expect(herb).toHaveCount(1);
  const x = herb.locator('.wc-cc-stx');
  await expect(x).toHaveAttribute('data-key', key);
  await expect(x).toBeHidden();
  const active = (): Promise<boolean | undefined> => page.evaluate((k) => window.__wc!.app.game.timers.view().herbs.find((h) => h.key === k)?.active, key);
  expect(await active()).toBe(true);
  // The first tap: the × shows, nothing stops.
  await herb.tap();
  await expect(x).toBeVisible();
  expect(await active()).toBe(true);
  // Untapped, it goes by itself after 3 s (and the herblore runs on).
  const shown = Date.now();
  await expect(x).toBeHidden({ timeout: 6000 });
  expect(Date.now() - shown).toBeGreaterThanOrEqual(2000);
  expect(await active()).toBe(true);
  // A tap shows it again.
  await herb.tap();
  await expect(x).toBeVisible();
  expect(await active()).toBe(true);
  // The second, on the ×: the herblore stops.
  await x.tap();
  await expect(herb).toHaveCount(0);
  expect(await active()).toBe(false);
});

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, contextOptions: { screen: { width: 844, height: 390 } } });

  test('the column: the tabs stand clear of the band’s grip', async ({ page }) => {
    await open(page);
    await expect(pane(page)).toHaveAttribute('data-phone-side', '');
    await sameCard(page);
    await everyTab(page);
    const t = (await tab(page, 'status').boundingBox())!;
    const grip = (await page.locator('.wc-ph-side-grip').boundingBox())!;
    expect(t.x + t.width).toBeLessThanOrEqual(grip.x + 0.5);
  });
});

test('Fetch Stats and Lore from the game is on the settings page', async ({ page }) => {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await page.locator('.wc-ph-menu').tap();
  await page.locator('.wc-ph-sheet [data-row="settings"]').tap();
  const row = page.locator('.wc-ph-page [data-row="fetch-info"]');
  await row.scrollIntoViewIfNeeded();
  await expect(row).toContainText('Fetch Stats and Lore from the game');
  const on = (): Promise<boolean> => page.evaluate(() => window.__wc!.settings.get().character.fetchInfo);
  expect(await on()).toBe(true);
  await row.getByRole('switch').tap();
  await expect.poll(on).toBe(false);
});
