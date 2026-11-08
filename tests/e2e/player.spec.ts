// Stage 6 P2: the log player on the demo backup. History → RUN LOG opens
// the Rasta session (two runs); it plays with the panes filled and the
// commands echoed; speed keys, pause with the cursor line, a rail click,
// a marker click, the end, and ESC back to History with its state kept.
// Stage 32c (ADR 0114): the ghost-look box (±10 s, speed steps, Close),
// the kind-icon markers and the rail.
// Stage 45 (WP 45-D, ADR 0130): History in the new look opens it; the
// kit's Back at the top left (hides with the chrome, returns to History
// exactly as it was, never over the header or the box on a narrow
// window) and the times as h:mm:ss from one hour.
// Stage 45 owner feedback (2026-11-08, ADR 0130): the run log plays in
// History's big box over the sky; Fullscreen puts the player alone in the
// browser's fullscreen, and leaving it any way puts it back in the box.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';
import { openLongPlayer, openStart, playerBack, playerClock } from './look';

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
// History (stage 45, the new look): the page, its rows, the chosen row, its buttons.
const hist = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
const rows = (page: Page) => hist(page).locator('.wc-lk-tr');
const cur = (page: Page) => hist(page).locator('.wc-lk-tr.is-on');
const histBtn = (page: Page, id: string) => hist(page).locator(`.wc-lk-btn[data-btn="${id}"]`);

/** History's big box while it shows the run log (stage 45 owner feedback, ADR 0130). */
const runLogBox = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-box-large.wc-rl-box');

/** The player lies inside the big box's window, with the sky (the box's margin) around the box. */
async function expectInBox(page: Page): Promise<void> {
  await expect(runLogBox(page).locator('.wc-rl-slot > .wc-player')).toHaveCount(1);
  const g = await page.evaluate(() => {
    const r = (el: Element | null) => el!.getBoundingClientRect().toJSON() as DOMRect;
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      box: r(document.querySelector('.wc-rl-box')),
      player: r(document.querySelector('.wc-player')),
      fs: document.fullscreenElement !== null,
    };
  });
  expect(g.fs).toBe(false);
  expect(g.player.left).toBeGreaterThan(g.box.left);
  expect(g.player.top).toBeGreaterThan(g.box.top);
  expect(g.player.right).toBeLessThan(g.box.right);
  expect(g.player.bottom).toBeLessThan(g.box.bottom);
  expect(g.box.left).toBeGreaterThan(0);
  expect(g.box.top).toBeGreaterThan(0);
  expect(g.box.right).toBeLessThan(g.vw);
  expect(g.box.bottom).toBeLessThan(g.vh);
}

/** Opens History from the start menu and waits for its rows (keys before that are lost). */
async function openHistory(page: Page, count: number): Promise<void> {
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  await expect(hist(page).locator('.wc-lk-hood-t').last()).toHaveText('History');
  await expect(rows(page)).toHaveCount(count);
}

/** Restores the demo backup through the dev hook. */
async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

/**
 * Restores the demo backup and `copies` more of it, copy k with its run
 * ids renamed (`Gittan/c3-…`, the chain links too) and every time `k`
 * hours earlier, so History lists 3 × (copies + 1) sessions.
 */
async function restoreDemoCopies(page: Page, copies: number): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  const res = await page.evaluate(async (n) => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<{ added: number }> }> } };
    const gz = await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob();
    const text = await new Response(gz.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const lines = text.split('\n').filter((l) => l !== '');
    const out = [lines[0]!];
    for (let k = 0; k <= n; k++) {
      const shift = k * 3600e6;
      const id = (x: string): string => (k === 0 ? x : x.replace('/', `/c${k}-`));
      const at = (x: unknown): unknown => (typeof x === 'number' ? x - shift : x);
      for (const line of lines.slice(1)) {
        const o = JSON.parse(line) as Record<string, any>;
        if (o.type === 'export') {
          if (k === 0) out.push(line);
          continue;
        }
        if (o.type === 'run') {
          const m = o.run;
          m.runId = id(m.runId);
          for (const f of ['startedUs', 'endedUs', 'savedUs']) if (f in m) m[f] = at(m[f]);
          if (m.summary) {
            m.summary.startUs = at(m.summary.startUs);
            m.summary.lastEventUs = at(m.summary.lastEventUs);
            if (m.summary.previousRunId) m.summary.previousRunId = id(m.summary.previousRunId);
          }
        } else {
          o.runId = id(o.runId);
          if (o.type === 'event') o.event.us = at(o.event.us);
          if (o.type === 'chunk') {
            o.firstUs = at(o.firstUs);
            o.lastUs = at(o.lastUs);
            o.text = (o.text as string).replace(/^\d{16}/gm, (t) => String(Number(t) - shift).padStart(16, '0'));
          }
        }
        out.push(JSON.stringify(o));
      }
    }
    const blob = new Blob([out.join('\n') + '\n']);
    const packed = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    return (await w.__wc.runs()).restore(packed);
  }, copies);
  expect(res.added).toBe(4 * (copies + 1));
}

