// Helpers for the first paint tests (ADR 0083).
import type { Page } from '@playwright/test';

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

/**
 * Screenshot clips of the first paint's MUME and COCKPIT words (the box
 * round each word's glyph runs): the wordmark without the twinkling stars.
 */
export async function wordmarkClips(page: Page): Promise<{ x: number; y: number; width: number; height: number }[]> {
  return page.evaluate(() =>
    ['.wcf-word', '.wcf-word-dim'].map((cls) => {
      const rs = [...document.querySelectorAll(`#wc-first .wcf-banner ${cls}`)].map((e) => e.getBoundingClientRect());
      const x = Math.floor(Math.min(...rs.map((r) => r.left)));
      const y = Math.floor(Math.min(...rs.map((r) => r.top)));
      return {
        x,
        y,
        width: Math.ceil(Math.max(...rs.map((r) => r.right))) - x,
        height: Math.ceil(Math.max(...rs.map((r) => r.bottom))) - y,
      };
    }),
  );
}
