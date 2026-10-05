// @vitest-environment happy-dom
import { IDBFactory } from 'fake-indexeddb';
import { deflateSync, inflateSync } from 'node:zlib';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type ChromeServices, mountStartPage } from '../../src/chrome';
import { fmtBytes, fmtCount, mapInfoRows } from '../../src/chrome/frames/options-mapper';
import { writeMm2 } from '../../src/map/mm2-write';
import { MapStore } from '../../src/map/store';
import { runMapToolRequest } from '../../src/map/tools';
import { lazyDb } from '../../src/panes/context';
import { ProfileStore } from '../../src/profiles';
import { RunLibrary } from '../../src/runs/library';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';
import { gridMap } from './map-grid';

const inflate = async (z: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateSync(z));

describe('Mapper helpers', () => {
  it('formats the current map', () => {
    expect(fmtBytes(5_814_236)).toBe('5.8 MB');
    expect(fmtBytes(81_200)).toBe('81 kB');
    expect(fmtBytes(12)).toBe('12 B');
    expect(fmtCount(30074)).toBe('30 074');
    expect(mapInfoRows({ kind: 'bundled', name: 'arda.mm2' })).toEqual([['Map', 'arda.mm2 (bundled)']]);
    const rows = mapInfoRows({ kind: 'imported', name: 'x.mm2', size: 2048, date: 0, hash: 'h', rooms: 1234 });
    expect(rows.map((r) => r[0])).toEqual(['Map', 'Rooms', 'Size', 'Imported']);
    expect(rows[1]![1]).toBe('1 234');
  });
});

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
  document.body.innerHTML = '';
});

function services(maps: MapStore): ChromeServices {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
  void cells.update(settings.get().appearance);
  return {
    settings,
    cells,
    profiles: new ProfileStore({ factory: null }),
    version: '9.9.9',
    runs: () => RunLibrary.open(new IDBFactory()),
    maps,
  };
}

const key = (k: string) =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
const frame = (host: HTMLElement) => host.querySelector('.wc-frame:not([hidden])')!;
const labels = (host: HTMLElement) => [...frame(host).querySelectorAll('.wc-mrow .wc-label')].map((e) => e.textContent);
const info = (host: HTMLElement) => [...frame(host).querySelectorAll('.wc-mapper-info')].map((e) => e.textContent!.replace(/\s+/g, ' ').trim());
const click = (host: HTMLElement, k: string) =>
  act(() => frame(host).querySelector<HTMLElement>(`.wc-mrow[data-key="${k}"] .wc-label`)!.click());
const settle = () => act(async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
});

async function pickFile(host: HTMLElement, name: string, bytes: Uint8Array): Promise<void> {
  const input = frame(host).querySelector<HTMLInputElement>('.wc-mapper-file')!;
  expect(input.accept).toBe('.mm2');
  const file = new File([bytes as BlobPart], name);
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(() => {
    input.dispatchEvent(new Event('change'));
  });
  await settle();
}

