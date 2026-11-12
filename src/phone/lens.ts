// The phone's map lens (ADR 0136 §4): the dressing over the map pane.
//
// The map itself is the cockpit's one map pane (one worker, one canvas,
// one map load): the cockpit places it borderless in a rectangle of whole
// cells (`Cockpit.setPhoneLens`) and phone.css clips it to a circle
// (`clip-path` on the pane; no second canvas). This module draws what lies
// over it, as static DOM painted once: the cast-iron ring, the glass with
// its window reflection and edge darkening, the outer shadow, and a pip
// for each zoom level. No filter, no backdrop filter, no animation:
// the game text scrolling under it repaints nothing here.
//
// - A tap on the lens steps the zoom one level out, and from the furthest
//   back to the nearest (four levels, lens-zoom.ts); the level is kept in
//   memory and starts at the setting's "Opens at". The lens button covers
//   the map, so the map takes no pan or pinch.
// - Three round keys sit on the lens's corners: top left **panes** (opens
//   and closes the pane strip; only while the strip has a page), top right
//   **fullscreen** (only where the browser can put the page in fullscreen;
//   gone for good once a request was refused), bottom right **Comm** with
//   the unread count. While the lens is hidden (the setting, or something
//   it would collide with) the keys stay as a row at the top right.

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
const PANES_ICON = 'M5 14h14M5 18h14';
const COMM_ICON = 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z';

/** The keys, in the row's order (the lens's corners: top left, top right, bottom right). */
export type SatName = 'panes' | 'fullscreen' | 'comm';
const SATS: readonly { name: SatName; corner: string; icon: string; label: string }[] = [
  { name: 'panes', corner: 'is-tl', icon: PANES_ICON, label: 'Show panes' },
  { name: 'fullscreen', corner: 'is-tr', icon: FULLSCREEN_ICON, label: 'Fullscreen' },
  { name: 'comm', corner: 'is-br', icon: COMM_ICON, label: 'Open Comm' },
];

export interface LensDeps {
  /** The level stepped to: the caller zooms the map. */
  onLevel(level: LensLevel): void;
  /** The fullscreen key: null where the browser cannot (no key then). */
  fullscreen: (() => void) | null;
  /** The panes key: opens or closes the pane strip. */
  panes(): void;
  /** The Comm key: opens or closes Comm. */
  comm(): void;
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
  private level: LensLevel = 'z1';
  private placeKey = '';
  private rowKey = '';
  /** Each key twice: on the lens's corner, and in the row. Only one of the two hosts shows. */
  private readonly sats = new Map<SatName, HTMLButtonElement[]>();
  private readonly badges: HTMLSpanElement[] = [];
  private satKey = '';

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
    const acts: Record<SatName, (() => void) | null> = { panes: () => deps.panes(), fullscreen: deps.fullscreen, comm: () => deps.comm() };
    for (const sat of SATS) {
      const act = acts[sat.name];
      if (!act) continue;
      const pair: HTMLButtonElement[] = [];
      for (const [host, cls] of [
        [this.el, `wc-ph-sat ${sat.corner}`],
        [this.rowEl, 'wc-ph-sat'],
      ] as const) {
        const k = satKey(doc, cls, sat.label, sat.icon, act);
        k.dataset.sat = sat.name;
        if (sat.name === 'panes') {
          const r = doc.createElementNS(SVG_NS, 'rect');
          for (const [a, v] of Object.entries({ x: '3', y: '4', width: '18', height: '6', rx: '1.5' })) r.setAttribute(a, v);
          k.querySelector('svg')!.prepend(r);
        }
        if (sat.name === 'comm') {
          const badge = doc.createElement('span');
          badge.className = 'wc-ph-badge';
          badge.hidden = true;
          k.append(badge);
          this.badges.push(badge);
        }
        host.append(k);
        pair.push(k);
      }
      this.sats.set(sat.name, pair);
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
    for (const k of this.sats.get('fullscreen') ?? []) k.remove();
    this.sats.delete('fullscreen');
  }

  /**
   * The keys' state: whether the strip has a page (no panes key without
   * one), whether the strip and Comm are open (their keys lit), and the
   * Comm key's badge and name. Written only when something changed.
   */
  setKeys(o: { panes: boolean; stripOpen: boolean; commOpen: boolean; badge: string; commLabel: string }): void {
    const key = `${o.panes}|${o.stripOpen}|${o.commOpen}|${o.badge}|${o.commLabel}`;
    if (key === this.satKey) return;
    this.satKey = key;
    for (const k of this.sats.get('panes') ?? []) {
      k.hidden = !o.panes;
      lit(k, o.stripOpen, o.stripOpen ? 'Hide panes' : 'Show panes');
    }
    for (const k of this.sats.get('comm') ?? []) lit(k, o.commOpen, o.commLabel);
    for (const b of this.badges) {
      b.textContent = o.badge;
      b.hidden = o.badge === '';
    }
  }

  /**
   * Draws the lens at `place`, or hides it and shows the key row `rowTop`
   * px from the layer's top (when there is a key to show). `rowTop` null:
   * neither (the lens is wanted and not laid out yet: no row for a frame).
   */
  /** `rowRight`: the row's air to the right edge, px (more when it must stand left of the hot keys). */
  place(place: LensPlace | null, rowTop: number | null, rowRight = 8): void {
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
    const row = !place && rowTop !== null && this.sats.size > 0 ? `${rowTop},${rowRight}` : '';
    if (row !== this.rowKey) {
      this.rowKey = row;
      if (row) {
        this.rowEl.style.top = `${rowTop}px`;
        this.rowEl.style.right = `${rowRight}px`;
      }
      this.rowEl.hidden = !row;
    }
  }
}

/** A key lit (its feature is open) or not, with its name. */
function lit(k: HTMLButtonElement, on: boolean, label: string): void {
  k.classList.toggle('is-on', on);
  k.setAttribute('aria-pressed', on ? 'true' : 'false');
  k.setAttribute('aria-label', label);
  k.title = label;
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
