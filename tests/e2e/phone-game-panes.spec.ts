// Stage 51d (ADR 0136 §4, §5, §6): the pane strip and Comm of the phone's
// layout in the live game, and the lens's keys and hide rule.
//
// - The strip: the panes key opens it from the top edge with one pane at a
//   time (its name on the band's plate, dots), a sideways swipe changes page, Ctrl/Alt+1…9 select a
//   page, the Panes settings choose and order the pages; Statistics is a
//   page (the live run).
// - Comm: the Comm key with its unread count, Comm under the fight card in
//   rail mode, the reply line as the compose field, the resize band; the
//   desktop's `comm.folded` / `comm.listWidth` are never written.
// - The lens stays under an open Comm, shrunk to its room; without room
//   for its least size it hides and its keys stay as a row (stage 52).
// - Stage 52: the strip and Comm are resized by their bands, live (the
//   layout follows the finger; one window size for MUME on the release),
//   and together they end above the place of three hot keys.
//
// Stage 52: Character is out of the strip and the Herblores timers are off
// by default on a phone (applied once to stored 0.5.0 settings), and the
// Timers and Group sub-page of the settings sets what those two panes show.
// The strip cases written for stage 51 put all four panes and the
// Herblores back first (`fullStrip`), so they still walk every page.
//
// `phone` project (Pixel 7). The strip cases replay tests/fixtures in the
// offline cockpit; the Comm cases play against a `page.routeWebSocket` mock
// (a replay has no reply line). Nothing reaches MUME.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const pane = (page: Page, id: string) => page.locator(`.wc-cockpit > .wc-pane[data-pane="${id}"]`);
const stripPane = (page: Page) => page.locator('.wc-cockpit > .wc-pane[data-phone-strip]');
const strip = (page: Page) => page.locator('.wc-ph-strip');
const dots = (page: Page) => page.locator('.wc-ph-strip-band .wc-ph-strip-dots > i');
/** The strip's name on its band (portrait; round 53j). */
const plate = (page: Page) => page.locator('.wc-ph-strip-band .wc-ph-plate');
const sat = (page: Page, name: string) => page.locator(`.wc-ph-sat[data-sat="${name}"]:visible`);
const lens = (page: Page) => page.locator('.wc-ph-lens');
const row = (page: Page) => page.locator('.wc-ph-satrow');
const fight = (page: Page) => page.locator('.wc-ph-fight');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const comm = (page: Page) => pane(page, 'comm');
const reply = (page: Page) => comm(page).locator('.wc-cm-rinput');
const band = (page: Page) => page.locator('.wc-ph-comm-band');
const badge = (page: Page) => page.locator('.wc-ph-sat[data-sat="comm"]:visible .wc-ph-badge');
const cellH = (page: Page) => page.evaluate(() => window.__wc!.cells.get().h);
const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const phone = (page: Page) => page.evaluate(() => window.__wc!.settings.get().phone);
const inputFocused = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains('wc-input-field') ?? false);

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// ------------------------------------------------------------ the strip

/** All four built-in panes in the strip and the Herblores timers on, as before stage 52's phone defaults. */
async function fullStrip(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = window.__wc!.settings;
    s.update({ timers: { groups: { herb: { enabled: true } } }, phone: { strip: { panes: s.get().phone.strip.panes.map((e) => ({ ...e, on: true })) } } });
  });
}

/** The offline cockpit on a phone. `full` (the default): with `fullStrip`; false: the phone's own defaults. */
async function openPhone(page: Page, full = true): Promise<void> {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  if (full) await fullStrip(page);
}

/** Replays the GMCP demo, whole or up to the line before the first one holding `cut`. */
async function play(page: Page, cut?: string): Promise<void> {
  const before = await page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' }).count();
  await page.evaluate(async (cut) => {
    let text = await (await fetch('/__fixtures/gmcp-demo.log')).text();
    if (cut !== undefined) {
      const lines = text.split('\n');
      text = lines.slice(0, lines.findIndex((l) => l.includes(cut))).join('\n') + '\n';
    }
    window.__wc!.app.startReplay(text, 'gmcp-demo.log', 0);
  }, cut);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(before + 1);
}

/** A line of the demo inside its fight (you tank). */
const FIGHT = 'Group.Update {"id":3,"hp":61}';

/** A one-finger drag from (x0, y) by (dx, dy), as a finger does it. */
async function drag(page: Page, x0: number, y0: number, dx: number, dy: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const at = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: y!, id: 0 }] });
  await at('touchStart', x0, y0);
  for (let i = 1; i <= 4; i++) await at('touchMove', x0 + (dx * i) / 4, y0 + (dy * i) / 4);
  await at('touchEnd');
  await cdp.detach();
}

/** A swipe on the open strip: to the left (the next page) or to the right. */
async function swipe(page: Page, to: 'left' | 'right'): Promise<void> {
  const b = await box(strip(page));
  const y = b.y + b.height / 2;
  await drag(page, to === 'left' ? b.x + b.width * 0.75 : b.x + b.width * 0.25, y, to === 'left' ? -160 : 160, 4);
}

