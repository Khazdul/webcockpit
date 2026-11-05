// Stage 8 part A (ADR 0021; the popups of stage 32c, ADR 0114): the viewer
// settings behind the control box's Panes and Display, in RUN LOG (`?player=` on the demo backup) and in the HTML replay
// opened from file://. Pane toggles, colour themes (every pane None), font
// size, a dragged pane that survives a backward seek, Reset, no timers `+`,
// and the chrome staying while a popup is open.
import { NO_STATE } from './legacy-state';
import { writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

interface HostProbe {
  seeking: boolean;
  duration: number;
  builds: number;
  panes: Record<string, { on: boolean; color: string }>;
  size: number;
  bg: string;
  layout: boolean;
}

/** The running host: `__wc.shell.playerHost` in the app, `__wcReplay.host` in a replay file. */
async function probe(page: Page): Promise<HostProbe> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __wc?: { shell: { playerHost: unknown } };
      __wcReplay?: { host: unknown };
    };
    const host = (w.__wcReplay?.host ?? w.__wc!.shell.playerHost) as {
      engine: { seeking: boolean; duration: number; buildCount: number };
      app: { settings: { get(): { panes: HostProbe['panes']; appearance: { size: number; bg: string } } } };
      viewerOverrides: { layout?: unknown };
    };
    const s = host.app.settings.get();
    return {
      seeking: host.engine.seeking,
      duration: host.engine.duration,
      builds: host.engine.buildCount,
      panes: s.panes,
      size: s.appearance.size,
      bg: s.appearance.bg,
      layout: host.viewerOverrides.layout !== undefined,
    };
  });
}

async function seek(page: Page, frac: number): Promise<void> {
  await page.evaluate((f) => {
    const w = window as unknown as { __wc?: { shell: { playerHost: unknown } }; __wcReplay?: { host: unknown } };
    const host = (w.__wcReplay?.host ?? w.__wc!.shell.playerHost) as { engine: { duration: number; seek(ms: number): void } };
    host.engine.seek(host.engine.duration * f);
  }, frac);
  await expect.poll(async () => (await probe(page)).seeking).toBe(false);
}

const player = (page: Page) => page.locator('.wc-player');
const chrome = (page: Page) => page.locator('.wc-player-chrome');
const box = (page: Page) => chrome(page).locator('.wc-player-box');
const panesPop = (page: Page) => box(page).locator('.wc-pc-pop[data-pop="panes"]');
const displayPop = (page: Page) => box(page).locator('.wc-pc-pop[data-pop="display"]');
const pane = (page: Page, id: string) => player(page).locator(`.wc-pane[data-pane="${id}"]`);

