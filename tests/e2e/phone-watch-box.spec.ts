// Stage 73 part B (ADR 0160 addendum): a shared run on a phone or tablet.
//
// - The control box is the desktop's: no docked bar, floating over the
//   log at the bottom right (left of the rail's markers), with the touch
//   device's larger keys; it hides itself in play after the delay, and a
//   tap on the log shows it again. A tap on the lens's panes key while it
//   is hidden still reaches the lens.
// - No fight card at the top, and no header row (character and date) over
//   the log (stage 73 round 1); History's run log player keeps its header.
// - The lens is half as large again on a phone (a tablet keeps the run log
//   player's size).
// - The box stays inside the window: turning a tablet in fullscreen, and
//   a root laid out taller than the window (as iPadOS reports a turn in
//   fullscreen late), never put it below the bottom edge.
//
// `phone` project (Pixel 7); a tablet is the same device at a tablet's
// screen (the frame's window decides the device flags, src/replay/phone.ts).
import { writeFileSync } from 'node:fs';
import { type CDPSession, type FrameLocator, type Locator, type Page, expect, test } from '@playwright/test';
import { demoPayload } from './cloud-pub-fake';
import { SENDER, frameIsFullscreen, openWatch, playing, poster, replay, setUp } from './watch-page';

test.describe.configure({ timeout: 90_000 });

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;

/** A run of 40 s with a fight in it (`Char.Vitals` names an opponent at 3 s). */
const LONG = 'Lng4h5Jk7mPq';
function longPayload(): unknown {
  const lines: string[] = [];
  for (let i = 0; i < 40; i++) {
    if (i === 2) lines.push('\x1bGMCP Char.Vitals {"opponent":"the hardened ranger","opponent-hits":"wounded","buffer":"Nobody"}');
    else lines.push(`Line ${i + 1}: you walk on through the ranger camp.`);
  }
  return demoPayload({ lines });
}

async function openLong(page: Page): Promise<FrameLocator> {
  const s = await setUp(page);
  s.pubs.add({ id: LONG, owner: SENDER, title: 'A long walk', lengthS: 40, payload: longPayload() });
  await openWatch(page, LONG);
  await playing(page);
  return replay(page);
}

/** Starts the run: a tap on its poster (ADR 0162); the box is at the frame's foot, under the fold of the scrolling page. */
async function play(page: Page, r: FrameLocator): Promise<void> {
  await expect(poster(page)).toBeVisible({ timeout: 20_000 });
  await poster(page).tap();
  await expect(poster(page)).toHaveCount(0);
  await page.locator('.wc-watch-page').evaluate((el) => (el.scrollTop = el.scrollHeight));
  const btn = r.locator('.wc-pc-play');
  if ((await btn.getAttribute('data-playing')) !== 'true') await btn.tap();
  await expect(btn).toHaveAttribute('data-playing', 'true');
}

const CASES = [
  ['phone portrait', { width: 412, height: 839 }, false],
  ['phone landscape', { width: 839, height: 412 }, false],
  ['tablet portrait', { width: 820, height: 1180 }, true],
  ['tablet landscape', { width: 1180, height: 820 }, true],
] as const;

