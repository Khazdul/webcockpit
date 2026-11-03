# Split scrollback — feasibility study

Date: 2026-11-03. Status: investigation only, nothing built. Owner request:
while scrolled back, keep a few live rows at the bottom of the game window
(the "split screen" of Mudlet, zMUD and others); scrolling back to the
bottom removes the split; the border between the halves can be dragged.

## Today

`src/ui/output-pane.ts` (ADR 0009, 0045, 0046). One scroller
(`.wc-scroller`) with rows in chunks of 200 (`content-visibility: auto`).
Scrolled back, the pane anchors one row itself through a ResizeObserver
(ADR 0045), and an absolute `.wc-tail-bar` covers the last cell row
("── N new lines ── PgDn / Esc to return ──"). Live rows land below the
view and cannot be seen until the player returns. Sending a command,
Esc and PgDn past the end return to the tail (Inv §1.1, Cockpit ADR 0127).

## Verdict

Feasible, contained to the output pane, and no cost at the live tail.
The pane's existing anchoring already handles the hard part (the scroller
changing size under a scrolled view).

## Design

- **Layout.** `.wc-output` is already a flex column. Add a divider row
  (replaces `.wc-tail-bar`, same look and text, now draggable) and a tail
  element below the scroller. Both are hidden at the tail. While scrolled
  the scroller shrinks to the share above the divider. No overlay: the
  tail sits in normal flow, so weather, clear panes and the transparent
  scrollbar are untouched.
- **Opening.** On entering scroll mode the scroller shrinks; the anchor
  keeps the top row in place, so the scrolled text does not move and the
  bottom part now shows live rows (the same rows that were there a moment
  before). PgUp from the tail opens the split first and then steps, so the
  old top row lands just above the divider.
- **Closing.** Scrolling the upper half to its bottom (wheel, scrollbar,
  PgDn), Esc, or (see Q1) sending a command. The scroller grows back and
  the existing pin-to-bottom takes over: the bottom of the upper half and
  the tail show the same rows, so the switch is seamless.
- **Tail contents.** Clones of the last rows (`cloneNode(true)`) plus the
  open partial, newest at the bottom, overflow clipped at the top. Built
  incrementally per flush while scrolled (append new clones, drop old
  ones), so a selection in the tail survives new output. Rows mutated
  after they were flushed are re-cloned: the command echo appended to the
  last prompt row (`renderEcho` on an open prompt, `OP_ECHO_ATTACH`, the
  most common case), and room notes inserted by `insertAfter` (ADR 0077)
  when their anchor row is in the tail. `aria-hidden` on the tail (the
  rows exist twice in the DOM).
- **Drag.** Pointer events with capture on the divider (the ADR 0106
  pattern: mousedown prevented, so the input keeps focus). Size kept as a
  share of the game window in `settings.output` (migration default), so
  it follows window resizes; clamped to at least 2 cell rows on each side;
  snaps to whole cell rows. The divider shows `row-resize` on hover.
- **NAWS.** `measureCells` must take rows from `.wc-output`, not the
  scroller, or opening the split would send a smaller window to MUME
  (MUME re-wraps and pages differently). Columns stay on the scroller's
  `clientWidth` (it excludes the classic scrollbar). Identical numbers at
  the tail, where the two heights are equal.
- **Copy and focus.** The tail gets the same mouseup handler (copy on
  select, refocus input); `.wc-output` already covers it in the cockpit's
  focus rule (`cockpit.ts` onMouseUp).
- **Log player and HTML replay.** Off (an option on `OutputPane`): the
  paused cursor moves through the scrollback with `scrollIntoView`, no
  new lines arrive while paused, and play returns to the tail. Today's
  behaviour unchanged there.

## Cost

- At the tail: nothing new runs (tail hidden, no clones).
- Scrolled back, per flush: a few clones (one per new row, plus one
  re-clone of the echoed prompt) and the layout of a box of ~5–20 rows.
  Well under 0.5 ms; the 50 ms frame budget (output-pane.ts header) is not at risk.
- Opening and closing: one scroller height change. Same width, so no
  rows re-wrap; `content-visibility` only re-evaluates chunks near the
  view. One `getBoundingClientRect` pair in the observer (ADR 0045).
- Memory: the tail holds a screenful of extra nodes while scrolled.

## Risks and what to test

1. **ADR 0045 e2e tests** (`tests/e2e/output.spec.ts`): the exact
   one-page PgUp/PgDn steps assume a fixed scroller height. They need the
   split open before the first step, or a split-off mode for the test.
   The anchoring guarantees must still hold (rows on screen do not move
   through trims, chunk heights and width changes).
2. **Touch scrolling on the phone.** Momentum scrolling while the
   scroller changes height (the split opens on the first swipe) has not
   been tried on iOS Safari or Android Chrome. Firefox's animated wheel
   scroll is not an issue on desktop: the game window scrolls the wheel
   itself (`onWheel`, `WHEEL_SCALE`).
3. **Phone height.** With the keyboard open there are ~10–15 rows; a
   split takes a share of them (see Q3).
4. **Wrapped rows in the tail.** The tail clips from the top, so a long
   wrapped row can show partly. Acceptable.
5. **Selection dragged off the bottom of the upper half** auto-scrolls,
   reaches the bottom and closes the split mid-selection. The selection
   stays (same DOM rows); worth a manual check.

## Owner questions

- **Q1. Sending a command while split.** Today Enter (and macro keys)
  snap back to the tail (Cockpit ADR 0127). With a split the player can
  read old text and keep playing. Keep the snap, or let the split stay
  until Esc, PgDn or scrolling down?
- **Q2. On by default, with an off switch** in Options → Appearance
  (next to Scrollback)? Off keeps today's behaviour exactly.
- **Q3. Phone.** Same feature with a smaller default tail, or off on the
  phone (it belongs to the parked phone stage)?
- **Q4. Default size.** Suggested: the tail takes 30 % of the game
  window.

## Files a stage would touch

`src/ui/output-pane.ts`, `src/ui/ui.css`, `src/player/player.css`
(divider hidden as the tail bar is), `src/app/app.ts` (option and live
setting), `src/settings/types.ts` and `migrate.ts`, the Options row,
`src/ui/input-pane.ts` only if Q1 changes the snap, unit tests in
`tests/unit/output-pane.test.ts`, e2e in `tests/e2e/output.spec.ts` and
`scrolling.spec.ts`, a new ADR, and Inv §1.1 / spec §2.2 notes.
