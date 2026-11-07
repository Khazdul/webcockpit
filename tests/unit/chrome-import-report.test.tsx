// @vitest-environment happy-dom
// Stage 17 B, rewritten for stage 43c (ADR 0128, ADR 0073 addendum): the
// Profile list's Import opens the import page (direction C: the drop zone,
// Choose files…, the formats), which reads the chosen or dropped files
// through the lazy import chunk and shows the receipt in the same box (OK
// only; the list then highlights the new profile and flashes).
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ChromeServices, mountStartPage } from '../../src/chrome';
import {
  fromText,
  lineCount,
  readingText,
  reportGroups,
  sourceLine,
  summaryParts,
  summaryText,
  unchangedText,
} from '../../src/chrome/frames/import-model';
import type { ImportFile, ImportResult } from '../../src/import/types';
import { ProfileStore } from '../../src/profiles';
import { RunLibrary } from '../../src/runs/library';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';

const importFiles = vi.fn<(files: ImportFile[]) => ImportResult>();
/** Resolves the lazy chunk's load (a test can hold it to see the reading state). */
let chunkGate: Promise<void> = Promise.resolve();
vi.mock('../../src/chrome/frames/import-load', async (orig) => ({
  ...(await orig<typeof import('../../src/chrome/frames/import-load')>()),
  loadImportFiles: async () => {
    await chunkGate;
    return importFiles;
  },
}));

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
      { file: 'mychar.set', line: 3, source: '\n#scriptlet {x}\n{more}', outcome: 'kept', reason: 'JScript' },
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

describe('import page and receipt text', () => {
  it('says the counts as one sentence', () => {
    expect(summaryText({ translated: 412, kept: 9, skipped: 6, warnings: 4 })).toBe(
      '412 settings were translated, 9 kept as #nop, 6 skipped, and 4 need a look.',
    );
    expect(summaryText({ translated: 1, kept: 0, skipped: 0, warnings: 1 })).toBe(
      '1 setting was translated and 1 needs a look.',
    );
    expect(summaryText({ translated: 3, kept: 0, skipped: 0, warnings: 0 })).toBe('3 settings were translated.');
    expect(summaryText({ translated: 0, kept: 2, skipped: 5, warnings: 0 })).toBe(
      '0 settings were translated, 2 kept as #nop, and 5 skipped.',
    );
    expect(summaryParts({ translated: 2, kept: 1, skipped: 1, warnings: 2 }).map((p) => p.n)).toEqual([2, 1, 1, 2]);
  });

  it('groups kept as #nop, skipped, then translated with a warning', () => {
    expect(reportGroups(result()).map((g) => [g.id, g.title, g.items.length])).toEqual([
      ['kept', 'Kept as #nop', 1],
      ['skipped', 'Skipped', 1],
      ['warned', 'Translated with a warning', 1],
    ]);
    expect(reportGroups(result({ items: [result().items[0]!] }))).toEqual([]);
  });

  it('names the source, the files and the short form', () => {
    expect(sourceLine('\n  #scriptlet {x}\n{more}')).toBe('#scriptlet {x} …');
    expect(sourceLine('#presub on')).toBe('#presub on');
    expect(fromText('gibur.set', ['gibur.set', 'paths.set', 'spells.set'])).toBe(
      'a new profile from gibur.set and 2 more files',
    );
    expect(fromText('gibur.set', ['gibur.set', 'paths.set'])).toBe('a new profile from gibur.set and 1 more file');
    expect(fromText('x.tin', ['x.tin'])).toBe('a new profile from x.tin');
    expect(readingText(['a.set', 'b.set'])).toBe('Reading a.set, b.set…');
    expect(lineCount('a\nb\nc\n\n')).toBe(3);
    expect(unchangedText(result({ format: 'tintin', unchanged: true, profileText: 'a\nb\nc\n' }))).toBe(
      'TinTin++, 3 lines, nothing changed.',
    );
    expect(unchangedText(result({ format: 'tintin', unchanged: true, profileText: 'a\n' }))).toBe(
      'TinTin++, 1 line, nothing changed.',
    );
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
  chunkGate = Promise.resolve();
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
/** The top frame's hood (the new look, ADR 0125). */
const hood = (host: HTMLElement) => frame(host).querySelector('.wc-lk-hood-t:not(.is-out)')?.textContent;
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const sel = (host: HTMLElement) => frame(host).querySelector('.wc-lk-btn.is-sel')?.getAttribute('data-btn') ?? null;

async function openList(svc: ChromeServices): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const page = mountStartPage(host, svc, { onEnter: () => {} });
  cleanup.push(() => page.dispose());
  await act(() => page.show());
  await key('ArrowDown');
  await key('Enter');
  await settle();
  expect(hood(host)).toBe('Profiles');
  return host;
}

/** I on the list: the import page. */
async function openImport(svc: ChromeServices): Promise<HTMLElement> {
  const host = await openList(svc);
  await key('i');
  await settle();
  expect(hood(host)).toBe('Import');
  return host;
}

/** The page's hidden picker gives `files`. */
async function choose(host: HTMLElement, files: File[]): Promise<void> {
  const input = frame(host).querySelector<HTMLInputElement>('.wc-imp-file')!;
  expect(input.multiple).toBe(true);
  Object.defineProperty(input, 'files', { configurable: true, get: () => files });
  await act(() => {
    input.dispatchEvent(new Event('change'));
  });
  await settle();
  await settle();
  await settle();
}

/** A drag event carrying `files` (happy-dom's DragEvent lacks a usable DataTransfer). */
function dragEvent(type: string, files: File[]): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: 'none' } });
  return e;
}

