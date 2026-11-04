import { describe, expect, it } from 'vitest';
import { AFFECTS, affectName } from '../../src/timers/data/affects';
import { T0, bench } from './timers-helpers';

describe('affect data', () => {
  it('has the 47 affects of the inventory with their types and durations', () => {
    const all = Object.values(AFFECTS);
    expect(all).toHaveLength(47);
    expect(all.filter((a) => a.type === 'spell')).toHaveLength(12);
    expect(all.filter((a) => a.type === 'buff')).toHaveLength(19);
    expect(all.filter((a) => a.type === 'debuff')).toHaveLength(16);
    expect(all.filter((a) => a.duration !== undefined)).toHaveLength(37);
    expect(Object.entries(AFFECTS).filter(([, a]) => a.damageDroppable).map(([n]) => n).sort()).toEqual(['armour', 'shroud']);
    expect(AFFECTS.sanctuary!.duration).toBe(270);
    expect(affectName('orkish DRAUGHT')).toBe('Orkish draught');
    expect(affectName('unable to quit')).toBeUndefined();
  });
});

describe('affects tracker', () => {
  it('start → up, refresh → refreshed (timer restarts), drop → down', () => {
    const b = bench();
    b.line('You start glowing.');
    expect(b.take()).toEqual(['◆ SPELL: sanctuary up.']);
    expect(b.cell('sanctuary')).toMatchObject({ group: 'sanct', startedAt: T0, expiresAt: T0 + 270_000, expected: 270_000, tracked: true });
    b.advance(100);
    b.line('Your aura glows more intensely.');
    expect(b.take()).toEqual(['◆ SPELL: sanctuary refreshed.']);
    expect(b.cell('sanctuary')!.expiresAt).toBe(T0 + 370_000);
    // A start line on an active affect refreshes too.
    b.line('You start glowing.');
    expect(b.take()).toEqual(['◆ SPELL: sanctuary refreshed.']);
    b.advance(268);
    b.line('The white aura around your body fades.');
    expect(b.take()).toEqual(['◆ SPELL: sanctuary down.']);
    expect(b.cell('sanctuary')).toBeUndefined();
    expect(b.tr.affects.samples('sanctuary')).toEqual([268]);
    expect(b.errors).toEqual([]);
  });

  it('a refresh line on an inactive affect starts it', () => {
    const b = bench();
    b.line('Your protection is revitalised.');
    expect(b.take()).toEqual(['◆ SPELL: shield up.']);
  });

  it('learns floor(mean) of the last 3 samples', () => {
    const b = bench();
    for (const secs of [260, 265, 271, 280]) {
      b.line('You start glowing.');
      b.advance(secs);
      b.line('The white aura around your body fades.');
    }
    expect(b.tr.affects.samples('sanctuary')).toEqual([265, 271, 280]);
    b.line('You start glowing.');
    expect(b.cell('sanctuary')!.expected).toBe(272_000); // floor(816 / 3)
  });

  it('damage-droppable affects learn only samples not shorter than the table', () => {
    const b = bench();
    b.line('A blue transparent wall slowly appears around you.');
    b.advance(300);
    b.line('You feel less protected.');
    expect(b.tr.affects.samples('armour')).toEqual([]);
    b.line('A blue transparent wall slowly appears around you.');
    b.advance(1120);
    b.line('You feel less protected.');
    expect(b.tr.affects.samples('armour')).toEqual([1120]);
  });

  it('stays in overrun until the drop line; the 2.5× net removes it silently', () => {
    const b = bench();
    b.line('You feel surge of power.'); // not a line
    b.line('You feel a surge of power.');
    b.take();
    b.advance(700); // Blood of Sauron 660 s
    expect(b.cell('Blood of Sauron')).toBeDefined();
    b.line('The warm taste of blood in your mouth vanishes.');
    expect(b.tr.affects.samples('Blood of Sauron')).toEqual([700]);
    b.take();
    b.line('You begin to feel the light of Aman shine upon you.'); // bless 480 s
    b.take();
    b.advance(1190);
    expect(b.cell('bless')).toBeDefined();
    b.advance(20); // 2.5 × 480 = 1200 (checked every 10 s)
    expect(b.cell('bless')).toBeUndefined();
    expect(b.take()).toEqual([]);
    expect(b.tr.affects.samples('bless')).toEqual([]);
  });

  it('an affect without a drop line ends at its expiry', () => {
    const b = bench();
    b.line('You are filled with anger!');
    expect(b.take()).toEqual(['◆ BUFF: anger up.']);
    b.advance(29);
    expect(b.cell('anger')).toBeDefined();
    b.advance(11);
    expect(b.cell('anger')).toBeUndefined();
    expect(b.take()).toEqual(['◆ BUFF: anger down.']);
    expect(b.tr.affects.samples('anger')).toEqual([]);
  });

  it('a shared line drops one affect and starts the next', () => {
    const b = bench();
    b.line('You feel a surge of energy as you gain a second wind.');
    b.advance(61);
    b.line('Your energy wanes as your second wind fades.');
    expect(b.take()).toEqual(['◆ BUFF: second wind up.', '◆ BUFF: second wind down.', '◆ DEBUFF: winded up.']);
    expect(b.names()).toEqual(['winded']);
    b.line('You feel comfortable.');
    b.line("You're starting to feel very comfortable.");
    b.line('You feel slightly less comfortable.');
    expect(b.take()).toEqual([
      '◆ BUFF: comfortable up.',
      '◆ BUFF: comfortable down.',
      '◆ BUFF: very comfortable up.',
      '◆ BUFF: very comfortable down.',
      '◆ BUFF: comfortable up.',
    ]);
  });

  it('indefinite affects have no timer and refresh silently', () => {
    const b = bench();
    b.line('You are hungry.');
    expect(b.cell('hunger')).toMatchObject({ group: 'debuff', expiresAt: null, expected: null, tracked: true });
    b.line('Your burden is really heavy.', 'Your burden is sheer torture.');
    expect(b.take()).toEqual(['◆ DEBUFF: hunger up.', '◆ DEBUFF: heavy burden up.']);
    b.line('You are full.');
    expect(b.take()).toEqual(['◆ DEBUFF: hunger down.']);
  });

  it('matches the prefix lines', () => {
    const b = bench();
    b.line('Your focus sharpens as you share an enslaved shadow\'s sight.');
    b.line('Your lungs seem to burst as the smoke fills them.');
    expect(b.names().sort()).toEqual(['shadow-link', 'smothered']);
  });

  it('saves timed entries and samples; restores silently, dropping expired and indefinite', () => {
    const b = bench();
    b.line('You start glowing.');
    b.advance(270);
    b.line('The white aura around your body fades.');
    b.line('You start glowing.', 'You feel protected.', 'You are hungry.', 'You are filled with anger!');
    b.advance(40);
    const saved = JSON.parse(JSON.stringify(b.tr.affects.serialize()));
    expect(saved.active.map((e: { name: string }) => e.name).sort()).toEqual(['sanctuary', 'shield']);
    expect(saved.learned).toEqual({ sanctuary: [270] });

    const c = bench();
    c.setNow(b.now() + 100_000);
    c.line('You feel protected.'); // arrived while loading: wins
    c.take();
    c.tr.affects.restore(saved, c.now());
    expect(c.take()).toEqual([]);
    expect(c.names().sort()).toEqual(['sanctuary', 'shield']);
    expect(c.cell('shield')!.startedAt).toBe(c.now());
    expect(c.cell('sanctuary')!.expiresAt).toBe(b.cell('sanctuary')!.expiresAt);
    expect(c.tr.affects.samples('sanctuary')).toEqual([270]);
    const later = bench();
    later.setNow(b.now() + 400_000);
    later.tr.affects.restore(saved, later.now());
    expect(later.names()).toEqual(['shield']);
  });
});

