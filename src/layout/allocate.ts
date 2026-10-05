// Layout allocation (ADR 0010 "Docking", ADR 0012, Inv §2.1 "Heights").
//
// A pure function from the layout model, the pane toggles and the viewport
// (in cells) to rectangles in cells. No DOM: src/layout/cockpit.ts turns
// the result into pixels once per frame.
//
// Screen (C × R cells):
//
//   +------+--+----------------------+--+---------+
//   | left |  |   top dock           |  |  right  |
//   | dock |g +----------------------+g |  dock   |
//   |      |a |      (gap row)       |a |         |
//   |      |p |        game          |p |         |
//   |      |  +----------------------+  |         |
//   |      |  | input line     clock |  |         |
//   |      |  +----------------------+  |         |
//   |      |  |      (gap row)       |  |         |
//   |      |  |   bottom dock        |  |         |
//   +------+--+----------------------+--+---------+
//
// - The centre column is, top to bottom: top dock, game pane, input line
//   (1 row, as wide as the game pane, clock strip at its right end),
//   bottom dock. The side docks run the full window height, beside the
//   input line and the bottom dock too (ADR 0012, ADR 0014 amendment).
// - One gap cell separates the game column from each shown side dock, and
//   one gap row separates the top dock from the game pane and the input
//   line from the bottom dock. The input line sits directly under the game
//   pane. Panes inside a dock touch (their frames separate them, as in
//   Cockpit).
// - Each dock is a list of lanes (ADR 0064), from the screen edge inward:
//   columns of a side dock, rows of the top/bottom dock. A side dock with
//   two lanes (lane 0 at the screen edge):
//
//     +----------------+--+--------+--------+
//     |      game      |g | lane 1 | lane 0 |
//     |                |a | (inner)| (outer)|
//
//   Lanes in a dock touch (no gap). A lane takes part only if one of its
//   panes is shown; a side dock is as wide as the sum of its shown lanes
//   (each at least SIDE_DOCK_MIN), the top/bottom dock as high as the sum
//   of its lanes (each at least its minimum: the dock minimum when it
//   holds a built-in pane, else its script panes' minimum rows plus frame,
//   so a borderless script pane can be a 1-row lane; ADR 0065).
// - Along a lane (as along a whole dock before lanes), panes get their `desired` content size if everything
//   fits, the leftover going to the highest-priority pane; otherwise
//   Character is reserved first and the rest scale between minimum and
//   desired; if even the minimums do not fit, panes are dropped in order
//   (`allocateAxis`). A framed pane adds two cells on each axis.
// - Spanning panes (ADR 0067): a dock with two or more lanes can hold
//   panes that span all its lanes, stacked before (`head`) and after
//   (`tail`) the lanes block, which is then the dock's *region*. In a
//   side dock the spans sit above and below the columns at the dock's
//   full width; in the top/bottom dock left and right of the rows at its
//   full height:
//
//     +-----------------+        +------+-----------------+------+
//     |   head span     |        | head |     lane 1      | tail |
//     +--------+--------+        | span +-----------------+ span |
//     | lane 1 | lane 0 |        |      |     lane 0      |      |
//     +--------+--------+        +------+-----------------+------+
//     |   tail span     |
//     +-----------------+
//
//   Along the dock the spans and the region are split with `allocateAxis`
//   as one stack; the region is a pseudo item whose minimum and desired
//   size are the largest of its lanes' sums, and each lane is then split
//   along the region's length. Without a shown spanning pane a dock is
//   laid out exactly as before.
// - Narrow collapse: a side dock (all its lanes) is hidden when the game
//   pane would get fewer than GAME_MIN_COLS columns. The model is
//   untouched, so the dock comes back as soon as the window is wide enough
//   again. A top/bottom dock that must shrink takes rows from its inner
//   lanes first, each down to its minimum, and collapses when its lanes
//   cannot all get their minimum.
// - Floating panes (ADR 0014) lie over everything else (the game pane, the
//   input line and the docks) and do not change the docked allocation.
//   Each is clamped into the window (shrunk if the window is smaller than
//   it) on every layout; the model keeps the stored rectangle.
// - Below MIN_VIEW_COLS × MIN_VIEW_ROWS the result is `tooSmall`.
// - Script panes (ADR 0053) take part only while they are `present` (their
//   script runs and has created them); otherwise they take no space and
//   are not `hidden` either. Among the panes of a dock they get the
//   leftover last and are dropped right after the map.

import {
  type BuiltinPaneId,
  DEFAULT_SIDE_DOCK_SIZE,
  type DockId,
  type LaneRef,
  type LayoutModel,
  type PaneId,
  defaultPaneRows,
  dockPanes,
  isBuiltinPaneId,
} from './types';

