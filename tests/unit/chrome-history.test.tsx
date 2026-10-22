// @vitest-environment happy-dom
// Stage 6 P1 chrome: History (pills, table, sort, buttons, Rate, Delete,
// the player seam), Statistics (both surfaces) and Exit with rating.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppStatusState, AppStatusView } from '../../src/app/status';
import type { RunMeta } from '../../src/capture/store';
import { type ChromeServices, mountEscMenu, mountStartPage } from '../../src/chrome';
import {
  DEFAULT_HISTORY_SORT,
  expiresCell,
  fmtBytes,
  fmtDur,
  nextHistorySort,
  panPills,
  pillNames,
  pillWidth,
  pillWindow,
  ratingCell,
  scrollPills,
  sortSessions,
  storageText,
} from '../../src/chrome/frames/history-model';
import { NO_PLAYER } from '../../src/chrome/frames/history';
import { ProfileStore } from '../../src/profiles';
import type { RunEvent } from '../../src/runs/events';
import { RunLibrary } from '../../src/runs/library';
import type { LiveRuns } from '../../src/runs/live';
import { DAY_US, type Session } from '../../src/runs/stitch';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';

const H = 3600e6;

function session(p: Partial<Session> & { id: string }): Session {
  return {
    character: 'Rasta',
    runs: [],
    startUs: 0,
    endUs: H,
    saved: false,
    rating: 0,
    hasLog: true,
    expiresDays: 10,
    ...p,
  };
}

describe('History model', () => {
  const d = (day: number, h: number) => new Date(2026, 8, day, h).getTime() * 1000;
  const a = session({ id: 'a', character: 'Rasta', startUs: d(26, 21), endUs: d(26, 21) + 2 * H, expiresDays: 13 });
  const b = session({
    id: 'b',
    character: 'Gittan',
    startUs: d(25, 22),
    endUs: d(25, 22) + H / 2,
    saved: true,
    rating: 5,
    expiresDays: null,
  });
  const c = session({ id: 'c', character: 'Melker', startUs: d(19, 9), endUs: d(19, 9) + H, expiresDays: 6 });

  it('sorts by every column; Saved stays above numbers in Expires and Rating', () => {
    const ids = (s: Session[]) => s.map((x) => x.id).join('');
    expect(ids(sortSessions([c, a, b], DEFAULT_HISTORY_SORT))).toBe('abc');
    let s = nextHistorySort(DEFAULT_HISTORY_SORT, 'date');
    expect(s).toEqual({ key: 'date', dir: 1 });
    expect(ids(sortSessions([a, b, c], s))).toBe('cba');
    s = nextHistorySort(s, 'char');
    expect(s).toEqual({ key: 'char', dir: 1 });
    expect(ids(sortSessions([a, b, c], s))).toBe('bca');
    expect(ids(sortSessions([a, b, c], { key: 'time', dir: 1 }))).toBe('cab');
    expect(ids(sortSessions([a, b, c], { key: 'dur', dir: -1 }))).toBe('acb');
    expect(ids(sortSessions([a, b, c], { key: 'expires', dir: -1 }))).toBe('bac');
    expect(ids(sortSessions([a, b, c], { key: 'expires', dir: 1 }))).toBe('bca');
    expect(ids(sortSessions([a, b, c], { key: 'rating', dir: 1 }))).toBe('bac');
    expect(nextHistorySort({ key: 'char', dir: 1 }, 'rating')).toEqual({ key: 'rating', dir: -1 });
  });

  it('formats the cells', () => {
    expect(expiresCell(a)).toEqual({ text: '13 days', class: 'wc-st-label' });
    expect(expiresCell(b)).toEqual({ text: 'Saved', class: 'wc-c-accent' });
    expect(ratingCell(b)).toEqual({ text: '★★★★★', class: 'wc-st-star' });
    expect(ratingCell(a).text).toBe('');
    expect(ratingCell({ ...b, rating: 0 }).text).toBe('');
    expect(fmtDur(5 * H + 2 * 60e6)).toBe('5h02m');
    expect(fmtDur(34 * 60e6)).toBe('34m');
    expect(pillNames([a, b, c, a])).toEqual(['Gittan', 'Melker', 'Rasta']);
    expect(fmtBytes(147_000)).toBe('147 KB');
    expect(fmtBytes(6_400_000_000)).toBe('6.4 GB');
    expect(storageText({ usage: 1_200_000, quota: 2e9 })).toBe('Storage: 1.2 MB of 2.0 GB');
    expect(storageText(null)).toBe('');
  });

  it('windows the pill row by whole pills with edge slots', () => {
    const widths = ['All', 'Aaaaaaaa', 'Bbbbbbbb', 'Cccccccc', 'Dddddddd'].map(pillWidth); // 5, 10 × 4
    // Fits: everything, no arrows.
    expect(pillWindow(widths, 60, 0)).toEqual({ start: 0, end: 5, overflow: false, left: false, right: false });
    // 30 cells: 26 inside the slots → All + 2 names (5 + 1 + 10 + 1 + 10 = 27 > 26 → All + 1).
    expect(pillWindow(widths, 30, 0)).toEqual({ start: 0, end: 2, overflow: true, left: false, right: true });
    // The cursor on the last pill scrolls the minimum.
    const s = scrollPills(widths, 30, 0, 4);
    expect(pillWindow(widths, 30, s)).toMatchObject({ end: 5, left: true, right: false });
    expect(scrollPills(widths, 30, s, 1)).toBe(1);
    // Panning moves the window one pill, clamped.
    expect(panPills(widths, 30, 0, 1)).toBe(1);
    expect(panPills(widths, 30, 0, -1)).toBe(0);
    expect(panPills(widths, 30, s, 5)).toBe(s);
  });
});

