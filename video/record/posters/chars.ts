// The posters' invented characters (no real players): MUME-flavoured
// values per race, for the mocked MUME of capture.ts.

export type Sex = 'male' | 'female';
export type Flag = 'poison' | 'blind' | 'snared' | 'wound' | 'hungry' | 'thirsty' | 'sanctuary';

/** A timed stone put in through the Timers' debug hook: `left` and `total` in seconds. */
export interface TimedStone {
  name: string;
  group: 'buff' | 'debuff' | 'herb' | 'sanct';
  left?: number;
  total?: number;
  herbKey?: string;
  phase?: 'buff' | 'debuff';
  /** Untracked (dashed, no time: seen in a list only). */
  untracked?: boolean;
}

export interface Char {
  id: string;
  name: string;
  sex: Sex;
  race: string;
  subrace: string | null;
  level: number;
  /** Share of the level done (0–1), and the share gained this session. */
  through: number;
  gained: number;
  tpShare: number;
  hp: [number, number];
  mana: [number, number] | null;
  mp: [number, number];
  mood: string;
  casts?: string;
  alertness: string;
  carrying: string;
  position: string;
  toggles?: { sneak?: boolean; ride?: boolean; climb?: boolean; swim?: boolean };
  fight?: { opponent: string; hp: string };
  flags?: Flag[];
  wounds?: string[];
  stones?: TimedStone[];
  /** Untracked affects the poll lists (and the flags' list forms). */
  listed?: string[];
  shields: [number, number, number, number];
  abilities: [number, number, number, number, number, number, number];
  /** The unaffected abilities where they differ (`%G`), else the same. */
  base?: [number, number, number, number, number, number, number];
  age: [number, number, number];
  height: string;
  weight: string;
  equipment: string;
  load: string;
  alignment: string;
  citizen: string;
  purse: [number, number, number];
  warFame: string;
  perception: [number, number, number];
  wimpy: number;
}

const GOOD = 'You must have been sent to Arda to free it from the sorrows that weigh upon it!';
const EVIL = 'You are totally corrupted by the Evilness of Morgoth!';

