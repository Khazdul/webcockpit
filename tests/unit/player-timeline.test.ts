// Log player: timeline parsing and mappings, the replay clock, the strip
// maths and the recorded-layout helpers (ADR 0018 "Log player").
import { describe, expect, it } from 'vitest';
import { CATCH_UP_US, ReplayClock } from '../../src/player/clock';
import { parseSize } from '../../src/player/engine';
import { overlayView, parseView, playerFontSize } from '../../src/player/fit';
import { MIN_VIEW_COLS, MIN_VIEW_ROWS } from '../../src/layout/allocate';
import {
  fitHints,
  fmtClock,
  hintsWidth,
  markRows,
  markersOf,
  offsetToRow,
  stripCells,
  yToOffset,
} from '../../src/player/strip';
import {
  ENTRY_GMCP,
  ENTRY_IN,
  ENTRY_OUT,
  ENTRY_SIZE,
  ENTRY_VIEW,
  buildTimeline,
  countAt,
  entryText,
  hasInk,
  logUsAt,
  playAtLogUs,
  runAt,
} from '../../src/player/timeline';
import { defaultSettings } from '../../src/settings';
import { nominalCell } from '../../src/theme/cells';
import type { RunEvent } from '../../src/runs/events';
import { BASE_US, type LogItem, makeLog, meta, twoRunChain } from './player-helpers';

describe('buildTimeline', () => {
  it('reads every entry kind with its body, in chain order', () => {
    const tl = buildTimeline(twoRunChain());
    expect(tl.n).toBe(13);
    expect(Array.from(tl.kind.slice(0, 8))).toEqual([
      ENTRY_GMCP,
      ENTRY_SIZE,
      ENTRY_VIEW,
      ENTRY_IN,
      ENTRY_IN,
      ENTRY_IN,
      ENTRY_OUT,
      ENTRY_IN,
    ]);
    expect(entryText(tl, 0)).toBe('Char.Name {"name":"Rasta","fullname":"Rasta the Ranger"}');
    expect(entryText(tl, 1)).toBe('{"cols":120,"rows":40}');
    expect(entryText(tl, 6)).toBe('look');
    expect(entryText(tl, 5)).toBe('oO>');
    expect(tl.runs.map((r) => [r.first, r.end])).toEqual([
      [0, 10],
      [10, 13],
    ]);
    expect(Array.from(tl.run)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1]);
  });

  it('collapses gaps over 10 s inside a run and between runs; log time keeps them', () => {
    const tl = buildTimeline(twoRunChain());
    const play = Array.from(tl.play).map((p) => Math.round(p));
    // The lead-in up to `Hello.` (1 s) takes no time; then 1, 0.5, 0.5 s,
    // a 60 s gap (0), 7 s kept; run 2's lead-in (after an hour) up to
    // `Again.` none; 4 s.
    expect(play).toEqual([0, 0, 0, 0, 0, 1000, 1500, 2000, 2000, 9000, 9000, 9000, 13000]);
    expect(tl.durationMs).toBeCloseTo(13000, 3);
    expect(tl.ts[8]! - tl.ts[7]!).toBe(60e6);
  });

  it('keeps an empty Enter, a bare prompt and skips unknown records and junk', () => {
    const text =
      makeLog(BASE_US, [{ at: 0, out: '' }, { at: 1, in: '>' }]) +
      `${String(BASE_US + 2e6)} \x1bNOTE something\n` +
      'not a log line\n' +
      `${String(BASE_US + 3e6)} \x1bVIEW\n`;
    const tl = buildTimeline([{ meta: meta('X/1', BASE_US), text }]);
    expect(tl.n).toBe(2);
    expect(tl.kind[0]).toBe(ENTRY_OUT);
    expect(entryText(tl, 0)).toBe('');
    expect(tl.kind[1]).toBe(ENTRY_IN);
    expect(entryText(tl, 1)).toBe('>');
  });

  it('maps playback time to entries, log time and runs', () => {
    const tl = buildTimeline(twoRunChain());
    expect(countAt(tl, -1)).toBe(0);
    expect(countAt(tl, 0)).toBe(4); // the lead-in and the first line at once
    expect(countAt(tl, 0.5)).toBe(5);
    expect(countAt(tl, 999)).toBe(5);
    expect(countAt(tl, 1000)).toBe(6);
    expect(countAt(tl, 2000)).toBe(9); // the collapsed gap's far side shows at once
    expect(countAt(tl, 9000)).toBe(12);
    expect(countAt(tl, 13000)).toBe(13);
    // At 00:00 the clock is at the first line, past the lead-in.
    expect(logUsAt(tl, 0)).toBe(BASE_US + 1e6);
    // Log time moves with playback inside a kept gap …
    expect(logUsAt(tl, 500)).toBeCloseTo(BASE_US + 1.5e6, -1); // 1.0002 s + 499.8 ms
    // … and jumps over a collapsed one.
    expect(logUsAt(tl, 2000)).toBe(BASE_US + 63e6);
    expect(logUsAt(tl, 5500)).toBe(BASE_US + 66.5e6);
    expect(runAt(tl, 8999)).toBe(0);
    expect(runAt(tl, 9000)).toBe(1);
    expect(runAt(tl, -5)).toBe(0);
  });

  it('maps log time back to playback time (markers, the cursor)', () => {
    const tl = buildTimeline(twoRunChain());
    expect(playAtLogUs(tl, BASE_US - 5)).toBe(0);
    expect(playAtLogUs(tl, BASE_US + 0.5e6)).toBe(0); // inside the lead-in
    expect(playAtLogUs(tl, BASE_US + 3e6)).toBe(2000);
    expect(playAtLogUs(tl, BASE_US + 30e6)).toBe(2000); // inside the collapsed gap
    expect(playAtLogUs(tl, BASE_US + 64e6)).toBe(3000);
    expect(playAtLogUs(tl, BASE_US + 3600.5e6)).toBe(9000); // run 2's lead-in
    expect(playAtLogUs(tl, BASE_US + 3601e6)).toBe(9000);
    expect(playAtLogUs(tl, BASE_US + 9999e6)).toBe(13000);
    // Round trip at entry times.
    for (let i = 0; i < tl.n; i++) expect(countAt(tl, playAtLogUs(tl, tl.ts[i]!))).toBeGreaterThan(i);
  });
});

