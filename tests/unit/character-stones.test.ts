// The Character card's stones (stage 77 F2a, ADR 0166 addenda 22 and 23):
// the stone view, the `+n` priority, the rows, the purse steps and the
// compact card's short forms.
import { describe, expect, it } from 'vitest';
import { STATUS_FLAGS, type MemberFlags } from '../../src/gmcp/group';
import { ALERTNESS_STEPS, CARRYING_STEPS, MOOD_STEPS, SPELL_EFFORT_STEPS } from '../../src/gmcp/char';
import {
  SANCT_FLAG_ID,
  SHORT_FORMS,
  type Stone,
  keepStones,
  purseFit,
  purseMetrics,
  purseTip,
  purseWidth,
  shortForm,
  stoneRank,
  stoneRows,
  stoneTime,
  stoneTip,
  stoneView,
  stonesPerRow,
} from '../../src/panes/character-stones';
import { defaultSettings } from '../../src/settings';
import { type TimerCell, emptyView } from '../../src/timers/entry';

const NOW = 1_790_000_000_000;
const ALL = defaultSettings().character.stones;
const noFlags = (): MemberFlags => Object.fromEntries(STATUS_FLAGS.map((f) => [f, false])) as MemberFlags;

function cell(p: Partial<TimerCell> & Pick<TimerCell, 'id' | 'name' | 'group'>): TimerCell {
  return { startedAt: NOW - 1000, expiresAt: null, expected: null, tracked: true, ...p };
}
/** A timed cell with `left` seconds of `dur`. */
const timed = (id: string, name: string, group: TimerCell['group'], left: number, dur = 300, extra: Partial<TimerCell> = {}): TimerCell =>
  cell({ id, name, group, expiresAt: NOW + left * 1000, expected: dur * 1000, ...extra });

function viewWith(cells: TimerCell[]) {
  const v = emptyView();
  for (const c of cells) v.cells[c.group].push(c);
  v.herbs = [{ key: 'haste', name: 'Haste', active: false }];
  return v;
}

describe('stoneView: the poll’s affects (stage 77 H9)', () => {
  const untimed = (id: string, name: string, group: TimerCell['group']): TimerCell => cell({ id, name, group, startedAt: null, tracked: false });

  it('`potion` is no stone while a herblore runs; a stone again when none does', () => {
    const potion = untimed('affect:potion', 'potion', 'buff');
    const herb = timed('herb:Healing', 'Healing', 'herb', 200, 3600, { herbKey: 'Healing', phase: 'buff' });
    const off = stoneView({ view: viewWith([potion]), flags: noFlags(), show: ALL, player: false });
    expect(off.stones.map((s) => s.id)).toEqual(['affect:potion']);
    expect(stoneTime(off.stones[0]!, NOW, 20)).toMatchObject({ state: 'untimed', fill: 0, text: null });
    const on = stoneView({ view: viewWith([potion, herb]), flags: noFlags(), show: ALL, player: false });
    expect(on.stones.map((s) => s.id)).toEqual(['herb:Healing']);
    // Off in the card's Herblores the herblore still runs: no potion either.
    const hidden = stoneView({ view: viewWith([potion, herb]), flags: noFlags(), show: { ...ALL, herblores: false }, player: false });
    expect(hidden.stones).toEqual([]);
  });

  it("an affect the app does not know: a stone with its group's generic icon; spells are none", () => {
    const view = viewWith([untimed('affect:?a strange curse', 'a strange curse', 'debuff'), untimed('affect:armour', 'armour', 'spell'), untimed('affect:bloodlust', 'bloodlust', 'buff')]);
    const v = stoneView({ view, flags: noFlags(), show: ALL, player: false });
    expect(v.stones.map((s) => [s.label, s.kind, s.icon])).toEqual([
      ['Bloodlust', 'buff', 'buff'],
      ['A strange curse', 'debuff', 'debuff'],
    ]);
    expect(stoneTip(v.stones[1]!, NOW, 20).tip).toBe('');
  });

  it("the flags' twins from the poll are one stone with the flag", () => {
    const view = viewWith([untimed('affect:hunger', 'hunger', 'debuff'), untimed('affect:thirst', 'thirst', 'debuff')]);
    const v = stoneView({ view, flags: { ...noFlags(), hungry: true, thirsty: true }, show: ALL, player: false });
    expect(v.stones.map((s) => s.id)).toEqual(['affect:hunger', 'affect:thirst']);
  });
});

