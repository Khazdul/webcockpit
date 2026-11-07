// Stage 42f (ADR 0127): the player core. The run log player has the
// kit's Back at the top left (it hides with the chrome, and returns to
// History as it was) and times as h:mm:ss; the HTML replay keeps no Back
// and MM:SS; openPlayer resolves to why it did not open; embedPlayer
// mounts a host in a slot with the start page shown; the kit gallery's
// Player section drives a bare embedded view with press().
import { writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';
import { NO_STATE } from './legacy-state';
import { kitSection, longLogText, openKit, openLongPlayer, openStart, playerBack, playerClock } from './look';

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const chrome = (page: Page) => page.locator('.wc-player-chrome');

type Shell = {
  playerHost: unknown;
  openPlayer(s: unknown): Promise<{ ok: boolean; error?: string }>;
  embedPlayer(slot: HTMLElement): Promise<{ close(): void; dispose(): void } | null>;
};

/** The start page up (its menu shown: a player opened before that would be covered by it) and the dev hooks. */
async function ready(page: Page): Promise<void> {
  await openStart(page);
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
}

test('the run log player: Back at the top left hides with the chrome and returns to History as it was', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
  await ready(page);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  await page.locator('.wc-start .wc-sm-item[data-key="history"]').click();
  // History in the new look (stage 45).
  const hist = frame(page).locator('.wc-hist');
  await expect(hist.locator('.wc-lk-tr')).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  const cur = hist.locator('.wc-lk-tr.is-on');
  await expect(cur).toContainText('Rasta');
  const before = await cur.textContent();
  await hist.locator('.wc-lk-btn[data-btn="RUN LOG"]').click();

  const back = playerBack(page);
  await expect(back).toBeVisible();
  await expect(back).toHaveText('Back');
  await expect(back).toHaveAttribute('title', 'Back to History (Esc)');
  const box = (await back.boundingBox())!;
  expect(box.x).toBeLessThan(24);
  expect(box.y).toBeLessThan(16);
  // The kit's look: the glass Back in Cinzel.
  await expect(back).toHaveCSS('font-family', /Cinzel/);
  // The header's left part is clear of it.
  const head = (await chrome(page).locator('.wc-player-head-left').boundingBox())!;
  expect(head.x).toBeGreaterThanOrEqual(box.x + box.width);
  // A short session keeps MM:SS (under an hour).
  await expect(playerClock(page)).toContainText('/ 02:02');
  // Playing: the chrome (Back with it) hides 6 s after the last activity.
  await page.mouse.move(700, 400);
  await expect(chrome(page)).toHaveAttribute('data-hidden', '', { timeout: 9000 });
  await expect(back).toHaveCSS('opacity', '1');
  await expect.poll(() => chrome(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  await expect(back).toHaveCSS('pointer-events', 'none');
  // A pointer move shows it again; a click goes back to History, its cursor kept.
  await page.mouse.move(720, 420);
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
  await expect(back).toHaveCSS('pointer-events', 'auto');
  await back.click();
  await expect(page.locator('.wc-player')).toHaveCount(0);
  await expect(hist.locator('.wc-lk-hood-t').last()).toHaveText('History');
  await expect(cur).toHaveText(before!);
  expect(await page.evaluate(() => (window as unknown as { __wc: { shell: Shell } }).__wc.shell.playerHost)).toBeNull();
});

test('the run log player reads h:mm:ss from one hour; a narrow window keeps the header clear of Back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ready(page);
  expect(await openLongPlayer(page, (60 + 34) * 60 + 7)).toEqual({ ok: true });
  await expect(playerClock(page)).toHaveText(/^00:0\d \/ 1:34:07$/);
  // Seek past the hour: the position reads h:mm:ss too.
  await page.evaluate(() => {
    const e = (window as unknown as { __wc: { shell: { playerHost: { engine: { seek(ms: number): void; pause(): void } } } } }).__wc.shell.playerHost.engine;
    e.pause();
    e.seek((60 + 2) * 60_000 + 3_000);
  });
  await expect(playerClock(page).locator('b')).toHaveText('1:02:03');
  // Narrow: the header starts right of Back.
  await page.setViewportSize({ width: 420, height: 720 });
  await expect
    .poll(async () => {
      const b = (await playerBack(page).boundingBox())!;
      const h = (await chrome(page).locator('.wc-player-header').boundingBox())!;
      return h.x >= b.x + b.width;
    })
    .toBe(true);
  // Esc goes back as Back does (to the start page here).
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-player')).toHaveCount(0);
  await expect(page.locator('.wc-start')).toBeVisible();
});

test('the HTML replay has no Back and keeps MM:SS', async ({ page, browser }, info) => {
  await ready(page);
  const text = longLogText((60 + 34) * 60 + 7);
  const html = await page.evaluate(
    (t) => (window as unknown as { __wc: { replayHtml(o: unknown): Promise<string> } }).__wc.replayHtml({ texts: [t], character: 'Long' }),
    text,
  );
  const path = info.outputPath('replay.html');
  writeFileSync(path, html);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, storageState: NO_STATE });
  const p = await ctx.newPage();
  await p.goto(`file://${path}`);
  await p.waitForFunction(() => (window as unknown as { __wcReplay?: unknown }).__wcReplay != null);
  await expect(playerClock(p)).toHaveText(/^\d\d:\d\d \/ 94:07$/);
  await expect(p.locator('.wc-player-chrome')).toHaveCount(1);
  await expect(playerBack(p)).toHaveCount(0);
  await ctx.close();
});

