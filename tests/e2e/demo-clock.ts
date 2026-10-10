// The demo backup (tests/fixtures/runs-demo.jsonl.gz) holds runs from
// 2026-09-25..27, most of them unsaved: the 14-day retention sweep
// (src/runs/library.ts) deletes those once the real date is past
// 2026-10-11. Tests that read them start the page's clock the day after
// the demo, with time running normally from there.
import type { Page } from '@playwright/test';

export const DEMO_NOW = new Date(2026, 8, 28, 12, 0, 0);

export async function pinDemoClock(page: Page): Promise<void> {
  await page.clock.setSystemTime(DEMO_NOW);
}
