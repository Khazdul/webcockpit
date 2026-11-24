// The info poll's answer (stage 77 part A "Live results"): the one real
// sample with a made-up wimpy at its end (`%y` came in part C), and every
// `%C` value of that run.
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/gmcp/age';
import { INFO_FIELDS, INFO_SEPARATOR, type InfoKey, affectsOf, parseInfoAnswer, parsePollAnswer, pollFormat, wordsToNumber } from '../../src/gmcp/info-answer';

const G = (n: number) => `\x1b[32m${n}\x1b[0m`;
/** The WC1 answer of the stage file, as it wrapped: sent with a bare `|`. */
const SAMPLE = [
  '74|81|13|85|70|16|16|16|11|12|16|8|Str:16 Int:16 Wis:16 Dex:11 Con:12 Wil:16',
  'Per:8|57|7|7|four feet eleven|eight stone and five pounds|ninety-seven pounds|Heavy, but we will',
  `manage...|You are totally corrupted by the Evilness of Morgoth!|GoblinTown|${G(380)} gold coins,`,
  `${G(5)} silver pennies, and ${G(49)} copper pennies|warlord (19)|25|10|20|120`,
];
const SPACED = SAMPLE.join(' ').split('|').join(INFO_SEPARATOR);

const visible = (s: string): number => s.replace(/\x1b\[[0-9;]*m/g, '').length;

/** Breaks `text` at spaces as MUME does: the break takes the space's place, colour codes do not count. */
function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && visible(`${line} ${word}`) > cols) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  out.push(line);
  return out;
}

/** The sample with some fields replaced. */
function answer(change: Partial<Record<InfoKey, string>>) {
  const parts = SAMPLE.join(' ').split('|');
  INFO_FIELDS.forEach(({ key }, i) => {
    if (key in change) parts[i] = change[key]!;
  });
  return parseInfoAnswer([parts.join(INFO_SEPARATOR)])!;
}

const RASTA = {
  level: 74,
  ob: 81,
  db: 13,
  pb: 85,
  abs: 70,
  abilities: Object.fromEntries([16, 16, 16, 11, 12, 16, 8].map((n, i) => [ABILITIES[i], { current: n, unaffected: n, delta: 0 }])),
  years: 57,
  months: 7,
  days: 7,
  height: { feet: 4, inches: 11 },
  weight: { stone: 8, pounds: 5 },
  carrying: 97,
  load: 'Heavy, but we will manage...',
  alignment: 'totally corrupted by the Evilness of Morgoth',
  citizen: 'GoblinTown',
  purse: { gold: 380, silver: 5, copper: 49 },
  warFame: { word: 'warlord', points: 19 },
  vision: 25,
  hearing: 10,
  smell: 20,
  wimpy: 120,
};

describe('INFO_FIELDS', () => {
  it("is the stage file's format, in its order", () => {
    expect(INFO_FIELDS.map((f) => f.code).join('|')).toBe('%l|%O|%D|%k|%A|%S|%i|%w|%d|%o|%I|%p|%G|%a|%N|%n|%h|%W|%C|%F|%q|%c|%r|%K|%v|%H|%s|%y');
    expect(new Set(INFO_FIELDS.map((f) => f.key)).size).toBe(INFO_FIELDS.length);
  });
});

