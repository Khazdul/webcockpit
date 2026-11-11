// Stage 51d (ADR 0136 §4, §5, §6): the pane strip and Comm of the phone's
// layout in the live game, and the lens's keys and hide rule.
//
// - The strip: the panes key opens it from the top edge with one pane at a
//   time (hood, dots), a sideways swipe changes page, Ctrl/Alt+1…9 select a
//   page, the Panes settings choose and order the pages; Statistics is a
//   page (the live run).
// - Comm: the Comm key with its unread count, Comm under the fight card in
//   rail mode, the reply line as the compose field, the resize band; the
//   desktop's `comm.folded` / `comm.listWidth` are never written.
// - The lens hides while Comm is open and its keys stay as a row.
//
// `phone` project (Pixel 7). The strip cases replay tests/fixtures in the
// offline cockpit; the Comm cases play against a `page.routeWebSocket` mock
// (a replay has no reply line). Nothing reaches MUME.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const pane = (page: Page, id: string) => page.locator(`.wc-cockpit > .wc-pane[data-pane="${id}"]`);
const stripPane = (page: Page) => page.locator('.wc-cockpit > .wc-pane[data-phone-strip]');
const strip = (page: Page) => page.locator('.wc-ph-strip');
const dots = (page: Page) => strip(page).locator('.wc-ph-strip-dots > i');
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

async function openPhone(page: Page): Promise<void> {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
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

test('the panes key opens the strip from the top edge: one pane, its name in a hood, page dots; the fight card under it', async ({ page }) => {
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
  // The chrome: the pane's name in the hood, four dots with the first lit; no tabs, no handle.
  await expect(strip(page)).toBeVisible();
  await expect(strip(page).locator('.wc-ph-strip-hood')).toHaveText('Timers');
  await expect(strip(page)).toHaveAttribute('aria-label', 'Panes: Timers, 1 of 4');
  await expect(dots(page)).toHaveCount(4);
  await expect(strip(page).locator('.wc-ph-strip-dots > i.is-on')).toHaveAttribute('data-page', 'timers');
  await expect(page.locator('.wc-phone-tabs, .wc-phone-tab')).toHaveCount(0);
  const s = await box(strip(page));
  expect(s.y).toBeCloseTo(p.y, 0);
  expect(s.height).toBeCloseTo(p.height, 0);
  // The pane's content keeps a row clear for the hood and one for the dots.
  const content = await box(stripPane(page).locator('.wc-pane-content'));
  expect(content.y - p.y).toBeCloseTo(h, 0);
  expect(p.y + p.height - (content.y + content.height)).toBeCloseTo(h, 0);
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
  const hood = strip(page).locator('.wc-ph-strip-hood');
  const on = strip(page).locator('.wc-ph-strip-dots > i.is-on');
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
  await sat(page, 'panes').tap();
  await expect(dots(page)).toHaveCount(5);
  expect(await dots(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.page))).toEqual(['timers', 'group', 'character', 'statistics', 'kills/main']);
  await page.keyboard.press('Control+5');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'kills/main');
  await expect(strip(page).locator('.wc-ph-strip-hood')).toHaveText('Kills');
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
  await expect(row(page)).toBeVisible();
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeHidden();
  expect(await stored()).toBe(before);
});

