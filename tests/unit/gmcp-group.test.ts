import { describe, expect, it } from 'vitest';
import { GroupModel, foldName, identityTokens, memberTitle, normLabel, vitalPct } from '../../src/gmcp/group';

const ally = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'ally',
  name,
  hp: 100,
  'hp-string': 'Healthy',
  maxhp: 100,
  mana: 50,
  'mana-string': 'Full',
  maxmana: 50,
  mp: 80,
  'mp-string': 'Rested',
  maxmp: 100,
  ...extra,
});
const npc = (id: number, name: string, label: unknown, extra: Record<string, unknown> = {}) => ({
  ...ally(id, name, extra),
  type: 'npc',
  label,
});

const ids = (g: GroupModel) => g.list().map((m) => m.id);
const all = { showPlayers: true, npcMode: 'all' as const };

describe('GroupModel membership', () => {
  it('Group.Set replaces all, excludes you, keeps unlabeled NPCs on the side', () => {
    const g = new GroupModel();
    g.apply('Group.Set', [
      { id: 1, type: 'you', name: 'Rasta' },
      ally(3, 'Dori'),
      ally(2, 'Gibur'),
      npc(4, 'a citizen mercenary', 'MERC'),
      npc(5, 'a large dog', 0),
      npc(6, 'a pony', ''),
      npc(7, 'a hawk', null),
    ]);
    expect(ids(g)).toEqual([2, 3, 4]);
    expect(g.unlabeled().map((m) => m.id)).toEqual([5, 6, 7]);
    expect(g.get(4)!.label).toBe('MERC');
    expect(g.get(5)!.label).toBeNull();
    g.apply('Group.Set', [ally(9, 'Ecthel')]);
    expect(ids(g)).toEqual([9]);
    expect(g.unlabeled()).toEqual([]);
    expect(g.apply('Group.Set', [])).toBe(true);
    expect(g.apply('Group.Set', [])).toBe(false);
  });

  it('Group.Remove takes a bare integer (or a numeric string / {id})', () => {
    const g = new GroupModel();
    g.apply('Group.Set', [ally(2, 'A'), ally(3, 'B'), ally(4, 'C'), npc(5, 'dog', 0)]);
    expect(g.apply('Group.Remove', 3)).toBe(true);
    expect(g.apply('Group.Remove', '4')).toBe(true);
    expect(g.apply('Group.Remove', { id: 2 })).toBe(true);
    expect(g.apply('Group.Remove', 5)).toBe(true);
    expect(g.apply('Group.Remove', 99)).toBe(false);
    expect(g.apply('Group.Remove', undefined)).toBe(false);
    expect(ids(g)).toEqual([]);
    expect(g.unlabeled()).toEqual([]);
  });

  it('is room-scoped: re-added with a new id, ordered by id', () => {
    const g = new GroupModel();
    g.apply('Group.Set', [ally(2, 'Gibur'), ally(3, 'Dori')]);
    g.apply('Group.Remove', 2);
    expect(ids(g)).toEqual([3]);
    g.apply('Group.Add', ally(7, 'Gibur', { hp: 131, maxhp: 140 }));
    expect(ids(g)).toEqual([3, 7]);
    expect(g.list().map((m) => m.name)).toEqual(['Dori', 'Gibur']);
    expect(vitalPct('hp', g.get(7)!.hp)).toEqual({ pct: 131 / 140, known: true });
  });

  it('promotes an NPC on a label and demotes it when the label clears', () => {
    const g = new GroupModel();
    g.apply('Group.Add', npc(6, 'a large dog', 0));
    expect(ids(g)).toEqual([]);
    expect(g.apply('Group.Update', { id: 6, label: 'DOG' })).toBe(true);
    expect(ids(g)).toEqual([6]);
    expect(memberTitle(g.get(6)!)).toBe('a large dog (DOG)');
    g.apply('Group.Update', { id: 6, label: 0 });
    expect(ids(g)).toEqual([]);
    expect(g.unlabeled().map((m) => m.id)).toEqual([6]);
    g.apply('Group.Update', { id: 6, label: 'DOG' });
    g.apply('Group.Update', { id: 6, label: null });
    expect(ids(g)).toEqual([]);
  });

  it('ignores updates for unknown ids without a type; you is removed', () => {
    const g = new GroupModel();
    expect(g.apply('Group.Update', { id: 1, hp: 158 })).toBe(false);
    expect(g.apply('Group.Update', ally(8, 'Late'))).toBe(true);
    expect(ids(g)).toEqual([8]);
    expect(g.apply('Group.Update', { id: 8, type: 'you' })).toBe(true);
    expect(ids(g)).toEqual([]);
    expect(g.apply('Group.Add', { id: 1, type: 'you', name: 'Me' })).toBe(true);
    expect(ids(g)).toEqual([]);
  });

  it('allies are never titled with a label', () => {
    const g = new GroupModel();
    g.apply('Group.Add', { ...ally(2, 'Gibur'), label: 'X' });
    expect(memberTitle(g.get(2)!)).toBe('Gibur');
  });

  it('display filter is display-only', () => {
    const g = new GroupModel();
    g.apply('Group.Set', [ally(2, 'Gibur'), npc(3, 'merc', 'M'), npc(4, 'dog', 0), ally(5, 'Dori')]);
    const names = (d: Parameters<GroupModel['displayed']>[0]) => g.displayed(d).map((m) => m.id);
    expect(names({ showPlayers: true, npcMode: 'labeled' })).toEqual([2, 3, 5]);
    expect(names({ showPlayers: false, npcMode: 'labeled' })).toEqual([3]);
    expect(names({ showPlayers: true, npcMode: 'off' })).toEqual([2, 5]);
    expect(names(all)).toEqual([2, 3, 4, 5]);
    expect(ids(g)).toEqual([2, 3, 5]);
  });

  it('reset forgets everything', () => {
    const g = new GroupModel();
    g.apply('Group.Set', [ally(2, 'Gibur')]);
    g.reset();
    expect(g.list()).toEqual([]);
  });
});

