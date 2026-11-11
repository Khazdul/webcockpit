// Stage 51c (ADR 0136 §4): the map on a phone is the round lens of the
// live game's layout: the cockpit's one map pane, borderless in a square
// of whole cells and clipped to a circle, dressed by the phone layer. It
// follows the player from the first room; a tap steps three fixed zoom
// levels; no pan, no pinch, no hover box; Shimrod on black whatever the
// Mapper settings say, which are never written; the fullscreen key only
// where the browser can; the Map lens settings.
//
// (Until stage 51a this spec covered the MAP tab of the tab strip, ADR
// 0075 §3.3: tracking while hidden, pinch and pan, the long-press hover
// box. The tab is gone from the live game; tracking from the first room is
// asserted on the lens, and pinch, pan and hover are asserted absent.)
//
// `?replay&phone=1` on the `phone` project (Pixel 7), walking
// tests/fixtures/map-demo.log (Bree to Hill Road, room 26971).
import { type Page, expect, test } from '@playwright/test';

const LAST_ROOM = '26971';

const pane = (page: Page) => page.locator('.wc-pane-map');
const content = (page: Page) => page.locator('.wc-pane-map .wc-pane-content');
const lens = (page: Page) => page.locator('.wc-ph-lens');
const glass = (page: Page) => page.locator('.wc-ph-lens-glass');
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const inputFocused = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains('wc-input-field') ?? false);

type Sent = { t: string; zoom?: number; steps?: number; dx?: number; dy?: number };

/** Records the pane's view messages to the map worker (before the page loads). */
async function recordWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sent: unknown[] = [];
    (window as unknown as { __mapSent: unknown[] }).__mapSent = sent;
    const orig = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, m: unknown, ...rest: unknown[]) {
      const t = (m as { t?: string } | null)?.t;
      if (t === 'pan' || t === 'zoom' || t === 'zoomTo' || t === 'roomAt' || t === 'init' || t === 'assets' || t === 'background') sent.push(JSON.parse(JSON.stringify(m)));
      // Batches of game events are only counted.
      if (t === 'events') sent.push({ t: 'events' });
      return (orig as (...a: unknown[]) => void).call(this, m, ...rest);
    } as typeof orig;
  });
}
const sent = (page: Page) => page.evaluate(() => (window as unknown as { __mapSent: Sent[] }).__mapSent.slice());

async function openCockpit(page: Page, query = ''): Promise<void> {
  await page.goto(`/?replay&phone=1${query}`);
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
}

async function walk(page: Page): Promise<void> {
  const before = await page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' }).count();
  await page.evaluate(async () => {
    const text = await (await fetch('/__fixtures/map-demo.log')).text();
    window.__wc!.app.startReplay(text, 'map-demo.log', 0);
  });
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(before + 1, { timeout: 15_000 });
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
    const r = Math.round(Math.min(img.width, img.height) / 3);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const i = ((cy + dy) * img.width + (cx + dx)) * 4;
        if (d[i]! > 200 && d[i + 1]! > 200 && d[i + 2]! < 80) yellow++;
      }
    }
    return yellow > 20;
  }, shot.toString('base64'));
}

