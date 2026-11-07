// Stage 30e (ADR 0110): the Spotlights settings (kinds, characters,
// period), saved at once, and Credits following them. Stage 46 (ADR 0131,
// B "Galleriet"): the settings are the filter row above the Spotlights
// wall: kind chips, `All` and one chip per character (a name while All is
// on shows only that name; the last name off turns All back on), the
// period; every change rebuilds the wall at once and keeps the chosen card
// while it still passes. Nothing passing is a state of the wall (the row
// stays). On the demo backup: five spotlights over two characters (Rasta:
// a death, a PvP kill, a level-up, an achievement; Gittan: an
// achievement), recorded 2026-09-25..27.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

type Spot = { achievements: boolean; deaths: boolean; levelUps: boolean; pvp: boolean; allCharacters: boolean; characters: string[]; period: string };

async function spotSettings(page: Page): Promise<Spot> {
  return page.evaluate(() => (window as unknown as { __wc: { settings: { get(): { spotlights: Spot } } } }).__wc.settings.get().spotlights);
}

async function setSpot(page: Page, patch: Partial<Spot>): Promise<void> {
  await page.evaluate(
    (p) => (window as unknown as { __wc: { settings: { update(u: unknown): void } } }).__wc.settings.update({ spotlights: p }),
    patch,
  );
}

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const menuRow = (page: Page, key: string) => page.locator(`.wc-start .wc-sm-item[data-key="${key}"]`);
const menuSel = (page: Page) => page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label');
// The Spotlights page (stage 46).
const wall = (page: Page) => frame(page).locator('.wc-spw');
const head = (page: Page) => wall(page).locator('.wc-spw-head');
const cards = (page: Page) => wall(page).locator('.wc-spw-card');
const labels = (page: Page) => cards(page).locator('.wc-spw-label');
const chosen = (page: Page) => wall(page).locator('.wc-spw-card.is-on, .wc-spw-card.is-idle');
const kindChip = (page: Page, kind: string) => head(page).locator(`.wc-spw-kinds [role="checkbox"][data-opt="${kind}"]`);
const charChip = (page: Page, name: string) => head(page).locator(`.wc-spw-chars [role="checkbox"][data-opt="${name}"]`);
const period = (page: Page) => head(page).locator('.wc-spw-period select');
const empty = (page: Page) => wall(page).locator('.wc-spw-empty');
const playAll = (page: Page) => wall(page).locator('.wc-spw-foot [data-btn="PLAY"]');

const ALL5 = [
  'Death (level 42)',
  'Achievement: Put a barrow-wight to rest.',
  '*Ibuki the Half-Elf*',
  'Achievement: That was a quick trip!',
  'Reached level 42',
];

