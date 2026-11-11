// The pane strip's swipe (ADR 0136 §5): a sideways drag changes the page.
// Pure: no DOM.
//
// A swipe is a press that ends at least `SWIPE_MIN_PX` to the side of where
// it began and clearly more sideways than up or down (`SWIPE_SLOPE` times),
// within `SWIPE_MAX_MS`. Anything else is the pane's own: a tap, a vertical
// scroll of its content, a slow drag.

/** The least sideways travel of a swipe, CSS px. */
export const SWIPE_MIN_PX = 48;
/** A swipe travels this many times farther sideways than up or down. */
export const SWIPE_SLOPE = 1.5;
/** A swipe takes no longer than this, ms. */
export const SWIPE_MAX_MS = 800;

/**
 * The page step of a press that moved by (`dx`, `dy`) px in `ms`: +1 (the
 * next page: the finger went left), −1 (the page before: it went right),
 * or 0 (not a swipe).
 */
export function swipeStep(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(ms >= 0) || ms > SWIPE_MAX_MS) return 0;
  const ax = Math.abs(dx);
  if (ax < SWIPE_MIN_PX || ax < Math.abs(dy) * SWIPE_SLOPE) return 0;
  return dx < 0 ? 1 : -1;
}
