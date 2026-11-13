// @vitest-environment happy-dom
// Stage 55a: the phone's game layout over a replay (`Cockpit.phoneReplay`),
// the cockpit's own theme mark (`data-ph-light`), and what the layout does
// with panes that are switched off in the settings (a recorded VIEW).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/app';
import { setDeviceForTest } from '../../src/core/device';
import { Cockpit, type CockpitOptions } from '../../src/layout/cockpit';
import { commandRows } from '../../src/layout/phone-game';
import { ReplayClock } from '../../src/player/clock';
import { SettingsStore } from '../../src/settings';

const CELL = { w: 9, h: 17 };
const W = 390;
const H = 760;
const COLS = Math.floor(W / CELL.w);
const ROWS = Math.floor(H / CELL.h);

const cleanup: (() => void)[] = [];

function make(o: Pick<CockpitOptions, 'phoneReplay'>, size = { width: W, height: H }) {
  const root = document.createElement('div');
  document.body.append(root);
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const frames: (() => void)[] = [];
  const c = new Cockpit({
    root,
    settings,
    cells: { get: () => CELL, subscribe: () => () => {} },
    requestFrame: (cb) => frames.push(cb),
    ...o,
  });
  Object.defineProperty(c.el, 'clientWidth', { get: () => size.width, configurable: true });
  Object.defineProperty(c.el, 'clientHeight', { get: () => size.height, configurable: true });
  const flush = (): void => {
    while (frames.length) frames.shift()!();
  };
  c.relayoutNow();
  flush();
  cleanup.push(() => c.dispose());
  return { c, settings, flush, size };
}

beforeEach(() => setDeviceForTest({ touch: true, phone: true }));

afterEach(() => {
  for (const fn of cleanup.splice(0)) fn();
  setDeviceForTest({ touch: false, phone: false });
  document.body.replaceChildren();
});

describe('Cockpit phoneReplay (stage 55)', () => {
  it('the live game keeps the command row; a replay with a bar keeps the same rows for it', () => {
    const live = make({});
    const bar = make({ phoneReplay: { bar: true } });
    const n = commandRows(CELL.h);
    expect(n).toBe(3);
    for (const h of [live, bar]) {
      const g = h.c.phoneGameLayout!;
      expect(g.input).toEqual({ x: 0, y: ROWS - n, w: COLS, h: n });
      expect(g.game).toEqual({ x: 0, y: 0, w: COLS, h: ROWS - n });
      expect(h.c.inputEl.style.height).toBe(`${n * CELL.h}px`);
    }
    expect(live.c.phoneReplayMode).toBeNull();
    expect(bar.c.phoneReplayMode).toEqual({ bar: true });
    expect(bar.c.el.hasAttribute('data-phone-game')).toBe(true);
  });

  it('a replay without a bar lays out no command row: the game text reaches the bottom edge', () => {
    const { c } = make({ phoneReplay: { bar: false } });
    const g = c.phoneGameLayout!;
    expect(g.tooSmall).toBe(false);
    expect(g.input).toEqual({ x: 0, y: ROWS, w: COLS, h: 0 });
    expect(g.game).toEqual({ x: 0, y: 0, w: COLS, h: ROWS });
    expect(c.inputEl.style.height).toBe('0px');
    expect(c.gameEl.style.height).toBe(`${ROWS * CELL.h}px`);
    expect(c.phoneReplayMode).toEqual({ bar: false });
  });

  it('the strip, Comm and the lens are laid out over a replay as in the game', () => {
    const { c, flush } = make({ phoneReplay: { bar: false } });
    c.setPhoneStrip('timers');
    c.setPhoneComm({ rows: 10 });
    c.setPhoneLens({ size: 160, min: 96, gapTop: 16, gapRight: 12, clearBottom: 0 });
    flush();
    const g = c.phoneGameLayout!;
    expect(g.strip.h).toBeGreaterThan(0);
    expect(g.comm).toEqual({ x: 0, y: g.strip.h, w: COLS, h: 10 });
    expect(g.game.y + g.game.h).toBe(ROWS);
    expect(g.lens).not.toBeNull();
    expect(g.lensPx).toBe(160);
    // A layout that would be (the phone layer's question) has no command row either.
    expect(c.phoneGameLayoutIf({ bottom: null })!.input.h).toBe(0);
  });

  it('not on a phone: the option does nothing', () => {
    setDeviceForTest({ touch: false, phone: false });
    const { c } = make({ phoneReplay: { bar: true } }, { width: 1200, height: 800 });
    expect(c.isPhoneGame).toBe(false);
    expect(c.phoneReplayMode).toBeNull();
    expect(c.phoneGameLayout).toBeNull();
    expect(c.el.hasAttribute('data-phone-game')).toBe(false);
    expect(c.el.hasAttribute('data-ph-light')).toBe(false);
  });
});