for (const [name, size, tablet] of CASES) {
  test(`${name}: the box floats at the bottom right with touch keys, no fight card, no header, the lens's size`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(size);
    const r = await openLong(page);
    await expect(r.locator('.wc-cockpit[data-phone-game]')).toBeVisible();
    expect(await r.locator('html').evaluate((h) => h.classList.contains('wc-phone'))).toBe(true);
    const chrome = r.locator('.wc-player-chrome');
    const bx = r.locator('.wc-player-box');
    // Not docked: the desktop's floating box with the touch keys.
    await expect(chrome).not.toHaveAttribute('data-docked', '');
    await expect(bx).not.toHaveAttribute('data-docked', '');
    await expect(bx).toHaveAttribute('data-touch', '');
    // No header row over the log (round 1).
    await expect(r.locator('.wc-player-header')).toHaveCount(0);
    const frame = await box(page.locator('.wc-watch-slot iframe'));
    const b = await box(bx);
    // At the bottom right: left of the rail and its markers, as far right as that allows.
    const fromRight = frame.x + frame.width - (b.x + b.width);
    expect(fromRight).toBeGreaterThanOrEqual(12 + 24 - 1);
    expect(fromRight).toBeLessThanOrEqual(12 + 28 + 1);
    expect(frame.y + frame.height - (b.y + b.height)).toBeGreaterThanOrEqual(8);
    expect(frame.y + frame.height - (b.y + b.height)).toBeLessThanOrEqual(16);
    // Room left of it, and keys a finger hits.
    expect(b.x).toBeGreaterThan(frame.x + 40);
    expect((await box(bx.locator('.wc-pc-play'))).width).toBeGreaterThanOrEqual(40);
    expect((await box(bx.locator('[data-act="fwd"]'))).width).toBeGreaterThanOrEqual(36);
    // The lens: half as large again on a phone, the run log player's size on a tablet.
    const lens = await box(r.locator('.wc-ph-lens'));
    const cock = await box(r.locator('.wc-cockpit'));
    const landscape = size.width > size.height;
    const base = Math.min(190, Math.max(96, Math.floor(landscape ? cock.height * 0.5 : cock.width * 0.33) - 16));
    const want = tablet ? base : Math.min(285, Math.floor(landscape ? cock.height * 0.66 : cock.width * 0.5) - 16, Math.floor(base * 1.5));
    expect(Math.abs(lens.width - want)).toBeLessThanOrEqual(2);
    expect(lens.y + lens.height).toBeLessThanOrEqual(frame.y + frame.height);
    expect(lens.x).toBeGreaterThanOrEqual(frame.x);
    // The box and the lens do not meet.
    expect(lens.y + lens.height <= b.y || lens.x + lens.width <= b.x).toBe(true);
    await play(page, r);
    // Into the fight: no fight card.
    await expect(r.locator('.wc-player')).toContainText('Line 4', { timeout: 15_000 });
    await expect(r.locator('.wc-ph-fight')).toBeHidden();
    // A phone opens with the Small font (12 px, fitted to the screen; the recorded one is ~17 px there), a tablet with the recorded one (stage 73, owner).
    const px = await r.locator('.wc-output').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    if (tablet) expect(px).toBeGreaterThan(13);
    else expect(px).toBeLessThanOrEqual(12.5);
    // The frame upright on a phone: a third lower than the window (the band and the foot in the first view).
    if (!tablet && !landscape) expect(frame.height).toBeLessThan(size.height * 0.7);
    await expect(r.locator('.wc-player-header')).toHaveCount(0);
    const slug = name.replace(' ', '-');
    await page.screenshot({ path: `docs/stages/img/73-b-${slug}.png` });
    expect(errors).toEqual([]);
  });
}

test('phone: the box hides in play as on a computer; a tap on the log shows it; a tap on the lens reaches the lens', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  const r = await openLong(page);
  const chrome = r.locator('.wc-player-chrome');
  await play(page, r);
  // Hidden after the delay (6 s), the box with the rest.
  await expect(chrome).toHaveAttribute('data-hidden', '', { timeout: 10_000 });
  expect(await r.locator('.wc-player-box').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  // A tap on the log shows it again, and plays on.
  const out = await box(r.locator('.wc-cockpit'));
  await page.touchscreen.tap(out.x + out.width / 3, out.y + out.height / 2);
  await expect(chrome).not.toHaveAttribute('data-hidden', '');
  await expect(r.locator('.wc-pc-play')).toHaveAttribute('data-playing', 'true');
  await expect(chrome).toHaveAttribute('data-hidden', '', { timeout: 10_000 });
  // Hidden: the lens's panes key still takes the tap.
  const panes = r.locator('.wc-ph-lens .wc-ph-sat[data-sat="panes"]');
  await panes.tap();
  await expect(panes).toHaveAttribute('aria-pressed', 'true');
  await expect(r.locator('.wc-pane[data-phone-strip]')).toHaveAttribute('data-pane', 'group');
  await page.screenshot({ path: 'docs/stages/img/73-b-phone-hidden-panes.png' });
});

/** The box's rectangle in the frame's own window, and that window's size. */
async function inFrame(r: FrameLocator): Promise<{ bottom: number; right: number; ih: number; iw: number }> {
  return r.locator('.wc-player-box').evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { bottom: b.bottom, right: b.right, ih: window.innerHeight, iw: window.innerWidth };
  });
}

test('tablet: turning in fullscreen during play keeps the whole box inside the window; so does a root taller than the window', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const r = await openLong(page);
  await play(page, r);
  await r.locator('.wc-ph-lens .wc-ph-sat[data-sat="fullscreen"]').tap();
  await expect.poll(() => frameIsFullscreen(page)).toBe(true);
  // Portrait → landscape → portrait → landscape, in play.
  // (The window cannot be resized in fullscreen: the device's metrics are, as a turn does.)
  const cdp = await page.context().newCDPSession(page);
  for (const s of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 1180, height: 820 }]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: s.width,
      height: s.height,
      deviceScaleFactor: 2.625,
      mobile: true,
      screenWidth: s.width,
      screenHeight: s.height,
      screenOrientation: s.width > s.height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
    });
    await expect.poll(async () => (await inFrame(r)).ih).toBe(s.height);
    await expect
      .poll(async () => {
        const f = await inFrame(r);
        return f.bottom <= f.ih - 8 && f.bottom >= f.ih - 16 && f.right <= f.iw - 36;
      })
      .toBe(true);
  }
  await expect.poll(() => frameIsFullscreen(page)).toBe(true);
  // iPadOS after a turn in fullscreen: the page laid out taller than what shows. The box is
  // lifted into the visible part (measured again on the window's resize).
  await r.locator('#app').evaluate((el) => {
    el.style.height = 'calc(100% + 60px)';
    window.dispatchEvent(new Event('resize'));
  });
  await expect
    .poll(async () => {
      const f = await inFrame(r);
      return f.bottom <= f.ih - 8;
    })
    .toBe(true);
  await r.locator('#app').evaluate((el) => {
    el.style.height = '';
    window.dispatchEvent(new Event('resize'));
  });
});