test('the panes key opens the strip from the top edge: one pane, its name on the band (no hood row), page dots; the fight card under it', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await play(page, FIGHT);
  await expect(fight(page)).toBeVisible();
  const h = await cellH(page);
  const cells = (await page.locator('.wc-cockpit').getAttribute('data-cells'))!;
  const rows = Number(cells.split('x')[1]);
  const gameBefore = await box(page.locator('.wc-game'));
  // Closed: no pane but the lens's map, no chrome.
  await expect(stripPane(page)).toHaveCount(0);
  await expect(strip(page)).toBeHidden();
  const key = sat(page, 'panes');
  await expect(key).toHaveAttribute('aria-pressed', 'false');
  await expect(key).toHaveAttribute('aria-label', 'Show panes');
  await key.tap();
  // Timers first, borderless, from the top edge over the whole width.
  await expect(stripPane(page)).toHaveCount(1);
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  await expect(stripPane(page)).not.toHaveAttribute('data-framed', '');
  const c = await box(page.locator('.wc-cockpit'));
  const p = await box(stripPane(page));
  expect(p.y - c.y).toBeLessThan(1);
  expect(Math.abs(p.width - c.width)).toBeLessThan(10);
  // About a fifth of the rows, within 15 to 25 %.
  const stripRows = Math.round(p.height / h);
  expect(stripRows).toBeGreaterThanOrEqual(Math.ceil(rows * 0.15));
  expect(stripRows).toBeLessThanOrEqual(Math.floor(rows * 0.25));
  expect(stripRows).toBe(Math.round(rows * 0.2));
  // The chrome: the pane's name on the band's plate (round 53j: no hood), four dots with the first lit; no tabs, no handle.
  await expect(strip(page)).toBeVisible();
  await expect(page.locator('.wc-ph-strip-hood')).toHaveCount(0);
  await expect(plate(page)).toHaveText('Timers');
  await expect(strip(page)).toHaveAttribute('aria-label', 'Panes: Timers, 1 of 4');
  await expect(dots(page)).toHaveCount(4);
  await expect(page.locator('.wc-ph-strip-dots > i.is-on')).toHaveAttribute('data-page', 'timers');
  await expect(page.locator('.wc-phone-tabs, .wc-phone-tab')).toHaveCount(0);
  const s = await box(strip(page));
  expect(s.y).toBeCloseTo(p.y, 0);
  expect(s.height).toBeCloseTo(p.height, 0);
  // The pane's content has every row but the last, which is the resize band's (the name and the dots on it).
  const content = await box(stripPane(page).locator('.wc-pane-content'));
  expect(content.y - p.y).toBeLessThan(0.5);
  expect(p.y + p.height - (content.y + content.height)).toBeCloseTo(h, 0);
  // The plate: on the band, in its middle, cast with it (Cinzel capitals in the hood's colours), a
  // little taller than the band: its lower 3 px float over what is under it (here the fight card).
  const sb = await box(page.locator('.wc-ph-strip-band'));
  const pl = await box(plate(page));
  expect(Math.abs(pl.x + pl.width / 2 - (sb.x + sb.width / 2))).toBeLessThanOrEqual(1);
  expect(pl.y).toBeCloseTo(sb.y, 0);
  expect(pl.y + pl.height - (sb.y + sb.height)).toBeGreaterThanOrEqual(2);
  expect(pl.y + pl.height - (sb.y + sb.height)).toBeLessThanOrEqual(4);
  const look = await plate(page).evaluate((e) => {
    const st = getComputedStyle(e);
    return { font: st.fontFamily, size: parseFloat(st.fontSize), upper: st.textTransform, events: st.pointerEvents };
  });
  expect(look.font).toContain('Cinzel');
  expect(look.size).toBeLessThanOrEqual(10);
  expect(look.upper).toBe('uppercase');
  expect(look.events).toBe('none');
  // The fight card sits right under it, the game text under the card.
  const card = await box(fight(page));
  expect(card.y).toBeCloseTo(p.y + p.height, 0);
  const game = await box(page.locator('.wc-game'));
  expect(game.y).toBeCloseTo(card.y + card.height, 0);
  expect(game.height).toBeCloseTo(gameBefore.height - p.height, 0);
  // The lens moved down under the card; the key is lit.
  const l = await box(lens(page));
  expect(l.y).toBeGreaterThanOrEqual(card.y + card.height);
  await expect(key).toHaveAttribute('aria-pressed', 'true');
  await expect(key).toHaveAttribute('aria-label', 'Hide panes');
  // The game text is still at its tail, and no other pane renders.
  expect(await page.evaluate(() => window.__wc!.app.output.isScrolled())).toBe(false);
  for (const id of ['group', 'character', 'statistics', 'comm', 'ui']) await expect(pane(page, id)).toBeHidden();
  expect(await inputFocused(page)).toBe(false);
  // The key closes it: the rows go back to the game.
  await key.tap();
  await expect(stripPane(page)).toHaveCount(0);
  await expect(strip(page)).toBeHidden();
  await expect.poll(async () => (await box(page.locator('.wc-game'))).height).toBeCloseTo(gameBefore.height, 0);
  await expect(pane(page, 'timers')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a sideways swipe changes the page and shows each pane with the fixture\'s content; it does not wrap', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await play(page);
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  // (The name on the band's plate follows the page.)
  const hood = plate(page);
  const on = page.locator('.wc-ph-strip-dots > i.is-on');
  // Left: Group, with the demo's members.
  await swipe(page, 'left');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
  await expect(hood).toHaveText('Group');
  await expect(on).toHaveAttribute('data-page', 'group');
  await expect(stripPane(page)).toContainText('Gibur');
  await expect(stripPane(page)).toHaveCount(1);
  await expect(pane(page, 'timers')).toBeHidden();
  // Character.
  await swipe(page, 'left');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'character');
  await expect(hood).toHaveText('Character');
  await expect(stripPane(page)).toContainText('Rasta');
  // Statistics: its view is mounted on a phone too.
  await swipe(page, 'left');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'statistics');
  await expect(hood).toHaveText('Statistics');
  await expect(strip(page)).toHaveAttribute('aria-label', 'Panes: Statistics, 4 of 4');
  await expect(stripPane(page).locator('.wc-st')).toBeVisible();
  // The last page: one more swipe stays.
  await swipe(page, 'left');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'statistics');
  // Right: back, down to the first, which stays too.
  await swipe(page, 'right');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'character');
  await swipe(page, 'right');
  await swipe(page, 'right');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  await swipe(page, 'right');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  // A vertical drag, a short one and a tap are the pane's own: the page stays.
  const b = await box(strip(page));
  await drag(page, b.x + 200, b.y + 40, 6, 60);
  await drag(page, b.x + 200, b.y + b.height / 2, -30, 0);
  await page.touchscreen.tap(b.x + 120, b.y + b.height / 2);
  await frames(page);
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  // A swipe on the game text is not the strip's.
  await drag(page, 300, b.y + b.height + 200, -160, 0);
  await frames(page);
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  // Closed and opened again: the page it had.
  await swipe(page, 'left');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveCount(0);
  // Closed, a swipe where it was changes nothing.
  await drag(page, 300, b.y + 60, -160, 0);
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
  expect(await inputFocused(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('taps inside a pane of the strip still work: a Timers group folds', async ({ page }) => {
  await openPhone(page);
  await play(page);
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  const head = stripPane(page).locator('.wc-tm-g .wc-tm-head, .wc-tm-g [role="button"], .wc-tm-g button').first();
  await expect(head).toBeVisible();
  const before = await stripPane(page).locator('.wc-pane-content').innerHTML();
  await head.tap();
  await expect.poll(async () => (await stripPane(page).locator('.wc-pane-content').innerHTML()) !== before).toBe(true);
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
});

test('Ctrl+1…9 and Alt+1…9 select the strip\'s page by position, opening the strip for it', async ({ page }) => {
  await openPhone(page);
  await play(page);
  await expect(stripPane(page)).toHaveCount(0);
  // Closed: the key opens the strip at that page.
  await page.keyboard.press('Control+2');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
  await expect(sat(page, 'panes')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Alt+4');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'statistics');
  await page.keyboard.press('Control+1');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  // A position past the last page does nothing, and no digit is typed.
  await page.keyboard.press('Control+5');
  await page.keyboard.press('Alt+9');
  await frames(page);
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  await expect(field(page)).toHaveValue('');
});

test('the Panes settings: off removes a page, the order moves, both kept over a reload; #panes opens the page there', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await play(page);
  await field(page).fill('#panes');
  await field(page).press('Enter');
  const group = page.locator('.wc-ph-page [data-group="panes"]');
  await expect(group).toBeVisible();
  await expect(group.locator('.wc-ph-grp-t')).toHaveText('Panes');
  await expect(group).toBeInViewport();
  const items = () => group.locator('[data-item]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.item));
  expect(await items()).toEqual(['timers', 'group', 'character', 'statistics']);
  const item = (id: string) => group.locator(`[data-item="${id}"]`);
  for (const id of ['timers', 'group', 'character', 'statistics']) {
    await expect(item(id).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    for (const k of await item(id).locator('.wc-ph-move').all()) expect((await box(k)).height).toBeGreaterThanOrEqual(44);
  }
  // The ends cannot move past the list.
  await expect(item('timers').getByRole('button', { name: 'Move Timers up' })).toHaveAttribute('aria-disabled', 'true');
  await expect(item('statistics').getByRole('button', { name: 'Move Statistics down' })).toHaveAttribute('aria-disabled', 'true');
  // Statistics first, Group off.
  for (let i = 0; i < 3; i++) await item('statistics').getByRole('button', { name: 'Move Statistics up' }).tap();
  expect(await items()).toEqual(['statistics', 'timers', 'group', 'character']);
  await item('group').getByRole('switch', { name: 'Group' }).tap();
  await expect(item('group').getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await item('timers').getByRole('button', { name: 'Move Timers down' }).tap();
  expect(await items()).toEqual(['statistics', 'group', 'timers', 'character']);
  expect((await phone(page)).strip.panes).toEqual([
    { id: 'statistics', on: true },
    { id: 'group', on: false },
    { id: 'timers', on: true },
    { id: 'character', on: true },
  ]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-ph-page')).toBeHidden();
  // The strip: three pages in the new order.
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'statistics');
  await expect(dots(page)).toHaveCount(3);
  expect(await dots(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.page))).toEqual(['statistics', 'timers', 'character']);
  await swipe(page, 'left');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  // The open page is switched off: the strip shows the one that took its place.
  await page.evaluate(() => {
    const s = window.__wc!.settings;
    s.update({ phone: { strip: { panes: s.get().phone.strip.panes.map((e) => (e.id === 'timers' ? { ...e, on: false } : e)) } } });
  });
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'character');
  await expect(dots(page)).toHaveCount(2);
  // Kept over a reload; the open page is not (the strip starts closed).
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await expect(stripPane(page)).toHaveCount(0);
  expect((await phone(page)).strip.panes.map((e) => `${e.id}:${e.on}`)).toEqual(['statistics:true', 'group:false', 'timers:false', 'character:true']);
  await expect(lens(page)).toBeVisible();
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'statistics');
  await expect(dots(page)).toHaveCount(2);
  // Every pane off: no page, so no panes key (no dead control), and the open strip closes.
  await page.evaluate(() => {
    const s = window.__wc!.settings;
    s.update({ phone: { strip: { panes: s.get().phone.strip.panes.map((e) => ({ ...e, on: false })) } } });
  });
  await expect(stripPane(page)).toHaveCount(0);
  await expect(page.locator('.wc-ph-sat[data-sat="panes"]:visible')).toHaveCount(0);
  // The desktop's pane toggles and layout were never written.
  expect(errors).toEqual([]);
});

test('opening and closing the strip or Comm lays out once and sends MUME one window size each', async ({ page }) => {
  await openPhone(page);
  await play(page);
  await page.evaluate(() => {
    const w = window as unknown as { __layouts: number; __naws: string[] };
    w.__layouts = 0;
    w.__naws = [];
    window.__wc!.app.cockpit.onLayout(() => w.__layouts++);
    const s = window.__wc!.app.session;
    const orig = s.setWindowSize.bind(s);
    s.setWindowSize = (c: number, r: number) => {
      w.__naws.push(`${c}x${r}`);
      return orig(c, r);
    };
  });
  const take = () =>
    page.evaluate(() => {
      const w = window as unknown as { __layouts: number; __naws: string[] };
      const out = { layouts: w.__layouts, naws: w.__naws.slice() };
      w.__layouts = 0;
      w.__naws = [];
      return out;
    });
  const rows = () => page.evaluate(() => window.__wc!.app.cockpit.phoneGameLayout!.game.h);
  const steps: [string, () => Promise<void>, () => Promise<void>][] = [
    ['strip open', () => sat(page, 'panes').tap(), () => expect(stripPane(page)).toHaveCount(1)],
    ['strip close', () => sat(page, 'panes').tap(), () => expect(stripPane(page)).toHaveCount(0)],
    ['Comm open', () => sat(page, 'comm').tap(), () => expect(comm(page)).toBeVisible()],
    ['Comm close', () => sat(page, 'comm').tap(), () => expect(comm(page)).toBeHidden()],
  ];
  for (const [name, act, done] of steps) {
    await act();
    await done();
    await frames(page);
    const t = await take();
    expect(t.layouts, name).toBe(1);
    // One window size: the same 80 columns MUME formats for, the game text's new rows.
    expect(t.naws, name).toEqual([`80x${await rows()}`]);
    expect(await page.evaluate(() => window.__wc!.app.output.isScrolled()), name).toBe(false);
  }
  // A page change inside the open strip: a layout (the pane changes), no window size.
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveCount(1);
  await frames(page);
  await take();
  await page.keyboard.press('Control+2');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
  await frames(page);
  expect((await take()).naws).toEqual([]);
});

test('a script\'s pane is a page of the strip after the built-in ones, named by its title', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(async (src) => {
    const l = window.__wc!.shell.scripts!;
    await l.init();
    await l.create('kills', src);
    await l.setEnabled('kills', true);
  }, `-- @name kills\n-- @api 1\nlocal p = createPane{id = "main", title = "Kills", dock = "right", rows = 3, cols = 24}\np:setLine(1, "Kills so far: 7")\n`);
  await page.routeWebSocket('wss://mume.org/ws-play/', () => {});
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
  // The script runs: its pane exists, hidden like every pane outside the strip.
  await expect.poll(() => page.evaluate(() => window.__wc!.app.cockpit.scriptPanes().map((p) => p.id))).toEqual(['kills/main']);
  await expect(pane(page, 'kills/main')).toBeHidden();
  await fullStrip(page);
  await sat(page, 'panes').tap();
  await expect(dots(page)).toHaveCount(5);
  expect(await dots(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.page))).toEqual(['timers', 'group', 'character', 'statistics', 'kills/main']);
  await page.keyboard.press('Control+5');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'kills/main');
  await expect(plate(page)).toHaveText('Kills');
  await expect(strip(page)).toHaveAttribute('aria-label', 'Panes: Kills, 5 of 5');
  await expect(stripPane(page)).toContainText('Kills so far: 7');
  await expect(stripPane(page)).not.toHaveAttribute('data-framed', '');
  // A swipe to the right: Statistics; back to the left: the script's pane again.
  await swipe(page, 'right');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'statistics');
  await swipe(page, 'left');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'kills/main');
  // The script goes: its page goes, the strip shows the one that took its place (the last).
  await page.evaluate(() => window.__wc!.shell.scripts!.setEnabled('kills', false));
  await expect(dots(page)).toHaveCount(4);
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'statistics');
  expect(errors).toEqual([]);
});

