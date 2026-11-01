// Stage 30e (ADR 0110): the Spotlights settings in the reel's gear (kinds,
// characters, period), the live rebuild, the empty stage, the start page's
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
const gear = (page: Page) => chrome(page).locator('.wc-player-gear');
const pop = (page: Page) => page.locator('.wc-sp-spot');
const toggle = (page: Page, label: string) => pop(page).locator(`[role="switch"][aria-label="${label}"]`);
const check = (page: Page, name: string) => pop(page).locator('.wc-ck-cb', { hasText: name });
const menuRow = (page: Page, key: string) => page.locator(`.wc-start .wc-mrow[data-key="${key}"] .wc-label`);

/** Opens the reel and shows its chrome, then opens the gear's popup. */
async function openGear(page: Page): Promise<void> {
  await menuRow(page, 'spotlights').click();
  await expect(player(page)).toBeVisible();
  await page.mouse.move(300, 300);
  await page.mouse.move(320, 320);
  await expect(gear(page)).toBeVisible();
  await expect(gear(page)).toHaveAttribute('title', 'Spotlights settings');
  await gear(page).click();
  await expect(pop(page)).toBeVisible();
}

test('the reel gear: kinds, characters and period rebuild the reel at once', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openGear(page);
  await expect(header(page)).toContainText('SPOTLIGHT 1 / 5');

  // The popup: above the control box, right edges aligned, the keys on its first control.
  await expect(pop(page).locator('.wc-ck-cb')).toHaveText(['Gittan', 'Rasta']);
  const geo = () =>
    page.evaluate(() => {
      const p = document.querySelector('.wc-sp-spot')!.getBoundingClientRect();
      const b = document.querySelector('.wc-player-box')!.getBoundingClientRect();
      return { above: p.bottom <= b.top + 0.5, right: Math.abs(p.right - b.right) < 2, focus: document.activeElement?.getAttribute('aria-label') };
    });
  // Placed again once the character list has grown it.
  await expect.poll(geo).toEqual({ above: true, right: true, focus: 'Achievements' });
  await expect(gear(page)).toHaveClass(/is-on/);
  await expect(pop(page).locator('.wc-ck-sub')).toHaveText(['Kinds', 'Characters']);
  await expect(pop(page).locator('.wc-ck-cb')).toHaveText(['Gittan', 'Rasta']);
  await expect(check(page, 'Rasta')).toBeDisabled();

  // Kinds: Deaths off → four spotlights, the PvP kill first.
  await toggle(page, 'Deaths').click();
  await expect(header(page)).toContainText('Rasta (L42) · SPOTLIGHT 1 / 4');
  await expect(page.locator('.wc-spot-box')).toContainText('RASTA: PvP kill');
  expect((await spotSettings(page)).deaths).toBe(false);

  // The chrome stays while the popup is open (it hides 6 s after the last move otherwise).
  await page.waitForTimeout(6500);
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');

  // Characters: All off checks both; Rasta off → Gittan only.
  await toggle(page, 'All characters').click();
  await expect(check(page, 'Rasta')).toBeEnabled();
  await expect(check(page, 'Rasta')).toHaveAttribute('aria-checked', 'true');
  await check(page, 'Rasta').click();
  await expect(header(page)).toContainText('Gittan (L14) · SPOTLIGHT 1 / 1');
  expect(await spotSettings(page)).toMatchObject({ allCharacters: false, characters: ['Gittan'] });

  // Keys stay in the popup: Tab cycles inside it, Space flips a switch, ←→ do not move the reel.
  await toggle(page, 'All characters').focus();
  await page.keyboard.press('Space');
  // Gittan's spotlight still passes: it stays, now second of four.
  await expect(header(page)).toContainText('Gittan (L14) · SPOTLIGHT 2 / 4');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.wc-sp-spot'))).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect(header(page)).toContainText('SPOTLIGHT 2 / 4');

  // Period: Last week from the day after the demo keeps everything.
  await pop(page).locator('.wc-sp-period .wc-ck-dd').click();
  await pop(page).locator('.wc-ck-opt', { hasText: 'Last week' }).click();
  expect((await spotSettings(page)).period).toBe('week');
  await expect(header(page)).toContainText('SPOTLIGHT 2 / 4');

  // Esc closes the popup first, then the reel.
  await page.keyboard.press('Escape');
  await expect(pop(page)).toHaveCount(0);
  await expect(player(page)).toBeVisible();
  await expect(gear(page)).not.toHaveClass(/is-on/);
  await page.keyboard.press('Escape');
  await expect(player(page)).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Spotlights >>');
  expect(errors).toEqual([]);
});

test('a period that leaves nothing shows the empty stage; Settings… there brings it back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  // A week after the demo (and before the sweep would take Gittan's unsaved runs).
  await page.clock.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
  await page.goto('/');
  await restoreDemo(page);
  await openGear(page);
  await pop(page).locator('.wc-sp-period .wc-ck-dd').click();
  await pop(page).locator('.wc-ck-opt', { hasText: 'Last week' }).click();
  const empty = page.locator('.wc-spot-empty');
  await expect(empty).toContainText('No spotlights match your settings.');
  await expect(empty).toContainText('Settings…');
  await expect(empty).toContainText('ESC Back');
  await expect(pop(page)).toBeVisible();
  // Close the popup; Settings… on the stage opens it again.
  await pop(page).locator('.wc-pop-x').click();
  await expect(pop(page)).toHaveCount(0);
  await empty.locator('.wc-spot-empty-btn').click();
  await expect(pop(page)).toBeVisible();
  await pop(page).locator('.wc-sp-period .wc-ck-dd').click();
  await pop(page).locator('.wc-ck-opt', { hasText: 'Last month' }).click();
  await expect(empty).toHaveCount(0);
  await expect(header(page)).toContainText('SPOTLIGHT 1 / 5');
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
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Spotlights >>');
  expect(errors).toEqual([]);
});

test('Credits follows the filters; its filtered page rolls after a change', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  const col = frame(page).locator('.wc-credits-col');

  // Gittan only: no Rasta chapter.
  await setSpot(page, { allCharacters: false, characters: ['Gittan'] });
  await menuRow(page, 'credits').click();
  await expect(col).toContainText('Gittan');
  await expect(col).not.toContainText('Rasta');
  await page.keyboard.press('Escape');

  // Nothing passes: the filtered page; Settings… → All characters → close: it rolls.
  await setSpot(page, { characters: [] });
  await menuRow(page, 'credits').click();
  await expect(frame(page)).toContainText('No chronicle entries match your settings.');
  await page.keyboard.press('Enter');
  await expect(pop(page)).toBeVisible();
  await toggle(page, 'All characters').click();
  await expect(col).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(col).toContainText('Rasta');
  await expect(col).toContainText('Gittan');
  expect(errors).toEqual([]);
});
