import { describe, expect, it } from 'vitest';
import { CastQueue, parseCast, parseCastEcho } from '../../src/timers/castq';
import { STORABLE_SPELLS, resolveSpell } from '../../src/timers/data/spells';
import { T0, bench } from './timers-helpers';

describe('cast parsing', () => {
  it('recognises casts with and without a speed', () => {
    expect(parseCast("c 'bli' 2.orc")).toEqual({ spell: 'bli', tail: '2.orc' });
    expect(parseCast("cast n 'charm' troll")).toEqual({ spell: 'charm', tail: 'troll' });
    expect(parseCast("CA quickly 'store' fireb")).toEqual({ spell: 'store', tail: 'fireb' });
    expect(parseCast("cast 'sanctuary")).toEqual({ spell: 'sanctuary', tail: '' });
    expect(parseCast('cast sanctuary')).toBeNull();
    expect(parseCast("camp 'x'")).toBeNull();
    expect(parseCast("say 'hi'")).toBeNull();
    expect(parseCastEcho("[cast n 'armour']")).toBe('armour');
    expect(parseCastEcho("[cast 'shroud' t]")).toBe('shroud');
    expect(parseCastEcho('[cha mood ag]')).toBeNull();
  });

  it('resolves spells by their shortest prefix', () => {
    expect(Object.keys(STORABLE_SPELLS)).toHaveLength(36);
    expect(resolveSpell('fireb')).toBe('fireball');
    expect(resolveSpell('FireB')).toBe('fireball');
    expect(resolveSpell('magic m')).toBe('magic missile');
    expect(resolveSpell('magic b')).toBe('magic blast');
    expect(resolveSpell('magic ')).toBeNull();
    expect(resolveSpell('store')).toBe('store');
    expect(resolveSpell('earth')).toBe('earthquake');
    expect(resolveSpell('locate')).toBe('locate');
    expect(resolveSpell('fireballs')).toBeNull();
    expect(resolveSpell('')).toBeNull();
  });
});

describe('cast queue', () => {
  it('queues blindness and charm casts and forgets them after 10 s idle', () => {
    const q = new CastQueue(() => T0);
    q.onSent("c 'bl' orc", T0); // too short for blindness
    q.onSent("c 'c' orc", T0); // too short for charm
    expect(q.length).toBe(0);
    q.onSent("cast 'blind' 2.orc", T0);
    q.onSent("cast 'ch' troll", T0 + 1000);
    expect(q.front(T0 + 1000)).toEqual({ kind: 'blindness', prefix: '2.', inflight: false });
    expect(q.popIfFrontKind('charm', T0 + 1000)).toBeNull();
    expect(q.popIfFrontKind('blindness', T0 + 1000)!.prefix).toBe('2.');
    expect(q.popIfFrontInflight('charm', T0 + 1000)).toBeNull();
    q.markFrontInflight('charm', T0 + 1000);
    expect(q.front(T0 + 10_999)).toBeDefined();
    expect(q.front(T0 + 11_000)).toBeUndefined();
  });

  it('an empty Enter and the shared failure lines drop the front', () => {
    const b = bench();
    b.send("c 'bli' 2.orc");
    b.send("c 'bli' 3.orc");
    b.send("c 'bli' 4.orc");
    b.send('');
    b.line('Nothing seems to happen.');
    b.line('An orc seems to be blinded!');
    expect(b.names('blind')).toEqual(['4.orc']);
    b.send("c 'bli' 2.orc");
    b.line('You flee head over heels.');
    b.line('An orc seems to be blinded!');
    b.send("c 'bli' 2.orc");
    b.line('Nobody here by that name.');
    b.line('An orc seems to be blinded!');
    expect(b.names('blind')).toEqual(['4.orc', 'orc', 'orc']);
  });
});

