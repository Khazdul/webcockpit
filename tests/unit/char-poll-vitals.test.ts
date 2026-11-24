// The info poll's vitals and a troll's missing mana in the character model
// (stage 77 H9, ADR 0166 addendum 31).
import { describe, expect, it } from 'vitest';
import { CharModel } from '../../src/gmcp/char';

const P = { hp: 357, maxhp: 375, mana: 88, maxmana: 121, mp: 68, maxmp: 112 };
const NONE = { hp: null, maxhp: null, mana: null, maxmana: null, mp: null, maxmp: null };

describe('CharModel: the poll’s vitals', () => {
  it('moves the bars while GMCP is silent: exact numbers, the words kept', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { 'hp-string': 'fine', 'mana-string': 'cold', 'mp-string': 'unwearied' });
    const mark = c.vitalsMark();
    expect(c.applyPolled(P, mark)).toBe(true);
    const v = c.view().vitals;
    expect(v.hp).toEqual({ value: 357, max: 375, word: 'fine', exact: true });
    expect(v.mana).toMatchObject({ value: 88, max: 121, exact: true });
    expect(v.mp).toMatchObject({ value: 68, max: 112, exact: true });
    expect(c.view().maxhp).toBe(375);
    // The same again: no change.
    expect(c.applyPolled(P, mark)).toBe(false);
  });

  it('a Char.Vitals after the poll was sent wins, per bar', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { hp: 100, maxhp: 375, mana: 10, maxmana: 121 });
    const mark = c.vitalsMark();
    c.apply('Char.Vitals', { hp: 200 });
    c.applyPolled(P, mark);
    expect(c.view().vitals.hp.value).toBe(200);
    expect(c.view().vitals.mana.value).toBe(88);
    // A band word alone touches its bar too.
    const m2 = c.vitalsMark();
    c.apply('Char.Vitals', { 'mana-string': 'hot' });
    c.applyPolled({ ...P, mana: 5 }, m2);
    expect(c.view().vitals.mana).toMatchObject({ value: 88, exact: false, word: 'hot' });
  });

  it("a fight's xxx (null) writes nothing", () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { hp: 100, maxhp: 375 });
    expect(c.applyPolled(NONE, c.vitalsMark())).toBe(false);
    expect(c.view().vitals.hp).toMatchObject({ value: 100, max: 375 });
  });

  it('a new character forgets the marks', () => {
    const c = new CharModel();
    c.apply('Char.Name', { name: 'Rasta' });
    c.apply('Char.Vitals', { hp: 1, maxhp: 2 });
    c.apply('Char.Vitals', { hp: 1, maxhp: 2 });
    c.apply('Char.Name', { name: 'Stewash' });
    expect(c.vitalsMark()).toBe(0);
    c.applyPolled(P, 0);
    expect(c.view().vitals.hp.value).toBe(357);
  });
});

describe('CharModel: a troll has no mana', () => {
  /** The owner's troll run (Stewash, a Hill Troll): no mana key, no spell-effort, also in the first full message. */
  const TROLL_VITALS = { hp: 121, maxhp: 121, 'hp-string': 'healthy', mp: 112, maxmp: 112, 'mp-string': 'unwearied', mood: 'normal', position: 'standing' };
  const TROLL_POLL = { hp: 121, maxhp: 121, mana: 0, maxmana: 0, mp: 112, maxmp: 112 };

  it('by the race', () => {
    const c = new CharModel();
    expect(c.view().mana).toBe(true);
    c.apply('Char.StatusVars', { race: 'Troll', subrace: 'Hill Troll' });
    expect(c.view().mana).toBe(false);
    // Even if a mana key came.
    c.apply('Char.Vitals', { mana: 0, maxmana: 0 });
    expect(c.view().mana).toBe(false);
  });

  it('by the data: no mana key in Char.Vitals and the poll says 0 max mana', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', TROLL_VITALS);
    expect(c.view().mana).toBe(true);
    c.applyPolled(TROLL_POLL, c.vitalsMark());
    const v = c.view();
    expect(v.mana).toBe(false);
    expect(v.spellEffort).toBeNull();
    // 0 / 0 is a value and breaks nothing.
    expect(v.vitals.mana).toMatchObject({ value: 0, max: 0, exact: true });
    expect(v.vitals.hp).toMatchObject({ value: 121, max: 121 });
  });

  it('a mana key from GMCP, or a non-zero poll: mana', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { ...TROLL_VITALS, 'mana-string': 'cold' });
    c.applyPolled(TROLL_POLL, null);
    expect(c.view().mana).toBe(true);
    const d = new CharModel();
    d.apply('Char.Vitals', TROLL_VITALS);
    d.applyPolled({ ...TROLL_POLL, mana: 3, maxmana: 40 }, null);
    expect(d.view().mana).toBe(true);
  });

  it('another character starts over', () => {
    const c = new CharModel();
    c.apply('Char.Name', { name: 'Stewash' });
    c.apply('Char.StatusVars', { race: 'Troll' });
    expect(c.view().mana).toBe(false);
    c.apply('Char.Name', { name: 'Rasta' });
    expect(c.view().mana).toBe(true);
  });
});
