// @vitest-environment happy-dom
// Stage 30d (ADR 0109) and stage 49 (ADR 0134): the Statistics pane. The
// view's pure parts (kills, tiles, scale, times), the auto float, the phone
// and player exclusions, the data feed (≤ 1 Hz, a slow refresh only while a
// run is in progress, idle while hidden, Run ended, No run yet), the pane
// shell's mount on first show, and the view (header, tiles, the virtual
// Earlier list, the card, the clock tick).
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legacyLayout } from './legacy-defaults';
import { mountStatsPane } from '../../src/chrome';
import { fitHeader, statsFit } from '../../src/chrome/frames/stats-layout';
import { STATS_FEED_MS, STATS_REFRESH_MS, StatsFeed, type StatsFeedOptions } from '../../src/chrome/stats-feed';
import { barScale, extendsKills, fmtAge, fmtRunClock, killEntries, raterOf, scaleBands, scalePos, tilesOf } from '../../src/chrome/stats-pane-model';
import type { AppStatusView } from '../../src/app/status';
import { type AllocateInput, allocate, defaultFloatSize, statsAutoFloatRect } from '../../src/layout/allocate';
import { GAME_TAB, allocatePhone } from '../../src/layout/phone';
import { LIVE_ONLY, NOT_ON_PHONE, PANE_IDS, PANE_LABELS, PANE_SHORT, STATS_FLOAT, defaultLayout, type PaneId } from '../../src/layout/types';
import { createPaneContext, type StatsPaneView } from '../../src/panes/context';
import { PANE_FACTORIES } from '../../src/panes/factories';
import { StatsPane } from '../../src/panes/statistics';
import { applyViewer, noOverrides } from '../../src/player/viewer';
import type { RunEvent } from '../../src/runs/events';
import type { LiveRuns } from '../../src/runs/live';
import { buildStats } from '../../src/runs/stats';
import { migrateSettings } from '../../src/settings/migrate';
import { defaultSettings } from '../../src/settings/types';

const T0 = 1_700_000_000_000_000;
const startEv = (us = T0): RunEvent => ({ type: 'run_start', us, character: 'Rasta', level: 26, xp: 5_770_000, tp: 100, schema: 1 });
const killEv = (us: number, name = 'An orc scout'): RunEvent => ({ type: 'kill', us, logUs: us, mobName: name, xpDelta: 90_000 });

// ---------------------------------------------------------------- layout

describe('Statistics pane layout (pure)', () => {
  it('statsFit gives two data rows first, then the sparklines, then the ruler, then the rest to KILLS / PvPs', () => {
    expect(statsFit(12, 10)).toEqual({ showSpark: false, showRuler: false, fitRows: 2 });
    expect(statsFit(16, 10)).toEqual({ showSpark: false, showRuler: true, fitRows: 2 });
    expect(statsFit(20, 10)).toEqual({ showSpark: true, showRuler: false, fitRows: 2 });
    expect(statsFit(24, 10)).toEqual({ showSpark: true, showRuler: true, fitRows: 2 });
    expect(statsFit(30, 10)).toEqual({ showSpark: true, showRuler: true, fitRows: 8 });
    // Too short even for the fixed rows: still two data rows.
    expect(statsFit(5, 10).fitRows).toBe(2);
  });

  it('fitHeader takes the first candidate that fits', () => {
    expect(fitHeader(['long one', 'short'], 6)).toBe('short');
  });
});