describe('vital-pair freshness (ADR 0052)', () => {
  const setup = () => {
    const g = new GroupModel();
    g.apply('Group.Add', ally(2, 'Dori', { hp: 95, 'hp-string': 'Fine', maxhp: 120 }));
    return g;
  };

  it('both halves: stores both', () => {
    const g = setup();
    g.apply('Group.Update', { id: 2, hp: 30, 'hp-string': 'Wounded' });
    expect(g.get(2)!.hp).toEqual({ value: 30, max: 120, word: 'Wounded' });
  });

  it('value only: drops the stale word', () => {
    const g = setup();
    g.apply('Group.Update', { id: 2, hp: 61 });
    expect(g.get(2)!.hp).toEqual({ value: 61, max: 120, word: null });
    expect(vitalPct('hp', g.get(2)!.hp)).toEqual({ pct: 61 / 120, known: true });
  });

  it('word only: keeps the value when it lies in the band', () => {
    const g = setup(); // 95/120 = 79 % → fine
    g.apply('Group.Update', { id: 2, 'hp-string': 'fine' });
    expect(g.get(2)!.hp.value).toBe(95);
  });

  it('word only: drops the value when it disagrees, then uses the band midpoint', () => {
    const g = setup();
    g.apply('Group.Update', { id: 2, 'hp-string': 'Hurt' });
    expect(g.get(2)!.hp).toEqual({ value: null, max: 120, word: 'Hurt' });
    expect(vitalPct('hp', g.get(2)!.hp)).toEqual({ pct: 0.58, known: false });
  });

  it('word only: an unknown word keeps the value', () => {
    const g = setup();
    g.apply('Group.Update', { id: 2, 'hp-string': 'shimmering' });
    expect(g.get(2)!.hp.value).toBe(95);
  });

  it('Add is a full payload: absent halves are null', () => {
    const g = new GroupModel();
    g.apply('Group.Add', { id: 3, type: 'ally', name: 'X', 'hp-string': 'Bad' });
    expect(g.get(3)!.hp).toEqual({ value: null, max: null, word: 'Bad' });
    expect(vitalPct('hp', g.get(3)!.hp).pct).toBeCloseTo(0.18);
    expect(vitalPct('mana', g.get(3)!.mana)).toEqual({ pct: null, known: false });
  });

  it('max 0 falls back to the word', () => {
    const g = new GroupModel();
    g.apply('Group.Add', npc(4, 'merc', 'M', { mana: 0, maxmana: 0, 'mana-string': 'Full' }));
    expect(vitalPct('mana', g.get(4)!.mana)).toEqual({ pct: 1, known: false });
  });
});

