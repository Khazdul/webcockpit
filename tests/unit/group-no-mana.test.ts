// @vitest-environment happy-dom
// A troll member in Group (stage 77 H9, ADR 0166 addendum 31): MUME sends
// `"mana-string": 0` and no mana numbers for it (the run exports: Grugg,
// Burpy, Dig and Soug, 8 adds, none of their 4 624 updates with a mana key).
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { GroupModel, vitalPct } from '../../src/gmcp/group';
import { GameState } from '../../src/gmcp/state';
import { createPaneContext } from '../../src/panes/context';
import { GroupPane } from '../../src/panes/group';
import { type MemberEnv, fightView, memberSig, memberView } from '../../src/panes/group-model';
import { DARK_COLORS, GROUP_DARK } from '../../src/panes/palette';
import { SettingsStore } from '../../src/settings';

const env: MemberEnv = {
  light: false,
  colors: GROUP_DARK,
  vitals: { hp: DARK_COLORS.hp, mana: DARK_COLORS.mana, mp: DARK_COLORS.mp },
  sanct: DARK_COLORS.sanct,
  away: 'room',
  isAway: () => false,
  tankId: null,
  sanctCell: () => undefined,
  now: 0,
};

/** Grugg's Group.Add as MUME sent it (run export 2026-11-17), trimmed. */
const GRUGG = { id: 4, type: 'ally', name: 'Grugg', hp: 491, 'hp-string': 'hurt', maxhp: 706, 'mana-string': 0, maxmp: 144, mp: 144, 'mp-string': 'unwearied', label: 0, position: 'resting' };
/** Orord's (an orc): mana numbers and a word. */
const ORORD = { id: 2, type: 'ally', name: 'Orord', hp: 356, maxhp: 361, mana: 50, maxmana: 50, 'mana-string': 'full', mp: 145, maxmp: 145, label: 0 };
/** Arvegil's, out of the room: a word and a maximum, no number. */
const ARVEGIL = { id: 3, type: 'ally', name: 'Arvegil', 'hp-string': 'fine', maxhp: 294, 'mana-string': 'cold', maxmana: 135, maxmp: 126, label: 0 };
/** A hungry warg (an NPC): the same `0`. */
const WARG = { id: 5, type: 'npc', name: 'hungry warg', 'hp-string': 'healthy', 'mana-string': 0, 'mp-string': 'unwearied', label: 'MIN' };

describe('GroupModel: no mana', () => {
  it('a troll ally has none; an orc ally, one out of the room and an NPC are as before', () => {
    const g = new GroupModel();
    g.apply('Group.Set', [GRUGG, ORORD, ARVEGIL, WARG]);
    expect(g.get(4)!.noMana).toBe(true);
    expect(g.get(2)!.noMana).toBe(false);
    expect(g.get(3)!.noMana).toBe(false);
    expect(g.get(5)!.noMana).toBe(true);
    // A 0 is no word: the bar is unknown, never a division by zero.
    expect(g.get(4)!.mana).toEqual({ value: null, max: null, word: null });
    expect(vitalPct('mana', { value: 0, max: 0, word: null })).toEqual({ pct: null, known: false });
  });

  it('updates without mana keep it; a mana number or word clears it', () => {
    const g = new GroupModel();
    g.apply('Group.Add', GRUGG);
    g.apply('Group.Update', { id: 4, hp: 500 });
    g.apply('Group.Update', { id: 4, mp: 140, 'mp-string': 'unwearied' });
    expect(g.get(4)!.noMana).toBe(true);
    expect(g.apply('Group.Update', { id: 4, 'mana-string': 'cold' })).toBe(true);
    expect(g.get(4)!.noMana).toBe(false);
  });
});

describe('memberView: a troll player shows no mana bar', () => {
  it('two bars for the troll, three for the others (an NPC keeps its three)', () => {
    const g = new GroupModel();
    g.apply('Group.Set', [GRUGG, ORORD, WARG]);
    expect(memberView(g.get(4)!, env).bars.map((b) => b.kind)).toEqual(['hp', 'mp']);
    expect(memberView(g.get(2)!, env).bars.map((b) => b.kind)).toEqual(['hp', 'mana', 'mp']);
    expect(memberView(g.get(5)!, env).bars.map((b) => b.kind)).toEqual(['hp', 'mana', 'mp']);
  });

  it('the row is rebuilt when the bars change', () => {
    const g = new GroupModel();
    g.apply('Group.Add', GRUGG);
    const before = memberSig(memberView(g.get(4)!, env), 2, '#fff');
    g.apply('Group.Update', { id: 4, mana: 3, maxmana: 10 });
    expect(memberSig(memberView(g.get(4)!, env), 2, '#fff')).not.toBe(before);
  });

  it('the fight card with a troll tank: its HP only, as always', () => {
    const g = new GroupModel();
    g.apply('Group.Add', GRUGG);
    g.apply('Char.Vitals', { buffer: 'Grugg', opponent: 'a black-robed orc', 'opponent-hits': 'hurt' });
    const f = fightView(g.fight(), g.get(4)!, 'Rasta', env)!;
    expect(f.tank).toMatchObject({ name: 'Grugg', numbers: '491/706' });
  });
});

describe('GroupPane: a troll member', () => {
  it('two bars sharing the width in both row forms', () => {
    const bus = new Bus();
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    const game = new GameState().attach(bus);
    const frames: (() => void)[] = [];
    const ctx = createPaneContext({ doc: document, bus, settings, game, requestFrame: (cb) => frames.push(cb), connState: () => 'playing' });
    const flush = (): void => {
      while (frames.length) frames.shift()!();
    };
    const p = new GroupPane(ctx);
    const place = (w: number, h: number): void => p.place({ rect: { x: 0, y: 0, w, h }, content: { x: 0, y: 0, w, h }, framed: false }, { w: 8, h: 16 });
    place(40, 6);
    bus.emit('gmcp', { pkg: 'Group.Set', data: [GRUGG, ORORD] });
    flush();
    const troll = p.content.querySelector('[data-key="m4"] .wc-gp-bars') as HTMLElement;
    expect(troll.dataset.bars).toBe('2');
    expect(troll.querySelectorAll('.wc-gp-bar')).toHaveLength(2);
    const orc = p.content.querySelector('[data-key="m2"] .wc-gp-bars') as HTMLElement;
    expect(orc.dataset.bars).toBeUndefined();
    expect(orc.querySelectorAll('.wc-gp-bar')).toHaveLength(3);
    place(40, 2);
    flush();
    const mini = p.content.querySelector('[data-key="m4"] .wc-gp-mini') as HTMLElement;
    expect(mini.dataset.bars).toBe('2');
    p.dispose();
  });
});
