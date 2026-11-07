// @vitest-environment happy-dom
// Stage 7 P1, stage 33 (ADR 0115), stage 43d (ADR 0128 §43d): the export
// editor frame (History → Export) in the lantern look: the bar, the log
// rows, the selection (keys, mouse, touch), exclude / include, the inline
// comment composer, the inline title, the format toggle (H / P only
// choose; the stored format), Export (O) building the chosen format, the
// Tab ring, persistence and the virtual rows.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RunMeta } from '../../src/capture/store';
import { type ChromeServices, mountStartPage } from '../../src/chrome';
import { pasteText } from '../../src/chrome/frames/export-model';
import { setDeviceForTest } from '../../src/core/device';
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
  // happy-dom does no layout: give every element a 1280 × 800 box.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 800 });
});

let cleanup: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const c of cleanup.splice(0)) c();
  document.body.innerHTML = '';
});

const LOG =
  [
    `${ts(0)} \x1b[32mYou are standing in a field.\x1b[0m`,
    `${ts(1)} > look`,
    `${ts(2)} An orc scout is here.`,
    `${ts(3)} \x1bGMCP Char.Vitals {"hp":10}`,
    `${ts(4)} The orc scout is dead!`,
    `${ts(5)} You feel better.`,
  ].join('\n') + '\n';

async function library(text = LOG, lines = 6): Promise<RunLibrary> {
  const lib = await RunLibrary.open(new IDBFactory(), { locks: null, storage: null });
  const m: RunMeta = {
    runId: 'Rasta/1',
    character: 'Rasta',
    startedUs: T0,
    endedUs: T0 + H,
    sealed: true,
    bytes: text.length,
    lines,
    summary: { startUs: T0, lastEventUs: T0 + H, kills: 1, pkills: 0, deaths: 0 },
  };
  await lib.store.putWholeRun(
    m,
    [{ runId: m.runId, seq: 0, event: { type: 'run_start', us: T0, character: 'Rasta', level: 41, xp: 1, schema: 1 } }],
    [{ runId: m.runId, seq: 0, firstUs: T0, lastUs: T0 + 5e6, text }],
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
/** History (stage 45: a look page) is the top frame. */
const historyTop = (host: HTMLElement) => frame(host).querySelector('.wc-hist') !== null;
const hood = (host: HTMLElement) => frame(host).querySelector('.wc-lk-hood-t:not(.is-out)')?.textContent;
const isExport = (host: HTMLElement) => frame(host).querySelector('.wc-exp') !== null;
const btn = (host: HTMLElement, id: string) => frame(host).querySelector<HTMLElement>(`[data-btn="${id}"]`);
const opt = (host: HTMLElement, id: string) => frame(host).querySelector<HTMLElement>(`[data-opt="${id}"]`);
const logRows = (host: HTMLElement) =>
  [...frame(host).querySelectorAll<HTMLElement>('.wc-exp-row')].map((r) => ({
    kind: r.dataset.kind,
    text: r.textContent!.trimEnd(),
    cur: r.classList.contains('is-cur'),
    sel: r.classList.contains('is-sel'),
  }));
const who = (host: HTMLElement) => frame(host).querySelector('.wc-exp-name')?.textContent ?? '';
const counts = (host: HTMLElement) => frame(host).querySelector('.wc-exp-counts')?.textContent ?? '';
const selHead = (host: HTMLElement) => frame(host).querySelector('.wc-exp-selhead')?.textContent ?? '';
const docTitle = (host: HTMLElement) => frame(host).querySelector('.wc-exp-title')?.textContent ?? '';
const kinds = (host: HTMLElement) => logRows(host).map((r) => r.kind);
const rowEl = (host: HTMLElement, item: number) => frame(host).querySelector<HTMLElement>(`.wc-exp-row[data-item="${item}"]`)!;
const comp = (host: HTMLElement) => frame(host).querySelector<HTMLElement>('.wc-exp-comp');
const field = (host: HTMLElement, id: string) =>
  frame(host).querySelector<HTMLInputElement & HTMLTextAreaElement>(`[data-field="${id}"] .wc-lk-input`)!;
const keySel = (host: HTMLElement) => {
  const el = frame(host).querySelector<HTMLElement>('.wc-exp .is-sel');
  return el?.dataset.btn ?? el?.dataset.opt;
};
const checked = (host: HTMLElement, id: string) => opt(host, id)!.getAttribute('aria-checked') === 'true';
/** A mouse pointer event on `el`. */
const pointer = (el: EventTarget, type: string, y: number, init: PointerEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientY: y, ...init }));
  });
