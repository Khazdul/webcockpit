// Pane shell (ADR 0010 "Consequences", ADR 0012, ADR 0016): the element a
// side pane lives in. The cockpit (src/layout/cockpit.ts) positions it and
// draws its frame; a pane subclass renders into `content`.
//
//   .wc-pane.wc-pane-<id>[data-active]   positioned in whole cells, --pane-* tokens
//     .wc-pane-rim                       the iron band, brackets and hood (hidden when border off)
//       svg.wc-pane-seam                 the band's inner seam
//     .wc-pane-frame                     the frame box and its glow; ::before is the lamp-lit window
//       .wc-pane-title > span            the hood and its label
//     .wc-pane-content                   the inner area, `cols` × `rows` cells
//
// Writing a pane (ADR 0016 "Package notes"):
//
//   class GroupPane extends PaneShell {
//     private readonly model = new GroupModel();
//     constructor(ctx: PaneContext) {
//       super(ctx, 'group');
//       this.own(ctx.bus.on('gmcp', (m) => { if (this.model.apply(m)) this.markDirty(); }));
//       this.own(ctx.settings.subscribe(() => this.markDirty()));
//     }
//     protected override onActiveChange(active: boolean): void {
//       if (!active) this.model.reset();          // state resets on disconnect
//     }
//     protected override render(): void {
//       // this.cols × this.rows cells; direct DOM into this.content
//     }
//   }
//
// - `markDirty()` schedules one `render()` in the next frame (coalesced).
//   It is also called on a size change, on a pane colour / appearance
//   change and when the pane becomes active.
// - `active` follows `conn.state`: `playing` → active, anything else
//   inactive, except that when a replay ends (`disconnected` with
//   `replay`) the pane stays as it is until the next connection starts. While inactive a pane with `blankWhenInactive` (Character,
//   Timers, Group, Comm; not UI) shows `blank()` (default: empty content)
//   instead of `render()`; frame, size and position are unchanged (Inv §2.1).
// - Nothing renders while the pane is hidden; showing it renders.

import type { ConnState } from '../core/types';
import { applyPaneTheme } from '../theme/apply';
import { type Settings, paneSettingsOf } from '../settings/types';
import type { Rect } from '../layout/allocate';
import { type BuiltinPaneId, PANE_LABELS, type PaneId, isBuiltinPaneId } from '../layout/types';
import type { PaneContext } from './context';
import { type FrameGeometry, type FramePlate, HOOD_PAD, fitTitle, frameArm, frameGeometry, frameHolePath, framePlate, frameRimPath, frameSeams, hoodRoom, titlePx } from './frame';
import { titleWidth } from './title-font';

export type { PaneContext } from './context';

/** Panes that blank their content while not `playing` (Inv §2.1): all but UI, the map and Statistics. */
export const BLANK_WHEN_INACTIVE: Readonly<Record<BuiltinPaneId, boolean>> = {
  character: true,
  timers: true,
  group: true,
  comm: true,
  ui: false,
  map: false,
  // Keeps the latest run after a disconnect (ADR 0109).
  statistics: false,
};

/** True for the connection state in which panes are active. */
export const isActiveState = (s: ConnState): boolean => s === 'playing';

export type PaneResizeListener = (cols: number, rows: number) => void;

/** z-index of the backmost floating pane; the others stack above it. */
export const FLOAT_Z = 10;

/**
 * The cell size the cockpit lays out with (CSS px). `ox` / `oy`: where the
 * cockpit's origin sits on the page (CSS px), so the frame line can be put on
 * whole device pixels of the page (ADR 0091 "Frames"); 0 when absent.
 */
export interface PaneCell {
  w: number;
  h: number;
  ox?: number;
  oy?: number;
}

/** Where and how the cockpit shows a pane (cells), or null when hidden. */
export interface PanePlacement {
  rect: Rect;
  content: Rect;
  framed: boolean;
  /** Set for a floating pane: its z-order (0 = backmost). */
  floating?: number;
}

/** The label's fade before the hover set over the hood, in cells (layout.css `data-hood-cover`). */
const COVER_FADE = 1.5;
/** Less of the label than this many cells clear of the fade: it fades out whole on hover. */
const COVER_KEEP = 2;