/** The settings round every mode runs: toggles, themes, font. */
async function settingsRound(page: Page): Promise<void> {
  await expect(panesPop(page)).toBeHidden();
  await box(page).locator('[data-act="panes"]').click();
  await expect(panesPop(page)).toBeVisible();
  await expect(panesPop(page)).toContainText('Panes');
  await expect(panesPop(page)).toContainText('Reset layout');

  // Pane toggle: off and on again.
  const timers = panesPop(page).locator('[data-pane="timers"]');
  await expect(pane(page, 'timers')).toBeVisible();
  await timers.click();
  await expect(pane(page, 'timers')).toBeHidden();
  await expect(timers).toHaveAttribute('aria-checked', 'false');
  await timers.click();
  await expect(pane(page, 'timers')).toBeVisible();
  await expect(timers).toHaveAttribute('aria-checked', 'true');

  // Colours: Dark, then Teal; every pane None. Back to Default: as recorded.
  const recorded = await probe(page);
  await box(page).locator('[data-act="display"]').click();
  await expect(panesPop(page)).toBeHidden();
  await expect(displayPop(page)).toBeVisible();
  const theme = (id: string) => displayPop(page).locator(`[data-theme="${id}"]`);
  await expect(theme('default')).toHaveAttribute('aria-checked', 'true');
  await theme('dark').click();
  await expect(theme('dark')).toHaveAttribute('aria-checked', 'true');
  await theme('teal').click();
  await expect(theme('teal')).toHaveAttribute('aria-checked', 'true');
  await expect(theme('dark')).toHaveAttribute('aria-checked', 'false');
  await expect(player(page)).toHaveCSS('background-color', 'rgb(0, 43, 54)');
  // The swatches show each theme's background.
  await expect(theme('teal').locator('.wc-pc-swd')).toHaveCSS('background-color', 'rgb(0, 43, 54)');
  let p = await probe(page);
  expect(p.bg).toBe('#002b36');
  expect(Object.values(p.panes).map((x) => x.color)).toEqual(Object.values(p.panes).map(() => 'black'));
  await theme('default').click();
  p = await probe(page);
  expect(p.bg).toBe(recorded.bg);
  expect(p.panes).toEqual(recorded.panes);

  // Font: Small (12 px, the cell grid rounds the rendered size); back to Default.
  const px = (): Promise<number> => player(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await px();
  const font = (id: string) => displayPop(page).locator(`[data-font="${id}"]`);
  await font('small').click();
  await expect(font('small')).toHaveClass(/is-on/);
  expect((await probe(page)).size).toBe(12);
  await expect.poll(px).toBeLessThan(Math.min(before, 12.5));
  // The controls keep their size whatever the font.
  await expect(font('small')).toHaveCSS('font-size', '12px');
  await font('default').click();
  await expect(font('default')).toHaveClass(/is-on/);
  expect((await probe(page)).size).toBe(recorded.size);
  await box(page).locator('[data-act="display"]').click();
  await expect(displayPop(page)).toBeHidden();
}

test('RUN LOG: Panes and Display, pane toggles, colours, font, a sticky drag, Reset, no timers +', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.clock.install();
  await page.goto('/?player=runs-demo.jsonl.gz');
  await expect(player(page).locator('.wc-output')).toContainText('Rivendell Stables');
  // Paused, so the output stays put while we click (the cursor parks on the last line).
  const play = chrome(page).locator('[data-act="play"]');
  await page.keyboard.press(' ');
  await expect(play).toHaveAttribute('aria-label', 'Play');
  await page.keyboard.press(' ');
  await expect(play).toHaveAttribute('aria-label', 'Pause');

  // Playing with a popup open: the chrome stays; closed, it hides again.
  await box(page).locator('[data-act="panes"]').click();
  await expect(panesPop(page)).toBeVisible();
  await page.clock.runFor(6500);
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
  await box(page).locator('[data-act="panes"]').click();
  await expect(panesPop(page)).toBeHidden();
  await page.clock.runFor(6500);
  await expect(chrome(page)).toHaveAttribute('data-hidden', '');
  await page.mouse.move(300, 300);
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');

  await page.keyboard.press(' ');
  await expect(play).toHaveAttribute('aria-label', 'Play');
  await expect(player(page).locator('.wc-player-cursor')).toHaveCount(1);
  const cursorBefore = await player(page).locator('.wc-player-cursor').textContent();
  await settingsRound(page);
  // Clicks in the box never move the pause cursor.
  await expect(player(page).locator('.wc-player-cursor')).toHaveText(cursorBefore ?? '');

  // Drag the Group pane by its title row to the left screen edge: it docks left.
  const grip = pane(page, 'group').locator('.wc-pane-grip');
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 - 40, g.y + 40, { steps: 4 });
  await page.mouse.move(4, 400, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await pane(page, 'group').boundingBox())!.x).toBeLessThan(20);
  expect((await probe(page)).layout).toBe(true);
  // The drag moved no pause cursor and did not resume play.
  await expect(play).toHaveAttribute('aria-label', 'Play');

  // Forward past later VIEW records, then back (a new App): the layout stays.
  const builds = (await probe(page)).builds;
  await seek(page, 0.9);
  await seek(page, 0.1);
  expect((await probe(page)).builds).toBeGreaterThan(builds);
  await expect(player(page).locator('.wc-app')).toHaveCount(1);
  await expect.poll(async () => (await pane(page, 'group').boundingBox())!.x).toBeLessThan(20);

  // Reset layout: back to the right dock.
  await box(page).locator('[data-act="panes"]').click();
  await expect(panesPop(page).locator('[data-set="reset"]')).not.toHaveClass(/is-off/);
  await panesPop(page).locator('[data-set="reset"]').click();
  await expect.poll(async () => (await pane(page, 'group').boundingBox())!.x).toBeGreaterThan(700);
  expect((await probe(page)).layout).toBe(false);
  await expect(panesPop(page).locator('[data-set="reset"]')).toHaveClass(/is-off/);

  // The timers pane is active (live, an active pane always has the Herblore
  // header's `+`, even empty) and never has a + or a × in a player.
  for (const f of [0.3, 0.6, 0.95]) {
    await seek(page, f);
    await expect(pane(page, 'timers')).toHaveAttribute('data-active', '');
    await expect(pane(page, 'timers').locator('.wc-tm-add:not([hidden])')).toHaveCount(0);
    await expect(pane(page, 'timers').locator('.wc-tm-x')).toHaveCount(0);
  }

  // ESC closes the popup, the next ESC leaves the player.
  await page.keyboard.press('Escape');
  await expect(panesPop(page)).toBeHidden();
  await expect(player(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(player(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the HTML replay has Panes and Display and the same settings (file://, no storage)', async ({ page, browser }, info) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  const html = await page.evaluate(async () => {
    const w = window as unknown as {
      __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }>; replayHtml(): Promise<string> };
    };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
    return w.__wc.replayHtml();
  });
  const path = info.outputPath('viewer-replay.html');
  writeFileSync(path, html);
  const context = await browser.newContext({ viewport: { width: 1400, height: 820 }, offline: true, storageState: NO_STATE });
  await context.route(/^(https?|wss?):/, (r) => r.abort());
  await context.addInitScript(() => {
    const w = window as unknown as { __touched: string[] };
    w.__touched = [];
    for (const name of ['indexedDB', 'localStorage', 'sessionStorage']) {
      Object.defineProperty(window, name, {
        configurable: true,
        get: () => {
          w.__touched.push(name);
          throw new DOMException(`${name} is not available`, 'SecurityError');
        },
      });
    }
  });
  const p = await context.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`file://${path}`);
  await p.waitForFunction(() => (window as unknown as { __wcReplay?: unknown }).__wcReplay != null);
  await expect(player(p).locator('.wc-output')).toContainText('Rivendell Stables');
  await p.keyboard.press(' ');
  await expect(chrome(p).locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Play');
  // The replay's own button (Fullscreen) is in the box; no Close.
  await expect(box(p).locator('[data-act="extra"]')).toHaveAttribute('aria-label', 'Fullscreen (F)');
  await expect(box(p).locator('[data-act="close"]')).toHaveCount(0);
  await settingsRound(p);
  await expect(pane(p, 'timers').locator('.wc-tm-add:not([hidden])')).toHaveCount(0);
  expect(await p.evaluate(() => (window as unknown as { __touched: string[] }).__touched)).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});
