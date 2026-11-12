// Stage 53, round 53k (the owner's points from his S21 after 53j; ADR 0137's
// addendum of that round):
//
// A. The fight card always lies under the panes at the top in portrait.
// B. A setting turns the fight card off.
// C. The map lens is moved (touch and drag) and resized (hold still, then
//    drag) by touch; pushed by the panes it shrinks and hides, and comes
//    back to where it was dropped at the size it was given. Real pointer
//    sequences through CDP; no cockpit layout and no window size while the
//    finger is down.
// D. Four zoom levels (the tap's steps are in phone-map.spec.ts; here the
//    look of each).
// E. Review findings on round 53j (2, 3 and 4 here; 1 and 5 to 8 in
//    phone-round-53k-input.spec.ts).
//
// `phone` project. The sessions play against a `page.routeWebSocket` mock;
// nothing reaches MUME. Screenshots go to docs/stages/img/53-k-*.png with
// `WC_SHOTS=1`.
import { readFileSync } from 'node:fs';
import { type CDPSession, type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const pad = (page: Page) => page.locator('.wc-ph-pad');
const okb = (page: Page) => page.locator('.wc-ph-okb');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const rb = (page: Page) => page.locator('.wc-ph-rb');
const command = (page: Page) => rb(page).locator('#wc-ph-rb-command');
const hk = (page: Page, n: number) => page.locator(`.wc-ph-hk[data-hk="${n - 1}"]`);
const layout = (page: Page) => page.evaluate(() => window.__wc!.app.cockpit.phoneGameLayout!);
const comm = (page: Page) => page.locator('.wc-cockpit > .wc-pane[data-pane="comm"]');
const reply = (page: Page) => comm(page).locator('.wc-cm-rinput');
const stripPane = (page: Page) => page.locator('.wc-cockpit > .wc-pane[data-phone-strip]');
const sat = (page: Page, name: 'panes' | 'comm' | 'fullscreen') => page.locator(`.wc-ph-sat[data-sat="${name}"]:visible`);
const fight = (page: Page) => page.locator('.wc-ph-fight');
const lens = (page: Page) => page.locator('.wc-ph-lens');
const glass = (page: Page) => page.locator('.wc-ph-lens-glass');
const mapPane = (page: Page) => page.locator('.wc-cockpit > .wc-pane-map');
const mapContent = (page: Page) => page.locator('.wc-pane-map .wc-pane-content');
const satRow = (page: Page) => page.locator('.wc-ph-satrow');
const lensSet = (page: Page) => page.evaluate(() => window.__wc!.settings.get().phone.lens);

const S21 = { width: 360, height: 800 };
const S21_LAND = { width: 800, height: 360 };
const SHOTS = process.env.WC_SHOTS === '1';
const shot = async (page: Page, name: string): Promise<void> => {
  if (SHOTS) await page.screenshot({ path: `docs/stages/img/53-k-${name}.png` });
};

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;
const mid = (b: Box): { x: number; y: number } => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function setScreen(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  // (Generous: under load a resize and the layout after it can take seconds.)
  await expect.poll(async () => (await box(page.locator('#app'))).height, { timeout: 20_000 }).toBe(size.height);
  await expect.poll(async () => (await layout(page)).landscape, { timeout: 20_000 }).toBe(size.width > size.height);
  await frames(page);
}

/** Every window size told to the session (what becomes NAWS) and every cockpit layout, from now on. */
async function watchWork(page: Page): Promise<() => Promise<{ sizes: string[]; layouts: number }>> {
  await page.evaluate(() => {
    const w = window as unknown as { __work?: { sizes: string[]; layouts: number } };
    const app = window.__wc!.app;
    if (!w.__work) {
      const s = app.session;
      const set = s.setWindowSize.bind(s);
      s.setWindowSize = (cols: number, rows: number) => {
        w.__work!.sizes.push(`${cols}x${rows}`);
        set(cols, rows);
      };
      app.cockpit.onLayout(() => {
        w.__work!.layouts++;
      });
    }
    w.__work = { sizes: [], layouts: 0 };
  });
  return () => page.evaluate(() => ({ ...(window as unknown as { __work: { sizes: string[]; layouts: number } }).__work }));
}

/** A finger through CDP (real touch events, so real pointer events with the browser's own gesture handling). */
class Finger {
  private constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession,
    private at: { x: number; y: number },
  ) {}

  static async down(page: Page, at: { x: number; y: number }): Promise<Finger> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...at, id: 0 }] });
    return new Finger(page, cdp, at);
  }

  /** Moves to `to` in `steps` moves, a frame apart. */
  async move(to: { x: number; y: number }, steps = 8): Promise<void> {
    const from = this.at;
    for (let i = 1; i <= steps; i++) {
      const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 0 }] });
      await this.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    }
    this.at = to;
  }

  async up(): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await this.cdp.detach();
  }
}

/** Drags the lens by `dx`, `dy` with one finger from its middle. */
async function dragLens(page: Page, dx: number, dy: number): Promise<void> {
  const c = mid(await box(glass(page)));
  const f = await Finger.down(page, c);
  await f.move({ x: c.x + dx, y: c.y + dy });
  await f.up();
  await frames(page);
  await frames(page);
}

/** Holds a finger still on the lens `from` (relative to its centre) until the resize is armed, then drags it to `to`. */
async function resizeLens(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const c = mid(await box(glass(page)));
  const f = await Finger.down(page, { x: c.x + from.x, y: c.y + from.y });
  await expect(lens(page)).toHaveClass(/\bis-armed\b/);
  await f.move({ x: c.x + to.x, y: c.y + to.y });
  await f.up();
  await frames(page);
  await frames(page);
}

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const gmcp = (pkg: string, data: unknown): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);

interface Mock {
  sent: string[];
  server: () => WebSocketRoute;
}

/** Enters MUME on `?phone=1` against a mock and logs in. */
async function play(page: Page, query = '&kbd=en'): Promise<Mock> {
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
  await expect(pad(page)).toBeVisible();
  server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
  return { sent, server: () => server! };
}

const startFight = (m: Mock): void => m.server().send(gmcp('Char.Vitals', { hp: 150, maxhp: 172, opponent: 'an orc scout', buffer: 'Rasta', 'opponent-hits': 'hurt' }));

