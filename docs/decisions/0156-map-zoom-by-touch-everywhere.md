# 0156 — Map zoom by touch everywhere: the pane by pointer type, the lens by pinch

- Status: Accepted (2026-11-16, stage 65 feedback round 3).
- Date: 2026-11-16
- Related: ADR 0059 (the wheel always zooms), ADR 0075 §3.3 (touch on the
  map pane), ADR 0136 §4 and ADR 0137's round 53k addendum (the lens and
  its four levels), ADR 0140 (a tablet uses the phone layout), ADR 0154
  (the watch page's frame), ADR 0155 (feedback round 3).

## Context

The owner (feedback round 3): on the phone the map cannot be pinch-zoomed;
check that zooming works on desktop and tablet too. What was found, per
surface:

- **The watch page's replay (phone and tablet).** The replay runs in the
  sandboxed frame (`src/replay/frame-main.ts`), which never calls
  `initDevice`: every device flag is off there, so the map pane wired its
  mouse handlers. A finger's pointer was taken for a mouse: one finger
  panned, the second was dropped, a pinch only panned. The same holds for
  the exported HTML replay file on a phone. The canvas has
  `touch-action: none`, so the page itself did not zoom either.
- **The live game and the run log player (phone and tablet).** The map is
  the lens (the run log player has it over the replay since stage 55). By
  design (ADR 0136 §4) the lens took no pinch: a tap stepped the four
  levels.
- **Desktop.** The wheel, with or without Ctrl, zooms the map everywhere,
  the watch page's frame included (verified; nothing changed). The map has
  no zoom buttons.

## Decision

1. **The map pane takes a finger by its pointer type**, not only by the
   device flag. Without the touch flag, a pointer whose `pointerType` is
   `touch` takes the touch path (one finger pans, two pan and pinch-zoom
   around their midpoint, ADR 0075 §3.3; a long press opens no browser
   menu); a mouse or pen keeps the mouse path. This fixes the frame and
   the HTML replay file without deciding device flags there (that would
   change the replay's layout and CSS), and gives a touch-screen laptop
   the same pinch.
2. **A pinch on the lens steps its levels.** Two fingers on the glass:
   spread by 1.35 (`LENS_PINCH_RATIO`) is one level nearer, drawn
   together by as much one level further, clamped at the nearest and the
   furthest (no wrap, unlike the tap; `pinchLevel`). The lens stays a
   stepping zoom: the same four levels, pips and `zoomTo`, no smooth zoom
   in between. A second finger ends a move or resize that was on (as a
   drop where it got to) and the hold; the pinch's release is no tap. The
   lens still takes no pan and no wheel. This replaces "no pinch" of ADR
   0136 §4.

## Consequences

- Tests: e2e `phone-watch-map-zoom.spec.ts` (pinch in and out and a
  one-finger pan on the watch page's map at a phone's and a tablet's size;
  the page's scale stays 1; failed before), `watch-map-zoom.spec.ts`
  (desktop wheel and Ctrl+wheel in the frame), `phone-map.spec.ts` (a
  pinch steps the lens's levels, clamped); unit `phone-lens-pinch`,
  `phone-lens-zoom` (`pinchLevel`).
