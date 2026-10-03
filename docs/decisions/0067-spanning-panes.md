# 0067 — Spanning panes: panes across all lanes of a dock

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR 0064 (dock lanes: model, allocation, interaction), ADR 0065
  (edge-zone drops, `wantPaneSize`)

## Context

With dock lanes (ADR 0064) a dock can hold several columns (side docks)
or rows (top/bottom). Players then asked for a pane that runs across all
of them: in a right dock with two columns, the Map at the top across the
full dock width with the two columns below it. The owner approved the
feature and an interactive mockup of the drop targets.

Owner decisions:

1. Full-width spans only, before or after the block of lanes: no partial
   spans (over some lanes) and no span between lanes.
2. Spans are made only with a drop target (the "strip"), no modifier key.
3. A dock that goes down to one lane folds its spans into that lane; they
   are not restored when a second lane comes back.
4. New panes and the pane bar keep going to lane 0 (the outer lane), not
   into a span.

## Decision

### Model

- `DockState = { lanes: DockLane[]; head: DockPane[]; tail: DockPane[] }`.
  `head` panes span the dock before the lanes, `tail` panes after them,
  each list in stack order. In a side dock the head is above the columns
  and the tail below them; in the top/bottom dock the head is left of the
  rows and the tail right of them. The block of lanes is the dock's
  **region**.
- `DockPane.desired` keeps its meaning along the lane axis (rows in a side
  dock, columns in the top/bottom dock), so a span pane moves between a
  span and a lane of the same dock axis with its `desired` kept.
- `LaneRef = number | 'head' | 'tail'` names a place in a dock. `findPane`
  returns `{ dock, lane: LaneRef, index }` and `PaneBox.lane` is a
  `LaneRef`, so code that indexes `lanes[...]` with it no longer compiles
  without handling spans. `laneList(dock, ref)` gives the list.
- `dockPanes` lists head, lanes (lane by lane), tail.
- **Fold invariant:** `head` and `tail` are non-empty only when the dock
  has at least two lanes. `normalizeDock` (used by every model operation
  and by the migration) removes empty lanes and, with fewer than two
  lanes, folds the head onto the front of lane 0 and the tail onto its
  end (creating lane 0 at the dock's default size when only spans are
  left). A layout patch must therefore always carry `head` and `tail`;
  every `LayoutModel` the model operations return does.
- `defaultLayout()` has `head: []` and `tail: []` in every dock, so
  Options → Reset layout clears spans.

### Allocation

- A dock with no shown span pane is laid out exactly as before (the
  existing tests pin it; an extra test checks that a model whose span
  panes are all off allocates as the model without them).
- With spans the dock is split along its length by `allocateAxis` over
  `[...head, REGION, ...tail]`. `REGION` is a pseudo item: its minimum is
  the largest per-lane sum of (minimum + frame), its desired size the
  largest per-lane sum of (desired + frame), no frame of its own, never
  reserved (the Character/script reservation skips it) and it ranks for
  the leftover as its highest-priority member (`AxisItem.region`,
  `AxisItem.rankAs`). Each lane is then split along the region's length.
