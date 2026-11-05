// @vitest-environment happy-dom
// Stage 30c part 2 (ADR 0095 addendum, ADR 0107): the Gear on the Map,
// Comm, Timers and Group panes (where it is, its drop order, its click and
// mark), the gear popup's place beside its pane, its close when the pane
// is hidden, and the Comm, Timers and Group popups writing the settings.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { legacySettings } from './legacy-defaults';
import { type ChromeServices, mountSettingsPopups } from '../../src/chrome';
import { CommSettings, GroupSettings, TimersSettings } from '../../src/chrome/popups/pane-settings';
import { ServicesCtx } from '../../src/chrome/kit/hooks';
import { TIMER_COLS_CHOICES, TIMER_WARN_OPTIONS, commChannelRows, toggleCommChannel, warnAtOf } from '../../src/chrome/pane-options-model';
import { COMM_CHANNEL_ORDER } from '../../src/gmcp/comm';
import { Cockpit } from '../../src/layout/cockpit';
import { moveToNewLane } from '../../src/layout/model';
import { GEAR_ICON, GEAR_PANES, gearLabel, hasGear, lookButtonsFit, lookSlot, paneButtons } from '../../src/layout/pane-buttons';
import { setDeviceForTest } from '../../src/core/device';
import { barCells } from '../../src/menubar/menubar';
import { besidePlace, followPane, gearPaneOf } from '../../src/menubar/popup';
import { ProfileStore } from '../../src/profiles';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
  setDeviceForTest({ touch: false, phone: false });
  document.body.innerHTML = '';
});

// ------------------------------------------------------------ helpers

describe('gear helpers', () => {
  it('the Gear is the leftmost button on Map, Comm, Timers and Group, slot 3', () => {
    expect([...GEAR_PANES]).toEqual(['map', 'comm', 'timers', 'group']);
    expect(hasGear('comm')).toBe(true);
    expect(hasGear('character')).toBe(false);
    expect(hasGear('ui')).toBe(false);
    expect(hasGear('s/bar')).toBe(false);
    expect(paneButtons(true)).toEqual(['gear', 'color', 'border', 'glass']);
    expect(paneButtons(false)).toEqual(['color', 'border', 'glass']);
    expect(paneButtons(true).map(lookSlot)).toEqual([3, 2, 1, 0]);
    expect(gearLabel('Comm')).toBe('Comm settings');
    expect(GEAR_ICON).toMatch(/^<svg /);
    expect(GEAR_ICON).toContain('currentColor');
    expect(GEAR_ICON).not.toMatch(/\bid=/);
  });

  it('four buttons fit where there is room for four; fewer drop from the left', () => {
    // 30 cells of 10 px: the cross the last four, each button two.
    expect(lookButtonsFit(300, 10, 0, 4, 4)).toBe(4);
    expect(lookButtonsFit(300, 10, 175, 4, 4)).toBe(4); // the Gear's left edge at 180
    expect(lookButtonsFit(300, 10, 176, 4, 4)).toBe(3);
    expect(lookButtonsFit(300, 10, 196, 4, 4)).toBe(2);
  });

  it('places the popup beside the pane, the game side first, top-aligned, inside the viewport', () => {
    const vw = 1400;
    const vh = 900;
    const game = { left: 0, top: 0, right: 900, bottom: 860 };
    // A right-docked pane: to its left (toward the game).
    const right = { left: 920, top: 300, right: 1400, bottom: 500 };
    expect(besidePlace(right, game, 250, 300, vw, vh)).toEqual({ left: 664, top: 300, maxHeight: null, side: 'left' });
    // Low on the screen: moved up to stay inside it.
    expect(besidePlace({ ...right, top: 800, bottom: 880 }, game, 250, 300, vw, vh).top).toBe(596);
    // A left-docked pane: to its right.
    const g2 = { left: 400, top: 0, right: 1400, bottom: 860 };
    const left = { left: 0, top: 100, right: 380, bottom: 400 };
    expect(besidePlace(left, g2, 250, 300, vw, vh)).toEqual({ left: 386, top: 100, maxHeight: null, side: 'right' });
    // No room toward the game: the other side.
    const nearGame = { left: 100, top: 100, right: 400, bottom: 400 };
    expect(besidePlace(nearGame, { left: 0, top: 0, right: 200, bottom: 860 }, 250, 300, vw, vh).side).toBe('right');
    // Room on neither side (a wide pane): over it, below its title row, on the game side.
    const wide = { left: 0, top: 600, right: 1400, bottom: 900 };
    expect(besidePlace(wide, { left: 0, top: 0, right: 700, bottom: 580 }, 250, 200, vw, vh, 20)).toEqual({
      left: 6,
      top: 620,
      maxHeight: null,
      side: 'over',
    });
    // Taller than the viewport: capped, at the top margin.
    expect(besidePlace(right, game, 250, 1000, vw, vh)).toEqual({ left: 664, top: 4, maxHeight: 892, side: 'left' });
  });

  it('follows the pane: placed again while shown, closed when not; other popups untouched', () => {
    const p = { openKey: 'pane:comm' as string | null, place: vi.fn(), close: vi.fn(() => true) };
    followPane(p, () => true);
    expect(p.place).toHaveBeenCalledOnce();
    followPane(p, (id) => id !== 'comm');
    expect(p.close).toHaveBeenCalledOnce();
    p.openKey = 'settings';
    followPane(p, () => false);
    expect(p.close).toHaveBeenCalledOnce();
    expect(gearPaneOf('pane:map')).toBe('map');
    expect(gearPaneOf('settings')).toBeNull();
    expect(gearPaneOf(null)).toBeNull();
  });
});

