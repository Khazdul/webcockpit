// Stage 52c: the phone's game layout in landscape (a window wider than
// tall), at 844 × 390, 800 × 360 and 740 × 360.
//
// - The pane strip and Comm open from the LEFT as one column: the strip
//   above, Comm below, one width, the whole height of the screen including
//   the command row's rows. The menu key, the command field, the game text
//   and the fight card are what is right of it.
// - An iron band along the column's right edge is dragged sideways: live
//   (the layout follows the finger at each whole column), stored once on
//   the release (`phone.sideCols`), one window size for MUME per drag.
// - The lens stands at the top right, left of the hot key columns (one or
//   two), with its three keys; it shrinks in whole cells to its room and
//   hides under 96 px, its key row then in its place.
// - Nothing overlaps: the column, the lens and its keys, the hot keys, the
//   compass, the fight card (bounding boxes).
// - Turning the phone keeps what is open; the sizes are per orientation.
// - The keys are 44 px in landscape and 36 px in portrait.
//
// `phone` project. The offline cockpit (tests/fixtures) and a
// `page.routeWebSocket` mock for Comm's cases; nothing reaches MUME.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const pane = (page: Page, id: string) => page.locator(`.wc-cockpit > .wc-pane[data-pane="${id}"]`);
const stripPane = (page: Page) => page.locator('.wc-cockpit > .wc-pane[data-phone-strip]');
const comm = (page: Page) => pane(page, 'comm');
const sat = (page: Page, name: string) => page.locator(`.wc-ph-sat[data-sat="${name}"]:visible`);
const sideBand = (page: Page) => page.locator('.wc-ph-side-band');
const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const phone = (page: Page) => page.evaluate(() => window.__wc!.settings.get().phone);
const cell = (page: Page) => page.evaluate(() => window.__wc!.cells.get());
const layout = (page: Page) =>
  page.evaluate(() => {
    const g = window.__wc!.app.cockpit.phoneGameLayout!;
    return { cols: g.cols, rows: g.rows, landscape: g.landscape, side: g.side, strip: g.strip, comm: g.comm, game: g.game, input: g.input, fight: g.fight, lensPx: g.lensPx, lensHidden: g.lensHidden, range: g.sideRange };
  });

type Box = { x: number; y: number; w: number; h: number; name: string };

/** The on-screen boxes of every visible element matching each selector, named `name#i`. */
async function boxes(page: Page, sels: Record<string, string>): Promise<Box[]> {
  return page.evaluate((sels) => {
    const out: Box[] = [];
    for (const [name, sel] of Object.entries(sels)) {
      let i = 0;
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 1 || r.height < 1 || cs.visibility !== 'visible' || el.closest('[hidden]')) continue;
        out.push({ x: r.x, y: r.y, w: r.width, h: r.height, name: `${name}#${i++}` });
      }
    }
    return out;
  }, sels);
}

const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

/** Every pair of two different groups that overlaps, as text. */
function clashes(groups: Box[][]): string[] {
  const out: string[] = [];
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++) for (const a of groups[i]!) for (const b of groups[j]!) if (overlap(a, b)) out.push(`${a.name} overlaps ${b.name}`);
  return out;
}

/**
 * Nothing overlaps: the column (the strip's pane, Comm, the band), the
 * lens with its keys (or the key row), the hot keys, the compass with K,
 * the fight card, the menu key and the command field.
 */
