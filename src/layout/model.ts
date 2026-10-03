// Layout model operations (ADR 0010 "Docking", ADR 0012). Pure: each
// returns a new LayoutModel (or settings patch) and never mutates its input,
// so the result can go straight into `settings.update`.

import { type PaneSettings, type PaneSettingsMap, paneSettingsOf } from '../settings/types';
import { DEFAULT_BOTTOM_DESIRED, FRAME_CELLS, type Rect, isSideDock, laneMin, minContent, paneCrossMin } from './allocate';
import {
  DOCK_IDS,
  type DockId,
  type DockLane,
  type DockPane,
  type FloatPane,
  type LayoutModel,
  type PaneId,
  appendToDock,
  defaultDockSize,
  defaultPaneRows,
} from './types';

function copy(m: LayoutModel): LayoutModel {
  const docks = {} as LayoutModel['docks'];
  for (const d of DOCK_IDS) {
    docks[d] = { lanes: m.docks[d].lanes.map((l) => ({ size: l.size, panes: l.panes.map((p) => ({ ...p })) })) };
  }
  return { docks, floating: m.floating.map((f) => ({ ...f })) };
}

/** Removes the empty lanes of every dock (mutates a copy; ADR 0064 invariant). */
function prune(m: LayoutModel): LayoutModel {
  for (const d of DOCK_IDS) m.docks[d].lanes = m.docks[d].lanes.filter((l) => l.panes.length > 0);
  return m;
}

/** Index of `id` in `floating` (its z-order), or -1 when it is docked. */
export function findFloat(m: LayoutModel, id: PaneId): number {
  return m.floating.findIndex((f) => f.id === id);
}

/** The dock, lane and index in the lane that hold `id`, or null (also when it floats). */
export function findPane(m: LayoutModel, id: PaneId): { dock: DockId; lane: number; index: number } | null {
  for (const dock of DOCK_IDS) {
    const lanes = m.docks[dock].lanes;
    for (let lane = 0; lane < lanes.length; lane++) {
      const index = lanes[lane]!.panes.findIndex((p) => p.id === id);
      if (index >= 0) return { dock, lane, index };
    }
  }
  return null;
}

/** The desired size a pane gets when it enters `dock` from another axis. */
export function defaultDesired(id: PaneId, dock: DockId): number {
  return isSideDock(dock) ? defaultPaneRows(id) : DEFAULT_BOTTOM_DESIRED;
}

/**
 * Takes `id` out of the copy `out` (a dock lane or `floating`) and returns
 * its dock entry: the old one when it was docked (`desired` reset when the
 * axis changes for `dock`), a fresh one for a floating pane. The lane it
 * leaves may be empty now; the caller prunes.
 */
function take(out: LayoutModel, id: PaneId, dock: DockId): DockPane | null {
  const from = findPane(out, id);
  if (from) {
    const [entry] = out.docks[from.dock].lanes[from.lane]!.panes.splice(from.index, 1) as [DockPane];
    if (isSideDock(from.dock) !== isSideDock(dock)) entry.desired = defaultDesired(id, dock);
    return entry;
  }
  const fi = findFloat(out, id);
  if (fi < 0) return null;
  out.floating.splice(fi, 1);
  return { id, desired: defaultDesired(id, dock) };
}

/**
 * Moves `id` to lane `lane` of `dock` before the pane now at `index` (an
 * index into the target lane's list *including* the moving pane when it is
 * the same lane; `index` = list length appends). Reordering is a move
 * within a lane. `lane` is clamped to the dock's lanes; a dock without
 * lanes gets one at its default size. `desired` is kept when the axis
 * stays the same (any lane of left/right, any lane of top/bottom) and reset
 * to the default for the new axis otherwise; a floating pane is docked with
 * the default for the dock's axis. A lane the pane leaves empty is removed.
 */
