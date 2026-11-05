// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { CharModel } from '../../src/gmcp/char';
import { GameState } from '../../src/gmcp/state';
import { CHARACTER_ROWS, CharacterPane, characterLines, colWidths, gaugeWidths, toothPositions } from '../../src/panes/character';
import { createPaneContext } from '../../src/panes/context';
import { CellLine, centre } from '../../src/panes/grid';
import { GroupPane } from '../../src/panes/group';
import { paneShade } from '../../src/panes/shade';
import { PANE_FACTORIES } from '../../src/panes/factories';
import { TimersPane } from '../../src/panes/timers';
import { SettingsStore } from '../../src/settings';
import { defaultSettings } from '../../src/settings/types';
import { shadeRamp } from '../../src/theme/color';

const ramp = shadeRamp(0, 0, false);

describe('shade ramp', () => {
  it('is resolved from the pane colour each call, dark or light', () => {
    const s = defaultSettings();
    s.panes.group.color = 'green';
    const a = paneShade(s, 'group');
    expect(a.light).toBe(false);
    expect(a.bg).toBe('#0e1a0e');
    s.panes.group.color = 'purple';
    const b = paneShade(s, 'group');
    expect(b.ramp.track).not.toBe(a.ramp.track);
    s.panes.group.color = 'black';
    s.appearance.bg = '#f4ecd8'; // paper
    const c = paneShade(s, 'group');
    expect(c.light).toBe(true);
    expect(c.ramp.track).not.toBe(b.ramp.track);
  });
});

describe('grid', () => {
  it('centres and merges runs', () => {
    expect(centre('ab', 5)).toBe(' ab  ');
    expect(centre('abcdef', 3)).toBe('abc');
    const l = new CellLine(6).put(1, 'xyz', { fg: '#111111' }).fill(0, 2, { bg: '#222222' });
    expect(l.text()).toBe(' xyz  ');
    const el = l.toElement(document);
    expect(el.className).toBe('wc-prow');
    expect([...el.childNodes].map((n) => n.textContent)).toEqual([' ', 'x', 'yz', '  ']);
  });
});

describe('Character layout', () => {
  const full = () => {
    const c = new CharModel();
    c.apply('Char.Name', { name: 'khazdul' });
    c.apply('Char.StatusVars', { race: 'Dwarf' });
    c.apply('Char.Vitals', { xp: 5_440_000, tp: 40_000, mood: 'brave', alertness: 'normal', position: 'standing', wimpy: 50, maxhp: 200, sneak: 's', swim: false });
    return c.view();
  };

  it('splits columns like the toggle grid', () => {
    expect(colWidths(31)).toEqual([7, 7, 7, 7]);
    expect(colWidths(30)).toEqual([7, 7, 7, 6]);
    expect(gaugeWidths(31)).toEqual([15, 15]);
    const [l, r] = gaugeWidths(30);
    expect(l + 1 + r).toBe(30);
    expect(toothPositions(6, 15)).toEqual([0, 3, 6, 8, 11, 14]);
    expect(toothPositions(1, 5)).toEqual([0]);
  });

  it('draws the nine rows at width 31', () => {
    const lines = characterLines(full(), ramp, 31, 9);
    expect(lines).toHaveLength(CHARACTER_ROWS);
    const t = lines.map((l) => l.text());
    expect(t[0]).toBe('            Khazdul         L25');
    expect(t[1]!.trimEnd()).toBe('▀'.repeat(Math.floor(31 * ((40_000 - 38_700) / 3300))));
    expect(t[2]).toBe(' SNEAK   RIDE    CLIMB   SWIM  ');
    const two = (a: string, b: string) => centre(a, 15) + ' ' + centre(b, 15);
    expect(t[3]).toBe(two('MOOD', 'ALERTNESS'));
    expect(t[4]).toBe(two('brave', 'normal'));
    expect(t[6]).toBe(two('POSITION', 'WIMPY'));
    expect(t[7]).toBe(two('standing', '50'));
    // Ticks: mood has 6 teeth, brave (index 3) glows.
    const tick = lines[5]!;
    const teeth = [...tick.text().slice(0, 15)].flatMap((ch, i) => (ch === '▀' ? [i] : []));
    expect(teeth).toEqual(toothPositions(6, 15));
    expect(tick.fg[8]).toBe(ramp.glow);
    expect(tick.fg[0]).toBe(ramp.track);
    // Wimpy caret at 50/200 of the right column.
    const caret = lines[8]!;
    expect(caret.text().indexOf('^')).toBe(16 + Math.round(0.25 * 14));
    // Toggles: sneak on, swim off.
    expect(lines[2]!.bg[0]).toBe(ramp.glow);
    expect(lines[2]!.bg[24]).toBe(ramp.track);
    // XP bar: half way through level 25, nothing gained yet.
    expect(lines[0]!.bg[0]).toBe(ramp.track);
    expect(lines[0]!.bg[14]).toBe(ramp.track);
    expect(lines[0]!.bg[16]).toBe('');
  });

  it('shows — and empty gauges when nothing is known', () => {
    const lines = characterLines(new CharModel().view(), ramp, 20, 9);
    expect(lines[0]!.text().trim()).toBe('—');
    expect(lines[4]!.text().trim()).toBe('');
    expect(lines[4]!.bg[0]).toBe(ramp.track);
    expect(lines[8]!.text().includes('^')).toBe(false);
    expect(lines[5]!.fg.filter((f) => f === ramp.glow)).toEqual([]);
  });

  it('an unknown position shows text but no lit tooth', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { position: 'fighting' });
    const lines = characterLines(c.view(), ramp, 31, 9);
    expect(lines[7]!.text()).toContain('fighting');
    expect(lines[8]!.fg.slice(0, 15).includes(ramp.glow)).toBe(false);
  });

  it('clips with an overflow line', () => {
    const lines = characterLines(full(), ramp, 31, 4);
    expect(lines).toHaveLength(4);
    expect(lines[3]!.text().trimEnd()).toBe('↓ 6 more rows');
    expect(characterLines(full(), ramp, 0, 9)).toEqual([]);
  });
});

