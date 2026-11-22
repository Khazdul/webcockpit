// Who flies the balloon (stage 75, ADR 0159 round 3): one of eight
// passengers, chosen by the race the player plays (the owner, 2026-11-21:
// automatic, no setting). Pure: `passengerOf` maps `Char.StatusVars`
// `race` and `subrace` to a passenger; `loadPassenger` fetches that
// passenger's own lazy chunk (passengers/<id>.ts).
//
// The race strings MUME sends are known for one character ("Orc" /
// "Tarkhnarb Orc", stage 77 part A). So the match is tolerant: the race's
// kind (`raceKind`, src/gmcp/race.ts: whole words over race and subrace,
// case-insensitive, diacritics folded), drawn as:
//
//   numenorean   numenorean
//   elf          elf and halfelf
//   dwarf, hobbit, troll   as named
//   human        beorning (a Bear is drawn as a human) and human
//   orc          an orc whose subrace is the Zaugurz (`subraceKind`)
//   goblin       any other orc (Tarkhnarb, Morruhk)
//   goblin       anything else, and nothing at all (before login, the demo)

import { raceKind, raceWords, subraceKind } from '../../gmcp/race';

/** The eight passengers (notes/research/balloons/round5/skins/<id>.js). */
export const PASSENGER_IDS = ['dwarf', 'elf', 'human', 'hobbit', 'troll', 'goblin', 'orc', 'numenorean'] as const;
export type PassengerId = (typeof PASSENGER_IDS)[number];

export const isPassengerId = (s: string): s is PassengerId => (PASSENGER_IDS as readonly string[]).includes(s);

export { raceWords };

/** The passenger for a race and subrace (either may be missing). */
export function passengerOf(race: string | null | undefined, subrace?: string | null): PassengerId {
  switch (raceKind(race, subrace)) {
    case 'numenorean':
      return 'numenorean';
    case 'halfelf':
    case 'elf':
      return 'elf';
    case 'dwarf':
      return 'dwarf';
    case 'hobbit':
      return 'hobbit';
    case 'troll':
      return 'troll';
    case 'beorning':
    case 'human':
      return 'human';
    case 'orc':
      return subraceKind(race, subrace) === 'zaugurz' ? 'orc' : 'goblin';
    case null:
      return 'goblin';
  }
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
