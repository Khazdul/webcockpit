// The look picker on a tablet (stage 80 part F; ADR 0140: the phone's
// layout). The same page as the phone's (phone-looks.spec.ts), in the
// tablet's wider column; on its side the preview stands beside the tabs.
// Opened by a tap on the Character card's portrait and on a Group token,
// a pick by tap, Cancel and Use. `phone` project with an iPad's screen
// (820 × 1180, no flag: a tablet); the offline cockpit, nothing reaches MUME.
import { type Page, expect, test } from '@playwright/test';

const lookPage = (page: Page) => page.locator('.wc-ph-menu-surface [data-page="look"]');
const tab = (page: Page, id: string) => lookPage(page).locator(`[role="tab"][data-tab="${id}"]`);
const item = (page: Page, id: string) => lookPage(page).locator(`.wc-looks-it[data-id="${id}"]`);
const btn = (page: Page, id: string) => lookPage(page).locator(`[data-btn="${id}"]`);
const disc = (page: Page) => page.locator('.wc-cockpit > .wc-pane-character[data-phone-strip] .wc-cc-disc');
const groupPane = (page: Page) => page.locator('.wc-cockpit > .wc-pane-group[data-phone-strip]');

async function open(page: Page, pane: 'character' | 'group'): Promise<void> {
  await page.goto('/?replay');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-cockpit[data-phone-game] .wc-ph-pad')).toBeVisible();
  await page.evaluate((id) => {
    const s = window.__wc!.settings;
    s.update({ phone: { strip: { panes: s.get().phone.strip.panes.map((e) => ({ ...e, on: e.id === id })) } } });
  }, pane);
  await page.evaluate(async () => {
    const text = await (await fetch('/__fixtures/gmcp-demo.log')).text();
    window.__wc!.app.startReplay(text, 'gmcp-demo.log', 0);
  });
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  await page.locator('.wc-ph-sat[data-sat="panes"]:visible').tap();
}

for (const [name, viewport] of [
  ['portrait 820 × 1180', { width: 820, height: 1180 }],
  ['landscape 1180 × 820', { width: 1180, height: 820 }],
] as const) {
  test.describe(`a tablet, ${name}`, () => {
    test.use({ viewport });
    const land = viewport.width > viewport.height;

    test('the portrait opens the look page; a pick shows live, Cancel puts it back, Use keeps it', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await open(page, 'character');
      await expect(disc(page)).toHaveAttribute('data-lookable', '');
      await disc(page).tap();
      await expect(lookPage(page)).toHaveAttribute('aria-label', 'Look for Rasta');
      // The column: wider than the settings pages' 720 px, centred; on its side the preview beside the tabs.
      const prev = (await lookPage(page).locator('.wc-looks-ph-prev').boundingBox())!;
      const tabs = (await lookPage(page).locator('.wc-looks-ph-tabs').boundingBox())!;
      if (land) {
        expect(prev.x + prev.width).toBeLessThanOrEqual(tabs.x);
        expect(Math.abs(prev.y - tabs.y)).toBeLessThan(4);
      } else expect(prev.y + prev.height).toBeLessThanOrEqual(tabs.y);
      const width = tabs.x + tabs.width - Math.min(prev.x, tabs.x);
      expect(width).toBeGreaterThan(740);
      expect(width).toBeLessThanOrEqual(962);
      // Every key 44 px high at least.
      expect(tabs.height - 6).toBeGreaterThanOrEqual(44);
      expect((await btn(page, 'USE').boundingBox())!.height).toBeGreaterThanOrEqual(44);

      await tab(page, 'lib').tap();
      const cols = await lookPage(page).locator('.wc-looks-grid').evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
      expect(cols).toBeGreaterThanOrEqual(7);
      await item(page, 'elf-f-noldor').tap();
      await expect(disc(page)).toHaveAttribute('data-look', 'lib:elf-f-noldor');
      await btn(page, 'CANCEL').tap();
      await expect(lookPage(page)).toHaveCount(0);
      await expect(disc(page)).toHaveAttribute('data-look', 'auto');
      await disc(page).tap();
      await tab(page, 'lib').tap();
      await item(page, 'elf-f-noldor').tap();
      await btn(page, 'USE').tap();
      await expect(lookPage(page)).toHaveCount(0);
      await expect(disc(page)).toHaveAttribute('data-look', 'lib:elf-f-noldor');
      expect(errors).toEqual([]);
    });

    test('a Group token opens the page for that member', async ({ page }) => {
      await open(page, 'group');
      const row = groupPane(page).locator('.wc-gp-row[data-name="Gibur"]');
      await row.locator('button.wc-gp-tk').tap();
      await expect(lookPage(page)).toHaveAttribute('aria-label', 'Look for Gibur');
      await expect(btn(page, 'RESET')).toBeVisible();
      await tab(page, 'lib').tap();
      await item(page, 'dwarf-m-warrior').tap();
      await btn(page, 'USE').tap();
      await expect(row.locator('.wc-gp-tkd')).toHaveAttribute('data-look', 'lib:dwarf-m-warrior');
    });
  });
}
