// @vitest-environment happy-dom
// Stage 7 P1: the export editor frame (History → EXPORT): rows, exclude,
// comments through the input frame, title, format, persistence and the
// text export download.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RunMeta } from '../../src/capture/store';
import { type ChromeServices, mountStartPage } from '../../src/chrome';
import { pasteText } from '../../src/chrome/frames/export-input';
import { ProfileStore } from '../../src/profiles';
import { RunLibrary } from '../../src/runs/library';
import { DAY_US } from '../../src/runs/stitch';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';

const H = 3600e6;
const NOW = Date.now() * 1000;
const T0 = Math.floor(NOW - DAY_US);
const ts = (s: number) => String(T0 + s * 1e6).padStart(16, '0');

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

const LOG = [
  `${ts(0)} \x1b[32mYou are standing in a field.\x1b[0m`,
  `${ts(1)} > look`,
  `${ts(2)} An orc scout is here.`,
  `${ts(3)} \x1bGMCP Char.Vitals {"hp":10}`,
  `${ts(4)} The orc scout is dead!`,
  `${ts(5)} You feel better.`,
].join('\n') + '\n';

async function library(): Promise<RunLibrary> {
  const lib = await RunLibrary.open(new IDBFactory(), { locks: null, storage: null });
  const m: RunMeta = {
    runId: 'Rasta/1',
    character: 'Rasta',
    startedUs: T0,
    endedUs: T0 + H,
    sealed: true,
    bytes: LOG.length,
    lines: 6,
    summary: { startUs: T0, lastEventUs: T0 + H, kills: 1, pkills: 0, deaths: 0 },
  };
  await lib.store.putWholeRun(
    m,
    [{ runId: m.runId, seq: 0, event: { type: 'run_start', us: T0, character: 'Rasta', level: 41, xp: 1, schema: 1 } }],
    [{ runId: m.runId, seq: 0, firstUs: T0, lastUs: T0 + 5e6, text: LOG }],
  );
  return lib;
}

function services(lib: RunLibrary): ChromeServices {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
  void cells.update(settings.get().appearance);
  const profiles = new ProfileStore({ factory: null });
  return { settings, cells, profiles, version: '9.9.9', runs: async () => lib };
}

const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });

async function type(s: string): Promise<void> {
  for (const ch of s) await key(ch);
}

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
const btn = (host: HTMLElement, label: string) => frame(host).querySelector<HTMLElement>(`[data-btn="${label}"]`);
const logRows = (host: HTMLElement) =>
  [...frame(host).querySelectorAll<HTMLElement>('.wc-exp-row:not(.is-empty)')].map((r) => ({
    kind: r.dataset.kind,
    text: r.textContent!.slice(3).trimEnd(),
    cur: r.classList.contains('is-cur'),
  }));
const info = (host: HTMLElement) => frame(host).querySelector('.wc-exp-info')?.textContent ?? '';
const flash = (host: HTMLElement) => frame(host).querySelector('.wc-flash')?.textContent ?? '';

async function openEditor(lib: RunLibrary) {
  const host = document.createElement('div');
  document.body.append(host);
  const page = mountStartPage(host, services(lib), { onEnter: vi.fn() });
  cleanup.push(() => page.dispose());
  await act(() => page.show());
  for (let i = 0; i < 3; i++) await key('ArrowDown');
  await key('Enter');
  await until(() => frame(host).querySelectorAll('.wc-tr:not(.is-empty)').length === 1, 'the History row');
  expect(btn(host, 'EXPORT')!.getAttribute('aria-disabled')).toBeNull();
  await act(() => btn(host, 'EXPORT')!.click());
  await until(() => logRows(host).length > 0, 'the editor rows');
  return host;
}