describe('stored spells', () => {
  it('store FIFO from sends: stored, decay (sample), recall', () => {
    const b = bench();
    b.send('store fireb');
    b.send("cast n 'store' earth");
    b.line("[cast n 'store' earth]"); // the echo is no second attempt
    b.line('You start to concentrate...', 'You stored it.');
    b.advance(10);
    b.line('You stored it.');
    b.line('You stored it.'); // queue empty: ignored
    expect(b.take()).toEqual(['◆ STORE: fireball stored.', '◆ STORE: earthquake stored.']);
    expect(b.cell('fireball')).toMatchObject({ group: 'stored', expected: 5_400_000, expiresAt: T0 + 5_400_000, tracked: true });
    b.send('sto fireb');
    b.line('You stored it.');
    b.take();
    b.advance(5380); // the first fireball is 5390 s old
    b.line('Your mind feels empty for a while.');
    expect(b.take()).toEqual(['◆ STORE: fireball decayed (89:50 — sample recorded).']);
    expect(b.tr.stored.samples('fireball')).toEqual([5390]);
    // The other fireball takes the new mean.
    const fb = b.cells('stored').find((c) => c.name === 'fireball')!;
    expect(fb.expected).toBe(5_390_000);
    expect(fb.expiresAt).toBe(fb.startedAt! + 5_390_000);
    // Recall: the last cast intent, newest entry.
    b.line("[cast n 'earthq']", 'You quickly recall your stored spell...');
    expect(b.take()).toEqual(['◆ STORE: earthquake recalled.']);
    b.send("cast 'fireball' orc");
    b.line('You quickly recall your stored spell...');
    expect(b.take()).toEqual(['◆ STORE: fireball recalled.']);
    expect(b.cells('stored')).toEqual([]);
  });

  it('fail lines, a shared failure and an empty Enter drain the FIFO', () => {
    const b = bench();
    for (const s of ['store fireball', 'store shield', 'store armour', 'store scry']) b.send(s);
    b.line('Your mind is too full to store it.');
    b.line('Alas, not enough mana flows through you...');
    b.send('');
    expect(b.tr.stored.pendingCount).toBe(1);
    expect(b.take()).toEqual([
      '▶ STORE: cast attempt for fireball failed.',
      '▶ STORE: cast attempt for shield failed.',
      '▶ STORE: cast attempt for armour failed.',
    ]);
    b.line('You stored it.');
    expect(b.names('stored')).toEqual(['scry']);
  });

  it('a magic blast makes every entry untracked; an untracked decay records no sample', () => {
    const b = bench();
    b.send('store fireball');
    b.line('You stored it.');
    b.take();
    b.line('Gibur blasts the area with magical energies.');
    expect(b.take()).toEqual(['⚠ WARN: STORE: lost track of stored spells.']);
    expect(b.cell('fireball')).toMatchObject({ tracked: false, expiresAt: null });
    b.line('Your mind feels empty for a while.');
    expect(b.take()).toEqual(['◆ STORE: fireball decayed (untracked).']);
    expect(b.tr.stored.samples('fireball')).toEqual([]);
  });

  it('reconciles as a multiset: untracked first, then the oldest tracked', () => {
    const b = bench();
    b.send('store earthq');
    b.line('You stored it.');
    b.advance(5);
    b.send('store earthq');
    b.line('You stored it.');
    b.line('Affected by:', '- stored spell earthquake', '- stored spell earthquake', '- stored spell earthquake', '- stored spell teleport', '');
    expect(b.cells('stored').filter((c) => !c.tracked).map((c) => c.name).sort()).toEqual(['earthquake', 'teleport']);
    b.line('Affected by:', '- stored spell earthquake', '');
    const left = b.cells('stored');
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ name: 'earthquake', tracked: true, startedAt: T0 + 5000 });
  });

  it('saves every entry and the samples; restore drops expired tracked, keeps untracked', () => {
    const b = bench();
    b.send('store fireball');
    b.line('You stored it.');
    b.advance(100);
    b.line('Affected by:', '- stored spell fireball', '- stored spell scry', '');
    const saved = JSON.parse(JSON.stringify(b.tr.stored.serialize()));
    const c = bench();
    c.setNow(T0 + 6000_000);
    c.tr.stored.restore(saved, c.now());
    expect(c.names('stored')).toEqual(['scry']);
    const d = bench();
    d.setNow(T0 + 1000_000);
    d.tr.stored.restore(saved, d.now());
    expect(d.names('stored').sort()).toEqual(['fireball', 'scry']);
  });
});