export function movePane(m: LayoutModel, id: PaneId, dock: DockId, lane: number, index: number): LayoutModel {
  const from = findPane(m, id);
  if (!from && findFloat(m, id) < 0) return m;
  if (isNoopMove(m, id, dock, lane, index)) return m;
  const out = copy(m);
  const lanes = out.docks[dock].lanes;
  if (lanes.length === 0) lanes.push({ size: defaultDockSize(dock), panes: [] });
  const li = Math.max(0, Math.min(lanes.length - 1, lane));
  const target = lanes[li]!;
  const same = from !== null && from.dock === dock && from.lane === li;
  let at = Math.max(0, Math.min(index, target.panes.length));
  if (same && at > from.index) at--;
  const entry = take(out, id, dock)!;
  target.panes.splice(at, 0, entry);
  return prune(out);
}

/** True when `movePane(m, id, dock, lane, index)` would change nothing. */
export function isNoopMove(m: LayoutModel, id: PaneId, dock: DockId, lane: number, index: number): boolean {
  const from = findPane(m, id);
  if (!from) return findFloat(m, id) < 0;
  const n = m.docks[dock].lanes.length;
  const li = Math.max(0, Math.min(n - 1, lane));
  return from.dock === dock && from.lane === li && (index === from.index || index === from.index + 1);
}

/**
 * Moves `id` into a new lane of `dock` inserted at lane position `at`
 * (0 = at the screen edge, the dock's lane count = innermost), `size`
 * cells wide (left/right) or high (top/bottom), at least 1. `desired`
 * follows the axis rule of `movePane`. A lane the pane leaves empty is
 * removed. A no-op (`m` returned) when the pane is alone in its lane and
 * the new lane would sit right beside it.
 */
export function moveToNewLane(m: LayoutModel, id: PaneId, dock: DockId, at: number, size: number): LayoutModel {
  if (isNoopNewLane(m, id, dock, at)) return m;
  const out = copy(m);
  const lanes = out.docks[dock].lanes;
  const lane: DockLane = { size: Math.max(1, Math.round(size)), panes: [] };
  lanes.splice(Math.max(0, Math.min(lanes.length, at)), 0, lane);
  lane.panes.push(take(out, id, dock)!);
  return prune(out);
}

/** True when `moveToNewLane(m, id, dock, at, size)` would change nothing. */
export function isNoopNewLane(m: LayoutModel, id: PaneId, dock: DockId, at: number): boolean {
  const from = findPane(m, id);
  if (!from) return findFloat(m, id) < 0;
  const alone = m.docks[from.dock].lanes[from.lane]!.panes.length === 1;
  return alone && from.dock === dock && (at === from.lane || at === from.lane + 1);
}

/** A whole-cell rectangle with a size of at least 1 × 1 and no negative origin. */
function cells(r: Rect): Rect {
  return {
    x: Math.max(0, Math.round(r.x)),
    y: Math.max(0, Math.round(r.y)),
    w: Math.max(1, Math.round(r.w)),
    h: Math.max(1, Math.round(r.h)),
  };
}

/**
 * Makes `id` float at `rect` (outer cells), in front of the other floating
 * panes. Works from a dock or from floating (a move).
 */
export function floatPane(m: LayoutModel, id: PaneId, rect: Rect): LayoutModel {
  const from = findPane(m, id);
  const fi = findFloat(m, id);
  if (!from && fi < 0) return m;
  const out = copy(m);
  if (from) out.docks[from.dock].lanes[from.lane]!.panes.splice(from.index, 1);
  else out.floating.splice(fi, 1);
  out.floating.push({ id, ...cells(rect) });
  return prune(out);
}

/** Sets a floating pane's rectangle, keeping its z-order (no-op when docked or unchanged). */
export function setFloatRect(m: LayoutModel, id: PaneId, rect: Rect): LayoutModel {
  const fi = findFloat(m, id);
  if (fi < 0) return m;
  const r = cells(rect);
  const f = m.floating[fi]!;
  if (!f.auto && f.x === r.x && f.y === r.y && f.w === r.w && f.h === r.h) return m;
  const out = copy(m);
  out.floating[fi] = { id, ...r };
  return out;
}

/** Brings a floating pane to the front (no-op when docked or already in front). */
export function raisePane(m: LayoutModel, id: PaneId): LayoutModel {
  const fi = findFloat(m, id);
  if (fi < 0 || fi === m.floating.length - 1) return m;
  const out = copy(m);
  const [f] = out.floating.splice(fi, 1) as [FloatPane];
  out.floating.push(f);
  return out;
}

