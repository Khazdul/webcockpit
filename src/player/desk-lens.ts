// The desktop lens of a shared run (stage 71, ADR 0160): the map as a round
// lens at the top right of the player, always on, with Group and Timers as
// floating panes at the bottom right that the lens's keys turn on and off.
// Mounted by the player host over each player App it builds when the host
// plays a shared run on a computer (`PlayerHostOptions.lens`, no phone);
// a phone or tablet gets the phone layer's lens instead (src/phone/).
//
// The map itself is the cockpit's one map pane, as the phone's lens: the
// cockpit leaves it out of the docks and floats and places it borderless
// in the whole cells that hold the lens's circle (`Cockpit.setDeskLens`);
// desk-lens.css clips it to the circle and this module shifts it by the
// part of a cell that is left. What lies over it is static DOM in the
// phone lens's look, scaled: the cast-iron ring, the glass with its window
// reflection and edge darkening, and four round keys on the corners.
//
//   top left      Group: the Group pane on and off
//   top right     fullscreen (the player's own: the page's or the frame's)
//   bottom right  Timers: the Timers pane on and off
//   bottom left   the move handle: dragging it moves the lens
//
// Inside the glass the map takes the mouse (a hand lens, src/panes/map.ts
// `MapLens.hand`): a drag pans, the wheel (and a touchpad's swipe) zooms,
// and a pan lets go of the player. The follow key then shows at the
// bottom of the glass; it, or a double click on the map, centres on the
// player and follows again. The rim (a band over the glass's edge and the
// ring) shows a resize cursor that points along the radius; dragging it
// makes the lens larger or smaller round its centre.
//
// Where the lens stands and its size are the host's (`DeskLensSpot`, kept
// across the App rebuilt by a backward seek, never stored): from the
// player's right edge and top edge, so it stays at the right when the
// window changes. A drag lays out at most once a frame (the cockpit's own
// coalescing). Nothing runs per line of game text.
//
// The pure parts (the default place, the clamp, the floats' layout, the
// rim's cursor) are exported for the unit tests.

import './desk-lens.css';
import type { Cockpit, PhoneLensSpot } from '../layout/cockpit';
import type { MapPane } from '../panes/map';
import { type DockId, DOCK_IDS, type LayoutModel, normalizeDock } from '../layout/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The ring round the glass, px (desk-lens.css `--dl-ring`). */
export const DESK_RING_PX = 10;
/**
 * A corner key's side, px, and how far anything of the lens (the ring; a
 * key, set into the ring on the diagonal, less) reaches out of its box, px
 * (desk-lens.css).
 */
export const DESK_KEY_PX = 44;
export const DESK_KEY_OVER = 10;
/** The lens's least and largest diameter, px. */
export const DESK_LENS_MIN = 140;
export const DESK_LENS_MAX = 640;
/** The default diameter: this share of the player's short side, within these limits. */
export const DESK_LENS_SHARE = 0.32;
export const DESK_LENS_DEFAULT_MIN = 200;
export const DESK_LENS_DEFAULT_MAX = 340;
/** What the default place keeps clear at the right (the markers left of the rail), px. */
export const DESK_CLEAR_RIGHT = 24;
/** Rooms across the lens at the zoom it opens at (the map worker's zoom: diameter / (rooms × 44 px)). */
export const DESK_LENS_ROOMS = 8;
/** The rim's band: this far into the glass and out past the ring, px. */
export const DESK_RIM_IN = 5;
export const DESK_RIM_OUT = 6;

/** Where the lens stands: its right edge's distance to the player's right edge, its top, and its diameter, px. */
export interface DeskLensSpot {
  right: number;
  top: number;
  size: number;
}

/** The default spot in a cockpit `W` × `H` px whose cells are `cellH` high: top right, under the header's row. */
export function deskLensDefault(W: number, H: number, cellH: number): DeskLensSpot {
  const short = Math.min(W, H);
  const size = Math.round(Math.min(DESK_LENS_DEFAULT_MAX, Math.max(DESK_LENS_DEFAULT_MIN, short * DESK_LENS_SHARE)));
  return { right: DESK_CLEAR_RIGHT + DESK_KEY_OVER, top: Math.ceil(cellH) + DESK_KEY_OVER + 6, size };
}

