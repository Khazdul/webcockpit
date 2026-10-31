// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppStatusState, AppStatusView } from '../../src/app/status';
import { resetFullscreenRefusal } from '../../src/core/fullscreen';
import { momentSeconds } from '../../src/gmcp/clock';
import { GameState } from '../../src/gmcp/state';
import type { ScriptPaneInfo } from '../../src/layout/cockpit';
import { TEMP_PLACES_KEY } from '../../src/layout/temp-places';
import { PANE_IDS, defaultLayout } from '../../src/layout/types';
import { ExitPopup, ratingFromKey } from '../../src/menubar/exit-popup';
import { MenuBar, type MenuBarActions, barCells } from '../../src/menubar/menubar';
import { paneRows } from '../../src/menubar/panes-popup';
import { TIP_DELAY_MS } from '../../src/menubar/tooltip';
import type { LiveRuns } from '../../src/runs/live';
import { SettingsStore } from '../../src/settings';

const T = 1_790_449_200_000;

function statusView(p: Partial<AppStatusState> = {}): AppStatusView & { set(p: Partial<AppStatusState>): void } {
  let cur: AppStatusState = {
    conn: 'idle',
    replay: false,
    character: '',
    linkMs: null,
    linkSuspect: false,
    capture: '',
    xml: false,
    ...p,
  };
  const fns = new Set<(s: AppStatusState) => void>();
  return {
    get: () => cur,
    subscribe: (fn) => {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    set(q) {
      cur = { ...cur, ...q };
      for (const f of [...fns]) f(cur);
    },
  };
}

function fakeRuns(o: { anchor?: string | null; saved?: number; save?: (r: number) => Promise<void> } = {}) {
  const saveChain = vi.fn(o.save ?? (async () => {}));
  const runs = {
    anchor: () => (o.anchor === undefined ? 'run-1' : o.anchor),
    chain: async () => (o.saved === undefined ? null : { saved: true, rating: o.saved }),
    saveChain,
  };
  return { runs: runs as unknown as LiveRuns, saveChain };
}

function setup(opts: { runs?: LiveRuns; fullscreen?: boolean } = {}) {
  document.body.replaceChildren();
  if (opts.fullscreen) Object.assign(document.documentElement, { requestFullscreen: vi.fn(() => Promise.resolve()) });
  const row = document.createElement('div');
  row.className = 'wc-input';
  const input = document.createElement('input');
  const clockEl = document.createElement('span');
  clockEl.className = 'wc-input-clock';
  row.append(input, clockEl);
  const layer = document.createElement('div');
  layer.append(row);
  document.body.append(layer);
  let now = T + 300;
  const game = new GameState({ now: () => now });
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const status = statusView();
  let panes: ScriptPaneInfo[] = [];
  const paneFns = new Set<() => void>();
  const scriptPanes = {
    list: () => panes,
    subscribe: (fn: () => void) => {
      paneFns.add(fn);
      return () => paneFns.delete(fn);
    },
  };
  const setPanes = (p: ScriptPaneInfo[]) => {
    panes = p;
    for (const f of [...paneFns]) f();
  };
  const actions: { [K in keyof MenuBarActions]: ReturnType<typeof vi.fn> } = {
    profile: vi.fn(),
    scripts: vi.fn(),
    settings: vi.fn(),
    exit: vi.fn(),
    reconnect: vi.fn(),
  };
  const focusInput = vi.fn(() => input.focus());
  const cells: number[] = [];
  const bar = new MenuBar({
    clockEl,
    layer,
    game,
    settings,
    status,
    runs: opts.runs,
    scriptPanes,
    focusInput,
    actions: actions as unknown as MenuBarActions,
    now: () => now,
    onCells: (n) => cells.push(n),
  });
  const btn = (id: string) => bar.bar.querySelector<HTMLButtonElement>(`[data-mb="${id}"]`);
  const tip = (el: HTMLElement) => {
    bar.tooltip.show(el);
    return bar.tooltip.el.hidden ? null : bar.tooltip.el.textContent;
  };
  const key = (target: HTMLElement, k: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  return { bar, row, input, clockEl, layer, game, settings, status, setPanes, actions, focusInput, btn, tip, key, cells, setNow: (n: number) => (now = n) };
}

afterEach(() => {
  delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
  resetFullscreenRefusal();
  vi.useRealTimers();
});

describe('menu bar layout', () => {
  it('takes the clock strip’s place: clock, dot | four icons | exit', () => {
    const t = setup();
    expect(t.row.lastElementChild).toBe(t.bar.el);
    expect(t.bar.bar.firstElementChild).toBe(t.clockEl);
    const parts = [...t.bar.bar.children].map((e) => (e as HTMLElement).dataset.mb ?? e.className);
    expect(parts).toEqual([
      'wc-input-clock wc-mb-clock',
      'wc-mb-dotw',
      'wc-mb-sep',
      'profile',
      'scripts',
      'panes',
      'settings',
      'wc-mb-sep',
      'exit',
    ]);
    expect(t.bar.bar.style.width).toBe(`calc(${barCells(false)} * var(--cell-w))`);
    expect(t.clockEl.querySelector('svg.wc-clock-svg')).not.toBeNull();
  });

  it('is a whole number of cells wide, with or without fullscreen', () => {
    expect(barCells(true)).toBe(26);
    expect(barCells(false)).toBe(24);
    expect(Number.isInteger(barCells(false))).toBe(true);
  });

  it('has a fullscreen button where the browser has page fullscreen, dropped on a refusal', async () => {
    vi.useFakeTimers();
    const t = setup({ fullscreen: true });
    const fs = t.btn('fullscreen')!;
    expect(fs).not.toBeNull();
    expect(fs.previousElementSibling?.className).toBe('wc-mb-sep');
    expect(t.bar.bar.style.width).toBe(`calc(${barCells(true)} * var(--cell-w))`);
    expect(t.tip(fs)).toBe('Fullscreen');
    fs.click();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.btn('fullscreen')).toBeNull();
    expect(t.bar.bar.style.width).toBe(`calc(${barCells(false)} * var(--cell-w))`);
    // The cockpit is told each width: it decides the input row's case (ADR 0102).
    expect(t.cells).toEqual([barCells(true), barCells(false)]);
  });

  it('never takes the focus on a mouse down', () => {
    const t = setup();
    t.input.focus();
    for (const id of ['profile', 'panes', 'exit']) {
      const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      t.btn(id)!.dispatchEvent(e);
      expect(e.defaultPrevented, id).toBe(true);
    }
    expect(document.activeElement).toBe(t.input);
  });

  it('marks a light terminal so the greys flip', () => {
    const t = setup();
    expect(t.bar.el.hasAttribute('data-light')).toBe(false);
    t.settings.update({ appearance: { bg: '#f4ecd8' } });
    expect(t.bar.el.hasAttribute('data-light')).toBe(true);
  });

  it('sends Profile, Scripts and Settings out of the bar', () => {
    const t = setup();
    t.btn('profile')!.click();
    t.btn('scripts')!.click();
    t.btn('settings')!.click();
    expect(t.actions.profile).toHaveBeenCalledOnce();
    expect(t.actions.scripts).toHaveBeenCalledOnce();
    expect(t.actions.settings).toHaveBeenCalledOnce();
  });
});

describe('menu bar tooltips', () => {
  it('names each button and follows the profile live', () => {
    const t = setup();
    expect(t.tip(t.btn('profile')!)).toBe('Profile: default');
    t.settings.update({ profile: 'scout' });
    expect(t.bar.tooltip.el.textContent).toBe('Profile: scout');
    expect(t.tip(t.btn('scripts')!)).toBe('Scripts');
    expect(t.tip(t.btn('panes')!)).toBe('Panes');
    expect(t.tip(t.btn('settings')!)).toBe('Settings');
    expect(t.tip(t.btn('exit')!)).toBe('Exit to main menu');
  });

  it('shows after the hover delay and hides on leave and on a press', () => {
    vi.useFakeTimers();
    const t = setup();
    const b = t.btn('exit')!;
    b.dispatchEvent(new Event('pointerenter'));
    expect(t.bar.tooltip.el.hidden).toBe(true);
    vi.advanceTimersByTime(TIP_DELAY_MS);
    expect(t.bar.tooltip.el.hidden).toBe(false);
    b.dispatchEvent(new Event('pointerleave'));
    expect(t.bar.tooltip.el.hidden).toBe(true);
    b.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(TIP_DELAY_MS);
    b.dispatchEvent(new Event('pointerdown'));
    expect(t.bar.tooltip.el.hidden).toBe(true);
  });

  it('counts the clock down live, with the capture state while the dot is hidden', () => {
    const t = setup();
    expect(t.tip(t.clockEl)).toBe('Game clock unknown: type time');
    // 19:55 in Astron: 5 game minutes (real seconds) to the night.
    t.game.clock.state = {
      epoch: Math.floor(T / 1000) - momentSeconds(2973, 3, 12, 19, 55),
      precision: 'minute',
      lastSync: T / 1000,
      reason: 't',
    };
    t.bar.clock.update();
    expect(t.bar.tooltip.el.textContent).toBe('Night in 0:04');
    t.setNow(T + 1300);
    t.bar.clock.update();
    expect(t.bar.tooltip.el.textContent).toBe('Night in 0:03');
    t.status.set({ capture: 'capture: recording' });
    expect(t.bar.tooltip.el.textContent).toBe('Night in 0:03 · capture: recording');
  });

  it('does not show a popup button’s tooltip while its popup is open', () => {
    const t = setup();
    t.bar.open('panes');
    expect(t.tip(t.btn('panes')!)).toBeNull();
    expect(t.tip(t.btn('exit')!)).toBe('Exit to main menu');
  });
});

describe('link dot and Disconnected notice', () => {
  const dot = (t: ReturnType<typeof setup>) => t.bar.bar.querySelector<HTMLElement>('.wc-mb-dot')!;

  it('stays hidden on a good link and turns red with no RTT 10 s after login', () => {
    vi.useFakeTimers();
    const t = setup();
    t.status.set({ conn: 'connecting' });
    t.status.set({ conn: 'login' });
    expect(dot(t).hidden).toBe(true);
    vi.advanceTimersByTime(9999);
    expect(dot(t).hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(dot(t).hidden).toBe(false);
    expect(dot(t).dataset.state).toBe('broken');
    expect(t.tip(t.bar.bar.querySelector<HTMLElement>('.wc-mb-dotw')!)).toBe('Link: — · unknown');
    t.status.set({ linkMs: 40 });
    expect(dot(t).hidden).toBe(true);
    expect(t.bar.tooltip.el.hidden).toBe(true);
  });

  it('turns yellow while lagging, with the capture state in its tooltip', () => {
    const t = setup();
    t.status.set({ conn: 'connecting' });
    t.status.set({ conn: 'playing', linkMs: 38, capture: 'capture: recording' });
    t.status.set({ linkMs: 1800, linkSuspect: true });
    expect(dot(t).dataset.state).toBe('lagging');
    expect(t.tip(t.bar.bar.querySelector<HTMLElement>('.wc-mb-dotw')!)).toBe('Link: 1.8s · lagging · capture: recording');
    // With the dot showing, the clock's tooltip leaves the capture out.
    expect(t.tip(t.clockEl)).toBe('Game clock unknown: type time');
  });

  it('turns red and shows the notice after a live drop, until the next connection starts', () => {
    const t = setup();
    const notice = t.bar.notice;
    expect(notice.hidden).toBe(true);
    t.status.set({ conn: 'connecting' });
    t.status.set({ conn: 'playing', linkMs: 38 });
    t.status.set({ conn: 'disconnected' });
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe('DisconnectedReconnect Enter');
    expect(dot(t).dataset.state).toBe('broken');
    expect(t.tip(t.bar.bar.querySelector<HTMLElement>('.wc-mb-dotw')!)).toBe('Link: broken');
    const rc = notice.querySelector<HTMLButtonElement>('.wc-mb-rc')!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    rc.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    rc.click();
    expect(t.actions.reconnect).toHaveBeenCalledOnce();
    t.status.set({ conn: 'connecting', linkMs: null });
    expect(notice.hidden).toBe(true);
    expect(dot(t).hidden).toBe(true);
  });

  it('never shows the dot or the notice for a replay', () => {
    vi.useFakeTimers();
    const t = setup();
    t.status.set({ replay: true });
    t.status.set({ conn: 'connecting' });
    t.status.set({ conn: 'playing' });
    vi.advanceTimersByTime(20_000);
    expect(dot(t).hidden).toBe(true);
    t.status.set({ conn: 'disconnected', replay: false });
    expect(dot(t).hidden).toBe(true);
    expect(t.bar.notice.hidden).toBe(true);
  });
});

describe('bar popups', () => {
  it('toggles on its icon, one at a time', () => {
    const t = setup();
    t.btn('panes')!.click();
    expect(t.bar.openPopup).toBe('panes');
    expect(t.btn('panes')!.classList.contains('is-open')).toBe(true);
    expect(t.layer.querySelector('.wc-pop-panes')).not.toBeNull();
    t.btn('exit')!.click();
    expect(t.bar.openPopup).toBe('exit');
    expect(t.layer.querySelector('.wc-pop-panes')).toBeNull();
    expect(t.btn('panes')!.classList.contains('is-open')).toBe(false);
    t.btn('exit')!.click();
    expect(t.bar.openPopup).toBeNull();
    expect(t.layer.querySelector('.wc-pop')).toBeNull();
  });

  it('closes when a button leaves the bar', () => {
    const t = setup();
    t.bar.open('panes');
    t.btn('settings')!.click();
    expect(t.bar.openPopup).toBeNull();
    expect(t.actions.settings).toHaveBeenCalledOnce();
  });

  it('reports whether it closed one, and gives the input the focus back on request', () => {
    const t = setup();
    expect(t.bar.closePopup()).toBe(false);
    t.bar.open('panes');
    expect(t.bar.closePopup(true)).toBe(true);
    expect(t.focusInput).toHaveBeenCalledOnce();
    t.bar.open('panes');
    t.bar.reset();
    expect(t.bar.openPopup).toBeNull();
  });

  it('marks the popup as owning its keys; the Exit popup takes the focus, Panes does not', () => {
    const t = setup();
    t.input.focus();
    t.bar.open('panes');
    expect(t.bar.popupEl!.hasAttribute('data-wc-own-keys')).toBe(true);
    expect(document.activeElement).toBe(t.input);
    // A click in it gives it the keys.
    t.bar.popupEl!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(t.bar.popupEl);
    t.key(t.bar.popupEl!, 'Escape');
    expect(t.bar.openPopup).toBeNull();
    expect(document.activeElement).toBe(t.input);
    t.bar.open('exit');
    expect(document.activeElement).toBe(t.bar.popupEl);
    t.key(t.bar.popupEl!, 'Escape');
    expect(t.bar.openPopup).toBeNull();
    expect(document.activeElement).toBe(t.input);
  });

  it('closes the Panes popup on its X', () => {
    const t = setup();
    t.bar.open('panes');
    t.bar.popupEl!.querySelector<HTMLButtonElement>('.wc-pop-x')!.click();
    expect(t.bar.openPopup).toBeNull();
    expect(t.focusInput).toHaveBeenCalled();
  });
});

describe('Panes popup', () => {
  const labels = (t: ReturnType<typeof setup>) =>
    [...t.bar.popupEl!.querySelectorAll('.wc-pop-list > *')].map((e) => e.textContent);
  const row = (t: ReturnType<typeof setup>, id: string) =>
    t.bar.popupEl!.querySelector<HTMLButtonElement>(`.wc-pop-row[data-pane="${id}"]`)!;

  it('lists the built-in panes, then the running script panes', () => {
    expect(paneRows([]).map((r) => r.id)).toEqual([...PANE_IDS]);
    const t = setup();
    t.bar.open('panes');
    expect(labels(t)).toEqual(['Character', 'Timers', 'Group', 'Comm', 'UI', 'Map']);
    t.setPanes([{ id: 'keymanager/keys', script: 'keymanager', title: 'Keys' }]);
    expect(labels(t)).toEqual(['Character', 'Timers', 'Group', 'Comm', 'UI', 'Map', 'Script panes', 'Keys keymanager']);
  });

  it('shows and hides a pane, following the store while open', () => {
    const t = setup();
    t.bar.open('panes');
    const on = () => t.settings.get().panes.comm.on;
    const was = on();
    expect(row(t, 'comm').getAttribute('aria-pressed')).toBe(String(was));
    row(t, 'comm').click();
    expect(on()).toBe(!was);
    expect(row(t, 'comm').getAttribute('aria-pressed')).toBe(String(!was));
    expect(row(t, 'comm').querySelector('.wc-pop-tg')!.classList.contains('is-on')).toBe(!was);
    t.settings.update((d) => {
      d.panes.comm.on = was;
    });
    expect(row(t, 'comm').getAttribute('aria-pressed')).toBe(String(was));
    // A script pane's row works the same way.
    t.setPanes([{ id: 'keymanager/keys', script: 'keymanager', title: 'Keys' }]);
    row(t, 'keymanager/keys').click();
    expect((t.settings.get().panes as Record<string, { on: boolean }>)['keymanager/keys']!.on).toBe(false);
  });

  it('keeps the focused row focused when the rows change', () => {
    const t = setup();
    t.bar.open('panes');
    row(t, 'map').focus();
    t.setPanes([{ id: 'keymanager/keys', script: 'keymanager', title: 'Keys' }]);
    expect(document.activeElement).toBe(row(t, 'map'));
  });

  it('moves between rows with the arrows', () => {
    const t = setup();
    t.bar.open('panes');
    row(t, 'character').focus();
    t.key(row(t, 'character'), 'ArrowDown');
    expect(document.activeElement).toBe(row(t, 'timers'));
    t.key(row(t, 'timers'), 'ArrowUp');
    t.key(row(t, 'character'), 'ArrowUp');
    expect((document.activeElement as HTMLElement).dataset.act).toBe('reset');
  });

  it('resets the layout after an inline confirm', () => {
    const t = setup();
    localStorage.setItem(TEMP_PLACES_KEY, '{"a/~b":[1,2,3,4]}');
    t.settings.update((d) => {
      d.layout.docks.right.lanes = [];
    });
    t.bar.open('panes');
    const foot = () => t.bar.popupEl!.querySelector('.wc-pop-foot')!;
    const act = (a: string) => foot().querySelector<HTMLButtonElement>(`[data-act="${a}"]`)!;
    act('reset').click();
    expect(foot().textContent).toBe('Reset layout?ResetCancel');
    act('reset-no').click();
    expect(foot().textContent).toBe('Reset layout');
    expect(t.settings.get().layout).not.toEqual(defaultLayout());
    act('reset').click();
    // Esc in the confirm cancels it, not the popup.
    t.key(t.bar.popupEl!, 'Escape');
    expect(t.bar.openPopup).toBe('panes');
    expect(foot().textContent).toBe('Reset layout');
    act('reset').click();
    act('reset-yes').click();
    expect(t.settings.get().layout).toEqual(defaultLayout());
    expect(localStorage.getItem(TEMP_PLACES_KEY)).toBeNull();
    expect(foot().textContent).toBe('Reset layout');
  });
});

describe('Exit popup', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('asks without a rating row when there is no run', async () => {
    const t = setup();
    t.bar.open('exit');
    const el = t.bar.popupEl!;
    expect(el.querySelector('.wc-pop-ask')!.textContent).toBe('Exit to main menu?');
    expect(el.querySelector('.wc-pop-stars')).toBeNull();
    expect([...el.querySelectorAll('.wc-pop-btns button')].map((b) => b.textContent)).toEqual(['CancelEsc', 'ExitY']);
    t.key(el, 'n');
    expect(t.actions.exit).not.toHaveBeenCalled();
    t.key(el, 'y');
    await flush();
    expect(t.actions.exit).toHaveBeenCalledOnce();
  });

  it('prefills the saved rating, rates with keys and clicks, and saves before it exits', async () => {
    const { runs, saveChain } = fakeRuns({ saved: 2 });
    const t = setup({ runs });
    t.bar.open('exit');
    await flush();
    const el = t.bar.popupEl!;
    const lit = () => el.querySelectorAll('.wc-pop-star.is-on').length;
    expect(el.querySelector('.wc-pop-note')!.textContent).toBe('Rate & save this run (optional)');
    expect(lit()).toBe(2);
    t.key(el, 'ArrowRight');
    expect(lit()).toBe(3);
    t.key(el, '5');
    t.key(el, 'ArrowLeft');
    expect(lit()).toBe(4);
    t.key(el, '0');
    expect(lit()).toBe(0);
    expect(el.querySelector<HTMLButtonElement>('.wc-pop-clear')!.hidden).toBe(true);
    el.querySelectorAll<HTMLButtonElement>('.wc-pop-star')[2]!.click();
    expect(lit()).toBe(3);
    expect(el.querySelector<HTMLButtonElement>('.wc-pop-clear')!.hidden).toBe(false);
    el.querySelector<HTMLButtonElement>('[data-act="exit"]')!.click();
    await flush();
    expect(saveChain).toHaveBeenCalledWith(3);
    expect(t.actions.exit).toHaveBeenCalledOnce();
  });

  it('a click on clear rates 0; a failed save still exits; Cancel closes', async () => {
    const { runs, saveChain } = fakeRuns({ saved: 4, save: () => Promise.reject(new Error('quota')) });
    const t = setup({ runs });
    t.bar.open('exit');
    await flush();
    const el = t.bar.popupEl!;
    el.querySelector<HTMLButtonElement>('.wc-pop-clear')!.click();
    expect(el.querySelectorAll('.wc-pop-star.is-on')).toHaveLength(0);
    el.querySelector<HTMLButtonElement>('[data-act="cancel"]')!.click();
    expect(t.bar.openPopup).toBeNull();
    t.bar.open('exit');
    t.key(t.bar.popupEl!, 'Y');
    await flush();
    expect(saveChain).toHaveBeenCalledOnce();
    expect(t.actions.exit).toHaveBeenCalledOnce();
  });

  it('does not overwrite a rating chosen before the saved one arrived', async () => {
    let resolve!: (v: unknown) => void;
    const runs = {
      anchor: () => 'r',
      chain: () => new Promise((r) => (resolve = r)),
      saveChain: vi.fn(async () => {}),
    } as unknown as LiveRuns;
    const p = new ExitPopup({ doc: document, runs, exit: vi.fn(), close: vi.fn() });
    p.el.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true }));
    resolve({ saved: true, rating: 1 });
    await flush();
    expect(p.value).toBe(5);
  });

  it('marks the open windows on their toggles (ADR 0103)', () => {
    const t = setup();
    t.bar.markWindows(['scripts']);
    expect(t.btn('scripts')!.classList.contains('is-open')).toBe(true);
    expect(t.btn('profile')!.classList.contains('is-open')).toBe(false);
    t.bar.markWindows([]);
    expect(t.btn('scripts')!.classList.contains('is-open')).toBe(false);
  });

  it('asks for Esc in the cockpit’s fullscreen and gives it back on leaving (ADR 0103)', () => {
    const lock = vi.fn(() => Promise.resolve());
    const unlock = vi.fn();
    Object.defineProperty(navigator, 'keyboard', { configurable: true, value: { lock, unlock } });
    let fs: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fs });
    try {
      const t = setup({ fullscreen: true });
      fs = document.documentElement;
      t.bar.setShown(true);
      expect(lock).toHaveBeenCalledTimes(1);
      expect(lock).toHaveBeenCalledWith(['Escape']);
      // The cockpit hidden (the start page): back to the browser; shown again: asked again.
      t.bar.setShown(false);
      expect(unlock).toHaveBeenCalledTimes(1);
      t.bar.setShown(true);
      expect(lock).toHaveBeenCalledTimes(2);
      // Leaving fullscreen gives it back (every bar of this file listens to the event).
      fs = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(unlock.mock.calls.length).toBeGreaterThanOrEqual(2);
      const n = unlock.mock.calls.length;
      t.bar.dispose();
      expect(unlock).toHaveBeenCalledTimes(n);
    } finally {
      delete (document as { fullscreenElement?: unknown }).fullscreenElement;
      delete (navigator as { keyboard?: unknown }).keyboard;
    }
  });

  it('shows a warning line when asked to (unsaved changes in a window)', () => {
    const p = new ExitPopup({ doc: document, exit: vi.fn(), close: vi.fn(), warning: 'Unsaved!' });
    expect(p.el.querySelector('.wc-pop-warn')!.textContent).toBe('Unsaved!');
    const q = new ExitPopup({ doc: document, exit: vi.fn(), close: vi.fn(), warning: null });
    expect(q.el.querySelector('.wc-pop-warn')).toBeNull();
  });

  it('reads rating keys as the ESC menu does', () => {
    const k = (key: string, mod: Partial<KeyboardEvent> = {}) =>
      ratingFromKey({ key, ctrlKey: false, altKey: false, metaKey: false, ...mod }, 2);
    expect(k('4')).toBe(4);
    expect(k('6')).toBeNull();
    expect(k('ArrowLeft')).toBe(1);
    expect(k('ArrowRight')).toBe(3);
    expect(k('4', { ctrlKey: true })).toBeNull();
  });
});
