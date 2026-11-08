// A human-looking pointer for the film: glides along a slight arc with an
// ease-in-out, one step a display frame, instead of jumping (Playwright's
// `mouse.move` with `steps` sends its steps at once). The recorder logs
// every move in the page (browser.ts), so a composition can draw a cursor
// over the headless recording, which has none of its own.
import type { Locator, Page } from '@playwright/test';
import { sleep } from '../../../scripts/lib/mume-feed.ts';

/** Where each page's pointer is, CSS px (Playwright does not say). */
const at = new WeakMap<Page, { x: number; y: number }>();

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Puts the pointer at (x, y) at once (off camera). */
export async function place(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  at.set(page, { x, y });
}

/**
 * Moves the pointer to (x, y) over `ms` (default by distance, 350–900 ms),
 * along an arc bowed by `arc` (a share of the distance, sideways).
 */
export async function glide(page: Page, x: number, y: number, o: { ms?: number; arc?: number } = {}): Promise<void> {
  const from = at.get(page) ?? { x: 5, y: 5 };
  const dx = x - from.x;
  const dy = y - from.y;
  const dist = Math.hypot(dx, dy);
  const ms = o.ms ?? Math.min(900, Math.max(350, dist * 0.9));
  const arc = (o.arc ?? 0.08) * dist;
  // the arc's control point: the middle, pushed sideways
  const cx = from.x + dx / 2 + (dist ? (-dy / dist) * arc : 0);
  const cy = from.y + dy / 2 + (dist ? (dx / dist) * arc : 0);
  const start = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - start) / ms);
    const u = ease(t);
    const px = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * cx + u * u * x;
    const py = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * cy + u * u * y;
    await page.mouse.move(px, py);
    if (t >= 1) break;
    await sleep(16);
  }
  at.set(page, { x, y });
}

/** Glides to the middle of `el` (or `dx`, `dy` shares of its box) and clicks there, a short press. */
export async function glideClick(page: Page, el: Locator, o: { dx?: number; dy?: number; ms?: number } = {}): Promise<void> {
  const b = await el.boundingBox();
  if (!b) throw new Error('glideClick: the element has no box');
  const x = b.x + b.width * (o.dx ?? 0.5);
  const y = b.y + b.height * (o.dy ?? 0.5);
  await glide(page, x, y, o.ms === undefined ? {} : { ms: o.ms });
  await sleep(120);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
}