export const CHARS: Char[] = [
  {
    id: 'aerlinn', name: 'Aerlinn', sex: 'female', race: 'Elf', subrace: 'Noldo', level: 52, through: 0.62, gained: 0.11, tpShare: 0.7,
    hp: [241, 268], mana: [188, 231], mp: [143, 160], mood: 'prudent', casts: 'careful', alertness: 'attentive', carrying: 'peanuts', position: 'standing',
    toggles: { sneak: true },
    stones: [
      { name: 'Seeing', group: 'herb', herbKey: 'Seeing', phase: 'buff', left: 1500, total: 2400 },
      { name: 'heightened senses', group: 'buff', left: 620, total: 900 },
      { name: 'miruvor', group: 'buff', left: 210, total: 600 },
      { name: 'Sanctuary', group: 'sanct', left: 190, total: 270 },
    ],
    shields: [61, 12, 48, 34], abilities: [13, 20, 19, 17, 12, 18, 19],
    age: [196, 4, 17], height: 'six feet two', weight: 'nine stone and eleven pounds', equipment: 'forty-one pounds', load: 'You can carry much more.',
    alignment: GOOD, citizen: 'Rivendell GreyHavens Bree', purse: [214, 7, 31], warFame: 'veteran (9)', perception: [32, 28, 14], wimpy: 120,
  },
  {
    id: 'celebrin', name: 'Celebrin', sex: 'male', race: 'Elf', subrace: 'Sinda', level: 38, through: 0.24, gained: 0.06, tpShare: 0.5,
    hp: [198, 212], mana: [86, 104], mp: [171, 171], mood: 'normal', casts: 'normal', alertness: 'vigilant', carrying: 'uncomfortable', position: 'standing',
    toggles: { sneak: true, climb: true },
    stones: [{ name: 'Travelling', group: 'herb', herbKey: 'Travelling', phase: 'buff', left: 900, total: 1800 }, { name: 'second wind', group: 'buff', left: 70, total: 120 }],
    shields: [74, 31, 22, 28], abilities: [15, 16, 15, 20, 14, 15, 18],
    age: [128, 9, 2], height: 'six feet one', weight: 'ten stone and two pounds', equipment: 'fifty-three pounds', load: 'Heavy, but we will manage...',
    alignment: GOOD, citizen: 'GreyHavens Rivendell', purse: [96, 2, 14], warFame: 'soldier (5)', perception: [29, 30, 16], wimpy: 90,
  },
  {
    id: 'idhrenna', name: 'Idhrenna', sex: 'female', race: 'Man', subrace: 'Dunadan', level: 61, through: 0.48, gained: 0.09, tpShare: 0.82,
    hp: [377, 402], mana: [64, 92], mp: [158, 174], mood: 'brave', casts: 'fast', alertness: 'careful', carrying: 'heavy', position: 'standing',
    toggles: { ride: true },
    stones: [{ name: 'battle glory', group: 'buff', left: 260, total: 480 }, { name: 'Healing', group: 'herb', herbKey: 'Healing', phase: 'buff', left: 420, total: 900 }],
    shields: [118, 9, 66, 58], abilities: [19, 14, 15, 17, 18, 15, 15],
    age: [58, 1, 21], height: 'five feet ten', weight: 'ten stone and nine pounds', equipment: 'ninety-four pounds', load: 'Heavy, but we will manage...',
    alignment: GOOD, citizen: 'Bree Fornost Shire', purse: [412, 18, 6], warFame: 'war leader (14)', perception: [24, 19, 11], wimpy: 180,
  },
  {
    id: 'eadric', name: 'Eadric', sex: 'male', race: 'Man', subrace: 'Rohirrim', level: 44, through: 0.71, gained: 0.2, tpShare: 0.6,
    hp: [311, 330], mana: [22, 41], mp: [133, 150], mood: 'aggressive', casts: 'quick', alertness: 'normal', carrying: 'heavy', position: 'standing',
    toggles: { ride: true },
    stones: [{ name: 'anger', group: 'buff', left: 120, total: 300 }, { name: 'some pipe-weed', group: 'buff', left: 1300, total: 1800 }],
    shields: [104, -3, 71, 52], abilities: [21, 11, 12, 15, 19, 14, 13],
    age: [36, 7, 9], height: 'six feet three', weight: 'thirteen stone and six pounds', equipment: 'one hundred two pounds', load: 'Heavy, but we will manage...',
    alignment: GOOD, citizen: 'Edoras Bree', purse: [133, 1, 45], warFame: 'soldier (6)', perception: [15, 14, 8], wimpy: 150,
  },
  {
    id: 'nalbor', name: 'Nalbor', sex: 'male', race: 'Dwarf', subrace: 'Longbeard', level: 70, through: 0.33, gained: 0.04, tpShare: 0.9,
    hp: [452, 488], mana: [41, 58], mp: [119, 131], mood: 'brave', casts: 'normal', alertness: 'paranoid', carrying: 'really heavy', position: 'standing',
    stones: [{ name: 'Strength', group: 'herb', herbKey: 'Strength', phase: 'buff', left: 700, total: 1200 }, { name: 'very comfortable', group: 'buff', left: 400, total: 600 }],
    shields: [131, -9, 84, 71], abilities: [22, 13, 14, 12, 22, 17, 12],
    age: [112, 3, 28], height: 'four feet five', weight: 'eleven stone and one pound', equipment: 'one hundred forty pounds', load: 'Heavy, but we will manage...',
    alignment: GOOD, citizen: 'Shire Bree', purse: [1038, 12, 3], warFame: 'warlord (21)', perception: [18, 22, 13], wimpy: 220,
  },
  {
    id: 'tansy', name: 'Tansy', sex: 'female', race: 'Hobbit', subrace: 'Stoor', level: 33, through: 0.55, gained: 0.14, tpShare: 0.4,
    hp: [174, 190], mana: [77, 88], mp: [161, 178], mood: 'wimpy', casts: 'thorough', alertness: 'vigilant', carrying: 'uncomfortable', position: 'sitting',
    toggles: { sneak: true, swim: true },
    stones: [{ name: 'some pipe-weed', group: 'buff', left: 900, total: 1800 }, { name: 'comfortable', group: 'buff' }],
    flags: ['hungry'],
    shields: [52, 44, 18, 21], abilities: [9, 15, 16, 20, 15, 16, 17],
    age: [44, 2, 11], height: 'three feet four', weight: 'five stone and two pounds', equipment: 'thirty pounds', load: 'You can carry much more.',
    alignment: GOOD, citizen: 'Shire Bree', purse: [58, 9, 77], warFame: 'recruit (2)', perception: [22, 26, 21], wimpy: 110,
  },
  {
    id: 'gruzhbag', name: 'Gruzhbag', sex: 'male', race: 'Orc', subrace: 'Morruhk Orc', level: 58, through: 0.81, gained: 0.17, tpShare: 0.75,
    hp: [338, 361], mana: [69, 103], mp: [131, 140], mood: 'berserk', casts: 'quick', alertness: 'normal', carrying: 'heavy', position: 'standing',
    stones: [{ name: 'bloodlust', group: 'buff', left: 50, total: 180 }, { name: 'orkish draught', group: 'buff', left: 300, total: 600 }, { name: 'OrcBalm', group: 'herb', herbKey: 'OrcBalm', phase: 'buff', left: 600, total: 900 }],
    shields: [126, -12, 77, 63], abilities: [21, 12, 13, 14, 19, 18, 10],
    age: [47, 10, 3], height: 'five feet two', weight: 'eleven stone and eight pounds', equipment: 'ninety-seven pounds', load: 'Heavy, but we will manage...',
    alignment: EVIL, citizen: 'GoblinTown Isengard', purse: [307, 4, 52], warFame: 'warlord (18)', perception: [27, 12, 24], wimpy: 0,
  },
  {
    id: 'ughlakh', name: 'Ughlakh', sex: 'male', race: 'Troll', subrace: 'Mountain Troll', level: 47, through: 0.4, gained: 0.08, tpShare: 0.5,
    hp: [612, 655], mana: null, mp: [102, 117], mood: 'aggressive', alertness: 'normal', carrying: 'peanuts', position: 'standing',
    stones: [{ name: 'growth', group: 'buff', left: 800, total: 1200 }],
    flags: ['thirsty'],
    shields: [96, -21, 30, 77], abilities: [23, 7, 8, 10, 22, 16, 9],
    age: [96, 5, 14], height: 'ten feet seven', weight: 'forty-one stone and three pounds', equipment: 'sixty-eight pounds', load: 'You can carry much more.',
    alignment: EVIL, citizen: 'Angmar', purse: [44, 0, 9], warFame: 'veteran (10)', perception: [19, 8, 22], wimpy: 300,
  },
  {
    id: 'azruphel', name: 'Azruphel', sex: 'female', race: 'Black Númenórean', subrace: null, level: 66, through: 0.15, gained: 0.05, tpShare: 0.85,
    hp: [262, 290], mana: [201, 247], mp: [128, 140], mood: 'normal', casts: 'careful', alertness: 'careful', carrying: 'uncomfortable', position: 'resting',
    stones: [{ name: 'dark aura', group: 'buff', left: 340, total: 600 }, { name: 'shadow-veil', group: 'buff', left: 140, total: 300 }, { name: 'Shadows', group: 'herb', herbKey: 'Shadows', phase: 'buff', left: 1200, total: 1800 }],
    shields: [70, 18, 41, 39], abilities: [14, 21, 18, 15, 14, 19, 16],
    age: [118, 6, 25], height: 'five feet eleven', weight: 'nine stone and six pounds', equipment: 'fifty pounds', load: 'Heavy, but we will manage...',
    alignment: EVIL, citizen: 'Isengard DolGuldur', purse: [655, 21, 17], warFame: 'war leader (15)', perception: [26, 21, 12], wimpy: 140,
  },
  {
    id: 'bjarnulf', name: 'Bjarnulf', sex: 'male', race: 'Man', subrace: 'Beorning', level: 40, through: 0.9, gained: 0.25, tpShare: 0.55,
    hp: [344, 371], mana: [30, 47], mp: [181, 192], mood: 'brave', casts: 'normal', alertness: 'attentive', carrying: 'peanuts', position: 'standing',
    stones: [{ name: 'some pipe-weed', group: 'buff', left: 400, total: 1800 }],
    shields: [99, 4, 58, 46], abilities: [21, 12, 14, 14, 20, 15, 14],
    age: [42, 0, 6], height: 'six feet six', weight: 'fifteen stone and four pounds', equipment: 'eighty-two pounds', load: 'Heavy, but we will manage...',
    alignment: GOOD, citizen: 'Bree Edoras', purse: [71, 3, 28], warFame: 'soldier (4)', perception: [17, 24, 26], wimpy: 160,
  },
  // the gallery's rest: more peoples and the other sex
  {
    id: 'shagra', name: 'Shagra', sex: 'female', race: 'Orc', subrace: 'Tarkhnarb Orc', level: 29, through: 0.3, gained: 0.12, tpShare: 0.4,
    hp: [176, 188], mana: [51, 70], mp: [109, 120], mood: 'brave', casts: 'fast', alertness: 'normal', carrying: 'heavy', position: 'standing',
    toggles: { sneak: true }, stones: [{ name: 'orkish draught', group: 'buff', left: 240, total: 600 }],
    shields: [71, 6, 52, 40], abilities: [17, 13, 14, 15, 16, 15, 10],
    age: [31, 4, 2], height: 'four feet ten', weight: 'eight stone and one pound', equipment: 'seventy pounds', load: 'Heavy, but we will manage...',
    alignment: EVIL, citizen: 'GoblinTown', purse: [88, 6, 11], warFame: 'recruit (3)', perception: [24, 10, 22], wimpy: 90,
  },
  {
    id: 'bodo', name: 'Bodo', sex: 'male', race: 'Hobbit', subrace: 'Fallohide', level: 24, through: 0.66, gained: 0.2, tpShare: 0.3,
    hp: [139, 150], mana: [60, 72], mp: [150, 166], mood: 'prudent', casts: 'normal', alertness: 'careful', carrying: 'peanuts', position: 'standing',
    toggles: { sneak: true }, stones: [{ name: 'some pipe-weed', group: 'buff', left: 1500, total: 1800 }],
    shields: [44, 39, 14, 19], abilities: [9, 16, 15, 19, 14, 15, 17],
    age: [44, 8, 19], height: 'three feet seven', weight: 'five stone and nine pounds', equipment: 'twenty-five pounds', load: 'You can carry much more.',
    alignment: GOOD, citizen: 'Shire', purse: [23, 4, 60], warFame: 'recruit (1)', perception: [20, 25, 23], wimpy: 80,
  },
  {
    id: 'lindorie', name: 'Lindorie', sex: 'female', race: 'Half-elf', subrace: null, level: 49, through: 0.5, gained: 0.1, tpShare: 0.6,
    hp: [233, 250], mana: [140, 170], mp: [150, 160], mood: 'normal', casts: 'careful', alertness: 'attentive', carrying: 'uncomfortable', position: 'standing',
    stones: [{ name: 'Clearthought', group: 'herb', herbKey: 'Clearthought', phase: 'buff', left: 800, total: 1500 }],
    shields: [66, 20, 40, 33], abilities: [14, 18, 18, 17, 13, 17, 17],
    age: [71, 3, 3], height: 'five feet eight', weight: 'eight stone and twelve pounds', equipment: 'forty-four pounds', load: 'You can carry much more.',
    alignment: GOOD, citizen: 'Rivendell Bree', purse: [190, 2, 2], warFame: 'veteran (8)', perception: [27, 24, 13], wimpy: 100,
  },
  {
    id: 'hrefna', name: 'Hrefna', sex: 'female', race: 'Dwarf', subrace: 'Firebeard', level: 55, through: 0.2, gained: 0.07, tpShare: 0.7,
    hp: [380, 404], mana: [38, 52], mp: [117, 125], mood: 'aggressive', casts: 'normal', alertness: 'vigilant', carrying: 'really heavy', position: 'standing',
    stones: [{ name: 'Strength', group: 'herb', herbKey: 'Strength', phase: 'buff', left: 300, total: 1200 }],
    shields: [112, -5, 79, 66], abilities: [20, 13, 14, 13, 21, 18, 12],
    age: [149, 11, 1], height: 'four feet three', weight: 'ten stone and five pounds', equipment: 'one hundred twenty pounds', load: 'Heavy, but we will manage...',
    alignment: GOOD, citizen: 'Shire Bree', purse: [512, 0, 40], warFame: 'war leader (12)', perception: [17, 21, 14], wimpy: 200,
  },
  {
    id: 'gorbakh', name: 'Gorbakh', sex: 'male', race: 'Zaugurz', subrace: null, level: 36, through: 0.45, gained: 0.1, tpShare: 0.5,
    hp: [221, 236], mana: [58, 80], mp: [120, 128], mood: 'brave', casts: 'quick', alertness: 'normal', carrying: 'heavy', position: 'standing',
    stones: [{ name: 'blood of sauron', group: 'buff', left: 400, total: 900 }],
    shields: [90, 2, 60, 49], abilities: [19, 12, 12, 15, 18, 16, 10],
    age: [38, 2, 8], height: 'five feet five', weight: 'eleven stone and two pounds', equipment: 'ninety pounds', load: 'Heavy, but we will manage...',
    alignment: EVIL, citizen: 'GoblinTown', purse: [120, 3, 3], warFame: 'soldier (5)', perception: [25, 11, 23], wimpy: 120,
  },
  {
    id: 'murzga', name: 'Murzga', sex: 'female', race: 'Troll', subrace: 'Cave Troll', level: 34, through: 0.6, gained: 0.15, tpShare: 0.45,
    hp: [470, 500], mana: null, mp: [96, 104], mood: 'brave', alertness: 'normal', carrying: 'peanuts', position: 'standing',
    stones: [{ name: 'growth', group: 'buff', left: 300, total: 1200 }],
    shields: [80, -18, 26, 70], abilities: [22, 7, 8, 9, 21, 15, 9],
    age: [72, 1, 1], height: 'nine feet eleven', weight: 'thirty-eight stone and nine pounds', equipment: 'sixty pounds', load: 'You can carry much more.',
    alignment: EVIL, citizen: 'Angmar', purse: [12, 1, 3], warFame: 'soldier (4)', perception: [18, 8, 21], wimpy: 250,
  },
  {
    id: 'faelivrin', name: 'Faelivrin', sex: 'female', race: 'Elf', subrace: 'Silvan', level: 42, through: 0.35, gained: 0.06, tpShare: 0.55,
    hp: [205, 220], mana: [110, 130], mp: [175, 180], mood: 'normal', casts: 'normal', alertness: 'vigilant', carrying: 'peanuts', position: 'standing',
    toggles: { sneak: true }, stones: [{ name: 'Walking', group: 'herb', herbKey: 'Walking', phase: 'buff', left: 700, total: 1200 }],
    shields: [69, 35, 25, 26], abilities: [14, 16, 16, 20, 14, 16, 19],
    age: [140, 6, 6], height: 'five feet eleven', weight: 'eight stone and six pounds', equipment: 'thirty-nine pounds', load: 'You can carry much more.',
    alignment: GOOD, citizen: 'Lorien Rivendell', purse: [77, 7, 7], warFame: 'veteran (7)', perception: [31, 29, 15], wimpy: 100,
  },
  {
    id: 'wulfhere', name: 'Wulfhere', sex: 'male', race: 'Man', subrace: 'Eriadorian', level: 27, through: 0.2, gained: 0.08, tpShare: 0.35,
    hp: [196, 210], mana: [52, 66], mp: [130, 140], mood: 'normal', casts: 'normal', alertness: 'normal', carrying: 'uncomfortable', position: 'standing',
    stones: [{ name: 'second wind', group: 'buff', left: 90, total: 120 }],
    shields: [80, 10, 55, 41], abilities: [17, 14, 14, 15, 17, 14, 14],
    age: [29, 9, 12], height: 'five feet eleven', weight: 'twelve stone and two pounds', equipment: 'eighty pounds', load: 'Heavy, but we will manage...',
    alignment: GOOD, citizen: 'Bree', purse: [40, 2, 20], warFame: 'recruit (2)', perception: [16, 15, 9], wimpy: 100,
  },
  {
    id: 'brannoc', name: 'Brannoc', sex: 'male', race: 'Hobbit', subrace: 'Harfoot', level: 31, through: 0.7, gained: 0.1, tpShare: 0.4,
    hp: [160, 172], mana: [70, 80], mp: [160, 170], mood: 'wimpy', casts: 'normal', alertness: 'paranoid', carrying: 'peanuts', position: 'standing',
    toggles: { sneak: true }, stones: [],
    shields: [48, 46, 16, 20], abilities: [8, 15, 16, 21, 15, 16, 18],
    age: [52, 1, 4], height: 'three feet two', weight: 'four stone and twelve pounds', equipment: 'twenty-eight pounds', load: 'You can carry much more.',
    alignment: GOOD, citizen: 'Shire', purse: [31, 5, 61], warFame: 'recruit (2)', perception: [21, 27, 24], wimpy: 90,
  },
  {
    id: 'grimhild', name: 'Grimhild', sex: 'female', race: 'Dwarf', subrace: 'Broadbeam', level: 46, through: 0.5, gained: 0.1, tpShare: 0.6,
    hp: [350, 372], mana: [36, 50], mp: [114, 120], mood: 'brave', casts: 'normal', alertness: 'careful', carrying: 'heavy', position: 'standing',
    stones: [{ name: 'very comfortable', group: 'buff', left: 400, total: 600 }],
    shields: [105, -6, 72, 60], abilities: [20, 13, 14, 12, 21, 17, 12],
    age: [92, 2, 20], height: 'four feet two', weight: 'ten stone and eleven pounds', equipment: 'one hundred ten pounds', load: 'Heavy, but we will manage...',
    alignment: GOOD, citizen: 'Shire', purse: [404, 4, 4], warFame: 'veteran (9)', perception: [17, 21, 14], wimpy: 180,
  },
  {
    id: 'durgash', name: 'Durgash', sex: 'male', race: 'Troll', subrace: 'Hill Troll', level: 52, through: 0.3, gained: 0.06, tpShare: 0.6,
    hp: [640, 690], mana: null, mp: [100, 112], mood: 'aggressive', alertness: 'normal', carrying: 'peanuts', position: 'standing',
    stones: [], shields: [102, -20, 31, 80], abilities: [23, 7, 8, 10, 23, 16, 9],
    age: [88, 3, 3], height: 'ten feet two', weight: 'forty stone and one pound', equipment: 'seventy pounds', load: 'You can carry much more.',
    alignment: EVIL, citizen: 'Angmar', purse: [20, 0, 2], warFame: 'veteran (11)', perception: [19, 8, 22], wimpy: 320,
  },
  {
    id: 'adunaphel', name: 'Imrazor', sex: 'male', race: 'Black Númenórean', subrace: null, level: 58, through: 0.5, gained: 0.1, tpShare: 0.7,
    hp: [250, 268], mana: [180, 214], mp: [130, 140], mood: 'normal', casts: 'careful', alertness: 'careful', carrying: 'uncomfortable', position: 'standing',
    stones: [{ name: 'dark aura', group: 'buff', left: 340, total: 600 }],
    shields: [72, 15, 40, 38], abilities: [15, 20, 18, 15, 14, 18, 16],
    age: [101, 5, 5], height: 'six feet one', weight: 'eleven stone and three pounds', equipment: 'fifty pounds', load: 'Heavy, but we will manage...',
    alignment: EVIL, citizen: 'Isengard', purse: [500, 5, 5], warFame: 'war leader (13)', perception: [25, 20, 12], wimpy: 140,
  },
];

