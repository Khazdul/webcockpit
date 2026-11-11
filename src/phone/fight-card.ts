// The phone's fight card (ADR 0136 §3): two names and two bars in the two
// rows the cockpit gives it while a fight is on. The DOM is built once;
// `set` writes only what changed (a name's text, a bar's scale), so a
// round of a fight costs two or three style writes and no layout of the
// game text. The bars scale by `transform`, never by width.

import type { FightCard } from './fight-model';

interface Side {
  name: HTMLSpanElement;
  fill: HTMLElement;
  shownName: string;
  shownPct: number | null | undefined;
}

export class FightCardView {
  readonly el: HTMLDivElement;
  private readonly left: Side;
  private readonly right: Side;

  constructor(doc: Document) {
    this.el = doc.createElement('div');
    this.el.className = 'wc-ph-fight';
    this.el.hidden = true;
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', 'Fight');
    const side = (cls: string, fill: string): Side => {
      const box = doc.createElement('div');
      box.className = `wc-ph-fight-side ${cls}`;
      const name = doc.createElement('span');
      name.className = 'wc-ph-fight-name';
      const bar = doc.createElement('span');
      bar.className = 'wc-ph-bar';
      const i = doc.createElement('i');
      i.className = fill;
      bar.append(i);
      box.append(name, bar);
      this.el.append(box);
      return { name, fill: i, shownName: '', shownPct: undefined };
    };
    this.left = side('is-left', 'is-hp');
    const vs = doc.createElement('div');
    vs.className = 'wc-ph-fight-vs';
    vs.textContent = 'vs';
    vs.setAttribute('aria-hidden', 'true');
    this.el.append(vs);
    this.right = side('is-right', 'is-foe');
  }

  /** Draws `card`; null leaves the last one (the caller hides the element). */
  set(card: FightCard | null): void {
    if (!card) return;
    this.side(this.left, card.left.name, card.left.pct);
    this.side(this.right, card.right.name, card.right.pct);
  }

  private side(s: Side, name: string, pct: number | null): void {
    if (name !== s.shownName) {
      s.shownName = name;
      s.name.textContent = name;
    }
    if (pct !== s.shownPct) {
      s.shownPct = pct;
      // An unknown bar is an empty track.
      s.fill.style.transform = `scaleX(${Math.max(0, Math.min(100, pct ?? 0)) / 100})`;
    }
  }

  /** Places the card at `top` px, `height` px high (the fight rows); 0 hides it. */
  place(top: number, height: number, on: boolean): void {
    const show = on && height > 0;
    if (show) {
      const st = this.el.style;
      const t = `${top}px`;
      const h = `${height}px`;
      if (st.top !== t) st.top = t;
      if (st.height !== h) st.height = h;
    }
    if (this.el.hidden === show) this.el.hidden = !show;
  }
}
