// What the specs of the menu ↔ sub-page morph share (stage 74 part C, ADR
// 0165): a frame-by-frame record of a page change on the start surface.
// Not a spec (no tests). Used by menu-sub-morph.spec.ts (desktop) and
// phone-menu-sub-morph.spec.ts.
import type { Page } from '@playwright/test';

/** A rectangle as `[left, top, right, bottom]` (viewport CSS px). */
export type Edges = [number, number, number, number];

/** One animation frame of a watched change. */
export interface MorphFrame {
  /** ms since the watch began. */
  t: number;
  /** `data-lk-morph` on the surface (the running plan's type), or null. */
  plan: string | null;
  /** The proxy's rectangle while it shows (in pieces: its pane's), else null. */
  proxy: Edges | null;
  /** The boxes that are drawn and not hidden by the morph (the old box, then the new one). */
  boxes: Edges[];
  /** The newest frame's box, drawn or still waiting for its landing. */
  top: Edges | null;
  /** The wordmark's rectangle while it can be seen (opacity over 0.05), else null. */
  brand: Edges | null;
  /** The element with the focus (`tag[data-field]`). */
  focus: string;
}

export interface MorphWatch {
  frames: MorphFrame[];
  /** The plan types the surface showed, in order, without repeats. */
  plans: string[];
  /** Whether the proxy showed at all. */
  flew: boolean;
  /** Frames with neither a box nor the proxy drawn. */
  blank: number;
}

/**
 * Starts recording every animation frame of the start surface until
 * `stopMorphWatch`. The recorder lives in the page, so nothing of the
 * change is missed between two calls from the test.
 */
export async function startMorphWatch(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Edges = [number, number, number, number];
    const edges = (el: Element): Edges => {
      const r = el.getBoundingClientRect();
      return [r.left, r.top, r.right, r.bottom];
    };
    /** Drawn, and neither it nor an ancestor hidden or fully transparent. */
    const shown = (el: Element | null, min = 0): boolean => {
      if (!el || !el.isConnected || el.getClientRects().length === 0) return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.visibility === 'hidden' || Number(cs.opacity) <= min) return false;
      }
      return true;
    };
    const frames: unknown[] = [];
    const w = { frames, on: true };
    (window as unknown as { __menuMorph: typeof w }).__menuMorph = w;
    const t0 = performance.now();
    const tick = (): void => {
      if (!w.on) return;
      const root = document.querySelector<HTMLElement>('.wc-start');
      const px = document.querySelector<HTMLElement>('.wc-lk-morph');
      const pane = px?.querySelector('.wc-lk-px-pane') ?? px;
      const all = [...document.querySelectorAll('.wc-start .wc-frame .wc-lk-box')];
      const brand = document.querySelector('.wc-start-brand > *');
      const a = document.activeElement;
      frames.push({
        t: Math.round(performance.now() - t0),
        plan: root?.dataset['lkMorph'] ?? null,
        proxy: px && pane && !px.hidden && shown(px) ? edges(pane) : null,
        boxes: all.filter((b) => shown(b)).map(edges),
        top: all.length ? edges(all[all.length - 1]!) : null,
        brand: brand && shown(brand, 0.05) ? edges(brand) : null,
        focus: a ? a.tagName.toLowerCase() + (a.closest('[data-field]') ? `[${(a.closest('[data-field]') as HTMLElement).dataset['field']}]` : '') : '',
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Stops the recording and returns it. */
export async function stopMorphWatch(page: Page): Promise<MorphWatch> {
  const frames = await page.evaluate(() => {
    const w = (window as unknown as { __menuMorph: { frames: MorphFrame[]; on: boolean } }).__menuMorph;
    w.on = false;
    return w.frames;
  });
  const plans: string[] = [];
  for (const f of frames) if (f.plan && plans[plans.length - 1] !== f.plan) plans.push(f.plan);
  // (Before the change and after it the page's own box is drawn: only frames of the plan can be blank.)
  return { frames, plans, flew: frames.some((f) => f.proxy), blank: frames.filter((f) => !f.proxy && f.boxes.length === 0).length };
}

/** Records `act` and what follows until no plan runs and the proxy is gone (at least `min` ms). */
export async function watchMorph(page: Page, act: () => Promise<void>, min = 300): Promise<MorphWatch> {
  await startMorphWatch(page);
  await act();
  await page.waitForFunction(
    (min) => {
      const w = (window as unknown as { __menuMorph: { frames: MorphFrame[] } }).__menuMorph;
      const last = w.frames[w.frames.length - 1];
      return !!last && last.t >= min && w.frames.some((f) => f.plan) && !last.plan && !last.proxy;
    },
    min,
    { timeout: 8000 },
  );
  // Two more frames: the landed box, after the proxy's last.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  return stopMorphWatch(page);
}

/** Whether two rectangles overlap by more than `slack` px on both axes. */
export const overlap = (a: Edges, b: Edges, slack = 1): boolean => a[0] < b[2] - slack && b[0] < a[2] - slack && a[1] < b[3] - slack && b[1] < a[3] - slack;

/** The frames in which the wordmark can be seen over the flying proxy or a drawn box. */
export function brandOverFrame(w: MorphWatch): MorphFrame[] {
  return w.frames.filter((f) => f.brand && [...(f.proxy ? [f.proxy] : []), ...f.boxes].some((r) => overlap(f.brand!, r)));
}

/** How far (px) the proxy's last rectangle was from `box` (the largest of the four edges). */
export function landingGap(w: MorphWatch, box: Edges): number {
  const last = [...w.frames].reverse().find((f) => f.proxy)?.proxy;
  if (!last) return Number.POSITIVE_INFINITY;
  return Math.max(...last.map((v, i) => Math.abs(v - box[i]!)));
}

/** An element's rectangle as `Edges`. */
export async function edgesOf(page: Page, selector: string): Promise<Edges> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.left, r.top, r.right, r.bottom] as [number, number, number, number];
  });
}
