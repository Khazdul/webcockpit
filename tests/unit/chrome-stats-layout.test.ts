import { describe, expect, it } from 'vitest';
import { DEFAULT_KILL_SORT, fmtClock, fmtK, nextStatSort, sortKills, sortPvps } from '../../src/chrome/frames/stats-layout';

describe('statistics formatting', () => {
  it('k-formats numbers', () => {
    expect(fmtK(950)).toBe('950');
    expect(fmtK(9100)).toBe('9.1k');
    expect(fmtK(48_200)).toBe('48.2k');
    expect(fmtK(482_000)).toBe('482k');
    expect(fmtK(1_234_000)).toBe('1.2M');
    expect(fmtK(12_300_000)).toBe('12M');
    expect(fmtK(-28_000)).toBe('-28.0k');
    expect(fmtK(0)).toBe('0');
  });

  it('formats clocks', () => {
    expect(fmtClock(0)).toBe('00:00');
    expect(fmtClock(34 * 60e6 + 12e6)).toBe('34:12');
    expect(fmtClock(8040e6)).toBe('2:14:00');
  });
});

describe('statistics tables', () => {
  const kills = [
    { name: 'A bat', n: 4, xpPer: 56, xpTotal: 224 },
    { name: 'Thrakghash of the Mountains', n: 1, xpPer: 5424, xpTotal: 5424 },
    { name: 'An orc', n: 2, xpPer: 100, xpTotal: 200 },
  ];

  it('sorts kills by any column, text ▲ and numbers ▼ first', () => {
    expect(sortKills(kills, DEFAULT_KILL_SORT).map((k) => k.name)).toEqual([
      'Thrakghash of the Mountains',
      'A bat',
      'An orc',
    ]);
    let s = nextStatSort(DEFAULT_KILL_SORT, 'n');
    expect(s).toEqual({ key: 'n', dir: -1 });
    expect(sortKills(kills, s)[0]!.name).toBe('A bat');
    s = nextStatSort(s, 'n');
    expect(s.dir).toBe(1);
    s = nextStatSort(s, 'name');
    expect(s).toEqual({ key: 'name', dir: 1 });
    expect(sortKills(kills, s).map((k) => k.name)).toEqual(['A bat', 'An orc', 'Thrakghash of the Mountains']);
    const pv = [
      { name: 'B', race: '', label: '*B*', n: 1, xp: 10 },
      { name: 'A', race: 'the Orc', label: '*A the Orc*', n: 2, xp: 5 },
    ];
    expect(sortPvps(pv, { key: 'xp', dir: -1 }).map((p) => p.name)).toEqual(['B', 'A']);
    expect(sortPvps(pv, { key: 'name', dir: 1 }).map((p) => p.name)).toEqual(['A', 'B']);
  });
});