describe('lead-in', () => {
  // A run as the recorder writes it after a real login: Comm.Channel.List
  // at connect, 8 s of typing the name and password, Char.Name, the view,
  // the width commands, the first vitals, and the first text 0.4 s later.
  const login = (base: number, first: LogItem) =>
    makeLog(base, [
      { at: 0, gmcp: 'Comm.Channel.List', json: [] },
      { at: 8, gmcp: 'Char.Name', json: { name: 'Rasta', fullname: 'Rasta the Ranger' } },
      { at: 8.00005, view: { appearance: { size: 14 } } },
      { at: 8.00005, size: { cols: 200, rows: 60 } },
      { at: 8.0001, out: 'change width all 500' },
      { at: 8.0001, out: 'change width table terminal' },
      { at: 8.0002, gmcp: 'Char.Vitals', json: { hp: 100 } },
      { at: 8.3, in: '' },
      { at: 8.35, in: '\x1b[0m  \x1b[32m' },
      first,
      { at: 10.4, in: 'Two seconds later.' },
    ]);

  it('delivers the login GMCP, the view and blank lines at 00:00; text shows at once', () => {
    const text = login(BASE_US, { at: 8.4, in: 'Welcome to MUME!' });
    const tl = buildTimeline([{ meta: meta('Rasta/a', BASE_US), text }]);
    expect(tl.n).toBe(11);
    expect(Array.from(tl.play.slice(0, 10))).toEqual(new Array(10).fill(0));
    expect(entryText(tl, 9)).toBe('Welcome to MUME!');
    expect(countAt(tl, 0)).toBe(10);
    expect(logUsAt(tl, 0)).toBe(BASE_US + 8.4e6);
    expect(tl.play[10]).toBeCloseTo(2000, 6);
    expect(tl.durationMs).toBeCloseTo(2000, 6);
    // An event of the lead-in (run_start at Char.Vitals) marks 00:00.
    expect(playAtLogUs(tl, BASE_US + 8.0002e6)).toBe(0);
  });

  it('ends at a typed command (not at the width commands)', () => {
    const text = login(BASE_US, { at: 9, out: 'look' });
    const tl = buildTimeline([{ meta: meta('Rasta/a', BASE_US), text }]);
    expect(entryText(tl, 9)).toBe('look');
    expect(tl.play[9]).toBe(0);
    expect(tl.play[10]).toBeCloseTo(1400, 6);
  });

  it('starts run 2 of a chain straight after run 1, whatever the gap', () => {
    for (const gap of [5, 3000]) {
      const r1 = login(BASE_US, { at: 8.4, in: 'Welcome to MUME!' });
      const b2 = BASE_US + (10.4 + gap) * 1e6;
      const r2 = login(b2, { at: 8.4, in: 'Welcome back!' });
      const tl = buildTimeline([
        { meta: meta('Rasta/a', BASE_US), text: r1 },
        { meta: meta('Rasta/b', b2), text: r2 },
      ]);
      expect(tl.runs[1]!.first).toBe(11);
      for (let i = 11; i <= 20; i++) expect(tl.play[i]).toBeCloseTo(2000, 6);
      expect(tl.play[21]).toBeCloseTo(4000, 6);
      expect(runAt(tl, 2000)).toBe(1);
      expect(logUsAt(tl, 2000)).toBe(b2 + 8.4e6);
    }
  });

  it('a run with nothing visible takes no playback time', () => {
    const text = makeLog(BASE_US, [
      { at: 0, gmcp: 'Char.Name', json: { name: 'X' } },
      { at: 5, gmcp: 'Char.Vitals', json: {} },
      { at: 9, in: '   ' },
    ]);
    const tl = buildTimeline([{ meta: meta('X/1', BASE_US), text }]);
    expect(Array.from(tl.play)).toEqual([0, 0, 0]);
    expect(tl.durationMs).toBe(0);
  });

  it('hasInk skips blanks and SGR sequences', () => {
    expect(hasInk('\x1b[1;32m \x1b[0m', 0, 12)).toBe(false);
    expect(hasInk('\x1b[1;32m x', 0, 9)).toBe(true);
    expect(hasInk('>', 0, 1)).toBe(true);
    expect(hasInk('', 0, 0)).toBe(false);
  });
});

