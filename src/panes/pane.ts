// Pane shell (ADR 0010 "Consequences", ADR 0012, ADR 0016): the element a
// side pane lives in. The cockpit (src/layout/cockpit.ts) positions it and
// draws its frame; a pane subclass renders into `content`.
//
//   .wc-pane.wc-pane-<id>[data-active]   positioned in whole cells, --pane-* tokens
//     .wc-pane-blur > i × 4              the rim's backdrop blur in four strips (weather on)
//     .wc-pane-rim                       the glass rim and nameplate (hidden when border off)
//       svg.wc-pane-seam                 the rim's inner seam
//     .wc-pane-frame                     the frame box (hidden when border off); ::before is its fill
//       .wc-pane-title > span            the label on the nameplate
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
import { type FrameGeometry, type FramePlate, frameGeometry, frameHolePath, frameLabel, framePlate, frameRimPath, frameSeams, frameStrips } from './frame';

export type { PaneContext } from './context';

/** Panes that blank their content while not `playing` (Inv §2.1): all but UI and the map. */
export const BLANK_WHEN_INACTIVE: Readonly<Record<BuiltinPaneId, boolean>> = {
  character: true,
  timers: true,
  group: true,
  comm: true,
  ui: false,
  map: false,
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
  /** The rim's blur strips (top with the plate, left, right, bottom). */
  private readonly blurEls: HTMLElement[];
  private readonly frameEl: HTMLDivElement;
  private readonly titleEl: HTMLSpanElement;
  /** The label text inside the title (its box trimmed to the capitals, so they centre on the plate). */
  private readonly labelEl: HTMLSpanElement;
  private geomKey = '';
  private _frameLine: FrameGeometry | null = null;
  private _plate: FramePlate | null = null;
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
    // The rim comes first: its backdrop is what is behind the pane, not the
    // pane's fill (ADR 0091 "Frames", addendum: glass rim and nameplate).
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
    const blur = doc.createElement('div');
    blur.className = 'wc-pane-blur';
    blur.setAttribute('aria-hidden', 'true');
    this.blurEls = [0, 1, 2, 3].map(() => blur.appendChild(doc.createElement('i')));
    this.frameEl = doc.createElement('div');
    this.frameEl.className = 'wc-pane-frame';
    this.frameEl.setAttribute('aria-hidden', 'true');
    this.titleEl = doc.createElement('span');
    this.titleEl.className = 'wc-pane-title';
    this.labelEl = doc.createElement('span');
    this.frameEl.append(this.titleEl);
    this.content = doc.createElement('div');
    this.content.className = 'wc-pane-content';
    this.el.append(blur, this.rimEl, this.frameEl, this.content);
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
    const want = p.framed ? frameLabel(rect.w, this._label) : '';
    if (p.framed) this.placeFrame(rect, cell, want.length);
    // No plate (no room for one): no title.
    const label = p.framed && this._plate ? want : '';
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
   * Puts the frame rim and the nameplate on whole device pixels of the page
   * for this pane's box (ADR 0091 "Frames"). Style writes only when a value
   * changes.
   */
  private placeFrame(rect: Rect, cell: PaneCell, chars: number): void {
    const dpr = this.ctx.doc.defaultView?.devicePixelRatio ?? 1;
    const box = { x: (cell.ox ?? 0) + rect.x * cell.w, y: (cell.oy ?? 0) + rect.y * cell.h, w: rect.w * cell.w, h: rect.h * cell.h };
    const g = frameGeometry(box, cell.w, cell.h, dpr);
    const pl = framePlate(box, g, cell.w, cell.h, chars, dpr);
    this._frameLine = g;
    this._plate = pl;
    const fw = box.w - g.l - g.r, fh = box.h - g.top - g.b;
    const hair = Math.max(1, Math.round(dpr)) / (dpr > 0 ? dpr : 1);
    const key = `${g.t},${g.l},${g.r},${g.top},${g.b},${fw},${fh},${hair},${pl ? `${pl.x0},${pl.x1},${pl.y0},${pl.y1},${pl.r}` : ''}`;
    if (key === this.geomKey) return;
    this.geomKey = key;
    const [dark, light] = this.seamPaths as [SVGPathElement, SVGPathElement];
    const seams = frameSeams(fw, fh, g.t, pl);
    dark.setAttribute('d', seams.dark);
    light.setAttribute('d', seams.light);
    this.rimEl.style.clipPath = `path(evenodd, "${frameRimPath(fw, fh, g.t, pl)}")`;
    const strips = frameStrips(fw, fh, g.t, pl);
    for (let i = 0; i < 4; i++) {
      const s = strips[i]!, bs = this.blurEls[i]!.style;
      bs.left = `${s.x}px`;
      bs.top = `${s.y}px`;
      bs.width = `${s.w}px`;
      bs.height = `${s.h}px`;
      bs.clipPath = `path(evenodd, "${frameRimPath(fw, fh, g.t, pl, -s.x, -s.y)}")`;
    }
    const st = this.el.style;
    st.setProperty('--frame-t', `${g.t}px`);
    st.setProperty('--frame-l', `${g.l}px`);
    st.setProperty('--frame-r', `${g.r}px`);
    st.setProperty('--frame-top', `${g.top}px`);
    st.setProperty('--frame-b', `${g.b}px`);
    st.setProperty('--frame-hair', `${hair}px`);
    st.setProperty('--frame-hole', `path("${frameHolePath(fw, fh, g.t, pl)}")`);
    if (pl) {
      st.setProperty('--plate-x0', `${pl.x0}px`);
      st.setProperty('--plate-x1', `${pl.x1}px`);
      st.setProperty('--plate-y0', `${pl.y0}px`);
      st.setProperty('--plate-y1', `${pl.y1}px`);
      st.setProperty('--plate-r', `${pl.r}px`);
    } else for (const k of ['--plate-x0', '--plate-x1', '--plate-y0', '--plate-y1', '--plate-r']) st.removeProperty(k);
  }

  /** The frame rim as last placed (CSS px from the pane's edges), null while unframed. */
  protected get frameLine(): FrameGeometry | null {
    return this.placed?.framed ? this._frameLine : null;
  }

  /**
   * The rim's hole (the inside less the nameplate, `frameHolePath`) moved by
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
