// Stage 30e (ADR 0110) on a phone: the Spotlights settings live in the
// reel's gear there too (Options → Spotlights is gone on every device), so
// the control box, the gear and the popup must work by touch and fit.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

/** The box lies inside the viewport. */
async function inView(page: Page, l: Locator): Promise<void> {
  const b = (await l.boundingBox())!;
  const v = page.viewportSize()!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(v.width + 0.5);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(v.height + 0.5);
}

for (const width of [412, 360]) {
  test(`${width} wide: tap the reel, tap the gear, change a setting; the reel rebuilds`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 800 });
    await pinDemoClock(page);
    await page.goto('/?phone=1');
    await restoreDemo(page);
    // Options has no Spotlights row on the phone either.
    await page.locator('.wc-start .wc-mrow[data-key="options"]').tap();
    await expect(page.locator('.wc-start .wc-frame:not([hidden]) .wc-mrow[data-key="spotlights"]')).toHaveCount(0);
    await page.locator('.wc-start .wc-frame:not([hidden]) .wc-mrow[data-key="back"]').tap();

    await page.locator('.wc-start .wc-mrow[data-key="spotlights"]').tap();
    const header = page.locator('.wc-player-header');
    await expect(page.locator('.wc-player')).toBeVisible();
    await expect(header).toContainText('SPOTLIGHT 1 / 5');
    // A tap on the stage shows the chrome with the control box and its gear.
    await page.locator('.wc-player-stage').tap({ position: { x: 40, y: 300 } });
    const gear = page.locator('.wc-player-gear');
    await expect(gear).toBeVisible();
    await inView(page, gear);
    await gear.tap();
    const pop = page.locator('.wc-sp-spot');
    await expect(pop).toBeVisible();
    await expect(pop.locator('.wc-ck-cb')).toHaveText(['Gittan', 'Rasta']);
    await expect.poll(async () => {
      const b = (await pop.boundingBox())!;
      return b.x >= 0 && b.x + b.width <= width + 0.5 && b.y >= 0;
    }).toBe(true);
    await pop.locator('[role="switch"][aria-label="Deaths"]').tap();
    await expect(header).toContainText('SPOTLIGHT 1 / 4');
    await pop.locator('.wc-pop-x').tap();
    await expect(pop).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