// Stage 73 round 3 (ADR 0160 addendum "the iPad fullscreen turn"): iPadOS turned in fullscreen
// reports the new size before the screen's orientation, and the page's measured sizes late.

type Metrics = { width: number; height: number };
const PORTRAIT: Metrics = { width: 820, height: 1180 };
const LANDSCAPE: Metrics = { width: 1180, height: 820 };

const sessions = new WeakMap<Page, CDPSession>();

/** Turns the device: its size, and the screen's orientation as `orientation` says (it may lag behind the size). */
async function turn(page: Page, s: Metrics, orientation: 'portrait' | 'landscape'): Promise<void> {
  // One session per page: the override ends with the session.
  let cdp = sessions.get(page);
  if (!cdp) sessions.set(page, (cdp = await page.context().newCDPSession(page)));
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: s.width,
    height: s.height,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: s.width,
    screenHeight: s.height,
    screenOrientation: orientation === 'landscape' ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
  });
}

/** The frame's layout: its window, its root and cockpit, the box, and whether the cockpit lies on its side. */
async function frameLayout(r: FrameLocator) {
  return r.locator('html').evaluate(() => {
    const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const app = rect('#app');
    const cock = rect('.wc-cockpit');
    const box = rect('.wc-player-box');
    const host = (window as unknown as { __wcReplay?: { host: { app: { cockpit: { phoneGameLayout: { landscape: boolean } | null } } | null } } }).__wcReplay?.host;
    return {
      iw: innerWidth,
      ih: innerHeight,
      app: { l: app.left, t: app.top, r: app.right, b: app.bottom },
      cock: { l: cock.left, t: cock.top, r: cock.right, b: cock.bottom },
      box: { t: box.top, r: box.right, b: box.bottom },
      land: host?.app?.cockpit.phoneGameLayout?.landscape ?? null,
    };
  });
}

/** The frame's content fills its window both ways (no area outside the root or the cockpit), and the box is inside it. */
function fills(f: Awaited<ReturnType<typeof frameLayout>>, land: boolean): boolean {
  const near = (a: number, b: number, d = 1.5): boolean => Math.abs(a - b) <= d;
  return (
    near(f.app.l, 0) &&
    near(f.app.t, 0) &&
    near(f.app.r, f.iw) &&
    near(f.app.b, f.ih) &&
    near(f.cock.l, 0) &&
    near(f.cock.t, 0) &&
    // The cockpit ends left of the rail (12 px) and within a few px of the bottom (whole cells).
    f.cock.r >= f.iw - 12 - 2 &&
    f.cock.b >= f.ih - 2 &&
    f.box.t >= 0 &&
    f.box.b <= f.ih - 8 &&
    f.box.r <= f.iw - 36 &&
    f.land === land
  );
}

/** The page's layout: its window, the page's root boxes, the frame's element, and the measured first-view height. */
async function pageLayout(page: Page) {
  return page.evaluate(() => {
    const rect = (s: string) => {
      const b = document.querySelector(s)!.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
    };
    const watch = document.querySelector<HTMLElement>('.wc-watch')!;
    return { iw: innerWidth, ih: innerHeight, app: rect('#app'), watch: rect('.wc-watch'), frame: rect('.wc-watch-slot iframe'), vh: watch.style.getPropertyValue('--wc-watch-vh') };
  });
}

/** The page fills the window (no black where an old size ends), the frame inside it, its content filling the frame. */
async function pageFills(page: Page, r: FrameLocator, land: boolean): Promise<boolean> {
  const p = await pageLayout(page);
  const f = await frameLayout(r);
  const near = (a: number, b: number, d = 1.5): boolean => Math.abs(a - b) <= d;
  return (
    near(p.app.t, 0) &&
    near(p.app.b, p.ih) &&
    near(p.app.r, p.iw) &&
    near(p.watch.t, 0) &&
    near(p.watch.b, p.ih) &&
    near(p.watch.r, p.iw) &&
    p.vh === `${p.ih}px` &&
    p.frame.l >= 0 &&
    p.frame.r <= p.iw &&
    near(f.iw, p.frame.w, 2) &&
    near(f.ih, p.frame.h, 2) &&
    fills(f, land)
  );
}

