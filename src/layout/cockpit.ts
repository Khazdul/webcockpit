// Cockpit view (ADR 0010 "Docking", ADR 0012): the game pane, the docks
// with their panes and the input line, positioned absolutely in whole
// cells from `allocate()`.
//
//   .wc-cockpit
//     .wc-game          the output pane (src/ui/output-pane.ts) goes in here
//     .wc-pane × 6      pane shells (src/panes/pane.ts; the map included)
//     .wc-input-slot    the input line (src/ui/input-pane.ts), under the game pane
//     .wc-handles       invisible resize handles over the gaps, lane and pane boundaries
//     .wc-drop-bar      insertion bar while a pane is dragged to a dock
//     .wc-drop-ghost    outline where a pane dragged over the game will float (or the box a span drop gives)
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
//   the top content row) to a dock or a position in a dock. A borderless
//   script pane's top row is a soft grip (ADR 0065): its links and text
//   get the press, and it becomes a move only once the pointer travels
//   DRAG_THRESHOLD px (the click at its end is eaten then). A script
//   pane's grip cells (`pane:setGrip`, ADR 0065 round 1) on any row work
//   as the title row: the press is a move at once, never a click. The insertion
//   bar shows where it lands. Dropping on the screen edge of a dock that is
//   not shown opens that dock at its default size.
// - Lanes (ADR 0064): a dock is a list of lanes from the screen edge
//   inward, columns of a side dock, rows of the top/bottom dock. Over the
//   middle of a lane the pane goes into that lane; over a lane's
//   cross-axis edge band (clamp(floor(cross / 5), 1, 3) cells: the left
//   and right bands of a column, the upper and lower bands of a row) it
//   goes into a new lane beside it, and the bar runs along the whole lane
//   boundary. A lane the last pane leaves is removed.
// - Spanning panes (ADR 0067): in a dock with two or more shown lanes (or
//   with spans already) the region's first row (side dock; the first
//   clamp(floor(len / 10), 1, 3) columns in the top/bottom dock) is a
//   strip that appends the pane to the spans before the lanes, and its
//   last row (columns) a strip that puts it first in the spans after
//   them. Over a span stack the pane goes into the stack like into a
//   lane. Both show a dock-wide bar (`.wc-drop-bar[data-span]`) and a
//   dashed outline (`.wc-drop-ghost[data-span]`) of the box the pane
//   gets. A dock that goes down to one lane folds its spans into it.
// - Floating panes (ADR 0014): drop a docked pane over the game area and it
//   floats there at the standard size, 36 × 14 cells (an outline shows
//   where). Drag a floating pane
//   by its title row to move it; drop it on a screen-edge zone to dock it.
//   Its edges and corners resize it. Pressing on it brings it to front.
// - Hovering a pane shows a close cross (`.wc-pane-close`, " × ") in its
//   title row, one cell in from the right edge; clicking it switches the
//   pane off (`panes[id].on = false`, the same as Settings). A borderless
//   script pane has none (it would cover content; ADR 0065 round 2, CSS).
// - Drag the gap between the game pane and a dock to resize the dock (its
//   innermost lane), the boundary between two lanes (the right part of the
//   left lane's last column, or the lower part of the upper lane's last
//   row) to move cells between them, or the boundary between two panes of
//   a lane or span stack (the lower part of the upper pane's last row, or
//   the right part of the left pane's last column) to resize them. The
//   boundary between a span stack and the lanes (ADR 0067) moves cells
//   between the span pane next to it and, in every lane, the pane next to
//   it.
// - Every drag previews live and writes the settings once, on release.
// - Grips and handles never take focus; after a drag or a click the focus
//   goes back to the input (Inv §1.3).
// - Script panes (ADR 0053) join with `addPane` while their script runs
//   and leave with `removePane`; only added ones take part in allocation
//   (`present`). Their place in the settings stays when they leave.
// - Temporary script panes (`addPane(shell, temp)`, ADR 0053 feedback
//   round 1) are never in the settings: the cockpit keeps their place and
//   on/off in memory. They float above every other pane, at their wanted
//   size where `temp.at` says (centred over the game pane by default) until
//   the user moves or resizes them, never dock, and their close cross
//   calls `temp.onClose` (the owner removes them). The surface keeps the
//   user's rectangle per device (src/layout/temp-places.ts).

import './layout.css';
import { type CellSource, type PaneContext, createPaneContext } from '../panes/context';
import { PANE_FACTORIES } from '../panes/factories';
import type { PaneShell } from '../panes/pane';
import { onTempPlacesForgotten, saveTempPlace, tempPlace, type TempPaneAt } from './temp-places';
import { type TileCorner, originFor, tileCorner, tileRects } from './tiles';

