// The desktop lens of a shared run (stage 71, ADR 0160; reworked in stage
// 73): the map as a round lens at the top right of the player, with Group
// and Timers as floating panes at the bottom right. All three are turned on
// and off in the control box's Panes popup (Map is the lens), the map on and
// the two off at the start. Mounted by the player host over each player App
// it builds when the host plays a shared run on a computer
// (`PlayerHostOptions.lens`, no phone); a phone or tablet gets the phone
// layer's lens instead (src/phone/).
//
// The map itself is the cockpit's one map pane, as the phone's lens: the
// cockpit leaves it out of the docks and floats and places it borderless
// in the whole cells that hold the lens's circle (`Cockpit.setDeskLens`);
// desk-lens.css masks it to the circle (a mask, not only a clip: see the
// CSS) and this module shifts it by the part of a cell that is left, only
// for the box the cockpit laid it out for. What lies over it is static DOM
// in the phone lens's look, scaled: the cast-iron ring, the glass with its
// window reflection and edge darkening, and four zoom dots at the bottom
// centre. No keys.
//
// The glass takes the mouse, the map never does: a drag anywhere on it
// moves the lens, the wheel steps the zoom one level, and a click on a dot
// picks its level (`DESK_LENS_ROOMS`). Without a pan the map always
// follows the player. The rim (a band over the glass's edge and the ring,
// above the glass, so it wins there) shows a resize cursor that points
// along the radius; dragging it makes the lens larger or smaller round its
// centre.
//
// Where the lens stands, its size and its level are the host's
// (`DeskLensSpot`, `DeskLevel`, kept across the App rebuilt by a backward
// seek, never stored): from the player's right edge and top edge, so it
// stays at the right when the window changes. A drag lays out at most once
// a frame (the cockpit's own coalescing). Nothing runs per line of game
// text.
//
// The pure parts (the default place, the clamp, the levels, the floats'
// layout, the rim's cursor) are exported for the unit tests.

import './desk-lens.css';
import type { Cockpit, PhoneLensSpot } from '../layout/cockpit';
import type { MapPane } from '../panes/map';
import { type DockId, DOCK_IDS, type LayoutModel, normalizeDock } from '../layout/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The ring round the glass, px (desk-lens.css `--dl-ring`). */
export const DESK_RING_PX = 10;
/** How far anything of the lens (the ring) reaches out of its box, px (desk-lens.css). */
export const DESK_KEY_OVER = DESK_RING_PX;
/** The lens's least and largest diameter, px. */
export const DESK_LENS_MIN = 140;
export const DESK_LENS_MAX = 640;
/** The default diameter: this share of the player's short side, within these limits. */
export const DESK_LENS_SHARE = 0.32;
export const DESK_LENS_DEFAULT_MIN = 200;
export const DESK_LENS_DEFAULT_MAX = 340;
/** What the default place keeps clear at the right (the markers left of the rail), px. */
export const DESK_CLEAR_RIGHT = 24;
/**
 * The four zoom levels (the dots, left to right): about this many rooms
 * across the lens. The nearest is stage 71's opening zoom (eight rooms),
 * the farthest the whole neighbourhood, as the phone's farthest. The map
 * worker's zoom is diameter / (rooms × 44 px) (src/phone/lens-zoom.ts
 * explains the 44): at the least diameter, 140 px, the farthest is 0.072,
 * inside the worker's limits (0.04 to 5). The zoom follows the diameter,
 * as on the phone: a larger lens shows the same rooms larger.
 */
export const DESK_LENS_ROOMS = [8, 14, 24, 44] as const;
export type DeskLevel = 0 | 1 | 2 | 3;
/** The level the lens opens at: the nearest. */
export const DESK_LEVEL_DEFAULT: DeskLevel = 0;
/** The levels' names, nearest first (a dot's title). */
export const DESK_LEVEL_NAMES = ['near', 'mid', 'far', 'area'] as const;

/** The map worker's zoom of `level` on a lens `size` px across. */
export function deskLensZoom(level: DeskLevel, size: number): number {
  return size / (DESK_LENS_ROOMS[level] * 44);
}