test('History → RUN LOG plays the Rasta session; pause, speed, seek, markers, ESC back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openHistory(page, 3);
  await page.keyboard.press('ArrowDown');
  await expect(cur(page)).toContainText('Rasta');
  await histBtn(page, 'RUN LOG').click();
  const opened = Date.now();

  // Text at once: the run's lead-in (login GMCP, VIEW/SIZE) takes no time.
  await expect(player(page).locator('.wc-output .wc-row').first()).toBeVisible({ timeout: 1000 });
  expect(Date.now() - opened).toBeLessThan(1500);
  expect((await engine(page)).position).toBeLessThan(1500);

  // Playing from the start, chrome shown, in History's big box: the start
  // page (its sky) stays around it (stage 45 owner feedback, ADR 0130).
  await expect(player(page)).toBeVisible();
  await expect(page.locator('.wc-start')).toBeVisible();
  await expect(runLogBox(page).locator('.wc-lk-hood-t').last()).toHaveText('Run log');
  await expectInBox(page);
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
  // The cockpit fills the box's window left of the rail (no letterbox); the rail is narrower than two cells.
  const geo = await page.evaluate(() => {
    const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const game = r('.wc-player .wc-output');
    const cellW = parseFloat(getComputedStyle(document.querySelector('.wc-player')!).getPropertyValue('--cell-w'));
    return { win: r('.wc-rl-slot'), stage: r('.wc-player-stage'), rail: r('.wc-player-rail'), game, cellW };
  });
  expect(geo.stage.left).toBeCloseTo(geo.win.left, 0);
  expect(Math.abs(geo.stage.right - geo.rail.left)).toBeLessThan(1);
  expect(geo.rail.right).toBeCloseTo(geo.win.right, 0);
  expect(geo.rail.width).toBeLessThan(2 * geo.cellW);
  expect(geo.game.width).toBeGreaterThan(geo.win.width * 0.4);

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
  await expect(hist(page).locator('.wc-lk-hood-t').last()).toHaveText('History');
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
  await expect(playerBack(page)).toBeVisible();
  await page.clock.runFor(6500);
  await expect(chrome(page)).toHaveAttribute('data-hidden', '');
  // Back is part of the chrome: it goes with it and takes no pointer.
  await expect(playerBack(page)).toHaveCSS('pointer-events', 'none');
  await page.mouse.move(200, 200);
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
  await expect(playerBack(page)).toHaveCSS('pointer-events', 'auto');
  // A key shows it too (Shift does nothing else in the player).
  await page.clock.runFor(6500);
  await expect(chrome(page)).toHaveAttribute('data-hidden', '');
  await page.keyboard.press('Shift');
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
  expect(errors).toEqual([]);
});