describe("Cockpit data-ph-light (stage 55): the phone layout follows the cockpit's own theme", () => {
  it("is set from the cockpit's settings at construction and at once when the background changes", () => {
    const { c, settings } = make({});
    expect(c.el.hasAttribute('data-ph-light')).toBe(false);
    // No frame is flushed: the mark changes in the turn of the settings change, as the page's does.
    settings.update({ appearance: { bg: '#f4ecd8' } });
    expect(c.el.hasAttribute('data-ph-light')).toBe(true);
    settings.update({ appearance: { bg: '#000000' } });
    expect(c.el.hasAttribute('data-ph-light')).toBe(false);
  });

  it('a cockpit built on light settings is marked from the start, whatever the page says', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    settings.update({ appearance: { bg: '#f4ecd8' } });
    document.documentElement.removeAttribute('data-light');
    const c = new Cockpit({ root, settings, cells: { get: () => CELL, subscribe: () => () => {} }, requestFrame: () => {}, phoneReplay: { bar: true } });
    cleanup.push(() => c.dispose());
    expect(c.el.hasAttribute('data-ph-light')).toBe(true);
  });

  it('a cockpit that is not in the phone game layout is never marked', () => {
    setDeviceForTest({ touch: false, phone: false });
    const { c, settings } = make({}, { width: 1200, height: 800 });
    settings.update({ appearance: { bg: '#f4ecd8' } });
    expect(c.el.hasAttribute('data-ph-light')).toBe(false);
  });
});

describe('phone game layout and panes switched off in the settings (stage 55, a recorded VIEW)', () => {
  it('the lens places the map pane though panes.map.on is false', () => {
    const { c, settings, flush } = make({ phoneReplay: { bar: false } });
    settings.update((d) => {
      d.panes.map = { ...d.panes.map, on: false };
    });
    flush();
    expect(c.pane('map').visible).toBe(false);
    c.setPhoneLens({ size: 160, min: 96, gapTop: 16, gapRight: 12, clearBottom: 0 });
    flush();
    expect(settings.get().panes.map.on).toBe(false);
    expect(c.phoneGameLayout!.lens).not.toBeNull();
    expect(c.pane('map').visible).toBe(true);
    expect(c.pane('map').el.hidden).toBe(false);
  });

  it('the strip and Comm place their panes though they are switched off', () => {
    const { c, settings, flush } = make({ phoneReplay: { bar: false } });
    settings.update((d) => {
      for (const id of ['timers', 'group', 'character', 'comm'] as const) d.panes[id] = { ...d.panes[id], on: false };
    });
    for (const id of ['timers', 'group', 'character'] as const) {
      c.setPhoneStrip(id);
      flush();
      expect(c.pane(id).visible).toBe(true);
      expect(c.pane(id).el.hasAttribute('data-phone-strip')).toBe(true);
    }
    c.setPhoneComm({ rows: null });
    flush();
    expect(c.pane('comm').visible).toBe(true);
    // And a pane that is on in the settings but has no place in this layout is not shown.
    settings.update((d) => {
      d.panes.group = { ...d.panes.group, on: true };
    });
    c.setPhoneStrip('timers');
    flush();
    expect(c.pane('group').visible).toBe(false);
  });
});

describe('a player App passes the phone layout through (stage 55)', () => {
  function playerApp(o: { phoneReplay?: { bar: boolean } }): App {
    const root = document.createElement('div');
    document.body.append(root);
    const clock = new ReplayClock(1_000_000);
    const app = new App({
      root,
      player: true,
      offline: true,
      scheduler: clock,
      now: () => clock.now(),
      clockUs: () => clock.nowUs(),
      requestFrame: () => {},
      paneRequestFrame: () => {},
      ...o,
    });
    cleanup.push(() => app.dispose());
    return app;
  }

  it('not on a phone a player App has the desktop cockpit, whatever the option says', () => {
    setDeviceForTest({ touch: false, phone: false });
    for (const o of [{}, { phoneReplay: { bar: false } }]) {
      const app = playerApp(o);
      expect(app.cockpit.isPhoneGame).toBe(false);
      expect(app.cockpit.phoneReplayMode).toBeNull();
      expect(app.cockpit.el.hasAttribute('data-phone-game')).toBe(false);
    }
  });

  it('phoneReplay reaches the cockpit, bar or not', () => {
    for (const bar of [true, false]) {
      const app = playerApp({ phoneReplay: { bar } });
      expect(app.cockpit.isPhoneGame).toBe(true);
      expect(app.cockpit.phoneReplayMode).toEqual({ bar });
      expect(app.cockpit.el.hasAttribute('data-phone-game')).toBe(true);
    }
  });
});