describe('ReplayClock', () => {
  it('fires timers in time order at their log time, never going back', () => {
    const c = new ReplayClock(1000e3);
    const seen: Array<[string, number]> = [];
    c.set(() => seen.push(['b', c.now()]), 200);
    c.set(() => seen.push(['a', c.now()]), 100);
    const h = c.set(() => seen.push(['x', c.now()]), 150);
    c.clear(h);
    c.advanceTo(1150e3);
    expect(seen).toEqual([['a', 1100]]);
    c.advanceTo(1000e3); // no going back
    expect(c.now()).toBe(1150);
    c.advanceTo(1300e3);
    expect(seen).toEqual([
      ['a', 1100],
      ['b', 1200],
    ]);
    expect(c.now()).toBe(1300);
  });

  it('runs a periodic timer through a stretch, and skips ahead over a long jump', () => {
    const c = new ReplayClock(0);
    let ticks = 0;
    const tick = (): void => {
      ticks++;
      c.set(tick, 1000);
    };
    c.set(tick, 1000);
    c.advanceTo(10e6);
    expect(ticks).toBe(10);
    ticks = 0;
    c.advanceTo(10e6 + 3600e6); // an hour: only the last CATCH_UP_US is ticked through
    expect(ticks).toBeLessThanOrEqual(CATCH_UP_US / 1e6 + 1);
    expect(ticks).toBeGreaterThan(0);
    expect(c.size).toBe(1);
    c.dispose();
    expect(c.size).toBe(0);
  });

  it('lets a timer set a timer due at once', () => {
    const c = new ReplayClock(0);
    const seen: number[] = [];
    c.set(() => {
      seen.push(1);
      c.set(() => seen.push(2), 0);
    }, 10);
    c.advanceTo(20e3);
    expect(seen).toEqual([1, 2]);
  });
});

