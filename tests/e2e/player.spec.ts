// Stage 6 P2: the log player on the demo backup. History → RUN LOG opens
// the Rasta session (two runs); it plays with the panes filled and the
// commands echoed; speed keys, pause with the cursor line, a strip click,
// a marker click, the end, and ESC back to History with its state kept.
import { type Page, expect, test } from '@playwright/test';

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
  await expect(chrome(page).locator('.wc-player-hints')).toHaveText('Space Play/Pause · 1–6 Speed · ↑↓ Cursor · ESC Back');
  await expect(chrome(page).locator('[data-act="play"]')).toHaveText('▌▌ Pause');
  await expect(chrome(page).locator('.wc-player-clock')).toContainText('/ 02:02');
  // K/D/A/L markers from the stored events.
  await expect(chrome(page).locator('.wc-player-mark')).toHaveText(['AL►', 'K►', 'D►']);
  // Hovering a marker shows what happened, left of it on its row.
  await chrome(page).locator('.wc-player-mark', { hasText: 'K►' }).hover();
  const tip = chrome(page).locator('.wc-player-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText('Killed *Ibuki the Half-Elf*');
  const [mk, tb] = await Promise.all([
    chrome(page).locator('.wc-player-mark', { hasText: 'K►' }).boundingBox(),
    tip.boundingBox(),
  ]);
  expect(Math.abs(tb!.y - mk!.y)).toBeLessThan(1);
  expect(tb!.x + tb!.width).toBeLessThanOrEqual(mk!.x + 1);
  await chrome(page).locator('.wc-player-mark', { hasText: 'AL►' }).hover();
  await expect(tip.locator('div')).toHaveCount(2);
  await page.mouse.move(10, 300);
  await expect(tip).toBeHidden();
  // The panes fill from the recorded GMCP.
  await expect(player(page).locator('.wc-pane[data-pane="character"]')).toContainText('Rasta');
  await expect(player(page).locator('.wc-output')).toContainText('Rivendell Stables');
  // No input line.
  await expect(player(page).locator('.wc-input-slot')).toBeHidden();
  // The cockpit fills the window left of the strip (no letterbox).
  const geo = await page.evaluate(() => {
    const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const game = r('.wc-player .wc-output');
    return { vw: window.innerWidth, stage: r('.wc-player-stage'), strip: r('.wc-player-strip'), game };
  });
  expect(geo.stage.left).toBe(0);
  expect(Math.abs(geo.stage.right - geo.strip.left)).toBeLessThan(1);
  expect(geo.strip.right).toBeCloseTo(geo.vw, 0);
  expect(geo.game.width).toBeGreaterThan(geo.vw * 0.4);

  // Speed keys.
  await page.keyboard.press('6');
  await expect(chrome(page).locator('[data-act="speed"]')).toHaveText('8x   ');
  expect((await engine(page)).speed).toBe(8);
  await page.keyboard.press('3');
  expect((await engine(page)).speed).toBe(1);

  // A click low on the strip seeks forward (fast-forward, still playing) into run 2.
  const strip = await chrome(page).locator('.wc-player-strip').boundingBox();
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
  await expect(chrome(page).locator('[data-act="play"]')).toHaveText('► Play  ');
  await expect(player(page).locator('.wc-player-cursor')).toHaveCount(1);
  const last = await player(page).locator('.wc-player-cursor').textContent();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(player(page).locator('.wc-player-cursor')).not.toHaveText(last ?? '');
  expect((await engine(page)).playing).toBe(false);

  // A marker click seeks there, backwards (a rebuild), keeping the pause.
  await chrome(page).locator('.wc-player-mark', { hasText: 'K►' }).click();
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

  // End of the strip: it ends and auto-pauses.
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
  await expect(hints).toHaveText('Space Play/Pause · 1–6 Speed · ↑↓ Cursor · ESC Back');
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
