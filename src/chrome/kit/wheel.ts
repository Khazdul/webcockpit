// TUI kit: the wheel as whole row steps. A trackpad sends many small wheel
// events per swipe and a mouse one big one per notch, so a frame that
// moved a fixed number of rows per event ran away under a trackpad. The
// deltas are summed per element and paid out one step per `pxPerStep`.

/** Px per row step: about three rows for a mouse notch (~120 px). */
export const WHEEL_ROW_PX = 40;

/** Px per step for lists that move one item per mouse notch. */
export const WHEEL_NOTCH_PX = 120;

/** Px a wheel line (deltaMode 1, Firefox) and page (deltaMode 2) count as. */
const LINE_PX = WHEEL_ROW_PX;
const PAGE_PX = 10 * WHEEL_ROW_PX;

const rest = new WeakMap<object, number>();

/** The wheel event's vertical delta in px. */
export function wheelPx(e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
  return e.deltaMode === 1 ? e.deltaY * LINE_PX : e.deltaMode === 2 ? e.deltaY * PAGE_PX : e.deltaY;
}

/**
 * Whole steps (positive = down) the wheel moved since the last call for the
 * same element (`e.currentTarget`); the remainder carries over until the
 * direction turns.
 */
export function wheelSteps(e: Pick<WheelEvent, 'deltaY' | 'deltaMode' | 'currentTarget'>, pxPerStep = WHEEL_ROW_PX): number {
  const px = wheelPx(e);
  if (px === 0) return 0;
  const key = (e.currentTarget as object | null) ?? rest;
  const prev = rest.get(key) ?? 0;
  let acc = Math.sign(px) === Math.sign(prev) ? prev + px : px;
  const steps = Math.trunc(acc / pxPerStep) || 0; // not -0
  acc -= steps * pxPerStep;
  rest.set(key, acc);
  return steps;
}