test('Statistics shows the live run of a replay, as a page of the strip', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?fixture=gmcp-demo.log&speed=3&phone=1');
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: 'An orc scout is dead! R.I.P.' }).first()).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await page.keyboard.press('Control+4');
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
async function enterMock(page: Page): Promise<Mock> {
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
  await page.goto('/?phone=1');
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

test('the Comm key opens Comm under the fight card in rail mode; the lens hides and its keys stay as a row', async ({ page }) => {
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
  // Comm: full width, right under the fight card, at 40 % of the rows by default.
  await expect(comm(page)).toBeVisible();
  const card = await box(fight(page));
  const c = await box(comm(page));
  const cockpit = await box(page.locator('.wc-cockpit'));
  expect(c.y).toBeCloseTo(card.y + card.height, 0);
  expect(Math.abs(c.width - cockpit.width)).toBeLessThan(10);
  expect(Math.round(c.height / h)).toBe(Math.round(rows * 0.4));
  await expect(comm(page)).not.toHaveAttribute('data-framed', '');
  // Rail mode, with nothing to drag the column by.
  await expect(comm(page).locator('.wc-comm')).toHaveAttribute('data-mode', 'rail');
  await expect(comm(page).locator('.wc-cm-spine')).toBeHidden();
  // The game text under it; the band on Comm's last row.
  const game = await box(page.locator('.wc-game'));
  expect(game.y).toBeCloseTo(c.y + c.height, 0);
  expect(game.height).toBeCloseTo(gameBefore.height - c.height, 0);
  const b = await box(band(page));
  expect(b.y + b.height).toBeCloseTo(c.y + c.height, 0);
  expect(b.height).toBeCloseTo(h, 0);
  expect(await page.evaluate(() => window.__wc!.app.output.isScrolled())).toBe(false);
  // The lens (and the map pane) hide; the keys stay as a row at the top right, under Comm, in order.
  await expect(lens(page)).toBeHidden();
  await expect(pane(page, 'map')).toBeHidden();
  await expect(row(page)).toBeVisible();
  expect(await row(page).locator('.wc-ph-sat').evaluateAll((els) => els.filter((e) => !(e as HTMLElement).hidden).map((e) => (e as HTMLElement).dataset.sat))).toEqual(['panes', 'fullscreen', 'comm']);
  const r = await box(row(page));
  expect(cockpit.x + cockpit.width - (r.x + r.width)).toBeCloseTo(8, 0);
  expect(r.y).toBeGreaterThanOrEqual(c.y + c.height);
  expect(r.y - (c.y + c.height)).toBeLessThan(12);
  await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');
  await expect(sat(page, 'comm')).toHaveAttribute('aria-label', 'Close Comm');
  expect(await inputFocused(page)).toBe(false);
  // The strip opens above the fight card with Comm open; the lens stays hidden.
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  const s = await box(stripPane(page));
  const card2 = await box(fight(page));
  const c2 = await box(comm(page));
  expect(card2.y).toBeCloseTo(s.y + s.height, 0);
  expect(c2.y).toBeCloseTo(card2.y + card2.height, 0);
  await expect(lens(page)).toBeHidden();
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveCount(0);
  // Closed: the lens returns, the row goes, the game has its rows back.
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeHidden();
  await expect(band(page)).toBeHidden();
  await expect(lens(page)).toBeVisible();
  await expect(row(page)).toBeHidden();
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
  // A very short visible area (a landscape keyboard): the allocator leaves Comm out.
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 150 });
  await expect(page.locator('html')).toHaveClass(/\bwc-kbd\b/);
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

test('typing a reply with the keyboard up: the reply line stays in view above the keyboard', async ({ page }) => {
  const m = await enterMock(page);
  m.server().send(tell('Gibur', 'you at the ford?'));
  await sat(page, 'comm').tap();
  await chat(page, 'Gibur').tap();
  await reply(page).tap();
  await expect(reply(page)).toBeFocused();
  const size = page.viewportSize()!;
  for (const height of [size.height - 320, 380, 300]) {
    await page.setViewportSize({ width: size.width, height });
    await expect(page.locator('html')).toHaveClass(/\bwc-kbd\b/);
    await expect(comm(page)).toBeVisible();
    await expect(reply(page)).toBeVisible();
    await expect.poll(async () => {
      const r = await box(comm(page).locator('.wc-cm-reply'));
      const vh = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
      return r.y > 0 && r.y + r.height <= vh;
    }).toBe(true);
    // Still the field with the keys; the command row is under it.
    await expect(reply(page)).toBeFocused();
    const slot = await box(page.locator('.wc-input-slot'));
    expect((await box(comm(page))).y + (await box(comm(page))).height).toBeLessThanOrEqual(slot.y + 0.5);
  }
  await page.keyboard.type('here');
  await page.keyboard.press('Enter');
  await expect.poll(() => m.sent).toEqual(['tell Gibur here']);
  await page.setViewportSize(size);
  await expect(page.locator('html')).not.toHaveClass(/\bwc-kbd\b/);
  await expect(comm(page)).toBeVisible();
});

test('the band resizes Comm in whole rows on the release, inside its limits; the height is kept over a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await enterMock(page);
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  const h = await cellH(page);
  const rowsOf = async (): Promise<number> => Math.round((await box(comm(page))).height / h);
  const start = await rowsOf();
  expect((await phone(page)).commRows).toBeNull();
  // Count the layouts and the window sizes sent to MUME.
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
  const counts = () => page.evaluate(() => ({ layouts: (window as unknown as { __layouts: number }).__layouts, naws: (window as unknown as { __naws: number }).__naws }));
  const grip = page.locator('.wc-ph-comm-grip');
  expect((await box(grip)).height).toBeGreaterThanOrEqual(40);
  const g = await box(grip);
  const x = g.x + g.width / 2;
  const y0 = g.y + 12;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: y === undefined ? [] : [{ x, y, id: 0 }] });
  // Down by three rows: while the finger moves only the band follows.
  await touch('touchStart', y0);
  for (let i = 1; i <= 6; i++) await touch('touchMove', y0 + (3 * h * i) / 6);
  await frames(page);
  expect(await rowsOf()).toBe(start);
  expect(await counts()).toEqual({ layouts: 0, naws: 0 });
  await expect(band(page)).toHaveAttribute('data-dragging', '');
  expect(await band(page).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)).toBeCloseTo(3 * h, 0);
  await touch('touchEnd');
  await expect.poll(rowsOf).toBe(start + 3);
  expect((await phone(page)).commRows).toBe(start + 3);
  await expect(band(page)).not.toHaveAttribute('data-dragging', '');
  // One layout, and one window size at most, for the whole drag.
  await frames(page);
  const after = await counts();
  expect(after.layouts).toBe(1);
  expect(after.naws).toBeLessThanOrEqual(1);
  // Far down: the game keeps eight rows.
  const drag2 = async (dy: number): Promise<void> => {
    const b = await box(grip);
    const y = b.y + 12;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / 5, id: 0 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await drag2(600);
  await expect.poll(async () => Math.round((await box(page.locator('.wc-game'))).height / h)).toBe(8);
  const max = await rowsOf();
  expect((await phone(page)).commRows).toBe(max);
  // Far up: six rows at the least.
  await drag2(-900);
  await expect.poll(rowsOf).toBe(6);
  expect((await phone(page)).commRows).toBe(6);
  // A press without a move changes nothing.
  await drag2(0);
  await frames(page);
  expect(await rowsOf()).toBe(6);
  // Ten rows, kept over a reload.
  await drag2(4 * h);
  await expect.poll(rowsOf).toBe(10);
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  expect((await phone(page)).commRows).toBe(10);
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  await expect.poll(rowsOf).toBe(10);
  expect(errors).toEqual([]);
});

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

  test('the strip open: the lens moves under it while it fits above the compass, else it hides; the keys stay', async ({ page }) => {
    await openPhone(page);
    await expect(lens(page)).toBeVisible();
    await sat(page, 'panes').tap();
    await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
    // 390 px high: the strip takes its rows, and the 150 px lens no longer fits above the compass.
    await expect(lens(page)).toBeHidden();
    await expect(row(page)).toBeVisible();
    const s = await box(stripPane(page));
    const r = await box(row(page));
    expect(r.y).toBeGreaterThanOrEqual(s.y + s.height);
    await sat(page, 'panes').tap();
    await expect(lens(page)).toBeVisible();
    await expect(row(page)).toBeHidden();
    // The small lens fits under the strip.
    await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { size: 's' } } }));
    await sat(page, 'panes').tap();
    await expect(stripPane(page)).toHaveCount(1);
    // 21 rows of 18.4 px: the strip four, the lens seven a row under it, above the compass: it shows.
    await expect(page.locator('.wc-cockpit')).toHaveAttribute('data-cells', '92x21');
    await expect(lens(page)).toBeVisible();
    await expect(row(page)).toBeHidden();
    const l = await box(lens(page));
    const p = await box(page.locator('.wc-ph-pad'));
    expect(l.width).toBeCloseTo(120, 0);
    expect(l.y).toBeGreaterThanOrEqual(s.y + s.height);
    expect(l.y + l.height).toBeLessThanOrEqual(p.y + 1);
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
