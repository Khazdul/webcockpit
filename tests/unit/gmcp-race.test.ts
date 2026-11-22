// Race line and age factor (stage 77, ADR 0166 point 9): the names of the
// stage file, most in a shape inferred from the one confirmed pair.
import { describe, expect, it } from 'vitest';
import { ageFactor, raceLine, raceWords } from '../../src/gmcp/race';

describe('raceWords', () => {
  it('lower case, diacritics folded, split on anything but letters', () => {
    expect(raceWords('Black Númenórean')).toEqual(['black', 'numenorean']);
    expect(raceWords('Half-Elf')).toEqual(['half', 'elf']);
    expect(raceWords('Dúnadan')).toEqual(['dunadan']);
    expect(raceWords(null)).toEqual([]);
  });
});

describe('raceLine', () => {
  it('decision 18', () => {
    const rows: Array<[string | null, string | null, string | null]> = [
      ['Orc', 'Tarkhnarb Orc', 'Tarkhnarb orc'],
      ['Orc', 'Zaugurz', 'Zaugurz orc'],
      ['Troll', 'Cave Troll', 'Cave troll'],
      ['Troll', 'Mountain Troll', 'Mountain troll'],
      ['Elf', 'Noldorin Elf', 'Noldorin elf'],
      ['Elf', 'Noldo', 'Noldo elf'],
      ['Elf', 'Half-Elf', 'Half-elf'],
      ['Hobbit', 'Fallohide Hobbit', 'Fallohide hobbit'],
      ['Man', 'Dúnadan', 'Dúnadan man'],
      ['Man', 'dúnadan', 'Dúnadan man'],
      ['Man', 'Dúnadan Man', 'Dúnadan man'],
      ['Man', 'Black Númenórean', 'Black Númenórean'],
      ['Black Númenórean', 'Black Númenórean', 'Black Númenórean'],
      ['Man', 'Númenórean', 'Númenórean man'],
      ['Half-Elf', 'Half-Elf', 'Half-elf'],
      ['Half-elf', 'Half-Elven', 'Half-elven'],
      ['Orc', 'Orc', 'Orc'],
      ['Orc', null, 'Orc'],
      [' Orc ', '  ', 'Orc'],
      ['Black Númenórean', '', 'Black Númenórean'],
      ['Wizard of the West', null, 'Wizard of the West'],
      [null, 'Cave Troll', 'Cave Troll'],
      [null, null, null],
      ['', '', null],
    ];
    for (const [race, sub, want] of rows) expect(raceLine(race, sub), `${race} / ${sub}`).toBe(want);
  });

  it("words that are an object's own keys are plain words", () => {
    expect(raceLine('constructor', 'toString')).toBe('ToString constructor');
  });
});

describe('ageFactor', () => {
  it('every name of the stage file', () => {
    const rows: Array<[string, string, number | null]> = [
      ['Orc', 'Tarkhnarb Orc', 2],
      ['Orc', 'Morruhk Orc', 2],
      ['Orc', 'Zaugurz Orc', 2],
      ['Orc', '', 2],
      ['Troll', 'Cave Troll', 2],
      ['Troll', 'Hill Troll', 2],
      ['Troll', 'Mountain Troll', 2],
      ['Dwarf', 'Broadbeam Dwarf', 2],
      ['Dwarf', 'Firebeard Dwarf', 2],
      ['Dwarf', 'Longbeard Dwarf', 2],
      ['Hobbit', 'Fallohide Hobbit', 1.5],
      ['Hobbit', 'Harfoot Hobbit', 1.5],
      ['Hobbit', 'Stoor Hobbit', 1.5],
      ['Half-Elf', 'Half-Elf', 2],
      ['Half-elf', '', 2],
      ['Half-elven', '', 2],
      ['Elf', 'Half-Elf', 2],
      ['', 'Half-elven', 2],
      ['Elf', 'Silvan Elf', 2.5],
      ['Elf', 'Sinda', 3],
      ['Elf', 'Sindar', 3],
      ['Elf', 'Sindarin Elf', 3],
      ['Elf', 'Noldo', 3.5],
      ['Elf', 'Noldor', 3.5],
      ['Elf', 'Noldorin Elf', 3.5],
      ['Man', 'Dúnadan', 1.5],
      ['Man', 'Dunadan', 1.5],
      ['Man', 'Dúnedain', 1.5],
      ['Man', 'Númenórean', 1.5],
      ['Man', 'Black Númenórean', 1.5],
      ['Black Númenórean', '', 1.5],
      ['Man', 'Eriadorian Man', 1],
      ['Man', 'Rohirrim', 1],
      ['Man', 'Beorning', 1],
      ['Bear', 'Beorning Bear', 1],
      ['Bear', '', 1],
      ['', 'Bear', 1],
      // Never a guess.
      ['Elf', '', null],
      ['Elf', 'Avarin Elf', null],
      ['Man', '', null],
      ['Man', 'Easterling', null],
      ['Man', 'Black', null],
      ['Ent', 'Old Ent', null],
      ['', '', null],
    ];
    for (const [race, sub, want] of rows) expect(ageFactor(race, sub), `${race} / ${sub}`).toBe(want);
    expect(ageFactor(null)).toBeNull();
  });
});
