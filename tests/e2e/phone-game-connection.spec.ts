// Stage 51f (ADR 0136 §7, §10, §11): on the phone's layout in the live game,
//
// - the weather effects use the whole width (no left band), stay behind
//   the phone's chrome, keep their mask over the command row, and are off
//   by default;
// - the Quick buttons settings (named Compass before stage 52): the key
//   size (36 / 40 / 44 px, the hot keys, the command field and the lens's
//   room follow); the vibration on a tap is gone since stage 52;
// - the Connection settings: the screen kept on while connected and
//   visible (Screen Wake Lock), and the automatic reconnect: a dead link
//   found on resume reconnects once, never after the user's own
//   disconnect, never twice.
//
// `phone` project (Pixel 7). `navigator.vibrate` and `navigator.wakeLock`
// are replaced by recorders in the page (the first to show it is never
// called). The connection cases play against
// a `page.routeWebSocket` mock; nothing reaches MUME. The background is
// simulated: the page's `visibilityState` is overridden and
// `visibilitychange` dispatched.
import { type Locator, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

const pad = (page: Page) => page.locator('.wc-ph-pad');
const key = (page: Page, cmd: string) => page.locator(`.wc-ph-key[data-cmd="${cmd}"]`);
const hot = (page: Page) => page.locator('.wc-ph-hot');
const hk = (page: Page, n: 1 | 2 | 3) => page.locator(`.wc-ph-hk[data-hk="${n - 1}"]`);
const kKey = (page: Page) => page.locator('.wc-ph-key.is-tog');
const lens = (page: Page) => page.locator('.wc-ph-lens');
const sheet = (page: Page) => page.locator('.wc-ph-sheet');
const pageEl = (page: Page) => page.locator('.wc-ph-page');
const srow = (page: Page, id: string) => pageEl(page).locator(`[data-row="${id}"]`);
const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const phone = (page: Page) => page.evaluate(() => window.__wc!.settings.get().phone);
const status = (page: Page) => page.locator('.wc-app');

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openPhone(page: Page): Promise<void> {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('html')).toHaveClass(/\bwc-phone\b/);
  await expect(pad(page)).toBeVisible();
}

