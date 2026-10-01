import { describe, expect, it } from 'vitest';
import {
  KEY_ENTER,
  KEY_MACRO,
  PerfMonitor,
  Ring,
  percentile,
  scriptLabel,
  stats,
} from '../../src/app/perf-monitor';
import {
  PERF_USAGE,
  browserName,
  num,
  parsePerf,
  perfOutput,
  perfSummary,
  perfWorst,
  span,
  worstMoments,
} from '../../src/app/perf-command';
import type { StyledRow } from '../../src/ui/output-pane';

const text = (r: StyledRow): string => r.segs.map((s) => s.text).join('');

describe('percentile and stats', () => {
  it('uses the nearest rank', () => {
    const s = Float64Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(s, 50)).toBe(50);
    expect(percentile(s, 95)).toBe(95);
    expect(percentile(s, 99)).toBe(99);
    expect(percentile(s, 100)).toBe(100);
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([1, 2], 50)).toBe(1);
    expect(percentile([1, 2, 3], 50)).toBe(2);
    expect(percentile([], 50)).toBeNaN();
  });

  it('sorts numerically, whatever the order', () => {
    expect(stats(Float64Array.from([10, 2, 300, 4, 50]))).toEqual({ count: 5, median: 10, p95: 300, p99: 300, max: 300 });
    expect(stats(new Float64Array(0))).toBeNull();
  });
});

describe('Ring', () => {
  it('holds up to its capacity and overwrites the oldest', () => {
    const r = new Ring(4);
    expect(r.size).toBe(0);
    expect(r.oldest).toBeNaN();
    for (let i = 1; i <= 3; i++) r.push(i * 10, i, i * 2);
    expect(r.size).toBe(3);
    expect(r.wrapped).toBe(false);
    expect(r.oldest).toBe(10);
    for (let i = 4; i <= 6; i++) r.push(i * 10, i, i * 2);
    expect(r.size).toBe(4);
    expect(r.wrapped).toBe(true);
    expect(r.oldest).toBe(30);
    expect([0, 1, 2, 3].map((k) => r.entry(k).v)).toEqual([3, 4, 5, 6]);
    expect(r.stats()).toMatchObject({ count: 4, median: 4, max: 6 });
    expect(r.stats('a')).toMatchObject({ max: 12 });
  });

  it('lists the worst entries, largest first, with their labels', () => {
    const r = new Ring(8, true);
    [5, 1, 9, 3].forEach((v, i) => r.push(i, v, 0, 0, `e${v}`));
    expect(r.worst(2).map((e) => [e.v, e.label])).toEqual([
      [9, 'e9'],
      [5, 'e5'],
    ]);
  });

  it('clears', () => {
    const r = new Ring(2, true);
    r.push(1, 1, 0, 0, 'x');
    r.push(2, 2);
    r.push(3, 3);
    r.clear();
    expect(r.size).toBe(0);
    expect(r.wrapped).toBe(false);
    expect(r.stats()).toBeNull();
    r.push(4, 4);
    expect(r.entry(0)).toEqual({ t: 4, v: 4, a: 0, b: 0, label: '' });
  });
});

/** A fake window: `event` is what `keyStart` reads. */
function fakeWin(): { win: Window & typeof globalThis; setEvent: (e: { type: string; timeStamp: number } | undefined) => void } {
  const w: Record<string, unknown> = { event: undefined, document: { hidden: false, addEventListener() {}, removeEventListener() {} } };
  return { win: w as unknown as Window & typeof globalThis, setEvent: (e) => (w.event = e) };
}

function monitor(): { m: PerfMonitor; clock: { t: number }; setEvent: ReturnType<typeof fakeWin>['setEvent'] } {
  const clock = { t: 1000 };
  const { win, setEvent } = fakeWin();
  const m = new PerfMonitor({ win, now: () => clock.t, timeOrigin: 1_700_000_000_000 });
  return { m, clock, setEvent };
}

