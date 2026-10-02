// Cockpit view (ADR 0010 "Docking", ADR 0012): the game pane, the docks
// with their panes and the input line, positioned absolutely in whole
// cells from `allocate()`.
//
//   .wc-cockpit
//     .wc-game          the output pane (src/ui/output-pane.ts) goes in here
//     .wc-pane × 6      pane shells (src/panes/pane.ts; the map included)
//     .wc-input-slot    the input line (src/ui/input-pane.ts), under the game pane
//     .wc-handles       invisible resize handles over the gaps and frames
//     .wc-drop-bar      insertion bar while a pane is dragged to a dock
//     .wc-drop-ghost    outline where a pane dragged over the game will float
//     .wc-too-small     "Window too small" (below 60 × 18 cells)
//     .wc-drag-shield   transparent cover with the drag cursor while a drag runs
//
// Relayout is one atomic pass per animation frame after a size change of
// the cockpit element (window resize, padding), a cell size change or a
// settings change. Game output never triggers it: the game pane has a
// fixed size and `contain: strict`, so new lines lay out only inside it.
// NAWS follows from the output pane's own ResizeObserver when the game
// pane's size changes.
//
// Pointer interaction (no animation):
// - Drag a pane by its title row (the frame's top row; with the border off,
//   the top content row) to a dock or a position in a dock. The insertion
//   bar shows where it lands. Dropping on the screen edge of a dock that is
//   not shown opens that dock at its default size.
// - Floating panes (ADR 0014): drop a docked pane over the game area and it
//   floats there at the standard size, 36 × 14 cells (an outline shows
//   where). Drag a floating pane
//   by its title row to move it; drop it on a screen-edge zone to dock it.
//   Its edges and corners resize it. Pressing on it brings it to front.
// - Hovering a pane shows a close cross (`.wc-pane-close`, " × ") in its
//   title row, one cell in from the right edge; clicking it switches the
//   pane off (`panes[id].on = false`, the same as Settings).
// - Drag the gap between the game pane and a dock to resize the dock, or
//   the boundary between two panes (the lower part of the upper pane's last
//   row, or the right part of the left pane's last column) to resize them.
// - Every drag previews live and writes the settings once, on release.
// - Grips and handles never take focus; after a drag or a click the focus
//   goes back to the input (Inv §1.3).
// - Script panes (ADR 0053) join with `addPane` while their script runs
//   and leave with `removePane`; only added ones take part in allocation
//   (`present`). Their place in the settings stays when they leave.

import './layout.css';
import { type CellSource, type PaneContext, createPaneContext } from '../panes/context';
import { PANE_FACTORIES } from '../panes/factories';
import type { PaneShell } from '../panes/pane';
import type { SettingsStore } from '../settings';
import {
  BOTTOM_DOCK_MIN,
  DOCK_GAP,
  GAME_MIN_COLS,
  GAME_MIN_ROWS,
  FLOAT_STANDARD_H,
  FLOAT_STANDARD_W,
  INPUT_ROWS,
  type LayoutResult,
  MIN_VIEW_COLS,
  MIN_VIEW_ROWS,
  type PaneBox,
  type Rect,
  SIDE_DOCK_MIN,
  TOP_DOCK_MIN,
  type DockBox,
  allocate,
  clampFloat,
  floatMin,
  isSideDock,
} from './allocate';
import {
  findFloat,
  floatPane,
  isNoopMove,
  movePane,
  raisePane,
  resizeRect,
  setDesired,
  setDockSize,
  setFloatRect,
  shiftBoundary,
  togglePatch,
} from './model';
import { paneSettingsOf } from '../settings/types';
import {
  type DockId,
  defaultDockSize,
  type LayoutModel,
  PANE_IDS,
  type PaneId,
  type ScriptPaneId,
  isScriptPaneId,
  paneScript,
} from './types';

/** A script pane on screen now (Options → Panes lists them, ADR 0053). */
export interface ScriptPaneInfo {
  id: ScriptPaneId;
  /** The script that owns it. */
  script: string;
  /** Its title (the frame label). */
  title: string;
}

export type { CellSource } from '../panes/context';