// ------------------------------------------------------------ cockpit

function cockpit(o: { gear?: boolean; width?: number } = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  settings.update((d) => {
    Object.assign(d, legacySettings());
  });
  const frames: (() => void)[] = [];
  const onGear = vi.fn();
  const c = new Cockpit({
    root,
    settings,
    cells: { get: () => ({ w: 10, h: 20 }), subscribe: () => () => {} },
    requestFrame: (cb) => frames.push(cb),
    ...(o.gear === false ? {} : { onGear }),
  });
  Object.defineProperty(c.el, 'clientWidth', { get: () => o.width ?? 1200, configurable: true });
  Object.defineProperty(c.el, 'clientHeight', { get: () => 1000, configurable: true });
  const flush = () => {
    while (frames.length) frames.shift()!();
  };
  c.setBarCells(barCells(true));
  flush();
  cleanup.push(() => c.dispose());
  const btns = (id: string) => [...c.el.querySelectorAll<HTMLElement>(`.wc-pane[data-pane="${id}"] > .wc-pane-btn`)];
  const gear = (id: string) => c.el.querySelector<HTMLElement>(`.wc-pane[data-pane="${id}"] > .wc-pane-btn-gear`);
  return { c, settings, flush, onGear, btns, gear };
}

describe('the Gear on the panes', () => {
  it('Map, Comm, Timers and Group have it leftmost, labelled by the pane; Character and UI do not', () => {
    const t = cockpit();
    for (const id of ['map', 'comm', 'timers', 'group']) {
      const b = t.btns(id);
      expect(b.map((x) => x.dataset.look)).toEqual(['gear', 'color', 'border', 'glass']);
      expect(b[0]!.style.getPropertyValue('--slot')).toBe('3');
      expect(b[0]!.getAttribute('role')).toBe('button');
      expect(b[0]!.querySelector('svg')).not.toBeNull();
      expect(b[0]!.dataset.mb).toBe(`pane:${id}`);
    }
    expect(t.gear('comm')!.title).toBe('Comm settings');
    expect(t.gear('comm')!.getAttribute('aria-label')).toBe('Comm settings');
    expect(t.gear('map')!.title).toBe('Map settings');
    expect(t.gear('timers')!.title).toBe('Timers settings');
    expect(t.gear('group')!.title).toBe('Group settings');
    expect(t.gear('character')).toBeNull();
    expect(t.gear('ui')).toBeNull();
    expect(t.btns('character')).toHaveLength(3);
  });

  it('none without a gear handler, and none on a phone', () => {
    expect(cockpit({ gear: false }).gear('comm')).toBeNull();
    document.body.innerHTML = '';
    setDeviceForTest({ touch: true, phone: true });
    const t = cockpit();
    expect(t.gear('comm')).toBeNull();
    expect(c(t).querySelectorAll('.wc-pane-btn')).toHaveLength(0);
  });

  it('its click calls the handler with the pane, keeps the focus and starts no drag; markGear marks it', () => {
    const t = cockpit();
    const g = t.gear('comm')!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    g.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 1100, clientY: 5 }));
    expect(t.c.dragging).toBe(false);
    g.click();
    expect(t.onGear).toHaveBeenCalledWith('comm');
    // Its look did not change.
    expect(t.settings.get().panes.comm.color).toBe(legacySettings().panes.comm.color);
    t.c.markGear('comm');
    expect(g.hasAttribute('data-open')).toBe(true);
    t.c.markGear('timers');
    expect(g.hasAttribute('data-open')).toBe(false);
    expect(t.gear('timers')!.hasAttribute('data-open')).toBe(true);
    t.c.markGear(null);
    expect(t.gear('timers')!.hasAttribute('data-open')).toBe(false);
  });

  it('a narrow pane drops the Gear first, then Colour …; the cross stays', () => {
    const t = cockpit();
    const drops = () => t.btns('timers').map((b) => b.hasAttribute('data-drop'));
    expect(drops()).toEqual([false, false, false, false]);
    const seen = new Set<number>();
    // From the default 33 cells: the hood moves left for them, then they lie over its right part and drop
    // only where they would cover its left end (ADR 0123 "Hood position and hover buttons"); under ten
    // cells there is no hood, so the cross and a button still fit.
    for (let w = 33; w >= 8; w--) {
      t.settings.update((d) => {
        d.layout = moveToNewLane(legacySettings().layout, 'timers', 'right', 1, w);
      });
      t.flush();
      const d = drops();
      const kept = d.filter((x) => !x).length;
      seen.add(kept);
      expect(d).toEqual([...Array(4 - kept).fill(true), ...Array(kept).fill(false)]);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it('isShown follows the settings', () => {
    const t = cockpit();
    expect(t.c.isShown('comm')).toBe(true);
    t.settings.update({ panes: { comm: { on: false } } });
    t.flush();
    expect(t.c.isShown('comm')).toBe(false);
  });
});

const c = (t: { c: Cockpit }): HTMLElement => t.c.el;

// ------------------------------------------------------------ popups

function services(settings = new SettingsStore({ factory: null, storage: null, win: null })): ChromeServices {
  const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
  void cells.update(settings.get().appearance);
  return { settings, cells, profiles: new ProfileStore({ factory: null }), version: '9.9.9', runs: () => Promise.reject(new Error('no runs')) };
}

describe('gear popups with the cockpit', () => {
  it('the open gear popup closes when its pane is hidden, and is placed again on every layout while it is shown', () => {
    const t = cockpit();
    const host = document.createElement('div');
    document.body.append(host);
    const onClose = vi.fn();
    const onChange = vi.fn();
    const pops = mountSettingsPopups(host, services(t.settings), { focusInput: vi.fn(), onClose, onChange });
    cleanup.push(() => pops.dispose());
    t.c.onLayout(() => followPane(pops, (id) => t.c.isShown(id as never)));
    const place = vi.fn();
    act(() => pops.open({ pane: 'comm' }, place));
    expect(onChange).toHaveBeenLastCalledWith('pane:comm');
    expect(host.querySelector('.wc-sp-gear-comm')).not.toBeNull();
    expect(host.querySelector('.wc-pop')!.getAttribute('aria-label')).toBe('Comm settings');
    place.mockClear();
    // Another layout: placed again.
    act(() => {
      t.settings.update({ panes: { comm: { color: 'red' } } });
      t.flush();
    });
    expect(place).toHaveBeenCalled();
    expect(pops.openKey).toBe('pane:comm');
    // Hidden (its cross, Panes, a setting, Reset layout all write `on`): closed, reported to the bar.
    act(() => {
      t.settings.update({ panes: { comm: { on: false } } });
      t.flush();
    });
    expect(pops.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledWith('pane:comm');
    expect(onChange).toHaveBeenLastCalledWith(null);
    // Another pane hidden leaves an open popup alone.
    t.settings.update({ panes: { comm: { on: true } } });
    t.flush();
    act(() => pops.open({ pane: 'group' }, place));
    act(() => {
      t.settings.update({ panes: { timers: { on: false } } });
      t.flush();
    });
    expect(pops.openKey).toBe('pane:group');
  });
});

function mountWith(node: preact.VNode) {
  const svc = services();
  const host = document.createElement('div');
  host.className = 'wc-pop';
  document.body.append(host);
  act(() => render(<ServicesCtx.Provider value={svc}>{node}</ServicesCtx.Provider>, host));
  cleanup.push(() => render(null, host));
  return { host, s: () => svc.settings.get(), settings: svc.settings };
}

const click = (el: Element | null | undefined) =>
  act(() => {
    (el as HTMLElement).click();
  });
const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });

