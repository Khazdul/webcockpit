// Phone layout (ADR 0075 §3): a pure allocator beside `allocate()` for
// the *phone* device flag. `Cockpit.relayoutNow` picks it by the flag; the
// desktop allocator and the stored layout model are untouched, and the
// phone never writes layout changes back.
//
// Screen (C × R cells), top to bottom:
//
//   +--------------------------------------------+
//   | GAME  COMM  CHAR  …          (tab strip)   |  1 row
//   +--------------------------------------------+
//   |                                            |
//   |   the selected view, full width            |  R − 2 rows
//   |                                            |
//   +--------------------------------------------+
//   | input line                          clock  |  1 row
//   +--------------------------------------------+
//
// - The tabs are `GAME`, then every pane the layout has switched on (and,
//   for a script pane, `present`), in the layout's order: the docks left,
//   right, top, bottom (each in stack order), then the floating panes.
// - The game pane always gets the view rectangle, also while another tab
//   is selected (the cockpit hides it then), so its width, its scroll
//   position and NAWS do not change on a tab switch.
// - With a pane tab selected that pane gets the view rectangle (its own
//   border setting); every other pane is `hidden`.
// - Below PHONE_MIN_COLS × PHONE_MIN_ROWS the result is `tooSmall`, unless
//   `guard` is false (the on-screen keyboard is up, ADR 0075 §3).

import { FRAME_CELLS, INPUT_ROWS, type LayoutResult, type PaneBox, type PaneToggle, type AllocateInput, type Rect } from './allocate';
import { DOCK_IDS, type DockId, type LaneRef, type PaneId, isBuiltinPaneId } from './types';

/** The phone's "Window too small" limit (ADR 0075 §3; desktop keeps 60 × 18). */
export const PHONE_MIN_COLS = 30;
export const PHONE_MIN_ROWS = 8;
/** Rows of the tab strip. */
export const STRIP_ROWS = 1;

/** The game tab's id. Pane ids never equal it (built-ins are named, script panes hold a `/`). */
export const GAME_TAB = 'game';

/** A tab: the game, or a pane. */
export type PhoneTab = typeof GAME_TAB | PaneId;

export interface PhoneAllocateInput extends AllocateInput {
  /** The selected tab; one that is not shown falls back to GAME. */
  tab: PhoneTab;
  /** Apply the too-small guard (default true; false while the keyboard is up). */
  guard?: boolean;
}

export interface PhoneLayoutResult extends LayoutResult {
  /** The tab strip (empty when tooSmall or under 3 rows). */
  strip: Rect;
  /** The tabs in order, GAME first. */
  tabs: PhoneTab[];
  /** The selected tab after the fallback. */
  tab: PhoneTab;
  /** The view under the strip (the game pane's rectangle). */
  view: Rect;
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

interface Place {
  id: PaneId;
  dock: DockId | 'float';
  lane: LaneRef;
  index: number;
}

/** Every pane of the layout with its place, docks (left, right, top, bottom) then floating. */
function places(input: AllocateInput): Place[] {
  const out: Place[] = [];
  for (const dock of DOCK_IDS) {
    const d = input.layout.docks[dock];
    d.head.forEach((p, index) => out.push({ id: p.id, dock, lane: 'head', index }));
    d.lanes.forEach((l, lane) => l.panes.forEach((p, index) => out.push({ id: p.id, dock, lane, index })));
    d.tail.forEach((p, index) => out.push({ id: p.id, dock, lane: 'tail', index }));
  }
  input.layout.floating.forEach((f, index) => out.push({ id: f.id, dock: 'float', lane: 0, index }));
  return out;
}

/** Lays out the phone screen (see the file header). */
export function allocatePhone(input: PhoneAllocateInput): PhoneLayoutResult {
  const cols = Math.max(0, Math.floor(input.cols));
  const rows = Math.max(0, Math.floor(input.rows));
  const shown = places(input).filter((p) => shownToggle(input, p.id) !== null);
  const tabs: PhoneTab[] = [GAME_TAB, ...shown.map((p) => p.id)];
  const tab: PhoneTab = tabs.includes(input.tab) ? input.tab : GAME_TAB;
  const inputRect: Rect = { x: 0, y: Math.max(0, rows - INPUT_ROWS), w: cols, h: Math.min(rows, INPUT_ROWS) };
  const res: PhoneLayoutResult = {
    cols,
    rows,
    tooSmall: false,
    game: EMPTY,
    input: inputRect,
    docks: {},
    collapsed: [],
    panes: [],
    hidden: [],
    strip: EMPTY,
    tabs,
    tab,
    view: EMPTY,
  };
  if ((input.guard ?? true) && (cols < PHONE_MIN_COLS || rows < PHONE_MIN_ROWS)) {
    res.tooSmall = true;
    res.game = { x: 0, y: 0, w: cols, h: Math.max(0, rows - INPUT_ROWS) };
    res.view = res.game;
    res.hidden = shown.map((p) => p.id);
    return res;
  }
  // Very short (only with the guard off): the strip gives way first.
  const stripH = rows >= STRIP_ROWS + INPUT_ROWS + 1 ? STRIP_ROWS : 0;
  res.strip = { x: 0, y: 0, w: cols, h: stripH };
  res.view = { x: 0, y: stripH, w: cols, h: Math.max(0, rows - stripH - INPUT_ROWS) };
  res.game = res.view;
  for (const p of shown) {
    if (p.id !== tab) {
      res.hidden.push(p.id);
      continue;
    }
    const framed = shownToggle(input, p.id)!.border;
    const r = res.view;
    const c: Rect = framed
      ? { x: r.x + 1, y: r.y + 1, w: Math.max(0, r.w - FRAME_CELLS), h: Math.max(0, r.h - FRAME_CELLS) }
      : { ...r };
    const box: PaneBox = { id: p.id, dock: p.dock, lane: p.lane, index: p.index, rect: { ...r }, content: c, framed };
    res.panes.push(box);
  }
  return res;
}
