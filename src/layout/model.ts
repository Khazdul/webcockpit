// Layout model operations (ADR 0010 "Docking", ADR 0012). Pure: each
// returns a new LayoutModel (or settings patch) and never mutates its input,
// so the result can go straight into `settings.update`.

import { type PaneSettings, type PaneSettingsMap, paneSettingsOf } from '../settings/types';
import { DEFAULT_BOTTOM_DESIRED, FRAME_CELLS, type Rect, isSideDock, minContent } from './allocate';
import {
  DOCK_IDS,
  type DockId,
  type DockPane,
  type FloatPane,
  type LayoutModel,
  type PaneId,
  defaultPaneRows,
} from './types';

function copy(m: LayoutModel): LayoutModel {
  const docks = {} as LayoutModel['docks'];
  for (const d of DOCK_IDS) docks[d] = { size: m.docks[d].size, panes: m.docks[d].panes.map((p) => ({ ...p })) };
  return { docks, floating: m.floating.map((f) => ({ ...f })) };
}

/** Index of `id` in `floating` (its z-order), or -1 when it is docked. */
export function findFloat(m: LayoutModel, id: PaneId): number {
  return m.floating.findIndex((f) => f.id === id);
}

/** The dock that holds `id` and its index there, or null (also when it floats). */
export function findPane(m: LayoutModel, id: PaneId): { dock: DockId; index: number } | null {
  for (const dock of DOCK_IDS) {
    const index = m.docks[dock].panes.findIndex((p) => p.id === id);
    if (index >= 0) return { dock, index };
  }
  return null;
}

/** The desired size a pane gets when it enters `dock` from another axis. */
export function defaultDesired(id: PaneId, dock: DockId): number {
  return isSideDock(dock) ? defaultPaneRows(id) : DEFAULT_BOTTOM_DESIRED;
}

/**
 * Moves `id` to `dock` before the pane now at `index` (an index into the
 * target dock's list *including* the moving pane when it is the same dock;
 * `index` = list length appends). Reordering is a move within a dock.
 * `desired` is kept when the axis stays the same (left ↔ right, top ↔
 * bottom) and reset to the default for the new axis otherwise. A floating
 * pane is docked with the default for the dock's axis.
 */
export function movePane(m: LayoutModel, id: PaneId, dock: DockId, index: number): LayoutModel {
  const from = findPane(m, id);
  if (!from) {
    const fi = findFloat(m, id);
    if (fi < 0) return m;
    const out = copy(m);
    out.floating.splice(fi, 1);
    const list = out.docks[dock].panes;
    list.splice(Math.max(0, Math.min(index, list.length)), 0, { id, desired: defaultDesired(id, dock) });
    return out;
  }
  const out = copy(m);
  const src = out.docks[from.dock].panes;
  const [entry] = src.splice(from.index, 1) as [DockPane];
  let at = Math.max(0, Math.min(index, out.docks[dock].panes.length + (from.dock === dock ? 1 : 0)));
  if (from.dock === dock && at > from.index) at--;
  if (isSideDock(from.dock) !== isSideDock(dock)) entry.desired = defaultDesired(id, dock);
  out.docks[dock].panes.splice(at, 0, entry);
  return out;
}

/** True when `movePane(m, id, dock, index)` would change nothing. */
export function isNoopMove(m: LayoutModel, id: PaneId, dock: DockId, index: number): boolean {
  const from = findPane(m, id);
  if (!from) return findFloat(m, id) < 0;
  return from.dock === dock && (index === from.index || index === from.index + 1);
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
  if (from) out.docks[from.dock].panes.splice(from.index, 1);
  else out.floating.splice(fi, 1);
  out.floating.push({ id, ...cells(rect) });
  return out;
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

/** Sets a dock's width (left/right) or height (top/bottom) in cells (≥ 1). */
export function setDockSize(m: LayoutModel, dock: DockId, size: number): LayoutModel {
  const s = Math.max(1, Math.round(size));
  if (m.docks[dock].size === s) return m;
  const out = copy(m);
  out.docks[dock].size = s;
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
    const p = out.docks[at.dock].panes[at.index]!;
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
}

/**
 * `m` with script pane `id` placed per `place` when it has no place yet
 * (first creation): at the end of the dock with `rows` (left/right) or
 * `cols` (top/bottom) as its desired size, or as an `auto` float of
 * `rows` × `cols` content cells. Returns `m` when `id` is already placed.
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
  const desired = isSideDock(place.dock) ? rows : cols;
  out.docks[place.dock].panes.push({ id, desired: Math.max(minContent(id, place.dock), desired) });
  return out;
}