describe('stoneView', () => {
  it('takes buffs, debuffs, herblores, your sanctuary and your flags, in the display order', () => {
    const view = viewWith([
      timed('affect:shield', 'shield', 'buff', 100),
      timed('affect:armour', 'armour', 'buff', 50),
      cell({ id: 'affect:bless', name: 'bless', group: 'buff', tracked: false }),
      timed('affect:winded', 'winded', 'debuff', 600),
      timed('herb:haste', 'haste (active)', 'herb', 200, 360, { herbKey: 'haste', phase: 'buff' }),
      timed('affect:sanctuary', 'sanctuary', 'sanct', 200),
      timed('sanct:5', 'Gibur', 'sanct', 100, 270, { target: 'Gibur', estimated: true }),
      timed('affect:x', 'x', 'spell', 10),
    ]);
    const flags = { ...noFlags(), poison: true, wound: true, bashed: true, waiting: true };
    const v = stoneView({ view, flags, show: ALL, player: false });
    expect(v.stones.map((s) => s.id)).toEqual([
      'herb:haste',
      'affect:armour',
      'affect:shield',
      'affect:bless',
      'affect:winded',
      'affect:sanctuary',
      'flag:poison',
      'flag:wound',
    ]);
    expect(v.stones.map((s) => s.kind)).toEqual(['herb', 'buff', 'buff', 'buff', 'debuff', 'sanct', 'flag', 'flag']);
    // Each its pick (H8); the spells as buffs here have none: the generic buff.
    expect(v.stones.map((s) => s.icon)).toEqual(['st-haste-recovery', 'buff', 'buff', 'buff', 'st-winded', 'sanct', 'poison', 'st-wound']);
    expect(v.stones.map((s) => s.tone)).toEqual(['herb', 'buff', 'buff', 'buff', 'debuff', 'sanct', 'debuff', 'debuff']);
    expect(v.stones.map((s) => s.label)).toEqual(['Haste (active)', 'Armour', 'Shield', 'Bless', 'Winded', 'Sanctuary', 'Poisoned', 'Wounded']);
    expect(v.canStartHerb).toBe(true);
    expect(v.herbs).toEqual(view.herbs);
    expect(v.stones[0]!.herbKey).toBe('haste');
  });

  it("a herblore's debuff phase keeps the herblore's icon, in the debuffs' colour (H8)", () => {
    const view = viewWith([timed('herb:haste', 'haste (recovery)', 'herb', 200, 300, { herbKey: 'haste', phase: 'debuff' })]);
    const [s] = stoneView({ view, flags: noFlags(), show: ALL, player: false }).stones;
    expect(s).toMatchObject({ kind: 'herb', icon: 'st-haste-recovery', tone: 'debuff', herbDebuff: true });
    expect(stoneTip(s!, NOW, 20).tip).not.toContain('debuff');
  });

  it('your sanctuary from the GMCP flag alone when no cast of yours timed it; never a member’s', () => {
    const view = viewWith([timed('sanct:5', 'Gibur', 'sanct', 100, 270, { target: 'Gibur' })]);
    expect(stoneView({ view, flags: noFlags(), show: ALL, player: false }).stones).toEqual([]);
    const v = stoneView({ view, flags: { ...noFlags(), sanctuary: true }, show: ALL, player: false });
    expect(v.stones.map((s) => [s.id, s.kind, s.tracked])).toEqual([[SANCT_FLAG_ID, 'sanct', false]]);
    expect(stoneTip(v.stones[0]!, NOW, 20)).toEqual({ title: 'Sanctuary', tip: '' });
  });

  it("a flag whose twin affect is in Debuffs is the affect's stone", () => {
    const view = viewWith([timed('affect:blindness', 'blindness', 'debuff', 30, 90), cell({ id: 'affect:hunger', name: 'hunger', group: 'debuff' })]);
    const flags = { ...noFlags(), blind: true, hungry: true, thirsty: true };
    expect(stoneView({ view, flags, show: ALL, player: false }).stones.map((s) => s.id)).toEqual(['affect:blindness', 'affect:hunger', 'flag:thirsty']);
    // Debuffs off: the flags show.
    const show = { ...ALL, debuffs: false };
    expect(stoneView({ view, flags, show, player: false }).stones.map((s) => s.id)).toEqual(['flag:blind', 'flag:hungry', 'flag:thirsty']);
  });

  it('honours character.stones, group by group', () => {
    const view = viewWith([
      timed('affect:shield', 'shield', 'buff', 100),
      timed('affect:winded', 'winded', 'debuff', 600),
      timed('herb:haste', 'haste (active)', 'herb', 200, 360, { herbKey: 'haste' }),
      timed('affect:sanctuary', 'sanctuary', 'sanct', 200),
    ]);
    const flags = { ...noFlags(), snared: true };
    const ids = (show: typeof ALL) => stoneView({ view, flags, show, player: false }).stones.map((s) => s.id);
    expect(ids({ ...ALL, buffs: false })).not.toContain('affect:shield');
    expect(ids({ ...ALL, debuffs: false })).not.toContain('affect:winded');
    expect(ids({ ...ALL, herblores: false })).not.toContain('herb:haste');
    expect(ids({ ...ALL, sanctuary: false })).not.toContain('affect:sanctuary');
    expect(ids({ ...ALL, flags: false })).not.toContain('flag:snared');
    expect(ids({ buffs: false, debuffs: false, herblores: false, flags: false, sanctuary: false })).toEqual([]);
    expect(stoneView({ view, flags, show: { ...ALL, herblores: false }, player: false }).canStartHerb).toBe(false);
  });

  it('a log player is read-only: no + and no ×', () => {
    const view = viewWith([timed('herb:haste', 'haste (active)', 'herb', 200, 360, { herbKey: 'haste' })]);
    const v = stoneView({ view, flags: noFlags(), show: ALL, player: true });
    expect(v.canStartHerb).toBe(false);
    expect(v.stones[0]!.herbKey).toBeNull();
    expect(stoneTip(v.stones[0]!, NOW, 20).tip).not.toContain('×');
  });

  it('its key changes with what is drawn, not with the clock', () => {
    const a = viewWith([timed('affect:shield', 'shield', 'buff', 100)]);
    const k1 = stoneView({ view: a, flags: noFlags(), show: ALL, player: false }).key;
    expect(stoneView({ view: viewWith([timed('affect:shield', 'shield', 'buff', 100)]), flags: noFlags(), show: ALL, player: false }).key).toBe(k1);
    expect(stoneView({ view: viewWith([timed('affect:shield', 'shield', 'buff', 200)]), flags: noFlags(), show: ALL, player: false }).key).not.toBe(k1);
    expect(stoneView({ view: a, flags: noFlags(), show: ALL, player: true }).key).not.toBe(k1);
  });
});