/** Which edges a floating-pane resize handle moves: any of n, s, e, w. */
export type ResizeEdges = string;

/**
 * The rectangle after dragging the `edges` of `r` by `dx` × `dy` cells:
 * whole cells, at least `min`, inside `cols` × `rows`. The opposite edges
 * stay put.
 */
export function resizeRect(
  r: Rect,
  edges: ResizeEdges,
  dx: number,
  dy: number,
  min: { w: number; h: number },
  cols: number,
  rows: number,
): Rect {
  let { x, y, w, h } = r;
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  if (edges.includes('e')) w = clamp(r.w + Math.round(dx), min.w, cols - r.x);
  if (edges.includes('w')) {
    const right = r.x + r.w;
    x = clamp(r.x + Math.round(dx), 0, right - min.w);
    w = right - x;
  }
  if (edges.includes('s')) h = clamp(r.h + Math.round(dy), min.h, rows - r.y);
  if (edges.includes('n')) {
    const bottom = r.y + r.h;
    y = clamp(r.y + Math.round(dy), 0, bottom - min.h);
    h = bottom - y;
  }
  return { x, y, w, h };
}

/** Sets the width (left/right) or height (top/bottom) of lane `lane` of `dock` in cells (≥ 1). */
export function setLaneSize(m: LayoutModel, dock: DockId, lane: number, size: number): LayoutModel {
  const l = m.docks[dock].lanes[lane];
  const s = Math.max(1, Math.round(size));
  if (!l || l.size === s) return m;
  const out = copy(m);
  out.docks[dock].lanes[lane]!.size = s;
  return out;
}

/**
 * Moves the boundary between two shown lanes of `dock` by `delta` cells
 * (positive: lane `a` grows, `b` shrinks; ADR 0064). `a.size` and
 * `b.size` are their current shown sizes; both stay at or above their
 * minimum (`min`, the shown lane's `LaneBox.min`, ADR 0065; default the
 * dock's lane minimum) and their sum stays constant, so the game pane
 * keeps its size. Both lanes are written with the result.
 */
export function shiftLanes(
  m: LayoutModel,
  dock: DockId,
  a: { lane: number; size: number; min?: number },
  b: { lane: number; size: number; min?: number },
  delta: number,
): LayoutModel {
  const lanes = m.docks[dock].lanes;
  if (!lanes[a.lane] || !lanes[b.lane] || a.lane === b.lane) return m;
  const minA = a.min ?? laneMin(dock);
  const minB = b.min ?? laneMin(dock);
  const total = a.size + b.size;
  const na = Math.max(minA, Math.min(total - minB, a.size + Math.round(delta)));
  const nb = total - na;
  if (na < minA || nb < minB) return m;
  if (lanes[a.lane]!.size === na && lanes[b.lane]!.size === nb) return m;
  const out = copy(m);
  out.docks[dock].lanes[a.lane]!.size = na;
  out.docks[dock].lanes[b.lane]!.size = nb;
  return out;
}

/**
 * Sets the desired content size of the given panes (drag end of a resize
 * between panes). Values are clamped to the pane's minimum in its dock.
 */
export function setDesired(m: LayoutModel, sizes: Partial<Record<PaneId, number>>): LayoutModel {
  const out = copy(m);
  let changed = false;
  for (const [id, v] of Object.entries(sizes) as [PaneId, number][]) {
    const at = findPane(out, id);
    if (!at) continue;
    const p = out.docks[at.dock].lanes[at.lane]!.panes[at.index]!;
    const d = Math.max(minContent(id, at.dock), Math.round(v));
    if (p.desired !== d) {
      p.desired = d;
      changed = true;
    }
  }
  return changed ? out : m;
}

/**
 * Moves the boundary between two neighbouring shown panes by `delta` cells
 * (positive: `a` grows, `b` shrinks). `a` and `b` are their current content
 * sizes; the result keeps both at or above their minimums and their sum
 * constant. Returns the new content sizes.
 */