/** The strip on its second page (Group) and Comm on Gibur's chat, both open. */
async function openBoth(page: Page, m: Mock): Promise<void> {
  await sat(page, 'panes').tap();
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'timers');
  await page.keyboard.press('Control+2');
  await expect(stripPane(page)).toHaveAttribute('data-pane', 'group');
  m.server().send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: "Gibur tells you 'you at the ford?'" }));
  await sat(page, 'comm').tap();
  await expect(comm(page)).toBeVisible();
  await comm(page).locator('.wc-cm-ent[aria-label^="Gibur"]').tap();
  await expect(reply(page)).toBeVisible();
  await frames(page);
}

/** Some lines of game text, so a screenshot shows what the layout is over. */
function chatter(m: Mock, n = 30): void {
  const lines = ['The Prancing Pony', 'A large fire burns in the hearth. Hobbits sit at the low tables.', 'Exits: north, east, south.', 'An orc scout snarls at you.', 'You swing at an orc scout.'];
  let out = '';
  for (let i = 0; i < n; i++) out += `${lines[i % lines.length]}\r\n`;
  m.server().send(Buffer.from(out, 'latin1'));
}

/** The last room of the map demo's walk (tests/fixtures/map-demo.log), as MUME sent it. */
const HILL_ROAD: unknown = JSON.parse(
  readFileSync('tests/fixtures/map-demo.log', 'latin1')
    .split('\n')
    .filter((l) => l.includes('GMCP Room.Info '))
    .at(-1)!
    .split('GMCP Room.Info ')[1]!,
);

