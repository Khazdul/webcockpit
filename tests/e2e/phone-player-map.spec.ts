// ADR 0075 §3.3 on the run log player (stage 51 rule 2, ADR 0136 §1): the
// player keeps the phone's tab strip, and with it the MAP tab and its touch
// gestures: a two-finger pinch zooms around the midpoint, a two-finger drag
// and a one-finger drag pan, a long press shows the hover box with the
// room's name. These cases ran against the live game's MAP tab until stage
// 51a (phone-map.spec.ts), where the map is now the lens (no pan, no pinch,
// no hover). The player is opened on tests/fixtures/map-demo.log (Bree to
// Hill Road, room 26971) from the start page, on the `phone` project.
import { type Page, expect, test } from '@playwright/test';

const LAST_ROOM = '26971';

const player = (page: Page) => page.locator('.wc-player');
const tab = (page: Page, id: string) => player(page).locator(`.wc-phone-tab[data-tab="${id}"]`);
const content = (page: Page) => player(page).locator('.wc-pane-map .wc-pane-content');
const canvas = (page: Page) => player(page).locator('.wc-pane-map canvas');

/** The player on the walk, the map pane on, played to its end. */
async function openCockpit(page: Page): Promise<void> {
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  await page.evaluate(() => window.__wc!.openPlayerLogs(['map-demo.log'], 'Walker'));
  await expect(player(page).locator('.wc-phone-tabs')).toBeVisible();
  await expect(tab(page, 'map')).toBeVisible();
  // The live game's lens is not the player's.
  await expect(page.locator('.wc-cockpit[data-phone-game]')).toHaveCount(0);
  await expect(player(page).locator('.wc-ph-lens')).toHaveCount(0);
}

/** Plays the walk to its end (the player runs in real time: jump forward). */
async function walk(page: Page): Promise<void> {
  const forward = page.locator('.wc-player-chrome [aria-label^="Forward 10 s"]').first();
  for (let i = 0; i < 12; i++) await forward.tap();
}

type Sent = { t: string; dx?: number; dy?: number; steps?: number; x?: number; y?: number };

test('pinch zooms around the midpoint, a two-finger drag pans, a one-finger drag pans', async ({ page }) => {
  test.setTimeout(60_000);
  // Record the pane's pan/zoom messages to the worker.
  await page.addInitScript(() => {
    const sent: unknown[] = [];
    (window as unknown as { __mapSent: unknown[] }).__mapSent = sent;
    const orig = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, m: unknown, ...rest: unknown[]) {
      const t = (m as { t?: string } | null)?.t;
      if (t === 'pan' || t === 'zoom') sent.push(m);
      return (orig as (...a: unknown[]) => void).call(this, m, ...rest);
    } as typeof orig;
  });
  await openCockpit(page);
  await tab(page, 'map').tap();
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  const box = (await canvas(page).boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const sent = () => page.evaluate(() => (window as unknown as { __mapSent: Sent[] }).__mapSent.splice(0));
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  // Spread two fingers from 40 px to 160 px apart around the centre: zoom in about 4×.
  await sent();
  await touch('touchStart', [{ x: cx - 20, y: cy }, { x: cx + 20, y: cy }]);
  for (let i = 1; i <= 6; i++) {
    const d = 20 + i * 10;
    await touch('touchMove', [{ x: cx - d, y: cy }, { x: cx + d, y: cy }]);
  }
  await touch('touchEnd', []);
  await settle();
  let m = await sent();
  const steps = m.filter((x) => x.t === 'zoom').reduce((s, x) => s + x.steps!, 0);
  expect(steps).toBeCloseTo(Math.log(4) / Math.log(1.175), 1);
  const z = m.filter((x) => x.t === 'zoom').at(-1)!;
  expect(Math.abs(z.x! - box.width / 2)).toBeLessThan(2);
  expect(Math.abs(z.y! - box.height / 2)).toBeLessThan(2);
  const pinchPan = m.filter((x) => x.t === 'pan').reduce((s, x) => s + Math.abs(x.dx!) + Math.abs(x.dy!), 0);
  expect(pinchPan).toBeLessThan(2);

  // Two fingers moved together 50 px down: a pan, no zoom.
  await touch('touchStart', [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: cx - 30, y: cy + i * 10 }, { x: cx + 30, y: cy + i * 10 }]);
  await touch('touchEnd', []);
  await settle();
  m = await sent();
  expect(m.filter((x) => x.t === 'zoom')).toHaveLength(0);
  expect(m.filter((x) => x.t === 'pan').reduce((s, x) => s + x.dy!, 0)).toBeCloseTo(50, 0);

  // One finger: a pan, as with the mouse.
  await touch('touchStart', [{ x: cx, y: cy }]);
  for (let i = 1; i <= 4; i++) await touch('touchMove', [{ x: cx + i * 10, y: cy }]);
  await touch('touchEnd', []);
  await settle();
  m = await sent();
  expect(m.filter((x) => x.t === 'zoom')).toHaveLength(0);
  expect(m.filter((x) => x.t === 'pan').reduce((s, x) => s + x.dx!, 0)).toBeCloseTo(40, 0);
});

test('a long press shows the hover box with the room name; the next tap hides it (ADR 0077)', async ({ page }) => {
  await openCockpit(page);
  await walk(page);
  await tab(page, 'map').tap();
  await expect(content(page)).toHaveAttribute('data-map-room', LAST_ROOM, { timeout: 15_000 });
  const box = (await canvas(page).boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchEnd', pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  // The box lives in the cockpit (fixed), beside the finger and inside the viewport.
  const hover = page.locator('.wc-map-hover');
  // A short tap shows nothing.
  await touch('touchStart', [{ x: cx, y: cy }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(800);
  await expect(hover).toHaveCount(0);
  // A long press does.
  await touch('touchStart', [{ x: cx, y: cy }]);
  await page.waitForTimeout(900);
  await touch('touchEnd', []);
  await expect(hover).toBeVisible();
  await expect(hover.locator('.wc-map-hover-name')).toHaveText('Hill Road');
  const hb = (await hover.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(hb.x).toBeGreaterThanOrEqual(0);
  expect(hb.y).toBeGreaterThanOrEqual(0);
  expect(hb.x + hb.width).toBeLessThanOrEqual(vp.width);
  expect(hb.y + hb.height).toBeLessThanOrEqual(vp.height);
  await touch('touchStart', [{ x: cx + 30, y: cy + 30 }]);
  await touch('touchEnd', []);
  await expect(hover).toBeHidden();
});