test('Back: the kit look at the top left, hides with the chrome, returns to History exactly as it was', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 700 });
  await pinDemoClock(page);
  await page.goto('/');
  // 13 × the demo: Gittan has 26 sessions, more than the table shows.
  await restoreDemoCopies(page, 12);
  await openHistory(page, 39);

  // History's state: the Gittan pill, sorted by Time (twice: flipped), scrolled, a row far down chosen.
  await hist(page).locator('.wc-hist-pills [aria-checked]', { hasText: 'Gittan' }).click();
  await expect(rows(page)).toHaveCount(26);
  const timeHead = hist(page).locator('.wc-lk-th[data-key="time"]');
  await timeHead.click();
  const dir1 = await timeHead.getAttribute('data-dir');
  await timeHead.click();
  await expect(timeHead).not.toHaveAttribute('data-dir', dir1 ?? '');
  const body = hist(page).locator('.wc-lk-tbody');
  expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(100);
  await body.evaluate((el) => (el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2)));
  // The row in the middle of what shows.
  const pick = await body.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    return [...el.querySelectorAll('.wc-lk-tr')].findIndex((x) => {
      const b = x.getBoundingClientRect();
      return b.top <= mid && b.bottom > mid;
    });
  });
  expect(pick).toBeGreaterThan(3);
  await rows(page).nth(pick).click();
  await expect(rows(page).nth(pick)).toHaveClass(/is-on/);
  const state = async () => ({
    pill: await hist(page).locator('.wc-hist-pills [aria-checked="true"]').textContent(),
    dir: await timeHead.getAttribute('data-dir'),
    rows: await rows(page).count(),
    cur: await cur(page).textContent(),
    idx: await rows(page).evaluateAll((rs) => rs.findIndex((r) => r.classList.contains('is-on'))),
    card: await hist(page).locator('.wc-hist-card .wc-hist-name').textContent(),
    scroll: await body.evaluate((el) => el.scrollTop),
  });
  const before = await state();
  expect(before.idx).toBe(pick);
  await page.keyboard.press('r');

  // The player, in History's big box: Back at its top left, the kit's glass Back in Cinzel.
  const back = playerBack(page);
  await expect(back).toBeVisible();
  await expectInBox(page);
  await expect(back).toHaveText('Back');
  await expect(back).toHaveAttribute('title', 'Back to History (Esc)');
  await expect(back).toHaveAttribute('aria-label', 'Back to History (Esc)');
  await expect(back).toHaveClass(/wc-lk-back/);
  await expect(back).toHaveCSS('font-family', /Cinzel/);
  await expect(back.locator('svg.wc-lk-ic')).toHaveCount(1);
  const bb = (await back.boundingBox())!;
  const pl = (await player(page).boundingBox())!;
  expect(bb.x - pl.x).toBeGreaterThanOrEqual(4);
  expect(bb.x - pl.x).toBeLessThan(24);
  expect(bb.y - pl.y).toBeGreaterThanOrEqual(0);
  expect(bb.y - pl.y).toBeLessThan(16);
  // The box's own Back is not drawn: the player's is the way back.
  await expect(runLogBox(page).locator(':scope > .wc-lk-back')).toBeHidden();
  // It never takes the focus (the player's keys stay the player's).
  expect(await back.evaluate((el) => el.tabIndex)).toBe(-1);
  // Clear of the header's left part and of the box.
  const head = (await chrome(page).locator('.wc-player-head-left').boundingBox())!;
  expect(head.x).toBeGreaterThanOrEqual(bb.x + bb.width);
  const box = (await chrome(page).locator('.wc-player-box').boundingBox())!;
  expect(box.y).toBeGreaterThan(bb.y + bb.height);

  // Playing: Back hides with the chrome 6 s after the last activity.
  await expect(chrome(page).locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Pause');
  await page.mouse.move(700, 400);
  await expect(chrome(page)).toHaveAttribute('data-hidden', '', { timeout: 9000 });
  await expect.poll(() => chrome(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  await expect(back).toHaveCSS('pointer-events', 'none');
  // A pointer move brings it back.
  await page.mouse.move(720, 420);
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
  await expect(back).toHaveCSS('pointer-events', 'auto');
  // Paused, it stays.
  await page.keyboard.press(' ');
  await expect(chrome(page).locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Play');
  await page.waitForTimeout(6500);
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
  await expect(back).toBeVisible();

  // A click: History exactly as it was (pill, sort, cursor, card, scroll).
  await back.click();
  await expect(player(page)).toHaveCount(0);
  await expect(hist(page).locator('.wc-lk-hood-t').last()).toHaveText('History');
  await expect(rows(page)).toHaveCount(26);
  await expect(cur(page)).toHaveText(before.cur!);
  expect(await state()).toEqual(before);
  expect(await page.evaluate(() => (window as unknown as { __wc: { shell: { playerHost: unknown } } }).__wc.shell.playerHost)).toBeNull();
  // The keys are History's again: ↓ moves the cursor one row.
  await page.keyboard.press('ArrowDown');
  await expect(rows(page).nth(pick + 1)).toHaveClass(/is-on/);
  expect(errors).toEqual([]);
});

test('h:mm:ss from one hour: the clock and the rail hint; under an hour mm:ss', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 820 });
  await openStart(page);
  expect(await openLongPlayer(page, (60 + 34) * 60 + 7)).toEqual({ ok: true });
  // A 1h34m session: …/ 1:34:07; under an hour the position keeps mm:ss.
  await expect(playerClock(page)).toHaveText(/^00:\d\d \/ 1:34:07$/);
  await page.keyboard.press(' ');
  await expect(chrome(page).locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Play');
  await page.evaluate(() =>
    (window as unknown as { __wc: { shell: { playerHost: { engine: { seek(ms: number): void } } } } }).__wc.shell.playerHost.engine.seek(
      59 * 60_000 + 59_000,
    ),
  );
  await settled(page);
  await expect(playerClock(page)).toHaveText('59:59 / 1:34:07');
  await page.keyboard.press('ArrowRight');
  await settled(page);
  await expect(playerClock(page)).toHaveText('1:00:09 / 1:34:07');
  // The rail's seek hint while dragging: h:mm:ss low on the rail (past the hour), mm:ss at the top.
  const rail = (await chrome(page).locator('.wc-player-rail').boundingBox())!;
  const hint = chrome(page).locator('.wc-player-hint');
  await page.mouse.move(rail.x + rail.width / 2, rail.y + rail.height * 0.9);
  await page.mouse.down();
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText(/^\s*1:[0-3]\d:\d\d\s*$/);
  await page.mouse.move(rail.x + rail.width / 2, rail.y + 2, { steps: 4 });
  await expect(hint).toHaveText(/^\s*00:\d\d\s*$/);
  await page.mouse.up();
  await expect(hint).toBeHidden();
  await settled(page);
  await expect(playerClock(page)).toHaveText(/^00:\d\d \/ 1:34:07$/);
  // Esc goes back as Back does (to the start page here).
  await page.keyboard.press('Escape');
  await expect(player(page)).toHaveCount(0);
  await expect(page.locator('.wc-start')).toBeVisible();
});

