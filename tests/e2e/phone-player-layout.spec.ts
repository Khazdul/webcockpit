// Stage 55 (round 55c): the run log player on a phone or tablet has the
// phone's game layout over the recording, read-only: the lens, the pane
// strip, Comm and the bands, with no compass, hot keys, keyboard, menu key
// or command field, and no tab strip. The player's control box is a bar
// docked where the command row is in the game: it never hides, its first
// key is the way out, and Display opens above it. What is open in the layer
// survives the new App of a backward seek, and nothing the viewer does is
// written to the stored settings. The recorded theme is the player's own.
//
// `phone` project. The player is opened from the start page on
// tests/fixtures (`__wc.openPlayerLogs`, or a chain with a VIEW record for
// the theme cases), over the whole window; the way in through History's box
// is tests/e2e/phone-player.spec.ts.
import { type Locator, type Page, expect, test } from '@playwright/test';

const LAST_ROOM = '26971';

const player = (page: Page) => page.locator('.wc-player');
const cockpit = (page: Page) => player(page).locator('.wc-cockpit');
const chrome = (page: Page) => page.locator('.wc-player-chrome');
const bar = (page: Page) => page.locator('.wc-player-box');
const key = (page: Page, act: string) => bar(page).locator(`.wc-pc-row [data-act="${act}"]`);
const speed = (page: Page) => bar(page).locator('.wc-player-speed');
const clock = (page: Page) => bar(page).locator('.wc-player-clock');
const sat = (page: Page, name: string) => player(page).locator(`.wc-ph-sat[data-sat="${name}"]:visible`);
const lens = (page: Page) => player(page).locator('.wc-ph-lens');
const stripPane = (page: Page) => player(page).locator('.wc-cockpit > .wc-pane[data-phone-strip]');
const dots = (page: Page) => player(page).locator('.wc-ph-strip-dots > i');
const comm = (page: Page) => player(page).locator('.wc-cockpit > .wc-pane[data-pane="comm"]');
const mapContent = (page: Page) => player(page).locator('.wc-pane-map .wc-pane-content');

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

interface Eng {
  position: number;
  duration: number;
  playing: boolean;
  seeking: boolean;
  speed: number;
}

const engine = (page: Page): Promise<Eng> =>
  page.evaluate(() => {
    const e = (window as unknown as { __wc: { shell: { playerHost: { engine: Eng } } } }).__wc.shell.playerHost.engine;
    return { position: e.position, duration: e.duration, playing: e.playing, seeking: e.seeking, speed: e.speed };
  });

/** Pauses and seeks to `ms` (Infinity: the end); resolves when the seek has landed. */
async function seek(page: Page, ms: number): Promise<void> {
  await page.evaluate((ms) => {
    const e = (window as unknown as { __wc: { shell: { playerHost: { engine: { pause(): void; seek(ms: number): void; duration: number } } } } }).__wc.shell.playerHost.engine;
    e.pause();
    e.seek(Math.min(ms, e.duration));
  }, ms);
  await expect.poll(async () => (await engine(page)).seeking).toBe(false);
}

/** The stored settings, as text. */
const stored = (page: Page): Promise<string> => page.evaluate(() => JSON.stringify(window.__wc!.settings.get()));

/** The start page on a phone (or with `query`), ready for a player. */
async function start(page: Page, query = 'phone=1'): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
}

/** The run log player on raw fixture logs, the phone layer mounted and the bar docked. */
async function openLogs(page: Page, rels: string[]): Promise<void> {
  await page.evaluate((rels) => window.__wc!.openPlayerLogs(rels, 'Rasta'), rels);
  await expect(player(page).locator('.wc-ph-layer')).toHaveCount(1);
  await expect(bar(page)).toHaveAttribute('data-docked', '');
}

/**
 * The player on the GMCP demo with a VIEW record in front that carries the
 * viewer's own appearance with `look` laid over it: a recording made in
 * another theme than the viewer's.
 */
