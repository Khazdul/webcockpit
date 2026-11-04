// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { GroupModel } from '../../src/gmcp/group';
import { GameState } from '../../src/gmcp/state';
import { createPaneContext } from '../../src/panes/context';
import {
  FIGHT_ROWS,
  GROUP_DARK,
  GROUP_LIGHT,
  GroupPane,
  type MemberEnv,
  barView,
  fightView,
  groupLayout,
  memberView,
  positionView,
  sanctView,
  shortTime,
  vitalColor,
} from '../../src/panes/group';
import { DARK_COLORS, DARK_SIGNALS, LIGHT_SIGNALS } from '../../src/panes/palette';
import { SettingsStore } from '../../src/settings';

const VITALS = { hp: DARK_COLORS.hp, mana: DARK_COLORS.mana, mp: DARK_COLORS.mp };

function env(over: Partial<MemberEnv> = {}): MemberEnv {
  return {
    light: false,
    colors: GROUP_DARK,
    vitals: VITALS,
    sanct: DARK_COLORS.sanct,
    away: 'room',
    isAway: () => false,
    tankId: null,
    sanctCell: () => undefined,
    now: 0,
    ...over,
  };
}

function model(): GroupModel {
  const g = new GroupModel();
  g.apply('Room.Info', { id: 100 });
  g.apply('Group.Set', [
    { id: 2, type: 'ally', name: 'Gibur', hp: 132, maxhp: 160, mana: 40, maxmana: 100, mp: 72, maxmp: 110, position: 'standing', ride: true, sanctuary: true, mapid: 100 },
    { id: 3, type: 'neutral', name: 'Morwen', hp: 37, maxhp: 158, position: 'resting', poison: true, thirsty: true, mapid: 101, room: 'Prancing Pony' },
    { id: 4, type: 'npc', name: 'a citizen mercenary', label: 'MERC', 'hp-string': 'wounded', 'mana-string': 0, bashed: true },
    { id: 5, type: 'enemy', name: 'Grishnak', hp: 10, maxhp: 10 },
  ]);
  return g;
}

describe('groupLayout', () => {
  it('two lines when everything fits, else one line, else the first ones and more', () => {
    expect(groupLayout(3, false, 6)).toEqual({ lines: 2, fightRows: 0, shown: 3, more: 0 });
    expect(groupLayout(3, true, 6 + FIGHT_ROWS)).toEqual({ lines: 2, fightRows: FIGHT_ROWS, shown: 3, more: 0 });
    expect(groupLayout(4, false, 6)).toEqual({ lines: 1, fightRows: 0, shown: 4, more: 0 });
    expect(groupLayout(3, true, 6)).toEqual({ lines: 1, fightRows: 1, shown: 3, more: 0 });
    expect(groupLayout(9, true, 6)).toEqual({ lines: 1, fightRows: 1, shown: 4, more: 5 });
    expect(groupLayout(0, false, 0)).toEqual({ lines: 2, fightRows: 0, shown: 0, more: 0 });
  });
});

describe('bars', () => {
  it('colour: the setting, orange at ≤ 45 %, red at ≤ 25 %, by side', () => {
    expect(vitalColor('#123456', 0.9, false)).toBe('#123456');
    expect(vitalColor('#123456', 0.45, false)).toBe(DARK_SIGNALS.vitalLow);
    expect(vitalColor('#123456', 0.25, true)).toBe(LIGHT_SIGNALS.vitalCritical);
    expect(vitalColor('#123456', null, false)).toBe('#123456');
  });

  it('tooltips: numbers when known, the band word with about, unknown', () => {
    const known = barView('hp', { value: 37, max: 158, word: null }, '#00ff00', false);
    expect(known).toMatchObject({ pct: 23, est: false, title: 'HP 37/158 · 23%', color: DARK_SIGNALS.vitalCritical });
    const word = barView('hp', { value: null, max: null, word: 'wounded' }, '#00ff00', false);
    expect(word).toMatchObject({ pct: 36, est: true, title: 'HP · wounded', tip: 'About 36% (the band word).' });
    const none = barView('mana', { value: null, max: null, word: null }, '#00ff00', false);
    expect(none).toMatchObject({ pct: 0, color: '', title: 'Mana', tip: 'Unknown' });
  });
});