describe('Statistics pane model (pure)', () => {
  const pk = (us: number): RunEvent => ({ type: 'pkill', us, logUs: us, name: 'Ugluk', race: 'Orc', xpDelta: 40_000 });
  const kill = (us: number, xp: number, name = 'a stone troll'): RunEvent => ({ type: 'kill', us, logUs: us, mobName: name, xpDelta: xp });

  it('killEntries: kills and pkills oldest first, a pkill as *Name*', () => {
    const k = killEntries([kill(T0 + 3, 100), startEv(), pk(T0 + 2), kill(T0 + 1, 200, 'a wolf')]);
    expect(k).toEqual([
      { us: T0 + 1, name: 'a wolf', xp: 200, pk: false },
      { us: T0 + 2, name: '*Ugluk*', xp: 40_000, pk: true },
      { us: T0 + 3, name: 'a stone troll', xp: 100, pk: false },
    ]);
  });

  it('barScale: 3 × the median, or the largest mob kill while calibrating', () => {
    const few = killEntries([kill(T0 + 1, 900), kill(T0 + 2, 1200), pk(T0 + 3)]);
    expect(barScale(raterOf(few).median, few)).toBe(1200);
    const many = killEntries([1, 2, 3, 4, 5].map((i) => kill(T0 + i, 1000 * i)));
    expect(raterOf(many).median).toBe(3000);
    expect(barScale(3000, many)).toBe(9000);
    expect(barScale(null, [])).toBe(1);
  });

  it('tilesOf: avg, median, XP / h (not in the first minute), kills; XP under 1000 exact', () => {
    const k = killEntries([kill(T0 + 1, 400), kill(T0 + 2, 600)]);
    const gains = { xpGains: [{ us: T0 + 1, delta: 400 }, { us: T0 + 2, delta: 600 }] };
    expect(tilesOf(k, null, gains, 3600e6)).toEqual({ avg: '500', median: '—', xpPerHour: '1.0k', kills: '2' });
    expect(tilesOf(k, 2500, gains, 30e6).xpPerHour).toBe('—');
    expect(tilesOf([], null, null, 0)).toEqual({ avg: '—', median: '—', xpPerHour: '—', kills: '0' });
  });

  it('the scale: log2 from 0.25× to 4×; five bands that sum to one', () => {
    expect(scalePos(1)).toBe(0.5);
    expect(scalePos(0.25)).toBe(0);
    expect(scalePos(8)).toBe(1);
    const b = scaleBands();
    expect(b.map((x) => x.rating)).toEqual(['poor', 'meh', 'good', 'great', 'superb']);
    expect(b.reduce((a, x) => a + x.frac, 0)).toBeCloseTo(1, 9);
  });

  it('times: ages and the run clock', () => {
    expect(fmtAge(40e6)).toBe('40s');
    expect(fmtAge(12 * 60e6 + 5e6)).toBe('12m');
    expect(fmtAge(65 * 60e6)).toBe('1h05');
    expect(fmtAge(-5)).toBe('0s');
    expect(fmtRunClock(247e6)).toBe('4:07');
    expect(fmtRunClock((3600 + 12 * 60 + 4) * 1e6)).toBe('1:12:04');
  });

  it('extendsKills: the same run plus kills at the end', () => {
    const a = killEntries([kill(T0 + 1, 1), kill(T0 + 2, 2)]);
    const b = killEntries([kill(T0 + 1, 1), kill(T0 + 2, 2), kill(T0 + 3, 3)]);
    expect(extendsKills(a, b)).toBe(true);
    expect(extendsKills([], b)).toBe(true);
    expect(extendsKills(b, a)).toBe(false);
    expect(extendsKills(a, killEntries([kill(T0 + 9, 1), kill(T0 + 10, 2), kill(T0 + 11, 3)]))).toBe(false);
  });
});

// ------------------------------------------------------- pane and layout

