// @vitest-environment happy-dom
// Stage 45 WP 45-C: History's small boxes (Rate, Delete, the run-log error
// box, the keys box) over the History page, as overlay frames.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RunMeta } from '../../src/capture/store';
import { type ChromeServices, mountStartPage } from '../../src/chrome';
import { HISTORY_KEYS, ratingWords, sessionLine } from '../../src/chrome/frames/history-dialogs';
import { ProfileStore } from '../../src/profiles';
import { RunLibrary } from '../../src/runs/library';
import { DAY_US, type Session } from '../../src/runs/stitch';
import { ScriptLibrary } from '../../src/scripts';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';

const H = 3600e6;
const NOW = Date.now() * 1000;
const T0 = NOW - 2 * DAY_US;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 800 });
});

let cleanup: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const c of cleanup.splice(0)) c();
  document.body.innerHTML = '';
});

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

/** Rasta (unsaved, newest) and Gittan (saved ★★★, older). */
async function library(): Promise<RunLibrary> {
  const lib = await RunLibrary.open(new IDBFactory(), {
    locks: null,
    storage: { estimate: async () => ({ usage: 147_000, quota: 6.4e9 }) },
  });
  const seed = (m: RunMeta) =>
    lib.store.putWholeRun(m, [], [{ runId: m.runId, seq: 0, firstUs: m.startedUs, lastUs: m.startedUs, text: '1 hi\n' }]);
  await seed(meta('Rasta/1', T0));
  await seed(meta('Gittan/1', T0 - DAY_US, { saved: true, rating: 3 }));
  return lib;
}

function services(lib: RunLibrary, extra: Partial<ChromeServices> = {}): ChromeServices {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
  void cells.update(settings.get().appearance);
  const profiles = new ProfileStore({ factory: null });
  const scripts = new ScriptLibrary({ factory: null, bundled: [] });
  return { settings, cells, profiles, version: '9.9.9', runs: async () => lib, scripts, ...extra };
}

const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });

async function until(ok: () => boolean, what = 'condition'): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (ok()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  throw new Error(`timed out waiting for ${what}`);
}

const hist = (host: HTMLElement) => host.querySelector<HTMLElement>('.wc-hist')!;
const rows = (host: HTMLElement) => [...hist(host).querySelectorAll('.wc-lk-tr')];
const curRow = (host: HTMLElement) => hist(host).querySelector('.wc-lk-tr.is-on')?.textContent ?? '';
const flash = (host: HTMLElement) => hist(host).querySelector('.wc-lk-flash')?.textContent ?? '';
const dlg = (name: string) => document.querySelector<HTMLElement>(`.wc-lk-dialog[data-dlg="${name}"]`);
const dbtn = (name: string, id: string) => dlg(name)!.querySelector<HTMLElement>(`[data-btn="${id}"]`)!;
const lit = () => [...dlg('rate')!.querySelectorAll('.wc-hd-stars > button')].filter((b) => b.classList.contains('is-lit')).length;
const words = () => dlg('rate')!.querySelector('.wc-hd-val')!.textContent;
const hood = (name: string) => dlg(name)!.querySelector('.wc-lk-hood-t')!.textContent;

async function openHistory(lib: RunLibrary, extra: Partial<ChromeServices> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const page = mountStartPage(host, services(lib, extra), { onEnter: vi.fn() });
  cleanup.push(() => page.dispose());
  await act(() => page.show());
  for (let i = 0; i < 3; i++) await key('ArrowDown');
  await key('Enter');
  await until(() => !!hist(host) && rows(host).length === 2, 'the History rows');
  return { host, page };
}

describe('History dialogs: helpers', () => {
  it('names the session and the rating', () => {
    const s: Session = {
      id: 'x',
      character: 'Gibur',
      runs: [],
      startUs: new Date(2026, 10, 6, 21, 12).getTime() * 1000,
      endUs: new Date(2026, 10, 6, 21, 12).getTime() * 1000 + 3 * H + 41 * 60e6,
      saved: false,
      rating: 0,
      hasLog: true,
      expiresDays: 10,
    };
    expect(sessionLine(s)).toBe('Gibur · 2026-11-06 · 21:12 · 3h41m');
    expect(ratingWords(0)).toBe('No rating — the session is still saved');
    expect(ratingWords(4)).toBe('Four stars');
    expect(ratingWords(9)).toBe('Five stars');
    expect(HISTORY_KEYS.map(([k]) => k)).toEqual(
      expect.arrayContaining(['↑ ↓', '← →', 'Enter', 'R', 'T', 'A', 'S', 'X', 'D', 'B', 'O', 'Tab', '?', 'Esc']),
    );
  });
});

