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

test('the strip: the tabs take a finger', async ({ page }) => {
  await open(page);
  await everyTab(page);
  expect((await tab(page, 'status').boundingBox())!.width).toBeGreaterThanOrEqual(24);
});

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, contextOptions: { screen: { width: 844, height: 390 } } });

  test('the column: the tabs stand clear of the band’s grip', async ({ page }) => {
    await open(page);
    await expect(pane(page)).toHaveAttribute('data-phone-side', '');
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
