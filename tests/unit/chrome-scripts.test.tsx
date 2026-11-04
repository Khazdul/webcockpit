// @vitest-environment happy-dom
// The Scripts page (stage 10 P2, ADR 0051): the pure model and the frame
// on the start page, against an in-memory script library.
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppStatusState, AppStatusView } from '../../src/app/status';
import { type ChromeServices, mountEscMenu, mountStartPage } from '../../src/chrome';
import {
  ALL_BUTTONS,
  PAGE_BUTTONS,
  PAGE_BUTTONS_W,
  ROW_FIXED,
  type Row,
  detailRows,
  edgeChar,
  helpLines,
  listLines,
  rowCells,
  scriptState,
  scriptsLayout,
  stepChoice,
  stepSetting,
} from '../../src/chrome/frames/scripts-model';
import { ProfileStore } from '../../src/profiles';
import { RunLibrary } from '../../src/runs/library';
import { type ScriptInfo, ScriptLibrary } from '../../src/scripts';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';

const LOOTER = `-- @name     looter
-- @summary  Loots coins
-- @api      1
-- @alias    cl  toggle on/off
-- @key      F5  loot now
-- @setting  delay number 0.5 "Seconds before looting"
-- @setting  greet string "hello there" "What to say"
-- @help     First help line.
-- @help
-- @help     After a blank line.
tempTrigger("x", function() end)
`;

const text = (r: Row): string => r.map((s) => s.text).join('');

async function library(): Promise<ScriptLibrary> {
  const lib = new ScriptLibrary({ factory: null, bundled: [{ name: 'looter', source: LOOTER }] });
  await lib.init();
  return lib;
}

