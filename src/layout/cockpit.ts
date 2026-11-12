// Cockpit view (ADR 0010 "Docking", ADR 0012): the game pane, the docks
// with their panes and the input line, positioned absolutely in whole
// cells from `allocate()`.
//
//   .wc-cockpit
//     .wc-game          the output pane (src/ui/output-pane.ts) goes in here
//     .wc-input-slot    the input row (src/ui/input-pane.ts), under the game pane; in
//                       a narrow game column on under the right dock to the screen's
//                       right edge (ADR 0101, ADR 0102); before the panes in paint
//                       order (see the constructor)
//     .wc-pane × 6      pane shells (src/panes/pane.ts; the map included), then script panes
//     .wc-handles       invisible resize handles over the gaps, lane and pane boundaries
//     .wc-drop-bar      insertion bar while a pane is dragged to a dock
//     .wc-drop-ghost    outline where a pane dragged over the game will float (or the box a span drop gives)
//     .wc-too-small     "Window too small" (below 60 × 18 cells)
//     .wc-drag-shield   transparent cover with the drag cursor while a drag runs (the cockpit
//                       has `data-shield` meanwhile: layout.css hides the hover set by it)
//     .wc-phone-tabs    phone only: the tab strip (ADR 0075 §3)
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
//   not shown opens that dock at its default size. The edge zones follow
//   the docks' extent (ADR 0101, ADR 0102): the left one ends at the input
//   row's bottom, the right one there too or, when the input row runs
//   under the right dock, at its top; the bottom one runs along the whole
//   bottom edge.
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
//   title row, one cell in from the right edge (borderless: at the edge,
//   ADR 0095 round 1); clicking it switches the
//   pane off (`panes[id].on = false`, the same as Settings). A script pane
//   made with `cross = false` has none (ADR 0084 addendum, CSS). Hovering a
//   borderless pane outlines it (ADR 0084, CSS), but not the map or a
//   script pane made with `outline = false` (addendum 2). (The name tag a
//   hover showed, ADR 0087, is gone: ADR 0095 round 3.)
// - Left of the cross, hovering shows three look buttons (`.wc-pane-btn`,
//   ADR 0095, src/layout/pane-buttons.ts): Colour steps the tint, Border
//   flips the frame, Background flips glass and clear. Like the cross they
//   take no focus and start no drag; none on a temporary pane (no
//   settings) or where the cross is hidden. On a narrow pane the hood moves
//   left to make room for them (`PaneShell.hoverCells`); where it still
//   reaches under them they show over its right part on an iron shelf, and
//   only those that would cover its left end drop, from the left
//   (`syncLook`, ADR 0123 "Hood position and hover buttons").
// - With `onGear` (the App's settings popups, ADR 0107), the Map, Comm,
//   Timers and Group panes have a Gear left of them (`GEAR_PANES`): its
//   click calls `onGear(id)`, which toggles the pane's settings popup; the
//   cockpit never imports the chrome. `markGear(id)` marks the Gear whose
//   popup is open (`data-open`). The Gear is dropped first when narrow.
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
//
// Phone (ADR 0075 §3, `device().phone`, decided once at construction):
// `allocatePhone` (src/layout/phone.ts) instead of `allocate`, a tab strip
// on the top row (GAME, then the shown panes), one view at a time, and no
// arranging: no grips, close crosses, float handles or resize handles, and
// pointer presses never start a drag, so nothing is written to the layout.
// The selected tab lives in memory only. The game pane keeps its size
// under a pane tab (hidden, not resized), so its scroll position and NAWS
// stay. Temporary script panes show over the GAME view only. While the
// device's on-screen keyboard is up the too-small guard is off.
//
// The phone's layout in the live game (ADR 0136, the `phoneGame` option,
// passed by the live game's shell only and used only with the phone flag):
// `allocatePhoneGame` (src/layout/phone-game.ts) instead of `allocatePhone`,
// no tab strip, and the cockpit is marked `data-phone-game` (the scope of
// src/phone/phone.css). The phone layer (src/phone/) draws its chrome over
// the cockpit and reads the rectangles from `phoneGameLayout`. Every pane
// is hidden (the game text and the command row only) but the map pane,
// which is the layer's map lens when it asks for one (`setPhoneLens`, ADR
// 0136 §4: borderless in a rectangle of whole cells), the one pane of the
// open pane strip (`setPhoneStrip`, §5) and Comm when it is open
// (`setPhoneComm`, §6), both borderless in the allocator's rows; temporary
// script panes still show over the game text. Ctrl/Alt+1…9 go to the
// strip (`setPhonePageKey`).

