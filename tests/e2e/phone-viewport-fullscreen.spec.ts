// Stage 52d: the phone's visible area in fullscreen. On the `phone`
// project with `?phone=1`, offline (`?replay`): nothing reaches MUME.
//
// What the device does cannot be had here, so it is stubbed before the
// app loads: a fake `navigator.virtualKeyboard` (a settable rectangle and
// a `geometrychange` event) and a fake fullscreen state (an override of
// `document.fullscreenElement` and a dispatched `fullscreenchange`). The
// specs then check what the app publishes: `--wc-vv-h` and `wc-kbd`.
import { type Page, expect, test } from '@playwright/test';

declare global {
  interface Window {
    __vvFake: {
      overlays: () => boolean;
      keyboard: (top: number, height: number, silent?: boolean) => void;
      fullscreen: (on: boolean) => void;
    };
  }
}

const html = (page: Page) => page.locator('html');
const readout = (page: Page) => page.locator('.wc-vv-readout');
/** The published `--wc-vv-h`, in px. */
const published = (page: Page) => page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue('--wc-vv-h')));
const viewHeight = (page: Page) => page.evaluate(() => window.visualViewport!.height);
const appBottom = (page: Page) => page.evaluate(() => document.getElementById('app')!.getBoundingClientRect().bottom);

async function stub(page: Page, vk = true): Promise<void> {
  await page.addInitScript((vk) => {
    let full = false;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => (full ? document.documentElement : null) });
    const kb = Object.assign(new EventTarget(), { overlaysContent: false, boundingRect: new DOMRect(0, 0, 0, 0) });
    // Chrome for Android has the API; the desktop build under test may or may not.
    Object.defineProperty(navigator, 'virtualKeyboard', { configurable: true, value: vk ? kb : undefined });
    window.__vvFake = {
      overlays: () => kb.overlaysContent,
      keyboard: (top, height, silent) => {
        kb.boundingRect = new DOMRect(0, top, window.innerWidth, height);
        if (!silent) kb.dispatchEvent(new Event('geometrychange'));
      },
      fullscreen: (on) => {
        full = on;
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    };
  }, vk);
}

async function open(page: Page, extra = ''): Promise<void> {
  await page.goto(`/?replay&phone=1${extra}`);
  await expect(html(page)).toHaveClass(/\bwc-phone\b/);
  await expect(page.locator('.wc-cockpit')).toBeVisible();
}

test('without fullscreen the keyboard rectangle is ignored and overlaysContent stays off', async ({ page }) => {
  await stub(page);
  await open(page);
  const full = await viewHeight(page);
  expect(await published(page)).toBe(full);
  await page.evaluate(() => window.__vvFake.keyboard(400, 300));
  await page.waitForTimeout(400);
  expect(await published(page)).toBe(full);
  await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
  expect(await page.evaluate(() => window.__vvFake.overlays())).toBe(false);
  // The path that works today: the visual viewport shrinks for the keyboard.
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: size.height - 320 });
  await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
  expect(await published(page)).toBe(full - 320);
  await page.setViewportSize(size);
  await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
  expect(await published(page)).toBe(full);
});

test('in fullscreen the app ends at the keyboard rectangle; the keyboard down or fullscreen left gives the viewport back', async ({ page }) => {
  await stub(page);
  await open(page);
  const full = await viewHeight(page);
  await page.evaluate(() => window.__vvFake.fullscreen(true));
  expect(await page.evaluate(() => window.__vvFake.overlays())).toBe(true);
  expect(await published(page)).toBe(full);
  await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
  // The keyboard comes up: with overlaysContent the viewport does not shrink.
  await page.evaluate(() => window.__vvFake.keyboard(400, 300));
  await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
  expect(await published(page)).toBe(400);
  expect(await appBottom(page)).toBe(400);
  // The rectangle moves (the toolbar row appears).
  await page.evaluate(() => window.__vvFake.keyboard(356, 344));
  await expect.poll(() => published(page)).toBe(356);
  await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
  // Keyboard down.
  await page.evaluate(() => window.__vvFake.keyboard(0, 0));
  await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
  expect(await published(page)).toBe(full);
  // Up again, then out of fullscreen: the rectangle no longer counts.
  await page.evaluate(() => window.__vvFake.keyboard(400, 300));
  await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
  await page.evaluate(() => window.__vvFake.fullscreen(false));
  expect(await page.evaluate(() => window.__vvFake.overlays())).toBe(false);
  expect(await published(page)).toBe(full);
  await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
});

test('entering fullscreen with the keyboard up: measured again after the change, without any further event', async ({ page }) => {
  await stub(page);
  await open(page);
  const size = page.viewportSize()!;
  const full = await viewHeight(page);
  await page.setViewportSize({ width: size.width, height: size.height - 320 });
  await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
  // The fullscreen change arrives first; the rectangle follows with no event of its own.
  await page.evaluate(() => {
    window.__vvFake.fullscreen(true);
    setTimeout(() => window.__vvFake.keyboard(300, 250, true), 250);
  });
  await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
  expect(await published(page)).toBe(full - 320);
  await expect.poll(() => published(page)).toBe(300);
  await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
});

test('without the VirtualKeyboard API fullscreen follows the visual viewport as before', async ({ page }) => {
  await stub(page, false);
  await open(page);
  const size = page.viewportSize()!;
  const full = await viewHeight(page);
  await page.evaluate(() => window.__vvFake.fullscreen(true));
  await page.setViewportSize({ width: size.width, height: size.height - 320 });
  await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
  expect(await published(page)).toBe(full - 320);
});

test('the readout shows only with ?vv=1, lets touches through and follows the numbers', async ({ page }) => {
  await stub(page);
  await open(page);
  await page.waitForTimeout(300);
  await expect(readout(page)).toHaveCount(0);
  await open(page, '&vv=1');
  await expect(readout(page)).toBeVisible();
  const full = await viewHeight(page);
  await expect(readout(page)).toContainText(`inner ${await page.evaluate(() => window.innerHeight)}`);
  await expect(readout(page)).toContainText(`screen ${await page.evaluate(() => screen.height)}`);
  await expect(readout(page)).toContainText(`vv ${full}@0`);
  await expect(readout(page)).toContainText('fs 0');
  await expect(readout(page)).toContainText('vk top 0 h 0 oc 0');
  await expect(readout(page)).toContainText(`--wc-vv-h ${full}px`);
  expect(await readout(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  expect((await readout(page).boundingBox())!.y).toBe(0);
  await page.evaluate(() => {
    window.__vvFake.fullscreen(true);
    window.__vvFake.keyboard(400, 300);
  });
  await expect(readout(page)).toContainText('fs 1');
  await expect(readout(page)).toContainText('vk top 400 h 300 oc 1');
  await expect(readout(page)).toContainText('--wc-vv-h 400px');
  await expect(readout(page)).toContainText('kbd 1');
});

test('the readout says "no VK" where the API is missing', async ({ page }) => {
  await stub(page, false);
  await open(page, '&vv=1');
  await expect(readout(page)).toContainText('no VK');
});