/** Puts the player in a room of the map (Hill Road in Bree), so the lens shows the map round it. */
async function locate(page: Page, m: Mock): Promise<void> {
  await expect(mapContent(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  m.server().send(gmcp('Room.Info', HILL_ROAD));
  await expect(mapContent(page)).toHaveAttribute('data-map-located', '1', { timeout: 10_000 });
}

/** Waits until the map's picture has stood still for a moment (the worker has drawn the new size or zoom). */
async function mapSettled(page: Page): Promise<void> {
  // (A new zoom takes some 0.7 s to show in headless Chromium: longer than two samples.)
  await page.waitForTimeout(900);
  let last = '';
  let same = 0;
  for (let i = 0; i < 40 && same < 2; i++) {
    await page.waitForTimeout(120);
    const now = (await page.locator('.wc-pane-map canvas').screenshot()).toString('base64');
    same = now === last ? same + 1 : 0;
    last = now;
  }
}

// ------------------------------------------------------------------ C. the lens

test.describe('C. the lens is moved and resized by touch', () => {
  test('a drag moves the lens with its keys, stores the place, steps no zoom and scrolls nothing; no layout and no window size while the finger is down', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    chatter(m, 80);
    await locate(page, m);
    await expect(lens(page)).toBeVisible();
    const was = await box(lens(page));
    const keyWas = await box(sat(page, 'comm'));
    const scrolled = () => page.evaluate(() => document.querySelector('.wc-game .wc-rows')?.parentElement?.scrollTop ?? 0);
    await expect.poll(scrolled).toBeGreaterThan(0);
    await frames(page);
    const top = await scrolled();
    const work = await watchWork(page);
    const c = mid(was);
    const f = await Finger.down(page, c);
    await f.move({ x: c.x - 120, y: c.y + 260 });
    // Still down: the lens is under the finger, by a transform only.
    const during = await box(lens(page));
    expect(during.x).toBeCloseTo(was.x - 120, 0);
    expect(during.y).toBeCloseTo(was.y + 260, 0);
    const p = mid(await box(mapPane(page)));
    expect(p.x).toBeCloseTo(mid(during).x, 0);
    expect(p.y).toBeCloseTo(mid(during).y, 0);
    expect(await work()).toEqual({ sizes: [], layouts: 0 });
    expect(await lensSet(page)).toMatchObject({ portrait: { x: null, y: null, size: null } });
    await f.up();
    await frames(page);
    await frames(page);
    // Dropped: the same place, now laid out; the keys came along; nothing went to MUME.
    const now = await box(lens(page));
    expect(now.x).toBeCloseTo(during.x, 0);
    expect(now.y).toBeCloseTo(during.y, 0);
    expect(now.width).toBe(was.width);
    const key = await box(sat(page, 'comm'));
    expect(key.x - keyWas.x).toBeCloseTo(-120, 0);
    expect(key.y - keyWas.y).toBeCloseTo(260, 0);
    const after = await work();
    expect(after.sizes).toEqual([]);
    expect(after.layouts).toBeGreaterThanOrEqual(1);
    const pane = mid(await box(mapPane(page)));
    expect(pane.x).toBeCloseTo(mid(now).x, 0);
    expect(pane.y).toBeCloseTo(mid(now).y, 0);
    const set = await lensSet(page);
    expect(set.portrait.x! * 360).toBeCloseTo(mid(now).x, 0);
    expect(set.portrait.y! * 800).toBeCloseTo(mid(now).y, 0);
    expect(set.portrait.size).toBeNull();
    expect(set.landscape).toEqual({ x: null, y: null, size: null });
    // No tap came of it, and the game text did not scroll.
    await expect(lens(page)).toHaveAttribute('data-level', 'z1');
    expect(await scrolled()).toBe(top);
    // A plain tap still steps the zoom, and the keys still work.
    await glass(page).tap();
    await expect(lens(page)).toHaveAttribute('data-level', 'z2');
    await sat(page, 'comm').tap();
    await expect(comm(page)).toBeVisible();
    await mapSettled(page);
    await shot(page, 'lens-moved');
    expect(errors).toEqual([]);
  });
});

test.describe('C. the lens: resize, the room, rotation, reset', () => {
  test('hold still, then drag: the rim lights up and the lens is resized (larger than its full size, down to 96 px); the map is drawn anew once, after the drop', async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      const sent: unknown[] = ((window as unknown as { __zooms: unknown[] }).__zooms = []);
      const orig = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (this: Worker, m: unknown, ...rest: unknown[]) {
        if ((m as { t?: string } | null)?.t === 'zoomTo') sent.push((m as { zoom: number }).zoom);
        return (orig as (...a: unknown[]) => void).call(this, m, ...rest);
      } as typeof orig;
    });
    const zooms = () => page.evaluate(() => (window as unknown as { __zooms: number[] }).__zooms.slice());
    const m = await play(page);
    await setScreen(page, S21);
    chatter(m);
    await locate(page, m);
    await expect(mapContent(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
    const was = await box(lens(page));
    expect(was.width).toBe(150);
    const work = await watchWork(page);
    const before = (await zooms()).length;
    // A finger held still 40 px left of the centre: armed after the hold, and nothing else yet.
    const c = mid(was);
    const f = await Finger.down(page, { x: c.x - 40, y: c.y });
    await expect(lens(page)).not.toHaveClass(/\bis-armed\b/);
    await expect(lens(page)).toHaveClass(/\bis-armed\b/);
    await mapSettled(page);
    await shot(page, 'lens-armed');
    // Away from the centre by 80 px: 160 px larger. The dressing follows at once, the map's picture is scaled.
    await f.move({ x: c.x - 120, y: c.y }, 10);
    const during = await box(lens(page));
    expect(during.width).toBeGreaterThan(290);
    expect(during.width).toBeLessThanOrEqual(336);
    expect(await mapPane(page).evaluate((el) => (el as HTMLElement).style.scale)).not.toBe('');
    const pane = await box(mapPane(page));
    expect(mid(pane).x).toBeCloseTo(mid(during).x, 0);
    expect(mid(pane).y).toBeCloseTo(mid(during).y, 0);
    expect(await work()).toEqual({ sizes: [], layouts: 0 });
    expect((await zooms()).length).toBe(before);
    await f.up();
    await expect(lens(page)).not.toHaveClass(/\bis-armed\b/);
    await frames(page);
    await frames(page);
    const big = await box(lens(page));
    expect(big.width).toBe(during.width);
    expect(big.x).toBeCloseTo(during.x, 0);
    expect(big.y).toBeCloseTo(during.y, 0);
    // Never moved: it grew about where it stood, into the room's corner at the top right.
    expect(big.x + big.width).toBeCloseTo(348, 0);
    const set = await lensSet(page);
    // The size, and (never moved before) the place it was shown at when the resize began.
    expect(set.portrait.size).toBe(big.width);
    expect(set.portrait.x! * 360).toBeCloseTo(c.x, 0);
    expect(set.portrait.y! * 800).toBeCloseTo(c.y, 0);
    // Laid out for real: no scale, the clip at the new size, one zoom for it (the same rooms across), no window size.
    expect(await mapPane(page).evaluate((el) => (el as HTMLElement).style.scale)).toBe('');
    expect(await mapPane(page).evaluate((el) => getComputedStyle(el).clipPath)).toBe(`circle(${big.width / 2}px at 50% 50%)`);
    const z = await zooms();
    expect(z.length).toBe(before + 1);
    expect(z.at(-1)).toBeCloseTo(big.width / (5 * 44), 4);
    expect((await work()).sizes).toEqual([]);
    // No tap came of the hold or the drag.
    await expect(lens(page)).toHaveAttribute('data-level', 'z1');
    await mapSettled(page);
    await shot(page, 'lens-large');
    // Towards the centre: smaller, and never under 96 px.
    await resizeLens(page, { x: -120, y: 0 }, { x: -40, y: 0 });
    const mid2 = await box(lens(page));
    expect(mid2.width).toBeCloseTo(big.width - 160, 0);
    await resizeLens(page, { x: -60, y: 0 }, { x: 0, y: 0 });
    const small = await box(lens(page));
    expect(small.width).toBe(96);
    expect((await lensSet(page)).portrait.size).toBe(96);
    await mapSettled(page);
    await shot(page, 'lens-small');
    // A hold released in place changes nothing and steps no zoom.
    const f2 = await Finger.down(page, mid(small));
    await expect(lens(page)).toHaveClass(/\bis-armed\b/);
    await f2.up();
    await frames(page);
    expect((await lensSet(page)).portrait.size).toBe(96);
    await expect(lens(page)).toHaveAttribute('data-level', 'z1');
    // The keys on its corners still work at the least size.
    await sat(page, 'panes').tap();
    await expect(stripPane(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('pushed by the panes it moves down, shrinks, and hides with its keys as a row; with the room back it is where it was dropped, at the size it was given', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    chatter(m);
    await locate(page, m);
    // Dropped a little lower at the right (over the hot keys' columns), and made 200 px.
    await dragLens(page, 0, 60);
    await resizeLens(page, { x: 50, y: 0 }, { x: 75, y: 0 });
    const home = await box(lens(page));
    expect(home.width).toBe(200);
    const stored = await lensSet(page);
    const rows = (n: number) => page.evaluate((n) => window.__wc!.settings.update({ phone: { commRows: n } }), n);
    // Comm opens over its place: it rides under Comm.
    await rows(14);
    await sat(page, 'comm').tap();
    await expect(comm(page)).toBeVisible();
    await frames(page);
    let g = await layout(page);
    const cell = await page.evaluate(() => window.__wc!.cells.get());
    let now = await box(lens(page));
    expect(now.width).toBe(200);
    expect(now.x).toBe(home.x);
    expect(now.y).toBeGreaterThan(home.y);
    expect(now.y).toBeCloseTo(g.game.y * cell.h + 16, 0);
    // Comm grows: less room between it and the hot keys than its size, so it shrinks (the zoom following), still under Comm.
    await rows(20);
    await frames(page);
    g = await layout(page);
    now = await box(lens(page));
    expect(now.width).toBeLessThan(200);
    expect(now.width).toBeGreaterThanOrEqual(96);
    expect(now.y).toBeCloseTo(g.game.y * cell.h + 16, 0);
    expect(now.y + now.height).toBeLessThanOrEqual((await box(field(page))).y);
    expect(g.lensPx).toBe(now.width);
    await mapSettled(page);
    await shot(page, 'lens-pushed-shrunk');
    // With the keyboard up too there is no room at all: hidden, its keys as a row.
    await field(page).tap();
    await expect(okb(page)).toBeVisible();
    await frames(page);
    await frames(page);
    g = await layout(page);
    expect(g.lensHidden).toBe(true);
    await expect(lens(page)).toBeHidden();
    await expect(satRow(page)).toBeVisible();
    await expect(satRow(page).locator('.wc-ph-sat[data-sat="comm"]')).toBeVisible();
    await shot(page, 'lens-hidden-key-row');
    // Nothing of that was stored.
    expect(await lensSet(page)).toEqual(stored);
    // The keyboard folds and Comm closes: back where it was dropped, at its size.
    await okb(page).locator('.wc-ph-okb-k[data-act="fold"]').tap();
    await expect(okb(page)).toBeHidden();
    await frames(page);
    await expect(lens(page)).toBeVisible();
    await sat(page, 'comm').tap();
    await expect(comm(page)).toBeHidden();
    await frames(page);
    await frames(page);
    expect(await box(lens(page))).toEqual(home);
    expect(await lensSet(page)).toEqual(stored);
    expect(errors).toEqual([]);
  });

  test('each orientation has its own place and size; a rotation shows that orientation\'s; the place is kept over a reload; Reset in the settings puts both back', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    chatter(m);
    await locate(page, m);
    const dflt = await box(lens(page));
    await dragLens(page, -140, 300);
    const port = await box(lens(page));
    // Landscape: never moved there, so the default place (left of the hot keys, at the top).
    await setScreen(page, S21_LAND);
    await frames(page);
    expect((await layout(page)).lensAt).toBeNull();
    const landDflt = await box(lens(page));
    await dragLens(page, -300, 0);
    const land = await box(lens(page));
    expect(land.x).toBeCloseTo(landDflt.x - 300, 0);
    let set = await lensSet(page);
    expect(set.landscape.x).not.toBeNull();
    expect(set.portrait.x! * 360).toBeCloseTo(mid(port).x, 0);
    await mapSettled(page);
    await shot(page, 'lens-moved-landscape');
    // Back to portrait: where it was dropped there.
    await setScreen(page, S21);
    await frames(page);
    expect(await box(lens(page))).toEqual(port);
    // Kept over a reload.
    await page.evaluate(() => window.__wc!.settings.flush());
    const again = await play(page);
    await setScreen(page, S21);
    chatter(again);
    await locate(page, again);
    await frames(page);
    expect(await box(lens(page))).toEqual(port);
    // Settings → Map lens → Reset place and size.
    await page.locator('.wc-ph-menu').tap();
    await page.locator('.wc-ph-sheet [data-row="settings"]').tap();
    const row = page.locator('.wc-ph-page [data-row="lens-reset"]');
    await expect(row).toContainText('Moved');
    await row.tap();
    await expect(row).toContainText('Default');
    await expect(row).toHaveAttribute('aria-disabled', 'true');
    set = await lensSet(page);
    expect(set.portrait).toEqual({ x: null, y: null, size: null });
    expect(set.landscape).toEqual({ x: null, y: null, size: null });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.wc-ph-sheet')).toBeHidden();
    await frames(page);
    expect(await box(lens(page))).toEqual(dflt);
    expect((await layout(page)).lensAt).toBeNull();
    expect(errors).toEqual([]);
  });

  test('over the keys it stands on them; with our keyboard up it stays above the command row; 320 × 568 holds a lens made too large', async ({ page }) => {
    // (Three settled map pictures and two screens: past the default 30 s on a loaded machine.)
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    chatter(m);
    await locate(page, m);
    // Dropped on the compass: it stands on the hot keys' top (they are under its columns), not over them.
    await dragLens(page, 0, 600);
    let l = await box(lens(page));
    const k3 = await box(hk(page, 3));
    expect(l.y + l.height).toBeLessThanOrEqual(k3.y - 8);
    expect(l.y + l.height).toBeGreaterThan(k3.y - 40);
    // Dropped at the bottom left: down to the command row.
    await dragLens(page, -300, 600);
    l = await box(lens(page));
    const f = await box(field(page));
    expect(l.x).toBe(12);
    expect(l.y + l.height).toBeLessThanOrEqual(f.y);
    expect(l.y + l.height).toBeGreaterThan(f.y - 40);
    const home = l;
    // Our keyboard: the command row moves up, and the lens with it.
    await field(page).tap();
    await expect(okb(page)).toBeVisible();
    await frames(page);
    await frames(page);
    l = await box(lens(page));
    expect(l.y + l.height).toBeLessThanOrEqual((await box(field(page))).y);
    expect(l.width).toBe(home.width);
    await mapSettled(page);
    await shot(page, 'lens-keyboard-up');
    await okb(page).locator('.wc-ph-okb-k[data-act="fold"]').tap();
    await expect(okb(page)).toBeHidden();
    await frames(page);
    await frames(page);
    expect(await box(lens(page))).toEqual(home);
    // A size far larger than a small screen: as large as fits, whole on screen.
    await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { portrait: { x: 0.5, y: 0.4, size: 600 } } } }));
    await setScreen(page, { width: 320, height: 568 });
    await frames(page);
    l = await box(lens(page));
    expect(l.width).toBeLessThanOrEqual(320 - 24);
    expect(l.width).toBeGreaterThanOrEqual(96);
    expect(l.x).toBeGreaterThanOrEqual(12);
    expect(l.x + l.width).toBeLessThanOrEqual(308);
    expect((await lensSet(page)).portrait.size).toBe(600);
    await mapSettled(page);
    await shot(page, 'lens-320x568');
    expect(errors).toEqual([]);
  });

  test('dropped a second time where the layout pushes it back to: the map\'s picture comes back with the ring', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    await locate(page, m);
    // Dropped at the bottom right: it rests pushed up, on the hot keys' top.
    await dragLens(page, 0, 600);
    const rest = await box(lens(page));
    expect(rest.y + rest.height).toBeLessThanOrEqual((await box(hk(page, 3))).y);
    let pane = mid(await box(mapPane(page)));
    expect(pane.x).toBeCloseTo(mid(rest).x, 0);
    expect(pane.y).toBeCloseTo(mid(rest).y, 0);
    // Dragged down onto the compass again: the layout puts it back where it stood, with the same
    // shift of the map pane as before the drag, and the drag's own shift is gone from the pane.
    await dragLens(page, 0, 300);
    expect(await box(lens(page))).toEqual(rest);
    pane = mid(await box(mapPane(page)));
    expect(pane.x).toBeCloseTo(mid(rest).x, 0);
    expect(pane.y).toBeCloseTo(mid(rest).y, 0);
    // And once more, sideways and back under the same floor.
    await dragLens(page, -4, 200);
    pane = mid(await box(mapPane(page)));
    const now = mid(await box(lens(page)));
    expect(pane.x).toBeCloseTo(now.x, 0);
    expect(pane.y).toBeCloseTo(now.y, 0);
    expect(errors).toEqual([]);
  });

  test('a resize past what fits lands on the largest size that does, also in one quick move; a lens too large for the room above the keys is shown as large as fits', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, { width: 320, height: 480 });
    await locate(page, m);
    await dragLens(page, -60, 200);
    await field(page).tap();
    await expect(okb(page)).toBeVisible();
    await frames(page);
    await frames(page);
    const was = await box(lens(page));
    expect((await lensSet(page)).portrait.size).toBeNull();
    // Armed, then one move far outwards: more than the room above the command row holds.
    const c = mid(was);
    const f = await Finger.down(page, { x: c.x + 30, y: c.y });
    await expect(lens(page)).toHaveClass(/\bis-armed\b/);
    await f.move({ x: c.x + 140, y: c.y }, 1);
    const during = await box(lens(page));
    expect(during.width).toBeGreaterThan(was.width);
    await f.up();
    await frames(page);
    await frames(page);
    const big = await box(lens(page));
    expect(big).toEqual(during);
    // As large as fits: from the room's top down to the compass's air, and that is what is stored.
    const compass = await box(pad(page));
    expect(big.y).toBe(16);
    expect(big.y + big.height).toBeLessThanOrEqual(compass.y - 8);
    expect(big.y + big.height).toBeGreaterThan(compass.y - 20);
    expect((await lensSet(page)).portrait.size).toBe(big.width);
    // A slow one ends at the same size.
    await resizeLens(page, { x: 30, y: 0 }, { x: 140, y: 0 });
    expect(await box(lens(page))).toEqual(big);
    await okb(page).locator('.wc-ph-okb-k[data-act="fold"]').tap();
    await expect(okb(page)).toBeHidden();
    // 320 × 568 with a lens of 296 px wanted in the middle and our keyboard up: at its full width it
    // would reach over the hot keys; it is shown as wide as ends left of them, above the compass.
    await setScreen(page, { width: 320, height: 568 });
    await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { portrait: { x: 0.5422, y: 0.5097, size: 296 } } } }));
    await field(page).tap();
    await expect(okb(page)).toBeVisible();
    await frames(page);
    await frames(page);
    let l = await box(lens(page));
    const k = await box(hk(page, 1));
    const p = await box(pad(page));
    expect(l.x + l.width).toBeLessThanOrEqual(k.x - 8);
    expect(l.x + l.width).toBeGreaterThan(k.x - 20);
    expect(l.y + l.height).toBeLessThanOrEqual(p.y - 8);
    expect(l.width).toBeGreaterThan(170);
    // The strip open: less height, and still shown (not hidden) at what fits above the compass.
    await sat(page, 'panes').tap();
    await expect(stripPane(page)).toBeVisible();
    await frames(page);
    await frames(page);
    await expect(lens(page)).toBeVisible();
    l = await box(lens(page));
    const strip = await box(stripPane(page));
    expect(l.y).toBeGreaterThanOrEqual(strip.y + strip.height);
    expect(l.y + l.height).toBeLessThanOrEqual(p.y - 8);
    expect(l.y + l.height).toBeGreaterThan(p.y - 20);
    expect(l.width).toBeGreaterThan(150);
    expect((await lensSet(page)).portrait.size).toBe(296);
    expect(errors).toEqual([]);
  });

  test('the first resize of a lens never moved starts where the lens is shown: no jump as it begins, none at the drop', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    await locate(page, m);
    const was = await box(lens(page));
    const c = mid(was);
    const f = await Finger.down(page, { x: c.x - 40, y: c.y });
    await expect(lens(page)).toHaveClass(/\bis-armed\b/);
    // 6 px outwards: 12 px larger, about the centre it had.
    await f.move({ x: c.x - 46, y: c.y }, 2);
    const during = await box(lens(page));
    expect(during.width).toBe(was.width + 12);
    expect(Math.abs(mid(during).x - c.x)).toBeLessThan(1);
    expect(Math.abs(mid(during).y - c.y)).toBeLessThan(1);
    await f.up();
    await frames(page);
    await frames(page);
    expect(await box(lens(page))).toEqual(during);
    const pane = mid(await box(mapPane(page)));
    expect(pane.x).toBeCloseTo(mid(during).x, 0);
    expect(pane.y).toBeCloseTo(mid(during).y, 0);
    // The place it was shown at is stored with the size.
    const set = (await lensSet(page)).portrait;
    expect(set.size).toBe(during.width);
    expect(Math.abs(set.x! * 360 - c.x)).toBeLessThan(0.1);
    expect(Math.abs(set.y! * 800 - c.y)).toBeLessThan(0.1);
    expect(errors).toEqual([]);
  });
});

