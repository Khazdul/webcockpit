// Layout data types (ADR 0010 "Docking"). Types and the default model
// only: allocation lives in src/layout/allocate.ts, model operations in
// src/layout/model.ts (ADR 0012). The settings store persists a
// `LayoutModel` as plain data and repairs a damaged one on load
// (src/settings/migrate.ts).

/** The framed side panes, in Cockpit's order (Inv §2.1), then the map (ADR 0020). */
export type BuiltinPaneId = 'character' | 'timers' | 'group' | 'comm' | 'ui' | 'map';

/**
 * A script pane (ADR 0053): `<script>/<pane id>`. Script names never
 * contain `/`, so the id cannot clash with a built-in one.
 */
export type ScriptPaneId = `${string}/${string}`;

/** Any pane: a built-in one or a script pane. */
export type PaneId = BuiltinPaneId | ScriptPaneId;

/** Every built-in pane id in Cockpit's default stack order, then the map. */
export const PANE_IDS: readonly BuiltinPaneId[] = ['character', 'timers', 'group', 'comm', 'ui', 'map'];

/** The built-in panes of the default right dock (the map floats by default). */
export const DOCKED_BY_DEFAULT: readonly BuiltinPaneId[] = ['character', 'timers', 'group', 'comm', 'ui'];

/** A script pane's own id (after the `/`): letters, digits, `_` and `-`, at most 32. */
export const SCRIPT_PANE_NAME = /^[A-Za-z0-9_-]{1,32}$/;
/** A whole script pane id: a script name (header.ts rules), `/`, a pane name. */
const SCRIPT_PANE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}\/[A-Za-z0-9_-]{1,32}$/;

/**
 * A temporary script pane's id (ADR 0053, feedback round 1):
 * `<script>/~<pane id>`. The `~` keeps it apart from an ordinary pane of
 * the same name, and `isScriptPaneId` is false for it, so the settings,
 * their migration, Options and the viewer's gear never take it.
 */
const TEMP_PANE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}\/~[A-Za-z0-9_-]{1,32}$/;

/** True for a temporary script pane's id (`<script>/~<pane id>`). */
export function isTempPaneId(id: unknown): id is ScriptPaneId {
  return typeof id === 'string' && TEMP_PANE_ID.test(id);
}

/** The id of a script's temporary pane `pane`. */
export function tempPaneId(script: string, pane: string): ScriptPaneId {
  return `${script}/~${pane}`;
}

/** True for a built-in pane id. */
export function isBuiltinPaneId(id: unknown): id is BuiltinPaneId {
  return typeof id === 'string' && (PANE_IDS as readonly string[]).includes(id);
}

/** True for a well-formed (ordinary, not temporary) script pane id (`<script>/<pane>`). */
export function isScriptPaneId(id: unknown): id is ScriptPaneId {
  return typeof id === 'string' && SCRIPT_PANE_ID.test(id);
}

/** True for any valid pane id. */
export function isPaneId(id: unknown): id is PaneId {
  return isBuiltinPaneId(id) || isScriptPaneId(id);
}

/** The id of `script`'s pane `pane`. */
export function scriptPaneId(script: string, pane: string): ScriptPaneId {
  return `${script}/${pane}`;
}

/** The script that owns a script pane. */
export function paneScript(id: ScriptPaneId): string {
  return id.slice(0, id.indexOf('/'));
}

/** Frame labels (Inv §2.1 "Pane frame"). */
export const PANE_LABELS: Readonly<Record<BuiltinPaneId, string>> = {
  character: 'Character',
  timers: 'Timers',
  group: 'Group',
  comm: 'Comm',
  ui: 'UI',
  map: 'Map',
};

/** Short names of the built-in panes (the pane bar's buttons, ADR 0065). */
export const PANE_SHORT: Readonly<Record<BuiltinPaneId, string>> = {
  character: 'CHAR',
  timers: 'TIME',
  group: 'GRP',
  comm: 'COMM',
  ui: 'UI',
  map: 'MAP',
};

/**
 * Pane tint names (Inv §10.4). `black` is stored but shown as "Plain": the
 * pane has no fill of its own and sits on the terminal background.
 */
export type PaneColor = 'black' | 'red' | 'green' | 'blue' | 'grey' | 'orange' | 'purple';

/** Every tint, in the column order of the Options → Panes grid. */
export const PANE_COLORS: readonly PaneColor[] = [
  'black', 'red', 'green', 'blue', 'grey', 'orange', 'purple',
];

/** The four docks around the game pane. */
export type DockId = 'left' | 'right' | 'top' | 'bottom';

export const DOCK_IDS: readonly DockId[] = ['left', 'right', 'top', 'bottom'];

/** One pane's place in a dock. */
export interface DockPane {
  id: PaneId;
  /**
   * Wanted content size in cells: rows in a left/right dock, columns in
   * the top/bottom dock. Allocation may give less (or more, to the
   * highest-priority pane); drag end stores the new value here.
   */
  desired: number;
}