/** Smallest game pane (Inv §2.1 MAIN_MIN; ADR 0010). */
export const GAME_MIN_COLS = 30;
export const GAME_MIN_ROWS = 5;
/** Below this the "Window too small" screen replaces the view (Inv §2.1). */
export const MIN_VIEW_COLS = 60;
export const MIN_VIEW_ROWS = 18;
/** Cells a frame adds on each axis (top+bottom rows or left+right columns). */
export const FRAME_CELLS = 2;
/** Gap between the game column and a side dock, the top dock and the game pane, or the input line and the bottom dock. */
export const DOCK_GAP = 1;
/** Narrowest side dock and lowest top/bottom dock (cells, frame included). */
export const SIDE_DOCK_MIN = 10;
export const BOTTOM_DOCK_MIN = 3;
export const TOP_DOCK_MIN = 3;

/** Smallest lane of `dock` for the built-in panes (ADR 0064): SIDE_DOCK_MIN, TOP_DOCK_MIN or BOTTOM_DOCK_MIN. */
export function laneMin(dock: DockId): number {
  return dock === 'top' ? TOP_DOCK_MIN : dock === 'bottom' ? BOTTOM_DOCK_MIN : SIDE_DOCK_MIN;
}
/** Rows of the input line. */
export const INPUT_ROWS = 1;

/** Minimum content rows in a side dock (Inv §2.1 "Heights"). */
export const MIN_ROWS: Readonly<Record<BuiltinPaneId, number>> = {
  character: 3,
  timers: 1,
  group: 1,
  comm: 1,
  ui: 1,
  map: 3,
};
/** Minimum content rows of a script pane in a side dock (ADR 0053). */
export const SCRIPT_MIN_ROWS = 1;

/** Minimum content rows of `id` in a side dock. */
export function minRows(id: PaneId): number {
  return isBuiltinPaneId(id) ? MIN_ROWS[id] : SCRIPT_MIN_ROWS;
}

/** Minimum content columns in the top/bottom dock (ADR 0012). */
export const MIN_COLS = 8;
/** Desired content columns of a pane that enters the top/bottom dock (ADR 0012). */
export const DEFAULT_BOTTOM_DESIRED = 30;

/** Who gets the leftover cells first (Inv §2.1); script panes after these, in stack order. */
export const LEFTOVER_PRIORITY: readonly BuiltinPaneId[] = ['map', 'ui', 'character', 'comm', 'timers', 'group'];
/**
 * Who is dropped first when even the minimums do not fit (Inv §2.1; the map
 * first, ADR 0020). Script panes go right after the map, the last in the
 * stack first (ADR 0053).
 */
export const DROP_ORDER: readonly BuiltinPaneId[] = ['map', 'group', 'timers', 'comm', 'character', 'ui'];

/**
 * The ids of `live` by leftover priority: the built-in order, then script
 * panes in stack order. An item with `rankAs` (a dock's region, ADR 0067)
 * ranks as that pane.
 */