describe('parseInfoAnswer', () => {
  it('the real sample as it is', () => {
    expect(parseInfoAnswer(SAMPLE)).toEqual(RASTA);
  });

  it('separated by " | ": unwrapped, and wrapped at 97 and 40 columns', () => {
    expect(parseInfoAnswer([SPACED])).toEqual(RASTA);
    for (const cols of [97, 40]) {
      const lines = wrap(SPACED, cols);
      expect(lines.length).toBeGreaterThan(cols === 97 ? 2 : 6);
      for (const l of lines) expect(visible(l)).toBeLessThanOrEqual(cols);
      expect(parseInfoAnswer(lines), `${cols} columns`).toEqual(RASTA);
    }
  });

  it('wrapped at every width down to the longest word', () => {
    for (let cols = 120; cols >= 16; cols--) expect(parseInfoAnswer(wrap(SPACED, cols)), `${cols} columns`).toEqual(RASTA);
  });

  it('a wrong field count is no answer', () => {
    expect(parseInfoAnswer([])).toBeNull();
    expect(parseInfoAnswer([''])).toBeNull();
    expect(parseInfoAnswer([`${SPACED} | 1`])).toBeNull();
    expect(parseInfoAnswer([SPACED.slice(0, SPACED.lastIndexOf('|'))])).toBeNull();
  });

  it('an unreadable field is null, the rest is kept', () => {
    const bad: Array<[InfoKey, keyof typeof RASTA]> = [
      ['level', 'level'],
      ['ob', 'ob'],
      ['years', 'years'],
      ['height', 'height'],
      ['weight', 'weight'],
      ['carrying', 'carrying'],
      ['purse', 'purse'],
      ['warFame', 'warFame'],
      ['smell', 'smell'],
      ['wimpy', 'wimpy'],
    ];
    for (const [key, field] of bad) {
      for (const value of ['?', '']) expect(answer({ [key]: value }), `${key} "${value}"`).toEqual({ ...RASTA, [field]: null });
    }
    for (const key of ['load', 'alignment', 'citizen'] as const) expect(answer({ [key]: '' })).toEqual({ ...RASTA, [key]: null });
    expect(answer({ ob: '81%' }).ob).toBeNull();
  });

  it('the deltas are current − unaffected', () => {
    const a = answer({ str: '18', per: '7', db: '-4' });
    expect(a.abilities.str).toEqual({ current: 18, unaffected: 16, delta: 2 });
    expect(a.abilities.per).toEqual({ current: 7, unaffected: 8, delta: -1 });
    expect(a.db).toBe(-4);
    expect(answer({ dex: 'x' }).abilities.dex).toEqual({ current: null, unaffected: 11, delta: null });
    for (const g of ['', 'Str:16 Int:16', 'Str:x Int:16 Wis:16 Dex:11 Con:12 Wil:16 Per:8']) {
      const b = answer({ unaffected: g });
      expect(b.abilities.str, g).toEqual({ current: 16, unaffected: null, delta: null });
      expect(b.carrying).toBe(97);
    }
  });

  it('height and weight', () => {
    const heights: Array<[string, [number, number] | null]> = [
      ['six feet', [6, 0]],
      ['one foot two', [1, 2]],
      ['five feet one', [5, 1]],
      ['five feet and eleven inches', [5, 11]],
      ['seven feet one inch', [7, 1]],
      ['four feet twelve', null],
      ['four feet tall', null],
    ];
    for (const [s, want] of heights) expect(answer({ height: s }).height, s).toEqual(want && { feet: want[0], inches: want[1] });
    const weights: Array<[string, [number, number] | null]> = [
      ['eight stone', [8, 0]],
      ['twenty-one stone and one pound', [21, 1]],
      ['one stone, thirteen pounds', [1, 13]],
      ['nine pounds', [0, 9]],
      ['eight stone and some', null],
    ];
    for (const [s, want] of weights) expect(answer({ weight: s }).weight, s).toEqual(want && { stone: want[0], pounds: want[1] });
  });

  it('the money', () => {
    const rows: Array<[string, [number, number, number] | null]> = [
      ['1 gold coin, 1 silver penny, and 1 copper penny', [1, 1, 1]],
      ['12,345 gold coins, 5 silver pennies, and 49 copper pennies', [12345, 5, 49]],
      ['1,234,567 gold coins', [1234567, 0, 0]],
      ['5 silver pennies and 49 copper pennies', [0, 5, 49]],
      ['380 gold coins and 49 copper pennies', [380, 0, 49]],
      ['380 gold coins, and 5 silver pennies', [380, 5, 0]],
      ['5 silver pennies', [0, 5, 0]],
      ['49 copper pennies', [0, 0, 49]],
      [`${G(7)} copper pennies`, [0, 0, 7]],
      ['1,23 gold coins', null],
      ['5 gold coins and 5 gold coins', null],
      ['5 gold coins and a pie', null],
    ];
    for (const [s, want] of rows) expect(answer({ purse: s }).purse, s).toEqual(want && { gold: want[0], silver: want[1], copper: want[2] });
  });

  it('war fame and alignment', () => {
    expect(answer({ warFame: 'known (5)' }).warFame).toEqual({ word: 'known', points: 5 });
    expect(answer({ warFame: 'two words (1,204)' }).warFame).toEqual({ word: 'two words', points: 1204 });
    expect(answer({ warFame: 'known' }).warFame).toBeNull();
    expect(answer({ alignment: 'You are neutral.' }).alignment).toBe('neutral');
    expect(answer({ alignment: 'Something else' }).alignment).toBe('Something else');
  });
});

describe('the %C words', () => {
  // Every distinct value of the live run 2026-11-22.
  const LIVE: Array<[string, number]> = [
    ['nine', 9],
    ['seventeen', 17],
    ['twenty-four', 24],
    ['thirty-two', 32],
    ['forty', 40],
    ['forty-eight', 48],
    ['fifty-five', 55],
    ['sixty-three', 63],
    ['seventy-one', 71],
    ['seventy-eight', 78],
    ['eighty-six', 86],
    ['ninety-four', 94],
    ['ninety-seven', 97],
    ['one hundred two', 102],
    ['one hundred nine', 109],
    ['one hundred seventeen', 117],
    ['one hundred twenty-five', 125],
    ['one hundred thirty-two', 132],
    ['one hundred forty', 140],
    ['one hundred forty-eight', 148],
    ['one hundred fifty-six', 156],
    ['one hundred sixty-three', 163],
    ['one hundred sixty-seven', 167],
    ['one hundred seventy-five', 175],
    ['one hundred eighty-three', 183],
    ['one hundred ninety', 190],
    ['one hundred ninety-eight', 198],
    ['two hundred six', 206],
    ['two hundred fourteen', 214],
    ['two hundred twenty-one', 221],
    ['two hundred twenty-nine', 229],
    ['two hundred thirty-seven', 237],
    ['two hundred forty-four', 244],
    ['two hundred fifty-two', 252],
    ['two hundred sixty', 260],
  ];

  it('every value of the live run', () => {
    expect(LIVE).toHaveLength(35);
    for (const [words, n] of LIVE) expect(answer({ carrying: `${words} pounds` }).carrying, words).toBe(n);
  });

  it('one, none, thousands', () => {
    const rows: Array<[string, number]> = [
      ['one pound', 1],
      ['a pound', 1],
      ['no pounds', 0],
      ['zero pounds', 0],
      ['a hundred pounds', 100],
      ['a thousand pounds', 1000],
      ['one thousand, two hundred and five pounds', 1205],
      ['two thousand three hundred forty-five pounds', 2345],
      ['twelve hundred pounds', 1200],
      ['ten thousand pounds', 10000],
      ['ninety- seven pounds', 97],
    ];
    for (const [s, n] of rows) expect(answer({ carrying: s }).carrying, s).toBe(n);
  });

  it('what is not a number is null', () => {
    for (const s of ['', 'lots', 'hundred', 'two five', 'ten five', 'five fifteen', 'twenty thirty', 'two hundred hundred', 'and five', 'five and', 'two and five', 'two a', 'one zero', 'constructor']) expect(wordsToNumber(s), s).toBeNull();
  });
});