describe('Statistics pane id', () => {
  it('is the last built-in, labelled Statistics (STAT), off by default, live only and not on the phone', () => {
    expect(PANE_IDS.at(-1)).toBe('statistics');
    expect(PANE_LABELS.statistics).toBe('Statistics');
    expect(PANE_SHORT.statistics).toBe('STAT');
    expect(defaultSettings().panes.statistics.on).toBe(false);
    expect(NOT_ON_PHONE.has('statistics')).toBe(true);
    expect(LIVE_ONLY.has('statistics')).toBe(true);
    expect(defaultLayout().floating.find((f) => f.id === 'statistics')).toEqual({ id: 'statistics', x: 0, y: 0, w: 82, h: 26, auto: true });
    expect(defaultFloatSize('statistics')).toEqual({ ...STATS_FLOAT });
    expect(PANE_FACTORIES.statistics(createPaneContext({ doc: document }))).toBeInstanceOf(StatsPane);
  });

  it('an existing user gets it off, with its float; a stored place and toggle are kept', () => {
    const s = migrateSettings({ version: 3, panes: { comm: { on: true } }, layout: legacyLayout() });
    expect(s.panes.statistics).toEqual({ on: false, color: 'black', border: true, glass: true });
    const stored = migrateSettings({
      panes: { statistics: { on: true, color: 'red', border: false } },
      layout: { ...legacyLayout(), floating: [{ id: 'statistics', x: 3, y: 4, w: 50, h: 20 }] },
    });
    expect(stored.panes.statistics).toMatchObject({ on: true, color: 'red', border: false });
    expect(stored.layout.floating.filter((f) => f.id === 'statistics')).toEqual([{ id: 'statistics', x: 3, y: 4, w: 50, h: 20 }]);
  });

  const toggles = (statsOn: boolean): AllocateInput['panes'] =>
    Object.fromEntries(PANE_IDS.map((id) => [id, { on: id === 'statistics' ? statsOn : id !== 'map', border: true }])) as AllocateInput['panes'];

  it('switched on, it floats centred over the game pane at 82 × 26, cut to a smaller game pane', () => {
    const r = allocate({ layout: legacyLayout(), panes: toggles(true), cols: 200, rows: 60, barCells: 26 });
    const p = r.panes.find((b) => b.id === 'statistics')!;
    expect(p.dock).toBe('float');
    expect(p.rect).toEqual(statsAutoFloatRect(r.game, STATS_FLOAT));
    expect(p.rect.w).toBe(82);
    expect(p.rect.h).toBe(26);
    expect(Math.abs(p.rect.x + p.rect.w / 2 - (r.game.x + r.game.w / 2))).toBeLessThanOrEqual(1);
    expect(p.content).toEqual({ x: p.rect.x + 1, y: p.rect.y + 1, w: 80, h: 24 });
    expect(statsAutoFloatRect({ x: 0, y: 0, w: 70, h: 20 }, STATS_FLOAT)).toEqual({ x: 0, y: 0, w: 70, h: 20 });
    // Off: not shown, not hidden for space.
    const off = allocate({ layout: legacyLayout(), panes: toggles(false), cols: 200, rows: 60, barCells: 26 });
    expect(off.panes.some((b) => b.id === 'statistics')).toBe(false);
    expect(off.hidden).not.toContain('statistics');
  });

  it('never gets a phone tab, even when on', () => {
    const r = allocatePhone({ layout: legacyLayout(), panes: toggles(true), cols: 43, rows: 40, tab: 'statistics' as PaneId });
    expect(r.tabs).not.toContain('statistics');
    expect(r.tab).toBe(GAME_TAB);
  });

  it('the log player keeps it off whatever the VIEW records say', () => {
    const s = defaultSettings();
    s.panes.statistics.on = true;
    applyViewer(s, { ...noOverrides(), panes: { statistics: true } });
    expect(s.panes.statistics.on).toBe(false);
  });
});

// ------------------------------------------------------------------- feed

interface FakeRuns {
  runs: StatsFeedOptions['runs'];
  emit(): void;
  live: RunEvent[] | null;
  latest: { runId: string; events: RunEvent[]; ended: boolean } | null;
  anchor: string | null;
  stored: RunEvent[];
  calls: { chainEvents: number; chain: number };
  listeners: Set<() => void>;
}

