// Boot progress and the start page reveal (ADR 0083).
//
// index.html draws a static loader (a block-glyph bar, system monospace)
// and defines `window.__wcBoot`; the boot calls `bootStep` at its real
// steps and `bootDone` when the first view is up. Every other entry point
// (the exported HTML replay, unit tests) has no loader, so both are
// no-ops there.
//
// The start page is held until the selected font's faces are loaded
// (`gate`, with a timeout so a broken font never blocks), then its rows
// fade in, lightly staggered top to bottom (`revealStart`). Only on the
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

/** How long the start page waits for its fonts at most. */
export const FONT_GATE_MS = 4000;
/** Fade-in of one row, ms. */
export const REVEAL_FADE_MS = 160;
/** Delay of the last row's fade-in after the first's, ms. */
export const REVEAL_SPAN_MS = 160;
/** Delay of the first row while the shown loader fades out (150 ms in index.html), ms. */
export const REVEAL_AFTER_LOADER_MS = 80;

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

/**
 * The fade-in delay of a row whose top is `top` px down a page of
 * `height` px: 0 at the top, `REVEAL_SPAN_MS` at the bottom.
 */
export function revealDelay(top: number, height: number): number {
  if (!(height > 0)) return 0;
  return Math.round(Math.min(1, Math.max(0, top / height)) * REVEAL_SPAN_MS);
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
 * Reveals the start page in `host`, which the caller hid with
 * `opacity: 0` before showing it: waits for the main frame to render,
 * fades its rows (and the notices row) in top to bottom, unhides the
 * host and removes the loader. Resolves when the rows have started
 * (the fades run on). `prefers-reduced-motion`: at once, no fades.
 */
export async function revealStart(host: HTMLElement): Promise<void> {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const main = win ? await waitFor(win, () => host.querySelector<HTMLElement>('.wc-start-main'), 60) : null;
  if (main && !reducedMotion(win)) {
    const base = main.getBoundingClientRect();
    const after = doc.querySelector('#wc-boot.on') ? REVEAL_AFTER_LOADER_MS : 0;
    const rows = [...host.querySelectorAll<HTMLElement>('.wc-start-notices'), ...main.children].filter(
      (el): el is HTMLElement => typeof (el as HTMLElement).animate === 'function',
    );
    for (const el of rows) {
      const delay = after + revealDelay(el.getBoundingClientRect().top - base.top, base.height);
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REVEAL_FADE_MS, delay, easing: 'ease-out', fill: 'backwards' });
    }
  }
  host.style.opacity = '';
  bootDone();
  doc.documentElement.dataset.wcBoot = 'ready';
}