export interface CockpitOptions {
  /** Parent element; the cockpit fills it. */
  root: HTMLElement;
  settings: SettingsStore;
  cells: CellSource;
  /** Returns the focus to the input line. */
  onFocusInput?: () => void;
  /** Frame scheduler (default requestAnimationFrame). */
  requestFrame?: (cb: () => void) => void;
  /**
   * The context the side panes are built with (App passes the real one).
   * Default: `createPaneContext` with this cockpit's document, settings,
   * cells and frame scheduler. The cockpit emits `view.size` on its bus.
   */
  paneContext?: PaneContext;
}

/**
 * Where a dragged pane would land: a place in a dock (`bar` is the
 * insertion bar in px relative to the cockpit) or a floating rectangle
 * (`rect`, outer cells).
 */
export type DropTarget =
  | {
      kind: 'dock';
      dock: DockId;
      index: number;
      /** The dock is not shown now; the drop opens it at its default size. */
      open: boolean;
      bar: Rect;
    }
  | { kind: 'float'; rect: Rect };

/** Resize handles of a floating pane, by the edges they move. */
const FLOAT_EDGES = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as const;

/** Pointer travel (px) before a press on a title row becomes a drag. */
const DRAG_THRESHOLD = 4;
/** Width in cells of the screen-edge zone that opens a hidden dock. */
const EDGE_CELLS = 2;
/**
 * Height in rows of the top screen-edge zone. Panes are dragged by their
 * title row, so a deeper zone would keep a floating pane from row 0.
 */
const TOP_EDGE_ROWS = 0.5;

type Drag =
  | {
      kind: 'move';
      id: PaneId;
      pointerId: number;
      x0: number;
      y0: number;
      /** The pressed cell relative to the pane's top-left cell. */
      grab: { x: number; y: number };
      active: boolean;
      target: DropTarget | null;
    }
  | {
      kind: 'float';
      id: PaneId;
      edges: string;
      pointerId: number;
      x0: number;
      y0: number;
      rect: Rect;
      min: { w: number; h: number };
      base: LayoutModel;
    }
  | { kind: 'dock'; dock: DockId; pointerId: number; base: LayoutModel }
  | {
      kind: 'panes';
      dock: DockId;
      pointerId: number;
      a: { id: PaneId; size: number };
      b: { id: PaneId; size: number };
      cell0: number;
      base: LayoutModel;
    };

export class Cockpit {
  readonly el: HTMLDivElement;
  /** The game pane's container. */
  readonly gameEl: HTMLDivElement;
  /** The input line's container. */
  readonly inputEl: HTMLDivElement;
  private readonly handlesEl: HTMLDivElement;
  private readonly barEl: HTMLDivElement;
  private readonly ghostEl: HTMLDivElement;
  private readonly tooSmallEl: HTMLDivElement;
  /**
   * Shown over the whole cockpit while a drag runs and carries its cursor,
   * so a drag start or end restyles this one element, not every element
   * under the cockpit (the output rows included; ADR 0044 rule 2).
   */
  private readonly shieldEl: HTMLDivElement;
  private readonly shells = new Map<PaneId, PaneShell>();
  /** Close crosses by pane (their tooltip follows the label). */
  private readonly closers = new Map<PaneId, HTMLDivElement>();
  /** Script panes added with `addPane` (ADR 0053). */
  private readonly present = new Set<PaneId>();
  private readonly paneListeners = new Set<() => void>();
  private readonly settings: SettingsStore;
  private readonly cells: CellSource;
  private readonly onFocusInput: () => void;
  private readonly requestFrame: (cb: () => void) => void;
  /** The context the panes were built with. */
  readonly paneContext: PaneContext;
  private readonly unsubs: (() => void)[] = [];
  private lastSize = '';
  private readonly ro: ResizeObserver | null = null;
  private last: LayoutResult | null = null;
  private preview: LayoutModel | null = null;
  private drag: Drag | null = null;
  private scheduled = false;
  private disposed = false;
  private wasTooSmall = false;
  /** Set by a handled pointerdown so the following mousedown keeps the focus. */
  private swallowMouseDown = false;