describe('blinds', () => {
  it('names the bar with the typed numeric prefix and strips the article', () => {
    const b = bench();
    b.send("cast 'blindness' 2.orc");
    b.line('You start to concentrate...', 'An orc seems to be blinded!');
    b.line('A troll seems to be blinded!');
    b.line('Anaru seems to be blinded!');
    expect(b.take()).toEqual(['◆ BLIND: 2.orc up.', '◆ BLIND: troll up.', '◆ BLIND: Anaru up.']);
    expect(b.cell('2.orc')).toMatchObject({ group: 'blind', expected: 90_000, expiresAt: T0 + 90_000 });
  });

  it('already blind drops the cast; bars end after 90 s', () => {
    const b = bench();
    b.send("c 'bli' 2.orc");
    b.line('Your victim is already blind.');
    b.line('An orc seems to be blinded!');
    expect(b.names('blind')).toEqual(['orc']);
    b.take();
    b.advance(89);
    expect(b.names('blind')).toEqual(['orc']);
    b.advance(2);
    expect(b.names('blind')).toEqual([]);
    expect(b.take()).toEqual(['◆ BLIND: orc down.']);
  });

  it('restores unexpired bars silently', () => {
    const b = bench();
    b.line('An orc seems to be blinded!');
    const saved = JSON.parse(JSON.stringify(b.tr.blinds.serialize()));
    const c = bench();
    c.setNow(T0 + 30_000);
    c.tr.blinds.restore(saved, c.now());
    expect(c.cell('orc')!.expiresAt).toBe(T0 + 90_000);
    c.setNow(T0 + 90_000);
    const d = bench();
    d.setNow(T0 + 90_000);
    d.tr.blinds.restore(saved, d.now());
    expect(d.names()).toEqual([]);
  });
});

describe('charms', () => {
  it('lands only with a charm cast in flight at the queue front', () => {
    const b = bench();
    b.line('A citizen mercenary starts following you.'); // no cast
    b.send("cast 'charm' troll");
    b.line('A huge stone troll starts following you.'); // not in flight yet
    expect(b.names('charm')).toEqual([]);
    b.line('You start to concentrate...', 'A huge stone troll starts following you.');
    expect(b.take()).toEqual(['◆ CHARM: huge stone troll up.']);
    expect(b.cell('huge stone troll')).toMatchObject({ expiresAt: T0 + 99 * 60_000, expected: 99 * 60_000 });
    // Renewed control: a fresh entry.
    b.send("c 'ch' troll");
    b.line('You muster all of your concentration...', 'Your control on the huge stone troll is renewed!');
    expect(b.names('charm')).toEqual(['huge stone troll', 'huge stone troll']);
    // Resisted.
    b.send("c 'ch' orc");
    b.line('You start to concentrate...', 'The orc seems to be ruled by powers other than yours...');
    b.line('The orc starts following you.');
    expect(b.names('charm')).toHaveLength(2);
    // A recalled stored charm is in flight too.
    b.send("c 'charm' orc");
    b.line('You quickly recall your stored spell...', 'The orc starts following you.');
    expect(b.names('charm')).toContain('orc');
  });

  it('the follow action runs at priority 4', () => {
    const b = bench();
    const r = b.engine.system.rules('action').find((x) => x.pattern.includes('starts following you'));
    expect(r?.priority).toBe(4);
  });

  it('controlled mobs: shadow permanent, warg replaces the oldest shadow, wood elf leaves', () => {
    const b = bench();
    b.line('An enslaved shadow starts following you.');
    b.advance(5);
    b.line('An enslaved shadow starts following you.');
    expect(b.cells('charm').map((c) => c.expiresAt)).toEqual([null, null]);
    b.take();
    b.line('A dreadful warg starts following you.');
    expect(b.take()).toEqual(['◆ CHARM: enslaved shadow down.', '◆ CHARM: dreadful warg up.']);
    const shadow = b.cells('charm').find((c) => c.name === 'enslaved shadow')!;
    expect(shadow.startedAt).toBe(T0 + 5000);
    b.line('A wood elf starts following you.');
    expect(b.cell('wood elf')!.expiresAt).toBe(b.now() + 99 * 60_000);
    b.line('A wood elf leaves and vanishes into the distance.');
    expect(b.cell('wood elf')).toBeUndefined();
    b.advance(100 * 60);
    expect(b.names('charm').sort()).toEqual(['dreadful warg', 'enslaved shadow']);
  });

  it('caps at 99 min; × drops by id; ids are monotonic and restored past the max', () => {
    const b = bench();
    b.line('A wood elf starts following you.');
    b.line('An enslaved shadow starts following you.');
    b.take();
    const ids = b.cells('charm').map((c) => c.id);
    expect(ids).toEqual(['charm:1', 'charm:2']);
    b.tr.charms.dropCharm('charm:2');
    expect(b.take()).toEqual(['◆ CHARM: enslaved shadow down.']);
    b.line('An enslaved shadow starts following you.');
    expect(b.cells('charm').map((c) => c.id)).toEqual(['charm:1', 'charm:3']);
    b.take();
    const saved = JSON.parse(JSON.stringify(b.tr.charms.serialize()));
    b.advance(99 * 60 + 2); // pruned every 2 s
    expect(b.take()).toEqual(['◆ CHARM: wood elf down.']);

    const c = bench();
    c.line('A wood elf starts following you.'); // landed while loading: id 1 collides
    c.tr.charms.restore(saved, c.now() + 1000);
    const cids = c.cells('charm').map((x) => x.id).sort();
    expect(new Set(cids).size).toBe(3);
    c.line('An enslaved shadow starts following you.');
    expect(c.cells('charm').map((x) => x.id)).toContain('charm:5');
    // A permanent entry survives any downtime.
    const d = bench();
    d.tr.charms.restore(saved, T0 + 1e9);
    expect(d.names('charm')).toEqual(['enslaved shadow']);
  });
});

