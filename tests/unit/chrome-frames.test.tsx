// @vitest-environment happy-dom
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppStatusState, AppStatusView } from '../../src/app/status';
import { aboutLines } from '../../src/chrome/frames/about';
import { headerParts, linkClass } from '../../src/chrome/frames/esc-main';
import { colorChoices, gridToggle, parseHex } from '../../src/chrome/frames/options';
import { TIMERS_GRID_W, colorToggle, timersHeader } from '../../src/chrome/frames/options-timers';
import { type ChromeServices, mountEscMenu, mountStartPage } from '../../src/chrome';
import { START_MENU_ROWS } from '../../src/chrome/start-layout';
import { ProfileStore } from '../../src/profiles';
import { RunLibrary } from '../../src/runs/library';
import { ScriptLibrary } from '../../src/scripts';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';
import { TERMINAL_FG_PRESETS } from '../../src/theme/presets';

const status = (p: Partial<AppStatusState> = {}): AppStatusState => ({
  conn: 'playing',
  replay: false,
  character: '',
  linkMs: 38,
  linkSuspect: false,
  capture: 'capture: recording',
  xml: true,
  ...p,
});

describe('options helpers', () => {
  it('toggles the pane grid: 0 or 1 checked cell per row', () => {
    const p = { on: true, color: 'red' as const, border: true, glass: true };
    expect(gridToggle(p, 1)).toEqual({ on: false, color: 'red', border: true, glass: true }); // checked cell → off
    expect(gridToggle(p, 3)).toEqual({ on: true, color: 'blue', border: true, glass: true }); // other → that colour
    expect(gridToggle({ ...p, on: false }, 1)).toEqual({ on: true, color: 'red', border: true, glass: true });
    expect(gridToggle(p, 7)).toEqual({ on: true, color: 'red', border: false, glass: true }); // Border column
    // A clear pane stays clear (ADR 0095).
    expect(gridToggle({ ...p, glass: false }, 3)).toEqual({ on: true, color: 'blue', border: true, glass: false });
    expect(gridToggle({ ...p, glass: false }, 7)).toEqual({ on: true, color: 'red', border: false, glass: false });
  });

  it('toggles the timers grid: 0 or 1 swatch; the old default swatch is Auto', () => {
    const g = { enabled: true, color: 'auto', layout: 'default' as const };
    expect(colorToggle('spell', g, 'blue')).toEqual({ enabled: false, color: 'auto' }); // colour remembered
    expect(colorToggle('spell', g, 'red')).toEqual({ enabled: true, color: '#d90000' });
    expect(colorToggle('spell', { ...g, enabled: false }, 'blue')).toEqual({ enabled: true, color: 'auto' });
    expect(colorToggle('sanct', g, 'violet')).toEqual({ enabled: true, color: '#b388ff' });
    const h = timersHeader();
    expect(h).toHaveLength(TIMERS_GRID_W);
    expect(h).toMatch(/^ {10}Blue {3}Green {2}Red {4}Magent Cyan {3}Violet Orange $/);
  });

  it('parses hex colours', () => {
    expect(parseHex('#FF5F5F')).toBe('#ff5f5f');
    expect(parseHex('00ff00')).toBe('#00ff00');
    expect(parseHex('#abc')).toBe('#aabbcc');
    expect(parseHex('#ff5f5')).toBeNull();
    expect(parseHex('red')).toBeNull();
  });

  it('puts an off-palette colour first in the cycle', () => {
    expect(colorChoices(TERMINAL_FG_PRESETS, '#c0c0c0')[0]).toBe('#778a8d');
    expect(colorChoices(TERMINAL_FG_PRESETS, '#123456')[0]).toBe('#123456');
  });
});

describe('ESC header', () => {
  it('shows profile, link and capture; colours the link by quality', () => {
    expect(headerParts('default', status()).map((p) => p.text)).toEqual([
      'Profile: default',
      'Link: 38ms',
      'capture: recording',
    ]);
    expect(linkClass(status())).toBe('wc-c-hint');
    expect(linkClass(status({ linkSuspect: true }))).toBe('wc-c-yellow');
    expect(linkClass(status({ linkMs: null }))).toBe('wc-c-err');
    expect(headerParts('x', status({ capture: '' }))).toHaveLength(2);
  });
});

describe('About text', () => {
  it('styles headings, keys and body, wrapped to the width', () => {
    const lines = aboutLines(60);
    expect(lines.find((l) => l.text === 'GETTING STARTED')?.cls).toBe('wc-c-title');
    const tintin = lines.find((l) => l.key?.trim() === 'TinTin++');
    expect(tintin?.cls).toBe('wc-c-body');
    expect(lines.some((l) => l.text.includes('tintin.mudhalla.net'))).toBe(true);
    for (const l of lines) expect((l.key?.length ?? 0) + l.text.length).toBeLessThanOrEqual(60);
    expect(lines.find((l) => l.text.startsWith('MUME — MULTI-USERS'))?.cls).toBe('wc-c-title');
    expect(lines.find((l) => l.key?.trim() === 'MMapper')).toBeDefined();
    expect(lines.some((l) => l.text.includes('github.com/Khazdul/webcockpit'))).toBe(true);
    expect(lines.some((l) => l.text.includes('LICENSE.txt'))).toBe(true);
  });
});