const flash = (host: HTMLElement) => frame(host).querySelector('.wc-lk-flash')?.textContent ?? '';
/** Types into a field as the browser's input event does. */
const typeIn = (el: HTMLInputElement | HTMLTextAreaElement, text: string) =>
  act(() => {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
/** The y of item `i`'s middle in the stubbed log (the box at 0, 8 px padding, 21 px rows of one line each). */
const yOf = (i: number) => 8 + i * 21 + 10;

async function openEditor(lib: RunLibrary) {
  const host = document.createElement('div');
  document.body.append(host);
  const page = mountStartPage(host, services(lib), { onEnter: vi.fn() });
  cleanup.push(() => page.dispose());
  await act(() => page.show());
  for (let i = 0; i < 3; i++) await key('ArrowDown');
  await key('Enter');
  await until(() => frame(host).querySelectorAll('.wc-hist .wc-lk-tr').length === 1, 'the History row');
  expect(btn(host, 'EXPORT')!.getAttribute('aria-disabled')).toBeNull();
  await act(() => btn(host, 'EXPORT')!.click());
  await until(() => logRows(host).length > 0, 'the editor rows');
  // The log box sits at the top of the (unlaid-out) page.
  const log = frame(host).querySelector<HTMLElement>('.wc-exp-log')!;
  log.getBoundingClientRect = () => ({ top: 0, bottom: 800, left: 0, right: 1280, width: 1280, height: 800, x: 0, y: 0, toJSON: () => ({}) });
  return host;
}

/** Captures downloads: their names and blobs. */
function downloads() {
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
  return { blobs, names };
}

describe('Export editor frame', () => {
  it('shows the bar and the log; X excludes and includes the cursor line; the edit is saved', async () => {
    const lib = await library();
    const host = await openEditor(lib);
    expect(isExport(host)).toBe(true);
    expect(hood(host)).toBe('Export');
    expect(who(host)).toBe('Rasta');
    expect(counts(host)).toMatch(/^\d{4}-\d\d-\d\d · 5 lines · 0 excluded · 0 comments$/);
    expect(logRows(host).map((r) => r.text)).toEqual([
      'You are standing in a field.',
      '> look',
      'An orc scout is here.',
      'The orc scout is dead!',
      'You feel better.',
      '── end of log ──',
    ]);
    expect(kinds(host)).toEqual(['entry', 'command', 'entry', 'entry', 'entry', 'end']);
    expect(logRows(host)[0]!.cur).toBe(true);
    expect(selHead(host)).toBe('Line · 1');
    expect(frame(host).querySelector('.wc-exp-row .wc-f2')?.textContent).toBe('You are standing in a field.');
    // The format toggle: HTML (the default) is the chosen one; the file name follows it.
    expect(checked(host, 'HTML')).toBe(true);
    expect(checked(host, 'TEXT')).toBe(false);
    expect(frame(host).querySelector('.wc-exp-fn')?.textContent).toMatch(/^mume-Rasta-.*\.html$/);

    // ↓↓ X: only line 3 is excluded.
    await key('ArrowDown');
    await key('ArrowDown');
    await key('x');
    expect(kinds(host)).toEqual(['entry', 'command', 'excluded', 'entry', 'entry', 'end']);
    expect(counts(host)).toMatch(/· 1 excluded · 0 comments$/);
    expect(btn(host, 'INCLUDE')).not.toBeNull();
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0 + 2e6, T0 + 4e6]]);
    // I (the label says Include) includes it again.
    await key('i');
    expect(kinds(host)).toEqual(['entry', 'command', 'entry', 'entry', 'entry', 'end']);
    expect(btn(host, 'EXCLUDE')).not.toBeNull();
    // I does nothing while the label says Exclude.
    await key('i');
    expect(kinds(host)[2]).toBe('entry');
    // The last line: the range runs to the end of the log.
    await key('End');
    await key('ArrowUp');
    await key('x');
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0 + 5e6, null]]);
    // The end row: exclude, edit and delete are disabled.
    await key('End');
    expect(selHead(host)).toBe('End of log');
    expect(btn(host, 'EXCLUDE')!.getAttribute('aria-disabled')).toBe('true');
    expect(btn(host, 'EDIT')!.getAttribute('aria-disabled')).toBe('true');
    expect(btn(host, 'DELETE')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('Shift+keys select a range; X excludes it, X again includes it; Esc clears the selection first', async () => {
    const lib = await library();
    const host = await openEditor(lib);
    await key('ArrowDown');
    await key('ArrowDown', { shiftKey: true });
    await key('ArrowDown', { shiftKey: true });
    expect(selHead(host)).toBe('Selection · 3 lines');
    expect(logRows(host).map((r) => r.sel)).toEqual([false, true, true, true, false, false]);
    expect(rowEl(host, 3).classList.contains('is-cur')).toBe(true);
    await key('x');
    expect(kinds(host)).toEqual(['entry', 'excluded', 'excluded', 'excluded', 'entry', 'end']);
    expect(btn(host, 'INCLUDE')).not.toBeNull();
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0 + 1e6, T0 + 5e6]]);
    // Shift+↑ shrinks it to two lines, still all excluded: Include takes them out.
    await key('ArrowUp', { shiftKey: true });
    expect(selHead(host)).toBe('Selection · 2 lines');
    await key('x');
    expect(kinds(host)).toEqual(['entry', 'command', 'entry', 'excluded', 'entry', 'end']);
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0 + 4e6, T0 + 5e6]]);
    // A selection with a shown line in it excludes all of it again.
    await key('ArrowDown', { shiftKey: true });
    expect(btn(host, 'EXCLUDE')).not.toBeNull();
    // Shift+End: to the end of the log; X excludes the tail.
    await key('End', { shiftKey: true });
    expect(selHead(host)).toBe('Selection · 4 lines');
    await key('x');
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0 + 1e6, null]]);
    // Esc clears the selection; the next Esc leaves.
    await key('Escape');
    expect(isExport(host)).toBe(true);
    expect(logRows(host).some((r) => r.sel)).toBe(false);
    expect(selHead(host)).toBe('End of log');
    // A plain move clears a selection too.
    await key('Home');
    await key('ArrowDown', { shiftKey: true });
    expect(selHead(host)).toBe('Selection · 2 lines');
    await key('ArrowDown');
    expect(selHead(host)).toBe('Line · 3');
    await key('Escape');
    expect(historyTop(host)).toBe(true);
  });

  it('the mouse: a press moves the cursor, a drag selects, Shift+click extends', async () => {
    const lib = await library();
    const host = await openEditor(lib);
    await pointer(rowEl(host, 1), 'pointerdown', yOf(1));
    await pointer(window, 'pointerup', yOf(1));
    expect(selHead(host)).toBe('Line · 2');
    // Press on line 2, drag to line 4.
    await pointer(rowEl(host, 1), 'pointerdown', yOf(1));
    await pointer(window, 'pointermove', yOf(2));
    await pointer(window, 'pointermove', yOf(3));
    await pointer(window, 'pointerup', yOf(3));
    expect(selHead(host)).toBe('Selection · 3 lines');
    expect(logRows(host).map((r) => r.sel)).toEqual([false, true, true, true, false, false]);
    await key('x');
    expect(kinds(host)).toEqual(['entry', 'excluded', 'excluded', 'excluded', 'entry', 'end']);
    // A press without movement clears it.
    await pointer(rowEl(host, 0), 'pointerdown', yOf(0));
    await pointer(window, 'pointerup', yOf(0));
    expect(logRows(host).some((r) => r.sel)).toBe(false);
    expect(selHead(host)).toBe('Line · 1');
    // Shift+click extends from the cursor.
    await pointer(rowEl(host, 2), 'pointerdown', yOf(2), { shiftKey: true });
    await pointer(window, 'pointerup', yOf(2));
    expect(selHead(host)).toBe('Selection · 3 lines');
    // Exclude (some lines are shown) by the bar's button.
    await act(() => btn(host, 'EXCLUDE')!.click());
    expect(kinds(host)).toEqual(['excluded', 'excluded', 'excluded', 'excluded', 'entry', 'end']);
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).excludes).toEqual([[T0, T0 + 5e6]]);
  });

  it('adds, edits and deletes comments in the inline composer', async () => {
    const lib = await library();
    const host = await openEditor(lib);
    await key('ArrowDown');
    await key('c');
    expect(comp(host)).not.toBeNull();
    expect(comp(host)!.textContent).toContain('Add comment');
    expect(comp(host)!.textContent).toContain('Type the comment.');
    const ta = field(host, 'comment');
    expect(document.activeElement).toBe(ta);
    // The log keys pause: a letter typed in the composer is text (no exclude).
    await key('x');
    expect(kinds(host)[1]).toBe('command');
    // Newlines (a paste) become spaces.
    await typeIn(ta, 'Hello  there big\nfigh');
    expect(ta.value).toBe('Hello  there big figh');
    expect(frame(host).querySelector('.wc-exp-preview')?.textContent).toBe('## Hello there big figh');
    expect(frame(host).querySelector('.wc-exp-hold')?.textContent).toBe('Holds the replay for 3 s.');
    expect(frame(host).querySelector('.wc-exp-count')?.textContent).toBe('20 / 600');
    // Shift+Enter saves too (a comment is one paragraph).
    await key('Enter', { shiftKey: true });
    expect(comp(host)).toBeNull();
    expect(document.activeElement?.classList.contains('wc-stack')).toBe(true);
    let rows = logRows(host);
    expect(rows[1]).toEqual({ kind: 'comment', text: '## Hello there big figh', cur: true, sel: false });
    expect(rows[2]!.text).toBe('> look');
    expect(counts(host)).toMatch(/· 0 excluded · 1 comment$/);

    // E edits it in place; Esc cancels; Ctrl+U + text + Enter replaces.
    await key('e');
    expect(comp(host)!.textContent).toContain('Edit comment');
    expect(frame(host).querySelector('.wc-exp-row[data-kind="comment"]')).toBeNull();
    expect(field(host, 'comment').value).toBe('Hello there big figh');
    await key('Escape');
    expect(comp(host)).toBeNull();
    expect(logRows(host)[1]!.text).toBe('## Hello there big figh');
    await key('Enter');
    expect(comp(host)).not.toBeNull();
    await key('u', { ctrlKey: true });
    expect(field(host, 'comment').value).toBe('');
    expect(comp(host)!.textContent).toContain('An empty comment is deleted.');
    await typeIn(field(host, 'comment'), 'Watch this');
    await key('Enter');
    expect(logRows(host)[1]!.text).toBe('## Watch this');

    // C on a comment adds after it; the Save button saves.
    await key('c');
    await typeIn(field(host, 'comment'), 'Second');
    await act(() => btn(host, 'SAVE')!.click());
    rows = logRows(host);
    expect(rows.slice(1, 3).map((r) => r.text)).toEqual(['## Watch this', '## Second']);
    expect(rows[2]!.cur).toBe(true);
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).comments).toEqual([
      { beforeUs: T0 + 1e6, text: 'Watch this' },
      { beforeUs: T0 + 1e6, text: 'Second' },
    ]);

    // Edit and Delete are enabled on a comment.
    expect(btn(host, 'EDIT')!.getAttribute('aria-disabled')).toBeNull();
    expect(selHead(host)).toBe('Comment');
    // Delete deletes the cursor comment; an emptied edit deletes too.
    await key('Delete');
    expect(logRows(host)[2]).toMatchObject({ text: '> look', cur: true });
    expect(btn(host, 'EDIT')!.getAttribute('aria-disabled')).toBe('true');
    await key('ArrowUp');
    await key('d');
    expect(logRows(host).some((r) => r.kind === 'comment')).toBe(false);
    expect(logRows(host)[1]).toMatchObject({ text: '> look', cur: true });
    // An empty new comment is not added; Cancel closes.
    await key('c');
    await key('Enter');
    expect(logRows(host).some((r) => r.kind === 'comment')).toBe(false);
    await key('c');
    await act(() => btn(host, 'CANCEL')!.click());
    expect(comp(host)).toBeNull();
  });

  it('touch: a margin tap selects the line, a second extends; a text tap clears', async () => {
    setDeviceForTest({ touch: true, phone: false });
    cleanup.push(() => setDeviceForTest({ touch: false, phone: false }));
    const lib = await library();
    const host = await openEditor(lib);
    const tap = (item: number, x: number) =>
      act(() => {
        rowEl(host, item).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x }));
      });
    // A touch press starts no drag.
    await pointer(rowEl(host, 3), 'pointerdown', yOf(3), { pointerType: 'touch' });
    expect(selHead(host)).toBe('Line · 1');
    await tap(1, 5);
    expect(selHead(host)).toBe('Selection · 1 line');
    await tap(3, 5);
    expect(selHead(host)).toBe('Selection · 3 lines');
    await key('x');
    expect(kinds(host)).toEqual(['entry', 'excluded', 'excluded', 'excluded', 'entry', 'end']);
    await tap(4, 200);
    expect(selHead(host)).toBe('Line · 5');
    expect(logRows(host).some((r) => r.sel)).toBe(false);
  });

  it('C above a selection; the inline title; H / P only choose; O exports the chosen format; persistence', async () => {
    const lib = await library();
    let host = await openEditor(lib);
    // C with lines 3–4 selected: the comment goes above the selection.
    await key('ArrowDown');
    await key('ArrowDown');
    await key('ArrowDown', { shiftKey: true });
    await key('c');
    await typeIn(field(host, 'comment'), 'Fight');
    await key('Enter');
    expect(logRows(host)[2]).toMatchObject({ kind: 'comment', text: '## Fight', cur: true });
    expect(logRows(host).some((r) => r.sel)).toBe(false);
    await key('ArrowUp');
    await key('ArrowUp');

    // T: the title inline in the foot.
    await key('t');
    const tf = field(host, 'title');
    expect(tf.value).toMatch(/^mume-Rasta-/);
    expect(document.activeElement).toBe(tf);
    await key('u', { ctrlKey: true });
    expect(frame(host).querySelector('.wc-exp-thint')?.textContent).toBe('Empty: the default title.');
    await typeIn(field(host, 'title'), 'Big  fight');
    expect(frame(host).querySelector('.wc-exp-thint')?.textContent).toBe('File: Big fight.html');
    await key('Enter');
    expect(docTitle(host)).toBe('Big fight');
    // Esc cancels an edit of the title.
    await key('t');
    await typeIn(field(host, 'title'), 'Nope');
    await key('Escape');
    expect(docTitle(host)).toBe('Big fight');
    await key('ArrowDown');
    await key('x');

    // P chooses the text format (no export), saved at once.
    const { blobs, names } = downloads();
    await key('p');
    expect(checked(host, 'TEXT')).toBe(true);
    expect(checked(host, 'HTML')).toBe(false);
    expect(frame(host).querySelector('.wc-exp-fn')?.textContent).toBe('Big fight.txt');
    expect(names).toEqual([]);
    await until(() => true);
    expect((await lib.exportDoc('Rasta/1')).format).toBe('text');
    // O exports it as `<title>.txt`.
    await key('o');
    await until(() => names.length === 1, 'the download');
    expect(names).toEqual(['Big fight.txt']);
    expect(await blobs[0]!.text()).toBe('You are standing in a field.\n## Fight\nAn orc scout is here.\nThe orc scout is dead!\nYou feel better.\n');
    expect(flash(host)).toBe('Exported Big fight.txt');
    // The Export button exports too.
    await act(() => btn(host, 'EXPORT')!.click());
    await until(() => names.length === 2, 'the second download');
    // H chooses HTML again; a click on Plain text chooses text.
    await key('h');
    expect(checked(host, 'HTML')).toBe(true);
    await act(() => opt(host, 'TEXT')!.click());
    expect(checked(host, 'TEXT')).toBe(true);
    expect(names.length).toBe(2);

    // Back returns to History; reopening restores the edits.
    await key('Escape');
    expect(historyTop(host)).toBe(true);
    cleanup.splice(0).forEach((c) => c());
    document.body.innerHTML = '';
    host = await openEditor(lib);
    expect(counts(host)).toMatch(/· 1 excluded · 1 comment$/);
    expect(docTitle(host)).toBe('Big fight');
    expect(checked(host, 'TEXT')).toBe(true);
    // Title back to the default: an empty title.
    await key('t');
    await key('u', { ctrlKey: true });
    await key('Enter');
    expect(docTitle(host)).toMatch(/^mume-Rasta-/);
  });

  it('Tab walks the enabled buttons (tools, title, formats, Export); ← → move, Enter presses', async () => {
    const lib = await library();
    const host = await openEditor(lib);
    await key('Tab');
    expect(keySel(host)).toBe('EXCLUDE');
    await key('ArrowRight');
    expect(keySel(host)).toBe('COMMENT');
    // Edit and Delete are disabled off a comment: → goes to the title.
    await key('ArrowRight');
    expect(keySel(host)).toBe('TITLE');
    await key('ArrowRight');
    expect(keySel(host)).toBe('HTML');
    await key('ArrowRight');
    expect(keySel(host)).toBe('TEXT');
    await key('Enter');
    expect(checked(host, 'TEXT')).toBe(true);
    await key('Tab');
    expect(keySel(host)).toBe('EXPORT');
    expect(frame(host).querySelector('.wc-exp-log')!.classList.contains('is-idle')).toBe(true);
    for (let i = 0; i < 5; i++) await key('ArrowLeft');
    expect(keySel(host)).toBe('EXCLUDE');
    await key('Enter');
    expect(kinds(host)[0]).toBe('excluded');
    // Shift+Tab: back to the log; its keys move the cursor again.
    await key('Tab', { shiftKey: true });
    expect(keySel(host)).toBeUndefined();
    await key('ArrowDown');
    expect(selHead(host)).toBe('Line · 2');
  });

  it('renders only the rows near the view; End reaches the last row', async () => {
    const n = 3000;
    const text = Array.from({ length: n }, (_, i) => `${String(T0 + i * 1e3).padStart(16, '0')} line ${i}`).join('\n') + '\n';
    const lib = await library(text, n);
    const host = await openEditor(lib);
    const shown = frame(host).querySelectorAll('.wc-exp-row').length;
    expect(shown).toBeGreaterThan(30);
    expect(shown).toBeLessThan(200);
    expect(counts(host)).toContain('3,000 lines');
    await key('End');
    expect(rowEl(host, n)?.dataset.kind).toBe('end');
    expect(rowEl(host, n)!.classList.contains('is-cur')).toBe(true);
    expect(rowEl(host, 0)).toBeNull();
    expect(frame(host).querySelectorAll('.wc-exp-row').length).toBeLessThan(200);
    await key('PageUp');
    expect(selHead(host)).toBe(`Line · ${n - 37}`);
  });

  it('pastes newlines as spaces', () => {
    expect(pasteText('a\r\nb\nc\td')).toBe('a b c d');
  });
});
