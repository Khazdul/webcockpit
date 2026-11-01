// The menu bar's tooltip (ADR 0099): one small label above the hovered
// control, in the ghost look and the menu surface colours (ADR 0116),
// instead of the browser's `title` (which is slow, unstyled, and frozen
// while shown). Its text is read from a function, so `refresh()` keeps a
// shown tooltip live (the clock's countdown, the link's RTT). Hidden on
// pointer down and on leave.

/** Hover time before the tooltip shows. */
export const TIP_DELAY_MS = 350;
/** Gap between the tooltip and its control, and the least margin to the viewport edge. */
const GAP = 4;

interface TipTarget {
  text: () => string;
  /** False while the tooltip must not show (its popup is open). */
  enabled: () => boolean;
}

export class Tooltip {
  readonly el: HTMLDivElement;
  private readonly targets = new Map<HTMLElement, TipTarget>();
  private shownFor: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly offs: Array<() => void> = [];

  constructor(layer: HTMLElement) {
    const doc = layer.ownerDocument;
    this.el = doc.createElement('div');
    this.el.className = 'wc-mb-tip';
    this.el.setAttribute('role', 'tooltip');
    this.el.hidden = true;
    layer.append(this.el);
  }

  /** Shows `text()` above `target` while it is hovered. */
  attach(target: HTMLElement, text: () => string, enabled: () => boolean = () => true): void {
    this.targets.set(target, { text, enabled });
    const enter = (): void => {
      this.cancel();
      this.timer = setTimeout(() => {
        this.timer = null;
        this.show(target);
      }, TIP_DELAY_MS);
    };
    const leave = (): void => {
      this.cancel();
      if (this.shownFor === target) this.hide();
    };
    target.addEventListener('pointerenter', enter);
    target.addEventListener('pointerleave', leave);
    target.addEventListener('pointerdown', leave);
    this.offs.push(() => {
      target.removeEventListener('pointerenter', enter);
      target.removeEventListener('pointerleave', leave);
      target.removeEventListener('pointerdown', leave);
    });
  }

  /** The control the tooltip is shown for, or null. */
  get target(): HTMLElement | null {
    return this.shownFor;
  }

  /** Shows the tooltip for `target` now (hover after the delay; tests). */
  show(target: HTMLElement): void {
    const t = this.targets.get(target);
    if (!t || !t.enabled() || !target.isConnected) return;
    this.shownFor = target;
    this.el.hidden = false;
    this.refresh();
  }

  /** Re-reads the shown tooltip's text and places it again. */
  refresh(): void {
    const target = this.shownFor;
    if (!target) return;
    const t = this.targets.get(target)!;
    if (!t.enabled() || !target.isConnected) {
      this.hide();
      return;
    }
    const text = t.text();
    if (this.el.textContent !== text) this.el.textContent = text;
    this.place(target);
  }

  hide(): void {
    this.cancel();
    this.shownFor = null;
    this.el.hidden = true;
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Centred above `target`, kept inside the viewport. */
  private place(target: HTMLElement): void {
    const r = target.getBoundingClientRect();
    const win = target.ownerDocument.defaultView;
    const vw = win?.innerWidth ?? 0;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const left = Math.max(GAP, Math.min(r.left + r.width / 2 - w / 2, vw - w - GAP));
    const top = Math.max(GAP, r.top - h - GAP);
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
  }

  dispose(): void {
    this.cancel();
    for (const off of this.offs.splice(0)) off();
    this.targets.clear();
    this.el.remove();
  }
}
