# 0102 — The input row's extent by the room left to type

- Status: Accepted
- Date: 2026-10-31
- Amends: ADR 0101 (the right dock ends above the input row, which runs
  under it to the screen's right edge: now only when a narrow game column
  leaves too little room to type)
- Related: stage 30 (`docs/stages/30-fixed-menu.md`, "Owner feedback →
  30a round 2"), ADR 0099 (menu bar), ADR 0012, ADR 0014

## Context

ADR 0101 (30a round 1) ran the input row under the right dock to the
screen edge, so the menu bar sat at the screen's right edge under the
right dock. The owner likes it, but prefers the bar left of the right
dock (the first 30a build) whenever the game column is wide enough to
type in comfortably, and the round 1 geometry only when it is not.

## Decision

`allocate` (`src/layout/allocate.ts`) picks one of two cases for the
input row, reported as `LayoutResult.inputSpan`:

- **Wide** (`game`): an input row as wide as the game column leaves at
  least `INPUT_TYPE_MIN` = 50 cells to type: game column width −
  `INPUT_PROMPT_CELLS` (the prompt `> `, 2) − the bar's width ≥ 50. The
  input row spans the game column only, with the bar at its right end,
  left of the right gap column. The right dock runs from the top down to
  the gap row above the bottom dock, or to the screen bottom without one,
  exactly like the left dock.
- **Narrow** (`screen`): fewer than 50. ADR 0101's geometry: the right
  dock ends right above the input row, which runs on under the right gap
  column and the right dock to the screen's right edge.
- Without a shown right dock (none, or collapsed) the two are the same;
  `inputSpan` is `game` and the input row is the game column.

Unchanged in both cases: the bottom dock spans the full screen width with
its gap row; the top dock sits between the side docks above the game
pane; the game pane's width and height (so NAWS); lanes, spans, narrow
collapse, the too-small rule, priorities, the drop order and the phone
layout (`inputSpan` is always `game` there).

How the case is decided:

- **From the wide geometry alone.** The game column's width does not
  depend on the case (only the input row and the right dock's height
  do), so the decision is a pure function of the layout inputs and
  cannot oscillate. It depends on the columns only: rows, the top and
  bottom docks and the panes' heights never change it.
- **After narrow collapse:** from the game column that is left once a side
  dock has collapsed. A collapsed left dock can turn a narrow case wide.
- **The bar's width is an input:** `AllocateInput.barCells`, whole cells
  (absent: 0). The menu bar reports it (`MenuBarOptions.onCells`, from
  `barCells()`: 26 with the fullscreen button, 24 without, ADR 0099) to
  `Cockpit.setBarCells`, which relayouts on a change (a refused
  fullscreen drops the button at run time, moving the threshold two
  columns). Without the bar (log player, tests) the App counts the clock
  strip, `CLOCK_CELLS` = 8.
- **Not counted:** transient notices left of the clock (Update,
  Disconnected), so a notice never moves the docks; and the tablet's
  `☰` (2 cells, touch only, kept until the ESC menu goes away; ADR 0099),
  which only makes the threshold two columns more generous there.

The view (`src/layout/cockpit.ts`) follows `allocate`:

- The input slot, the right dock, its panes and its gap handle come from
  the rectangles; in the wide case the right gap handle runs beside the
  input row down to the gap row (or the bottom).
- **Edge drop zones and bars:** the right zone and its "open a hidden
  dock" bar end where the right dock ends: at the input row's bottom in
  the wide case (as the left zone does), at its top in the narrow case.
  For a hidden right dock the case it would open in decides: the game
  column less the right dock's default size and gap
  (`inputFitsGameColumn`). The bottom zone still runs along the whole
  bottom edge below the side zones; in the wide case a side dock reaching
  the bottom row takes a pane dropped on its last row into its lane (as
  the left dock did in ADR 0101 without a bottom dock).
- ADR 0101's paint order (the input slot before the panes) stays: the
  narrow case still lays the slot under the right dock.

## Consequences

- In most desktop windows (the owner's 174 × 51 new-user layout: a
  123-cell game column, 95 to type) the bar sits left of the right dock
  and the right dock has its full height again: the map 22, the lanes 13
  and Comm 16 rows, Comm reaching the screen bottom.
- A narrow window, a wide right dock or a wide left dock switches to the
  round 1 geometry, and back when the window widens; the switch is at an
  exact column (50 cells to type is wide, 49 narrow).
- The right dock's height jumps by one row (or by the input row) at the
  threshold; its panes re-split as on any resize.