export interface PaneShellOptions {
  /** Override `BLANK_WHEN_INACTIVE[id]` (script panes: false). */
  blankWhenInactive?: boolean;
  /** The frame label (default `PANE_LABELS[id]`; a script pane: its id). */
  label?: string;
}

export class PaneShell {
  readonly id: PaneId;
  /** Outer element, positioned by the cockpit. */
  readonly el: HTMLDivElement;
  /** Content element: subclasses render into it. */
  readonly content: HTMLDivElement;
  /** Blank the content while inactive (all panes but UI). */
  readonly blankWhenInactive: boolean;
  protected readonly ctx: PaneContext;
  private readonly rimEl: HTMLDivElement;
  private readonly frameEl: HTMLDivElement;
  private readonly titleEl: HTMLSpanElement;
  /** The label text inside the title (its box trimmed to the capitals, so they centre on the hood). */
  private readonly labelEl: HTMLSpanElement;
  private geomKey = '';
  private _frameLine: FrameGeometry | null = null;
  private _plate: FramePlate | null = null;
  /** The label as the hood shows it (`fitTitle`; empty without a hood). */
  private _title = '';
  /**
   * Cells from the pane's right edge that the hover set (the close cross and
   * the buttons left of it, ADR 0095) covers; the cockpit sets it when it
   * adds them (0: none, as on a phone). The hood keeps left of them where it
   * can (`framePlate`, ADR 0123 "Hood position and hover buttons").
   */
  hoverCells = 0;
  /** Where the hover set covers the hood (`coverHood`), frame px; null: it does not. */
  private coverX: number | null = null;
  /** `data-hood-cover`: '' (the label fades before the set), 'all' (it fades whole), null (no cover). */
  private coverMode: string | null = null;
  /** The inner seam's dark and light paths. */
  private readonly seamPaths: SVGPathElement[];
  private readonly listeners = new Set<PaneResizeListener>();
  private readonly unsubs: (() => void)[] = [];
  /** The label text shown in the frame's top row. */
  private frameKey = '';
  private _label: string;
  private themeKey = '';
  private _cols = 0;
  private _rows = 0;
  private _visible = false;
  /** The last placement (for a label change). */
  private placed: PanePlacement | null = null;
  private placedCell: PaneCell | null = null;
  private _active: boolean;
  /** A render is wanted (kept while hidden). */
  private dirty = true;
  /** A frame callback is pending. */
  private scheduled = false;
  /** The content currently shows `blank()`. */
  private blanked = false;
  private disposed = false;

  constructor(ctx: PaneContext, id: PaneId, opts: PaneShellOptions = {}) {
    const doc = ctx.doc;
    this.ctx = ctx;
    this.id = id;
    const builtin = isBuiltinPaneId(id);
    this._label = opts.label ?? (builtin ? PANE_LABELS[id] : id);
    this.blankWhenInactive = opts.blankWhenInactive ?? (builtin ? BLANK_WHEN_INACTIVE[id] : false);
    this._active = isActiveState(ctx.connState());
    this.el = doc.createElement('div');
    this.el.className = `wc-pane wc-pane-${id}`;
    this.el.dataset.pane = id;
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', this._label);
    this.el.hidden = true;
    // The iron band first, then the window and the hood over it (ADR 0123).
    this.rimEl = doc.createElement('div');
    this.rimEl.className = 'wc-pane-rim';
    this.rimEl.setAttribute('aria-hidden', 'true');
    const SVG = 'http://www.w3.org/2000/svg';
    const seam = doc.createElementNS(SVG, 'svg');
    seam.setAttribute('class', 'wc-pane-seam');
    this.seamPaths = (['wc-seam-dark', 'wc-seam-light'] as const).map((cls) => {
      const path = doc.createElementNS(SVG, 'path');
      path.setAttribute('class', cls);
      seam.append(path);
      return path;
    });
    this.rimEl.append(seam);
    this.frameEl = doc.createElement('div');
    this.frameEl.className = 'wc-pane-frame';
    this.frameEl.setAttribute('aria-hidden', 'true');
    this.titleEl = doc.createElement('span');
    this.titleEl.className = 'wc-pane-title';
    this.labelEl = doc.createElement('span');
    this.frameEl.append(this.titleEl);
    this.content = doc.createElement('div');
    this.content.className = 'wc-pane-content';
    this.el.append(this.rimEl, this.frameEl, this.content);
    this.el.toggleAttribute('data-active', this._active);
    this.own(
      ctx.bus.on('conn.state', (s) => {
        // A finished replay keeps its last picture until the next
        // connection starts (a live disconnect blanks, Inv §2.1).
        if (s.state === 'disconnected' && s.replay) return;
        this.setActive(isActiveState(s.state));
      }),
    );
  }

