// Boot progress and the start page reveal (ADR 0083).
//
// index.html paints first (src/boot/first-paint.ts, inlined at build; ADR
// 0083 and its 2026-11-07 addendum): the start page's sky for the current
// game time and the wordmark exactly where the start page will show them,
// a loading line in an empty panel where the menu will appear, and
// `window.__wcBoot`. The boot calls `bootStep` at its real steps and
// `bootDone` when the first view is up. Every other entry point (the
// exported HTML replay, unit tests) has no first paint, so both are no-ops
// there.
//
// The start page is held until the selected font's faces are loaded
// (`gate`, with a long safety timeout for a stalled download), then the
// first paint's layer goes (the start page's identical sky and wordmark are
// under it) and the menu, the quote, the almanac and the notices fade in
// as one block, once no font face is loading (`revealStart`). Only on the
// first boot; returning to the start page later is instant.

/** The loader API defined by index.html. */
export interface BootLoader {
  step(percent: number, label?: string): void;
  done(): void;
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
 * The start page's fade-in, ms: the whole surface together, as one block
 * (a stagger by position made the top of the page lead).
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

/**
 * Reveals the start page mounted in `mount`, which the caller hid with
 * `opacity: 0` before showing it: waits for the main frame to render and
 * for every font face its layout started (at most `fontMs`), then in one
 * task unhides it and hands over from the first paint (its layer goes:
 * `bootDone`). The sky and the wordmark are the first paint's own pixels
 * at the same place, so they show at once; the menu with its quote, the
 * almanac and the notices fade in as one block, all with one start time
 * (the first paint's loading panel fades out over them). Without a first
 * paint (it failed) the sky and the wordmark fade in with them. A
 * sub-page opened during the fade shows at once. Resolves when the fade
 * has started (it runs on). `prefers-reduced-motion`: at once, no fade.
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
    // What the first paint did not show, not a sub-page opened meanwhile.
    const painted = !!doc.querySelector('#wc-first .wcf-sky');
    const parts = [
      ...mount.querySelectorAll<HTMLElement>(
        painted
          ? '.wc-start .wc-start-almanac, .wc-start > .wc-start-pills'
          : '.wc-start > .wc-start-skyhost, .wc-start > .wc-start-scenery, .wc-start > .wc-start-pills',
      ),
      main,
    ].filter((el) => typeof el.animate === 'function');
    // Started in one task, so they share their start time (the first frame that draws them).
    for (const el of parts) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REVEAL_FADE_MS, easing: 'ease-in-out', fill: 'backwards' });
    }
  }
  mount.style.opacity = '';
  bootDone();
  doc.documentElement.dataset.wcBoot = 'ready';
}
