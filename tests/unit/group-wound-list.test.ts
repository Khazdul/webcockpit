// The list leads over a stale flag (stage 77, ADR 0166 addendum 36): your
// own `stat` / `info` list clears a `wound` / `poison` flag MUME left on
// (the owner's Stewash run, 2026-11-25: no `wound: false` after a death).
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { Line } from '../../src/core/types';
import { GroupModel } from '../../src/gmcp/group';
import type { InfoAnswer, PollAnswer, PolledVitals } from '../../src/gmcp/info-answer';
import { GameState, type GamePart } from '../../src/gmcp/state';
import { stoneTip, stoneView } from '../../src/panes/character-stones';
import { ScriptEngine } from '../../src/script/engine';
import { emptyView } from '../../src/timers/entry';
import { DEFAULT_SETTINGS } from '../../src/settings/types';

const T = 1_795_594_472_704;
const line = (text: string): Line => ({ text, runs: [], tags: [], prompt: false, raw: text, ts: 0 });

const SELF = {
  bashed: false,
  blind: false,
  hungry: false,
  id: 1,
  poison: false,
  sanctuary: false,
  slept: false,
  snared: false,
  thirsty: false,
  type: 'you',
  waiting: false,
  wound: false,
};

function setup() {
  const bus = new Bus();
  const game = new GameState({ now: () => T, storage: null }).attach(bus);
  const parts: GamePart[] = [];
  game.subscribe((p) => parts.push(p));
  const engine = new ScriptEngine({ send: () => {}, message: () => {} });
  engine.attach(bus);
  game.installRules(engine.system);
  game.timers.installRules(engine.system);
  const gmcp = (pkg: string, data: unknown): void => bus.emit('gmcp', { pkg, data });
  const lines = (...texts: string[]): void => {
    for (const s of texts) engine.processLine(line(s));
  };
  /** The player's own `stat`'s affects block, ended by the prompt. */
  const stat = (...items: string[]): void => lines('Affected by:', ...items.map((i) => `- ${i}`), '', 'o[ HP:Bad>');
  gmcp('Group.Set', [SELF]);
  return { game, parts, gmcp, lines, stat };
}

const NO_VITALS = { hp: null, maxhp: null, mana: null, maxmana: null, mp: null, maxmp: null } as unknown as PolledVitals;
const pollAnswer = (affects: string[]): PollAnswer => ({ info: {} as InfoAnswer, vitals: NO_VITALS, affects });