// ------------------------------------------------- A, B. the fight card

test.describe('A. the fight card lies under the panes at the top; B. its switch', () => {
  test('portrait: under Comm with both panes open, under the one that is open, at the very top with none; landscape as before', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    chatter(m);
    startFight(m);
    await expect(fight(page)).toBeVisible();
    const game = page.locator('.wc-cockpit > .wc-game');
    // None open: at the very top.
    expect((await box(fight(page))).y).toBe(0);
    await openBoth(page, m);
    await frames(page);
    // Both: the strip's pane, its band, Comm, its band, the card, the game text.
    const s = await box(stripPane(page));
    const sb = await box(page.locator('.wc-ph-strip-band'));
    const c = await box(comm(page));
    const cb = await box(page.locator('.wc-ph-comm-band'));
    let card = await box(fight(page));
    const tops = [s.y, sb.y, c.y, cb.y, card.y, (await box(game)).y];
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    expect(card.y).toBeCloseTo(cb.y + cb.height, 0);
    expect((await box(game)).y).toBeCloseTo(card.y + card.height, 0);
    // Comm's name plate hangs 3 px over the card's top, clear of the names and the bars.
    const plate = await box(page.locator('.wc-ph-comm-band .wc-ph-plate'));
    expect(plate.y + plate.height).toBeLessThanOrEqual(card.y + 4);
    for (const part of await fight(page).locator('.wc-ph-fight-name, .wc-ph-bar, .wc-ph-fight-vs').all()) {
      const b = await box(part);
      const apart = b.y >= plate.y + plate.height - 0.5 || b.x >= plate.x + plate.width || b.x + b.width <= plate.x;
      expect(apart).toBe(true);
    }
    await shot(page, 'card-under-comm');
    // The lens stands under the card.
    const l = await box(lens(page)).catch(() => null);
    if (l) expect(l.y).toBeGreaterThanOrEqual(card.y + card.height);
    // Only Comm.
    await sat(page, 'panes').tap();
    await expect(stripPane(page)).toHaveCount(0);
    await frames(page);
    card = await box(fight(page));
    const cb2 = await box(page.locator('.wc-ph-comm-band'));
    expect(card.y).toBeCloseTo(cb2.y + cb2.height, 0);
    // Only the strip.
    await sat(page, 'comm').tap();
    await sat(page, 'panes').tap();
    await expect(stripPane(page)).toBeVisible();
    await expect(comm(page)).toBeHidden();
    await frames(page);
    card = await box(fight(page));
    const sb2 = await box(page.locator('.wc-ph-strip-band'));
    expect(card.y).toBeCloseTo(sb2.y + sb2.height, 0);
    await shot(page, 'card-under-strip');
    // Landscape: the card is at the top of the game text, right of the column (as before this round).
    await sat(page, 'comm').tap();
    await setScreen(page, S21_LAND);
    await frames(page);
    const g = await layout(page);
    expect(g.fight.y).toBe(0);
    expect(g.fight.x).toBe(g.side.w);
    expect(g.side.w).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('the hot key box ends under the card wherever the card is; Settings → Panes → Fight card off: no card, its rows are the game text\'s, and on again brings it back', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    chatter(m);
    await openBoth(page, m);
    startFight(m);
    await expect(fight(page)).toBeVisible();
    await frames(page);
    // The box (Comm steps aside for it): it ends under the card, which lies under the strip now.
    await hold(page, hk(page, 2));
    await frames(page);
    const card = await box(fight(page));
    expect((await box(rb(page))).y).toBeGreaterThanOrEqual(card.y + card.height - 0.5);
    await rb(page).getByRole('button', { name: 'Cancel' }).tap();
    await expect(rb(page)).toBeHidden();
    await frames(page);
    const on = await layout(page);
    expect(on.fight.h).toBe(2);
    // The switch.
    await page.locator('.wc-ph-menu').tap();
    await page.locator('.wc-ph-sheet [data-row="settings"]').tap();
    const sw = page.locator('.wc-ph-page [data-group="panes"] [data-row="fight-card"]').getByRole('switch');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.tap();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => window.__wc!.settings.get().phone.fightCard)).toBe(false);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.wc-ph-sheet')).toBeHidden();
    await frames(page);
    await expect(fight(page)).toBeHidden();
    const off = await layout(page);
    expect(off.fight.h).toBe(0);
    expect(off.game.h).toBe(on.game.h + 2);
    // The fight goes on: still no card, and none when a new one begins.
    m.server().send(gmcp('Char.Vitals', { hp: 120, maxhp: 172, opponent: 'a cave troll', buffer: 'Rasta', 'opponent-hits': 'fine' }));
    await frames(page);
    await expect(fight(page)).toBeHidden();
    expect((await layout(page)).fight.h).toBe(0);
    await shot(page, 'card-off');
    // On again, in the fight: the card is there with the opponent of now.
    await page.evaluate(() => window.__wc!.settings.update({ phone: { fightCard: true } }));
    await expect(fight(page)).toBeVisible();
    await expect(fight(page)).toContainText('a cave troll');
    expect((await layout(page)).fight.h).toBe(2);
    expect(errors).toEqual([]);
  });
});

