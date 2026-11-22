import { describe, expect, it } from 'vitest';
import { CARRYING_STEPS, CharModel, SPELL_EFFORT_STEPS, capitalise } from '../../src/gmcp/char';
import { VITAL_KINDS } from '../../src/gmcp/bands';

describe('CharModel', () => {
  it('starts empty', () => {
    const v = new CharModel().view();
    expect(v).toMatchObject({ name: null, level: null, xp: null, tp: null, mood: null, wimpy: null, maxhp: null });
    expect(v.toggles).toEqual({ sneak: false, ride: false, climb: false, swim: false });
  });

  it('takes the name, capitalised in the view', () => {
    const c = new CharModel();
    expect(c.apply('Char.Name', { name: 'rasta', fullname: 'Rasta Fari' })).toBe(true);
    expect(c.view().name).toBe('Rasta');
    expect(c.fullname).toBe('Rasta Fari');
    expect(capitalise('')).toBe('');
  });

  it('merges vitals: absent keeps, null sets null', () => {
    const c = new CharModel();
    c.apply('char.vitals', { mood: 'brave', climb: 'c', sneak: 'S', swim: true, ride: 'a pony' });
    expect(c.view().toggles).toEqual({ sneak: true, ride: true, climb: true, swim: true });
    c.apply('Char.Vitals', { mood: 'Wimpy' });
    expect(c.view().mood).toBe('wimpy');
    expect(c.view().toggles.climb).toBe(true); // absent: kept
    c.apply('Char.Vitals', { climb: null, sneak: null, swim: false, ride: null });
    expect(c.vitals.has('climb')).toBe(true);
    expect(c.vitals.get('climb')).toBeNull();
    expect(c.view().toggles).toEqual({ sneak: false, ride: false, climb: false, swim: false });
    expect(c.apply('Char.Vitals', { climb: null })).toBe(false); // no change
    expect(c.apply('Char.Vitals', 'junk')).toBe(false);
    expect(c.apply('Comm.Channel.Text', {})).toBe(false);
  });

  it('derives the level from XP, not StatusVars', () => {
    const c = new CharModel();
    c.apply('Char.StatusVars', { level: 30, race: 'Man' });
    expect(c.view().level).toBe(30); // fallback while XP is unknown
    c.apply('Char.Vitals', { xp: 5_770_000, tp: 40_000 });
    expect(c.view().level).toBe(25);
  });

  it('anchors the session at the first XP/TP and splits the bars', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { xp: 5_230_000 });
    c.apply('Char.Vitals', { tp: 39_000 });
    expect([c.anchorXp, c.anchorTp]).toEqual([5_230_000, 39_000]);
    c.apply('Char.Vitals', { xp: 5_440_000, tp: 40_000 });
    const v = c.view();
    expect(v.xp!.baseline).toBeCloseTo(0.2);
    expect(v.xp!.progress).toBeCloseTo(0.5);
    expect(v.tp!.baseline).toBeLessThan(v.tp!.progress);
    // A level-up: the whole fill is gain.
    c.apply('Char.Vitals', { xp: 5_865_000 });
    expect(c.view().xp!.baseline).toBe(0);
  });

  it('TP needs XP and scales for trolls', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { tp: 125 });
    expect(c.view().tp).toBeNull();
    c.apply('Char.Vitals', { xp: 20_000 });
    expect(c.view().tp!.progress).toBe(0);
    c.apply('Char.StatusVars', { race: 'Troll' });
    expect(c.view().tp!.progress).toBeCloseTo(0.5);
  });

  it('wimpy from vitals and from text', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { wimpy: 30, maxhp: 172 });
    expect(c.view()).toMatchObject({ wimpy: 30, maxhp: 172 });
    expect(c.setWimpy(50)).toBe(true);
    expect(c.setWimpy(50)).toBe(false);
    expect(c.view().wimpy).toBe(50);
    c.setWimpy(0);
    expect(c.view().wimpy).toBe(0);
  });

  it('spell effort: the menu steps, another word as sent', () => {
    expect(SPELL_EFFORT_STEPS).toEqual(['quick', 'fast', 'normal', 'careful', 'thorough']);
    const c = new CharModel();
    expect(c.view().spellEffort).toBeNull();
    for (const [sent, shown] of [['thorough', 'thorough'], ['Normal', 'normal'], ['Hasty', 'Hasty'], ['', null], [null, null]] as const) {
      c.apply('Char.Vitals', { 'spell-effort': sent });
      expect(c.view().spellEffort, String(sent)).toBe(shown);
    }
  });

  it('carrying: the six live words and their step, another word without one', () => {
    expect(CARRYING_STEPS).toEqual(['peanuts', 'uncomfortable', 'heavy', 'really heavy', 'painful', 'torture']);
    const c = new CharModel();
    expect(c.view().carrying).toBeNull();
    CARRYING_STEPS.forEach((word, step) => {
      c.apply('Char.Vitals', { carrying: word });
      expect(c.view().carrying).toEqual({ word, step });
    });
    c.apply('Char.Vitals', { carrying: 'Really Heavy' });
    expect(c.view().carrying).toEqual({ word: 'Really Heavy', step: 3 });
    for (const word of ['light', 'Crushing', 'constructor']) {
      c.apply('Char.Vitals', { carrying: word });
      expect(c.view().carrying).toEqual({ word, step: null });
    }
    c.apply('Char.Vitals', { carrying: null });
    expect(c.view().carrying).toBeNull();
  });

  it('race, subrace and the race line', () => {
    const c = new CharModel();
    expect(c.view()).toMatchObject({ race: null, subrace: null, raceLine: null });
    c.apply('Char.StatusVars', { race: 'Orc', subrace: 'Tarkhnarb Orc' });
    expect(c.view()).toMatchObject({ race: 'Orc', subrace: 'Tarkhnarb Orc', raceLine: 'Tarkhnarb orc' });
    c.apply('Char.StatusVars', { subrace: null });
    expect(c.view()).toMatchObject({ race: 'Orc', subrace: null, raceLine: 'Orc' });
    c.apply('Char.Name', { name: 'Rasta' });
    c.apply('Char.Name', { name: 'Gibur' });
    expect(c.view()).toMatchObject({ race: null, raceLine: null });
    c.apply('Char.StatusVars', { race: 'Troll', subrace: 'Cave Troll' });
    c.reset();
    expect(c.view().raceLine).toBeNull();
  });

  it('reset clears everything; another character starts a new session', () => {
    const c = new CharModel();
    c.apply('Char.Name', { name: 'Rasta' });
    c.apply('Char.Vitals', { xp: 5_000_000, mood: 'brave' });
    c.reset();
    expect(c.view().name).toBeNull();
    expect(c.anchorXp).toBeNull();
    expect(c.view().mood).toBeNull();
    c.apply('Char.Name', { name: 'Rasta' });
    c.apply('Char.Vitals', { xp: 5_000_000 });
    c.apply('Char.Name', { name: 'rasta' }); // same name again: same session
    expect(c.anchorXp).toBe(5_000_000);
    c.apply('Char.Name', { name: 'Gibur' });
    expect(c.anchorXp).toBeNull();
    expect(c.vitals.size).toBe(0);
    c.apply('Char.Vitals', { xp: 7_000_000 });
    expect(c.anchorXp).toBe(7_000_000);
  });
});