test('openPlayer resolves to why it did not open; the start page stays', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() =>
    (window as unknown as { __wc: { shell: Shell } }).__wc.shell.openPlayer({
      id: 'Nobody/none',
      character: 'Nobody',
      runs: [{ runId: 'Nobody/none' }],
    }),
  );
  expect(r).toEqual({ ok: false, error: 'The run log is not stored.' });
  await expect(page.locator('.wc-start')).toBeVisible();
  await expect(page.locator('.wc-player')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __wc: { shell: Shell } }).__wc.shell.playerHost)).toBeNull();
});

test('embedPlayer mounts a host in a slot; the start page stays; a second player is refused', async ({ page }) => {
  await ready(page);
  const out = await page.evaluate(async () => {
    const shell = (window as unknown as { __wc: { shell: Shell } }).__wc.shell;
    const slot = document.createElement('div');
    slot.id = 'kit-slot';
    slot.style.cssText = 'position:fixed;left:40px;top:40px;width:480px;height:300px;z-index:900';
    document.body.append(slot);
    const host = await shell.embedPlayer(slot);
    const tracked = host !== null && shell.playerHost === host;
    const second = await shell.embedPlayer(document.body);
    const open = await shell.openPlayer({ id: 'x', character: 'X', runs: [] });
    return { tracked, second, open };
  });
  expect(out).toEqual({ tracked: true, second: null, open: { ok: false, error: 'Another player is open.' } });
  // It fills its slot and follows its size; the start page is still shown.
  const host = page.locator('#kit-slot > .wc-player');
  await expect(host).toHaveCount(1);
  expect(await host.boundingBox()).toEqual({ x: 40, y: 40, width: 480, height: 300 });
  await page.evaluate(() => (document.getElementById('kit-slot')!.style.width = '360px'));
  await expect.poll(async () => (await host.boundingBox())!.width).toBe(360);
  await expect(page.locator('.wc-start')).toBeVisible();
  // close() hands it back: no player, the start page as it was.
  const after = await page.evaluate(() => {
    const shell = (window as unknown as { __wc: { shell: Shell & { playerHost: { close(): void } | null } } }).__wc.shell;
    shell.playerHost!.close();
    return shell.playerHost;
  });
  expect(after).toBeNull();
  await expect(host).toHaveCount(0);
  await expect(page.locator('.wc-start')).toBeVisible();
});

test('the kit gallery: an embedded bare player driven by press()', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKit(page, 'player');
  const sec = kitSection(page, 'player');
  const slot = sec.locator('[data-kit="player-slot"]');
  await expect(slot.locator('.wc-player .wc-output')).toBeVisible();
  // Bare: no header, rail or box; the stage fills the slot.
  await expect(slot.locator('.wc-player-chrome[data-bare]')).toHaveCount(1);
  await expect(slot.locator('.wc-player-header, .wc-player-rail, .wc-player-box, .wc-pv-back')).toHaveCount(0);
  const read = sec.locator('[data-kit="player-read"]');
  // The built-in sample (no stored sessions on a fresh page): 1:34:07, paused at the start.
  await expect(read).toHaveText('00:00 / 1:34:07 · 1× · paused');
  await sec.locator('[data-btn="press-fwd"]').click();
  await expect(read).toHaveText('00:10 / 1:34:07 · 1× · paused');
  await expect(slot.locator('.wc-output .wc-row:not([hidden])').first()).toBeVisible();
  const slotBox = (await slot.boundingBox())!;
  const stage = (await slot.locator('.wc-player-stage').boundingBox())!;
  expect(Math.abs(stage.width - (slotBox.width - 2))).toBeLessThan(1.5);
  await sec.locator('[data-btn="press-faster"]').click();
  await expect(read).toContainText('· 2× ·');
  await sec.locator('[data-btn="press-play"]').click();
  await expect(read).toContainText('playing');
  await sec.locator('[data-btn="press-play"]').click();
  await expect(read).toContainText('paused');
  // The keys are the player's while it is shown: Space plays.
  await page.keyboard.press(' ');
  await expect(read).toContainText('playing');
  await page.keyboard.press(' ');
  await expect(read).toContainText('paused');
  // Only the player's: the page's own keys (] the next section) do nothing while it shows.
  await page.keyboard.press(']');
  await page.waitForTimeout(150);
  await expect(page.locator('.wc-lk-tab[data-tab="player"]')).toHaveAttribute('aria-selected', 'true');
  // The brighter red: the player's ANSI 1.
  const red = () => slot.locator('.wc-player').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--ansi-1'));
  expect(await red()).toBe('#800000');
  await sec.getByRole('switch', { name: /Brighter red/ }).click();
  await expect.poll(red).toBe('#c43c3c');
  // Parked: the slot hides and Space no longer reaches the player.
  await sec.getByRole('switch', { name: /Park/ }).click();
  await expect(slot).toBeHidden();
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  await expect(read).toContainText('paused');
  // Parked, the page's keys are back: ] goes to the next section.
  await page.keyboard.press(']');
  await expect(page.locator('.wc-lk-tab[data-tab="player"]')).toHaveAttribute('aria-selected', 'false');
});
