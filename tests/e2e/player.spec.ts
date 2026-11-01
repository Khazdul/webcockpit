// Stage 6 P2: the log player on the demo backup. History → RUN LOG opens
// the Rasta session (two runs); it plays with the panes filled and the
// commands echoed; speed keys, pause with the cursor line, a rail click,
// a marker click, the end, and ESC back to History with its state kept.
// Stage 32c (ADR 0114): the ghost-look box (±10 s, speed steps, Close),
// the kind-icon markers and the rail.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

interface Eng {
  position: number;
  duration: number;
  playing: boolean;
  seeking: boolean;
  speed: number;
  atEnd: boolean;
  run: number;
}

async function engine(page: Page): Promise<Eng> {
  return page.evaluate(() => {
    const w = window as unknown as { __wc: { shell: { playerHost: { engine: Eng } | null } } };
    const e = w.__wc.shell.playerHost!.engine;
    return { position: e.position, duration: e.duration, playing: e.playing, seeking: e.seeking, speed: e.speed, atEnd: e.atEnd, run: e.run };
  });
}

async function settled(page: Page): Promise<void> {
  await expect.poll(async () => (await engine(page)).seeking).toBe(false);
}

const player = (page: Page) => page.locator('.wc-player');
const chrome = (page: Page) => page.locator('.wc-player-chrome');
const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const cur = (page: Page) => frame(page).locator('.wc-tr.is-cur-focus, .wc-tr.is-cur');

