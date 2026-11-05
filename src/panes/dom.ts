// Small DOM helpers of the modern panes (Group, Timers; ADR 0122): an
// element maker, setters that write only on a change (a 1 Hz tick must not
// touch what did not change), and the wall-clock second tick.

/** A `tag` element with class `cls` and, optionally, its text. */
export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const setText = (e: Element, t: string): void => {
  if (e.textContent !== t) e.textContent = t;
};

export const setClass = (e: Element, c: string): void => {
  if (e.getAttribute('class') !== c) e.setAttribute('class', c);
};

/** Sets attribute `k` to `v`, or removes it for null. */
export const setAttr = (e: Element, k: string, v: string | null): void => {
  if (v === null) {
    if (e.hasAttribute(k)) e.removeAttribute(k);
  } else if (e.getAttribute(k) !== v) e.setAttribute(k, v);
};

/** Sets a style property (also a `--custom` one); `''` removes it. */
export const setProp = (e: HTMLElement | SVGElement, k: string, v: string): void => {
  if (e.style.getPropertyValue(k) !== v) e.style.setProperty(k, v);
};

export const setHidden = (e: HTMLElement, h: boolean): void => {
  if (e.hidden !== h) e.hidden = h;
};

/** ms after a wall-clock second boundary at which a tick runs. */
export const TICK_LAG_MS = 5;

/**
 * One timer for a redraw just after the coming wall-clock second, so every
 * countdown on screen changes together. `arm` is a no-op while armed;
 * `stop` cancels. The document's window runs it (a pane in a replay
 * window ticks with that window).
 */
export class SecondTick {
  private timer: number | null = null;

  constructor(
    private readonly doc: Document,
    private readonly fire: () => void,
  ) {}

  get armed(): boolean {
    return this.timer !== null;
  }

  arm(now: number): void {
    if (this.timer !== null) return;
    const win = this.doc.defaultView;
    if (!win) return;
    this.timer = win.setTimeout(() => {
      this.timer = null;
      this.fire();
    }, 1000 - (now % 1000) + TICK_LAG_MS);
  }

  stop(): void {
    if (this.timer === null) return;
    this.doc.defaultView?.clearTimeout(this.timer);
    this.timer = null;
  }
}
