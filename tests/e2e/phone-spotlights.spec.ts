// Stage 30e (ADR 0110), 32c (ADR 0114) on a phone: the run log's box fits
// and works by tap. Stage 46 (ADR 0131, B "Galleriet"): the Spotlights
// page on a phone: the wall in the box at its phone margins, the filter
// row's chips scroll sideways and toggle by tap, a tap on a card plays it
// in the viewer, whose control row fits (no time), and the track seeks by
// tap. (Options → Spotlights is gone on every device; the ESC menu's
// Options has no Spotlights row: tests/e2e/phone-esc-menu.spec.ts.)
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

/**
 * Every visible button of `row` lies inside it and is a touch target of at
 * least `min` px each way (the stage's 32 px; the speed well's ‹ › too).
 */
async function buttonsFit(row: Locator, min = 32): Promise<void> {
  const rb = (await row.boundingBox())!;
  for (const b of await row.locator('button').all()) {
    if (!(await b.isVisible())) continue;
    const r = (await b.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(rb.x - 0.5);
    expect(r.x + r.width).toBeLessThanOrEqual(rb.x + rb.width + 0.5);
    expect(r.height).toBeGreaterThanOrEqual(min - 0.5);
    expect(r.width).toBeGreaterThanOrEqual(min - 0.5);
  }
}

interface Eng {
  position: number;
  duration: number;
  playing: boolean;
  seeking: boolean;
}

async function engine(page: Page): Promise<Eng | null> {
  return page.evaluate(() => {
    const w = window as unknown as { __wc: { shell: { playerHost: { engine: Eng | null } | null } } };
    const e = w.__wc.shell.playerHost?.engine;
    return e ? { position: e.position, duration: e.duration, playing: e.playing, seeking: e.seeking } : null;
  });
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const width of [390, 360]) {
  test(`${width} wide: Spotlights by tap: the chips scroll and toggle, a card plays, the controls fit, the track seeks`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 844 });
    await pinDemoClock(page);
    await page.goto('/?phone=1');
    await restoreDemo(page);
    // No Options on the start page (stage 32).
    await expect(page.locator('.wc-start .wc-sm-item[data-key="spotlights"]')).toBeVisible();
    await expect(page.locator('.wc-start .wc-sm-item[data-key="options"]')).toHaveCount(0);

    await page.locator('.wc-start .wc-sm-item[data-key="spotlights"]').tap();
    const wall = page.locator('.wc-start .wc-frame:not([hidden]) .wc-spw');
    const cards = wall.locator('.wc-spw-card');
    await expect(cards).toHaveCount(5);
    // The box at the phone's margins; one column of cards; three still lines each.
    const box = (await wall.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x).toBeLessThanOrEqual(10);
    expect(box.x + box.width).toBeGreaterThanOrEqual(width - 10);
    const c0 = (await cards.nth(0).boundingBox())!;
    const c1 = (await cards.nth(1).boundingBox())!;
    expect(c1.y).toBeGreaterThan(c0.y + c0.height - 1);
    await expect(cards.first().locator('.wc-spw-ln:visible')).toHaveCount(3);
    expect(await noSideScroll(page)).toBe(true);

    // The kind chips: one sideways-scrolling line; a tap toggles one.
    const kinds = wall.locator('.wc-spw-kinds .wc-lk-seg');
    await expect(kinds).toHaveClass(/is-pills/);
    await expect(kinds).toHaveCSS('overflow-x', 'auto');
    const k = (await kinds.boundingBox())!;
    expect(k.height).toBeLessThan(60);
    // The last chip: scrolled into the line's view (sideways only), then tapped.
    const pvp = kinds.locator('[data-opt="pkill"]');
    await pvp.scrollIntoViewIfNeeded();
    const pb = (await pvp.boundingBox())!;
    expect(pb.x + pb.width).toBeLessThanOrEqual(k.x + k.width + 0.5);
    await pvp.tap();
    await expect(pvp).toHaveAttribute('aria-checked', 'false');
    await expect(cards).toHaveCount(4);
    for (const chip of await wall.locator('.wc-spw-head [role="checkbox"]').all()) {
      if (!(await chip.isVisible())) continue;
      expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    }
    await pvp.tap();
    await expect(cards).toHaveCount(5);
    // A name chip by tap: only Gittan; All by tap: everyone.
    await wall.locator('.wc-spw-chars [data-opt="Gittan"]').tap();
    await expect(cards).toHaveCount(1);
    await wall.locator('.wc-spw-chars [data-opt="all"]').tap();
    await expect(cards).toHaveCount(5);
    expect(await noSideScroll(page)).toBe(true);

    // A tap on a card plays it.
    await cards.nth(1).tap();
    const viewer = page.locator('.wc-spv');
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('.wc-spv-count')).toHaveText('2 / 5');
    await expect.poll(async () => (await engine(page))?.playing ?? false).toBe(true);
    await expect(viewer.locator('.wc-output')).toContainText('Achievement unlocked', { timeout: 15000 });
    // The control row fits, compact: no time, Display as an icon, no Fullscreen.
    const ctl = viewer.locator('.wc-spv-ctl');
    await inView(page, ctl);
    await buttonsFit(ctl);
    await expect(ctl.locator('.wc-spv-clock')).toBeHidden();
    await expect(ctl.locator('[data-act="fullscreen"]')).toHaveCount(0);
    expect(await noSideScroll(page)).toBe(true);
    // Play / pause and faster by tap.
    await ctl.locator('[data-act="play"]').tap();
    await expect(ctl.locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Play');
    await ctl.locator('[data-act="faster"]').tap();
    await expect(ctl.locator('.wc-spv-spd-v')).toHaveText('2×');
    // ‹ › by tap.
    await viewer.locator('.wc-spv-nav [data-btn="next"]').tap();
    await expect(viewer.locator('.wc-spv-count')).toHaveText('3 / 5');

    // The track seeks by tap (at a quarter of it).
    const line = (await viewer.locator('.wc-spv-trk-line').boundingBox())!;
    const trk = (await viewer.locator('.wc-spv-trk').boundingBox())!;
    expect(trk.height).toBeGreaterThanOrEqual(32);
    // Its kind markers: 32 px targets.
    for (const mk of await viewer.locator('.wc-spv-mk').all()) {
      const r = (await mk.boundingBox())!;
      expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(31.5);
    }
    await page.touchscreen.tap(line.x + line.width / 4, line.y + line.height / 2);
    await expect.poll(async () => (await engine(page))?.seeking ?? true).toBe(false);
    const e = (await engine(page))!;
    expect(Math.abs(e.position / e.duration - 0.25)).toBeLessThan(0.1);

    // Display by tap: in view, a font by tap.
    await ctl.locator('[data-btn="display"]').tap();
    const display = viewer.locator('.wc-spv-dp');
    await expect(display).toBeVisible();
    await inView(page, display);
    await display.locator('[data-opt="large"]').tap();
    await expect(display.locator('[data-opt="large"]')).toHaveAttribute('aria-checked', 'true');
    // The colours: rows of 40 px.
    for (const sw of await display.locator('.wc-spv-sw').all()) expect((await sw.boundingBox())!.height).toBeGreaterThanOrEqual(39.5);
    await display.locator('[data-btn="close"]').tap();
    await expect(display).toHaveCount(0);

    // Back by tap: the wall with the current spotlight's card chosen, then the menu.
    const n = Number((await viewer.locator('.wc-spv-count').textContent())!.split(' / ')[0]);
    await page.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-back').first().tap();
    await expect(viewer).toHaveCount(0);
    await expect(cards.nth(n - 1)).toHaveClass(/is-on/);
    await page.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-back').first().tap();
    await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Spotlights');
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
