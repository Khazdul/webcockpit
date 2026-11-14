// @vitest-environment happy-dom
import { IDBFactory } from 'fake-indexeddb';
import { type VNode, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppStatusState, AppStatusView } from '../../src/app/status';
import { ABOUT_NAV, ABOUT_TEXT, aboutSections, aboutTokens } from '../../src/chrome/frames/about';
import { colorChoices, parseHex } from '../../src/chrome/appearance-model';
import { type ChromeServices, mountEscMenu, mountStartPage } from '../../src/chrome';
import { ServicesCtx } from '../../src/chrome/kit/hooks';
import { lookFrame } from '../../src/chrome/kit/look';
import { useKeys, useNav } from '../../src/chrome/kit/stack';
import { Page } from '../../src/chrome/kit/widgets';
import { StartSurface } from '../../src/chrome/start-surface';
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

describe('appearance helpers', () => {
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

describe('About text', () => {
  const secs = aboutSections(ABOUT_TEXT);
  const kv = (id: string): string[] =>
    secs.find((x) => x.id === id)!.blocks.flatMap((b) => ('kv' in b ? b.kv.map(([k]) => k) : []));
  const texts = secs.flatMap((x) => [x.title, ...x.blocks.flatMap((b) => ('p' in b ? [b.p] : b.kv.flat()))]);

  it('parses ABOUT_TEXT into the ten sections of the rail, in order', () => {
    expect(secs.map((x) => x.id)).toEqual(ABOUT_NAV.map((n) => n.id));
    expect(secs).toHaveLength(10);
    expect(secs[0]!.title).toBe('');
    expect(secs[1]!.title).toBe('MUME — MULTI-USERS IN MIDDLE-EARTH');
    expect(secs.slice(1).every((x) => x.title === x.title.toUpperCase() && x.blocks.length > 0)).toBe(true);
  });

  it('keeps the key/value rows of What is inside, Credits, MUME and Getting started as tables', () => {
    expect(kv('inside')).toEqual(['Panes', 'Profile', 'Map', 'Weather', 'Runs', 'Phone']);
    expect(kv('credits')).toEqual(['MMapper', 'Tilesets', 'Cockpit', 'MUME', 'Fonts', 'Libraries', 'TinTin++']);
    expect(kv('mume')).toEqual(['Website', 'Discord']);
    expect(kv('start')).toEqual(['Newcomers', 'First steps', 'Basics', 'Guides']);
    expect(kv('pvp')).toEqual([]);
    // Every non-blank line of the text lands in one block, nothing is lost.
    for (const line of ABOUT_TEXT.split('\n').filter((l) => l.trim() !== ''))
      expect(texts.some((t) => line.includes(t) && t.length > 0 && line.trim().endsWith(t.trim()))).toBe(true);
  });

  it('finds every link and game command in the text; the site files under the base path', () => {
    const tokens = secs.flatMap((x) => x.blocks.flatMap((b) => ('p' in b ? [b.p] : b.kv.map(([, t]) => t)))).flatMap((t) => aboutTokens(t, '/wc/'));
    const links = tokens.flatMap((t) => ('link' in t ? [t.href] : []));
    expect(links).toEqual(
      expect.arrayContaining([
        'https://mume.org',
        'https://discord.gg/XkZN55am9a',
        'https://github.com/MUME/MMapper',
        'https://tintin.mudhalla.net',
        'https://github.com/Khazdul/webcockpit',
        'https://docs.mume.org/resources/newcomers',
        'https://mume.org/help/newbie',
        'https://mume.org/help/basics',
        'https://docs.mume.org/wiki/guides',
        '/wc/LICENSE.txt',
        '/wc/fonts/README.md',
        '/wc/THIRD_PARTY_NOTICES.md',
      ]),
    );
    expect(links).toHaveLength(12);
    expect(tokens.flatMap((t) => ('cmd' in t ? [t.cmd] : []))).toEqual([
      'pray to the tower hills',
      'help newbie',
      'consider',
      'flee',
      'who ranger',
      '#help',
      '?safe',
    ]);
    // The tokens give back the text unchanged.
    const p = 'Licence text: LICENSE.txt. Source code: github.com/Khazdul/webcockpit';
    expect(aboutTokens(p).map((t) => ('text' in t ? t.text : 'link' in t ? t.link : t.cmd)).join('')).toBe(p);
  });

  it('gives each section a unique letter, marked in its rail label', () => {
    const letters = ABOUT_NAV.map((n) => n.letter);
    expect(letters).toEqual(['w', 'm', 'g', 'b', 'i', 's', 'k', 'u', 'c', 'l']);
    expect(new Set(letters).size).toBe(letters.length);
    for (const n of ABOUT_NAV) expect(n.nav.toLowerCase()).toContain(n.letter);
  });

  it('states the facts the new pages changed (stage 47)', () => {
    expect(ABOUT_TEXT).toContain('History, Spotlights and Credits on the start page look back at your runs');
    expect(ABOUT_TEXT).toContain('Third-party notices: THIRD_PARTY_NOTICES.md');
    expect(ABOUT_TEXT).not.toMatch(/Spotlights reel picks/);
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
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-lk-hood-t')?.textContent).toBe('About');
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
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-lk-hood-t')?.textContent).toBe('About');
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-about-ver')?.textContent).toBe('WebCockpit 9.9.9');
  });

  it('Spotlights opens its wall (stage 46): with no recorded spotlight it says how they are made; Esc returns', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    // The menu loads the reel itself and pushes the wall.
    const embedPlayer = vi.fn(async () => null);
    const page = mountStartPage(host, { ...services(), embedPlayer }, { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    await act(() => host.querySelector<HTMLElement>('.wc-sm-item[data-key="spotlights"]')!.click());
    const wall = () => host.querySelector('.wc-frame:not([hidden]) .wc-spw');
    for (let i = 0; i < 20 && !wall(); i++) await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(embedPlayer).not.toHaveBeenCalled();
    expect(wall()?.querySelector('.wc-lk-hood-t')?.textContent).toBe('Spotlights');
    expect(wall()?.querySelector('.wc-spw-empty')?.textContent).toContain('No spotlights yet.');
    // No data: no filter row; Play all disabled.
    expect(wall()?.querySelector('.wc-spw-head')).toBeNull();
    expect(wall()?.querySelector('[data-btn="PLAY"]')?.getAttribute('aria-disabled')).toBe('true');
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
    // No page of the client is old-look any more (the ESC menu's Options
    // pages went in stage 55): the surface is mounted with a look frame that
    // pushes a plain page on the cell grid, which the surface still places.
    const Old = (): VNode => <Page title="Old" footer={['ESC Back']} />;
    const Probe = lookFrame(function Probe(): VNode {
      const nav = useNav();
      useKeys((e) => {
        if (e.key !== 'o') return false;
        nav.push(<Old />);
        return true;
      });
      return <div class="probe" />;
    });
    await act(() =>
      render(
        <ServicesCtx.Provider value={{ ...startServices(), notices }}>
          <StartSurface visible epoch={1} root={<Probe />} />
        </ServicesCtx.Provider>,
        host,
      ),
    );
    cleanup.push(() => render(null, host));
    expect(host.querySelector('.wc-start-pills')).toBeNull();
    await act(() => {
      notices.newVersion({ version: '9.9.10', commit: 'abc' });
      notices.storageSuperseded();
    });
    expect([...host.querySelectorAll('.wc-start-pill')].map((e) => e.textContent)).toEqual([
      'Update 9.9.10 available: reload',
      'Storage: not saved',
    ]);
    expect(host.querySelector('.wc-start-gridtop .wc-start-notices')).toBeNull();
    // An old-look frame.
    await key('o');
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(title(host)).toBe('─── Old ───');
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
    // N: the name dialog over the list (which stays drawn under it); Esc back to the list.
    await key('n');
    expect(host.querySelector('.wc-lk-dialog[data-dlg="new"] .wc-lk-hood-t')?.textContent).toBe('New Profile');
    expect(host.querySelector('.wc-pl-row.is-on')?.textContent).toContain('khazdul');
    await key('Escape');
    expect(host.querySelector('.wc-lk-dialog')).toBeNull();
    expect(f().querySelector('.wc-lk-hood-t')?.textContent).toBe('Profiles');
    // Back (and Esc) return to the menu.
    await act(() => f().querySelector<HTMLElement>('.wc-lk-back')!.click());
    expect(startSel(host)).toBe('Profile');
    // The menu's Scripts row follows the selected profile.
    expect(host.querySelector('.wc-sm-item[data-key="profile"] .wc-sm-note')?.textContent).toBe('(default)');
  });
});

describe('ESC overlay (the phone: Profile and Scripts)', () => {
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

  it('opens at Scripts; leaving that page closes the overlay (ADR 0099)', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const close = vi.fn();
    const menu = mountEscMenu(host, startServices(), { status: view(status()), close });
    cleanup.push(() => menu.dispose());
    expect(menu.isOpen).toBe(false);
    await act(() => menu.open({ target: 'scripts' }));
    expect(menu.isOpen).toBe(true);
    expect(host.querySelector('.wc-overlay')?.hasAttribute('hidden')).toBe(false);
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-lk-hood-t')?.textContent).toBe('Scripts');
    // Open already: a second open (at another page) does nothing.
    await act(() => menu.open({ target: 'profile' }));
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-lk-hood-t')?.textContent).toBe('Scripts');
    await act(() => host.querySelector<HTMLElement>('.wc-frame:not([hidden]) .wc-lk-back')!.click());
    expect(close).toHaveBeenCalledTimes(1);
    await act(() => menu.close());
    expect(menu.isOpen).toBe(false);
    // Esc on the page closes too.
    await act(() => menu.open({ target: 'scripts' }));
    await key('Escape');
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('opens at the profile editor’s entry frame; a failed load is flashed and Esc closes', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const close = vi.fn();
    const menu = mountEscMenu(host, services(), { status: view(status()), close });
    cleanup.push(() => menu.dispose());
    await act(() => menu.open({ target: 'profile' }));
    // A look frame (stage 43b): the full-screen box with its hood; the failure stays on the page with Edit.
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-lk-box-full .wc-lk-hood-t')?.textContent).toBe('Profile');
    await vi.waitFor(
      async () => {
        await act(async () => {});
        expect(host.querySelector('.wc-frame:not([hidden]) .wc-pw-flash')?.textContent).toMatch(/profile|editor/i);
      },
      { timeout: 10_000 },
    );
    expect(host.querySelector('.wc-frame:not([hidden]) .wc-pw [data-btn="EDIT"]')).not.toBeNull();
    await key('Escape');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
