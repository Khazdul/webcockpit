// A bottom-anchored message list with native pixel scrolling (ADR 0052,
// amending Inv §2.4 "Scroll" and §2.7.5): the Comm and UI panes' lists.
//
//   .wc-alist                 flex: 1, overflow-y auto (bar hidden), position relative
//     .wc-alist-stack         margin-top auto: the items, newest last, at the bottom
//   .wc-alist-more            the `↓ N newer messages` row (hidden when live)
//
// - The wheel and the touchpad scroll the list by pixels (the browser's own
//   scrolling, as CodeMirror in EDITOR). Nothing steps by message.
// - Live: the view is at the bottom (within 2 px). A render while live
//   sticks to the bottom, so new messages follow; scrolled back, appended
//   messages land below the view and it stays put. Items trimmed off the
//   top while scrolled back are made up for in `scrollTop`.
// - The indicator counts the items not wholly in view below it; a mouse
//   down on it returns to live.
// - `resting` follows `live` once the scrolling has come to rest
//   (`SETTLE_MS` without a scroll event), and only then does the owner hear
//   of it (`onChange`): what changes heights (Comm timestamps) waits for it.
//   Firefox keeps animating a wheel scroll after a script writes
//   `scrollTop`, so heights changed mid-gesture fought the animation.
// - Every item is in the DOM (the panes cap their history at 1000). A render
//   appends the new items and drops the trimmed ones; it rebuilds all only
//   when `key` (what the builder depends on) changed or the items are not
//   the previous ones plus new ones. One render per frame (the pane's), so a
//   burst of messages costs one append and one scroll write.
//
// Layout is read through `ListMetrics`; tests inject a model.

/** How the list reads and writes layout (px). */
export interface ListMetrics {
  scrollTop(list: HTMLElement): number;
  setScrollTop(list: HTMLElement, px: number): void;
  clientHeight(list: HTMLElement): number;
  scrollHeight(list: HTMLElement): number;
  /** An item's top in the list's content (independent of scrolling). */
  itemTop(el: HTMLElement): number;
  itemHeight(el: HTMLElement): number;
}

const DOM_METRICS: ListMetrics = {
  scrollTop: (l) => l.scrollTop,
  setScrollTop: (l, px) => void (l.scrollTop = px),
  clientHeight: (l) => l.clientHeight,
  scrollHeight: (l) => l.scrollHeight,
  itemTop: (el) => el.offsetTop,
  itemHeight: (el) => el.offsetHeight,
};

/** Distance from the bottom (px) that still counts as live. */
export const LIVE_SLACK_PX = 2;

/** Quiet time (ms) after the last scroll event before `resting` follows. */
export const SETTLE_MS = 150;

const BOTTOM = Number.MAX_SAFE_INTEGER;

export class AnchoredList<T = unknown> {
  /** The scrolling list area (flex item). */
  readonly el: HTMLDivElement;
  /** The indicator row; the owner places it below `el`. */
  readonly more: HTMLDivElement;
  private readonly stack: HTMLDivElement;
  private readonly onChange: () => void;
  private readonly metrics: ListMetrics;
  private items: T[] = [];
  private els: HTMLElement[] = [];
  private key: string | null = null;
  private _live = true;
  private _resting = true;
  private readonly settleMs: number;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTop = 0;
  private hiddenBelow = 0;
  private moreText: (n: number) => string = (n) => `↓ ${n}`;

  constructor(doc: Document, onChange: () => void, opts: { metrics?: ListMetrics; settleMs?: number } = {}) {
    this.onChange = onChange;
    this.metrics = opts.metrics ?? DOM_METRICS;
    this.settleMs = opts.settleMs ?? SETTLE_MS;
    this.el = doc.createElement('div');
    this.el.className = 'wc-alist';
    this.stack = doc.createElement('div');
    this.stack.className = 'wc-alist-stack';
    this.el.append(this.stack);
    this.more = doc.createElement('div');
    this.more.className = 'wc-alist-more';
    this.more.hidden = true;
    this.el.addEventListener('scroll', this.onScroll, { passive: true });
    this.more.addEventListener('mousedown', this.onMore);
  }

  /** True while the view is at the bottom (new items follow). */
  get live(): boolean {
    return this._live;
  }

  /** True while scrolled back. */
  get scrolled(): boolean {
    return !this._live;
  }

  /** `live` as of the last time the scrolling came to rest. */
  get resting(): boolean {
    return this._resting;
  }

  /** Items not wholly in view below it (0 while live). */
  get below(): number {
    return this.hiddenBelow;
  }

  /** The rendered items' elements, oldest first. */
  get elements(): readonly HTMLElement[] {
    return this.els;
  }

  /** The item rendered at index `i`. */
  itemAt(i: number): T | undefined {
    return this.items[i];
  }

  /** Back to the live bottom. */
  toLive(): void {
    this._live = true;
    this.metrics.setScrollTop(this.el, BOTTOM);
    this.lastTop = this.metrics.scrollTop(this.el);
    this.setMore(0);
    this.settle();
  }

  /**
   * Runs `mutate` (a change of the items' heights, e.g. timestamps on or
   * off) keeping the item at the top of the view where it is; live, the
   * view sticks to the bottom instead.
   */
  keepView(mutate: () => void): void {
    const m = this.metrics;
    if (this._live || this.els.length === 0) {
      mutate();
      if (this._live) this.toBottom();
      return;
    }
    const top = m.scrollTop(this.el);
    const i = this.firstBelow(top);
    const anchor = this.els[Math.min(i, this.els.length - 1)]!;
    const off = m.itemTop(anchor) - top;
    mutate();
    m.setScrollTop(this.el, m.itemTop(anchor) - off);
    this.lastTop = m.scrollTop(this.el);
    this.updateMore();
  }

