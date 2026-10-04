// Two-finger pinch on the map canvas (ADR 0075 §3.3), pure. One finger of
// two moved from `a0` to `a1` while the other went from `b0` to `b1` (any
// px space): the view pans by the midpoint's move and zooms around the new
// midpoint by the change in the fingers' distance, in wheel steps
// (`zoomAt`, ZOOM_STEP), so spreading the fingers to twice their distance
// makes the map twice as large. `zoomAt` clamps to ZOOM_MIN..ZOOM_MAX.

import { ZOOM_STEP } from './view';

export interface PinchPoint {
  x: number;
  y: number;
}

export interface PinchStep {
  /** Pan: the midpoint's move. */
  dx: number;
  dy: number;
  /** Zoom in wheel steps (positive: fingers apart, zoom in). */
  steps: number;
  /** The new midpoint, the zoom's anchor. */
  mx: number;
  my: number;
}

/** Below this distance (px) the fingers are too close to measure a scale. */
export const PINCH_MIN_DIST = 8;

export function pinchStep(a0: PinchPoint, b0: PinchPoint, a1: PinchPoint, b1: PinchPoint): PinchStep {
  const mx0 = (a0.x + b0.x) / 2;
  const my0 = (a0.y + b0.y) / 2;
  const mx = (a1.x + b1.x) / 2;
  const my = (a1.y + b1.y) / 2;
  const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
  const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
  const raw = d0 >= PINCH_MIN_DIST && d1 >= PINCH_MIN_DIST ? Math.log(d1 / d0) / Math.log(ZOOM_STEP) : 0;
  // Rounding noise of a parallel drag is no zoom.
  const steps = Math.abs(raw) < 1e-6 ? 0 : raw;
  return { dx: mx - mx0, dy: my - my0, steps, mx, my };
}
