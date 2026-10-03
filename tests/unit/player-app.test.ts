// @vitest-environment happy-dom
// Log player with real Apps (ADR 0018): App.dispose leaves nothing behind,
// a player App runs on the replay clock and echoes the recorded commands,
// PlayerHost applies VIEW records (also after a rebuilding seek), maps the
// markers and closes on ESC.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/app';
import { PlayerHost } from '../../src/app/player-host';
import { ReplayClock } from '../../src/player/clock';
import { PlayerSocket } from '../../src/player/socket';
import type { RunEvent } from '../../src/runs/events';
import { SettingsStore, viewSnapshot } from '../../src/settings';
import { movePane } from '../../src/layout/model';
import { resetLayout } from '../../src/player/viewer';
import { BASE_US, FakeWall, makeLog, meta, twoRunChain } from './player-helpers';

type Key = string;
let balance: Map<Key, number>;
const originals: Array<() => void> = [];

/** Counts add/removeEventListener on window and document (listener identity × type × capture). */
function trackListeners(): void {
  balance = new Map();
  const ids = new WeakMap<object, number>();
  let next = 0;
  const id = (fn: unknown): number => {
    if (typeof fn !== 'function' && (typeof fn !== 'object' || fn === null)) return -1;
    let v = ids.get(fn as object);
    if (v === undefined) ids.set(fn as object, (v = ++next));
    return v;
  };
  for (const target of [window, document] as EventTarget[]) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    const name = target === window ? 'w' : 'd';
    const key = (type: string, fn: unknown, o: unknown): Key => {
      const cap = typeof o === 'boolean' ? o : !!(o as { capture?: boolean } | undefined)?.capture;
      return `${name}:${type}:${id(fn)}:${cap}`;
    };
    target.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: unknown) => {
      const k = key(type, fn, o);
      balance.set(k, (balance.get(k) ?? 0) + 1);
      add(type, fn, o as AddEventListenerOptions);
    }) as typeof target.addEventListener;
    target.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: unknown) => {
      const k = key(type, fn, o);
      if (balance.has(k)) balance.set(k, Math.max(0, balance.get(k)! - 1));
      remove(type, fn, o as EventListenerOptions);
    }) as typeof target.removeEventListener;
    originals.push(() => {
      target.addEventListener = add;
      target.removeEventListener = remove;
    });
  }
}

function leaked(): string[] {
  return [...balance.entries()].filter(([, n]) => n > 0).map(([k]) => k);
}

beforeEach(() => {
  document.body.innerHTML = '';
  trackListeners();
});

afterEach(() => {
  for (const r of originals.splice(0)) r();
});

const frames: Array<() => void> = [];
const runFrames = (): void => {
  while (frames.length) frames.shift()!();
};

function playerApp(root: HTMLElement, clock: ReplayClock): App {
  return new App({
    root,
    player: true,
    offline: true,
    scheduler: clock,
    now: () => clock.now(),
    clockUs: () => clock.nowUs(),
    requestFrame: (cb) => frames.push(cb),
    paneRequestFrame: (cb) => frames.push(cb),
  });
}

const enc = new TextEncoder();

describe('App.dispose', () => {
  it('removes its DOM, bus handlers, timers and window/document listeners, repeatedly', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    for (let i = 0; i < 5; i++) {
      const clock = new ReplayClock(BASE_US);
      const app = playerApp(root, clock);
      const sock = new PlayerSocket();
      app.replayOn(sock, 'test');
      sock.data(enc.encode('Hello.\r\n'));
      clock.advanceTo(BASE_US + 5e6);
      runFrames();
      expect(root.querySelectorAll('.wc-app')).toHaveLength(1);
      app.dispose();
      runFrames();
      expect(root.children).toHaveLength(0);
      expect(app.bus.total()).toBe(0);
      expect(clock.size).toBe(0);
      expect(leaked()).toEqual([]);
    }
  });

  it('works for a live App too, and twice is harmless', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new App({ root, recorder: { openStore: () => Promise.reject(new Error('none')), locks: null, win: null } });
    app.dispose();
    app.dispose();
    expect(root.children).toHaveLength(0);
    expect(leaked()).toEqual([]);
  });
});