  /**
   * Shows `items` (oldest first). `build(item)` makes an item's element;
   * `key` names everything `build` depends on besides the item.
   * `moreText(n)` is the indicator text for n items below the view.
   */
  render(items: readonly T[], build: (item: T) => HTMLElement, key: string, moreText: (n: number) => string): void {
    const m = this.metrics;
    this.moreText = moreText;
    // Back on screen after being detached or hidden (scrollTop reset to 0).
    if (!this._live && this.lastTop > 1 && m.scrollTop(this.el) === 0) m.setScrollTop(this.el, this.lastTop);
    const old = this.items;
    let trim = -1;
    if (key === this.key && old.length > 0 && items.length > 0) {
      const s = old.indexOf(items[0]!);
      if (s >= 0 && items.length >= old.length - s) {
        trim = s;
        for (let j = 0; j < old.length - s; j++) {
          if (items[j] !== old[s + j]) {
            trim = -1;
            break;
          }
        }
      }
    }
    if (trim >= 0) {
      const kept = old.length - trim;
      if (trim === 0 && kept === items.length) {
        // Nothing new (a resize or a theme render): follow the bottom, recount.
        if (this._live) this.toBottom();
        else this.updateMore();
        return;
      }
      // Read before writing: the height of what goes off the top.
      const trimH = trim > 0 && !this._live ? m.itemTop(this.els[trim]!) - m.itemTop(this.els[0]!) : 0;
      for (let j = 0; j < trim; j++) this.els[j]!.remove();
      const added: HTMLElement[] = [];
      for (let j = kept; j < items.length; j++) added.push(build(items[j]!));
      if (added.length) this.stack.append(...added);
      this.els = this.els.slice(trim).concat(added);
      if (trimH > 0) {
        m.setScrollTop(this.el, this.lastTop - trimH);
        this.lastTop = m.scrollTop(this.el);
      }
    } else {
      this.key = key;
      this.els = items.map(build);
      this.stack.replaceChildren(...this.els);
    }
    this.items = items.slice();
    if (this._live) this.toBottom();
    else this.updateMore();
  }

  private toBottom(): void {
    this.metrics.setScrollTop(this.el, BOTTOM);
    this.setMore(0);
  }

  /** Index of the first item whose bottom is below `y` (+ half a pixel). */
  private firstBelow(y: number): number {
    const m = this.metrics;
    let lo = 0;
    let hi = this.els.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const el = this.els[mid]!;
      if (m.itemTop(el) + m.itemHeight(el) > y + 0.5) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  private countBelow(): number {
    const m = this.metrics;
    return this.els.length - this.firstBelow(m.scrollTop(this.el) + m.clientHeight(this.el));
  }

  private updateMore(): void {
    if (this._live) return this.setMore(0);
    const n = this.countBelow();
    const toggled = this.more.hidden !== (n === 0);
    this.setMore(n);
    // The row took (or gave back) a row of the list: count again.
    if (toggled) this.setMore(this.countBelow());
  }

  private setMore(n: number): void {
    this.hiddenBelow = n;
    this.more.hidden = n === 0;
    if (n > 0) {
      const t = this.moreText(n);
      if (this.more.textContent !== t) this.more.textContent = t;
    }
  }

  private readonly onScroll = (): void => {
    const m = this.metrics;
    const top = m.scrollTop(this.el);
    const live = top + m.clientHeight(this.el) >= m.scrollHeight(this.el) - LIVE_SLACK_PX;
    this.lastTop = top;
    this._live = live;
    this.updateMore();
    if (this.settleMs <= 0) return this.settle();
    const win = this.el.ownerDocument.defaultView;
    if (this.settleTimer !== null) (win ? win.clearTimeout.bind(win) : clearTimeout)(this.settleTimer);
    this.settleTimer = (win ? win.setTimeout.bind(win) : setTimeout)(this.settle, this.settleMs);
  };

  private readonly settle = (): void => {
    this.settleTimer = null;
    if (this._resting === this._live) return;
    this._resting = this._live;
    this.onChange();
  };

  private readonly onMore = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    this.toLive();
  };

  /** Number of items at the last render (tests). */
  get size(): number {
    return this.items.length;
  }

  dispose(): void {
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.el.removeEventListener('scroll', this.onScroll);
    this.more.removeEventListener('mousedown', this.onMore);
  }
}

/**
 * The wheel over a pane outside its scroller (the frame, the title-row grip,
 * the Comm header) scrolls the scroller by the same pixels, unless a
 * listener before it took the event (a script pane's `onWheel`, ADR 0072).
 * Returns the unsubscribe function.
 */
export function forwardWheel(pane: HTMLElement, scroller: () => HTMLElement | null, cellH: () => number): () => void {
  const on = (e: WheelEvent): void => {
    const s = scroller();
    if (!s || e.defaultPrevented || s.contains(e.target as Node)) return;
    const h = cellH() || 16;
    const px = e.deltaMode === 1 ? e.deltaY * h : e.deltaMode === 2 ? e.deltaY * s.clientHeight : e.deltaY;
    if (px) s.scrollTop += px;
  };
  pane.addEventListener('wheel', on, { passive: true });
  return () => pane.removeEventListener('wheel', on);
}