// ------------------------------------------------------------- rendering

beforeAll(() => {
  // happy-dom does no layout: give every element a 128 × 40 cell box.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 800 });
});

let cleanup: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const c of cleanup.splice(0)) c();
  document.body.innerHTML = '';
});

const NOW = Date.now() * 1000;
const T0 = NOW - 2 * DAY_US;

function meta(id: string, startedUs: number, over: Partial<RunMeta> = {}): RunMeta {
  return {
    runId: id,
    character: id.split('/')[0]!,
    startedUs,
    endedUs: startedUs + H,
    sealed: true,
    bytes: 6,
    lines: 1,
    summary: { startUs: startedUs, lastEventUs: startedUs + H, kills: 1, pkills: 0, deaths: 0 },
    ...over,
  };
}

async function library(): Promise<RunLibrary> {
  const lib = await RunLibrary.open(new IDBFactory(), {
    locks: null,
    storage: { estimate: async () => ({ usage: 147_000, quota: 6.4e9 }) },
  });
  const seed = async (m: RunMeta, events: RunEvent[] = []) =>
    lib.store.putWholeRun(
      m,
      events.map((event, seq) => ({ runId: m.runId, seq, event })),
      m.bytes ? [{ runId: m.runId, seq: 0, firstUs: m.startedUs, lastUs: m.startedUs, text: '1 hi\n' }] : [],
    );
  await seed(meta('Rasta/1', T0), [
    { type: 'run_start', us: T0, character: 'Rasta', level: 41, xp: 21_700_000 + 500_000, schema: 1 },
    { type: 'group_changed', us: T0 + 1, members: ['Norsy', 'Kuzzim'] },
    { type: 'kill', us: T0 + 10e6, logUs: T0 + 9e6, mobName: 'An orc scout', xpDelta: 900 },
    { type: 'kill', us: T0 + 20e6, logUs: T0 + 19e6, mobName: 'An orc scout', xpDelta: 1100 },
    { type: 'pkill', us: T0 + 30e6, logUs: T0 + 29e6, name: 'Ibuki', race: 'the Half-Elf', xpDelta: 60_000 },
    { type: 'achievement', us: T0 + 40e6, name: 'That was a quick trip!' },
    { type: 'tp_gained', us: T0 + 41e6, tpDelta: 5 },
  ]);
  await seed(meta('Gittan/1', T0 - DAY_US, { saved: true, rating: 3 }));
  await seed(meta('Gittan/2', T0 + DAY_US / 2, { bytes: 0, lines: 0 }));
  return lib;
}