  constructor(opts: CockpitOptions) {
    const doc = opts.root.ownerDocument;
    this.settings = opts.settings;
    this.cells = opts.cells;
    this.onFocusInput = opts.onFocusInput ?? (() => {});
    this.requestFrame =
      opts.requestFrame ??
      (typeof requestAnimationFrame === 'function'
        ? (cb) => void requestAnimationFrame(() => cb())
        : (cb) => void setTimeout(cb, 0));

    const div = (cls: string): HTMLDivElement => {
      const d = doc.createElement('div');
      d.className = cls;
      return d;
    };
    this.el = div('wc-cockpit');
    this.gameEl = div('wc-game');
    this.inputEl = div('wc-input-slot');
    this.handlesEl = div('wc-handles');
    this.barEl = div('wc-drop-bar');
    this.barEl.hidden = true;
    this.ghostEl = div('wc-drop-ghost');
    this.ghostEl.hidden = true;
    this.tooSmallEl = div('wc-too-small');
    this.tooSmallEl.hidden = true;
    this.shieldEl = div('wc-drag-shield');
    this.shieldEl.hidden = true;
    this.paneContext =
      opts.paneContext ??
      createPaneContext({ doc, settings: this.settings, cells: this.cells, requestFrame: this.requestFrame });
    this.el.append(this.gameEl);
    for (const id of PANE_IDS) this.attach(PANE_FACTORIES[id](this.paneContext));
    this.el.append(this.inputEl, this.handlesEl, this.barEl, this.ghostEl, this.tooSmallEl, this.shieldEl);
    opts.root.appendChild(this.el);

    this.el.addEventListener('pointerdown', this.onPointerDown);
    this.el.addEventListener('pointermove', this.onPointerMove);
    this.el.addEventListener('pointerup', this.onPointerUp);
    this.el.addEventListener('pointercancel', this.onPointerCancel);
    this.el.addEventListener('lostpointercapture', this.onPointerCancel);
    this.el.addEventListener('mousedown', this.onMouseDown);
    this.el.addEventListener('mouseup', this.onMouseUp);

    this.unsubs.push(
      this.settings.subscribe(() => this.scheduleRelayout()),
      this.cells.subscribe(() => this.scheduleRelayout()),
    );
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.scheduleRelayout());
      this.ro.observe(this.el);
    }
    this.relayoutNow();
  }

  /** The shell of pane `id` (content element, size, onResize). */
  pane(id: PaneId): PaneShell {
    return this.shells.get(id)!;
  }

  /** Adds the grip, close cross and float handles to `shell` and puts it on the cockpit. */
  private attach(shell: PaneShell, before: Element | null = null): void {
    const doc = this.el.ownerDocument;
    const div = (cls: string): HTMLDivElement => {
      const d = doc.createElement('div');
      d.className = cls;
      return d;
    };
    const id = shell.id;
    const grip = div('wc-pane-grip');
    grip.dataset.grip = id;
    shell.el.append(grip);
    const close = div('wc-pane-close');
    close.textContent = ' × ';
    close.setAttribute('role', 'button');
    this.labelClose(close, shell.label);
    close.addEventListener('click', () => this.settings.update(togglePatch(this.settings.get().panes, id, false)));
    shell.el.append(close);
    this.closers.set(id, close);
    for (const edge of FLOAT_EDGES) {
      const h = div('wc-float-handle');
      h.dataset.edge = edge;
      shell.el.append(h);
    }
    this.shells.set(id, shell);
    this.el.insertBefore(shell.el, before);
  }

  private labelClose(close: HTMLElement, label: string): void {
    const text = `Hide ${label}`;
    if (close.title === text) return;
    close.title = text;
    close.setAttribute('aria-label', text);
  }

  /**
   * Shows script pane `shell` (ADR 0053): it takes part in allocation from
   * the next layout, where the settings place it. The caller owns the
   * shell and disposes it after `removePane`.
   */
  addPane(shell: PaneShell): void {
    if (!isScriptPaneId(shell.id) || this.disposed) throw new Error(`addPane: ${shell.id} is not a script pane`);
    if (this.shells.has(shell.id)) throw new Error(`addPane: ${shell.id} is already shown`);
    this.attach(shell, this.inputEl);
    this.present.add(shell.id);
    this.paneChanged();
  }

  /** Takes script pane `id` off the cockpit; its place in the settings stays. */
  removePane(id: PaneId): void {
    if (!this.present.delete(id)) return;
    const shell = this.shells.get(id);
    this.shells.delete(id);
    this.closers.delete(id);
    if (shell) {
      shell.place(null, this.cells.get());
      shell.el.remove();
    }
    if (this.drag && 'id' in this.drag && this.drag.id === id) this.cancelDrag();
    this.paneChanged();
  }

  /** The script panes on screen now, in the order they were added. */
  scriptPanes(): ScriptPaneInfo[] {
    const out: ScriptPaneInfo[] = [];
    for (const id of this.present) {
      if (!isScriptPaneId(id)) continue;
      out.push({ id, script: paneScript(id), title: this.shells.get(id)?.label ?? id });
    }
    return out;
  }

  /** Calls `fn` when a script pane is added, removed or retitled. Returns the unsubscribe. */
  onScriptPanes(fn: () => void): () => void {
    this.paneListeners.add(fn);
    return () => this.paneListeners.delete(fn);
  }

  /** A script pane's title changed (ScriptPane.setTitle). */
  paneRetitled(id: PaneId): void {
    const close = this.closers.get(id);
    const shell = this.shells.get(id);
    if (close && shell) this.labelClose(close, shell.label);
    for (const fn of [...this.paneListeners]) fn();
  }

  private paneChanged(): void {
    this.scheduleRelayout();
    for (const fn of [...this.paneListeners]) fn();
  }

  /** The last layout (cells), or null before the cockpit has a size. */
  get layout(): LayoutResult | null {
    return this.last;
  }

  /** Relayouts in the next animation frame (coalesced). */
  scheduleRelayout(): void {
    if (this.scheduled || this.disposed) return;
    this.scheduled = true;
    this.requestFrame(() => {
      this.scheduled = false;
      if (!this.disposed) this.relayoutNow();
    });
  }

  /** Relayouts at once. */
  relayoutNow(): void {
    const cell = this.cells.get();
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    if (!(W > 0 && H > 0 && cell.w > 0 && cell.h > 0)) return;
    const s = this.settings.get();
    const r = allocate({
      layout: this.preview ?? s.layout,
      panes: s.panes,
      present: this.present,
      cols: Math.floor(W / cell.w + 1e-6),
      rows: Math.floor(H / cell.h + 1e-6),
    });
    this.last = r;
    this.el.dataset.cells = `${r.cols}x${r.rows}`;
    if (this.el.dataset.cells !== this.lastSize) {
      this.lastSize = this.el.dataset.cells;
      this.paneContext.bus.emit('view.size', { cols: r.cols, rows: r.rows });
    }
    this.el.dataset.collapsed = r.collapsed.join(' ');
    this.setTooSmall(r);

    placeEl(this.gameEl, r.game, cell);
    placeEl(this.inputEl, r.input, cell);
    const boxes = new Map(r.panes.map((p) => [p.id, p]));
    for (const [id, shell] of this.shells) {
      shell.applyTheme(s);
      const b = boxes.get(id);
      shell.place(
        b ? { rect: b.rect, content: b.content, framed: b.framed, floating: b.dock === 'float' ? b.index : undefined } : null,
        cell,
      );
    }
    this.renderHandles(r, cell);
  }

  /** Stops listening and removes the cockpit. */
  dispose(): void {
    this.disposed = true;
    for (const u of this.unsubs) u();
    this.paneListeners.clear();
    for (const s of this.shells.values()) s.dispose();
    this.ro?.disconnect();
    this.el.remove();
  }

  // ---------------------------------------------------------------- render

  private setTooSmall(r: LayoutResult): void {
    const small = r.tooSmall;
    if (small) {
      this.tooSmallEl.textContent =
        `Window too small\n\n` +
        `${r.cols} × ${r.rows} cells, needs ${MIN_VIEW_COLS} × ${MIN_VIEW_ROWS}.\n` +
        `Enlarge the window or make the font smaller.`;
    }
    if (small === this.wasTooSmall) return;
    const hadFocus = this.el.contains(this.el.ownerDocument.activeElement);
    this.wasTooSmall = small;
    this.tooSmallEl.hidden = !small;
    this.el.toggleAttribute('data-too-small', small);
    for (const child of [this.gameEl, this.inputEl, ...[...this.shells.values()].map((s) => s.el)]) {
      child.inert = small;
    }
    if (small) this.cancelDrag();
    else if (hadFocus || this.el.ownerDocument.activeElement === this.el.ownerDocument.body) this.onFocusInput();
  }

  private renderHandles(r: LayoutResult, cell: { w: number; h: number }): void {
    const doc = this.el.ownerDocument;
    const frag = doc.createDocumentFragment();
    const add = (rect: Rect, axis: 'x' | 'y', data: Record<string, string>): void => {
      const h = doc.createElement('div');
      h.className = 'wc-handle';
      h.dataset.axis = axis;
      Object.assign(h.dataset, data);
      const st = h.style;
      st.left = `${rect.x}px`;
      st.top = `${rect.y}px`;
      st.width = `${rect.w}px`;
      st.height = `${rect.h}px`;
      frag.append(h);
    };
    if (!r.tooSmall) {
      const hz = Math.max(4, Math.round(cell.h * 0.4));
      const wz = Math.max(3, Math.round(cell.w * 0.4));
      for (const dock of Object.values(r.docks)) {
        const d = dock.rect;
        if (dock.id === 'right') {
          add({ x: (d.x - DOCK_GAP) * cell.w, y: 0, w: DOCK_GAP * cell.w, h: d.h * cell.h }, 'x', { dock: 'right' });
        } else if (dock.id === 'left') {
          add({ x: (d.x + d.w) * cell.w, y: 0, w: DOCK_GAP * cell.w, h: d.h * cell.h }, 'x', { dock: 'left' });
        } else if (dock.id === 'top') {
          add({ x: d.x * cell.w, y: (d.y + d.h) * cell.h, w: d.w * cell.w, h: DOCK_GAP * cell.h }, 'y', { dock: 'top' });
        } else {
          add({ x: d.x * cell.w, y: (d.y - DOCK_GAP) * cell.h, w: d.w * cell.w, h: DOCK_GAP * cell.h }, 'y', {
            dock: 'bottom',
          });
        }
        const boxes = r.panes.filter((p) => p.dock === dock.id);
        for (let i = 0; i + 1 < boxes.length; i++) {
          const a = boxes[i]!;
          const b = boxes[i + 1]!;
          const data = { dock: dock.id, a: a.id, b: b.id };
          if (isSideDock(dock.id)) {
            add({ x: d.x * cell.w, y: b.rect.y * cell.h - hz, w: d.w * cell.w, h: hz }, 'y', data);
          } else {
            add({ x: b.rect.x * cell.w - wz, y: d.y * cell.h, w: wz, h: d.h * cell.h }, 'x', data);
          }
        }
      }
    }
    this.handlesEl.replaceChildren(frag);
  }

  // ------------------------------------------------------------- pointers

  private local(e: PointerEvent | MouseEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.swallowMouseDown = false;
    if (this.drag || !this.last || this.last.tooSmall) return;
    const t = e.target as HTMLElement;
    const floating = t.closest<HTMLElement>('.wc-pane[data-floating]');
    if (floating) this.raise(floating.dataset.pane as PaneId);
    if (e.button !== 0) return;
    const grip = t.closest<HTMLElement>('.wc-pane-grip');
    const edge = t.closest<HTMLElement>('.wc-float-handle');
    const handle = t.closest<HTMLElement>('.wc-handle');
    const { x, y } = this.local(e);
    const cell = this.cells.get();
    const boxOf = (id: PaneId): PaneBox | undefined => this.last!.panes.find((p) => p.id === id);
    if (edge && floating) {
      const id = floating.dataset.pane as PaneId;
      const b = boxOf(id);
      if (!b) return;
      this.drag = {
        kind: 'float',
        id,
        edges: edge.dataset.edge!,
        pointerId: e.pointerId,
        x0: x,
        y0: y,
        rect: b.rect,
        min: floatMin(id, b.framed),
        base: this.settings.get().layout,
      };
      this.showShield(edge.dataset.edge!);
    } else if (grip) {
      const id = grip.dataset.grip as PaneId;
      const b = boxOf(id);
      const grab = b ? { x: Math.floor(x / cell.w) - b.rect.x, y: Math.floor(y / cell.h) - b.rect.y } : { x: 0, y: 0 };
      this.drag = { kind: 'move', id, pointerId: e.pointerId, x0: x, y0: y, grab, active: false, target: null };
    } else if (handle) {
      const dock = handle.dataset.dock as DockId;
      const base = this.settings.get().layout;
      if (handle.dataset.a && handle.dataset.b) {
        const box = (id: string): PaneBox | undefined => this.last!.panes.find((p) => p.id === id);
        const a = box(handle.dataset.a);
        const b = box(handle.dataset.b);
        if (!a || !b) return;
        const side = isSideDock(dock);
        const size = (p: PaneBox): number => (side ? p.content.h : p.content.w);
        // A dock that is short of space is frozen at what it shows now, so
        // the boundary follows the pointer exactly (ADR 0012).
        let frozen = base;
        if (this.last.docks[dock]?.mode === 'scaled') {
          const all: Partial<Record<PaneId, number>> = {};
          for (const p of this.last.panes) if (p.dock === dock) all[p.id] = size(p);
          frozen = setDesired(base, all);
        }
        this.drag = {
          kind: 'panes',
          dock,
          pointerId: e.pointerId,
          a: { id: a.id, size: size(a) },
          b: { id: b.id, size: size(b) },
          cell0: side ? Math.floor(y / cell.h) : Math.floor(x / cell.w),
          base: frozen,
        };
      } else {
        this.drag = { kind: 'dock', dock, pointerId: e.pointerId, base };
      }
      this.showShield(handle.dataset.axis!);
    } else {
      return;
    }
    this.swallowMouseDown = true;
    e.preventDefault();
    try {
      // On the cockpit itself: handles are re-created by every relayout.
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no active pointer */
    }
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    // Grips, handles and the gaps between panes never take the focus.
    const t = e.target as HTMLElement;
    if (this.swallowMouseDown || t === this.el || t === this.handlesEl || t.closest('.wc-pane-close')) {
      e.preventDefault();
    }
    this.swallowMouseDown = false;
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (this.drag) return;
    const t = e.target as HTMLElement;
    if (t.closest('.wc-output, .wc-input-slot')) return; // they handle their own
    const sel = this.el.ownerDocument.getSelection();
    if (sel && !sel.isCollapsed && this.el.contains(sel.anchorNode)) return;
    this.onFocusInput();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId || !this.last) return;
    const { x, y } = this.local(e);
    const cell = this.cells.get();
    const r = this.last;
    if (d.kind === 'move') {
      if (!d.active) {
        if (Math.hypot(x - d.x0, y - d.y0) < DRAG_THRESHOLD) return;
        d.active = true;
        this.showShield('move');
        this.shells.get(d.id)!.el.toggleAttribute('data-dragging', true);
      }
      d.target = this.dropTarget(x, y, d.id, d.grab);
      this.showTarget(d.target);
      return;
    }
    if (d.kind === 'float') {
      const dx = Math.round((x - d.x0) / cell.w);
      const dy = Math.round((y - d.y0) / cell.h);
      const rect = resizeRect(d.rect, d.edges, dx, dy, d.min, r.cols, r.rows);
      this.setPreview(setFloatRect(d.base, d.id, rect));
      return;
    }
    if (d.kind === 'dock') {
      const H = r.rows;
      let size: number;
      let min: number;
      let max: number;
      if (d.dock === 'bottom' || d.dock === 'top') {
        // The other of the two keeps what it shows now.
        const other = r.docks[d.dock === 'bottom' ? 'top' : 'bottom'];
        const row = Math.floor(y / cell.h);
        size = d.dock === 'bottom' ? H - DOCK_GAP - row : row;
        min = d.dock === 'bottom' ? BOTTOM_DOCK_MIN : TOP_DOCK_MIN;
        max = H - INPUT_ROWS - DOCK_GAP - GAME_MIN_ROWS - (other ? other.rect.h + DOCK_GAP : 0);
      } else {
        const col = Math.floor(x / cell.w);
        size = d.dock === 'right' ? r.cols - DOCK_GAP - col : col;
        const other = r.docks[d.dock === 'right' ? 'left' : 'right'];
        min = SIDE_DOCK_MIN;
        max = r.cols - GAME_MIN_COLS - DOCK_GAP - (other ? other.rect.w + DOCK_GAP : 0);
      }
      if (max < min) return;
      this.setPreview(setDockSize(d.base, d.dock, Math.max(min, Math.min(max, size))));
      return;
    }
    const side = isSideDock(d.dock);
    const delta = (side ? Math.floor(y / cell.h) : Math.floor(x / cell.w)) - d.cell0;
    const n = shiftBoundary(d.a, d.b, d.dock, delta);
    this.setPreview(setDesired(d.base, { [d.a.id]: n.a, [d.b.id]: n.b }));
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (d.kind === 'move') {
      if (d.active && d.target) {
        const t = d.target;
        this.settings.update((draft) => {
          if (t.kind === 'float') {
            draft.layout = floatPane(draft.layout, d.id, t.rect);
            return;
          }
          let m = movePane(draft.layout, d.id, t.dock, t.index);
          if (t.open) m = setDockSize(m, t.dock, defaultDockSize(t.dock));
          draft.layout = m;
        });
      }
    } else if (this.preview) {
      const m = this.preview;
      this.settings.update((draft) => {
        draft.layout = m;
      });
    }
    this.endDrag();
    this.onFocusInput();
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (this.drag && e.pointerId === this.drag.pointerId) {
      // lostpointercapture also follows a normal pointerup, which already ended the drag.
      this.cancelDrag();
    }
  };

  private cancelDrag(): void {
    if (!this.drag) return;
    this.endDrag();
  }

  private endDrag(): void {
    this.drag = null;
    this.preview = null;
    this.barEl.hidden = true;
    this.ghostEl.hidden = true;
    this.shieldEl.hidden = true;
    delete this.shieldEl.dataset.drag;
    for (const s of this.shells.values()) s.el.removeAttribute('data-dragging');
    this.scheduleRelayout();
  }

  /**
   * Shows the drag shield with the cursor for `kind` (`move`, a handle axis
   * or a float edge). Pointer capture stays on the cockpit, so the shield
   * only decides the cursor and keeps text from being selected; without
   * capture its events still bubble to the cockpit's listeners.
   */
  private showShield(kind: string): void {
    this.shieldEl.dataset.drag = kind;
    this.shieldEl.hidden = false;
  }

  private setPreview(m: LayoutModel): void {
    if (this.preview && JSON.stringify(this.preview) === JSON.stringify(m)) return;
    this.preview = m;
    this.scheduleRelayout();
  }

  /** Brings a floating pane to the front (writes the settings if that changes the order). */
  private raise(id: PaneId): void {
    const layout = this.settings.get().layout;
    const m = raisePane(layout, id);
    if (m === layout) return;
    this.settings.update((draft) => {
      draft.layout = m;
    });
  }

  private showTarget(t: DropTarget | null): void {
    this.barEl.hidden = t?.kind !== 'dock';
    this.ghostEl.hidden = t?.kind !== 'float';
    if (t?.kind === 'dock') {
      placePx(this.barEl, t.bar);
      this.barEl.dataset.dock = t.dock;
    } else if (t?.kind === 'float') {
      placeEl(this.ghostEl, t.rect, this.cells.get());
    }
  }

  /**
   * Where pane `id` dragged to (x, y) px would land, or null (the drop
   * changes nothing). `grab` is the pressed cell relative to the pane's
   * top-left cell, so a floating pane keeps its offset under the pointer.
   *
   * A docked pane docks anywhere over a shown dock and on the screen edge of
   * a hidden dock; a floating pane docks only from the screen-edge zones
   * (2 cells; the top one half a row) — it may lie over a dock, and moving
   * it there must not dock it.
   * Anywhere else the pane floats.
   */
  dropTarget(x: number, y: number, id: PaneId, grab: { x: number; y: number } = { x: 0, y: 0 }): DropTarget | null {
    const r = this.last;
    if (!r || r.tooSmall) return null;
    const cell = this.cells.get();
    const cx = x / cell.w;
    const cy = y / cell.h;
    const H = r.rows;
    const T = Math.max(2, Math.round(cell.h / 4));
    const s = this.settings.get();
    const layout = s.layout;
    const isFloating = findFloat(layout, id) >= 0;
    const W = r.cols * cell.w;
    const clampBar = (b: Rect): Rect => {
      const bx = Math.max(0, Math.min(W - b.w, b.x));
      const by = Math.max(0, Math.min(H * cell.h - b.h, b.y));
      return { ...b, x: bx, y: by };
    };

    // Before the first pane whose middle is past the pointer.
    const insert = (dock: DockBox): DropTarget | null => {
      const d = dock.rect;
      const side = isSideDock(dock.id);
      const boxes = r.panes.filter((p) => p.dock === dock.id);
      const lastBox = boxes[boxes.length - 1]!;
      let index = lastBox.index + 1;
      let at = side ? lastBox.rect.y + lastBox.rect.h : lastBox.rect.x + lastBox.rect.w;
      for (const b of boxes) {
        const mid = side ? b.rect.y + b.rect.h / 2 : b.rect.x + b.rect.w / 2;
        if ((side ? cy : cx) < mid) {
          index = b.index;
          at = side ? b.rect.y : b.rect.x;
          break;
        }
      }
      if (isNoopMove(layout, id, dock.id, index)) return null;
      const bar = side
        ? { x: d.x * cell.w, y: at * cell.h - T / 2, w: d.w * cell.w, h: T }
        : { x: at * cell.w - T / 2, y: d.y * cell.h, w: T, h: d.h * cell.h };
      return { kind: 'dock', dock: dock.id, index, open: false, bar: clampBar(bar) };
    };

    if (!isFloating) {
      for (const dock of Object.values(r.docks)) {
        const d = dock.rect;
        if (cx >= d.x && cx < d.x + d.w && cy >= d.y && cy < d.y + d.h) return insert(dock);
      }
    }

    // Screen-edge zones: a shown dock takes the pane at the pointer, a hidden
    // one (not collapsed) opens at its default size.
    const E = EDGE_CELLS;
    if (cy >= 0 && cy < H) {
      const inGameCol = cx >= r.game.x && cx < r.game.x + r.game.w;
      const zone: DockId | null =
        cx < E ? 'left'
        : cx >= r.cols - E ? 'right'
        : cy < TOP_EDGE_ROWS && inGameCol ? 'top'
        : cy >= H - E && inGameCol ? 'bottom'
        : null;
      const shown = zone ? r.docks[zone] : undefined;
      if (shown) return insert(shown);
      if (zone && !r.collapsed.includes(zone)) {
        const g = r.game;
        const bar: Record<DockId, Rect> = {
          left: { x: 0, y: 0, w: 2 * T, h: H * cell.h },
          right: { x: W - 2 * T, y: 0, w: 2 * T, h: H * cell.h },
          top: { x: g.x * cell.w, y: 0, w: g.w * cell.w, h: 2 * T },
          bottom: { x: g.x * cell.w, y: H * cell.h - 2 * T, w: g.w * cell.w, h: 2 * T },
        };
        return { kind: 'dock', dock: zone, index: layout.docks[zone].panes.length, open: true, bar: bar[zone] };
      }
    }

    // Float at the pointer: a floating pane keeps its size, a docked one
    // gets the standard size (ADR 0014 amendment). The pressed cell stays
    // under the pointer as far as the new width allows.
    const box = r.panes.find((p) => p.id === id);
    const keep = isFloating && box?.dock === 'float';
    const size = keep ? { w: box.rect.w, h: box.rect.h } : { w: FLOAT_STANDARD_W, h: FLOAT_STANDARD_H };
    const gx = Math.min(grab.x, size.w - 1);
    const gy = Math.min(grab.y, size.h - 1);
    const rect = clampFloat(
      { x: Math.floor(cx) - gx, y: Math.floor(cy) - gy, ...size },
      floatMin(id, paneSettingsOf(s.panes, id).border),
      r.cols,
      H,
    );
    if (box?.dock === 'float' && sameRect(box.rect, rect)) return null;
    return { kind: 'float', rect };
  }
}

const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

function placePx(el: HTMLElement, r: Rect): void {
  const st = el.style;
  st.left = `${r.x}px`;
  st.top = `${r.y}px`;
  st.width = `${r.w}px`;
  st.height = `${r.h}px`;
}

function placeEl(el: HTMLElement, r: Rect, cell: { w: number; h: number }): void {
  const st = el.style;
  st.left = `${r.x * cell.w}px`;
  st.top = `${r.y * cell.h}px`;
  st.width = `${r.w * cell.w}px`;
  st.height = `${r.h * cell.h}px`;
}
