// Pane shell (ADR 0010 "Consequences", ADR 0012, ADR 0016): the element a
// side pane lives in. The cockpit (src/layout/cockpit.ts) positions it and
// draws its frame; a pane subclass renders into `content`.
//
//   .wc-pane.wc-pane-<id>[data-active]   positioned in whole cells, --pane-* tokens
//     .wc-pane-frame                     the glyph frame (absent text when border off)
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
import { frameText } from './frame';

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
  private readonly frameEl: HTMLDivElement;
  private readonly listeners = new Set<PaneResizeListener>();
  private readonly unsubs: (() => void)[] = [];
  private frameKey = '';
  private _label: string;
  private themeKey = '';
  private _cols = 0;
  private _rows = 0;
  private _visible = false;
  /** The last placement (for a label change). */
  private placed: PanePlacement | null = null;
  private placedCell: { w: number; h: number } | null = null;
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
    this.frameEl = doc.createElement('div');
    this.frameEl.className = 'wc-pane-frame';
    this.frameEl.setAttribute('aria-hidden', 'true');
    this.content = doc.createElement('div');
    this.content.className = 'wc-pane-content';
    this.el.append(this.frameEl, this.content);
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
    this.frameKey = '';
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
    const key = `${paneSettingsOf(s.panes, this.id).color}|${a.fg}|${a.bg}|${a.ansi.join(',')}`;
    if (key !== this.themeKey) {
      this.themeKey = key;
      this.markDirty();
    }
  }

  /** Cockpit only: shows the pane at `p` (cells × `cell` px) or hides it. */
  place(p: PanePlacement | null, cell: { w: number; h: number }): void {
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
    const key = p.framed ? `${rect.w}x${rect.h}|${this._label}` : '';
    if (key !== this.frameKey) {
      this.frameKey = key;
      this.frameEl.textContent = p.framed ? frameText(rect.w, rect.h, this._label) : '';
    }
    this.el.toggleAttribute('data-framed', p.framed);
    this.el.toggleAttribute('data-floating', p.floating !== undefined);
    st.zIndex = p.floating === undefined ? '' : String(FLOAT_Z + p.floating);
    this.el.hidden = false;
    this._visible = true;
    this.setSize(content.w, content.h);
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