describe('player App', () => {
  it('stamps lines with log time and echoes replayed commands, but not the width commands', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const clock = new ReplayClock(BASE_US);
    const app = playerApp(root, clock);
    const sock = new PlayerSocket();
    app.replayOn(sock, 'test');
    clock.advanceTo(BASE_US + 1e6);
    sock.data(enc.encode('oO>'));
    sock.data(Uint8Array.from([255, 249])); // IAC GA
    sock.sent('change width all 500');
    sock.sent('look');
    clock.advanceTo(BASE_US + 2e6);
    sock.data(enc.encode('A room.\r\n'));
    runFrames();
    const rows = [...app.output.el.querySelectorAll<HTMLElement>('.wc-rows .wc-row')];
    expect(rows.map((r) => r.textContent)).toEqual(['oO> look', 'A room.']);
    expect(rows.map((r) => r.dataset.ts)).toEqual([String(BASE_US + 1e6), String(BASE_US + 2e6)]);
    // No replay [SYSTEM] lines in a player App.
    expect(app.output.el.textContent).not.toContain('Replaying');
    app.dispose();
  });
});

describe('PlayerHost', () => {
  function chainWithViews() {
    const chain = twoRunChain();
    // A second VIEW in run 1 at 3 s: the Comm header off.
    const extra = makeLog(BASE_US, [{ at: 3.1, view: { comm: { filters: {}, showHeader: false } } }]);
    const lines = chain[0]!.text.split('\n');
    lines.splice(8, 0, extra.trimEnd());
    chain[0]!.text = lines.join('\n');
    return chain;
  }

  function open(events: RunEvent[] = [], hideMs?: number) {
    const root = document.createElement('div');
    root.style.cssText = 'width:1200px;height:800px';
    document.body.appendChild(root);
    const wall = new FakeWall();
    const viewer = new SettingsStore({ factory: null, storage: null, win: null });
    void viewer.load();
    let closed = 0;
    const host = new PlayerHost({ root, settings: viewer, wall, onClose: () => closed++, ...(hideMs !== undefined ? { hideMs } : {}) });
    host.openChain(chainWithViews(), events, { character: 'Rasta', level: 42 });
    return { root, wall, host, viewer, closed: () => closed };
  }

  it('applies VIEW records as they pass, and again after a backward seek', () => {
    const { wall, host } = open();
    const eng = host.engine!;
    eng.pause();
    eng.seek(1500);
    wall.flush();
    const settings = () => (host.app as unknown as { settings: SettingsStore }).settings.get();
    expect(settings().appearance.size).toBe(14);
    expect(settings().comm.showHeader).toBe(true);
    eng.seek(3500);
    wall.flush();
    expect(settings().comm.showHeader).toBe(false);
    eng.seek(1000); // back: a new App from the viewer's settings, VIEWs replayed
    wall.flush();
    expect(eng.buildCount).toBe(2);
    expect(settings().comm.showHeader).toBe(true);
    expect(settings().appearance.size).toBe(14);
    expect(host.el.querySelectorAll('.wc-app')).toHaveLength(1);
    host.dispose();
  });

  it('keeps the viewer overrides over later VIEW records and a backward seek (ADR 0021)', () => {
    const { wall, host } = open();
    const eng = host.engine!;
    eng.pause();
    eng.seek(1500);
    wall.flush();
    const store = () => (host.app as unknown as { settings: SettingsStore }).settings;
    // The viewer drags a pane: the cockpit writes the layout to the App's store.
    store().update((d) => {
      d.layout = movePane(d.layout, 'group', 'left', 0, 0);
    });
    expect(host.viewerOverrides.layout?.docks.left.lanes[0]?.panes.map((p) => p.id)).toEqual(['group']);
    host.setViewer({ ...host.viewerOverrides, font: 'large', theme: 'paper', panes: { comm: false } });
    const check = () => {
      const s = store().get();
      expect(s.appearance.size).toBe(18);
      expect(s.appearance.bg).toBe('#f4ecd8');
      expect(s.panes.timers.color).toBe('black');
      expect(s.panes.comm.on).toBe(false);
      expect(s.layout.docks.left.lanes[0]?.panes.map((p) => p.id)).toEqual(['group']);
    };
    check();
    eng.seek(3500); // past the second VIEW
    wall.flush();
    expect(store().get().comm.showHeader).toBe(false);
    check();
    eng.seek(1000); // back: a new App
    wall.flush();
    expect(eng.buildCount).toBe(2);
    check();
    // Reset: the recorded layout and panes; font and theme stay.
    host.setViewer(resetLayout(host.viewerOverrides));
    expect(store().get().panes.comm.on).toBe(true);
    expect(store().get().layout.docks.left.lanes).toEqual([]);
    expect(store().get().appearance.size).toBe(18);
    // Default theme: the recorded colours again.
    host.setViewer({ ...host.viewerOverrides, theme: 'default', font: 'default' });
    expect(store().get().panes.timers.color).toBe('red');
    expect(store().get().appearance.size).toBe(14);
    host.dispose();
  });

  it('a pane hidden with its close cross stays hidden after a seek, as from the settings', () => {
    const { root, wall, host } = open();
    const eng = host.engine!;
    eng.pause();
    eng.seek(1500);
    wall.flush();
    const store = () => (host.app as unknown as { settings: SettingsStore }).settings;
    expect(store().get().panes.timers.on).toBe(true);
    const cross = [...root.querySelectorAll<HTMLElement>('.wc-pane-close')].find((c) => c.title === 'Hide Timers')!;
    cross.click();
    expect(host.viewerOverrides.panes).toEqual({ timers: false });
    eng.seek(3500); // past the second VIEW
    wall.flush();
    expect(store().get().panes.timers.on).toBe(false);
    eng.seek(1000); // back: a new App
    wall.flush();
    expect(eng.buildCount).toBe(2);
    expect(store().get().panes.timers.on).toBe(false);
    host.dispose();
  });

  it('the gear folds the settings section; its buttons change the overrides', async () => {
    const { root, host } = open();
    host.engine!.pause();
    const view = host.playerView!;
    const gear = root.querySelector<HTMLElement>('.wc-player-gear')!;
    expect(gear.textContent).toBe('⚙');
    const section = root.querySelector<HTMLElement>('.wc-player-settings')!;
    expect(section.hidden).toBe(true);
    gear.click();
    expect(view.settingsShown).toBe(true);
    view.render();
    expect(section.hidden).toBe(false);
    const rows = [...section.children].map((r) => r.textContent!);
    expect(rows.every((r) => r.length === 32)).toBe(true);
    expect(rows[1]).toBe('│ [X] Character  [X] Timers    │');
    section.querySelector<HTMLElement>('[data-pane="timers"]')!.click();
    expect(host.viewerOverrides.panes).toEqual({ timers: false });
    section.querySelector<HTMLElement>('[data-set="font"][data-dir="1"]')!.click();
    section.querySelector<HTMLElement>('[data-set="theme"][data-dir="-1"]')!.click();
    expect(host.viewerOverrides.font).toBe('small');
    expect(host.viewerOverrides.theme).toBe('slate');
    view.render();
    expect(section.querySelector('[data-pane="timers"]')!.textContent).toBe('[ ] Timers');
    expect(section.querySelector('[data-set="theme"][data-value]')!.textContent).toBe(' Slate   ');
    // ESC folds the section first, then leaves.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(view.settingsShown).toBe(false);
    expect(root.querySelector('.wc-player')).not.toBeNull();
    host.dispose();
  });

  it('auto-hides in play with the settings section folded out', async () => {
    const { root, host } = open([], 20);
    expect(host.engine!.playing).toBe(true);
    root.querySelector<HTMLElement>('.wc-player-gear')!.click();
    expect(host.playerView!.settingsShown).toBe(true);
    const chrome = root.querySelector('.wc-player-chrome')!;
    expect(chrome.hasAttribute('data-hidden')).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(chrome.hasAttribute('data-hidden')).toBe(true);
    expect(host.playerView!.settingsShown).toBe(true);
    host.dispose();
  });

  it('shows the header, the markers and closes on ESC', async () => {
    const events: RunEvent[] = [
      { type: 'pkill', us: BASE_US + 3.4e6, logUs: BASE_US + 3e6, name: 'Ibuki', race: 'the Half-Elf', xpDelta: 5 },
      { type: 'level_up', us: BASE_US + 3601e6, level: 43 },
    ];
    const { root, host, closed } = open(events);
    await new Promise((r) => setTimeout(r, 50));
    const chrome = root.querySelector('.wc-player-chrome')!;
    expect(chrome.querySelector('.wc-player-header')!.textContent).toContain('Rasta (L42) · Run 1 of 2 · ');
    const marks = [...chrome.querySelectorAll<HTMLElement>('.wc-player-mark')];
    expect(marks.map((m) => m.textContent)).toEqual(['K►', 'L►']);
    expect(marks.map((m) => Number(m.dataset.offset))).toEqual([2000, 9100]); // the extra VIEW adds 0.1 s before the collapsed gap
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(closed()).toBe(1);
    expect(root.querySelector('.wc-player')).toBeNull();
    expect(leaked()).toEqual([]);
  });
});