describe('CharModel: exact or band', () => {
  for (const k of VITAL_KINDS) {
    const word = `${k}-string`;
    const bar = (c: CharModel) => c.view().vitals[k];

    it(`${k}: the last update decides`, () => {
      const c = new CharModel();
      expect(bar(c)).toEqual({ value: null, max: null, word: null, exact: false });
      c.apply('Char.Vitals', { [k]: 100, [`max${k}`]: 200 });
      expect(bar(c)).toEqual({ value: 100, max: 200, word: null, exact: true });
      c.apply('Char.Vitals', { [word]: 'Hurt' });
      expect(bar(c)).toEqual({ value: 100, max: 200, word: 'hurt', exact: false });
      c.apply('Char.Vitals', { mood: 'brave', [`max${k}`]: 210 }); // neither: it stays
      expect(bar(c).exact).toBe(false);
      c.apply('Char.Vitals', { [k]: 120, [word]: 'Fine' }); // both: a number
      expect(bar(c)).toEqual({ value: 120, max: 210, word: 'fine', exact: true });
      c.apply('Char.Vitals', { mood: 'wimpy' });
      expect(bar(c).exact).toBe(true);
      c.apply('Char.Vitals', { [k]: null });
      expect(bar(c)).toMatchObject({ value: null, exact: false });
      c.apply('Char.Vitals', { [k]: 0 }); // zero is a number
      expect(bar(c).exact).toBe(true);
      c.apply('Char.Vitals', { [k]: null, [word]: 'dying' });
      expect(bar(c).exact).toBe(false);
    });

    it(`${k}: a flip is a change though the merged values are the same`, () => {
      const c = new CharModel();
      c.apply('Char.Vitals', { [k]: 100, [word]: 'fine' });
      let v = c.version;
      expect(c.apply('Char.Vitals', { [word]: 'fine' })).toBe(true); // the same word after a number
      expect([bar(c).exact, c.version]).toEqual([false, v + 1]);
      expect(c.apply('Char.Vitals', { [word]: 'fine' })).toBe(false);
      v = c.version;
      expect(c.apply('Char.Vitals', { [k]: 100 })).toBe(true); // the same number after a word
      expect([bar(c).exact, c.version]).toEqual([true, v + 1]);
      expect(c.apply('Char.Vitals', { [k]: 100 })).toBe(false);
      v = c.version;
      expect(c.apply('Char.Vitals', { [word]: 'hurt' })).toBe(true); // a flip and a value: one change
      expect(c.version).toBe(v + 1);
    });

    it(`${k}: reset and another character clear it, the same one keeps it`, () => {
      const c = new CharModel();
      c.apply('Char.Name', { name: 'Rasta' });
      c.apply('Char.Vitals', { [k]: 100 });
      c.apply('Char.Name', { name: 'rasta' });
      expect(bar(c).exact).toBe(true);
      c.apply('Char.Name', { name: 'Gibur' });
      expect(bar(c).exact).toBe(false);
      c.apply('Char.Vitals', { [k]: 100 });
      c.reset();
      expect(bar(c).exact).toBe(false);
    });
  }

  it('each bar has its own', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { hp: 1, mana: 2, mp: 3 });
    c.apply('Char.Vitals', { 'mana-string': 'icy' });
    expect(VITAL_KINDS.map((k) => c.view().vitals[k].exact)).toEqual([true, false, true]);
  });
});

describe('wimpy and berserk (help mood)', () => {
  it('becoming berserk sets it to 0, and leaving does not bring it back', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { mood: 'wimpy' });
    c.setWimpy(269);
    c.apply('Char.Vitals', { mood: 'berserk' });
    expect(c.view().wimpy).toBe(0);
    c.apply('Char.Vitals', { mood: 'brave' });
    expect(c.view().wimpy).toBe(0);
  });

  it('a line while berserk holds', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { mood: 'Berserk' });
    c.setWimpy(40);
    c.apply('Char.Vitals', { mood: 'berserk', hp: 120 });
    expect(c.view().wimpy).toBe(40);
  });

  it('another mood leaves it alone', () => {
    const c = new CharModel();
    c.setWimpy(269);
    c.apply('Char.Vitals', { mood: 'aggressive' });
    expect(c.view().wimpy).toBe(269);
  });
});