function fakeRuns(): FakeRuns {
  const f: FakeRuns = {
    live: null,
    latest: null,
    anchor: null,
    stored: [],
    calls: { chainEvents: 0, chain: 0 },
    listeners: new Set(),
    emit: () => {
      for (const fn of [...f.listeners]) fn();
    },
    runs: {
      current: () => (f.live ? { runId: f.latest?.runId ?? '', events: f.live } : null),
      latest: () => f.latest,
      subscribe: (fn) => {
        f.listeners.add(fn);
        return () => f.listeners.delete(fn);
      },
      chainEvents: async () => {
        f.calls.chainEvents++;
        return f.live ? [...f.live] : [...f.stored];
      },
      chain: async () => {
        f.calls.chain++;
        return null;
      },
      anchor: () => f.anchor,
      library: async () => null,
    },
  };
  return f;
}

const tick = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
});

describe('StatsFeed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // The fake timers move Date.now, the feed's clock.
  const feedOf = (f: FakeRuns) => {
    const feed = new StatsFeed({ runs: f.runs, replay: () => false, nowUs: () => T0 + 60e6 });
    return { feed, advance: (ms: number) => vi.advanceTimersByTimeAsync(ms) };
  };

  it('before any run: No run yet, and no tick', async () => {
    const f = fakeRuns();
    const { feed, advance } = feedOf(f);
    feed.setShown(true);
    await tick();
    expect(feed.state).toMatchObject({ noRun: true, model: null, ended: false });
    const n = feed.loads;
    await advance(5 * STATS_FEED_MS);
    expect(feed.loads).toBe(n);
  });

  it('a run in progress: live, run events at most once a second, a slow refresh (not a 1 Hz load)', async () => {
    const f = fakeRuns();
    f.live = [startEv(), killEv(T0 + 1e6)];
    f.latest = { runId: 'R/1', events: f.live, ended: false };
    const { feed, advance } = feedOf(f);
    feed.setShown(true);
    await tick();
    expect(feed.state.model?.kills.map((k) => k.name)).toEqual(['An orc scout']);
    expect(feed.state.ended).toBe(false);
    expect(feed.state.model?.durationUs).toBe(60e6);
    expect(feed.loads).toBe(1);
    // A burst of events: one more load, a second after the last.
    for (let i = 0; i < 10; i++) f.emit();
    await advance(100);
    expect(feed.loads).toBe(1);
    await advance(STATS_FEED_MS);
    expect(feed.loads).toBe(2);
    expect(feed.state.live).toBe(true);
    expect(feed.state.kills.map((k) => k.name)).toEqual(['An orc scout']);
    // No load per second: the clock is the view's text tick.
    await advance(5 * STATS_FEED_MS);
    expect(feed.loads).toBe(2);
    // The slow refresh (XP / h, ages).
    await advance(STATS_REFRESH_MS);
    expect(feed.loads).toBe(3);
  });

  it('a run that ends without a run event (a replay finishing): seen within a second', async () => {
    const f = fakeRuns();
    f.live = [startEv(), killEv(T0 + 1e6)];
    f.latest = { runId: '', events: f.live, ended: false };
    const { feed, advance } = feedOf(f);
    feed.setShown(true);
    await tick();
    f.latest = { runId: '', events: [...f.live, { type: 'run_end', us: T0 + 2e6 } as RunEvent], ended: true };
    f.live = null;
    await advance(STATS_FEED_MS + 10);
    expect(feed.state).toMatchObject({ ended: true, live: false });
  });

  it('hidden: no subscription, no tick, no loads; shown again it loads at once', async () => {
    const f = fakeRuns();
    f.live = [startEv()];
    f.latest = { runId: '', events: f.live, ended: false };
    const { feed, advance } = feedOf(f);
    feed.setShown(true);
    await tick();
    feed.setShown(false);
    expect(f.listeners.size).toBe(0);
    const n = feed.loads;
    f.emit();
    await advance(10 * STATS_FEED_MS);
    expect(feed.loads).toBe(n);
    feed.setShown(true);
    await tick();
    expect(feed.loads).toBe(n + 1);
    feed.dispose();
    expect(f.listeners.size).toBe(0);
  });

  it('a run that is not recorded ends: Run ended from memory, it does not blank, the tick stops', async () => {
    const f = fakeRuns();
    f.live = [startEv(), killEv(T0 + 2e6)];
    f.latest = { runId: '', events: f.live, ended: false };
    const { feed, advance } = feedOf(f);
    feed.setShown(true);
    await tick();
    const events = [...f.live, { type: 'run_end', us: T0 + 3e6 } as RunEvent];
    f.live = null;
    f.latest = { runId: '', events, ended: true };
    f.anchor = 'Old/1'; // an older recorded run: not this one
    f.emit();
    await advance(STATS_FEED_MS);
    expect(feed.state).toMatchObject({ ended: true, noRun: false });
    expect(feed.state.model?.kills.map((k) => k.name)).toEqual(['An orc scout']);
    // Not on the running clock any more: last event − first.
    expect(feed.state.model?.durationUs).toBe(3e6);
    expect(f.calls.chain).toBe(0);
    // A request already queued may still run once; then nothing.
    await advance(STATS_FEED_MS);
    const n = feed.loads;
    await advance(5 * STATS_FEED_MS);
    expect(feed.loads).toBe(n);
    expect(feed.state.model?.kills).toHaveLength(1);
  });

  it('a recorded run that ended: its chain from the store (writes flushed first)', async () => {
    const f = fakeRuns();
    f.latest = { runId: 'R/2', events: [startEv()], ended: true };
    f.anchor = 'R/2';
    f.stored = [startEv(T0 - 600e6), killEv(T0 - 500e6, 'A troll'), startEv(), killEv(T0 + 1e6)];
    const { feed } = feedOf(f);
    feed.setShown(true);
    await tick();
    expect(f.calls.chain).toBe(1);
    expect(feed.state.ended).toBe(true);
    expect(feed.state.model?.kills.map((k) => k.name).sort()).toEqual(['A troll', 'An orc scout']);
  });
});