/** The stones card: Idhrenna mid-fight, everything on her. */
export const FIGHT: Char = {
  ...CHARS.find((c) => c.id === 'idhrenna')!,
  id: 'idhrenna-fight',
  hp: [211, 402], mp: [96, 174], mana: [31, 92], mood: 'aggressive', alertness: 'careful', carrying: 'heavy', position: 'standing',
  fight: { opponent: 'a huge black tarantula', hp: 'Hurt' },
  flags: ['poison', 'wound', 'snared', 'hungry', 'thirsty'],
  wounds: ['a serious wound at the left leg (bleeding)'],
  listed: ['poison (type: poison)', 'a serious wound at the left leg (bleeding)'],
  stones: [
    { name: 'Healing', group: 'herb', herbKey: 'Healing', phase: 'buff', left: 260, total: 900 },
    { name: 'Clearthought', group: 'herb', herbKey: 'Clearthought', phase: 'debuff', left: 120, total: 600 },
    { name: 'battle glory', group: 'buff', left: 180, total: 480 },
    { name: 'second wind', group: 'buff', left: 28, total: 120 },
    { name: 'miruvor', group: 'buff', left: 410, total: 600 },
    { name: 'heightened senses', group: 'buff', left: 520, total: 900 },
    { name: 'haste (active)', group: 'buff', left: 44, total: 90 },
    { name: 'Sanctuary', group: 'sanct', left: 95, total: 270 },
    { name: 'chill touch', group: 'debuff', left: 70, total: 120 },
    { name: 'lethargy', group: 'debuff', left: 300, total: 600 },
    { name: 'tiredness', group: 'debuff', left: 900, total: 1200 },
    { name: 'panic', group: 'debuff', untracked: true },
    { name: 'unable to quit', group: 'debuff', untracked: true },
  ],
};

// ------------------------------------------------------------ number words

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function words(n: number): string {
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : '');
  return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${words(n % 100)}` : ''}`;
}