- Dropping when the minimums do not fit: the victim is chosen by the
  usual rule (the map first, then script panes from the end, then
  `DROP_ORDER`) among the span panes and the panes of the *binding* lanes
  only (those whose minimum sum equals the region's minimum); dropping
  from another lane would free nothing. A dropped span pane is hidden.
- A span's cross size is the dock's whole cross size: the sum of the
  shown lanes; when no lane has a shown pane but a span does, the sum of
  the stored lane sizes; never below the spans' cross minimum
  (`paneCrossMin`). When that minimum is above the lanes' sum the
  innermost lane takes the difference. The dock's minimum for collapse is
  the larger of its lanes' minimum sum and the spans' cross minimum.
- Narrow collapse and the top/bottom shrink rules are unchanged and work
  on the whole dock; `shrinkLanes` shrinks the region's lanes.
- `DockBox` gains `spans: SpanBox[]` (`{ side, rect, panes, mode }`, head
  before tail) and `region: Rect | null` (the whole dock without spans,
  null when no lane is shown). `LaneBox.rect` covers the region only.
- Pane order in `LayoutResult.panes` and `DockBox.panes`: head, lanes,
  tail.

### Interaction

- **Strips.** In a dock with at least two shown lanes, or with spans
  already, the region's first row (side dock) is the head strip and its
  last row the tail strip, across the whole region width. In the top/bottom
  dock the strips are the region's first and last
  `clamp(floor(len / 10), 1, 3)` columns, across all rows (`len` = the
  region's length). A drop on the head strip appends the pane to the head
  spans; on the tail strip it becomes the first tail span.
- **Span stacks** take a pane like a lane does: before the first span
  pane whose middle is past the pointer.
- **Priority:** span stack, then strip, then the lanes' new-lane bands,
  then the in-lane insert. A corner cell (strip and band) is a strip.
  Span stacks have no new-lane bands. The in-lane insert at the top of a
  lane stays: the upper half of a lane's first pane below its title row.
- **Preview:** a span target shows the insertion bar across the whole
  dock (`.wc-drop-bar[data-span]`) and a dashed outline
  (`.wc-drop-ghost[data-span]`) of the exact box the pane will get,
  computed by running `allocate()` on the moved model (cached per target
  during the drag).
- **No fold through a target:** a span target exists only when the pane
  stays in the span after the move. Moving the only pane of the second
  lane into a span would leave one lane and fold at once, so that strip
  falls through to the band and in-lane rules (over a span stack it is no
  target).
- **Dissolve:** drag a span pane into a lane, float it, or empty the dock
  down to one lane (fold).
- **Screen-edge zones** (amends ADR 0065): if the pointer's position
  along the dock is over a span stack, the pane goes into that stack at
  the pointer; otherwise the old rule applies (lane 0, or past a bar
  lane). Floating panes dock only through these zones, as before.

### Resize

- Pane boundaries inside a span stack are handles like in a lane.
- Lane-boundary handles run along the region only.
- The boundary between a span stack and the region is a new handle
  (`data-span="head|tail"`, drag kind `span`), placed like a pane
  boundary: the lower (right) 40 % of the last row (column) before the
  boundary, across the whole dock. Dragging it changes the `desired` of
  the span pane next to the boundary by the delta and, in every shown
  lane, the pane next to the boundary by the opposite delta, clamped so
  every pane keeps its minimum (`shiftSpanBoundary`).
- In a dock with spans every pane handle and the span handle first freeze
  the whole dock (all its shown panes' `desired` set to the sizes they
  show), so the boundary follows the pointer exactly and nothing else
  moves; spans and lanes share the dock's length, so freezing one lane
  is not enough.
- The gap handle is unchanged (it resizes the innermost shown lane; the
  spans follow the dock's width).

### Pane bar and script panes

- `appendToDock` / `placeScriptPane` keep using lane 0; `lane = "own"`
  adds a lane to the region only (decision 4).
- `wantPaneSize` (`pane:wantSize`): in a side dock `rows` becomes the span
  pane's desired rows as for any pane. In the top/bottom dock a span pane
  is never "alone in its lane" (its height is the dock's), so only `cols`
  applies; `want` returns true only when `cols` is given.

### Migration and downgrade

- `migrateLayout` reads `head`, then the lanes, then `tail` per dock
  (first occurrence of an id wins across all docks and `floating`),
  repairs each list as before, gives a missing or invalid `head`/`tail`
  an empty list, and then folds (`normalizeDock`). It is idempotent and
  cheap (`SettingsStore.applyUpdate` runs it on every update).
  `SETTINGS_VERSION` stays 1.
- Recorded runs and the viewer's layout go through the same migration;
  the viewer clones `LayoutModel` and keeps spans.
- **Downgrade:** an older client ignores `head` and `tail`. Built-in span
  panes are appended to lane 0 of the right dock as "missing", script
  panes are placed again by their scripts. Accepted.

## Out of scope

- Partial spans (over some lanes) and spans between lane blocks
  (decision 1).
- Restoring spans when a folded dock gets a second lane again
  (decision 3).
- A Lua parameter to create a pane in a span.

## Consequences

- A player can put a pane across a multi-column dock by dropping it on
  the first or last row of the columns, and see exactly where it lands.
- Code that walks a dock's panes must walk head, lanes and tail
  (`dockPanes`, `laneList`); the compiler flags direct lane indexing with
  a `LaneRef`.
- Older clients lose spans (they become ordinary panes in lane 0).

## Implementation notes (2026-10-03)

- **Model API** (`src/layout/model.ts`): `movePane(m, id, dock, lane:
  LaneRef, index)`, `isNoopMove` with `LaneRef`, `isNoopNewLane` is false
  for a span pane, `shiftSpanBoundary(span, edge, dock, delta)` returns the
  new content sizes (a `setDesired` input) rather than a model, like
  `shiftBoundary`; the cockpit applies them to the frozen model.
  `normalizeDock` and `laneList` live in `src/layout/types.ts`.
- **Freeze rule — deviation:** the plan froze only the region for the
  span handle; pane handles in a dock with spans also freeze the whole
  dock (see Resize), so a boundary inside a scaled span stack or lane
  follows the pointer exactly.
- **Strip vs. span stack order:** the span stack check runs before the
  strip (they never overlap: the strips lie inside the region).
- **Ghost cache** is keyed by dock, side and index and cleared when the
  drag ends; the layout does not change during a drag.
- **Region pseudo id** is `~region` (never a valid pane id) and never
  appears in results.
- A lane whose panes are all dropped while spans are shown leaves the
  region; its cross share goes to the innermost lane left (the same rule
  as a span wider than the lanes).