test('the strip changes nothing of the desktop\'s pane settings or layout', async ({ page }) => {
  await openPhone(page);
  await play(page);
  const stored = () => page.evaluate(() => JSON.stringify([window.__wc!.settings.get().panes, window.__wc!.settings.get().layout, window.__wc!.settings.get().comm]));
  const before = await stored();
  await sat(page, 'panes').tap();
  await swipe(page, 'left');
  await swipe(page, 'left');
  await page.keyboard.press('Control+4');
  await sat(page, 'panes').tap();
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  await expect(lens(page)).toBeVisible();
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeHidden();
  expect(await stored()).toBe(before);
});

test('Statistics shows the live run of a replay, as a page of the strip', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?fixture=gmcp-demo.log&speed=3&phone=1');
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: 'An orc scout is dead! R.I.P.' }).first()).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  // The phone's default strip: Timers, Group, Statistics (Character is out since stage 52).
  await page.keyboard.press('Control+3');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'statistics');
  const stats = stripPane(page).locator('.wc-st');
  await expect(stats).toBeVisible();
  // The live run, as the Statistics pane shows it (ADR 0134): the character and level, the company,
  // the last kill with its experience. (The old ESC menu's Statistics frame worded the same run as
  // "★ Defeated an orc scout" and "Run ended"; those lines were that frame's, not the pane's.)
  await expect(stats).toContainText('Rasta');
  await expect(stats).toContainText('L26');
  await expect(stats).toContainText('with Dori, Gibur');
  await expect(stats).toContainText(/last kill/i);
  await expect(stats).toContainText('An orc scout');
  await expect(stats).toContainText('+90.0k');
  // The replay ends while it is open: the data stays.
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1, { timeout: 25_000 });
  await expect(stats).toContainText('An orc scout');
  await expect(stats).toContainText('+90.0k');
  await expect(stats).toContainText('with Dori, Gibur');
  // Hidden again (another page), it is not drawn.
  await page.keyboard.press('Control+1');
  await expect(pane(page, 'statistics')).toBeHidden();
  expect(errors).toEqual([]);
});

// ------------------------------------------- the phone's defaults (stage 52)

const herbOn = (page: Page) => page.evaluate(() => window.__wc!.settings.get().timers.groups.herb.enabled);
const stripOn = (page: Page) => page.evaluate(() => window.__wc!.settings.get().phone.strip.panes.filter((e) => e.on).map((e) => e.id));
const herbGroup = (page: Page) => pane(page, 'timers').locator('.wc-tm-g[data-group="herb"], .wc-tm-g').filter({ hasText: /Herblore/i });

test('a new phone: Character is not a page of the strip and the Herblores timers are off; both can be switched on', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page, false);
  await play(page);
  expect(await stripOn(page)).toEqual(['timers', 'group', 'statistics']);
  expect(await herbOn(page)).toBe(false);
  expect((await phone(page)).defaults).toBe(1);
  await sat(page, 'panes').tap();
  await expect(dots(page)).toHaveCount(3);
  expect(await dots(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.page))).toEqual(['timers', 'group', 'statistics']);
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  await expect(herbGroup(page)).toHaveCount(0);
  // The player's own choice: both on, and they stay on over a reload (the defaults are not applied again).
  await fullStrip(page);
  await expect(dots(page)).toHaveCount(4);
  await expect(herbGroup(page)).not.toHaveCount(0);
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await stripOn(page)).toEqual(['timers', 'group', 'character', 'statistics']);
  expect(await herbOn(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('settings stored by 0.5.0 (no mark): Herblores and Character are switched off once at the start, then the player\'s choice wins', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page, false);
  // What 0.5.0 left in storage: every pane in the strip, in an order of the player's, Herblores on, no mark.
  await page.evaluate(async () => {
    const s = window.__wc!.settings;
    const order = ['statistics', 'character', 'timers', 'group'] as const;
    s.update({ timers: { groups: { herb: { enabled: true } } }, phone: { defaults: 0, strip: { panes: order.map((id) => ({ id, on: true })) } } });
    await s.flush();
  });
  await page.reload();
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await expect.poll(async () => (await phone(page)).defaults).toBe(1);
  expect(await herbOn(page)).toBe(false);
  // Only Character went; the order and the other panes are the player's.
  expect((await phone(page)).strip.panes.map((e) => `${e.id}:${e.on}`)).toEqual(['statistics:true', 'character:false', 'timers:true', 'group:true']);
  // Switched back on: kept over the next start.
  await fullStrip(page);
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await herbOn(page)).toBe(true);
  expect(await stripOn(page)).toEqual(['statistics', 'character', 'timers', 'group']);
  expect((await phone(page)).defaults).toBe(1);
  expect(errors).toEqual([]);
});