test('History → RUN LOG plays the Rasta session; pause, speed, seek, markers, ESC back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  await page.locator('.wc-start .wc-mrow[data-key="history"] .wc-label').click();
  await expect(frame(page).locator('.wc-title-row')).toHaveText('─── History ───');
  // History loads its sessions asynchronously; keys before that are lost.
  await expect(frame(page).locator('.wc-tr:not(.is-empty)')).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  await expect(cur(page)).toContainText('Rasta');
  await frame(page).locator('[data-btn="RUN LOG"]').click();
  const opened = Date.now();

  // Text at once: the run's lead-in (login GMCP, VIEW/SIZE) takes no time.
  await expect(player(page).locator('.wc-output .wc-row').first()).toBeVisible({ timeout: 1000 });
  expect(Date.now() - opened).toBeLessThan(1500);
  expect((await engine(page)).position).toBeLessThan(1500);

  // Playing from the start, chrome shown, the start page hidden.
  await expect(player(page)).toBeVisible();
  await expect(page.locator('.wc-start')).toBeHidden();
  await expect(chrome(page).locator('.wc-player-header')).toContainText('Rasta (L42) · Run 1 of 2 · 2026-09-26 21:00');
  await expect(chrome(page).locator('.wc-player-hints')).toHaveText('Space Play/Pause · ← → 10 s · 1–6 Speed · ↑↓ Cursor · ESC Back');
  await expect(chrome(page).locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Pause');
  await expect(chrome(page).locator('.wc-player-clock')).toContainText('/ 02:02');
  // K/D/A/L markers from the stored events, as kind icons (the achievement
  // and the level-up share a marker: a star and double chevrons).
  const mark = (kinds: string) => chrome(page).locator(`.wc-player-mark[data-kinds="${kinds}"]`);
  await expect(chrome(page).locator('.wc-player-mark')).toHaveCount(3);
  expect(await chrome(page).locator('.wc-player-mark').evaluateAll((ms) => ms.map((m) => (m as HTMLElement).dataset.kinds))).toEqual(['AL', 'K', 'D']);
  expect(await mark('AL').locator('svg').evaluateAll((xs) => xs.map((x) => (x as SVGElement).dataset.kind))).toEqual(['achievement', 'level']);
  await expect(mark('K').locator('svg')).toHaveAttribute('data-kind', 'pkill');
  await expect(mark('D').locator('svg')).toHaveAttribute('data-kind', 'death');
  // Hovering a marker shows what happened, left of it.
  await mark('K').hover();
  const tip = chrome(page).locator('.wc-player-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText('Killed *Ibuki the Half-Elf*');
  const [mk, tb] = await Promise.all([mark('K').boundingBox(), tip.boundingBox()]);
  expect(Math.abs(tb!.y - mk!.y)).toBeLessThan(1.5);
  expect(tb!.x + tb!.width).toBeLessThanOrEqual(mk!.x + 1);
  await mark('AL').hover();
  await expect(tip.locator('div')).toHaveCount(2);
  await page.mouse.move(10, 300);
  await expect(tip).toBeHidden();
  // The panes fill from the recorded GMCP.
  await expect(player(page).locator('.wc-pane[data-pane="character"]')).toContainText('Rasta');
  await expect(player(page).locator('.wc-output')).toContainText('Rivendell Stables');
  // No input line.
  await expect(player(page).locator('.wc-input-slot')).toBeHidden();
  // The cockpit fills the window left of the rail (no letterbox); the rail is narrower than two cells.
  const geo = await page.evaluate(() => {
    const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const game = r('.wc-player .wc-output');
    const cellW = parseFloat(getComputedStyle(document.querySelector('.wc-player')!).getPropertyValue('--cell-w'));
    return { vw: window.innerWidth, stage: r('.wc-player-stage'), rail: r('.wc-player-rail'), game, cellW };
  });
  expect(geo.stage.left).toBe(0);
  expect(Math.abs(geo.stage.right - geo.rail.left)).toBeLessThan(1);
  expect(geo.rail.right).toBeCloseTo(geo.vw, 0);
  expect(geo.rail.width).toBeLessThan(2 * geo.cellW);
  expect(geo.game.width).toBeGreaterThan(geo.vw * 0.4);

  // Speed keys.
  const speed = chrome(page).locator('.wc-player-speed');
  await page.keyboard.press('6');
  await expect(speed).toHaveText('8×');
  expect((await engine(page)).speed).toBe(8);
  await expect(chrome(page).locator('[data-act="faster"]')).toBeDisabled();
  await page.keyboard.press('3');
  expect((await engine(page)).speed).toBe(1);

  // A click low on the rail seeks forward (fast-forward, still playing) into run 2.
  const strip = await chrome(page).locator('.wc-player-rail').boundingBox();
  await page.mouse.click(strip!.x + strip!.width / 2, strip!.y + strip!.height * 0.75);
  await settled(page);
  let e = await engine(page);
  expect(e.position / e.duration).toBeGreaterThan(0.7);
  expect(e.playing).toBe(true);
  await expect(chrome(page).locator('.wc-player-header')).toContainText('Run 2 of 2 · 2026-09-26 22:02');
  // Replayed commands are echoed after their prompt.
  await expect(player(page).locator('.wc-output')).toContainText('*> west');

  // Space pauses; the cursor line sits on the last line; ↑ moves it.
  await page.keyboard.press(' ');
  await expect(chrome(page).locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Play');
  await expect(player(page).locator('.wc-player-cursor')).toHaveCount(1);
  const last = await player(page).locator('.wc-player-cursor').textContent();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(player(page).locator('.wc-player-cursor')).not.toHaveText(last ?? '');
  expect((await engine(page)).playing).toBe(false);

  // A marker click seeks there, backwards (a rebuild), keeping the pause.
  await mark('K').click();
  await settled(page);
  e = await engine(page);
  expect(e.playing).toBe(false);
  await expect(player(page).locator('.wc-rows .wc-row').last()).toContainText('has drawn her last breath! R.I.P.');
  await expect(player(page).locator('.wc-app')).toHaveCount(1);

  // Space resumes from the cursor line's time: six lines up is earlier.
  const before = (await engine(page)).position;
  await expect(player(page).locator('.wc-player-cursor')).toHaveCount(1);
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press(' ');
  await settled(page);
  e = await engine(page);
  expect(e.playing).toBe(true);
  expect(e.position).toBeLessThan(before);
  await expect(player(page).locator('.wc-player-cursor')).toHaveCount(0);

  // End of the rail: it ends and auto-pauses.
  await page.mouse.click(strip!.x + strip!.width / 2, strip!.y + strip!.height - 2);
  await expect.poll(async () => (await engine(page)).atEnd).toBe(true);
  expect((await engine(page)).playing).toBe(false);
  await expect(player(page).locator('.wc-pane[data-pane="ui"]')).toContainText('DEATH');

  // ESC: back to History, the Rasta row still current.
  await page.keyboard.press('Escape');
  await expect(player(page)).toHaveCount(0);
  await expect(frame(page).locator('.wc-title-row')).toHaveText('─── History ───');
  await expect(cur(page)).toContainText('Rasta');
  expect(errors).toEqual([]);
});

test('the chrome hides while playing and shows on activity; ?player= opens a demo session', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto('/?player=runs-demo.jsonl.gz');
  await expect(player(page)).toBeVisible();
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
  await page.clock.runFor(6500);
  await expect(chrome(page)).toHaveAttribute('data-hidden', '');
  await page.mouse.move(200, 200);
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
  expect(errors).toEqual([]);
});

test('the header hints give way on a narrow window, never over the left part', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/?player=runs-demo.jsonl.gz');
  const hints = chrome(page).locator('.wc-player-hints');
  await expect(hints).toHaveText('Space Play/Pause · ← → 10 s · 1–6 Speed · ↑↓ Cursor · ESC Back');
  await page.setViewportSize({ width: 760, height: 600 });
  await expect(hints).not.toHaveText(/Cursor/);
  await expect(hints).toContainText('ESC Back');
  const gap = await page.evaluate(() => {
    const l = document.querySelector('.wc-player-head-left')!.getBoundingClientRect();
    const h = document.querySelector('.wc-player-hints')!.getBoundingClientRect();
    return h.left - l.right;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
});

test('the box: ±10 s by buttons and keys, To the start, speed steps, Panes and Display, Esc closes a popup first', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/?player=runs-demo.jsonl.gz');
  await expect(player(page).locator('.wc-output')).toContainText('Rivendell Stables');
  await page.keyboard.press(' ');
  const box = chrome(page).locator('.wc-player-box');
  await expect(box.locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Play');
  // Seek to 30 s, paused.
  await page.evaluate(() => (window as unknown as { __wc: { shell: { playerHost: { engine: { seek(ms: number): void } } } } }).__wc.shell.playerHost.engine.seek(30_000));
  await settled(page);
  const at = async () => Math.round((await engine(page)).position / 1000);
  expect(await at()).toBe(30);
  await box.locator('[data-act="fwd"]').click();
  await settled(page);
  expect(await at()).toBe(40);
  await box.locator('[data-act="back"]').click();
  await box.locator('[data-act="back"]').click();
  await settled(page);
  expect(await at()).toBe(20);
  await page.keyboard.press('ArrowRight');
  await settled(page);
  expect(await at()).toBe(30);
  await page.keyboard.press('ArrowLeft');
  await settled(page);
  expect(await at()).toBe(20);
  await expect(chrome(page).locator('.wc-player-clock')).toHaveText('00:20 / 02:02');
  // Still paused; Home and the To the start button go to 00:00.
  expect((await engine(page)).playing).toBe(false);
  await page.keyboard.press('Home');
  await settled(page);
  expect((await engine(page)).position).toBe(0);
  await box.locator('[data-act="fwd"]').click();
  await box.locator('[data-act="start"]').click();
  await settled(page);
  expect((await engine(page)).position).toBe(0);
  // Speed: one step per click, disabled at the ends.
  await box.locator('[data-act="slower"]').click();
  await box.locator('[data-act="slower"]').click();
  await expect(box.locator('.wc-player-speed')).toHaveText('0.25×');
  await expect(box.locator('[data-act="slower"]')).toBeDisabled();
  await box.locator('[data-act="faster"]').click();
  await expect(box.locator('.wc-player-speed')).toHaveText('0.5×');
  expect((await engine(page)).speed).toBe(0.5);

  // Panes: above the box, a toggle per pane and Reset layout.
  const panes = box.locator('.wc-pc-pop[data-pop="panes"]');
  await box.locator('[data-act="panes"]').click();
  await expect(panes).toBeVisible();
  const [pb, bb] = await Promise.all([panes.boundingBox(), box.boundingBox()]);
  expect(pb!.y + pb!.height).toBeLessThanOrEqual(bb!.y + 0.5);
  await expect(panes.locator('[data-pane]')).toHaveText(['Character', 'Timers', 'Group', 'Comm', 'UI', 'Map']);
  await expect(panes.locator('[data-set="reset"]')).toHaveText('Reset layout');
  // Display replaces it.
  const display = box.locator('.wc-pc-pop[data-pop="display"]');
  await box.locator('[data-act="display"]').click();
  await expect(panes).toBeHidden();
  await expect(display).toBeVisible();
  await expect(display.locator('[data-font]')).toHaveText(['Default', 'Small', 'Medium', 'Large']);
  await expect(display.locator('[data-theme]')).toHaveText(['Default', 'Dark', 'Teal', 'Paper', 'Sepia', 'Slate']);
  // Keys inside the popup are its own: 3 does not change the speed there.
  await display.locator('[data-font="small"]').focus();
  await page.keyboard.press('3');
  expect((await engine(page)).speed).toBe(0.5);
  // Esc closes the popup first, then leaves.
  await page.keyboard.press('Escape');
  await expect(display).toBeHidden();
  await expect(player(page)).toBeVisible();
  await box.locator('[data-act="panes"]').click();
  await page.keyboard.press('Escape');
  await expect(panes).toBeHidden();
  await expect(player(page)).toBeVisible();
  // Close: back (as ESC).
  await expect(box.locator('[data-act="close"]')).toHaveAttribute('title', 'Back to History (Esc)');
  await box.locator('[data-act="close"]').click();
  await expect(player(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the run log box has Fullscreen: it toggles the page fullscreen, its label follows', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/?player=runs-demo.jsonl.gz');
  await expect(player(page).locator('.wc-output')).toContainText('Rivendell Stables');
  const fs = chrome(page).locator('.wc-player-box [data-act="extra"]');
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
  // Fullscreen sits before Close.
  const acts = await chrome(page).locator('.wc-player-box button[data-act]').evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.act));
  expect(acts.indexOf('extra')).toBe(acts.indexOf('close') - 1);
  await fs.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect(fs).toHaveAttribute('aria-label', 'Exit fullscreen');
  await fs.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
});