describe('stoneTime and stoneTip', () => {
  const [shield, still, seen, flag] = stoneView({
    view: viewWith([
      timed('affect:shield', 'shield', 'buff', 100, 400),
      cell({ id: 'affect:depression', name: 'depression', group: 'debuff' }),
      cell({ id: 'affect:bless', name: 'bless', group: 'debuff', tracked: false }),
    ]),
    flags: { ...noFlags(), poison: true },
    show: ALL,
    player: false,
  }).stones as [Stone, Stone, Stone, Stone];

  it('timed: fill, countdown, ending soon at warnAt', () => {
    expect(stoneTime(shield, NOW, 20)).toEqual({ state: 'timed', remaining: 100_000, fill: 0.25, text: '2m', ending: false });
    expect(stoneTime(shield, NOW + 80_000, 20)).toMatchObject({ remaining: 20_000, text: '20s', ending: true });
    expect(stoneTime(shield, NOW + 200_000, 20)).toMatchObject({ fill: 0, text: '0s', ending: true });
    // The time left alone (T17, T30).
    expect(stoneTip(shield, NOW, 20)).toEqual({ title: 'Shield', tip: '1:40 left' });
    expect(stoneTip(shield, NOW + 85_000, 20).tip).toBe('15s left');
  });

  it('still, untimed and a flag', () => {
    expect([still.id, seen.id, flag.id]).toEqual(['affect:depression', 'affect:bless', 'flag:poison']);
    expect(stoneTime(still, NOW, 20)).toEqual({ state: 'still', remaining: null, fill: 1, text: null, ending: false });
    expect(stoneTime(seen, NOW, 20)).toEqual({ state: 'untimed', remaining: null, fill: 0, text: null, ending: false });
    expect(stoneTime(flag, NOW, 20).state).toBe('untimed');
    // The title alone (T18, T19, T20).
    expect(stoneTip(still, NOW, 20).tip).toBe('');
    expect(stoneTip(seen, NOW, 20).tip).toBe('');
    expect(stoneTip(flag, NOW, 20)).toEqual({ title: 'Poisoned', tip: '' });
  });

  it('a herblore: the time left, no × hint (T29)', () => {
    const [h] = stoneView({ view: viewWith([timed('herb:haste', 'haste (active)', 'herb', 200, 360, { herbKey: 'haste' })]), flags: noFlags(), show: ALL, player: false }).stones;
    expect(stoneTip(h!, NOW, 20).tip).toBe('3:20 left');
  });
});