/** The largest diameter the lens may have in a cockpit `W` × `H` px (its keys inside). */
export function deskLensMax(W: number, H: number): number {
  return Math.max(DESK_LENS_MIN, Math.min(DESK_LENS_MAX, Math.floor(Math.min(W, H) - 2 * DESK_KEY_OVER - 8)));
}

/**
 * The lens's box in a cockpit `W` × `H` px for `spot`: the size within its
 * limits, the box inside the cockpit with its corner keys (as far as the
 * cockpit is large enough). Whole px.
 */
export function deskLensBox(spot: DeskLensSpot, W: number, H: number): PhoneLensSpot {
  const size = Math.round(Math.max(DESK_LENS_MIN, Math.min(deskLensMax(W, H), spot.size)));
  const o = DESK_KEY_OVER;
  const left = Math.round(Math.max(o, Math.min(W - size - o, W - spot.right - size)));
  const top = Math.round(Math.max(o, Math.min(H - size - o, spot.top)));
  return { left, top, size };
}

/** The spot of a box (`deskLensBox`'s inverse) in a cockpit `W` px wide. */
export function deskLensSpotOf(box: PhoneLensSpot, W: number): DeskLensSpot {
  return { right: W - box.left - box.size, top: box.top, size: box.size };
}

/**
 * The resize cursor for a pointer at (`dx`, `dy`) from the lens's centre:
 * the one of the four that lies along the radius there.
 */