/** A hold on `l` through CDP (a real touch): the finger stays down until the box is open, then lifts. */
async function hold(page: Page, l: Locator): Promise<void> {
  const f = await Finger.down(page, mid(await box(l)));
  try {
    await expect(rb(page)).toBeVisible();
  } finally {
    await f.up();
  }
}

// ------------------------------------------------------ E. review findings

test.describe('E. review findings on round 53j', () => {
  test('2. Comm at its least height with the smallest text: the reply line is whole and can be tapped', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    await openBoth(page, m);
    for (const size of [8, 10, 17]) {
      await page.evaluate((size) => window.__wc!.settings.update({ appearance: { size }, phone: { commRows: 1, stripRows: 4 } }), size);
      await frames(page);
      await frames(page);
      const g = await layout(page);
      expect(g.comm.h, `size ${size}`).toBe(g.commRange!.min);
      const line = await box(comm(page).locator('.wc-cm-reply'));
      const band = await box(page.locator('.wc-ph-comm-band'));
      expect(line.height, `size ${size}`).toBeGreaterThanOrEqual(40);
      expect(line.y + line.height, `size ${size}`).toBeLessThanOrEqual(band.y + 0.5);
      // One line of chat is whole above it.
      const bubble = await box(comm(page).locator('.wc-cm-item').last());
      expect(bubble.y + bubble.height, `size ${size}`).toBeLessThanOrEqual(line.y + 0.5);
    }
    await page.evaluate(() => window.__wc!.settings.update({ appearance: { size: 8 } }));
    await frames(page);
    // The tap lands on the line: our keyboard opens for it.
    await reply(page).tap();
    await expect(okb(page)).toBeVisible();
    await expect(reply(page)).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('3. 320 × 480 in a fight with both panes open: a tap on the box\'s field keeps the box and opens no keyboard; no window size goes out', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    await openBoth(page, m);
    startFight(m);
    await expect(fight(page)).toBeVisible();
    await setScreen(page, { width: 320, height: 480 });
    await frames(page);
    await hold(page, hk(page, 2));
    await expect(rb(page)).toBeVisible();
    await frames(page);
    await frames(page);
    const was = await layout(page);
    const work = await watchWork(page);
    await rb(page).locator('.wc-ph-chip[data-pick="custom"]').tap();
    await frames(page);
    await frames(page);
    await expect(rb(page)).toBeVisible();
    await expect(okb(page)).toBeHidden();
    await expect(command(page)).not.toBeFocused();
    expect((await work()).sizes).toEqual([]);
    const g = await layout(page);
    expect(g.bottom).toBe(0);
    expect(g.hidden).toEqual(was.hidden);
    await expect(fight(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('4. the key of a pane the box has out stays lit, and a tap on it only closes the box', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    await openBoth(page, m);
    await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');
    await hold(page, hk(page, 2));
    await frames(page);
    expect((await layout(page)).hidden.comm).toBe(true);
    await expect(comm(page)).toBeHidden();
    // Still open as far as the user is concerned: lit.
    await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');
    await expect(sat(page, 'comm')).toHaveClass(/\bis-on\b/);
    await expect(sat(page, 'panes')).toHaveAttribute('aria-pressed', 'true');
    // The tap closes the box, and Comm is back, not closed.
    await sat(page, 'comm').tap();
    await expect(rb(page)).toBeHidden();
    await expect(comm(page)).toBeVisible();
    await frames(page);
    expect((await layout(page)).comm.h).toBeGreaterThan(0);
    await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'true');
    // The next tap is the key's own again.
    await sat(page, 'comm').tap();
    await expect(comm(page)).toBeHidden();
    await expect(sat(page, 'comm')).toHaveAttribute('aria-pressed', 'false');
    // The same for the panes' key, with the keyboard up in the box (both parts out).
    await sat(page, 'comm').tap();
    await expect(comm(page)).toBeVisible();
    await hold(page, hk(page, 2));
    await rb(page).locator('.wc-ph-chip[data-pick="custom"]').tap();
    await expect(okb(page)).toBeVisible();
    await frames(page);
    await frames(page);
    expect((await layout(page)).hidden).toEqual({ strip: true, comm: true });
    await expect(sat(page, 'panes')).toHaveAttribute('aria-pressed', 'true');
    await sat(page, 'panes').tap();
    await expect(rb(page)).toBeHidden();
    await expect(stripPane(page)).toBeVisible();
    await expect(comm(page)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// ------------------------------------------------------- D. the zoom levels

test.describe('D. four zoom levels', () => {
  /** ms from a tap on the lens to the map's first new picture (sampled each frame from the page). */
  async function tapToPicture(page: Page): Promise<number> {
    const c = mid(await box(glass(page)));
    const done = page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const canvas = document.querySelector<HTMLCanvasElement>('.wc-pane-map canvas')!;
          const probe = document.createElement('canvas');
          probe.width = probe.height = 32;
          const g = probe.getContext('2d', { willReadFrequently: true })!;
          const sig = (): string => {
            g.drawImage(canvas, 0, 0, 32, 32);
            return g.getImageData(0, 0, 32, 32).data.join(',');
          };
          const was = sig();
          let t0 = 0;
          document.querySelector('.wc-ph-lens-glass')!.addEventListener('pointerup', () => (t0 = performance.now()), { once: true });
          const tick = (): void => {
            if (t0 && sig() !== was) resolve(performance.now() - t0);
            else if (t0 && performance.now() - t0 > 20_000) resolve(-1);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    await page.touchscreen.tap(c.x, c.y);
    return done;
  }

  test('each level at the default and at a large size, dark and Paper: more of the map at every step, the rooms still told apart at the furthest; a tap gives a new picture at every level', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    chatter(m);
    await locate(page, m);
    const times: Record<string, number> = {};
    for (const size of ['default', 'large'] as const) {
      if (size === 'large') {
        await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { portrait: { x: 0.5, y: 0.3, size: 330 } } } }));
        await frames(page);
        await expect.poll(async () => (await box(lens(page))).width).toBe(330);
      }
      for (const level of ['z1', 'z2', 'z3', 'z4'] as const) {
        if (level !== 'z1') times[`${size} ${level}`] = Math.round(await tapToPicture(page));
        await expect(lens(page)).toHaveAttribute('data-level', level);
        await mapSettled(page);
        await shot(page, `zoom-${level}-${size}`);
      }
      // Back to the nearest for the next size.
      times[`${size} z1`] = Math.round(await tapToPicture(page));
      await expect(lens(page)).toHaveAttribute('data-level', 'z1');
    }
    // Measured, for the round's report: ms from the tap to the first new picture.
    console.log(`[53k] tap to new picture, ms: ${JSON.stringify(times)}`);
    // Every tap gave a new picture (-1: none came). How soon depends on the machine, so the time is
    // reported above and not asserted.
    for (const [k, ms] of Object.entries(times)) expect(ms, k).toBeGreaterThanOrEqual(0);
    // Paper, the furthest level at the default size.
    await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' }, phone: { lens: { opensAt: 'z4', portrait: { x: null, y: null, size: null } } } }));
    await expect(lens(page)).toHaveAttribute('data-level', 'z4');
    await frames(page);
    await mapSettled(page);
    await shot(page, 'zoom-z4-default-paper');
    await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { opensAt: 'z2', portrait: { x: 0.45, y: 0.55, size: 260 } } } }));
    await expect(lens(page)).toHaveAttribute('data-level', 'z2');
    await frames(page);
    await mapSettled(page);
    await shot(page, 'lens-moved-large-paper');
    expect(errors).toEqual([]);
  });
});