/** Where a tiled group's place is kept (temp-places.ts). */
const groupKey = (key: string): string => `group:${key}`;
import type { SettingsStore } from '../settings';
import {
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
  type DockBox,
  type LaneBox,
  type SpanBox,
  allocate,
  clampFloat,
  floatMin,
  isSideDock,
  paneCrossMin,
} from './allocate';
import {
  findFloat,
  findPane,
  floatPane,
  isNoopMove,
  isNoopNewLane,
  movePane,
  moveToNewLane,
  raisePane,
  resizeRect,
  setDesired,
  setFloatRect,
  setLaneSize,
  shiftBoundary,
  shiftLanes,
  shiftSpanBoundary,
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
  isTempPaneId,
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

/** Where a temporary pane opens until the user moves it (`createPane{at}`). */
export type { TempPaneAt } from './temp-places';
export { TEMP_PANE_AT } from './temp-places';

/** A temporary script pane's place, kept by the cockpit (never in the settings). */
export interface TempPaneOptions {
  /** Where it opens (default centred over the game pane). */
  at?: TempPaneAt;
  /** Wanted content size in cells (centred over the game pane). */
  rows: number;
  cols: number;
  /** Outer rectangle once the user moved or resized it (null: centred). */
  rect?: Rect | null;
  /** Shown (default true). */
  on?: boolean;
  /** The user clicked its close cross. */
  onClose(): void;
  /** The user moved or resized it (`tempPane(id).rect` changed). */
  onPlace?(): void;
  /**
   * A tiled group (stage 12 round 8): the key `<script>/<group>`, and the
   * grid's columns. Members tile from `at`'s corner in opening order; a
   * drag moves the whole group and a resize sets its tile size, kept per
   * device (temp-places.ts).
   */
  group?: { key: string; cols: number };
}

/** What the cockpit keeps of a temporary pane. */
export interface TempPaneState {
  rows: number;
  cols: number;
  at: TempPaneAt;
  rect: Rect | null;
  on: boolean;
}

interface TempPane extends TempPaneState {
  onClose(): void;
  onPlace(): void;
  group: string | null;
  /** Opening order (groups tile by it; the Map order is the z-order). */
  seq: number;
  /** A grouped pane's rectangle from the last layout. */
  box: Rect | null;
}

/** A tiled group's state: its grid, and where the player put it. */
interface TempGroup {
  cols: number;
  corner: TileCorner;
  /** Tile size (outer cells): the player's, else the first member's. */
  tile: { w: number; h: number };
  /** The first tile's corner when the player moved the group. */
  origin: { x: number; y: number } | null;
  /** The last layout (for a drop). */
  laid: { cols: number; h: number } | null;
}

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
 * Where a dragged pane would land: a place in a dock lane, a new lane of a
 * dock (ADR 0064; `bar` is the insertion bar in px relative to the
 * cockpit) or a floating rectangle (`rect`, outer cells).
 */
export type DropTarget =
  | {
      kind: 'dock';
      dock: DockId;
      /** The model lane (`movePane`); 0 when the dock has no lanes yet. */
      lane: number;
      /** Index in that lane (`movePane`). */
      index: number;
      /** The dock is not shown now; the drop opens it (lane 0) at its default size. */
      open: boolean;
      bar: Rect;
    }
  | {
      kind: 'lane';
      dock: DockId;
      /** Lane position of the new lane (`moveToNewLane`): 0 at the screen edge. */
      at: number;
      /** Its size in cells across the dock. */
      size: number;
      bar: Rect;
    }
  | {
      /** Into the spans before (`head`) or after (`tail`) the lanes (ADR 0067). */
      kind: 'span';
      dock: DockId;
      side: 'head' | 'tail';
      /** Index in that span list (`movePane`). */
      index: number;
      /** The dock-wide insertion bar (px). */
      bar: Rect;
      /** The box the pane would get (cells), or null when the drop would not show it. */
      ghost: Rect | null;
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
      /**
       * A soft grip (ADR 0065): pressed on a borderless script pane's top
       * content row. Nothing is captured until the pointer moves past
       * DRAG_THRESHOLD, so a press without a move is an ordinary click.
       */
      soft?: boolean;
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
      /** A temporary pane: the preview goes to `tempPreview`, not the layout. */
      temp: boolean;
    }
  | {
      /** The gap handle: resizes the innermost shown lane `lane`; `rest` is the other shown lanes' cells. */
      kind: 'dock';
      dock: DockId;
      lane: number;
      rest: number;
      /** The innermost lane's minimum (`LaneBox.min`). */
      min: number;
      pointerId: number;
      base: LayoutModel;
    }
  | {
      /** A lane boundary: cells move between `outer` and `inner` (shown sizes at the press). */
      kind: 'lanes';
      dock: DockId;
      pointerId: number;
      outer: { lane: number; size: number; min: number };
      inner: { lane: number; size: number; min: number };
      cell0: number;
      base: LayoutModel;
    }
  | {
      kind: 'panes';
      dock: DockId;
      pointerId: number;
      a: { id: PaneId; size: number };
      b: { id: PaneId; size: number };
      cell0: number;
      base: LayoutModel;
    }
  | {
      /**
       * The boundary between a span stack and the lanes (ADR 0067): `span`
       * is the span pane next to it, `edge` the pane next to it in every
       * shown lane (content sizes at the press). `sign` is +1 for the head
       * (the span grows as the boundary moves away from it), -1 for the tail.
       */
      kind: 'span';
      dock: DockId;
      pointerId: number;
      span: { id: PaneId; size: number };
      edge: { id: PaneId; size: number }[];
      sign: number;
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
  /** Temporary script panes, back to front (insertion order is the z-order). */
  private readonly temps = new Map<PaneId, TempPane>();
  private readonly groups = new Map<string, TempGroup>();
  private tempSeq = 0;
  /** A temporary pane's rectangle while it is dragged or resized. */
  private tempPreview: { id: PaneId; rect: Rect } | null = null;
  private readonly paneListeners = new Set<() => void>();
  private readonly layoutListeners = new Set<() => void>();
  /** A soft-grip drag ended: the click that follows must not reach a link. */
  private swallowClick = false;
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
  /** Span drop outlines of the running drag by target (ADR 0067), so a move over the same target allocates once. */
  private readonly ghosts = new Map<string, Rect | null>();
  /** The layout the cached outlines were computed for. */
  private ghostsOf: LayoutModel | null = null;
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
    this.el.addEventListener('click', this.onClickCapture, true);
    this.el.addEventListener('mouseup', this.onMouseUp);

    this.unsubs.push(
      this.settings.subscribe(() => this.scheduleRelayout()),
      onTempPlacesForgotten(this.onPlacesForgotten),
      this.cells.subscribe(() => this.scheduleRelayout()),
    );
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.scheduleRelayout());
      this.ro.observe(this.el);
    }
    this.relayoutNow();
  }

  /** Gives the focus back to the game's input line (script pane text fields, ADR 0055). */
  focusInput(): void {
    this.onFocusInput();
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
    this.labelClose(close, id, shell.label);
    close.addEventListener('click', () => {
      const t = this.temps.get(id);
      if (t) t.onClose();
      else this.settings.update(togglePatch(this.settings.get().panes, id, false));
    });
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

  private labelClose(close: HTMLElement, id: PaneId, label: string): void {
    const text = `${this.temps.has(id) ? 'Close' : 'Hide'} ${label}`;
    if (close.title === text) return;
    close.title = text;
    close.setAttribute('aria-label', text);
  }

  /**
   * Shows script pane `shell` (ADR 0053): it takes part in allocation from
   * the next layout, where the settings place it. The caller owns the
   * shell and disposes it after `removePane`.
   */
  addPane(shell: PaneShell, temp?: TempPaneOptions): void {
    const ok = temp ? isTempPaneId(shell.id) : isScriptPaneId(shell.id);
    if (!ok || this.disposed) throw new Error(`addPane: ${shell.id} is not a ${temp ? 'temporary ' : ''}script pane`);
    if (this.shells.has(shell.id)) throw new Error(`addPane: ${shell.id} is already shown`);
    if (temp) {
      const at = temp.at ?? 'center';
      const g = temp.group ?? null;
      if (g && !this.groups.has(g.key)) {
        const saved = tempPlace(groupKey(g.key));
        this.groups.set(g.key, {
          cols: Math.max(1, Math.floor(g.cols)),
          corner: tileCorner(at),
          tile: saved ? { w: saved.w, h: saved.h } : { w: temp.cols + 2, h: temp.rows + 2 },
          origin: saved ? { x: saved.x, y: saved.y } : null,
          laid: null,
        });
      }
      this.temps.set(shell.id, {
        rows: temp.rows,
        cols: temp.cols,
        at,
        rect: g ? null : (temp.rect ?? null),
        on: temp.on ?? true,
        onClose: temp.onClose,
        onPlace: temp.onPlace ?? (() => {}),
        group: g ? g.key : null,
        seq: ++this.tempSeq,
        box: null,
      });
    }
    this.attach(shell, this.inputEl);
    if (temp) this.scheduleRelayout();
    else {
      this.present.add(shell.id);
      this.paneChanged();
    }
  }

  /** A temporary pane's place and on/off, or null when `id` is not one. */
  tempPane(id: PaneId): TempPaneState | null {
    const t = this.temps.get(id);
    if (!t) return null;
    // A grouped pane's place is the tiling's (runs record it as its rectangle).
    const rect = t.group ? t.box : t.rect;
    return { rows: t.rows, cols: t.cols, at: t.at, rect: rect && { ...rect }, on: t.on };
  }

  /** Changes a temporary pane's on/off or rectangle (null: back to its default place). */
  setTempPane(id: PaneId, patch: { on?: boolean; rect?: Rect | null }): void {
    const t = this.temps.get(id);
    if (!t) return;
    if (patch.on !== undefined) t.on = patch.on;
    if (patch.rect !== undefined) t.rect = patch.rect && { ...patch.rect };
    this.scheduleRelayout();
  }

  /** Brings a temporary pane to the front of the temporary panes. */
  private raiseTemp(id: PaneId): void {
    const t = this.temps.get(id);
    if (!t || [...this.temps.keys()].pop() === id) return;
    this.temps.delete(id);
    this.temps.set(id, t);
    this.scheduleRelayout();
  }

  /** Takes script pane `id` off the cockpit; its place in the settings stays. */
  removePane(id: PaneId): void {
    const temp = this.temps.delete(id);
    if (!this.present.delete(id) && !temp) return;
    const shell = this.shells.get(id);
    this.shells.delete(id);
    this.closers.delete(id);
    if (shell) {
      shell.place(null, this.cells.get());
      shell.el.remove();
    }
    if (this.drag && 'id' in this.drag && this.drag.id === id) this.cancelDrag();
    if (temp) this.scheduleRelayout();
    else this.paneChanged();
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
    if (close && shell) this.labelClose(close, id, shell.label);
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

  /** True while a pane is being dragged or a resize runs (a press not yet past the threshold is not one). */
  get dragging(): boolean {
    const d = this.drag;
    return d !== null && (d.kind !== 'move' || d.active);
  }

  /** Calls `fn` after every layout (ADR 0065: the script pane list follows it). Returns the unsubscribe. */
  onLayout(fn: () => void): () => void {
    this.layoutListeners.add(fn);
    return () => this.layoutListeners.delete(fn);
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
    const layout = this.preview ?? s.layout;
    const base = allocate({
      layout,
      panes: s.panes,
      present: this.present,
      cols: Math.floor(W / cell.w + 1e-6),
      rows: Math.floor(H / cell.h + 1e-6),
    });
    const r = base.tooSmall || this.temps.size === 0 ? base : { ...base, panes: [...base.panes, ...this.tempBoxes(base, layout)] };
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
    for (const fn of [...this.layoutListeners]) fn();
  }

  /**
   * The temporary panes' boxes: above every floating pane, at their
   * rectangle or centred over the game pane at their wanted size, framed,
   * clamped to the window.
   */
  private tempBoxes(r: LayoutResult, layout: LayoutModel): PaneBox[] {
    const out: PaneBox[] = [];
    let index = layout.floating.length;
    const tiled = this.tileGroups(r);
    for (const [id, t] of this.temps) {
      if (!t.on) continue;
      const g = r.game;
      const w = t.cols + 2;
      const h = t.rows + 2;
      const want =
        this.tempPreview?.id === id ? this.tempPreview.rect : (tiled.get(id) ?? t.rect ?? tempDefaultRect(g, w, h, t.at));
      const rect = clampFloat(want, floatMin(id, true), r.cols, r.rows);
      const content = { x: rect.x + 1, y: rect.y + 1, w: rect.w - 2, h: rect.h - 2 };
      out.push({ id, dock: 'float', lane: 0, index: index++, rect, content, framed: true });
    }
    return out;
  }

  /**
   * The grouped panes' rectangles (tiles.ts), shown members only, in
   * opening order. A member whose rectangle changed is told (`onPlace`:
   * runs record the new place) after the layout.
   */
  private tileGroups(r: LayoutResult): Map<PaneId, Rect> {
    const out = new Map<PaneId, Rect>();
    if (this.groups.size === 0) return out;
    const members = new Map<string, [PaneId, TempPane][]>();
    for (const [id, t] of this.temps) {
      if (!t.group || !t.on) continue;
      const list = members.get(t.group) ?? [];
      list.push([id, t]);
      members.set(t.group, list);
    }
    const moved: TempPane[] = [];
    for (const [key, list] of members) {
      const g = this.groups.get(key)!;
      list.sort((a, b) => a[1].seq - b[1].seq);
      const lay = tileRects(r.game, list.length, { cols: g.cols, corner: g.corner, tile: g.tile, origin: g.origin });
      g.laid = { cols: lay.cols, h: lay.h };
      list.forEach(([id, t], i) => {
        const rect = clampFloat(lay.rects[i]!, floatMin(id, true), r.cols, r.rows);
        out.set(id, rect);
        const b = t.box;
        if (!b || b.x !== rect.x || b.y !== rect.y || b.w !== rect.w || b.h !== rect.h) {
          t.box = rect;
          moved.push(t);
        }
      });
    }
    if (moved.length > 0) queueMicrotask(() => moved.forEach((t) => t.onPlace()));
    return out;
  }

  /** A grouped pane was dropped at `rect`: the group follows (a move) or takes its size (a resize); kept per device. */
  private dropGrouped(id: PaneId, t: TempPane, rect: Rect, resize: boolean): void {
    const g = this.groups.get(t.group!);
    if (!g) return;
    const order = [...this.temps.entries()]
      .filter(([, x]) => x.group === t.group && x.on)
      .sort((a, b) => a[1].seq - b[1].seq)
      .map(([k]) => k);
    const index = Math.max(0, order.indexOf(id));
    if (resize) g.tile = { w: rect.w, h: rect.h };
    const h = resize ? rect.h : (g.laid?.h ?? g.tile.h);
    g.origin = originFor({ ...rect, h }, index, g.laid?.cols ?? g.cols, g.corner);
    saveTempPlace(groupKey(t.group!), { x: Math.max(0, g.origin.x), y: Math.max(0, g.origin.y), w: g.tile.w, h: g.tile.h });
    this.scheduleRelayout();
  }

  /** Reset layout forgot the saved places: groups go back to their corners and first sizes. */
  private readonly onPlacesForgotten = (): void => {
    for (const g of this.groups.values()) g.origin = null;
    for (const t of this.temps.values()) {
      const g = t.group ? this.groups.get(t.group) : undefined;
      if (g) g.tile = { w: t.cols + 2, h: t.rows + 2 };
    }
    this.scheduleRelayout();
  };

  /** Stops listening and removes the cockpit. */
  dispose(): void {
    this.disposed = true;
    for (const u of this.unsubs) u();
    this.paneListeners.clear();
    this.layoutListeners.clear();
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
        const side = isSideDock(dock.id);
        // Pane boundaries in each lane and in each span stack (ADR 0067).
        const stacks: { rect: Rect; lane: LaneBox['index'] | SpanBox['side'] }[] = [
          ...dock.lanes.map((l) => ({ rect: l.rect, lane: l.index })),
          ...dock.spans.map((sp) => ({ rect: sp.rect, lane: sp.side })),
        ];
        for (const lane of stacks) {
          const l = lane.rect;
          const boxes = r.panes.filter((p) => p.dock === dock.id && p.lane === lane.lane);
          for (let i = 0; i + 1 < boxes.length; i++) {
            const a = boxes[i]!;
            const b = boxes[i + 1]!;
            const data = { dock: dock.id, a: a.id, b: b.id };
            if (side) {
              add({ x: l.x * cell.w, y: b.rect.y * cell.h - hz, w: l.w * cell.w, h: hz }, 'y', data);
            } else {
              add({ x: b.rect.x * cell.w - wz, y: l.y * cell.h, w: wz, h: l.h * cell.h }, 'x', data);
            }
          }
        }
        // Lane boundaries (ADR 0064), like pane boundaries: the right
        // (lower) part of the left (upper) lane's last column (row). A
        // 1-row lane (a borderless script pane, ADR 0065) keeps its row:
        // the handle goes on the upper part of the lower lane's first row
        // then, and two 1-row lanes get none.
        for (let k = 0; k + 1 < dock.lanes.length; k++) {
          const outer = dock.lanes[k]!;
          const inner = dock.lanes[k + 1]!;
          const towardEdge = dock.id === 'left' || dock.id === 'top';
          const first = towardEdge ? outer.rect : inner.rect;
          const second = towardEdge ? inner.rect : outer.rect;
          const data = { dock: dock.id, outer: String(outer.index), inner: String(inner.index) };
          if (side) {
            add({ x: (first.x + first.w) * cell.w - wz, y: first.y * cell.h, w: wz, h: first.h * cell.h }, 'x', data);
          } else if (first.h > 1) {
            add({ x: first.x * cell.w, y: (first.y + first.h) * cell.h - hz, w: first.w * cell.w, h: hz }, 'y', data);
          } else if (second.h > 1) {
            add({ x: second.x * cell.w, y: second.y * cell.h, w: second.w * cell.w, h: hz }, 'y', data);
          }
        }
        // Span stack ↔ lanes (ADR 0067), like a pane boundary: the lower
        // (right) part of the last row (column) before the boundary, across
        // the whole dock.
        const g = dock.region;
        for (const sp of g ? dock.spans : []) {
          const data = { dock: dock.id, span: sp.side };
          const at = sp.side === 'head' ? (side ? g!.y : g!.x) : side ? g!.y + g!.h : g!.x + g!.w;
          if (side) add({ x: d.x * cell.w, y: at * cell.h - hz, w: d.w * cell.w, h: hz }, 'y', data);
          else add({ x: at * cell.w - wz, y: d.y * cell.h, w: wz, h: d.h * cell.h }, 'x', data);
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
    this.swallowClick = false;
    // A soft-grip press that never moved (released outside the cockpit) is forgotten.
    if (this.drag?.kind === 'move' && this.drag.soft && !this.drag.active) this.drag = null;
    if (this.drag || !this.last || this.last.tooSmall) return;
    const t = e.target as HTMLElement;
    const floating = t.closest<HTMLElement>('.wc-pane[data-floating]');
    if (floating) {
      const fid = floating.dataset.pane as PaneId;
      if (this.temps.has(fid)) this.raiseTemp(fid);
      else this.raise(fid);
    }
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
        temp: this.temps.has(id),
      };
      this.showShield(edge.dataset.edge!);
    } else if (grip) {
      const id = grip.dataset.grip as PaneId;
      const b = boxOf(id);
      const grab = b ? { x: Math.floor(x / cell.w) - b.rect.x, y: Math.floor(y / cell.h) - b.rect.y } : { x: 0, y: 0 };
      this.drag = { kind: 'move', id, pointerId: e.pointerId, x0: x, y0: y, grab, active: false, target: null };
    } else if (!handle && this.contentGrip(t, e)) {
      // A script pane's own grip cells (`pane:setGrip`, ADR 0065 round
      // 1): a move as from the title row, the grabbing cursor at once,
      // and the click at its end never reaches the pane.
      const id = t.closest<HTMLElement>('.wc-pane')!.dataset.pane as PaneId;
      const b = boxOf(id);
      const grab = b ? { x: Math.floor(x / cell.w) - b.rect.x, y: Math.floor(y / cell.h) - b.rect.y } : { x: 0, y: 0 };
      this.drag = { kind: 'move', id, pointerId: e.pointerId, x0: x, y0: y, grab, active: false, target: null };
      this.swallowClick = true;
      this.showShield('move');
    } else if (!handle && this.softGrip(t, y / cell.h)) {
      // A borderless script pane's top content row (ADR 0065): a move
      // only once the pointer travels; until then the press is the
      // pane's own (a link click, a text selection).
      const pane = t.closest<HTMLElement>('.wc-pane')!;
      const id = pane.dataset.pane as PaneId;
      const b = boxOf(id)!;
      const grab = { x: Math.floor(x / cell.w) - b.rect.x, y: Math.floor(y / cell.h) - b.rect.y };
      this.drag = { kind: 'move', id, pointerId: e.pointerId, x0: x, y0: y, grab, active: false, target: null, soft: true };
      return;
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
        // A lane that is short of space is frozen at what it shows now, so
        // the boundary follows the pointer exactly (ADR 0012). A dock with
        // spans (ADR 0067) is frozen whole: its lanes and spans share the
        // dock's length.
        let frozen = base;
        const db = this.last.docks[dock];
        if (db && db.spans.length > 0) {
          frozen = this.freezeDock(base, dock);
        } else if (db?.lanes.find((l) => l.index === a.lane)?.mode === 'scaled') {
          const all: Partial<Record<PaneId, number>> = {};
          for (const p of this.last.panes) if (p.dock === dock && p.lane === a.lane) all[p.id] = size(p);
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
      } else if (handle.dataset.span) {
        const db = this.last.docks[dock];
        const which = handle.dataset.span === 'tail' ? 'tail' : 'head';
        const sp = db?.spans.find((x) => x.side === which);
        if (!db || !sp || db.lanes.length === 0) return;
        const side = isSideDock(dock);
        const size = (p: PaneBox): { id: PaneId; size: number } => ({ id: p.id, size: side ? p.content.h : p.content.w });
        const boxes = (lane: PaneBox['lane']): PaneBox[] => this.last!.panes.filter((p) => p.dock === dock && p.lane === lane);
        const own = boxes(which);
        const spanBox = which === 'head' ? own[own.length - 1] : own[0];
        const edge = db.lanes.map((l) => boxes(l.index)).map((bs) => (which === 'head' ? bs[0] : bs[bs.length - 1]));
        if (!spanBox || edge.some((e) => !e)) return;
        this.drag = {
          kind: 'span',
          dock,
          pointerId: e.pointerId,
          span: size(spanBox),
          edge: edge.map((b) => size(b!)),
          sign: which === 'head' ? 1 : -1,
          cell0: side ? Math.floor(y / cell.h) : Math.floor(x / cell.w),
          base: this.freezeDock(base, dock),
        };
      } else if (handle.dataset.outer && handle.dataset.inner) {
        const lanes = this.last.docks[dock]?.lanes ?? [];
        const side = isSideDock(dock);
        const lb = (i: string): LaneBox | undefined => lanes.find((l) => l.index === Number(i));
        const outer = lb(handle.dataset.outer);
        const inner = lb(handle.dataset.inner);
        if (!outer || !inner) return;
        const cross = (l: LaneBox): number => (side ? l.rect.w : l.rect.h);
        this.drag = {
          kind: 'lanes',
          dock,
          pointerId: e.pointerId,
          outer: { lane: outer.index, size: cross(outer), min: outer.min },
          inner: { lane: inner.index, size: cross(inner), min: inner.min },
          cell0: side ? Math.floor(x / cell.w) : Math.floor(y / cell.h),
          base,
        };
      } else {
        const lanes = this.last.docks[dock]?.lanes ?? [];
        const innermost = lanes[lanes.length - 1];
        if (!innermost) return;
        const cross = (l: LaneBox): number => (isSideDock(dock) ? l.rect.w : l.rect.h);
        const rest = lanes.slice(0, -1).reduce((n, l) => n + cross(l), 0);
        this.drag = { kind: 'dock', dock, lane: innermost.index, rest, min: innermost.min, pointerId: e.pointerId, base };
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

  /**
   * `m` with every shown pane of `dock` frozen at the content size it
   * shows now (its `desired` along the dock), so a resize in a dock with
   * spans (ADR 0067) moves only the cells it should.
   */
  private freezeDock(m: LayoutModel, dock: DockId): LayoutModel {
    const side = isSideDock(dock);
    const all: Partial<Record<PaneId, number>> = {};
    for (const p of this.last?.panes ?? []) if (p.dock === dock) all[p.id] = side ? p.content.h : p.content.w;
    return setDesired(m, all);
  }

  /**
   * True when `t` (pressed at cockpit row `row`) is the top content row of
   * a borderless, ordinary script pane, and not one of its text fields or
   * its scroll indicator: a soft grip (ADR 0065).
   */
  private softGrip(t: HTMLElement, row: number): boolean {
    const pane = t.closest<HTMLElement>('.wc-pane-script');
    if (!pane || pane.hasAttribute('data-framed') || !this.el.contains(pane)) return false;
    const id = pane.dataset.pane as PaneId;
    if (this.temps.has(id) || !this.present.has(id)) return false;
    if (t.closest('.wc-spane-field, .wc-spane-more, .wc-pane-close, .wc-float-handle')) return false;
    const b = this.last?.panes.find((p) => p.id === id);
    return !!b && Math.floor(row) === b.content.y;
  }

  /**
   * True when `t` lies in a script pane's content and the press `e` is on
   * its grip cells (`pane:setGrip`, ADR 0065 round 1); not on a text
   * field, the scroll indicator, the close cross or a float handle.
   */
  private contentGrip(t: HTMLElement, e: PointerEvent): boolean {
    const pane = t.closest<HTMLElement>('.wc-pane-script');
    if (!pane || !this.el.contains(pane) || !t.closest('.wc-pane-content')) return false;
    const id = pane.dataset.pane as PaneId;
    if (!this.present.has(id) && !this.temps.has(id)) return false;
    if (t.closest('.wc-spane-field, .wc-spane-more, .wc-pane-close, .wc-float-handle')) return false;
    return this.shells.get(id)?.gripAt(e.clientX, e.clientY) ?? false;
  }

  /** Eats the click that ends a soft-grip drag, so no link under it fires. */
  private readonly onClickCapture = (e: MouseEvent): void => {
    if (!this.swallowClick) return;
    this.swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
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
    // The output and input handle their own; a script pane's text field keeps its focus.
    if (t.closest('.wc-output, .wc-input-slot, .wc-spane-field')) return;
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
        if (d.soft) {
          // The press becomes a move: take the pointer, drop any text
          // selection it started, and eat the click at its end.
          this.swallowClick = true;
          this.el.ownerDocument.getSelection()?.removeAllRanges();
          try {
            this.el.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic events have no active pointer */
          }
        }
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
      if (d.temp) {
        const p = this.tempPreview;
        if (p?.id === d.id && sameRect(p.rect, rect)) return;
        this.tempPreview = { id: d.id, rect };
        this.scheduleRelayout();
        return;
      }
      this.setPreview(setFloatRect(d.base, d.id, rect));
      return;
    }
    if (d.kind === 'dock') {
      // The dock's new outer size from the pointer, then the innermost lane
      // takes the change; the other lanes keep their cells (ADR 0064).
      const H = r.rows;
      let size: number;
      let max: number;
      if (d.dock === 'bottom' || d.dock === 'top') {
        // The other of the two keeps what it shows now.
        const other = r.docks[d.dock === 'bottom' ? 'top' : 'bottom'];
        const row = Math.floor(y / cell.h);
        size = d.dock === 'bottom' ? H - DOCK_GAP - row : row;
        max = H - INPUT_ROWS - DOCK_GAP - GAME_MIN_ROWS - (other ? other.rect.h + DOCK_GAP : 0);
      } else {
        const col = Math.floor(x / cell.w);
        size = d.dock === 'right' ? r.cols - DOCK_GAP - col : col;
        const other = r.docks[d.dock === 'right' ? 'left' : 'right'];
        max = r.cols - GAME_MIN_COLS - DOCK_GAP - (other ? other.rect.w + DOCK_GAP : 0);
      }
      const min = d.min;
      max -= d.rest;
      if (max < min) return;
      this.setPreview(setLaneSize(d.base, d.dock, d.lane, Math.max(min, Math.min(max, size - d.rest))));
      return;
    }
    if (d.kind === 'span') {
      const side = isSideDock(d.dock);
      const moved = (side ? Math.floor(y / cell.h) : Math.floor(x / cell.w)) - d.cell0;
      this.setPreview(setDesired(d.base, shiftSpanBoundary(d.span, d.edge, d.dock, d.sign * moved)));
      return;
    }
    if (d.kind === 'lanes') {
      const side = isSideDock(d.dock);
      const moved = (side ? Math.floor(x / cell.w) : Math.floor(y / cell.h)) - d.cell0;
      // The outer lane grows when the boundary moves away from the screen edge.
      const sign = d.dock === 'left' || d.dock === 'top' ? 1 : -1;
      this.setPreview(shiftLanes(d.base, d.dock, d.outer, d.inner, sign * moved));
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
    if (d.kind === 'move' && d.soft && !d.active) {
      // A plain click on a soft grip: the pane's own (a link).
      this.drag = null;
      return;
    }
    const temp = 'id' in d ? this.temps.get(d.id) : undefined;
    if (temp) {
      // A temporary pane: its new rectangle stays in memory.
      const rect = d.kind === 'move' ? (d.active && d.target?.kind === 'float' ? d.target.rect : null) : this.tempPreview?.rect;
      if (rect && temp.group) this.dropGrouped((d as { id: PaneId }).id, temp, rect, d.kind !== 'move');
      else if (rect) {
        temp.rect = { ...rect };
        temp.onPlace();
      }
    } else if (d.kind === 'move') {
      if (d.active && d.target) {
        const t = d.target;
        this.settings.update((draft) => {
          if (t.kind === 'float') {
            draft.layout = floatPane(draft.layout, d.id, t.rect);
            return;
          }
          if (t.kind === 'lane') {
            draft.layout = moveToNewLane(draft.layout, d.id, t.dock, t.at, t.size);
            return;
          }
          if (t.kind === 'span') {
            draft.layout = movePane(draft.layout, d.id, t.dock, t.side, t.index);
            return;
          }
          let m = movePane(draft.layout, d.id, t.dock, t.lane, t.index);
          if (t.open) m = setLaneSize(m, t.dock, 0, defaultDockSize(t.dock));
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
    this.tempPreview = null;
    this.ghosts.clear();
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
    const ghost = t?.kind === 'float' ? t.rect : t?.kind === 'span' ? t.ghost : null;
    const span = t?.kind === 'span';
    this.barEl.hidden = t?.kind !== 'dock' && t?.kind !== 'lane' && !span;
    this.ghostEl.hidden = !ghost;
    this.barEl.toggleAttribute('data-span', span);
    this.ghostEl.toggleAttribute('data-span', span);
    if (t?.kind === 'dock' || t?.kind === 'lane' || t?.kind === 'span') {
      placePx(this.barEl, t.bar);
      this.barEl.dataset.dock = t.dock;
    }
    if (ghost) placeEl(this.ghostEl, ghost, this.cells.get());
  }

  /**
   * Where pane `id` dragged to (x, y) px would land, or null (the drop
   * changes nothing). `grab` is the pressed cell relative to the pane's
   * top-left cell, so a floating pane keeps its offset under the pointer.
   *
   * A docked pane docks anywhere over a shown dock (into a lane, or into a
   * new lane from a lane's cross-axis edge band, ADR 0064, or into the
   * spans from a span stack or the region's strips, ADR 0067) and on the screen
   * edge of a hidden dock; a floating pane docks only from the screen-edge zones
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
    // A temporary pane only floats: no dock takes it.
    const isTemp = this.temps.has(id);
    const isFloating = isTemp || findFloat(layout, id) >= 0;
    const W = r.cols * cell.w;
    const clampBar = (b: Rect): Rect => {
      const bx = Math.max(0, Math.min(W - b.w, b.x));
      const by = Math.max(0, Math.min(H * cell.h - b.h, b.y));
      return { ...b, x: bx, y: by };
    };

    // Into a lane: before the first pane whose middle is past the pointer.
    const insert = (dock: DockId, lane: LaneBox): DropTarget | null => {
      const d = lane.rect;
      const side = isSideDock(dock);
      const boxes = r.panes.filter((p) => p.dock === dock && p.lane === lane.index);
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
      if (isNoopMove(layout, id, dock, lane.index, index)) return null;
      const bar = side
        ? { x: d.x * cell.w, y: at * cell.h - T / 2, w: d.w * cell.w, h: T }
        : { x: at * cell.w - T / 2, y: d.y * cell.h, w: T, h: d.h * cell.h };
      return { kind: 'dock', dock, lane: lane.index, index, open: false, bar: clampBar(bar) };
    };

    // A new lane (ADR 0064) from a lane's cross-axis edge band: the left
    // and right bands of a column, the upper and lower bands of a row.
    // `undefined` when the pointer is not in a band or the game pane leaves
    // no room for a new lane (the in-lane insert applies then).
    const newLane = (dock: DockId, lane: LaneBox): DropTarget | null | undefined => {
      const l = lane.rect;
      const side = isSideDock(dock);
      const cross = side ? l.w : l.h;
      const depth = Math.max(1, Math.min(3, Math.floor(cross / 5)));
      const pos = side ? cx - l.x : cy - l.y;
      const low = pos < depth;
      if (!low && pos < cross - depth) return undefined;
      const room = side ? r.game.w - GAME_MIN_COLS : r.game.h - GAME_MIN_ROWS;
      const size = Math.min(defaultDockSize(dock), room);
      if (size < paneCrossMin(id, dock, isTemp || paneSettingsOf(s.panes, id).border)) return undefined;
      // The low (left/upper) band faces the screen edge in the left/top dock.
      const towardEdge = low === (dock === 'left' || dock === 'top');
      const at = towardEdge ? lane.index : lane.index + 1;
      if (isNoopNewLane(layout, id, dock, at)) return null;
      const edge = side ? (low ? l.x : l.x + l.w) : low ? l.y : l.y + l.h;
      const bar = side
        ? { x: edge * cell.w - T / 2, y: l.y * cell.h, w: T, h: l.h * cell.h }
        : { x: l.x * cell.w, y: edge * cell.h - T / 2, w: l.w * cell.w, h: T };
      return { kind: 'lane', dock, at, size, bar: clampBar(bar) };
    };

    // Into a span list (ADR 0067) at `index`, with a dock-wide bar at `at`
    // (cells along the dock) and an outline of the box the pane gets.
    // `undefined` when the result would not keep the pane in the span (a
    // dock left with one lane folds its spans) or the move changes nothing.
    const span = (dock: DockBox, side: 'head' | 'tail', index: number, at: number): DropTarget | undefined => {
      const moved = movePane(layout, id, dock.id, side, index);
      if (moved === layout || findPane(moved, id)?.lane !== side) return undefined;
      if (this.ghostsOf !== layout) {
        this.ghosts.clear();
        this.ghostsOf = layout;
      }
      const key = `${id}|${dock.id}|${side}|${index}|${r.cols}x${r.rows}`;
      if (!this.ghosts.has(key)) {
        const res = allocate({ layout: moved, panes: s.panes, present: this.present, cols: r.cols, rows: r.rows });
        this.ghosts.set(key, res.panes.find((p) => p.id === id)?.rect ?? null);
      }
      const d = dock.rect;
      const bar = isSideDock(dock.id)
        ? { x: d.x * cell.w, y: at * cell.h - T / 2, w: d.w * cell.w, h: T }
        : { x: at * cell.w - T / 2, y: d.y * cell.h, w: T, h: d.h * cell.h };
      return { kind: 'span', dock: dock.id, side, index, bar: clampBar(bar), ghost: this.ghosts.get(key)! };
    };

    // Into a span stack: before the first pane whose middle is past the pointer.
    const intoStack = (dock: DockBox, sp: SpanBox): DropTarget | null => {
      const side = isSideDock(dock.id);
      const boxes = r.panes.filter((p) => p.dock === dock.id && p.lane === sp.side);
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
      return span(dock, sp.side, index, at) ?? null;
    };

    // The region's strips (ADR 0067): its first row (columns) appends to
    // the head spans, its last row (columns) puts the pane first in the
    // tail spans. Only in a dock with two shown lanes or with spans.
    const strip = (dock: DockBox): DropTarget | undefined => {
      const g = dock.region;
      if (!g || (dock.lanes.length < 2 && dock.spans.length === 0)) return undefined;
      if (!(cx >= g.x && cx < g.x + g.w && cy >= g.y && cy < g.y + g.h)) return undefined;
      const side = isSideDock(dock.id);
      const depth = side ? 1 : Math.max(1, Math.min(3, Math.floor(g.w / 10)));
      const pos = side ? cy - g.y : cx - g.x;
      const len = side ? g.h : g.w;
      const start = side ? g.y : g.x;
      if (pos < depth) return span(dock, 'head', layout.docks[dock.id].head.length, start);
      if (pos >= len - depth) return span(dock, 'tail', 0, start + len);
      return undefined;
    };

    if (!isFloating) {
      for (const dock of Object.values(r.docks)) {
        for (const sp of dock.spans) {
          const d = sp.rect;
          if (cx >= d.x && cx < d.x + d.w && cy >= d.y && cy < d.y + d.h) return intoStack(dock, sp);
        }
        const st = strip(dock);
        if (st) return st;
        for (const lane of dock.lanes) {
          const d = lane.rect;
          if (!(cx >= d.x && cx < d.x + d.w && cy >= d.y && cy < d.y + d.h)) continue;
          const t = newLane(dock.id, lane);
          return t !== undefined ? t : insert(dock.id, lane);
        }
      }
    }

    // Screen-edge zones: a shown dock takes the pane into the lane at the
    // screen edge, at the pointer; a hidden one (not collapsed) opens with
    // one lane at its default size.
    const E = EDGE_CELLS;
    if (!isTemp && cy >= 0 && cy < H) {
      const inGameCol = cx >= r.game.x && cx < r.game.x + r.game.w;
      const zone: DockId | null =
        cx < E ? 'left'
        : cx >= r.cols - E ? 'right'
        : cy < TOP_EDGE_ROWS && inGameCol ? 'top'
        : cy >= H - E && inGameCol ? 'bottom'
        : null;
      const shown = zone ? r.docks[zone] : undefined;
      // Over a span stack along the dock (ADR 0067): into that stack.
      const sideZone = zone === 'left' || zone === 'right';
      const stack = shown?.spans.find((sp) =>
        sideZone ? cy >= sp.rect.y && cy < sp.rect.y + sp.rect.h : cx >= sp.rect.x && cx < sp.rect.x + sp.rect.w,
      );
      if (shown && stack) return intoStack(shown, stack);
      if (shown) {
        // A bar lane at the screen edge (only borderless script panes,
        // ADR 0065) stays the bar's: the pane joins the next lane in, or
        // opens a new lane just inside the bar.
        const edgeLane = shown.lanes[0]!;
        if (!isBarLane(edgeLane, r)) return insert(shown.id, edgeLane);
        const next = shown.lanes[1];
        if (next) return insert(shown.id, next);
        const side = isSideDock(shown.id);
        const room = side ? r.game.w - GAME_MIN_COLS : r.game.h - GAME_MIN_ROWS;
        const size = Math.min(defaultDockSize(shown.id), room);
        const at = edgeLane.index + 1;
        if (size < paneCrossMin(id, shown.id, paneSettingsOf(s.panes, id).border) || isNoopNewLane(layout, id, shown.id, at)) return null;
        const l = edgeLane.rect;
        const edge = shown.id === 'left' ? l.x + l.w : shown.id === 'right' ? l.x : shown.id === 'top' ? l.y + l.h : l.y;
        const bar = side
          ? { x: edge * cell.w - T / 2, y: l.y * cell.h, w: T, h: l.h * cell.h }
          : { x: l.x * cell.w, y: edge * cell.h - T / 2, w: l.w * cell.w, h: T };
        return { kind: 'lane', dock: shown.id, at, size, bar: clampBar(bar) };
      }
      if (zone && !r.collapsed.includes(zone)) {
        const g = r.game;
        const bar: Record<DockId, Rect> = {
          left: { x: 0, y: 0, w: 2 * T, h: H * cell.h },
          right: { x: W - 2 * T, y: 0, w: 2 * T, h: H * cell.h },
          top: { x: g.x * cell.w, y: 0, w: g.w * cell.w, h: 2 * T },
          bottom: { x: g.x * cell.w, y: H * cell.h - 2 * T, w: g.w * cell.w, h: 2 * T },
        };
        const index = layout.docks[zone].lanes[0]?.panes.length ?? 0;
        return { kind: 'dock', dock: zone, lane: 0, index, open: true, bar: bar[zone] };
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
      floatMin(id, isTemp || paneSettingsOf(s.panes, id).border),
      r.cols,
      H,
    );
    if (box?.dock === 'float' && sameRect(box.rect, rect)) return null;
    return { kind: 'float', rect };
  }
}

/** A shown lane of only borderless script panes: a bar (ADR 0065). */
function isBarLane(lane: LaneBox, r: LayoutResult): boolean {
  return lane.panes.every((id) => isScriptPaneId(id) && r.panes.some((p) => p.id === id && !p.framed));
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

/**
 * A temporary pane's outer rectangle (`w` × `h` cells) before the user
 * moves it, over the game pane `g`: centred, or against the named edges
 * (`top`, `bottom` just above the input line, `left`, `right`, and the
 * four corners), centred along the other axis.
 */
export function tempDefaultRect(g: Rect, w: number, h: number, at: TempPaneAt): Rect {
  const cx = g.x + Math.floor((g.w - w) / 2);
  const cy = g.y + Math.floor((g.h - h) / 2);
  const left = g.x;
  const right = g.x + g.w - w;
  const top = g.y;
  const bottom = g.y + g.h - h;
  const [x, y] =
    at === 'top' ? [cx, top]
    : at === 'bottom' ? [cx, bottom]
    : at === 'left' ? [left, cy]
    : at === 'right' ? [right, cy]
    : at === 'top-left' ? [left, top]
    : at === 'top-right' ? [right, top]
    : at === 'bottom-left' ? [left, bottom]
    : at === 'bottom-right' ? [right, bottom]
    : [cx, cy];
  return { x, y, w, h };
}
