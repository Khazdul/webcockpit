# 0106 — Scrollbar thumb drag

- Status: Accepted
- Date: 2026-10-31
- Related: stage 10 feedback round 1 (native scroll boxes and the `░█`
  bar, `src/chrome/kit/scroll.tsx`), ADR 0037 (EDITOR full width), ADR
  0075 (touch and phone), ADR 0103 (windows)

## Context

The owner reported that click and drag on a scrollbar does nothing (the
profile EDITOR, the script manual, and every other `░█` bar). The bars
only handled a press on the track (page toward it, or jump there with
`jump`); a press on the thumb was ignored. Besides the shared
`TuiScrollbar` there were three hand-rolled bars (the profile EDITOR and
script editor CodeMirror buffers, the LITE Commands box) and the Export
editor's overview map with its own thumb.

## Decision

- **One implementation:** `barPress(opts)` in `src/chrome/kit/scroll.tsx`
  returns the event props for one bar cell. `TuiScrollbar` uses it, and so
  do the hand-rolled bars, which keep their own markup (the look and the
  cell grid are unchanged). The scrolled element is passed per press: a
  scroll box, the textarea, or CodeMirror's `view.scrollDOM`.
- **Thumb drag:** a press on the thumb drags it. The content follows in
  proportion: the thumb's free travel (`cells − thumb` cells) maps onto the
  content's `scrollHeight − clientHeight`, by pixels (`dragScrollTop` in
  `nav.ts`, unit tested). Pointer events with `setPointerCapture` on the
  pressed cell, and the move and up listeners on the window, so the drag
  goes on outside the bar and on touch; the button coming up (or a
  cancel, or a lost capture) ends it.
- **Track press:** pages toward the press as before (the CodeMirror bars
  keep their own page step), and repeats while held (after 350 ms, every
  60 ms) until the thumb reaches the pointer; from then the press drags
  the thumb. A `jump` bar jumps there (`jumpScrollTop`) and drags on at
  once.
- **Focus and the game input:** the mousedown is still prevented, so a
  press neither moves the focus (the editor's zones stay as they are) nor
  starts a text selection. The pointerdown is not prevented, so the
  compatibility mouse events still fire; under capture the mouseup lands
  on the pressed cell inside the frame stack, whose mouseup handler keeps
  it from the game input's refocus (also in a window).
- **Touch:** the bars take `touch-action: none` and `user-select: none`,
  so a finger on a bar drags instead of panning.
- **Export map:** its thumb cells drag the log the same way; the rest of
  the map keeps its click-to-jump. A click that ends a drag is swallowed
  so it does not jump.

## Consequences

- Every `░█` bar drags; new bars get it by using `TuiScrollbar` or
  `barPress`.
- The cells of a bar must stay the same DOM elements during a drag (keyed
  or positional, only the class changing), or the capture is lost when the
  thumb moves.
- The LITE Commands box wraps and scrolls again: the phone's one-row
  `textarea.wc-field` rule had overridden its `pre-wrap` and vertical
  scrolling, so its bar showed a thumb for content that could not scroll.

## Addendum (2026-11-07, stage 47 wave 3)

About left the TUI grid in stage 47 (ADR 0132): its text is one leaf in
a native scroller, so it has no `░█` bar. Its two drag tests went with it:

- Desktop (`scrollbar-drag.spec.ts`): the case moved to the Statistics
  pane in its narrow layout, the last `░█` bar on the desktop that a test
  reaches without a live game (a replayed fixture fills it); its thumb
  drags in proportion and the drag goes on outside the bar.
- Phone (`phone-scrollbar-drag.spec.ts`): deleted. No `░█` bar is left on
  the phone that a test can reach cheaply: the Statistics pane is not on
  the phone, and the ESC menu's Statistics needs a live run with enough
  rows to scroll. The touch rules above (`touch-action: none`, pointer
  capture) are unchanged and shared with the desktop bars, but a finger
  drag is no longer covered end to end. Cover it again if a phone surface
  keeps a `░█` bar after the new look, or retire the rule with the bars.
