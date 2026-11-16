// What the watch page's map zoom specs share (stage 65 feedback round 3,
// ADR 0156): the map pane's messages to its worker recorded in the replay's
// frame, and the Map turned on from the player's Panes popup. Not a spec.
// Used by watch-map-zoom.spec.ts (desktop) and phone-watch-map-zoom.spec.ts.

import { type Locator, type Page, expect } from '@playwright/test';
import { replay } from './watch-page';

export type Sent = { t: string; steps?: number; dx?: number; dy?: number; x?: number; y?: number };

/** Records the map pane's view messages to its worker, in every frame (before the page loads). */
export async function recordMapWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sent: unknown[] = [];
    (window as unknown as { __mapSent: unknown[] }).__mapSent = sent;
    const orig = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, m: unknown, ...rest: unknown[]) {
      const t = (m as { t?: string } | null)?.t;
      if (t === 'pan' || t === 'zoom' || t === 'zoomTo') sent.push(JSON.parse(JSON.stringify(m)));
      return (orig as (...a: unknown[]) => void).call(this, m, ...rest);
    } as typeof orig;
  });
}

/** The recorded messages in the replay's frame. */
export async function mapSent(page: Page): Promise<Sent[]> {
  const frame = page.frames().find((f) => f !== page.mainFrame() && f.url() !== 'about:blank') ?? page.frames()[1]!;
  return frame.evaluate(() => (window as unknown as { __mapSent: Sent[] }).__mapSent.slice());
}

/** Sum of the relative zoom steps sent (positive: in). */
export async function zoomSteps(page: Page): Promise<number> {
  return (await mapSent(page)).filter((m) => m.t === 'zoom').reduce((a, m) => a + m.steps!, 0);
}

/** Turns the Map on from the Panes popup (`touch`: by taps) and returns its canvas. */
export async function showMap(page: Page, touch: boolean): Promise<Locator> {
  const r = replay(page);
  const box = r.locator('.wc-player-box');
  const pop = box.locator('.wc-pc-pop[data-pop="panes"]');
  if (touch) {
    await r.locator('.wc-player').tap();
    await box.locator('[data-act="panes"]').tap();
    await pop.locator('[data-pane="map"]').tap();
  } else {
    await r.locator('.wc-player').hover();
    await box.locator('[data-act="panes"]').click();
    await pop.locator('[data-pane="map"]').click();
  }
  const canvas = r.locator('.wc-pane[data-pane="map"] canvas');
  await expect(canvas).toBeVisible();
  await expect(r.locator('.wc-pane[data-pane="map"] .wc-pane-content')).toHaveAttribute('data-map-state', /ready|loaded/);
  return canvas;
}