async function openSettings(page: Page): Promise<void> {
  await page.locator('.wc-ph-menu').tap();
  await expect(sheet(page)).toBeVisible();
  await sheet(page).locator('[data-row="settings"]').tap();
  await expect(pageEl(page)).toBeVisible();
}

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const ECHO = 1;
const GMCP = 201;
const gmcp = (pkg: string, data?: unknown): Buffer =>
  Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(data === undefined ? pkg : `${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);

interface Mock {
  sent: string[];
  /** Sockets opened so far. */
  opened: () => number;
  server: () => WebSocketRoute;
  /** MUME names the character on the newest socket: the session is `playing`. */
  login: () => Promise<void>;
}

/**
 * Routes MUME to a mock that answers pings while `answer()` and takes a
 * new connection while `accept()`, and opens the start page on `?phone=1`
 * (nothing entered yet).
 */
async function mock(page: Page, answer: () => boolean = () => true, accept: () => boolean = () => true): Promise<Mock> {
  let server: WebSocketRoute | null = null;
  let opened = 0;
  const sent: string[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    opened++;
    // A refused connection: closed before MUME says anything; the last accepted socket stays `server()`.
    if (!accept()) {
      void ws.close();
      return;
    }
    server = ws;
    ws.onMessage((m) => {
      const t = (typeof m === 'string' ? Buffer.from(m) : m).toString('latin1');
      if (t.includes('Core.Ping')) {
        if (answer()) ws.send(gmcp('Core.Ping'));
        return;
      }
      if (!t.startsWith('\xff')) sent.push(...t.split(/\r?\n/).filter((l) => l !== '' && !l.startsWith('change width')));
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  return {
    sent,
    opened: () => opened,
    server: () => server!,
    login: async () => {
      server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
      await expect(status(page)).toHaveAttribute('data-status', /^playing/);
    },
  };
}

/** Taps Enter MUME; the session is at the login prompt. */
async function enter(page: Page): Promise<void> {
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  await expect(pad(page)).toBeVisible();
}

/** The page goes to the background or comes back (the OS's doing, simulated). */
async function visibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

// ----------------------------------------------------------------- weather

const geometry = (page: Page) => page.evaluate(() => window.__wc!.app.weather!.controller?.engine.geometry() ?? null);

test('weather is off by default on a phone; on, it uses the whole width, behind the phone\'s chrome, masked over the command row', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  expect(await page.evaluate(() => window.__wc!.settings.get().weather.enabled)).toBe(false);
  await expect(page.locator('.wc-cockpit > canvas.wc-weather-layer')).toHaveCount(0);
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(0);
  // The Connection group's switch is the desktop's Weather effects setting.
  await openSettings(page);
  const sw = srow(page, 'weather').getByRole('switch', { name: 'Weather effects' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.tap();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.__wc!.settings.get().weather.enabled)).toBe(true);
  await pageEl(page).locator('.wc-ph-back').tap();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  await expect(page.locator('.wc-cockpit > canvas.wc-weather-layer')).toHaveCount(2);
  await page.evaluate(() => window.__wc!.app.weather!.controller!.engine.ready);
  // No left band: the worker is told so with the layout (it would be absent with the band applied).
  const g = (await geometry(page))!;
  expect(g.noBand).toBe(true);
  // The canvases cover the cockpit from its left edge.
  const c = await box(page.locator('.wc-cockpit'));
  for (const cls of ['.wc-weather-back', '.wc-weather-front']) {
    const b = await box(page.locator(`.wc-cockpit > canvas${cls}`));
    expect(b.x).toBeCloseTo(c.x, 0);
    expect(b.width).toBeCloseTo(c.width, 0);
    expect(b.height).toBeCloseTo(c.height, 0);
  }
  expect(g.W).toBeCloseTo(c.width, 0);
  // The mask: solid from the prompt row (the game's last row) down, so over the whole command row.
  const slot = await box(page.locator('.wc-cockpit > .wc-input-slot'));
  const cellH = await page.evaluate(() => window.__wc!.cells.get().h);
  expect(g.protect.solidTop).toBeLessThanOrEqual(slot.y - c.y);
  expect(g.protect.solidTop).toBeGreaterThanOrEqual(slot.y - c.y - cellH - 3);
  expect(g.protect.fadeTop).toBeLessThan(g.protect.solidTop);
  // Behind the phone's chrome (the layer with the lens, the keys, the fight card), over the panes; never takes a tap.
  const z = (sel: string) => page.locator(sel).evaluate((el) => Number(getComputedStyle(el).zIndex) || 0);
  const front = await z('.wc-cockpit > canvas.wc-weather-front');
  expect(front).toBeLessThan(await z('.wc-cockpit > .wc-ph-layer'));
  expect(front).toBeGreaterThan(await z('.wc-cockpit > .wc-game'));
  expect(front).toBeGreaterThan(await z('.wc-cockpit > .wc-pane-map'));
  expect(await page.locator('.wc-cockpit > canvas.wc-weather-front').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  // The keys still work with the effects on.
  await kKey(page).tap();
  await expect(hot(page)).toBeHidden();
  // A frame is drawn and nothing fails in the worker.
  const stats = await page.evaluate(() => window.__wc!.app.weather!.controller!.engine.stats());
  expect(stats).toBeTruthy();
  // Off again: the canvases go.
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: false } }));
  await expect(page.locator('.wc-cockpit > canvas.wc-weather-layer')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/**
 * What is on screen in the left 30 % of the cockpit, a band of game text
 * well above the mask: once with the effects off, once with rain pinned and
 * run fast for a few seconds. True when the two differ (rain was drawn
 * there). The canvases are the worker's, so the screen is what can be read.
 */
async function rainAtLeft(page: Page): Promise<boolean> {
  const c = await box(page.locator('.wc-cockpit'));
  const clip = { x: Math.round(c.x), y: Math.round(c.y + c.height * 0.3), width: Math.round(c.width * 0.3), height: Math.round(c.height * 0.25) };
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: false } }));
  await expect(page.locator('.wc-cockpit > canvas.wc-weather-layer')).toHaveCount(0);
  const off = await page.screenshot({ clip });
  // The same twice: what is compared is still (no caret, no animation in the clip).
  expect((await page.screenshot({ clip })).equals(off)).toBe(true);
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  await page.waitForFunction(() => !!window.__wc!.app.weather?.controller);
  await page.evaluate(async () => {
    const c = window.__wc!.app.weather!.controller!;
    await c.engine.ready;
    c.engine.setSpeed(40);
    c.pin({ weather: "'" });
  });
  // Rain builds up over seconds; polled, so it ends as soon as a drop is in the clip.
  let differs = false;
  for (let i = 0; i < 16 && !differs; i++) {
    await page.waitForTimeout(500);
    differs = !(await page.screenshot({ clip })).equals(off);
  }
  return differs;
}

test('rain is drawn at the left edge on the phone\'s game layout (the left band is not applied)', async ({ page }) => {
  await openPhone(page);
  // The lens and the hot keys are right of the clip; the game text in it is still.
  expect(await rainAtLeft(page)).toBe(true);
});

test.describe('a tablet sent back to the desktop cockpit (`?tablet=desktop`)', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test('no rain in the left 30 %: the band is applied there as before', async ({ page }) => {
    await page.goto('/?replay&tablet=desktop');
    await expect(page.locator('.wc-cockpit')).toBeVisible();
    await expect(page.locator('.wc-cockpit[data-phone-game]')).toHaveCount(0);
    expect(await rainAtLeft(page)).toBe(false);
  });
});

test.describe('a tablet sent back to the desktop cockpit (`?tablet=desktop`)', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test('keeps the left band: the phone game layout\'s whole-width weather is not applied', async ({ page }) => {
    await page.goto('/?replay&tablet=desktop');
    await expect(page.locator('.wc-cockpit')).toBeVisible();
    await expect(page.locator('.wc-cockpit[data-phone-game]')).toHaveCount(0);
    await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true } }));
    await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
    await page.evaluate(() => window.__wc!.app.weather!.controller!.engine.ready);
    const g = (await geometry(page))!;
    expect(g.noBand ?? false).toBe(false);
    expect(await page.locator('.wc-cockpit > canvas.wc-weather-front').evaluate((el) => getComputedStyle(el).zIndex)).toBe('90');
  });
});

// ----------------------------------------------------------------- compass

test('the keys are 36 px in portrait and 44 px in landscape, not a setting; the column, the K key and the command field follow', async ({ page }) => {
  const errors = watchErrors(page);
  await openPhone(page);
  const measure = async (px: number): Promise<void> => {
    const c = await box(page.locator('.wc-cockpit'));
    const p = await box(pad(page));
    // Three keys and two 3 px gaps, 8 px from the right and bottom edges.
    expect(p.width).toBeCloseTo(3 * px + 6, 0);
    expect(p.height).toBeCloseTo(3 * px + 6, 0);
    expect(c.x + c.width - (p.x + p.width)).toBeCloseTo(8, 0);
    expect(c.y + c.height - (p.y + p.height)).toBeCloseTo(8, 0);
    for (const cmd of ['north', 'west', 'look', 'flee', 'down']) {
      const k = await box(key(page, cmd));
      expect(k.width).toBeCloseTo(px, 0);
      expect(k.height).toBeCloseTo(px, 0);
    }
    const k = await box(kKey(page));
    expect(k.width).toBeCloseTo(px, 0);
    expect(k.x - p.x).toBeCloseTo(0, 0);
    // The hot keys are the same size, 8 px above the compass, 3 px apart.
    const k1 = await box(hk(page, 1));
    const k2 = await box(hk(page, 2));
    expect(k1.width).toBeCloseTo(px, 0);
    expect(k1.height).toBeCloseTo(px, 0);
    expect(p.y - (k1.y + k1.height)).toBeCloseTo(8, 0);
    expect(k1.y - (k2.y + k2.height)).toBeCloseTo(3, 0);
    expect(c.x + c.width - (k1.x + k1.width)).toBeCloseTo(8, 0);
    // The command field ends left of the compass.
    const f = await box(page.locator('.wc-input-slot > .wc-input'));
    expect(f.x + f.width).toBeLessThanOrEqual(p.x - 7);
  };
  // No key size setting any more (stage 52): the phone's shape decides.
  expect('compassSize' in (await phone(page))).toBe(false);
  await measure(36);
  await openSettings(page);
  await expect(srow(page, 'compass-size')).toHaveCount(0);
  await expect(pageEl(page).getByText('Key size')).toHaveCount(0);
  await pageEl(page).locator('.wc-ph-back').tap();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  // The hot key box stands left of the column, its notch at the held key.
  const cdp = await page.context().newCDPSession(page);
  const k3 = await box(hk(page, 3));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: k3.x + 18, y: k3.y + 18, id: 0 }] });
  await expect(page.locator('.wc-ph-rb')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  const rb = await box(page.locator('.wc-ph-rb'));
  const col = await box(hot(page));
  expect(rb.x + rb.width).toBeLessThanOrEqual(col.x - 7);
  expect(rb.y + rb.height).toBeCloseTo(col.y + col.height, 0);
  const notch = await box(page.locator('.wc-ph-rb-n'));
  expect(notch.y + notch.height / 2).toBeCloseTo(k3.y + k3.height / 2, 0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-ph-rb')).toBeHidden();
  // Turned on its side: large keys, everything laid out from them. Turned back: small again.
  const size = page.viewportSize()!;
  // (The cockpit follows the visible area a moment after the window: wait for its new height.)
  const cockpitH = async (): Promise<number> => Math.round((await box(page.locator('.wc-cockpit'))).height);
  const portraitH = await cockpitH();
  await page.setViewportSize({ width: size.height, height: size.width });
  await expect.poll(cockpitH).toBeLessThanOrEqual(size.width);
  await expect.poll(async () => Math.round((await box(key(page, 'north'))).width)).toBe(44);
  await measure(44);
  await page.setViewportSize(size);
  await expect.poll(cockpitH).toBe(portraitH);
  await expect.poll(async () => Math.round((await box(key(page, 'north'))).width)).toBe(36);
  await measure(36);
  expect(errors).toEqual([]);
});

test.describe('a short screen', () => {
  // High enough for the full lens above three 36 px hot keys.
  test.use({ viewport: { width: 412, height: 490 } });

  test('the lens\'s room is what the keys leave: full above the column, shrunk on a lower screen, full again with the column hidden', async ({ page }) => {
    await openPhone(page);
    await expect(hot(page)).toBeVisible();
    await expect(lens(page)).toBeVisible();
    const l = await box(lens(page));
    // 412 px wide: 172 px.
    expect(l.width).toBeCloseTo(172, 0);
    expect(l.y + l.height).toBeLessThanOrEqual((await box(hot(page))).y);
    // A lower screen (still portrait): it shrinks to the whole rows left above the column.
    await page.setViewportSize({ width: 412, height: 430 });
    await expect(lens(page)).toBeVisible();
    await expect.poll(async () => (await box(lens(page))).width).toBeLessThan(172);
    const small = await box(lens(page));
    expect(small.width).toBeGreaterThanOrEqual(96);
    expect(small.y + small.height).toBeLessThanOrEqual((await box(hot(page))).y);
    await expect(page.locator('.wc-ph-satrow')).toBeHidden();
    // The column hidden (K): the room down to the compass holds the full lens.
    await kKey(page).tap();
    await expect(hot(page)).toBeHidden();
    await expect.poll(async () => (await box(lens(page))).width).toBeCloseTo(172, 0);
    expect((await box(lens(page))).y + 172).toBeLessThanOrEqual((await box(pad(page))).y);
  });
});

/** Replaces `navigator.vibrate` with a recorder (`window.__vib`). */
const recordVibrate = (page: Page) =>
  page.addInitScript(() => {
    const calls: number[] = ((window as unknown as { __vib: number[] }).__vib = []);
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (ms: number) => {
        calls.push(ms);
        return true;
      },
    });
  });
const vibs = (page: Page) => page.evaluate(() => (window as unknown as { __vib: number[] }).__vib);

test('vibration is a choice again (stage 53, off by default): no pulse on a tap that sends until it is switched on', async ({ page }) => {
  await recordVibrate(page);
  const m = await mock(page);
  await enter(page);
  await m.login();
  expect((await phone(page)).vibrate).toBe(false);
  await key(page, 'east').tap();
  await hk(page, 2).tap();
  await expect.poll(() => m.sent).toEqual(['east', 'bash']);
  expect(await vibs(page)).toEqual([]);
  // The group is "Quick buttons"; its vibration row is there where the browser can vibrate, off.
  await openSettings(page);
  await expect(pageEl(page).locator('[data-group="compass"] .wc-ph-grp-t')).toHaveText('Quick buttons');
  await expect(pageEl(page).getByText('Compass', { exact: true })).toHaveCount(0);
  expect(await pageEl(page).locator('[data-group="compass"] [data-row]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.row))).toEqual(['hotkey-count', 'vibrate']);
  const row = pageEl(page).locator('[data-row="vibrate"]');
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await row.getByRole('switch').tap();
  expect((await phone(page)).vibrate).toBe(true);
  await pageEl(page).locator('.wc-ph-back').tap();
  await page.keyboard.press('Escape');
  await key(page, 'west').tap();
  await hk(page, 2).tap();
  await expect.poll(() => m.sent).toEqual(['east', 'bash', 'west', 'bash']);
  expect(await vibs(page)).toHaveLength(2);
});

test('where the browser cannot hold a wake lock, its row is absent', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
  });
  const errors = watchErrors(page);
  await openPhone(page);
  await openSettings(page);
  const ids = (group: string) => pageEl(page).locator(`[data-group="${group}"] [data-row]`).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.row));
  // (The vibration row is there or not by `navigator.vibrate`: phone-own-keyboard-fields.spec.ts.)
  expect((await ids('compass')).filter((id) => id !== 'vibrate')).toEqual(['hotkey-count']);
  expect(await ids('connection')).toEqual(['auto-reconnect', 'weather']);
  // A tap still sends without the API.
  await pageEl(page).locator('.wc-ph-back').tap();
  await page.keyboard.press('Escape');
  await key(page, 'north').tap();
  expect(errors).toEqual([]);
});

// --------------------------------------------------------------- wake lock

/** Replaces `navigator.wakeLock` with a recorder: `__wake.requests`, `__wake.releases`, `__wake.drop()` (the browser takes the lock back). */
const recordWakeLock = (page: Page) =>
  page.addInitScript(() => {
    const rec = { requests: 0, releases: 0, live: [] as Array<{ fire: () => void }>, drop: () => {} };
    rec.drop = () => {
      for (const l of rec.live.splice(0)) l.fire();
    };
    (window as unknown as { __wake: typeof rec }).__wake = rec;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async (type: string) => {
          if (type !== 'screen') throw new Error('unexpected lock type');
          rec.requests++;
          let onRelease: (() => void) | null = null;
          const lock = {
            release: async () => {
              rec.releases++;
              rec.live = rec.live.filter((l) => l !== entry);
              // As the real API: the sentinel's `release` event fires for every release, the page's own too.
              onRelease?.();
            },
            addEventListener: (_t: string, fn: () => void) => {
              onRelease = fn;
            },
          };
          const entry = { fire: () => onRelease?.() };
          rec.live.push(entry);
          return lock;
        },
      },
    });
  });
const wake = (page: Page) =>
  page.evaluate(() => {
    const w = (window as unknown as { __wake: { requests: number; releases: number; live: unknown[] } }).__wake;
    return { requests: w.requests, releases: w.releases, held: w.live.length };
  });

test('Keep screen on: the lock is asked for when connected and visible, again on coming back, and released on a disconnect', async ({ page }) => {
  const errors = watchErrors(page);
  await recordWakeLock(page);
  const m = await mock(page);
  // On the start page, not connected: no lock.
  expect((await phone(page)).wakeLock).toBe(true);
  expect(await wake(page)).toEqual({ requests: 0, releases: 0, held: 0 });
  await enter(page);
  // Connected (the login prompt is a live link) and visible: asked for, once.
  await expect.poll(() => wake(page)).toEqual({ requests: 1, releases: 0, held: 1 });
  await m.login();
  await key(page, 'north').tap();
  await expect.poll(() => m.sent).toEqual(['north']);
  expect(await wake(page)).toEqual({ requests: 1, releases: 0, held: 1 });
  // To the background: the lock is let go (the browser would take it back anyway); nothing is asked for while hidden.
  await visibility(page, 'hidden');
  await expect.poll(() => wake(page)).toEqual({ requests: 1, releases: 1, held: 0 });
  // Back: asked for again (the link answers the resume check and is kept).
  await visibility(page, 'visible');
  await expect.poll(async () => (await wake(page)).requests).toBe(2);
  await expect(status(page)).toHaveAttribute('data-status', /^playing/);
  expect((await wake(page)).held).toBe(1);
  // The browser takes a lock back by itself (a battery saver): it is asked for again at the next change, here a resume.
  await page.evaluate(() => (window as unknown as { __wake: { drop(): void } }).__wake.drop());
  await visibility(page, 'visible');
  await expect.poll(async () => (await wake(page)).requests).toBe(3);
  // The switch off releases it; on again asks again.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { wakeLock: false } }));
  await expect.poll(() => wake(page)).toMatchObject({ requests: 3, releases: 2 });
  await page.evaluate(() => window.__wc!.settings.update({ phone: { wakeLock: true } }));
  await expect.poll(() => wake(page)).toMatchObject({ requests: 4, releases: 2 });
  // The link drops: released, and not asked for again while disconnected.
  await m.server().close();
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  await expect.poll(() => wake(page)).toMatchObject({ requests: 4, releases: 3 });
  await visibility(page, 'hidden');
  await visibility(page, 'visible');
  // Connected again (Reconnect), the next request is the fifth: none was made while disconnected.
  await sheet(page).locator('[data-row="reconnect"]').tap();
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  await expect.poll(() => wake(page)).toEqual({ requests: 5, releases: 3, held: 1 });
  await page.locator('.wc-ph-menu').tap();
  // The switch is on the settings page (the browser has the API).
  await page.locator('.wc-ph-sheet [data-row="settings"]').tap();
  await expect(srow(page, 'wake-lock').getByRole('switch', { name: 'Keep screen on while connected' })).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('Keep screen on off: no lock is ever asked for; a replay asks for none either', async ({ page }) => {
  await recordWakeLock(page);
  const m = await mock(page);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { wakeLock: false } }));
  await enter(page);
  await m.login();
  await visibility(page, 'hidden');
  await visibility(page, 'visible');
  await key(page, 'north').tap();
  await expect.poll(() => m.sent).toEqual(['north']);
  expect(await wake(page)).toEqual({ requests: 0, releases: 0, held: 0 });
  // A replay is not a connection to MUME: no lock, also with the setting on.
  await page.evaluate(() => window.__wc!.settings.update({ phone: { wakeLock: true } }));
  await expect.poll(async () => (await wake(page)).requests).toBe(1);
  await page.evaluate(() => window.__wc!.settings.flush());
  await openPhone(page);
  await page.evaluate(async () => {
    const text = await (await fetch('/__fixtures/gmcp-demo.log')).text();
    window.__wc!.app.startReplay(text, 'gmcp-demo.log', 0);
  });
  await expect(rows(page).filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  expect(await wake(page)).toEqual({ requests: 0, releases: 0, held: 0 });
});

// ------------------------------------------------------ automatic reconnect

const LOST = 'Connection closed: connection lost while in the background';

test('Reconnect automatically on: a dead link found on resume reconnects once; its own failure opens the sheet', async ({ page }) => {
  const errors = watchErrors(page);
  let alive = true;
  const m = await mock(page, () => alive);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { autoReconnect: true } }));
  await enter(page);
  await m.login();
  expect(m.opened()).toBe(1);
  // In the background the link dies without a word; back, the check finds it dead.
  await visibility(page, 'hidden');
  alive = false;
  await visibility(page, 'visible');
  await expect(rows(page).filter({ hasText: LOST })).toHaveCount(1, { timeout: 8_000 });
  // One new connection, by itself; no sheet; MUME asks as usual (no login is sent).
  await expect.poll(() => m.opened()).toBe(2);
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  await expect(sheet(page)).toBeHidden();
  expect(m.sent).toEqual([]);
  // No focus was taken (no keyboard), and the keys are held back at the prompt as ever.
  expect(await page.evaluate(() => document.activeElement?.classList.contains('wc-input-field') ?? false)).toBe(false);
  // That connection drops in view: an ordinary drop. The sheet with Reconnect, no second attempt.
  alive = true;
  await m.login();
  await m.server().close();
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator('[data-row="reconnect"]')).toHaveClass(/\bis-lit\b/);
  expect(m.opened()).toBe(2);
  // Away and back while disconnected: still nothing by itself.
  await visibility(page, 'hidden');
  await visibility(page, 'visible');
  await expect(sheet(page)).toBeVisible();
  // The player's own Reconnect opens the third socket: no automatic attempt was made in between.
  await sheet(page).locator('[data-row="reconnect"]').tap();
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  expect(m.opened()).toBe(3);
  expect(errors).toEqual([]);
});

test('Reconnect automatically on: a link that dropped while hidden reconnects at the resume, once', async ({ page }) => {
  const m = await mock(page);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { autoReconnect: true } }));
  await enter(page);
  await m.login();
  await visibility(page, 'hidden');
  await m.server().close();
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  // Hidden: nothing is opened behind the player's back (the socket count at the resume shows it).
  expect(m.opened()).toBe(1);
  await visibility(page, 'visible');
  await expect.poll(() => m.opened()).toBe(2);
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  // The sheet the drop had opened gave way to the new connection.
  await expect(sheet(page)).toBeHidden();
  // Another resume with the link up: nothing more.
  await m.login();
  await visibility(page, 'hidden');
  await visibility(page, 'visible');
  // The link answers the check and still carries a command: the same, second socket.
  await key(page, 'north').tap();
  await expect.poll(() => m.sent).toEqual(['north']);
  expect(m.opened()).toBe(2);
  await expect(status(page)).toHaveAttribute('data-status', /^playing/);
});

test('Reconnect automatically on: never after the user\'s own disconnect', async ({ page }) => {
  const m = await mock(page);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { autoReconnect: true } }));
  await enter(page);
  await m.login();
  // The user's disconnect, in view and (a second time) with the page hidden.
  await page.evaluate(() => window.__wc!.app.session.disconnect());
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  await visibility(page, 'hidden');
  await visibility(page, 'visible');
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  // The user's own reconnect opens the second socket: nothing reconnected by itself before it.
  await page.evaluate(() => window.__wc!.app.onCommand('#reconnect'));
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  expect(m.opened()).toBe(2);
  await m.login();
  // A disconnect of theirs while the page is hidden (a script could): still theirs.
  await visibility(page, 'hidden');
  await page.evaluate(() => window.__wc!.app.session.disconnect());
  await visibility(page, 'visible');
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  await page.evaluate(() => window.__wc!.app.onCommand('#reconnect'));
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  expect(m.opened()).toBe(3);
});

test('Reconnect automatically on: the automatic connection is refused: the sheet with Reconnect, and no further attempt', async ({ page }) => {
  const errors = watchErrors(page);
  let alive = true;
  let accept = true;
  const m = await mock(page, () => alive, () => accept);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { autoReconnect: true } }));
  await enter(page);
  await m.login();
  await visibility(page, 'hidden');
  alive = false;
  accept = false;
  await visibility(page, 'visible');
  await expect(rows(page).filter({ hasText: LOST })).toHaveCount(1, { timeout: 8_000 });
  // One attempt, refused: the player is not left at a dead screen.
  await expect.poll(() => m.opened()).toBe(2);
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator('[data-row="reconnect"]')).toHaveClass(/\bis-lit\b/);
  // Away and back: no retry. The player's Reconnect is the third socket.
  await visibility(page, 'hidden');
  await visibility(page, 'visible');
  await expect(sheet(page)).toBeVisible();
  accept = true;
  alive = true;
  await sheet(page).locator('[data-row="reconnect"]').tap();
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  expect(m.opened()).toBe(3);
  await expect(sheet(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('Reconnect automatically on: the socket closes right after the page is shown again: found on resume, one reconnect', async ({ page }) => {
  const m = await mock(page, () => false);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { autoReconnect: true } }));
  await enter(page);
  await m.login();
  await visibility(page, 'hidden');
  // Shown again: the resume check's ping is out, and the close reaches the page before any answer could.
  await visibility(page, 'visible');
  await m.server().close();
  await expect.poll(() => m.opened()).toBe(2);
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  await expect(sheet(page)).toBeHidden();
  // It was the close, not the check's timeout, that was acted on.
  await expect(rows(page).filter({ hasText: LOST })).toHaveCount(0);
});

test('Reconnect automatically on: an open page is left alone; the reconnect happens behind it', async ({ page }) => {
  const errors = watchErrors(page);
  let alive = true;
  const m = await mock(page, () => alive);
  await page.evaluate(async () => {
    window.__wc!.settings.update({ phone: { autoReconnect: true } });
    await window.__wc!.shell.profiles.init();
    await window.__wc!.shell.profiles.save('default', '#alias {a} {b}\n');
  });
  await enter(page);
  await m.login();
  // The profile editor with an alias open and an edit typed but not yet applied: it lives in the page only.
  await page.evaluate(() => window.__wc!.app.onCommand('#profile'));
  const pe = page.locator('.wc-pe:visible');
  await expect(pe).toBeVisible();
  await pe.locator('[data-rail="alias"]').tap();
  await pe.locator('.wc-pe-row').first().tap();
  await expect(pe).toHaveClass(/\bis-sheet\b/);
  const body = pe.locator('[data-field="body"] textarea');
  await body.tap();
  await expect(body).toBeFocused();
  await page.keyboard.type('x');
  await expect(body).toHaveValue('bx');
  await visibility(page, 'hidden');
  alive = false;
  await visibility(page, 'visible');
  await expect.poll(() => m.opened(), { timeout: 10_000 }).toBe(2);
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  // The editor is still there with the unapplied edit, and the focus is where it was.
  await expect(pe).toBeVisible();
  await expect(pe).toHaveClass(/\bis-sheet\b/);
  await expect(body).toHaveValue('bx');
  await expect(body).toBeFocused();
  expect(await page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null))).toBe('#alias {a} {b}\n');
  await expect(sheet(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('Reconnect automatically on: the phone\'s Settings page stays open through a reconnect found by the resume check', async ({ page }) => {
  let alive = true;
  const m = await mock(page, () => alive);
  await page.evaluate(() => window.__wc!.settings.update({ phone: { autoReconnect: true } }));
  await enter(page);
  await m.login();
  await openSettings(page);
  await visibility(page, 'hidden');
  alive = false;
  await visibility(page, 'visible');
  await expect(rows(page).filter({ hasText: LOST })).toHaveCount(1, { timeout: 8_000 });
  await expect.poll(() => m.opened()).toBe(2);
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  await expect(pageEl(page)).toBeVisible();
  await expect(srow(page, 'auto-reconnect').getByRole('switch', { name: 'Reconnect automatically' })).toHaveAttribute('aria-checked', 'true');
});

test('Reconnect automatically off (the default): a dead link on resume opens the sheet with Reconnect, and nothing reconnects', async ({ page }) => {
  let alive = true;
  const m = await mock(page, () => alive);
  expect((await phone(page)).autoReconnect).toBe(false);
  await enter(page);
  await m.login();
  await visibility(page, 'hidden');
  alive = false;
  await visibility(page, 'visible');
  await expect(rows(page).filter({ hasText: LOST })).toHaveCount(1, { timeout: 8_000 });
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator('[data-row="reconnect"]')).toHaveClass(/\bis-lit\b/);
  expect(m.opened()).toBe(1);
  await expect(status(page)).toHaveAttribute('data-status', /^disconnected/);
  // The switch is on the settings page, off.
  await sheet(page).locator('[data-row="settings"]').tap();
  const sw = srow(page, 'auto-reconnect').getByRole('switch', { name: 'Reconnect automatically' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.tap();
  expect((await phone(page)).autoReconnect).toBe(true);
  // Switching it on does not reconnect by itself: the player's own Reconnect opens the second socket.
  alive = true;
  await pageEl(page).locator('.wc-ph-back').tap();
  await sheet(page).locator('[data-row="reconnect"]').tap();
  await expect(status(page)).toHaveAttribute('data-status', /^login/);
  expect(m.opened()).toBe(2);
});
