import { describe, expect, it } from 'vitest';
import {
  type TimerCell,
  type TimerGroup,
  barPct,
  charmMinutes,
  countdownText,
  exactText,
  sortCells,
} from '../../src/timers/entry';

const T = 1_790_000_000_000;

function cell(name: string, group: TimerGroup, extra: Partial<TimerCell> = {}): TimerCell {
  return { id: name, name, group, startedAt: T, expiresAt: null, expected: null, tracked: true, ...extra };
}

const timed = (name: string, group: TimerGroup, remainS: number, expectedS = 100, extra: Partial<TimerCell> = {}) =>
  cell(name, group, { expiresAt: T + remainS * 1000, expected: expectedS * 1000, ...extra });

describe('bar', () => {
  it('pct is remaining over expected; indefinite full; untracked and overrun empty', () => {
    expect(barPct(timed('a', 'spell', 50), T)).toBe(0.5);
    expect(barPct(timed('a', 'spell', 150), T)).toBe(1);
    expect(barPct(timed('a', 'spell', -5), T)).toBe(0);
    expect(barPct(cell('hunger', 'debuff'), T)).toBe(1);
    expect(barPct(cell('x', 'spell', { tracked: false, startedAt: null }), T)).toBe(0);
  });
});

describe('countdown', () => {
  it('seconds up to 90, then minutes rounded half up', () => {
    expect(countdownText(3)).toBe('3s');
    expect(countdownText(90)).toBe('90s');
    expect(countdownText(90.9)).toBe('90s');
    expect(countdownText(91)).toBe('2m');
    expect(countdownText(130)).toBe('2m');
    expect(countdownText(150)).toBe('3m');
    expect(countdownText(0)).toBe('0s');
    expect(countdownText(-12)).toBe('0s');
  });

  it('exact time for tooltips: seconds, m:ss, h:mm:ss', () => {
    expect(exactText(45)).toBe('45s');
    expect(exactText(45.9)).toBe('45s');
    expect(exactText(60)).toBe('1:00');
    expect(exactText(192)).toBe('3:12');
    expect(exactText(6720)).toBe('1:52:00');
    expect(exactText(-3)).toBe('0s');
  });

  it('from an hour: hours and two-digit minutes', () => {
    expect(countdownText(6720)).toBe('1h52');
    expect(countdownText(3600)).toBe('1h00');
  });

  it('charm minutes count up to 99; permanent has none', () => {
    const c = cell('troll', 'charm', { startedAt: T, expiresAt: T + 5940_000 });
    expect(charmMinutes(c, T + 59_000)).toBe(0);
    expect(charmMinutes(c, T + 21 * 60_000 + 5)).toBe(21);
    expect(charmMinutes(c, T + 200 * 60_000)).toBe(99);
    expect(charmMinutes(cell('shadow', 'charm'), T)).toBeNull();
  });
});

describe('sort', () => {
  it('affects: untimed first by name, then most remaining first, name tie-break', () => {
    const cells = [
      timed('bless', 'spell', 10),
      cell('Thirst', 'spell'),
      timed('shield', 'spell', 300),
      timed('armour', 'spell', 10),
      cell('hunger', 'spell'),
    ];
    expect(sortCells('spell', cells).map((c) => c.name)).toEqual(['hunger', 'Thirst', 'shield', 'armour', 'bless']);
  });

  it('stored: tracked by remaining, then untracked by name', () => {
    const cells = [
      cell('lightning', 'stored', { tracked: false, startedAt: null }),
      timed('fireball', 'stored', 100),
      cell('Earthquake', 'stored', { tracked: false, startedAt: null }),
      timed('armour', 'stored', 200),
    ];
    expect(sortCells('stored', cells).map((c) => c.name)).toEqual(['armour', 'fireball', 'Earthquake', 'lightning']);
  });

  it('blinds by remaining; charms oldest first', () => {
    expect(sortCells('blind', [timed('orc', 'blind', 10), timed('2.orc', 'blind', 80)]).map((c) => c.name)).toEqual([
      '2.orc',
      'orc',
    ]);
    const charms = [
      cell('b', 'charm', { startedAt: T + 50 }),
      cell('a', 'charm', { startedAt: T + 10 }),
      cell('c', 'charm', { startedAt: T + 30 }),
    ];
    expect(sortCells('charm', charms).map((c) => c.name)).toEqual(['a', 'c', 'b']);
  });
});
