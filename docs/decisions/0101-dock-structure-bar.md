# 0101 — Dock structure around the menu bar

- Status: Accepted; amended by ADR 0102 (2026-10-31, 30a round 2: this
  geometry only when the game column leaves fewer than 50 cells to type
  beside the bar; otherwise the right dock runs down to the bottom dock
  and the input row stays in the game column)
- Date: 2026-10-31
- Amends: ADR 0012 ("Geometry": side docks full height, bottom dock
  under the game pane only), ADR 0014 (amendment 2026-09-27: the input
  line as wide as the game pane, the side docks the full window height,
  the bottom edge zone in the game column)
- Related: stage 30 (`docs/stages/30-fixed-menu.md`, "Owner feedback →
  30a round 1"), ADR 0064 (lanes), ADR 0067 (spanning panes), ADR 0099
  (menu bar)

## Context

Stage 30a put the menu bar at the right end of the input row (ADR 0099).
With the side docks running the full window height, the input row ended
at the game pane's right edge, so the bar sat left of a right-docked
pane, in the middle of the screen. The owner (30a round 1) wants the bar
at the screen's right edge, under the right dock, and gave the target:

    +------+--+-------------------+--+-------+
    | left |g |    top dock       |g | right |
    | dock |a +-------------------+a | dock  |
    |      |p |      game         |p |       |
    |      |  +-------------------+--+-------+
    |      |  | > input        clock … exit  |
    +------+--+-----------------------------+
    |  (gap row)                            |
    |  bottom dock, full screen width       |
    +---------------------------------------+

## Decision

Geometry (`src/layout/allocate.ts`, desktop and tablet; the phone's tab
layout, `src/layout/phone.ts`, is unchanged):

- **Top dock:** unchanged: between the side docks and their gap columns,
  above the game pane, as wide as it.
- **Right dock:** from the top down to just above the input row
  (`h = rows − bottom dock − gap row − input row`).
- **Input row:** from the game pane's left edge (after the left dock's
  gap column, as before) to the screen's right edge: under the right gap
  column and the right dock. The menu bar stays at its right end, so it
  sits at the screen's right edge under the right dock. The game pane
  keeps its width (and NAWS); only the input row is wider than it.
- **Left dock:** from the top down to the gap row above the bottom dock,
  beside the input row; to the bottom of the screen without a bottom
  dock.
- **Bottom dock:** the full screen width, under the left dock and the
  input row, with one gap row above it (which now runs the full width).
- Lanes (ADR 0064) and spans (ADR 0067) work in each dock's new
  rectangle unchanged; the bottom dock's lanes and spans simply get the
  full width.

Heights and widths:

- The vertical budget is unchanged: the game pane keeps GAME_MIN_ROWS
  above the input row, which is never dropped; the bottom dock is sized
  first, the top dock after it, as before. The side docks take what that
  leaves them: the right dock loses the input row and the bottom dock
  with its gap row, the left dock the bottom dock and its gap row.
- **A right dock with no room left:** it is never shorter than the game
  pane's minimum (5 rows, plus the top dock and its gap row when shown),
  and every pane fits at its minimum in 5 rows (Character 3 + frame), so
  a shown side dock is never empty. When its panes do not all fit they
  drop in DROP_ORDER like in any lane (`hidden`), and come back when the
  window grows or the bottom dock shrinks. The bottom dock does not give
  up rows for the right dock: its size is the user's, and the game pane
  is the only thing it yields to (as for the top dock).
- Narrow collapse is unchanged (it depends on widths only). A collapsed
  side dock's width goes to the game column; the input row always runs
  from the game pane's left edge to the screen edge, so it gets the
  freed width too. The bottom dock stays full width whatever collapses.
- The too-small rule (60 × 18) and the priorities and drop order are
  unchanged.

The view (`src/layout/cockpit.ts`) follows `allocate`:

- The input slot, docks, panes and the dock resize handles are placed
  from the new rectangles; the left dock's gap handle runs beside the
  input row, the right one ends above it, the bottom one runs the full
  width.
- **Screen-edge drop zones** follow the docks' extent: the left zone
  (2 cells) down to the input row's bottom, the right zone down to the
  input row's top, the top zone over the game column (as before), and the
  bottom zone (2 rows) along the whole bottom edge below those (it was
  the game column only). The "open a hidden dock" bars match: the right
  bar ends above the input row, the left at the input row's bottom, the
  bottom bar is the full width.
- Over the input row a dragged pane floats (or, in the bottom 2 rows,
  docks at the bottom); the input row is no dock's.
- **Paint order:** the input slot now comes right after the game pane in
  the cockpit's DOM, before the panes (script panes are inserted before
  the handles). Painted after the panes, the wider slot overlapped the
  right dock's composited scrollers and Chromium promoted it to a layer
  of its own, which at a pixel ratio of 1.5 snapped one device pixel
  differently and cut the top of accents in the input line (ADR 0042,
  `underscores.spec.ts`). The slot and the docked panes never overlap on
  screen, and floating panes and the bar's popups are above both by
  z-index, so nothing visible changes.
- Floating panes, temporary panes, float holes (`float-holes.ts`) and
  the weather mask need no change: they measure the DOM or the game
  rect, and the weather's text mask already spans the full width below
  the game pane's last row.

## Consequences

- The menu bar sits at the screen's right edge whenever a right dock is
  shown, as in the owner's diagram.
- A right dock loses one row (the input row) without a bottom dock: in
  the owner's 174 × 51 window the new-player layout without the pane bar
  (ADR 0078 addendum 2026-10-31) is unchanged (map 22, lanes 13, Comm 15
  rows, Comm ending at the input row); with the pane bar on, the map
  gives up the row. An ADR 0078 layout's lanes give it up.
- With a tall bottom dock the right dock gets shorter than before; panes
  that no longer fit drop (DROP_ORDER) instead of the bottom dock
  shrinking.
- The bottom dock is wider by the side docks and their gaps, so panes in
  it get more columns.