test('the lens: the one map pane, borderless, clipped to a 150 px circle at the top right, dressed by the phone layer', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openCockpit(page);
  await expect(pane(page)).toBeVisible();
  await expect(lens(page)).toBeVisible();
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  // One map pane, one canvas, in the cockpit (nothing re-parented), no frame.
  await expect(page.locator('.wc-pane-map')).toHaveCount(1);
  await expect(page.locator('.wc-cockpit > .wc-pane-map canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(pane(page)).not.toHaveAttribute('data-framed', '');
  // The pane is whole cells holding the circle; it is clipped to the circle.
  const cell = await page.evaluate(() => window.__wc!.cells.get());
  const p = (await pane(page).boundingBox())!;
  const l = (await lens(page).boundingBox())!;
  expect(l.width).toBeCloseTo(150, 0);
  expect(l.height).toBeCloseTo(150, 0);
  expect(p.width / cell.w).toBeCloseTo(Math.ceil(150 / cell.w), 1);
  expect(p.height / cell.h).toBeCloseTo(Math.ceil(150 / cell.h), 1);
  expect(p.width).toBeGreaterThanOrEqual(150);
  expect(p.height).toBeGreaterThanOrEqual(150);
  // The dressing is centred on the pane.
  expect(l.x + l.width / 2).toBeCloseTo(p.x + p.width / 2, 0);
  expect(l.y + l.height / 2).toBeCloseTo(p.y + p.height / 2, 0);
  expect(await pane(page).evaluate((el) => getComputedStyle(el).clipPath)).toBe('circle(75px at 50% 50%)');
  // The corners of the lens's square are outside the circle: the game text there takes the tap
  // (neither the map pane nor any part of the lens does), and a tap there steps no zoom.
  for (const [x, y] of [
    [l.x + 4, l.y + l.height - 4],
    [p.x + 3, p.y + p.height - 3],
  ]) {
    const hit = await page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px!, py!);
      return el !== null && el.closest('.wc-pane-map, .wc-ph-lens, .wc-ph-lens-glass, .wc-ph-sat') === null && el.closest('.wc-game') !== null;
    }, [x, y]);
    expect(hit, `${x},${y}`).toBe(true);
  }
  await page.touchscreen.tap(l.x + 4, l.y + l.height - 4);
  await expect(lens(page)).toHaveAttribute('data-level', 'middle');
  // The glass itself is the lens's.
  expect(
    await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest('.wc-ph-lens-glass') !== null, [l.x + l.width / 2, l.y + l.height / 2]),
  ).toBe(true);
  // At the top right, under the top edge (not fighting).
  const c = (await page.locator('.wc-cockpit').boundingBox())!;
  expect(c.x + c.width - (l.x + l.width)).toBeGreaterThanOrEqual(8);
  expect(c.x + c.width - (l.x + l.width)).toBeLessThan(8 + 2 * cell.w + 12);
  expect(l.y - c.y).toBeGreaterThanOrEqual(10);
  expect(l.y - c.y).toBeLessThan(16 + cell.h + 4);
  // Ring, glass, reflection and three pips; the middle one lit.
  await expect(lens(page).locator('.wc-ph-lens-ring, .wc-ph-lens-shine, .wc-ph-lens-refl')).toHaveCount(3);
  await expect(lens(page).locator('.wc-ph-lens-pips > i')).toHaveCount(3);
  await expect(lens(page).locator('.wc-ph-lens-pips > i.is-on')).toHaveAttribute('data-level', 'middle');
  const ring = (await lens(page).locator('.wc-ph-lens-ring').boundingBox())!;
  expect(ring.width).toBeCloseTo(166, 0);
  // Static paint only: nothing in the dressing animates or filters.
  const live = await lens(page).evaluate((el) =>
    [el, ...el.querySelectorAll('*')].filter((n) => {
      const s = getComputedStyle(n as Element);
      return s.filter !== 'none' || s.backdropFilter !== 'none' || s.animationName !== 'none' || (n as Element).getAnimations().length > 0;
    }).length,
  );
  expect(live).toBe(0);
  expect(errors).toEqual([]);
});

