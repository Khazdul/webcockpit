// The start page's arrival on a page (stage 73 part D, ADR 0155 addendum
// 2026-11-18, src/chrome/start-arrival.ts): which addresses arrive, the
// end two frames after `endArrival`, the safety timeout.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARRIVAL_MS, arrivalOf, arriving, beginArrival, endArrival, onArrival } from '../../src/chrome/start-arrival';

describe('arrivalOf', () => {
  it('names the page the watch page’s Back asks for', () => {
    expect(arrivalOf('?community')).toBe('community');
    expect(arrivalOf('?community&cloudtest')).toBe('community');
    expect(arrivalOf('?cloudtest&community')).toBe('community');
    expect(arrivalOf('?account')).toBe('account');
    expect(arrivalOf('?account=published')).toBe('account');
  });

  it('is null for every other start page address', () => {
    expect(arrivalOf('')).toBeNull();
    expect(arrivalOf('?cloudtest')).toBeNull();
    expect(arrivalOf('?kit')).toBeNull();
    expect(arrivalOf('?communityx')).toBeNull();
  });
});

describe('the arrival', () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => frames.push(fn));
  });
  afterEach(() => {
    beginArrival(false);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const frame = (): void => {
    const now = frames;
    frames = [];
    for (const f of now) f(0);
  };

  it('ends two frames after endArrival, and says so once', () => {
    const seen: boolean[] = [];
    const off = onArrival((on) => seen.push(on));
    beginArrival(true);
    expect(arriving()).toBe(true);
    endArrival();
    endArrival();
    expect(arriving()).toBe(true);
    frame();
    expect(arriving()).toBe(true);
    frame();
    expect(arriving()).toBe(false);
    expect(seen).toEqual([true, false]);
    off();
  });

  it('ends on its own after ARRIVAL_MS (a slow link: the menu shows)', () => {
    beginArrival(true);
    vi.advanceTimersByTime(ARRIVAL_MS - 1);
    expect(arriving()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(arriving()).toBe(false);
  });

  it('endArrival without an arrival does nothing', () => {
    beginArrival(false);
    endArrival();
    expect(frames).toHaveLength(0);
    expect(arriving()).toBe(false);
  });
});