test('Settings → Panes → Timers and Group: the two panes\' settings, written to the desktop gears\' keys and seen in the strip; Back keeps the scroll', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await play(page);
  const before = await page.evaluate(() => window.__wc!.settings.get());
  await field(page).fill('#panes');
  await field(page).press('Enter');
  const pg = page.locator('.wc-ph-page');
  const col = pg.locator('.wc-ph-col');
  const link = pg.locator('[data-group="panes"] [data-row="timers-group"]');
  await expect(link).toHaveText('Timers and Group');
  await expect(link.locator('.wc-ph-chev')).toBeVisible();
  expect((await box(link)).height).toBeGreaterThanOrEqual(44);
  const scrolled = await col.evaluate((el) => el.scrollTop);
  expect(scrolled).toBeGreaterThan(0);
  await link.tap();
  await expect(pg).toHaveAttribute('data-page', 'sub:timers-group');
  await expect(pg.locator('.wc-ph-hood')).toHaveText('Timers and Group');
  expect(await col.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await pg.locator('[data-group] .wc-ph-grp-t').allTextContents()).toEqual(['Timers', 'Timer groups', 'Group']);
  // Every row is a thumb-size target inside the screen; nothing overflows sideways.
  for (const r of await pg.locator('.wc-ph-srow').all()) {
    const b = await box(r);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
  }
  expect(await col.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const sw = (id: string, name: string) => pg.locator(`[data-row="${id}"]`).getByRole('switch', { name });
  // Timers: circles, no headers, Herblores off.
  await pg.locator('[data-row="timers-style"]').getByRole('radio', { name: 'Circles' }).tap();
  await sw('timers-headers', 'Group headers').tap();
  await expect(sw('timers-group-herb', 'Herblores')).toHaveAttribute('aria-checked', 'true');
  await sw('timers-group-herb', 'Herblores').tap();
  // A list of its own, and back to the sub-page.
  await pg.locator('[data-row="timers-warn"]').tap();
  await expect(pg).toHaveAttribute('data-page', 'pick:timers-warn');
  await pg.getByRole('radio', { name: '60s' }).tap();
  await expect(pg).toHaveAttribute('data-page', 'sub:timers-group');
  await expect(pg.locator('[data-row="timers-warn"] .wc-ph-srow-v')).toHaveText('60s');
  // Group: no players' room names, NPCs all.
  await pg.locator('[data-row="group-npcs"]').tap();
  await pg.getByRole('radio', { name: 'All' }).tap();
  await pg.locator('[data-row="group-away"]').tap();
  await pg.getByRole('radio', { name: 'Dim only' }).tap();
  const after = await page.evaluate(() => window.__wc!.settings.get());
  expect(after.timers).toEqual({ ...before.timers, style: 'circles', headers: false, warnAt: 60, groups: { ...before.timers.groups, herb: { ...before.timers.groups.herb, enabled: false } } });
  expect(after.group).toEqual({ ...before.group, npcMode: 'all', away: 'dim' });
  expect({ ...after, timers: null, group: null }).toEqual({ ...before, timers: null, group: null });
  // Back: the settings page where it was; Esc again leaves it (opened by a command: to the game).
  await pg.locator('.wc-ph-back').tap();
  await expect(pg).toHaveAttribute('data-page', 'settings');
  await expect(pg.locator('.wc-ph-hood')).toHaveText('Settings');
  expect(await col.evaluate((el) => el.scrollTop)).toBe(scrolled);
  // Esc steps the same way.
  await link.tap();
  await expect(pg).toHaveAttribute('data-page', 'sub:timers-group');
  await page.keyboard.press('Escape');
  await expect(pg).toHaveAttribute('data-page', 'settings');
  expect(await col.evaluate((el) => el.scrollTop)).toBe(scrolled);
  await page.keyboard.press('Escape');
  await expect(pg).toBeHidden();
  // The strip's Timers pane drew it: no Herblores group, rings instead of bars.
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  await expect(herbGroup(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------ Comm

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const gmcp = (pkg: string, data: unknown): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);
const text = (channel: string, talker: string, line: string, extra: Record<string, unknown> = {}): Buffer =>
  gmcp('Comm.Channel.Text', { channel, talker, 'talker-type': 'player', text: line, ...extra });

interface Mock {
  /** The plain lines the client sent (commands; not telnet or GMCP). */
  sent: string[];
  server: () => WebSocketRoute;
}

/** Enters MUME on `?phone=1` against a mock: logged in as Rasta, grouped with Gibur and Dori. */
async function enterMock(page: Page, query = ''): Promise<Mock> {
  let server: WebSocketRoute | null = null;
  const sent: string[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => {
      const t = (typeof m === 'string' ? Buffer.from(m) : m).toString('latin1');
      if (!t.startsWith('\xff')) sent.push(...t.split(/\r?\n/).filter((l) => l !== '' && !l.startsWith('change width')));
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto(`/?phone=1${query}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  server!.send(
    gmcp('Group.Set', [
      { id: 1, type: 'you', name: 'Rasta', hp: 172, maxhp: 172 },
      { id: 2, type: 'ally', name: 'Gibur', hp: 140, maxhp: 140 },
      { id: 3, type: 'ally', name: 'Dori', hp: 120, maxhp: 150 },
    ]),
  );
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
  return { sent, server: () => server! };
}

const tell = (who: string, what: string): Buffer => text('tells', who, `${who} tells you '${what}'`);
const groupTell = (who: string, what: string): Buffer => text('tells', who, `${who} tells the group '${what}'`);
const narrate = (who: string, what: string): Buffer => text('tales', who, `${who} narrates '${what}'`);
/** The rail's entry of a chat (by its name). */
const chat = (page: Page, name: string) => comm(page).locator(`.wc-cm-ent[aria-label^="${name}"]`);

test('the Comm key opens Comm under the fight card in rail mode; the lens stays under it, and hides to a key row when the strip takes its room', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await enterMock(page);
  m.server().send(gmcp('Char.Vitals', { hp: 150, maxhp: 172, opponent: 'an orc scout', buffer: 'Rasta', 'opponent-hits': 'hurt' }));
  await expect(fight(page)).toBeVisible();
  await expect(lens(page)).toBeVisible();
  await expect(row(page)).toBeHidden();
  // The keys on the lens's corners: panes top left, fullscreen top right, Comm bottom right.
  const l = await box(lens(page));
  const corner = async (name: string): Promise<Box> => box(lens(page).locator(`.wc-ph-sat[data-sat="${name}"]`));
  const tl = await corner('panes');
  const tr = await corner('fullscreen');
  const br = await corner('comm');
  for (const k of [tl, tr, br]) expect(k.width).toBeCloseTo(40, 0);
  expect(l.x - tl.x).toBeCloseTo(10, 0);
  expect(l.y - tl.y).toBeCloseTo(10, 0);
  expect(tr.x + tr.width - (l.x + l.width)).toBeCloseTo(10, 0);
  expect(l.y - tr.y).toBeCloseTo(10, 0);
  expect(br.x + br.width - (l.x + l.width)).toBeCloseTo(10, 0);
  expect(br.y + br.height - (l.y + l.height)).toBeCloseTo(10, 0);
  await expect(sat(page, 'comm')).toHaveAttribute('aria-label', 'Open Comm');
  const gameBefore = await box(page.locator('.wc-game'));
  const h = await cellH(page);
  const rows = Number((await page.locator('.wc-cockpit').getAttribute('data-cells'))!.split('x')[1]);
  await sat(page, 'comm').tap();
  // Comm: full width, from the top edge, at 40 % of the rows by default; the fight card lies under it
  // (round 53k: the card is always under the panes at the top).
  await expect(comm(page)).toBeVisible();
  const card = await box(fight(page));
  const c = await box(comm(page));
  const cockpit = await box(page.locator('.wc-cockpit'));
  expect(c.y).toBeCloseTo(cockpit.y, 0);
  expect(card.y).toBeGreaterThanOrEqual(c.y + c.height - 0.5);
  expect(card.y - (c.y + c.height)).toBeLessThan(h + 1);
  expect(Math.abs(c.width - cockpit.width)).toBeLessThan(10);
  expect(Math.round(c.height / h)).toBe(Math.round(rows * 0.4));
  await expect(comm(page)).not.toHaveAttribute('data-framed', '');
  // Rail mode, with nothing to drag the column by.
  await expect(comm(page).locator('.wc-comm')).toHaveAttribute('data-mode', 'rail');
  await expect(comm(page).locator('.wc-cm-spine')).toBeHidden();
  // The card under it, the game text under the card; the band on Comm's last row.
  const game = await box(page.locator('.wc-game'));
  expect(card.y).toBeCloseTo(c.y + c.height, 0);
  expect(game.y).toBeCloseTo(card.y + card.height, 0);
  expect(game.height).toBeCloseTo(gameBefore.height - c.height, 0);
  const b = await box(band(page));
  expect(b.y + b.height).toBeCloseTo(c.y + c.height, 0);
  expect(b.height).toBeCloseTo(h, 0);
  expect(await page.evaluate(() => window.__wc!.app.output.isScrolled())).toBe(false);
  // The lens stays (stage 52): right under Comm and the card, as large as its room down to the hot keys allows.
  await expect(lens(page)).toBeVisible();
  await expect(row(page)).toBeHidden();
  const under = await box(lens(page));
  expect(under.y).toBeGreaterThanOrEqual(card.y + card.height);
  expect(under.y - (card.y + card.height)).toBeLessThan(2 * h);
  expect(under.width).toBeLessThanOrEqual(l.width);
  expect(under.width).toBeGreaterThanOrEqual(96);
  expect(under.y + under.height).toBeLessThanOrEqual((await box(page.locator('.wc-ph-hot'))).y);
  await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');
  // The strip opens above the fight card with Comm open: no room is left for the lens. It (and
  // the map pane) hide; the keys stay as a row at the top right, under Comm, in order.
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  await expect(lens(page)).toBeHidden();
  await expect(pane(page, 'map')).toBeHidden();
  await expect(row(page)).toBeVisible();
  expect(await row(page).locator('.wc-ph-sat').evaluateAll((els) => els.filter((e) => !(e as HTMLElement).hidden).map((e) => (e as HTMLElement).dataset.sat))).toEqual(['panes', 'fullscreen', 'comm']);
  const s = await box(stripPane(page));
  const card2 = await box(fight(page));
  const c2 = await box(comm(page));
  // The strip, Comm, the card (each part's last row is its band's).
  expect(c2.y - (s.y + s.height)).toBeGreaterThanOrEqual(-0.5);
  expect(c2.y - (s.y + s.height)).toBeLessThan(h + 1);
  expect(card2.y - (c2.y + c2.height)).toBeGreaterThanOrEqual(-0.5);
  expect(card2.y - (c2.y + c2.height)).toBeLessThan(h + 1);
  const r = await box(row(page));
  // This low (near the limit above the quick buttons) the row stands left of the hot key column.
  const hot = await box(page.locator('.wc-ph-hot'));
  if (r.y + r.height + 8 > hot.y) expect(r.x + r.width).toBeLessThanOrEqual(hot.x);
  else expect(cockpit.x + cockpit.width - (r.x + r.width)).toBeCloseTo(8, 0);
  expect(r.y).toBeGreaterThanOrEqual(card2.y + card2.height);
  expect(r.y - (card2.y + card2.height)).toBeLessThan(12);
  await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');
  await expect(sat(page, 'comm')).toHaveAttribute('aria-label', 'Close Comm');
  expect(await inputFocused(page)).toBe(false);
  // The strip closed: the lens is back under Comm.
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveCount(0);
  await expect(lens(page)).toBeVisible();
  await expect(row(page)).toBeHidden();
  // Comm closed: the lens has its full size again, the game its rows.
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeHidden();
  await expect(band(page)).toBeHidden();
  await expect(lens(page)).toBeVisible();
  await expect(row(page)).toBeHidden();
  await expect.poll(async () => (await box(lens(page))).width).toBeCloseTo(l.width, 0);
  await expect.poll(async () => (await box(page.locator('.wc-game'))).height).toBeCloseTo(gameBefore.height, 0);
  expect(errors).toEqual([]);
});

test('unread: a tell raises the Comm key\'s count while Comm is closed; reading the chat clears it; no message card', async ({ page }) => {
  const m = await enterMock(page);
  await expect(badge(page)).toBeHidden();
  m.server().send(tell('Gibur', 'you at the ford?'));
  await expect(badge(page)).toHaveText('1');
  await expect(sat(page, 'comm')).toHaveAttribute('aria-label', 'Open Comm, 1 unread');
  m.server().send(tell('Gibur', 'hurry'));
  m.server().send(tell('Dori', 'wait for me'));
  await expect(badge(page)).toHaveText('3');
  // Group and Public talk do not count by default (private chats only).
  // Nor does your own tell. A tell sent after them proves they were all taken in: exactly one more.
  m.server().send(groupTell('Gibur', 'two trolls'));
  m.server().send(narrate('Ecthel', 'anyone near Rivendell?'));
  m.server().send(text('tells', 'you', 'on my way', { destination: 'Gibur', 'talker-type': undefined }));
  m.server().send(tell('Dori', 'coming'));
  await expect(badge(page)).toHaveText('4');
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: 'coming' })).toHaveCount(0);
  // Nothing was laid over the game: no message card, Comm still closed.
  await expect(comm(page)).toBeHidden();
  await expect(page.locator('.wc-ph-layer [class*="card"], .wc-ph-layer [class*="toast"]')).toHaveCount(0);
  // Open: the key shows no count (Comm shows its own marks); the chats are marked unread there.
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  await expect(badge(page)).toBeHidden();
  await expect(chat(page, 'Gibur')).toHaveAttribute('data-unread', '');
  await expect(chat(page, 'Dori')).toHaveAttribute('data-unread', '');
  // Reading Gibur's chat clears his two; Dori's one is left when Comm closes.
  await chat(page, 'Gibur').tap();
  await expect(chat(page, 'Gibur')).not.toHaveAttribute('data-unread', '');
  await expect(comm(page)).toContainText('you at the ford?');
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeHidden();
  await expect(badge(page)).toHaveText('2');
  // Closed, also the chat that was open counts again.
  m.server().send(tell('Gibur', 'now'));
  await expect(badge(page)).toHaveText('3');
  // Opening Comm opens the chat it had, read.
  await sat(page, 'comm').tap();
  await expect(comm(page)).toContainText('now');
  await expect(chat(page, 'Gibur')).not.toHaveAttribute('data-unread', '');
  await chat(page, 'Dori').tap();
  await sat(page, 'comm').tap();
  await expect(badge(page)).toBeHidden();
  await expect(sat(page, 'comm')).toHaveAttribute('aria-label', 'Open Comm');
});

test('unread with the lens hidden (stage 52): a private tell received while Comm is closed counts on the Comm key of the key row', async ({ page }) => {
  const m = await enterMock(page);
  // The lens switched off: its keys stand as a row at the top right.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { show: false } } }));
  await expect(lens(page)).toBeHidden();
  await expect(row(page)).toBeVisible();
  const rowKey = row(page).locator('.wc-ph-sat[data-sat="comm"]');
  const rowBadge = rowKey.locator('.wc-ph-badge');
  await expect(rowKey).toBeVisible();
  await expect(rowBadge).toBeHidden();
  m.server().send(tell('Gibur', 'you at the ford?'));
  await expect(rowBadge).toBeVisible();
  await expect(rowBadge).toHaveText('1');
  await expect(rowKey).toHaveAttribute('aria-label', 'Open Comm, 1 unread');
  // The badge is on the key, inside the screen.
  const k = await box(rowKey);
  const b = await box(rowBadge);
  expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(Math.abs(b.x + b.width / 2 - (k.x + k.width)) + Math.abs(b.y + b.height / 2 - k.y)).toBeLessThan(40);
  m.server().send(tell('Dori', 'wait for me'));
  await expect(rowBadge).toHaveText('2');
  // The lens back: the same count is on its Comm key; off again, on the row's.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { show: true } } }));
  await expect(lens(page)).toBeVisible();
  await expect(badge(page)).toHaveText('2');
  m.server().send(tell('Gibur', 'hurry'));
  await expect(badge(page)).toHaveText('3');
  // Opened from the row's key and read: the count goes.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { show: false } } }));
  await rowKey.tap();
  await expect(comm(page)).toBeVisible();
  await expect(rowBadge).toBeHidden();
  await chat(page, 'Gibur').tap();
  await chat(page, 'Dori').tap();
  await rowKey.tap();
  await expect(comm(page)).toBeHidden();
  await expect(rowBadge).toBeHidden();
  await expect(rowKey).toHaveAttribute('aria-label', 'Open Comm');
});

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('unread in landscape (stage 52c: the lens stands left of the hot keys): the lens\'s Comm key counts a private tell', async ({ page }) => {
    const m = await enterMock(page);
    await expect(lens(page)).toBeVisible();
    await expect(row(page)).toBeHidden();
    await expect(badge(page)).toBeHidden();
    m.server().send(tell('Gibur', 'you at the ford?'));
    await expect(badge(page)).toHaveText('1');
    await expect(sat(page, 'comm')).toHaveAttribute('aria-label', 'Open Comm, 1 unread');
    // Group talk does not count by default; the next tell does.
    m.server().send(groupTell('Gibur', 'two trolls'));
    m.server().send(tell('Dori', 'coming'));
    await expect(badge(page)).toHaveText('2');
  });
});

test('phone.unread = all counts Group and Public too; the Comm settings group sets it and NPCs in Public', async ({ page }) => {
  const m = await enterMock(page);
  m.server().send(tell('Gibur', 'one'));
  m.server().send(groupTell('Gibur', 'two'));
  m.server().send(narrate('Ecthel', 'three'));
  await expect(badge(page)).toHaveText('1');
  const before = await page.evaluate(() => window.__wc!.settings.get().comm);
  // The settings page's Comm group.
  await page.locator('.wc-ph-menu').tap();
  await page.locator('.wc-ph-sheet [data-row="settings"]').tap();
  const group = page.locator('.wc-ph-page [data-group="comm"]');
  await group.scrollIntoViewIfNeeded();
  await expect(group.locator('.wc-ph-grp-t')).toHaveText('Comm');
  const unread = group.locator('[data-row="comm-unread"]');
  await expect(unread.getByRole('radio', { name: 'Private' })).toHaveAttribute('aria-checked', 'true');
  await unread.getByRole('radio', { name: 'All' }).tap();
  expect((await phone(page)).unread).toBe('all');
  const npcs = group.locator('[data-row="comm-npcs"]').getByRole('switch', { name: 'Show NPCs in Public' });
  await expect(npcs).toHaveAttribute('aria-checked', String(before.npcs));
  await npcs.tap();
  // It is the desktop gear's own switch (`comm.npcs`); nothing else of `comm` changes.
  const after = await page.evaluate(() => window.__wc!.settings.get().comm);
  expect(after.npcs).toBe(!before.npcs);
  expect({ ...after, npcs: null }).toEqual({ ...before, npcs: null });
  await npcs.tap();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-ph-sheet')).toBeHidden();
  // All: every unread message once: the tell, the group tell and the narrate are three, in however many views each is.
  await expect(badge(page)).toHaveText('3');
  await expect(sat(page, 'comm')).toHaveAttribute('aria-label', 'Open Comm, 3 unread');
  m.server().send(narrate('Ecthel', 'four'));
  await expect(badge(page)).toHaveText('4');
  m.server().send(groupTell('Dori', 'five'));
  await expect(badge(page)).toHaveText('5');
  // Reading Group takes its two messages out (wherever else they are); the tell and the two narrates stay.
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  await chat(page, 'Group').tap();
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeHidden();
  // Comm opened at Public, which read its narrates; Group holds the group tells and, Gibur being
  // in the group, his tell as well: a message stops counting once any view holding it is read.
  await expect(badge(page)).toBeHidden();
  await expect(sat(page, 'comm')).toHaveAttribute('aria-label', 'Open Comm');
  // Private counts chats only: Gibur's chat itself was not opened, his tell is still unread there.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { unread: 'private' } }));
  await expect(badge(page)).toHaveText('1');
});

test('the reply line is the compose field: a chat sends tell <name>, Group sends tell group, Public has none', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await enterMock(page);
  m.server().send(tell('Gibur', 'you at the ford?'));
  m.server().send(groupTell('Dori', 'ready'));
  await expect(badge(page)).toHaveText('1');
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  // Public (the view Comm starts at): no reply line.
  await chat(page, 'Public').tap();
  await expect(comm(page).locator('.wc-cm-reply')).toBeHidden();
  // A private chat: a one-row textarea saying "Type a message".
  await chat(page, 'Gibur').tap();
  await expect(reply(page)).toBeVisible();
  expect(await reply(page).evaluate((el) => el.tagName)).toBe('TEXTAREA');
  await expect(reply(page)).toHaveAttribute('rows', '1');
  await expect(reply(page)).toHaveAttribute('placeholder', 'Type a message');
  await expect(reply(page)).toHaveAttribute('aria-label', 'Tell Gibur');
  expect((await box(comm(page).locator('.wc-cm-reply'))).height).toBeGreaterThanOrEqual(40);
  await reply(page).tap();
  await expect(reply(page)).toBeFocused();
  await page.keyboard.type('yes, east of the gate');
  await page.keyboard.press('Enter');
  await expect.poll(() => m.sent).toEqual(['tell Gibur yes, east of the gate']);
  // The field is empty and keeps the keys for the next line; nothing went into the command line.
  await expect(reply(page)).toHaveValue('');
  await expect(reply(page)).toBeFocused();
  await expect(field(page)).toHaveValue('');
  // A line break from a phone's keyboard (no Enter key event) sends too.
  await page.keyboard.type('hold on');
  await reply(page).evaluate((el) => el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true })));
  await expect.poll(() => m.sent).toEqual(['tell Gibur yes, east of the gate', 'tell Gibur hold on']);
  await expect(reply(page)).toHaveValue('');
  // An empty line sends nothing.
  await page.keyboard.press('Enter');
  // Group.
  await chat(page, 'Group').tap();
  await expect(reply(page)).toBeVisible();
  await expect(reply(page)).toHaveAttribute('placeholder', 'Type a message');
  await expect(reply(page)).toHaveAttribute('aria-label', 'Tell the group');
  await reply(page).tap();
  await page.keyboard.type('two trolls coming');
  await page.keyboard.press('Enter');
  await expect.poll(() => m.sent).toEqual(['tell Gibur yes, east of the gate', 'tell Gibur hold on', 'tell group two trolls coming']);
  // Public again: the field is gone.
  await chat(page, 'Public').tap();
  await expect(comm(page).locator('.wc-cm-reply')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the reply line follows the play gate: at a password prompt it is disabled, and nothing can go into it', async ({ page }) => {
  const m = await enterMock(page);
  m.server().send(tell('Gibur', 'you at the ford?'));
  await sat(page, 'comm').tap();
  await chat(page, 'Gibur').tap();
  await expect(reply(page)).toBeEnabled();
  await expect(reply(page)).toHaveAttribute('placeholder', 'Type a message');
  // MUME asks for a password (it echoes): the command line is masked, the keys are off, and so is the reply line.
  m.server().send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, 1])]));
  await expect(reply(page)).toBeDisabled();
  await expect(reply(page)).toHaveAttribute('placeholder', 'Not connected');
  // The password is typed where it belongs, the (masked) command line, and sent as a secret.
  await field(page).tap();
  await page.keyboard.type('secret');
  await expect(reply(page)).toHaveValue('');
  await page.keyboard.press('Enter');
  expect(m.sent.filter((l) => l.startsWith('tell'))).toEqual([]);
  // The prompt is over: the field is live again and sends.
  m.server().send(Buffer.from([IAC, 252, 1]));
  await expect(reply(page)).toBeEnabled();
  await expect(reply(page)).toHaveAttribute('placeholder', 'Type a message');
  await reply(page).tap();
  await page.keyboard.type('yes');
  await page.keyboard.press('Enter');
  await expect.poll(() => m.sent.filter((l) => l.startsWith('tell'))).toEqual(['tell Gibur yes']);
  // A pasted line break never makes two commands.
  await reply(page).evaluate((el: HTMLTextAreaElement) => {
    el.value = 'hi\nsay something';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(reply(page)).toHaveValue('hi say something');
  await page.keyboard.press('Enter');
  await expect.poll(() => m.sent.filter((l) => l.startsWith('tell') || l.startsWith('say'))).toEqual(['tell Gibur yes', 'tell Gibur hi say something']);
});

test('a screen too short for Comm: the key is not lit and its badge counts on; with room again Comm is back', async ({ page }) => {
  const m = await enterMock(page);
  m.server().send(tell('Gibur', 'one'));
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  await chat(page, 'Gibur').tap();
  await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');
  await expect(badge(page)).toBeHidden();
  // A very short visible area (a split screen): the allocator leaves Comm out.
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 150 });
  await expect(comm(page)).toBeHidden();
  await expect(band(page)).toBeHidden();
  await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'false');
  await expect(sat(page, 'comm')).toHaveAttribute('aria-label', 'Open Comm');
  // Not on screen, so not read: a tell counts.
  m.server().send(tell('Gibur', 'two'));
  await expect(badge(page)).toHaveText('1');
  await expect(sat(page, 'comm')).toHaveAttribute('aria-label', 'Open Comm, 1 unread');
  // The same for the strip.
  await page.setViewportSize(size);
  await expect(comm(page)).toBeVisible();
  await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');
  await expect(badge(page)).toBeHidden();
  await expect(comm(page)).toContainText('two');
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeHidden();
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveCount(1);
  await expect(sat(page, 'panes')).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: size.width, height: 150 });
  await expect(stripPane(page)).toHaveCount(0);
  await expect(strip(page)).toBeHidden();
  await expect(sat(page, 'panes')).toHaveAttribute('aria-pressed', 'false');
  await page.setViewportSize(size);
  await expect(stripPane(page)).toHaveCount(1);
  await expect(sat(page, 'panes')).toHaveAttribute('aria-pressed', 'true');
});

test('the resize grip reaches at most 10 px into the game text: the first line under the band scrolls the output', async ({ page }) => {
  await enterMock(page);
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  const b = await box(band(page));
  const g = await box(page.locator('.wc-ph-comm-grip'));
  expect(g.y + g.height - (b.y + b.height)).toBeLessThanOrEqual(10.5);
  expect(g.height).toBeGreaterThanOrEqual(40);
  // It reaches up into Comm's bottom margin, not into the reply line.
  expect(g.y).toBeLessThan(b.y);
  const at = (x: number, y: number) =>
    page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px!, py!);
      return el?.closest('.wc-ph-comm-grip') ? 'grip' : el?.closest('.wc-game') ? 'game' : el?.closest('.wc-cm-reply') ? 'reply' : 'other';
    }, [x, y]);
  const x = b.x + b.width / 2;
  expect(await at(x, b.y + b.height / 2)).toBe('grip');
  expect(await at(x, b.y + b.height + 5)).toBe('grip');
  // 12 px under the band, within the first line of the game text: the output's.
  expect(await at(x, b.y + b.height + 12)).toBe('game');
  expect(await at(60, b.y + b.height + 12)).toBe('game');
  // A reply line, when there is one, is clear of the grip.
  await page.evaluate(() => 0);
});

/** Counts the layouts and the window sizes sent to MUME from now on. */
async function countLayouts(page: Page): Promise<() => Promise<{ layouts: number; naws: number }>> {
  await page.evaluate(() => {
    const w = window as unknown as { __layouts: number; __naws: number };
    w.__layouts = 0;
    w.__naws = 0;
    window.__wc!.app.cockpit.onLayout(() => w.__layouts++);
    const s = window.__wc!.app.session;
    const orig = s.setWindowSize.bind(s);
    s.setWindowSize = (c: number, r: number) => {
      w.__naws++;
      return orig(c, r);
    };
  });
  return () => page.evaluate(() => ({ layouts: (window as unknown as { __layouts: number }).__layouts, naws: (window as unknown as { __naws: number }).__naws }));
}

/** A finger on a band's grip: `start`, `move(dy)` from where it pressed (in steps), `end`. */
async function finger(page: Page, grip: Locator): Promise<{ start(): Promise<void>; move(dy: number, steps?: number): Promise<void>; end(): Promise<void> }> {
  const cdp = await page.context().newCDPSession(page);
  let x = 0;
  let y0 = 0;
  let at = 0;
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: y === undefined ? [] : [{ x, y, id: 0 }] });
  return {
    start: async () => {
      const g = await box(grip);
      x = g.x + g.width / 2;
      y0 = g.y + 12;
      at = 0;
      await touch('touchStart', y0);
    },
    move: async (dy, steps = 6) => {
      const from = at;
      for (let i = 1; i <= steps; i++) await touch('touchMove', y0 + from + ((dy - from) * i) / steps);
      at = dy;
    },
    end: async () => {
      await touch('touchEnd');
    },
  };
}

/** Rows of the game text, the hot keys' place and the three parts above the game, from the layout. */
const layoutOf = (page: Page) =>
  page.evaluate(() => {
    const g = window.__wc!.app.cockpit.phoneGameLayout!;
    return { strip: g.strip.h, fight: g.fight.h, comm: g.comm.h, top: g.game.y, game: g.game.h, lens: g.lensPx, lensHidden: g.lensHidden };
  });

/** The row the strip, the fight card and Comm must end at or above: the top of the place of three hot keys of `key` px. */
async function limitRow(page: Page, key = 36): Promise<number> {
  const h = await cellH(page);
  const H = (await box(page.locator('.wc-cockpit'))).height;
  // The compass (three keys, two gaps, the margin), 8 px, three keys with their gaps.
  const top = 3 * key + 6 + 8 + 8 + 3 * (key + 3) - 3;
  return Math.floor((H - top) / h + 1e-6);
}

test('the band resizes Comm live in whole rows, inside its limits, with one window size on the release; the height is kept over a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMock(page);
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  const h = await cellH(page);
  const rowsOf = async (): Promise<number> => Math.round((await box(comm(page))).height / h);
  const start = await rowsOf();
  expect((await phone(page)).commRows).toBeNull();
  const game0 = await box(page.locator('.wc-game'));
  await frames(page);
  const counts = await countLayouts(page);
  const grip = page.locator('.wc-ph-comm-grip');
  expect((await box(grip)).height).toBeGreaterThanOrEqual(40);
  const f = await finger(page, grip);
  // Up by three rows, the finger still down: Comm, the band and the game text have followed.
  await f.start();
  await f.move(-3 * h);
  await expect.poll(rowsOf).toBe(start - 3);
  await expect(band(page)).toHaveAttribute('data-dragging', '');
  const game1 = await box(page.locator('.wc-game'));
  expect(game1.y).toBeCloseTo(game0.y - 3 * h, 0);
  expect(game1.height).toBeCloseTo(game0.height + 3 * h, 0);
  const b1 = await box(band(page));
  expect(b1.y + b1.height).toBeCloseTo(game1.y, 0);
  // Nothing is stored and MUME has heard nothing yet. Three rows: three layouts at the most.
  await frames(page);
  expect((await phone(page)).commRows).toBeNull();
  const mid = await counts();
  expect(mid.naws).toBe(0);
  expect(mid.layouts).toBeGreaterThanOrEqual(1);
  expect(mid.layouts).toBeLessThanOrEqual(3);
  // Moves inside one row lay nothing out.
  await f.move(-3 * h - 4, 3);
  await f.move(-3 * h + 4, 3);
  await frames(page);
  expect((await counts()).layouts).toBe(mid.layouts);
  // One more row, then the release: stored once, and exactly one window size for the whole drag.
  await f.move(-4 * h);
  await expect.poll(rowsOf).toBe(start - 4);
  expect((await counts()).naws).toBe(0);
  await f.end();
  await expect(band(page)).not.toHaveAttribute('data-dragging', '');
  expect((await phone(page)).commRows).toBe(start - 4);
  await expect.poll(async () => (await counts()).naws).toBe(1);
  await frames(page);
  await frames(page);
  const after = await counts();
  expect(after.naws).toBe(1);
  // (The fourth row's layout, and one for the settings write.)
  expect(after.layouts).toBeLessThanOrEqual(mid.layouts + 2);
  expect(await rowsOf()).toBe(start - 4);
  // The size MUME got is the game text's now.
  const drag2 = async (dy: number): Promise<void> => {
    await f.start();
    await f.move(dy, 5);
    await f.end();
  };
  // Far down: Comm stops above the place of three hot keys (stage 52), the game keeping far more than its eight rows.
  await drag2(900);
  const limit = await limitRow(page);
  await expect.poll(async () => (await layoutOf(page)).top).toBe(limit);
  const max = await rowsOf();
  expect(max).toBe(limit);
  expect((await phone(page)).commRows).toBe(max);
  expect((await layoutOf(page)).game).toBeGreaterThan(8);
  // Far up: its least rows, which hold the whole reply line (seven at this text size: round 53k).
  await drag2(-900);
  await expect.poll(rowsOf).toBe(7);
  expect((await phone(page)).commRows).toBe(7);
  // A press without a move changes nothing and sends nothing.
  await frames(page);
  await frames(page);
  const quiet = await counts();
  await drag2(0);
  await frames(page);
  await frames(page);
  expect(await rowsOf()).toBe(7);
  expect((await counts()).naws).toBe(quiet.naws);
  // A drag away and back to where it began: nothing is stored, and no window size is sent for it.
  await f.start();
  await f.move(3 * h);
  await expect.poll(rowsOf).toBe(10);
  await f.move(0);
  await expect.poll(rowsOf).toBe(7);
  await f.end();
  await frames(page);
  await frames(page);
  expect((await phone(page)).commRows).toBe(7);
  // Eleven rows, kept over a reload.
  await drag2(4 * h);
  await expect.poll(rowsOf).toBe(11);
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  expect((await phone(page)).commRows).toBe(11);
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  await expect.poll(rowsOf).toBe(11);
  expect(errors).toEqual([]);
});

test('a band dragged while the other part is squeezed: the other keeps the height it shows, and the finger can go back where it began (52b review)', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await play(page, FIGHT);
  await expect(fight(page)).toBeVisible();
  // Both stored tall: together with the fight card they want more than the limit, so Comm is squeezed.
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveCount(1);
  await frames(page);
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  const limit = await limitRow(page);
  const strip0 = limit - 2 - 8;
  await page.evaluate((strip) => window.__wc!.settings.update({ phone: { stripRows: strip, commRows: 30 } }), strip0);
  await expect.poll(async () => (await layoutOf(page)).strip).toBe(strip0);
  const g = await layoutOf(page);
  expect(g.comm).toBe(8);
  expect(g.top).toBe(limit);
  const h = await cellH(page);
  const f = await finger(page, page.locator('.wc-ph-strip-grip'));
  await f.start();
  // Up two rows: the strip follows, and Comm does not grow into the room (it would take the way back).
  await f.move(-2 * h);
  await expect.poll(async () => (await layoutOf(page)).strip).toBe(strip0 - 2);
  expect((await layoutOf(page)).comm).toBe(8);
  // Back down to where it began, in the same drag.
  await f.move(0);
  await expect.poll(async () => (await layoutOf(page)).strip).toBe(strip0);
  expect((await layoutOf(page)).comm).toBe(8);
  // Up again and released there: stored; Comm then has its stored height's share of the room again.
  await f.move(-2 * h);
  await expect.poll(async () => (await layoutOf(page)).strip).toBe(strip0 - 2);
  await f.end();
  await frames(page);
  await frames(page);
  expect(await phone(page)).toMatchObject({ stripRows: strip0 - 2, commRows: 30 });
  const after = await layoutOf(page);
  expect([after.strip, after.comm, after.top]).toEqual([strip0 - 2, 10, limit]);
  expect(errors).toEqual([]);
});

test('the strip\'s band resizes the strip live in whole rows; its height is stored and restored; the dots sit on the band', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  await play(page);
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  const h = await cellH(page);
  const rowsOf = async (): Promise<number> => Math.round((await box(stripPane(page))).height / h);
  const start = await rowsOf();
  expect((await phone(page)).stripRows).toBeNull();
  // The band: the strip's last row, iron as Comm's, a thumb-size grip, the page dots on it.
  const sband = page.locator('.wc-ph-strip-band');
  const grip = page.locator('.wc-ph-strip-grip');
  const p0 = await box(stripPane(page));
  const b0 = await box(sband);
  expect(b0.height).toBeCloseTo(h, 0);
  expect(b0.y + b0.height).toBeCloseTo(p0.y + p0.height, 0);
  expect((await box(grip)).height).toBeGreaterThanOrEqual(40);
  await expect(dots(page)).toHaveCount(4);
  const d = await box(page.locator('.wc-ph-strip-dots'));
  expect(d.y).toBeGreaterThanOrEqual(b0.y);
  expect(d.y + d.height).toBeLessThanOrEqual(b0.y + b0.height);
  // Clear of the name's plate and its grip marks in the middle (22 px and 7 px of air each side).
  const bar = await box(plate(page));
  expect(d.x).toBeGreaterThan(bar.x + bar.width + 29);
  await frames(page);
  const counts = await countLayouts(page);
  const game0 = await box(page.locator('.wc-game'));
  const f = await finger(page, grip);
  // Down by four rows with the finger still down: the pane, its band and the game text follow.
  await f.start();
  await f.move(4 * h);
  await expect.poll(rowsOf).toBe(start + 4);
  const game1 = await box(page.locator('.wc-game'));
  expect(game1.y).toBeCloseTo(game0.y + 4 * h, 0);
  expect((await box(sband)).y + h).toBeCloseTo(game1.y, 0);
  expect((await phone(page)).stripRows).toBeNull();
  expect((await counts()).naws).toBe(0);
  await f.end();
  expect((await phone(page)).stripRows).toBe(start + 4);
  await expect.poll(async () => (await counts()).naws).toBe(1);
  await frames(page);
  await frames(page);
  expect((await counts()).naws).toBe(1);
  // Far up: four rows at the least (three rows of pane and the band).
  await f.start();
  await f.move(-900, 5);
  await f.end();
  await expect.poll(rowsOf).toBe(4);
  expect((await phone(page)).stripRows).toBe(4);
  // Far down: it stops above the place of three hot keys.
  await f.start();
  await f.move(900, 5);
  await f.end();
  const limit = await limitRow(page);
  await expect.poll(rowsOf).toBe(limit);
  // A swipe on the pane still changes the page, and the height stays.
  await f.start();
  await f.move(-(limit - 12) * h, 5);
  await f.end();
  await expect.poll(rowsOf).toBe(12);
  await swipe(page, 'left');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
  expect(await rowsOf()).toBe(12);
  // Closed and opened again, and over a reload: twelve rows.
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveCount(0);
  await expect(sband).toBeHidden();
  await sat(page, 'panes').tap();
  await expect.poll(rowsOf).toBe(12);
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  expect((await phone(page)).stripRows).toBe(12);
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveCount(1);
  await expect.poll(rowsOf).toBe(12);
  expect(errors).toEqual([]);
});

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 320, height: 568 },
]) {
  test.describe(`the limit above the quick buttons, ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    test('strip, fight card and Comm never reach under the place of three hot keys, whatever is shown; Comm gives way first, then the strip', async ({ page }) => {
      const errors = watchErrors(page);
      await openPhone(page);
      await play(page, FIGHT);
      await expect(fight(page)).toBeVisible();
      const h = await cellH(page);
      const limit = await limitRow(page);
      const cockpit = await box(page.locator('.wc-cockpit'));
      // Tall stored heights for both: together with the fight card they want far more than the limit.
      await page.evaluate(() => window.__wc!.settings.update({ phone: { stripRows: 14, commRows: 30, hotkeyCount: 6 } }));
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveCount(1);
      // (The lens gives way to its key row in the next frame: the Comm key is then the row's.)
      await frames(page);
      await sat(page, 'comm').tap();
      await expect(comm(page)).toBeVisible();
      await expect.poll(async () => (await layoutOf(page)).top).toBeLessThanOrEqual(limit);
      const g = await layoutOf(page);
      // Comm gave way first (to its minimum before the strip loses a row); the stored heights are untouched.
      expect(g.fight).toBe(2);
      expect(g.strip + g.fight + g.comm).toBe(g.top);
      // (Comm's minimum is the rows of its whole reply line, round 53k: seven at this text size.)
      if (g.strip > 0 && g.comm > 7) expect(g.strip).toBe(14);
      if (g.strip > 0 && g.strip < 14) expect(g.comm).toBe(7);
      expect(await phone(page)).toMatchObject({ stripRows: 14, commRows: 30 });
      // In px: their lower edge is at or above the top of the place of three keys (the first column's top).
      const edge = cockpit.y + g.top * h;
      const three = cockpit.y + cockpit.height - (3 * 36 + 6 + 8 + 8 + 3 * 39 - 3);
      expect(edge).toBeLessThanOrEqual(three + 0.5);
      expect(three - edge).toBeLessThan(h);
      const k3 = await box(page.locator('.wc-ph-hk[data-hk="2"]'));
      expect(edge).toBeLessThanOrEqual(k3.y + 0.5);
      // The same with the keys hidden (K), and with one key in use: the place counts, not the keys.
      await page.locator('.wc-ph-key.is-tog').tap();
      await expect(page.locator('.wc-ph-hot')).toBeHidden();
      await frames(page);
      expect((await layoutOf(page)).top).toBe(g.top);
      await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 1, hotkeysOpen: true } }));
      await frames(page);
      expect((await layoutOf(page)).top).toBe(g.top);
      // Comm's band cannot be dragged past it either; the strip does not shrink for the try.
      if (g.comm > 0) {
        const f = await finger(page, page.locator('.wc-ph-comm-grip'));
        await f.start();
        await f.move(600, 5);
        await frames(page);
        const dragged = await layoutOf(page);
        expect(dragged.top).toBeLessThanOrEqual(limit);
        expect(dragged.strip).toBe(g.strip);
        await f.end();
      }
      // The fight over: the same stored heights have two more rows.
      await play(page);
      await expect(fight(page)).toBeHidden();
      await expect.poll(async () => (await layoutOf(page)).fight).toBe(0);
      const calm = await layoutOf(page);
      expect(calm.top).toBeLessThanOrEqual(limit);
      expect(calm.strip + calm.comm).toBeGreaterThanOrEqual(Math.min(g.strip + g.comm, limit));
      expect(errors).toEqual([]);
    });
  });
}