test('the filter row: kind chips, character chips and the period rebuild the wall at once, keeping the chosen card', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await menuRow(page, 'spotlights').click();
  await expect(labels(page)).toHaveText(ALL5);

  // The row: a kind chip each (with its icon), All and a chip per character, the period.
  const kinds = head(page).locator('.wc-spw-kinds [role="checkbox"]');
  await expect(kinds).toHaveText(['Achievements', 'Deaths', 'Level-ups', 'PvP kills']);
  await expect(kinds.locator('svg')).toHaveCount(4);
  for (const k of await kinds.all()) await expect(k).toHaveAttribute('aria-checked', 'true');
  await expect(head(page).locator('.wc-spw-chars [role="checkbox"]')).toHaveText(['All', 'Gittan', 'Rasta']);
  await expect(charChip(page, 'all')).toHaveAttribute('aria-checked', 'true');
  await expect(charChip(page, 'Rasta')).toHaveAttribute('aria-checked', 'false');
  await expect(period(page)).toHaveValue('all');
  await expect(period(page).locator('option')).toHaveText(['All time', 'Last year', 'Last 3 months', 'Last month', 'Last week']);

  // Choose the PvP kill; Deaths off: four, the PvP kill first and still chosen.
  await cards(page).nth(2).click();
  await expect(chosen(page).locator('.wc-spw-label')).toHaveText('*Ibuki the Half-Elf*');
  await kindChip(page, 'death').click();
  await expect(kindChip(page, 'death')).toHaveAttribute('aria-checked', 'false');
  await expect(cards(page)).toHaveCount(4);
  await expect(labels(page).first()).toHaveText('*Ibuki the Half-Elf*');
  await expect(chosen(page).locator('.wc-spw-label')).toHaveText('*Ibuki the Half-Elf*');
  expect((await spotSettings(page)).deaths).toBe(false);
  await expect(wall(page).locator('.wc-spw-sum')).toHaveText(/^4 spotlights · /);

  // A name while All is on: only that name.
  await charChip(page, 'Rasta').click();
  await expect(charChip(page, 'all')).toHaveAttribute('aria-checked', 'false');
  await expect(charChip(page, 'Rasta')).toHaveAttribute('aria-checked', 'true');
  expect(await spotSettings(page)).toMatchObject({ allCharacters: false, characters: ['Rasta'] });
  await expect(cards(page)).toHaveCount(3);
  await expect(cards(page).locator('.wc-spw-meta b')).toHaveText(['Rasta', 'Rasta', 'Rasta']);
  await expect(chosen(page).locator('.wc-spw-label')).toHaveText('*Ibuki the Half-Elf*');
  // The last name off: All is back on.
  await charChip(page, 'Rasta').click();
  await expect(charChip(page, 'all')).toHaveAttribute('aria-checked', 'true');
  expect((await spotSettings(page)).allCharacters).toBe(true);
  await expect(cards(page)).toHaveCount(4);
  // Gittan only: the PvP kill no longer passes, so the first card is chosen.
  await charChip(page, 'Gittan').click();
  await expect(labels(page)).toHaveText(['Achievement: Put a barrow-wight to rest.']);
  await expect(chosen(page).locator('.wc-spw-label')).toHaveText('Achievement: Put a barrow-wight to rest.');
  // All again; Deaths on again: all five, in reel order.
  await charChip(page, 'all').click();
  await kindChip(page, 'death').click();
  await expect(labels(page)).toHaveText(ALL5);
  expect(await spotSettings(page)).toMatchObject({ allCharacters: true, deaths: true });

  // The period: Last week from the day after the demo keeps everything.
  await period(page).selectOption('week');
  expect((await spotSettings(page)).period).toBe('week');
  await expect(cards(page)).toHaveCount(5);

  // The keyboard: F into the row (on the stop last used, the period); Tab the groups,
  // → walks the chips, Space toggles; Esc back to the wall.
  await page.keyboard.press('f');
  await expect(head(page)).toHaveClass(/is-cur/);
  await expect(head(page).locator('.wc-spw-period')).toHaveClass(/is-sel/);
  await page.keyboard.press('Tab');
  await expect(kindChip(page, 'achievement')).toHaveClass(/is-sel/);
  await page.keyboard.press('ArrowRight');
  await expect(kindChip(page, 'death')).toHaveClass(/is-sel/);
  await page.keyboard.press(' ');
  await expect(cards(page)).toHaveCount(4);
  expect((await spotSettings(page)).deaths).toBe(false);
  // Tab: the characters' group.
  await page.keyboard.press('Tab');
  await expect(charChip(page, 'all')).toHaveClass(/is-sel/);
  await page.keyboard.press('Escape');
  await expect(head(page)).not.toHaveClass(/is-cur/);
  await expect(chosen(page)).toHaveClass(/is-on/);
  // Esc again: the menu.
  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('Spotlights');
  // Saved: the next open starts from the same filter.
  await menuRow(page, 'spotlights').click();
  await expect(cards(page)).toHaveCount(4);
  await expect(kindChip(page, 'death')).toHaveAttribute('aria-checked', 'false');
  expect(errors).toEqual([]);
});

