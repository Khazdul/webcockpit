// A small popup under an anchor in the menu surface colours (the Timers
// pane's herblore menu, ADR 0122 addendum; the Character card's `+` menu
// and its `+n` list, stage 77 F2b). Fixed, so a short pane does not clip
// it; Esc and a press outside it close it, and so does a pick. Pressing in
// it keeps the focus in the game input (mousedown is prevented).

import { isOwnKey } from '../core/own-keyboard';

export abstract class PopupMenu {
  readonly el: HTMLDivElement;
  protected anchor: HTMLElement | null = null;

  constructor(
    protected readonly doc: Document,
    cls: string,
    label: string,
    private readonly onClose: () => void,
  ) {
    this.el = doc.createElement('div');
    this.el.className = cls;
    this.el.setAttribute('role', 'menu');
    this.el.setAttribute('aria-label', label);
    this.el.hidden = true;
    this.el.addEventListener('mousedown', this.onMenuDown);
  }

  get open(): boolean {
    return !this.el.hidden && this.el.isConnected;
  }

  /** The element it hangs under while open. */
  get anchorEl(): HTMLElement | null {
    return this.anchor;
  }

  hide(): void {
    if (this.el.hidden && !this.el.isConnected) return;
    this.el.hidden = true;
    this.el.remove();
    this.anchor = null;
    this.doc.removeEventListener('keydown', this.onKey, true);
    this.doc.removeEventListener('pointerdown', this.onOutside, true);
    this.onClose();
  }

  dispose(): void {
    this.hide();
    this.el.removeEventListener('mousedown', this.onMenuDown);
  }

  /** Shows it under `anchor` (its rows already filled). */
  protected openAt(anchor: HTMLElement): void {
    this.anchor = anchor;
    if (!this.el.isConnected) this.doc.body.append(this.el);
    if (this.el.hidden) {
      this.el.hidden = false;
      this.doc.addEventListener('keydown', this.onKey, true);
      this.doc.addEventListener('pointerdown', this.onOutside, true);
    }
    this.place();
  }

  /** A press on `target` inside it (the left button). */
  protected abstract pressed(target: HTMLElement): void;

  protected place(): void {
    const a = this.anchor;
    const win = this.doc.defaultView;
    if (!a || !win) return;
    const r = a.getBoundingClientRect();
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    let left = Math.min(r.left, vw - w - 4);
    left = Math.max(4, left);
    let top = r.bottom + 2;
    if (top + h > vh - 4 && r.top - h - 2 >= 4) top = r.top - h - 2;
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(Math.max(4, top))}px`;
  }

  private readonly onMenuDown = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const t = e.target as HTMLElement | null;
    // `closest` from the element's own window (a replay window is another realm).
    if (e.button !== 0 || typeof t?.closest !== 'function') return;
    this.pressed(t);
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    // The Esc our keyboard sends on a page (ADR 0139 §4) acts on that page only.
    if (isOwnKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    this.hide();
  };

  private readonly onOutside = (e: PointerEvent): void => {
    const t = e.target as Node | null;
    if (t && (this.el.contains(t) || this.anchor?.contains(t))) return;
    this.hide();
  };
}