describe('strip maths', () => {
  it('maps offsets to rows with half-row precision', () => {
    expect(offsetToRow(0, 100, 10)).toEqual({ row: 0, upper: true });
    expect(offsetToRow(100, 100, 10)).toEqual({ row: 9, upper: false });
    expect(offsetToRow(50, 100, 10)).toEqual({ row: 5, upper: true }); // half 9.5 → 10
    expect(offsetToRow(-5, 100, 10)).toEqual({ row: 0, upper: true });
    expect(offsetToRow(10, 0, 10)).toEqual({ row: 0, upper: true });
  });

  it('draws played above, remaining below and the gold half-block between', () => {
    const cells = stripCells(50, 100, 4); // half = round(0.5 × 7) = 4 → row 2, upper
    expect(cells.map((c) => c.ch).join('')).toBe('██▀█');
    expect(cells[0]!.fg).toBe('#9a9a9a');
    expect(cells[2]).toEqual({ ch: '▀', fg: '#ffaf00', bg: '#242424' });
    expect(cells[3]!.fg).toBe('#242424');
    const low = stripCells(40, 100, 4); // half = round(2.8) = 3 → row 1, lower
    expect(low.map((c) => c.ch).join('')).toBe('█▄██');
    expect(low[1]).toEqual({ ch: '▄', fg: '#ffaf00', bg: '#9a9a9a' });
  });

  it('turns a pointer position into an offset (top row centre = start, bottom = end)', () => {
    expect(yToOffset(5, 100, 10, 1000)).toBe(0);
    expect(yToOffset(95, 100, 10, 1000)).toBe(1000);
    expect(yToOffset(50, 100, 10, 1000)).toBe(500);
    expect(yToOffset(-40, 100, 10, 1000)).toBe(0);
  });

  it('maps the chain events to K/D/A/L markers at logUs ?? us', () => {
    const ev: RunEvent[] = [
      { type: 'run_start', us: 1, character: 'R', schema: 1 },
      { type: 'kill', us: 5, logUs: 4, mobName: 'orc', xpDelta: 1 },
      { type: 'pkill', us: 10, logUs: 9, name: 'Ibuki', race: 'the Half-Elf', xpDelta: 5 },
      { type: 'char_death', us: 20, logUs: 19 },
      { type: 'achievement', us: 30, name: 'x' },
      { type: 'level_up', us: 40, level: 42 },
      { type: 'run_end', us: 50 },
    ];
    expect(markersOf(ev)).toEqual([
      { letter: 'K', us: 9, tip: 'Killed *Ibuki the Half-Elf*' },
      { letter: 'D', us: 19, tip: 'Died' },
      { letter: 'A', us: 30, tip: 'Achievement: x' },
      { letter: 'L', us: 40, tip: 'Reached level 42' },
    ]);
  });

  it('stacks markers on a row as A D K L + ►, seeking to the earliest', () => {
    const rows = markRows(
      [
        { letter: 'L', offset: 51, tip: 'Reached level 3' },
        { letter: 'A', offset: 50 },
        { letter: 'K', offset: 0, tip: 'Killed *Ibuki*' },
        { letter: 'D', offset: 52 },
        { letter: 'K', offset: 200 }, // past the end: dropped
      ],
      100,
      10,
    );
    expect(rows).toEqual([
      { row: 0, text: 'K►', offset: 0, tips: ['K  Killed *Ibuki*'] },
      // Tips in time order; a marker without one gets its letter's (older replays).
      { row: 5, text: 'ADL►', offset: 50, tips: ['A  Achievement', 'L  Reached level 3', 'D  Death'] },
    ]);
  });

  it('fits the header hints, dropping the lowest priority first and keeping ESC Back', () => {
    const all = ['Space Play/Pause', '1–6 Speed', '↑↓ Cursor', 'ESC Back'];
    expect(hintsWidth(all)).toBe(51);
    expect(fitHints(200)).toEqual(all);
    expect(fitHints(51)).toEqual(all);
    expect(fitHints(50)).toEqual(['Space Play/Pause', '1–6 Speed', 'ESC Back']);
    expect(fitHints(39)).toEqual(['Space Play/Pause', '1–6 Speed', 'ESC Back']);
    expect(fitHints(38)).toEqual(['Space Play/Pause', 'ESC Back']);
    expect(fitHints(27)).toEqual(['Space Play/Pause', 'ESC Back']);
    expect(fitHints(26)).toEqual(['ESC Back']);
    expect(fitHints(0)).toEqual(['ESC Back']);
  });

  it('formats the clock with unbounded minutes', () => {
    expect(fmtClock(0)).toBe('00:00');
    expect(fmtClock(61_999)).toBe('01:01');
    expect(fmtClock(78 * 60_000 + 34_000)).toBe('78:34');
  });
});