test('the lens moves down under the fight card and back', async ({ page }) => {
  await openCockpit(page);
  await expect(lens(page)).toBeVisible();
  const cell = await page.evaluate(() => window.__wc!.cells.get());
  const up = (await lens(page).boundingBox())!;
  await page.evaluate(async () => {
    const text = await (await fetch('/__fixtures/gmcp-demo.log')).text();
    const lines = text.split('\n');
    window.__wc!.app.startReplay(lines.slice(0, lines.findIndex((l) => l.includes('Group.Update {"id":3,"hp":61}'))).join('\n') + '\n', 'gmcp-demo.log', 0);
  });
  await expect(page.locator('.wc-ph-fight')).toBeVisible();
  await expect.poll(async () => (await lens(page).boundingBox())!.y).toBeCloseTo(up.y + 2 * cell.h, 0);
  const card = (await page.locator('.wc-ph-fight').boundingBox())!;
  const down = (await lens(page).boundingBox())!;
  expect(down.y).toBeGreaterThanOrEqual(card.y + card.height + 10);
  expect(down.x).toBeCloseTo(up.x, 0);
  const p = (await pane(page).boundingBox())!;
  expect(down.y + down.height / 2).toBeCloseTo(p.y + p.height / 2, 0);
});

test('the lens follows the player from the first room, centred, with the map opened before the moves', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openCockpit(page);
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await walk(page);
  await expect(content(page)).toHaveAttribute('data-map-room', LAST_ROOM, { timeout: 10_000 });
  await expect(content(page)).toHaveAttribute('data-map-located', '1');
  await expect.poll(() => playerCentred(page), { timeout: 15_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('moves made before the map has loaded: the lens finds the current room', async ({ page }) => {
  test.setTimeout(60_000);
  // The lens off while walking: no map pane, no map load.
  await page.addInitScript(() => {
    (window as unknown as { __workers: number }).__workers = 0;
    const W = Worker;
    (window as unknown as { Worker: unknown }).Worker = class extends W {
      constructor(...a: ConstructorParameters<typeof Worker>) {
        super(...a);
        (window as unknown as { __workers: number }).__workers++;
      }
    };
  });
  // The setting is off before the game opens (set on the start page).
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { show: false } } }));
  await page.routeWebSocket('wss://mume.org/ws-play/', () => {});
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await expect(pane(page)).toBeHidden();
  await walk(page);
  await expect(content(page)).toHaveAttribute('data-map-state', 'idle');
  expect(await page.evaluate(() => (window as unknown as { __workers: number }).__workers)).toBe(0);
  // Turned on mid-session: it loads and shows where the player is.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { show: true } } }));
  await expect(lens(page)).toBeVisible();
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await expect(content(page)).toHaveAttribute('data-map-room', LAST_ROOM, { timeout: 10_000 });
  await expect(content(page)).toHaveAttribute('data-map-located', '1');
  await expect.poll(() => playerCentred(page), { timeout: 15_000 }).toBe(true);
  // One worker: the one map.
  expect(await page.evaluate(() => (window as unknown as { __workers: number }).__workers)).toBe(1);
});

test('a tap steps the zoom near → middle → far → near, shown by the pips; it never focuses the field', async ({ page }) => {
  test.setTimeout(60_000);
  await recordWorker(page);
  await openCockpit(page);
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  const zooms = async (): Promise<number[]> => (await sent(page)).filter((m) => m.t === 'zoomTo').map((m) => m.zoom!);
  const on = lens(page).locator('.wc-ph-lens-pips > i.is-on');
  // Opens at the middle: about 5 rooms across 150 px (44 px a room at zoom 1).
  await expect(lens(page)).toHaveAttribute('data-level', 'middle');
  await expect(glass(page)).toHaveAttribute('aria-label', 'Map, middle zoom. Tap to zoom');
  expect((await zooms()).at(-1)).toBeCloseTo(150 / (5 * 44), 4);
  await glass(page).tap();
  await expect(lens(page)).toHaveAttribute('data-level', 'far');
  await expect(on).toHaveAttribute('data-level', 'far');
  await expect.poll(async () => (await zooms()).at(-1)).toBeCloseTo(150 / (10 * 44), 4);
  await glass(page).tap();
  await expect(on).toHaveAttribute('data-level', 'near');
  await expect(glass(page)).toHaveAttribute('aria-label', 'Map, near zoom. Tap to zoom');
  await expect.poll(async () => (await zooms()).at(-1)).toBeCloseTo(150 / (3 * 44), 4);
  await glass(page).tap();
  await expect(on).toHaveAttribute('data-level', 'middle');
  await expect.poll(async () => (await zooms()).at(-1)).toBeCloseTo(150 / (5 * 44), 4);
  await expect(on).toHaveCount(1);
  expect(await inputFocused(page)).toBe(false);
  await expect(page.locator('html')).not.toHaveClass(/\bwc-kbd\b/);
  // The zoom really changes what is drawn: far shows more rooms than near.
  await walk(page);
  await expect(content(page)).toHaveAttribute('data-map-located', '1', { timeout: 10_000 });
  await expect.poll(() => playerCentred(page), { timeout: 15_000 }).toBe(true);
  const shotAt = async (): Promise<string> => (await page.locator('.wc-pane-map canvas').screenshot()).toString('base64');
  const middle = await shotAt();
  await glass(page).tap();
  await expect(lens(page)).toHaveAttribute('data-level', 'far');
  await expect.poll(async () => (await shotAt()) !== middle, { timeout: 10_000 }).toBe(true);
  // The player stays in the middle at every level.
  await expect.poll(() => playerCentred(page), { timeout: 15_000 }).toBe(true);
});