describe('PerfMonitor', () => {
  it('measures key -> send from the keydown to the first write, once per key', () => {
    const { m, clock, setEvent } = monitor();
    setEvent({ type: 'keydown', timeStamp: 995 });
    m.keyStart(KEY_ENTER);
    clock.t = 1002;
    m.sent(6, 6);
    m.sent(8, 14);
    m.keyEnd();
    expect(m.rings.keys.size).toBe(1);
    expect(m.rings.keys.entry(0)).toMatchObject({ v: 7, a: KEY_ENTER });
    expect(m.rings.sends.size).toBe(2);
    expect(m.rings.sends.entry(1)).toMatchObject({ v: 14, a: 8 });
  });

  it('does not time writes outside a key, or a line run without a keydown', () => {
    const { m, setEvent } = monitor();
    m.sent(4, 4);
    setEvent({ type: 'click', timeStamp: 1 });
    m.keyStart(KEY_MACRO);
    m.sent(4, 4);
    m.keyEnd();
    setEvent({ type: 'keydown', timeStamp: 1 });
    m.keyStart(KEY_MACRO);
    m.keyEnd();
    m.sent(4, 4);
    expect(m.rings.keys.size).toBe(0);
    expect(m.rings.sends.size).toBe(3);
  });

  it('records a frame and received -> shown after the frame rendered', () => {
    const { m, clock } = monitor();
    const recvPerf = 980;
    m.flushed(1000, 3, { rows: 12, runs: 40, receivedUs: (m.timeOrigin + recvPerf) * 1000 });
    m.flushed(1016, 1, { rows: 0, runs: 0, receivedUs: 0 });
    expect(m.rings.frames.size).toBe(0);
    clock.t = 1020;
    m.rendered();
    expect(m.rings.frames.size).toBe(2);
    expect(m.rings.frames.entry(0)).toMatchObject({ t: 1000, v: 3, a: 12, b: 40 });
    // Only the frame with game lines has a receive time.
    expect(m.rings.shown.size).toBe(1);
    expect(m.rings.shown.entry(0).v).toBeCloseTo(40, 6);
    expect(m.rings.shown.entry(0)).toMatchObject({ a: 12, b: 3 });
  });

  it('wraps a frame scheduler and records only the frames that flushed', () => {
    const { m } = monitor();
    const src = { flushCount: 0, flushStats: { rows: 2, runs: 3, receivedUs: 0 } };
    m.output = src;
    const frames: Array<() => void> = [];
    const req = m.frames((cb) => frames.push(cb));
    req(() => {
      src.flushCount++;
    });
    req(() => {});
    for (const f of frames) f();
    m.rendered();
    expect(m.rings.frames.size).toBe(1);
    expect(m.rings.frames.entry(0)).toMatchObject({ a: 2, b: 3 });
  });

  it('reset empties every ring and restarts the window', () => {
    const { m, clock } = monitor();
    m.sent(1, 1);
    clock.t = 5000;
    m.reset();
    expect(m.rings.sends.size).toBe(0);
    expect(m.since).toBe(5000);
  });

  it('labels a long frame script short', () => {
    expect(scriptLabel({ duration: 61.4, invoker: 'FrameRequestCallback', sourceFunctionName: 'flush', sourceURL: 'https://x/assets/index-abc.js?v=1' })).toBe(
      'FrameRequestCallback flush (index-abc.js) 61 ms',
    );
    expect(scriptLabel({ duration: 50 })).toBe('50 ms');
  });
});

