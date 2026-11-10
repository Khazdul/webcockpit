// ADR 0075 §3 on the run log player (stage 51 rule 2, ADR 0136 §1): the
// player keeps the phone's tab strip layout (`allocatePhone`) when the live
// game got its new layout. These are the tab strip cases that
// phone-layout.spec.ts ran against the live game before stage 51a. The
// player is opened on tests/fixtures/gmcp-demo.log from the start page
// (`__wc.openPlayerLogs`), on the `phone` project with `?phone=1`.
// The tab keys (Ctrl/Alt+1…9, ADR 0098) were the live game's only (the
// player takes no macro keys) and went with its tab strip (ADR 0136).
import { type Page, expect, test } from '@playwright/test';

const player = (page: Page) => page.locator('.wc-player');
const tab = (page: Page, id: string) => player(page).locator(`.wc-phone-tab[data-tab="${id}"]`);
const pane = (page: Page, id: string) => player(page).locator(`.wc-pane[data-pane="${id}"]`);

async function openPlayer(page: Page): Promise<void> {
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(() => window.__wc!.openPlayerLogs(['gmcp-demo.log'], 'Rasta'));
  await expect(player(page).locator('.wc-phone-tabs')).toBeVisible();
}

test('the player on a phone keeps the tab strip: GAME first, then the shown panes; no phone game layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openPlayer(page);
  const tabs = (await player(page).locator('.wc-phone-tab').allTextContents()).map((t) => t.trim());
  expect(tabs[0]).toBe('GAME');
  expect(tabs).toContain('COMM');
  expect(tabs).toContain('CHAR');
  await expect(tab(page, 'game')).toHaveClass(/is-active/);
  // The game view is as wide as the cockpit; no side pane is shown.
  const cockpit = (await player(page).locator('.wc-cockpit').boundingBox())!;
  const game = (await player(page).locator('.wc-game').boundingBox())!;
  expect(Math.abs(game.width - cockpit.width)).toBeLessThan(10);
  await expect(player(page).locator('.wc-pane:not([hidden])')).toHaveCount(0);
  // Nothing to drag, resize or close.
  await expect(player(page).locator('.wc-pane-grip, .wc-pane-close, .wc-float-handle, .wc-handle')).toHaveCount(0);
  // The live game's phone layout is not the player's.
  await expect(page.locator('.wc-cockpit[data-phone-game]')).toHaveCount(0);
  await expect(player(page).locator('.wc-ph-layer, .wc-ph-pad, .wc-ph-menu, .wc-ph-fight')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('tapping COMM shows the comm pane full width; GAME comes back at the same scroll position; the cell grid and the layout are untouched', async ({ page }) => {
  await openPlayer(page);
  // Play the demo to its end (the player runs in real time), so the game text scrolls and Comm has its lines.
  const forward = page.locator('.wc-player-chrome [aria-label^="Forward 10 s"]').first();
  for (let i = 0; i < 8; i++) await forward.tap();
  await expect(player(page).locator('.wc-rows .wc-row').filter({ hasText: 'A crow caws somewhere to the north.' })).toHaveCount(1);
  const scroller = player(page).locator('.wc-game .wc-scroller');
  // Let the jumps' last lines land (they snap the text to its tail), then scroll back.
  await page.waitForTimeout(700);
  await scroller.evaluate((el) => (el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 200)));
  const before = await scroller.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0);
  const cells = await player(page).locator('.wc-cockpit').getAttribute('data-cells');
  const layoutJson = () => page.evaluate(() => JSON.stringify(window.__wc!.settings.get().layout));
  const layout = await layoutJson();

  await tab(page, 'comm').tap();
  await expect(tab(page, 'comm')).toHaveClass(/is-active/);
  await expect(pane(page, 'comm')).toBeVisible();
  await expect(pane(page, 'comm')).toContainText('ready when you are');
  await expect(player(page).locator('.wc-game')).toBeHidden();
  const p = (await pane(page, 'comm').boundingBox())!;
  const c = (await player(page).locator('.wc-cockpit').boundingBox())!;
  expect(Math.abs(p.width - c.width)).toBeLessThan(10);

  await tab(page, 'character').tap();
  await expect(pane(page, 'character')).toBeVisible();
  await expect(pane(page, 'comm')).toBeHidden();

  await tab(page, 'game').tap();
  await expect(player(page).locator('.wc-game')).toBeVisible();
  await expect(pane(page, 'character')).toBeHidden();
  // The game text is where it was left.
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
  // The cell grid did not change, and switching tabs never wrote the layout.
  await expect(player(page).locator('.wc-cockpit')).toHaveAttribute('data-cells', cells!);
  expect(await layoutJson()).toBe(layout);
});
