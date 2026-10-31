// @vitest-environment happy-dom
// The menu bar in the real App (ADR 0099, ADR 0100): it replaces the clock
// strip with `ui.bar`, Esc in the input closes its popup before the ESC
// menu, the `#profile` … commands, and the Disconnected notice.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, type AppUi } from '../../src/app/app';
import { FakeSocket } from './net-helpers';
import { CLOCK_CELLS, barCells } from '../../src/menubar/menubar';

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
    ...(ui ? { ui: { bar: true, openMenuAt, exit, ...ui } } : {}),
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
    expect(t.app.cockpit.barCells).toBe(CLOCK_CELLS);
  });

  it('Esc in the input closes the open popup first, then opens the ESC menu', () => {
    const t = setup();
    t.app.input.focus();
    t.app.menuBar!.open('panes');
    t.key('Escape');
    expect(t.app.menuBar!.openPopup).toBeNull();
    expect(t.onEscape).not.toHaveBeenCalled();
    t.key('Escape');
    expect(t.onEscape).toHaveBeenCalledOnce();
  });

  it('#panes and #exit toggle the popups; #profile, #scripts, #settings open the menu at a frame', () => {
    const t = setup();
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
    expect(t.openMenuAt.mock.calls.map((c) => c[0])).toEqual(['profile', 'scripts', 'settings']);
    // The full name is needed: #pa stays tt++'s #parse (inert), #pro #prompt.
    t.enter('#pa');
    t.enter('#prof');
    expect(t.openMenuAt).toHaveBeenCalledTimes(3);
  });

  it('the bar’s Profile, Scripts and Settings open the menu at a frame; Exit exits', async () => {
    const t = setup();
    const btn = (id: string) => t.app.menuBar!.bar.querySelector<HTMLButtonElement>(`[data-mb="${id}"]`)!;
    btn('profile').click();
    btn('scripts').click();
    btn('settings').click();
    expect(t.openMenuAt.mock.calls.map((c) => c[0])).toEqual(['profile', 'scripts', 'settings']);
    btn('exit').click();
    t.app.menuBar!.popupEl!.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(t.exit).toHaveBeenCalledOnce();
  });

  it('with windows (ADR 0103): the bar and #profile / #scripts toggle them; Esc reaches the topmost window before the menu', () => {
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
    // Esc: the popup, then the window, then the menu.
    t.app.input.focus();
    t.app.menuBar!.open('panes');
    t.key('Escape');
    expect(escapeWindow).not.toHaveBeenCalled();
    t.key('Escape');
    expect(escapeWindow).toHaveBeenCalledOnce();
    expect(t.onEscape).not.toHaveBeenCalled();
    open = false;
    t.key('Escape');
    expect(t.onEscape).toHaveBeenCalledOnce();
    // The Exit popup warns about the window's unsaved changes.
    t.enter('#exit');
    expect(t.app.menuBar!.popupEl!.querySelector('.wc-pop-warn')!.textContent).toBe(
      'Unsaved changes in an open window will be lost.',
    );
  });

  it('in fullscreen, Esc with nothing open opens the Exit popup instead of the menu (ADR 0103)', () => {
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

  it('without the bar, #panes and #exit open the ESC menu at their frame', () => {
    const t = setup({ bar: false });
    t.enter('#panes');
    t.enter('#exit');
    expect(t.openMenuAt.mock.calls.map((c) => c[0])).toEqual(['panes', 'exit']);
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