test('nothing passes: the filter row stays and the wall says so; a change there brings the cards back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  // A week after the demo (and before the sweep would take Gittan's unsaved runs).
  await page.clock.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
  await page.goto('/');
  await restoreDemo(page);
  await menuRow(page, 'spotlights').click();
  await expect(cards(page)).toHaveCount(5);
  await period(page).selectOption('week');
  await expect(empty(page)).toContainText('No spotlights match your settings.');
  await expect(empty(page)).toContainText('Turn on a kind or a character above, or choose a longer period.');
  await expect(cards(page)).toHaveCount(0);
  await expect(head(page)).toBeVisible();
  await expect(playAll(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(wall(page).locator('.wc-spw-sum')).toHaveText('');
  // P and Enter do nothing here; the viewer stays shut.
  await page.keyboard.press('p');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-spv')).toHaveCount(0);
  // A longer period: the cards are back.
  await period(page).selectOption('month');
  await expect(labels(page)).toHaveText(ALL5);
  await expect(empty(page)).toHaveCount(0);
  // Every kind off from the keyboard: nothing passes, the row keeps the keys; ↓ back to the wall.
  await page.keyboard.press('f');
  await page.keyboard.press('Tab');
  await expect(kindChip(page, 'achievement')).toHaveClass(/is-sel/);
  for (let k = 0; k < 4; k++) {
    await page.keyboard.press(' ');
    await page.keyboard.press('ArrowRight');
  }
  await expect(empty(page)).toBeVisible();
  for (const k of await head(page).locator('.wc-spw-kinds [role="checkbox"]').all()) await expect(k).toHaveAttribute('aria-checked', 'false');
  await expect(head(page)).toHaveClass(/is-cur/);
  await page.keyboard.press('ArrowDown');
  await expect(head(page)).not.toHaveClass(/is-cur/);
  await kindChip(page, 'level').click();
  await expect(labels(page)).toHaveText(['Reached level 42']);
  // Esc on the nothing-passes wall goes to the menu.
  await setSpot(page, { allCharacters: false, characters: [] });
  await expect(empty(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('Spotlights');
  expect(errors).toEqual([]);
});

test('a filter that lets nothing through opens on the nothing-passes wall; no Options on the start page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);

  // Options left the start page in stage 32 (Options → Spotlights went in
  // stage 30e; the ESC menu's hub: tests/unit/chrome-frames.test.tsx).
  await expect(menuRow(page, 'spotlights')).toBeVisible();
  await expect(menuRow(page, 'options')).toHaveCount(0);

  await setSpot(page, { allCharacters: false, characters: [] });
  await menuRow(page, 'spotlights').click();
  await expect(empty(page)).toContainText('No spotlights match your settings.');
  await expect(wall(page)).not.toContainText('Options');
  await expect(wall(page)).not.toContainText('Settings…');
  await expect(charChip(page, 'all')).toHaveAttribute('aria-checked', 'false');
  // A chip there brings the cards back.
  await charChip(page, 'Rasta').click();
  await expect(cards(page)).toHaveCount(4);
  await expect(cards(page).locator('.wc-spw-meta b')).toHaveText(['Rasta', 'Rasta', 'Rasta', 'Rasta']);
  expect(await spotSettings(page)).toMatchObject({ allCharacters: false, characters: ['Rasta'] });
  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('Spotlights');
  expect(errors).toEqual([]);
});

test('no recorded spotlights: the wall says how they are made, without the filter row', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await menuRow(page, 'spotlights').click();
  await expect(empty(page)).toContainText('No spotlights yet.');
  await expect(head(page)).toHaveCount(0);
  await expect(playAll(page)).toHaveCount(0);
  // F does nothing; Esc goes to the menu.
  await page.keyboard.press('f');
  await expect(head(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('Spotlights');
  expect(errors).toEqual([]);
});
