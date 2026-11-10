import { describe, expect, it } from 'vitest';
import { FloatVeilWatch, VEIL_LATE_COUNT, VEIL_LATE_MS, VEIL_MIN_SPAN_MS, VEIL_SCRIPT_MAX_MS, VEIL_WINDOW } from '../../src/layout/veil-watch';

/** A watch fed with a clock: each frame `gap` ms after the last. */
function fed(gap = 250) {
  const w = new FloatVeilWatch();
  let t = 0;
  return { w, frame: (shown: number, script: number, holes: boolean, step = gap) => w.frame((t += step), shown, script, holes) };
}

describe('FloatVeilWatch', () => {
  it('switches once two thirds of a window of quick frames with a hole are late', () => {
    const { w, frame } = fed();
    const late = VEIL_LATE_MS + 20;
    let fired = 0;
    // A fast start: on time.
    for (let i = 0; i < VEIL_WINDOW; i++) fired += Number(frame(18, 1, true));
    expect(fired).toBe(0);
    for (let i = 0; i < VEIL_LATE_COUNT - 1; i++) fired += Number(frame(late, 1, true));
    expect(fired).toBe(0);
    expect(w.decided).toBe(false);
    expect(frame(late, 1, true)).toBe(true);
    expect(w.decided).toBe(true);
    // Once only.
    expect(frame(late, 1, true)).toBe(false);
  });

  it('judges late from what our own script does not explain', () => {
    const { frame } = fed();
    for (let i = 0; i < VEIL_WINDOW * 2; i++) expect(frame(VEIL_LATE_MS + 5, 6, true)).toBe(false);
  });

  it('ignores frames without a hole and frames with a long script (a burst)', () => {
    const { w, frame } = fed();
    for (let i = 0; i < VEIL_WINDOW * 2; i++) expect(frame(200, 1, false)).toBe(false);
    for (let i = 0; i < VEIL_WINDOW * 2; i++) expect(frame(300, VEIL_SCRIPT_MAX_MS + 1, true)).toBe(false);
    expect(w.decided).toBe(false);
  });

  it('a few late frames now and then (hardware compositing, p95) never switch', () => {
    const { frame } = fed();
    for (let i = 0; i < 2000; i++) expect(frame(i % 20 === 0 ? 80 : 20, 1, true)).toBe(false);
  });

  it('a back-to-back run of late frames (a page load) does not decide; the same lateness over seconds does', () => {
    const { frame } = fed();
    // A window's worth of late lines within half the span: no decision.
    const quick = VEIL_MIN_SPAN_MS / VEIL_WINDOW / 2;
    for (let i = 0; i < VEIL_WINDOW * 2; i++) expect(frame(120, 1, true, quick)).toBe(false);
    // Still late as the seconds pass: it decides once the window spans enough.
    let n = 0;
    while (!frame(120, 1, true, 250)) n++;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(VEIL_WINDOW);
  });
});