describe('Options → Mapper', () => {
  it('shows the map, toggles the pane, imports a map and goes back to the bundled one', async () => {
    const factory = new IDBFactory();
    const maps = new MapStore({
      openDb: lazyDb(factory),
      validate: async (bytes) => {
        const r = await runMapToolRequest({ t: 'validate', bytes }, { fetch, inflate });
        if (!r.ok) throw new Error(r.message);
        if (r.t !== 'validate') throw new Error('bad');
        return r.info;
      },
    });
    const svc = services(maps);
    const host = document.createElement('div');
    document.body.append(host);
    const page = mountStartPage(host, svc, { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    await act(() => host.querySelector<HTMLElement>('.wc-mrow[data-key="options"] .wc-label')!.click());
    await click(host, 'panes');
    expect(labels(host)).toEqual(['General', 'Timers', 'Communication', 'Group', 'Back']);

    // General lists the map pane like the others.
    await click(host, 'general');
    expect([...frame(host).querySelectorAll('.wc-grid-row')].map((r) => r.textContent!.slice(0, 12).trim())).toContain('Map');
    await key('Escape');
    await key('Escape');
    expect(labels(host)).toEqual(['Panes', 'Mapper', 'Appearance', 'Text input', 'Spotlights', 'Back']);
    // Text input: the input line toggles and the cursor rows write the store at once (ADR 0063, 0066).
    await click(host, 'textinput');
    expect(frame(host).querySelector('.wc-c-section')?.textContent).toBe('─── Text input ───');
    expect(labels(host)).toEqual([
      '[ ] Auto-clear input',
      '[ ] Input autosuggest',
      'Cursor style: beam',
      'Cursor blink: On',
      'Back',
    ]);
    await click(host, 'autoclear');
    expect(svc.settings.get().input).toEqual({ autoClear: true, autosuggest: false });
    await key('ArrowDown');
    await key('ArrowRight');
    expect(svc.settings.get().input).toEqual({ autoClear: true, autosuggest: true });
    expect(labels(host)).toContain('[X] Input autosuggest');
    await key(' ');
    expect(svc.settings.get().input.autosuggest).toBe(false);
    await click(host, 'autoclear');
    expect(svc.settings.get().input.autoClear).toBe(false);
    await key('ArrowDown');
    await key('ArrowDown');
    await key('ArrowLeft');
    expect(svc.settings.get().appearance.cursorStyle).toBe('block');
    await key('ArrowDown');
    await key('Enter');
    expect(svc.settings.get().appearance.cursorBlink).toBe(false);
    expect(labels(host)).toContain('Cursor style: block');
    expect(labels(host)).toContain('Cursor blink: Off');
    await key('Escape');
    expect(frame(host).querySelector('.wc-c-section')?.textContent).toBe('─── Options ───');

    await click(host, 'mapper');
    await settle();
    expect(frame(host).querySelector('.wc-c-section')?.textContent).toBe('─── Mapper ───');
    expect(info(host)).toEqual(['Map arda.mm2 (bundled)']);
    expect(labels(host)).toEqual([
      '[X] Show map pane',
      'Room notes: On',
      'Room info on hover: Minimal',
      'Import map file…',
      'Use bundled map',
      'Back',
    ]);
    expect(frame(host).querySelector('.wc-mrow[data-key="bundled"]')!.classList.contains('is-disabled')).toBe(true);

    // Enter on the first row turns the map pane off (the General grid's setting).
    await key('Enter');
    expect(svc.settings.get().panes.map.on).toBe(false);
    expect(labels(host)[0]).toBe('[ ] Show map pane');

    // Room notes and hover mode (ADR 0077): cyclers, written at once.
    await key('ArrowDown');
    await key('ArrowRight');
    expect(svc.settings.get().mapper).toEqual({ notes: false, hover: 'minimal' });
    expect(labels(host)[1]).toBe('Room notes: Off');
    await key('ArrowDown');
    await key('ArrowRight');
    expect(svc.settings.get().mapper).toEqual({ notes: false, hover: 'full' });
    expect(labels(host)[2]).toBe('Room info on hover: Full');
    await key('Enter');
    expect(svc.settings.get().mapper.hover).toBe('minimal');
    await key('ArrowUp');
    await key('Enter');
    expect(svc.settings.get().mapper.notes).toBe(true);

    // A bad file: flash, nothing stored.
    await pickFile(host, 'junk.mm2', new Uint8Array([1, 2, 3]));
    expect(frame(host).querySelector('.wc-flash')?.textContent).toMatch(/^Import failed: Not an MMapper map/);
    expect(info(host)).toEqual(['Map arda.mm2 (bundled)']);

    // A good file.
    const bytes = await writeMm2(gridMap(7, 3), async (b) => new Uint8Array(deflateSync(b)));
    await pickFile(host, 'mine.mm2', bytes);
    expect(frame(host).querySelector('.wc-flash')?.textContent).toBe('Imported mine.mm2 (21 rooms).');
    const rows = info(host);
    expect(rows[0]).toBe('Map mine.mm2');
    expect(rows[1]).toBe('Rooms 21');
    expect(rows[2]).toMatch(/^Size \d+ B$/);
    expect(rows[3]).toMatch(/^Imported \d{4}-\d\d-\d\d \d\d:\d\d$/);
    expect((await maps.current()).kind).toBe('imported');

    // Use bundled map.
    await click(host, 'bundled');
    await settle();
    expect(info(host)).toEqual(['Map arda.mm2 (bundled)']);
    expect(frame(host).querySelector('.wc-flash')?.textContent).toBe('Using the bundled map.');
    expect((await maps.current()).kind).toBe('bundled');
  });
});