export function shiftBoundary(
  a: { id: PaneId; size: number },
  b: { id: PaneId; size: number },
  dock: DockId,
  delta: number,
): { a: number; b: number } {
  const minA = minContent(a.id, dock);
  const minB = minContent(b.id, dock);
  const total = a.size + b.size;
  const na = Math.max(minA, Math.min(total - minB, a.size + Math.round(delta)));
  return { a: na, b: total - na };
}

/**
 * The settings patch that switches `id` on or off (`on` absent: toggles).
 * The whole entry is written, so a script pane without one gets the defaults.
 */
export function togglePatch(
  panes: Readonly<PaneSettingsMap>,
  id: PaneId,
  on?: boolean,
): { panes: Partial<Record<PaneId, PaneSettings>> } {
  const cur = paneSettingsOf(panes, id);
  return { panes: { [id]: { ...cur, on: on ?? !cur.on } } };
}

/** Where a script pane goes when it is created for the first time (ADR 0053). */
export interface ScriptPanePlace {
  /** A dock, or `float` for an automatic float. */
  dock: DockId | 'float';
  /** Wanted content rows (a side dock, a float). */
  rows: number;
  /** Wanted content columns (the top/bottom dock, a float). */
  cols: number;
  /** Framed (default true); written to the pane's settings entry at first placement (ADR 0065). */
  border?: boolean;
  /**
   * `own`: a new lane of its own at the dock's screen edge (lane 0), as
   * wide (left/right: `cols`) or high (top/bottom: `rows`) as the pane plus
   * its frame (ADR 0065). Ignored for a float.
   */
  lane?: 'own';
}

/**
 * `m` with script pane `id` placed per `place` when it has no place yet
 * (first creation): at the end of lane 0 of the dock (created at the
 * dock's default size when the dock is empty, ADR 0064) with `rows` (left/right) or
 * `cols` (top/bottom) as its desired size, or as an `auto` float of
 * `rows` × `cols` content cells. With `lane: 'own'` it gets a new lane 0
 * of its own instead, sized to the pane (ADR 0065). Returns `m` when `id`
 * is already placed.
 */
export function placeScriptPane(m: LayoutModel, id: PaneId, place: ScriptPanePlace): LayoutModel {
  if (findPane(m, id) || findFloat(m, id) >= 0) return m;
  const out = copy(m);
  const rows = Math.max(1, Math.round(place.rows));
  const cols = Math.max(1, Math.round(place.cols));
  if (place.dock === 'float') {
    // Behind panes the user floats, like the map's first float.
    out.floating.unshift({ id, x: 0, y: 0, w: cols + FRAME_CELLS, h: rows + FRAME_CELLS, auto: true });
    return out;
  }
  const side = isSideDock(place.dock);
  const entry = { id, desired: Math.max(minContent(id, place.dock), side ? rows : cols) };
  if (place.lane === 'own') {
    const framed = place.border ?? true;
    const size = (side ? cols : rows) + (framed ? FRAME_CELLS : 0);
    out.docks[place.dock].lanes.unshift({ size: Math.max(paneCrossMin(id, place.dock, framed), size), panes: [entry] });
    return out;
  }
  appendToDock(out.docks, place.dock, entry);
  return out;
}

/**
 * `m` with the size docked pane `id` asks for (`pane:wantSize`, ADR 0065):
 * in a side dock `rows` becomes its desired rows; in the top/bottom dock
 * `rows` sets its lane's height (plus the frame) only when it is alone in
 * the lane, and `cols`, when given, its desired columns. A floating pane,
 * an unknown one or a request that changes nothing returns `m`.
 */
export function wantPaneSize(m: LayoutModel, id: PaneId, rows: number, cols: number | undefined, framed: boolean): LayoutModel {
  const at = findPane(m, id);
  if (!at) return m;
  if (isSideDock(at.dock)) return setDesired(m, { [id]: rows });
  let out = m;
  const lane = m.docks[at.dock].lanes[at.lane]!;
  if (lane.panes.length === 1) {
    const size = Math.max(paneCrossMin(id, at.dock, framed), Math.round(rows) + (framed ? FRAME_CELLS : 0));
    out = setLaneSize(out, at.dock, at.lane, size);
  }
  if (cols !== undefined) out = setDesired(out, { [id]: cols });
  return out;
}