test('no pan, no pinch, no wheel zoom, no hover box: only the tap', async ({ page }) => {
  test.setTimeout(60_000);
  await recordWorker(page);
  await openCockpit(page);
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await walk(page);
  await expect(content(page)).toHaveAttribute('data-map-room', LAST_ROOM, { timeout: 10_000 });
  const box = (await lens(page).boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(lens(page)).toHaveAttribute('data-level', 'middle');
  const views = async (): Promise<Sent[]> => (await sent(page)).filter((x) => x.t === 'pan' || x.t === 'zoom' || x.t === 'zoomTo' || x.t === 'roomAt');
  const before = await views();
  // A pinch: two fingers spread.
  await touch('touchStart', [{ x: cx - 20, y: cy }, { x: cx + 20, y: cy }]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: cx - 20 - i * 8, y: cy }, { x: cx + 20 + i * 8, y: cy }]);
  await touch('touchEnd', []);
  // A one-finger drag.
  await touch('touchStart', [{ x: cx, y: cy }]);
  for (let i = 1; i <= 4; i++) await touch('touchMove', [{ x: cx + i * 10, y: cy + i * 5 }]);
  await touch('touchEnd', []);
  // A wheel over it (a mouse on a phone-size screen).
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -300);
  await settle();
  // Pinch, drag and wheel on the lens: nothing went to the worker, and the level did not step.
  expect(await views()).toEqual(before);
  await expect(lens(page)).toHaveAttribute('data-level', 'middle');
  // The same gestures straight on the map's canvas (the glass normally covers it): the pane itself refuses them.
  await page.locator('.wc-pane-map canvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    const at = (type: string, x: number, y: number, id: number): void => {
      c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, pointerId: id, pointerType: 'touch', isPrimary: id === 1, button: 0, buttons: 1 }));
    };
    at('pointerdown', 60, 60, 1);
    at('pointermove', 90, 80, 1);
    at('pointerup', 90, 80, 1);
    at('pointerdown', 50, 70, 1);
    at('pointerdown', 90, 70, 2);
    at('pointermove', 30, 70, 1);
    at('pointermove', 120, 70, 2);
    at('pointerup', 30, 70, 1);
    at('pointerup', 120, 70, 2);
    c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -240, clientX: r.left + 70, clientY: r.top + 70 }));
    at('pointerdown', 70, 70, 3);
  });
  await page.waitForTimeout(800);
  await page.locator('.wc-pane-map canvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + 70, clientY: r.top + 70, pointerId: 3, pointerType: 'touch' }));
  });
  await settle();
  // Nothing went to the worker: no pan, no relative zoom, no room question, and no new absolute zoom.
  expect(await views()).toEqual(before);
  expect(before.filter((x) => x.t !== 'zoomTo')).toEqual([]);
  await expect(page.locator('.wc-map-hover')).toHaveCount(0);
  // The level did not step, and the view is still on the player.
  await expect(lens(page)).toHaveAttribute('data-level', 'middle');
  await expect.poll(() => playerCentred(page), { timeout: 15_000 }).toBe(true);
  // A long press on the lens (longer than the hover box's 550 ms) shows no hover box and asks the
  // worker for no room; released without moving it is a tap like any other: one zoom step.
  await touch('touchStart', [{ x: cx + 5, y: cy + 5 }]);
  await page.waitForTimeout(1000);
  await touch('touchEnd', []);
  await settle();
  await expect(page.locator('.wc-map-hover')).toHaveCount(0);
  const after = await views();
  expect(after.filter((x) => x.t !== 'zoomTo')).toEqual([]);
  expect(after.length - before.length).toBeLessThanOrEqual(1);
  // The tap works after all that.
  const level = await lens(page).getAttribute('data-level');
  await glass(page).tap();
  await expect(lens(page)).not.toHaveAttribute('data-level', level!);
  expect((await views()).length).toBe(after.length + 1);
});