describe('History dialogs: Rate', () => {
  it('starts at the saved rating; 0–5, ← → ↑ ↓ and clicks set it; Esc cancels', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    await key('End'); // Gittan, saved ★★★
    await key('a');
    expect(dlg('rate')).not.toBeNull();
    expect(hood('rate')).toBe('Rate the session');
    expect(dlg('rate')!.querySelector('.wc-hd-line')?.textContent).toMatch(/^Gittan · \d{4}-\d\d-\d\d · \d\d:\d\d · 1h00m/);
    // The page stays drawn under the veil.
    expect(hist(host).isConnected).toBe(true);
    expect(lit()).toBe(3);
    expect(words()).toBe('Three stars');
    await key('5');
    expect(lit()).toBe(5);
    await key('ArrowRight'); // clamped
    expect(lit()).toBe(5);
    await key('ArrowLeft');
    await key('ArrowDown');
    expect(lit()).toBe(3);
    await key('ArrowUp');
    expect(lit()).toBe(4);
    await key('0');
    expect(words()).toBe('No rating — the session is still saved');
    // A click sets; a click on the lit last star clears.
    const star = (i: number) => dlg('rate')!.querySelector<HTMLElement>(`.wc-hd-stars > button[data-v="${i}"]`)!;
    await act(() => star(2).click());
    expect(lit()).toBe(2);
    expect(star(2).getAttribute('aria-checked')).toBe('true');
    await act(() => star(2).click());
    expect(lit()).toBe(0);
    // ← → never walk the buttons or change History's pill under the box.
    expect(dlg('rate')!.querySelector('.wc-lk-btn.is-sel')).toBeNull();
    await key('Escape');
    expect(dlg('rate')).toBeNull();
    expect((await lib.listSessions(NOW)).find((s) => s.character === 'Gittan')?.rating).toBe(3);
    expect(rows(host)).toHaveLength(2);
  });

  it('Enter saves an unsaved session with its rating; 0 saves with no rating; S and the button save', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    expect(curRow(host)).toMatch(/^Rasta/);
    await key('a');
    expect(lit()).toBe(0);
    await key('2');
    await key('Enter');
    await until(() => dlg('rate') === null, 'the box closed');
    await until(() => curRow(host).includes('★★'), 'the rated row');
    expect(flash(host)).toBe('Rated ★★.');
    const rasta = (await lib.listSessions(NOW)).find((s) => s.character === 'Rasta')!;
    expect(rasta.saved).toBe(true);
    expect(rasta.rating).toBe(2);
    // S saves; 0 says so.
    await key('a');
    expect(lit()).toBe(2);
    await key('0');
    await key('s');
    await until(() => dlg('rate') === null, 'the box closed by S');
    await until(() => flash(host) === 'Saved, no rating.', 'the flash');
    // The Save button.
    await key('a');
    await key('4');
    await act(() => dbtn('rate', 'SAVE').click());
    await until(() => flash(host) === 'Rated ★★★★.', 'the flash by click');
    // Cancel button.
    await key('a');
    await act(() => dbtn('rate', 'CANCEL').click());
    expect(dlg('rate')).toBeNull();
    expect(hist(host).isConnected).toBe(true);
  });

  it('flashes a failed rating and closes once', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    let fail!: (e: Error) => void;
    vi.spyOn(lib, 'save').mockReturnValue(new Promise<void>((_, rej) => (fail = rej)));
    await key('a');
    await key('3');
    await key('Enter');
    // While saving every key is held: Esc and another Enter do nothing.
    await key('Escape');
    await key('Enter');
    expect(dlg('rate')).not.toBeNull();
    await act(async () => fail(new Error('quota exceeded')));
    await until(() => dlg('rate') === null, 'the box closed');
    expect(flash(host)).toBe('Rating failed: quota exceeded');
    // History is still there (one pop only).
    expect(hist(host).isConnected).toBe(true);
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-hist')).not.toBeNull();
  });
});