/** One level nearer (`dir` -1) or further (+1), clamped, no wrap. */
export function deskLevelStep(level: DeskLevel, dir: 1 | -1): DeskLevel {
  return Math.max(0, Math.min(DESK_LENS_ROOMS.length - 1, level + dir)) as DeskLevel;
}

/** What the wheel gathers for one level, px (a mouse notch is 100; a touchpad sends many small deltas). */
export const DESK_WHEEL_STEP = 60;
/** After a step the wheel rests this long, ms, so a touchpad's coasting does not run through every level. */
export const DESK_WHEEL_REST_MS = 220;
/** The rim's band: this far into the glass and out past the ring, px. */
export const DESK_RIM_IN = 5;
export const DESK_RIM_OUT = 6;

/** Where the lens stands: its right edge's distance to the player's right edge, its top, and its diameter, px. */
export interface DeskLensSpot {
  right: number;
  top: number;
  size: number;
}

/**
 * The default spot in a cockpit `W` × `H` px whose cells are `cellH` high:
 * at the top right, two rows down (one lower than stage 71's, the owner's
 * direction of stage 73).
 */
export function deskLensDefault(W: number, H: number, cellH: number): DeskLensSpot {
  const short = Math.min(W, H);
  const size = Math.round(Math.min(DESK_LENS_DEFAULT_MAX, Math.max(DESK_LENS_DEFAULT_MIN, short * DESK_LENS_SHARE)));
  return { right: DESK_CLEAR_RIGHT + DESK_KEY_OVER, top: 2 * Math.ceil(cellH) + DESK_KEY_OVER + 6, size };
}

/** The largest diameter the lens may have in a cockpit `W` × `H` px (its ring inside). */
export function deskLensMax(W: number, H: number): number {
  return Math.max(DESK_LENS_MIN, Math.min(DESK_LENS_MAX, Math.floor(Math.min(W, H) - 2 * DESK_KEY_OVER - 8)));
}

/**
 * The lens's box in a cockpit `W` × `H` px for `spot`: the size within its
 * limits, the box inside the cockpit with its ring (as far as the cockpit
 * is large enough). Whole px.
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

export interface DeskLensDeps {
  cockpit: Cockpit;
  /** The cell size in px. */
  cells: { get(): { w: number; h: number } };
  /** The spot the host keeps (null: the default); `setSpot` is told every change. */
  spot(): DeskLensSpot | null;
  setSpot(spot: DeskLensSpot): void;
  /** The zoom level the host keeps; `setLevel` is told every change. */
  level(): DeskLevel;
  setLevel(level: DeskLevel): void;
  /** The map is on (the Panes popup's Map): the lens shows; off, the lens and the map are gone. */
  mapOn(): boolean;
  /**
   * Told after every layout with the cockpit's grid and the first row
   * under the lens where the lens stands over the floats' columns (0:
   * not there, or no lens); the host anchors the floats to them.
   */
  onGrid?(cols: number, rows: number, under: number): void;
}

/** The look the lens fixes on the map pane: the phone lens's (ADR 0136 §4); it takes no mouse. */
const DESK_LENS_LOOK = { tileset: 'shimrod', background: '#000000' } as const;