describe('scripts model', () => {
  it('lays the package out: name column grows, the frame fills the width, dropped when narrow', () => {
    const wide = scriptsLayout(200, ['a', 'looter']);
    // The button row is wider than a short name's row.
    expect(wide.listW).toBe(PAGE_BUTTONS_W);
    expect(wide.nameW).toBe(PAGE_BUTTONS_W - ROW_FIXED);
    expect(wide.buttons).toEqual(PAGE_BUTTONS);
    // The package spans the grid less one cell each side (ADR 0115 §1).
    expect(wide.at).toBe(1);
    expect(wide.listW + 1 + wide.detailW).toBe(200 - 2);
    const long = scriptsLayout(200, ['x'.repeat(40)]);
    expect(long.nameW).toBe(32);
    // The in-game window's least width (60) still has a frame.
    expect(scriptsLayout(60, ['mercenaries']).detailW).toBe(60 - 2 - PAGE_BUTTONS_W - 1);
    // A phone: the list alone, every button above it.
    const phone = scriptsLayout(40, ['a'], true);
    expect(phone.detailW).toBe(0);
    expect(phone.buttons).toEqual(ALL_BUTTONS);
  });

  it('opens the frame\'s left edge at the selected line', () => {
    expect([0, 1, 2, 3, 4].map((i) => edgeChar(i, 2))).toEqual(['│', '┘', ' ', '┐', '│']);
    expect(edgeChar(0, -1)).toBe('│');
  });

  it('steps numbers on the step grid inside the range, and choices', () => {
    const d = { name: 'n', type: 'number' as const, default: 25, label: '', min: 5, max: 60, step: 5 };
    expect(stepSetting(d, 25, 1)).toBe(30);
    expect(stepSetting(d, 27, 1)).toBe(30);
    expect(stepSetting(d, 27, -1)).toBe(25);
    expect(stepSetting(d, 60, 1)).toBe(60);
    expect(stepSetting(d, 5, -1)).toBe(5);
    expect(stepSetting({ ...d, min: undefined, max: undefined, step: 0.1 }, 0.2, 1)).toBe(0.3);
    expect(stepSetting({ name: 'h', type: 'number', default: 12, label: '', min: 0.5, max: 24 }, 0.5, 1)).toBe(1);
    const c = { name: 'c', type: 'choice' as const, default: 10, label: '', options: [10, 20] };
    expect(stepChoice(c, 10, 1)).toBe(20);
    expect(stepChoice(c, 20, 1)).toBe(20);
    expect(stepChoice(c, 20, -1)).toBe(10);
  });

  it('states: off, running, failed, no host yet', async () => {
    const lib = await library();
    const s = lib.get('looter')!;
    expect(scriptState(s, null)).toMatchObject({ glyph: '○', text: 'off', mark: ' ' });
    const on: ScriptInfo = { ...s, enabled: true };
    expect(scriptState(on, true)).toMatchObject({ text: 'on · running', cls: 'wc-c-ok', mark: '●' });
    expect(scriptState(on, null).text).toBe('on · runs when you enter MUME');
    expect(scriptState({ ...on, lastError: 'looter:3: boom' }, false)).toMatchObject({
      text: 'on · not running',
      mark: '!',
      markTitle: 'looter:3: boom',
    });
  });

  it('puts an error line under a script that failed', async () => {
    const lib = await library();
    await lib.create('mine', '-- @name mine\nx = 1\n');
    const list = lib.list();
    expect(listLines(list)).toEqual([
      { kind: 'script', index: 0 },
      { kind: 'script', index: 1 },
      { kind: 'error', index: 1, text: 'Cannot load: the header needs "-- @api 1".' },
    ]);
  });

  it('shows the page check\'s syntax error when nothing else is wrong', async () => {
    const lib = await library();
    await lib.create('broken', '-- @name broken\n-- @api 1\nx = = 1\n');
    const list = lib.list();
    const syntax = (s: ScriptInfo) => (s.name === 'broken' ? "broken:3: unexpected symbol near '='" : null);
    const i = list.findIndex((s) => s.name === 'broken');
    expect(listLines(list, syntax).filter((l) => l.kind === 'error')).toEqual([
      { kind: 'error', index: i, text: "Syntax error: broken:3: unexpected symbol near '='" },
    ]);
    const rows = detailRows({ s: lib.get('broken')!, running: null, syntax, width: 60, cursor: null, editing: null, helpOpen: true }).rows.map((r) => text(r.segs));
    expect(rows).toContain("  Syntax error: broken:3: unexpected symbol near '='");
    // A load problem or last error comes first and alone.
    lib.setError('broken', 'broken:3: earlier');
    expect(listLines(lib.list(), syntax).filter((l) => l.kind === 'error').map((l) => l.kind === 'error' && l.text)).toEqual(['broken:3: earlier']);
  });

  it('builds the detail: summary, status, settings as controls, commands, the help heading', async () => {
    const lib = await library();
    await lib.setSetting('looter', 'delay', '2');
    const m = detailRows({ s: lib.get('looter')!, running: null, width: 60, cursor: 'set:delay', editing: null, helpOpen: true });
    const rows = m.rows.map((r) => text(r.segs));
    expect(rows[0]).toBe('Loots coins');
    expect(rows[1]).toBe('○ off   bundled · read-only');
    expect(rows[3]).toMatch(/^─ Settings ─+  RESET ALL $/);
    expect(rows[3]!.length).toBe(60);
    // The cursor marks delay; it differs from its default (*).
    expect(rows[4]).toMatch(/^▸ delay\*  ◂   2 ▸ +Seconds before looting$/);
    // The labels line up after the widest control.
    expect(rows[4]!.indexOf('Seconds')).toBe(rows[5]!.indexOf('What to say'));
    expect(rows[5]).toMatch(/^  greet   \[hello there +\]  What to say$/);
    expect(rows).toContain('  cl  toggle on/off');
    expect(rows).toContain('  F5  loot now');
    expect(rows.at(-1)).toMatch(/^▾ Help ─+ PgUp\/PgDn$/);
    expect(m.keys).toEqual(['buttons', 'reset', 'set:delay', 'set:greet', 'help']);
    expect(m.changed).toBe(true);
    for (const r of m.rows) expect(rowCells(r.segs)).toBeLessThanOrEqual(60);
    // RESET ALL is a button, disabled when every value is its default.
    const reset = m.rows[3]!.segs.find((sg) => sg.button);
    expect(reset).toMatchObject({ hit: 'reset', button: { disabled: false, cursor: false } });
    await lib.resetSettings('looter');
    const fresh = detailRows({ s: lib.get('looter')!, running: null, width: 60, cursor: 'reset', editing: null, helpOpen: false });
    expect(fresh.changed).toBe(false);
    expect(fresh.rows[3]!.segs.find((sg) => sg.button)).toMatchObject({ button: { disabled: true, cursor: true } });
    expect(text(fresh.rows.at(-1)!.segs)).toMatch(/^▸ Help ─+$/);
  });

  it('puts each label under its control when the frame is narrow', async () => {
    const lib = await library();
    const rows = detailRows({ s: lib.get('looter')!, running: null, width: 34, cursor: null, editing: { name: 'delay', text: '7' }, helpOpen: true }).rows;
    const i = rows.findIndex((r) => r.key === 'set:delay');
    expect(text(rows[i]!.segs)).toBe('  delay   ◂ 7 ▸');
    expect(rows[i]!.segs.find((sg) => sg.field)).toMatchObject({ field: 3, text: '7' });
    expect(text(rows[i + 1]!.segs)).toBe('    Seconds before looting');
  });

  it('typesets the help for the box, and says when there is none', async () => {
    const lib = await library();
    const help = helpLines(lib.get('looter')!, 40).map(text);
    expect(help).toEqual(['First help line.', '', 'After a blank line.']);
    await lib.create('bare', '-- @name bare\n-- @api 1\nx = 1\n');
    expect(helpLines(lib.get('bare')!, 40).map(text).join(' ')).toContain('No help yet.');
  });

  it('shows load problems', async () => {
    const lib = await library();
    await lib.create('bare', '-- @name bare\n-- @setting x bogus 1\nx = 1\n');
    lib.setError('bare', 'bare:3: oops');
    const rows = detailRows({ s: lib.get('bare')!, running: false, width: 50, cursor: null, editing: null, helpOpen: true }).rows.map((r) => text(r.segs));
    expect(rows).toContain('  Cannot load: the header needs "-- @api 1".');
    expect(rows).toContain('  Last error: bare:3: oops');
    expect(rows.some((r) => r.startsWith('  Header line 2:'))).toBe(true);
    expect(rows).toContain('  No settings.');
  });
});

