// @vitest-environment happy-dom
// Stage 51b (ADR 0136 §10): the phone's menu: what is open and where Back
// goes (sheet, settings page, pick list), the status line's text, and the
// settings page as data (only the Text group; its rows patch the desktop's
// appearance keys).
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppStatusState, AppStatusView } from '../../src/app/status';
import { PHONE_KIT } from '../../src/app/phone-kit';
import { Seg, Toggle } from '../../src/chrome/kit/look-controls';
import { setPhoneControls, setPhoneKit } from '../../src/phone/kit';
import { PhoneMenu, statusText } from '../../src/phone/menu-sheet';
import { SETTINGS_GROUPS, TEXT_GROUP } from '../../src/phone/settings-page';
import { SettingsStore } from '../../src/settings';
import { defaultSettings } from '../../src/settings/types';

setPhoneKit(PHONE_KIT);
setPhoneControls({ Seg, Toggle });

const STATUS: AppStatusState = { conn: 'playing', replay: false, character: 'Rasta', linkMs: 38, linkSuspect: false, capture: '', xml: true };

function statusView(s: AppStatusState): AppStatusView & { set(next: AppStatusState): void } {
  let cur = s;
  const fns = new Set<(s: AppStatusState) => void>();
  return {
    get: () => cur,
    subscribe: (fn) => {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    set: (next) => {
      cur = next;
      for (const fn of [...fns]) fn(cur);
    },
  };
}

/** Every menu of a test, disposed after it (an open menu holds the window's keys). */
const menus: PhoneMenu[] = [];

function setup(status = STATUS) {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const view = statusView(status);
  const calls = { reconnect: 0, frames: [] as string[], closed: 0 };
  const menu = new PhoneMenu({
    parent: document.body,
    settings,
    status: view,
    scriptsOn: () => 2,
    reconnect: () => calls.reconnect++,
    openFrame: (f) => calls.frames.push(f),
    onClose: () => calls.closed++,
  });
  menus.push(menu);
  return { menu, settings, view, calls };
}

const tap = (el: Element | null): void => {
  if (!el) throw new Error('no element');
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

afterEach(() => {
  act(() => {
    for (const m of menus.splice(0)) m.dispose();
  });
  document.body.replaceChildren();
});

describe('statusText', () => {
  it('names the character once known, the profile and the link time', () => {
    expect(statusText(STATUS, 'default')).toBe('Rasta · default · Link: 38ms');
    expect(statusText({ ...STATUS, character: '', linkMs: null }, 'scout')).toBe('scout · Link: —');
    expect(statusText({ ...STATUS, linkSuspect: true }, 'default')).toBe('Rasta · default · Link: 38ms?');
  });
});

describe('PhoneMenu', () => {
  it('is closed and empty until opened; closed again nothing is mounted', () => {
    const { menu, calls } = setup();
    expect(menu.isOpen).toBe(false);
    expect(menu.host.hidden).toBe(true);
    expect(menu.host.childElementCount).toBe(0);
    act(() => menu.open());
    expect(menu.showing).toBe('sheet');
    expect(menu.host.hidden).toBe(false);
    expect(menu.host.querySelector('.wc-ph-sheet')).not.toBeNull();
    act(() => menu.close());
    expect(menu.isOpen).toBe(false);
    expect(menu.host.hidden).toBe(true);
    expect(menu.host.childElementCount).toBe(0);
    expect(calls.closed).toBe(1);
    // Closing a closed menu says nothing.
    act(() => menu.close());
    expect(calls.closed).toBe(1);
  });

  it('a quiet close does not report the game back', () => {
    const { menu, calls } = setup();
    act(() => menu.open());
    act(() => menu.close(true));
    expect(menu.isOpen).toBe(false);
    expect(calls.closed).toBe(0);
  });

  it('Back: the settings page to the sheet it came from, the sheet closed; false when nothing is open', () => {
    const { menu, calls } = setup();
    expect(menu.back()).toBe(false);
    act(() => menu.open());
    tap(menu.host.querySelector('[data-row="settings"]'));
    expect(menu.showing).toBe('settings');
    expect(menu.host.querySelector('.wc-ph-page')).not.toBeNull();
    expect(menu.host.querySelector('.wc-ph-sheet')).toBeNull();
    act(() => void menu.back());
    expect(menu.showing).toBe('sheet');
    expect(calls.closed).toBe(0);
    act(() => void menu.back());
    expect(menu.isOpen).toBe(false);
    expect(calls.closed).toBe(1);
  });

  it('the settings page opened by a command goes back to the game', () => {
    const { menu, calls } = setup();
    act(() => menu.openSettings());
    expect(menu.showing).toBe('settings');
    act(() => void menu.back());
    expect(menu.isOpen).toBe(false);
    expect(calls.closed).toBe(1);
  });

  it('a pick list takes Back first', () => {
    const { menu } = setup();
    act(() => menu.openSettings('sheet'));
    tap(menu.host.querySelector('[data-row="font"]'));
    expect(menu.host.querySelector('[data-pick="font"]')).not.toBeNull();
    act(() => void menu.back());
    expect(menu.host.querySelector('[data-pick="font"]')).toBeNull();
    expect(menu.showing).toBe('settings');
    act(() => void menu.back());
    expect(menu.showing).toBe('sheet');
  });

  it('the rows call the shell: Reconnect, and the frames of Profile, Scripts and Exit', () => {
    const { menu, calls } = setup();
    act(() => menu.open());
    tap(menu.host.querySelector('[data-row="reconnect"]'));
    tap(menu.host.querySelector('[data-row="profile"]'));
    tap(menu.host.querySelector('[data-row="scripts"]'));
    tap(menu.host.querySelector('[data-row="exit"]'));
    expect(calls.reconnect).toBe(1);
    expect(calls.frames).toEqual(['profile', 'scripts', 'exit']);
    expect(menu.host.querySelector('[data-row="scripts"] .wc-ph-row-v')?.textContent).toBe('2 on');
  });

  it('Reconnect is lit while the link is down, and follows the status while open', () => {
    const { menu, view } = setup();
    act(() => menu.open());
    const row = (): Element => menu.host.querySelector('[data-row="reconnect"]')!;
    expect(row().classList.contains('is-lit')).toBe(false);
    act(() => view.set({ ...STATUS, conn: 'disconnected' }));
    expect(row().classList.contains('is-lit')).toBe(true);
    expect(row().textContent).toContain('Not connected');
    act(() => view.set({ ...STATUS, conn: 'connecting' }));
    expect(row().classList.contains('is-lit')).toBe(false);
  });

  it('Recording shows only while the run is captured', () => {
    const { menu, view } = setup();
    act(() => menu.open());
    expect(menu.host.querySelector('.wc-ph-rec')).toBeNull();
    act(() => view.set({ ...STATUS, capture: 'capture: recording' }));
    expect(menu.host.querySelector('.wc-ph-rec')?.textContent).toBe('Recording');
  });

  it('has the keys while open: Esc steps back, plain keys are swallowed, shortcuts pass; none when closed', () => {
    const { menu } = setup();
    const seen: string[] = [];
    const onDoc = (e: Event): void => void seen.push((e as KeyboardEvent).key);
    document.addEventListener('keydown', onDoc);
    const key = (k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
      act(() => void document.body.dispatchEvent(e));
      return e;
    };
    key('a');
    expect(seen).toEqual(['a']);
    act(() => menu.openSettings('sheet'));
    expect(key('b').defaultPrevented).toBe(true);
    expect(key('Enter').defaultPrevented).toBe(true);
    // The browser's own keys keep their default, but no key reaches the command line (no macro runs).
    expect(key('r', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key('q', { altKey: true }).defaultPrevented).toBe(false);
    expect(key('F5').defaultPrevented).toBe(false);
    expect(key('F12').defaultPrevented).toBe(false);
    expect(seen).toEqual(['a']);
    // Esc with a modifier is not the menu's Back.
    key('Escape', { ctrlKey: true });
    expect(menu.showing).toBe('settings');
    key('Escape');
    expect(menu.showing).toBe('sheet');
    key('Escape');
    expect(menu.isOpen).toBe(false);
    key('c');
    expect(seen).toEqual(['a', 'c']);
    document.removeEventListener('keydown', onDoc);
  });

  it('opening takes the focus out of a text field (the on-screen keyboard closes); a button keeps it', () => {
    const { menu } = setup();
    const ta = document.createElement('textarea');
    document.body.append(ta);
    ta.focus();
    expect(document.activeElement).toBe(ta);
    act(() => menu.open());
    expect(document.activeElement).not.toBe(ta);
    // Going on to the settings page blurs nothing more (nothing has the focus).
    act(() => menu.openSettings('sheet'));
    expect(document.activeElement).not.toBe(ta);
  });

  it('A+ is dimmed where the next size would not fit the screen, in the sheet and on the page', () => {
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    const size = settings.get().appearance.size;
    const menu = new PhoneMenu({
      parent: document.body,
      settings,
      status: statusView(STATUS),
      scriptsOn: () => 0,
      reconnect: () => {},
      openFrame: () => {},
      fits: (next) => next <= size + 1,
    });
    menus.push(menu);
    act(() => menu.open());
    const more = (): Element => menu.host.querySelector('.wc-ph-step-key.is-more')!;
    expect(more().getAttribute('aria-disabled')).toBeNull();
    tap(more());
    expect(settings.get().appearance.size).toBe(size + 1);
    expect(more().getAttribute('aria-disabled')).toBe('true');
    tap(more());
    expect(settings.get().appearance.size).toBe(size + 1);
    act(() => menu.openSettings('sheet'));
    expect(more().getAttribute('aria-disabled')).toBe('true');
    expect(menu.host.querySelector('.wc-ph-step-key.is-less')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('follows nothing while closed: no listener is left on the status', () => {
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    const view = statusView(STATUS);
    const sub = vi.spyOn(view, 'subscribe');
    const menu = new PhoneMenu({ parent: document.body, settings, status: view, scriptsOn: () => 0, reconnect: () => {}, openFrame: () => {} });
    menus.push(menu);
    expect(sub).not.toHaveBeenCalled();
    act(() => menu.open());
    expect(sub).toHaveBeenCalledTimes(1);
    act(() => menu.close());
    // The unsubscribe ran: a status change reaches no one (it would throw on an unmounted tree otherwise).
    act(() => view.set({ ...STATUS, conn: 'disconnected' }));
    expect(menu.host.childElementCount).toBe(0);
  });

  it('the text size keys and the swatches change the appearance settings', () => {
    const { menu, settings } = setup();
    act(() => menu.open());
    const size = settings.get().appearance.size;
    tap(menu.host.querySelector('.wc-ph-step-key.is-more'));
    expect(settings.get().appearance.size).toBe(size + 1);
    tap(menu.host.querySelector('.wc-ph-step-key.is-less'));
    expect(settings.get().appearance.size).toBe(size);
    tap(menu.host.querySelector('.wc-ph-swatch[data-theme="paper"]'));
    expect(settings.get().appearance.bg).toBe('#f4ecd8');
    expect(settings.get().appearance.fg).toBe('#000000');
    expect(menu.host.querySelector('.wc-ph-menu-surface')?.hasAttribute('data-light')).toBe(true);
    tap(menu.host.querySelector('.wc-ph-swatch[data-theme="black"]'));
    expect(settings.get().appearance.bg).toBe('#000000');
    expect(settings.get().appearance.fg).toBe(defaultSettings().appearance.fg);
  });
});

describe('the settings page as data', () => {
  it('has only the Text group until later steps add theirs (stage 51 rule 3)', () => {
    expect(SETTINGS_GROUPS.map((g) => g.id)).toEqual(['text']);
    expect(TEXT_GROUP.rows.map((r) => `${r.kind}:${r.id}`)).toEqual(['stepper:size', 'seg:theme', 'pick:font']);
  });

  it('its rows read and patch the appearance keys the desktop uses', () => {
    const s = defaultSettings();
    const [size, theme, font] = TEXT_GROUP.rows;
    if (size?.kind !== 'stepper' || theme?.kind !== 'seg' || font?.kind !== 'pick') throw new Error('row kinds');
    expect(size.get(s)).toBe(s.appearance.size);
    expect(size.set(size.step(15, 1), s)).toEqual({ appearance: { size: 16 } });
    expect(theme.get(s)).toBe('black');
    expect(theme.set('paper', s)).toMatchObject({ appearance: { bg: '#f4ecd8', fg: '#000000' } });
    expect(theme.get({ ...s, appearance: { ...s.appearance, bg: '#0e141c' } })).toBe('');
    expect(font.set('hack', s)).toEqual({ appearance: { font: 'hack' } });
    expect(font.options().some((o) => o.value === 'hack' && o.label === 'Hack')).toBe(true);
    expect(font.options().map((o) => o.value)).toContain(font.get(s));
  });
});
