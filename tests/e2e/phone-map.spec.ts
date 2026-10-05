// Stage 19 round 2 (ADR 0075 §3.3): the map on a phone. The MAP tab is
// hidden while another tab is selected, yet the map keeps tracking the
// player and shows the current room centred when its tab comes back; a
// two-finger pinch zooms around the midpoint, a two-finger drag pans.
// `?replay&phone=1` on the `phone` project (Pixel 7), walking
// tests/fixtures/map-demo.log (Bree to Hill Road, room 26971).
import { type Page, expect, test } from '@playwright/test';

const LAST_ROOM = '26971';

const tab = (page: Page, id: string) => page.locator(`.wc-phone-tab[data-tab="${id}"]`);
const content = (page: Page) => page.locator('.wc-pane-map .wc-pane-content');

async function openCockpit(page: Page): Promise<void> {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  await expect(tab(page, 'map')).toBeVisible();
}

async function walk(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const text = await (await fetch('/__fixtures/map-demo.log')).text();
    window.__wc!.app.startReplay(text, 'map-demo.log', 0);
  });
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1, { timeout: 15_000 });
}

/** The yellow player square lies around the canvas centre (map-render.spec.ts). */
async function playerCentred(page: Page): Promise<boolean> {
  const shot = await page.locator('.wc-pane-map canvas').screenshot();
  return page.evaluate(async (png) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let yellow = 0;
    const cx = Math.round(img.width / 2);
    const cy = Math.round(img.height / 2);
    for (let dy = -40; dy <= 40; dy++) {
      for (let dx = -40; dx <= 40; dx++) {
        const i = ((cy + dy) * img.width + (cx + dx)) * 4;
        if (d[i]! > 200 && d[i + 1]! > 200 && d[i + 2]! < 80) yellow++;
      }
    }
    return yellow > 20;
  }, shot.toString('base64'));
}

test('moves made on the GAME tab: MAP shows the current room, centred', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openCockpit(page);
  await tab(page, 'map').tap();
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await tab(page, 'game').tap();
  await expect(page.locator('.wc-pane-map')).toBeHidden();
  await walk(page);
  await tab(page, 'map').tap();
  await expect(content(page)).toHaveAttribute('data-map-room', LAST_ROOM, { timeout: 10_000 });
  await expect(content(page)).toHaveAttribute('data-map-located', '1');
  await expect.poll(() => playerCentred(page), { timeout: 15_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('the MAP tab opened first after the moves: the map finds the current room', async ({ page }) => {
  test.setTimeout(60_000);
  await openCockpit(page);
  await walk(page);
  await tab(page, 'map').tap();
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await expect(content(page)).toHaveAttribute('data-map-room', LAST_ROOM, { timeout: 10_000 });
  await expect(content(page)).toHaveAttribute('data-map-located', '1');
  await expect.poll(() => playerCentred(page), { timeout: 15_000 }).toBe(true);
});

test('moves made on the MAP tab: the map follows', async ({ page }) => {
  test.setTimeout(60_000);
  await openCockpit(page);
  await tab(page, 'map').tap();
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await walk(page);
  await expect(content(page)).toHaveAttribute('data-map-room', LAST_ROOM, { timeout: 10_000 });
  await expect.poll(() => playerCentred(page), { timeout: 15_000 }).toBe(true);
});

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
  const box = (await page.locator('.wc-pane-map canvas').boundingBox())!;
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
  const box = (await page.locator('.wc-pane-map canvas').boundingBox())!;
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
