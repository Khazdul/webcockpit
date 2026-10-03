# 0064 — Dock lanes: several columns or rows per dock

- Status: Accepted; amended by ADR 0065 (per-lane minimum, edge zones) and
  ADR 0067 (spanning panes: `head`/`tail` spans across all lanes)
- Date: 2026-10-03
- Amends: ADR 0012 (model, geometry, interaction), ADR 0014 (top dock,
  docking from the edge zones)

## Context

A player asked for more than one column in the right dock, and the same
for the other docks: several columns in the left and right docks, several
rows in the top and bottom docks. Until now a dock was one strip of panes
(`DockState = { size, panes }`).

## Decision

### Model

- A dock is a list of **lanes**: `DockState = { lanes: DockLane[] }`,
  `DockLane = { size: number; panes: DockPane[] }`. A lane of a side dock
  is a column (`size` = width in cells, panes stacked top to bottom); a
  lane of the top/bottom dock is a row (`size` = height, panes left to
  right). `DockPane.desired` keeps its meaning (along the lane).
- Lanes are ordered **from the screen edge inward**: lane 0 touches the
  screen edge (left dock: leftmost; right dock: rightmost; top dock:
  topmost; bottom dock: bottommost). Lane 0 is the old single strip, so
  migration and "append to the dock" both mean lane 0.
- Invariant: no empty lanes. A model operation that empties a lane removes
  it. A dock with no panes has `lanes: []`.
- Every pane still appears exactly once across all lanes and `floating`.
- Migration (`src/settings/migrate.ts`): an old dock `{ size, panes }`
  becomes `{ lanes: [{ size, panes }] }`, or `{ lanes: [] }` when `panes`
  is empty; the new shape is repaired the same way as before per lane
  (sizes clamped, unknown and duplicate ids dropped, empty lanes removed).
  Recorded runs and the viewer's layout go through the same repair.
  Missing built-in panes and script-pane placement append to lane 0 of
  the dock, creating it at the dock's default size when the dock is empty.
  `SETTINGS_VERSION` is unchanged; old stored layouts keep working.
- `findPane` returns `{ dock, lane, index }`.

### Allocation

- A lane takes part only if at least one of its panes is shown (on and,
  for a script pane, present); otherwise it takes no space.
- A side dock is as wide as the sum of its shown lanes (each at least
  `SIDE_DOCK_MIN`); the top/bottom dock as high as the sum of its shown
  lanes (each at least its dock minimum). Lanes in a dock touch, like
  panes in a lane (the frames separate them); there is no gap between
  lanes. The gap to the game column is unchanged.
- Each lane is split along its length with `allocateAxis`, exactly as a
  whole dock was before.
- Narrow collapse and the top/bottom space rules work on the whole dock
  as before (a dock is shown with all its lanes or collapsed). When the
  top/bottom dock must shrink, its inner lanes give up rows first, down to
  their minimum; a dock whose lanes cannot all get their minimum is
  collapsed.
- `DockBox` gains `lanes: { rect, panes, mode }[]` (shown lanes, model
  order); `PaneBox` gains `lane` (the model lane index) and `index` stays
  the index within the lane. `DockBox.mode` is `scaled` if any lane is.

### Interaction

- **Into a lane:** dropping a docked pane over a lane inserts it into that
  lane before the first pane whose middle is past the pointer (the old
  rule, per lane), with the usual insertion bar along the lane.
- **New lane:** the cross-axis edge bands of each shown lane create a new
  lane next to it: in a side dock the left and right bands of a column, in
  the top/bottom dock the upper and lower bands of a row. A band is
  `clamp(floor(cross / 5), 1, 3)` cells deep. The insertion bar then runs
  the full length of the lane boundary (vertical in a side dock,
  horizontal in the top/bottom dock). The new lane gets the dock's default
  size (33 columns / 10 rows), shrunk to the room the game pane leaves
  (30 × 5) and never below the lane minimum; without that room the band
  is no target and the normal in-lane insert applies. Moving a pane out of
  a one-pane lane into a new lane beside it is a no-op target.
- **Screen-edge zones:** unchanged. A shown dock's edge zone inserts into
  lane 0 (the lane at the screen edge); a hidden dock opens with one lane
  at its default size. Floating panes still dock only from the edge zones.
- **Resize:** the gap next to the game column resizes the innermost shown
  lane (the one next to the gap), clamped as before. The boundary between
  two shown lanes is a handle (the inner 40 % of the outer lane's last
  column/row, like the pane boundaries) that moves cells between the two
  lanes; their sum stays constant, so the game pane is unaffected; each
  lane keeps its minimum. Pane boundaries inside a lane work per lane as
  before (a scaled lane is frozen first).
- `desired` follows the existing axis rule: kept when the axis stays the
  same (any lane of left/right, any lane of top/bottom), reset across axes.

### Lua

- `createPane{dock = ...}` places a new pane at the end of lane 0 of that
  dock (as before for the single strip). No new Lua parameter.

## Consequences

- Code that walked `docks[d].panes` walks `docks[d].lanes[*].panes`.
- A player gets several columns by dragging a pane to the side band of a
  docked column; dragging the last pane out of a lane removes the lane and
  gives its space back to the game pane.
- "Reset layout" still returns to the default: one lane in the right dock.

## Implementation notes (2026-10-03)

- **Model API** (`src/layout/model.ts`): `movePane(m, id, dock, lane,
  index)` (lane clamped to the dock's lanes; an empty dock gets lane 0 at
  its default size), `moveToNewLane(m, id, dock, at, size)` (a new lane
  inserted at lane position `at`), `isNoopMove` / `isNoopNewLane`,
  `setLaneSize(m, dock, lane, size)` (replaces `setDockSize`) and
  `shiftLanes(m, dock, a, b, delta)` (both lanes written with their new
  shown sizes, sum constant). All return the input unchanged when nothing
  changes. `dockPanes` and `appendToDock` live in `src/layout/types.ts`.
- **View types**: `DockBox.lanes` entries are `LaneBox { index, rect,
  panes, mode }`; `index` is the model lane index (needed because lanes
  with only hidden panes are not shown). `DropTarget` gains a kind
  `lane` (`{ dock, at, size, bar }`) next to `dock` (which now carries
  `lane`).
- **Lane boundary handle — deviation**: the handle sits on the left
  (upper) lane's last column (row), right (lower) 40 %, exactly like the
  pane boundaries, instead of always on the outer lane. For the left and
  top docks that is the outer lane, as decided; for the right and bottom
  docks it is the inner lane. In the bottom dock the outer lane's inner
  row is its panes' title row, which is the drag grip, so a handle there
  would steal the grip.
- **No-op band**: over the band beside a one-pane lane's own position the
  target is "none" (no bar), not a fallback to the in-lane insert.
- **New-lane room** is measured on the current game pane; the space the
  moving pane's own lane would free is not counted.
- **Hidden dock with lanes**: a dock whose lanes hold only hidden panes is
  "not shown"; its screen-edge zone appends to lane 0 and sets lane 0 to
  the default size (the old "open" behaviour).
- **Sizes below the minimum** count as the lane minimum in allocation, so
  a top/bottom lane stored below 3 rows is shown at 3 instead of
  collapsing the dock. An old empty dock `{ size, panes: [] }` migrates to
  `{ lanes: [] }`, so its stored size is not kept.