for (const [from, to] of [
  ['portrait', 'landscape'],
  ['landscape', 'portrait'],
] as const) {
  test(`tablet: ${from} fullscreen → ${to}, reported in steps, and out of fullscreen: the frame and the page fill the window`, async ({ page }) => {
    const a = from === 'portrait' ? PORTRAIT : LANDSCAPE;
    const b = from === 'portrait' ? LANDSCAPE : PORTRAIT;
    await page.setViewportSize(a);
    const r = await openLong(page);
    await play(page, r);
    await r.locator('.wc-ph-lens .wc-ph-sat[data-sat="fullscreen"]').tap();
    await expect.poll(() => frameIsFullscreen(page)).toBe(true);
    await expect.poll(async () => fills(await frameLayout(r), from === 'landscape')).toBe(true);
    // The new size first, the screen still in the old orientation (iPadOS), then the orientation.
    await turn(page, b, from);
    await expect.poll(async () => (await frameLayout(r)).iw).toBe(b.width);
    await page.waitForTimeout(300);
    await turn(page, b, to);
    await expect.poll(async () => fills(await frameLayout(r), to === 'landscape')).toBe(true);
    // The root laid out at the old orientation's size, with no resize of the window after it.
    await r.locator('#app').evaluate((el, s) => {
      el.style.width = `${s.width}px`;
      el.style.height = `${s.height}px`;
    }, a);
    await expect.poll(async () => fills(await frameLayout(r), to === 'landscape')).toBe(true);
    expect(await r.locator('html').evaluate((h) => h.classList.contains('wc-frame-sized'))).toBe(true);
    // CSS right again: the numbers give way at the next measurement.
    await r.locator('#app').evaluate((el) => {
      el.style.width = '';
      el.style.height = '';
    });
    await expect.poll(() => r.locator('html').evaluate((h) => h.classList.contains('wc-frame-sized'))).toBe(false);
    expect(await frameIsFullscreen(page)).toBe(true);
    // Out of fullscreen in the new orientation; the page's visual viewport still published at the old height.
    await r.locator('html').evaluate(() => document.exitFullscreen());
    await expect.poll(() => frameIsFullscreen(page)).toBe(false);
    await page.evaluate((h) => {
      // As if the visual viewport never told the page the new height (a sheet's `!important` wins over what is published).
      const st = document.createElement('style');
      st.textContent = `html { --wc-vv-h: ${h}px !important; --wc-vv-top: 0px !important; }`;
      document.head.appendChild(st);
    }, a.height);
    await expect.poll(() => pageFills(page, r, to === 'landscape'), { timeout: 10_000 }).toBe(true);
    // (The window's size is the CDP override's, which `page.screenshot` does not take: the session's own capture.)
    const shot = await sessions.get(page)!.send('Page.captureScreenshot', {});
    writeFileSync(`docs/stages/img/73-r3-tablet-${from}-to-${to}.png`, Buffer.from(shot.data, 'base64'));
  });
}

test('tablet: ?fsdebug shows the readout in the page and in the frame, with the page\'s lines in the frame', async ({ page }) => {
  await page.setViewportSize(PORTRAIT);
  const s = await setUp(page);
  s.pubs.add({ id: LONG, owner: SENDER, title: 'A long walk', lengthS: 40, payload: longPayload() });
  await openWatch(page, LONG, '&fsdebug');
  await playing(page);
  const r = replay(page);
  await expect(page.locator('.wc-fsdebug')).toContainText('PAGE');
  await expect(page.locator('.wc-fsdebug')).toContainText('inner 820×1180');
  await expect(r.locator('.wc-fsdebug')).toContainText('FRAME');
  await expect(r.locator('.wc-fsdebug')).toContainText('cockpit');
  await turn(page, LANDSCAPE, 'landscape');
  await expect(page.locator('.wc-fsdebug')).toContainText('inner 1180×820');
  // The page's lines reach the frame (in fullscreen only the frame shows).
  await expect(r.locator('.wc-fsdebug')).toContainText('— page —');
  await expect(r.locator('.wc-fsdebug')).toContainText('inner 1180×820');
  // No style attribute in the frame (its CSP).
  expect(await r.locator('.wc-fsdebug').getAttribute('style')).toBeNull();
});

test('tablet: without ?fsdebug there is no readout', async ({ page }) => {
  await page.setViewportSize(PORTRAIT);
  const r = await openLong(page);
  await expect(r.locator('.wc-ph-lens')).toBeVisible();
  await expect(page.locator('.wc-fsdebug')).toHaveCount(0);
  await expect(r.locator('.wc-fsdebug')).toHaveCount(0);
});
