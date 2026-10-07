# 0084 — Script pane close cross and grab cursor; hover outline for borderless panes

- Status: Accepted
- Date: 2026-10-08
- Amends: ADR 0065 (round 2: no close cross on a borderless script pane;
  the soft grip)

## Context

Stage 25 A: the owner reported that script panes (almanac, key manager)
show no grab cursor near their top edge and no close cross on hover,
unlike the built-in panes, and asked for a discreet outline when hovering
a pane without a border.

Root cause: both are deliberate rules of ADR 0065 for a *borderless*
ordinary script pane. Its title-row grip takes no pointer events (the
soft grip: a press on the top content row becomes a move only after the
pointer travels, so links there stay clickable), so nothing showed the
grab cursor; and the CSS hid its close cross outright
(`.wc-pane-script:not([data-framed]) > .wc-pane-close`), because on the
pane bar it covered the last button. A framed script pane already had
both; the owner's panes were borderless.

## Decision

- **Grab cursor.** A borderless script pane shows the `grab` cursor over
  its top screen row wherever no link is (the pointer cursor wins on a
  link), the same row the cockpit's soft grip drags from. `ScriptPane`
  knows it is unframed from its placement. A framed pane is unchanged
  (the frame's title row is the grip).
- **Close cross.** A borderless script pane shows the cross on hover like
  a built-in pane, except while a link or a text field lies under it (the
  top screen row's cells from four in from the right edge to the
  second-last; the last column is the resize corner). `ScriptPane` marks
  that case `data-no-cross` after every render, placement and scroll, and
  the CSS hides the cross then. This keeps ADR 0065's reason (never cover
  a button: the pane bar fills its row with buttons to the last column)
  without an API option, works in the log player too (links are in the
  snapshot), and a pane whose top row ends in plain text or blanks gets
  the cross. Considered: hiding it on panes one row high (failed: the
  bar can float two rows high) and a `createPane` opt-out (more API and a
  snapshot field for what the content already tells).
- **Hover outline.** Hovering a pane without a frame (built-in or script,
  docked or floating) draws a 1 px line just inside its edge: an
  absolutely placed `::after` with an inset box shadow in
  `--pane-border`, the colour of the close cross, above the content
  (z-index 4) and without pointer events, so nothing moves or changes
  size. Framed panes get nothing. Only under `@media (hover: hover)`, not
  on the phone layout (`data-phone-tab`), and not while a drag is on (as
  the cross).

## Consequences

- Script authors' docs (manual, API reference) now say the cross shows on
  a borderless pane unless a link or field lies under it.
- On the default black tint the outline is the frame grey (#292929),
  discreet as asked; on the map pane's own grey background it is barely
  visible, but that pane is already set off by its colour.
