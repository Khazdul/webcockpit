# Stage 15 — Spanning panes (a pane across all lanes of a dock)

Owner request 2026-10-03: in a dock with several lanes (stage 13), a pane
that runs across all of them, e.g. the Map at the top of a two-column
right dock with the two columns below it. Works in all four docks: in the
left and right docks spans sit above and below the columns, in the top
and bottom docks left and right of the rows. Owner decisions and the
approved mockup: ADR 0067.

## Plan

1. Model: `DockState.head` / `tail` spans, `LaneRef`, fold to one lane,
   model operations with spans, migration (missing spans → empty,
   duplicates head → lanes → tail, fold).
2. Allocation: spans and the lanes block (region) split along the dock;
   layouts without a shown span pane exactly as before; drop rule for the
   binding lane; `SpanBox`, `DockBox.region`.
3. View: region strips and span stacks as drop targets, dock-wide bar and
   dashed outline of the resulting box, span-aware screen-edge zones,
   handles inside span stacks and between spans and lanes.
4. Consumers: `wantPaneSize` / `want` for span panes, viewer and replay
   (via migration), Reset layout.
5. Tests: unit (model, allocation, migration, drop targets, script panes,
   viewer) and e2e (Chromium + Firefox).
6. Docs: ADR 0067, ADR 0064 cross-reference, this file.

## Tasks

- [x] Model, fold invariant and migration
- [x] Allocation with spans (fast path unchanged)
- [x] View: strips, span stacks, bar and ghost preview, edge zones
- [x] Handles: inside span stacks, span ↔ lanes boundary
- [x] Consumers: `wantPaneSize`, script-pane `want`, Reset layout
- [x] Unit tests
- [x] E2E tests (Chromium + Firefox)
- [x] ADR 0067
- [ ] Release
- [ ] Owner test

## Test guide

Open https://mumecockpit.com/ (hard reload so the new version loads).

1. **Two columns.** Drag a pane from the right column by its title row to
   the left edge band of the column (as in stage 13) to get a second
   column. Switch the Map on and dock it into one of the columns (drag it
   to the right screen edge, then into a column).
2. **Make the Map span.** Drag the Map by its title row and hold it over
   the **first row of the columns** (the title row of the top panes). A
   bar runs across the whole dock and a dashed outline shows the box the
   Map will get. Drop: the Map spans both columns at the top, the columns
   continue below it. The last row of the columns does the same for the
   bottom.
3. **A pane under it.** Drag another pane over the Map (its lower half):
   it joins the span stack under the Map, also across both columns.
4. **Resize.** Drag the boundary between the span stack and the columns
   up and down: the span pane grows or shrinks, the top pane of each
   column takes the opposite change. Pane boundaries inside the stack
   work as in a column.
5. **Back into a column.** Drag a span pane onto a column (below the
   title row of the column's top pane): it goes into that column. Float
   it, or empty one of the two columns: the spans fold into the column
   that is left.
6. **Bottom dock.** Make two rows in the bottom dock (stage 13), then
   drag a pane to the **left end of the rows** (the first columns): it
   spans both rows at the left. The right end does the same on the right.
7. **Reload** keeps everything. **Options → Reset layout** returns to one
   right column without spans.

Feedback wanted: is the strip (the first or last row of the columns) easy
to hit? Is the dashed outline clear about where the pane will land?

## Owner feedback

2026-10-03: overview test OK, approved.
