// @vitest-environment happy-dom
// Stage 55a: the phone layer over a replay (`PhoneLayerDeps.replay`): what
// it leaves out, the strip's omitted pages, the state it takes over and
// tells (the player rebuilds the App, and the layer, on a backward seek),
// and that it writes only to the store it was handed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_KIT } from '../../src/app/phone-kit';
import { setDeviceForTest } from '../../src/core/device';
import { GameState } from '../../src/gmcp/state';
import { Cockpit } from '../../src/layout/cockpit';
import { GAME_KEEP_ROWS } from '../../src/layout/phone-game';
import { type PhoneControls, type PhoneReplay, type PhoneReplayLayer, type PhoneReplayState, mountPhoneLayer } from '../../src/phone';
import { SettingsStore } from '../../src/settings';

const CELL = { w: 9, h: 17 };
const W = 390;
const H = 760;
const ROWS = Math.floor(H / CELL.h);

const cleanup: (() => void)[] = [];

function mount(o: { replay?: Partial<PhoneReplay>; bar?: boolean; settings?: SettingsStore; size?: { width: number; height: number } } = {}) {
  const size = o.size ?? { width: W, height: H };
  const root = document.createElement('div');
  document.body.append(root);
  // The cockpit's own settings (in the player: the App's, rebuilt with it), and the layer's (the host's).
  const cockpitSettings = new SettingsStore({ factory: null, storage: null, win: null });
  const settings = o.settings ?? new SettingsStore({ factory: null, storage: null, win: null });
  const frames: (() => void)[] = [];
  const cockpit = new Cockpit({
    root,
    settings: cockpitSettings,
    cells: { get: () => CELL, subscribe: () => () => {} },
    requestFrame: (cb) => frames.push(cb),
    phoneGame: true,
    phoneReplay: { bar: o.bar ?? true },
  });
  Object.defineProperty(cockpit.el, 'clientWidth', { get: () => size.width, configurable: true });
  Object.defineProperty(cockpit.el, 'clientHeight', { get: () => size.height, configurable: true });
  const flush = (): void => {
    for (let i = 0; i < 20 && frames.length; i++) for (const f of frames.splice(0)) f();
  };
  cockpit.relayoutNow();
  const told: PhoneReplayState[] = [];
  const writes: unknown[] = [];
  settings.subscribe((next) => writes.push(next));
  const load = vi.spyOn(settings, 'load');
  const layer: PhoneReplayLayer = mountPhoneLayer({
    kit: PHONE_KIT,
    controls: {} as PhoneControls,
    cockpit,
    game: new GameState({ storage: null }),
    cells: { get: () => CELL },
    settings,
    replay: { omitPages: ['statistics'], onState: (s) => told.push(s), ...o.replay },
  });
  flush();
  cleanup.push(() => {
    layer.dispose();
    cockpit.dispose();
  });
  const key = (name: 'panes' | 'comm' | 'fullscreen'): HTMLButtonElement | null => layer.el.querySelector<HTMLButtonElement>(`.wc-ph-sat[data-sat="${name}"]`);
  const tap = (name: 'panes' | 'comm'): void => {
    key(name)!.click();
    flush();
  };
  return { layer, cockpit, settings, cockpitSettings, flush, told, writes, load, key, tap };
}

beforeEach(() => setDeviceForTest({ touch: true, phone: true }));