test('on the phone Comm never writes comm.folded or comm.listWidth', async ({ page }) => {
  const m = await enterMock(page);
  // A computer's column: a dragged list width, not folded.
  await page.evaluate(() => window.__wc!.settings.update({ comm: { folded: false, listWidth: 180 } }));
  const stored = () => page.evaluate(() => JSON.stringify(window.__wc!.settings.get().comm));
  const before = await stored();
  m.server().send(tell('Gibur', 'hello'));
  m.server().send(groupTell('Dori', 'ready'));
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  // The stored list width is not used: the rail, whatever the desktop has.
  await expect(comm(page).locator('.wc-comm')).toHaveAttribute('data-mode', 'rail');
  await chat(page, 'Gibur').tap();
  await chat(page, 'Group').tap();
  await chat(page, 'Public').tap();
  // A folded desktop column does not fold the phone's either.
  await page.evaluate(() => window.__wc!.settings.update({ comm: { folded: true } }));
  await frames(page);
  await expect(comm(page).locator('.wc-comm')).toHaveAttribute('data-mode', 'rail');
  await expect(comm(page).locator('.wc-cm-col')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ comm: { folded: false } }));
  // The spine cannot be reached; its keys (were it focused) change nothing.
  await comm(page).locator('.wc-cm-spine').evaluate((el) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 60, clientY: 200, pointerId: 9, button: 0 }));
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 200, clientY: 200, pointerId: 9, buttons: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 200, clientY: 200, pointerId: 9 }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    for (const key of ['ArrowLeft', 'ArrowRight']) el.querySelector('.wc-cm-handle')?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeHidden();
  await expect(lens(page)).toBeVisible();
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  expect(await stored()).toBe(before);
});

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  // Stage 52c: the strip opens as a column from the left (tests/e2e/phone-game-landscape.spec.ts).
  test('the strip open: it takes no row from the lens, which keeps its place and its full size; the keys stay', async ({ page }) => {
    await openPhone(page);
    await expect(lens(page)).toBeVisible();
    const full = await box(lens(page));
    // 163 px on a 390 px short side.
    expect(full.width).toBeCloseTo(163, 0);
    // A tall stored portrait height does not matter here.
    await page.evaluate(() => window.__wc!.settings.update({ phone: { stripRows: 18 } }));
    await sat(page, 'panes').tap();
    await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
    await frames(page);
    await expect(lens(page)).toBeVisible();
    await expect(row(page)).toBeHidden();
    const l = await box(lens(page));
    expect([l.x, l.y, l.width]).toEqual([full.x, full.y, full.width]);
    const s = await box(stripPane(page));
    expect(l.x).toBeGreaterThanOrEqual(s.x + s.width);
    const p = await box(page.locator('.wc-ph-pad'));
    expect(l.y + l.height).toBeLessThanOrEqual(p.y + 1);
    await sat(page, 'panes').tap();
    await expect(stripPane(page)).toHaveCount(0);
    await expect(lens(page)).toBeVisible();
  });
});

test.describe('a tablet', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test('has none of it: its panes are docked, Comm is the desktop\'s with an input reply line', async ({ page }) => {
    await page.goto('/?fixture=gmcp-demo.log&speed=0&touch=1');
    await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
    await expect(page.locator('.wc-ph-strip, .wc-ph-comm-band, .wc-ph-sat, [data-phone-strip]')).toHaveCount(0);
    await expect(page.locator('.wc-comm[data-phone]')).toHaveCount(0);
    expect(await page.locator('.wc-pane[data-pane="comm"] .wc-cm-rinput').evaluate((el) => el.tagName)).toBe('INPUT');
  });
});
