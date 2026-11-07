// Stage 30e (ADR 0110), 32c (ADR 0114): the Spotlights settings in the
// reel's card (kinds, characters, period), the live rebuild, the empty card, the start page's
// "filtered" pages with Settings…, and Credits following the filters. On
// the demo backup: five spotlights over two characters (Rasta: a death, a
// PvP kill, a level-up, an achievement; Gittan: an achievement), recorded
// 2026-09-25..27.
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
const player = (page: Page) => page.locator('.wc-player');
const chrome = (page: Page) => page.locator('.wc-player-chrome');
const header = (page: Page) => chrome(page).locator('.wc-player-header');
const card = (page: Page) => page.locator('.wc-spot-card');
const pop = (page: Page) => page.locator('.wc-sp-spot');
const toggle = (page: Page, label: string) => pop(page).locator(`[role="switch"][aria-label="${label}"]`);
const check = (page: Page, name: string) => pop(page).locator('.wc-ck-cb', { hasText: name });
const cardSwitch = (page: Page, label: string) => card(page).locator(`[role="switch"][aria-label="${label}"]`);
const cardCheck = (page: Page, name: string) => card(page).locator(`.wc-sc-cb[data-name="${name}"]`);
const fold = (page: Page, key: 'kinds' | 'chars') => card(page).locator(`[data-fold="${key}"]`);
const menuRow = (page: Page, key: string) => page.locator(`.wc-start .wc-sm-item[data-key="${key}"]`);

/** Opens the reel; the card is there with its filter. */
async function openReel(page: Page): Promise<void> {
  await menuRow(page, 'spotlights').click();
  await expect(player(page)).toBeVisible();
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('.wc-sc-filter')).toBeVisible();
}

test('the card filter: kinds, characters and period fold out and rebuild the reel at once', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openReel(page);
  await expect(header(page)).toContainText('SPOTLIGHT 1 / 5');
  // No gear any more.
  await expect(page.locator('.wc-player-gear')).toHaveCount(0);

  // Folded: one line each with a summary; Period is a list.
  await expect(fold(page, 'kinds')).toHaveText(/Kinds\s*All/);
  await expect(fold(page, 'chars')).toHaveText(/Characters\s*All/);
  await expect(cardSwitch(page, 'Deaths')).toHaveCount(0);
  await expect(card(page).locator('.wc-sc-sel')).toHaveValue('all');

  // Kinds fold out with their icons; Deaths off → four spotlights, the PvP kill first.
  await fold(page, 'kinds').click();
  await expect(fold(page, 'kinds')).toHaveAttribute('aria-expanded', 'true');
  expect(await card(page).locator('.wc-sc-row[data-kind] svg').evaluateAll((xs) => xs.map((x) => (x as SVGElement).dataset.kind))).toEqual([
    'achievement',
    'death',
    'level',
    'pkill',
  ]);
  await cardSwitch(page, 'Deaths').click();
  await expect(header(page)).toContainText('Rasta (L42) · SPOTLIGHT 1 / 4');
  await expect(card(page).locator('.wc-sc-kind')).toHaveText('PvP kill');
  await expect(fold(page, 'kinds')).toHaveText(/3 of 4/);
  expect((await spotSettings(page)).deaths).toBe(false);
  // The fold stays open across the rebuild.
  await expect(cardSwitch(page, 'Deaths')).toHaveAttribute('aria-checked', 'false');

  // The card stays while the chrome hides (6 s after the last move).
  await page.waitForTimeout(6500);
  await expect(chrome(page)).toHaveAttribute('data-hidden', '');
  await expect(card(page)).toBeVisible();

  // Characters: All on disables the checks; All off checks both; Rasta off → Gittan only.
  await fold(page, 'chars').click();
  await expect(card(page).locator('.wc-sc-cb')).toHaveText(['Gittan', 'Rasta']);
  await expect(cardCheck(page, 'Rasta')).toBeDisabled();
  await cardSwitch(page, 'All characters').click();
  await expect(cardCheck(page, 'Rasta')).toBeEnabled();
  await expect(cardCheck(page, 'Rasta')).toHaveAttribute('aria-checked', 'true');
  await cardCheck(page, 'Rasta').click();
  await expect(header(page)).toContainText('Gittan (L14) · SPOTLIGHT 1 / 1');
  expect(await spotSettings(page)).toMatchObject({ allCharacters: false, characters: ['Gittan'] });
  await expect(fold(page, 'chars')).toHaveText(/Characters\s*Gittan/);

  // A press in the card leaves the keys with the reel: → after a click steps spotlights.
  await cardSwitch(page, 'All characters').click();
  // Gittan's spotlight still passes: it stays, now second of four.
  await expect(header(page)).toContainText('Gittan (L14) · SPOTLIGHT 2 / 4');
  await page.keyboard.press('ArrowRight');
  await expect(header(page)).toContainText('SPOTLIGHT 3 / 4');

  // Keys inside the card are its own (tabbed into): → there does not move the reel.
  await cardSwitch(page, 'Deaths').focus();
  await page.keyboard.press('ArrowRight');
  await expect(header(page)).toContainText('SPOTLIGHT 3 / 4');
  // Esc there gives the keys back (the reel stays).
  await page.keyboard.press('Escape');
  await expect(player(page)).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest('.wc-spot-card'))).toBe(false);

  // Period: Last week from the day after the demo keeps everything.
  await card(page).locator('.wc-sc-sel').selectOption('week');
  expect((await spotSettings(page)).period).toBe('week');
  await expect(header(page)).toContainText('/ 4');

  // Esc leaves the reel.
  await page.keyboard.press('Escape');
  await expect(player(page)).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Spotlights');
  expect(errors).toEqual([]);
});