describe('mid-fight HP from Char.Vitals (Inv §8.2)', () => {
  const setup = () => {
    const g = new GroupModel();
    g.apply('Group.Set', [
      ally(2, 'Éowyn', { hp: 100, maxhp: 100 }),
      npc(4, 'a citizen mercenary', 'MERC', { hp: 200, maxhp: 200, 'hp-string': 'Healthy' }),
      npc(5, 'a large dog', 0, { hp: 60, maxhp: 60 }),
    ]);
    return g;
  };

  it('folds names and tokenises identities', () => {
    expect(foldName('  Éowyn  the Fair ')).toBe('eowyn the fair');
    expect(identityTokens('a citizen mercenary (MERC)')).toEqual(['a citizen mercenary (merc)', 'merc', 'a citizen mercenary']);
    expect(identityTokens('Gibur')).toEqual(['gibur']);
    expect(normLabel(0)).toBeNull();
    expect(normLabel(' ')).toBeNull();
    expect(normLabel('M')).toBe('M');
  });

  it('matches labels before names, accent-folded', () => {
    const g = setup();
    expect(g.match('a citizen mercenary (MERC)')!.id).toBe(4);
    expect(g.match('MERC')!.id).toBe(4);
    expect(g.match('eowyn')!.id).toBe(2);
    expect(g.match('Eowyn (Shieldmaiden)')!.id).toBe(2);
    expect(g.match('a large dog')!.id).toBe(5);
    expect(g.match('an orc scout')).toBeNull();
  });

  it('caches the identity from the fight-start packet and applies later *-hits', () => {
    const g = setup();
    g.apply('Char.Vitals', { buffer: 'a citizen mercenary (MERC)', opponent: 'Éowyn', 'buffer-hits': 'healthy', 'opponent-hits': 'healthy' });
    expect(g.get(4)!.hp).toEqual({ value: 200, max: 200, word: 'healthy' });
    // Only the words now.
    expect(g.apply('Char.Vitals', { 'buffer-hits': 'wounded' })).toBe(true);
    expect(g.get(4)!.hp).toEqual({ value: null, max: 200, word: 'wounded' });
    expect(vitalPct('hp', g.get(4)!.hp).pct).toBeCloseTo(0.355);
    expect(g.apply('Char.Vitals', { 'opponent-hits': 'fine' })).toBe(true);
    expect(g.get(2)!.hp).toMatchObject({ value: null, word: 'fine' });
    // Mana is never touched.
    expect(g.get(4)!.mana.value).toBe(50);
  });

  it('resolves afresh each packet (room-scoped ids), and clears on null', () => {
    const g = setup();
    g.apply('Char.Vitals', { buffer: 'MERC' });
    g.apply('Group.Remove', 4);
    expect(g.apply('Char.Vitals', { 'buffer-hits': 'bad' })).toBe(false);
    g.apply('Group.Add', npc(9, 'a citizen mercenary', 'MERC', { hp: 200, maxhp: 200 }));
    expect(g.apply('Char.Vitals', { 'buffer-hits': 'bad' })).toBe(true);
    expect(g.get(9)!.hp.word).toBe('bad');
    g.apply('Char.Vitals', { buffer: null, 'buffer-hits': null });
    expect(g.apply('Char.Vitals', { 'buffer-hits': 'awful' })).toBe(false);
  });

  it('forgets the identity on reset', () => {
    const g = setup();
    g.apply('Char.Vitals', { buffer: 'MERC' });
    g.reset();
    g.apply('Group.Set', [npc(4, 'a citizen mercenary', 'MERC', { hp: 200, maxhp: 200 })]);
    expect(g.apply('Char.Vitals', { 'buffer-hits': 'bad' })).toBe(false);
  });
});

describe('GroupModel selfBashed', () => {
  // as in log mume-Gittan-2026-10-21T23-36-57 (owner item 116)
  const you = { bashed: false, blind: false, id: 1, type: 'you', waiting: false };
  it('follows your own entry, not a member, and is not a member itself', () => {
    const g = new GroupModel();
    g.apply('Group.Set', [you, npc(2, 'a troll', 'T', { bashed: true })]);
    expect(g.selfBashed).toBe(false);
    expect(ids(g)).toEqual([2]);
    expect(g.apply('Group.Update', { id: 1, waiting: true })).toBe(false);
    expect(g.apply('Group.Update', { bashed: true, id: 1 })).toBe(true);
    expect(g.selfBashed).toBe(true);
    expect(g.apply('Group.Update', { bashed: true, id: 2 })).toBe(false);
    expect(g.apply('Group.Update', { bashed: false, id: 1, waiting: false })).toBe(true);
    expect(g.selfBashed).toBe(false);
  });
  it('clears on a remove, a new Group.Set and a reset', () => {
    const g = new GroupModel();
    g.apply('Group.Add', { ...you, id: 3, bashed: true });
    expect(g.selfBashed).toBe(true);
    expect(g.apply('Group.Remove', 3)).toBe(true);
    expect(g.selfBashed).toBe(false);
    g.apply('Group.Set', [{ ...you, bashed: true }]);
    expect(g.apply('Group.Set', [ally(5, 'Bob')])).toBe(true);
    expect(g.selfBashed).toBe(false);
    g.apply('Group.Set', [{ ...you, bashed: true }]);
    g.reset();
    expect(g.selfBashed).toBe(false);
  });
});