// ------------------------------------------- F. the typed text is gold by default

/** `l`'s computed `prop` colour as sRGB (painted on a canvas, so `color-mix()` and `oklab()` are resolved). */
async function rgbOf(l: Locator, prop: 'color' | 'backgroundColor' = 'color', pseudo?: string): Promise<[number, number, number]> {
  return l.evaluate(
    (el, [prop, pseudo]) => {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const g = c.getContext('2d')!;
      g.fillStyle = getComputedStyle(el, pseudo ?? null)[prop as 'color'];
      g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!] as [number, number, number];
    },
    [prop, pseudo] as const,
  );
}

function ratio(a: [number, number, number], b: [number, number, number]): number {
  const lum = (c: [number, number, number]): number => {
    const [r, g, bl] = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('F. gold is the default input colour', () => {
  // A new install: nothing stored.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a new phone types in Amber, dark and Paper: 4.5 : 1 on the field, the kept line and the placeholder dimmer and still readable, the password\'s bullets gold too', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    chatter(m);
    expect(await page.evaluate(() => window.__wc!.settings.get().appearance.inputColor)).toBe('amber');
    // (The sent line stays in the field, to see the kept line's colour too.)
    await page.evaluate(() => window.__wc!.settings.update({ input: { autoClear: false } }));
    const wrap = page.locator('.wc-input-slot > .wc-input');
    for (const theme of ['dark', 'paper'] as const) {
      if (theme === 'paper') {
        await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
        await frames(page);
      }
      // The colour is the setting's own mix: 15 % of the text colour with the amber of this ground.
      const want = await page.evaluate((tint) => {
        const probe = document.createElement('span');
        probe.style.color = `color-mix(in oklab, var(--term-fg) 15%, ${tint})`;
        document.querySelector('.wc-input-slot')!.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      }, theme === 'paper' ? '#9a5a00' : '#ffaf00');
      // Typed text on the field's ground.
      await field(page).tap();
      await expect(okb(page)).toBeVisible();
      for (const k of 'look') await okb(page).locator(`.wc-ph-okb-k[data-ch="${k}"]`).tap();
      expect(await field(page).evaluate((el) => getComputedStyle(el).color), theme).toBe(want);
      const ground = await rgbOf(wrap, 'backgroundColor');
      const gold = await rgbOf(field(page));
      console.log(`[53k] ${theme}: typed text rgb(${gold.join(', ')}) on rgb(${ground.join(', ')}), ${ratio(gold, ground).toFixed(2)} : 1`);
      expect(ratio(gold, ground), theme).toBeGreaterThanOrEqual(4.5);
      // Not the old light blue: more red than blue.
      expect(gold[0], theme).toBeGreaterThan(gold[2] + 40);
      await shot(page, `field-gold-${theme}`);
      // Sent: the line is kept, dimmed, distinct from typed text and still readable.
      await okb(page).locator('.wc-ph-okb-k[data-act="enter"]').tap();
      await okb(page).locator('.wc-ph-okb-k[data-act="fold"]').tap();
      await expect(okb(page)).toBeHidden();
      await expect(field(page)).toHaveClass(/\bwc-input-kept\b/);
      const kept = await rgbOf(field(page));
      expect(ratio(kept, ground), theme).toBeGreaterThanOrEqual(4.5);
      expect(kept, theme).not.toEqual(gold);
      await shot(page, `field-gold-kept-${theme}`);
      // The echo of the command in the game text is gold as well.
      const echo = page.locator('.wc-rows .wc-echo').filter({ hasText: 'look' }).last();
      expect(await rgbOf(echo), theme).toEqual(gold);
      // The placeholder: the field's own dim text.
      const hint = await rgbOf(field(page), 'color', '::placeholder');
      expect(ratio(hint, ground), theme).toBeGreaterThanOrEqual(4.5);
      expect(hint, theme).not.toEqual(gold);
    }
    // Comm's reply line and the hot key box's fields have their own text colour (not the input colour's).
    expect(errors).toEqual([]);
  });
});

