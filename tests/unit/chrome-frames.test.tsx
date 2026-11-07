// @vitest-environment happy-dom
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppStatusState, AppStatusView } from '../../src/app/status';
import { aboutLines } from '../../src/chrome/frames/about';
import { headerParts, linkClass } from '../../src/chrome/frames/esc-main';
import { colorChoices, gridToggle, parseHex } from '../../src/chrome/frames/options';
import { type ChromeServices, mountEscMenu, mountStartPage } from '../../src/chrome';
import { Notices } from '../../src/app/notices';
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
  [...host.querySelectorAll('.wc-frame:not([hidden]) .wc-sm-item .wc-sm-label')].map((e) => e.textContent);

const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });

/** The ESC menu's (old-look) cursor row. */
const selected = (host: HTMLElement) => host.querySelector('.wc-frame:not([hidden]) .wc-mrow.is-sel')?.textContent;
/** The start menu's cursor row (the new look, ADR 0125). */
const startSel = (host: HTMLElement) =>
  host.querySelector('.wc-frame:not([hidden]) .wc-sm-item.is-sel .wc-sm-label')?.textContent;
const title = (host: HTMLElement) => host.querySelector('.wc-frame:not([hidden]) .wc-c-section')?.textContent;

describe('start page', () => {
  it('renders the menu over the sky, navigates, and keeps keys from the page', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onEnter = vi.fn();
    const docKeys = vi.fn();
    document.addEventListener('keydown', docKeys, true);
    cleanup.push(() => document.removeEventListener('keydown', docKeys, true));
    const page = mountStartPage(host, startServices(), { onEnter });
    cleanup.push(() => page.dispose());
    await act(() => page.show());

    // The sky behind, the wordmark and the almanac around the menu; no banner, no footer.
    expect(host.querySelector('.wc-start-skyhost')).not.toBeNull();
    expect(host.querySelector('.wc-start-brand .wc-wordmark')).not.toBeNull();
    expect(host.querySelector('.wc-start-almanac')?.textContent).toMatch(/, the \d+(st|nd|rd|th) of .*T\.A\. \d+/);
    expect(host.querySelector('.wc-start-almanac')?.textContent).toContain('WebCockpit 9.9.9');
    expect(host.querySelector('.wc-banner')).toBeNull();
    expect(host.querySelector('.wc-footer')).toBeNull();
    expect(host.querySelector('.wc-sm-quote cite')?.textContent).not.toBe('');
    expect(startSel(host)).toBe('Enter MUME');
    // Stage 32: no Options; Scripts under Profile, with the profile's name; as long as the first paint's menu.
    const labels = ['Enter MUME', 'Profile', 'Scripts', 'History', 'Spotlights', 'Credits', 'About'];
    expect(menuLabels(host)).toEqual(labels);
    expect(labels).toHaveLength(7);
    expect(host.querySelector('.wc-sm-item[data-key="options"]')).toBeNull();
    expect(host.querySelector('.wc-sm-item[data-key="profile"] .wc-sm-note')?.textContent).toBe('(default)');
    // The shortcut letters, marked in the labels.
    expect([...host.querySelectorAll('.wc-sm-item u.wc-sk')].map((u) => u.textContent)).toEqual([
      'E',
      'P',
      'S',
      'H',
      'l',
      'C',
      'A',
    ]);

    await key('ArrowUp');
    expect(startSel(host)).toBe('About');
    await key('ArrowDown');
    await key('ArrowDown');
    expect(startSel(host)).toBe('Profile');
    expect(docKeys).not.toHaveBeenCalled();

    // Spotlights without the player service says so.
    await key('ArrowDown');
    await key('ArrowDown');
    await key('ArrowDown');
    expect(startSel(host)).toBe('Spotlights');
    await key('Enter');
    expect(host.querySelector('.wc-lk-flash')?.textContent).toMatch(/not available/);

    // Scripts opens (a large look box since stage 44a) and ESC comes back with the cursor kept.
    await key('ArrowUp');
    await key('ArrowUp');
    await key('Enter');
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-lk-hood-t')?.textContent).toBe('Scripts');
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-scr')).not.toBeNull();
    expect(host.querySelector('.wc-start')?.classList.contains('is-large')).toBe(true);
    await key('Escape');
    expect(title(host)).toBeUndefined();
    expect(startSel(host)).toBe('Scripts');
    expect(host.querySelector('.wc-start')?.classList.contains('is-main')).toBe(true);

    // ESC on the main page is a no-op; a letter goes straight to its row.
    await key('Escape');
    expect(startSel(host)).toBe('Scripts');
    await key('a');
    expect(title(host)).toBe('─── About ───');
    await key('Escape');
    expect(startSel(host)).toBe('About');
    // Ctrl+letter is not a shortcut.
    await key('h', { ctrlKey: true });
    expect(startSel(host)).toBe('About');
    await key('Home');
    await key('Enter');
    expect(onEnter).toHaveBeenCalledTimes(1);
    await key('e');
    expect(onEnter).toHaveBeenCalledTimes(2);

    // Hidden: keys pass through.
    await act(() => page.hide());
    await key('ArrowDown');
    expect(docKeys).toHaveBeenCalledTimes(1);
  });

  it('mouse: hover selects, a click selects and activates', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const page = mountStartPage(host, services(), { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    const history = host.querySelector<HTMLElement>('.wc-sm-item[data-key="history"]')!;
    await act(() => {
      history.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', movementX: 2, bubbles: true }));
    });
    expect(startSel(host)).toBe('History');
    const about = host.querySelector<HTMLElement>('.wc-sm-item[data-key="about"]')!;
    await act(() => about.click());
    expect(title(host)).toBe('─── About ───');
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-title-row')?.textContent).toBe('─── About ─── 9.9.9');
  });

  it('Spotlights opens its wall (stage 46): with no recorded spotlight it says how they are made; Esc returns', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    // The old full-page reel is no longer how the page loads: the menu loads the reel itself and pushes the wall.
    const openSpotlights = vi.fn(async () => 'no_data' as const);
    const embedPlayer = vi.fn(async () => null);
    const page = mountStartPage(host, { ...services(), openSpotlights, embedPlayer }, { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    await act(() => host.querySelector<HTMLElement>('.wc-sm-item[data-key="spotlights"]')!.click());
    const wall = () => host.querySelector('.wc-frame:not([hidden]) .wc-spw');
    for (let i = 0; i < 20 && !wall(); i++) await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(openSpotlights).not.toHaveBeenCalled();
    expect(embedPlayer).not.toHaveBeenCalled();
    expect(wall()?.querySelector('.wc-lk-hood-t')?.textContent).toBe('Spotlights');
    expect(wall()?.querySelector('.wc-spw-empty')?.textContent).toContain('No spotlights yet.');
    // No data: no filter row, no Play all.
    expect(wall()?.querySelector('.wc-spw-head')).toBeNull();
    expect(wall()?.querySelector('[data-btn="PLAY"]')).toBeNull();
    // A bare modifier is not a key; Esc goes back to the menu.
    await key('Shift');
    expect(wall()).not.toBeNull();
    await key('Escape');
    for (let i = 0; i < 40 && !startSel(host); i++) await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(startSel(host)).toBe('Spotlights');
  });

  it('without a script library there is no Scripts row (only tests mount it so)', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const page = mountStartPage(host, services(), { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    expect(menuLabels(host)).toEqual(['Enter MUME', 'Profile', 'History', 'Spotlights', 'Credits', 'About']);
  });

  it('client notices: glass pills over the sky, the TUI row over an old-look frame', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const notices = new Notices();
    const page = mountStartPage(host, { ...startServices(), notices }, { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    expect(host.querySelector('.wc-start-pills')).toBeNull();
    await act(() => {
      notices.newVersion({ version: '9.9.10', commit: 'abc' });
      notices.storageSuperseded();
    });
    expect([...host.querySelectorAll('.wc-start-pill')].map((e) => e.textContent)).toEqual([
      'Update 9.9.10 available: reload',
      'Storage: not saved',
    ]);
    await key('a');
    expect(title(host)).toBe('─── About ───');
    expect(host.querySelector('.wc-start-pills')).toBeNull();
    expect(host.querySelector('.wc-start-gridtop .wc-start-notices')?.textContent).toBe(
      'Update 9.9.10 available: reload  Storage: not saved',
    );
  });

  it('the Profile list shows the real spelling of names that differ only in case', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const svc = startServices();
    await svc.profiles.init();
    await svc.profiles.create('gibur', '');
    await svc.profiles.create('Gibur', '');
    await svc.profiles.create('scout', '');
    svc.settings.update({ profile: 'Gibur' });
    const page = mountStartPage(host, svc, { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    // The start menu's note keeps the real case (an italic serif, not small caps).
    expect(host.querySelector('.wc-sm-item[data-key="profile"] .wc-sm-note')?.textContent).toBe('(Gibur)');
    await key('p');
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    const f = () => host.querySelector('.wc-frame:not([hidden])')!;
    const row = (n: string) => f().querySelector(`.wc-pl-row[data-name="${n}"]`)!;
    expect([...f().querySelectorAll('.wc-pl-n')].map((e) => e.textContent)).toEqual([
      'default', 'Gibur', 'gibur', 'khazdul', 'scout',
    ]);
    expect(row('gibur').querySelector('.wc-pl-case')?.textContent).toBe('gibur');
    expect(row('Gibur').querySelector('.wc-pl-case')?.textContent).toBe('Gibur');
    // The selected twin: the spelling, then the tag, on its second line.
    expect([...row('Gibur').querySelectorAll('.wc-pl-sub > *')].map((e) => e.className)).toEqual([
      'wc-pl-case', 'wc-pl-tag',
    ]);
    // Names without a twin look as before.
    for (const n of ['default', 'khazdul', 'scout']) {
      expect(row(n).querySelector('.wc-pl-case')).toBeNull();
      expect(row(n).querySelector('.wc-pl-sub')).toBeNull();
    }
  });

  it('the Profile list: rows, buttons, letters, zones and Back', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const svc = startServices();
    await svc.profiles.init();
    await svc.profiles.create('scout', '');
    const page = mountStartPage(host, svc, { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    await key('p');
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    const f = () => host.querySelector('.wc-frame:not([hidden])')!;
    expect(f().querySelector('.wc-lk-hood-t')?.textContent).toBe('Profiles');
    expect(host.querySelector('.wc-start')?.classList.contains('is-sub')).toBe(true);
    const names = () => [...f().querySelectorAll('.wc-pl-n')].map((e) => e.textContent);
    // `khazdul` is bundled.
    expect(names()).toEqual(['default', 'khazdul', 'scout']);
    expect(f().querySelector('.wc-pl-row.is-on')?.textContent).toContain('default');
    expect(f().querySelector('.wc-pl-row.is-on .wc-pl-tag')?.textContent).toBe('Selected');
    const btn = (id: string) => f().querySelector(`[data-btn="${id}"]`);
    const ids = (sel: string) => [...f().querySelectorAll(`${sel} .wc-lk-btn`)].map((b) => b.getAttribute('data-btn'));
    const keyed = () => f().querySelector('.wc-lk-btn.is-sel')?.getAttribute('data-btn') ?? null;
    // Only the highlighted row has buttons; on the selected profile no Select.
    expect(f().querySelectorAll('.wc-pl-acts')).toHaveLength(1);
    expect(ids('.wc-pl-row.is-on .wc-pl-acts')).toEqual(['EDIT', 'RENAME', 'DELETE']);
    expect(ids('.wc-pl-btns')).toEqual(['NEW', 'IMPORT', 'EXPORT']);
    expect(btn('SELECT')).toBeNull();
    expect(btn('DELETE')!.getAttribute('aria-disabled')).toBe('true');
    expect(btn('EDIT')!.getAttribute('aria-disabled')).toBeNull();
    expect([...f().querySelectorAll('.wc-lk-btn u.wc-sk')].map((u) => u.textContent)).toEqual([
      'E', 'R', 'D', 'N', 'I', 'x',
    ]);
    // The header sorts.
    await act(() => f().querySelector<HTMLElement>('.wc-pl-sort')!.click());
    expect(names()).toEqual(['scout', 'khazdul', 'default']);
    await act(() => f().querySelector<HTMLElement>('.wc-pl-sort')!.click());
    // ↓ moves the highlight and its buttons; another profile has Select.
    await key('ArrowDown');
    expect(f().querySelector('.wc-pl-row.is-on')?.textContent).toContain('khazdul');
    expect(ids('.wc-pl-row.is-on .wc-pl-acts')).toEqual(['SELECT', 'EDIT', 'RENAME', 'DELETE']);
    expect(f().querySelectorAll('.wc-pl-acts')).toHaveLength(1);
    expect([...f().querySelectorAll('.wc-pl-row.is-on u.wc-sk')].map((u) => u.textContent)).toEqual([
      'S', 'E', 'R', 'D',
    ]);
    // Tab walks the row, its buttons, the page buttons and wraps; Shift+Tab back.
    const ring: (string | null)[] = [];
    for (let i = 0; i < 8; i++) {
      await key('Tab');
      ring.push(keyed());
    }
    expect(ring).toEqual(['SELECT', 'EDIT', 'RENAME', 'DELETE', 'NEW', 'IMPORT', 'EXPORT', null]);
    await key('Tab', { shiftKey: true });
    expect(keyed()).toBe('EXPORT');
    // ←/→ walk the same order and stop at the ends.
    for (let i = 0; i < 9; i++) await key('ArrowLeft');
    expect(keyed()).toBeNull();
    await key('ArrowRight');
    await key('ArrowRight');
    expect(keyed()).toBe('EDIT');
    // ↓ on a row button: the same button on the next row.
    await key('End');
    expect(f().querySelector('.wc-pl-row.is-on')?.textContent).toContain('scout');
    expect(keyed()).toBe('EDIT');
    expect(f().querySelector('.wc-pl-row.is-on [data-btn="EDIT"]')?.classList.contains('is-sel')).toBe(true);
    // S selects the highlighted profile; its Select goes.
    await key('s');
    expect(svc.settings.get().profile).toBe('scout');
    expect(btn('SELECT')).toBeNull();
    expect(f().querySelector('.wc-pl-row.is-on .wc-pl-tag')?.textContent).toBe('Selected');
    // A page button's keys: ↑ returns to the row.
    await key('Tab');
    await key('Tab');
    await key('Tab');
    expect(keyed()).toBe('NEW');
    expect(f().querySelector('.wc-pl-list')?.classList.contains('is-focus')).toBe(false);
    await key('ArrowUp');
    expect(keyed()).toBeNull();
    expect(f().querySelector('.wc-pl-row.is-on')?.textContent).toContain('khazdul');
    // A click on another row highlights it; a click on the highlighted row selects it.
    const row = (n: string) => f().querySelector<HTMLElement>(`.wc-pl-row[data-name="${n}"]`)!;
    await act(() => row('default').click());
    expect(row('default').classList.contains('is-on')).toBe(true);
    expect(svc.settings.get().profile).toBe('scout');
    await act(() => row('default').click());
    expect(svc.settings.get().profile).toBe('default');
    await act(() => row('scout').click());
    // The row's Select button.
    await act(() => {
      btn('SELECT')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(svc.settings.get().profile).toBe('scout');
    // The pressed Select went: its keys move on to Edit.
    expect(keyed()).toBe('EDIT');
    // D, then y: the highlight goes to the neighbour (above, at the end), the keys to the row.
    await key('d');
    await key('y');
    await vi.waitFor(async () => {
      await act(async () => new Promise((r) => setTimeout(r, 0)));
      expect(names()).toEqual(['default', 'khazdul']);
    });
    expect(f().querySelector('.wc-pl-row.is-on')?.textContent).toContain('khazdul');
    expect(keyed()).toBeNull();
    expect(f().querySelector('.wc-lk-flash')?.textContent).toBe('Deleted "scout".');
    expect(svc.settings.get().profile).toBe('default');
    // N: the old-look name prompt; Esc back to the list.
    await key('n');
    expect(title(host)).toBe('─── Create New Profile ───');
    await key('Escape');
    expect(f().querySelector('.wc-lk-hood-t')?.textContent).toBe('Profiles');
    // Back (and Esc) return to the menu.
    await act(() => f().querySelector<HTMLElement>('.wc-lk-back')!.click());
    expect(startSel(host)).toBe('Profile');
    // The menu's Scripts row follows the selected profile.
    expect(host.querySelector('.wc-sm-item[data-key="profile"] .wc-sm-note')?.textContent).toBe('(default)');
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
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-lk-hood-t')?.textContent).toBe('Scripts');
    await act(() => host.querySelector<HTMLElement>('.wc-frame:not([hidden]) .wc-lk-back')!.click());
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