  /** The frame label (the title of a script pane). */
  get label(): string {
    return this._label;
  }

  /** Changes the frame label; the frame is redrawn at once when shown. */
  setLabel(label: string): void {
    if (label === this._label) return;
    this._label = label;
    this.el.setAttribute('aria-label', label);
    if (this.placed) this.place(this.placed, this.placedCell!);
  }

  /** True while the connection is `playing` (see the file header). */
  get active(): boolean {
    return this._active;
  }

  /** Keeps `unsub` to be called by `dispose()`. */
  protected own(unsub: () => void): void {
    this.unsubs.push(unsub);
  }

  /** Renders once in the next frame (coalesced; skipped while hidden). */
  markDirty(): void {
    this.dirty = true;
    if (this.scheduled || this.disposed || !this._visible) return;
    this.scheduled = true;
    this.ctx.requestFrame(this.onFrame);
  }

  private readonly onFrame = (): void => {
    this.scheduled = false;
    if (this.disposed || !this._visible || !this.dirty) return;
    this.dirty = false;
    if (this._active || !this.blankWhenInactive) {
      this.blanked = false;
      this.render();
    } else if (!this.blanked) {
      this.blanked = true;
      this.blank();
    }
  };

  /**
   * Draws the content (`this.cols` × `this.rows` cells). Called at most
   * once per frame after `markDirty()`, only while visible and active (or
   * for a pane that does not blank). Subclasses override it.
   */
  protected render(): void {}

  /** Shows the inactive state. Default: empty content. */
  protected blank(): void {
    this.content.replaceChildren();
  }

  /**
   * Called when `active` changes, before the re-render is scheduled (e.g.
   * reset the model when the connection leaves `playing`).
   */
  protected onActiveChange(_active: boolean): void {}

  private setActive(active: boolean): void {
    if (active === this._active) return;
    this._active = active;
    this.el.toggleAttribute('data-active', active);
    this.onActiveChange(active);
    this.markDirty();
  }

  /** Stops listening (bus, settings, anything passed to `own`). */
  dispose(): void {
    this.disposed = true;
    for (const u of this.unsubs.splice(0)) u();
    this.listeners.clear();
  }

  /**
   * True when (`x`, `y`) client px is on a content grip: cells that drag
   * the pane (a script pane's `pane:setGrip`, ADR 0065 round 1).
   */
  gripAt(_x: number, _y: number): boolean {
    return false;
  }

  /** The press on the content became a pane move: it must not end as a click (script panes' links). */
  cancelPress(): void {}

  /** Inner width in cells (0 while hidden). */
  get cols(): number {
    return this._cols;
  }

  /** Inner height in cells (0 while hidden). */
  get rows(): number {
    return this._rows;
  }

  /** True while the pane is on screen. */
  get visible(): boolean {
    return this._visible;
  }