describe('recorded layout', () => {
  it('keeps the recorded font size when the grid left of the strip meets the minimum', () => {
    const a = { ...defaultSettings().appearance, size: 15 };
    expect(playerFontSize(a, 1440, 860, 2)).toBe(15);
    expect(playerFontSize(a, 1920, 1080, 2)).toBe(15);
    expect(playerFontSize({ ...a, size: 22 }, 1920, 1080, 2)).toBe(22);
  });

  it('falls back to the largest smaller size that meets the minimum grid', () => {
    const a = { ...defaultSettings().appearance, size: 24 };
    const W = 700;
    const H = 400;
    const size = playerFontSize(a, W, H, 2);
    expect(size).toBeLessThan(24);
    const fits = (n: number) => {
      const c = nominalCell({ ...a, size: n });
      return Math.floor(W / c.w) - 2 >= MIN_VIEW_COLS && Math.floor(H / c.h) >= MIN_VIEW_ROWS;
    };
    expect(fits(size)).toBe(true);
    expect(fits(size + 1)).toBe(false);
    // Nothing fits: the smallest size.
    expect(playerFontSize(a, 100, 100, 2)).toBe(6);
  });

  it('parses a VIEW and replaces its parts whole', () => {
    expect(parseView('nope')).toBeNull();
    expect(parseView('[1]')).toBeNull();
    expect(parseView('{"other":1}')).toBeNull();
    const v = parseView(JSON.stringify({ appearance: { ...defaultSettings().appearance, size: 20 }, comm: { filters: {}, showHeader: false } }))!;
    const d = defaultSettings();
    d.comm.filters = { tales: false } as never;
    overlayView(d, v);
    expect(d.appearance.size).toBe(20);
    expect(d.comm).toEqual({ filters: {}, showHeader: false });
    expect(d.profile).toBe('default');
  });

  it('accepts only sane SIZE records', () => {
    expect(parseSize('{"cols":120,"rows":40}')).toEqual({ cols: 120, rows: 40 });
    expect(parseSize('{"cols":1,"rows":40}')).toBeNull();
    expect(parseSize('{"cols":"a","rows":40}')).toBeNull();
    expect(parseSize('x')).toBeNull();
  });
});