async function expectClear(page: Page, what: string): Promise<void> {
  await frames(page);
  const of = (sels: Record<string, string>): Promise<Box[]> => boxes(page, sels);
  const column = await of({ stripPane: '.wc-cockpit > .wc-pane[data-phone-strip]', comm: '.wc-cockpit > .wc-pane[data-pane="comm"]', band: '.wc-ph-side-band' });
  const lens = await of({ glass: '.wc-ph-lens-glass', sat: '.wc-ph-sat' });
  const hot = await of({ hot: '.wc-ph-hk' });
  const pad = await of({ compass: '.wc-ph-key' });
  const fight = await of({ fight: '.wc-ph-fight' });
  const row = await of({ menu: '.wc-ph-menu', field: '.wc-cockpit > .wc-input-slot > .wc-input' });
  expect(clashes([column, lens, hot, pad, fight, row]), `${what}: overlapping`).toEqual([]);
  const { width: vw, height: vh } = page.viewportSize()!;
  const off = [...column, ...lens, ...hot, ...pad, ...fight, ...row].filter((b) => b.x < -0.5 || b.y < -0.5 || b.x + b.w > vw + 0.5 || b.y + b.h > vh + 0.5).map((b) => b.name);
  expect(off, `${what}: outside the screen`).toEqual([]);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

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
const FIGHT = 'Group.Update {"id":3,"hp":61}';

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const gmcp = (pkg: string, data: unknown): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);
const tell = (who: string, what: string): Buffer =>
  gmcp('Comm.Channel.Text', { channel: 'tells', talker: who, 'talker-type': 'player', text: `${who} tells you '${what}'` });

/** Enters MUME on `?phone=1` against a mock: logged in as Rasta, grouped with Gibur. */
async function enterMock(page: Page): Promise<() => WebSocketRoute> {
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
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
    ]),
  );
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
  return () => server!;
}

/**
 * The window size MUME is told for the game text as it is now: the output
 * pane's own whole cells (a cell is a fraction of a px high, so its rows can
 * be one under the layout's), and 80 columns at the least.
 */
const nawsNow = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const m = window.__wc!.app.output.measureCells();
    return `${Math.max(80, m.cols)}x${m.rows}`;
  });

/** Counts the layouts and the window sizes sent to MUME from now on. */
async function countLayouts(page: Page): Promise<() => Promise<{ layouts: number; naws: string[] }>> {
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
  return () => page.evaluate(() => ({ layouts: (window as unknown as { __layouts: number }).__layouts, naws: (window as unknown as { __naws: string[] }).__naws.slice() }));
}

/** A finger on the band's grip: `start`, `move(dx)` from where it pressed (in steps), `end`. */
async function finger(page: Page, grip: Locator): Promise<{ start(): Promise<void>; move(dx: number, steps?: number): Promise<void>; end(): Promise<void> }> {
  const cdp = await page.context().newCDPSession(page);
  let x0 = 0;
  let y = 0;
  let at = 0;
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y, id: 0 }] });
  return {
    start: async () => {
      const g = (await grip.boundingBox())!;
      // On the band itself (the grip reaches 16 px into the column and 10 px into the game text).
      x0 = g.x + 20;
      y = g.y + g.height * 0.6;
      at = 0;
      await touch('touchStart', x0);
    },
    move: async (dx, steps = 6) => {
      const from = at;
      for (let i = 1; i <= steps; i++) await touch('touchMove', x0 + from + ((dx - from) * i) / steps);
      at = dx;
    },
    end: async () => {
      await touch('touchEnd');
    },
  };
}

const SCREENS = [
  { width: 844, height: 390 },
  { width: 800, height: 360 },
  { width: 740, height: 360 },
] as const;