describe('History dialogs: Delete', () => {
  it('lists the session; any key but Y cancels (modifiers alone wait); Y deletes', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    await key('End'); // Gittan, saved ★★★
    await key('d');
    const box = dlg('delete')!;
    expect(hood('delete')).toBe('Delete session');
    const kv = [...box.querySelectorAll('.wc-hd-kv > dt')].map((d) => d.textContent);
    expect(kv).toEqual(['Character', 'Date', 'Time', 'Duration', 'Runs', 'Saved']);
    expect(box.textContent).toContain('Gittan');
    expect(box.textContent).toContain('1 h 0 min');
    expect(box.querySelector('.wc-lk-gold')?.textContent).toBe('yes — ★★★');
    expect(box.querySelector('.wc-hd-warn')?.textContent).toBe(
      "This will permanently delete the session's logs and run data. This cannot be undone.",
    );
    expect(dbtn('delete', 'DELETE').classList.contains('is-danger')).toBe(true);
    expect(dbtn('delete', 'DELETE').querySelector('u.wc-sk')?.textContent).toBe('Y');
    await key('Shift');
    expect(dlg('delete')).not.toBeNull();
    // Enter cancels (no button is the default).
    await key('Enter');
    expect(dlg('delete')).toBeNull();
    expect(rows(host)).toHaveLength(2);
    await key('d');
    await key('Tab');
    expect(dlg('delete')).toBeNull();
    // The veil cancels; Cancel cancels.
    await key('d');
    await act(() => document.querySelector<HTMLElement>('.wc-lk-veil')!.click());
    expect(dlg('delete')).toBeNull();
    await key('d');
    await act(() => dbtn('delete', 'CANCEL').click());
    expect(dlg('delete')).toBeNull();
    expect(rows(host)).toHaveLength(2);
    // An unsaved session has no Saved row.
    await key('Home');
    await key('d');
    expect([...dlg('delete')!.querySelectorAll('.wc-hd-kv > dt')].map((d) => d.textContent)).not.toContain('Saved');
    // Y deletes; a quick second key does not pop History.
    await key('Y', { shiftKey: true });
    await key('n');
    await until(() => rows(host).length === 1, 'the row gone');
    expect(flash(host)).toBe('Session deleted.');
    expect(curRow(host)).toMatch(/^Gittan/);
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-hist')).not.toBeNull();
  });

  it('deletes by its button and flashes a failure', async () => {
    const lib = await library();
    const { host } = await openHistory(lib);
    vi.spyOn(lib, 'remove').mockRejectedValueOnce(new Error('the database is blocked'));
    await key('d');
    await act(() => dbtn('delete', 'DELETE').click());
    await until(() => dlg('delete') === null, 'the box closed');
    expect(flash(host)).toBe('Delete failed: the database is blocked');
    expect(rows(host)).toHaveLength(2);
    await key('d');
    await act(() => dbtn('delete', 'DELETE').click());
    await until(() => rows(host).length === 1, 'the row gone');
    expect(flash(host)).toBe('Session deleted.');
  });
});

describe('History dialogs: the run-log error box and the keys box', () => {
  it('shows why a run log could not open; Esc, Enter or OK closes it', async () => {
    const lib = await library();
    const long = 'IDB: the chunk Rasta/1#0000000000000000000000000000000000000000000000000000000000000 is missing';
    const openPlayer = vi.fn(async () => ({ ok: false as const, error: long }));
    const { host } = await openHistory(lib, { openPlayer });
    await key('r');
    await until(() => dlg('runlog-error') !== null, 'the error box');
    const box = dlg('runlog-error')!;
    expect(hood('runlog-error')).toBe('Run log');
    expect(box.querySelector('.wc-lk-q')?.textContent).toBe('This run log could not be opened.');
    expect(box.querySelector('.wc-hd-reason')?.textContent).toBe(long);
    expect(box.textContent).toContain('Rasta · ');
    expect(box.textContent).toContain('The run data may be damaged. Stats and Backup may still work.');
    // Letters of the page do nothing under it.
    await key('d');
    expect(dlg('delete')).toBeNull();
    await key('Escape');
    expect(dlg('runlog-error')).toBeNull();
    expect(curRow(host)).toMatch(/^Rasta/);
    await key('r');
    await until(() => dlg('runlog-error') !== null, 'the error box again');
    await act(() => dbtn('runlog-error', 'OK').click());
    expect(dlg('runlog-error')).toBeNull();
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-hist')).not.toBeNull();
  });

  it('the keys box lists History keys; ? closes it', async () => {
    const lib = await library();
    await openHistory(lib);
    await key('?');
    const box = dlg('keys')!;
    expect(box.querySelector('.wc-lk-hood-t')?.textContent).toBe('Keys');
    const listed = [...box.querySelectorAll('.wc-lk-kh-row')].map((r) => r.textContent);
    expect(listed).toContain('← →Character');
    expect(listed).toContain('XExport');
    expect(listed).toContain('EscBack');
    await key('?');
    expect(dlg('keys')).toBeNull();
  });
});