// ------------------------------------------------------------- the shell

describe('StatsPane (the shell)', () => {
  const cell = { w: 8, h: 16 };
  const placement = (w: number, h: number) => ({ rect: { x: 0, y: 0, w: w + 2, h: h + 2 }, content: { x: 1, y: 1, w, h }, framed: true, floating: 0 });

  it('mounts the view once, on its first show; follows the size; tells 0 × 0 when hidden', async () => {
    const sizes: Array<[number, number]> = [];
    const view: StatsPaneView = { resize: (c, r) => sizes.push([c, r]), dispose: vi.fn() };
    const mount = vi.fn(async (_host: HTMLElement) => view);
    const frames: Array<() => void> = [];
    const ctx = createPaneContext({ doc: document, statsView: mount, requestFrame: (cb) => frames.push(cb) });
    const pane = new StatsPane(ctx);
    const flush = () => {
      for (const f of frames.splice(0)) f();
    };
    flush();
    expect(mount).not.toHaveBeenCalled();
    pane.place(placement(80, 24), cell);
    flush();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount.mock.calls[0]![0]).toBe(pane.content);
    await tick();
    expect(sizes.at(-1)).toEqual([80, 24]);
    pane.place(placement(40, 20), cell);
    flush();
    expect(sizes.at(-1)).toEqual([40, 20]);
    pane.place(null, cell);
    expect(sizes.at(-1)).toEqual([0, 0]);
    pane.place(placement(40, 20), cell);
    flush();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(sizes.at(-1)).toEqual([40, 20]);
    pane.dispose();
    expect(view.dispose).toHaveBeenCalled();
  });

  it('without a mount hook (the log player) it stays empty and never blanks on a disconnect', () => {
    const ctx = createPaneContext({ doc: document, requestFrame: (cb) => cb() });
    const pane = new StatsPane(ctx);
    pane.place(placement(80, 24), cell);
    expect(pane.content.childElementCount).toBe(0);
    expect(pane.blankWhenInactive).toBe(false);
  });
});

// -------------------------------------------------------------- the view