afterEach(() => {
  for (const fn of cleanup.splice(0)) fn();
  setDeviceForTest({ touch: false, phone: false });
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('the phone layer over a replay: what is not mounted', () => {
  it('no compass, hot keys, keyboard, menu, menu keys or fullscreen key; the lens, the strip and the bands are there', () => {
    const request = vi.fn(() => Promise.reject(new Error('no')));
    Object.defineProperty(window.navigator, 'wakeLock', { value: { request }, configurable: true });
    cleanup.push(() => delete (window.navigator as unknown as { wakeLock?: unknown }).wakeLock);
    const h = mount();
    const c = h.cockpit.el;
    expect(c.querySelector('.wc-ph-layer')).toBe(h.layer.el);
    for (const gone of ['.wc-ph-pad', '.wc-ph-key', '.wc-ph-hot', '.wc-ph-hk', '.wc-ph-rb', '.wc-ph-okb', '.wc-ph-menu', '.wc-ph-menu-rescue', '.wc-ph-menu-host', '.wc-menu-btn']) {
      expect(c.querySelector(gone), gone).toBeNull();
    }
    expect(h.layer.menu).toBeNull();
    expect(h.layer.menuKey).toBeNull();
    expect(h.layer.rescueKey).toBeNull();
    expect(h.layer.ownKeyboardOpen).toBe(false);
    expect(h.layer.loginArmed).toBe(false);
    expect(h.key('fullscreen')).toBeNull();
    expect(h.key('panes')).not.toBeNull();
    expect(h.key('comm')).not.toBeNull();
    for (const there of ['.wc-ph-lens', '.wc-ph-satrow', '.wc-ph-strip', '.wc-ph-strip-band', '.wc-ph-comm-band', '.wc-ph-side-band', '.wc-ph-fight']) {
      expect(h.layer.el.querySelector(there), there).not.toBeNull();
    }
    // The screen is not kept on, and the page is not marked for a keyboard of ours.
    expect(request).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains('wc-okb')).toBe(false);
    // A key's command goes nowhere (there is no one to send to).
    expect(() => h.layer.send('north')).not.toThrow();
  });

  it('Comm is read-only: no reply line, no search key', () => {
    const h = mount();
    // (The pane's root is put on the page by its first draw: read from the pane itself.)
    const comm = (h.cockpit.pane('comm') as unknown as { root: HTMLElement }).root;
    expect(comm.hasAttribute('data-phone')).toBe(true);
    expect(comm.hasAttribute('data-readonly')).toBe(true);
    expect(comm.querySelector<HTMLElement>('.wc-cm-sbtn')!.hidden).toBe(true);
    expect(comm.querySelector<HTMLElement>('.wc-cm-reply')!.hidden).toBe(true);
  });

  it('the mount loads nothing and writes nothing: no one-time phone defaults, on a store that would get them', () => {
    const h = mount();
    return Promise.resolve().then(() => {
      expect(h.load).not.toHaveBeenCalled();
      expect(h.writes).toEqual([]);
    });
  });

  it('nothing at the bottom right limits the layout: Comm may take every row but the game text\'s', () => {
    const h = mount({ bar: false });
    h.settings.update({ phone: { commRows: 99 } });
    h.tap('comm');
    const g = h.cockpit.phoneGameLayout!;
    // In the live game the place of three hot keys caps it far above this (`setPhoneLimit`).
    expect(g.comm.h).toBe(ROWS - GAME_KEEP_ROWS);
    expect(g.overLimit).toBe(false);
  });

  it('landscape: the lens stands at the right edge, where the live game keeps the hot key columns', () => {
    const h = mount({ size: { width: 800, height: 360 } });
    const g = h.cockpit.phoneGameLayout!;
    expect(g.landscape).toBe(true);
    expect(g.lens).not.toBeNull();
    // 12 px of air: two columns of 9 px cells.
    expect(g.lens!.x + g.lens!.w).toBe(g.cols - 2);
  });
});

describe('the phone layer over a replay: the strip\'s pages', () => {
  it('leaves out the panes in omitPages, whatever the setting says', () => {
    const h = mount();
    h.settings.update((d) => {
      d.phone.strip.panes = d.phone.strip.panes.map((e) => ({ ...e, on: true }));
    });
    h.flush();
    expect(h.settings.get().phone.strip.panes.some((e) => e.id === 'statistics' && e.on)).toBe(true);
    const seen: (string | null)[] = [];
    h.tap('panes');
    seen.push(h.cockpit.phoneStrip);
    for (let i = 0; i < 5; i++) {
      (h.layer as unknown as { stepStrip(step: 1): void }).stepStrip(1);
      h.flush();
      if (h.cockpit.phoneStrip !== seen[seen.length - 1]) seen.push(h.cockpit.phoneStrip);
    }
    expect(seen).toEqual(['timers', 'group', 'character']);
    // Ctrl/Alt+4 would be Statistics in the game: there is no fourth page.
    expect(h.cockpit.selectTabAt(3)).toBe(false);
  });

  it('with every page omitted there is no panes key to tap', () => {
    const h = mount({ replay: { omitPages: ['timers', 'group', 'character', 'statistics'] } });
    expect(h.key('panes')!.hidden).toBe(true);
    h.tap('panes');
    expect(h.cockpit.phoneStrip).toBeNull();
    expect(h.told).toEqual([]);
  });
});

describe('the phone layer over a replay: state over a rebuild', () => {
  it('starts closed at the lens\'s "Opens at", and tells each change with the whole state', () => {
    const h = mount();
    expect(h.layer.state).toEqual({ stripOpen: false, stripPage: null, commOpen: false, lensLevel: 'z1' });
    expect(h.told).toEqual([]);
    h.tap('panes');
    expect(h.told).toEqual([{ stripOpen: true, stripPage: 'timers', commOpen: false, lensLevel: 'z1' }]);
    h.tap('comm');
    expect(h.told[1]).toEqual({ stripOpen: true, stripPage: 'timers', commOpen: true, lensLevel: 'z1' });
    (h.layer as unknown as { stepStrip(step: 1): void }).stepStrip(1);
    expect(h.told[2]).toEqual({ stripOpen: true, stripPage: 'group', commOpen: true, lensLevel: 'z1' });
    // A tap on the glass steps the zoom (a click with no pointer of its own).
    h.layer.el.querySelector<HTMLButtonElement>('.wc-ph-lens-glass')!.click();
    expect(h.told[3]).toEqual({ stripOpen: true, stripPage: 'group', commOpen: true, lensLevel: 'z2' });
    // Closed, the strip keeps its page.
    h.tap('panes');
    expect(h.told[4]).toEqual({ stripOpen: false, stripPage: 'group', commOpen: true, lensLevel: 'z2' });
    expect(h.told).toHaveLength(5);
    // None of it was a settings write.
    expect(h.writes).toEqual([]);
  });

  it('a new layer takes the state over: the strip on its page, Comm open, the zoom level; and tells nothing', () => {
    const state: PhoneReplayState = { stripOpen: true, stripPage: 'group', commOpen: true, lensLevel: 'z3' };
    const h = mount({ replay: { state } });
    expect(h.layer.state).toEqual(state);
    expect(h.told).toEqual([]);
    expect(h.cockpit.phoneStrip).toBe('group');
    const g = h.cockpit.phoneGameLayout!;
    expect(g.strip.h).toBeGreaterThan(0);
    expect(g.comm.h).toBeGreaterThan(0);
    expect(h.cockpit.pane('group').visible).toBe(true);
    expect(h.cockpit.pane('comm').visible).toBe(true);
    expect(h.layer.el.querySelector<HTMLElement>('.wc-ph-lens')!.dataset.level).toBe('z3');
    expect(h.key('panes')!.classList.contains('is-on')).toBe(true);
    expect(h.key('comm')!.classList.contains('is-on')).toBe(true);
    // The next change is told from there.
    h.tap('comm');
    expect(h.told).toEqual([{ ...state, commOpen: false }]);
  });

  it('a closed strip keeps the page it had: the panes key opens it there', () => {
    const h = mount({ replay: { state: { stripOpen: false, stripPage: 'group', commOpen: false, lensLevel: 'z1' } } });
    expect(h.cockpit.phoneStrip).toBeNull();
    expect(h.told).toEqual([]);
    h.tap('panes');
    expect(h.cockpit.phoneStrip).toBe('group');
  });

  it('a page that is no longer one of the strip\'s is passed over, and the host is told what stands', () => {
    const h = mount({ replay: { state: { stripOpen: true, stripPage: 'statistics', commOpen: true, lensLevel: 'z9' as never } } });
    expect(h.cockpit.phoneStrip).toBeNull();
    expect(h.layer.state).toEqual({ stripOpen: false, stripPage: null, commOpen: true, lensLevel: 'z1' });
    expect(h.told).toEqual([{ stripOpen: false, stripPage: null, commOpen: true, lensLevel: 'z1' }]);
  });

  it('the round trip: what one layer told mounts the next one the same, on the same store', () => {
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    const a = mount({ settings });
    a.tap('panes');
    a.tap('comm');
    a.layer.el.querySelector<HTMLButtonElement>('.wc-ph-lens-glass')!.click();
    const last = a.told[a.told.length - 1]!;
    // The host's store carries what a drag wrote (a band's height, a moved lens).
    settings.update({ phone: { stripRows: 7, commRows: 9, lens: { portrait: { x: 0.3, y: 0.4, size: 120 } } } });
    a.flush();
    const before = a.cockpit.phoneGameLayout!;
    expect([before.strip.h, before.comm.h]).toEqual([7, 9]);
    a.layer.dispose();
    const b = mount({ settings, replay: { state: last } });
    expect(b.layer.state).toEqual(last);
    const g = b.cockpit.phoneGameLayout!;
    expect([g.strip.h, g.comm.h]).toEqual([7, 9]);
    expect(g.lensAt).not.toBeNull();
    expect(g.lensPx).toBe(120);
    expect(b.told).toEqual([]);
  });
});

describe('the phone layer over a replay: the store it was handed', () => {
  it('reads its sizes from that store, not from the cockpit\'s own settings', () => {
    const h = mount();
    h.cockpitSettings.update({ phone: { commRows: 20 } });
    h.settings.update({ phone: { commRows: 12 } });
    h.tap('comm');
    expect(h.cockpit.phoneGameLayout!.comm.h).toBe(12);
  });

  it('a dropped lens is written there and nowhere else', () => {
    const h = mount();
    const other: unknown[] = [];
    h.cockpitSettings.subscribe((s) => other.push(s));
    const l = h.layer as unknown as {
      dragLens(kind: 'move' | 'size', x0: number, y0: number, x: number, y: number): void;
      dropLens(kind: 'move' | 'size' | null, cancelled: boolean): void;
    };
    Object.defineProperty(h.layer.el, 'clientWidth', { get: () => W, configurable: true });
    Object.defineProperty(h.layer.el, 'clientHeight', { get: () => H, configurable: true });
    l.dragLens('move', 300, 100, 200, 300);
    l.dropLens('move', false);
    h.flush();
    const want = h.settings.get().phone.lens.portrait;
    expect(want.x).not.toBeNull();
    expect(want.y).not.toBeNull();
    expect(other).toEqual([]);
    expect(h.cockpitSettings.get().phone.lens.portrait.x).toBeNull();
    // With no keys at the bottom right the lens may be dropped there: its box reaches the corner's air.
    l.dragLens('move', 0, 0, 2000, 2000);
    l.dropLens('move', false);
    h.flush();
    const g = h.cockpit.phoneGameLayout!;
    const size = g.lensPx;
    expect(g.lensAt!.left + size).toBe(W - 12);
    expect(g.lensAt!.top + size).toBe(g.input.y * CELL.h - 12);
  });
});

describe('the phone layer over a replay: the host\'s chrome (stage 55c, `clear`)', () => {
  it('the lens stands lower and further left by what the host\'s header row and markers take', () => {
    const plain = mount();
    const a = plain.cockpit.phoneGameLayout!.lens!;
    const clear = mount({ replay: { clear: { top: 40, right: 60 } } });
    const b = clear.cockpit.phoneGameLayout!.lens!;
    // 60 px of 9 px cells: at least six columns to the left; (40 + the corner keys' 10) − 16 px of 17 px rows: two rows down.
    expect(a.x - b.x).toBeGreaterThanOrEqual(6);
    expect(b.y - a.y).toBeGreaterThanOrEqual(2);
    expect(b.w).toBe(a.w);
  });
});
