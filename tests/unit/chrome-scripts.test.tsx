// @vitest-environment happy-dom
// The Scripts page (stage 10 P2, ADR 0051): the pure model and the frame
// on the start page, against an in-memory script library.
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppStatusState, AppStatusView } from '../../src/app/status';
import { type ChromeServices, mountEscMenu, mountStartPage } from '../../src/chrome';
import { helpStacks } from '../../src/chrome/frames/scripts';
import {
  anyChanged,
  clampSetting,
  countText,
  defaultText,
  nextChoice,
  noHelpText,
  panelKeys,
  panelProblems,
  rowProblem,
  scriptState,
  shownValue,
  stepChoice,
  stepSetting,
  typedNumber,
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

async function library(): Promise<ScriptLibrary> {
  const lib = new ScriptLibrary({ factory: null, bundled: [{ name: 'looter', source: LOOTER }] });
  await lib.init();
  return lib;
}

describe('scripts model', () => {
  it('steps numbers on the step grid inside the range, and choices', () => {
    const d = { name: 'n', type: 'number' as const, default: 25, label: '', min: 5, max: 60, step: 5 };
    expect(stepSetting(d, 25, 1)).toBe(30);
    expect(stepSetting(d, 27, 1)).toBe(30);
    expect(stepSetting(d, 27, -1)).toBe(25);
    expect(stepSetting(d, 60, 1)).toBe(60);
    expect(stepSetting(d, 5, -1)).toBe(5);
    expect(stepSetting({ ...d, min: undefined, max: undefined, step: 0.1 }, 0.2, 1)).toBe(0.3);
    expect(stepSetting({ name: 'h', type: 'number', default: 12, label: '', min: 0.5, max: 24 }, 0.5, 1)).toBe(1);
    expect(clampSetting(d, 99)).toBe(60);
    expect(typedNumber(d, ' 7 ')).toBe(7);
    expect(typedNumber(d, '99')).toBe(60);
    expect(typedNumber(d, 'x')).toBeNull();
    expect(typedNumber(d, '')).toBeNull();
    const c = { name: 'c', type: 'choice' as const, default: 10, label: '', options: [10, 20], unit: 'silver' };
    expect(stepChoice(c, 10, 1)).toBe(20);
    expect(stepChoice(c, 20, 1)).toBe(20);
    expect(stepChoice(c, 20, -1)).toBe(10);
    // Enter / Space take the next and wrap.
    expect(nextChoice(c, 20)).toBe(10);
    expect(defaultText(c)).toBe('default 10 silver');
    expect(defaultText({ name: 'b', type: 'boolean', default: true, label: '' })).toBe('default on');
  });

  it('states: off, running, failed, at login, starting', async () => {
    const lib = await library();
    const s = lib.get('looter')!;
    expect(scriptState(s, null)).toMatchObject({ glyph: '○', text: 'off', cls: 'off', dot: 'off', mark: null });
    const on: ScriptInfo = { ...s, enabled: true };
    expect(scriptState(on, true)).toMatchObject({ text: 'on · running', cls: 'ok', dot: 'on', mark: 'ok', markTitle: 'Running' });
    expect(scriptState(on, null)).toMatchObject({ text: 'on · at login', cls: 'ok', dot: 'wait', mark: null });
    expect(scriptState(on, false).text).toBe('on · starting');
    expect(scriptState({ ...on, lastError: 'looter:3: boom' }, false)).toMatchObject({
      text: 'on · not running',
      cls: 'err',
      dot: 'bad',
      mark: 'err',
      markTitle: 'looter:3: boom',
    });
  });

  it('puts an error line under a script that failed', async () => {
    const lib = await library();
    await lib.create('mine', '-- @name mine\nx = 1\n');
    expect(lib.list().map((s) => rowProblem(s))).toEqual([null, 'Cannot load: the header needs "-- @api 1".']);
  });

  it('shows the page check\'s syntax error when nothing else is wrong', async () => {
    const lib = await library();
    await lib.create('broken', '-- @name broken\n-- @api 1\nx = = 1\n');
    const syntax = (s: ScriptInfo) => (s.name === 'broken' ? "broken:3: unexpected symbol near '='" : null);
    expect(rowProblem(lib.get('broken')!, syntax)).toBe("Syntax error: broken:3: unexpected symbol near '='");
    expect(panelProblems(lib.get('broken')!, syntax)).toEqual([{ text: "Syntax error: broken:3: unexpected symbol near '='", kind: 'err' }]);
    // A load problem or last error comes first and alone.
    lib.setError('broken', 'broken:3: earlier');
    expect(rowProblem(lib.get('broken')!, syntax)).toBe('broken:3: earlier');
    expect(panelProblems(lib.get('broken')!, syntax)).toEqual([{ text: 'Last error: broken:3: earlier', kind: 'err' }]);
  });

  it('lists the panel\'s problems: load, last error, header lines', async () => {
    const lib = await library();
    await lib.create('bare', '-- @name bare\n-- @setting x bogus 1\nx = 1\n');
    lib.setError('bare', 'bare:3: oops');
    const pr = panelProblems(lib.get('bare')!);
    expect(pr.slice(0, 2)).toEqual([
      { text: 'Cannot load: the header needs "-- @api 1".', kind: 'err' },
      { text: 'Last error: bare:3: oops', kind: 'err' },
    ]);
    expect(pr.some((p) => p.kind === 'header' && p.text.startsWith('Header line 2:'))).toBe(true);
  });

  it('the panel\'s keyboard rows, changed values, the count and the help note', async () => {
    const lib = await library();
    const s = lib.get('looter')!;
    expect(panelKeys(s)).toEqual(['buttons', 'reset', 'set:delay', 'set:greet', 'help']);
    expect(anyChanged(s)).toBe(false);
    expect(anyChanged(s, { delay: 2 })).toBe(true);
    expect(shownValue(s, s.header.settings[0]!, { delay: 2 })).toBe(2);
    await lib.setSetting('looter', 'delay', '2');
    expect(anyChanged(lib.get('looter')!)).toBe(true);
    await lib.create('bare', '-- @name bare\n-- @api 1\nx = 1\n');
    expect(panelKeys(lib.get('bare')!)).toEqual(['buttons', 'help']);
    expect(noHelpText(lib.get('bare')!)).toContain('No help yet.');
    expect(noHelpText(s)).toBe('No help.');
    const list = lib.list();
    expect(countText(list, () => null)).toBe('2 scripts');
    expect(countText(list, (n) => n === 'looter')).toBe('2 scripts · 1 running');
    expect(countText([], () => null)).toBe('');
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
  const items = [...host.querySelectorAll('.wc-sm-item')].map((e) => e.getAttribute('data-key'));
  // Scripts sits under Profile on the main menu (stage 32).
  expect(items.slice(0, 3)).toEqual(['enter', 'profile', 'scripts']);
  await act(() => (host.querySelector('.wc-sm-item[data-key="scripts"]') as HTMLElement).click());
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
    expect(host.querySelector('.wc-sm-item[data-key="profile"]')).not.toBeNull();
    expect(host.querySelector('.wc-sm-item[data-key="scripts"]')).toBeNull();
    await act(() => page.dispose());
    expect(await escOptionsHub()).toEqual(['panes', 'mapper', 'appearance', 'textinput', 'weather', 'back']);
    expect(await escOptionsHub(await library())).toEqual(['panes', 'mapper', 'appearance', 'textinput', 'scripts', 'weather', 'back']);
  });

  it('lists the scripts with a lock on bundled ones and shows the help', async () => {
    const lib = await library();
    await lib.create('mine');
    const host = await openScripts(lib);
    const f = frame(host);
    expect(f.querySelector('.wc-lk-hood-t')?.textContent).toBe('Scripts');
    const rows = [...f.querySelectorAll('.wc-scr-row')];
    expect(rows.map((r) => r.getAttribute('data-name'))).toEqual(['looter', 'mine']);
    expect(rows[0]!.querySelector('.wc-scr-lock')?.getAttribute('title')).toBe('Bundled with WebCockpit: read-only. Duplicate it to change it.');
    expect(rows[1]!.querySelector('.wc-scr-lock')).toBeNull();
    expect(rows[0]!.classList.contains('is-on')).toBe(true);
    const panel = f.querySelector('.wc-scr-panel')!;
    expect(panel.querySelector('.wc-scr-title')?.textContent).toBe('looter');
    expect(panel.querySelector('.wc-scr-status')?.textContent).toBe('off');
    expect(panel.textContent).toContain('bundled · read-only');
    expect(f.querySelector('.wc-scr-set[data-set="delay"]')?.textContent).toContain('Seconds before looting');
    expect(f.textContent).not.toContain('#script set');
    // The commands and the typeset help (its own column on a wide page).
    expect(f.querySelector('.wc-scr-cmds')?.textContent).toContain('toggle on/off');
    expect(f.querySelector('.wc-scr-helpcol .wc-scr-help')?.textContent).toBe('First help line.After a blank line.');
    // Rename and Delete are off for a bundled script, with the reason.
    expect(f.querySelector('[data-btn="RENAME"]')?.getAttribute('aria-disabled')).toBe('true');
    expect(f.querySelector('[data-btn="RENAME"]')?.getAttribute('title')).toBe('Bundled scripts are read-only');
    expect(f.querySelector('[data-btn="EXPORT"]')?.getAttribute('aria-disabled')).toBeNull();
    // The letters are marked in the labels; the foot counts the scripts.
    expect(f.querySelector('[data-btn="EXPORT"] u.wc-sk')?.textContent).toBe('x');
    expect(f.querySelector('.wc-scr-count')?.textContent).toBe('2 scripts');
  });

  it('toggles with Enter and Space on the cursor row and moves with the arrows', async () => {
    const lib = await library();
    await lib.create('mine');
    const host = await openScripts(lib);
    await key('ArrowDown');
    expect(frame(host).querySelector('.wc-scr-row.is-on')?.getAttribute('data-name')).toBe('mine');
    expect(frame(host).querySelector('.wc-scr-row.is-cur')?.getAttribute('data-name')).toBe('mine');
    await key('Enter');
    await flush();
    expect(lib.get('mine')!.enabled).toBe(true);
    expect(frame(host).querySelector('.wc-lk-flash')?.textContent).toBe('mine is on. It runs when you enter MUME.');
    expect(frame(host).querySelector('.wc-scr-status')?.textContent).toBe('on · at login');
    await key(' ');
    await flush();
    expect(lib.get('mine')!.enabled).toBe(false);
    // ↓ on the last script reaches the foot's buttons; ↑ the index again.
    await key('ArrowDown');
    expect(frame(host).querySelector('.wc-lk-btn.is-sel')?.getAttribute('data-btn')).toBe('NEW');
    expect(frame(host).querySelector('.wc-scr-row.is-cur')).toBeNull();
    await key('ArrowRight');
    expect(frame(host).querySelector('.wc-lk-btn.is-sel')?.getAttribute('data-btn')).toBe('IMPORT');
    await key('ArrowUp');
    expect(frame(host).querySelector('.wc-scr-row.is-cur')?.getAttribute('data-name')).toBe('mine');
    // → the panel: its first setting (none here: the button row, Edit).
    await key('ArrowRight');
    expect(frame(host).querySelector('.wc-lk-btn.is-sel')?.getAttribute('data-btn')).toBe('EDIT');
    // Esc back to the index; ↑ to looter, → its first setting.
    await key('Escape');
    await key('ArrowUp');
    await key('ArrowRight');
    expect(frame(host).querySelector('.wc-scr-set.is-cur')?.getAttribute('data-set')).toBe('delay');
    // → steps it (0.5 → 1.5, step 1), Enter types over it.
    await key('ArrowRight');
    await flush();
    expect(lib.get('looter')!.settings.delay).toBe(1);
    expect(frame(host).querySelector('.wc-scr-set[data-set="delay"] .wc-scr-chg')).not.toBeNull();
    expect(frame(host).querySelector('.wc-scr-set[data-set="delay"] .wc-scr-def')?.textContent).toBe('default 0.5');
    await key('4');
    const input = frame(host).querySelector('input.wc-scr-input') as HTMLInputElement;
    expect(input.value).toBe('4');
    await key('Enter');
    await flush();
    expect(lib.get('looter')!.settings.delay).toBe(4);
    expect(frame(host).querySelector('.wc-lk-flash')?.textContent).toBe('delay = 4');
    // ↑ Reset all, Enter: back to the defaults.
    await key('ArrowUp');
    expect(frame(host).querySelector('.wc-lk-btn.is-sel')?.getAttribute('data-btn')).toBe('RESET');
    await key('Enter');
    await flush();
    expect(lib.get('looter')!.settings.delay).toBe(0.5);
    expect(frame(host).querySelector('.wc-lk-flash')?.textContent).toBe('Reset delay to the default.');
  });

  it('the letters press the buttons, not while a field is typed in', async () => {
    const lib = await library();
    await lib.create('mine');
    const host = await openScripts(lib);
    await key('ArrowDown');
    await key('x');
    await flush();
    expect(document.querySelector('.wc-lk-dialog[data-dlg="export"]')).not.toBeNull();
    await key('Escape');
    await flush();
    expect(document.querySelector('.wc-lk-dialog')).toBeNull();
    // Rename's field holds the focus: a letter typed there is text.
    await key('r');
    await flush();
    const input = document.querySelector('.wc-lk-dialog[data-dlg="rename"] input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    await key('d');
    await flush();
    expect(document.querySelector('.wc-lk-dialog[data-dlg="delete"]')).toBeNull();
  });

  it('renames and deletes a user script with the dialogs', async () => {
    const lib = await library();
    await lib.create('mine');
    const host = await openScripts(lib);
    await key('ArrowDown');
    await act(() => (frame(host).querySelector('[data-btn="RENAME"]') as HTMLElement).click());
    await flush();
    const dlg = document.querySelector('.wc-lk-dialog[data-dlg="rename"]')!;
    expect(dlg.querySelector('.wc-lk-hood-t')?.textContent).toBe('Rename Script');
    expect(dlg.textContent).toContain('A letter, then letters, digits, _ or -. At most 32.');
    // The page stays drawn under the dialog.
    expect(host.querySelector('.wc-frame[data-under] .wc-scr')).not.toBeNull();
    const input = dlg.querySelector('input') as HTMLInputElement;
    await act(() => {
      input.value = '9bad';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await key('Enter');
    await flush();
    expect(dlg.querySelector('.wc-lk-dialog-err')?.textContent).toBe('The name must start with a letter.');
    await act(() => {
      input.value = 'yours';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await key('Enter');
    await flush();
    expect(lib.get('yours')?.source).toContain('-- @name     yours');
    expect(document.querySelector('.wc-lk-dialog')).toBeNull();
    expect(frame(host).querySelector('.wc-scr-row.is-on')?.getAttribute('data-name')).toBe('yours');
    expect(frame(host).querySelector('.wc-lk-flash')?.textContent).toBe('Renamed to yours.');
    await act(() => (frame(host).querySelector('[data-btn="DELETE"]') as HTMLElement).click());
    await flush();
    expect(document.querySelector('.wc-lk-dialog[data-dlg="delete"]')?.textContent).toContain('Delete script yours?');
    // Any key but Y cancels.
    await key('n');
    await flush();
    expect(lib.get('yours')).not.toBeNull();
    expect(document.querySelector('.wc-lk-dialog')).toBeNull();
    await act(() => (frame(host).querySelector('[data-btn="DELETE"]') as HTMLElement).click());
    await flush();
    await key('y');
    await flush();
    expect(lib.get('yours')).toBeNull();
    expect(frame(host).querySelector('.wc-lk-flash')?.textContent).toBe('Deleted yours.');
    // The cursor is on the neighbour, the keys on the index.
    expect(frame(host).querySelector('.wc-scr-row.is-cur')?.getAttribute('data-name')).toBe('looter');
  });

  it('says so when this page has no script library', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const state: AppStatusState = { conn: 'playing', replay: false, character: '', linkMs: 38, linkSuspect: false, capture: '', xml: true };
    const status: AppStatusView = { get: () => state, subscribe: () => () => {} };
    const menu = mountEscMenu(host, services(), { status, close: () => {}, reconnect: () => {}, exit: () => {} });
    cleanup.push(() => menu.dispose());
    await act(() => menu.open({ target: 'scripts' }));
    await flush();
    expect(frame(host).querySelector('.wc-lk-hood-t')?.textContent).toBe('Scripts');
    expect(frame(host).textContent).toContain('Scripts are not available here.');
  });

  it('narrow: a letter that moves the keys to the panel shows it, and Esc shows the index again', async () => {
    const lib = await library();
    await lib.create('mine');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 560 });
    cleanup.push(() => Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1400 }));
    const host = await openScripts(lib);
    const main = () => frame(host).querySelector('.wc-scr-main')!;
    expect(frame(host).querySelector('.wc-scr')?.getAttribute('data-w')).toBe('narrow');
    expect(main().classList.contains('is-drill')).toBe(false);
    await key('ArrowDown');
    // X from the index: the keys go to the panel's Export, and the panel shows with them.
    await key('x');
    await flush();
    await key('Escape');
    await flush();
    expect(document.querySelector('.wc-lk-dialog')).toBeNull();
    expect(main().classList.contains('is-drill')).toBe(true);
    expect(frame(host).querySelector('.wc-scr-panel .wc-lk-btn.is-sel')?.getAttribute('data-btn')).toBe('EXPORT');
    // Esc: the index, its cursor row lit, and the arrows walk it.
    await key('Escape');
    expect(main().classList.contains('is-drill')).toBe(false);
    expect(frame(host).querySelector('.wc-scr-row.is-cur')?.getAttribute('data-name')).toBe('mine');
    await key('ArrowUp');
    expect(frame(host).querySelector('.wc-scr-row.is-cur')?.getAttribute('data-name')).toBe('looter');
  });

  it('a typed setting is kept when the tile is left without Enter; Esc alone drops it', async () => {
    const lib = await library();
    await lib.create('mine');
    const host = await openScripts(lib);
    const input = () => frame(host).querySelector('input.wc-scr-input') as HTMLInputElement | null;
    const type = (v: string) =>
      act(() => {
        input()!.value = v;
        input()!.dispatchEvent(new Event('input', { bubbles: true }));
      });
    // looter's delay: a digit starts typing; the field loses the focus (a tap elsewhere).
    await key('ArrowRight');
    await key('7');
    expect(input()?.value).toBe('7');
    await act(() => input()!.blur());
    await flush();
    expect(input()).toBeNull();
    expect(lib.get('looter')!.settings.delay).toBe(7);
    expect(frame(host).querySelector('.wc-lk-flash')?.textContent).toBe('delay = 7');
    // A click on another script's row keeps what was typed.
    await key('3');
    await act(() => (frame(host).querySelector('.wc-scr-row[data-name="mine"]') as HTMLElement).click());
    await flush();
    expect(lib.get('looter')!.settings.delay).toBe(3);
    expect(frame(host).querySelector('.wc-scr-row.is-on')?.getAttribute('data-name')).toBe('mine');
    // All scripts (the panel's way back) keeps it too.
    await act(() => (frame(host).querySelector('.wc-scr-row[data-name="looter"]') as HTMLElement).click());
    await key('ArrowRight');
    await key('5');
    await type('5.5');
    await act(() => (frame(host).querySelector('[data-btn="LIST"]') as HTMLElement).click());
    await flush();
    expect(lib.get('looter')!.settings.delay).toBe(5.5);
    // Esc drops the typing, and the blur that follows saves nothing.
    await key('ArrowRight');
    await key('9');
    await key('Escape');
    await flush();
    expect(input()).toBeNull();
    expect(lib.get('looter')!.settings.delay).toBe(5.5);
  });

  it('a dialog left while its work is pending never pops the page under it', async () => {
    const lib = await library();
    await lib.create('mine');
    const host = await openScripts(lib);
    const page = () => frame(host).querySelector('.wc-scr');
    // Delete: two quick Y presses delete once and pop once.
    await key('ArrowDown');
    await key('d');
    await flush();
    const remove = vi.spyOn(lib, 'remove');
    await key('y');
    await key('y');
    await flush();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(lib.get('mine')).toBeNull();
    expect(page()).not.toBeNull();
    expect(document.querySelector('.wc-lk-dialog')).toBeNull();
    // New: Esc while the script is being created leaves the dialog only; no editor opens.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const create = lib.create.bind(lib);
    vi.spyOn(lib, 'create').mockImplementation(async (...a: Parameters<ScriptLibrary['create']>) => {
      await gate;
      return create(...a);
    });
    await key('n');
    await flush();
    const input = document.querySelector('.wc-lk-dialog[data-dlg="new"] input') as HTMLInputElement;
    await act(() => {
      input.value = 'later';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await key('Enter');
    await key('Escape');
    await flush();
    expect(document.querySelector('.wc-lk-dialog')).toBeNull();
    await act(() => release());
    // The editor's chunk loads, then the dialog sees it is gone: a flash on the page instead.
    await vi.waitFor(
      async () => {
        await flush();
        expect(frame(host).querySelector('.wc-lk-flash')?.textContent).toBe('Created later. It is off until you turn it on.');
      },
      { timeout: 10_000, interval: 50 },
    );
    expect(lib.get('later')).not.toBeNull();
    expect(page()).not.toBeNull();
    expect(frame(host).querySelector('.wc-sed')).toBeNull();
  });

  it('stacks a help table when its terms take too much of the width', () => {
    expect(helpStacks(18, 380)).toBe(false);
    expect(helpStacks(18, 300)).toBe(true);
    expect(helpStacks(4, 200)).toBe(true);
  });
});