describe('GameState: the list clears a stale own flag', () => {
  it('the Stewash sequence: a wound kept while listed, cleared by a list without it, set again by GMCP', () => {
    const t = setup();
    t.gmcp('Group.Update', { id: 1, wound: true });
    expect(t.game.group.selfFlags.wound).toBe(true);
    t.stat('a serious wound at the left hand (clean)');
    expect(t.game.group.selfFlags.wound).toBe(true);
    expect(t.game.group.selfWounds).toEqual(['a serious wound at the left hand (clean)']);
    // It worsens: the lines follow, the flag stays.
    t.parts.length = 0;
    const v = t.game.group.version;
    t.stat('comfortable', 'a deep wound at the left hand (clean)');
    expect(t.game.group.selfWounds).toEqual(['a deep wound at the left hand (clean)']);
    expect(t.parts).toContain('group');
    expect(t.game.group.version).toBeGreaterThan(v);
    // The same list again: no change.
    t.parts.length = 0;
    t.stat('comfortable', 'a deep wound at the left hand (clean)');
    expect(t.parts).not.toContain('group');
    // "You are dead! Sorry...": no Group message; the next stat lists only comfortable.
    t.lines('You are dead! Sorry...');
    expect(t.game.group.selfFlags.wound).toBe(true);
    t.stat('comfortable');
    expect(t.game.group.selfFlags.wound).toBe(false);
    expect(t.game.group.selfWounds).toEqual([]);
    expect(t.parts).toContain('group');
    // A later GMCP wound sets it again.
    t.gmcp('Group.Update', { id: 1, wound: true });
    expect(t.game.group.selfFlags.wound).toBe(true);
    expect(t.game.group.selfWounds).toEqual([]);
  });

  it("info's temporary effects block clears it too, and an empty stat block", () => {
    const t = setup();
    t.gmcp('Group.Update', { id: 1, wound: true });
    t.lines('You are subjected to the following temporary effects:', '- comfortable', '', 'o>');
    expect(t.game.group.selfFlags.wound).toBe(false);
    t.gmcp('Group.Update', { id: 1, wound: true });
    t.lines('Affected by:', '', 'o>');
    expect(t.game.group.selfFlags.wound).toBe(false);
  });

  it('poison the same', () => {
    const t = setup();
    t.gmcp('Group.Update', { id: 1, poison: true });
    t.stat('poison (type: poison)', 'Orkish draught');
    expect(t.game.group.selfFlags.poison).toBe(true);
    t.stat('Orkish draught');
    expect(t.game.group.selfFlags.poison).toBe(false);
    t.gmcp('Group.Update', { id: 1, poison: true });
    expect(t.game.group.selfFlags.poison).toBe(true);
  });

  it('a list with a wound or poison line never sets the flag', () => {
    const t = setup();
    t.parts.length = 0;
    t.stat('poison (type: poison)', 'a light wound at the head (clean)');
    expect(t.game.group.selfFlags.wound).toBe(false);
    expect(t.game.group.selfFlags.poison).toBe(false);
    expect(t.game.group.selfWounds).toEqual([]);
    // The wound line is a light wound (addendum 38), not the flag.
    expect(t.game.group.selfLightWounds).toEqual(['a light wound at the head (clean)']);
  });

  it('the other flags are left alone', () => {
    const t = setup();
    t.gmcp('Group.Update', { id: 1, hungry: true, blind: true, snared: true });
    t.stat('comfortable');
    expect(t.game.group.selfFlags).toMatchObject({ hungry: true, blind: true, snared: true });
  });

  it("the poll's %f clears a flag only once a poll answer has listed its form (addendum 37)", () => {
    const t = setup();
    t.gmcp('Group.Update', { id: 1, wound: true, poison: true });
    // No poll has listed a wound or a poison line yet: an answer without them clears nothing.
    t.game.applyPoll(pollAnswer(['comfortable']), null);
    expect(t.game.group.selfFlags).toMatchObject({ wound: true, poison: true });
    t.game.applyPoll(pollAnswer([]), null);
    expect(t.game.group.selfFlags).toMatchObject({ wound: true, poison: true });
    // A poll lists the wound: its lines are taken, and from now on the poll may clear the wound.
    t.game.applyPoll(pollAnswer(['a deep wound at the left hand (clean)']), null);
    expect(t.game.group.selfWounds).toEqual(['a deep wound at the left hand (clean)']);
    t.game.applyPoll(pollAnswer(['comfortable']), null);
    expect(t.game.group.selfFlags).toMatchObject({ wound: false, poison: true });
    // Poison the same, once a poll has listed it.
    t.game.applyPoll(pollAnswer(['poison (type: poison)']), null);
    t.game.applyPoll(pollAnswer([]), null);
    expect(t.game.group.selfFlags).toMatchObject({ poison: false });
  });

  it('a new connection forgets what the poll has listed', () => {
    const t = setup();
    t.gmcp('Group.Update', { id: 1, wound: true });
    t.game.applyPoll(pollAnswer(['a deep wound at the left hand (clean)']), null);
    t.game.resetCharacter();
    t.gmcp('Group.Set', [{ ...SELF, wound: true }]);
    t.game.applyPoll(pollAnswer([]), null);
    expect(t.game.group.selfFlags).toMatchObject({ wound: true });
  });
});

describe('GroupModel.noteSelfList', () => {
  it('a GMCP wound: false takes the lines along; a reset forgets them', () => {
    const g = new GroupModel();
    g.apply('Group.Set', [{ ...SELF, wound: true }]);
    expect(g.noteSelfList({ wounds: ['a light wound at the head (clean)'], poison: false })).toBe(true);
    expect(g.selfWounds).toHaveLength(1);
    g.apply('Group.Update', { id: 1, wound: false });
    expect(g.selfWounds).toEqual([]);
    g.apply('Group.Update', { id: 1, wound: true });
    g.noteSelfList({ wounds: ['a light wound at the head (clean)'], poison: false });
    g.reset();
    expect(g.selfWounds).toEqual([]);
  });

  it('without your own entry nothing changes', () => {
    const g = new GroupModel();
    const v = g.version;
    expect(g.noteSelfList({ wounds: [], poison: false })).toBe(false);
    expect(g.version).toBe(v);
  });
});

