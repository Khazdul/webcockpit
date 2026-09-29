import { describe, expect, it } from 'vitest';
import { LINK_PROBE_URL, LinkProbe, defaultLinkFetch, lowerMedian } from '../../src/net/link-probe';
import { FakeTimers } from './net-helpers';

interface Call {
  url: string;
  init: RequestInit;
  resolve: () => void;
  reject: (e: Error) => void;
}

/** A fetch whose requests the test settles by hand. */
function make(opts: { timeoutMs?: number } = {}) {
  const timers = new FakeTimers();
  const calls: Call[] = [];
  const readouts: (number | null)[] = [];
  const probe = new LinkProbe({
    timers,
    fetch: (url, init) =>
      new Promise<unknown>((resolve, reject) => {
        calls.push({ url, init, resolve: () => resolve({}), reject });
      }),
    onReadout: (ms) => readouts.push(ms),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
  /** Lets the probe's promise chain run. */
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  /** Settles call `i` after `ms` of fake time. */
  const answer = async (i: number, ms: number): Promise<void> => {
    timers.advance(ms);
    calls[i]!.resolve();
    await flush();
  };
  return { timers, calls, readouts, probe, flush, answer };
}

describe('LinkProbe', () => {
  it('sends warm-ups, then times only the last request', async () => {
    const m = make();
    m.probe.start();
    expect(m.calls).toHaveLength(0);
    m.timers.advance(0); // first tick right away
    expect(m.calls).toHaveLength(1);
    await m.answer(0, 130); // warm-up 1 (new connection)
    expect(m.calls).toHaveLength(2);
    await m.answer(1, 95); // warm-up 2 (first tick only)
    expect(m.calls).toHaveLength(3);
    expect(m.readouts).toEqual([]);
    await m.answer(2, 38); // timed
    expect(m.readouts).toEqual([38]);
    expect(m.probe.readout).toBe(38);

    for (const c of m.calls) {
      expect(c.url.startsWith(LINK_PROBE_URL + '?lp=')).toBe(true);
      expect(c.init).toMatchObject({
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      expect(c.init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(new Set(m.calls.map((c) => c.url)).size).toBe(3); // cache-busted
  });

  it('ticks every 10 s with one warm-up and reports the lower median of 3', async () => {
    const m = make();
    m.probe.start();
    m.timers.advance(0);
    await m.answer(0, 130);
    await m.answer(1, 95);
    await m.answer(2, 38);
    m.timers.advance(9_999);
    expect(m.calls).toHaveLength(3);
    m.timers.advance(1);
    expect(m.calls).toHaveLength(4);
    await m.answer(3, 130); // warm-up
    await m.answer(4, 90); // timed
    expect(m.readouts.at(-1)).toBe(38); // [38, 90] → 38
    m.timers.advance(10_000);
    await m.answer(5, 130);
    await m.answer(6, 40);
    expect(m.readouts.at(-1)).toBe(40); // [38, 90, 40] → 40
    m.timers.advance(10_000);
    await m.answer(7, 130);
    await m.answer(8, 41);
    expect(m.readouts).toEqual([38, 38, 40, 41]); // [90, 40, 41] → 41
  });

  it('runs one tick at a time', async () => {
    const m = make({ timeoutMs: 60_000 });
    m.probe.start();
    m.timers.advance(0);
    m.timers.advance(30_000); // the warm-up is still out
    expect(m.calls).toHaveLength(1);
    await m.answer(0, 10);
    await m.answer(1, 10);
    await m.answer(2, 40);
    expect(m.readouts).toEqual([40]);
    m.timers.advance(10_000);
    expect(m.calls).toHaveLength(4);
  });

  it('times out a request, reports null and tries again next tick', async () => {
    const m = make();
    m.probe.start();
    m.timers.advance(0);
    await m.answer(0, 130);
    await m.answer(1, 95);
    m.timers.advance(5_000); // timed request unanswered
    await m.flush();
    expect(m.calls[2]!.init.signal!.aborted).toBe(true);
    expect(m.readouts).toEqual([null]);
    m.calls[2]!.resolve(); // a late answer changes nothing
    await m.flush();
    expect(m.readouts).toEqual([null]);
    m.timers.advance(10_000);
    expect(m.calls).toHaveLength(4);
    await m.answer(3, 130);
    await m.answer(4, 39);
    expect(m.readouts).toEqual([null, 39]);
  });

  it('reports null on a network error and skips the timed request', async () => {
    const m = make();
    m.probe.start();
    m.timers.advance(0);
    await m.answer(0, 130);
    await m.answer(1, 95);
    await m.answer(2, 38);
    m.timers.advance(10_000);
    m.calls[3]!.reject(new TypeError('Failed to fetch')); // warm-up fails
    await m.flush();
    expect(m.calls).toHaveLength(4);
    expect(m.readouts).toEqual([38, null]);
    expect(m.probe.readout).toBeNull();
    // Samples were cleared: the next readout is the new sample alone.
    m.timers.advance(10_000);
    await m.answer(4, 130);
    await m.answer(5, 60);
    expect(m.readouts).toEqual([38, null, 60]);
  });

  it('reports null when fetch throws synchronously', async () => {
    const timers = new FakeTimers();
    const readouts: (number | null)[] = [];
    const probe = new LinkProbe({
      timers,
      fetch: () => {
        throw new Error('blocked');
      },
      onReadout: (ms) => readouts.push(ms),
    });
    probe.start();
    timers.advance(0);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(readouts).toEqual([null]);
  });

  it('stop aborts the request in flight, drops its result and stops ticking', async () => {
    const m = make();
    m.probe.start();
    m.timers.advance(0);
    await m.answer(0, 130);
    await m.answer(1, 95);
    m.probe.stop();
    expect(m.calls[2]!.init.signal!.aborted).toBe(true);
    expect(m.probe.active).toBe(false);
    m.calls[2]!.resolve();
    await m.flush();
    m.timers.advance(60_000);
    expect(m.readouts).toEqual([]);
    expect(m.calls).toHaveLength(3);
  });

  it('start after stop begins a fresh run with two warm-ups and no old samples', async () => {
    const m = make();
    m.probe.start();
    m.timers.advance(0);
    await m.answer(0, 130);
    await m.answer(1, 95);
    await m.answer(2, 30);
    m.probe.stop();
    m.probe.start();
    expect(m.probe.readout).toBeNull();
    m.timers.advance(0);
    await m.answer(3, 130);
    await m.answer(4, 95);
    await m.answer(5, 50);
    expect(m.readouts).toEqual([30, 50]);
  });
});

describe('lowerMedian', () => {
  it('takes the middle, or the lower middle', () => {
    expect(lowerMedian([5])).toBe(5);
    expect(lowerMedian([90, 38])).toBe(38);
    expect(lowerMedian([38, 90, 40])).toBe(40);
  });
});

describe('defaultLinkFetch', () => {
  it('is null on a cross-origin isolated page', () => {
    const g = globalThis as { crossOriginIsolated?: boolean };
    const had = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated');
    try {
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: true, configurable: true });
      expect(defaultLinkFetch()).toBeNull();
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false, configurable: true });
      expect(typeof defaultLinkFetch()).toBe('function');
    } finally {
      if (had) Object.defineProperty(globalThis, 'crossOriginIsolated', had);
      else delete g.crossOriginIsolated;
    }
  });
});
