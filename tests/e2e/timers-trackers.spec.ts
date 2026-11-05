// Stage 5 P1: the timers trackers in the browser, driven by the offline
// demo (tests/fixtures/timers-demo.log, ADR 0017) at speed 0. The Timers
// pane itself is P2's; this checks the hub's view and the ◆ lines.
import { type Page, expect, test } from '@playwright/test';

const DEMO = '/?fixture=timers-demo.log&speed=0';

async function demoDone(page: Page): Promise<void> {
  await page.goto(DEMO);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
}

test('the timers demo fills every tracker and announces in the UI pane', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await demoDone(page);
  const view = await page.evaluate(() => {
    const w = window as unknown as {
      __wc: { app: { game: { timers: { view(): { cells: Record<string, Array<{ name: string; tracked: boolean }>> } } } } };
    };
    const v = w.__wc.app.game.timers.view();
    return Object.fromEntries(Object.entries(v.cells).map(([g, cs]) => [g, cs.map((c) => c.name).sort()]));
  });
  expect(view.sanct).toEqual(['sanctuary']);
  expect(view.spell).toEqual(['armour', 'bless', 'detect magic', 'shield']);
  expect(view.stored).toEqual(['earthquake', 'earthquake']);
  expect(view.blind).toEqual(['2.orc']);
  expect(view.charm).toEqual(['enslaved shadow', 'huge stone troll']);
  expect(view.debuff).toContain('winded');
  // The UI pane shows the latest lines.
  const ui = page.locator('.wc-pane[data-pane="ui"]');
  await expect(ui).toContainText('BUFF: second wind down.');
  await expect(ui).toContainText('DEBUFF: winded up.');
  expect(errors).toEqual([]);
});
