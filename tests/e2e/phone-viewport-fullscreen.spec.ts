// Stage 52d (cut back in 0.6.1): the phone's visible area in fullscreen.
// On the `phone` project with `?phone=1`, offline (`?replay`): nothing
// reaches MUME.
//
// What the device does cannot be had here, so it is stubbed before the
// app loads: a fake `navigator.virtualKeyboard` (a settable rectangle and
// a `geometrychange` event) and a fake fullscreen state (an override of
// `document.fullscreenElement` and a dispatched `fullscreenchange`). The
// specs then check what the app publishes: `--wc-vv-h` and `wc-kbd`.
//
// Since 0.6.1 the app no longer uses the VirtualKeyboard rectangle (it
// collapsed the layout on the owner's S21 in portrait fullscreen): the
// fake is there to show that the rectangle is ignored and `overlaysContent`
// is left alone, and for the `?vv=1` readout, which still shows it.
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

// The module measures the same with either keyboard of the game layout, so every case runs
// twice: with our own keyboard (the default; the device's can then come up only in a browser
// that ignores `inputmode="none"`, and the page must still follow it) and on the old path
// (`?kbd=0`).
for (const gate of ['', '&kbd=0']) {
  test.describe(gate ? 'the device keyboard path (?kbd=0)' : 'our own keyboard (the default)', () => {
    test('without fullscreen the keyboard rectangle is ignored and overlaysContent stays off', async ({ page }) => {
      await stub(page);
      await open(page, gate);
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

    test('in fullscreen the keyboard rectangle is ignored too: overlaysContent stays off and the visual viewport decides', async ({ page }) => {
      await stub(page);
      await open(page, gate);
      const size = page.viewportSize()!;
      const full = await viewHeight(page);
      await page.evaluate(() => window.__vvFake.fullscreen(true));
      expect(await page.evaluate(() => window.__vvFake.overlays())).toBe(false);
      expect(await published(page)).toBe(full);
      await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
      // The rectangle that collapsed the layout on the owner's S21: near the top of the screen.
      await page.evaluate(() => window.__vvFake.keyboard(80, 700));
      await page.waitForTimeout(700);
      expect(await published(page)).toBe(full);
      expect(await appBottom(page)).toBe(full);
      await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
      expect(await page.evaluate(() => window.__vvFake.overlays())).toBe(false);
      // The visual viewport shrinks for the keyboard: that is what counts.
      await page.setViewportSize({ width: size.width, height: size.height - 320 });
      await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
      expect(await published(page)).toBe(full - 320);
      expect(await appBottom(page)).toBe(full - 320);
      // Keyboard down, then out of fullscreen.
      await page.setViewportSize(size);
      await expect(html(page)).not.toHaveClass(/\bwc-kbd\b/);
      expect(await published(page)).toBe(full);
      await page.evaluate(() => window.__vvFake.fullscreen(false));
      expect(await page.evaluate(() => window.__vvFake.overlays())).toBe(false);
      expect(await published(page)).toBe(full);
    });

    test('entering fullscreen with the keyboard up: measured again after the change, without any further event', async ({ page }) => {
      await stub(page);
      await open(page, gate);
      const size = page.viewportSize()!;
      const full = await viewHeight(page);
      await page.setViewportSize({ width: size.width, height: size.height - 320 });
      await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
      expect(await published(page)).toBe(full - 320);
      // The viewport's height changes with no event at all, as when Android
      // delivers none: only the measurements after the fullscreen change see it.
      await page.evaluate((h) => Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => h }), full - 280);
      await page.waitForTimeout(400);
      expect(await published(page)).toBe(full - 320);
      await page.evaluate(() => window.__vvFake.fullscreen(true));
      await expect.poll(() => published(page)).toBe(full - 280);
      await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
      expect(await page.evaluate(() => window.__vvFake.overlays())).toBe(false);
    });

    test('without the VirtualKeyboard API fullscreen follows the visual viewport as before', async ({ page }) => {
      await stub(page, false);
      await open(page, gate);
      const size = page.viewportSize()!;
      const full = await viewHeight(page);
      await page.evaluate(() => window.__vvFake.fullscreen(true));
      await page.setViewportSize({ width: size.width, height: size.height - 320 });
      await expect(html(page)).toHaveClass(/\bwc-kbd\b/);
      expect(await published(page)).toBe(full - 320);
    });

    test('the readout shows only with ?vv=1, lets touches through and follows the numbers', async ({ page }) => {
      await stub(page);
      await open(page, gate);
      await page.waitForTimeout(300);
      await expect(readout(page)).toHaveCount(0);
      await open(page, gate + '&vv=1');
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
      // The readout still shows the rectangle; the layout does not follow it.
      await expect(readout(page)).toContainText('vk top 400 h 300 oc 0');
      await expect(readout(page)).toContainText(`--wc-vv-h ${full}px`);
      await expect(readout(page)).toContainText('kbd 0');
    });

    test('the readout says "no VK" where the API is missing', async ({ page }) => {
      await stub(page, false);
      await open(page, gate + '&vv=1');
      await expect(readout(page)).toContainText('no VK');
    });
  });
}
