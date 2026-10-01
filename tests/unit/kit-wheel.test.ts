import { describe, expect, it } from 'vitest';
import { WHEEL_NOTCH_PX, WHEEL_ROW_PX, wheelSteps } from '../../src/chrome/kit/wheel';

const ev = (deltaY: number, currentTarget: object, deltaMode = 0) =>
  ({ deltaY, deltaMode, currentTarget }) as unknown as WheelEvent;

describe('wheelSteps', () => {
  it('pays out whole steps from summed trackpad deltas', () => {
    const el = {};
    let total = 0;
    for (let i = 0; i < 20; i++) total += wheelSteps(ev(4, el));
    expect(total).toBe(Math.trunc(80 / WHEEL_ROW_PX));
  });

  it('gives about three rows per mouse notch, one with the notch step', () => {
    expect(wheelSteps(ev(120, {}))).toBe(3);
    expect(wheelSteps(ev(-120, {}), WHEEL_NOTCH_PX)).toBe(-1);
    expect(wheelSteps(ev(3, {}, 1))).toBe(3);
  });

  it('drops the remainder when the direction turns, per element', () => {
    const a = {};
    const b = {};
    expect(wheelSteps(ev(30, a))).toBe(0);
    expect(wheelSteps(ev(30, b))).toBe(0);
    expect(wheelSteps(ev(-30, a))).toBe(0);
    expect(wheelSteps(ev(15, b))).toBe(1);
  });
});