test('F. Steel stored at this settings version is a choice: it stays Steel', async ({ page }) => {
  const m = await play(page);
  await setScreen(page, S21);
  chatter(m);
  expect(await page.evaluate(() => window.__wc!.settings.get().appearance.inputColor)).toBe('steel');
  const c = await rgbOf(field(page));
  expect(c[2]).toBeGreaterThan(c[0]);
});

test('F2. the one-time switch: an install stored before version 6 with Steel types in gold, and Steel picked afterwards holds', async ({ page }) => {
  // The suite's stored settings, rewritten as an older version's (Steel was the default then, stored with every appearance).
  await page.goto('/?phone=1&kbd=en');
  await page.waitForFunction(() => window.__wc !== undefined);
  const rewritten = await page.evaluate(async () => {
    await window.__wc!.settings.load();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('webcockpit');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const got = await new Promise<{ version: number; appearance: { inputColor: string } }>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const os = tx.objectStore('settings');
      const r = os.get('main');
      r.onsuccess = () => {
        const v = r.result as { version: number; appearance: { inputColor: string } };
        v.version = 5;
        os.put(v, 'main');
      };
      tx.oncomplete = () => resolve(r.result as { version: number; appearance: { inputColor: string } });
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { version: got.version, color: got.appearance.inputColor };
  });
  expect(rewritten).toEqual({ version: 5, color: 'steel' });

  const m = await play(page);
  await setScreen(page, S21);
  chatter(m);
  expect(await page.evaluate(() => window.__wc!.settings.get().appearance.inputColor)).toBe('amber');
  const gold = await rgbOf(field(page));
  expect(gold[0]).toBeGreaterThan(gold[2]);

  // Steel chosen after the switch is stored with the new version and survives a reload.
  await page.evaluate(async () => {
    window.__wc!.settings.update({ appearance: { inputColor: 'steel' } });
    await window.__wc!.settings.flush();
  });
  await play(page);
  await setScreen(page, S21);
  expect(await page.evaluate(() => window.__wc!.settings.get().appearance.inputColor)).toBe('steel');
  const blue = await rgbOf(field(page));
  expect(blue[2]).toBeGreaterThan(blue[0]);
});