import { onTitleFont } from '../panes/title-font';
import './layout.css';
import { type CellSource, type PaneContext, createPaneContext } from '../panes/context';
import { PANE_FACTORIES } from '../panes/factories';
import type { PaneCell, PaneShell } from '../panes/pane';
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
  inputFitsGameColumn,
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
  lookPatch,
  togglePatch,
} from './model';
import { type FloatHoles, floatHoles } from './float-holes';
import {
  CROSS_CELLS_BORDERLESS,
  CROSS_CELLS_FRAMED,
  GEAR_ICON,
  LOOK_BUTTON_CELLS,
  LOOK_ICONS,
  type PaneButton,
  gearLabel,
  hasGear,
  hoverFit,
  lookButtonsFit,
  lookLabel,
  lookOn,
  lookSlot,
  paneButtons,
} from './pane-buttons';
import { type Settings, paneSettingsOf } from '../settings/types';
import { device } from '../core/device';
import { GAME_TAB, PHONE_MIN_COLS, PHONE_MIN_ROWS, type PhoneLayoutResult, type PhoneTab, allocatePhone } from './phone';
import { type PhoneGameLens, type PhoneGameResult, allocatePhoneGame, commandRows, ownKeyboardReserve } from './phone-game';
import { holdDeviceKeyboard, keyboardUp, landscapeLayout, screenLandscape } from './phone-viewport';
import {
  type DockId,
  defaultDockSize,
  type LayoutModel,
  PANE_IDS,
  PANE_SHORT,
  type PaneId,
  type ScriptPaneId,
  isBuiltinPaneId,
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

/** The phone's map lens as the phone layer asks for it, in CSS px (`Cockpit.setPhoneLens`). */
export interface PhoneLensPx {
  /** The lens's full diameter. */
  size: number;
  /**
   * Its least diameter (stage 52): with less room than `size` the lens
   * shrinks in whole rows down to this, and hides below it. Absent: it
   * never shrinks.
   */
  min?: number;
  /** Air above it (under the fight card, or the top edge) and right of it. */
  gapTop: number;
  gapRight: number;
  /** Landscape (stage 52c): air between the left column (or the left edge) and the lens. Absent: none. */
  gapLeft?: number;
  /** The height from the cockpit's bottom edge the lens must stay out of (the keys there). */
  clearBottom: number;
  /**
   * A height from the bottom edge the lens stays out of also where
   * `clearBottom` does not apply (landscape with our own keyboard open:
   * the hot key box, which stays while it is typed in). Absent: none.
   */
  clearAlways?: number;
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
  /**
   * The Gear's click on pane `id` (ADR 0107: the App toggles its settings
   * popup). Without it no pane has a Gear.
   */
  onGear?: (id: PaneId) => void;
  /**
   * The phone's layout in the live game (ADR 0136): only the live game's
   * shell passes it. Without the phone flag it does nothing.
   */
  phoneGame?: boolean;
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
  /** The holes under floating panes (float-holes.ts), recut after every layout. */
  private readonly holes: FloatHoles;
  /** Hover buttons by pane (the Gear, Colour, Border, Background, ADR 0095), from the left; none on temporary panes. */
  private readonly lookers = new Map<PaneId, { what: PaneButton; el: HTMLDivElement }[]>();
  private readonly onGear: ((id: PaneId) => void) | null;
  /** The pane whose Gear popup is open (`markGear`). */
  private gearOpen: PaneId | null = null;
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
  /** Cells the input row keeps for the menu bar or the clock (`setBarCells`, ADR 0102). */
  private inputBar = 0;
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
  /** The phone layout (ADR 0075 §3), fixed at construction. */
  private readonly phone: boolean;
  /** Phone only: the tab strip. */
  private readonly stripEl: HTMLDivElement | null = null;
  /** Phone only: the selected tab (memory only, never stored). */
  private tab: PhoneTab = GAME_TAB;
  /** Phone only: the strip's tabs in order, GAME first (from the last relayout). */
  private tabs: PhoneTab[] = [GAME_TAB];
  /** Phone only: what the strip shows now (redrawn when it changes). */
  private stripKey = '';
  /** Phone only: the live game's layout (ADR 0136), fixed at construction. */
  private readonly phoneGame: boolean;
  /** Phone game layout: a fight is on, the fight card has its rows (`setPhoneFight`). */
  private pgFight = false;
  /** Phone game layout: the last allocation. */
  private pgLast: PhoneGameResult | null = null;
  /** Phone game layout: the map lens as the phone layer wants it, px (`setPhoneLens`); null: no lens. */
  private pgLens: PhoneLensPx | null = null;
  /** Phone game layout: the pane the strip shows (`setPhoneStrip`); null: the strip is closed. */
  private pgStrip: PaneId | null = null;
  /** Phone game layout: Comm open at these rows (null: the default share), or null: closed (`setPhoneComm`). */
  private pgComm: { rows: number | null } | null = null;
  /** Phone game layout: the strip's stored rows (`setPhoneStripRows`); null: the default share. */
  private pgStripRows: number | null = null;
  /** Phone game layout: the height from the bottom edge the strip, fight card and Comm stay above, px (`setPhoneLimit`). */
  private pgLimit: number | PhoneLimit | null = null;
  /** Phone game layout: Comm holds the own keyboard's target (`setPhoneCommKeep`). */
  private pgCommKeep = false;
  /** Phone game layout, landscape: the left column's stored width in columns (`setPhoneSideCols`); null: the default share. */
  private pgSideCols: number | null = null;
  /** Phone game layout, landscape: the width from the right edge the left column never reaches, px (`setPhoneSideClear`). */
  private pgSideClear = 0;
  /** Phone game layout: the rows at Comm's top left to its hood in the last layout (0: no hood). */
  private pgCommHead = 0;
  /** Phone game layout: the window is wider than tall, as of the last layout (without the phone layer: the last with the device's keyboard down). */
  private pgLandscape = false;
  /** Phone game layout: what a keyboard of our own takes from the bottom edge, px, for a shape (`setPhoneBottom`); null: none. */
  private pgBottom: ((landscape: boolean, height: number) => number) | null = null;
  /** Phone game layout: whether the px the reserve comes to are enough for the keyboard (`setPhoneBottom`); null: any. */
  private pgBottomFits: ((lift: number) => boolean) | null = null;
  /** Phone game layout: the last layout left the wanted reserve out (no rows, or `pgBottomFits` said no). */
  private pgBottomRefused = false;
  /** Phone game layout: a band is being dragged (`holdPhoneSize`): the game's size is not reported until it ends. */
  private pgHold = false;
  /** Phone game layout: counts the calls of `holdPhoneSize`, so a late end knows it was overtaken. */
  private pgHoldTurn = 0;
  /** Phone game layout: the size kept back while `pgHold`, and who gets it. */
  private pgHeld: { cols: number; rows: number } | null = null;
  private pgSizeSend: ((cols: number, rows: number) => void) | null = null;
  /** Phone game layout: Ctrl/Alt+1…9 (`setPhonePageKey`). */
  private pgPageKey: ((index: number) => boolean) | null = null;

  constructor(opts: CockpitOptions) {
    const doc = opts.root.ownerDocument;
    this.settings = opts.settings;
    this.cells = opts.cells;
    this.onFocusInput = opts.onFocusInput ?? (() => {});
    this.onGear = opts.onGear ?? null;
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
    this.holes = floatHoles(this.el);
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
    this.phone = device().phone;
    this.phoneGame = this.phone && opts.phoneGame === true;
    // The scope of the phone layer's CSS (src/phone/phone.css).
    if (this.phoneGame) this.el.dataset.phoneGame = '';
    if (this.phone && !this.phoneGame) {
      // The old phone layout: its fields have the device's keyboard (phone-viewport.ts).
      this.unsubs.push(holdDeviceKeyboard(doc));
      this.stripEl = div('wc-phone-tabs');
      this.stripEl.setAttribute('role', 'tablist');
      this.stripEl.addEventListener('mousedown', (e) => e.preventDefault());
      this.stripEl.addEventListener('click', this.onTabClick);
    }
    this.paneContext =
      opts.paneContext ??
      createPaneContext({ doc, settings: this.settings, cells: this.cells, requestFrame: this.requestFrame });
    // The input row before the panes in paint order (ADR 0101): in a narrow
    // game column it runs under the right dock (ADR 0102), and painted after the panes it would overlap their
    // composited scrollers and be promoted to a layer of its own, which at
    // a fractional pixel ratio snaps differently and cuts the top device
    // pixel of accents (ADR 0042). The two never overlap on screen, and
    // floating panes are above both by z-index.
    this.el.append(this.gameEl, this.inputEl);
    for (const id of PANE_IDS) this.attach(PANE_FACTORIES[id](this.paneContext));
    this.el.append(this.handlesEl, this.barEl, this.ghostEl, this.tooSmallEl, this.shieldEl);
    if (this.stripEl) this.el.append(this.stripEl);
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
      // The title face loaded: the hoods take the measured label widths (ADR 0123).
      onTitleFont(() => this.scheduleRelayout()),
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
    if (this.phone) {
      // No arranging on a phone (ADR 0075 §3): no grip, close cross or float handles.
      this.shells.set(id, shell);
      this.el.insertBefore(shell.el, before);
      return;
    }
    const grip = div('wc-pane-grip');
    grip.dataset.grip = id;
    shell.el.append(grip);
    // The Gear and the look buttons (ADR 0095) before the cross; a temporary pane has no settings to change.
    if (!this.temps.has(id)) {
      const gear = this.onGear !== null && hasGear(id);
      const btns = paneButtons(gear).map((what) => {
        const b = div(`wc-pane-btn wc-pane-btn-${what}`);
        b.setAttribute('role', 'button');
        b.dataset.look = what;
        b.style.setProperty('--slot', String(lookSlot(what)));
        if (what === 'gear') {
          b.innerHTML = GEAR_ICON;
          const text = gearLabel(shell.label);
          b.title = text;
          b.setAttribute('aria-label', text);
          b.dataset.mb = `pane:${id}`;
          b.addEventListener('click', () => this.onGear?.(id));
        } else {
          b.innerHTML = LOOK_ICONS[what];
          b.addEventListener('click', () => this.settings.update(lookPatch(this.settings.get().panes, id, what)));
        }
        shell.el.append(b);
        return { what, el: b };
      });
      this.lookers.set(id, btns);
    }
    // The cells the hover set covers at the top right, so the hood keeps left of them where it can (ADR 0123).
    shell.hoverCells = CROSS_CELLS_FRAMED + LOOK_BUTTON_CELLS * (this.lookers.get(id)?.length ?? 0);
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
    // The map has no hover outline either (ADR 0084 addendum 2).
    if (id === 'map') shell.el.toggleAttribute('data-no-outline', true);
    for (const edge of FLOAT_EDGES) {
      const h = div('wc-float-handle');
      h.dataset.edge = edge;
      shell.el.append(h);
    }
    this.shells.set(id, shell);
    this.el.insertBefore(shell.el, before);
  }

  /**
   * Brings pane `id`'s hover set (ADR 0095) up to date after it was placed
   * `paneW` px wide: each look button's label and state, which of them show
   * (`hoverFit`: over the hood's right part if need be; the rest are
   * dropped, the Gear first) and whether the set covers the hood
   * (`PaneShell.coverHood`). Attribute writes only on a change.
   */
  private syncLook(id: PaneId, shell: PaneShell, s: Readonly<Settings>, paneW: number, cellW: number): void {
    if (this.phone) return;
    const btns = this.lookers.get(id) ?? [];
    const framed = shell.el.hasAttribute('data-framed');
    // Framed: the hood was moved left for them where it could; what still does not fit lies over the
    // hood's right part (an iron shelf under it on hover), and only buttons that would cover its left
    // end drop (ADR 0123 "Hood position and hover buttons"). A borderless pane has nothing to keep
    // clear (ADR 0095 round 3: no name tag).
    const { fit, cover } = framed
      ? hoverFit(paneW, cellW, btns.length, shell.titleEnd, shell.titleKeep)
      : { fit: lookButtonsFit(paneW, cellW, 0, CROSS_CELLS_BORDERLESS, btns.length, 0), cover: null };
    // A script pane made without a cross shows no hover set (ADR 0084 addendum).
    shell.coverHood(shell.el.hasAttribute('data-no-cross') ? null : cover);
    if (!btns.length) return;
    const p = paneSettingsOf(s.panes, id);
    btns.forEach(({ what, el: b }, i) => {
      // Dropped from the left: the first `n - fit` go (the Gear first).
      b.toggleAttribute('data-drop', i < btns.length - fit);
      if (what === 'gear') return;
      const text = lookLabel(what, p);
      if (b.title !== text) {
        b.title = text;
        b.setAttribute('aria-label', text);
      }
      b.toggleAttribute('data-on', lookOn(what, p));
    });
  }

  /**
   * Marks the Gear of pane `id` as open (its settings popup is shown), or
   * none (null). The App calls it when the popup opens or closes.
   */
  markGear(id: PaneId | null): void {
    if (id === this.gearOpen) return;
    const mark = (pid: PaneId | null, on: boolean): void => {
      const g = pid === null ? undefined : this.lookers.get(pid)?.find((b) => b.what === 'gear');
      g?.el.toggleAttribute('data-open', on);
    };
    mark(this.gearOpen, false);
    this.gearOpen = id;
    mark(id, true);
  }

  /** True when pane `id` has a box in the last layout (shown, not too small). */
  isShown(id: PaneId): boolean {
    const r = this.last;
    return !!r && !r.tooSmall && r.panes.some((p) => p.id === id);
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
    this.attach(shell, this.handlesEl);
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
    this.lookers.delete(id);
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
    if (this.phone) this.scheduleRelayout(); // the tab label follows
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

  /**
   * The width in cells of the menu bar (or the clock strip) at the input
   * row's right end (ADR 0099). It decides whether the input row stays in
   * the game column or runs under the right dock (ADR 0102).
   */
  setBarCells(cells: number): void {
    const n = Math.max(0, Math.ceil(cells));
    if (n === this.inputBar) return;
    this.inputBar = n;
    this.scheduleRelayout();
  }

  /** The bar width the layout counts (`setBarCells`). */
  get barCells(): number {
    return this.inputBar;
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
    const cells = this.cells.get();
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    if (!(W > 0 && H > 0 && cells.w > 0 && cells.h > 0)) return;
    // The cockpit's place on the page (layout is clean after clientWidth), so
    // pane frames land on whole device pixels (ADR 0091 "Frames").
    const o = this.el.getBoundingClientRect();
    const cell: PaneCell = { w: cells.w, h: cells.h, ox: o.left, oy: o.top };
    const s = this.settings.get();
    if (this.phone) {
      if (this.phoneGame) this.relayoutPhoneGame(cell, W, H);
      else this.relayoutPhone(cell, W, H);
      return;
    }
    const layout = this.preview ?? s.layout;
    const base = allocate({
      layout,
      panes: s.panes,
      present: this.present,
      cols: Math.floor(W / cell.w + 1e-6),
      rows: Math.floor(H / cell.h + 1e-6),
      barCells: this.inputBar,
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
      if (b) this.syncLook(id, shell, s, b.rect.w * cell.w, cell.w);
    }
    this.renderHandles(r, cell);
    // Synchronously, before this layout is painted: what a float now covers is clipped out in the same frame.
    this.holes.sync();
    for (const fn of [...this.layoutListeners]) fn();
  }

  /**
   * Recuts the holes under floating panes now (float-holes.ts): the
   * weather calls it when it marks or unmarks the cockpit `data-weather`.
   */
  syncHoles(): void {
    if (!this.disposed) this.holes.sync();
  }

  /** True while a float cuts a hole in the game text or the input line (float-holes.ts). */
  get textHoles(): boolean {
    return this.holes.textHoles;
  }

  /**
   * Veils instead of holes in the game text and the input line from now on
   * (ADR 0135, float-holes.ts): App's FloatVeilWatch switches when text
   * keeps reaching the screen late under them.
   */
  useFloatVeils(): void {
    if (this.disposed) return;
    this.holes.setVeils(true);
    this.holes.sync();
  }

  /** Phone only: the selected tab (GAME or a pane id). */
  get phoneTab(): PhoneTab {
    return this.tab;
  }

  /** Phone only: selects a tab (memory only; an unknown one shows GAME). */
  selectTab(tab: PhoneTab): void {
    if (!this.phone || tab === this.tab) return;
    this.tab = tab;
    this.relayoutNow();
  }

  /** Phone only: selects the strip's tab at `index` (0 = GAME, ADR 0098); false when there is none. */
  selectTabAt(index: number): boolean {
    // The phone's game layout has no tabs: the keys are its pane strip's (ADR 0136 §5).
    if (this.phoneGame) return this.pgPageKey?.(index) ?? false;
    const tab = this.phone ? this.tabs[index] : undefined;
    if (tab === undefined) return false;
    this.selectTab(tab);
    return true;
  }

  private readonly onTabClick = (e: MouseEvent): void => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (!t) return;
    e.stopPropagation();
    this.selectTab(t.dataset.tab as PhoneTab);
  };

  /** Phone only: the relayout (allocatePhone, ADR 0075 §3); see the file header. */
  private relayoutPhone(cell: PaneCell, W: number, H: number): void {
    const s = this.settings.get();
    const r: PhoneLayoutResult = allocatePhone({
      layout: s.layout,
      panes: s.panes,
      present: this.present,
      cols: Math.floor(W / cell.w + 1e-6),
      rows: Math.floor(H / cell.h + 1e-6),
      tab: this.tab,
      guard: !keyboardUp(),
    });
    this.tab = r.tab;
    this.tabs = r.tabs;
    let res: LayoutResult = r;
    if (!r.tooSmall && r.tab === GAME_TAB && this.temps.size > 0) {
      // Temporary panes over the GAME view, kept inside it (not over the strip or the input).
      const v = r.view;
      const temps = this.tempBoxes(r, s.layout).map((b): PaneBox => {
        const c = clampFloat({ ...b.rect, x: b.rect.x - v.x, y: b.rect.y - v.y }, floatMin(b.id, true), v.w, v.h);
        const rect = { ...c, x: c.x + v.x, y: c.y + v.y };
        return { ...b, rect, content: { x: rect.x + 1, y: rect.y + 1, w: rect.w - 2, h: rect.h - 2 } };
      });
      res = { ...r, panes: [...r.panes, ...temps] };
    }
    this.last = res;
    this.el.dataset.cells = `${r.cols}x${r.rows}`;
    if (this.el.dataset.cells !== this.lastSize) {
      this.lastSize = this.el.dataset.cells;
      this.paneContext.bus.emit('view.size', { cols: r.cols, rows: r.rows });
    }
    this.el.dataset.collapsed = '';
    this.el.dataset.phoneTab = r.tab === GAME_TAB ? 'game' : 'pane';
    this.setTooSmall(res);
    placeEl(this.gameEl, r.game, cell);
    placeEl(this.inputEl, r.input, cell);
    const boxes = new Map(res.panes.map((p) => [p.id, p]));
    for (const [id, shell] of this.shells) {
      shell.applyTheme(s);
      const b = boxes.get(id);
      // Only temporary panes float on a phone; a pane tab is a plain full-width box.
      const floating = b && this.temps.has(id) ? b.index : undefined;
      shell.place(b ? { rect: b.rect, content: b.content, framed: b.framed, floating } : null, cell);
    }
    this.renderStrip(r, cell);
    // Synchronously, before this layout is painted: what a float now covers is clipped out in the same frame.
    this.holes.sync();
    for (const fn of [...this.layoutListeners]) fn();
  }

  /** True with the phone's layout in the live game (ADR 0136). */
  get isPhoneGame(): boolean {
    return this.phoneGame;
  }

  /** Phone game layout: the last allocation (cells), or null before the first layout and elsewhere. */
  get phoneGameLayout(): PhoneGameResult | null {
    return this.pgLast;
  }

  /** Phone game layout: a fight started or ended; the fight card gets or gives back its rows. */
  setPhoneFight(on: boolean): void {
    if (!this.phoneGame || on === this.pgFight) return;
    this.pgFight = on;
    this.scheduleRelayout();
  }

  /**
   * Phone game layout: the map lens (ADR 0136 §4), or null for none. The
   * map pane is then placed borderless in a rectangle of whole cells that
   * holds a circle `size` px across (the phone layer clips and dresses it),
   * and is hidden when the allocator says it would collide.
   */
  setPhoneLens(lens: PhoneLensPx | null): void {
    if (!this.phoneGame) return;
    const a = this.pgLens;
    if (a === lens || (a && lens && a.size === lens.size && (a.min ?? a.size) === (lens.min ?? lens.size) && a.gapTop === lens.gapTop && a.gapRight === lens.gapRight && (a.gapLeft ?? 0) === (lens.gapLeft ?? 0) && a.clearBottom === lens.clearBottom && (a.clearAlways ?? 0) === (lens.clearAlways ?? 0))) return;
    this.pgLens = lens && { ...lens };
    this.scheduleRelayout();
  }

  /**
   * Phone game layout: opens the pane strip on pane `id` (one pane at a
   * time, borderless, from the top edge; ADR 0136 §5), changes its page, or
   * closes it (null). The phone layer decides the pages and their order;
   * the cockpit places the pane. A pane that is not there shows nothing
   * (the strip's rows stay).
   */
  setPhoneStrip(id: PaneId | null): void {
    if (!this.phoneGame || id === this.pgStrip) return;
    this.pgStrip = id;
    this.scheduleRelayout();
  }

  /**
   * Phone game layout: the strip's height in rows (stage 52: its band is
   * dragged like Comm's), or null for the default share of the screen. The
   * allocator fits it to the screen (`phoneGameLayout` `strip`, `stripRange`).
   */
  setPhoneStripRows(rows: number | null): void {
    if (!this.phoneGame || rows === this.pgStripRows) return;
    this.pgStripRows = rows;
    if (this.pgStrip !== null) this.scheduleRelayout();
  }

  /**
   * Phone game layout: the height from the cockpit's bottom edge, px, that
   * the strip, the fight card and Comm together stay above (stage 52: the
   * top of the place of three hot keys, so they never reach under the quick
   * buttons), or null for none. Applied in portrait only: landscape has its
   * own arrangement (stage 52c).
   *
   * A function is asked at every layout with what a keyboard of our own
   * lifts the keys by (`lift`, px; 0 without one) and the cockpit's height:
   * the phone layer decides there whether the hot key columns stand above
   * the keyboard (the limit) or have no room (null), before the rows are
   * laid out, so the keyboard's opening and its digit row are one layout
   * each (stage 53d).
   */
  setPhoneLimit(px: number | PhoneLimit | null): void {
    if (!this.phoneGame || px === this.pgLimit) return;
    this.pgLimit = px;
    this.scheduleRelayout();
  }

  /**
   * Phone game layout: a keyboard of our own is open (ADR 0138 §5) and
   * takes `px(landscape, height)` CSS px from the cockpit's bottom edge, or
   * null when it closed. The allocator keeps the whole rows that hold it
   * free under the command row (`phoneGameLayout` `bottom`). The cockpit
   * asks at every layout, so a rotation is one layout, with the height for
   * the new shape. The cockpit's own size does not change, and the game
   * text reports its new rows once (the output pane tells a size only when
   * it differs from the last). A new function is a new height (the digit
   * row folded up or down): one more layout. In portrait the keys at the
   * bottom right stand on the keyboard's top edge, and the limit of
   * `setPhoneLimit` and the lens's `clearBottom` are counted from there; in
   * landscape they stand beside the keyboard and neither applies.
   *
   * `fits(lift)` says whether the px the reserve comes to on this screen
   * are enough; where not, the layout leaves the reserve out at once
   * (`phoneBottomRefused`).
   */
  setPhoneBottom(px: ((landscape: boolean, height: number) => number) | null, fits: ((lift: number) => boolean) | null = null): void {
    if (!this.phoneGame || px === this.pgBottom) return;
    this.pgBottom = px;
    this.pgBottomFits = px ? fits : null;
    this.scheduleRelayout();
  }

  /** Phone game layout: the last layout could not give the keyboard its rows (`setPhoneBottom`): the phone layer closes it. */
  get phoneBottomRefused(): boolean {
    return this.pgBottomRefused;
  }

  /**
   * Phone game layout: what a keyboard that asks for `px(landscape, height)`
   * would be given on the screen as it is now, px from the bottom edge to
   * the command row's foot (`ownKeyboardReserve`'s `lift`; 0: no row). The
   * phone layer asks before it opens its keyboard, so a tap on a screen too
   * low for it opens nothing (no layout, no window size).
   */
  phoneBottomLift(px: (landscape: boolean, height: number) => number): number {
    if (!this.phoneGame) return 0;
    const cellH = this.cells.get().h;
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    if (!(W > 0 && H > 0 && cellH > 0)) return 0;
    const win = this.el.ownerDocument.defaultView;
    return ownKeyboardReserve(H, cellH, px(landscapeLayout(W, H, win ? screenLandscape(win) : null), H), commandRows(cellH)).lift;
  }

  /** Phone game layout: the rows at Comm's top that are its hood's, as last laid out (0: Comm has no hood now). */
  get phoneCommHead(): number {
    return this.pgCommHead;
  }

  /**
   * Phone game layout: Comm holds the target of a keyboard of our own (its
   * reply line or its search field is typed in). While the keyboard is
   * open Comm then keeps its least rows as long as anything else can give
   * way (`allocatePhoneGame` `commKeep`; `phoneGameLayout` `overLimit`).
   */
  setPhoneCommKeep(on: boolean): void {
    if (!this.phoneGame || on === this.pgCommKeep) return;
    this.pgCommKeep = on;
    this.scheduleRelayout();
  }

  /**
   * Phone game layout, landscape (stage 52c): the width in columns of the
   * left column that holds the strip and Comm (its band is dragged
   * sideways), or null for the default share of the screen. The allocator
   * fits it to the screen (`phoneGameLayout` `side`, `sideRange`). Not used
   * in portrait.
   */
  setPhoneSideCols(cols: number | null): void {
    if (!this.phoneGame || cols === this.pgSideCols) return;
    this.pgSideCols = cols;
    if (this.pgLandscape && (this.pgStrip !== null || this.pgComm !== null)) this.scheduleRelayout();
  }

  /**
   * Phone game layout, landscape: the width from the cockpit's right edge,
   * px, that the left column never reaches (the lens at its least size or
   * its key row, the hot key columns, the compass).
   */
  setPhoneSideClear(px: number): void {
    if (!this.phoneGame || px === this.pgSideClear) return;
    this.pgSideClear = px;
    if (this.pgLandscape && (this.pgStrip !== null || this.pgComm !== null)) this.scheduleRelayout();
  }

  /**
   * Phone game layout: wraps the game text's size report (NAWS) so that
   * `holdPhoneSize` can keep it back while a band is dragged. Without the
   * phone game layout it returns `send` itself: nothing is wrapped.
   */
  phoneSizeGate(send: (cols: number, rows: number) => void): (cols: number, rows: number) => void {
    if (!this.phoneGame) return send;
    this.pgSizeSend = send;
    return (cols, rows) => {
      if (this.pgHold) this.pgHeld = { cols, rows };
      else send(cols, rows);
    };
  }

  /**
   * Phone game layout: a band's drag began (true) or ended (false). While
   * it lasts the layout follows the finger, and the game text's size is
   * kept back: MUME gets one window size for the whole drag, the last one,
   * after the release. The end waits two frames, so the release's own
   * relayout (next frame) and the size its resize reports (after that
   * frame's layout) are in.
   */
  holdPhoneSize(on: boolean): void {
    if (!this.phoneGame) return;
    // A new drag before the last one's end has run takes the hold over: that end then does nothing.
    const turn = ++this.pgHoldTurn;
    if (on) {
      this.pgHold = true;
      return;
    }
    if (!this.pgHold) return;
    this.requestFrame(() =>
      this.requestFrame(() => {
        if (turn !== this.pgHoldTurn) return;
        this.pgHold = false;
        const held = this.pgHeld;
        this.pgHeld = null;
        if (held && !this.disposed) this.pgSizeSend?.(held.cols, held.rows);
      }),
    );
  }

  /** Phone game layout: the pane the strip shows, or null (closed). */
  get phoneStrip(): PaneId | null {
    return this.pgStrip;
  }

  /**
   * Phone game layout: opens Comm full width under the fight card at `rows`
   * (null: the default share of the screen), or closes it (null; ADR 0136
   * §6). The allocator fits the height to the screen (`phoneGameLayout`
   * `comm`, `commRange`).
   */
  setPhoneComm(comm: { rows: number | null } | null): void {
    if (!this.phoneGame) return;
    const a = this.pgComm;
    if (a === comm || (a && comm && a.rows === comm.rows)) return;
    this.pgComm = comm && { rows: comm.rows };
    this.scheduleRelayout();
  }

  /**
   * Phone game layout: who answers Ctrl/Alt+1…9 (`selectTabAt`: the index
   * is 0 for the first key). The phone layer's pane strip; null: no one.
   */
  setPhonePageKey(fn: ((index: number) => boolean) | null): void {
    if (this.phoneGame) this.pgPageKey = fn;
  }

  /** The lens for the allocator, at a cell of `cell` px and a command row `inputPx` high. */
  private lensCells(cell: { w: number; h: number }, inputPx: number, own = false): PhoneGameLens | null {
    const l = this.pgLens;
    if (!l) return null;
    const up = (px: number, unit: number): number => Math.max(0, Math.ceil(px / unit - 1e-6));
    return {
      fullPx: l.size,
      minPx: l.min ?? l.size,
      cellW: cell.w,
      cellH: cell.h,
      gapTop: up(l.gapTop, cell.h),
      gapRight: up(l.gapRight, cell.w),
      gapLeft: up(l.gapLeft ?? 0, cell.w),
      // Above a keyboard of our own in landscape (`own`: the keys stand beside it) the lens's
      // corner keys stay off the command field (`PHONE_OWN_KBD_LENS_PX`); in portrait the keys
      // stand above it as ever.
      clearBottom: Math.max(own ? up(PHONE_OWN_KBD_LENS_PX, cell.h) : up(l.clearBottom - inputPx, cell.h), up((l.clearAlways ?? 0) - inputPx, cell.h)),
    };
  }

  /** Phone game layout: the relayout (allocatePhoneGame, ADR 0136 §2); see the file header. */
  private relayoutPhoneGame(cell: PaneCell, W: number, H: number): void {
    const s = this.settings.get();
    const inputRows = commandRows(cell.h);
    // The device's keyboard is up. Only on a phone whose phone layer could not be loaded (the
    // command line then has the device's keyboard, as in the old phone layout; with the layer
    // the state is never set, phone-viewport.ts `watchDeviceKeyboard`): the too-small guard is
    // off, and the shape is the last one seen with the keyboard down. Goes with the old phone
    // layout (stage 52 file, section C).
    const kbd = keyboardUp();
    // Landscape (stage 52c) is the window's shape (a visible area made lower, as by a split
    // screen, can make a portrait screen wider than tall, and that is still portrait), unless
    // the screen itself says portrait.
    const win = this.el.ownerDocument.defaultView;
    if (!kbd) this.pgLandscape = landscapeLayout(W, H, win ? screenLandscape(win) : null);
    const land = this.pgLandscape;
    const g = this.allocPhoneGame(cell, W, H, land, kbd, true);
    this.pgLast = g;
    const panes: PaneBox[] = [];
    if (!g.tooSmall && this.temps.size > 0) {
      // Temporary panes over the game text, kept inside it (as in `relayoutPhone`).
      const v = g.game;
      const base: LayoutResult = { ...EMPTY_LAYOUT, cols: g.cols, rows: g.rows, game: g.game, input: g.input };
      for (const b of this.tempBoxes(base, s.layout)) {
        const c = clampFloat({ ...b.rect, x: b.rect.x - v.x, y: b.rect.y - v.y }, floatMin(b.id, true), v.w, v.h);
        const rect = { ...c, x: c.x + v.x, y: c.y + v.y };
        panes.push({ ...b, rect, content: { x: rect.x + 1, y: rect.y + 1, w: rect.w - 2, h: rect.h - 2 } });
      }
    }
    const res: LayoutResult = { ...EMPTY_LAYOUT, cols: g.cols, rows: g.rows, tooSmall: g.tooSmall, game: g.game, input: g.input, panes };
    this.last = res;
    this.el.dataset.cells = `${g.cols}x${g.rows}`;
    if (this.el.dataset.cells !== this.lastSize) {
      this.lastSize = this.el.dataset.cells;
      this.paneContext.bus.emit('view.size', { cols: g.cols, rows: g.rows });
    }
    this.el.dataset.collapsed = '';
    // As the tab strip layout: marks a phone cockpit, so a borderless pane gets no hover outline (layout.css).
    this.el.dataset.phoneTab = 'game';
    this.setTooSmall(res);
    placeEl(this.gameEl, g.game, cell);
    placeEl(this.inputEl, g.input, cell);
    const boxes = new Map(panes.map((p) => [p.id, p]));
    // Comm's hood: in landscape always (stage 52e). In portrait (round 53i) while Comm keeps
    // `PHONE_COMM_HOOD_KEEP_PX` under the hood and above its band (a line of chat and the whole
    // reply line): on a short screen, typing above the keyboard, the rows are the conversation's,
    // and the hood gives way.
    const headRows = phoneCommHeadRows(cell.h, g.landscape && g.strip.h > 0);
    const hooded = g.landscape || (g.comm.h - headRows - PHONE_COMM_BAND_ROWS) * cell.h >= PHONE_COMM_HOOD_KEEP_PX;
    this.pgCommHead = g.comm.h > 0 && !g.tooSmall && hooded ? headRows : 0;
    for (const [id, shell] of this.shells) {
      shell.applyTheme(s);
      const b = boxes.get(id);
      // The map pane is the lens (ADR 0136 §4): borderless in the lens's cells. The strip's
      // pane and Comm lie in their rows (§5, §6), borderless, with a row (or two) of them left
      // to the phone layer's chrome: the hood above the strip's pane and the resize band under
      // it, and the resize band under Comm. Every other pane but a temporary one is hidden.
      const strip = id === this.pgStrip && g.strip.h > 0 && !g.tooSmall;
      shell.el.toggleAttribute('data-phone-strip', strip);
      if (id === 'map' && g.lens && !g.tooSmall) shell.place({ rect: g.lens, content: g.lens, framed: false }, cell);
      // (Landscape: the band is the column's last columns instead of a part's last row.)
      else if (strip) shell.place({ rect: g.strip, content: inset(g.strip, phoneStripChromeRows(cell.h), g.landscape ? 0 : PHONE_STRIP_FOOT_ROWS, g.sideBand), framed: false }, cell);
      // (Comm has a hood of its own, as the strip has; in landscape under a divider when the strip is above it.)
      else if (id === 'comm' && g.comm.h > 0 && !g.tooSmall)
        shell.place({ rect: g.comm, content: inset(g.comm, this.pgCommHead, g.landscape ? 0 : PHONE_COMM_BAND_ROWS, g.sideBand), framed: false }, cell);
      else shell.place(b ? { rect: b.rect, content: b.content, framed: b.framed, floating: b.index } : null, cell);
    }
    this.holes.sync();
    for (const fn of [...this.layoutListeners]) fn();
  }

  /**
   * Phone game layout: the allocation for a cockpit of `W` × `H` px, with
   * the rows of a keyboard of our own (`own`) or as it would be with that
   * keyboard closed (no reserve, and Comm not kept for it).
   */
  private allocPhoneGame(cell: { w: number; h: number }, W: number, H: number, land: boolean, kbd: boolean, own: boolean): PhoneGameResult {
    const inputRows = commandRows(cell.h);
    // A keyboard of our own (`setPhoneBottom`): whole rows from the bottom edge, and what they are
    // on screen (`ownKeyboardReserve`). Portrait: the compass and the hot keys stand on the keyboard's
    // top edge (the phone layer lifts them), so the limit and the lens's clearance are counted from
    // there. Landscape: they stand beside the keyboard in its band, and the lens only stays off the
    // command field.
    const want = own && this.pgBottom ? this.pgBottom(land, H) : 0;
    let { bottom, lift } = ownKeyboardReserve(H, cell.h, want, inputRows);
    if (own) {
      // A screen too low for the keyboard (`fits`: its rows would be under their least height): the
      // reserve is left out in this same layout, so the keyboard's closing is one window size, not
      // one with the rows it cannot use and one without.
      this.pgBottomRefused = want > 0 && (bottom === 0 || (this.pgBottomFits !== null && !this.pgBottomFits(lift)));
      if (this.pgBottomRefused) bottom = lift = 0;
    }
    const limit = typeof this.pgLimit === 'function' ? this.pgLimit(lift, H) : this.pgLimit;
    return allocatePhoneGame({
      cols: Math.floor(W / cell.w + 1e-6),
      rows: Math.floor(H / cell.h + 1e-6),
      inputRows,
      guard: !kbd,
      strip: this.pgStrip !== null,
      stripRows: this.pgStripRows,
      // Portrait (`setPhoneLimit`): whole rows from the top down to the limit.
      ...(limit !== null && W <= H ? { maxTop: Math.max(0, Math.floor((H - lift - limit) / cell.h + 1e-6)) } : {}),
      fight: this.pgFight,
      comm: this.pgComm,
      lens: this.lensCells(cell, inputRows * cell.h, bottom > 0 && land),
      ...(bottom > 0 ? { bottom, ...(this.pgCommKeep ? { commKeep: true } : {}) } : {}),
      // Landscape: the strip and Comm are one column from the left.
      ...(land
        ? { side: { cols: this.pgSideCols, clearRight: Math.max(0, Math.ceil(this.pgSideClear / cell.w - 1e-6)), band: phoneSideBandCols(cell.w) } }
        : {}),
    });
  }

  /**
   * Phone game layout: the layout as it would be now with the keyboard of
   * our own closed (nothing is laid out or changed). The phone layer asks
   * before it folds the keyboard for something that then needs room (the
   * hot key box). Null before the first layout.
   */
  phoneGameLayoutClosed(): PhoneGameResult | null {
    if (!this.phoneGame || !this.pgLast) return null;
    const cell = this.cells.get();
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    if (!(W > 0 && H > 0 && cell.w > 0 && cell.h > 0)) return null;
    return this.allocPhoneGame(cell, W, H, this.pgLandscape, keyboardUp(), false);
  }

  /** Phone only: the tab strip's label for `tab`. */
  private tabLabel(tab: PhoneTab): string {
    if (tab === GAME_TAB) return 'GAME';
    if (isBuiltinPaneId(tab)) return PANE_SHORT[tab];
    const label = (this.shells.get(tab)?.label ?? tab).toUpperCase();
    return label.length > 12 ? label.slice(0, 12) : label;
  }

  /** Phone only: draws the tab strip (one row of ` LABEL ` tokens, the selected one lit). */
  private renderStrip(r: PhoneLayoutResult, cell: { w: number; h: number }): void {
    const strip = this.stripEl!;
    placeEl(strip, r.strip, cell);
    strip.hidden = r.strip.h === 0;
    const labels = r.tabs.map((t) => this.tabLabel(t));
    const key = `${r.tabs.join('|')}#${labels.join('|')}#${r.tab}`;
    if (key === this.stripKey) return;
    this.stripKey = key;
    const doc = this.el.ownerDocument;
    const frag = doc.createDocumentFragment();
    r.tabs.forEach((tab, i) => {
      if (i > 0) {
        const sep = doc.createElement('span');
        sep.className = 'wc-phone-sep';
        sep.textContent = '│';
        frag.append(sep);
      }
      const t = doc.createElement('span');
      t.className = 'wc-phone-tab';
      t.dataset.tab = tab;
      t.setAttribute('role', 'tab');
      const active = tab === r.tab;
      t.setAttribute('aria-selected', String(active));
      t.classList.toggle('is-active', active);
      t.textContent = ` ${labels[i]} `;
      frag.append(t);
    });
    strip.replaceChildren(frag);
    // Keep the selected tab in view when the strip scrolls sideways.
    const on = strip.querySelector<HTMLElement>('.is-active');
    if (on) {
      const left = on.offsetLeft;
      const right = left + on.offsetWidth;
      if (left < strip.scrollLeft) strip.scrollLeft = left;
      else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
    }
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
        `${r.cols} × ${r.rows} cells, needs ${this.phone ? PHONE_MIN_COLS : MIN_VIEW_COLS} × ${this.phone ? PHONE_MIN_ROWS : MIN_VIEW_ROWS}.\n` +
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
        const docked = r.panes.filter((p) => p.dock === dock.id);
        // The whole border cell of each framed pane on one side of the
        // boundary at cell `at` (an `x` line across rows lo..hi, a `y` line
        // across columns lo..hi) grabs too, so the drawn line itself does.
        // Never a pane's top row: that is its move grip.
        const borders = (axis: 'x' | 'y', at: number, lo: number, hi: number, after: boolean, data: Record<string, string>): void => {
          const band = { ...data, border: '' };
          for (const p of docked) {
            if (!p.framed) continue;
            const q = p.rect;
            const [s0, len, c0, clen] = axis === 'x' ? [q.x, q.w, q.y, q.h] : [q.y, q.h, q.x, q.w];
            if ((after ? s0 : s0 + len) !== at) continue;
            const a = Math.max(lo, c0);
            const b = Math.min(hi, c0 + clen);
            if (a >= b) continue;
            const at0 = after ? at : at - 1;
            if (axis === 'x') add({ x: at0 * cell.w, y: a * cell.h, w: cell.w, h: (b - a) * cell.h }, 'x', band);
            else add({ x: a * cell.w, y: at0 * cell.h, w: (b - a) * cell.w, h: cell.h }, 'y', band);
          }
        };
        if (dock.id === 'right') {
          add({ x: (d.x - DOCK_GAP) * cell.w, y: 0, w: DOCK_GAP * cell.w, h: d.h * cell.h }, 'x', { dock: 'right' });
          borders('x', d.x, 0, d.h, true, { dock: 'right' });
        } else if (dock.id === 'left') {
          add({ x: (d.x + d.w) * cell.w, y: 0, w: DOCK_GAP * cell.w, h: d.h * cell.h }, 'x', { dock: 'left' });
          borders('x', d.x + d.w, 0, d.h, false, { dock: 'left' });
        } else if (dock.id === 'top') {
          add({ x: d.x * cell.w, y: (d.y + d.h) * cell.h, w: d.w * cell.w, h: DOCK_GAP * cell.h }, 'y', { dock: 'top' });
          borders('y', d.y + d.h, d.x, d.x + d.w, false, { dock: 'top' });
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
              borders('y', b.rect.y, l.x, l.x + l.w, false, data);
            } else {
              add({ x: b.rect.x * cell.w - wz, y: l.y * cell.h, w: wz, h: l.h * cell.h }, 'x', data);
              borders('x', b.rect.x, l.y, l.y + l.h, false, data);
              borders('x', b.rect.x, l.y, l.y + l.h, true, data);
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
            borders('x', first.x + first.w, first.y, first.y + first.h, false, data);
            borders('x', first.x + first.w, first.y, first.y + first.h, true, data);
          } else if (first.h > 1) {
            add({ x: first.x * cell.w, y: (first.y + first.h) * cell.h - hz, w: first.w * cell.w, h: hz }, 'y', data);
            borders('y', first.y + first.h, first.x, first.x + first.w, false, data);
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
          if (side) {
            add({ x: d.x * cell.w, y: at * cell.h - hz, w: d.w * cell.w, h: hz }, 'y', data);
            borders('y', at, d.x, d.x + d.w, false, data);
          } else {
            add({ x: at * cell.w - wz, y: d.y * cell.h, w: wz, h: d.h * cell.h }, 'x', data);
            borders('x', at, d.y, d.y + d.h, false, data);
            borders('x', at, d.y, d.y + d.h, true, data);
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
    this.swallowClick = false;
    // A soft-grip press that never moved (released outside the cockpit) is forgotten.
    if (this.drag?.kind === 'move' && this.drag.soft && !this.drag.active) this.drag = null;
    // A phone never arranges panes (ADR 0075 §3).
    if (this.phone || this.drag || !this.last || this.last.tooSmall) return;
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
      this.shells.get(id)?.cancelPress();
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
    if (t.closest('.wc-spane-field, .wc-spane-more, .wc-pane-close, .wc-pane-btn, .wc-float-handle')) return false;
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
    if (t.closest('.wc-spane-field, .wc-spane-more, .wc-pane-close, .wc-pane-btn, .wc-float-handle')) return false;
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
    if (this.swallowMouseDown || t === this.el || t === this.handlesEl || t.closest('.wc-pane-close, .wc-pane-btn')) {
      e.preventDefault();
    }
    this.swallowMouseDown = false;
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (this.drag) return;
    const t = e.target as HTMLElement;
    // The output and input handle their own; a script pane's text field keeps its focus,
    // also one a link just focused (links fire on pointerup, before this mouseup).
    // The windows (ADR 0103) set their own focus on the press: a mouseup that
    // reaches here from inside one (an editor's CodeMirror, `data-wc-native-mouse`)
    // must not hand the keys back to the game.
    // A pane's own field (`data-wc-own-keys`: the Comm reply and search) keeps the keys too.
    if (t.closest('.wc-output, .wc-input-slot, .wc-spane-field, .wc-windows-host, [data-wc-own-keys]')) return;
    if ((this.el.ownerDocument.activeElement as HTMLElement | null)?.closest?.('.wc-spane-field, [data-wc-own-keys]')) return;
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
          this.shells.get(d.id)?.cancelPress();
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
    this.el.removeAttribute('data-shield');
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
    // An attribute, not `:has(> .wc-drag-shield…)` in layout.css: Chromium paid ≈ 1.7 ms of style
    // work per output flush for a `:not(:has())` guard on the hover rules (stage 40d).
    this.el.setAttribute('data-shield', '');
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
        const res = allocate({ layout: moved, panes: s.panes, present: this.present, cols: r.cols, rows: r.rows, barCells: this.inputBar });
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
    // one lane at its default size. The zones follow the docks' extent
    // (ADR 0101, ADR 0102): the left one down to the input row's bottom
    // (where the gap row above the bottom dock starts), the right one there
    // too, or down to the input row's top when the input row runs under the
    // right dock (for a hidden right dock: when it would at its default
    // size), the top one over the game column, the bottom one along the
    // whole bottom edge below those.
    const E = EDGE_CELLS;
    if (!isTemp && cy >= 0 && cy < H) {
      const inGameCol = cx >= r.game.x && cx < r.game.x + r.game.w;
      const leftEnd = r.input.y + r.input.h;
      const underRight = r.docks.right
        ? r.inputSpan === 'screen'
        : !inputFitsGameColumn(r.game.w - defaultDockSize('right') - DOCK_GAP, this.inputBar);
      const rightEnd = underRight ? r.input.y : leftEnd;
      const zone: DockId | null =
        cx < E && cy < leftEnd ? 'left'
        : cx >= r.cols - E && cy < rightEnd ? 'right'
        : cy < TOP_EDGE_ROWS && inGameCol ? 'top'
        : cy >= H - E ? 'bottom'
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
        // Each bar along the extent the dock opens with (ADR 0101).
        const bar: Record<DockId, Rect> = {
          left: { x: 0, y: 0, w: 2 * T, h: leftEnd * cell.h },
          right: { x: W - 2 * T, y: 0, w: 2 * T, h: rightEnd * cell.h },
          top: { x: g.x * cell.w, y: 0, w: g.w * cell.w, h: 2 * T },
          bottom: { x: 0, y: H * cell.h - 2 * T, w: W, h: 2 * T },
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

/**
 * Phone game layout: rows of the strip the phone layer's hood (above the
 * pane) and its resize band with the page dots (below it, one row as
 * Comm's band) take.
 */
export const PHONE_STRIP_HOOD_ROWS = 1;
export const PHONE_STRIP_FOOT_ROWS = 1;
/**
 * What the hood really takes, px (phone.css): at a small text size one row
 * is lower than that, and the pane then leaves it two rows, so it never
 * lies over the pane's first line.
 */
export const PHONE_STRIP_CHROME_PX = 16;
/** The rows the strip's hood takes at a cell `cellH` px high. */
export function phoneStripChromeRows(cellH: number): number {
  return cellH > 0 ? Math.max(PHONE_STRIP_HOOD_ROWS, Math.ceil(PHONE_STRIP_CHROME_PX / cellH - 1e-6)) : PHONE_STRIP_HOOD_ROWS;
}
/** Phone game layout: the row under Comm that is the phone layer's resize band. */
export const PHONE_COMM_BAND_ROWS = 1;
/**
 * Phone game layout, landscape: the iron divider between the strip and Comm
 * in the left column, px (phone.css). Comm's hood hangs from it.
 */
export const PHONE_SIDE_DIVIDER_PX = 6;
/**
 * Portrait: what Comm's content keeps under its hood, px, or the hood is left out. Measured: the
 * rail's head, one line of chat and the reply line whole need about 100 px (phone.css, comm.css).
 */
export const PHONE_COMM_HOOD_KEEP_PX = 104;
/** The rows of Comm the phone layer's hood takes: the hood, and in landscape the divider above it when the strip is open too. */
export function phoneCommHeadRows(cellH: number, divided: boolean): number {
  const px = PHONE_STRIP_CHROME_PX + (divided ? PHONE_SIDE_DIVIDER_PX : 0);
  return cellH > 0 ? Math.max(1, Math.ceil(px / cellH - 1e-6)) : 1;
}
/** Phone game layout, landscape: the least width in px of the left column's resize band (a row's height in portrait). */
export const PHONE_SIDE_BAND_PX = 14;
/** The columns the left column's band takes at a cell `cellW` px wide. */
export function phoneSideBandCols(cellW: number): number {
  return cellW > 0 ? Math.max(1, Math.ceil(PHONE_SIDE_BAND_PX / cellW - 1e-6)) : 1;
}
/** Phone game layout: what the lens keeps clear above the command row while a keyboard of our own is open, px (its corner keys' overhang). */
const PHONE_OWN_KBD_LENS_PX = 12;

/** Phone game layout: the limit of `setPhoneLimit` as a function of the own keyboard's lift and the cockpit's height, px. */
export type PhoneLimit = (lift: number, height: number) => number | null;

/** `r` without `top` rows at its top and `bottom` rows at its bottom (at least one row stays). */
function inset(r: Rect, top: number, bottom: number, right = 0): Rect {
  const h = Math.max(1, r.h - top - bottom);
  return { x: r.x, y: r.y + Math.min(top, r.h - h), w: Math.max(1, r.w - right), h };
}

/** A layout with nothing in it (the phone game layout fills in its own parts). */
const EMPTY_LAYOUT: LayoutResult = {
  cols: 0,
  rows: 0,
  tooSmall: false,
  game: { x: 0, y: 0, w: 0, h: 0 },
  input: { x: 0, y: 0, w: 0, h: 0 },
  inputSpan: 'game',
  docks: {},
  collapsed: [],
  panes: [],
  hidden: [],
};

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