describe('the wound stone', () => {
  const show = DEFAULT_SETTINGS.character.stones;
  const flags = { ...new GroupModel().selfFlags, wound: true };

  it('one stone for many wounds; its tooltip lists them', () => {
    const wounds = ['a light wound at the head (clean)', 'a deep wound at the left hand (clean)'];
    const v = stoneView({ view: emptyView(), flags, show: { ...show, flags: true }, player: false, wounds });
    const st = v.stones.filter((s) => s.id === 'flag:wound');
    expect(st).toHaveLength(1);
    expect(stoneTip(st[0]!, T, 10).tip).toContain('Bleeding.\nA light wound at the head (clean)\nA deep wound at the left hand (clean)');
    // The key follows the lines (the card redraws the tooltip).
    const w = stoneView({ view: emptyView(), flags, show: { ...show, flags: true }, player: false, wounds: wounds.slice(1) });
    expect(w.key).not.toBe(v.key);
  });

  it('without lines: the plain text', () => {
    const v = stoneView({ view: emptyView(), flags, show: { ...show, flags: true }, player: false });
    expect(v.stones.find((s) => s.id === 'flag:wound')!.about).toBe('Bleeding.');
  });
});

describe('light wounds (addendum 38): listed, no GMCP flag', () => {
  it("the Stewash run of 09-41: a light wound in stat with wound false is a dimmed stone; the GMCP flag is untouched", () => {
    const t = setup();
    t.stat('a light wound at the right leg (clean)');
    expect(t.game.group.selfFlags.wound).toBe(false);
    expect(t.game.group.selfLightWounds).toEqual(['a light wound at the right leg (clean)']);
    const v = stoneView({
      view: emptyView(),
      flags: t.game.group.selfFlags,
      wounds: t.game.group.selfWounds,
      lightWounds: t.game.group.selfLightWounds,
      show: DEFAULT_SETTINGS.character.stones,
      player: false,
    });
    const s = v.stones.find((x) => x.id === 'flag:wound-light')!;
    expect(s).toMatchObject({ dim: true, label: 'Light wound' });
    expect(stoneTip(s, T, 10).tip).toContain('A light wound at the right leg (clean)');
    // A list without it takes it away.
    t.stat('comfortable');
    expect(t.game.group.selfLightWounds).toEqual([]);
  });

  it('GMCP wound true: the full stone, no light one; wound false forgets the lines until the next list (Rasta 09-29)', () => {
    const t = setup();
    t.stat('a light wound at the head (clean)');
    t.gmcp('Group.Update', { id: 1, wound: true });
    expect(t.game.group.selfLightWounds).toEqual([]);
    t.stat('a deep wound at the head (clean)');
    expect(t.game.group.selfLightWounds).toEqual([]);
    expect(t.game.group.selfWounds).toEqual(['a deep wound at the head (clean)']);
    t.gmcp('Group.Update', { id: 1, wound: false });
    expect(t.game.group.selfLightWounds).toEqual([]);
    t.stat('a light wound at the head (clean)', 'a light wound at the left foot (clean)');
    expect(t.game.group.selfFlags.wound).toBe(false);
    expect(t.game.group.selfLightWounds).toHaveLength(2);
  });

  it("the poll sets light wounds; it clears them only once a poll has listed a wound", () => {
    const t = setup();
    t.stat('a light wound at the right leg (clean)');
    t.game.applyPoll(pollAnswer(['comfortable']), null);
    expect(t.game.group.selfLightWounds).toHaveLength(1);
    t.game.applyPoll(pollAnswer(['a light wound at the right leg (clean)']), null);
    t.game.applyPoll(pollAnswer(['comfortable']), null);
    expect(t.game.group.selfLightWounds).toEqual([]);
  });
});