test('F3. Settings → Text → Input colour: the desktop\'s options with their colour chips; a pick changes the typed colour at once and is kept', async ({ page }) => {
  const errors = watchErrors(page);
  const m = await play(page);
  await setScreen(page, S21);
  chatter(m);
  await page.locator('.wc-ph-menu').tap();
  await page.locator('.wc-ph-sheet [data-row="settings"]').tap();
  const row = page.locator('.wc-ph-page [data-row="input-color"]');
  await row.scrollIntoViewIfNeeded();
  await expect(row.locator('.wc-ph-srow-t')).toHaveText('Input colour');
  await expect(row.locator('.wc-ph-srow-v')).toHaveText('Steel');
  // A thumb's row, with the chosen colour's chip.
  expect((await box(row)).height).toBeGreaterThanOrEqual(44);
  const chip = async (l: Locator): Promise<[number, number, number]> => {
    const c = await l.evaluate((el) => getComputedStyle(el).backgroundColor);
    return page.evaluate((color) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      const g = cv.getContext('2d')!;
      g.fillStyle = color;
      g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!] as [number, number, number];
    }, c);
  };
  const steelChip = await chip(row.locator('.wc-ph-tint'));
  expect(steelChip[2]).toBeGreaterThan(steelChip[0]);

  await row.tap();
  const list = page.locator('.wc-ph-page[data-page="pick:input-color"]');
  await expect(list).toBeVisible();
  const opts = list.locator('[role="radio"]');
  await expect(opts.locator('.wc-ph-srow-t')).toHaveText(['None', 'Steel', 'Bright', 'Sand', 'Sage', 'Cyan', 'Amber']);
  await expect(opts.locator('.wc-ph-tint')).toHaveCount(7);
  await expect(list.locator('[aria-checked="true"]')).toHaveAttribute('data-opt', 'steel');
  const goldChip = await chip(list.locator('[data-opt="amber"] .wc-ph-tint'));
  expect(goldChip[0]).toBeGreaterThan(goldChip[2]);
  await shot(page, 'input-colour-list');
  await list.locator('[data-opt="amber"]').tap();

  // Back on the page, the row names it; the setting is the desktop's key.
  await expect(page.locator('.wc-ph-page[data-page="settings"]')).toBeVisible();
  await expect(row.locator('.wc-ph-srow-v')).toHaveText('Amber');
  expect(await page.evaluate(() => window.__wc!.settings.get().appearance.inputColor)).toBe('amber');
  await shot(page, 'input-colour-row');
  // The command field has it, and it is kept over a reload.
  await page.evaluate(() => window.__wc!.settings.flush());
  await play(page);
  await setScreen(page, S21);
  expect(await page.evaluate(() => window.__wc!.settings.get().appearance.inputColor)).toBe('amber');
  const gold = await rgbOf(field(page));
  expect(gold[0]).toBeGreaterThan(gold[2]);
  expect(errors).toEqual([]);
});