describe('parsePollAnswer (stage 77 H9: the vitals and %f)', () => {
  /** The lines between the sentinels: the fields, the vitals, then `%f` as measured live. */
  const lines = (vitals: string, affects: readonly string[], cols = 97): string[] => {
    const head = `${SPACED}${INFO_SEPARATOR}${vitals}${INFO_SEPARATOR}`;
    if (affects.length === 0) return wrap(head, cols);
    return [...wrap(`${head}Affected by:`, cols), ...affects.map((a) => `- ${a}`), ''];
  };
  const VITALS = '357 | 375 | 88 | 121 | 68 | 112';

  it('the format: the fields, the vitals, %f last', () => {
    expect(pollFormat()).toBe(`${INFO_FIELDS.map((f) => f.code).join(' | ')} | %z | %Z | %e | %E | %j | %J | %f`);
  });

  it('none: no affects, every field and the vitals read', () => {
    for (const cols of [20, 40, 97]) {
      const a = parsePollAnswer(lines(VITALS, [], cols))!;
      expect(a.info.wimpy, `${cols}`).toBe(120);
      expect(a.info.purse).toEqual({ gold: 380, silver: 5, copper: 49 });
      expect(a.vitals).toEqual({ hp: 357, maxhp: 375, mana: 88, maxmana: 121, mp: 68, maxmp: 112 });
      expect(a.affects).toEqual([]);
    }
  });

  it('one and several, at every width: the names as listed', () => {
    for (const cols of [20, 40, 97]) {
      expect(parsePollAnswer(lines(VITALS, ['armour'], cols))!.affects).toEqual(['armour']);
      const several = ['potion', 'detect magic', 'shield', 'armour'];
      expect(parsePollAnswer(lines(VITALS, several, cols))!.affects).toEqual(several);
      expect(parsePollAnswer(lines(VITALS, ['hunger', 'thirst'], cols))!.affects).toEqual(['hunger', 'thirst']);
      expect(parsePollAnswer(lines(VITALS, ['hunger'], cols))!.info.wimpy).toBe(120);
    }
  });

  it('a name wrapped at the width is one name; the header wrapped too', () => {
    expect(affectsOf([' Affected', 'by:', '- a pitch-black robe (pale', 'tones)', '- armour', ''])).toEqual(['a pitch-black robe (pale tones)', 'armour']);
  });

  it('another shape of %f: the affects are null, the fields kept', () => {
    const a = parsePollAnswer([...wrap(`${SPACED}${INFO_SEPARATOR}${VITALS}${INFO_SEPARATOR}You are affected:`, 97), '- armour'])!;
    expect(a.affects).toBeNull();
    expect(a.info.wimpy).toBe(120);
    expect(a.vitals.hp).toBe(357);
    expect(affectsOf(['- armour'])).toBeNull();
    expect(affectsOf(['  ', ''])).toEqual([]);
    expect(affectsOf(['Affected by:', ''])).toEqual([]);
  });

  it("a fight's xxx is no value; a troll's 0 0 mana is a value", () => {
    expect(parsePollAnswer(lines('xxx | xxx | xxx | xxx | xxx | xxx', []))!.vitals).toEqual({ hp: null, maxhp: null, mana: null, maxmana: null, mp: null, maxmp: null });
    expect(parsePollAnswer(lines('121 | 121 | 0 | 0 | 112 | 112', []))!.vitals).toEqual({ hp: 121, maxhp: 121, mana: 0, maxmana: 0, mp: 112, maxmp: 112 });
  });

  it('a field missing or one too many: no answer', () => {
    expect(parsePollAnswer(lines('357 | 375 | 88 | 121 | 68', []))).toBeNull();
    expect(parsePollAnswer(lines('357 | 375 | 88 | 121 | 68 | 112 | 1', []))).toBeNull();
    expect(parsePollAnswer(['no bar at all'])).toBeNull();
  });
});
