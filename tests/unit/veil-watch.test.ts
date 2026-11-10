import { describe, expect, it } from 'vitest';
import { FloatVeilWatch, VEIL_LATE_COUNT, VEIL_LATE_MS, VEIL_SCRIPT_MAX_MS, VEIL_WINDOW } from '../../src/layout/veil-watch';

describe('FloatVeilWatch', () => {
  it('switches once two thirds of a window of quick frames with a hole are late', () => {
    const w = new FloatVeilWatch();
    const late = VEIL_LATE_MS + 20;
    let fired = 0;
    // A fast start: on time.
    for (let i = 0; i < VEIL_WINDOW; i++) fired += Number(w.frame(18, 1, true));
    expect(fired).toBe(0);
    for (let i = 0; i < VEIL_LATE_COUNT - 1; i++) fired += Number(w.frame(late, 1, true));
    expect(fired).toBe(0);
    expect(w.decided).toBe(false);
    expect(w.frame(late, 1, true)).toBe(true);
    expect(w.decided).toBe(true);
    // Once only.
    expect(w.frame(late, 1, true)).toBe(false);
  });

  it('judges late from what our own script does not explain', () => {
    const w = new FloatVeilWatch();
    for (let i = 0; i < VEIL_WINDOW * 2; i++) expect(w.frame(VEIL_LATE_MS + 5, 6, true)).toBe(false);
  });

  it('ignores frames without a hole and frames with a long script (a burst)', () => {
    const w = new FloatVeilWatch();
    for (let i = 0; i < VEIL_WINDOW * 2; i++) expect(w.frame(200, 1, false)).toBe(false);
    for (let i = 0; i < VEIL_WINDOW * 2; i++) expect(w.frame(300, VEIL_SCRIPT_MAX_MS + 1, true)).toBe(false);
    expect(w.decided).toBe(false);
  });

  it('a few late frames now and then (hardware compositing, p95) never switch', () => {
    const w = new FloatVeilWatch();
    for (let i = 0; i < 2000; i++) expect(w.frame(i % 20 === 0 ? 80 : 20, 1, true)).toBe(false);
  });
});