describe('herblores', () => {
  it('manual add/remove with phases derived from the start', () => {
    const b = bench();
    expect(b.tr.herbs.herbs().map((h) => h.key)).toEqual(['Healing', 'Travelling', 'Clearthought', 'Walking', 'Haste', 'DarkAura']);
    b.tr.herbs.addHerb('Clearthought', b.now());
    b.tr.herbs.addHerb('Clearthought', b.now()); // no refresh
    expect(b.take()).toEqual(['◆ HERB: Clearthought up.']);
    expect(b.cell('Clearthought')).toMatchObject({ group: 'herb', phase: 'buff', herbKey: 'Clearthought', expiresAt: T0 + 120_000, expected: 120_000 });
    b.advance(120);
    expect(b.take()).toEqual(['◆ HERB: Clearthought (low) up.']);
    b.advance(240);
    expect(b.take()).toEqual(['◆ HERB: Clearthought (neg) up.']);
    expect(b.cell('Clearthought (neg)')).toMatchObject({ group: 'herb', phase: 'debuff', startedAt: T0 + 360_000, expected: 360_000 });
    b.advance(360);
    expect(b.take()).toEqual(['◆ HERB: Clearthought (neg) down.']);
    b.tr.herbs.addHerb('DarkAura', b.now());
    expect(b.tr.herbs.herbs().find((h) => h.key === 'DarkAura')).toEqual({ key: 'DarkAura', name: 'Dark aura', active: true });
    b.tr.herbs.removeHerb('DarkAura', b.now());
    expect(b.take()).toEqual(['◆ HERB: Dark aura up.', '◆ HERB: Dark aura down.']);
  });

  it('restores into the right phase silently', () => {
    const b = bench();
    b.tr.herbs.addHerb('Haste', b.now());
    const saved = JSON.parse(JSON.stringify(b.tr.herbs.serialize()));
    const c = bench();
    c.setNow(T0 + 400_000);
    c.tr.herbs.restore(saved, c.now());
    c.advance(1);
    expect(c.take()).toEqual([]);
    expect(c.names()).toEqual(['Haste (recovery)']);
    const d = bench();
    d.tr.herbs.restore(saved, T0 + 2_000_000);
    expect(d.names()).toEqual([]);
  });
});