test('the lens off mid-session: no game events go to the map; on again it finds the player', async ({ page }) => {
  test.setTimeout(60_000);
  await recordWorker(page);
  await openCockpit(page);
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  const batches = async (): Promise<number> => (await sent(page)).filter((m) => m.t === 'events').length;
  // Shown: the walk is forwarded.
  await walk(page);
  await expect(content(page)).toHaveAttribute('data-map-room', LAST_ROOM, { timeout: 10_000 });
  expect(await batches()).toBeGreaterThan(0);
  // Off: the same walk again sends the worker nothing.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { show: false } } }));
  await expect(pane(page)).toBeHidden();
  const off = await batches();
  await walk(page);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  expect(await batches()).toBe(off);
  // On again: the last room is replayed, the lens shows the player.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { show: true } } }));
  await expect(lens(page)).toBeVisible();
  await expect.poll(batches).toBeGreaterThan(off);
  await expect(content(page)).toHaveAttribute('data-map-room', LAST_ROOM, { timeout: 10_000 });
  await expect(content(page)).toHaveAttribute('data-map-located', '1');
  await expect.poll(() => playerCentred(page), { timeout: 15_000 }).toBe(true);
});

test('a settings write that is not the lens\'s sends the map nothing and moves nothing', async ({ page }) => {
  test.setTimeout(60_000);
  await recordWorker(page);
  await openCockpit(page);
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  const zooms = async (): Promise<number> => (await sent(page)).filter((m) => m.t === 'zoomTo').length;
  const n = await zooms();
  const box = await lens(page).boundingBox();
  await page.evaluate(() => {
    const s = window.__wc!.settings;
    s.update({ input: { autoClear: !s.get().input.autoClear } });
    s.update({ group: { showPlayers: !s.get().group.showPlayers } });
    s.update({ phone: { lens: { size: s.get().phone.lens.size } } });
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await zooms()).toBe(n);
  expect(await lens(page).boundingBox()).toEqual(box);
  // The lens's own setting does: a new size, a new zoom for it.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { size: 's' } } }));
  await expect.poll(zooms).toBe(n + 1);
});

test('Shimrod on black whatever the Mapper settings say, and they are never written', async ({ page }) => {
  test.setTimeout(60_000);
  await recordWorker(page);
  // A computer's choices: another tileset, a coloured background, the hover box on, the map pane off.
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(() =>
    window.__wc!.settings.update({ mapper: { tileset: 'default', background: '#2e3436', hover: 'full' }, panes: { map: { on: false, border: true } } }),
  );
  const stored = () => page.evaluate(() => JSON.stringify([window.__wc!.settings.get().mapper, window.__wc!.settings.get().panes.map, window.__wc!.settings.get().layout]));
  const before = await stored();
  await page.routeWebSocket('wss://mume.org/ws-play/', () => {});
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(lens(page)).toBeVisible();
  await expect(content(page)).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  // Shimrod, by MUME's season; black, not transparent.
  await expect(content(page)).toHaveAttribute('data-map-tileset', /^shimrod-(spring|summer|autumn|winter)$/);
  await expect(content(page)).toHaveAttribute('data-map-bg', '#000000');
  await expect(content(page)).not.toHaveAttribute('data-map-transparent', '');
  const init = (await sent(page)).find((m) => m.t === 'init') as unknown as { background?: string; transparent?: boolean; assets?: { tileset?: { dir?: string } } };
  expect(init.background).toBe('#000000');
  expect(init.transparent ?? false).toBe(false);
  expect(JSON.stringify(init.assets)).toContain('shimrod-');
  // Stepping the zoom and changing the lens's own settings write nothing of the desktop's.
  await glass(page).tap();
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { size: 'l', opensAt: 'near' } } }));
  await expect.poll(async () => (await lens(page).boundingBox())!.width).toBeCloseTo(180, 0);
  expect(await stored()).toBe(before);
  // (An `assets` message so far is the alternating set following MUME's season, as the clock settles.)
  const looks = async (): Promise<number> => (await sent(page)).filter((m) => m.t === 'assets' || m.t === 'background').length;
  const sentBefore = await looks();
  // The Mapper settings change behind it (a settings file from a computer): the lens keeps its look.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { tileset: 'mmapper', background: 'transparent' } }));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(content(page)).toHaveAttribute('data-map-tileset', /^shimrod-/);
  await expect(content(page)).toHaveAttribute('data-map-bg', '#000000');
  expect(await looks()).toBe(sentBefore);
  expect((await sent(page)).filter((m) => m.t === 'background')).toEqual([]);
});