describe('the + n priority (point 120)', () => {
  const view = viewWith([
    timed('affect:a', 'a buff', 'buff', 600),
    timed('affect:b', 'b buff', 'buff', 10),
    timed('affect:d', 'a debuff', 'debuff', 900),
    timed('herb:h', 'herb', 'herb', 1200, 1800, { herbKey: 'h' }),
    cell({ id: 'affect:u', name: 'untimed debuff', group: 'debuff', tracked: false }),
  ]);
  const { stones } = stoneView({ view, flags: { ...noFlags(), snared: true }, show: ALL, player: false });

  it('ranks: ending soon, flags, debuffs, herblores, buffs', () => {
    const r = Object.fromEntries(stones.map((s) => [s.id, stoneRank(s, NOW, 20)]));
    expect(r).toEqual({ 'affect:b': 0, 'flag:snared': 1, 'affect:d': 2, 'affect:u': 2, 'herb:h': 3, 'affect:a': 4 });
  });

  it('keeps the most urgent, time left as the tie-break; both lists in the display order', () => {
    expect(stones.map((s) => s.id)).toEqual(['herb:h', 'affect:b', 'affect:a', 'affect:d', 'affect:u', 'flag:snared']);
    const k = (cap: number) => keepStones(stones, cap, NOW, 20);
    expect(k(1).kept.map((s) => s.id)).toEqual(['affect:b']);
    expect(k(2).kept.map((s) => s.id)).toEqual(['affect:b', 'flag:snared']);
    // The timed debuff before the untimed one.
    expect(k(3).kept.map((s) => s.id)).toEqual(['affect:b', 'affect:d', 'flag:snared']);
    expect(k(5).kept.map((s) => s.id)).toEqual(['herb:h', 'affect:b', 'affect:d', 'affect:u', 'flag:snared']);
    expect(k(5).hidden.map((s) => s.id)).toEqual(['affect:a']);
    expect(k(0)).toEqual({ kept: [], hidden: stones });
    expect(k(9)).toEqual({ kept: stones, hidden: [] });
  });

  it('a stone ending soon moves up with the clock', () => {
    expect(keepStones(stones, 2, NOW, 20).kept.map((s) => s.id)).toEqual(['affect:b', 'flag:snared']);
    expect(keepStones(stones, 2, NOW + 581_000, 20).kept.map((s) => s.id)).toEqual(['affect:b', 'affect:a']);
  });
});

