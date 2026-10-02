// @vitest-environment happy-dom
// The Scripts page (stage 10 P2, ADR 0051): the pure model and the frame
// on the start page, against an in-memory script library.
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ChromeServices, mountStartPage } from '../../src/chrome';
import {
  BUTTONS_W,
  ROW_FIXED,
  type Row,
  helpRows,
  listLines,
  scriptState,
  scriptsLayout,
  setCommand,
  syntaxSegs,
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
  it('lays the package out: name column grows, help fills to 76 cells, dropped when narrow', () => {
    const wide = scriptsLayout(200, ['a', 'looter']);
    expect(wide.listW).toBe(BUTTONS_W);
    expect(wide.nameW).toBe(BUTTONS_W - ROW_FIXED);
    expect(wide.detailW).toBe(76);
    expect(wide.at).toBe(Math.floor((200 - (wide.listW + 1 + 3 + 76)) / 2));
    // The button row (with MANUAL) is wider than the longest name column.
    expect(BUTTONS_W).toBeGreaterThan(32 + ROW_FIXED);
    const long = scriptsLayout(200, ['x'.repeat(40)]);
    expect(long.listW).toBe(BUTTONS_W);
    expect(scriptsLayout(70, ['a']).detailW).toBe(0);
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
    const rows = helpRows(lib.get('broken')!, null, 60, syntax).map(text);
    expect(rows).toContain("  Syntax error: broken:3: unexpected symbol near '='");
    // A load problem or last error comes first and alone.
    lib.setError('broken', 'broken:3: earlier');
    expect(listLines(lib.list(), syntax).filter((l) => l.kind === 'error').map((l) => l.kind === 'error' && l.text)).toEqual(['broken:3: earlier']);
  });

  it('builds the help: summary, aliases, keys, help, settings with the #script set command', async () => {
    const lib = await library();
    await lib.setSetting('looter', 'delay', '2');
    const rows = helpRows(lib.get('looter')!, null, 60).map(text);
    expect(rows[0]).toBe('looter  bundled · read-only');
    expect(rows[1]).toBe('Loots coins');
    expect(rows).toContain('○ off');
    expect(rows).toContain('  cl  toggle on/off');
    expect(rows).toContain('  F5  loot now');
    const help = rows.indexOf('Help');
    expect(rows.slice(help + 1, help + 4)).toEqual(['  First help line.', '', '  After a blank line.']);
    expect(rows).toContain('  delay = 2  number');
    expect(rows).toContain('    #script set looter delay 2');
    expect(rows).toContain('    #script set looter greet {hello there}');
    expect(rows.join(' ')).not.toContain('shows this in the game');
    expect(rows.at(-1)).toBe('    #script set looter greet {hello there}');
    for (const r of rows) expect(r.length).toBeLessThanOrEqual(60);
  });

  it('shows load problems and a hint for a script without help', async () => {
    const lib = await library();
    await lib.create('bare', '-- @name bare\n-- @setting x bogus 1\nx = 1\n');
    lib.setError('bare', 'bare:3: oops');
    const rows = helpRows(lib.get('bare')!, false, 50).map(text);
    expect(rows).toContain('  Cannot load: the header needs "-- @api 1".');
    expect(rows).toContain('  Last error: bare:3: oops');
    expect(rows.some((r) => r.startsWith('  Header line 2:'))).toBe(true);
    expect(rows.join(' ')).toContain('No help yet.');
  });

  it('colours the command with the tt++ lexer', () => {
    expect(setCommand('a', 'b', 'two words')).toBe('#script set a b {two words}');
    const segs = syntaxSegs('#script set a b 1');
    expect(segs[0]).toEqual({ text: '#script', cls: 'wc-syn-cmd' });
    expect(segs.map((s) => s.text).join('')).toBe('#script set a b 1');
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
  expect(items.slice(0, 3)).toEqual(['enter', 'profile', 'options']);
  // Scripts sits under Options.
  await act(() => (host.querySelector('.wc-mrow[data-key="options"] .wc-label') as HTMLElement).click());
  await flush();
  const hub = [...frame(host).querySelectorAll('.wc-mrow')].map((e) => e.getAttribute('data-key'));
  expect(hub).toEqual(['panes', 'mapper', 'appearance', 'spotlights', 'scripts', 'back']);
  await act(() => (frame(host).querySelector('.wc-mrow[data-key="scripts"] .wc-label') as HTMLElement).click());
  await flush();
  return host;
}

describe('Scripts page', () => {
  it('is not under Options without a library', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const page = mountStartPage(host, services(), { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    await act(() => (host.querySelector('.wc-mrow[data-key="options"] .wc-label') as HTMLElement).click());
    await flush();
    expect(frame(host).querySelector('.wc-mrow[data-key="options"]')).toBeNull();
    expect(host.querySelector('.wc-mrow[data-key="scripts"]')).toBeNull();
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
    expect(f.querySelector('.wc-scr-help')?.textContent).toContain('#script set looter delay 0.5');
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