test('a narrow window (≤ 480 px): Back never covers the header’s left part or the compact box', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/?player=runs-demo.jsonl.gz');
  await expect(player(page).locator('.wc-output')).toContainText('Rivendell Stables');
  // Paused: the chrome stays up while we measure.
  await page.keyboard.press(' ');
  await expect(chrome(page).locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Play');
  type R = { x: number; y: number; width: number; height: number };
  const meet = (a: R, b: R): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const sizes: Array<[number, number]> = [
    [480, 700],
    [420, 640],
    [390, 844],
    [360, 640],
    [320, 568],
  ];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await expect(chrome(page).locator('.wc-player-box')).toHaveAttribute('data-compact', '');
    // The header lays out again on the next frame after the resize.
    await expect
      .poll(async () => {
        const b = (await playerBack(page).boundingBox())!;
        const l = (await chrome(page).locator('.wc-player-head-left').boundingBox())!;
        return l.x >= b.x + b.width;
      })
      .toBe(true);
    const back = (await playerBack(page).boundingBox())!;
    const left = (await chrome(page).locator('.wc-player-head-left').boundingBox())!;
    const box = (await chrome(page).locator('.wc-player-box').boundingBox())!;
    expect(meet(back, left), `${w}×${h}: Back over the header`).toBe(false);
    expect(meet(back, box), `${w}×${h}: Back over the box`).toBe(false);
    // Back and the header's left part stay inside the window (the left part is cut, not pushed out).
    expect(back.x).toBeGreaterThanOrEqual(0);
    expect(left.x + left.width).toBeLessThanOrEqual(w + 0.5);
    // Nothing lies over Back: its middle is Back's.
    const mid: [number, number] = [back.x + back.width / 2, back.y + back.height / 2];
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.wc-pv-back') != null, mid), `${w}×${h}: Back covered`).toBe(true);
  }
  await playerBack(page).click();
  await expect(player(page)).toHaveCount(0);
  await expect(page.locator('.wc-start')).toBeVisible();
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

test('the control box has Fullscreen: it toggles the player’s own fullscreen, its label follows', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/?player=runs-demo.jsonl.gz');
  await expect(player(page).locator('.wc-output')).toContainText('Rivendell Stables');
  const fs = chrome(page).locator('.wc-player-box [data-act="extra"]');
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
  // Fullscreen sits before Close.
  const acts = await chrome(page).locator('.wc-player-box button[data-act]').evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.act));
  expect(acts.indexOf('extra')).toBe(acts.indexOf('close') - 1);
  // Every button inside the box (Firefox once let Close stick out: flex-basis left out of max-content).
  const out = await chrome(page).locator('.wc-player-box').evaluate((box) => {
    const b = box.getBoundingClientRect();
    return [...box.querySelectorAll(':scope > .wc-pc-row button')]
      .map((x) => x.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.left < b.left - 0.5 || r.right > b.right + 0.5)).length;
  });
  expect(out).toBe(0);
  await fs.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect(fs).toHaveAttribute('aria-label', 'Exit fullscreen');
  await fs.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
});

