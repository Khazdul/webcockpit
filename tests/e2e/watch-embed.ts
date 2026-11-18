// What the specs of stage 74 A share (ADR 0163): a run opened from the
// Community page (or Published runs) plays as a frame on the start surface,
// with no page load. Not a spec. Used by watch-embed.spec.ts (desktop,
// Chromium and Firefox) and phone-watch-embed.spec.ts.
import { gzipSync } from 'node:zlib';
import { type FrameLocator, type Locator, type Page, expect } from '@playwright/test';
import type { FakeAccountServer } from './cloud-account-fake';
import { demoPayload } from './cloud-pub-fake';

/** Gives the seeded run `id` a payload that plays (the community's seeded runs have none). */
export function givePayload(server: FakeAccountServer, id: string): void {
  const bytes = new Uint8Array(gzipSync(JSON.stringify(demoPayload())));
  const p = server.pubs.get(id)!;
  p.payload = bytes;
  p.pub.bytes = bytes.byteLength;
}

/** The watch page as the start surface's top frame. */
export const embedded = (page: Page): Locator => page.locator('.wc-start .wc-frame:not([hidden]) .wc-watch-page.wc-watch-emb');
export const embBox = (page: Page): Locator => embedded(page).locator('.wc-watch-box');
export const embBtn = (page: Page, id: string): Locator => embedded(page).locator(`[data-btn="${id}"]`);
export const embReplay = (page: Page): FrameLocator => page.frameLocator('.wc-start .wc-watch-slot iframe');

/**
 * Marks this document and starts noting the surface's morphs
 * (`data-lk-morph` on `.wc-start`, each value it takes). Call on the start
 * page, before a run is opened.
 */
export async function mark(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __wcDoc?: number; __wcMorphs?: string[] };
    w.__wcDoc = Math.random();
    w.__wcMorphs = [];
    const root = document.querySelector('.wc-start')!;
    new MutationObserver(() => {
      const m = root.getAttribute('data-lk-morph');
      if (m) w.__wcMorphs!.push(m);
    }).observe(root, { attributes: true, attributeFilter: ['data-lk-morph'] });
  });
}

/** The document's mark (undefined after a page load). */
export const docMark = (page: Page): Promise<number | undefined> => page.evaluate(() => (window as unknown as { __wcDoc?: number }).__wcDoc);

/** The morphs noted since `mark` (or the last call), then forgotten. */
export const morphs = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const w = window as unknown as { __wcMorphs: string[] };
    return w.__wcMorphs.splice(0);
  });

/** Waits until the embedded run plays in its frame, in a landed large box. */
export async function embPlaying(page: Page): Promise<void> {
  await expect(embedded(page)).toHaveAttribute('data-watch', 'playing', { timeout: 20_000 });
  await expect(embReplay(page).locator('.wc-player')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.wc-start')).toHaveAttribute('data-lk-box', 'large');
  await expect(page.locator('.wc-start')).not.toHaveAttribute('data-lk-morph', /./, { timeout: 5000 });
}

/** Nothing of the watch page is left on the start page: no frame, no replay, no root class, the title back. */
export async function embGone(page: Page, title: string): Promise<void> {
  await expect(page.locator('.wc-watch-page')).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('.wc-watch-slot iframe')).toHaveCount(0);
  await expect(page.locator('#app')).not.toHaveClass(/wc-watch-app/);
  expect(page.frames().filter((f) => f.url().endsWith('/r/frame'))).toHaveLength(0);
  await expect(page).toHaveTitle(title);
}

/** The rectangles of the page's parts (the box, the band, the replay's slot, the comments …), rounded to half pixels. */
export async function partRects(page: Page): Promise<Record<string, number[] | null>> {
  return page.evaluate(() => {
    const out: Record<string, number[] | null> = {};
    const parts = {
      box: '.wc-watch-box',
      win: '.wc-watch-win',
      band: '.wc-watch-band',
      slot: '.wc-watch-slot',
      title: '[data-watch="title"]',
      meta: '[data-watch="meta"]',
      stars: '[data-watch="stars"]',
      acts: '.wc-watch-acts',
      comments: '[data-watch="comments"]',
      back: '.wc-watch-box > .wc-lk-back',
      hood: '.wc-watch-box > .wc-lk-hood',
    };
    for (const [k, sel] of Object.entries(parts)) {
      const el = document.querySelector(sel);
      if (!el) {
        out[k] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      out[k] = [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 2) / 2);
    }
    return out;
  });
}

/** The frame covers the whole window and is on top everywhere (nine points: the corners, the edges' middles, the centre). */
export async function fillsWindowOnTop(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const f = document.querySelector('.wc-watch-slot iframe')!.getBoundingClientRect();
    if (!(f.x <= 0 && f.y <= 0 && f.width >= innerWidth - 1 && f.height >= innerHeight - 1)) return false;
    for (const x of [2, innerWidth / 2, innerWidth - 3]) {
      for (const y of [2, innerHeight / 2, innerHeight - 3]) if (document.elementFromPoint(x, y)?.tagName !== 'IFRAME') return false;
    }
    return true;
  });
}
