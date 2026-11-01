// Stage 30e (ADR 0110), 32c (ADR 0114) on a phone: the Spotlights settings
// live in the reel's card there too (Options → Spotlights is gone on every
// device), so the card, its filter and the control box must work by touch
// and fit; the run log's box too.
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

for (const width of [412, 360, 320]) {
  test(`${width} wide: the card and its filter by tap; the reel rebuilds; the box fits`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 800 });
    await pinDemoClock(page);
    await page.goto('/?phone=1');
    await restoreDemo(page);
    // No Options on the start page (stage 32); the ESC menu's Options has
    // no Spotlights row either (tests/e2e/phone-esc-menu.spec.ts).
    await expect(page.locator('.wc-start .wc-mrow[data-key="spotlights"]')).toBeVisible();
    await expect(page.locator('.wc-start .wc-mrow[data-key="options"]')).toHaveCount(0);

    await page.locator('.wc-start .wc-mrow[data-key="spotlights"]').tap();
    const header = page.locator('.wc-player-header');
    await expect(page.locator('.wc-player')).toBeVisible();
    await expect(header).toContainText('SPOTLIGHT 1 / 5');
    // The card fits (narrower than on a desktop) and its filter works by touch.
    const card = page.locator('.wc-spot-card');
    await expect(card).toBeVisible();
    await inView(page, card);
    await card.locator('[data-fold="kinds"]').tap();
    await card.locator('[role="switch"][aria-label="Deaths"]').tap();
    await expect(header).toContainText('SPOTLIGHT 1 / 4');
    await expect(card.locator('.wc-sc-count')).toHaveText('Spotlight 1 / 4');
    await card.locator('[data-nav="next"]').tap();
    await expect(header).toContainText('SPOTLIGHT 2 / 4');
    // A tap on the stage shows the chrome; the box fits, every button by tap.
    await page.locator('.wc-player-stage').tap({ position: { x: 40, y: 500 } });
    const box = page.locator('.wc-player-box');
    await expect(box).toBeVisible();
    await inView(page, box);
    await box.locator('[data-act="play"]').tap();
    await expect(box.locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Play');
    await box.locator('[data-act="faster"]').tap();
    await expect(box.locator('.wc-player-speed')).toHaveText('2×');
    await box.locator('[data-act="display"]').tap();
    const display = box.locator('.wc-pc-pop[data-pop="display"]');
    await expect(display).toBeVisible();
    await inView(page, display);
    await display.locator('[data-font="large"]').tap();
    await expect(display.locator('[data-font="large"]')).toHaveClass(/is-on/);
    await display.locator('.wc-pop-x').tap();
    await expect(display).toBeHidden();
    await box.locator('[data-act="close"]').tap();
    await expect(page.locator('.wc-player')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const width of [412, 360, 320]) {
  test(`${width} wide: the run log's box fits, its buttons work by tap`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/?phone=1&player=runs-demo.jsonl.gz');
    await expect(page.locator('.wc-player .wc-output')).toContainText('Rivendell Stables');
    await page.locator('.wc-player-stage').tap({ position: { x: 40, y: 300 } });
    const box = page.locator('.wc-player-box');
    await expect(box).toBeVisible();
    await inView(page, box);
    // Every button inside the box (Firefox once let Close stick out).
    const bb = (await box.boundingBox())!;
    for (const b of await box.locator(':scope > .wc-pc-row button').all()) {
      if (!(await b.isVisible())) continue;
      const r = (await b.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(bb.x - 0.5);
      expect(r.x + r.width).toBeLessThanOrEqual(bb.x + bb.width + 0.5);
    }
    // Too narrow for the time: the compact box.
    await expect(box).toHaveAttribute('data-compact', '');
    await box.locator('[data-act="play"]').tap();
    await expect(box.locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Play');
    const pos = () =>
      page.evaluate(() => {
        const e = (window as unknown as { __wc: { shell: { playerHost: { engine: { position: number; seeking: boolean } } } } }).__wc.shell.playerHost.engine;
        return { position: e.position, seeking: e.seeking };
      });
    await box.locator('[data-act="fwd"]').tap();
    await expect.poll(async () => (await pos()).seeking).toBe(false);
    expect((await pos()).position).toBeGreaterThanOrEqual(10_000);
    if (width > 320) {
      await box.locator('[data-act="start"]').tap();
      await expect.poll(async () => (await pos()).position).toBe(0);
    } else {
      // 320 px: tight, no To the start (the rail seeks there).
      await expect(box).toHaveAttribute('data-tight', '');
      await expect(box.locator('[data-act="start"]')).toBeHidden();
    }
    await box.locator('[data-act="panes"]').tap();
    const panes = box.locator('.wc-pc-pop[data-pop="panes"]');
    await expect(panes).toBeVisible();
    await inView(page, panes);
    await panes.locator('.wc-pop-x').tap();
    await expect(panes).toBeHidden();
    expect(errors).toEqual([]);
  });
}
