// The sampler of start-arrival.spec.ts and phone-start-arrival.spec.ts
// (stage 73 part D): what each frame from the first paint to the page
// asked for showed.
import { type Page, expect } from '@playwright/test';
import { SKY } from './account-pages';
import { cm, setUp } from './community';

export interface Seen {
  /** Frames sampled until the page showed (and 20 after). */
  frames: number;
  /** The frame the page first showed in; -1: never. */
  pageAt: number;
  menu: number;
  proxy: number;
  brand: number;
  firstBrand: number;
  firstPanel: number;
}

/** Starts the sampler on the next load: it samples each frame until `target` shows. */
export async function sample(page: Page, target: string): Promise<void> {
  await page.addInitScript((sel) => {
    const seen = { frames: 0, pageAt: -1, menu: 0, proxy: 0, brand: 0, firstBrand: 0, firstPanel: 0 };
    (window as unknown as { __wcSeen: typeof seen }).__wcSeen = seen;
    const shows = (el: Element | null): boolean => {
      if (!el) return false;
      const e = el as Element & { checkVisibility?: (o: object) => boolean };
      if (typeof e.checkVisibility === 'function') {
        if (!e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true })) return false;
      } else if (el.getClientRects().length === 0 || getComputedStyle(el).visibility !== 'visible') return false;
      return true;
    };
    const tick = (): void => {
      seen.frames++;
      const q = (s: string): Element | null => document.querySelector(s);
      if (shows(q('.wc-start .wc-sm-panel'))) seen.menu++;
      if (shows(q('.wc-start .wc-lk-morph'))) seen.proxy++;
      if (shows(q('.wc-start .wc-start-brand'))) seen.brand++;
      if (q('#wc-first .wcf-brand')) seen.firstBrand++;
      if (q('#wc-first .wcf-panel')) seen.firstPanel++;
      if (seen.pageAt < 0 && shows(q(sel))) seen.pageAt = seen.frames;
      if (seen.pageAt < 0 || seen.frames < seen.pageAt + 20) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, target);
}

export async function seen(page: Page): Promise<Seen> {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __wcSeen: Seen }).__wcSeen.pageAt)).toBeGreaterThan(0);
  // The 20 frames after it.
  await expect
    .poll(() => page.evaluate(() => {
      const s = (window as unknown as { __wcSeen: Seen }).__wcSeen;
      return s.frames - s.pageAt;
    }))
    .toBeGreaterThanOrEqual(20);
  return page.evaluate(() => (window as unknown as { __wcSeen: Seen }).__wcSeen);
}

export const menuShown = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm-panel');

/** `<base>?community` with the fakes (`q`: more of the query): the Community at once, never the menu, nor the morph, the wordmark, the first paint's panel; Esc lands on the menu. */
export async function communityArrival(page: Page, q = ''): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setUp(page);
  await sample(page, '.wc-start .wc-frame:not([hidden]) .wc-cy');
  await page.goto(`/?cloudtest&${SKY}${q}&community`);
  await expect(cm(page)).toBeVisible();
  const s = await seen(page);
  expect(s.menu, 'the start menu was visible on the way').toBe(0);
  expect(s.proxy, 'the morph ran from the menu').toBe(0);
  expect(s.brand, 'the wordmark was visible on the way').toBe(0);
  expect(s.firstBrand + s.firstPanel, 'the first paint drew the wordmark or the menu panel').toBe(0);
  await expect(page).not.toHaveURL(/community/);
  // Esc (Back) from the Community: the menu, as before.
  await page.keyboard.press('Escape');
  await expect(cm(page)).toHaveCount(0);
  await expect(menuShown(page)).toBeVisible();
  expect(errors).toEqual([]);
}