test('History → Run log in the big box; Fullscreen fills the screen, leaving it any way puts it back; Esc returns to History', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openHistory(page, 3);
  await page.keyboard.press('ArrowDown');
  await expect(cur(page)).toContainText('Rasta');
  const chosen = await cur(page).textContent();
  await page.keyboard.press('Enter');
  await expect(player(page).locator('.wc-output')).toContainText('Rivendell Stables');
  // In the box: the start page and its sky stay around it.
  await expect(page.locator('.wc-start')).toBeVisible();
  await expectInBox(page);

  const fs = chrome(page).locator('.wc-player-box [data-act="extra"]');
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
  const filled = () =>
    page.evaluate(() => {
      const p = document.querySelector('.wc-player')!;
      const r = p.getBoundingClientRect();
      return {
        el: document.fullscreenElement === p,
        full: Math.abs(r.left) < 1 && Math.abs(r.top) < 1 && Math.abs(r.width - window.innerWidth) < 1 && Math.abs(r.height - window.innerHeight) < 1,
      };
    });
  const railGap = async () => {
    const [r, p] = await Promise.all([chrome(page).locator('.wc-player-rail').boundingBox(), player(page).boundingBox()]);
    return Math.abs(r!.x + r!.width - (p!.x + p!.width));
  };

  // The button: the player alone in the browser's fullscreen, filling it.
  await fs.click();
  await expect.poll(filled).toEqual({ el: true, full: true });
  await expect(fs).toHaveAttribute('aria-label', 'Exit fullscreen');
  await expect.poll(railGap).toBeLessThan(1);
  // The button again: back in the box.
  await fs.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
  await expectInBox(page);
  // Fullscreen left the browser's way (Esc, F11): back in the box too.
  await fs.click();
  await expect.poll(filled).toEqual({ el: true, full: true });
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
  await expectInBox(page);
  await expect.poll(railGap).toBeLessThan(1);
  // The player's keys work in the box.
  await page.keyboard.press(' ');
  await expect(chrome(page).locator('[data-act="play"]')).toHaveAttribute('aria-label', 'Play');

  // Closing it from fullscreen leaves fullscreen with it.
  await fs.click();
  await expect.poll(filled).toEqual({ el: true, full: true });
  await chrome(page).locator('.wc-player-box [data-act="close"]').click();
  await expect(player(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(hist(page).locator('.wc-lk-hood-t').last()).toHaveText('History');
  await expect(cur(page)).toHaveText(chosen!);

  // Esc from the box: History, the same session chosen.
  await page.keyboard.press('Enter');
  await expect(player(page).locator('.wc-output')).toContainText('Rivendell Stables');
  await page.keyboard.press('Escape');
  await expect(player(page)).toHaveCount(0);
  await expect(hist(page).locator('.wc-lk-hood-t').last()).toHaveText('History');
  await expect(cur(page)).toHaveText(chosen!);
  expect(errors).toEqual([]);
});
