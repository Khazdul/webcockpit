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
import { CommSettings, GroupSettings, TIMER_COLOR_CHOICES, TimersSettings } from '../../src/chrome/popups/pane-settings';
import { ServicesCtx } from '../../src/chrome/kit/hooks';
import { colorChoice, colorToggle, commChannelRows, toggleCommChannel } from '../../src/chrome/pane-options-model';
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
    for (let w = 30; w >= 8; w--) {
      t.settings.update((d) => {
        d.layout = moveToNewLane(legacySettings().layout, 'timers', 'right', 1, w);
      });
      t.flush();
      const d = drops();
      const kept = d.filter((x) => !x).length;
      seen.add(kept);
      expect(d).toEqual([...Array(4 - kept).fill(true), ...Array(kept).fill(false)]);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
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

  it('Timers: colour with Off (colour kept), columns in range, Clock and Bar but not for Charmies; headers, compact', () => {
    const t = mountWith(<TimersSettings />);
    expect(TIMER_COLOR_CHOICES.map((c) => c.value)).toEqual(['off', 'blue', 'green', 'red', 'magenta', 'cyan', 'violet', 'orange']);
    const spellColour = t.host.querySelector<HTMLElement>('[aria-label="Spells colour"]')!;
    const before = t.s().timers.groups.spell.color;
    click(spellColour);
    click(t.host.querySelector('.wc-ck-opt[data-value="off"]'));
    expect(t.s().timers.groups.spell.enabled).toBe(false);
    expect(t.s().timers.groups.spell.color).toBe(before);
    expect(t.host.querySelector('[data-group="spell"]')!.classList.contains('is-dim')).toBe(true);
    click(spellColour);
    click(t.host.querySelector('.wc-ck-opt[data-value="orange"]'));
    expect(t.s().timers.groups.spell).toMatchObject({ enabled: true, color: 'orange' });
    // Columns: the stepper's buttons and keys, inside 1–6 (Charmies 1–2).
    const cols = t.host.querySelector<HTMLElement>('[aria-label="Spells columns"]')!;
    expect(cols.getAttribute('role')).toBe('spinbutton');
    key(cols, 'End');
    expect(t.s().timers.groups.spell.cols).toBe(6);
    click(cols.querySelector('[data-step="inc"]'));
    expect(t.s().timers.groups.spell.cols).toBe(6);
    click(cols.querySelector('[data-step="dec"]'));
    expect(t.s().timers.groups.spell.cols).toBe(5);
    key(cols, 'Home');
    expect(t.s().timers.groups.spell.cols).toBe(1);
    const charm = t.host.querySelector<HTMLElement>('[aria-label="Charmies columns"]')!;
    expect(charm.getAttribute('aria-valuemax')).toBe('2');
    key(charm, 'ArrowRight');
    key(charm, 'ArrowRight');
    expect(t.s().timers.groups.charm.cols).toBe(2);
    // Clock and Bar.
    const clock = t.host.querySelector<HTMLElement>('[aria-label="Buffs clock"]')!;
    const c0 = t.s().timers.groups.buff.clock;
    click(clock);
    expect(t.s().timers.groups.buff.clock).toBe(!c0);
    const bar = t.host.querySelector<HTMLElement>('[aria-label="Buffs bar"]')!;
    const b0 = t.s().timers.groups.buff.bar;
    click(bar);
    expect(t.s().timers.groups.buff.bar).toBe(!b0);
    expect(t.host.querySelector('[aria-label="Charmies clock"]')).toBeNull();
    expect(t.host.querySelector('[aria-label="Charmies bar"]')).toBeNull();
    const h0 = t.s().timers.headers;
    click(t.host.querySelector('[aria-label="Display headers"]'));
    expect(t.s().timers.headers).toBe(!h0);
    const k0 = t.s().timers.compact;
    click(t.host.querySelector('[aria-label="Compact layout"]'));
    expect(t.s().timers.compact).toBe(!k0);
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
  it('channel rows, colour toggle and colour choice', () => {
    const rows = commChannelRows({ tells: false });
    expect(rows).toHaveLength(10);
    expect(rows.find((r) => r.name === 'tells')!.on).toBe(false);
    expect(rows.every((r) => r.color.startsWith('#'))).toBe(true);
    const g = { enabled: true, color: 'blue' as const, cols: 4, clock: false, bar: true };
    expect(colorToggle(g, 'blue')).toEqual({ enabled: false, color: 'blue' });
    expect(colorChoice(g, null)).toEqual({ enabled: false, color: 'blue' });
    expect(colorChoice({ ...g, enabled: false }, 'red')).toEqual({ enabled: true, color: 'red' });
  });
});