// ------------------------------------------------------------- rendering

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1400 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});

let cleanup: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const c of cleanup.splice(0)) c();
  document.body.innerHTML = '';
});

function services(scripts?: ScriptLibrary): ChromeServices {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
  void cells.update(settings.get().appearance);
  const profiles = new ProfileStore({ factory: null });
  return {
    settings,
    cells,
    profiles,
    version: '9.9.9',
    runs: () => RunLibrary.open(new IDBFactory()),
    ...(scripts ? { scripts, scriptRunning: () => null } : {}),
  };
}

const key = (k: string) =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
const frame = (host: HTMLElement) => host.querySelector('.wc-frame:not([hidden])')!;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

async function openScripts(lib: ScriptLibrary): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const page = mountStartPage(host, services(lib), { onEnter: () => {} });
  cleanup.push(() => page.dispose());
  await act(() => page.show());
  const items = [...host.querySelectorAll('.wc-mrow')].map((e) => e.getAttribute('data-key'));
  // Scripts sits under Profile on the main menu (stage 32).
  expect(items.slice(0, 3)).toEqual(['enter', 'profile', 'scripts']);
  await act(() => (host.querySelector('.wc-mrow[data-key="scripts"] .wc-label') as HTMLElement).click());
  await flush();
  return host;
}

/** The phone's ESC menu opened at Options (the hub's only home since stage 32): its row keys. */
async function escOptionsHub(lib?: ScriptLibrary): Promise<(string | null)[]> {
  const host = document.createElement('div');
  document.body.append(host);
  const state: AppStatusState = {
    conn: 'playing',
    replay: false,
    character: '',
    linkMs: 38,
    linkSuspect: false,
    capture: '',
    xml: true,
  };
  const status: AppStatusView = { get: () => state, subscribe: () => () => {} };
  const menu = mountEscMenu(host, services(lib), { status, close: () => {}, reconnect: () => {}, exit: () => {} });
  await act(() => menu.open({ target: 'settings' }));
  await flush();
  const keys = [...frame(host).querySelectorAll('.wc-mrow')].map((e) => e.getAttribute('data-key'));
  // One surface at a time (each holds the focus).
  await act(() => menu.dispose());
  host.remove();
  return keys;
}