export function rimCursor(dx: number, dy: number): 'ew-resize' | 'ns-resize' | 'nwse-resize' | 'nesw-resize' {
  // Angle from the right, clockwise on screen (y grows down), folded to 0–180°.
  let a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (a < 0) a += 180;
  if (a < 22.5 || a >= 157.5) return 'ew-resize';
  if (a < 67.5) return 'nwse-resize';
  if (a < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

/** Group's and Timers' floats in a grid of `cols` × `rows` (`deskPanesLayout`). */
export interface DeskPaneRects {
  group: { x: number; y: number; w: number; h: number };
  timers: { x: number; y: number; w: number; h: number };
}

/** Columns kept free at the right of the floats (the markers left of the rail). */
export const DESK_FLOAT_RIGHT = 2;
/** What the floats keep free under them, px: the player's control box (player.css), when it shows. */
export const DESK_FLOAT_BOTTOM_PX = 64;

/** The least height each float keeps when rows run short, rows (frame included). */
export const DESK_FLOAT_LEAST = 5;
/** The air the floats keep, rows: between Timers and Group, and under the lens. */
export const DESK_FLOAT_GAP = 1;

/**
 * Where Group and Timers float in a grid of `cols` × `rows`: at the bottom
 * right, `bottom` rows above the bottom edge (the player's control box),
 * Timers above Group when Group is on (else where Group would be).
 * Reasonably large: a third of the width (30 to 56 columns), each about a
 * third of the height (8 to 14 rows), the two the same height, with a row
 * of air between them. With `top` (the first row under the lens, where the
 * lens stands above them) they keep a row of air under it too. Short of
 * rows, both give up rows alike, down to `DESK_FLOAT_LEAST`; only then the
 * air goes (first under the lens, then between them).
 */
export function deskPaneRects(cols: number, rows: number, bottom: number, groupOn: boolean, top = 0): DeskPaneRects {
  const w = Math.max(1, Math.min(cols - DESK_FLOAT_RIGHT, Math.max(30, Math.min(56, Math.round(cols / 3)))));
  const want = Math.max(3, Math.min(14, Math.max(8, Math.round(rows / 3))));
  const n = groupOn ? 2 : 1;
  const room = rows - bottom - top;
  let between = groupOn ? DESK_FLOAT_GAP : 0;
  let under = top > 0 ? DESK_FLOAT_GAP : 0;
  const fit = (): number => Math.floor((room - between - under) / n);
  let h = Math.min(want, fit());
  if (h < DESK_FLOAT_LEAST && under > 0) {
    under = 0;
    h = Math.min(want, fit());
  }
  if (h < DESK_FLOAT_LEAST && between > 0) {
    between = 0;
    h = Math.min(want, fit());
  }
  h = Math.max(Math.min(want, DESK_FLOAT_LEAST), h);
  const x = Math.max(0, cols - DESK_FLOAT_RIGHT - w);
  const gy = Math.max(0, rows - bottom - h);
  const ty = Math.max(0, groupOn ? gy - between - h : rows - bottom - h);
  return { group: { x, y: gy, w, h }, timers: { x, y: ty, w, h } };
}

/**
 * `layout` with Group and Timers taken out of the docks and floating at
 * `r` (`deskPaneRects`), Timers above Group in the z-order too. The rest
 * is as it was. A copy; `layout` is not changed.
 */
export function deskPanesLayout(layout: LayoutModel, r: DeskPaneRects): LayoutModel {
  const out = JSON.parse(JSON.stringify(layout)) as LayoutModel;
  const mine = (id: string): boolean => id === 'group' || id === 'timers';
  for (const dock of DOCK_IDS as readonly DockId[]) {
    const d = out.docks[dock];
    d.head = d.head.filter((p) => !mine(p.id));
    d.tail = d.tail.filter((p) => !mine(p.id));
    for (const lane of d.lanes) lane.panes = lane.panes.filter((p) => !mine(p.id));
    normalizeDock(d, dock);
  }
  out.floating = out.floating.filter((f) => !mine(f.id));
  out.floating.push({ id: 'group', ...r.group }, { id: 'timers', ...r.timers });
  return out;
}

/** The keys' icons (24 × 24, stroked). */
const ICONS = {
  group: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3 3 0 0 1 0 5.6M17.5 14.3c2.1.7 3.5 2.9 3.5 5.7',
  timers: 'M10 2h4M12 2v3M12 13l3-3M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0z',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  fullscreenExit: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  follow: 'M12 2v4M12 18v4M2 12h4M18 12h4M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0zM13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0z',
} as const;

/** The glass's window reflection (the phone lens's, src/phone/lens.ts), 150 × 150. */
const REFLECTION =
  '<defs>' +
  '<linearGradient id="wc-dl-refl-pane" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="44" y2="36"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>' +
  '<linearGradient id="wc-dl-refl-arc" gradientUnits="userSpaceOnUse" x1="140" y1="88" x2="88" y2="140"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".20"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
  '</defs>' +
  '<g transform="translate(18 20) rotate(-12 23 19)" fill="url(#wc-dl-refl-pane)">' +
  '<path d="M4 5Q13 2 22 2V18H1.5Q1.5 12 4 5Z"/><path d="M24 2Q33 2 42 5Q44.5 12 44.5 18H24Z"/>' +
  '<path d="M1.5 20H22V36Q13 36 4 33Q1.5 26 1.5 20Z"/><path d="M24 20H44.5Q44.5 26 42 33Q33 36 24 36Z"/>' +
  '</g>' +
  '<path d="M139.6 88.7A66 66 0 0 1 88.7 139.6" fill="none" stroke="url(#wc-dl-refl-arc)" stroke-width="1.8" stroke-linecap="round"/>';

export type DeskKey = 'group' | 'timers' | 'fullscreen' | 'move';

export interface DeskLensDeps {
  cockpit: Cockpit;
  /** The cell size in px. */
  cells: { get(): { w: number; h: number } };
  /** The spot the host keeps (null: the default); `setSpot` is told every change. */
  spot(): DeskLensSpot | null;
  setSpot(spot: DeskLensSpot): void;
  /** A pane of the lens's keys is on, and its toggle (the host's viewer overrides). */
  paneOn(id: 'group' | 'timers'): boolean;
  togglePane(id: 'group' | 'timers'): void;
  /** The player's fullscreen; null: none (no key). */
  fullscreen: { is(): boolean; toggle(): void } | null;
  /**
   * Told after every layout with the cockpit's grid and the first row
   * under the lens where the lens stands over the floats' columns (0:
   * not there); the host anchors the floats to them.
   */
  onGrid?(cols: number, rows: number, under: number): void;
}

/** The look the lens fixes on the map pane: the phone lens's (ADR 0136 §4), taking the mouse. */
const DESK_LENS_LOOK = { tileset: 'shimrod', background: '#000000', hand: true } as const;

export class DeskLens {
  readonly el: HTMLDivElement;
  private readonly deps: DeskLensDeps;
  private readonly map: MapPane;
  private readonly mapEl: HTMLElement;
  private readonly rim: HTMLDivElement;
  private readonly keys = new Map<DeskKey, HTMLButtonElement>();
  private readonly followKey: HTMLButtonElement;
  private readonly unsubs: Array<() => void> = [];
  /** The box last given to the cockpit (px), and the one the dressing shows. */
  private box: PhoneLensSpot | null = null;
  private shownKey = '';
  private rimKey = '';
  private keysKey = '';
  private zoomed = false;
  /** A drag of the move key or the rim that is on (null: none). */
  private drag: { id: number; kind: 'move' | 'size'; x0: number; y0: number; box: PhoneLensSpot; d0: number } | null = null;
  private disposed = false;

  constructor(deps: DeskLensDeps) {
    this.deps = deps;
    const cockpit = deps.cockpit;
    const doc = cockpit.el.ownerDocument;
    this.map = cockpit.pane('map') as unknown as MapPane;
    this.mapEl = this.map.el;
    const div = (cls: string): HTMLDivElement => {
      const d = doc.createElement('div');
      d.className = cls;
      return d;
    };
    this.el = div('wc-dl');
    this.el.hidden = true;
    const refl = doc.createElementNS(SVG_NS, 'svg');
    refl.setAttribute('class', 'wc-dl-refl');
    refl.setAttribute('viewBox', '0 0 150 150');
    refl.setAttribute('aria-hidden', 'true');
    refl.innerHTML = REFLECTION;
    this.rim = div('wc-dl-rim');
    this.rim.title = 'Drag to resize the map';
    this.el.append(div('wc-dl-bed'), refl, div('wc-dl-shine'), div('wc-dl-ring'), this.rim);
    const key = (name: DeskKey, cls: string, act: (() => void) | null): void => {
      const k = button(doc, `wc-dl-key ${cls}`, ICONS[name === 'fullscreen' ? 'fullscreen' : name]);
      k.dataset.key = name;
      if (act) {
        k.addEventListener('click', (e) => {
          e.stopPropagation();
          act();
        });
      }
      this.el.append(k);
      this.keys.set(name, k);
    };
    key('group', 'is-tl', () => deps.togglePane('group'));
    if (deps.fullscreen) {
      const fs = deps.fullscreen;
      key('fullscreen', 'is-tr', () => fs.toggle());
    }
    key('timers', 'is-br', () => deps.togglePane('timers'));
    key('move', 'is-bl wc-dl-move', null);
    const mv = this.keys.get('move')!;
    mv.title = 'Drag to move the map';
    mv.setAttribute('aria-label', 'Drag to move the map');
    this.followKey = button(doc, 'wc-dl-follow', ICONS.follow);
    this.followKey.hidden = true;
    this.followKey.title = 'Follow the player (or double click the map)';
    this.followKey.setAttribute('aria-label', 'Follow the player');
    this.followKey.addEventListener('click', (e) => {
      e.stopPropagation();
      this.map.followPlayer();
    });
    this.el.append(this.followKey);
    this.watchDrag(mv, 'move');
    this.watchDrag(this.rim, 'size');
    this.rim.addEventListener('pointermove', (e) => {
      if (this.drag || !this.box) return;
      const r = this.el.getBoundingClientRect();
      this.rim.style.cursor = rimCursor(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    });
    cockpit.el.append(this.el);

    this.map.setLens(DESK_LENS_LOOK);
    this.map.onFollow((on) => {
      this.followKey.hidden = on;
      this.el.toggleAttribute('data-free', !on);
    });
    this.unsubs.push(
      () => this.map.onFollow(null),
      cockpit.onLayout(() => this.place()),
    );
    this.ask();
  }

  /** The lens's box as given to the cockpit (tests); null before the first. */
  get lensBox(): Readonly<PhoneLensSpot> | null {
    return this.box;
  }

  /** The keys' state again (a pane toggled, fullscreen changed). */
  refresh(): void {
    this.syncKeys();
  }

  /** The box for the cockpit's size now, given to the cockpit when it changed. */
  private ask(): void {
    const { cockpit, cells } = this.deps;
    const W = cockpit.el.clientWidth;
    const H = cockpit.el.clientHeight;
    if (!(W > 0 && H > 0)) return;
    const spot = this.deps.spot() ?? deskLensDefault(W, H, cells.get().h);
    this.give(deskLensBox(spot, W, H));
  }

  private give(box: PhoneLensSpot): void {
    const a = this.box;
    if (a && a.left === box.left && a.top === box.top && a.size === box.size) return;
    this.box = box;
    if (!this.zoomed) {
      // The zoom it opens at; after that the wheel's (a resize shows more or less of the map).
      this.zoomed = true;
      this.map.zoomTo(box.size / (DESK_LENS_ROOMS * 44));
    }
    this.deps.cockpit.setDeskLens(box);
  }

  /** After each layout: the dressing at the box, the map pane shifted to its centre, the keys. */
  private place(): void {
    if (this.disposed) return;
    const { cockpit, cells } = this.deps;
    const W = cockpit.el.clientWidth;
    const H = cockpit.el.clientHeight;
    const grid = cockpit.el.dataset.cells?.split('x').map(Number);
    const cell0 = cells.get();
    if (grid && grid.length === 2 && grid.every((n) => Number.isFinite(n)) && cell0.h > 0) {
      const [cols, rows] = grid as [number, number];
      const b = this.box;
      // Over the floats' columns (the right third, `deskPaneRects`): the floats stay under it.
      const over = b !== null && b.left + b.size + DESK_KEY_OVER > (cols * cell0.w * 2) / 3 - DESK_KEY_OVER;
      this.deps.onGrid?.(cols, rows, over ? Math.ceil((b.top + b.size + DESK_KEY_OVER + 4) / cell0.h - 1e-6) : 0);
    }
    // The cockpit's size changed (the window, fullscreen): the spot again, in one more layout.
    if (!this.drag) this.ask();
    const box = this.box;
    const rect = cockpit.deskLensCells;
    if (!box || !rect || !(W > 0 && H > 0)) {
      this.el.hidden = true;
      this.shownKey = '';
      return;
    }
    const cell = cells.get();
    const key = `${box.left},${box.top},${box.size}|${rect.x},${rect.y},${rect.w},${rect.h}|${cell.w},${cell.h}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      const st = this.el.style;
      st.left = `${box.left}px`;
      st.top = `${box.top}px`;
      st.width = st.height = `${box.size}px`;
      this.el.style.setProperty('--dl-size', `${box.size}px`);
      this.mapEl.style.setProperty('--dl-size', `${box.size}px`);
      const dx = box.left + box.size / 2 - (rect.x + rect.w / 2) * cell.w;
      const dy = box.top + box.size / 2 - (rect.y + rect.h / 2) * cell.h;
      this.mapEl.style.translate = `${Math.round(dx * 100) / 100}px ${Math.round(dy * 100) / 100}px`;
      this.el.hidden = false;
      this.cutRim(box.size);
    }
    this.syncKeys();
  }

  /** The rim's band as a ring (`clip-path` even-odd): the pointer finds it only there. */
  private cutRim(size: number): void {
    if (size === Number(this.rimKey)) return;
    this.rimKey = String(size);
    const pad = DESK_RING_PX + DESK_RIM_OUT;
    const c = size / 2 + pad;
    const ro = size / 2 + pad;
    const ri = size / 2 - DESK_RIM_IN;
    const circle = (r: number): string => `M${c - r} ${c}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
    this.rim.style.inset = `${-pad}px`;
    this.rim.style.clipPath = `path(evenodd, '${circle(ro)}${circle(ri)}')`;
  }

  private syncKeys(): void {
    const g = this.deps.paneOn('group');
    const t = this.deps.paneOn('timers');
    const fs = this.deps.fullscreen?.is() ?? false;
    const key = `${g}|${t}|${fs}`;
    if (key === this.keysKey) return;
    this.keysKey = key;
    lit(this.keys.get('group')!, g, g ? 'Hide Group' : 'Show Group');
    lit(this.keys.get('timers')!, t, t ? 'Hide Timers' : 'Show Timers');
    const f = this.keys.get('fullscreen');
    if (f) {
      const label = fs ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
      f.title = label;
      f.setAttribute('aria-label', label);
      f.querySelector('path')!.setAttribute('d', fs ? ICONS.fullscreenExit : ICONS.fullscreen);
    }
  }

  /** A drag of the move key (moves the lens) or of the rim (resizes it round its centre). */
  private watchDrag(el: HTMLElement, kind: 'move' | 'size'): void {
    const win = el.ownerDocument.defaultView;
    let frame = 0;
    let x = 0;
    let y = 0;
    const tell = (): void => {
      frame = 0;
      const d = this.drag;
      if (!d) return;
      const { cockpit } = this.deps;
      const W = cockpit.el.clientWidth;
      const H = cockpit.el.clientHeight;
      let spot: DeskLensSpot;
      if (d.kind === 'move') {
        spot = deskLensSpotOf({ ...d.box, left: d.box.left + x - d.x0, top: d.box.top + y - d.y0 }, W);
      } else {
        const r = cockpit.el.getBoundingClientRect();
        const cx = r.left + d.box.left + d.box.size / 2;
        const cy = r.top + d.box.top + d.box.size / 2;
        const size = Math.max(DESK_LENS_MIN, Math.min(deskLensMax(W, H), d.box.size + 2 * (Math.hypot(x - cx, y - cy) - d.d0)));
        spot = deskLensSpotOf({ left: d.box.left + (d.box.size - size) / 2, top: d.box.top + (d.box.size - size) / 2, size }, W);
      }
      const box = deskLensBox(spot, W, H);
      this.deps.setSpot(deskLensSpotOf(box, W));
      this.give(box);
    };
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (this.drag || e.button !== 0 || !this.box) return;
      e.preventDefault();
      const r = this.deps.cockpit.el.getBoundingClientRect();
      const cx = r.left + this.box.left + this.box.size / 2;
      const cy = r.top + this.box.top + this.box.size / 2;
      this.drag = { id: e.pointerId, kind, x0: e.clientX, y0: e.clientY, box: { ...this.box }, d0: Math.hypot(e.clientX - cx, e.clientY - cy) };
      x = e.clientX;
      y = e.clientY;
      this.el.setAttribute('data-drag', kind);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A synthetic pointer: its moves come while it is over the element.
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (this.drag?.id !== e.pointerId || this.drag.kind !== kind) return;
      x = e.clientX;
      y = e.clientY;
      if (!frame && win) frame = win.requestAnimationFrame(tell);
    });
    const end = (e: PointerEvent): void => {
      if (this.drag?.id !== e.pointerId || this.drag.kind !== kind) return;
      if (frame && win) win.cancelAnimationFrame(frame);
      frame = 0;
      if (e.type === 'pointerup') {
        x = e.clientX;
        y = e.clientY;
        tell();
      }
      this.drag = null;
      this.el.removeAttribute('data-drag');
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // Not captured (any more).
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    // The press keeps the focus where it is.
    el.addEventListener('mousedown', (e) => e.preventDefault());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const fn of this.unsubs.splice(0)) fn();
    this.deps.cockpit.setDeskLens(null);
    this.map.setLens(null);
    this.mapEl.style.translate = '';
    this.el.remove();
  }
}

/** A key lit (its pane is on) or not, with its name. */
function lit(k: HTMLButtonElement, on: boolean, label: string): void {
  k.classList.toggle('is-on', on);
  k.setAttribute('aria-pressed', on ? 'true' : 'false');
  k.setAttribute('aria-label', label);
  k.title = label;
}

/** A round key with an icon. */
function button(doc: Document, cls: string, icon: string): HTMLButtonElement {
  const k = doc.createElement('button');
  k.type = 'button';
  k.className = cls;
  k.tabIndex = -1;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'wc-dl-ico');
  svg.setAttribute('aria-hidden', 'true');
  const p = doc.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', icon);
  svg.append(p);
  k.append(svg);
  k.addEventListener('mousedown', (e) => e.preventDefault());
  k.addEventListener('pointerdown', (e) => e.stopPropagation());
  return k;
}

/** Mounts the lens over `deps.cockpit` (see the file header). */
export function mountDeskLens(deps: DeskLensDeps): DeskLens {
  return new DeskLens(deps);
}
