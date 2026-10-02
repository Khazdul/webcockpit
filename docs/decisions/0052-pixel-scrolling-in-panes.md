# 0052 — Pixel scrolling in panes

- Status: Accepted
- Date: 2026-10-02
- Owner decision 2026-10-02 (stage 10, feedback round 1)
- Amends Inv §2.4 "Scroll", §2.6.1 "Scroll" / §2.6.2 "Wheel" and §2.7.5
  (wheel stepping by line, row or message); builds on ADR 0016, ADR 0017
  and ADR 0051 "Feedback round 1 — Native scrolling"

## Context

ADR 0051 round 1 gave every chrome list native pixel scrolling (the
wheel and the touchpad move by pixels, as CodeMirror does in EDITOR) but
left the Comm, UI messages and Timers panes as the inventory describes
them: one wheel step = one message or row, with a 40 px accumulator. On a
touchpad that reads as jumps. The owner decided on 2026-10-02 that these
three panes scroll like EDITOR too. The log player's paused wheel cursor
(Inv §7.5) stays: it moves a time cursor, it does not scroll.

## Decision

**Comm and UI** (`src/panes/anchored-list.ts`). The list is an ordinary
`overflow-y: auto` element with the browser bar hidden; the stack of
items sits at its bottom through `margin-top: auto`. Every item is in the
DOM (the panes cap their history at 1000).

- *Live* is "at the bottom within 2 px", set from `scroll` events. A
  render while live writes `scrollTop` to the end, so new messages
  follow; scrolled back, they land below the view and it stays put.
- *Hot path.* A render (one per frame, the pane's) appends only the new
  items and removes the ones the ring dropped; it rebuilds all only when
  its key (filters, light pane colours) changed or the items are not the
  previous ones plus new ones. Items dropped off the top while scrolled
  back are subtracted from `scrollTop` (their height is read before the
  write). A burst while live costs one append and one `scrollTop` write;
  browser scroll anchoring is off (`overflow-anchor: none`) so nothing
  compensates twice.
- *Indicator.* `↓ N newer messages` counts the items not wholly in view
  below it (binary search on `offsetTop`); a mouse down returns to live.
- *Comm timestamps* (Inv §2.7.3) still show only while scrolled back,
  but they follow `resting`, not `live`: the live state as of the moment
  the scrolling came to rest (150 ms without a `scroll` event). Then they
  are prepended to the rendered rows (or removed) through `keepView`,
  which keeps the item at the top of the view in place while the heights
  change. Changing heights mid-gesture failed in Firefox: it keeps
  animating a wheel scroll after a script writes `scrollTop`, so removing
  the timestamps on reaching the bottom moved the animation off the
  bottom, the timestamps came back, and the list stopped short of live.
- A list put back on screen with `scrollTop` reset to 0 while scrolled
  back gets its last position back.

**Timers** (`src/panes/timers.ts`). All rows go in a scroller
(`.wc-timers-scroll`, `listH` rows high: the pane less the indicator row
on overflow), the hit boxes inside it so they scroll with their cells.
The indicator is a fixed row below it, recomputed on `scroll`:
`↑ N rows above` (rows wholly or partly above; a press goes to the top)
once scrolled, else `↓ N more rows`. `timersLayout` is still pure and now
lays out every row; `timersIndicator` is the indicator. The corner `+`
belongs to the first row and scrolls with it (it yields when the first
row is a charm row); with partly scrolled rows a corner pinned to the
"top row" has no clean meaning. A mode switch and a disconnect still
reset the scroll to the top.

**Both.** The wheel over a pane outside its scroller (frame, title-row
grip, Comm header) scrolls the scroller by the same pixels
(`forwardWheel`). The log player's root wheel handler no longer calls
`preventDefault` over a pane, so the panes scroll natively in the log
player and the HTML replay too; elsewhere it moves the cursor as before.
No keys scroll these panes (they never take focus).

## Consequences

- Unit tests model layout through `ListMetrics` (scroll position, item
  tops); `tests/e2e/scrolling.spec.ts` checks a small wheel moves each
  pane by pixels and that following stops when scrolled back, in
  Chromium and Firefox.
- The Comm and UI panes hold up to 1000 row elements each instead of a
  screenful; a full rebuild (filter or theme change, archive seed) builds
  them all once.
- `WHEEL_STEP_PX` and the per-message offset are gone.
