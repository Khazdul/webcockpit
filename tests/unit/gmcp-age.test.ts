// The age table, the interpolation and the birthday (stage 77, `help age`).
import { describe, expect, it } from 'vitest';
import { ABILITIES, AGE_BRACKETS, AGE_MODIFIERS, AGE_NAMES, ageAt, ageInYears, birthdayIn } from '../../src/gmcp/age';
import { VITAL_KINDS } from '../../src/gmcp/bands';
import { type AgeFactor, ageFactor } from '../../src/gmcp/race';

// `help age` as it is printed, to compare the data against.
const HELP = `
  STR      0    1    1    0   -1   -1   -2
  INT      1    1    1    0    0    0   -1
  WIS     -1    0    0    1    1    2    2
  DEX      1    1    0    0   -1   -2   -3
  CON      0    1    1    0    0   -1   -2
  WIL      1    1    1    1    1    0    0
  PER      1    1    0    0   -1   -2   -3
  Mana    -5   -3    0    3    7   15   10
  Hit     14   16   12   10    8    4   -6
  Move    10   10    5    0   -5  -12  -15
  +Mana    0    1    3    6    8   10    6
  +Hit     3    2    1    0   -1   -2   -5
  +Move    3    3    2    1   -3   -6   -9
  1.0     18   24   32   40   50   65   90
  1.5     27   36   48   60   75   97  135
  2.0     36   48   64   80  100  130  180
  2.5     45   60   80  100  125  162  225
  3.0     54   72   96  120  150  195  270
  3.5     63   84  112  140  175  227  315`;
const printed = new Map(
  HELP.trim()
    .split('\n')
    .map((l) => {
      const [name, ...n] = l.trim().split(/ +/);
      return [name!, n.map(Number)] as const;
    }),
);

const FACTORS: readonly AgeFactor[] = [1, 1.5, 2, 2.5, 3, 3.5];
const signed = (n: number, d = 0): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;

describe('age data', () => {
  it('is the printed table', () => {
    for (const a of ABILITIES) expect(AGE_MODIFIERS.abilities[a], a).toEqual(printed.get(a.toUpperCase()));
    const name = { hp: 'Hit', mana: 'Mana', mp: 'Move' } as const;
    for (const k of VITAL_KINDS) {
      expect(AGE_MODIFIERS.points[k], k).toEqual(printed.get(name[k]));
      expect(AGE_MODIFIERS.regen[k], k).toEqual(printed.get(`+${name[k]}`));
    }
    for (const f of FACTORS) expect(AGE_BRACKETS[f], String(f)).toEqual(printed.get(f.toFixed(1)));
    expect(AGE_NAMES).toHaveLength(7);
  });
});

describe('ageAt', () => {
  it('Rasta: an orc, exactly 57', () => {
    const a = ageAt(57, ageFactor('Orc', 'Tarkhnarb Orc')!);
    expect(AGE_NAMES[a.index]).toBe('2nd');
    expect(a.next).toEqual({ index: 2, year: 64 });
    expect([signed(a.points.hp), signed(a.points.mana), signed(a.points.mp)]).toEqual(['+14', '−1', '+7']);
    expect([signed(a.regen.hp, 1), signed(a.regen.mana, 1), signed(a.regen.mp, 1)]).toEqual(['+1.4', '+2.1', '+2.4']);
    expect(a.points.hp).toBe(13.75); // unrounded
    expect(a.position).toBeCloseTo((1 + 9 / 16) / 7, 12);
  });

  it("help's own example: STR 0.5 at 21", () => {
    expect(ageAt(21, 1).abilities.str).toBe(0.5);
  });

  for (const f of FACTORS) {
    it(`factor ${f}: each bracket's edges, clamped outside`, () => {
      const b = AGE_BRACKETS[f];
      b.forEach((year, i) => {
        const at = ageAt(year, f);
        expect(at.index).toBe(i);
        expect(at.position).toBeCloseTo(i / 7, 12);
        expect(at.next).toEqual(i === 6 ? null : { index: i + 1, year: b[i + 1] });
        for (const a of ABILITIES) expect(at.abilities[a]).toBe(AGE_MODIFIERS.abilities[a][i]);
        for (const k of VITAL_KINDS) {
          expect(at.points[k]).toBe(AGE_MODIFIERS.points[k][i]);
          expect(at.regen[k]).toBe(AGE_MODIFIERS.regen[k][i]);
        }
        if (i === 0) return;
        // The last day before it: still the age before, nearly at this one.
        const last = ageAt(ageInYears(year - 1, 11, 29), f);
        expect(last.index).toBe(i - 1);
        expect(last.next!.year).toBe(year);
        expect(last.position).toBeLessThan(i / 7);
        expect(last.points.hp).toBeCloseTo(AGE_MODIFIERS.points.hp[i]!, 1);
        const mid = ageAt((b[i - 1]! + year) / 2, f);
        expect(mid.points.mana).toBe((AGE_MODIFIERS.points.mana[i - 1]! + AGE_MODIFIERS.points.mana[i]!) / 2);
      });
      const young = ageAt(1, f);
      expect([young.index, young.position, young.points.hp, young.next!.year]).toEqual([0, 0, 14, b[1]]);
      const old = ageAt(b[6]! + 500, f);
      expect([old.index, old.position, old.points.hp, old.next]).toEqual([6, 6 / 7, -6, null]);
    });
  }

  it('a fractional age moves the modifiers, not the age it is in', () => {
    const age = ageInYears(57, 7, 7);
    expect(age).toBeCloseTo(57 + 217 / 360, 12);
    const a = ageAt(age, 2);
    expect(a.index).toBe(1);
    expect(a.points.hp).toBeCloseTo(16 - (4 * (age - 48)) / 16, 12);
    expect(ageInYears(21)).toBe(21);
  });
});

describe('birthdayIn', () => {
  it('a started month counts whole', () => {
    const rows: Array<[number, number, string]> = [
      [7, 7, 'in 5 months'],
      [7, 0, 'in 5 months'],
      [7, 29, 'in 5 months'],
      [10, 15, 'in 2 months'],
      [11, 0, 'in 1 month'],
      [11, 29, 'in 1 month'],
      [0, 1, 'in 12 months'],
      [0, 0, 'today'],
    ];
    for (const [m, d, want] of rows) expect(birthdayIn(m, d), `${m} ${d}`).toBe(want);
  });
});
