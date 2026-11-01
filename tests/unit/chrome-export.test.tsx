// @vitest-environment happy-dom
// Stage 7 P1, stage 33 (ADR 0115): the export editor frame (History →
// EXPORT): rows, the selection (keys, mouse), exclude / include, comments
// through the input frame, title, the two export buttons, persistence and
// the text export download.
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
import { ScriptLibrary } from '../../src/scripts';
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
  // The shell always has a script library: the start menu has its Scripts row.
  const scripts = new ScriptLibrary({ factory: null, bundled: [] });
  return { settings, cells, profiles, version: '9.9.9', runs: async () => lib, scripts };
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
    text: r.textContent!.slice(2).trimEnd(),
    cur: r.classList.contains('is-cur'),
    sel: r.classList.contains('is-sel'),
  }));
const panel = (host: HTMLElement) => frame(host).querySelector('.wc-exp-panel')?.textContent ?? '';
const counts = (host: HTMLElement) => frame(host).querySelector('.wc-exp-counts')?.textContent ?? '';
const selHead = (host: HTMLElement) => frame(host).querySelector('.wc-exp-selhead')?.textContent ?? '';
const docTitle = (host: HTMLElement) => frame(host).querySelector('.wc-exp-title')?.textContent ?? '';
const kinds = (host: HTMLElement) => logRows(host).map((r) => r.kind);
const rowEl = (host: HTMLElement, item: number) => frame(host).querySelector<HTMLElement>(`.wc-exp-row[data-item="${item}"]`)!;
/** A mouse pointer event on `el` (clientY in the 16 px rows of the stubbed log box). */
const pointer = (el: EventTarget, type: string, y: number, init: PointerEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientY: y, ...init }));
  });
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
  it('shows the log and the panel; X excludes and includes the cursor line; the edit is saved', async () => {
    const lib = await library();
    const host = await openEditor(lib);
    expect(title(host)).toBe('─── Export Editor ───');
    expect(panel(host)).toMatch(/^Rasta\d{4}-\d\d-\d\d · 5 lines0 excluded · 0 comments/);
    expect(logRows(host).map((r) => r.text)).toEqual([
      'You are standing in a field.',
      '> look',
      'An orc scout is here.',
      'The orc scout is dead!',
      'You feel better.',
      '── end of log ──',
    ]);
    expect(logRows(host)[0]!.cur).toBe(true);
    expect(selHead(host)).toBe('LINE · 1');
    expect(frame(host).querySelector('.wc-exp-row .wc-f2')?.textContent).toBe('You are standing in a field.');
    // The two export buttons; HTML (the default) is marked as the last used.
    expect(btn(host, 'HTML REPLAY')!.parentElement!.textContent).toContain('◄ last');
    expect(btn(host, 'TEXT FILE')!.parentElement!.textContent).not.toContain('◄');

    // ↓↓ X: only line 3 is excluded.
    await key('ArrowDown');
    await key('ArrowDown');
    await key('x');
    expect(kinds(host)).toEqual(['entry', 'entry', 'excluded', 'entry', 'entry', 'end']);
    expect(counts(host)).toBe('1 excluded · 0 comments');
    expect(btn(host, 'INCLUDE')).not.toBeNull();
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0 + 2e6, T0 + 4e6]]);
    // X again includes it.
    await key('x');
    expect(kinds(host)).toEqual(['entry', 'entry', 'entry', 'entry', 'entry', 'end']);
    expect(btn(host, 'EXCLUDE')).not.toBeNull();
    // The last line: the range runs to the end of the log.
    await key('End');
    await key('ArrowUp');
    await key('x');
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0 + 5e6, null]]);
    // The end row: exclude, edit and delete are disabled.
    await key('End');
    expect(selHead(host)).toBe('END OF LOG');
    expect(btn(host, 'EXCLUDE')!.getAttribute('aria-disabled')).toBe('true');
    expect(btn(host, 'EDIT COMMENT')).toBeNull();
  });

  it('Shift+keys select a range; X excludes it, X again includes it; Esc clears the selection first', async () => {
    const lib = await library();
    const host = await openEditor(lib);
    await key('ArrowDown');
    await key('ArrowDown', { shiftKey: true });
    await key('ArrowDown', { shiftKey: true });
    expect(selHead(host)).toBe('SELECTION · 3 lines');
    expect(logRows(host).map((r) => r.sel)).toEqual([false, true, true, true, false, false]);
    expect(rowEl(host, 1).querySelector('.wc-exp-mark')!.textContent).toBe('┃');
    expect(rowEl(host, 3).querySelector('.wc-exp-mark')!.textContent).toBe('►');
    await key('x');
    expect(kinds(host)).toEqual(['entry', 'excluded', 'excluded', 'excluded', 'entry', 'end']);
    expect(btn(host, 'INCLUDE')).not.toBeNull();
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0 + 1e6, T0 + 5e6]]);
    // Shift+↑ shrinks it to two lines, still all excluded: INCLUDE takes them out.
    await key('ArrowUp', { shiftKey: true });
    expect(selHead(host)).toBe('SELECTION · 2 lines');
    await key('x');
    expect(kinds(host)).toEqual(['entry', 'entry', 'entry', 'excluded', 'entry', 'end']);
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0 + 4e6, T0 + 5e6]]);
    // A selection with a shown line in it excludes all of it again.
    await key('ArrowDown', { shiftKey: true });
    expect(btn(host, 'EXCLUDE')).not.toBeNull();
    // Shift+End: to the end of the log; X excludes the tail.
    await key('End', { shiftKey: true });
    expect(selHead(host)).toBe('SELECTION · 4 lines');
    await key('x');
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0 + 1e6, null]]);
    // Esc clears the selection; the next Esc leaves.
    await key('Escape');
    expect(title(host)).toBe('─── Export Editor ───');
    expect(logRows(host).some((r) => r.sel)).toBe(false);
    expect(selHead(host)).toBe('END OF LOG');
    // A plain move clears a selection too.
    await key('Home');
    await key('ArrowDown', { shiftKey: true });
    expect(selHead(host)).toBe('SELECTION · 2 lines');
    await key('ArrowDown');
    expect(selHead(host)).toBe('LINE · 3');
    await key('Escape');
    expect(title(host)).toBe('─── History ───');
  });

  it('the mouse: a press moves the cursor, a drag selects, Shift+click extends', async () => {
    const lib = await library();
    const host = await openEditor(lib);
    // happy-dom does no layout: the log box is 800 px tall at the top, rows 16 px.
    const log = frame(host).querySelector<HTMLElement>('.wc-exp-log')!;
    log.getBoundingClientRect = () => ({ top: 0, bottom: 800, left: 0, right: 1000, width: 1000, height: 800, x: 0, y: 0, toJSON: () => ({}) });
    await pointer(rowEl(host, 1), 'pointerdown', 20);
    await pointer(window, 'pointerup', 20);
    expect(selHead(host)).toBe('LINE · 2');
    // Press on line 2, drag to line 4.
    await pointer(rowEl(host, 1), 'pointerdown', 20);
    await pointer(window, 'pointermove', 40);
    await pointer(window, 'pointermove', 56);
    await pointer(window, 'pointerup', 56);
    expect(selHead(host)).toBe('SELECTION · 3 lines');
    expect(logRows(host).map((r) => r.sel)).toEqual([false, true, true, true, false, false]);
    await key('x');
    expect(kinds(host)).toEqual(['entry', 'excluded', 'excluded', 'excluded', 'entry', 'end']);
    // A press without movement clears it.
    await pointer(rowEl(host, 0), 'pointerdown', 4);
    await pointer(window, 'pointerup', 4);
    expect(logRows(host).some((r) => r.sel)).toBe(false);
    expect(selHead(host)).toBe('LINE · 1');
    // Shift+click extends from the cursor.
    await pointer(rowEl(host, 2), 'pointerdown', 36, { shiftKey: true });
    await pointer(window, 'pointerup', 36);
    expect(selHead(host)).toBe('SELECTION · 3 lines');
    // EXCLUDE (some lines are shown) by the panel button.
    await act(() => btn(host, 'EXCLUDE')!.click());
    expect(kinds(host)).toEqual(['excluded', 'excluded', 'excluded', 'excluded', 'entry', 'end']);
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0, T0 + 5e6]]);
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
    expect(rows[1]).toEqual({ kind: 'comment', text: '## Hello there big figh', cur: true, sel: false });
    expect(rows[2]!.text).toBe('> look');
    expect(counts(host)).toBe('0 excluded · 1 comment');

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

    // EDIT and DELETE show in the panel on a comment.
    expect(btn(host, 'EDIT COMMENT')).not.toBeNull();
    expect(selHead(host)).toBe('COMMENT');
    // Delete deletes the cursor comment; an emptied edit deletes too.
    await key('Delete');
    expect(logRows(host)[2]).toMatchObject({ text: '> look', cur: true });
    expect(btn(host, 'EDIT COMMENT')).toBeNull();
    await key('ArrowUp');
    await key('e');
    await key('u', { ctrlKey: true });
    await key('Enter');
    expect(logRows(host).some((r) => r.kind === 'comment')).toBe(false);
    expect(logRows(host)[1]).toMatchObject({ text: '> look', cur: true });
  });

  it('C above a selection; title, the text export marks its button, persistence across reopen', async () => {
    const lib = await library();
    let host = await openEditor(lib);
    // C with lines 3–4 selected: the comment goes above the selection.
    await key('ArrowDown');
    await key('ArrowDown');
    await key('ArrowDown', { shiftKey: true });
    await key('c');
    await type('Fight');
    await key('Enter');
    expect(logRows(host)[2]).toMatchObject({ kind: 'comment', text: '## Fight', cur: true });
    expect(logRows(host).some((r) => r.sel)).toBe(false);
    await key('ArrowUp');
    await key('ArrowUp');

    await key('t');
    expect(title(host)).toBe('─── Export title ───');
    await key('u', { ctrlKey: true });
    await type('Big fight');
    await key('Enter');
    expect(docTitle(host)).toBe('Big fight');
    await key('ArrowDown');
    await key('x');

    // P: the text export, downloaded as `<title>.txt`.
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
    await key('p');
    await until(() => names.length === 1, 'the download');
    expect(names).toEqual(['Big fight.txt']);
    expect(await blobs[0]!.text()).toBe('You are standing in a field.\n## Fight\nAn orc scout is here.\nThe orc scout is dead!\nYou feel better.\n');
    expect(flash(host)).toBe('Exported Big fight.txt');
    // TEXT FILE is now the one marked.
    expect(btn(host, 'TEXT FILE')!.parentElement!.textContent).toContain('◄ last');
    expect(btn(host, 'HTML REPLAY')!.parentElement!.textContent).not.toContain('◄');
    // The TEXT FILE button exports too.
    await act(() => btn(host, 'TEXT FILE')!.click());
    await until(() => names.length === 2, 'the second download');

    // BACK returns to History; reopening restores the edits.
    await key('Escape');
    expect(title(host)).toBe('─── History ───');
    cleanup.splice(0).forEach((c) => c());
    document.body.innerHTML = '';
    host = await openEditor(lib);
    expect(counts(host)).toBe('1 excluded · 1 comment');
    expect(docTitle(host)).toBe('Big fight');
    expect(btn(host, 'TEXT FILE')!.parentElement!.textContent).toContain('◄ last');
    // Title back to the default: an empty title.
    await key('t');
    await key('u', { ctrlKey: true });
    await key('Enter');
    expect(docTitle(host)).toMatch(/^mume-Rasta-/);
  });

  it('Tab moves to the panel: ↑↓ over its enabled buttons, Enter presses', async () => {
    const lib = await library();
    const host = await openEditor(lib);
    await key('Tab');
    const sel = () => frame(host).querySelector('.wc-exp-panel .wc-btn.is-sel-focus')?.textContent?.trim();
    expect(sel()).toBe('EXCLUDE');
    await key('ArrowDown');
    expect(sel()).toBe('ADD COMMENT');
    // EDIT / DELETE COMMENT are not there off a comment: ↓ goes to EDIT TITLE.
    await key('ArrowDown');
    expect(sel()).toBe('EDIT TITLE');
    await key('ArrowUp');
    await key('ArrowUp');
    await key('Enter');
    expect(kinds(host)[0]).toBe('excluded');
    // The log keys still move the cursor after Shift+Tab.
    await key('Tab', { shiftKey: true });
    await key('ArrowDown');
    expect(selHead(host)).toBe('LINE · 2');
  });

  it('pastes newlines as spaces', () => {
    expect(pasteText('a\r\nb\nc\td')).toBe('a b c d');
  });
});
