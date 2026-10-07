// Boot loader helpers (ADR 0083): the font gate, the reveal stagger and the
// no-op loader calls where index.html's loader is absent.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REVEAL_SPAN_MS, bootDone, bootQuote, bootStep, gate, revealDelay, takeBootBanner } from '../../src/app/boot-progress';

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { __wcBoot?: unknown }).__wcBoot;
});

describe('gate', () => {
  it('resolves when the promise resolves', async () => {
    let done = false;
    const p = gate(Promise.resolve(), 4000).then(() => (done = true));
    await p;
    expect(done).toBe(true);
  });

  it('resolves when the promise rejects', async () => {
    await expect(gate(Promise.reject(new Error('font')), 4000)).resolves.toBeUndefined();
  });

  it('resolves after the timeout when the promise never settles', async () => {
    vi.useFakeTimers();
    let done = false;
    void gate(new Promise(() => {}), 4000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(3999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});

describe('revealDelay', () => {
  it('runs from 0 at the top to the span at the bottom', () => {
    expect(revealDelay(0, 600)).toBe(0);
    expect(revealDelay(300, 600)).toBe(Math.round(REVEAL_SPAN_MS / 2));
    expect(revealDelay(600, 600)).toBe(REVEAL_SPAN_MS);
  });

  it('clamps rows outside the page and an empty page', () => {
    expect(revealDelay(-20, 600)).toBe(0);
    expect(revealDelay(900, 600)).toBe(REVEAL_SPAN_MS);
    expect(revealDelay(10, 0)).toBe(0);
  });
});

describe('loader calls', () => {
  it('are no-ops without a loader', () => {
    expect(() => {
      bootStep(50, 'x');
      bootDone();
    }).not.toThrow();
  });

  it('reach the loader when there is one, and never throw from it', () => {
    const step = vi.fn();
    const done = vi.fn(() => {
      throw new Error('broken');
    });
    (globalThis as { __wcBoot?: unknown }).__wcBoot = { step, done };
    bootStep(40, 'Loading interface');
    expect(step).toHaveBeenCalledWith(40, 'Loading interface');
    expect(() => bootDone()).not.toThrow();
    expect(done).toHaveBeenCalled();
  });
});

describe('hand-over from the first paint', () => {
  it('gives the banner clock once, then null', () => {
    const banner = { anims: [{ period: 12, phase: 0.5 }], t0: 42 };
    (globalThis as { __wcBoot?: unknown }).__wcBoot = { step() {}, done() {}, banner, quote: 3 };
    expect(takeBootBanner()).toBe(banner);
    expect(takeBootBanner()).toBeNull();
    expect(bootQuote()).toBe(3);
  });

  it('is empty without a first paint', () => {
    expect(takeBootBanner()).toBeNull();
    expect(bootQuote()).toBeNull();
  });
});
