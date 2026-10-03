// @vitest-environment happy-dom
// Stage 17 B: the profile picker's IMPORT (several files, bytes, the lazy
// import chunk) and the import report frame (ADR 0073 §Report frame).
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ChromeServices, mountStartPage } from '../../src/chrome';
import { countsText, reportGroups, reportHeader, reportRows } from '../../src/chrome/frames/import-report';
import type { ImportFile, ImportResult } from '../../src/import/types';
import { ProfileStore } from '../../src/profiles';
import { RunLibrary } from '../../src/runs/library';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';

const importFiles = vi.fn<(files: ImportFile[]) => ImportResult>();
vi.mock('../../src/chrome/frames/import-load', () => ({ loadImportFiles: async () => importFiles }));

const editor = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../../src/editor', () => ({ openProfileEditor: editor.open }));

function result(p: Partial<ImportResult> = {}): ImportResult {
  return {
    format: 'jmc',
    signals: ['.set file name', '#hot with Ctrl+'],
    entry: 'mychar.set',
    profileText: '#nop {Imported}\n#alias {k} {kill %1}\n',
    items: [
      { file: 'mychar.set', line: 1, source: '#alias {k} {kill %1}', outcome: 'translated' },
      { file: 'mychar.set', line: 2, source: '#presub on', outcome: 'skipped', reason: 'client state' },
      { file: 'mychar.set', line: 3, source: '#scriptlet {x}\n{more}', outcome: 'kept', reason: 'JScript' },
      {
        file: 'global.set',
        line: 7,
        source: '#tickon',
        outcome: 'translated',
        reason: 'became #ticker',
        warning: 'tick timing differs',
      },
    ],
    counts: { translated: 2, kept: 1, skipped: 1, warnings: 2 },
    fileWarnings: ['Only the first matching action fired in JMC; here every match fires.'],
    missingFiles: ['spells.set'],
    unchanged: false,
    ...p,
  };
}

const flat = (rows: { text: string }[][]): string[] => rows.map((r) => r.map((s) => s.text).join(''));

describe('import report text', () => {
  it('heads with profile, format, signals, counts, warnings and missing files', () => {
    const h = flat(reportHeader(result(), 'mychar', 80));
    expect(h[0]).toBe('Profile  mychar');
    expect(h[1]).toBe('Format   JMC (.set file name, #hot with Ctrl+)');
    expect(h[2]).toBe('Translated 2 · Kept 1 · Skipped 1 · Warnings 2');
    expect(h[3]).toMatch(/^! Only the first matching action/);
    expect(h[h.length - 1]).toBe('Missing files: spells.set');
    expect(countsText(result())).toBe(h[2]);
  });

  it('groups kept, skipped, then translated with a warning', () => {
    expect(reportGroups(result()).map((g) => [g.title, g.items.length])).toEqual([
      ['KEPT', 1],
      ['SKIPPED', 1],
      ['WARNINGS', 1],
    ]);
    const rows = flat(reportRows(result(), 60));
    expect(rows).toEqual([
      'KEPT (1)',
      'mychar.set:3  JScript',
      '    #scriptlet {x} …',
      '',
      'SKIPPED (1)',
      'mychar.set:2  client state',
      '    #presub on',
      '',
      'WARNINGS (1)',
      'global.set:7  became #ticker; tick timing differs',
      '    #tickon',
    ]);
    for (const r of reportRows(result({ items: [{ ...result().items[1]!, source: 'x'.repeat(200) }] }), 40))
      expect(r.map((s) => s.text).join('').length).toBeLessThanOrEqual(40);
    // The source is dimmed.
    expect(reportRows(result(), 60)[2]![0]!.cls).toBe('wc-c-hint');
  });

  it('gives the short form for an unchanged native profile', () => {
    const r = result({ format: 'tintin', unchanged: true, profileText: 'a\nb\nc\n', items: [] });
    expect(flat(reportHeader(r, 'x', 80))).toEqual(['Profile  x', 'Format   TinTin++, 3 lines, nothing changed']);
    expect(reportRows(r, 80)).toEqual([]);
  });
});

// ------------------------------------------------------------- rendering

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});

let cleanup: Array<() => void> = [];
afterEach(() => {
  vi.clearAllMocks();
  for (const c of cleanup.splice(0)) c();
  document.body.innerHTML = '';
});

function services(): ChromeServices {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
  void cells.update(settings.get().appearance);
  const profiles = new ProfileStore({ factory: null });
  return { settings, cells, profiles, version: '9.9.9', runs: () => RunLibrary.open(new IDBFactory()) };
}