describe('the import page', () => {
  it('opens from the list with the drop zone, Choose files… and the formats; Esc goes back', async () => {
    const host = await openImport(services());
    const f = frame(host);
    expect(f.querySelector('.wc-imp-lead')?.textContent).toMatch(/^Settings from another client become a new profile/);
    expect(f.querySelector('.wc-imp-drop-t')?.textContent).toBe('Drop the files here');
    // Choose files… is the primary button; nothing is lit until the keyboard walks (Enter presses it).
    expect(sel(host)).toBeNull();
    expect([...f.querySelectorAll('.wc-imp-fmts b')].map((b) => b.textContent)).toEqual([
      'TinTin++',
      'JMC',
      'Powwow',
      'Mudlet',
    ]);
    // Enter and C open the native picker.
    const input = f.querySelector<HTMLInputElement>('.wc-imp-file')!;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    await key('Enter');
    await key('c');
    expect(click).toHaveBeenCalledTimes(2);
    await key('Escape');
    expect(hood(host)).toBe('Profiles');
  });

  it('imports the chosen files, shows the receipt; OK returns to the list with the flash and the cursor', async () => {
    const svc = services();
    importFiles.mockReturnValue(result());
    const host = await openImport(svc);
    await choose(host, [
      new File([new Uint8Array([0x23, 0x61, 0xe9])], 'mychar.set'),
      new File(['#alias a b'], 'global.set'),
    ]);

    expect(importFiles).toHaveBeenCalledTimes(1);
    const files = importFiles.mock.calls[0]![0];
    expect(files.map((f) => f.name)).toEqual(['mychar.set', 'global.set']);
    expect([...files[0]!.bytes]).toEqual([0x23, 0x61, 0xe9]);
    expect((await svc.profiles.get('mychar'))?.text).toBe(result().profileText);
    expect(svc.settings.get().profile).toBe('mychar');

    // The receipt, in the same box (tall: it has a list).
    expect(hood(host)).toBe('Import');
    const f = frame(host);
    expect(f.querySelector('.wc-lk-box.is-tall')).not.toBeNull();
    expect(f.querySelector('.wc-imp-name')?.textContent).toBe('mychar');
    expect(f.querySelector('.wc-imp-from')?.textContent).toBe('a new profile from mychar.set and 1 more file');
    expect(f.querySelector('.wc-imp-f')?.textContent).toBe('JMC');
    expect([...f.querySelectorAll('.wc-imp-chip')].map((c) => c.textContent)).toEqual([
      '.set file name',
      '#hot with Ctrl+',
    ]);
    expect(f.querySelector('.wc-imp-notes')?.textContent).toContain('Only the first matching action');
    expect(f.querySelector('.wc-imp-notes .is-miss')?.textContent).toBe('Missing files: spells.set');
    expect(f.querySelector('.wc-imp-sum')?.textContent).toBe(
      '2 settings were translated, 1 kept as #nop, 1 skipped, and 2 need a look.',
    );
    // The groups: the first open, the others folded.
    const groups = [...f.querySelectorAll<HTMLElement>('.wc-imp-grp')];
    expect(groups.map((g) => g.dataset['grp'])).toEqual(['kept', 'skipped', 'warned']);
    expect(groups.map((g) => g.querySelector('.wc-imp-grp-h')!.getAttribute('aria-expanded'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(groups[0]!.querySelector('.wc-imp-at')?.textContent).toBe('mychar.set:3');
    expect(groups[0]!.querySelector('.wc-imp-why')?.textContent).toBe('JScript');
    expect(groups[0]!.querySelector('.wc-imp-src')?.textContent).toBe('#scriptlet {x} …');
    // OK only: no Edit. Nothing lit yet (Enter is OK).
    expect(f.querySelector('[data-btn="EDIT"]')).toBeNull();
    expect(sel(host)).toBeNull();

    // Tab walks the headers and OK; Space and Enter on a header fold it.
    await key('Tab');
    expect(frame(host).querySelector('.wc-imp-grp.is-sel')?.getAttribute('data-grp')).toBe('kept');
    expect(sel(host)).toBeNull();
    await key(' ');
    expect(frame(host).querySelector('[data-grp="kept"] .wc-imp-grp-h')?.getAttribute('aria-expanded')).toBe('false');
    await key('Tab');
    await key('Tab');
    await key('Enter');
    const warned = frame(host).querySelector('[data-grp="warned"]')!;
    expect(warned.querySelector('.wc-imp-grp-h')?.getAttribute('aria-expanded')).toBe('true');
    expect(warned.querySelector('.wc-imp-why')?.textContent).toBe('became #ticker; tick timing differs');
    expect(warned.querySelector('.wc-imp-w')?.textContent).toBe('tick timing differs');
    // A click on a header folds it too.
    await act(() => {
      frame(host).querySelector<HTMLElement>('[data-grp="skipped"] .wc-imp-grp-h')!.click();
    });
    expect(frame(host).querySelector('[data-grp="skipped"] .wc-imp-grp-h')?.getAttribute('aria-expanded')).toBe('true');
    // Shift+Tab back round to OK (skipped → kept → OK).
    await key('Tab', { shiftKey: true });
    expect(frame(host).querySelector('.wc-imp-grp.is-sel')?.getAttribute('data-grp')).toBe('kept');
    await key('Tab', { shiftKey: true });
    expect(sel(host)).toBe('OK');
    expect(editor.open).not.toHaveBeenCalled();

    // Enter on OK: the list, not the import page; the flash and the cursor on the new profile.
    await key('Enter');
    await settle();
    expect(hood(host)).toBe('Profiles');
    expect(frame(host).querySelector('.wc-lk-flash')?.textContent).toBe('Imported "mychar" from mychar.set.');
    expect(frame(host).querySelector('.wc-pl-row.is-on')?.textContent).toContain('mychar');
    // The new profile is selected: Enter on it opens the editor.
    await key('Enter');
    await settle();
    expect(editor.open).toHaveBeenCalledTimes(1);
    expect(editor.open.mock.calls[0]![1]).toMatchObject({ name: 'mychar' });
  });

  it('Space never closes the receipt: with no header lit, or on OK, it stays', async () => {
    const svc = services();
    importFiles.mockReturnValue(result());
    const host = await openImport(svc);
    await choose(host, [new File(['x'], 'mychar.set')]);
    expect(frame(host).querySelector('.wc-imp-name')).not.toBeNull();
    // Nothing lit: Space pages the receipt (as a browser does), it does not press OK.
    await key(' ');
    await settle();
    expect(frame(host).querySelector('.wc-imp-name')).not.toBeNull();
    // On OK too.
    await key('Tab', { shiftKey: true });
    expect(sel(host)).toBe('OK');
    await key(' ');
    await settle();
    expect(frame(host).querySelector('.wc-imp-name')).not.toBeNull();
    // Enter on OK still closes it.
    await key('Enter');
    await settle();
    expect(hood(host)).toBe('Profiles');
  });

  it('O and Esc are OK too', async () => {
    for (const k of ['o', 'Escape']) {
      const svc = services();
      importFiles.mockReturnValue(result());
      const host = await openImport(svc);
      await choose(host, [new File(['x'], 'mychar.set')]);
      expect(frame(host).querySelector('.wc-imp-name')).not.toBeNull();
      await key(k);
      await settle();
      expect(hood(host)).toBe('Profiles');
      expect(frame(host).querySelector('.wc-lk-flash')?.textContent).toBe('Imported "mychar" from mychar.set.');
      for (const c of cleanup.splice(0)) c();
      document.body.innerHTML = '';
    }
  });

  it('shows the short form for an unchanged profile; Enter is OK', async () => {
    const svc = services();
    importFiles.mockReturnValue(
      result({
        format: 'tintin',
        entry: 'My Warrior.tin',
        signals: [],
        unchanged: true,
        items: [],
        fileWarnings: [],
        missingFiles: [],
        profileText: '#alias {k} {kill %1}\n',
      }),
    );
    const host = await openImport(svc);
    await choose(host, [new File(['#alias {k} {kill %1}\n'], 'My Warrior.tin')]);
    const f = frame(host);
    expect(f.querySelector('.wc-imp-ok')?.textContent).toContain('TinTin++, 1 line, nothing changed.');
    expect(f.querySelector('.wc-imp-grp')).toBeNull();
    expect(f.querySelector('.wc-imp-sum')).toBeNull();
    expect(f.querySelector('.wc-lk-box.is-tall')).toBeNull();
    await key('Enter');
    await settle();
    expect(hood(host)).toBe('Profiles');
    expect(svc.settings.get().profile).toBe('My_Warrior');
    expect(frame(host).querySelector('.wc-lk-flash')?.textContent).toBe('Imported "My_Warrior" from My Warrior.tin.');
  });

  it('says so when every setting was translated as it was', async () => {
    const svc = services();
    importFiles.mockReturnValue(
      result({
        items: [result().items[0]!],
        counts: { translated: 1, kept: 0, skipped: 0, warnings: 0 },
        fileWarnings: [],
        missingFiles: [],
      }),
    );
    const host = await openImport(svc);
    await choose(host, [new File(['x'], 'mychar.set')]);
    const f = frame(host);
    expect(f.querySelector('.wc-imp-fine')?.textContent).toBe('Every setting was translated as it was.');
    expect(f.querySelector('.wc-imp-notes')).toBeNull();
  });

  it('shows "Reading …" while the chunk loads, then the receipt', async () => {
    const svc = services();
    importFiles.mockReturnValue(result());
    let open!: () => void;
    chunkGate = new Promise((r) => (open = r));
    const host = await openImport(svc);
    await choose(host, [new File(['x'], 'mychar.set'), new File(['y'], 'paths.set')]);
    expect(frame(host).querySelector('.wc-imp-page')?.getAttribute('data-stage')).toBe('reading');
    expect(frame(host).querySelector('.wc-imp-reading')?.textContent).toBe('Reading mychar.set, paths.set…');
    // Keys wait (no second picker), Esc would go back.
    await key('Enter');
    open();
    await settle();
    await settle();
    expect(frame(host).querySelector('.wc-imp-name')?.textContent).toBe('mychar');
  });

  it('Back while reading drops the import', async () => {
    const svc = services();
    importFiles.mockReturnValue(result());
    let open!: () => void;
    chunkGate = new Promise((r) => (open = r));
    const host = await openImport(svc);
    await choose(host, [new File(['x'], 'mychar.set')]);
    await key('Escape');
    expect(hood(host)).toBe('Profiles');
    open();
    await settle();
    await settle();
    expect(hood(host)).toBe('Profiles');
    expect(await svc.profiles.get('mychar')).toBeNull();
  });

  it('keeps a failure on the page with the files, and the drop zone to try again', async () => {
    const svc = services();
    importFiles.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const host = await openImport(svc);
    await choose(host, [new File(['x'], 'x.tin'), new File(['y'], 'y.set')]);
    expect(hood(host)).toBe('Import');
    const f = frame(host);
    expect(f.querySelector('.wc-imp-page')?.getAttribute('data-stage')).toBe('error');
    expect(f.querySelector('.wc-imp-err p')?.textContent).toBe('Import failed: boom');
    expect(f.querySelector('.wc-imp-err-files')?.textContent).toBe('x.tin, y.set');
    expect(f.querySelector('.wc-imp-fmts')).toBeNull();
    expect(f.querySelector('[data-btn="CHOOSE"]')).not.toBeNull();
    // Choose again: it works.
    importFiles.mockReturnValue(result());
    await choose(host, [new File(['x'], 'mychar.set')]);
    expect(frame(host).querySelector('.wc-imp-name')?.textContent).toBe('mychar');
  });

  it('imports the files dropped on the box; a drag over lights the zone', async () => {
    const svc = services();
    importFiles.mockReturnValue(result());
    const host = await openImport(svc);
    const box = frame(host).querySelector<HTMLElement>('.wc-lk-box')!;
    const files = [new File(['#alias a b'], 'mychar.set')];
    await act(() => {
      frame(host).querySelector('.wc-imp-drop')!.dispatchEvent(dragEvent('dragenter', files));
    });
    expect(frame(host).querySelector('.wc-imp-drop.is-over')).not.toBeNull();
    const over = dragEvent('dragover', files);
    box.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    // A drop beside the box is swallowed (the browser must not open the file).
    const beside = dragEvent('drop', files);
    await act(() => {
      document.body.dispatchEvent(beside);
    });
    expect(beside.defaultPrevented).toBe(true);
    expect(importFiles).not.toHaveBeenCalled();
    // On the hood (anywhere on the box) it imports.
    await act(() => {
      box.querySelector('.wc-lk-hood')!.dispatchEvent(dragEvent('drop', files));
    });
    await settle();
    await settle();
    await settle();
    expect(importFiles).toHaveBeenCalledTimes(1);
    expect(importFiles.mock.calls[0]![0].map((f) => f.name)).toEqual(['mychar.set']);
    expect(frame(host).querySelector('.wc-imp-name')?.textContent).toBe('mychar');
  });
});