export class DeskLens {
  readonly el: HTMLDivElement;
  private readonly deps: DeskLensDeps;
  private readonly map: MapPane;
  private readonly mapEl: HTMLElement;
  private readonly glass: HTMLDivElement;
  private readonly rim: HTMLDivElement;
  private readonly dots: HTMLButtonElement[] = [];
  private readonly unsubs: Array<() => void> = [];
  /** The box last given to the cockpit (px; null: none yet). Kept while the map is off (the cockpit places nothing then). */
  private box: PhoneLensSpot | null = null;
  private shownKey = '';
  private rimKey = '';
  /** The zoom last sent (level and size), so it is sent only on a change. */
  private zoomKey = '';
  /** A drag of the glass (moves the lens) or of the rim (resizes it) that is on (null: none). */
  private drag: { id: number; kind: 'move' | 'size'; x0: number; y0: number; box: PhoneLensSpot; d0: number } | null = null;
  /** The wheel's gathered delta, px, and the time stamp until which it rests. */
  private wheelAcc = 0;
  private wheelRestUntil = 0;
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
    this.glass = div('wc-dl-glass');
    this.glass.title = 'Drag to move the map';
    const dots = div('wc-dl-dots');
    DESK_LENS_ROOMS.forEach((_, i) => {
      const level = i as DeskLevel;
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'wc-dl-dot';
      b.tabIndex = -1;
      b.dataset.level = String(level);
      const label = `Zoom: ${DESK_LEVEL_NAMES[level]} (${level + 1} of ${DESK_LENS_ROOMS.length})`;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.append(doc.createElement('i'));
      // The press keeps the focus where it is, and is no drag of the glass.
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setLevel(level);
      });
      dots.append(b);
      this.dots.push(b);
    });
    this.rim = div('wc-dl-rim');
    this.rim.title = 'Drag to resize the map';
    // The rim last: over the glass's edge it wins.
    this.el.append(div('wc-dl-bed'), refl, div('wc-dl-shine'), div('wc-dl-ring'), this.glass, dots, this.rim);
    this.watchDrag(this.glass, 'move');
    this.watchDrag(this.rim, 'size');
    this.rim.addEventListener('pointermove', (e) => {
      if (this.drag || !this.lensBox) return;
      const r = this.el.getBoundingClientRect();
      this.rim.style.cursor = rimCursor(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    });
    const wheel = (e: WheelEvent): void => this.onWheel(e);
    this.el.addEventListener('wheel', wheel, { passive: false });
    cockpit.el.append(this.el);

    this.map.setLens(DESK_LENS_LOOK);
    this.unsubs.push(
      () => this.el.removeEventListener('wheel', wheel),
      cockpit.onLayout(() => this.place()),
    );
    this.syncDots();
    this.ask();
  }

  /** The lens's box as given to the cockpit (tests); null before the first, or while the map is off. */
  get lensBox(): Readonly<PhoneLensSpot> | null {
    return this.deps.mapOn() ? this.box : null;
  }

  /** The zoom level (tests). */
  get level(): DeskLevel {
    return this.deps.level();
  }

  /** The map turned on or off, the fullscreen changed: the lens follows (in one more layout). */
  refresh(): void {
    if (!this.disposed) this.ask();
  }

  /** Picks zoom `level` (a dot, the wheel). */
  setLevel(level: DeskLevel): void {
    if (this.disposed || level === this.deps.level()) return;
    this.deps.setLevel(level);
    this.syncDots();
    this.syncZoom();
  }

  /**
   * The wheel over the lens: one level a notch (or a touchpad's worth), then
   * a short rest. Every wheel event over it (glass, rim, dots, the rest's
   * coasting) is the lens's alone: no page scroll, and it never bubbles to
   * the player's root, whose wheel moves the pause cursor and scrolls the
   * log (stage 73 round 1).
   */
  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (!this.lensBox || e.deltaY === 0) return;
    if (e.timeStamp < this.wheelRestUntil) return;
    const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 300 : e.deltaY;
    // A turn the other way starts over.
    if (Math.sign(px) !== Math.sign(this.wheelAcc)) this.wheelAcc = 0;
    this.wheelAcc += px;
    if (Math.abs(this.wheelAcc) < DESK_WHEEL_STEP) return;
    // Away from you (up) is nearer, as the map pane's wheel.
    const dir = this.wheelAcc < 0 ? -1 : 1;
    this.wheelAcc = 0;
    this.wheelRestUntil = e.timeStamp + DESK_WHEEL_REST_MS;
    this.setLevel(deskLevelStep(this.deps.level(), dir));
  }

  private syncDots(): void {
    const level = this.deps.level();
    for (const d of this.dots) {
      const on = Number(d.dataset.level) === level;
      d.classList.toggle('is-on', on);
      d.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    this.el.dataset.level = String(level);
  }

  /** The map's zoom for the level at the diameter (it follows the diameter: the same rooms stay in view). */
  private syncZoom(): void {
    const box = this.box;
    if (!box) return;
    const level = this.deps.level();
    const key = `${level}|${box.size}`;
    if (key === this.zoomKey) return;
    this.zoomKey = key;
    this.map.zoomTo(deskLensZoom(level, box.size));
  }

  /**
   * The box for the cockpit's size now, given to the cockpit when it
   * changed. Also while the map is off (stage 73 review fix): the cockpit
   * then places no map, and turning the map on lays it out in the lens in
   * that same layout, never docked or floating first.
   */
  private ask(): void {
    const { cockpit, cells } = this.deps;
    const W = cockpit.el.clientWidth;
    const H = cockpit.el.clientHeight;
    if (!(W > 0 && H > 0)) return;
    const spot = this.deps.spot() ?? deskLensDefault(W, H, cells.get().h);
    this.give(deskLensBox(spot, W, H));
  }

  private give(box: PhoneLensSpot | null): void {
    const a = this.box;
    if (a === box || (a && box && a.left === box.left && a.top === box.top && a.size === box.size)) return;
    this.box = box;
    this.syncZoom();
    this.deps.cockpit.setDeskLens(box);
  }

  /** After each layout: the floats' anchor, and the dressing and the map pane's shift for the box laid out. */
  private place(): void {
    if (this.disposed) return;
    const { cockpit, cells } = this.deps;
    const W = cockpit.el.clientWidth;
    const H = cockpit.el.clientHeight;
    const cell = cells.get();
    // What this layout was made for: the box, and the map pane's cells in it.
    const laid = cockpit.deskLensLaid;
    const rect = cockpit.deskLensCells;
    const grid = cockpit.el.dataset.cells?.split('x').map(Number);
    if (grid && grid.length === 2 && grid.every((n) => Number.isFinite(n)) && cell.h > 0) {
      const [cols, rows] = grid as [number, number];
      // Over the floats' columns (the right third, `deskPaneRects`): the floats stay under it.
      const over = laid !== null && laid.left + laid.size + DESK_KEY_OVER > (cols * cell.w * 2) / 3 - DESK_KEY_OVER;
      this.deps.onGrid?.(cols, rows, over ? Math.ceil((laid.top + laid.size + DESK_KEY_OVER + 4) / cell.h - 1e-6) : 0);
    }
    // The cockpit's size changed (the window, fullscreen), or the map went on or off: the box again, in one more layout.
    if (!this.drag) this.ask();
    // Stage 73's bug fix (ADR 0160 addendum): the dressing, the circle and the shift come
    // from the box the map pane's cells were laid out for, never from one given since
    // (that one waits for its own layout), so the map is never shifted out of its circle.
    if (!laid || !rect || !this.lensBox || !(W > 0 && H > 0)) {
      this.el.hidden = true;
      this.shownKey = '';
      return;
    }
    const key = `${laid.left},${laid.top},${laid.size}|${rect.x},${rect.y},${rect.w},${rect.h}|${cell.w},${cell.h}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    const st = this.el.style;
    st.left = `${laid.left}px`;
    st.top = `${laid.top}px`;
    st.width = st.height = `${laid.size}px`;
    this.el.style.setProperty('--dl-size', `${laid.size}px`);
    this.mapEl.style.setProperty('--dl-size', `${laid.size}px`);
    const dx = laid.left + laid.size / 2 - (rect.x + rect.w / 2) * cell.w;
    const dy = laid.top + laid.size / 2 - (rect.y + rect.h / 2) * cell.h;
    this.mapEl.style.translate = `${Math.round(dx * 100) / 100}px ${Math.round(dy * 100) / 100}px`;
    this.el.hidden = false;
    this.cutRim(laid.size);
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

  /** A drag of the glass (moves the lens) or of the rim (resizes it round its centre). */
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
      if (this.drag || e.button !== 0 || !this.lensBox || !this.box) return;
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

/** Mounts the lens over `deps.cockpit` (see the file header). */
export function mountDeskLens(deps: DeskLensDeps): DeskLens {
  return new DeskLens(deps);
}