describe('stat / info reconcile', () => {
  it('adds seen affects (timed ones untracked), removes unseen silently, keeps running timers', () => {
    const b = bench();
    b.line('You feel protected.', 'You are hungry.', 'You start glowing.');
    b.take();
    b.advance(30);
    b.line('Affected by:', '- shield', '- detect magic', '- growth', '- unable to quit', '- stored spell fireball', '', '*=>');
    expect(b.take()).toEqual([]);
    expect(b.names().sort()).toEqual(['detect magic', 'fireball', 'growth', 'shield']);
    expect(b.cell('shield')!.startedAt).toBe(T0);
    expect(b.cell('detect magic')).toMatchObject({ tracked: false, startedAt: null, expiresAt: null });
    expect(b.cell('growth')).toMatchObject({ tracked: true, expiresAt: null, group: 'buff' });
    expect(b.cell('fireball')).toMatchObject({ group: 'stored', tracked: false });
    // Graduation: the next start line makes it tracked.
    b.line('Your awareness of magical auras is renewed.');
    expect(b.cell('detect magic')).toMatchObject({ tracked: true, startedAt: b.now(), expected: 2_400_000 });
    expect(b.take()).toEqual(['◆ SPELL: detect magic refreshed.']);
  });

  it('an untracked entry records no sample when it drops; the info header works too', () => {
    const b = bench();
    b.line('You are subjected to the following temporary effects:', '- bless', '*=>');
    b.advance(100);
    b.line('The light of Aman fades away from you.');
    expect(b.take()).toEqual(['◆ SPELL: bless down.']);
    expect(b.tr.affects.samples('bless')).toEqual([]);
  });

  it('the block ends on the first non-item line, which is routed as usual', () => {
    const b = bench();
    b.line('Affected by:', '- bless', 'You start glowing.');
    expect(b.names().sort()).toEqual(['bless', 'sanctuary']);
  });
});