test('the fullscreen key sits on the lens\'s top right corner where the browser can; with the lens off it stays as a row', async ({ page }) => {
  await openCockpit(page);
  await expect(lens(page)).toBeVisible();
  const key = lens(page).locator('.wc-ph-sat[data-sat="fullscreen"]');
  await expect(key).toBeVisible();
  await expect(key).toHaveAttribute('aria-label', 'Fullscreen');
  // (The panes key and the Comm key came in stage 51d: phone-game-panes.spec.ts.)
  await expect(page.locator('.wc-ph-lens .wc-ph-sat')).toHaveCount(3);
  const l = (await lens(page).boundingBox())!;
  const k = (await key.boundingBox())!;
  expect(k.width).toBeCloseTo(40, 0);
  expect(k.height).toBeCloseTo(40, 0);
  expect(k.x + k.width - (l.x + l.width)).toBeCloseTo(10, 0);
  expect(l.y - k.y).toBeCloseTo(10, 0);
  // A tap asks for fullscreen (the page-level call), and does not focus the field or step the zoom.
  await page.evaluate(() => {
    (window as unknown as { __fs: number }).__fs = 0;
    document.documentElement.requestFullscreen = () => {
      (window as unknown as { __fs: number }).__fs++;
      return Promise.resolve();
    };
  });
  await key.tap();
  expect(await page.evaluate(() => (window as unknown as { __fs: number }).__fs)).toBe(1);
  await expect(lens(page)).toHaveAttribute('data-level', 'middle');
  expect(await inputFocused(page)).toBe(false);
  // The old fixed corner button is not shown in the game layout.
  await expect(page.locator('.wc-fs-btn')).toBeHidden();
  // The lens off: the key as a row at the top right; the map pane is gone.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { show: false } } }));
  await expect(lens(page)).toBeHidden();
  await expect(pane(page)).toBeHidden();
  const row = page.locator('.wc-ph-satrow');
  await expect(row).toBeVisible();
  await expect(row.locator('.wc-ph-sat')).toHaveCount(3);
  const c = (await page.locator('.wc-cockpit').boundingBox())!;
  const r = (await row.boundingBox())!;
  expect(c.x + c.width - (r.x + r.width)).toBeCloseTo(8, 0);
  expect(r.y - c.y).toBeCloseTo(8, 0);
  await row.locator('.wc-ph-sat[data-sat="fullscreen"]').tap();
  expect(await page.evaluate(() => (window as unknown as { __fs: number }).__fs)).toBe(2);
});