  /**
   * Calls `fn(cols, rows)` whenever the inner size changes (0 × 0 when the
   * pane is hidden). Returns the unsubscribe function.
   */
  onResize(fn: PaneResizeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Re-applies the pane colour tokens (every relayout). Marks the pane
   * dirty when its colour or the appearance changed, since renders may
   * derive colours from them (shade ramp).
   */
  applyTheme(s: Readonly<Settings>): void {
    applyPaneTheme(this.el, s, this.id);
    const a = s.appearance;
    const p = paneSettingsOf(s.panes, this.id);
    // The glass background too: a clear pane's text follows the page (ADR 0095).
    const key = `${p.color}|${p.glass}|${a.fg}|${a.bg}|${a.ansi.join(',')}`;
    if (key !== this.themeKey) {
      this.themeKey = key;
      this.markDirty();
    }
  }

  /** Cockpit only: shows the pane at `p` (cells × `cell` px) or hides it. */
  place(p: PanePlacement | null, cell: PaneCell): void {
    this.placed = p;
    this.placedCell = cell;
    if (!p) {
      this.el.hidden = true;
      this._visible = false;
      this.setSize(0, 0);
      return;
    }
    const { rect, content } = p;
    const st = this.el.style;
    st.left = `${rect.x * cell.w}px`;
    st.top = `${rect.y * cell.h}px`;
    st.width = `${rect.w * cell.w}px`;
    st.height = `${rect.h * cell.h}px`;
    const cs = this.content.style;
    cs.left = `${(content.x - rect.x) * cell.w}px`;
    cs.top = `${(content.y - rect.y) * cell.h}px`;
    cs.width = `${content.w * cell.w}px`;
    cs.height = `${content.h * cell.h}px`;
    if (p.framed) this.placeFrame(rect, cell);
    // No hood (no room for one): no title.
    const label = p.framed && this._plate ? this._title : '';
    if (label !== this.frameKey) {
      this.frameKey = label;
      this.labelEl.textContent = label;
      if (label) this.titleEl.replaceChildren(this.labelEl);
      else this.titleEl.replaceChildren();
    }
    this.el.toggleAttribute('data-framed', p.framed);
    this.el.toggleAttribute('data-floating', p.floating !== undefined);
    st.zIndex = p.floating === undefined ? '' : String(FLOAT_Z + p.floating);
    this.el.hidden = false;
    this._visible = true;
    this.setSize(content.w, content.h);
  }

  /**
   * Puts the frame band and the hood on whole device pixels of the page for
   * this pane's box (ADR 0091 "Frames", ADR 0123 "Geometry"), the label
   * fitted to the hood's room in the title font. Style writes only when a
   * value changes.
   */
  private placeFrame(rect: Rect, cell: PaneCell): void {
    const doc = this.ctx.doc;
    const dpr = doc.defaultView?.devicePixelRatio ?? 1;
    const box = { x: (cell.ox ?? 0) + rect.x * cell.w, y: (cell.oy ?? 0) + rect.y * cell.h, w: rect.w * cell.w, h: rect.h * cell.h };
    const g = frameGeometry(box, cell.w, cell.h, dpr);
    const size = titlePx(cell.h);
    const measure = (s: string): number => titleWidth(doc, s, size);
    const title = fitTitle(this._label, hoodRoom(box, g, cell.w), measure);
    // A script pane made without a cross shows no hover set (ADR 0084 addendum).
    const hover = this.el.hasAttribute('data-no-cross') ? 0 : this.hoverCells;
    const clear = hover > 0 ? box.w - hover * cell.w : Infinity;
    const pl = title ? framePlate(box, g, cell.w, cell.h, measure(title), dpr, clear) : null;
    this._frameLine = g;
    this._plate = pl;
    this._title = pl ? title : '';
    const fw = box.w - g.l - g.r, fh = box.h - g.top - g.b;
    const hair = Math.max(1, Math.round(dpr)) / (dpr > 0 ? dpr : 1);
    const arm = frameArm(g, dpr);
    const key = `${g.t},${g.l},${g.r},${g.top},${g.b},${fw},${fh},${hair},${arm},${size},${pl ? `${pl.x0},${pl.x1},${pl.y0},${pl.y1},${pl.r}` : ''}`;
    if (key === this.geomKey) return;
    this.geomKey = key;
    const [dark, light] = this.seamPaths as [SVGPathElement, SVGPathElement];
    const seams = frameSeams(fw, fh, g.t, pl);
    dark.setAttribute('d', seams.dark);
    light.setAttribute('d', seams.light);
    this.rimEl.style.clipPath = `path(evenodd, "${frameRimPath(fw, fh, g.t, pl)}")`;
    const st = this.el.style;
    st.setProperty('--frame-t', `${g.t}px`);
    st.setProperty('--frame-l', `${g.l}px`);
    st.setProperty('--frame-r', `${g.r}px`);
    st.setProperty('--frame-top', `${g.top}px`);
    st.setProperty('--frame-b', `${g.b}px`);
    st.setProperty('--frame-hair', `${hair}px`);
    st.setProperty('--frame-arm', `${arm}px`);
    st.setProperty('--title-px', `${size}px`);
    st.setProperty('--frame-hole', `path("${frameHolePath(fw, fh, g.t, pl)}")`);
    // The window's own box is the hole's bounds (its vignette follows them).
    st.setProperty('--frame-window', `path("${frameHolePath(fw, fh, g.t, pl, -g.t, -g.t)}")`);
    if (pl) {
      st.setProperty('--plate-x0', `${pl.x0}px`);
      st.setProperty('--plate-x1', `${pl.x1}px`);
      st.setProperty('--plate-y0', `${pl.y0}px`);
      st.setProperty('--plate-y1', `${pl.y1}px`);
      st.setProperty('--plate-r', `${pl.r}px`);
    } else for (const k of ['--plate-x0', '--plate-x1', '--plate-y0', '--plate-y1', '--plate-r']) st.removeProperty(k);
  }

  /**
   * Where the hood ends, in CSS px from the pane's left edge (0 with no
   * hood or no frame): the cockpit keeps the hover buttons right of it
   * (ADR 0095, ADR 0123).
   */
  get titleEnd(): number {
    const pl = this._plate;
    const g = this._frameLine;
    return this.placed?.framed && pl && g ? g.l + pl.x1 : 0;
  }

  /**
   * How far the hover set may cover the hood, in CSS px from the pane's left
   * edge: the hood's left end and its rivet stay clear, the label may be
   * covered (ADR 0123 "Hood position and hover buttons"). 0 with no hood or
   * no frame.
   */
  get titleKeep(): number {
    const pl = this._plate;
    const g = this._frameLine;
    const c = this.placedCell;
    return this.placed?.framed && pl && g && c ? g.l + pl.x0 + HOOD_PAD * c.w : 0;
  }

  /**
   * Marks that the hover set, from `x` CSS px from the pane's left edge,
   * lies over the hood's right part (null: it does not): on hover the hood
   * gets an iron shelf from there under the buttons and its label fades out
   * before it (layout.css `data-hood-cover`). The cockpit calls it after each
   * placement (`syncLook`). Writes only on a change.
   */
  coverHood(x: number | null): void {
    const g = this._frameLine, pl = this._plate, c = this.placedCell;
    const v = x !== null && g && pl && c ? Math.round((x - g.l) * 1e4) / 1e4 : null;
    // What is left of the label before its fade (`COVER_FADE` cells); under `COVER_KEEP` cells it fades out whole.
    const mode = v === null || !pl || !c ? null : v - COVER_FADE * c.w - (pl.x0 + HOOD_PAD * c.w) < COVER_KEEP * c.w ? 'all' : '';
    if (v === this.coverX && mode === this.coverMode) return;
    this.coverX = v;
    this.coverMode = mode;
    if (mode === null) this.el.removeAttribute('data-hood-cover');
    else this.el.setAttribute('data-hood-cover', mode);
    if (v === null) this.el.style.removeProperty('--cover-x');
    else this.el.style.setProperty('--cover-x', `${v}px`);
  }

  /** The frame rim as last placed (CSS px from the pane's edges), null while unframed. */
  protected get frameLine(): FrameGeometry | null {
    return this.placed?.framed ? this._frameLine : null;
  }

  /**
   * The band's hole (the inside less the hood, `frameHolePath`) moved by
   * (`dx`, `dy`) from the frame box, for a clip; null while unframed.
   */
  protected frameHole(dx: number, dy: number): string | null {
    const g = this.frameLine, p = this.placed, c = this.placedCell;
    if (!g || !p || !c) return null;
    const fw = p.rect.w * c.w - g.l - g.r, fh = p.rect.h * c.h - g.top - g.b;
    return frameHolePath(fw, fh, g.t, this._plate, dx, dy);
  }

  private setSize(cols: number, rows: number): void {
    if (cols === this._cols && rows === this._rows) return;
    this._cols = cols;
    this._rows = rows;
    for (const fn of [...this.listeners]) fn(cols, rows);
    this.markDirty();
  }
}

// PANE_FACTORIES lives in ./factories.ts: the pane subclasses import this
// file, so the table cannot be here without an import cycle.