function services(lib: RunLibrary, extra: Partial<ChromeServices> = {}): ChromeServices {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
  void cells.update(settings.get().appearance);
  const profiles = new ProfileStore({ factory: null });
  return { settings, cells, profiles, version: '9.9.9', runs: async () => lib, ...extra };
}

const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });

/** Lets IndexedDB and the effects run until `ok()` holds. */
async function until(ok: () => boolean, what = 'condition'): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (ok()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  throw new Error(`timed out waiting for ${what}`);
}

const frame = (host: HTMLElement) => host.querySelector('.wc-frame:not([hidden])')!;
const title = (host: HTMLElement) => frame(host).querySelector('.wc-title-row')?.textContent;
const rowTexts = (host: HTMLElement) =>
  [...frame(host).querySelectorAll('.wc-tr:not(.is-empty)')].map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
const curRow = (host: HTMLElement) => frame(host).querySelector('.wc-tr.is-cur-focus, .wc-tr.is-cur')?.textContent;
const btn = (host: HTMLElement, label: string) => frame(host).querySelector<HTMLElement>(`[data-btn="${label}"]`)!;
const flash = (host: HTMLElement) => frame(host).querySelector('.wc-flash')?.textContent ?? '';

async function openHistory(lib: RunLibrary, extra: Partial<ChromeServices> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const page = mountStartPage(host, services(lib, extra), { onEnter: vi.fn() });
  cleanup.push(() => page.dispose());
  await act(() => page.show());
  for (let i = 0; i < 3; i++) await key('ArrowDown');
  await key('Enter');
  await until(() => rowTexts(host).length === 3, 'the History rows');
  return { host, page };
}

