import { describe, expect, it } from 'vitest';
import { GroupModel } from '../../src/gmcp/group';
import { PHONE_KIT } from '../../src/app/phone-kit';
import { FOE_START, FOE_STEPS, type SelfVitals, fightCard, fightSig, foeStep } from '../../src/phone/fight-model';
import { setPhoneKit } from '../../src/phone/kit';

setPhoneKit(PHONE_KIT);

const SELF: SelfVitals = { name: 'Rasta', hp: 158, maxhp: 172, word: 'Fine' };

/** A group as the GMCP demo has it: you, two allies and a labeled mercenary. */
function group(): GroupModel {
  const g = new GroupModel();
  g.apply('Group.Set', [
    { id: 1, type: 'you', name: 'Rasta' },
    { id: 2, type: 'ally', name: 'Dori', hp: 120, maxhp: 150, 'hp-string': 'Fine' },
    { id: 3, type: 'npc', name: 'a citizen mercenary', label: 'MERC', hp: 61, maxhp: 122, 'hp-string': 'Hurt' },
  ]);
  return g;
}

const card = (g: GroupModel, self: SelfVitals = SELF, last: number | null = null) => {
  const f = g.fight();
  return fightCard(f, f.tankId === null ? null : (g.get(f.tankId) ?? null), self, last);
};

describe('foeStep', () => {
  it('maps the condition words of ADR 0136 §3 to their steps', () => {
    expect(foeStep('healthy', null)).toBe(100);
    expect(foeStep('fine', null)).toBe(85);
    expect(foeStep('hurt', null)).toBe(65);
    expect(foeStep('wounded', null)).toBe(45);
    expect(foeStep('bad', null)).toBe(25);
    expect(foeStep('awful', null)).toBe(10);
    expect(foeStep('dying', null)).toBe(0);
  });

  it('reads the word whatever its case and spacing', () => {
    expect(foeStep('Wounded', null)).toBe(45);
    expect(foeStep(' HURT ', 100)).toBe(65);
  });

  it('an unknown or missing word keeps the last step; a fight starts full', () => {
    expect(foeStep('scratched', 45)).toBe(45);
    expect(foeStep(null, 25)).toBe(25);
    expect(foeStep('scratched', null)).toBe(FOE_START);
    // A word that names an Object.prototype member is as unknown as any other.
    expect(foeStep('constructor', 45)).toBe(45);
    expect(foeStep('constructor', null)).toBe(100);
    expect(foeStep('toString', null)).toBe(100);
    expect(foeStep('__proto__', 25)).toBe(25);
    expect(foeStep(null, null)).toBe(100);
  });

  it('the steps fall with the words', () => {
    const order = ['healthy', 'fine', 'hurt', 'wounded', 'bad', 'awful', 'dying'];
    const steps = order.map((w) => FOE_STEPS[w]!);
    expect([...steps].sort((a, b) => b - a)).toEqual(steps);
    expect(new Set(steps).size).toBe(steps.length);
  });
});

describe('fightCard', () => {
  it('is null without an opponent', () => {
    const g = group();
    expect(card(g)).toBeNull();
    g.apply('Char.Vitals', { opponent: 'an orc scout', 'opponent-hits': 'healthy' });
    g.apply('Char.Vitals', { opponent: null, 'opponent-hits': null });
    expect(card(g)).toBeNull();
  });

  it('you tank: You and your HP share against the opponent', () => {
    const g = group();
    g.apply('Char.Vitals', { opponent: 'an orc scout', buffer: 'Rasta', 'opponent-hits': 'healthy', 'buffer-hits': 'healthy' });
    expect(card(g)).toEqual({ left: { name: 'You', pct: 92 }, right: { name: 'an orc scout', pct: 100 } });
    g.apply('Char.Vitals', { 'opponent-hits': 'hurt' });
    expect(card(g)!.right.pct).toBe(65);
  });

  it('nobody buffers (MUME says Nobody), or the buffer is unknown: You', () => {
    const g = group();
    g.apply('Char.Vitals', { opponent: 'an orc scout', buffer: 'Nobody', 'opponent-hits': 'fine' });
    expect(card(g)!.left.name).toBe('You');
    const h = group();
    h.apply('Char.Vitals', { opponent: 'an orc scout', 'opponent-hits': 'fine' });
    expect(card(h)!.left).toEqual({ name: 'You', pct: 92 });
  });

  it('your HP from the band word when a number is missing; unknown without either', () => {
    const g = group();
    g.apply('Char.Vitals', { opponent: 'an orc scout', 'opponent-hits': 'fine' });
    // hurt is 46–70 %: the midpoint.
    expect(card(g, { name: 'Rasta', hp: null, maxhp: 172, word: 'Hurt' })!.left.pct).toBe(58);
    expect(card(g, { name: 'Rasta', hp: null, maxhp: null, word: null })!.left.pct).toBeNull();
    expect(card(g, { name: null, hp: 50, maxhp: 200, word: null })!.left).toEqual({ name: 'You', pct: 25 });
  });

  it('a group member tanks: its name and its HP from the group model', () => {
    const g = group();
    g.apply('Char.Vitals', { opponent: 'an orc scout', buffer: 'a citizen mercenary (MERC)', 'opponent-hits': 'wounded', 'buffer-hits': 'hurt' });
    expect(card(g)).toEqual({ left: { name: 'a citizen mercenary', pct: 50 }, right: { name: 'an orc scout', pct: 45 } });
    const h = group();
    h.apply('Char.Vitals', { opponent: 'an orc scout', buffer: 'Dori', 'opponent-hits': 'fine' });
    expect(card(h)!.left).toEqual({ name: 'Dori', pct: 80 });
  });

  it('a tank outside the group: its name, the bar unknown', () => {
    const g = group();
    g.apply('Char.Vitals', { opponent: 'an orc scout', buffer: 'Thorin', 'opponent-hits': 'fine' });
    expect(card(g)!.left).toEqual({ name: 'Thorin', pct: null });
  });

  it('an unknown opponent word keeps the last step', () => {
    const g = group();
    g.apply('Char.Vitals', { opponent: 'an orc scout', 'opponent-hits': 'scratched' });
    expect(card(g)!.right.pct).toBe(100);
    expect(card(g, SELF, 45)!.right.pct).toBe(45);
  });

  it('a group NPC you fight is named with its label', () => {
    const g = group();
    g.apply('Char.Vitals', { opponent: 'a citizen mercenary (MERC)', 'opponent-hits': 'bad' });
    expect(card(g)!.right).toEqual({ name: 'a citizen mercenary (MERC)', pct: 25 });
  });
});

describe('fightSig', () => {
  it('changes with what the card draws and with nothing else', () => {
    const g = group();
    expect(fightSig(card(g))).toBe('');
    g.apply('Char.Vitals', { opponent: 'an orc scout', buffer: 'Rasta', 'opponent-hits': 'healthy' });
    const a = fightSig(card(g));
    expect(a).not.toBe('');
    expect(fightSig(card(g))).toBe(a);
    // The same percent from other numbers: nothing to redraw.
    expect(fightSig(card(g, { ...SELF, hp: 316, maxhp: 344 }))).toBe(a);
    expect(fightSig(card(g, { ...SELF, hp: 100 }))).not.toBe(a);
    g.apply('Char.Vitals', { 'opponent-hits': 'fine' });
    expect(fightSig(card(g))).not.toBe(a);
  });
});
