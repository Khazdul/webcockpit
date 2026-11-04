// Pane tooltips (ADR 0122): one tooltip per document for the modern panes
// (Group, Timers). Any element with `data-tip` (the text) and optionally
// `data-tip-title` (a bold first line) shows it while hovered, in the menu
// surface colours (`--sf-*`, ADR 0116), instead of the browser's `title`.
//
//   <span data-tip="HP 37/158 · 23%" data-tip-key="m12:hp">…</span>
//
// - `installPaneTooltip(doc)` is idempotent: the first call creates the
//   element (on `doc.body`) and one set of delegated listeners; later calls
//   return the same instance. Panes call it in their constructor.
// - The tooltip shows after `PANE_TIP_DELAY_MS` of hover, below the
//   element (above when there is no room), kept inside the viewport. It
//   hides on leave, pointer down, scroll and wheel.
// - Panes that rebuild their DOM while a tooltip is shown (a countdown, a
//   new vital) call `refresh()` after rendering: the text is read again; an
//   anchor that left the document is replaced by the element with the same
//   `data-tip-key`, if any, else the tooltip hides. So a ticking tooltip
//   stays up while the row under it is rebuilt.
// - Pure DOM, no timers while nothing is hovered. Also used in the replay
//   bundle (the CSS is imported here).

import './pane-tooltip.css';

/** Hover time before a pane tooltip shows, ms. */
export const PANE_TIP_DELAY_MS = 250;
/** Gap between the anchor and the tooltip, and the least margin to the viewport edge, px. */
const GAP = 6;
const MARGIN = 4;

/** Where a tooltip of size `w × h` goes for an anchor box `b` in a `vw × vh` viewport. */
export function tipPlace(
  b: { left: number; top: number; bottom: number; width: number },
  w: number,
  h: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  const below = b.bottom + GAP;
  const top = below + h <= vh - MARGIN || b.top - GAP - h < MARGIN ? below : b.top - GAP - h;
  const centre = b.left + b.width / 2 - w / 2;
  const left = Math.max(MARGIN, Math.min(centre, vw - MARGIN - w));
  return { left: Math.round(left), top: Math.round(Math.max(MARGIN, top)) };
}

export class PaneTooltip {
  readonly el: HTMLDivElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly doc: Document;
  private anchor: HTMLElement | null = null;
  private key: string | null = null;
  private pending: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(doc: Document) {
    this.doc = doc;
    this.el = doc.createElement('div');
    this.el.className = 'wc-ptip';
    this.el.setAttribute('role', 'tooltip');
    this.el.hidden = true;
    this.titleEl = doc.createElement('b');
    this.bodyEl = doc.createElement('span');
    this.el.append(this.titleEl, this.bodyEl);
    doc.body.append(this.el);
    doc.addEventListener('pointerover', this.onOver, true);
    doc.addEventListener('pointerout', this.onOut, true);
    doc.addEventListener('pointerdown', this.onDown, true);
    doc.addEventListener('scroll', this.onDown, true);
    doc.addEventListener('wheel', this.onDown, { capture: true, passive: true });
  }

  /** The element the tooltip is shown for, or null. */
  get target(): HTMLElement | null {
    return this.anchor;
  }

  /** Shows the tooltip for `el` now (hover after the delay; tests). */
  show(el: HTMLElement): void {
    this.cancel();
    if (!el.isConnected || !el.dataset.tip) return;
    this.anchor = el;
    this.key = el.dataset.tipKey ?? null;
    this.el.hidden = false;
    this.fill();
  }

  /** Hides the tooltip. */
  hide(): void {
    this.cancel();
    this.anchor = null;
    this.key = null;
    this.el.hidden = true;
  }

  /** Re-reads the shown tooltip (after a pane rebuilt its DOM). */
  refresh(): void {
    let a = this.anchor;
    if (!a) return;
    if (!a.isConnected) {
      a = this.key !== null ? this.find(this.key) : null;
      if (!a) {
        this.hide();
        return;
      }
      this.anchor = a;
    }
    if (!a.dataset.tip) {
      this.hide();
      return;
    }
    this.fill();
  }

  dispose(): void {
    this.hide();
    this.doc.removeEventListener('pointerover', this.onOver, true);
    this.doc.removeEventListener('pointerout', this.onOut, true);
    this.doc.removeEventListener('pointerdown', this.onDown, true);
    this.doc.removeEventListener('scroll', this.onDown, true);
    this.doc.removeEventListener('wheel', this.onDown, true);
    this.el.remove();
  }

  private find(key: string): HTMLElement | null {
    for (const el of this.doc.querySelectorAll<HTMLElement>('[data-tip-key]')) {
      if (el.dataset.tipKey === key) return el;
    }
    return null;
  }

  private fill(): void {
    const a = this.anchor!;
    const title = a.dataset.tipTitle ?? '';
    this.titleEl.textContent = title;
    this.titleEl.hidden = title === '';
    this.bodyEl.textContent = a.dataset.tip ?? '';
    const win = this.doc.defaultView;
    const b = a.getBoundingClientRect();
    const p = tipPlace(b, this.el.offsetWidth, this.el.offsetHeight, win?.innerWidth ?? 0, win?.innerHeight ?? 0);
    this.el.style.left = `${p.left}px`;
    this.el.style.top = `${p.top}px`;
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }

  private readonly onOver = (e: Event): void => {
    const t = e.target as Element | null;
    const el = t && typeof t.closest === 'function' ? t.closest<HTMLElement>('[data-tip]') : null;
    if (!el) return;
    if (el === this.anchor || el === this.pending) return;
    this.cancel();
    if (this.anchor) {
      // Moving from one tipped element to the next: no second delay.
      this.show(el);
      return;
    }
    this.pending = el;
    this.timer = setTimeout(() => {
      this.timer = null;
      const p = this.pending;
      this.pending = null;
      if (p) this.show(p);
    }, PANE_TIP_DELAY_MS);
  };

  private readonly onOut = (e: Event): void => {
    const pe = e as PointerEvent;
    const from = (pe.target as Element | null)?.closest?.('[data-tip]') ?? null;
    if (!from) return;
    const to = (pe.relatedTarget as Element | null)?.closest?.('[data-tip]') ?? null;
    if (to === from) return;
    if (from === this.pending) this.cancel();
    if (from === this.anchor && !to) this.hide();
  };

  private readonly onDown = (): void => {
    if (this.anchor || this.pending) this.hide();
  };
}

const INSTANCES = new WeakMap<Document, PaneTooltip>();

/** The document's pane tooltip, created on the first call. */
export function installPaneTooltip(doc: Document): PaneTooltip {
  let t = INSTANCES.get(doc);
  if (!t || !t.el.isConnected) {
    t = new PaneTooltip(doc);
    INSTANCES.set(doc, t);
  }
  return t;
}

/** Sets (or clears, with null) the tooltip data of `el`. */
export function setTip(el: HTMLElement, text: string | null, title?: string | null, key?: string | null): void {
  if (text === null || text === '') {
    delete el.dataset.tip;
    delete el.dataset.tipTitle;
    delete el.dataset.tipKey;
    return;
  }
  el.dataset.tip = text;
  if (title) el.dataset.tipTitle = title;
  else delete el.dataset.tipTitle;
  if (key) el.dataset.tipKey = key;
  else delete el.dataset.tipKey;
}