describe('Export editor frame', () => {
  it('shows the log with the info row; X excludes and stops; the edit is saved', async () => {
    const lib = await library();
    const host = await openEditor(lib);
    expect(title(host)).toBe('─── Export Editor ───');
    expect(info(host)).toMatch(/^Rasta · \d{4}-\d\d-\d\d · 5 lines · 0 excluded · 0 comments · → mume-Rasta-.*\.html$/);
    expect(logRows(host).map((r) => r.text)).toEqual([
      'You are standing in a field.',
      '> look',
      'An orc scout is here.',
      'The orc scout is dead!',
      'You feel better.',
      '── end of log ──',
    ]);
    expect(logRows(host)[0]!.cur).toBe(true);
    expect(frame(host).querySelector('.wc-exp-row .wc-f2')?.textContent).toBe('You are standing in a field.');

    // ↓↓ X: exclude from line 3 to the end.
    await key('ArrowDown');
    await key('ArrowDown');
    await key('x');
    expect(logRows(host).map((r) => r.kind)).toEqual(['entry', 'entry', 'excluded', 'excluded', 'excluded', 'end']);
    expect(info(host)).toContain('3 excluded');
    expect(btn(host, 'STOP EXCLUDING')).not.toBeNull();
    // ↓↓ X on the last line: the range now stops above it.
    await key('ArrowDown');
    await key('ArrowDown');
    await key('x');
    expect(logRows(host).map((r) => r.kind)).toEqual(['entry', 'entry', 'excluded', 'excluded', 'entry', 'end']);
    await until(() => true);
    const doc = await lib.exportDoc('Rasta/1');
    expect(doc.excludes).toEqual([[T0 + 2e6, T0 + 5e6]]);
    // The end row: exclude, edit and delete are disabled.
    await key('End');
    expect(btn(host, 'EXCLUDE FROM HERE')!.getAttribute('aria-disabled')).toBe('true');
    expect(btn(host, 'EDIT COMMENT')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('adds, edits and deletes comments through the input frame', async () => {
    const lib = await library();
    const host = await openEditor(lib);
    await key('ArrowDown');
    await key('c');
    expect(title(host)).toBe('─── Add comment ───');
    await type('Hello  there');
    await act(() => {
      const e = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
      e.clipboardData = { getData: () => ' big\nfight' };
      document.dispatchEvent(e);
    });
    expect(frame(host).querySelector('.wc-exp-preview')?.textContent).toBe('## Hello there big fight');
    expect(frame(host).querySelector('.wc-exp-hold')?.textContent).toBe('Holds the replay for 3 s.');
    await key('Backspace');
    await key('Enter');
    expect(title(host)).toBe('─── Export Editor ───');
    let rows = logRows(host);
    expect(rows[1]).toEqual({ kind: 'comment', text: '## Hello there big figh', cur: true });
    expect(rows[2]!.text).toBe('> look');
    expect(info(host)).toContain('1 comments');

    // E edits it; ESC cancels; Ctrl+U + text + Enter replaces.
    await key('e');
    expect(title(host)).toBe('─── Edit comment ───');
    await key('Escape');
    expect(title(host)).toBe('─── Export Editor ───');
    await key('e');
    await key('u', { ctrlKey: true });
    await type('Watch this');
    await key('Enter');
    expect(logRows(host)[1]!.text).toBe('## Watch this');

    // C on a comment adds after it.
    await key('c');
    await type('Second');
    await key('Enter');
    rows = logRows(host);
    expect(rows.slice(1, 3).map((r) => r.text)).toEqual(['## Watch this', '## Second']);
    expect(rows[2]!.cur).toBe(true);
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).comments).toEqual([
      { beforeUs: T0 + 1e6, text: 'Watch this' },
      { beforeUs: T0 + 1e6, text: 'Second' },
    ]);

    // D deletes the cursor comment; an emptied edit deletes too.
    await key('d');
    expect(logRows(host)[2]).toMatchObject({ text: '> look', cur: true });
    await key('ArrowUp');
    await key('e');
    await key('u', { ctrlKey: true });
    await key('Enter');
    expect(logRows(host).some((r) => r.kind === 'comment')).toBe(false);
    expect(logRows(host)[1]).toMatchObject({ text: '> look', cur: true });
  });

  it('title, format, persistence across reopen and the text download', async () => {
    const lib = await library();
    let host = await openEditor(lib);
    await key('t');
    expect(title(host)).toBe('─── Export title ───');
    await key('u', { ctrlKey: true });
    await type('Big fight');
    await key('Enter');
    expect(info(host)).toMatch(/→ Big fight\.html$/);
    await key('f');
    expect(info(host)).toMatch(/→ Big fight\.txt$/);
    expect(btn(host, 'FORMAT: TEXT')).not.toBeNull();
    await key('ArrowDown');
    await key('x');

    // Text export: the Blob is downloaded as `<title>.txt`.
    const blobs: Blob[] = [];
    const names: string[] = [];
    const url = URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
    url.createObjectURL = (b: Blob) => {
      blobs.push(b);
      return 'blob:x';
    };
    url.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    await key('s');
    await until(() => names.length === 1, 'the download');
    expect(names).toEqual(['Big fight.txt']);
    expect(await blobs[0]!.text()).toBe('You are standing in a field.\n');
    expect(flash(host)).toBe('Exported Big fight.txt');

    // BACK returns to History; reopening restores the edits.
    await key('Escape');
    expect(title(host)).toBe('─── History ───');
    cleanup.splice(0).forEach((c) => c());
    document.body.innerHTML = '';
    host = await openEditor(lib);
    expect(info(host)).toMatch(/4 excluded · 0 comments · → Big fight\.txt$/);
    // Title back to the default: an empty title.
    await key('t');
    await key('u', { ctrlKey: true });
    await key('Enter');
    expect(info(host)).toMatch(/→ mume-Rasta-.*\.txt$/);
  });

  it('pastes newlines as spaces', () => {
    expect(pasteText('a\r\nb\nc\td')).toBe('a b c d');
  });
});
