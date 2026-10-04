import { describe, expect, it } from 'vitest';
import { PINCH_MIN_DIST, pinchStep } from '../../src/map/pinch';
import { ZOOM_STEP, defaultView, zoomAt } from '../../src/map/view';

describe('pinchStep (ADR 0075 §3.3)', () => {
  it('spreading to twice the distance is a 2× zoom around the unmoved midpoint, no pan', () => {
    const s = pinchStep({ x: 90, y: 100 }, { x: 110, y: 100 }, { x: 80, y: 100 }, { x: 110, y: 100 });
    // One finger moved: the midpoint moved half as far.
    expect(s.dx).toBeCloseTo(-5);
    expect(s.dy).toBe(0);
    expect(s.mx).toBe(95);
    expect(s.my).toBe(100);
    expect(ZOOM_STEP ** s.steps).toBeCloseTo(30 / 20);
    const both = pinchStep({ x: 90, y: 100 }, { x: 110, y: 100 }, { x: 80, y: 100 }, { x: 120, y: 100 });
    expect(both.dx).toBe(0);
    expect(ZOOM_STEP ** both.steps).toBeCloseTo(2);
  });

  it('pinching in zooms out; fingers moving together pan by the midpoint, no zoom', () => {
    expect(pinchStep({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 25, y: 0 }, { x: 75, y: 0 }).steps).toBeLessThan(0);
    const p = pinchStep({ x: 0, y: 0 }, { x: 40, y: 30 }, { x: 7, y: -3 }, { x: 47, y: 27 });
    expect(p).toEqual({ dx: 7, dy: -3, steps: 0, mx: 27, my: 12 });
  });

  it('fingers closer than PINCH_MIN_DIST do not zoom', () => {
    const d = PINCH_MIN_DIST - 1;
    expect(pinchStep({ x: 0, y: 0 }, { x: d, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 }).steps).toBe(0);
  });

  it('steps through zoomAt keep the wheel limits', () => {
    const v = defaultView();
    const s = pinchStep({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10_000, y: 0 });
    expect(zoomAt(v, s.steps, 0, 0, 100, 100).zoom).toBe(5);
  });
});