describe('memberView', () => {
  it('markers by type, NPC tag, statuses, position and the tank', () => {
    const g = model();
    const [gibur, morwen, merc, enemy] = g.list().map((m) => memberView(m, env({ tankId: 2, isAway: (x) => g.isAway(x) })));
    expect(gibur!.marker).toMatchObject({ icon: 'player', color: GROUP_DARK.ally });
    expect(gibur!.tank).toBe(true);
    expect(gibur!.position).toMatchObject({ icon: 'riding', title: 'Riding' });
    expect(gibur!.statuses.map((s) => s.icon)).toEqual(['sanct']);
    expect(gibur!.nameTip).toBe('Player, ally. Here. Tanking.');
    expect(morwen!.marker).toMatchObject({ icon: 'player', color: GROUP_DARK.neutral });
    expect(morwen!.statuses.map((s) => s.icon)).toEqual(['poison', 'thirsty']);
    expect(morwen!.away).toBe(true);
    expect(morwen!.room).toBe('Prancing Pony');
    expect(morwen!.nameTip).toBe('Player, neutral race. At Prancing Pony.');
    expect(merc!).toMatchObject({ title: 'a citizen mercenary (MERC)', tag: 'MERC', player: false });
    expect(merc!.marker.icon).toBe('npc');
    expect(merc!.bars[0]!.est).toBe(true);
    expect(enemy!.marker).toMatchObject({ icon: 'enemy', color: GROUP_DARK.enemy });
  });

  it('away: room shows the room name, dim only dims', () => {
    const g = model();
    const morwen = g.get(3)!;
    expect(memberView(morwen, env({ isAway: () => true, away: 'room' }))).toMatchObject({ dim: true, room: 'Prancing Pony' });
    expect(memberView(morwen, env({ isAway: () => true, away: 'dim' }))).toMatchObject({ dim: true, room: null });
  });

  it('light side colours', () => {
    const g = model();
    expect(memberView(g.get(2)!, env({ colors: GROUP_LIGHT, light: true })).marker.color).toBe(GROUP_LIGHT.ally);
  });
});

describe('sanctuary and position', () => {
  it('timed by you: a ring with the time; untimed: unknown', () => {
    const cell = { id: 'sanct:2', name: 'Gibur', group: 'sanct' as const, startedAt: 0, expiresAt: 192_000, expected: 270_000, tracked: true, estimated: true };
    const v = sanctView(cell, '#f0b6e4', 0);
    expect(v.ring!.frac).toBeCloseTo(192 / 270);
    expect(v.time).toBe('4m');
    expect(v.tip).toBe('Cast by you: about 3:12 left.');
    const untimed = sanctView(undefined, '#f0b6e4', 0);
    expect(untimed.ring).toEqual({ frac: null });
    expect(untimed.time).toBeUndefined();
    expect(shortTime(90)).toBe('90s');
    expect(shortTime(91)).toBe('2m');
    expect(shortTime(6720)).toBe('1h52');
  });

  it('position icons and titles', () => {
    expect(positionView(null, false, GROUP_DARK)).toBeNull();
    expect(positionView('sleeping', false, GROUP_DARK)).toMatchObject({ icon: 'sleeping', color: GROUP_DARK.sleep, title: 'Sleeping' });
    expect(positionView('fighting', true, GROUP_DARK)).toMatchObject({ icon: 'fighting', title: 'Fighting', tip: 'Mounted.' });
    expect(positionView(null, true, GROUP_DARK)).toMatchObject({ icon: 'riding', title: 'Riding' });
  });
});