async function openWithView(page: Page, look: { bg: string; fg: string }): Promise<void> {
  await page.evaluate(async (look) => {
    const w = window as unknown as {
      __wc: { settings: { get(): { appearance: object } }; shell: { openPlayerChain(chain: unknown[], events: unknown[], info: { character: string }): Promise<unknown> } };
    };
    const text = await (await fetch('/__fixtures/gmcp-demo.log')).text();
    const us = /^(\d{16}) /.exec(text)![1]!;
    const view = JSON.stringify({ appearance: { ...w.__wc.settings.get().appearance, ...look } });
    const meta = { runId: 'Rasta/0', character: 'Rasta', startedUs: Number(us), endedUs: null, sealed: true, bytes: text.length, lines: 0 };
    await w.__wc.shell.openPlayerChain([{ meta, text: `${us} ${String.fromCharCode(27)}VIEW ${view}\n${text}` }], [], { character: 'Rasta' });
  }, look);
  await expect(player(page).locator('.wc-ph-layer')).toHaveCount(1);
  await expect(bar(page)).toHaveAttribute('data-docked', '');
}

/** A one-finger drag from (x0, y0) by (dx, dy), as a finger does it. */
async function drag(page: Page, x0: number, y0: number, dx: number, dy: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const at = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: y!, id: 0 }] });
  await at('touchStart', x0, y0);
  for (let i = 1; i <= 4; i++) await at('touchMove', x0 + (dx * i) / 4, y0 + (dy * i) / 4);
  await at('touchEnd');
  await cdp.detach();
}

/** Every shown key of the bar lies inside it and the window and is a finger's target; none lies on another. */
async function keysFit(page: Page): Promise<void> {
  const b = await box(bar(page));
  const v = page.viewportSize()!;
  expect(b.x).toBeGreaterThanOrEqual(-0.5);
  expect(b.x + b.width).toBeLessThanOrEqual(v.width + 0.5);
  expect(b.y + b.height).toBeLessThanOrEqual(v.height + 0.5);
  const rects: Box[] = [];
  for (const k of await bar(page).locator('.wc-pc-row button:visible, .wc-pc-row .wc-player-speed[role="button"]:visible').all()) {
    const r = await box(k);
    expect(r.x).toBeGreaterThanOrEqual(b.x - 0.5);
    expect(r.x + r.width).toBeLessThanOrEqual(b.x + b.width + 0.5);
    expect(r.height).toBeGreaterThanOrEqual(43.5);
    expect(r.width).toBeGreaterThanOrEqual(39.5);
    rects.push(r);
  }
  rects.sort((a, c) => a.x - c.x);
  for (let i = 1; i < rects.length; i++) expect(rects[i]!.x).toBeGreaterThanOrEqual(rects[i - 1]!.x + rects[i - 1]!.width - 0.5);
}

