// Who flies the balloon (stage 75, ADR 0159 round 3): one of eight
// passengers, chosen by the race the player plays (the owner, 2026-11-21:
// automatic, no setting). Pure: `passengerOf` maps `Char.StatusVars`
// `race` and `subrace` to a passenger; `loadPassenger` fetches that
// passenger's own lazy chunk (passengers/<id>.ts).
//
// The race strings MUME sends are known only for two characters ("Man" /
// "Dunadan", "Elf" / "Noldo"), so the match is tolerant: whole words,
// case-insensitive, diacritics folded ("Númenórean" is "numenorean"), over
// both fields together, the first rule that matches wins:
//
//   numenorean   a word "numenor…" or "black"   (before "man": a Black
//                                                Númenórean is a Man)
//   elf          "elf", "elves" ("Half-elf" is two words: half, elf)
//   dwarf        "dwarf", "dwarves"
//   hobbit       "hobbit(s)"
//   troll        "troll(s)"
//   human        a word "beorn…" (Beorning)
//   orc          "orc(s)" and a word "zaug…" (Zaugurz) in either field
//   goblin       any other "orc(s)" (Tarkhnarb)
//   human        "man", "men", "human"
//   goblin       anything else, and nothing at all (before login, the demo)
//
// Words, not substrings: "Dunadan" is no "man", and "human" is matched
// as a word of its own. The prefixes ("numenor", "beorn",
// "zaug") are the only partial matches, as the stage file allows.

/** The eight passengers (notes/research/balloons/round5/skins/<id>.js). */
export const PASSENGER_IDS = ['dwarf', 'elf', 'human', 'hobbit', 'troll', 'goblin', 'orc', 'numenorean'] as const;
export type PassengerId = (typeof PASSENGER_IDS)[number];

export const isPassengerId = (s: string): s is PassengerId => (PASSENGER_IDS as readonly string[]).includes(s);

/** The words of a race string: lower case, diacritics folded, split on anything but letters. */
export function raceWords(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** The passenger for a race and subrace (either may be missing). */
export function passengerOf(race: string | null | undefined, subrace?: string | null): PassengerId {
  const w = [...raceWords(race), ...raceWords(subrace)];
  const is = (...names: string[]): boolean => w.some((x) => names.includes(x));
  const starts = (p: string): boolean => w.some((x) => x.startsWith(p));
  if (starts('numenor') || is('black')) return 'numenorean';
  if (is('elf', 'elves')) return 'elf';
  if (is('dwarf', 'dwarves')) return 'dwarf';
  if (is('hobbit', 'hobbits')) return 'hobbit';
  if (is('troll', 'trolls')) return 'troll';
  if (starts('beorn')) return 'human';
  if (is('orc', 'orcs')) return starts('zaug') ? 'orc' : 'goblin';
  if (is('man', 'men', 'human')) return 'human';
  return 'goblin';
}

/** A passenger's module: the rig's spec for it (rig.ts). */
export type PassengerModule = typeof import('./passengers/dwarf');

/**
 * Each passenger's chunk. TEMPORARY (stage 75, the dwarf as the proof):
 * only the dwarf is ported so far, so every passenger flies as the dwarf
 * until its own module exists; then each id gets its own
 * `() => import('./passengers/<id>')` here and nothing else changes.
 */
const CHUNKS: Readonly<Record<PassengerId, () => Promise<PassengerModule>>> = {
  dwarf: () => import('./passengers/dwarf'),
  elf: () => import('./passengers/dwarf'),
  human: () => import('./passengers/dwarf'),
  hobbit: () => import('./passengers/dwarf'),
  troll: () => import('./passengers/dwarf'),
  goblin: () => import('./passengers/dwarf'),
  orc: () => import('./passengers/dwarf'),
  numenorean: () => import('./passengers/dwarf'),
};

/** The id that actually flies for `id` (differs only while a passenger is not ported yet). */
export const PORTED: ReadonlySet<PassengerId> = new Set<PassengerId>(['dwarf']);
export const fliesAs = (id: PassengerId): PassengerId => (PORTED.has(id) ? id : 'dwarf');

/** Loads a passenger's chunk (once; the module system caches it). */
export function loadPassenger(id: PassengerId): Promise<PassengerModule> {
  return CHUNKS[id]();
}