describe('fightView', () => {
  it('none without an opponent', () => {
    const f = { opponent: null, opponentWord: null, opponentMember: null, tank: null, tankId: null };
    expect(fightView(f, null, { name: null, hp: null, maxhp: null }, env())).toBeNull();
  });

  it('a member tanks; the opponent by its band word', () => {
    const g = model();
    const f = { opponent: 'a black-robed orc', opponentWord: 'badly wounded', opponentMember: null, tank: 'Gibur', tankId: 2 };
    const v = fightView(f, g.get(2)!, { name: 'Rasta', hp: 50, maxhp: 100 }, env())!;
    expect(v.tank).toMatchObject({ name: 'Gibur', numbers: '132/160' });
    expect(v.foe).toMatchObject({ name: 'a black-robed orc', word: 'badly wounded' });
    expect(v.foe.bar.color).toBe(GROUP_DARK.foe);
    expect(v.foe.bar.title).toBe('HP · badly wounded');
  });

  it('you tank (your own name, or no buffer): the opponent alone', () => {
    const f = { opponent: 'an orc', opponentWord: 'hurt', opponentMember: null, tank: 'rasta', tankId: null };
    const v = fightView(f, null, { name: 'Rasta', hp: 50, maxhp: 100 }, env())!;
    expect(v.tank).toBeNull();
    expect(v.foe.bar.pct).toBe(58);
    expect(fightView({ ...f, tank: null }, null, { name: 'Rasta', hp: 50, maxhp: 100 }, env())!.tank).toBeNull();
  });

  it('another buffer outside the group: its name only', () => {
    const f = { opponent: 'an orc', opponentWord: 'hurt', opponentMember: null, tank: 'Legolas', tankId: null };
    expect(fightView(f, null, { name: 'Rasta', hp: 50, maxhp: 100 }, env())!.tank).toEqual({ name: 'Legolas', bar: null, numbers: '' });
  });
});

