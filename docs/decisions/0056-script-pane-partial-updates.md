# 0056 — Script pane partial updates and steady hover

- Status: Accepted
- Date: 2026-10-02
- Builds on ADR 0053 (script panes), ADR 0055 (text fields); owner
  feedback stage 12 round 4

## Context

The key manager's Port keys pane redraws every second while a watch
runs (the countdown). A hovered link lost its hover band and its tooltip
on every redraw, so a tooltip was gone a second after it appeared. The
owner asked for a well-designed way for any script to update parts of a
pane without disturbing the rest.

Why it happened: a redraw is `clear` (or `setLine`) and `setLink` again.
Every link gets a new id, and the pane dropped its hover when the
hovered id disappeared. The pointer had not moved, so nothing re-hovered
it until the next pointer move.

What already worked: `RowList` rebuilds only the row elements whose key
(text, colours, band) changed, and the run recorder writes a delta of the
changed rows only, with links compared without ids. So unchanged content
costs neither DOM work nor record space; only the hover state was fragile.

## Decision

### 1. Hover belongs to the pointer, not to a link id

- The pane keeps the pointer's position (client px) while it is over the
  content. After every render the link under it is looked up again in
  the new content (`linkAt` of the cell under the pointer, scroll
  included).
- **Link identity is its place**: the same row, column and length. If the
  link under the pointer is at the same place as the hovered one, it is
  "the same link": the hover band stays and the tooltip stays open; its
  text is replaced in place when the hint changed. A link at another
  place (or none) moves the hover there (or ends it), as a pointer move
  would.
- Why place, not a script-given key: what the player points at is a
  place on the screen. A redraw that keeps a link where it was keeps the
  hover with no script changes at all (mercenaries and the key manager
  both redraw whole rows), and a link that moved away is genuinely no
  longer under the pointer. An optional key would only add an API to get
  the same result.
- A scroll ends the hover (the content moves under the pointer); the
  next pointer move resolves it again.

### 2. `pane:setText(row, col, text)` — write over cells, keep the rest

- Writes cecho text over the cells from `col` (1-based) on a text row,
  padding with spaces when the row is shorter. The row's other cells, its
  links and its text fields stay. On a gauge row it is an error.
- For a counter or a status cell that changes often: the script updates
  those cells without rewriting the row and adding its links again.
- Named regions were considered; `setText` plus a link at the same place
  covers them without new state in the pane.

### 3. Tooltip-only links

- `pane:setLink(row, col, len, nil, hint)`: a link without a function
  shows its hint on hover but is not clickable — no pointer cursor, no
  hover band, a click does nothing. For explanations on cells that are
  not buttons (the key manager's countdown).
- Recorded as `tip: true` on the link, so the log player draws it the
  same way.

### 4. Live hints are set, not computed

- A hint that changes (`2:31 left`) is updated by setting the link again
  (`setLink` at the same place, or with the row's redraw). By rule 1 the
  open tooltip's text updates in place.
- A hint function evaluated while the tooltip shows was rejected: it
  would call Lua from the renderer (pane method calls never call back,
  ADR 0053), it needs its own timer, and runs could not record it.

### 5. No-op writes

- A `setLine` or `setText` that leaves a row's spans as they were does
  not bump the content version, so it schedules no render at all. Links
  are still replaced (the row's links go with `setLine`, as before), but
  links at the same places with the same hints leave the hover and the
  recorded state as they were.

## Consequences

- Scripts that redraw whole rows (the common pattern) keep a steady
  hover without changes. The key manager also moves its countdown to
  `setText` on its tick, so a tick writes three cells per key.
- Runs: unchanged rows are still not re-recorded; a `setText` is a delta
  of one row; `tip` adds a few bytes per tooltip-only link.
- Text fields are untouched by `setText` (their band is drawn over the
  cells anyway).
- Cost: one `linkAt` per render while the pointer is over a pane.
