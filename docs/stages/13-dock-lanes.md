# Stage 13 — Dock lanes (several columns or rows per dock)

Owner request 2026-10-03, from a player: several columns when docking at
the right side, and the same for the other sides (columns left/right,
rows top/bottom). Design: ADR 0064.

## Plan

1. Model: `DockState.lanes`, migration of old layouts, model operations
   (move into a lane, new lane, lane sizes, removal of empty lanes).
2. Allocation: lanes side by side within a dock, each split as before.
3. View: drop targets for a lane and for a new lane, lane boundary
   handles, gap handle on the innermost lane.
4. Consumers: script-pane placement, viewer/runs, Options reset.
5. Tests: unit (model, allocate, migrate) and e2e (create a second
   column by drag, resize between lanes, empty lane disappears).
6. Release.

## Tasks

- [x] Model and migration
- [x] Allocation
- [x] View: drop targets and handles
- [x] Consumers updated
- [x] Unit tests
- [x] E2E tests (Chromium + Firefox)
- [ ] Release

## Test guide

Open https://mumecockpit.com/ (hard reload so the new version loads).

1. Drag a pane from the right column by its title row and hold it over
   the **left or right edge** of the right column (the outer 3 cells of
   the column). A vertical accent bar along the whole column edge shows a
   new column will be made. Drop: the pane gets a column of its own.
2. Drag more panes into either column (over the middle of a column, as
   before) and reorder them.
3. Drag the boundary between the two columns sideways: one grows, the
   other shrinks, the game pane stays the same width. Drag the gap next
   to the game pane: the inner column changes width.
4. Do the same at the bottom or top dock: the upper/lower edge of a row
   makes a new row.
5. Move the last pane out of a column: the column disappears and the game
   pane gets the space back.
6. Reload: the layout is kept. Options → Reset layout returns to one
   right column.

Feedback wanted: is the "edge of a column" target easy to hit? Is the
new column's default width (33, shrunk to fit) right?

## Owner feedback

(none yet)
