// Who flies the balloon (stage 75, ADR 0159 round 3): one of eight
// passengers, chosen by the race the player plays (the owner, 2026-11-21:
// automatic, no setting). Pure: `passengerOf` maps `Char.StatusVars`
// `race` and `subrace` to a passenger; `loadPassenger` fetches that
// passenger's own lazy chunk (passengers/<id>.ts).
//
// The race strings MUME sends are known for one character ("Orc" /
// "Tarkhnarb Orc", stage 77 part A). The subrace seems to hold the race's
// word, the rest is inferred from that one pair and the game's text. So
// the match is tolerant: whole words, case-insensitive, diacritics folded
// ("Númenórean" is "numenorean"; src/gmcp/race.ts), over both fields
// together, the first rule that matches wins:
//
//   numenorean   a word "numenor…" or "black"   (before "man": a Black
//                                                Númenórean is a Man)
//   elf          "elf", "elves", "elven" ("Half-elf" is two words: half,
//                elf; the war lists write "Half-elven")
//   dwarf        "dwarf", "dwarves"
//   hobbit       "hobbit(s)"
//   troll        "troll(s)"
//   human        "bear(s)" and a word "beorn…" (Beorning): a Bear is
//                drawn as a human, with or without a subrace
//   orc          "orc(s)" and a word "zaug…" (Zaugurz) in either field
//   goblin       any other "orc(s)" (Tarkhnarb)
//   human        "man", "men", "human"
//   goblin       anything else, and nothing at all (before login, the demo)
//
// Words, not substrings: "Dunadan" is no "man", and "human" is matched
// as a word of its own. The prefixes ("numenor", "beorn",
// "zaug") are the only partial matches, as the stage file allows.

import { raceWords } from '../../gmcp/race';

/** The eight passengers (notes/research/balloons/round5/skins/<id>.js). */
export const PASSENGER_IDS = ['dwarf', 'elf', 'human', 'hobbit', 'troll', 'goblin', 'orc', 'numenorean'] as const;
export type PassengerId = (typeof PASSENGER_IDS)[number];

export const isPassengerId = (s: string): s is PassengerId => (PASSENGER_IDS as readonly string[]).includes(s);

export { raceWords };

/** The passenger for a race and subrace (either may be missing). */
export function passengerOf(race: string | null | undefined, subrace?: string | null): PassengerId {
  const w = [...raceWords(race), ...raceWords(subrace)];
  const is = (...names: string[]): boolean => w.some((x) => names.includes(x));
  const starts = (p: string): boolean => w.some((x) => x.startsWith(p));
  if (starts('numenor') || is('black')) return 'numenorean';
  if (is('elf', 'elves', 'elven')) return 'elf';
  if (is('dwarf', 'dwarves')) return 'dwarf';
  if (is('hobbit', 'hobbits')) return 'hobbit';
  if (is('troll', 'trolls')) return 'troll';
  if (is('bear', 'bears') || starts('beorn')) return 'human';
  if (is('orc', 'orcs')) return starts('zaug') ? 'orc' : 'goblin';
  if (is('man', 'men', 'human')) return 'human';
  return 'goblin';
}

/** A passenger's module: the rig's spec for it (rig.ts). */
export interface PassengerModule {
  passenger: import('./rig').PassengerDef;
}

/** Each passenger's own lazy chunk (a player needs one; the rig is shared). */
const CHUNKS: Readonly<Record<PassengerId, () => Promise<PassengerModule>>> = {
  dwarf: () => import('./passengers/dwarf'),
  elf: () => import('./passengers/elf'),
  human: () => import('./passengers/human'),
  hobbit: () => import('./passengers/hobbit'),
  troll: () => import('./passengers/troll'),
  goblin: () => import('./passengers/goblin'),
  orc: () => import('./passengers/orc'),
  numenorean: () => import('./passengers/numenorean'),
};

/** Loads a passenger's chunk (once; the module system caches it). */
export function loadPassenger(id: PassengerId): Promise<PassengerModule> {
  return CHUNKS[id]();
}