describe('stoneRows (the mockups’ stonesFit)', () => {
  const mk = (n: number): Stone[] =>
    stoneView({
      view: viewWith(Array.from({ length: n }, (_, i) => timed(`affect:s${i}`, `s${i}`, 'buff', 100 + i))),
      flags: noFlags(),
      show: ALL,
      player: false,
    }).stones;
  const base = { width: 100, size: 14, gap: 2, bar: 3, rows: 1, add: true };

  it('places per row, at least two', () => {
    expect(stonesPerRow(100, 14, 2)).toBe(6);
    expect(stonesPerRow(94, 14, 2)).toBe(6);
    expect(stonesPerRow(93, 14, 2)).toBe(5);
    expect(stonesPerRow(10, 14, 2)).toBe(2);
  });

  it('all fit: the + first, the room left for the purse', () => {
    const r = stoneRows(mk(3), base, NOW, 20);
    expect(r.entries.map((e) => e.k)).toEqual(['add', 'stone', 'stone', 'stone']);
    expect(r).toMatchObject({ per: 6, rows: 1, rowsNeed: 1, stoneH: 17, height: 17, free: 100 - 4 * 16, hidden: [] });
  });

  it('too many: + n takes the last place', () => {
    const stones = mk(8);
    const r = stoneRows(stones, base, NOW, 20);
    expect(r.entries.map((e) => e.k)).toEqual(['add', 'stone', 'stone', 'stone', 'stone', 'more']);
    expect(r.hidden).toHaveLength(4);
    const more = r.entries[5]!;
    expect(more.k === 'more' && more.rest).toEqual(r.hidden);
    expect(r).toMatchObject({ rows: 1, rowsNeed: 2, free: 100 - 6 * 16 });
    // Soonest ending stay (all buffs).
    expect(r.entries.flatMap((e) => (e.k === 'stone' ? [e.stone.id] : []))).toEqual(['affect:s0', 'affect:s1', 'affect:s2', 'affect:s3']);
  });

  it('more rows when allowed; no + without herblores', () => {
    const r = stoneRows(mk(8), { ...base, rows: 3 }, NOW, 20);
    expect(r).toMatchObject({ rows: 2, rowsNeed: 2, height: 2 * 19 - 2, hidden: [] });
    expect(r.free).toBe(100 - 3 * 16);
    const n = stoneRows(mk(6), { ...base, add: false }, NOW, 20);
    expect(n.entries.map((e) => e.k)).toEqual(['stone', 'stone', 'stone', 'stone', 'stone', 'stone']);
    const o = stoneRows(mk(7), { ...base, add: false }, NOW, 20);
    expect(o.entries.map((e) => e.k).join(',')).toBe('stone,stone,stone,stone,stone,more');
    expect(o.hidden).toHaveLength(2);
  });

  it('nothing: the + alone, or an empty row', () => {
    expect(stoneRows([], base, NOW, 20)).toMatchObject({ entries: [{ k: 'add' }], rows: 1, free: 84 });
    expect(stoneRows([], { ...base, add: false }, NOW, 20)).toMatchObject({ entries: [], rows: 1, free: 100 });
  });
});