function leftoverOrder(live: readonly { id: PaneId; rankAs?: PaneId }[]): PaneId[] {
  const n = LEFTOVER_PRIORITY.length;
  const rank = (i: { id: PaneId; rankAs?: PaneId }, k: number): number => {
    const r = i.rankAs ?? i.id;
    return isBuiltinPaneId(r) ? LEFTOVER_PRIORITY.indexOf(r) : n + k;
  };
  return live
    .map((i, k) => ({ id: i.id, r: rank(i, k) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.id);
}

/** The next pane of `live` to drop (DROP_ORDER); a region item is never one. */
function dropVictim(live: readonly { id: PaneId; region?: boolean }[]): PaneId {
  const panes = live.filter((i) => !i.region);
  if (panes.some((i) => i.id === 'map')) return 'map';
  for (let k = panes.length - 1; k >= 0; k--) if (!isBuiltinPaneId(panes[k]!.id)) return panes[k]!.id;
  return DROP_ORDER.find((id) => panes.some((i) => i.id === id))!;
}

/** True for the docks that stack panes vertically (left, right). */
export const isSideDock = (d: DockId): boolean => d === 'left' || d === 'right';

/**
 * The smallest size across `dock` (lane width or height, frame included)
 * that pane `id` needs (ADR 0065): SIDE_DOCK_MIN in a side dock; in the
 * top/bottom dock the dock minimum for a built-in pane, and a script
 * pane's minimum rows plus its frame (1 row without a border).
 */
export function paneCrossMin(id: PaneId, dock: DockId, framed: boolean): number {
  if (isSideDock(dock)) return SIDE_DOCK_MIN;
  if (isBuiltinPaneId(id)) return laneMin(dock);
  return SCRIPT_MIN_ROWS + (framed ? FRAME_CELLS : 0);
}

/** Minimum content size of `id` along the axis of `dock`. */
export function minContent(id: PaneId, dock: DockId): number {
  return isSideDock(dock) ? minRows(id) : MIN_COLS;
}

/** Smallest floating pane (outer cells): the frame plus the pane's minimum content. */
export function floatMin(id: PaneId, framed: boolean): { w: number; h: number } {
  const f = framed ? FRAME_CELLS : 0;
  return { w: MIN_COLS + f, h: minRows(id) + f };
}

/**
 * Outer size (frame included) a docked pane gets when it is dragged out to
 * float (ADR 0014 amendment); clamped to the window. A floating pane that
 * is moved keeps its size.
 */
export const FLOAT_STANDARD_W = 36;
export const FLOAT_STANDARD_H = 14;

/** Size of a pane that starts floating without a shown rectangle to copy (settings migration). */
export function defaultFloatSize(id: PaneId): { w: number; h: number } {
  return { w: DEFAULT_SIDE_DOCK_SIZE, h: defaultPaneRows(id) + FRAME_CELLS };
}

/**
 * Default spot of a floating pane whose placement is not chosen yet
 * (`FloatPane.auto`, ADR 0020): the top-right corner of the game pane,
 * `w` × `h` of the window (the owner's MMapper position; size ADR 0023,
 * width 25 % → 21 % in ADR 0078).
 */
export const AUTO_FLOAT = { w: 0.21, h: 0.27 } as const;

/** The rectangle of an `auto` floating pane over `game` in a `cols` × `rows` window (before clamping). */
export function autoFloatRect(game: Rect, cols: number, rows: number): Rect {
  const w = Math.round(cols * AUTO_FLOAT.w);
  const h = Math.round(rows * AUTO_FLOAT.h);
  return { x: game.x + game.w - w, y: game.y, w, h };
}

/**
 * The rectangle of a script pane's `auto` float (ADR 0053): its stored
 * size, at the top-right corner of the game pane, or just left of the
 * map's auto rectangle (`beside`) when that is shown, so the two do not
 * cover each other.
 */
export function scriptAutoFloatRect(game: Rect, size: { w: number; h: number }, beside: Rect | null): Rect {
  const right = beside ? beside.x : game.x + game.w;
  return { x: Math.max(game.x, right - size.w), y: game.y, w: size.w, h: size.h };
}

/**
 * The rectangle of an `auto` float placed under the float `above` (ADR
 * 0078, `FloatPane.below`): as wide as it, left-aligned, its top frame
 * touching `above`'s bottom frame, `h` rows high.
 */
export function floatBelow(above: Rect, h: number): Rect {
  return { x: above.x, y: above.y + above.h, w: above.w, h };
}

/**
 * The rectangle a floating pane shows at in a `cols` × `rows` area: at
 * least `min`, at most the area, moved inside it.
 */
export function clampFloat(r: Rect, min: { w: number; h: number }, cols: number, rows: number): Rect {
  const w = Math.max(1, Math.min(cols, Math.max(min.w, Math.round(r.w))));
  const h = Math.max(1, Math.min(rows, Math.max(min.h, Math.round(r.h))));
  const x = Math.max(0, Math.min(cols - w, Math.round(r.x)));
  const y = Math.max(0, Math.min(rows - h, Math.round(r.y)));
  return { x, y, w, h };
}

// ------------------------------------------------------------------ axis

export interface AxisItem {
  id: PaneId;
  /** Wanted content cells. */
  desired: number;
  /** Minimum content cells. */
  min: number;
  /** Cells the frame adds (0 or FRAME_CELLS). */
  frame: number;
  /** A dock's region (ADR 0067): never reserved, never dropped. */
  region?: boolean;
  /** Ranks for the leftover as this pane (a region: its highest-priority member). */
  rankAs?: PaneId;
}

export interface AxisResult {
  /** Content cells per surviving pane, in input order. */
  sizes: { id: PaneId; size: number }[];
  /** Panes that did not fit even at their minimum (DROP_ORDER). */
  dropped: PaneId[];
  /**
   * `fit`: every pane got at least its desired size. `scaled`: some got
   * less. `empty`: no pane survived.
   */
  mode: 'fit' | 'scaled' | 'empty';
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * Splits `length` cells among `items` (Inv §2.1 "Heights"). The sizes plus
 * frames fill `length` exactly unless nothing survives.
 */
export function allocateAxis(items: readonly AxisItem[], length: number): AxisResult {
  const norm = items.map((it) => ({ ...it, desired: Math.max(it.min, Math.round(it.desired)) }));
  let live = norm;
  const dropped: PaneId[] = [];
  while (live.length > 0 && sum(live.map((i) => i.min + i.frame)) > length) {
    const victim = dropVictim(live);
    dropped.push(victim);
    live = live.filter((i) => i.id !== victim);
  }
  if (live.length === 0) return { sizes: [], dropped, mode: 'empty' };

  const size = new Map<PaneId, number>();
  const frames = sum(live.map((i) => i.frame));
  const wanted = sum(live.map((i) => i.desired)) + frames;
  const byPriority = leftoverOrder(live);

  if (wanted <= length) {
    for (const i of live) size.set(i.id, i.desired);
    const top = byPriority[0]!;
    size.set(top, size.get(top)! + (length - wanted));
    return { sizes: live.map((i) => ({ id: i.id, size: size.get(i.id)! })), dropped, mode: 'fit' };
  }

  // Character reserved first (ADR 0137 in Cockpit), if that leaves the
  // others their minimums; the rest scale between minimum and desired.
  // Script panes ask for a definite size (createPane rows/cols) and are
  // reserved the same way after Character, in stack order (ADR 0053 P2):
  // scaled against the built-ins' even share (EVEN_SHARE_DESIRED) they
  // would get a row or two.
  let scaled = live;
  let avail = length - frames;
  const reserve = [
    ...live.filter((i) => i.id === 'character'),
    ...live.filter((i) => !isBuiltinPaneId(i.id) && !i.region),
  ];
  for (const r of reserve) {
    if (scaled.length < 2) break;
    const othersMin = sum(scaled.filter((i) => i !== r).map((i) => i.min));
    if (r.desired + othersMin <= avail) {
      size.set(r.id, r.desired);
      scaled = scaled.filter((i) => i !== r);
      avail -= r.desired;
    }
  }
  const mins = sum(scaled.map((i) => i.min));
  const span = sum(scaled.map((i) => i.desired - i.min));
  const extra = avail - mins; // 0 ≤ extra < span here
  let given = 0;
  for (const i of scaled) {
    const e = span > 0 ? Math.floor(((i.desired - i.min) * extra) / span) : 0;
    size.set(i.id, i.min + e);
    given += e;
  }
  // Rounding remainder: one cell each, by priority, never past desired.
  let rest = extra - given;
  while (rest > 0) {
    let moved = false;
    for (const id of byPriority) {
      const it = scaled.find((i) => i.id === id);
      if (!it || rest === 0) continue;
      if (size.get(id)! < it.desired) {
        size.set(id, size.get(id)! + 1);
        rest--;
        moved = true;
      }
    }
    if (!moved) {
      const top = byPriority[0]!;
      size.set(top, size.get(top)! + rest);
      rest = 0;
    }
  }
  return { sizes: live.map((i) => ({ id: i.id, size: size.get(i.id)! })), dropped, mode: 'scaled' };
}

// ---------------------------------------------------------------- screen

/** A rectangle in cells. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaneToggle {
  on: boolean;
  border: boolean;
}

export interface AllocateInput {
  layout: LayoutModel;
  /** Toggles by pane id; a script pane without an entry is on and framed. */
  panes: Readonly<Partial<Record<PaneId, PaneToggle>>>;
  /**
   * Script panes whose script runs and has created them (ADR 0053). Other
   * script panes in the layout take no space. Absent: none.
   */
  present?: ReadonlySet<PaneId>;
  /** Viewport in whole cells. */
  cols: number;
  rows: number;
}

export interface PaneBox {
  id: PaneId;
  /** The dock, or `float` for a floating pane. */
  dock: DockId | 'float';
  /**
   * Index of the lane in the dock's model `lanes`, or the span (`head`,
   * `tail`, ADR 0067) that holds the pane (0 for a floating pane).
   */
  lane: LaneRef;
  /** Index of the pane in its model list (lane, span or `floating`: its z-order). */
  index: number;
  /** Outer rectangle (frame included). */
  rect: Rect;
  /** Content rectangle (the rect minus the frame). */
  content: Rect;
  framed: boolean;
}

/** A shown lane of a dock (ADR 0064). */
export interface LaneBox {
  /** Index of the lane in the dock's model `lanes`. */
  index: number;
  rect: Rect;
  /** Shown panes in order. */
  panes: PaneId[];
  /** `fit` or `scaled` (see AxisResult). */
  mode: 'fit' | 'scaled';
  /** Its smallest size across the dock: the largest `paneCrossMin` of its shown panes (ADR 0065). */
  min: number;
}

/** A shown stack of spanning panes (ADR 0067): before (`head`) or after (`tail`) the lanes. */
export interface SpanBox {
  side: 'head' | 'tail';
  /** The whole stack, across the dock's full width (side dock) or height (top/bottom). */
  rect: Rect;
  /** Shown panes in order. */
  panes: PaneId[];
  /** `fit` or `scaled`: the split along the dock (spans and region together). */
  mode: 'fit' | 'scaled';
}

export interface DockBox {
  id: DockId;
  /** The whole dock: its spans and its shown lanes. */
  rect: Rect;
  /** Shown panes in order: head spans, lane by lane, tail spans. */
  panes: PaneId[];
  /** `scaled` if any lane or span stack is (see AxisResult). */
  mode: 'fit' | 'scaled';
  /** Shown lanes in model order (from the screen edge inward); their rects cover the region only. */
  lanes: LaneBox[];
  /** Shown span stacks (ADR 0067), head before tail; empty without spanning panes. */
  spans: SpanBox[];
  /** The lanes block (the whole dock without spans), or null when no lane is shown. */
  region: Rect | null;
}

export interface LayoutResult {
  cols: number;
  rows: number;
  /** The viewport is below MIN_VIEW_COLS × MIN_VIEW_ROWS; nothing else is laid out. */
  tooSmall: boolean;
  game: Rect;
  input: Rect;
  /** Shown docks only. */
  docks: Partial<Record<DockId, DockBox>>;
  /** Docks with panes switched on that are hidden for lack of space. */
  collapsed: DockId[];
  /**
   * Shown panes, dock by dock (left, right, top, bottom), lane by lane from
   * the screen edge inward, in stack order, then the floating panes bottom
   * to top.
   */
  panes: PaneBox[];
  /** Panes switched on but not shown: dropped by allocation or in a collapsed dock. */
  hidden: PaneId[];
}

const EMPTY: Rect = { x: 0, y: 0, w: 0, h: 0 };
const DEFAULT_TOGGLE: PaneToggle = { on: true, border: true };

/** The toggles of `id`, or null when it takes no part (off, or a script pane not present). */
function shownToggle(input: AllocateInput, id: PaneId): PaneToggle | null {
  const builtin = isBuiltinPaneId(id);
  if (!builtin && !input.present?.has(id)) return null;
  const t = input.panes[id] ?? (builtin ? null : DEFAULT_TOGGLE);
  return t?.on ? t : null;
}

/** A lane that takes part in allocation: at least one pane shown (ADR 0064). */
interface LaneItems {
  /** Index in the dock's model `lanes`. */
  index: number;
  /** Wanted size across the dock's axis (at least `min`). */
  size: number;
  /** Smallest size across the dock's axis: the largest `paneCrossMin` of its shown panes (ADR 0065). */
  min: number;
  items: AxisItem[];
}

function laneItems(input: AllocateInput, dock: DockId): LaneItems[] {
  const out: LaneItems[] = [];
  input.layout.docks[dock].lanes.forEach((lane, index) => {
    const items: AxisItem[] = [];
    let min = 0;
    for (const p of lane.panes) {
      const t = shownToggle(input, p.id);
      if (!t) continue;
      items.push({ id: p.id, desired: p.desired, min: minContent(p.id, dock), frame: t.border ? FRAME_CELLS : 0 });
      min = Math.max(min, paneCrossMin(p.id, dock, t.border));
    }
    if (items.length > 0) out.push({ index, size: Math.max(min, lane.size), min, items });
  });
  return out;
}

/** Shown spanning panes of a dock (ADR 0067) and the lanes; the dock's wanted and smallest size across. */
interface DockItems {
  lanes: LaneItems[];
  head: AxisItem[];
  tail: AxisItem[];
  /** Wanted size across the dock (frame included). */
  size: number;
  /** Smallest size across the dock. */
  min: number;
}

/** The pseudo id of a dock's region in the split along the dock (ADR 0067). */
const REGION_ID = '~region' as PaneId;

function dockItems(input: AllocateInput, dock: DockId): DockItems {
  const lanes = laneItems(input, dock);
  let spanMin = 0;
  const spanItems = (list: readonly { id: PaneId; desired: number }[]): AxisItem[] => {
    const items: AxisItem[] = [];
    for (const p of list) {
      const t = shownToggle(input, p.id);
      if (!t) continue;
      items.push({ id: p.id, desired: p.desired, min: minContent(p.id, dock), frame: t.border ? FRAME_CELLS : 0 });
      spanMin = Math.max(spanMin, paneCrossMin(p.id, dock, t.border));
    }
    return items;
  };
  const d = input.layout.docks[dock];
  const head = spanItems(d.head);
  const tail = spanItems(d.tail);
  const laneSum = sum(lanes.map((l) => l.size));
  const laneMins = sum(lanes.map((l) => l.min));
  if (head.length + tail.length === 0) return { lanes, head, tail, size: laneSum, min: laneMins };
  // A span is as wide (high) as the dock: the sum of the shown lanes, or,
  // when no lane is shown, of the stored lane sizes; never below the
  // spans' own cross minimum.
  const base = lanes.length > 0 ? laneSum : sum(d.lanes.map((l) => Math.max(1, l.size)));
  return { lanes, head, tail, size: Math.max(spanMin, base), min: Math.max(spanMin, laneMins) };
}

/**
 * Shrinks `sizes` (lane sizes from the screen edge inward) to `total`
 * cells: the inner lanes give up cells first, each down to its own
 * minimum in `mins` (ADR 0065).
 */
export function shrinkLanes(sizes: number[], total: number, mins: readonly number[]): number[] {
  const out = [...sizes];
  let excess = sum(out) - total;
  for (let k = out.length - 1; k >= 0 && excess > 0; k--) {
    const give = Math.max(0, Math.min(excess, out[k]! - (mins[k] ?? 0)));
    out[k] = out[k]! - give;
    excess -= give;
  }
  return out;
}

/** Lays out the whole screen (see the file header). */
export function allocate(input: AllocateInput): LayoutResult {
  const cols = Math.max(0, Math.floor(input.cols));
  const rows = Math.max(0, Math.floor(input.rows));
  const res: LayoutResult = {
    cols,
    rows,
    tooSmall: false,
    game: EMPTY,
    input: { x: 0, y: Math.max(0, rows - INPUT_ROWS), w: cols, h: Math.min(rows, INPUT_ROWS) },
    docks: {},
    collapsed: [],
    panes: [],
    hidden: [],
  };
  if (cols < MIN_VIEW_COLS || rows < MIN_VIEW_ROWS) {
    res.tooSmall = true;
    res.game = { x: 0, y: 0, w: cols, h: Math.max(0, rows - INPUT_ROWS) };
    const all = [...Object.values(input.layout.docks).flatMap(dockPanes), ...input.layout.floating];
    res.hidden = all.map((p) => p.id).filter((id) => shownToggle(input, id) !== null);
    return res;
  }

  const dk: Record<DockId, DockItems> = {
    left: dockItems(input, 'left'),
    right: dockItems(input, 'right'),
    top: dockItems(input, 'top'),
    bottom: dockItems(input, 'bottom'),
  };
  const ids = (d: DockId): PaneId[] => [
    ...dk[d].head.map((i) => i.id),
    ...dk[d].lanes.flatMap((l) => l.items.map((i) => i.id)),
    ...dk[d].tail.map((i) => i.id),
  ];
  /** The dock has a shown pane (in a lane or a span). */
  const has = (d: DockId): boolean => dk[d].lanes.length + dk[d].head.length + dk[d].tail.length > 0;
  const want = (d: DockId): number => dk[d].size;
  const need = (d: DockId, on: boolean): number => (on && has(d) ? want(d) + DOCK_GAP : 0);

  // Narrow collapse: keep both, else the right, else the left, else none.
  let showL = has('left');
  let showR = has('right');
  const fits = (l: boolean, r: boolean): boolean => cols - need('left', l) - need('right', r) >= GAME_MIN_COLS;
  if (!fits(showL, showR)) {
    if (showR && fits(false, true)) showL = false;
    else if (showL && fits(true, false)) showR = false;
    else showL = showR = false;
  }
  for (const [d, shown] of [['left', showL], ['right', showR]] as const) {
    if (!shown && has(d)) {
      res.collapsed.push(d);
      res.hidden.push(...ids(d));
    }
  }

  const leftW = showL ? want('left') : 0;
  const rightW = showR ? want('right') : 0;
  const gx = showL ? leftW + DOCK_GAP : 0;
  const gw = cols - gx - (showR ? rightW + DOCK_GAP : 0);

  // Top and bottom docks: they shrink to keep the game pane GAME_MIN_ROWS
  // high above the input row, which is never dropped. The bottom dock is
  // sized first; if that leaves the top dock less than its minimum, the
  // bottom dock gives up rows down to its own minimum. A dock's minimum is
  // its lane minimum times its shown lanes; a dock that still gets less is
  // collapsed. A shrunk dock takes the rows from its inner lanes first.
  const avail = rows - INPUT_ROWS - GAME_MIN_ROWS;
  const minOf = (d: DockId): number => dk[d].min;
  let bottomH = has('bottom') ? Math.min(want('bottom'), avail - DOCK_GAP) : 0;
  if (bottomH < minOf('bottom')) bottomH = 0;
  let topH = 0;
  if (has('top')) {
    topH = Math.min(want('top'), avail - DOCK_GAP - (bottomH > 0 ? bottomH + DOCK_GAP : 0));
    if (topH < minOf('top') && bottomH > 0) {
      const b = avail - 2 * DOCK_GAP - minOf('top');
      if (b >= minOf('bottom')) {
        bottomH = Math.min(bottomH, b);
        topH = Math.min(want('top'), avail - 2 * DOCK_GAP - bottomH);
      }
    }
    if (topH < minOf('top')) topH = 0;
  }
  for (const [d, h] of [['top', topH], ['bottom', bottomH]] as const) {
    if (h === 0 && has(d)) {
      res.collapsed.push(d);
      res.hidden.push(...ids(d));
    }
  }
  const gy = topH > 0 ? topH + DOCK_GAP : 0;
  const below = bottomH > 0 ? bottomH + DOCK_GAP : 0;
  res.game = { x: gx, y: gy, w: gw, h: rows - gy - INPUT_ROWS - below };
  res.input = { x: gx, y: rows - below - INPUT_ROWS, w: gw, h: INPUT_ROWS };

  // One pane's box at `at` along `area` (the stack's rectangle).
  const paneBox = (
    dock: DockId,
    lane: LaneRef,
    model: readonly { id: PaneId }[],
    area: Rect,
    at: number,
    id: PaneId,
    size: number,
  ): number => {
    const side = isSideDock(dock);
    const framed = shownToggle(input, id)!.border;
    const len = size + (framed ? FRAME_CELLS : 0);
    const r: Rect = side ? { x: area.x, y: at, w: area.w, h: len } : { x: at, y: area.y, w: len, h: area.h };
    const c: Rect = framed ? { x: r.x + 1, y: r.y + 1, w: Math.max(0, r.w - 2), h: Math.max(0, r.h - 2) } : { ...r };
    const index = model.findIndex((p) => p.id === id);
    res.panes.push({ id, dock, lane, index, rect: r, content: c, framed });
    return at + len;
  };

  // A dock's lanes from its screen edge inward inside `rect` (the whole
  // dock, or its region when it has spans); each lane is split along its
  // length like a whole dock was before (allocateAxis).
  const placeLanes = (dock: DockId, rect: Rect, lanes: readonly LaneItems[], box: DockBox): void => {
    const side = isSideDock(dock);
    const cross = side ? rect.w : rect.h;
    const sizes = shrinkLanes(lanes.map((l) => l.size), cross, lanes.map((l) => l.min));
    // Spans wider than the lanes (ADR 0067): the innermost lane takes the rest.
    const short = cross - sum(sizes);
    if (short > 0 && sizes.length > 0) sizes[sizes.length - 1]! += short;
    let off = 0;
    lanes.forEach((lane, k) => {
      const w = sizes[k]!;
      const lr: Rect =
        dock === 'left' ? { x: rect.x + off, y: rect.y, w, h: rect.h }
        : dock === 'right' ? { x: rect.x + rect.w - off - w, y: rect.y, w, h: rect.h }
        : dock === 'top' ? { x: rect.x, y: rect.y + off, w: rect.w, h: w }
        : { x: rect.x, y: rect.y + rect.h - off - w, w: rect.w, h: w };
      off += w;
      const ax = allocateAxis(lane.items, side ? lr.h : lr.w);
      res.hidden.push(...ax.dropped);
      if (ax.mode === 'empty') return;
      const shown = ax.sizes.map((s) => s.id);
      box.lanes.push({ index: lane.index, rect: lr, panes: shown, mode: ax.mode, min: lane.min });
      box.panes.push(...shown);
      if (ax.mode === 'scaled') box.mode = 'scaled';
      const model = input.layout.docks[dock].lanes[lane.index]!.panes;
      let at = side ? lr.y : lr.x;
      for (const { id, size } of ax.sizes) at = paneBox(dock, lane.index, model, lr, at, id, size);
    });
  };

  const place = (dock: DockId, rect: Rect): void => {
    const k = dk[dock];
    const box: DockBox = { id: dock, rect, panes: [], mode: 'fit', lanes: [], spans: [], region: null };
    if (k.head.length + k.tail.length === 0) {
      box.region = rect;
      placeLanes(dock, rect, k.lanes, box);
    } else {
      placeSpans(dock, rect, k, box);
    }
    if (box.lanes.length + box.spans.length > 0) res.docks[dock] = box;
  };

  // A dock with spanning panes (ADR 0067): spans and region split along
  // the dock as one stack, then the lanes inside the region.
  const placeSpans = (dock: DockId, rect: Rect, k: DockItems, box: DockBox): void => {
    const side = isSideDock(dock);
    const len = side ? rect.h : rect.w;
    const outer = (items: readonly AxisItem[]): number => sum(items.map((i) => i.min + i.frame));
    let head = [...k.head];
    let tail = [...k.tail];
    let lanes = k.lanes.map((l) => ({ ...l, items: [...l.items] }));
    const regionMin = (): number => Math.max(0, ...lanes.map((l) => outer(l.items)));
    // Too short for every minimum: drop from the spans and the lanes that
    // set the region's minimum (the others would free nothing).
    while (outer(head) + outer(tail) + regionMin() > len) {
      const rm = regionMin();
      const binding = rm > 0 ? lanes.filter((l) => outer(l.items) === rm).flatMap((l) => l.items) : [];
      const pool = [...head, ...binding, ...tail];
      if (pool.length === 0) break;
      const victim = dropVictim(pool);
      res.hidden.push(victim);
      head = head.filter((i) => i.id !== victim);
      tail = tail.filter((i) => i.id !== victim);
      for (const l of lanes) l.items = l.items.filter((i) => i.id !== victim);
    }
    lanes = lanes.filter((l) => l.items.length > 0);
    const members = lanes.flatMap((l) => l.items);
    const region: AxisItem[] =
      lanes.length === 0
        ? []
        : [
            {
              id: REGION_ID,
              min: regionMin(),
              desired: Math.max(...lanes.map((l) => sum(l.items.map((i) => Math.max(i.min, Math.round(i.desired)) + i.frame)))),
              frame: 0,
              region: true,
              rankAs: leftoverOrder(members)[0]!,
            },
          ];
    const ax = allocateAxis([...head, ...region, ...tail], len);
    res.hidden.push(...ax.dropped);
    if (ax.mode === 'empty') return;
    if (ax.mode === 'scaled') box.mode = 'scaled';
    const d = input.layout.docks[dock];
    let at = side ? rect.y : rect.x;
    const stack = (s: 'head' | 'tail', items: readonly { id: PaneId; size: number }[]): void => {
      if (items.length === 0) return;
      const start = at;
      for (const { id, size } of items) at = paneBox(dock, s, d[s], rect, at, id, size);
      const r: Rect = side ? { x: rect.x, y: start, w: rect.w, h: at - start } : { x: start, y: rect.y, w: at - start, h: rect.h };
      box.spans.push({ side: s, rect: r, panes: items.map((i) => i.id), mode: ax.mode === 'scaled' ? 'scaled' : 'fit' });
    };
    const ri = ax.sizes.findIndex((s) => s.id === REGION_ID);
    const before = ri < 0 ? ax.sizes.filter((s) => head.some((h) => h.id === s.id)) : ax.sizes.slice(0, ri);
    const after = ri < 0 ? ax.sizes.filter((s) => tail.some((t) => t.id === s.id)) : ax.sizes.slice(ri + 1);
    stack('head', before);
    box.panes.push(...before.map((s) => s.id));
    if (ri >= 0) {
      const size = ax.sizes[ri]!.size;
      const r: Rect = side ? { x: rect.x, y: at, w: rect.w, h: size } : { x: at, y: rect.y, w: size, h: rect.h };
      box.region = r;
      placeLanes(dock, r, lanes, box);
      at += size;
    }
    stack('tail', after);
    box.panes.push(...after.map((s) => s.id));
  };
  if (showL) place('left', { x: 0, y: 0, w: leftW, h: rows });
  if (showR) place('right', { x: cols - rightW, y: 0, w: rightW, h: rows });
  if (topH > 0) place('top', { x: gx, y: 0, w: gw, h: topH });
  if (bottomH > 0) place('bottom', { x: gx, y: rows - bottomH, w: gw, h: bottomH });

  const mapAuto = input.layout.floating.some((f) => f.id === 'map' && f.auto) && shownToggle(input, 'map')
    ? clampFloat(autoFloatRect(res.game, cols, rows), floatMin('map', input.panes.map?.border ?? true), cols, rows)
    : null;
  /** The shown rectangle of a float that is not itself placed under another (ADR 0078: `below`). */
  const shownFloat = (id: PaneId): Rect | null => {
    const g = input.layout.floating.find((f) => f.id === id);
    const t = g && !g.below ? shownToggle(input, id) : null;
    if (!g || !t) return null;
    const want = !g.auto ? g : isBuiltinPaneId(id) ? autoFloatRect(res.game, cols, rows) : scriptAutoFloatRect(res.game, g, mapAuto);
    return clampFloat(want, floatMin(id, t.border), cols, rows);
  };
  input.layout.floating.forEach((f, index) => {
    const t = shownToggle(input, f.id);
    if (!t) return;
    const framed = t.border;
    const under = f.auto && f.below ? shownFloat(f.below) : null;
    const want = !f.auto
      ? f
      : under
        ? floatBelow(under, f.h)
        : isBuiltinPaneId(f.id)
          ? autoFloatRect(res.game, cols, rows)
          : scriptAutoFloatRect(res.game, f, mapAuto);
    const r = clampFloat(want, floatMin(f.id, framed), cols, rows);
    const c: Rect = framed ? { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 } : { ...r };
    res.panes.push({ id: f.id, dock: 'float', lane: 0, index, rect: r, content: c, framed });
  });
  return res;
}
