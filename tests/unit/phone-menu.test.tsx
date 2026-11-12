// @vitest-environment happy-dom
// Stage 51b (ADR 0136 §10): the phone's menu: what is open and where Back
// goes (sheet, settings page, pick list), the status line's text, and the
// settings page as data (only the Text group; its rows patch the desktop's
// appearance keys).
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppStatusState, AppStatusView } from '../../src/app/status';
import { PHONE_KIT } from '../../src/app/phone-kit';
import { inputColor } from '../../src/theme/apply';
import { INPUT_COLORS, INPUT_COLOR_IDS } from '../../src/theme/presets';
import { Seg, Toggle } from '../../src/chrome/kit/look-controls';
import { setPhoneControls, setPhoneKit } from '../../src/phone/kit';
import { PhoneMenu, statusText } from '../../src/phone/menu-sheet';
import {
  GROUP_AWAY_OPTIONS,
  GROUP_GROUP,
  GROUP_NPC_OPTIONS,
  LENS_GROUP,
  PANES_GROUP,
  SETTINGS_GROUPS,
  SETTINGS_PAGES,
  TEXT_GROUP,
  TIMERS_GROUP,
  TIMER_COLS_OPTIONS,
  TIMER_GROUPS_GROUP,
  TIMER_GROUP_NAMES,
  TIMER_LAYOUT_OPTIONS,
  TIMER_SIGNAL_OPTIONS,
  TIMER_STYLE_OPTIONS,
  TIMER_WARN_OPTIONS,
} from '../../src/phone/settings-page';
import {
  AWAY_MODE_CHOICES,
  NPC_MODE_CHOICES,
  TIMER_COLS_CHOICES,
  TIMER_LAYOUT_CHOICES,
  TIMER_SIGNAL_CHOICES,
  TIMER_STYLE_CHOICES,
  TIMER_WARN_OPTIONS as DESKTOP_WARN_OPTIONS,
  colsLabel,
} from '../../src/chrome/pane-options-model';
import { TIMER_GROUPS, TIMER_GROUP_LABELS } from '../../src/timers/entry';
import { SettingsStore } from '../../src/settings';
import { migrateSettings } from '../../src/settings/migrate';
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