describe('History frame', () => {
  it('lists sessions newest first with pills, cells, disabled rules and the storage line', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    expect(title(host)).toBe('─── History ───');
    expect([...frame(host).querySelectorAll('.wc-pills .wc-btn')].map((p) => p.textContent!.trim())).toEqual([
      'All',
      'Gittan',
      'Rasta',
    ]);
    const rows = rowTexts(host);
    expect(rows[0]).toMatch(/^Gittan \d{4}-\d\d-\d\d \d\d:\d\d 1h00m 13 days$/);
    expect(rows[1]).toMatch(/^Rasta .* 1h00m 12 days$/);
    expect(rows[2]).toMatch(/^Gittan .* Saved ★★★$/);
    expect(frame(host).querySelector('.wc-th')?.parentElement?.textContent).toContain('Date ▼');
    // Row 0 has no log: RUN LOG and EXPORT are disabled; SAVE is not.
    expect(btn(host, 'RUN LOG').getAttribute('aria-disabled')).toBe('true');
    expect(btn(host, 'SAVE').getAttribute('aria-disabled')).toBeNull();
    expect(btn(host, 'EXPORT').getAttribute('aria-disabled')).toBe('true');
    expect(frame(host).textContent).toContain('Storage: 147 KB of 6.4 GB');
    // The saved row: SAVE disabled.
    await key('End');
    expect(curRow(host)).toContain('Saved');
    expect(btn(host, 'SAVE').getAttribute('aria-disabled')).toBe('true');
    expect(btn(host, 'EXPORT').getAttribute('aria-disabled')).toBeNull();
  });

  it('filters by pill, sorts by header click, and keys move between the zones', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    // Table row 0 → ↑ → the filter row; → filters to Gittan at once.
    await key('ArrowUp');
    await key('ArrowRight');
    expect(rowTexts(host).every((r) => r.startsWith('Gittan'))).toBe(true);
    expect(rowTexts(host)).toHaveLength(2);
    await key('ArrowRight');
    expect(rowTexts(host)).toHaveLength(1);
    await key('ArrowRight'); // clamped
    expect(rowTexts(host)[0]).toMatch(/^Rasta/);
    await key('ArrowLeft');
    await key('ArrowLeft');
    // ↓ enters the table at row 0.
    await key('ArrowDown');
    expect(frame(host).querySelector('.wc-tr.is-cur-focus')).not.toBeNull();
    // Header click sorts: Char ▲, then the cursor keeps its session.
    await key('ArrowDown');
    const before = curRow(host);
    const charTh = [...frame(host).querySelectorAll<HTMLElement>('.wc-th')].find((t) =>
      t.textContent!.startsWith('Char'),
    )!;
    await act(() => charTh.click());
    expect(frame(host).querySelector('.wc-th')?.textContent).toContain('Char ▲');
    expect(rowTexts(host).map((r) => r.split(' ')[0])).toEqual(['Gittan', 'Gittan', 'Rasta']);
    expect(curRow(host)).toBe(before);
    // ← to the buttons, ↑ from the first enabled button goes to the filter.
    await key('ArrowLeft');
    expect(frame(host).querySelector('.wc-btn.is-sel-focus')?.textContent?.trim()).toBe('RUN LOG');
    await key('ArrowUp');
    expect(frame(host).querySelector('.wc-pills .wc-btn.is-sel-focus')?.textContent?.trim()).toBe('All');
  });

  it('saves, rates and deletes a session', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    await key('ArrowDown'); // Rasta
    await act(() => btn(host, 'SAVE').click());
    await until(() => (curRow(host) ?? '').includes('Saved'), 'the saved row');
    expect(flash(host)).toBe('Saved.');

    // RATE: 4 stars with keys, Enter saves.
    await act(() => btn(host, 'RATE').click());
    expect(title(host)).toBe('─── Rate the session ───');
    await key('3');
    await key('ArrowRight');
    expect(frame(host).querySelectorAll('.wc-stars .wc-st-star')).toHaveLength(4);
    await key('Enter');
    await until(() => (curRow(host) ?? '').includes('★★★★'), 'the rated row');
    expect(flash(host)).toBe('Rated ★★★★.');
    expect((await lib.listSessions(NOW)).find((s) => s.character === 'Rasta')?.rating).toBe(4);

    // RATE again, click star 2, ESC cancels.
    await act(() => btn(host, 'RATE').click());
    await act(() => frame(host).querySelector<HTMLElement>('[data-star="2"]')!.click());
    await key('Escape');
    expect(title(host)).toBe('─── History ───');
    expect(curRow(host)).toContain('★★★★');

    // DELETE: the modal lists the session; a key other than Y cancels.
    await act(() => btn(host, 'DELETE').click());
    expect(frame(host).querySelector('.wc-c-header')?.textContent).toBe('─── Delete session ───');
    expect(frame(host).textContent).toContain('Saved: yes — ★★★★');
    expect(frame(host).textContent).toContain('This cannot be undone.');
    await key('n');
    expect(rowTexts(host)).toHaveLength(3);
    await act(() => btn(host, 'DELETE').click());
    await key('y');
    await until(() => rowTexts(host).length === 2, 'the row gone');
    expect(rowTexts(host).some((r) => r.startsWith('Rasta'))).toBe(false);
    // The cursor stays at the same index.
    expect(curRow(host)).toMatch(/Gittan.*Saved/);
    expect(flash(host)).toBe('Session deleted.');
  });

  it('opens the player on a row with a log and keeps its state across hide / show({ keep })', async () => {
    const lib = await library();
    const openPlayer = vi.fn();
    const { host, page } = await openHistory(lib, { openPlayer });
    await key('Enter'); // row 0 has no log: nothing
    expect(openPlayer).not.toHaveBeenCalled();
    await key('ArrowDown');
    await key('Enter');
    expect(openPlayer).toHaveBeenCalledTimes(1);
    expect((openPlayer.mock.calls[0]![0] as Session).character).toBe('Rasta');
    const before = curRow(host);
    await act(() => page.hide());
    expect(host.querySelector('.wc-chrome')?.hasAttribute('hidden')).toBe(true);
    await act(() => page.show({ keep: true }));
    await until(() => rowTexts(host).length === 3, 'the rows again');
    expect(title(host)).toBe('─── History ───');
    expect(curRow(host)).toBe(before);
    // Keys reach History again.
    await key('ArrowDown');
    expect(curRow(host)).toMatch(/Saved/);
    // A plain show() starts over on the main frame.
    await act(() => page.show());
    expect(title(host)).toBeUndefined();
  });

  it('flashes when the player is not available; EXPORT opens the export editor', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    await key('ArrowDown');
    await act(() => btn(host, 'RUN LOG').click());
    expect(flash(host)).toBe(NO_PLAYER);
    await act(() => btn(host, 'EXPORT').click());
    expect(title(host)).toBe('─── Export Editor ───');
    await key('Escape');
    expect(title(host)).toBe('─── History ───');
  });

  it('shows the empty state with only BACK and RESTORE enabled', async () => {
    const lib = await RunLibrary.open(new IDBFactory(), { locks: null, storage: null });
    const host = document.createElement('div');
    document.body.append(host);
    const page = mountStartPage(host, services(lib), { onEnter: vi.fn() });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    for (let i = 0; i < 3; i++) await key('ArrowDown');
    await key('Enter');
    await until(() => (frame(host).textContent ?? '').includes('No runs recorded yet.'), 'the empty state');
    const enabled = [...frame(host).querySelectorAll('.wc-btncol .wc-btn:not([aria-disabled])')].map((b) =>
      b.textContent!.trim(),
    );
    expect(enabled).toEqual(['RESTORE', 'BACK']);
    expect([...frame(host).querySelectorAll('.wc-pills .wc-btn')]).toHaveLength(1);
  });

  it('shows an archived session in Statistics', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    await key('ArrowDown');
    await act(() => btn(host, 'STATS').click());
    await until(() => (frame(host).textContent ?? '').includes('An orc scout'), 'the kills');
    const text = frame(host).textContent!;
    expect(frame(host).querySelector('.wc-stats-header')?.textContent).toMatch(
      /^◆ Session details — Rasta · \d{4}-\d\d-\d\d · \d\d:\d\d · 1h00m$/,
    );
    expect(text).toContain('♦ Kuzzim');
    expect(text).toContain('♦ Norsy');
    expect(text).toContain('★ That was a quick trip!');
    expect(text).toContain('*Ibuki the Half-Elf*');
    expect(text).toContain('XP/h');
    // Sort by N via its title label; Tab moves the gold title.
    expect(frame(host).querySelector('.wc-c-accent.wc-stat-sort')?.textContent).toBe('KILLS');
    await act(() => frame(host).querySelector<HTMLElement>('[data-sort="n"]')!.click());
    expect(frame(host).querySelector('[data-sort="n"]')?.textContent).toBe('N ▼');
    await key('Tab');
    expect(frame(host).querySelector('.wc-c-accent.wc-stat-sort')?.textContent).toBe('PvPs');
    await key('Escape');
    expect(title(host)).toBe('─── History ───');
  });
});