test('a period that leaves nothing keeps the card with its filter; a change there brings the reel back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  // A week after the demo (and before the sweep would take Gittan's unsaved runs).
  await page.clock.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
  await page.goto('/');
  await restoreDemo(page);
  await openReel(page);
  await card(page).locator('.wc-sc-sel').selectOption('week');
  const empty = page.locator('.wc-spot-empty');
  await expect(empty).toContainText('ESC Back');
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('.wc-sc-empty')).toContainText('No spotlights match your settings.');
  await expect(card(page).locator('.wc-sc-count')).toHaveText('Spotlight 0 / 0');
  await expect(chrome(page)).toHaveCount(0);
  await card(page).locator('.wc-sc-sel').selectOption('month');
  await expect(empty).toHaveCount(0);
  await expect(header(page)).toContainText('SPOTLIGHT 1 / 5');
  await expect(card(page).locator('.wc-sc-empty')).toBeHidden();
  // Empty again: ESC Back on the stage leaves.
  await card(page).locator('.wc-sc-sel').selectOption('week');
  await empty.locator('.wc-spot-empty-back').click();
  await expect(player(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the filtered start page offers Settings…; a change opens the reel; no Options on the start page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);

  // Options left the start page in stage 32 (Options → Spotlights went in
  // stage 30e; the ESC menu's hub: tests/unit/chrome-frames.test.tsx).
  await expect(menuRow(page, 'spotlights')).toBeVisible();
  await expect(menuRow(page, 'options')).toHaveCount(0);

  await setSpot(page, { allCharacters: false, characters: [] });
  await menuRow(page, 'spotlights').click();
  await expect(frame(page).locator('.wc-title-row')).toHaveText('─── Spotlights ───');
  await expect(frame(page)).toContainText('No spotlights match your settings.');
  await expect(frame(page)).not.toContainText('Options');
  await expect(frame(page).locator('.wc-footer')).toContainText('Enter Settings');
  await expect(player(page)).toHaveCount(0);
  // Enter opens the popup next to Settings…; Esc closes it and the page stays.
  await page.keyboard.press('Enter');
  await expect(pop(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop(page)).toHaveCount(0);
  await expect(frame(page)).toContainText('No spotlights match your settings.');
  // A click on Settings…, a change, then closing: the reel opens.
  await frame(page).locator('.wc-mrow[data-key="settings"] .wc-label').click();
  await expect(pop(page)).toBeVisible();
  await check(page, 'Rasta').click();
  await pop(page).locator('.wc-pop-x').click();
  await expect(player(page)).toBeVisible();
  await expect(header(page)).toContainText('Rasta (L42) · SPOTLIGHT 1 / 4');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Spotlights');
  expect(errors).toEqual([]);
});