describe('panes on the context', () => {
  function setup(state: 'playing' | 'idle' = 'playing') {
    const bus = new Bus();
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    const game = new GameState().attach(bus);
    const frames: (() => void)[] = [];
    const ctx = createPaneContext({ doc: document, bus, settings, game, requestFrame: (cb) => frames.push(cb), connState: () => state });
    const flush = () => {
      while (frames.length) frames.shift()!();
    };
    return { bus, settings, game, ctx, flush };
  }
  const place = (p: { place: CharacterPane['place'] }, w: number, h: number) =>
    p.place({ rect: { x: 0, y: 0, w, h }, content: { x: 0, y: 0, w, h }, framed: false }, { w: 8, h: 16 });

  it('Character renders from GMCP once per frame, blanks when inactive', () => {
    const t = setup();
    const p = new CharacterPane(t.ctx);
    place(p, 31, 9);
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'rasta' } });
    t.bus.emit('gmcp', { pkg: 'Char.Vitals', data: { mood: 'brave' } });
    t.flush();
    expect(p.content.querySelectorAll('.wc-prow')).toHaveLength(9);
    expect(p.content.textContent).toContain('Rasta');
    expect(p.content.textContent).toContain('brave');
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    t.flush();
    expect(p.content.textContent).toBe('');
    p.dispose();
  });

  it('Group applies the display options live', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 31, 6);
    t.bus.emit('gmcp', {
      pkg: 'Group.Set',
      data: [
        { id: 2, type: 'ally', name: 'Gibur' },
        { id: 3, type: 'npc', name: 'a dog', label: 0 },
        { id: 4, type: 'npc', name: 'a merc', label: 'M' },
      ],
    });
    t.flush();
    const names = () => [...p.content.querySelectorAll<HTMLElement>('.wc-gp-row[data-name]')].map((r) => r.dataset.name);
    expect(names()).toEqual(['Gibur', 'a merc (M)']);
    t.settings.update({ group: { npcMode: 'all' } });
    t.flush();
    expect(names()).toEqual(['Gibur', 'a dog', 'a merc (M)']);
    t.settings.update({ group: { showPlayers: false, npcMode: 'off' } });
    t.flush();
    expect(names()).toEqual([]);
    // Canonical set unchanged.
    expect(t.game.group.list().map((m) => m.id)).toEqual([2, 4]);
    p.dispose();
  });

  it('Group: a new vital keeps the row and sets the bar in place; a new status rebuilds it', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 40, 8);
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: [{ id: 2, type: 'ally', name: 'Gibur', hp: 100, maxhp: 200 }] });
    t.flush();
    const row = () => p.content.querySelector<HTMLElement>('[data-key="m2"]')!;
    const hp = () => row().querySelector<HTMLElement>('.wc-gp-bar[data-kind="hp"]')!;
    const first = row();
    expect(hp().querySelector<HTMLElement>('.wc-gp-fill')!.style.getPropertyValue('--p')).toBe('50');
    t.bus.emit('gmcp', { pkg: 'Group.Update', data: { id: 2, hp: 150 } });
    t.flush();
    expect(row()).toBe(first);
    expect(hp().querySelector<HTMLElement>('.wc-gp-fill')!.style.getPropertyValue('--p')).toBe('75');
    expect(hp().dataset.tipTitle).toBe('HP 150/200 · 75%');
    t.bus.emit('gmcp', { pkg: 'Group.Update', data: { id: 2, poison: true } });
    t.flush();
    expect(row()).not.toBe(first);
    p.dispose();
  });

  it('Timers: Pulse lands on a long spell under warnAt (the item, so its icon pulses too)', () => {
    const t = setup();
    const p = PANE_FACTORIES.timers(t.ctx) as TimersPane;
    place(p, 40, 8);
    const now = Date.now();
    t.settings.update({ timers: { signal: 'pulse', warnAt: 20 } });
    t.game.timers.debugAdd({ id: 'armour', name: 'armour', group: 'spell', startedAt: now - 585_000, expiresAt: now + 15_000, expected: 600_000, tracked: true });
    t.game.timers.debugAdd({ id: 'shield', name: 'shield', group: 'spell', startedAt: now, expiresAt: now + 300_000, expected: 600_000, tracked: true });
    t.flush();
    const item = (id: string) => p.content.querySelector<HTMLElement>(`.wc-tm-list [data-id="${id}"]:not(button)`)!;
    expect(item('armour').classList.contains('is-pulse')).toBe(true);
    expect(item('armour').querySelector('.wc-tm-ic')).not.toBeNull();
    expect(item('shield').classList.contains('is-pulse')).toBe(false);
    t.settings.update({ timers: { style: 'circles' } });
    t.flush();
    expect(item('armour').classList.contains('is-pulse')).toBe(true);
    expect(item('armour').querySelector('.wc-tm-ii')).not.toBeNull();
    p.dispose();
  });

  it('Timers draws game.timers, follows the options and handles clicks', () => {
    const t = setup();
    const p = PANE_FACTORIES.timers(t.ctx) as TimersPane;
    expect(p).toBeInstanceOf(TimersPane);
    place(p, 40, 8);
    const now = Date.now();
    const cell = (id: string, group: 'spell' | 'blind' | 'charm') =>
      ({ id, name: id, group, startedAt: now, expiresAt: now + 60_000, expected: 60_000, tracked: true }) as const;
    t.game.timers.debugAdd({ ...cell('armour', 'spell') });
    t.game.timers.debugAdd({ ...cell('a dark-skinned orc', 'blind') });
    t.game.timers.debugAdd({ ...cell('troll', 'charm') });
    t.game.timers.debugHerbs([{ key: 'healing', name: 'Healing' }]);
    t.flush();
    const groups = () => [...p.content.querySelectorAll<HTMLElement>('.wc-tm-g')].map((g) => g.dataset.group);
    const names = () => [...p.content.querySelectorAll('.wc-tm-list .wc-tm-n')].map((n) => n.textContent);
    // Herblore is there while enabled, even empty (its header holds the +).
    expect(groups()).toEqual(['herb', 'spell', 'blind', 'charm']);
    expect(names()).toEqual(['Armour', 'dark-skinned orc', 'Troll']);
    // Headers: the group name only (no count); Herblore's has its +.
    const heads = [...p.content.querySelectorAll<HTMLElement>('.wc-tm-h')];
    expect(heads.map((h) => h.textContent)).toEqual(['Herblores+', 'Spells', 'Blinds', 'Charmies']);
    // Bars by default: a pill with a fill; the time text is on.
    const chip = p.content.querySelector<HTMLElement>('.wc-tm-chip[data-id="spell:armour"], .wc-tm-chip[data-id="armour"]')!;
    expect(chip.querySelector<HTMLElement>('.wc-tm-fill')!.style.width).toMatch(/^(100\.0|9\d\.\d)%$/);
    expect(chip.querySelector('.wc-tm-t')!.textContent).toMatch(/^(59|60)s$/);
    expect(chip.dataset.tipTitle).toBe('Armour');
    // Circles: a ring row; headers off hide them; a group off goes.
    t.settings.update({ timers: { style: 'circles', groups: { blind: { enabled: false } }, headers: false } });
    t.flush();
    expect(groups()).toEqual(['herb', 'spell', 'charm']);
    expect(p.content.querySelectorAll('.wc-tm-rc')).toHaveLength(2);
    expect(p.content.querySelectorAll('.wc-tm-chip')).toHaveLength(0);
    // Headers off: all hidden but Herblore's.
    const shown = [...p.content.querySelectorAll<HTMLElement>('.wc-tm-h')].filter((h) => !h.hidden);
    expect(shown.map((h) => h.textContent)).toEqual(['Herblores+']);
    // × forgets the charmie.
    p.content.querySelector('.wc-tm-x')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(groups()).toEqual(['herb', 'spell']);
    // Herblore's + opens the menu; a pick starts the herb and closes it.
    const add = p.content.querySelector<HTMLElement>('.wc-tm-add')!;
    expect(add.hidden).toBe(false);
    add.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(p.herbMenuOpen).toBe(true);
    const row = () => p.herbMenuEl.querySelector<HTMLButtonElement>('.wc-tm-mi')!;
    expect(row().textContent).toBe('+Healing');
    row().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(p.herbMenuOpen).toBe(false);
    // The herblore tracker starts the herb (its first phase's cell).
    expect(names()).toEqual(['Healing', 'Armour']);
    // Running: checked in the menu, not pickable; Esc closes the menu.
    add.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(row().disabled).toBe(true);
    expect(row().textContent).toBe('✓Healing');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(p.herbMenuOpen).toBe(false);
    // An outside press closes it too.
    add.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(p.herbMenuOpen).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(p.herbMenuOpen).toBe(false);
    // The herb's × stops it.
    p.content.querySelector<HTMLElement>('.wc-tm-x.is-herb')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(names()).toEqual(['Armour']);
    // Herblore off: no group, no +.
    t.settings.update({ timers: { groups: { herb: { enabled: false } } } });
    t.flush();
    expect(groups()).toEqual(['spell']);
    // A disconnect blanks the pane.
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    t.flush();
    expect(p.content.textContent).toBe('');
    p.dispose();
  });

  it('Timers in a log player: no Herblore + and no charm ×', () => {
    const t = setup();
    (t.ctx as { player?: boolean }).player = true;
    const p = new TimersPane(t.ctx);
    place(p, 40, 8);
    const now = Date.now();
    t.game.timers.debugAdd({ id: 'troll', name: 'troll', group: 'charm', startedAt: now, expiresAt: now + 60_000, expected: 60_000, tracked: true });
    t.flush();
    expect(p.content.querySelector<HTMLElement>('.wc-tm-add')!.hidden).toBe(true);
    expect(p.content.querySelector('.wc-tm-x')).toBeNull();
    p.dispose();
  });

  it('keeps the last picture after a replay ends until the next connection', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 31, 6);
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: [{ id: 2, type: 'ally', name: 'Gibur' }] });
    t.flush();
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing', replay: true });
    t.flush();
    expect(p.active).toBe(true);
    expect(p.content.textContent).toContain('Gibur');
    t.bus.emit('conn.state', { state: 'connecting', prev: 'disconnected', replay: true });
    t.flush();
    expect(p.active).toBe(false);
    expect(p.content.textContent).toBe('');
    expect(t.game.group.list()).toEqual([]);
    p.dispose();
  });
});