for (const viewport of SCREENS) {
  test.describe(`landscape ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    test('the strip opens from the left as a column of the whole height; the game, the fight card, the menu key and the command field are right of it', async ({ page }) => {
      const errors = watchErrors(page);
      await openPhone(page);
      await play(page, FIGHT);
      await expect(page.locator('.wc-ph-fight')).toBeVisible();
      await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(0);
      const c = await cell(page);
      const closed = await layout(page);
      expect(closed.landscape).toBe(true);
      expect(closed.side.w).toBe(0);
      expect(closed.game.x).toBe(0);
      await expect(sideBand(page)).toBeHidden();
      // The keys are large in landscape.
      for (const sel of ['.wc-ph-key[data-cmd="north"]', '.wc-ph-hk[data-hk="0"]']) {
        const k = (await page.locator(sel).boundingBox())!;
        expect([Math.round(k.width), Math.round(k.height)], sel).toEqual([44, 44]);
      }
      await expectClear(page, 'closed');
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
      await expect(sat(page, 'panes')).toHaveAttribute('aria-pressed', 'true');
      const g = await layout(page);
      // About 40 % of the columns, from the left edge, every row of the screen (the command row's too).
      expect(g.side).toEqual({ x: 0, y: 0, w: Math.round(g.cols * 0.4), h: g.rows });
      expect(g.strip).toEqual(g.side);
      expect(g.input.y + g.input.h).toBe(g.rows);
      const p = (await stripPane(page).boundingBox())!;
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeLessThan(1);
      expect(p.width).toBeCloseTo(g.side.w * c.w, 0);
      expect(p.height).toBeCloseTo(g.rows * c.h, 0);
      // It reaches below the top of the command row.
      const field = (await page.locator('.wc-cockpit > .wc-input-slot > .wc-input').boundingBox())!;
      const menu = (await page.locator('.wc-ph-menu').boundingBox())!;
      expect(p.y + p.height).toBeGreaterThan(field.y + field.height - 1);
      // The menu key and the field moved right of it; so did the game text and the fight card.
      expect(menu.x).toBeGreaterThanOrEqual(p.x + p.width);
      expect(field.x).toBeGreaterThan(menu.x + menu.width);
      const game = (await page.locator('.wc-cockpit > .wc-game').boundingBox())!;
      expect(game.x).toBeCloseTo(p.x + p.width, 0);
      const fight = (await page.locator('.wc-ph-fight').boundingBox())!;
      expect(fight.x).toBeCloseTo(p.x + p.width, 0);
      expect(fight.y).toBeLessThan(1);
      expect(fight.x + fight.width).toBeGreaterThan(viewport.width - 2);
      // The band along its right edge, from top to bottom; the up-and-down bands are not shown.
      const b = (await sideBand(page).boundingBox())!;
      expect(b.x + b.width).toBeCloseTo(p.x + p.width, 0);
      expect(b.y).toBeLessThan(1);
      expect(b.height).toBeGreaterThan(viewport.height - c.h - 1);
      expect((await page.locator('.wc-ph-side-grip').boundingBox())!.width).toBeGreaterThanOrEqual(36);
      await expect(page.locator('.wc-ph-strip-band')).toBeHidden();
      await expect(page.locator('.wc-ph-comm-band')).toBeHidden();
      // The hood and the page dots, over the strip's first row; the pane's lines begin under them and end left of the band.
      const hood = (await page.locator('.wc-ph-strip-hood').boundingBox())!;
      await expect(page.locator('.wc-ph-strip-hood')).toHaveText('Timers');
      const content = (await stripPane(page).locator('.wc-pane-content').boundingBox())!;
      expect(hood.y + hood.height).toBeLessThanOrEqual(content.y + 0.5);
      expect(content.x + content.width).toBeLessThanOrEqual(b.x + 0.5);
      await expect(page.locator('.wc-ph-strip > .wc-ph-strip-dots > i')).toHaveCount(await page.evaluate(() => window.__wc!.settings.get().phone.strip.panes.filter((e) => e.on).length));
      const dots = (await page.locator('.wc-ph-strip > .wc-ph-strip-dots').boundingBox())!;
      expect(dots.y + dots.height).toBeLessThanOrEqual(content.y + 0.5);
      expect(dots.x + dots.width).toBeLessThanOrEqual(b.x);
      await expectClear(page, 'strip open');
      // A swipe changes the page, as in portrait.
      const cdp = await page.context().newCDPSession(page);
      const sx = p.x + p.width * 0.7;
      const sy = p.y + p.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 0 }] });
      for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx - 40 * i, y: sy + i, id: 0 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
      await expect(page.locator('.wc-ph-strip-hood')).toHaveText('Group');
      // Closed again: everything back at the left edge.
      await page.waitForTimeout(450);
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveCount(0);
      await expect(sideBand(page)).toBeHidden();
      expect((await layout(page)).game.x).toBe(0);
      expect((await page.locator('.wc-ph-menu').boundingBox())!.x).toBeLessThan(12);
      expect(errors).toEqual([]);
    });

    test('Comm opens in the same column, alone the whole height; with the strip above it the strip has about 40 % of the rows; the unread count stays on the Comm key', async ({ page }) => {
      const errors = watchErrors(page);
      const server = await enterMock(page);
      const badge = page.locator('.wc-ph-sat[data-sat="comm"]:visible .wc-ph-badge');
      await expect(badge).toBeHidden();
      server().send(tell('Gibur', 'you at the ford?'));
      await expect(badge).toHaveText('1');
      await expect(sat(page, 'comm')).toHaveAttribute('aria-label', 'Open Comm, 1 unread');
      // The stored portrait heights are neither used nor changed here.
      await page.evaluate(() => window.__wc!.settings.update({ phone: { commRows: 7, stripRows: 5 } }));
      await sat(page, 'comm').tap();
      await expect(comm(page)).toBeVisible();
      await expect(badge).toBeHidden();
      const c = await cell(page);
      let g = await layout(page);
      expect(g.comm).toEqual({ x: 0, y: 0, w: Math.round(g.cols * 0.4), h: g.rows });
      expect(g.strip.h).toBe(0);
      const cb = (await comm(page).boundingBox())!;
      expect(cb.x).toBeLessThan(1);
      expect(cb.y).toBeLessThan(1);
      expect(cb.height).toBeCloseTo(g.rows * c.h, 0);
      // Rail mode, the reply line as in portrait.
      await expect(comm(page).locator('.wc-comm')).toHaveAttribute('data-mode', 'rail');
      await comm(page).locator('.wc-cm-ent[aria-label^="Gibur"]').tap();
      const reply = comm(page).locator('.wc-cm-rinput');
      await expect(reply).toBeVisible();
      const rb = (await reply.boundingBox())!;
      const band = (await sideBand(page).boundingBox())!;
      expect(rb.x + rb.width).toBeLessThanOrEqual(band.x + 0.5);
      expect(rb.y + rb.height).toBeLessThanOrEqual(viewport.height + 0.5);
      await expectClear(page, 'Comm open');
      // The strip too: above Comm, the same width, about 40 % of the rows; together the whole height.
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveCount(1);
      g = await layout(page);
      expect(g.strip).toEqual({ x: 0, y: 0, w: g.side.w, h: Math.round(g.rows * 0.4) });
      expect(g.comm).toEqual({ x: 0, y: g.strip.h, w: g.side.w, h: g.rows - g.strip.h });
      const sp = (await stripPane(page).boundingBox())!;
      const cp = (await comm(page).boundingBox())!;
      expect(cp.y).toBeCloseTo(sp.y + sp.height, 0);
      expect(cp.width).toBeCloseTo(sp.width, 0);
      expect(cp.y + cp.height).toBeCloseTo(g.rows * c.h, 0);
      await expect(sat(page, 'panes')).toHaveAttribute('aria-pressed', 'true');
      await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');
      await expectClear(page, 'both open');
      // A fight: the card over the game's part only; the column keeps its rows.
      server().send(gmcp('Char.Vitals', { hp: 150, maxhp: 172, opponent: 'an orc scout', buffer: 'Rasta', 'opponent-hits': 'hurt' }));
      await expect(page.locator('.wc-ph-fight')).toBeVisible();
      const fight = (await page.locator('.wc-ph-fight').boundingBox())!;
      expect(fight.x).toBeCloseTo(sp.x + sp.width, 0);
      expect((await stripPane(page).boundingBox())!.height).toBeCloseTo(sp.height, 0);
      await expectClear(page, 'both open, fighting');
      expect((await phone(page)).commRows).toBe(7);
      expect((await phone(page)).stripRows).toBe(5);
      // Closed, a tell counts on the key again.
      await sat(page, 'comm').tap();
      await expect(comm(page)).toBeHidden();
      server().send(tell('Gibur', 'hurry'));
      await expect(badge).toHaveText('1');
      // The strip alone has the whole height again.
      g = await layout(page);
      expect(g.strip.h).toBe(g.rows);
      expect(errors).toEqual([]);
    });

    test('the band is dragged sideways: live in whole columns, stored once and restored, one window size for MUME per drag', async ({ page }) => {
      const errors = watchErrors(page);
      await openPhone(page);
      await play(page);
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveCount(1);
      const c = await cell(page);
      const colsOf = async (): Promise<number> => Math.round((await stripPane(page).boundingBox())!.width / c.w);
      const start = await colsOf();
      expect((await phone(page)).sideCols).toBeNull();
      const game0 = (await page.locator('.wc-cockpit > .wc-game').boundingBox())!;
      await frames(page);
      const counts = await countLayouts(page);
      const f = await finger(page, page.locator('.wc-ph-side-grip'));
      // Four columns to the right, the finger still down: the column, the band, the game text and the menu key have followed.
      await f.start();
      await f.move(4 * c.w);
      await expect.poll(colsOf).toBe(start + 4);
      await expect(sideBand(page)).toHaveAttribute('data-dragging', '');
      const game1 = (await page.locator('.wc-cockpit > .wc-game').boundingBox())!;
      expect(game1.x).toBeCloseTo(game0.x + 4 * c.w, 0);
      expect(game1.width).toBeCloseTo(game0.width - 4 * c.w, 0);
      const b1 = (await sideBand(page).boundingBox())!;
      expect(b1.x + b1.width).toBeCloseTo(game1.x, 0);
      expect((await page.locator('.wc-ph-menu').boundingBox())!.x).toBeGreaterThanOrEqual(game1.x);
      // Nothing is stored and MUME has heard nothing yet. Four columns: four layouts at the most.
      await frames(page);
      expect((await phone(page)).sideCols).toBeNull();
      const mid = await counts();
      expect(mid.naws).toEqual([]);
      expect(mid.layouts).toBeGreaterThanOrEqual(1);
      expect(mid.layouts).toBeLessThanOrEqual(4);
      // Moves inside one column lay nothing out.
      await f.move(4 * c.w + 2, 3);
      await f.move(4 * c.w - 2, 3);
      await frames(page);
      expect((await counts()).layouts).toBe(mid.layouts);
      await f.move(6 * c.w);
      await expect.poll(colsOf).toBe(start + 6);
      expect((await counts()).naws).toEqual([]);
      await f.end();
      await expect(sideBand(page)).not.toHaveAttribute('data-dragging', '');
      expect((await phone(page)).sideCols).toBe(start + 6);
      // One window size for the whole drag: the game text's rows, and MUME's 80 columns at the least.
      await expect.poll(async () => (await counts()).naws.length).toBe(1);
      await frames(page);
      await frames(page);
      const g = await layout(page);
      expect((await counts()).naws).toEqual([await nawsNow(page)]);
      expect(await colsOf()).toBe(start + 6);
      const drag2 = async (dx: number): Promise<void> => {
        await f.start();
        await f.move(dx, 5);
        await f.end();
      };
      // Far right: the game text keeps 40 columns at the least, and the column stays left of the lens and the keys.
      await drag2(900);
      await expect.poll(async () => (await layout(page)).side.w).toBe(g.range!.max);
      const wide = await layout(page);
      expect(wide.game.w).toBeGreaterThanOrEqual(40);
      expect((await phone(page)).sideCols).toBe(wide.side.w);
      await expectClear(page, 'dragged wide');
      // Far left: 24 columns at the least.
      await drag2(-900);
      await expect.poll(colsOf).toBe(24);
      expect((await phone(page)).sideCols).toBe(24);
      await expectClear(page, 'dragged narrow');
      // A press without a move stores nothing and sends nothing.
      await frames(page);
      await frames(page);
      const quiet = await counts();
      await drag2(0);
      await frames(page);
      await frames(page);
      expect((await counts()).naws).toEqual(quiet.naws);
      // Thirty columns: kept when the column is closed and opened, and over a reload.
      await drag2(6 * c.w);
      await expect.poll(colsOf).toBe(30);
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveCount(0);
      await sat(page, 'panes').tap();
      await expect.poll(colsOf).toBe(30);
      await page.evaluate(() => window.__wc!.settings.flush());
      await page.reload();
      await expect(page.locator('.wc-ph-pad')).toBeVisible();
      expect((await phone(page)).sideCols).toBe(30);
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveCount(1);
      await expect.poll(colsOf).toBe(30);
      expect(errors).toEqual([]);
    });

    test('opening and closing the column sends MUME one window size each, never under 80 columns', async ({ page }) => {
      await openPhone(page);
      await play(page);
      await frames(page);
      const counts = await countLayouts(page);
      const before = await layout(page);
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveCount(1);
      await frames(page);
      await frames(page);
      const open = await layout(page);
      expect(open.game.w).toBeLessThan(before.game.w);
      expect(open.game.h).toBe(before.game.h);
      // The columns are the game text's, or 80.
      const sizeOpen = await nawsNow(page);
      expect(Number(sizeOpen.split('x')[0])).toBeGreaterThanOrEqual(80);
      expect((await counts()).naws).toEqual([sizeOpen]);
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveCount(0);
      await frames(page);
      await frames(page);
      const sizeClosed = await nawsNow(page);
      expect(Number(sizeClosed.split('x')[0])).toBeGreaterThanOrEqual(80);
      // One report each. (Where both are 80 columns wide the two are the same size, and the
      // telnet layer sends an unchanged size to MUME only once.)
      expect((await counts()).naws).toEqual([sizeOpen, sizeClosed]);
    });

    test('the lens stands left of one and of two hot key columns with its three keys, and does not move when K is tapped; it shrinks to its room and hides under 96 px', async ({ page }) => {
      const errors = watchErrors(page);
      await openPhone(page);
      await play(page);
      const lens = page.locator('.wc-ph-lens');
      await expect(lens).toBeVisible();
      const full = Math.min(190, Math.max(130, Math.round((viewport.height * 150) / 360)));
      expect((await layout(page)).lensPx).toBe(full);
      const hotLeft = async (): Promise<number> => Math.min(...(await boxes(page, { hot: '.wc-ph-hk' })).map((b) => b.x));
      // One column: the lens and its keys end left of it, near the top edge.
      let l = (await lens.boundingBox())!;
      expect(await page.locator('.wc-ph-lens .wc-ph-sat:visible').count()).toBeGreaterThanOrEqual(2);
      expect(l.x + l.width + 10).toBeLessThanOrEqual((await hotLeft()) + 0.5);
      expect(l.y).toBeLessThan(40);
      await expectClear(page, 'one column');
      // K hides the column: the lens stays where it is.
      await page.locator('.wc-ph-key.is-tog').tap();
      await expect(page.locator('.wc-ph-hot')).toBeHidden();
      await frames(page);
      expect((await lens.boundingBox())!.x).toBeCloseTo(l.x, 0);
      await page.locator('.wc-ph-key.is-tog').tap();
      await expect(page.locator('.wc-ph-hot')).toBeVisible();
      // Two columns: left of both.
      await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
      await expect(page.locator('.wc-ph-hk')).toHaveCount(6);
      await frames(page);
      const l2 = (await lens.boundingBox())!;
      expect(l2.x).toBeLessThan(l.x - 40);
      expect(l2.x + l2.width + 10).toBeLessThanOrEqual((await hotLeft()) + 0.5);
      expect((await layout(page)).lensPx).toBe(full);
      await expectClear(page, 'two columns');
      l = l2;
      // The column open at its widest: still clear of the lens.
      await page.evaluate(() => window.__wc!.settings.update({ phone: { sideCols: 200 } }));
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveCount(1);
      await expectClear(page, 'two columns, the column at its widest');
      const g = await layout(page);
      expect(g.lensPx).toBeGreaterThanOrEqual(96);
      const sp = (await stripPane(page).boundingBox())!;
      expect((await lens.boundingBox())!.x - 10).toBeGreaterThanOrEqual(sp.x + sp.width);
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveCount(0);
      // A fight card takes rows above it: in whole rows down to 96 px.
      await play(page, FIGHT);
      await expect(page.locator('.wc-ph-fight')).toBeVisible();
      await frames(page);
      const c = await cell(page);
      const fought = await layout(page);
      expect(fought.lensPx).toBeLessThanOrEqual(full);
      expect(fought.lensPx).toBeGreaterThanOrEqual(96);
      // (Shrunk: whole rows of the cell's height, to the px.)
      if (fought.lensPx < full) expect(Math.abs(fought.lensPx - Math.floor(Math.round(fought.lensPx / c.h) * c.h + 1e-6))).toBeLessThan(1);
      const fl = (await lens.boundingBox())!;
      expect(Math.round(fl.width)).toBe(fought.lensPx);
      const fight = (await page.locator('.wc-ph-fight').boundingBox())!;
      expect(fl.y - 10).toBeGreaterThanOrEqual(fight.y + fight.height - 0.5);
      await expectClear(page, 'fighting');
      // No room for 96 px (the hot key box is open and reaches up): the lens hides. Closed again, it is back.
      const key = (await page.locator('.wc-ph-hk[data-hk="0"]').boundingBox())!;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: key.x + key.width / 2, y: key.y + key.height / 2, id: 0 }] });
      await expect(page.locator('.wc-ph-rb')).toBeVisible();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await expect(lens).toBeHidden();
      expect((await layout(page)).lensHidden).toBe(true);
      await page.locator('.wc-ph-rb .wc-ph-bt').first().tap();
      await expect(page.locator('.wc-ph-rb')).toBeHidden();
      await expect(lens).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('the keyboard up: the command field and the game text stay; Comm keeps its column while its reply is typed in', async ({ page }) => {
      const server = await enterMock(page);
      server().send(tell('Gibur', 'you at the ford?'));
      await sat(page, 'panes').tap();
      await expect(stripPane(page)).toHaveCount(1);
      await sat(page, 'comm').tap();
      await expect(comm(page)).toBeVisible();
      await comm(page).locator('.wc-cm-ent[aria-label^="Gibur"]').tap();
      const reply = comm(page).locator('.wc-cm-rinput');
      await reply.tap();
      const kb = 170;
      await page.setViewportSize({ width: viewport.width, height: kb });
      await expect(page.locator('html')).toHaveClass(/\bwc-kbd\b/);
      await frames(page);
      const g = await layout(page);
      // Still the landscape arrangement, and Comm is there with its reply line on screen.
      expect(g.landscape).toBe(true);
      expect(g.comm.h).toBeGreaterThanOrEqual(4);
      await expect(reply).toBeVisible();
      const rb = (await reply.boundingBox())!;
      expect(rb.y + rb.height).toBeLessThanOrEqual(kb + 0.5);
      // The command field and at least two rows of game text beside it.
      const field = (await page.locator('.wc-cockpit > .wc-input-slot > .wc-input').boundingBox())!;
      expect(field.y + field.height).toBeLessThanOrEqual(kb + 0.5);
      expect(g.game.h).toBeGreaterThanOrEqual(2);
      // Nothing stored changed, and all is back when the keyboard goes.
      const p = await phone(page);
      expect([p.sideCols, p.commRows, p.stripRows]).toEqual([null, null, null]);
      await page.setViewportSize(viewport);
      await expect(page.locator('html')).not.toHaveClass(/\bwc-kbd\b/);
      await expect(stripPane(page)).toHaveCount(1);
      await expect(comm(page)).toBeVisible();
    });
  });
}

test.describe('landscape, a low screen (844 × 320)', () => {
  test.use({ viewport: { width: 844, height: 320 } });

  test('too little room for the lens (a fight card over the rows above the compass): its key row stands in its place, left of the hot key columns', async ({ page }) => {
    await openPhone(page);
    await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
    await play(page);
    // Without a fight: shrunk in whole rows, still shown.
    const calm = await layout(page);
    expect(calm.lensHidden).toBe(false);
    expect(calm.lensPx).toBeGreaterThanOrEqual(96);
    expect(calm.lensPx).toBeLessThan(142);
    await expect(page.locator('.wc-ph-lens')).toBeVisible();
    await play(page, FIGHT);
    await expect(page.locator('.wc-ph-fight')).toBeVisible();
    await expect.poll(async () => (await layout(page)).lensHidden).toBe(true);
    const row = page.locator('.wc-ph-satrow');
    await expect(row).toBeVisible();
    await expect(page.locator('.wc-ph-lens')).toBeHidden();
    const r = (await row.boundingBox())!;
    const hotLeft = Math.min(...(await boxes(page, { hot: '.wc-ph-hk' })).map((b) => b.x));
    expect(r.x + r.width).toBeLessThanOrEqual(hotLeft + 0.5);
    expect(await row.locator('.wc-ph-sat:visible').count()).toBeGreaterThanOrEqual(2);
    const fight = (await page.locator('.wc-ph-fight').boundingBox())!;
    expect(r.y).toBeGreaterThanOrEqual(fight.y + fight.height);
    // K hides the columns: the row stays where it is.
    await page.locator('.wc-ph-key.is-tog').tap();
    await expect(page.locator('.wc-ph-hot')).toBeHidden();
    await frames(page);
    expect((await row.boundingBox())!.x).toBeCloseTo(r.x, 0);
    // The row's keys work: the strip opens as the column, and the row is right of it.
    await row.locator('.wc-ph-sat[data-sat="panes"]').tap();
    await expect(stripPane(page)).toHaveCount(1);
    const sp = (await stripPane(page).boundingBox())!;
    expect((await row.boundingBox())!.x).toBeGreaterThanOrEqual(sp.x + sp.width);
  });
});

test.describe('turning the phone', () => {
  const PORTRAIT = { width: 390, height: 844 };
  const LANDSCAPE = { width: 844, height: 390 };
  test.use({ viewport: PORTRAIT });

  test('what is open stays open between portrait and landscape; the sizes are each orientation\'s own; the keys are 36 px and 44 px', async ({ page }) => {
    const errors = watchErrors(page);
    await enterMock(page);
    const keySize = async (): Promise<number> => Math.round((await page.locator('.wc-ph-key[data-cmd="north"]').boundingBox())!.width);
    expect(await keySize()).toBe(36);
    expect(Math.round((await page.locator('.wc-ph-hk[data-hk="0"]').boundingBox())!.width)).toBe(36);
    await page.evaluate(() => window.__wc!.settings.update({ phone: { commRows: 9, stripRows: 7, sideCols: 33 } }));
    await sat(page, 'panes').tap();
    await sat(page, 'comm').tap();
    await expect(stripPane(page)).toHaveCount(1);
    await expect(comm(page)).toBeVisible();
    let g = await layout(page);
    expect([g.landscape, g.strip.h, g.comm.h, g.strip.w, g.side.w]).toEqual([false, 7, 9, g.cols, 0]);
    // The dots sit on the strip's band in portrait.
    await expect(page.locator('.wc-ph-strip-band .wc-ph-strip-dots')).toHaveCount(1);
    await expect(page.locator('.wc-ph-strip-band')).toBeVisible();
    // Turned: both still open, now the column at its own stored width.
    await page.setViewportSize(LANDSCAPE);
    await expect.poll(async () => (await layout(page)).landscape).toBe(true);
    await expect(stripPane(page)).toHaveCount(1);
    await expect(comm(page)).toBeVisible();
    await expect(sat(page, 'panes')).toHaveAttribute('aria-pressed', 'true');
    await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');
    g = await layout(page);
    expect(g.side.w).toBe(33);
    expect(g.strip.h + g.comm.h).toBe(g.rows);
    await expect.poll(keySize).toBe(44);
    await expect(page.locator('.wc-ph-strip > .wc-ph-strip-dots')).toHaveCount(1);
    await expect(page.locator('.wc-ph-strip-band')).toBeHidden();
    await expect(sideBand(page)).toBeVisible();
    await expectClear(page, 'turned to landscape');
    // Close the strip there; turned back, it is closed in portrait too and Comm has its portrait height.
    await sat(page, 'panes').tap();
    await expect(stripPane(page)).toHaveCount(0);
    await page.setViewportSize(PORTRAIT);
    await expect.poll(async () => (await layout(page)).landscape).toBe(false);
    await expect(stripPane(page)).toHaveCount(0);
    await expect(comm(page)).toBeVisible();
    g = await layout(page);
    expect([g.comm.h, g.comm.w, g.comm.x, g.game.x]).toEqual([9, g.cols, 0, 0]);
    await expect.poll(keySize).toBe(36);
    await expect(sideBand(page)).toBeHidden();
    await expect(page.locator('.wc-ph-comm-band')).toBeVisible();
    const p = await phone(page);
    expect([p.commRows, p.stripRows, p.sideCols]).toEqual([9, 7, 33]);
    expect(errors).toEqual([]);
  });
});
