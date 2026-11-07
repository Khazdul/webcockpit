// @vitest-environment happy-dom
// Stage 6 P1 chrome, stage 45 (WP 45-A, 45-E): History in the new look (pills, table, card, sort, buttons, Rate, Delete,
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
  HISTORY_SORT_OPTIONS,
  deedsParts,
  expiresCell,
  expiresInText,
  expiresText,
  expiryLeft,
  expiryTone,
  fmtBytes,
  fmtDur,
  fmtDurLong,
  fmtLongDate,
  nextHistorySort,
  parseSortValue,
  sessionDeeds,
  sortOptions,
  sortValue,
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
import { BadBackupError, RunLibrary } from '../../src/runs/library';
import type { LiveRuns } from '../../src/runs/live';
import { DAY_US, type Session } from '../../src/runs/stitch';
import { ScriptLibrary } from '../../src/scripts';
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

  it('sums the deeds over the runs and words them for the card', () => {
    const run = (kills: number, pkills: number, deaths: number) =>
      ({ summary: { startUs: 0, lastEventUs: 0, kills, pkills, deaths } }) as RunMeta;
    expect(sessionDeeds({ runs: [run(40, 1, 0), run(24, 1, 1)] })).toEqual({ kills: 64, pkills: 2, deaths: 1 });
    expect(sessionDeeds({ runs: [{ summary: null } as RunMeta, run(1, 0, 0)] })).toEqual({ kills: 1, pkills: 0, deaths: 0 });
    expect(sessionDeeds({ runs: [{} as RunMeta] })).toBeNull();
    expect(deedsParts({ kills: 64, pkills: 2, deaths: 1 })).toEqual({ kills: '64 kills', pvp: '2 PvP', deaths: '1 death' });
    expect(deedsParts({ kills: 1, pkills: 0, deaths: 3 })).toEqual({ kills: '1 kill', pvp: null, deaths: '3 deaths' });
  });

  it('formats the card: long duration and date, the expiry tone, text and gauge', () => {
    expect(fmtDurLong(3 * H + 41 * 60e6)).toBe('3 h 41 min');
    expect(fmtDurLong(48 * 60e6)).toBe('48 min');
    expect(fmtLongDate(new Date(2026, 10, 6, 21, 12).getTime() * 1000)).toBe('Friday, 6 November 2026');
    expect(fmtLongDate(new Date(2026, 8, 28, 9, 0).getTime() * 1000)).toBe('Monday, 28 September 2026');
    expect(expiryTone(b)).toBe('saved');
    expect(expiryTone({ saved: false, expiresDays: 2 })).toBe('soon');
    expect(expiryTone({ saved: false, expiresDays: 3 })).toBe('later');
    expect(expiresText(a)).toBe('13 days');
    expect(expiresText(b)).toBe('Saved');
    expect(expiresInText(14)).toBe('Expires in 14 days');
    expect(expiresInText(1)).toBe('Expires in 1 day');
    expect(expiresInText(0)).toBe('Expires today');
    expect(expiryLeft(7)).toBe(0.5);
    expect(expiryLeft(20)).toBe(1);
    expect(expiryLeft(-1)).toBe(0);
  });

  it("names the phone's sort list for every sort", () => {
    expect(HISTORY_SORT_OPTIONS.map((o) => o.label)).toEqual([
      'Newest first',
      'Oldest first',
      'Character',
      'Longest',
      'Rating',
      'Expires soonest',
    ]);
    expect(sortValue(DEFAULT_HISTORY_SORT)).toBe('date:-1');
    expect(parseSortValue('dur:-1')).toEqual({ key: 'dur', dir: -1 });
    expect(parseSortValue('expires:1')).toEqual({ key: 'expires', dir: 1 });
    expect(parseSortValue('nope:1')).toBeNull();
    expect(parseSortValue('date:2')).toBeNull();
    expect(sortOptions(DEFAULT_HISTORY_SORT)).toHaveLength(6);
    const time = sortOptions({ key: 'time', dir: 1 });
    expect(time).toHaveLength(7);
    expect(time[6]).toEqual({ value: 'time:1', label: 'By time of day ▴' });
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
  // The shell always has a script library: the start menu has its Scripts row.
  const scripts = new ScriptLibrary({ factory: null, bundled: [] });
  return { settings, cells, profiles, version: '9.9.9', runs: async () => lib, scripts, ...extra };
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
/** The History page (a look frame; it stays drawn under its dialogs). */
const hist = (host: HTMLElement) => host.querySelector<HTMLElement>('.wc-hist')!;
const hood = (host: HTMLElement) => frame(host).querySelector(':scope .wc-lk-box > .wc-lk-hood .wc-lk-hood-t:not(.is-out)')?.textContent;
/** A row's cells joined by one space; the rating as its gold stars. */
const cells = (r: Element) =>
  [...r.querySelectorAll('.wc-lk-td')]
    .map((td) => (td.querySelector('.wc-lk-star-on')?.textContent ?? td.textContent ?? '').trim())
    .join(' ')
    .trim();
const rowTexts = (host: HTMLElement) => [...(hist(host)?.querySelectorAll('.wc-lk-tr') ?? [])].map(cells);
const curRow = (host: HTMLElement) => {
  const r = hist(host)?.querySelector('.wc-lk-tr.is-on');
  return r ? cells(r) : undefined;
};
const btn = (host: HTMLElement, label: string) => frame(host).querySelector<HTMLElement>(`[data-btn="${label}"]`)!;
const flash = (host: HTMLElement) =>
  (hist(host)?.querySelector('.wc-lk-flash') ?? frame(host).querySelector('.wc-flash'))?.textContent ?? '';
const dlg = (name: string) => document.querySelector<HTMLElement>(`.wc-lk-dialog[data-dlg="${name}"]`);

async function openHistory(lib: RunLibrary, extra: Partial<ChromeServices> = {}, n = 3) {
  const host = document.createElement('div');
  document.body.append(host);
  const page = mountStartPage(host, services(lib, extra), { onEnter: vi.fn() });
  cleanup.push(() => page.dispose());
  await act(() => page.show());
  for (let i = 0; i < 3; i++) await key('ArrowDown');
  await key('Enter');
  await until(() => !!hist(host) && rowTexts(host).length === n, 'the History rows');
  return { host, page };
}

describe('History frame', () => {
  it('lists sessions newest first with pills, cells, the card, disabled rules and the storage line', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    expect(hood(host)).toBe('History');
    expect(hist(host).style.getPropertyValue('--lk-box-maxw')).toBe('1180px');
    expect([...hist(host).querySelectorAll('.wc-hist-pills [role="radio"]')].map((p) => p.textContent)).toEqual([
      'All',
      'Gittan',
      'Rasta',
    ]);
    expect(hist(host).querySelector('.wc-hist-pills [aria-checked="true"]')?.textContent).toBe('All');
    const rows = rowTexts(host);
    expect(rows[0]).toMatch(/^Gittan \d{4}-\d\d-\d\d \d\d:\d\d 1h00m 13 days$/);
    expect(rows[1]).toMatch(/^Rasta .* 1h00m 12 days$/);
    expect(rows[2]).toMatch(/^Gittan .* Saved ★★★$/);
    expect(hist(host).querySelector('.wc-lk-th[data-dir="-1"]')?.getAttribute('data-key')).toBe('date');
    // The card: row 0 (Gittan, no log): name, the long date, no deeds summary, not kept.
    const card = () => hist(host).querySelector('.wc-hist-card')!.textContent!;
    expect(hist(host).querySelector('.wc-hist-name')?.textContent).toBe('Gittan');
    expect(card()).toMatch(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d+ \w+ \d{4} · \d\d:\d\d/);
    expect(card()).toContain('1 h 0 min · 1 run');
    expect(card()).toContain('Expires in 13 days');
    expect(card()).toContain('No text captured');
    // Row 0 has no log: Run log and Export are disabled; Save is not.
    expect(btn(host, 'RUN LOG').getAttribute('aria-disabled')).toBe('true');
    expect(btn(host, 'SAVE').getAttribute('aria-disabled')).toBeNull();
    expect(btn(host, 'EXPORT').getAttribute('aria-disabled')).toBe('true');
    expect(hist(host).querySelector('.wc-hist-storage')?.textContent).toBe('Storage: 147 KB of 6.4 GB');
    // Rasta: level, deeds summed from the run summary.
    await key('ArrowDown');
    expect(hist(host).querySelector('.wc-hist-name')?.textContent).toBe('Rasta');
    expect(card()).toContain('1 kill');
    expect(card()).toContain('Captured text');
    // The saved row: Save disabled, Kept says Saved with its stars.
    await key('End');
    expect(curRow(host)).toContain('Saved');
    expect(card()).toContain('Saved');
    expect(btn(host, 'SAVE').getAttribute('aria-disabled')).toBe('true');
    expect(btn(host, 'EXPORT').getAttribute('aria-disabled')).toBeNull();
    // No key-hint row: the keys are behind "?".
    expect(hist(host).querySelector('.wc-footer')).toBeNull();
    expect(btn(host, 'KEYS').getAttribute('aria-label')).toBe('Keys (?)');
  });

  it('filters by pill with ← →, sorts by a head click keeping the cursor, and Tab walks rows ↔ buttons', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    await key('ArrowRight');
    expect(rowTexts(host).every((r) => r.startsWith('Gittan'))).toBe(true);
    expect(rowTexts(host)).toHaveLength(2);
    expect(hist(host).querySelector('.wc-hist-pills [aria-checked="true"]')?.textContent).toBe('Gittan');
    await key('ArrowRight');
    expect(rowTexts(host)).toHaveLength(1);
    await key('ArrowRight'); // clamped
    expect(rowTexts(host)[0]).toMatch(/^Rasta/);
    await key('ArrowLeft');
    await key('ArrowLeft');
    expect(rowTexts(host)).toHaveLength(3);
    // A pill click filters at once, the cursor on row 0.
    await key('End');
    await act(() => hist(host).querySelector<HTMLElement>('[data-opt="Gittan"]')!.click());
    expect(rowTexts(host)).toHaveLength(2);
    expect(hist(host).querySelector('.wc-lk-tr.is-on')?.getAttribute('data-i')).toBe('0');
    await act(() => hist(host).querySelector<HTMLElement>('[data-opt="All"]')!.click());
    // Header click sorts: Char ▴, and the cursor keeps its session.
    await key('Home');
    await key('ArrowDown');
    const before = curRow(host);
    await act(() => hist(host).querySelector<HTMLElement>('.wc-lk-th[data-key="char"]')!.click());
    expect(hist(host).querySelector('.wc-lk-th[data-key="char"]')?.getAttribute('data-dir')).toBe('1');
    expect(rowTexts(host).map((r) => r.split(' ')[0])).toEqual(['Gittan', 'Gittan', 'Rasta']);
    expect(curRow(host)).toBe(before);
    // Tab: the first enabled button; the row dims (.is-idle); ← → walk the buttons, skipping disabled ones.
    await key('Home');
    await key('Tab');
    const sel = () => frame(host).querySelector('.wc-lk-btn.is-sel')?.getAttribute('data-btn');
    // (Row 0 has no log: Run log is skipped.)
    expect(sel()).toBe('STATS');
    expect(hist(host).querySelector('.wc-lk-tr.is-on')?.classList.contains('is-idle')).toBe(true);
    await key('ArrowRight');
    expect(sel()).toBe('RATE');
    await key('ArrowLeft');
    await key('ArrowLeft'); // stops at the first enabled one
    expect(sel()).toBe('STATS');
    // In the buttons ← → do not change the pill.
    expect(rowTexts(host)).toHaveLength(3);
    await key('Tab', { shiftKey: true });
    expect(sel()).toBeUndefined();
    expect(hist(host).querySelector('.wc-lk-tr.is-on')?.classList.contains('is-cur')).toBe(true);
    // Shift+Tab from the rows: the last enabled button (Restore).
    await key('Tab', { shiftKey: true });
    expect(sel()).toBe('RESTORE');
  });

  it('saves (S), rates (A) and deletes (D) a session', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    await key('ArrowDown'); // Rasta
    await key('s');
    await until(() => (curRow(host) ?? '').includes('Saved'), 'the saved row');
    expect(flash(host)).toBe('Saved.');
    expect(btn(host, 'SAVE').getAttribute('aria-disabled')).toBe('true');

    // Rate: 4 stars with keys, Enter saves.
    await key('a');
    expect(dlg('rate')).not.toBeNull();
    await key('3');
    await key('ArrowRight');
    await key('Enter');
    await until(() => (curRow(host) ?? '').includes('★★★★'), 'the rated row');
    expect(flash(host)).toBe('Rated ★★★★.');
    expect((await lib.listSessions(NOW)).find((s) => s.character === 'Rasta')?.rating).toBe(4);

    // Delete: a key other than Y cancels; Y deletes; the cursor stays at the same index.
    await act(() => btn(host, 'DELETE').click());
    expect(dlg('delete')?.textContent).toContain('yes — ★★★★');
    await key('n');
    expect(rowTexts(host)).toHaveLength(3);
    await key('d');
    await key('y');
    await until(() => rowTexts(host).length === 2, 'the row gone');
    expect(rowTexts(host).some((r) => r.startsWith('Rasta'))).toBe(false);
    expect(curRow(host)).toMatch(/Gittan.*Saved/);
    expect(flash(host)).toBe('Session deleted.');
    // Rasta's pill went with its last session.
    expect([...hist(host).querySelectorAll('.wc-hist-pills [role="radio"]')].map((p) => p.textContent)).toEqual([
      'All',
      'Gittan',
    ]);
  });

  it('opens the player (Enter, R, double click) and keeps its state across hide / show({ keep })', async () => {
    const lib = await library();
    const openPlayer = vi.fn(async () => ({ ok: true as const }));
    const { host, page } = await openHistory(lib, { openPlayer });
    await key('Enter'); // row 0 has no log: nothing
    await key('r');
    expect(openPlayer).not.toHaveBeenCalled();
    await key('ArrowDown');
    await key('Enter');
    await until(() => openPlayer.mock.calls.length === 1, 'the player');
    expect((openPlayer.mock.calls[0] as unknown as [Session])[0].character).toBe('Rasta');
    await key('r');
    await until(() => openPlayer.mock.calls.length === 2, 'the player by R');
    // A click selects, a double click opens.
    const row2 = hist(host).querySelectorAll<HTMLElement>('.wc-lk-tr')[2]!;
    await act(() => row2.click());
    expect(curRow(host)).toMatch(/Saved/);
    expect(openPlayer).toHaveBeenCalledTimes(2);
    await act(() => {
      row2.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await until(() => openPlayer.mock.calls.length === 3, 'the player by a double click');
    const before = curRow(host);
    await act(() => page.hide());
    expect(host.querySelector('.wc-chrome')?.hasAttribute('hidden')).toBe(true);
    await act(() => page.show({ keep: true }));
    await until(() => rowTexts(host).length === 3, 'the rows again');
    expect(hood(host)).toBe('History');
    expect(curRow(host)).toBe(before);
    await key('ArrowUp');
    expect(curRow(host)).toMatch(/^Rasta/);
  });

  it('shows the run-log error box when the log cannot open', async () => {
    const lib = await library();
    const openPlayer = vi.fn(async () => ({ ok: false as const, error: 'The run log is not stored.' }));
    const { host } = await openHistory(lib, { openPlayer });
    await key('ArrowDown');
    await key('Enter');
    await until(() => dlg('runlog-error') !== null, 'the error box');
    const box = dlg('runlog-error')!;
    expect(box.textContent).toContain('This run log could not be opened.');
    expect(box.textContent).toContain('The run log is not stored.');
    expect(box.textContent).toContain('The run data may be damaged. Stats and Backup may still work.');
    // The page stays drawn under it.
    expect(hist(host).isConnected).toBe(true);
    await key('Enter');
    expect(dlg('runlog-error')).toBeNull();
    expect(curRow(host)).toMatch(/^Rasta/);
  });

  it('flashes when the player is not available', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    await key('ArrowDown');
    await act(() => btn(host, 'RUN LOG').click());
    expect(flash(host)).toBe(NO_PLAYER);
  });

  it('Export (X) opens the export editor; Back returns to History', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    await key('ArrowDown');
    await key('x');
    expect(frame(host).querySelector('.wc-exp')).not.toBeNull();
    await key('Escape');
    await until(() => hood(host) === 'History', 'History again');
    expect(curRow(host)).toMatch(/^Rasta/);
  });

  it('the "?" button and the ? key show the keys; any key closes them', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    await key('?');
    expect(dlg('keys')?.textContent).toContain('Run log');
    expect(dlg('keys')?.textContent).toContain('Character');
    await key('x');
    expect(dlg('keys')).toBeNull();
    expect(title(host)).toBeUndefined(); // the export editor did not open
    await act(() => btn(host, 'KEYS').click());
    expect(dlg('keys')).not.toBeNull();
    await key('Escape');
    expect(dlg('keys')).toBeNull();
    expect(hood(host)).toBe('History');
  });

  it('shows the empty state with only Restore enabled', async () => {
    const lib = await RunLibrary.open(new IDBFactory(), { locks: null, storage: null });
    const { host } = await openHistory(lib, {}, 0);
    await until(() => (hist(host).textContent ?? '').includes('No runs recorded yet.'), 'the empty state');
    expect(hist(host).querySelector('.wc-hist-card')?.textContent).toBe(
      'Recorded sessions show here. Restore brings back a backup from another browser.',
    );
    const enabled = [...hist(host).querySelectorAll('.wc-lk-btn[data-btn]:not([aria-disabled])')].map((b) =>
      b.getAttribute('data-btn'),
    );
    expect(enabled).toEqual(['KEYS', 'RESTORE']);
    expect(btn(host, 'BACKUP').getAttribute('aria-disabled')).toBe('true');
    expect(hist(host).querySelectorAll('.wc-hist-pills [role="radio"]')).toHaveLength(1);
  });

  it('shows the read error when the runs cannot be read', async () => {
    const lib = await library();
    vi.spyOn(lib, 'listSessions').mockRejectedValue(new Error('the database is blocked'));
    const { host } = await openHistory(lib, {}, 0);
    await until(() => (hist(host).textContent ?? '').includes('The runs could not be read.'), 'the read error');
    expect(flash(host)).toBe('Could not read the runs: the database is blocked');
  });

  it('Backup (B) and Restore (O): their flashes and failures; Save failure; one action at a time', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    // Backup: a download and its name in the flash.
    if (!URL.createObjectURL) (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await key('b');
    await until(() => /^Saved webcockpit-runs-\d{4}-\d\d-\d\d\.jsonl\.gz\.$/.test(flash(host)), 'the backup flash');
    expect(clicked).toHaveBeenCalledTimes(1);
    vi.spyOn(lib, 'backup').mockRejectedValueOnce(new Error('disk full'));
    await act(() => btn(host, 'BACKUP').click());
    await until(() => flash(host) === 'Backup failed: disk full', 'the backup failure');

    // Restore: O opens the file picker; a chosen file restores and reloads.
    const input = hist(host).querySelector<HTMLInputElement>('.wc-history-file')!;
    expect(input.accept).toBe('.gz,.jsonl.gz,application/gzip');
    const picked = vi.spyOn(input, 'click').mockImplementation(() => {});
    await key('o');
    expect(picked).toHaveBeenCalledTimes(1);
    const choose = async (): Promise<void> => {
      Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'b.jsonl.gz')] });
      await act(() => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };
    const restore = vi.spyOn(lib, 'restore').mockResolvedValueOnce({ added: 2, skipped: 1 });
    await choose();
    await until(() => flash(host) === 'Restored 2 runs (1 already present).', 'the restore flash');
    expect(restore).toHaveBeenCalledTimes(1);
    restore.mockRejectedValueOnce(new BadBackupError('not a WebCockpit backup'));
    await choose();
    await until(() => flash(host) === 'Restore failed: not a WebCockpit backup', 'the restore failure');
    expect(rowTexts(host)).toHaveLength(3);

    // Save: a failure flashes; the row stays unsaved.
    await key('ArrowDown');
    vi.spyOn(lib, 'save').mockRejectedValueOnce(new Error('quota'));
    await key('s');
    await until(() => flash(host) === 'Save failed: quota', 'the save failure');
    expect(curRow(host)).not.toContain('Saved');

    // One action at a time: while a save waits, a second S and a B do nothing.
    let release: () => void = () => {};
    const save = vi.spyOn(lib, 'save').mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const backup = vi.spyOn(lib, 'backup');
    save.mockClear();
    backup.mockClear();
    await key('s');
    await key('s');
    await key('b');
    expect(save).toHaveBeenCalledTimes(1);
    expect(backup).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await Promise.resolve();
    });
    await until(() => flash(host) === 'Saved.', 'the save');
  });

  it('shows an archived session in Statistics (T)', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    await key('ArrowDown');
    await key('t');
    await until(() => (frame(host).textContent ?? '').includes('An orc scout'), 'the kills');
    const text = frame(host).textContent!;
    expect(text).toContain('Kuzzim');
    expect(text).toContain('That was a quick trip!');
    expect(text).toContain('*Ibuki the Half-Elf*');
    await key('Escape');
    await until(() => hood(host) === 'History', 'History again');
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
