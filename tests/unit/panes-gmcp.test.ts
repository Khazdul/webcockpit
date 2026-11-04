// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { CharModel } from '../../src/gmcp/char';
import { GroupModel } from '../../src/gmcp/group';
import { GameState } from '../../src/gmcp/state';
import { CHARACTER_ROWS, CharacterPane, characterLines, colWidths, gaugeWidths, toothPositions } from '../../src/panes/character';
import { createPaneContext } from '../../src/panes/context';
import { CellLine, centre } from '../../src/panes/grid';
import { BAR_ORANGE, BAR_RED, GroupPane, barColor, barFill, barWidths, groupLines } from '../../src/panes/group';
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

describe('Group layout', () => {
  it('bar widths, fill and colours', () => {
    expect(barWidths(31)).toEqual([11, 10, 10]);
    expect(barWidths(32)).toEqual([11, 11, 10]);
    expect(barWidths(2)).toEqual([1, 1, 0]);
    expect(barFill(0.5, 11)).toBe(6); // 5.5 rounds up
    expect(barFill(null, 11)).toBe(0);
    expect(barFill(1.2, 11)).toBe(11);
    expect(barColor('hp', 0.25, false)).toBe(BAR_RED);
    expect(barColor('hp', 0.45, true)).toBe(BAR_ORANGE);
    expect(barColor('hp', 0.46, false)).toBe('#005a18');
    expect(barColor('hp', null, false)).toBe('#005a18');
    // Light pane: default fills washed to pastels.
    expect(barColor('hp', 1, true)).toBe('#90d5a2');
    expect(barColor('mana', 1, true)).toBe('#9090d5');
    expect(barColor('mp', 1, true)).toBe('#c4b3a1'); // Cockpit #c4b2a1 (rounding)
  });

  it('draws rows with the name overlay and overflow', () => {
    const g = new GroupModel();
    g.apply('Group.Set', [
      { id: 2, type: 'ally', name: 'Gibur', hp: 140, maxhp: 140, mana: 20, maxmana: 90, mp: 50, maxmp: 100 },
      { id: 4, type: 'npc', name: 'a citizen mercenary', label: 'MERC', hp: 200, maxhp: 200, 'mana-string': 'Full', mp: 150, maxmp: 150 },
      { id: 5, type: 'ally', name: 'Dori', 'hp-string': 'Wounded' },
    ]);
    const lines = groupLines(g.list(), 31, 6, '#aaaaaa', false);
    expect(lines.map((l) => l.text().trimEnd())).toEqual(['Gibur', 'a citizen mercenary (MERC)', 'Dori']);
    const gibur = lines[0]!;
    expect(gibur.bg.slice(0, 11).every((b) => b === '#005a18')).toBe(true);
    // Mana 20/90 = 22 % → red, 2 of 10 cells.
    expect(gibur.bg.slice(11, 21)).toEqual([BAR_RED, BAR_RED, '', '', '', '', '', '', '', '']);
    expect(gibur.fg[0]).toBe('#aaaaaa');
    // Dori: only a word → band midpoint 35.5 % → orange, 4 of 11 cells.
    expect(lines[2]!.bg.slice(0, 5)).toEqual([BAR_ORANGE, BAR_ORANGE, BAR_ORANGE, BAR_ORANGE, '']);
    const clipped = groupLines(g.list(), 31, 2, '#aaaaaa', false);
    expect(clipped.map((l) => l.text().trimEnd())).toEqual(['Gibur', '↓ 2 more members']);
    expect(groupLines([], 31, 6, '#aaaaaa', false)).toEqual([]);
    // Truncated to W without an ellipsis.
    expect(groupLines(g.list(), 8, 6, '#aaaaaa', false)[1]!.text()).toBe('a citize');
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
    const names = () => [...p.content.querySelectorAll('.wc-prow')].map((r) => r.textContent!.trimEnd());
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

  it('Timers draws game.timers, follows the options and handles clicks', () => {
    const t = setup();
    const p = PANE_FACTORIES.timers(t.ctx) as TimersPane;
    expect(p).toBeInstanceOf(TimersPane);
    place(p, 20, 6);
    const now = Date.now();
    const cell = (id: string, group: 'spell' | 'blind' | 'charm') =>
      ({ id, name: id, group, startedAt: now, expiresAt: now + 60_000, expected: 60_000, tracked: true }) as const;
    t.game.timers.debugAdd({ ...cell('armour', 'spell') });
    t.game.timers.debugAdd({ ...cell('2.orc', 'blind') });
    t.game.timers.debugAdd({ ...cell('troll', 'charm') });
    t.game.timers.debugHerbs([{ key: 'healing', name: 'Healing' }]);
    t.settings.update({ timers: { timeText: false } });
    t.flush();
    const rows = () => [...p.content.querySelectorAll('.wc-prow')].map((r) => r.textContent!.trimEnd());
    expect(rows()).toEqual(['Spells:            +', 'ARMOUR             ▌', 'Blinds:', '2.ORC              ▌', 'Charmies:', 'Troll           0m ×']);
    t.settings.update({ timers: { groups: { blind: { enabled: false } }, headers: false } });
    t.flush();
    expect(rows()).toEqual(['ARMOUR             +', 'Troll           0m ×']);
    const hit = (sel: string) => p.content.querySelector<HTMLElement>(`.wc-timers-hit${sel}`)!;
    hit('[data-hit="charm"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(rows()).toEqual(['ARMOUR             +']);
    hit('[data-hit="corner"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(p.viewMode).toBe('add');
    // The herblore tracker's catalogue (six entries) follows the debug herb.
    expect(rows()[0]).toBe('[+] Healing        ×');
    hit('[data-hit="herb"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(rows()[0]).toBe('[-] Healing        ×');
    // A disconnect blanks the pane and returns to the grid.
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    t.flush();
    expect(p.content.textContent).toBe('');
    expect(p.viewMode).toBe('grid');
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
