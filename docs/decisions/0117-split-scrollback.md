# 0117 — Split scrollback

- Status: Accepted
- Date: 2026-11-03
- Related: stage 35 (`docs/stages/35-split-scrollback.md`), study
  `notes/research/split-scrollback.md`. Amends Inv §1.1 ("Snap to tail on
  send", the scrolled indicator) and spec §2.2. Builds on ADR 0045
  (self-anchored scrolled view), ADR 0106 (drag pattern), ADR 0075 (touch).

## Context

Scrolled back, the game window showed only old text: live output landed
below the view, and the player had to return to the tail to follow the
game. The owner (2026-11-03) wants the split screen of other clients:
scrolled back, the bottom of the window keeps showing live rows; back at
the bottom the split goes; the border can be dragged.

## Decision

- **Desktop only.** The split is on when `device().touch` is false. It is
  always on there, with no setting to turn it off (owner). Touch devices
  (phones and tablets) keep today's behaviour unchanged: no split, the
  tail bar, snap to tail on send. The owner leans toward no split on
  touch; it can be revisited in the phone stage.
- **Layout.** `.wc-output` (a flex column) holds the scroller, a divider
  row and a tail element. At the tail both are hidden and nothing new
  runs. Scrolled back, the scroller shrinks to the share above the
  divider. No overlay: weather, clear panes and the scrollbar are
  untouched.
- **Opening and closing.** Entering scroll mode opens the split; the
  anchor (ADR 0045) keeps the top row in place, so the scrolled text does
  not move. PgUp from the tail opens the split before it steps. The split
  closes when the upper half reaches its bottom (wheel, scrollbar, PgDn)
  or on Esc; the scroller grows back and the tail is pinned as before.
- **Commands do not snap back** while split (owner): Enter and every other
  send leave the view where it is. Esc, PgDn and scrolling down return.
  On touch devices the snap stays.
- **Tail contents.** Clones of the newest rows and the open partial,
  newest at the bottom, clipped at the top, built incrementally while
  scrolled so a selection in the tail survives new output. Rows changed
  after their flush (the command echo appended to the prompt row, room
  notes inserted by `insertAfter`) are re-cloned. `aria-hidden`.
- **Divider.** Replaces the grey tail bar: a full-width TUI rule with the
  "N new lines" text set into it, drawn so it reads as a screen divider.
  Hover: `row-resize` cursor and a brighter rule. Drag: pointer capture,
  mousedown prevented (input keeps focus), snaps to whole cell rows, at
  least 2 rows on each side. The size is a share of the game window,
  `settings.output.splitShare`, default 0.3, saved when a drag ends.
- **Selection.** A mouse selection stays in the half it starts in: a
  drag from the upper half into the tail ends at the last row in view
  above the divider, one from the tail upward at the tail's first row
  (a `selectionchange` clamp during the drag, run once more before the
  copy). `user-select: none` on the tail did not keep its rows out of the
  copied text in either engine.
- **NAWS** is measured from `.wc-output` (rows) and the scroller's
  `clientWidth` (columns), so opening the split never changes the window
  size MUME sees.
- **Log player and HTML replay:** off (an `OutputPane` option); they keep
  today's behaviour.

## Consequences

- No cost at the live tail. Scrolled back: one clone per new row plus a
  re-clone of the echoed prompt per flush, and the layout of a box of a
  few rows.
- The ADR 0045 page-step e2e tests open the split before the first step.
- The rows in the tail exist twice in the DOM while scrolled.
