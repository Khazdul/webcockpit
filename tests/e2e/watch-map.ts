// What the watch page's map specs share (stage 65 feedback round 3,
// ADR 0156; the lens of stage 71, ADR 0160): the map pane's messages to its
// worker recorded in the replay's frame, and the map lens's canvas. Not a
// spec. Used by watch-map-zoom.spec.ts, watch-lens.spec.ts (desktop) and
// phone-watch-map-zoom.spec.ts.

import { type Locator, type Page, expect } from '@playwright/test';
import { replay } from './watch-page';

export type Sent = { t: string; steps?: number; dx?: number; dy?: number; x?: number; y?: number; zoom?: number; on?: boolean };

/** Records the map pane's view messages to its worker, in every frame (before the page loads). */
export async function recordMapWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sent: unknown[] = [];
    (window as unknown as { __mapSent: unknown[] }).__mapSent = sent;
    const orig = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, m: unknown, ...rest: unknown[]) {
      const t = (m as { t?: string } | null)?.t;
      if (t === 'pan' || t === 'zoom' || t === 'zoomTo' || t === 'follow') sent.push(JSON.parse(JSON.stringify(m)));
      return (orig as (...a: unknown[]) => void).call(this, m, ...rest);
    } as typeof orig;
  });
}

/** The recorded messages in the replay's frame. */
export async function mapSent(page: Page): Promise<Sent[]> {
  const frame = page.frames().find((f) => f !== page.mainFrame() && f.url() !== 'about:blank') ?? page.frames()[1]!;
  return frame.evaluate(() => (window as unknown as { __mapSent: Sent[] }).__mapSent.slice());
}

/** The map lens's canvas (a shared run's map is the lens from the start, stage 71), once its map runs. */
export async function lensMap(page: Page): Promise<Locator> {
  const r = replay(page);
  const canvas = r.locator('.wc-pane[data-pane="map"] canvas');
  await expect(canvas).toBeVisible();
  await expect(r.locator('.wc-pane[data-pane="map"] .wc-pane-content')).toHaveAttribute('data-map-state', /ready|loaded/);
  return canvas;
}
