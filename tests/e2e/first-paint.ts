// Helpers for the first paint tests (ADR 0083 and its 2026-11-07 addendum).
import { type Page, expect } from '@playwright/test';

/** Holds the chrome chunk (dev: its module) until the returned function is called. */
export async function holdChrome(page: Page): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/src\/chrome\/index\.tsx(\?|$)/, async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

export type Box = { x: number; y: number; width: number; height: number };

/** The bounding box (CSS px) of the first element matching `sel`, or null. */
export function boxOf(page: Page, sel: string): Promise<Box | null> {
  return page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, sel);
}

/** Expects two boxes to agree within `tol` CSS px on every side. */
export function expectSameBox(a: Box | null, b: Box | null, tol: number, what: string): void {
  expect(a, `${what}: first paint`).not.toBeNull();
  expect(b, `${what}: app`).not.toBeNull();
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(a![k] - b![k]), `${what} ${k}: ${a![k]} vs ${b![k]}`).toBeLessThanOrEqual(tol);
  }
}

/**
 * Loads `/` with the chrome chunk held: checks the first paint (sky,
 * wordmark, loading panel, no menu), releases the chunk and checks that
 * the start page's wordmark and menu panel sit exactly where the first
 * paint's wordmark and loading panel were.
 */
export async function checkHandOver(page: Page, query = ''): Promise<void> {
  const release = await holdChrome(page);
  await page.goto(`/${query}`, { waitUntil: 'commit' });
  await expect(page.locator('#wc-first .wcf-sky')).toHaveCount(1);
  await expect(page.locator('#wc-first .wcf-brand [data-wcw="iron"]')).toHaveCount(1);
  expect(await page.locator('#wc-first .wcf-sky').evaluate((e) => e.style.background)).toContain('gradient');
  await expect(page.locator('#wc-boot.wcf-panel')).toHaveCSS('opacity', '1');
  await expect(page.locator('.wc-sm-item')).toHaveCount(0);
  const mark = await boxOf(page, '#wc-first .wcf-brand [data-wcw="iron"]');
  const panel = await boxOf(page, '#wc-first .wcf-panel');
  release();
  await expect(page.locator('html')).toHaveAttribute('data-wc-boot', 'ready');
  await expect(page.locator('#wc-first .wcf-sky, #wc-first .wcf-brand')).toHaveCount(0);
  // The wordmark does not move at the hand-over; the menu panel takes the loading panel's box.
  expectSameBox(mark, await boxOf(page, '.wc-start .wc-start-brand [data-wcw="iron"]'), 0.5, 'wordmark');
  expectSameBox(panel, await boxOf(page, '.wc-start .wc-sm-panel'), 1, 'menu panel');
}
