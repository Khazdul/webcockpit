# 0012 — Docking engine, pane frame and cockpit view

- Status: Accepted; amended by ADR 0014 (top dock, floating panes,
  quadrant corners only); amended by ADR 0101 (dock structure around the
  menu bar: the right dock ends above the input row, the bottom dock
  spans the screen)
- Date: 2026-09-27

## Context

Stage 2 package B builds the docking layout fixed in outline by ADR 0010
("Docking") on package A's settings, theme and cell grid (ADR 0011).
ADR 0010 leaves the screen geometry, the minimum sizes outside Cockpit's
right column, the drag and resize details and the code structure open.

## Decision

### Code

- `src/layout/allocate.ts` — pure allocation: `allocate({ layout, panes,
  cols, rows })` → `LayoutResult` (rectangles in cells for the game pane,
  the input line, each shown dock and pane; collapsed docks; hidden
  panes; `tooSmall`). `allocateAxis` does one dock (Inv §2.1 "Heights").
- `src/layout/model.ts` — pure model operations: `movePane`,
  `isNoopMove`, `setDockSize`, `setDesired`, `shiftBoundary`, `findPane`,
  `defaultDesired`, `togglePatch`.
- `src/panes/frame.ts` — frame text; `src/panes/pane.ts` — `PaneShell`
  (`el`, `content`, `cols`, `rows`, `visible`, `onResize`) and
  `PANE_FACTORIES`, where later stages plug in their pane classes.
- `src/layout/cockpit.ts` + `layout.css` — the view. `App` builds it and
  puts the output pane in `cockpit.gameEl` and the input in
  `cockpit.inputEl`. `AppOptions.settings` is new (default: an in-memory
  store for unit tests); `main.ts` passes the real store.

### Geometry

- Side docks run the full height above the input line. The bottom dock
  sits under the game pane only, between the side docks: side panes are
  tall lists and keep Cockpit's full-height column.
- One gap cell separates the game column from each shown side dock and
  one gap row separates the game pane from the bottom dock (Cockpit's
  tmux separator). Gaps show the page background. Panes in a dock touch;
  their frames separate them. A dock's `size` excludes the gap, so the
  default right dock is 33 cells and the game pane `cols − 34`.
- Minimums beyond Inv §2.1: side dock 10 cells, bottom dock 3 rows,
  8 content columns per pane in the bottom dock. A pane entering the
  bottom dock wants 30 columns; moving between left and right keeps its
  `desired`, a change of axis resets it to the axis default.
- The bottom dock fills its width like a side dock fills its height
  (leftover to the highest-priority pane).
- Character is reserved first only if the others still get their
  minimums; otherwise every pane scales. Rounding cells go one each by
  leftover priority.

### Collapse and the size gate

- Narrow collapse is derived on every layout, never stored: keep both
  side docks if the game pane keeps 30 columns, else only the right,
  else only the left, else none. Toggles stay as they are, and the docks
  come back when the window widens.
- The bottom dock shrinks to keep the game pane 5 rows high and is
  hidden below 3 rows.
- Below 60 × 18 cells a "Window too small" notice covers the cockpit;
  the game pane, panes and input are `inert` (keys go nowhere), and the
  focus returns to the input on recovery. The stage-1 smoke test that
  used a 300 px high window now uses 360 px.

### Frame

- The whole frame is one text block of `h` lines in the pane (top row,
  `▌ … ▐` rows, bottom row), rendered like game output, so it tiles on
  the same whole-pixel grid (ADR 0011). The content element lies over
  the inner area. The text is rebuilt only when the size or corner style
  changes. The label is chopped when the pane is narrow. Border off: no
  frame, content gets the whole rectangle.

### Interaction

- **Relayout:** one pass per animation frame after a size change of the
  cockpit element (ResizeObserver: window and padding), a cell size
  change or any settings change. The game pane and panes have a fixed
  size and `contain: strict`, so output lines never lay out the rest.
- **Move:** the grip is the title row (the frame's top row; with the
  border off, the top content row, so that row cannot start a text
  selection). A press becomes a drag after 4 px. Over a shown dock the
  target is before the first pane whose middle is past the pointer; an
  insertion bar (`--c-accent`) marks it. A 2-cell zone at the screen
  edge of a dock that is not shown (and not collapsed) opens it at its
  default size (33 / 10). Over the game pane there is no target and the
  drop does nothing.
- **Resize:** the gap next to a dock resizes the dock, clamped so the
  game pane keeps 30 × 5. Between two panes the handle is the lower 40 %
  of the upper pane's last row (the lit half of `▄`) or the right 40 % of
  the left pane's last column, so it never overlaps the next pane's grip.
  The two panes' `desired` becomes their dragged sizes. If the dock is
  short of space (scaled), every shown pane in it is first frozen at the
  size it shows, so the boundary follows the pointer exactly.
- Drags preview live from a temporary model and write the settings once,
  on release. The pointer is captured on the cockpit element (handles
  are re-created by each relayout). Grips, handles and gaps prevent the
  default of `pointerdown`/`mousedown`, so the input keeps the focus; a
  click on a pane or gap returns the focus to the input unless text is
  selected.

## Consequences

- Later panes subclass or wrap `PaneShell` via `PANE_FACTORIES`, render
  into `content` and listen to `onResize(cols, rows)`.
- A pane that is on can still be hidden (dropped or collapsed); stages
  that care read `pane.visible` or `cockpit.layout.hidden`.
- The Cockpit warning when a pane cannot be opened (Inv §2.1) is not
  built; the survivor rules simply leave it out until there is room.