// --------------------------------------------------------------- ESC menu

function view(s: Partial<AppStatusState> = {}): AppStatusView {
  const cur: AppStatusState = {
    conn: 'playing',
    replay: false,
    character: 'Rasta',
    linkMs: 38,
    linkSuspect: false,
    capture: 'capture: recording',
    xml: true,
    ...s,
  };
  return { get: () => cur, subscribe: () => () => {} };
}

function liveRuns(events: RunEvent[] | null, chain: Partial<Session> | null) {
  const fns = new Set<() => void>();
  const state = { events };
  const runs = {
    current: () => (state.events ? { runId: 'Rasta/1', events: state.events } : null),
    subscribe: (fn: () => void) => (fns.add(fn), () => fns.delete(fn)),
    anchor: () => (chain ? 'Rasta/1' : null),
    chain: async () => (chain ? session({ id: 'Rasta/1', ...chain }) : null),
    chainEvents: async () => [...(state.events ?? [])],
    library: async () => null,
    saveChain: vi.fn(async () => {}),
  };
  return {
    runs: runs as unknown as LiveRuns & { saveChain: ReturnType<typeof vi.fn> },
    end() {
      state.events = null;
      fns.forEach((f) => f());
    },
  };
}

describe('ESC menu: Statistics and Exit with rating', () => {
  const events: RunEvent[] = [
    { type: 'run_start', us: T0, character: 'Rasta', level: 41, xp: 22_200_000, schema: 1 },
    { type: 'kill', us: T0 + 10e6, logUs: T0 + 9e6, mobName: 'An orc scout', xpDelta: 900 },
  ];

  async function menu(runs: LiveRuns, exit = vi.fn()) {
    const host = document.createElement('div');
    document.body.append(host);
    const lib = await library();
    const m = mountEscMenu(host, services(lib), { status: view(), close: vi.fn(), reconnect: vi.fn(), exit, runs });
    cleanup.push(() => m.dispose());
    await act(() => m.open());
    return { host, m, exit };
  }

  const keys = (host: HTMLElement) =>
    [...frame(host).querySelectorAll('.wc-mrow')].map((r) => r.getAttribute('data-key'));

  it('offers Statistics only while a run is on; it ticks and marks the end of the run', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const live = liveRuns(events, null);
      const { host } = await menu(live.runs);
      expect(keys(host)).toEqual(['continue', 'reconnect', 'stats', 'profile', 'options', 'exit']);
      await act(() => frame(host).querySelector<HTMLElement>('.wc-mrow[data-key="stats"] .wc-label')!.click());
      await until(() => (frame(host).textContent ?? '').includes('An orc scout'), 'the live kills');
      expect(frame(host).querySelector('.wc-stats-header')?.textContent).toMatch(
        /^◆ STATISTICS — Rasta · Lvl 41 · Run \d+/,
      );
      expect(frame(host).textContent).toContain('R Refresh');
      // A new kill shows on the next tick.
      events.push({ type: 'kill', us: T0 + 20e6, logUs: T0 + 19e6, mobName: 'A large bat', xpDelta: 66 });
      await act(() => void vi.advanceTimersByTime(1000));
      await until(() => (frame(host).textContent ?? '').includes('A large bat'), 'the tick');
      // The run ends: the data stays and the header says so.
      live.end();
      await act(() => void vi.advanceTimersByTime(1000));
      await until(() => (frame(host).textContent ?? '').includes('Run ended'), 'Run ended');
      expect(frame(host).textContent).toContain('A large bat');
      await key('Escape');
      await until(() => !keys(host).includes('stats'), 'the row gone');
    } finally {
      vi.useRealTimers();
      events.pop();
    }
  });

  it('Exit prefills the chain rating, rates with keys and clicks, and saves before exiting', async () => {
    const live = liveRuns(events, { saved: true, rating: 2 });
    const { host, exit } = await menu(live.runs);
    await key('End');
    await key('Enter');
    expect(title(host)).toBe('─── Exit session ───');
    expect(frame(host).textContent).toContain('Rate & save this run (optional)');
    await until(() => frame(host).querySelectorAll('.wc-stars .wc-st-star').length === 2, 'the prefill');
    await key('5');
    await key('ArrowLeft');
    expect(frame(host).querySelectorAll('.wc-stars .wc-st-star')).toHaveLength(4);
    await act(() => frame(host).querySelector<HTMLElement>('[data-star="3"]')!.click());
    await key('x'); // no catch-all cancel
    expect(title(host)).toBe('─── Exit session ───');
    await key('y');
    await until(() => exit.mock.calls.length === 1, 'the exit');
    expect(live.runs.saveChain).toHaveBeenCalledWith(3);
  });

  it('Exit without a run to rate has no star row', async () => {
    const live = liveRuns(null, null);
    const { host, exit } = await menu(live.runs);
    expect(keys(host)).not.toContain('stats');
    await key('End');
    await key('Enter');
    expect(frame(host).textContent).not.toContain('Rate & save');
    expect(frame(host).querySelector('.wc-stars')).toBeNull();
    expect(frame(host).querySelector('.wc-footer')?.textContent).toBe('Y Exit · ESC Cancel');
    await key('Y');
    await until(() => exit.mock.calls.length === 1, 'the exit');
    expect(live.runs.saveChain).not.toHaveBeenCalled();
  });
});