const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });

const frame = (host: HTMLElement) => host.querySelector('.wc-frame:not([hidden])')!;
const title = (host: HTMLElement) => frame(host).querySelector('.wc-title-row .wc-c-section')?.textContent;
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

async function openPicker(svc: ChromeServices): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const page = mountStartPage(host, svc, { onEnter: () => {} });
  cleanup.push(() => page.dispose());
  await act(() => page.show());
  await key('ArrowDown');
  await key('Enter');
  await settle();
  expect(title(host)).toBe('─── Profile ───');
  return host;
}

async function choose(host: HTMLElement, files: File[]): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('.wc-profile-file')!;
  expect(input.multiple).toBe(true);
  Object.defineProperty(input, 'files', { configurable: true, get: () => files });
  await act(() => {
    input.dispatchEvent(new Event('change'));
  });
  await settle();
  await settle();
}

describe('IMPORT and the report frame', () => {
  it('imports several files as bytes, saves the profile and shows the report', async () => {
    const svc = services();
    importFiles.mockReturnValue(result());
    const host = await openPicker(svc);
    await choose(host, [
      new File([new Uint8Array([0x23, 0x61, 0xe9])], 'mychar.set'),
      new File(['#alias a b'], 'global.set'),
    ]);

    expect(importFiles).toHaveBeenCalledTimes(1);
    const files = importFiles.mock.calls[0]![0];
    expect(files.map((f) => f.name)).toEqual(['mychar.set', 'global.set']);
    expect(files[0]!.bytes).toBeInstanceOf(Uint8Array);
    expect([...files[0]!.bytes]).toEqual([0x23, 0x61, 0xe9]);

    expect((await svc.profiles.get('mychar'))?.text).toBe(result().profileText);
    expect(svc.settings.get().profile).toBe('mychar');

    expect(title(host)).toBe('─── IMPORT REPORT ───');
    const text = frame(host).textContent!;
    expect(text).toContain('Format   JMC');
    expect(text).toContain('Translated 2 · Kept 1 · Skipped 1 · Warnings 2');
    expect(text).toContain('Missing files: spells.set');
    expect(text).toContain('mychar.set:2  client state');
    expect(frame(host).querySelector('.wc-btn.is-sel-focus')?.textContent?.trim()).toBe('OK');

    // Tab moves focus to the list; ←/→ back to the buttons.
    await key('Tab');
    expect(frame(host).querySelector('.wc-btn.is-sel-focus')).toBeNull();
    await key('ArrowLeft');
    expect(frame(host).querySelector('.wc-btn.is-sel-focus')?.textContent?.trim()).toBe('EDIT');

    // EDIT opens the editor for the new profile.
    await key('Enter');
    await settle();
    expect(editor.open).toHaveBeenCalledTimes(1);
    expect(editor.open.mock.calls[0]![1]).toMatchObject({ name: 'mychar', text: result().profileText });

    // ESC is OK: back to the picker with the profile under the cursor.
    await key('Escape');
    expect(title(host)).toBe('─── Profile ───');
    expect(frame(host).querySelector('.wc-flash')?.textContent).toBe('Imported "mychar" from mychar.set.');
    expect(frame(host).querySelector('.wc-tr.is-cur-focus')?.textContent).toContain('mychar');
  });

  it('shows the short form for an unchanged profile; OK returns', async () => {
    const svc = services();
    importFiles.mockReturnValue(result({ format: 'tintin', entry: 'My Warrior.tin', unchanged: true, items: [], profileText: '#alias {k} {kill %1}\n' }));
    const host = await openPicker(svc);
    await choose(host, [new File(['#alias {k} {kill %1}\n'], 'My Warrior.tin')]);
    expect(title(host)).toBe('─── IMPORT REPORT ───');
    expect(frame(host).textContent).toContain('TinTin++, 1 line, nothing changed');
    expect(frame(host).querySelector('.wc-import-list')).toBeNull();
    await key('Enter');
    expect(title(host)).toBe('─── Profile ───');
    expect(svc.settings.get().profile).toBe('My_Warrior');
  });

  it('flashes a failure and stays on the picker', async () => {
    const svc = services();
    importFiles.mockImplementation(() => {
      throw new Error('boom');
    });
    const host = await openPicker(svc);
    await choose(host, [new File(['x'], 'x.tin')]);
    expect(title(host)).toBe('─── Profile ───');
    expect(frame(host).querySelector('.wc-flash')?.textContent).toBe('Import failed: boom');
  });
});
