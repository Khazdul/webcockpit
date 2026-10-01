# 0014 — Top dock, floating panes, quadrant corners only

- Status: Accepted; amended below (input placement, standard float size)
- Date: 2026-09-27
- Amends: ADR 0010 ("Settings": `corners`), ADR 0012 (geometry,
  interaction)

## Context

The owner's first test of stage 2 (`docs/stages/02-look-and-layout.md`,
"Owner feedback") asked for three changes: frames always use the quadrant
corners, panes can also dock at the top, and any pane can float with a
free position and size. Docked or floating is per pane: a pane dropped
over the game area floats, one dropped on a screen edge docks. The default
layout stays: every pane docked in the right column.

## Decision

### Corners

- `Settings.corners` and the Options → Panes "Corner style" row are
  removed. Frames always draw `▛▜▙▟` (`src/panes/frame.ts` has no corner
  parameter any more). `migrateSettings` builds a fresh object, so a
  stored `corners` key is dropped silently; `SETTINGS_VERSION` stays 1.

### Top dock

- `DockId` gains `top`; `DOCK_IDS` is `left, right, top, bottom`. The top
  dock mirrors the bottom dock: panes side by side, `desired` in columns
  (default 30, minimum 8 content columns), height `size` (default 10,
  minimum 3), one gap row between it and the game pane, and that gap row
  resizes it.
- Geometry stays consistent with ADR 0012: the side docks run the full
  height above the input line; the top and bottom docks span the game
  column only, between the side docks. The input line stays full width at
  the very bottom.
- Space: the game pane keeps 5 rows. The bottom dock is sized first; if
  that leaves the top dock less than its minimum, the bottom dock gives up
  rows down to its own minimum. A dock still below its minimum is
  collapsed (derived, like narrow collapse). Resizing either dock is
  clamped so the other keeps what it shows.
- `movePane` keeps `desired` between docks on the same axis (left ↔
  right, top ↔ bottom) and resets it across axes.
- The 2-cell zone at the top screen edge over the game column opens a
  hidden top dock. Stored layouts without a top dock get an empty one.

### Floating model

- `LayoutModel.floating: FloatPane[]` next to `docks`, with `FloatPane =
  { id, x, y, w, h }`: the outer rectangle in cells (frame included),
  relative to the cockpit's top-left cell. Array order is z-order; the
  last is in front. Invariant: every pane appears exactly once across the
  docks and `floating`, whether on or off, so toggling a floating pane
  off and on keeps its rectangle.
- Model operations (`src/layout/model.ts`, pure): `floatPane` (from a
  dock or floating, to the front), `setFloatRect` (keeps z-order),
  `raisePane`, `findFloat`, `resizeRect` (drag edges n/s/e/w in whole
  cells within a minimum and the area); `movePane` also docks a floating
  pane (with the axis default `desired`). `findPane` finds docked panes
  only.