describe('mountStatsPane (the view)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const status = { get: () => ({ replay: false }) } as unknown as AppStatusView;
  const k = (us: number, xp: number, name = 'a stone troll'): RunEvent => ({ type: 'kill', us, logUs: us, mobName: name, xpDelta: xp });

  it('No run yet; then the header, tiles, list and card; a new kill appends; the tick writes the clock; mousedowns', async () => {
    const f = fakeRuns();
    const host = document.createElement('div');
    document.body.append(host);
    const v = mountStatsPane(host, {} as never, { runs: f.runs as unknown as LiveRuns, status });
    v.resize(80, 24);
    await tick();
    const root = host.querySelector<HTMLElement>('.wc-st')!;
    expect(root.dataset['state']).toBe('norun');
    expect(host.querySelector('.wc-st-norun')!.textContent).toBe('No run yet');

    // A run with six kills: calibrated after five.
    f.live = [startEv(), ...[1, 2, 3, 4, 5, 6].map((i) => k(T0 + i * 1e6, 1000 + i * 100))];
    f.latest = { runId: '', events: f.live, ended: false };
    await act(async () => {
      f.emit();
      await vi.advanceTimersByTimeAsync(STATS_FEED_MS);
    });
    await tick();
    expect(root.dataset['state']).toBe('run');
    expect(host.querySelector('.wc-st-hot')!.textContent).toBe('Rasta');
    expect(host.querySelector('.wc-st-top')!.textContent).toContain('L25');
    expect([...host.querySelectorAll('.wc-st-v')].map((e) => e.textContent)).toEqual(['1.4k', '1.4k', '0', '6']); // XP / h: the fake run is years long on the real clock
    expect(host.querySelector('.wc-st-count')!.textContent).toBe('5');
    expect(host.querySelector('.wc-st-mob')!.textContent).toBe('a stone troll');
    expect(host.querySelector('.wc-st-bigxp')!.textContent).toBe('+1.6k');
    expect(host.querySelector('.wc-st-badge')!.textContent).toBe('Good');
    expect(root.style.getPropertyValue('--st-scale')).toBe(String(1350 * 3));
    expect(root.hasAttribute('data-cal')).toBe(false);

    // The clock ticks once a second without a load.
    const loads = (v as unknown as { feed: StatsFeed }).feed.loads;
    const clock = host.querySelector('.wc-st-clock')!;
    const before = clock.textContent;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect((v as unknown as { feed: StatsFeed }).feed.loads).toBe(loads);
    expect(clock.textContent).not.toBe(before);

    // A pkill: the card shows PvP, the list grows by one.
    f.live = [...f.live, { type: 'pkill', us: T0 + 7e6, logUs: T0 + 7e6, name: 'Ugluk', race: 'Orc', xpDelta: 30_000 }];
    f.latest = { runId: '', events: f.live, ended: false };
    await act(async () => {
      f.emit();
      await vi.advanceTimersByTimeAsync(STATS_FEED_MS);
    });
    await tick();
    expect(host.querySelector('.wc-st-count')!.textContent).toBe('6');
    expect(host.querySelector('.wc-st-card')!.hasAttribute('data-pk')).toBe(true);
    expect(host.querySelector('.wc-st-badge')!.textContent).toBe('⚔ PvP');
    expect(host.querySelector<HTMLElement>('.wc-st-scale')!.hidden).toBe(true);

    // Outside the list a mousedown is prevented; in the list it is not (rows can be selected).
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    host.querySelector('.wc-st-tiles')!.dispatchEvent(md);
    expect(md.defaultPrevented).toBe(true);
    const md2 = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    host.querySelector('.wc-st-scroll')!.dispatchEvent(md2);
    expect(md2.defaultPrevented).toBe(false);

    // Hidden: the feed unsubscribed.
    v.resize(0, 0);
    expect(f.listeners.size).toBe(0);
    v.dispose();
    expect(host.querySelector('.wc-st')).toBeNull();
  });
});