function setup(status = STATUS, runs?: { anchor: string | null; chain: { saved: boolean; rating: number } | null }) {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const view = statusView(status);
  const calls = { reconnect: 0, frames: [] as string[], closed: 0, exits: 0, saved: [] as number[] };
  const menu = new PhoneMenu({
    parent: document.body,
    settings,
    status: view,
    scriptsOn: () => 2,
    reconnect: () => calls.reconnect++,
    openFrame: (f) => calls.frames.push(f),
    exit: () => calls.exits++,
    ...(runs ? { runs: { anchor: () => runs.anchor, chain: async () => runs.chain as never, saveChain: async (r: number) => void calls.saved.push(r) } } : {}),
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

  it('the rows call the shell: Reconnect, and the frames of Profile and Scripts; Exit session opens the confirmation', () => {
    const { menu, calls } = setup();
    act(() => menu.open());
    tap(menu.host.querySelector('[data-row="reconnect"]'));
    tap(menu.host.querySelector('[data-row="profile"]'));
    tap(menu.host.querySelector('[data-row="scripts"]'));
    expect(menu.host.querySelector('[data-row="scripts"] .wc-ph-row-v')?.textContent).toBe('2 on');
    tap(menu.host.querySelector('[data-row="exit"]'));
    expect(calls.reconnect).toBe(1);
    expect(calls.frames).toEqual(['profile', 'scripts']);
    expect(menu.showing).toBe('exit');
    expect(calls.exits).toBe(0);
  });

  it('the sheet has no grip, and a close key left of Exit session that folds it down', () => {
    const { menu, calls } = setup();
    act(() => menu.open());
    expect(menu.host.querySelector('.wc-ph-sheet-top')!.childElementCount).toBe(0);
    const foot = menu.host.querySelector('.wc-ph-foot')!;
    expect([...foot.children].map((c) => (c as HTMLElement).dataset.row)).toEqual(['close', 'exit']);
    expect(foot.querySelector('[data-row="close"]')!.getAttribute('aria-label')).toBe('Close menu');
    tap(foot.querySelector('[data-row="close"]'));
    expect(menu.isOpen).toBe(false);
    expect(calls.closed).toBe(1);
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
      exit: () => {},
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
    const menu = new PhoneMenu({ parent: document.body, settings, status: view, scriptsOn: () => 0, reconnect: () => {}, openFrame: () => {}, exit: () => {} });
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

describe('the Exit session confirmation (stage 52)', () => {
  const key = (k: string, init: KeyboardEventInit = {}): void => {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
    });
  };
  const flush = async (): Promise<void> => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  const rating = (menu: PhoneMenu): string | undefined => (menu.host.querySelector('.wc-ph-stars') as HTMLElement | null)?.dataset.rating;

  it('no run to rate: the warning, Cancel and Exit; Exit exits once', async () => {
    const { menu, calls } = setup();
    act(() => menu.openExit('sheet'));
    expect(menu.host.querySelector('[role="alertdialog"]')!.getAttribute('aria-label')).toBe('Exit session');
    expect(menu.host.querySelector('.wc-ph-hood')!.textContent).toBe('Exit session');
    expect(menu.host.querySelector('.wc-ph-exit-warn')!.textContent).toBe('Attention! This terminates the current session.');
    expect(menu.host.querySelector('.wc-ph-stars')).toBeNull();
    tap(menu.host.querySelector('[data-act="exit"]'));
    tap(menu.host.querySelector('[data-act="exit"]'));
    await flush();
    expect(calls.exits).toBe(1);
    expect(calls.saved).toEqual([]);
  });

  it('Cancel, Esc and a tap outside go back to where it came from: the sheet, or the game', () => {
    const { menu, calls } = setup();
    act(() => menu.openExit('sheet'));
    tap(menu.host.querySelector('[data-act="cancel"]'));
    expect(menu.showing).toBe('sheet');
    act(() => menu.openExit('sheet'));
    key('Escape');
    expect(menu.showing).toBe('sheet');
    act(() => menu.close());
    calls.closed = 0;
    // `#exit`: from the game.
    act(() => menu.openExit());
    tap(menu.host.querySelector('.wc-ph-scrim'));
    expect(menu.isOpen).toBe(false);
    expect(calls.closed).toBe(1);
    expect(calls.exits).toBe(0);
  });

  it('a run to rate: five stars, prefilled with the saved rating; a tap rates, Clear clears; Exit saves the rating, then exits', async () => {
    const { menu, calls } = setup(STATUS, { anchor: 'run-1', chain: { saved: true, rating: 2 } });
    act(() => menu.openExit('sheet'));
    expect(menu.host.querySelector('.wc-ph-rate-t')!.textContent).toBe('Rate & save this run (optional)');
    expect(menu.host.querySelectorAll('.wc-ph-star')).toHaveLength(5);
    expect(rating(menu)).toBe('0');
    await flush();
    expect(rating(menu)).toBe('2');
    tap(menu.host.querySelector('[data-star="4"]'));
    expect(rating(menu)).toBe('4');
    expect(menu.host.querySelectorAll('.wc-ph-star.is-on')).toHaveLength(4);
    tap(menu.host.querySelector('[data-act="clear"]'));
    expect(rating(menu)).toBe('0');
    tap(menu.host.querySelector('[data-star="5"]'));
    tap(menu.host.querySelector('[data-act="exit"]'));
    tap(menu.host.querySelector('[data-act="exit"]'));
    await flush();
    expect(calls.saved).toEqual([5]);
    expect(calls.exits).toBe(1);
  });

  it('a rating the player touched is not overwritten by the saved one; an unsaved chain prefills nothing', async () => {
    const a = setup(STATUS, { anchor: 'run-1', chain: { saved: true, rating: 2 } });
    act(() => a.menu.openExit());
    tap(a.menu.host.querySelector('[data-star="1"]'));
    await flush();
    expect(rating(a.menu)).toBe('1');
    const b = setup(STATUS, { anchor: 'run-1', chain: { saved: false, rating: 3 } });
    act(() => b.menu.openExit());
    await flush();
    expect(rating(b.menu)).toBe('0');
    // No anchor: nothing to rate.
    const c = setup(STATUS, { anchor: null, chain: null });
    act(() => c.menu.openExit());
    expect(c.menu.host.querySelector('.wc-ph-stars')).toBeNull();
  });

  it('a physical keyboard: 0 to 5 and the arrows rate, Y exits; with a modifier they do nothing', async () => {
    const { menu, calls } = setup(STATUS, { anchor: 'run-1', chain: null });
    act(() => menu.openExit());
    key('3');
    expect(rating(menu)).toBe('3');
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowRight');
    expect(rating(menu)).toBe('5');
    key('ArrowLeft');
    expect(rating(menu)).toBe('4');
    key('0');
    expect(rating(menu)).toBe('0');
    key('2');
    key('y', { ctrlKey: true });
    await flush();
    expect(calls.exits).toBe(0);
    key('Y');
    await flush();
    expect(calls.saved).toEqual([2]);
    expect(calls.exits).toBe(1);
    // The sheet itself has no such keys.
    const other = setup();
    act(() => other.menu.open());
    key('y');
    await flush();
    expect(other.calls.exits).toBe(0);
  });

  it('a failed save never stops the exit', async () => {
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    let exits = 0;
    const menu = new PhoneMenu({
      parent: document.body,
      settings,
      status: statusView(STATUS),
      scriptsOn: () => 0,
      reconnect: () => {},
      openFrame: () => {},
      exit: () => exits++,
      runs: { anchor: () => 'run-1', chain: async () => null, saveChain: async () => Promise.reject(new Error('no disk')) },
    });
    menus.push(menu);
    act(() => menu.openExit());
    tap(menu.host.querySelector('[data-act="exit"]'));
    await flush();
    expect(exits).toBe(1);
  });
});

describe('the Map lens group', () => {
  it('reads and patches phone.lens only', () => {
    const s = defaultSettings();
    const [show, opens] = LENS_GROUP.rows;
    if (show?.kind !== 'toggle' || opens?.kind !== 'seg') throw new Error('row kinds');
    expect(show.get(s)).toBe(true);
    expect(show.set(false, s)).toEqual({ phone: { lens: { show: false } } });
    expect(opens.get(s)).toBe('z1');
    expect(opens.options.map((o) => o.value)).toEqual(['z1', 'z2', 'z3', 'z4']);
    expect(opens.set('z3', s)).toEqual({ phone: { lens: { opensAt: 'z3' } } });
  });

  it('its switch and segments change the stored settings from the page', () => {
    const { menu, settings } = setup();
    act(() => menu.openSettings());
    const row = (id: string): Element => menu.host.querySelector(`[data-row="${id}"]`)!;
    // No size row since stage 52: the lens is sized from the screen.
    expect(menu.host.querySelector('[data-row="lens-size"]')).toBeNull();
    tap(row('lens-opens').querySelector('[data-opt="z3"]'));
    expect(settings.get().phone.lens.opensAt).toBe('z3');
    tap(row('lens-show').querySelector('[role="switch"]'));
    expect(settings.get().phone.lens.show).toBe(false);
    expect(row('lens-show').querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('false');
    // The desktop's Mapper settings are not touched.
    expect(settings.get().mapper).toEqual(defaultSettings().mapper);
  });
});

describe('the Panes and Comm groups', () => {
  it('Panes: a list of the strip\'s panes, switched and moved; only phone.strip is patched', () => {
    const { menu, settings } = setup();
    act(() => menu.openSettings('game', 'panes'));
    const item = (id: string): Element => menu.host.querySelector(`[data-group="panes"] [data-item="${id}"]`)!;
    const order = (): string[] => [...menu.host.querySelectorAll('[data-group="panes"] [data-item]')].map((e) => (e as HTMLElement).dataset.item!);
    expect(order()).toEqual(['timers', 'group', 'character', 'statistics']);
    expect(item('timers').querySelector('[data-move="up"]')!.getAttribute('aria-disabled')).toBe('true');
    expect(item('statistics').querySelector('[data-move="down"]')!.getAttribute('aria-disabled')).toBe('true');
    // A key at its end does nothing.
    tap(item('timers').querySelector('[data-move="up"]'));
    expect(order()).toEqual(['timers', 'group', 'character', 'statistics']);
    tap(item('character').querySelector('[data-move="up"]'));
    expect(order()).toEqual(['timers', 'character', 'group', 'statistics']);
    tap(item('timers').querySelector('[data-move="down"]'));
    expect(order()).toEqual(['character', 'timers', 'group', 'statistics']);
    tap(item('group').querySelector('[role="switch"]'));
    // Character is off by default (stage 52); its switch brings it in.
    expect(settings.get().phone.strip.panes[0]).toEqual({ id: 'character', on: false });
    tap(item('character').querySelector('[role="switch"]'));
    expect(settings.get().phone.strip.panes).toEqual([
      { id: 'character', on: true },
      { id: 'timers', on: true },
      { id: 'group', on: false },
      { id: 'statistics', on: true },
    ]);
    // The desktop's pane toggles and layout are not touched.
    expect(settings.get().panes).toEqual(defaultSettings().panes);
    expect(settings.get().layout).toEqual(defaultSettings().layout);
  });

  it('Comm: count unread is phone.unread; NPCs in Public is the desktop gear\'s comm.npcs', () => {
    const { menu, settings } = setup();
    act(() => menu.openSettings());
    const row = (id: string): Element => menu.host.querySelector(`[data-row="${id}"]`)!;
    expect(settings.get().phone.unread).toBe('private');
    tap(row('comm-unread').querySelector('[data-opt="all"]'));
    expect(settings.get().phone.unread).toBe('all');
    const npcs = settings.get().comm.npcs;
    tap(row('comm-npcs').querySelector('[role="switch"]'));
    expect(settings.get().comm.npcs).toBe(!npcs);
    expect({ ...settings.get().comm, npcs: null }).toEqual({ ...defaultSettings().comm, npcs: null });
  });
});

describe('the settings page as data', () => {
  it('has the ADR\'s groups and no other (stage 51 rule 3): Text, Quick buttons, Map lens, Panes, Comm, Connection', () => {
    // (Keyboard: stage 53d; shown only with our own keyboard, phone-keyboard-fields.test.ts.)
    expect(SETTINGS_GROUPS.map((g) => g.id)).toEqual(['text', 'compass', 'keyboard', 'lens', 'panes', 'comm', 'connection']);
    expect(SETTINGS_GROUPS.map((g) => g.title)).toEqual(['Text', 'Quick buttons', 'Keyboard', 'Map lens', 'Panes', 'Comm', 'Connection']);
    expect(LENS_GROUP.rows.map((r) => `${r.kind}:${r.id}`)).toEqual(['toggle:lens-show', 'seg:lens-opens', 'action:lens-reset']);
    expect(PANES_GROUP.rows.map((r) => `${r.kind}:${r.id}`)).toEqual(['order:strip-panes', 'toggle:fight-card', 'link:timers-group']);
    expect(TEXT_GROUP.rows.map((r) => `${r.kind}:${r.id}`)).toEqual(['stepper:size', 'seg:theme', 'pick:font', 'pick:input-color']);
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
    expect(font.options(s).some((o) => o.value === 'hack' && o.label === 'Hack')).toBe(true);
    expect(font.options(s).map((o) => o.value)).toContain(font.get(s));
  });

  it('Input colour: the desktop dropdown\'s options with their colours, and the key it sets (ADR 0035)', () => {
    const s = defaultSettings();
    const row = TEXT_GROUP.rows.find((r) => r.id === 'input-color');
    if (row?.kind !== 'pick') throw new Error('row kind');
    expect(row.label).toBe('Input colour');
    // The same list, order and names as src/chrome/popups/settings-popup.tsx, the swatch on the current background.
    expect(row.options(s)).toEqual(INPUT_COLOR_IDS.map((id) => ({ value: id, label: INPUT_COLORS[id].label, swatch: inputColor(id, s.appearance.bg) })));
    const paper = { ...s, appearance: { ...s.appearance, bg: '#f4ecd8' } };
    expect(row.options(paper).find((o) => o.value === 'amber')?.swatch).toBe('color-mix(in oklab, var(--term-fg) 15%, #9a5a00)');
    expect(row.get(s)).toBe('amber');
    expect(row.set('steel', s)).toEqual({ appearance: { inputColor: 'steel' } });
  });

  it('Input colour on the page: the row shows the choice with its chip; the list sets it and goes back', () => {
    const { menu, settings } = setup();
    act(() => menu.openSettings('sheet'));
    const row = () => menu.host.querySelector('[data-row="input-color"]');
    expect(row()?.querySelector('.wc-ph-srow-v')?.textContent).toBe('Amber');
    expect((row()?.querySelector('.wc-ph-tint') as HTMLElement | null)?.style.getPropertyValue('--ph-tint')).toBe(inputColor('amber', '#000000'));
    // The font's row has no chip.
    expect(menu.host.querySelector('[data-row="font"] .wc-ph-tint')).toBeNull();
    tap(row());
    const list = menu.host.querySelector('[data-pick="input-color"]')!;
    expect([...list.querySelectorAll('[role="radio"]')].map((o) => o.getAttribute('data-opt'))).toEqual([...INPUT_COLOR_IDS]);
    expect(list.querySelectorAll('.wc-ph-tint').length).toBe(INPUT_COLOR_IDS.length);
    expect(list.querySelector('[aria-checked="true"]')?.getAttribute('data-opt')).toBe('amber');
    tap(list.querySelector('[data-opt="steel"]'));
    expect(settings.get().appearance.inputColor).toBe('steel');
    expect(menu.host.querySelector('[data-pick="input-color"]')).toBeNull();
    expect(row()?.querySelector('.wc-ph-srow-v')?.textContent).toBe('Steel');
  });
});

describe('the Timers and Group sub-page (stage 52)', () => {
  it('its choices and names are the desktop gears\' (the phone chunk repeats them)', () => {
    expect(TIMER_STYLE_OPTIONS).toEqual(TIMER_STYLE_CHOICES);
    expect(TIMER_LAYOUT_OPTIONS).toEqual(TIMER_LAYOUT_CHOICES);
    expect(TIMER_SIGNAL_OPTIONS).toEqual(TIMER_SIGNAL_CHOICES);
    expect(TIMER_WARN_OPTIONS).toEqual(DESKTOP_WARN_OPTIONS);
    expect(TIMER_COLS_OPTIONS).toEqual(TIMER_COLS_CHOICES.map((c) => ({ value: String(c), label: colsLabel(c) })));
    expect(GROUP_NPC_OPTIONS).toEqual(NPC_MODE_CHOICES);
    expect(GROUP_AWAY_OPTIONS).toEqual(AWAY_MODE_CHOICES);
    expect(TIMER_GROUP_NAMES).toEqual(TIMER_GROUPS.map((id) => ({ id, label: TIMER_GROUP_LABELS[id] })));
  });

  it('its groups and rows', () => {
    const page = SETTINGS_PAGES['timers-group']!;
    expect(page.title).toBe('Timers and Group');
    expect(page.groups.map((g) => g.title)).toEqual(['Timers', 'Timer groups', 'Group']);
    expect(TIMERS_GROUP.rows.map((r) => `${r.kind}:${r.label}`)).toEqual([
      'seg:Style',
      'seg:Layout',
      'pick:Grid columns',
      'toggle:Group headers',
      'toggle:Time text',
      'pick:Signal',
      'pick:Warn at',
      'toggle:Soonest first',
    ]);
    expect(TIMER_GROUPS_GROUP.rows.map((r) => r.label)).toEqual(['Herblores', 'Sanctuary', 'Spells', 'Buffs', 'Debuffs', 'Stored', 'Blinds', 'Charmies']);
    expect(GROUP_GROUP.rows.map((r) => `${r.kind}:${r.label}`)).toEqual(['toggle:Show players', 'pick:NPC visibility', 'pick:Away members', 'toggle:Fight card in the pane']);
  });

  it('every row reads and writes the desktop gear\'s key, with a value of its set', () => {
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    const d = defaultSettings();
    const set = (g: typeof TIMERS_GROUP, id: string, v: string | boolean): void => {
      const r = g.rows.find((x) => x.id === id)!;
      if (r.kind === 'toggle') store.update(r.set(v as boolean, store.get()));
      else if (r.kind === 'seg' || r.kind === 'pick') store.update(r.set(v as string, store.get()));
      else throw new Error(r.kind);
    };
    const get = (g: typeof TIMERS_GROUP, id: string): unknown => {
      const r = g.rows.find((x) => x.id === id)!;
      if (r.kind === 'toggle' || r.kind === 'seg' || r.kind === 'pick') return r.get(store.get());
      throw new Error(r.kind);
    };
    expect([get(TIMERS_GROUP, 'timers-style'), get(TIMERS_GROUP, 'timers-layout'), get(TIMERS_GROUP, 'timers-cols'), get(TIMERS_GROUP, 'timers-signal'), get(TIMERS_GROUP, 'timers-warn')]).toEqual(['bars', 'flow', 'auto', 'text', '20']);
    set(TIMERS_GROUP, 'timers-style', 'circles');
    set(TIMERS_GROUP, 'timers-layout', 'grid');
    set(TIMERS_GROUP, 'timers-cols', '4');
    set(TIMERS_GROUP, 'timers-headers', false);
    set(TIMERS_GROUP, 'timers-time', false);
    set(TIMERS_GROUP, 'timers-signal', 'pulse');
    set(TIMERS_GROUP, 'timers-warn', '60');
    set(TIMERS_GROUP, 'timers-soonest', false);
    set(TIMER_GROUPS_GROUP, 'timers-group-herb', false);
    set(TIMER_GROUPS_GROUP, 'timers-group-sanct', false);
    expect(store.get().timers).toEqual({
      ...d.timers,
      style: 'circles',
      layout: 'grid',
      cols: 4,
      headers: false,
      timeText: false,
      signal: 'pulse',
      warnAt: 60,
      soonestFirst: false,
      groups: { ...d.timers.groups, herb: { ...d.timers.groups.herb, enabled: false }, sanct: { ...d.timers.groups.sanct, enabled: false } },
    });
    set(TIMERS_GROUP, 'timers-cols', 'auto');
    expect(store.get().timers.cols).toBe('auto');
    expect(get(TIMER_GROUPS_GROUP, 'timers-group-herb')).toBe(false);
    set(GROUP_GROUP, 'group-players', false);
    set(GROUP_GROUP, 'group-npcs', 'all');
    set(GROUP_GROUP, 'group-away', 'dim');
    set(GROUP_GROUP, 'group-fight', true);
    expect(store.get().group).toEqual({ ...d.group, showPlayers: false, npcMode: 'all', away: 'dim', fight: true });
    // What was written is what the migration keeps: values of the settings' own sets.
    expect(migrateSettings(JSON.parse(JSON.stringify(store.get()))).timers).toEqual(store.get().timers);
    expect(migrateSettings(JSON.parse(JSON.stringify(store.get()))).group).toEqual(store.get().group);
    // Nothing else moved.
    expect({ ...store.get(), timers: null, group: null }).toEqual({ ...d, timers: null, group: null });
  });

  it('opens from the Panes group\'s row; Back returns to the settings page at the same scroll position, then on to the sheet', () => {
    const { menu, settings } = setup();
    act(() => menu.openSettings('sheet'));
    const page = (): string | undefined => (menu.host.querySelector('.wc-ph-page') as HTMLElement).dataset.page;
    const col = (): HTMLElement => menu.host.querySelector('.wc-ph-col')!;
    const link = menu.host.querySelector('[data-group="panes"] [data-row="timers-group"]')!;
    expect(link.querySelector('.wc-ph-chev')).not.toBeNull();
    col().scrollTop = 321;
    tap(link);
    expect(page()).toBe('sub:timers-group');
    expect(menu.host.querySelector('.wc-ph-hood')!.textContent).toBe('Timers and Group');
    expect(menu.host.querySelector('.wc-ph-back')!.getAttribute('aria-label')).toBe('Back to settings');
    expect(col().scrollTop).toBe(0);
    expect([...menu.host.querySelectorAll('.wc-ph-grp')].map((g) => (g as HTMLElement).dataset.group)).toEqual(['timers', 'timer-groups', 'group']);
    // A switch on the sub-page writes the shared key.
    tap(menu.host.querySelector('[data-row="timers-group-herb"] [role="switch"]'));
    expect(settings.get().timers.groups.herb.enabled).toBe(false);
    // A pick list on the sub-page: Back returns to the sub-page where it was.
    col().scrollTop = 77;
    tap(menu.host.querySelector('[data-row="timers-warn"]'));
    expect(page()).toBe('pick:timers-warn');
    expect(menu.host.querySelector('.wc-ph-back')!.getAttribute('aria-label')).toBe('Back to Timers and Group');
    tap(menu.host.querySelector('[data-opt="30"]'));
    expect(settings.get().timers.warnAt).toBe(30);
    expect(page()).toBe('sub:timers-group');
    expect(col().scrollTop).toBe(77);
    // Back (Esc, the back gesture): the settings page, where it was scrolled.
    act(() => void menu.back());
    expect(page()).toBe('settings');
    expect(menu.showing).toBe('settings');
    expect(menu.host.querySelector('.wc-ph-hood')!.textContent).toBe('Settings');
    expect(col().scrollTop).toBe(321);
    act(() => void menu.back());
    expect(menu.showing).toBe('sheet');
  });
});