- Minimum floating size (`floatMin`): frame plus the pane's minimum
  content (8 columns × the pane's minimum rows). A pane floated without a
  shown rectangle gets 33 columns × its default rows + frame.
- Migration: floating entries after the docks, first occurrence wins,
  unknown or duplicate ids dropped, numbers clamped (0/1–1000); a missing
  `floating` becomes `[]`. "Reset layout" (`defaultLayout()`) returns
  every pane to the right column.

### Floating allocation

- Floating panes overlay the game pane and the docks and never change the
  docked allocation. `allocate` appends them to `LayoutResult.panes` after
  the docked panes, bottom to top, with `dock: 'float'` and `index` = the
  z-order.
- Clamping is derived on every layout, never stored (like narrow
  collapse): the shown rectangle is at least the minimum, at most the area
  above the input line, and moved inside it. The pane is therefore never
  off-screen, and returns to its stored place when the window grows
  again. Below 60 × 18 the too-small screen covers everything as before.
- The view gives a floating pane `z-index` 10 + its z-order (above the
  docked panes and the dock resize handles; the drop indicators are at
  100, the too-small notice at 200). Its fill is the pane tint, opaque
  (the "None" tint is the terminal background), so it hides what is
  behind it.

### Floating interaction

- **Float:** a docked pane dragged by its title row and dropped anywhere
  that is not a dock target (over the game pane, a gap or the input line)
  floats there at the size it shows now, with the pressed cell kept under
  the pointer. An accent outline (`.wc-drop-ghost`) shows where it will
  land; the pane itself does not move until the drop (no live reflow of
  the dock during a move).
- **Move:** a floating pane is dragged by its title row the same way; the
  outline shows the new place.
- **Dock:** a floating pane docks only from the 2-cell screen-edge zones
  (left, right, top and bottom of the game column): into a shown dock at
  the insertion point under the pointer (the usual insertion bar), or
  opening a hidden dock at its default size (the edge bar). It may lie
  over a dock, so moving it there must not dock it; a docked pane still
  docks anywhere over a shown dock.
- **Resize:** eight static handles inside a floating pane, shown only
  while it floats: a thin strip along each edge (top: the upper quarter of
  the title row; bottom: the lower 40 % of the last row; sides: 40 % of
  the frame column) and a whole cell at each corner (the corner glyph).
  Whole cells, minimum as above, up to the window; the opposite edges stay
  put. It previews live (docks are unaffected) and writes the settings on
  release.
- **Front:** any press on a floating pane brings it to front and writes
  the new order. A click still returns the focus to the input (Inv §1.3).
- One atomic relayout per frame and no animation, as in ADR 0012; game
  output never triggers a relayout.

## Consequences

- Consumers of `LayoutResult.panes` see `dock: 'float'` for floating
  panes; code that iterates a dock filters by dock id and is unaffected.
- A pane that floats keeps no docked `desired`; docking it again starts
  from the axis default.
- Stage 2's Options → Panes has no corner row.

## Amendment 2026-09-27 — input placement and standard float size

The owner's second test of stage 2 (`docs/stages/02-look-and-layout.md`,
"second test (docking)").

### Input line under the game pane

- The centre column is, top to bottom: top dock, gap row, game pane,
  input line, gap row, bottom dock. The input line (1 row, the 7-cell
  clock strip at its right end) sits directly under the game pane, with
  no gap, and is exactly as wide as the game pane.
- The left and right docks run the full window height, beside the input
  line and the bottom dock. A pane docked at the bottom sits under the
  input line.
- This replaces Cockpit's full-width input row at the very bottom (and
  the "Geometry" bullets of ADR 0012 and of this ADR that put the side
  docks and the top/bottom docks above a full-width input line).
- Space: the input row is never dropped. The game pane keeps
  30 × 5 cells; the top and bottom docks shrink and collapse as before,
  from the rows left after the game minimum and the input row. The
  too-small gate (60 × 18) is unchanged. NAWS still follows the game
  pane.
- The bottom screen-edge zone that opens or targets the bottom dock is
  the bottom 2 rows of the game column, which now includes the input row
  when the bottom dock is hidden. Dock resize from the gap rows is
  clamped as before (game 5 rows plus the input row).

### Floating panes and the input line

- Floating panes are clamped into the whole window (no longer the area
  above the input line) and may cover the input line, like anything else.
  This is the simpler rule: the input keeps the keyboard focus under a
  float, the float is always under the user's control (move or resize
  it), and a separate "keep out of the input row" rule would have made
  clamping depend on where the input happens to be.

### Standard float size

- A docked pane dragged out to float always gets a standard outer size
  of 36 × 14 cells (frame included; `FLOAT_STANDARD_W` /
  `FLOAT_STANDARD_H` in `src/layout/allocate.ts`), clamped to the
  window, placed where it is dropped. The drop outline shows that size
  during the drag. The pressed cell stays under the pointer, cut to the
  new width and height if it lay outside them.
- This replaces "floats there at the size it shows now" above: a tall
  side pane would otherwise float as a full-height strip.
- An already floating pane keeps its size when it is moved.
  `defaultFloatSize` (33 columns × default rows) is still used by the
  settings migration only.

## Amendment 2026-10-01 — shallower top edge zone

- The top screen-edge zone is the upper half of row 0, not 2 rows. Panes
  are dragged by their title row, so with a 2-row zone a floating pane
  could never be placed higher than row 2: the pointer docked it first.
- The pointer in the lower half of row 0 floats the pane at row 0. The
  left, right and bottom zones stay 2 cells (the grab offset and the clamp
  already let a pane reach those edges).
