// The phone's map lens (ADR 0136 §4): the dressing over the map pane.
//
// The map itself is the cockpit's one map pane (one worker, one canvas,
// one map load): the cockpit places it borderless in a rectangle of whole
// cells (`Cockpit.setPhoneLens`) and phone.css clips it to a circle
// (`clip-path` on the pane; no second canvas). This module draws what lies
// over it, as static DOM painted once: the cast-iron ring, the glass with
// its window reflection and edge darkening, the outer shadow, and three
// pips for the zoom level. No filter, no backdrop filter, no animation:
// the game text scrolling under it repaints nothing here.
//
// - A tap on the lens steps the zoom (near → middle → far → near); the
//   level is kept in memory and starts at the setting's "Opens at". The
//   lens button covers the map, so the map takes no pan or pinch.
// - The fullscreen key sits on the lens's top right corner, only where the
//   browser can put the page in fullscreen (none otherwise; gone for good
//   once a request was refused). While the lens is hidden (the setting, or
//   no room for it) the key stays as a row at the top right.
// - The panes key and the Comm key come with their features (stage 51d).

import { type LensLevel, LENS_LEVELS, lensLabel, nextLevel } from './lens-zoom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The glass's window reflection (the mockups' four panes and the lower arc), 150 × 150. */
const REFLECTION =
  '<defs>' +
  '<linearGradient id="wc-ph-refl-pane" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="44" y2="36"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset="1" stop-color="#fff" stop-opacity=".22"/></linearGradient>' +
  '<linearGradient id="wc-ph-refl-arc" gradientUnits="userSpaceOnUse" x1="140" y1="88" x2="88" y2="140"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".20"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
  '</defs>' +
  '<g transform="translate(18 20) rotate(-12 23 19)" fill="url(#wc-ph-refl-pane)">' +
  '<path d="M4 5Q13 2 22 2V18H1.5Q1.5 12 4 5Z"/><path d="M24 2Q33 2 42 5Q44.5 12 44.5 18H24Z"/>' +
  '<path d="M1.5 20H22V36Q13 36 4 33Q1.5 26 1.5 20Z"/><path d="M24 20H44.5Q44.5 26 42 33Q33 36 24 36Z"/>' +
  '</g>' +
  '<path d="M139.6 88.7A66 66 0 0 1 88.7 139.6" fill="none" stroke="url(#wc-ph-refl-arc)" stroke-width="1.8" stroke-linecap="round"/>';

const FULLSCREEN_ICON = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';

export interface LensDeps {
  /** The level stepped to: the caller zooms the map. */
  onLevel(level: LensLevel): void;
  /** The fullscreen key: null where the browser cannot (no key then). */
  fullscreen: (() => void) | null;
}

/** Where the lens is drawn: its circle's box in px relative to the layer, or null (hidden). */
export interface LensPlace {
  left: number;
  top: number;
  size: number;
}

export class LensView {
  /** The lens: the tap target with ring, glass and pips, and the key on its corner. */
  readonly el: HTMLDivElement;
  /** The key row shown while the lens is hidden. */
  readonly rowEl: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private readonly pips: HTMLElement[] = [];
  private level: LensLevel = 'middle';
  private placeKey = '';
  private rowKey = '';
  private keys: HTMLButtonElement[] = [];

  constructor(doc: Document, deps: LensDeps) {
    this.el = doc.createElement('div');
    this.el.className = 'wc-ph-lens';
    this.el.hidden = true;
    const b = (this.button = doc.createElement('button'));
    b.type = 'button';
    b.className = 'wc-ph-lens-glass';
    b.tabIndex = -1;
    const refl = doc.createElementNS(SVG_NS, 'svg');
    refl.setAttribute('class', 'wc-ph-lens-refl');
    refl.setAttribute('viewBox', '0 0 150 150');
    refl.setAttribute('aria-hidden', 'true');
    refl.innerHTML = REFLECTION;
    const shine = doc.createElement('span');
    shine.className = 'wc-ph-lens-shine';
    const ring = doc.createElement('span');
    ring.className = 'wc-ph-lens-ring';
    const pips = doc.createElement('span');
    pips.className = 'wc-ph-lens-pips';
    for (const level of LENS_LEVELS) {
      const i = doc.createElement('i');
      i.dataset.level = level;
      pips.append(i);
      this.pips.push(i);
    }
    b.append(refl, shine, ring, pips);
    // The press keeps the focus (and the keyboard) where it is.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setLevel(nextLevel(this.level));
      deps.onLevel(this.level);
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.append(b);

    this.rowEl = doc.createElement('div');
    this.rowEl.className = 'wc-ph-satrow';
    this.rowEl.hidden = true;
    if (deps.fullscreen) {
      const go = deps.fullscreen;
      // One key on the lens's corner, one in the row: only one of the two shows.
      for (const [host, cls] of [
        [this.el, 'wc-ph-sat is-tr'],
        [this.rowEl, 'wc-ph-sat'],
      ] as const) {
        const k = satKey(doc, cls, 'Fullscreen', FULLSCREEN_ICON, go);
        k.dataset.sat = 'fullscreen';
        host.append(k);
        this.keys.push(k);
      }
    }
    this.setLevel(this.level);
  }

  /** The zoom level the pips and the name show. */
  get zoomLevel(): LensLevel {
    return this.level;
  }

  setLevel(level: LensLevel): void {
    this.level = level;
    for (const p of this.pips) p.classList.toggle('is-on', p.dataset.level === level);
    this.button.setAttribute('aria-label', lensLabel(level));
    this.el.dataset.level = level;
  }

  /** The browser refused fullscreen: the key goes for good. */
  dropFullscreen(): void {
    for (const k of this.keys.splice(0)) k.remove();
    this.rowEl.hidden = true;
  }

  /**
   * Draws the lens at `place`, or hides it and shows the key row `rowTop`
   * px from the layer's top (when there is a key to show).
   */
  place(place: LensPlace | null, rowTop: number): void {
    const key = place ? `${place.left},${place.top},${place.size}` : '';
    if (key !== this.placeKey) {
      this.placeKey = key;
      if (place) {
        const st = this.el.style;
        st.left = `${place.left}px`;
        st.top = `${place.top}px`;
        st.width = st.height = `${place.size}px`;
      }
      this.el.hidden = !place;
    }
    const row = !place && this.keys.length > 0 ? String(rowTop) : '';
    if (row !== this.rowKey) {
      this.rowKey = row;
      if (row) this.rowEl.style.top = `${rowTop}px`;
      this.rowEl.hidden = !row;
    }
  }
}

/** A round key on the lens's corner (or in the row): 40 px, an icon. */
function satKey(doc: Document, cls: string, label: string, icon: string, act: () => void): HTMLButtonElement {
  const k = doc.createElement('button');
  k.type = 'button';
  k.className = cls;
  k.tabIndex = -1;
  k.title = label;
  k.setAttribute('aria-label', label);
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'wc-ph-ico is-small');
  svg.setAttribute('aria-hidden', 'true');
  const p = doc.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', icon);
  svg.append(p);
  k.append(svg);
  k.addEventListener('mousedown', (e) => e.preventDefault());
  k.addEventListener('click', (e) => {
    e.stopPropagation();
    act();
  });
  return k;
}
