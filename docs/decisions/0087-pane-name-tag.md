# 0087 — Name tag on a long hover over a borderless pane

- Status: Accepted
- Date: 2026-10-08
- Extends: ADR 0084 (hover outline for borderless panes)

## Context

Stage 25 round 3 feedback: the hover outline shows where a borderless
pane is, but not which pane it is. The owner asked for a small, discreet
tooltip with the pane's name after hovering such a pane for 2 seconds.

## Decision

- Every non-phone pane gets a `.wc-pane-name` element (cockpit `attach`)
  with its label (` Map `), kept current on a retitle like the close
  cross's tooltip.
- It shows only on a borderless pane, at the top left, one cell in (where
  a frame puts its title), in the outline colour (`--pane-outline`) with
  the terminal foreground: it reads as a tab on the outline. Clipped to
  the pane width, no pointer events, above the content (z-index 4).
- The 2 s delay is pure CSS: `visibility` with a 2 s `transition-delay`
  on `:hover`, 0 s otherwise. Leaving hides it at once; the next hover
  starts over. No timers or pointer listeners. Same scope as the outline:
  `@media (hover: hover)`, not on the phone layout, not during a drag.
- Considered: the native `title` attribute (delay not controllable, would
  show on framed panes and fight child titles) and a tag that follows the
  pointer (needs JS listeners and a cockpit-level box, for no clear gain).

## Consequences

- On a one-row borderless pane (the pane bar) the tag covers its first
  cells while shown; clicks still pass through.
- The 2 s counts from entering the pane, not from the mouse resting.