describe('PlayerHost input colour (ADR 0035)', () => {
  /** The chain with the first VIEW's appearance replaced by `appearance` (or no VIEW at all). */
  function chain(appearance: object | null) {
    const c = twoRunChain();
    const lines = c[0]!.text.split('\n');
    const i = lines.findIndex((l) => l.includes('VIEW'));
    if (appearance === null) lines.splice(i, 1);
    else lines[i] = makeLog(BASE_US, [{ at: 0.0002, view: { appearance } }]).trimEnd();
    c[0]!.text = lines.join('\n');
    return c;
  }

  function open(recorded: object | null, viewerColor: string) {
    const root = document.createElement('div');
    root.style.cssText = 'width:1200px;height:800px';
    document.body.appendChild(root);
    const wall = new FakeWall();
    const viewer = new SettingsStore({ factory: null, storage: null, win: null });
    void viewer.load();
    viewer.update({ appearance: { inputColor: viewerColor as never } });
    const host = new PlayerHost({ root, settings: viewer, wall, onClose: () => {} });
    host.openChain(chain(recorded), [], { character: 'Rasta', level: 42 });
    const eng = host.engine!;
    eng.pause();
    eng.seek(1500);
    wall.flush();
    const s = () => (host.app as unknown as { settings: SettingsStore }).settings.get();
    return { host, eng, wall, viewer, s };
  }

  const mix = (p: number, t: string) => `color-mix(in oklab, var(--term-fg) ${p}%, ${t})`;

  it('uses the recorded input colour, not the viewer’s, also after a backward seek', () => {
    const { host, eng, wall, s } = open({ size: 14, inputColor: 'cyan' }, 'none');
    expect(s().appearance.inputColor).toBe('cyan');
    expect(host.el.style.getPropertyValue('--term-echo')).toBe(mix(15, '#00d7d7'));
    eng.seek(3500);
    wall.flush();
    eng.seek(1000);
    wall.flush();
    expect(eng.buildCount).toBe(2);
    expect(s().appearance.inputColor).toBe('cyan');
    host.dispose();
  });

  it('resolves the recorded choice against the viewer’s colour theme', () => {
    const { host, s } = open({ size: 14, inputColor: 'amber' }, 'steel');
    host.setViewer({ ...host.viewerOverrides, theme: 'paper' });
    expect(s().appearance.bg).toBe('#f4ecd8');
    expect(s().appearance.inputColor).toBe('amber');
    expect(host.el.style.getPropertyValue('--term-echo')).toBe(mix(15, '#9a5a00'));
    host.dispose();
  });

  it('plays a log recorded before the setting (or with no VIEW) with Steel', () => {
    for (const recorded of [{ size: 14 }, null]) {
      const { host, s } = open(recorded, 'amber');
      expect(s().appearance.inputColor).toBe('steel');
      expect(host.el.style.getPropertyValue('--term-echo')).toBe(mix(55, '#7fb2e6'));
      host.dispose();
    }
  });

  it('a live VIEW snapshot carries the input colour', () => {
    const s = new SettingsStore({ factory: null, storage: null, win: null });
    void s.load();
    s.update({ appearance: { inputColor: 'sage' } });
    const v = JSON.parse(JSON.stringify(viewSnapshot(s.get()))) as { appearance: { inputColor: string } };
    expect(v.appearance.inputColor).toBe('sage');
  });
});