test('no fullscreen key where the browser cannot (iPhone): the lens alone, and no row when it is off', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true });
  });
  await openCockpit(page);
  await expect(lens(page)).toBeVisible();
  await expect(page.locator('.wc-ph-sat[data-sat="fullscreen"]')).toHaveCount(0);
  // The other two keys are there, on the lens and (the lens off) in the row.
  expect(await lens(page).locator('.wc-ph-sat').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.sat))).toEqual(['panes', 'comm']);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { show: false } } }));
  await expect(lens(page)).toBeHidden();
  await expect(page.locator('.wc-ph-satrow')).toBeVisible();
  await expect(page.locator('.wc-ph-satrow .wc-ph-sat')).toHaveCount(2);
});

test('the Map lens settings: show, size and opens at, from the settings page; kept over a reload', async ({ page }) => {
  test.setTimeout(60_000);
  await recordWorker(page);
  await openCockpit(page);
  await expect(lens(page)).toBeVisible();
  const openSettings = async (): Promise<void> => {
    await page.locator('.wc-ph-menu').tap();
    await page.locator('.wc-ph-sheet [data-row="settings"]').tap();
    await expect(page.locator('.wc-ph-page [data-group="lens"]')).toBeVisible();
  };
  const srow = (id: string) => page.locator(`.wc-ph-page [data-row="${id}"]`);
  await openSettings();
  await expect(page.locator('.wc-ph-page [data-group="lens"] .wc-ph-grp-t')).toHaveText('Map lens');
  const rows = await page.locator('.wc-ph-page [data-group="lens"] [data-row]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.row));
  expect(rows).toEqual(['lens-show', 'lens-size', 'lens-opens']);
  await expect(srow('lens-show').getByRole('switch', { name: 'Show map' })).toHaveAttribute('aria-checked', 'true');
  await expect(srow('lens-size').getByRole('radio', { name: 'M' })).toHaveAttribute('aria-checked', 'true');
  await expect(srow('lens-opens').getByRole('radio', { name: 'Middle' })).toHaveAttribute('aria-checked', 'true');
  // Size L, opens at Far.
  await srow('lens-size').getByRole('radio', { name: 'L' }).tap();
  await srow('lens-opens').getByRole('radio', { name: 'Far' }).tap();
  const lensSet = () => page.evaluate(() => window.__wc!.settings.get().phone.lens);
  expect(await lensSet()).toEqual({ show: true, size: 'l', opensAt: 'far' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-ph-sheet')).toBeHidden();
  await expect.poll(async () => (await lens(page).boundingBox())!.width).toBeCloseTo(180, 0);
  expect(await pane(page).evaluate((el) => getComputedStyle(el).clipPath)).toBe('circle(90px at 50% 50%)');
  await expect(lens(page)).toHaveAttribute('data-level', 'far');
  await expect.poll(async () => (await sent(page)).filter((m) => m.t === 'zoomTo').at(-1)?.zoom).toBeCloseTo(180 / (10 * 44), 4);
  // S: 120 px; the level is kept through a size change.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { size: 's' } } }));
  await expect.poll(async () => (await lens(page).boundingBox())!.width).toBeCloseTo(120, 0);
  await expect(lens(page)).toHaveAttribute('data-level', 'far');
  await expect.poll(async () => (await sent(page)).filter((m) => m.t === 'zoomTo').at(-1)?.zoom).toBeCloseTo(120 / (10 * 44), 4);
  // Kept over a reload (the settings are stored).
  await page.evaluate(async () => {
    window.__wc!.settings.update({ phone: { lens: { size: 'l' } } });
    // The settings are written before the page goes.
    await window.__wc!.settings.flush();
  });
  await page.reload();
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await expect(lens(page)).toBeVisible();
  expect(await lensSet()).toEqual({ show: true, size: 'l', opensAt: 'far' });
  await expect.poll(async () => (await lens(page).boundingBox())!.width).toBeCloseTo(180, 0);
  await expect(lens(page)).toHaveAttribute('data-level', 'far');
  // Show map off: no lens, no map pane.
  await openSettings();
  await srow('lens-show').getByRole('switch', { name: 'Show map' }).tap();
  await expect(srow('lens-show').getByRole('switch', { name: 'Show map' })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(lens(page)).toBeHidden();
  await expect(pane(page)).toBeHidden();
  await page.evaluate(() => window.__wc!.settings.flush());
  await page.reload();
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await expect(lens(page)).toBeHidden();
  await expect(pane(page)).toBeHidden();
  expect((await lensSet()).show).toBe(false);
});

test('the keyboard up: the lens stays; a very short screen hides it and it returns', async ({ page }) => {
  await openCockpit(page);
  await expect(lens(page)).toBeVisible();
  const size = page.viewportSize()!;
  await field(page).tap();
  await page.setViewportSize({ width: size.width, height: size.height - 320 });
  await expect(page.locator('html')).toHaveClass(/\bwc-kbd\b/);
  await expect(lens(page)).toBeVisible();
  await expect(pane(page)).toBeVisible();
  const l = (await lens(page).boundingBox())!;
  const slot = (await page.locator('.wc-input-slot').boundingBox())!;
  expect(l.y + l.height).toBeLessThanOrEqual(slot.y);
  // Too short for it (a landscape keyboard): hidden, the key row instead; no too-small notice.
  await page.setViewportSize({ width: size.width, height: 150 });
  await expect(lens(page)).toBeHidden();
  await expect(pane(page)).toBeHidden();
  await expect(page.locator('.wc-too-small:not([hidden])')).toHaveCount(0);
  await expect(page.locator('.wc-ph-satrow')).toBeVisible();
  // Room again: it returns.
  await page.setViewportSize(size);
  await expect(page.locator('html')).not.toHaveClass(/\bwc-kbd\b/);
  await expect(lens(page)).toBeVisible();
  await expect(page.locator('.wc-ph-satrow')).toBeHidden();
});

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('the lens gives way to the hot key column (stage 51e); with the column hidden it fits above the compass and shows', async ({ page }) => {
    await openCockpit(page);
    // 390 px high: three hot keys above the compass reach into the lens's place (ADR 0136 §4:
    // the lens shows only while it fits above the hot keys). Its keys stay as a row.
    await expect(page.locator('.wc-ph-hot')).toBeVisible();
    await expect(lens(page)).toBeHidden();
    await expect(page.locator('.wc-ph-satrow')).toBeVisible();
    // The K key hides the column: the lens is back.
    await page.locator('.wc-ph-key.is-tog').tap();
    await expect(page.locator('.wc-ph-hot')).toBeHidden();
    await expect(lens(page)).toBeVisible();
    await expect(page.locator('.wc-ph-satrow')).toBeHidden();
    const l = (await lens(page).boundingBox())!;
    const p = (await page.locator('.wc-ph-pad').boundingBox())!;
    expect(l.y + l.height).toBeLessThanOrEqual(p.y);
  });

  test('a large lens that would reach the compass hides; its key stays as a row', async ({ page }) => {
    await openCockpit(page);
    // (Lower, but not so low that it counts as the keyboard being up.)
    await page.setViewportSize({ width: 844, height: 320 });
    await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { size: 'l' } } }));
    await expect(lens(page)).toBeHidden();
    await expect(page.locator('.wc-pane-map')).toBeHidden();
    await expect(page.locator('.wc-ph-satrow')).toBeVisible();
  });
});