// ------------------------------------------------------------- rendering

beforeAll(() => {
  // happy-dom does no layout: give every element a 100 × 30 cell box.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});

let cleanup: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
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

/** As the shell gives the start page: with a script library (the Scripts row). */
function startServices(): ChromeServices {
  return { ...services(), scripts: new ScriptLibrary({ factory: null, bundled: [] }) };
}

const menuLabels = (host: HTMLElement) =>
  [...host.querySelectorAll('.wc-frame:not([hidden]) .wc-mrow .wc-label')].map((e) => e.textContent);

const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });

const selected = (host: HTMLElement) => host.querySelector('.wc-frame:not([hidden]) .wc-mrow.is-sel')?.textContent;
const title = (host: HTMLElement) => host.querySelector('.wc-frame:not([hidden]) .wc-c-section')?.textContent;

describe('start page', () => {
  it('renders the banner and menu, navigates, and keeps keys from the page', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onEnter = vi.fn();
    const docKeys = vi.fn();
    document.addEventListener('keydown', docKeys, true);
    cleanup.push(() => document.removeEventListener('keydown', docKeys, true));
    const page = mountStartPage(host, startServices(), { onEnter });
    cleanup.push(() => page.dispose());
    const started = vi.spyOn(window, 'setInterval');
    await act(() => page.show());
    expect(started).toHaveBeenCalledWith(expect.any(Function), 83); // 12 Hz

    expect(host.querySelectorAll('.wc-banner .wc-line')).toHaveLength(11);
    expect(host.querySelector('[data-star]')).not.toBeNull();
    expect(selected(host)).toBe('<< Enter MUME >>');
    // Stage 32: no Options; Scripts under Profile; as long as the first paint's menu.
    const labels = ['Enter MUME', 'Profile', 'Scripts', 'History', 'Spotlights', 'Credits', 'About'];
    expect(menuLabels(host)).toEqual(labels);
    expect(labels).toHaveLength(START_MENU_ROWS);
    expect(host.querySelector('.wc-mrow[data-key="options"]')).toBeNull();

    await key('ArrowUp');
    expect(selected(host)).toBe('<< About >>');
    await key('ArrowDown');
    await key('ArrowDown');
    expect(selected(host)).toBe('<< Profile >>');
    expect(docKeys).not.toHaveBeenCalled();

    // Spotlights without the player service says so.
    await key('ArrowDown');
    await key('ArrowDown');
    await key('ArrowDown');
    expect(selected(host)).toBe('<< Spotlights >>');
    await key('Enter');
    expect(host.querySelector('.wc-flash')?.textContent).toMatch(/not available/);

    // Scripts opens and ESC comes back with the cursor kept.
    await key('ArrowUp');
    await key('ArrowUp');
    await key('Enter');
    expect(title(host)).toBe('─── Scripts ───');
    await key('Escape');
    expect(title(host)).toBeUndefined();
    expect(selected(host)).toBe('<< Scripts >>');

    // ESC on the main page is a no-op; Enter MUME calls back.
    await key('Escape');
    expect(selected(host)).toBe('<< Scripts >>');
    await key('Home');
    await key('Enter');
    expect(onEnter).toHaveBeenCalledTimes(1);

    // Hidden: the star timer stops and keys pass through.
    const cleared = vi.spyOn(window, 'clearInterval');
    await act(() => page.hide());
    expect(cleared).toHaveBeenCalled();
    await key('ArrowDown');
    expect(docKeys).toHaveBeenCalledTimes(1);
  });

  it('mouse click selects and activates', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const page = mountStartPage(host, services(), { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    const about = host.querySelector<HTMLElement>('.wc-mrow[data-key="about"] .wc-label')!;
    await act(() => about.click());
    expect(title(host)).toBe('─── About ───');
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-title-row')?.textContent).toBe('─── About ─── 9.9.9');
  });

  it('Spotlights shows the empty state from the service; any key returns', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const openSpotlights = vi.fn(async () => 'no_data' as const);
    const page = mountStartPage(host, { ...services(), openSpotlights }, { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    await act(() => host.querySelector<HTMLElement>('.wc-mrow[data-key="spotlights"] .wc-label')!.click());
    await act(async () => {});
    expect(openSpotlights).toHaveBeenCalledTimes(1);
    expect(title(host)).toBe('─── Spotlights ───');
    expect(host.querySelector('.wc-frame:not([hidden])')?.textContent).toContain('No spotlights yet.');
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-footer')?.textContent).toBe('Any key to return');
    await key('Shift');
    expect(title(host)).toBe('─── Spotlights ───');
    await key('q');
    expect(selected(host)).toBe('<< Spotlights >>');
  });

  it('without a script library there is no Scripts row (only tests mount it so)', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const page = mountStartPage(host, services(), { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    expect(menuLabels(host)).toEqual(['Enter MUME', 'Profile', 'History', 'Spotlights', 'Credits', 'About']);
  });
});

describe('ESC menu', () => {
  function view(s: AppStatusState): AppStatusView & { set(p: Partial<AppStatusState>): void } {
    let cur = s;
    const fns = new Set<(s: AppStatusState) => void>();
    return {
      get: () => cur,
      subscribe: (fn) => {
        fns.add(fn);
        return () => fns.delete(fn);
      },
      set(p) {
        cur = { ...cur, ...p };
        for (const f of fns) f(cur);
      },
    };
  }

  it('opens with Continue when connected, Reconnect when not, and closes on ESC', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const st = view(status());
    const close = vi.fn();
    const exit = vi.fn();
    const menu = mountEscMenu(host, services(), { status: st, close, reconnect: vi.fn(), exit });
    cleanup.push(() => menu.dispose());
    const started = vi.spyOn(window, 'setInterval');
    await act(() => menu.open());
    expect(started).toHaveBeenCalledWith(expect.any(Function), 167); // 6 Hz
    expect(selected(host)).toBe('<< Continue >>');
    expect(host.querySelector('.wc-esc-header')?.textContent).toBe(
      'Profile: default  ·  Link: 38ms  ·  capture: recording',
    );
    await key('Escape');
    expect(close).toHaveBeenCalledTimes(1);
    await act(() => menu.close());

    st.set({ conn: 'disconnected', linkMs: null });
    await act(() => menu.open());
    expect(selected(host)).toBe('<< Reconnect >>');
    expect(host.querySelector('.wc-mrow[data-key="continue"]')).toBeNull();
    expect(host.querySelector('.wc-esc-header .wc-c-err')?.textContent).toBe('Link: —');

    // Exit session → confirm → Y.
    await key('End');
    await key('Enter');
    expect(title(host)).toBe('─── Exit session ───');
    await key('n');
    expect(exit).not.toHaveBeenCalled();
    await key('y');
    expect(exit).toHaveBeenCalledTimes(1);
  });
  it('opens straight at a frame; leaving that frame closes the menu (ADR 0099)', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const st = view(status());
    const close = vi.fn();
    const exit = vi.fn();
    const menu = mountEscMenu(host, { ...services(), scripts: undefined }, { status: st, close, reconnect: vi.fn(), exit });
    cleanup.push(() => menu.dispose());
    const shut = async () => {
      await act(() => menu.close());
    };

    // Settings: Options; Esc on it closes, and so does its Back row.
    await act(() => menu.open({ target: 'settings' }));
    expect(title(host)).toBe('─── Options ───');
    // Options has no Spotlights page: its settings are in the reel (ADR 0110).
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-mrow[data-key="spotlights"]')).toBeNull();
    await key('Escape');
    expect(close).toHaveBeenCalledTimes(1);
    await shut();
    await act(() => menu.open({ target: 'settings' }));
    await key('End');
    expect(selected(host)).toBe('<< Back >>');
    await key('Enter');
    expect(close).toHaveBeenCalledTimes(2);
    await shut();
    // A sub-frame pops back to it, not out of the menu.
    await act(() => menu.open({ target: 'settings' }));
    await key('Home');
    await key('Enter');
    expect(title(host)).toBe('─── Panes ───');
    await key('Escape');
    expect(title(host)).toBe('─── Options ───');
    expect(close).toHaveBeenCalledTimes(2);
    await shut();

    // Scripts, Panes and Exit.
    await act(() => menu.open({ target: 'scripts' }));
    expect(title(host)).toBe('─── Scripts ───');
    await act(() => host.querySelector<HTMLElement>('.wc-frame:not([hidden]) .wc-footer-btn')!.click());
    expect(close).toHaveBeenCalledTimes(3);
    await shut();
    await act(() => menu.open({ target: 'panes' }));
    expect(title(host)).toBe('─── Pane appearance ───');
    await key('Escape');
    expect(close).toHaveBeenCalledTimes(4);
    await shut();
    await act(() => menu.open({ target: 'exit' }));
    expect(title(host)).toBe('─── Exit session ───');
    await key('Escape');
    expect(close).toHaveBeenCalledTimes(5);
    await shut();
    await act(() => menu.open({ target: 'exit' }));
    await key('y');
    expect(exit).toHaveBeenCalledTimes(1);
    await shut();

    // Opened plainly again, it is the main frame.
    await act(() => menu.open());
    expect(selected(host)).toBe('<< Continue >>');
  });

  it('opens at the profile editor’s entry frame; a failed load is flashed and Esc closes', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const close = vi.fn();
    const menu = mountEscMenu(host, services(), { status: view(status()), close, reconnect: vi.fn(), exit: vi.fn() });
    cleanup.push(() => menu.dispose());
    await act(() => menu.open({ target: 'profile' }));
    expect(title(host)).toBe('─── Profile ───');
    await vi.waitFor(
      async () => {
        await act(async () => {});
        expect(host.querySelector('.wc-frame:not([hidden]) .wc-flash')?.textContent).toMatch(/profile|editor/i);
      },
      { timeout: 10_000 },
    );
    await key('Escape');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