describe('gear popup contents', () => {
  it('Comm: ten channels (swatch, label, toggle) and Show channel header, written live and sparse', () => {
    const t = mountWith(<CommSettings />);
    expect(t.host.querySelector('.wc-ck-sub')!.textContent).toBe('Channels');
    const rows = [...t.host.querySelectorAll<HTMLElement>('.wc-sp-chan[data-channel]')];
    expect(rows.map((r) => r.dataset.channel)).toEqual([...COMM_CHANNEL_ORDER]);
    expect(rows[0]!.textContent).toBe('Narrates');
    const tg = rows[3]!.querySelector('[role=switch]')!;
    expect(tg.getAttribute('aria-checked')).toBe('true');
    click(tg);
    expect(t.s().comm.filters).toEqual({ [COMM_CHANNEL_ORDER[3]!]: false });
    expect(rows[3]!.classList.contains('is-off')).toBe(true);
    expect(tg.getAttribute('aria-checked')).toBe('false');
    // A click anywhere in the row toggles it back; the filters stay sparse.
    click(rows[3]!.querySelector('.wc-ck-l'));
    expect(t.s().comm.filters).toEqual({});
    const header = t.host.querySelector('[data-key="show-header"] [role=switch]')!;
    const was = t.s().comm.showHeader;
    click(header);
    expect(t.s().comm.showHeader).toBe(!was);
  });

  it('Timers: look, ending soon and a row per group (shown, colour, layout)', () => {
    const t = mountWith(<TimersSettings />);
    const seg = (label: string, value: string) => click(t.host.querySelector(`[aria-label="${label}"] [data-value="${value}"]`));
    seg('Style', 'circles');
    expect(t.s().timers.style).toBe('circles');
    seg('Layout', 'grid');
    expect(t.s().timers.layout).toBe('grid');
    click(t.host.querySelector('[aria-label="Grid columns"]'));
    click(t.host.querySelector('.wc-ck-opt[data-value="2"]'));
    expect(t.s().timers.cols).toBe(2);
    seg('Signal', 'pulse');
    expect(t.s().timers.signal).toBe('pulse');
    seg('Warn at', '60');
    expect(t.s().timers.warnAt).toBe(60);
    for (const [label, key] of [
      ['Group headers', 'headers'],
      ['Time text', 'timeText'],
      ['Soonest first', 'soonestFirst'],
    ] as const) {
      const was = t.s().timers[key];
      click(t.host.querySelector(`[aria-label="${label}"]`));
      expect(t.s().timers[key]).toBe(!was);
    }
    // A group row: shown, colour (picker), layout.
    expect([...t.host.querySelectorAll('.wc-sp-tg-l')].map((e) => e.textContent)).toEqual([
      'Herblores', 'Sanctuary', 'Spells', 'Buffs', 'Debuffs', 'Stored', 'Blinds', 'Charmies',
    ]);
    // Herblore turns on and off like any group (its `+` lives in its header).
    click(t.host.querySelector('[aria-label="Show Herblores"]'));
    expect(t.s().timers.groups.herb.enabled).toBe(false);
    click(t.host.querySelector('[aria-label="Show Spells"]'));
    expect(t.s().timers.groups.spell.enabled).toBe(false);
    expect(t.host.querySelector('[data-group="spell"]')!.classList.contains('is-dim')).toBe(true);
    click(t.host.querySelector('.wc-cp-btn[aria-label^="Blinds colour"]'));
    click(t.host.querySelectorAll('.wc-cp-sw')[1]!);
    expect(t.s().timers.groups.blind.color).toMatch(/^#[0-9a-f]{6}$/);
    click(t.host.querySelector('.wc-cp-btn[aria-label^="Blinds colour"]'));
    click(t.host.querySelector('.wc-cp-auto'));
    expect(t.s().timers.groups.blind.color).toBe('auto');
    seg('Blinds layout', 'grid');
    expect(t.s().timers.groups.blind.layout).toBe('grid');
  });

  it('Group: the Fight card toggle', () => {
    const t = mountWith(<GroupSettings />);
    expect(t.s().group.fight).toBe(false);
    click(t.host.querySelector('[aria-label="Fight card"]'));
    expect(t.s().group.fight).toBe(true);
  });

  it('Group: Show players and NPC visibility', () => {
    const t = mountWith(<GroupSettings />);
    const p0 = t.s().group.showPlayers;
    click(t.host.querySelector('[aria-label="Show players"]'));
    expect(t.s().group.showPlayers).toBe(!p0);
    const seg = t.host.querySelector('[aria-label="NPC visibility"]')!;
    expect([...seg.querySelectorAll('[role=radio]')].map((b) => b.textContent)).toEqual(['Off', 'Labeled', 'All']);
    click(seg.querySelector('[data-value="all"]'));
    expect(t.s().group.npcMode).toBe('all');
    click(seg.querySelector('[data-value="off"]'));
    expect(t.s().group.npcMode).toBe('off');
  });

  it('a change made elsewhere shows', () => {
    const t = mountWith(<CommSettings />);
    act(() => toggleCommChannel(t.settings, 'tells'));
    expect(t.host.querySelector('[data-channel="tells"]')!.classList.contains('is-off')).toBe(true);
  });
});

describe('pane options model (shared with the TUI pages)', () => {
  it('channel rows and the timers choices', () => {
    const rows = commChannelRows({ tells: false });
    expect(rows).toHaveLength(10);
    expect(rows.find((r) => r.name === 'tells')!.on).toBe(false);
    expect(rows.every((r) => r.color.startsWith('#'))).toBe(true);
    expect(TIMER_COLS_CHOICES).toEqual(['auto', 1, 2, 3, 4, 5, 6]);
    expect(TIMER_WARN_OPTIONS.map((o) => o.label)).toEqual(['10s', '20s', '30s', '60s']);
    expect(warnAtOf('30')).toBe(30);
    expect(warnAtOf('x')).toBe(20);
  });
});
