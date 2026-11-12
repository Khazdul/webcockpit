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
  await expect.poll(async () => (await box(page.locator('#app'))).height).toBe(size.height);
  await expect.poll(async () => (await layout(page)).landscape).toBe(size.width > size.height);
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

// ------------------------------------------------------------------ C. the lens

test.describe('C. the lens is moved and resized by touch', () => {
  test('a drag moves the lens with its keys, stores the place, steps no zoom and scrolls nothing; no layout and no window size while the finger is down', async ({ page }) => {
    const errors = watchErrors(page);
    const m = await play(page);
    await setScreen(page, S21);
    chatter(m, 80);
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
    await shot(page, 'lens-moved');
    expect(errors).toEqual([]);
  });
});
