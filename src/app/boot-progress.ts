// Boot progress and the start page reveal (ADR 0083).
//
// index.html paints first (src/boot/first-paint.ts, inlined at build): the
// start page banner where the app will draw it, a block-glyph bar below
// it, and `window.__wcBoot`. The boot calls `bootStep` at its real steps
// and `bootDone` when the first view is up. Every other entry point (the
// exported HTML replay, unit tests) has no first paint, so both are no-ops
// there.
//
// The start page is held until the selected font's faces are loaded
// (`gate`, with a long safety timeout for a stalled download), then the
// app's banner takes the first paint's place in the same frame and the
// rest of the page fades in as one block, once no font face is loading
// (`revealStart`). Only on the first boot; returning to the start page
// later is instant.

import type { StarAnim } from '../chrome/banner-data';

/** The first paint's banner clock: the app's banner twinkles on from it. */
export interface BootBanner {
  anims: StarAnim[];
  /** `performance.now()` when the first paint's twinkle started. */
  t0: number;
}

/** The loader API defined by index.html. */
export interface BootLoader {
  step(percent: number, label?: string): void;
  done(): void;
  /** The banner the first paint drew (null once the app's banner has taken it). */
  banner?: BootBanner | null;
  /** Index into QUOTES of the quote the first paint laid the page out for. */
  quote?: number;
}

declare global {
  interface Window {
    /** index.html's boot loader; absent in other entry points. */
    __wcBoot?: BootLoader;
  }
}

/**
 * How long the start page waits for its fonts at most: a safety net for a
 * download that stalls, not a budget. The fonts are preloaded by the first
 * paint, before the scripts, and `loadFont` settles on a load error too,
 * so on a slow link (Regular 3G: about 30 s for everything) the gate opens
 * when the files land, never before.
 */
export const FONT_GATE_MS = 45_000;
/**
 * The start page's fade-in, ms. Every row fades in together, as one
 * block: a stagger by position made the top row (the selected
 * `<< Enter MUME >>`) lead.
 */
export const REVEAL_FADE_MS = 1350;

function loader(): BootLoader | undefined {
  return (globalThis as { __wcBoot?: BootLoader }).__wcBoot;
}

/** Moves the loader's bar to `percent` (never backwards) and sets its label. */
export function bootStep(percent: number, label?: string): void {
  try {
    loader()?.step(percent, label);
  } catch {
    /* the loader is cosmetic */
  }
}

/** Fades the loader out and removes it (idempotent). */
export function bootDone(): void {
  try {
    loader()?.done();
  } catch {
    /* the loader is cosmetic */
  }
}

/** Resolves when `p` settles or after `ms`, whichever is first (never rejects). */
export function gate(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    const end = (): void => {
      clearTimeout(t);
      resolve();
    };
    p.then(end, end);
  });
}

/** Whether the user asked for less motion. */
function reducedMotion(win: Window | null): boolean {
  return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Resolves once `find()` returns an element, or null after `frames` animation frames. */
function waitFor(win: Window, find: () => HTMLElement | null, frames: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const tick = (n: number): void => {
      const el = find();
      if (el || n <= 0) resolve(el);
      else win.requestAnimationFrame(() => tick(n - 1));
    };
    tick(frames);
  });
}

/** The first paint's banner clock, once (the start page's banner takes it; later banners start their own). */
export function takeBootBanner(): BootBanner | null {
  try {
    const l = loader();
    const b = l?.banner ?? null;
    if (l) l.banner = null;
    return b;
  } catch {
    return null;
  }
}

/** Index of the quote the first paint laid the start page out for, or null. */
export function bootQuote(): number | null {
  const q = loader()?.quote;
  return typeof q === 'number' && Number.isInteger(q) && q >= 0 ? q : null;
}

/**
 * Reveals the start page mounted in `mount`, which the caller hid with
 * `opacity: 0` before showing it: waits for the main frame to render and
 * for every font face its layout started (at most `fontMs`), then in one
 * task unhides it and hands over from the first paint (its banner goes,
 * the app's identical one is there), and fades every other row of the
 * main frame (and the notices row) in, all together. A banner the first
 * paint did not draw fades in with the rest. Resolves when the fade has
 * started (it runs on). `prefers-reduced-motion`: at once, no fade.
 *
 * The font wait: a face that is still loading hides all text of its style
 * (`font-display: block`), not only its own glyphs. The page's first
 * layout can start a face the gate did not wait for (a glyph from a
 * fallback family), so the reveal waits until the browser says no face is
 * loading.
 */
export async function revealStart(mount: HTMLElement, fontMs = FONT_GATE_MS): Promise<void> {
  const doc = mount.ownerDocument;
  const win = doc.defaultView;
  const main = win ? await waitFor(win, () => mount.querySelector<HTMLElement>('.wc-start-main'), 60) : null;
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (main && fonts?.ready) {
    main.getBoundingClientRect();
    await gate(fonts.ready, fontMs);
  }
  if (main && !reducedMotion(win)) {
    const drawn = doc.querySelector('#wc-first .wcf-banner') !== null;
    const rows = [...mount.querySelectorAll<HTMLElement>('.wc-start-notices'), ...main.children].filter(
      (el): el is HTMLElement =>
        typeof (el as HTMLElement).animate === 'function' && !(drawn && el.classList.contains('wc-banner')),
    );
    // Started in one task, so they share their start time (the first frame that draws them).
    for (const el of rows) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REVEAL_FADE_MS, easing: 'ease-in-out', fill: 'backwards' });
    }
  }
  mount.style.opacity = '';
  bootDone();
  doc.documentElement.dataset.wcBoot = 'ready';
}