/**
 * One lane of a dock (ADR 0064): a column of a left/right dock (`size` is
 * its width, panes stacked top to bottom) or a row of the top/bottom dock
 * (`size` is its height, panes left to right).
 */
export interface DockLane {
  /** Width in cells (left/right) or height in cells (top/bottom). */
  size: number;
  /** Panes in stack order (top→bottom, or left→right for the top/bottom dock). Never empty. */
  panes: DockPane[];
}

/**
 * One dock (ADR 0064, ADR 0067): its lanes from the screen edge inward
 * (lane 0 touches the screen edge), and the spanning panes before and
 * after the lanes. No lane is empty; a dock without panes has
 * `lanes: []`.
 *
 * A spanning pane covers the whole dock across all its lanes: `head`
 * panes are stacked above the lanes in a left/right dock (left of them in
 * the top/bottom dock), `tail` panes below (right of) them, in stack
 * order. `desired` keeps its meaning along the lane axis. Invariant: the
 * spans are empty unless the dock has at least two lanes (a dock that
 * goes down to one lane folds them into it, `normalizeDock`).
 */
export interface DockState {
  lanes: DockLane[];
  head: DockPane[];
  tail: DockPane[];
}

/** A place in a dock (ADR 0067): a lane index, or the spans before (`head`) or after (`tail`) the lanes. */
export type LaneRef = number | 'head' | 'tail';

/** The pane list of `d` that `lane` names, or undefined for a lane index out of range. */
export function laneList(d: Readonly<DockState>, lane: LaneRef): DockPane[] | undefined {
  return lane === 'head' ? d.head : lane === 'tail' ? d.tail : d.lanes[lane]?.panes;
}

/** Every pane of a dock in stack order: the head spans, lane by lane, the tail spans. */
export function dockPanes(d: Readonly<DockState>): DockPane[] {
  return [...d.head, ...d.lanes.flatMap((l) => l.panes), ...d.tail];
}

/**
 * Restores the dock invariants of `d` (mutates): empty lanes removed
 * (ADR 0064), and with fewer than two lanes the spans fold into lane 0,
 * the head at its front and the tail at its end (ADR 0067); lane 0 is
 * made at `dock`'s default size when only spans are left.
 */
export function normalizeDock(d: DockState, dock: DockId): void {
  d.lanes = d.lanes.filter((l) => l.panes.length > 0);
  if (d.lanes.length >= 2 || (d.head.length === 0 && d.tail.length === 0)) return;
  if (d.lanes.length === 0) d.lanes.push({ size: defaultDockSize(dock), panes: [] });
  const lane = d.lanes[0]!;
  lane.panes = [...d.head, ...lane.panes, ...d.tail];
  d.head = [];
  d.tail = [];
}

/**
 * Appends `pane` to lane 0 of `dock` in `docks` (mutates), creating the
 * lane at the dock's default size when the dock is empty (ADR 0064:
 * migration of missing built-ins, script-pane placement).
 */
export function appendToDock(docks: LayoutModel['docks'], dock: DockId, pane: DockPane): void {
  const lanes = docks[dock].lanes;
  if (lanes.length === 0) lanes.push({ size: defaultDockSize(dock), panes: [] });
  lanes[0]!.panes.push(pane);
}

/**
 * A floating pane (ADR 0014): its outer rectangle in cells (frame
 * included), relative to the cockpit's top-left cell. Allocation clamps
 * what is shown into the window; the stored rectangle is kept.
 */
export interface FloatPane {
  id: PaneId;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Placement not chosen yet (ADR 0020): the pane shows at its default
   * spot for the current window (`allocate`, AUTO_FLOAT) and x/y/w/h are
   * ignored. Moving or resizing it stores a real rectangle and drops this.
   */
  auto?: boolean;
  /**
   * With `auto` (ADR 0078): the pane shows right under this floating pane,
   * as wide as it and left-aligned with it, `h` rows high; when that pane
   * is not a shown float, at the game pane's top-right corner as any other
   * script float. Moving or resizing the pane drops this with `auto`.
   */
  below?: PaneId;
}

/**
 * The whole pane layout. Every built-in `PaneId` appears exactly once,
 * either in one dock or in `floating` (whether it is on or off: on/off is
 * `Settings.panes[id].on`), so a pane that is switched back on returns to
 * where it was. A script pane (ADR 0053) appears at most once, from its
 * first creation on; it keeps its place while its script is not running
 * and is shown only while the script runs and has created it.
 */
export interface LayoutModel {
  docks: Record<DockId, DockState>;
  /** Floating panes, bottom to top (the last one is in front). */
  floating: FloatPane[];
}

/** Default desired content rows per pane (Cockpit's default heights). */
export const DEFAULT_PANE_DESIRED: Readonly<Record<BuiltinPaneId, number>> = {
  character: 9,
  timers: 8,
  group: 6,
  comm: 10,
  ui: 5,
  map: 20,
};

