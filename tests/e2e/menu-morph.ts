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
  /** Where the proxy's flight lands (its last keyframe), while it has one. */
  target: Edges | null;
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
  /** Frames with neither a box nor the proxy drawn, from the plan's first frame on. */
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
    /** The rectangle of the flight's last keyframe: the laid-out proxy's own, or in pieces its pane's. */
    const target = (px: HTMLElement | null): Edges | null => {
      if (!px || px.hidden) return null;
      const last = (el: Element, key: string): Record<string, string> | null => {
        for (const a of el.getAnimations()) {
          const ks = (a.effect as KeyframeEffect).getKeyframes() as unknown as Record<string, string>[];
          const k = ks[ks.length - 1];
          if (k && typeof k[key] === 'string' && k[key] !== 'none' && k[key] !== 'auto') return k;
        }
        return null;
      };
      const pane = px.querySelector<HTMLElement>('.wc-lk-px-pane');
      if (!pane) {
        const k = last(px, 'width');
        if (!k) return null;
        const [l, t, w, h] = ['left', 'top', 'width', 'height'].map((n) => Number.parseFloat(k[n]!)) as [number, number, number, number];
        return [l, t, l + w, t + h];
      }
      const k = last(pane, 'transform');
      const m = k && /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\((-?[\d.]+), (-?[\d.]+)\)$/.exec(k['transform']!);
      if (!m) return null;
      const [x, y, kx, ky] = m.slice(1).map(Number) as [number, number, number, number];
      return [x, y, x + kx * pane.offsetWidth, y + ky * pane.offsetHeight];
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
        target: target(px),
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
  return { frames, plans, flew: frames.some((f) => f.proxy), blank: blankFrames(frames).length };
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

/**
 * The frames with neither a box nor the proxy drawn, from the first frame
 * of a plan on (what the page showed before the change is not the morph's:
 * the menu's panel is drawn anew when the account's flags arrive).
 */
function blankFrames(frames: MorphFrame[]): number[] {
  const first = frames.findIndex((f) => f.plan);
  if (first < 0) return [];
  return frames.map((_, i) => i).filter((i) => i >= first && !frames[i]!.proxy && frames[i]!.boxes.length === 0);
}

/** The blank frames, each with the one before and the one after (for a failure's message). */
export function blanks(w: MorphWatch): string {
  const brief = (x: MorphFrame): unknown => ({ t: x.t, plan: x.plan, proxy: !!x.proxy, boxes: x.boxes.length });
  return blankFrames(w.frames)
    .map((i) => JSON.stringify(w.frames.slice(Math.max(0, i - 1), i + 2).map(brief)))
    .join(' | ');
}

/** Whether two rectangles overlap by more than `slack` px on both axes. */
export const overlap = (a: Edges, b: Edges, slack = 1): boolean => a[0] < b[2] - slack && b[0] < a[2] - slack && a[1] < b[3] - slack && b[1] < a[3] - slack;

/** The frames in which the wordmark can be seen over the flying proxy or a drawn box. */
export function brandOverFrame(w: MorphWatch): MorphFrame[] {
  return w.frames.filter((f) => f.brand && [...(f.proxy ? [f.proxy] : []), ...f.boxes].some((r) => overlap(f.brand!, r)));
}

/**
 * How far (px) the proxy's flight landed from `box` (the largest of the
 * four edges): read from the flight's last keyframe as it was in the last
 * frame it had one, so a browser that paints few frames says the same.
 */
export function landingGap(w: MorphWatch, box: Edges): number {
  const last = [...w.frames].reverse().find((f) => f.target)?.target;
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
