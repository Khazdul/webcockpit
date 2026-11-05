// Pane tooltips (ADR 0122): one tooltip per document for the modern panes
// (Group, Timers). Any element with `data-tip` (the text) and optionally
// `data-tip-title` (a bold first line) shows it while hovered, in the menu
// surface colours (`--sf-*`, ADR 0116), instead of the browser's `title`.
//
//   <span data-tip="HP 37/158 · 23%" data-tip-key="m12:hp">…</span>
//
// - `installPaneTooltip(doc)` returns the document's one instance (no side
//   effects). A pane hands it its content: `this.own(tip.attach(content))`
//   adds the hover listeners to that element; the returned function
//   removes them (and hides a tooltip shown for something inside it).
// - The tooltip shows after `PANE_TIP_DELAY_MS` of hover, below the
//   element (above when there is no room), kept inside the viewport. It
//   hides on leave, pointer down, wheel and a scroll of what holds the anchor. Its element is on
//   `doc.body` and the document listeners (down, scroll, wheel) are there
//   only while it is shown, so nothing is left behind when the panes go.
// - Panes that rebuild a row while a tooltip is shown (a new vital) call
//   `refresh()` after rendering: the text is read again; an anchor that
//   left the document is replaced by the element with the same
//   `data-tip-key` in the same attached root (the pane), if any, else the
//   tooltip hides. The same holds for an element rebuilt during the hover
//   delay. Elements kept across renders just have their data updated
//   (`setTip` writes only what changed). A countdown's tooltip is live
//   (`setLiveTip`): its text is read when shown and on `refresh`, so a
//   tick writes nothing to the elements nobody hovers.
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
  /** The attached root the anchor (or the pending element) is in: where a rebuilt one is looked for. */
  private root: HTMLElement | null = null;
  private readonly roots = new Set<HTMLElement>();
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
  }

  /** Shows tooltips for the `[data-tip]` elements inside `root`. Returns the detach function. */
  attach(root: HTMLElement): () => void {
    this.roots.add(root);
    root.addEventListener('pointerover', this.onOver);
    root.addEventListener('pointerout', this.onOut);
    return () => {
      this.roots.delete(root);
      root.removeEventListener('pointerover', this.onOver);
      root.removeEventListener('pointerout', this.onOut);
      const inside = (n: Node | null): boolean => n !== null && root.contains(n);
      if (inside(this.anchor) || inside(this.pending)) this.hide();
    };
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
    this.root = this.rootOf(el);
    if (!this.el.isConnected) {
      this.doc.body.append(this.el);
      this.doc.addEventListener('pointerdown', this.onDown, true);
      this.doc.addEventListener('scroll', this.onScroll, true);
      this.doc.addEventListener('wheel', this.onDown, { capture: true, passive: true });
    }
    this.el.hidden = false;
    this.fill();
  }

  /** Hides the tooltip. */
  hide(): void {
    this.cancel();
    this.anchor = null;
    this.key = null;
    this.root = null;
    this.el.hidden = true;
    if (this.el.isConnected) {
      this.el.remove();
      this.doc.removeEventListener('pointerdown', this.onDown, true);
      this.doc.removeEventListener('scroll', this.onScroll, true);
      this.doc.removeEventListener('wheel', this.onDown, true);
    }
  }

  /** Re-reads the shown tooltip (after a pane rebuilt its DOM). */
  refresh(): void {
    let a = this.anchor;
    if (!a) return;
    if (!a.isConnected) {
      a = this.find(this.root, this.key);
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

  /** Hides it (nothing else to free: listeners live on the attached roots). */
  dispose(): void {
    this.hide();
  }

  /** The element with tip key `key` in `root`, or null. */
  private find(root: HTMLElement | null, key: string | null): HTMLElement | null {
    if (!root || key === null || !root.isConnected) return null;
    for (const el of root.querySelectorAll<HTMLElement>('[data-tip-key]')) {
      if (el.dataset.tipKey === key) return el;
    }
    return null;
  }

  private rootOf(el: HTMLElement): HTMLElement | null {
    for (const r of this.roots) if (r.contains(el)) return r;
    return null;
  }

  private fill(): void {
    const a = this.anchor!;
    const title = a.dataset.tipTitle ?? '';
    this.titleEl.textContent = title;
    this.titleEl.hidden = title === '';
    // A body that only repeats the title is left out. A live text is read now.
    const body = LIVE.get(a)?.() ?? a.dataset.tip ?? '';
    this.bodyEl.textContent = body === title ? '' : body;
    this.bodyEl.hidden = body === '' || body === title;
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
    const key = el.dataset.tipKey ?? null;
    const root = e.currentTarget as HTMLElement | null;
    this.timer = setTimeout(() => {
      this.timer = null;
      let p = this.pending;
      this.pending = null;
      // The pane rebuilt the element under the pointer during the delay:
      // follow it by its key, as `refresh` does.
      if (p && !p.isConnected) p = this.find(root, key);
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

  /** Only a scroll that moves the anchor hides it: the game output scrolls all the time. */
  private readonly onScroll = (e: Event): void => {
    const t = e.target;
    const a = this.anchor ?? this.pending;
    if (!a) return;
    if (t === this.doc || (t instanceof Node && t.contains(a))) this.hide();
  };
}

const INSTANCES = new WeakMap<Document, PaneTooltip>();

/** The document's pane tooltip, created on the first call (no listeners until `attach`). */
export function installPaneTooltip(doc: Document): PaneTooltip {
  let t = INSTANCES.get(doc);
  if (!t) {
    t = new PaneTooltip(doc);
    INSTANCES.set(doc, t);
  }
  return t;
}

/** Sets `data-<k>` to `v`, or removes it for an empty value; only on a change. */
function setData(el: HTMLElement, k: 'tip' | 'tipTitle' | 'tipKey', v: string | null | undefined): void {
  if (v) {
    if (el.dataset[k] !== v) el.dataset[k] = v;
  } else if (k in el.dataset) delete el.dataset[k];
}

/**
 * Sets (or clears, with null) the tooltip data of `el`, writing only what
 * changed (a 1 Hz tick must not touch an unchanged element).
 */
export function setTip(el: HTMLElement, text: string | null, title?: string | null, key?: string | null): void {
  const on = text !== null && text !== '';
  LIVE.delete(el);
  setData(el, 'tip', on ? text : null);
  setData(el, 'tipTitle', on ? title : null);
  setData(el, 'tipKey', on ? key : null);
}

/** Texts read when shown (`setLiveTip`), by element. */
const LIVE = new WeakMap<Element, () => string>();

/**
 * A tooltip whose text changes all the time (a countdown's exact time): the
 * text is read from `text()` when the tooltip shows and on `refresh`, so a
 * tick writes nothing to the elements nobody hovers. `data-tip` holds
 * `live` (it marks the element as tipped).
 */
export function setLiveTip(el: HTMLElement, text: () => string, title: string | null, key: string | null): void {
  LIVE.set(el, text);
  setData(el, 'tip', 'live');
  setData(el, 'tipTitle', title);
  setData(el, 'tipKey', key);
}