/** Desired content rows of a script pane that enters a side dock without a size of its own. */
export const SCRIPT_PANE_DESIRED = 8;

/** Default desired content rows of `id` in a side dock. */
export function defaultPaneRows(id: PaneId): number {
  return isBuiltinPaneId(id) ? DEFAULT_PANE_DESIRED[id] : SCRIPT_PANE_DESIRED;
}

/** Default width of the right (and left) dock in cells. */
export const DEFAULT_SIDE_DOCK_SIZE = 33;
/** Default height of the bottom dock in cells. */
export const DEFAULT_BOTTOM_DOCK_SIZE = 10;
/** Default height of the top dock in cells. */
export const DEFAULT_TOP_DOCK_SIZE = 10;

/** The size a dock (its first lane) opens at, and the default size of a new lane (ADR 0064). */
export function defaultDockSize(dock: DockId): number {
  if (dock === 'top') return DEFAULT_TOP_DOCK_SIZE;
  if (dock === 'bottom') return DEFAULT_BOTTOM_DOCK_SIZE;
  return DEFAULT_SIDE_DOCK_SIZE;
}

/**
 * Desired rows of the default right dock's panes after Character (ADR 0023).
 * Larger than any window, so the dock always runs in `scaled` mode:
 * Character keeps its 9 rows and the others split the rest about evenly.
 * The first drag of a boundary freezes real sizes. Kept for tests and
 * layouts that want an even split; the default layout uses `DEFAULT_SHARE`
 * since ADR 0078.
 */
export const EVEN_SHARE_DESIRED = 200;

/**
 * Desired rows of the default right dock's shared panes (ADR 0078). Like
 * `EVEN_SHARE_DESIRED` they are larger than any window, so the dock always
 * runs in `scaled` mode: Character (head) and the pane bar are reserved,
 * and the rest is split in proportion to `desired − min`: the two lanes
 * (Group and Timers, side by side) 8 parts, Comm 21, UI 3. In a 51-row
 * window that is Character 9, the lanes 9, Comm 22 and UI 4 content rows.
 */
export const DEFAULT_SHARE = {
  /** Each lane's pane: the region's `desired − min` is `lanes + frame − (1 + frame)` = 80. */
  lanes: 81,
  comm: 211,
  ui: 31,
} as const;

/** Width of each of the default right dock's two lanes (ADR 0078): 40 cells in all. */
export const DEFAULT_LANE_SIZE = 20;

/** The pane bar's id (bundled `panebar`, ADR 0065), placed by the default layout (ADR 0078). */
export const PANEBAR_PANE: ScriptPaneId = 'panebar/bar';
/** The Map search pane's id (bundled `mapsearch`, ADR 0077), placed by the default layout (ADR 0078). */
export const MAPSEARCH_PANE: ScriptPaneId = 'mapsearch/main';
/** Outer height of the Map search pane's default float under the map (ADR 0078). */
export const MAPSEARCH_FLOAT_H = 15;

/**
 * A fresh copy of the default layout (ADR 0010, ADR 0023, ADR 0078). The
 * right dock: Character spanning the top, then two lanes side by side
 * (Group at the screen edge, Timers inside), then Comm, UI and the pane
 * bar spanning the bottom. The map floats at the game pane's top-right
 * corner and the Map search pane right under it (both `auto`). The two
 * script panes take these places once their scripts create them.
 */
export function defaultLayout(): LayoutModel {
  return {
    docks: {
      left: { lanes: [], head: [], tail: [] },
      right: {
        // Key order as `migrateLayout` writes it, so the default is stable under migration.
        lanes: [
          { size: DEFAULT_LANE_SIZE, panes: [{ id: 'group', desired: DEFAULT_SHARE.lanes }] },
          { size: DEFAULT_LANE_SIZE, panes: [{ id: 'timers', desired: DEFAULT_SHARE.lanes }] },
        ],
        head: [{ id: 'character', desired: DEFAULT_PANE_DESIRED.character }],
        tail: [
          { id: 'comm', desired: DEFAULT_SHARE.comm },
          { id: 'ui', desired: DEFAULT_SHARE.ui },
          { id: PANEBAR_PANE, desired: 1 },
        ],
      },
      top: { lanes: [], head: [], tail: [] },
      bottom: { lanes: [], head: [], tail: [] },
    },
    floating: [defaultMapFloat(), defaultMapSearchFloat()],
  };
}

/** The Map search pane's default float: under the map, as wide as it (ADR 0078). */
export function defaultMapSearchFloat(): FloatPane {
  return { id: MAPSEARCH_PANE, x: 0, y: 0, w: 36, h: MAPSEARCH_FLOAT_H, auto: true, below: 'map' };
}

/** The map's first floating entry: placed by `allocate` until the user moves it (ADR 0020). */
export function defaultMapFloat(): FloatPane {
  return { id: 'map', x: 0, y: 0, w: 60, h: 20, auto: true };
}
