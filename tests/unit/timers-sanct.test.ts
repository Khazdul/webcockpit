import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { GameState } from '../../src/gmcp/state';
import { STATUS_FLAGS } from '../../src/gmcp/group';
import { SANCT_OTHERS_MS, castTarget, isSanctuarySpell, targetNames, type SanctMember } from '../../src/timers/sanct';
import { T0, bench } from './timers-helpers';

const flags = (sanctuary: boolean) => ({ ...Object.fromEntries(STATUS_FLAGS.map((f) => [f, false])), sanctuary }) as SanctMember['flags'];
const mem = (id: number, name: string, sanctuary: boolean, label: string | null = null, type = 'ally'): SanctMember => ({
  id,
  name,
  label,
  type,
  flags: flags(sanctuary),
});

describe('sanctuary on others: parsing', () => {
  it('knows the spell, the target and whom it names', () => {
    expect(isSanctuarySpell('sanc')).toBe(true);
    expect(isSanctuarySpell('sa')).toBe(true);
    expect(isSanctuarySpell('s')).toBe(false);
    expect(isSanctuarySpell('sanctuaryx')).toBe(false);
    expect(castTarget('2.gibur')).toBe('gibur');
    expect(castTarget('  Éowyn now')).toBe('eowyn');
    expect(castTarget('')).toBe(null);
    expect(targetNames('gib', mem(2, 'Gibur', true))).toBe(true);
    expect(targetNames('merc', mem(4, 'a citizen mercenary', true, 'MERC', 'npc'))).toBe(true);
    expect(targetNames('citizen', mem(4, 'a citizen mercenary', true, 'MERC', 'npc'))).toBe(true);
    expect(targetNames('orc', mem(2, 'Gibur', true))).toBe(false);
  });
});

describe('sanctuary on others: the tracker', () => {
  it('times a member whose flag turns on after your cast; others are untimed', () => {
    const b = bench();
    const s = b.tr.sanct;
    s.onGroup([mem(2, 'Gibur', false), mem(3, 'Taube', true)], b.now());
    expect(b.cells('sanct')).toEqual([
      { id: 'sanct:3', name: 'Taube', group: 'sanct', target: 'Taube', startedAt: null, expiresAt: null, expected: null, tracked: false },
    ]);
    b.send("c 'sanc' gib");
    b.advance(3);
    s.onGroup([mem(2, 'Gibur', true), mem(3, 'Taube', true)], b.now());
    const g = b.cells('sanct').find((c) => c.id === 'sanct:2')!;
    expect(g).toEqual({
      id: 'sanct:2',
      name: 'Gibur',
      group: 'sanct',
      target: 'Gibur',
      startedAt: T0 + 3000,
      expiresAt: T0 + 3000 + SANCT_OTHERS_MS,
      expected: SANCT_OTHERS_MS,
      tracked: true,
      estimated: true,
    });
    // Flag off: gone.
    s.onGroup([mem(2, 'Gibur', false), mem(3, 'Taube', true)], b.now());
    expect(b.cells('sanct').map((c) => c.id)).toEqual(['sanct:3']);
    // The member leaves: gone.
    s.onGroup([], b.now());
    expect(b.cells('sanct')).toEqual([]);
  });

  it('a cast older than 10 s, on yourself, or another spell does not time it', () => {
    const b = bench();
    const s = b.tr.sanct;
    b.send("cast 'sanctuary' gibur");
    b.advance(11);
    s.onGroup([mem(2, 'Gibur', true)], b.now());
    expect(b.cells('sanct')[0]!.tracked).toBe(false);
    s.onGroup([], b.now());
    b.send("cast 'sanctuary'");
    b.send("cast 'shield' gibur");
    s.onGroup([mem(2, 'Gibur', true)], b.now());
    expect(b.cells('sanct')[0]!.tracked).toBe(false);
  });

  it('a timed entry that runs out while the flag is on turns untimed; reset forgets all', () => {
    const b = bench();
    const s = b.tr.sanct;
    b.send("c 'sa' 2.gibur");
    s.onGroup([mem(2, 'Gibur', true)], b.now());
    expect(b.cells('sanct')[0]!.tracked).toBe(true);
    b.advance(SANCT_OTHERS_MS / 1000);
    expect(b.cells('sanct')[0]).toMatchObject({ tracked: false, expiresAt: null });
    expect(s.serialize()).toBe(undefined);
    s.reset();
    expect(b.cells('sanct')).toEqual([]);
  });
});

describe('sanctuary on others: through GameState', () => {
  it('Group.* changes reach the timers; your own sanctuary sorts first', () => {
    let now = T0;
    const bus = new Bus();
    const game = new GameState({ now: () => now, storage: null }).attach(bus);
    bus.emit('conn.state', { state: 'playing', prev: 'login' } as never);
    bus.emit('gmcp', { pkg: 'Group.Set', key: 'group.set', data: [{ id: 2, type: 'ally', name: 'Gibur', sanctuary: false }] });
    bus.emit('cmd.sent', { text: "cast 'sanctuary' gibur" } as never);
    now += 2000;
    bus.emit('gmcp', { pkg: 'Group.Update', key: 'group.update', data: { id: 2, sanctuary: true } });
    game.timers.debugAdd({ id: 'affect:sanctuary', name: 'sanctuary', group: 'sanct', startedAt: now, expiresAt: now + 100_000, expected: 270_000, tracked: true });
    const cells = game.timers.view().cells.sanct;
    expect(cells.map((c) => c.target ?? 'you')).toEqual(['you', 'Gibur']);
    expect(cells[1]).toMatchObject({ tracked: true, expiresAt: now + SANCT_OTHERS_MS, estimated: true });
    bus.emit('gmcp', { pkg: 'Group.Remove', key: 'group.remove', data: 2 });
    expect(game.timers.view().cells.sanct.map((c) => c.id)).toEqual(['affect:sanctuary']);
    game.dispose();
  });
});