test('the phone layout over the recording: no tab strip, no keys of the live game; the lens follows the replayed room; the bar is docked and its first key is the way out', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await start(page);
  await openLogs(page, ['map-demo.log']);
  // The phone's game layout, not the tab strip.
  await expect(cockpit(page)).toHaveAttribute('data-phone-game', '');
  await expect(player(page).locator('.wc-phone-tab:visible')).toHaveCount(0);
  // Nothing of the live game: no compass, hot keys, keyboard, menu key, command field; no Back at the top left.
  await expect(player(page).locator('.wc-ph-pad, .wc-ph-hk, .wc-ph-kk, .wc-okb, .wc-ph-menu, .wc-ph-menu-rescue, .wc-ph-menu-host')).toHaveCount(0);
  await expect(page.locator('.wc-okb')).toHaveCount(0);
  await expect(player(page).locator('.wc-input-slot .wc-input-field')).toBeHidden();
  await expect(chrome(page).locator('.wc-pv-back')).toHaveCount(0);
  await expect(sat(page, 'fullscreen')).toHaveCount(0);
  // No fullscreen corner button over the lens.
  await expect(page.locator('.wc-fs-btn')).toBeHidden();

  // The lens follows the replayed walk to its last room.
  await seek(page, Infinity);
  await expect(lens(page)).toBeVisible();
  await expect(mapContent(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await expect(mapContent(page)).toHaveAttribute('data-map-room', LAST_ROOM);
  await expect(mapContent(page)).toHaveAttribute('data-map-located', '1');

  // The bar: in the command row's place, down to the bottom edge, over the whole width.
  const pl = await box(player(page));
  const b = await box(bar(page));
  const input = await box(player(page).locator('.wc-input-slot'));
  expect(Math.abs(b.y - input.y)).toBeLessThan(1);
  expect(Math.abs(b.x - input.x)).toBeLessThan(1);
  expect(Math.abs(b.y + b.height - (pl.y + pl.height))).toBeLessThan(1);
  expect(Math.abs(b.x + b.width - (pl.x + pl.width))).toBeLessThan(1);
  // The game text ends above it; the rail ends above it too.
  const game = await box(player(page).locator('.wc-game'));
  expect(game.y + game.height).toBeLessThanOrEqual(b.y + 0.5);
  const rail = await box(chrome(page).locator('.wc-player-rail'));
  expect(rail.y + rail.height).toBeLessThanOrEqual(b.y + 0.5);
  // Its keys at 360 px: the way out first, back 10 s, play, forward 10 s, the speed, the time, Display.
  await expect(bar(page)).toHaveAttribute('data-narrow', '');
  await expect(bar(page)).not.toHaveAttribute('data-tight', '');
  await keysFit(page);
  const acts = await bar(page).locator('.wc-pc-row button:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.act));
  expect(acts).toEqual(['close', 'back', 'play', 'fwd', 'display']);
  await expect(key(page, 'close')).toHaveAttribute('aria-label', 'Back to History (Esc)');
  expect((await box(key(page, 'close'))).x - pl.x).toBeLessThan(12);
  await expect(clock(page)).toBeVisible();
  await expect(clock(page).locator('.wc-pc-dur')).toBeHidden();
  await expect(speed(page)).toHaveText('1×');
  // No Panes popup here.
  await expect(key(page, 'panes')).toHaveCount(0);

  // The way out by tap.
  await key(page, 'close').tap();
  await expect(player(page)).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toBeVisible();
  await expect(page.locator('.wc-ph-layer')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the bar never hides and its keys are pressed at once: play and pause, back and forward 10 s, the speed', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await start(page);
  await openLogs(page, ['gmcp-demo.log']);
  await expect.poll(async () => (await engine(page)).playing).toBe(true);
  // The rest of the chrome hides after a while; the bar stays as it was.
  await expect(chrome(page)).toHaveAttribute('data-hidden', '', { timeout: 9000 });
  await expect(chrome(page).locator('.wc-player-header')).toHaveCSS('opacity', '0');
  await expect(chrome(page)).toHaveCSS('opacity', '1');
  await expect(bar(page)).toBeVisible();
  await expect(key(page, 'play')).toHaveCSS('pointer-events', 'auto');
  // A tap on a key while the rest is hidden is that key's (not a tap that only shows the chrome).
  await key(page, 'play').tap();
  await expect(key(page, 'play')).toHaveAttribute('aria-label', 'Play');
  expect((await engine(page)).playing).toBe(false);
  // Paused, the rest hides again; the bar still stays.
  await expect(chrome(page)).toHaveAttribute('data-hidden', '', { timeout: 9000 });
  await expect(bar(page)).toBeVisible();
  // Forward and back 10 s.
  const at = (await engine(page)).position;
  await key(page, 'fwd').tap();
  await expect.poll(async () => (await engine(page)).seeking).toBe(false);
  expect((await engine(page)).position).toBeGreaterThanOrEqual(at + 10_000 - 1);
  await key(page, 'back').tap();
  await expect.poll(async () => (await engine(page)).seeking).toBe(false);
  expect(Math.abs((await engine(page)).position - at)).toBeLessThan(1000);
  // The speed key: the next speed at each tap, round from the fastest to the slowest.
  await speed(page).tap();
  await expect(speed(page)).toHaveText('2×');
  await speed(page).tap();
  await speed(page).tap();
  await expect(speed(page)).toHaveText('8×');
  await speed(page).tap();
  await expect(speed(page)).toHaveText('0.25×');
  expect((await engine(page)).speed).toBe(0.25);
  // Play again by tap.
  await key(page, 'play').tap();
  await expect(key(page, 'play')).toHaveAttribute('aria-label', 'Pause');
  // A tap on a key of the layer is the layer's: it moves no pause cursor and toggles nothing.
  await key(page, 'play').tap();
  await seek(page, Infinity);
  await expect(player(page).locator('.wc-player-cursor')).toHaveCount(1);
  const cursor = await player(page).locator('.wc-player-cursor').evaluate((el) => el.textContent);
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toBeVisible();
  expect((await engine(page)).playing).toBe(false);
  expect(await player(page).locator('.wc-player-cursor').evaluate((el) => el.textContent)).toBe(cursor);
  // A tap on a line of the game text still sets the cursor there.
  const row = player(page).locator('.wc-game .wc-rows .wc-row').filter({ hasText: 'You stand up.' }).first();
  await row.tap({ position: { x: 20, y: 4 } });
  await expect(row).toHaveClass(/wc-player-cursor/);
  expect(errors).toEqual([]);
});

test('the strip opens and swipes its pages (no Statistics), Comm is read-only; what is open survives a backward seek; nothing is written to the stored settings', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  // Every built-in pane a page of the strip, Statistics too.
  await page.evaluate(() => {
    const s = window.__wc!.settings;
    s.update({ phone: { strip: { panes: s.get().phone.strip.panes.map((e) => ({ ...e, on: true })) } } });
  });
  expect(await page.evaluate(() => window.__wc!.settings.get().phone.strip.panes.some((e) => e.id === 'statistics' && e.on))).toBe(true);
  const before = await stored(page);
  await openLogs(page, ['map-demo.log', 'gmcp-demo.log']);
  await seek(page, Infinity);
  await expect(player(page).locator('.wc-rows .wc-row').filter({ hasText: 'A crow caws somewhere to the north.' })).toHaveCount(1);

  // The strip: the panes of the recording, never Statistics (it shows the live session).
  await expect(stripPane(page)).toHaveCount(0);
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toBeVisible();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  expect(await dots(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.page))).toEqual(['timers', 'group', 'character']);
  // A swipe to the left: the next page, with the recording's group.
  const sb = await box(stripPane(page));
  await drag(page, sb.x + sb.width * 0.75, sb.y + sb.height / 2, -160, 4);
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
  await expect(stripPane(page)).toContainText('Gibur');
  await expect(player(page).locator('.wc-ph-strip-dots > i.is-on')).toHaveAttribute('data-page', 'group');

  // Comm: the recording's lines, no reply line, no search.
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  await expect(comm(page)).toContainText('ready when you are');
  await expect(comm(page).locator('.wc-comm')).toHaveAttribute('data-readonly', '');
  await expect(comm(page).locator('.wc-cm-reply')).toBeHidden();
  await expect(comm(page).locator('.wc-cm-rinput')).toBeHidden();
  await expect(comm(page).locator('.wc-cm-search')).toBeHidden();
  await expect(comm(page).locator('.wc-cm-sbtn')).toBeHidden();
  // No field has the focus, and no keyboard of ours came up.
  expect(await page.evaluate(() => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? ''))).toBe(false);
  await expect(page.locator('html')).not.toHaveClass(/\bwc-okb\b/);

  // The lens: a tap steps its zoom level.
  const level = await lens(page).getAttribute('data-level');
  await lens(page).locator('.wc-ph-lens-glass').tap();
  await expect(lens(page)).not.toHaveAttribute('data-level', level!);
  const stepped = (await lens(page).getAttribute('data-level'))!;

  // A band dragged: the strip's height changes here, and is no setting of the viewer's.
  const h0 = (await box(stripPane(page))).height;
  const grip = await box(player(page).locator('.wc-ph-strip-grip').first());
  await drag(page, grip.x + grip.width / 2, grip.y + grip.height / 2, 0, 60);
  await expect.poll(async () => (await box(stripPane(page))).height).toBeGreaterThan(h0 + 20);
  const h1 = (await box(stripPane(page))).height;

  // A backward seek builds a new App and a new layer: the same things are open.
  await page.evaluate(() => {
    const w = window as unknown as { __wc: { shell: { playerHost: { app: unknown } } }; __app0: unknown };
    w.__app0 = w.__wc.shell.playerHost.app;
  });
  await key(page, 'back').tap();
  await expect.poll(async () => (await engine(page)).seeking).toBe(false);
  expect(await page.evaluate(() => {
    const w = window as unknown as { __wc: { shell: { playerHost: { app: unknown } } }; __app0: unknown };
    return w.__wc.shell.playerHost.app !== w.__app0;
  })).toBe(true);
  await expect(player(page).locator('.wc-ph-layer')).toHaveCount(1);
  await expect(stripPane(page)).toBeVisible();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
  await expect(comm(page)).toBeVisible();
  await expect(comm(page).locator('.wc-comm')).toHaveAttribute('data-readonly', '');
  await expect(lens(page)).toHaveAttribute('data-level', stepped);
  expect(Math.abs((await box(stripPane(page))).height - h1)).toBeLessThan(1);
  await expect(bar(page)).toHaveAttribute('data-docked', '');
  await expect(sat(page, 'panes')).toHaveAttribute('aria-pressed', 'true');
  await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');

  // Nothing of it reached the viewer's settings; closed, neither.
  expect(await stored(page)).toBe(before);
  await key(page, 'close').tap();
  await expect(player(page)).toHaveCount(0);
  expect(await stored(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('Display opens above the bar; a Paper recording is Paper inside a dark viewer, and the viewer may choose another theme', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await start(page);
  const before = await stored(page);
  await openWithView(page, { bg: '#f4ecd8', fg: '#000000' });
  // The page is dark; the player, its cockpit's phone chrome and the bar are Paper.
  await expect(page.locator('html')).not.toHaveAttribute('data-light', '');
  await expect(player(page)).toHaveAttribute('data-light', '');
  await expect(cockpit(page)).toHaveAttribute('data-ph-light', '');
  await expect(key(page, 'play')).toHaveCSS('color', 'rgb(58, 52, 40)');
  await expect(sat(page, 'panes')).toHaveCSS('color', 'rgb(58, 52, 40)');

  // Display: above the bar, inside the window, rows a finger fits.
  await key(page, 'display').tap();
  const pop = bar(page).locator('.wc-pc-pop[data-pop="display"]');
  await expect(pop).toBeVisible();
  const p = await box(pop);
  const b = await box(bar(page));
  expect(p.y + p.height).toBeLessThanOrEqual(b.y + 0.5);
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(360.5);
  expect(p.y).toBeGreaterThanOrEqual(0);
  for (const k of await pop.locator('.wc-pc-sg, .wc-pc-sw').all()) expect((await box(k)).height).toBeGreaterThanOrEqual(39.5);
  // The chrome does not hide while it is open; the bar's Display key is lit.
  await expect(key(page, 'display')).toHaveClass(/is-on/);
  // The viewer's choice: Dark.
  await pop.locator('[data-theme="dark"]').tap();
  await expect(player(page)).not.toHaveAttribute('data-light', '');
  await expect(cockpit(page)).not.toHaveAttribute('data-ph-light', '');
  await expect(key(page, 'play')).toHaveCSS('color', 'rgb(232, 196, 138)');
  // And a font size: the game text follows, the bar's keys do not.
  const k0 = await box(key(page, 'play'));
  const cell0 = await cockpit(page).getAttribute('data-cells');
  await pop.locator('[data-font="small"]').tap();
  await expect(cockpit(page)).not.toHaveAttribute('data-cells', cell0!);
  expect((await box(key(page, 'play'))).height).toBe(k0.height);
  await expect(bar(page)).toHaveAttribute('data-docked', '');
  await keysFit(page);
  await pop.locator('.wc-pop-x').tap();
  await expect(pop).toBeHidden();
  expect(await stored(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('the reverse: a dark recording is dark inside a Paper viewer', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await start(page);
  const dark = await page.evaluate(() => {
    const a = window.__wc!.settings.get().appearance;
    return { bg: a.bg, fg: a.fg };
  });
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
  await expect(page.locator('html')).toHaveAttribute('data-light', '');
  await openWithView(page, dark);
  await expect(player(page)).not.toHaveAttribute('data-light', '');
  await expect(cockpit(page)).not.toHaveAttribute('data-ph-light', '');
  await expect(key(page, 'play')).toHaveCSS('color', 'rgb(232, 196, 138)');
  await expect(sat(page, 'panes')).toHaveCSS('color', 'rgb(232, 196, 138)');
  expect(errors).toEqual([]);
});

test('landscape: the bar is the row right of the strip and Comm column; its keys fit and work', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 360 });
  await start(page);
  await openLogs(page, ['map-demo.log', 'gmcp-demo.log']);
  await seek(page, Infinity);
  const pl = await box(player(page));
  // Closed: the bar over the whole width.
  const wide = await box(bar(page));
  expect(wide.x - pl.x).toBeLessThan(1);
  await keysFit(page);
  // The strip and Comm open: one column at the left; the bar is right of it, as the command row is.
  await sat(page, 'panes').tap();
  await sat(page, 'comm').tap();
  await expect(stripPane(page)).toBeVisible();
  await expect(comm(page)).toBeVisible();
  const input = await box(player(page).locator('.wc-input-slot'));
  await expect.poll(async () => Math.abs((await box(bar(page))).x - input.x)).toBeLessThan(1);
  const b = await box(bar(page));
  const c = await box(comm(page));
  expect(b.x).toBeGreaterThanOrEqual(c.x + c.width - 0.5);
  expect(Math.abs(b.y + b.height - (pl.y + pl.height))).toBeLessThan(1);
  expect(Math.abs(b.x + b.width - (pl.x + pl.width))).toBeLessThan(1);
  await expect(clock(page)).toBeVisible();
  await keysFit(page);
  // The lens stands above the bar.
  const l = await box(lens(page));
  expect(l.y + l.height).toBeLessThanOrEqual(b.y + 0.5);
  await key(page, 'play').tap();
  await expect(key(page, 'play')).toHaveAttribute('aria-label', 'Pause');
  await key(page, 'play').tap();
  await expect(key(page, 'play')).toHaveAttribute('aria-label', 'Play');
  // Display above the bar, inside the window.
  await key(page, 'display').tap();
  const pop = bar(page).locator('.wc-pc-pop[data-pop="display"]');
  await expect(pop).toBeVisible();
  const p = await box(pop);
  expect(p.y).toBeGreaterThanOrEqual(0);
  expect(p.y + p.height).toBeLessThanOrEqual(b.y + 0.5);
  expect(p.x + p.width).toBeLessThanOrEqual(800.5);
  expect(errors).toEqual([]);
});

test('a tablet (820 × 1180, ?tablet=phone): the same layout; the bar has room for To the start, the speed\'s two steps and the whole time', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await start(page, 'tablet=phone');
  const before = await stored(page);
  await openLogs(page, ['map-demo.log', 'gmcp-demo.log']);
  await seek(page, Infinity);
  await expect(cockpit(page)).toHaveAttribute('data-phone-game', '');
  await expect(player(page).locator('.wc-ph-pad, .wc-ph-menu, .wc-okb')).toHaveCount(0);
  await expect(lens(page)).toBeVisible();
  await expect(bar(page)).not.toHaveAttribute('data-narrow', '');
  const acts = await bar(page).locator('.wc-pc-row button:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.act));
  expect(acts).toEqual(['close', 'start', 'back', 'play', 'fwd', 'slower', 'faster', 'display']);
  await expect(clock(page).locator('.wc-pc-dur')).toBeVisible();
  await keysFit(page);
  const pl = await box(player(page));
  const b = await box(bar(page));
  expect(Math.abs(b.y + b.height - (pl.y + pl.height))).toBeLessThan(1);
  // The speed's steps, and To the start.
  await key(page, 'faster').tap();
  await expect(speed(page)).toHaveText('2×');
  await key(page, 'slower').tap();
  await expect(speed(page)).toHaveText('1×');
  await key(page, 'start').tap();
  await expect.poll(async () => (await engine(page)).position).toBe(0);
  // The strip and Comm by tap.
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toBeVisible();
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  await expect(comm(page).locator('.wc-cm-reply')).toBeHidden();
  await key(page, 'close').tap();
  await expect(player(page)).toHaveCount(0);
  expect(await stored(page)).toBe(before);
  expect(errors).toEqual([]);
});
