// @vitest-environment happy-dom
// Stage 30d (ADR 0109): the Statistics pane. Its layout by the pane's
// cells (wide, narrow, what drops), the shortened header, the auto float,
// the phone and player exclusions, the data feed (≤ 1 Hz, a tick only
// while a run is in progress, idle while hidden, Run ended, No run yet),
// the pane shell's mount on first show, and the view's three states.
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legacyLayout } from './legacy-defaults';
import { mountStatsPane } from '../../src/chrome';
import { paneHeader } from '../../src/chrome/frames/statistics';
import {
  NARROW_MIN_T,
  NARROW_RULER_MIN,
  NARROW_SPARK_MIN,
  STATS_WIDE_MIN_COLS,
  fitHeader,
  statsFit,
  statsPaneLayout,
} from '../../src/chrome/frames/stats-layout';
import { STATS_FEED_MS, StatsFeed, type StatsFeedOptions } from '../../src/chrome/stats-feed';
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

  it('is wide from 64 cells and 12 rows, with the frame widths; narrow below either', () => {
    const w = statsPaneLayout(80, 24);
    expect(w).toEqual({ mode: 'wide', T: 36, total: 80, left: 0, showSpark: true, showRuler: true, fitRows: 2 });
    expect(statsPaneLayout(STATS_WIDE_MIN_COLS, 12).mode).toBe('wide');
    expect(statsPaneLayout(STATS_WIDE_MIN_COLS - 1, 40).mode).toBe('narrow');
    expect(statsPaneLayout(120, 11).mode).toBe('narrow');
    // Wider than the widest content: centred.
    expect(statsPaneLayout(100, 30)).toMatchObject({ mode: 'wide', total: 84, left: 8 });
    // A short wide pane drops the sparklines, then the ruler.
    expect(statsPaneLayout(80, 16)).toMatchObject({ mode: 'wide', showSpark: false, showRuler: true });
    expect(statsPaneLayout(80, 13)).toMatchObject({ mode: 'wide', showSpark: false, showRuler: false });
  });

  it('narrow: the column fills the width less a margin, a gap and the bar; sparklines then ruler drop when narrow', () => {
    expect(statsPaneLayout(40, 20)).toEqual({ mode: 'narrow', T: 37, total: 37, left: 1, showSpark: true, showRuler: true });
    expect(statsPaneLayout(NARROW_SPARK_MIN + 3, 20)).toMatchObject({ showSpark: true, showRuler: true });
    expect(statsPaneLayout(NARROW_SPARK_MIN + 2, 20)).toMatchObject({ showSpark: false, showRuler: true });
    expect(statsPaneLayout(NARROW_RULER_MIN + 3, 20)).toMatchObject({ showSpark: false, showRuler: true });
    expect(statsPaneLayout(NARROW_RULER_MIN + 2, 20)).toMatchObject({ showSpark: false, showRuler: false });
    // Never narrower tables than NARROW_MIN_T: a narrower pane clips them.
    expect(statsPaneLayout(12, 20).T).toBe(NARROW_MIN_T);
  });

  it('the header gives way: stars, level, STATISTICS, the run; Run ended stays', () => {
    const m = buildStats([startEv(), killEv(T0 + 70 * 60e6)]);
    expect(paneHeader(m, 4, true, 80)).toBe('◆ STATISTICS — Rasta · Lvl 26 · Run 1h 10m · ★★★★ · Run ended');
    expect(paneHeader(m, 4, true, 60)).toBe('◆ STATISTICS — Rasta · Lvl 26 · Run 1h 10m · Run ended');
    expect(paneHeader(m, 4, true, 50)).toBe('◆ STATISTICS — Rasta · Run 1h 10m · Run ended');
    expect(paneHeader(m, 4, true, 40)).toBe('◆ Rasta · Run 1h 10m · Run ended');
    expect(paneHeader(m, 4, true, 25)).toBe('◆ Rasta · Run ended');
    expect(paneHeader(m, 0, false, 12)).toBe('◆ Rasta');
    expect(paneHeader(m, 0, false, 5)).toBe('◆ Ra…');
    expect(fitHeader(['long one', 'short'], 6)).toBe('short');
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

  it('a run in progress: live, a 1 Hz tick, run events at most once a second', async () => {
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
    // The tick: about one load a second.
    await advance(3 * STATS_FEED_MS);
    expect(feed.loads).toBeGreaterThanOrEqual(4);
    expect(feed.loads).toBeLessThanOrEqual(5);
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

  it('No run yet, centred; then the run, wide or narrow by the cells; mousedowns are prevented', async () => {
    const f = fakeRuns();
    const host = document.createElement('div');
    document.body.append(host);
    const v = mountStatsPane(host, {} as never, { runs: f.runs as unknown as LiveRuns, status });
    await act(async () => v.resize(80, 24));
    await tick();
    expect(host.querySelector('.wc-stats-pane')!.getAttribute('data-layout')).toBe('empty');
    expect(host.querySelector('.wc-stats-norun')!.textContent).toBe('No run yet');
    // The run starts: the event reloads.
    f.live = [startEv(), killEv(T0 + 1e6)];
    f.latest = { runId: '', events: f.live, ended: false };
    await act(async () => {
      f.emit();
      await vi.advanceTimersByTimeAsync(STATS_FEED_MS);
    });
    await tick();
    const pane = host.querySelector('.wc-stats-pane')!;
    expect(pane.getAttribute('data-layout')).toBe('wide');
    const header = host.querySelector('.wc-stats-header')!.textContent!;
    expect(header).toMatch(/^◆ STATISTICS — Rasta · Lvl 26 · Run /);
    expect(header).not.toContain('Run ended');
    expect(pane.textContent).toContain('An orc scout');
    expect(pane.textContent).not.toContain('R Refresh');
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    host.querySelector('.wc-stat-rows')!.dispatchEvent(md);
    expect(md.defaultPrevented).toBe(true);
    // Narrow: one column that scrolls as a whole.
    await act(async () => v.resize(40, 20));
    expect(host.querySelector('.wc-stats-pane')!.getAttribute('data-layout')).toBe('narrow');
    expect(host.querySelector('.wc-stats-page')).not.toBeNull();
    // Hidden: nothing drawn, the feed unsubscribed.
    await act(async () => v.resize(0, 0));
    expect(host.querySelector('.wc-stats-pane')).toBeNull();
    expect(f.listeners.size).toBe(0);
    v.dispose();
  });
});