describe('the purse steps (point 121)', () => {
  const p = { gold: 380, silver: 5, copper: 49 };
  const m = purseMetrics(14);

  it('the mockups’ metrics', () => {
    expect(purseMetrics(14)).toEqual({ coin: 12, charW: 10.5 * 0.6, inner: 2, gap: 6, margin: 6 });
    expect(purseMetrics(11)).toEqual({ coin: 10, charW: 9.5 * 0.6, inner: 2, gap: 6, margin: 6 });
  });

  it('3, 2, 1 or 0 coins in the room left', () => {
    const w3 = purseWidth(p, 3, m);
    const w2 = purseWidth(p, 2, m);
    const w1 = purseWidth(p, 1, m);
    expect(w1).toBeCloseTo(3 * 6.3 + 14);
    expect(w2).toBeCloseTo(w1 + 6 + 6.3 + 14);
    expect(w3).toBeCloseTo(w2 + 6 + 2 * 6.3 + 14);
    expect(purseFit(w3 + 6, p, m)).toBe(3);
    expect(purseFit(w3 + 5.9, p, m)).toBe(2);
    expect(purseFit(w2 + 6, p, m)).toBe(2);
    expect(purseFit(w1 + 6, p, m)).toBe(1);
    expect(purseFit(w1 + 5, p, m)).toBe(0);
    expect(purseFit(500, null, m)).toBe(0);
    expect(purseWidth(p, 0, m)).toBe(0);
  });

  it('the tooltip gives the whole purse, only while a coin is hidden (T39–T41)', () => {
    expect(purseTip(p, 3)).toBeNull();
    expect(purseTip(p, 2)).toBe('380 gold, 5 silver, 49 copper');
    expect(purseTip(p, 1)).toBe('380 gold, 5 silver, 49 copper');
  });
});

describe('shortForm (point 126)', () => {
  it('the whole word when it fits', () => {
    expect(shortForm('normal', 6)).toBe('normal');
    expect(shortForm('aggressive', 10)).toBe('aggressive');
    expect(shortForm('heavy', 5)).toBe('heavy');
  });

  it('the hand-made forms', () => {
    const four = Object.fromEntries(Object.keys(SHORT_FORMS).map((w) => [w, shortForm(w, 4)]));
    expect(four).toEqual({
      wimpy: 'wmpy',
      prudent: 'prud',
      normal: 'norm',
      brave: 'brav',
      aggressive: 'aggr',
      berserk: 'bsrk',
      quick: 'qck',
      fast: 'fast',
      careful: 'care',
      thorough: 'thor',
      attentive: 'attn',
      vigilant: 'vigl',
      paranoid: 'para',
      peanuts: 'pnts',
      uncomfortable: 'unc',
      heavy: 'hvy',
      'really heavy': 'rhvy',
      painful: 'pain',
      torture: 'trtr',
    });
    expect(shortForm('aggressive', 6)).toBe('aggr');
  });

  it('really heavy and uncomfortable have longer forms', () => {
    expect(shortForm('really heavy', 12)).toBe('really heavy');
    expect(shortForm('really heavy', 7)).toBe('r.heavy');
    expect(shortForm('really heavy', 6)).toBe('r.hvy');
    expect(shortForm('really heavy', 5)).toBe('r.hvy');
    expect(shortForm('really heavy', 4)).toBe('rhvy');
    expect(shortForm('uncomfortable', 6)).toBe('uncomf');
    expect(shortForm('uncomfortable', 5)).toBe('unc');
  });

  it('less room: the start; an unknown word is cut', () => {
    expect(shortForm('aggressive', 3)).toBe('agg');
    expect(shortForm('really heavy', 2)).toBe('rh');
    expect(shortForm('Aggressive', 4)).toBe('aggr');
    expect(shortForm('fighting', 4)).toBe('figh');
    expect(shortForm('normal', 0)).toBe('');
  });

  it("covers every word of the model's steps", () => {
    for (const w of [...MOOD_STEPS, ...SPELL_EFFORT_STEPS, ...ALERTNESS_STEPS, ...CARRYING_STEPS]) {
      expect(SHORT_FORMS[w], w).toBeDefined();
      expect(SHORT_FORMS[w]!.length, w).toBeLessThanOrEqual(4);
    }
  });
});