describe('#perf formatting', () => {
  const env = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0', ratio: 2, clock: () => '21:03:12' };

  it('parses the argument', () => {
    expect(parsePerf('')).toBe('summary');
    expect(parsePerf('  ')).toBe('summary');
    expect(parsePerf('worst')).toBe('worst');
    expect(parsePerf('w')).toBe('worst');
    expect(parsePerf('{Worst}')).toBe('worst');
    expect(parsePerf('reset')).toBe('reset');
    expect(parsePerf('res')).toBe('reset');
    expect(parsePerf('nope')).toBeNull();
    expect(parsePerf('worstest')).toBeNull();
  });

  it('names the browser', () => {
    expect(browserName(env.userAgent)).toBe('firefox 132');
    expect(browserName('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36')).toBe('chrome 129');
    expect(browserName('Mozilla/5.0 AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0')).toBe('edge 129');
    expect(browserName('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15')).toBe('safari 17');
    expect(browserName('')).toBe('unknown browser');
  });

  it('formats spans and numbers', () => {
    expect(span(4_900)).toBe('4s');
    expect(span(12 * 60_000 + 4_000)).toBe('12m 04s');
    expect(span(3 * 3_600_000 + 5 * 60_000)).toBe('3h 05m');
    expect(num(0.24, 'ms')).toBe('0.2');
    expect(num(48.6, 'ms')).toBe('49');
    expect(num(2.4, '')).toBe('2');
    expect(num(NaN, 'ms')).toBe('-');
  });

  it('prints a summary row per measure', () => {
    const { m, clock, setEvent } = monitor();
    for (let i = 1; i <= 20; i++) {
      setEvent({ type: 'keydown', timeStamp: clock.t });
      m.keyStart(KEY_ENTER);
      clock.t += i / 10;
      m.sent(5, 5);
      m.keyEnd();
    }
    m.flushed(clock.t, 4, { rows: 10, runs: 30, receivedUs: (m.timeOrigin + clock.t - 5) * 1000 });
    clock.t += 8;
    m.rendered();
    clock.t = m.since + 12 * 60_000 + 4_000;
    const rows = perfSummary(m, env, 100);
    const lines = rows.map(text);
    expect(lines[0]).toBe('#perf last 12m 04s, firefox 132, pixel ratio 2');
    expect(lines[1]).toBe('  measure            count median    p95    p99    max');
    expect(lines[2]).toBe('  key -> send           20    1.0    1.9    2.0    2.0 ms');
    expect(lines[3]).toBe('  input delay            0      -      -      -      - ms  not supported');
    expect(lines[4]).toBe('  frame script           1    4.0    4.0    4.0    4.0 ms');
    expect(lines[5]).toBe('  received -> shown      1     13     13     13     13 ms');
    expect(lines[6]).toBe('  rows per frame         1     10     10     10     10');
    expect(lines[7]).toBe('  runs per frame         1     30     30     30     30');
    expect(lines[8]).toBe('  long frames            0      -      -      -      - ms  chromium only');
    expect(lines[9]).toBe('  socket buffer         20      5      5      5      5 B');
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.cls === 'wc-msg')).toBe(true);
    expect(rows[0]!.segs[0]).toEqual({ text: '#perf', cls: 'wc-syn-cmd' });
  });

  it('says how far back a full ring reaches', () => {
    const { m, clock } = monitor();
    for (let i = 0; i < m.rings.sends.capacity + 5; i++) {
      clock.t += 100;
      m.sent(1, 1);
    }
    const line = perfSummary(m, env).map(text).find((l) => l.includes('socket buffer'))!;
    expect(line).toMatch(/ B {3}last 3m 24s$/);
  });

  it('lists the worst moments, slowest first, with their context', () => {
    const { m, clock, setEvent } = monitor();
    setEvent({ type: 'keydown', timeStamp: 1000 });
    m.keyStart(KEY_MACRO);
    clock.t = 1030;
    m.sent(5, 5);
    m.keyEnd();
    m.flushed(1100, 45, { rows: 44, runs: 2400, receivedUs: (m.timeOrigin + 1090) * 1000 });
    clock.t = 1280;
    m.rendered();
    m.rings.loaf.push(1100, 150, 100, 80, 'FrameRequestCallback flush (index.js) 140 ms');
    clock.t = 1280 + 125_000;
    expect(worstMoments(m).map((w) => [w.what, w.v])).toEqual([
      ['received -> shown', 190],
      ['long frame', 150],
      ['frame script', 45],
      ['key -> send', 30],
    ]);
    const lines = perfWorst(m, env, 200).map(text);
    expect(lines[0]).toBe('#perf worst, slowest first');
    expect(lines[1]).toBe('  21:03:12  2m 05s ago  received -> shown    190 ms  44 rows, script 45 ms');
    expect(lines[2]).toBe('  21:03:12  2m 05s ago  long frame           150 ms  blocking 100 ms, forced layout 80 ms, FrameRequestCallback flush (index.js) 140 ms');
    expect(lines[3]).toBe('  21:03:12  2m 05s ago  frame script          45 ms  44 rows, 2400 runs');
    expect(lines[4]).toBe('  21:03:12  2m 05s ago  key -> send           30 ms  macro');
  });

  it('cuts a row to the pane', () => {
    const { m } = monitor();
    m.rings.loaf.push(0, 150, 100, 0, 'x'.repeat(200));
    const lines = perfWorst(m, env, 60).map(text);
    expect(lines[1]!.length).toBe(59);
    expect(lines[1]!.endsWith('…')).toBe(true);
  });

  it('says none, clears, and gives the usage', () => {
    const { m } = monitor();
    expect((perfOutput('worst', m, env) as StyledRow[]).map(text)).toEqual(['#perf worst none']);
    m.sent(1, 1);
    expect((perfOutput('reset', m, env) as StyledRow[]).map(text)).toEqual(['#perf cleared']);
    expect(m.rings.sends.size).toBe(0);
    expect(perfOutput('bogus', m, env)).toBe(PERF_USAGE);
  });
});
