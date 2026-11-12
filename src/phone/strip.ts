// The pane strip's chrome (ADR 0136 §5): what the phone layer draws for
// the strip. The pane itself is the cockpit's (`setPhoneStrip` places it
// borderless in the strip's rows, leaving the last row to the strip's
// resize band: comm-chrome.ts, stage 52). Here are the strip's region
// (its name for a screen reader), the open page's name (`label`) and the
// page dots (`dots`). Since round 53j the strip has no hood: the phone
// layer puts the name on the band's plate, and the dots on the band (its
// right end in portrait; in landscape the start of the strip's stretch of
// the column's band). No tabs.
//
// A sideways swipe anywhere on the strip changes the page (swipe.ts); a
// vertical drag is the pane's own scrolling and a tap its own tap. The
// recogniser listens for the press and its release only (no move handler),
// on the cockpit, and looks at presses that begin on the strip.

import type { StripPage } from './strip-model';
import { stripLabel } from './strip-model';
import { swipeStep } from './swipe';

export class StripView {
  /** The strip's region, over its rows (it draws nothing and takes no press). */
  readonly el: HTMLDivElement;
  /** The open page's name ('' while there is none): the phone layer writes it on the band's plate. */
  label = '';
  /** The page dots: the phone layer puts them on the strip's resize band. */
  readonly dots: HTMLDivElement;
  private key = '';
  private placeKey = '';

  constructor(doc: Document) {
    this.el = doc.createElement('div');
    this.el.className = 'wc-ph-strip';
    this.el.hidden = true;
    this.el.setAttribute('role', 'region');
    this.dots = doc.createElement('div');
    this.dots.className = 'wc-ph-strip-dots';
    this.dots.setAttribute('aria-hidden', 'true');
  }

  /** The pages and the open one: the name and the dots (written only when they change). */
  set(pages: readonly StripPage[], current: string | null): void {
    const key = `${pages.map((p) => `${p.id}=${p.label}`).join('|')}#${current}`;
    if (key === this.key) return;
    this.key = key;
    const page = pages.find((p) => p.id === current);
    this.label = page?.label ?? '';
    this.el.setAttribute('aria-label', stripLabel(pages, current));
    const doc = this.el.ownerDocument;
    this.dots.replaceChildren(
      ...pages.map((p) => {
        const i = doc.createElement('i');
        if (p.id === current) i.className = 'is-on';
        i.dataset.page = p.id;
        return i;
      }),
    );
    // One page: nothing to swipe to, no dots.
    this.dots.hidden = pages.length < 2;
  }

  /**
   * Over the strip's rows: `top` and `height` px; 0 hides it. `width`
   * (landscape, where the strip is the left column's upper part): its
   * width in px; absent: the full width.
   */
  place(top: number, height: number, width?: number): void {
    const key = height > 0 ? `${top},${height},${width ?? ''}` : '';
    if (key === this.placeKey) return;
    this.placeKey = key;
    if (height > 0) {
      this.el.style.top = `${top}px`;
      this.el.style.height = `${height}px`;
      this.el.style.width = width === undefined ? '' : `${width}px`;
    }
    this.el.hidden = height <= 0;
  }
}

/**
 * Keeps a sideways swipe on `el` (the strip's pane) from becoming a
 * browser fling. A fast swipe otherwise starts one (though nothing scrolls
 * sideways), and Chromium then swallows the next tap for about a second
 * ("tap stops the fling"): the panes key right after a swipe would do
 * nothing. Only moves that go more sideways than up or down are held back;
 * a vertical drag scrolls the pane as before. The listener is the pane's
 * own (not the cockpit's: the game text's scrolling never waits for it).
 * Returns the uninstaller.
 */
export function holdFling(el: HTMLElement): () => void {
  let x = 0;
  let y = 0;
  const start = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (!t) return;
    x = t.clientX;
    y = t.clientY;
  };
  const move = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (!t || e.touches.length !== 1 || !e.cancelable) return;
    const dx = Math.abs(t.clientX - x);
    if (dx > 6 && dx > Math.abs(t.clientY - y)) e.preventDefault();
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  return () => {
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchmove', move);
  };
}

/**
 * Watches `root` for swipes that begin where `inStrip` says (the strip's
 * pane or its chrome) and calls `onStep` with +1 or −1. The click that a
 * browser may send after a swipe is swallowed. Returns the uninstaller.
 */
export function watchSwipes(root: HTMLElement, inStrip: (target: Element) => boolean, onStep: (step: -1 | 1) => void): () => void {
  let start: { id: number; x: number; y: number; t: number } | null = null;
  let swallowUntil = 0;
  const now = (): number => root.ownerDocument.defaultView?.performance.now() ?? Date.now();
  const down = (e: PointerEvent): void => {
    start = null;
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const t = e.target;
    if (!(t instanceof Element) || !inStrip(t)) return;
    start = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now() };
  };
  const up = (e: PointerEvent): void => {
    const s = start;
    if (!s || e.pointerId !== s.id) return;
    start = null;
    const step = swipeStep(e.clientX - s.x, e.clientY - s.y, now() - s.t);
    if (step === 0) return;
    swallowUntil = now() + 400;
    onStep(step);
  };
  const cancel = (e: PointerEvent): void => {
    if (start && e.pointerId === start.id) start = null;
  };
  const click = (e: MouseEvent): void => {
    if (now() > swallowUntil) return;
    swallowUntil = 0;
    // Only the swipe's own click (on the strip): a quick tap elsewhere is a tap.
    if (!(e.target instanceof Element) || !inStrip(e.target)) return;
    e.stopPropagation();
    e.preventDefault();
  };
  root.addEventListener('pointerdown', down, { capture: true, passive: true });
  root.addEventListener('pointerup', up, { capture: true, passive: true });
  root.addEventListener('pointercancel', cancel, { capture: true, passive: true });
  root.addEventListener('click', click, true);
  return () => {
    root.removeEventListener('pointerdown', down, true);
    root.removeEventListener('pointerup', up, true);
    root.removeEventListener('pointercancel', cancel, true);
    root.removeEventListener('click', click, true);
  };
}