describe('Scripts page', () => {
  it('is on the start page and in the ESC menu\'s Options only with a library', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const page = mountStartPage(host, services(), { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    expect(host.querySelector('.wc-mrow[data-key="profile"]')).not.toBeNull();
    expect(host.querySelector('.wc-mrow[data-key="scripts"]')).toBeNull();
    await act(() => page.dispose());
    expect(await escOptionsHub()).toEqual(['panes', 'mapper', 'appearance', 'textinput', 'weather', 'back']);
    expect(await escOptionsHub(await library())).toEqual(['panes', 'mapper', 'appearance', 'textinput', 'scripts', 'weather', 'back']);
  });

  it('lists the scripts with a lock on bundled ones and shows the help', async () => {
    const lib = await library();
    await lib.create('mine');
    const host = await openScripts(lib);
    const f = frame(host);
    expect(f.querySelector('.wc-title-row')?.textContent).toBe('─── Scripts ───');
    const rows = [...f.querySelectorAll('.wc-scr-row')];
    expect(rows.map((r) => r.getAttribute('data-script'))).toEqual(['looter', 'mine']);
    expect(rows[0]!.querySelector('.wc-scr-lock')).not.toBeNull();
    expect(rows[1]!.querySelector('.wc-scr-lock')).toBeNull();
    expect(f.querySelector('.wc-scr-frame')?.textContent).toContain('Seconds before looting');
    expect(f.querySelector('.wc-scr-frame')?.textContent).not.toContain('#script set');
    // RENAME and DELETE are off for a bundled script.
    expect(f.querySelector('[data-btn="RENAME"]')?.getAttribute('aria-disabled')).toBe('true');
    expect(f.querySelector('[data-btn="EXPORT"]')?.getAttribute('aria-disabled')).toBeNull();
  });

  it('toggles with Enter on the cursor row and moves with the arrows', async () => {
    const lib = await library();
    await lib.create('mine');
    const host = await openScripts(lib);
    await key('ArrowDown');
    expect(frame(host).querySelector('.wc-scr-name.is-cur')?.textContent?.trim()).toBe('mine');
    await key('Enter');
    await flush();
    expect(lib.get('mine')!.enabled).toBe(true);
    expect(frame(host).querySelector('.wc-flash')?.textContent).toBe('mine is on. It runs when you enter MUME.');
    await key(' ');
    await flush();
    expect(lib.get('mine')!.enabled).toBe(false);
    // ↑ past the first script reaches the buttons; RENAME is enabled for a user script.
    await key('ArrowUp');
    await key('ArrowUp');
    expect(frame(host).querySelector('.wc-btn.is-sel-focus')?.textContent?.trim()).toBe('NEW');
  });

  it('renames and deletes a user script with the prompts', async () => {
    const lib = await library();
    await lib.create('mine');
    const host = await openScripts(lib);
    await key('ArrowDown');
    await act(() => (frame(host).querySelector('[data-btn="RENAME"]') as HTMLElement).click());
    expect(frame(host).querySelector('.wc-title-row')?.textContent).toBe('─── Rename Script ───');
    const input = frame(host).querySelector('input.wc-field') as HTMLInputElement;
    await act(() => {
      input.value = 'yours';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await key('Enter');
    await flush();
    expect(lib.get('yours')?.source).toContain('-- @name     yours');
    expect(frame(host).querySelector('.wc-scr-name.is-cur')?.textContent?.trim()).toBe('yours');
    await act(() => (frame(host).querySelector('[data-btn="DELETE"]') as HTMLElement).click());
    expect(frame(host).textContent).toContain("Delete script 'yours'?  (y/N)");
    await key('n');
    expect(lib.get('yours')).not.toBeNull();
    await act(() => (frame(host).querySelector('[data-btn="DELETE"]') as HTMLElement).click());
    await key('y');
    await flush();
    expect(lib.get('yours')).toBeNull();
    expect(frame(host).querySelector('.wc-flash')?.textContent).toBe('Deleted yours.');
  });
});