describe('GroupPane', () => {
  function setup() {
    const bus = new Bus();
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    const game = new GameState().attach(bus);
    const frames: (() => void)[] = [];
    const ctx = createPaneContext({ doc: document, bus, settings, game, requestFrame: (cb) => frames.push(cb), connState: () => 'playing' });
    const flush = () => {
      while (frames.length) frames.shift()!();
    };
    return { bus, settings, game, ctx, flush };
  }
  const place = (p: GroupPane, w: number, h: number) =>
    p.place({ rect: { x: 0, y: 0, w, h }, content: { x: 0, y: 0, w, h }, framed: false }, { w: 8, h: 16 });
  const set = [
    { id: 2, type: 'ally', name: 'Gibur', hp: 132, maxhp: 160 },
    { id: 3, type: 'ally', name: 'Taube', hp: 37, maxhp: 158, sanctuary: true },
  ];

  it('two-line rows, then one line when crowded, then the more row', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 40, 6);
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: set });
    t.flush();
    expect(p.content.querySelectorAll('.wc-gp-m2')).toHaveLength(2);
    place(p, 40, 3);
    t.flush();
    expect(p.content.querySelectorAll('.wc-gp-m1')).toHaveLength(2);
    place(p, 40, 1);
    t.flush();
    expect(p.content.querySelector('.wc-gp-over')!.textContent).toBe('↓ 2 more members');
    p.dispose();
  });

  it('the fight zone comes and goes with the opponent', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 40, 10);
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: set });
    t.bus.emit('gmcp', { pkg: 'Char.Vitals', data: { buffer: 'Gibur', opponent: 'a black-robed orc', 'opponent-hits': 'hurt' } });
    t.flush();
    const zone = p.content.querySelector('.wc-gp-fight')!;
    expect(zone.querySelector('.wc-gp-fn')!.textContent).toBe('Gibur');
    expect(zone.querySelector('.wc-gp-fn.is-foe')!.textContent).toBe('a black-robed orc');
    // No divider between the card and the members (owner round 1).
    expect(p.content.querySelector('.wc-gp-sep')).toBeNull();
    // The tank is marked in the list too.
    expect(p.content.querySelector('[data-key="m2"] [data-tip-title="Tanking"]')).not.toBeNull();
    t.bus.emit('gmcp', { pkg: 'Char.Vitals', data: { opponent: null } });
    t.flush();
    expect(p.content.querySelector('.wc-gp-fight')).toBeNull();
    p.dispose();
  });

  it('you tank (buffer Nobody): the card is the opponent alone; the Fight card setting turns it off', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 40, 10);
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: set });
    t.bus.emit('gmcp', { pkg: 'Char.Vitals', data: { buffer: 'Nobody', opponent: 'a large bat', 'opponent-hits': 'healthy' } });
    t.flush();
    const zone = p.content.querySelector('.wc-gp-fight')!;
    expect(zone.classList.contains('is-solo')).toBe(true);
    expect([...zone.querySelectorAll('.wc-gp-fn')].map((e) => e.textContent)).toEqual(['a large bat']);
    expect(zone.textContent).not.toContain('Nobody');
    expect(zone.querySelector('.wc-gp-vs')).toBeNull();
    // Nobody is not a tank in the list either.
    expect(p.content.querySelector('[data-tip-title="Tanking"]')).toBeNull();
    // Crowded (one line): the strip is the opponent alone too.
    place(p, 40, 3);
    t.flush();
    const strip = p.content.querySelector('.wc-gp-fstrip')!;
    expect(strip.classList.contains('is-solo')).toBe(true);
    expect(strip.textContent).toBe('a large bat');
    // The Fight card off: no card, no strip.
    t.settings.update({ group: { fight: false } });
    t.flush();
    expect(p.content.querySelector('.wc-gp-fight, .wc-gp-fstrip')).toBeNull();
    p.dispose();
  });

  it('bars are solid: no hatched estimate class', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 40, 10);
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: [{ id: 6, type: 'npc', name: 'a hungry warg', label: 'MIN', 'hp-string': 'wounded' }] });
    t.flush();
    expect(p.content.querySelectorAll('.wc-gp-fill').length).toBeGreaterThan(0);
    expect(p.content.querySelector('.is-est')).toBeNull();
    p.dispose();
  });

  it('tooltips on the bars and the sanctuary icon; colours follow the settings', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 40, 6);
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: set });
    t.flush();
    const hp = p.content.querySelector<HTMLElement>('[data-key="m3"] .wc-gp-bar[data-kind="hp"]')!;
    expect(hp.dataset.tipTitle).toBe('HP 37/158 · 23%');
    const sanct = p.content.querySelector<HTMLElement>('[data-key="m3"] [data-tip-title="Sanctuary"]')!;
    expect(sanct.dataset.tip).toBe('Glowing. Not cast by you, so the time is unknown.');
    const fill = () => p.content.querySelector<HTMLElement>('[data-key="m2"] .wc-gp-bar[data-kind="hp"] .wc-gp-fill')!.style.backgroundColor;
    const auto = fill();
    t.settings.update({ group: { colors: { hp: '#e0566a' } } });
    t.flush();
    expect(fill()).not.toBe(auto);
    expect(['#e0566a', 'rgb(224, 86, 106)']).toContain(fill());
    p.dispose();
  });

  it('away members: the room name or dimmed only', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 40, 6);
    t.bus.emit('gmcp', { pkg: 'Room.Info', data: { id: 100 } });
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: [{ id: 2, type: 'ally', name: 'Gibur', mapid: 7, room: 'Prancing Pony' }] });
    t.flush();
    const row = () => p.content.querySelector('[data-key="m2"]')!;
    expect(row().classList.contains('is-away')).toBe(true);
    expect(row().querySelector('.wc-gp-where')!.textContent).toBe('Prancing Pony');
    t.settings.update({ group: { away: 'dim' } });
    t.flush();
    expect(row().classList.contains('is-away')).toBe(true);
    expect(row().querySelector('.wc-gp-where')).toBeNull();
    p.dispose();
  });
});
