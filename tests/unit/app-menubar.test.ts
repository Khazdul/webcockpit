// @vitest-environment happy-dom
// The menu bar in the real App (ADR 0099, ADR 0100): it replaces the clock
// strip with `ui.bar`, Esc in the input closes its popup and otherwise
// opens the Exit popup (ADR 0112; the phone's ESC menu without the bar), `#menu`,
// the `#profile` … commands, the Settings popup's toggle (ADR 0107) and
// the Disconnected notice.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, type AppUi, MENU_GONE_HINT } from '../../src/app/app';
import { FakeSocket } from './net-helpers';
import { barCells } from '../../src/menubar/menubar';
import { STRIP_CELLS } from '../../src/ui/clock-strip';

function setup(ui: Partial<AppUi> | null = {}) {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const sockets: FakeSocket[] = [];
  const onEscape = vi.fn();
  const openMenuAt = vi.fn();
  const exit = vi.fn();
  const app = new App({
    root,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    recorder: { openStore: () => Promise.reject(new Error('no store')), win: null },
    requestFrame: () => {},
    onEscape,
    // The shell hands `openMenuAt` to the phone only (no bar, ADR 0112).
    ...(ui ? { ui: { bar: true, exit, ...(ui.bar === false ? { openMenuAt } : {}), ...ui } } : {}),
  });
  const key = (k: string) =>
    app.input.input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const enter = (text: string) => {
    app.input.input.value = text;
    key('Enter');
  };
  const sys = () => [...app.output.el.querySelectorAll('.wc-row')].map((r) => r.textContent);
  return { app, root, sockets, onEscape, openMenuAt, exit, key, enter, sys };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('App with the menu bar', () => {
  it('puts the bar at the end of the input row, around the clock strip', () => {
    const t = setup();
    const bar = t.app.menuBar!;
    expect(bar).not.toBeNull();
    expect(t.app.input.el.lastElementChild).toBe(bar.el);
    expect(bar.bar.contains(t.app.input.clockEl)).toBe(true);
    expect(t.app.clockStrip).toBe(bar.clock);
    // The cockpit lays out the input row with the bar's width (ADR 0102).
    expect(t.app.cockpit.barCells).toBe(barCells(bar.bar.querySelector('[data-mb="fullscreen"]') !== null));
  });

  it('keeps the plain clock strip without the bar (phone, player, tests)', () => {
    const t = setup({ bar: false });
    expect(t.app.menuBar).toBeNull();
    expect(t.app.input.el.lastElementChild).toBe(t.app.input.clockEl);
    expect(t.app.input.clockEl.textContent).toBe('        ');
    expect(t.app.cockpit.barCells).toBe(STRIP_CELLS);
  });

  it('Esc in the input closes the open popup; with nothing open it opens the Exit popup (ADR 0112)', () => {
    const t = setup();
    t.app.input.focus();
    t.app.menuBar!.open('panes');
    t.key('Escape');
    expect(t.app.menuBar!.openPopup).toBeNull();
    expect(document.activeElement).toBe(t.app.input.input);
    t.key('Escape');
    expect(t.app.menuBar!.openPopup).toBe('exit');
    expect(t.onEscape).not.toHaveBeenCalled();
  });

  it('#menu with the bar prints the hint and opens nothing (ADR 0112)', () => {
    const t = setup();
    const said: string[] = [];
    t.app.bus.on('sys.message', (m) => said.push(m.text));
    t.enter('#menu');
    expect(said).toEqual([MENU_GONE_HINT]);
    expect(MENU_GONE_HINT).toBe(
      'The ESC menu is gone: use the menu bar, or #profile, #scripts, #panes, #settings, #fullscreen, #exit.',
    );
    expect(t.onEscape).not.toHaveBeenCalled();
    expect(t.app.menuBar!.openPopup).toBeNull();
  });

  it('without the bar (the phone), Esc and #menu open the ESC menu', () => {
    const t = setup({ bar: false });
    t.app.input.focus();
    t.key('Escape');
    expect(t.onEscape).toHaveBeenCalledOnce();
    t.enter('#menu');
    expect(t.onEscape).toHaveBeenCalledTimes(2);
  });

  it('popups take the focus when they open (ADR 0108): #panes, a Tab macro; Esc gives it back', () => {
    const t = setup();
    t.app.input.focus();
    t.enter('#panes');
    const pop = t.app.menuBar!.popupEl!;
    expect(pop.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).dataset.pane).toBeDefined();
    pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(t.app.menuBar!.openPopup).toBeNull();
    expect(document.activeElement).toBe(t.app.input.input);
    // A macro bound to Tab runs (and its popup takes the focus).
    t.enter('#macro {Tab} {#exit}');
    const e = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true });
    t.app.input.input.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(t.app.menuBar!.openPopup).toBe('exit');
    expect(document.activeElement).toBe(t.app.menuBar!.popupEl);
  });

  it('Tab on a stray focus in the cockpit gives the keys back to the input (ADR 0108)', () => {
    const t = setup();
    const icon = t.app.menuBar!.bar.querySelector<HTMLButtonElement>('[data-mb="panes"]')!;
    expect(icon.tabIndex).toBe(-1);
    icon.focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true });
    icon.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(t.app.input.input);
    expect(t.app.menuBar!.openPopup).toBeNull();
  });

  it('#panes and #exit toggle the popups; #profile, #scripts, #settings reach the shell', () => {
    const toggleWindow = vi.fn();
    const toggleSettings = vi.fn();
    const t = setup({ toggleWindow, toggleSettings });
    t.enter('#panes');
    expect(t.app.menuBar!.openPopup).toBe('panes');
    t.enter('#panes');
    expect(t.app.menuBar!.openPopup).toBeNull();
    t.enter('#exit');
    expect(t.app.menuBar!.openPopup).toBe('exit');
    t.app.menuBar!.closePopup();
    t.app.menuBar!.open('panes');
    t.enter('#profile');
    expect(t.app.menuBar!.openPopup).toBeNull();
    t.enter('#scripts');
    t.enter('#settings');
    expect(toggleWindow.mock.calls.map((c) => c[0])).toEqual(['profile', 'scripts']);
    expect(toggleSettings).toHaveBeenCalledOnce();
    // The full name is needed: #pa stays tt++'s #parse (inert), #pro #prompt.
    t.enter('#pa');
    t.enter('#prof');
    expect(toggleWindow).toHaveBeenCalledTimes(2);
    expect(t.openMenuAt).not.toHaveBeenCalled();
  });

  it('the bar’s Exit exits', async () => {
    const t = setup();
    const btn = (id: string) => t.app.menuBar!.bar.querySelector<HTMLButtonElement>(`[data-mb="${id}"]`)!;
    btn('exit').click();
    t.app.menuBar!.popupEl!.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(t.exit).toHaveBeenCalledOnce();
  });

  it('with the Settings popup (ADR 0107): the bar and #settings toggle it; adopted, Esc in the input closes it first', () => {
    const toggleSettings = vi.fn();
    const t = setup({ toggleSettings });
    const bar = t.app.menuBar!;
    bar.bar.querySelector<HTMLButtonElement>('[data-mb="settings"]')!.click();
    t.enter('#settings');
    expect(toggleSettings).toHaveBeenCalledTimes(2);
    expect(t.openMenuAt).not.toHaveBeenCalled();
    // The shell hands the open popup to the bar; Esc in the input closes it.
    const close = vi.fn();
    bar.adopt({ key: 'settings', el: document.createElement('div'), close });
    t.app.input.focus();
    t.key('Escape');
    expect(close).toHaveBeenCalledOnce();
    expect(bar.openPopup).toBeNull();
    t.key('Escape');
    expect(close).toHaveBeenCalledOnce();
    expect(t.onEscape).not.toHaveBeenCalled();
  });

  it('with windows (ADR 0103): the bar and #profile / #scripts toggle them; Esc reaches the topmost window', () => {
    const toggleWindow = vi.fn();
    let open = true;
    const escapeWindow = vi.fn(() => open);
    const t = setup({ toggleWindow, escapeWindow, windowsUnsaved: () => true });
    const btn = (id: string) => t.app.menuBar!.bar.querySelector<HTMLButtonElement>(`[data-mb="${id}"]`)!;
    btn('profile').click();
    btn('scripts').click();
    t.enter('#profile');
    t.enter('#scripts');
    expect(toggleWindow.mock.calls.map((c) => c[0])).toEqual(['profile', 'scripts', 'profile', 'scripts']);
    expect(t.openMenuAt).not.toHaveBeenCalled();
    // A press on the toggles keeps a window's focus.
    expect(btn('profile').hasAttribute('data-wc-window-btn')).toBe(true);
    expect(btn('panes').hasAttribute('data-wc-window-btn')).toBe(false);
    // Esc: the popup, then the window, then the Exit popup (ADR 0112).
    t.app.input.focus();
    t.app.menuBar!.open('panes');
    t.key('Escape');
    expect(escapeWindow).not.toHaveBeenCalled();
    t.key('Escape');
    expect(escapeWindow).toHaveBeenCalledOnce();
    open = false;
    t.key('Escape');
    expect(escapeWindow).toHaveBeenCalledTimes(2);
    expect(t.onEscape).not.toHaveBeenCalled();
    expect(t.app.menuBar!.openPopup).toBe('exit');
    t.app.menuBar!.closePopup();
    // The Exit popup warns about the window's unsaved changes.
    t.enter('#exit');
    expect(t.app.menuBar!.popupEl!.querySelector('.wc-pop-warn')!.textContent).toBe(
      'Unsaved changes in an open window will be lost.',
    );
  });

  it('in fullscreen, Esc with nothing open opens the Exit popup (ADR 0103)', () => {
    const t = setup({ escapeWindow: () => false });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.documentElement });
    try {
      t.app.input.focus();
      t.key('Escape');
      expect(t.app.menuBar!.openPopup).toBe('exit');
      expect(t.onEscape).not.toHaveBeenCalled();
      expect(t.app.menuBar!.popupEl!.querySelector('.wc-pop-warn')).toBeNull();
    } finally {
      delete (document as { fullscreenElement?: unknown }).fullscreenElement;
    }
  });

  it('without the bar, #panes, #exit, #profile, #scripts and #settings open the ESC menu at their frame', () => {
    const t = setup({ bar: false });
    t.enter('#panes');
    t.enter('#exit');
    t.enter('#profile');
    t.enter('#scripts');
    t.enter('#settings');
    expect(t.openMenuAt.mock.calls.map((c) => c[0])).toEqual(['panes', 'exit', 'profile', 'scripts', 'settings']);
  });

  it('with the bar but no window or popup handlers, the commands say they are not available', () => {
    const t = setup();
    const said: string[] = [];
    t.app.bus.on('sys.message', (m) => said.push(m.text));
    t.enter('#profile');
    t.enter('#settings');
    expect(said).toEqual(['#profile is not available here.', '#settings is not available here.']);
  });

  it('#fullscreen says so where the browser has none', () => {
    const t = setup();
    const said: string[] = [];
    t.app.bus.on('sys.message', (m) => said.push(m.text));
    t.enter('#fullscreen');
    expect(said).toEqual(['Fullscreen is not available in this browser.']);
  });

  it('without the shell, the commands say they are not available', () => {
    const t = setup(null);
    const said: string[] = [];
    t.app.bus.on('sys.message', (m) => said.push(m.text));
    t.enter('#profile');
    t.enter('#panes');
    expect(said).toEqual(['#profile is not available here.', '#panes is not available here.']);
  });

  it('shows Disconnected after a live drop; its button and Enter reconnect', () => {
    const t = setup();
    const notice = t.app.menuBar!.notice;
    t.app.connectLive();
    t.sockets[0]!.open();
    expect(notice.hidden).toBe(true);
    t.sockets[0]!.drop();
    expect(t.app.status.get().conn).toBe('disconnected');
    expect(notice.hidden).toBe(false);
    notice.querySelector<HTMLButtonElement>('.wc-mb-rc')!.click();
    expect(t.sockets).toHaveLength(2);
    expect(notice.hidden).toBe(true);
    t.sockets[1]!.open();
    // A user disconnect shows it too, and Enter reconnects from it (spec §2.2).
    t.enter('#disconnect');
    expect(notice.hidden).toBe(false);
    t.enter('look');
    expect(t.sockets).toHaveLength(3);
    expect(notice.hidden).toBe(true);
  });

  it('shows no notice after a replay', () => {
    const t = setup();
    t.app.startReplay('hello\n', 'test.log', 0);
    t.app.session.disconnect();
    expect(t.app.menuBar!.notice.hidden).toBe(true);
  });
});
