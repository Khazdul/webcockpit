// What race a character is, from `Char.StatusVars` `race` and `subrace`
// (stage 77, ADR 0166 point 9). Pure TS, no DOM.
//
// One real pair is confirmed ("Orc" / "Tarkhnarb Orc"), so nothing matches
// a whole string: only words and stems over both fields (`raceWords`: any
// case, diacritics folded).
//
// The race line (the stage's decision 18):
// - no subrace: the race alone, as sent;
// - a Black Númenórean stands alone, as sent;
// - a subrace that names the race stands alone, the race's words in lower
//   case: "Tarkhnarb orc", "Cave troll", "Half-elf";
// - otherwise `subrace race`: "Dúnadan man".
//
// The age factor (`help age`), the first rule that matches wins:
//
//   1.5   "numenor…", "dunad…", "duned…" (before Man)
//   2.0   "half" and elf, elves or elven (before Elf)
//   3.5   "noldo…" (Noldo, Noldor, Noldorin)
//   3.0   "sinda…" (Sinda, Sindar, Sindarin)
//   2.5   "silvan…"
//   none  any other Elf
//   2.0   dwarf, orc, troll
//   1.5   hobbit
//   1.0   bear, "beorn…" and the other known kinds of Man ("eriador…",
//         "rohir…")
//   none  anything else, also a Man of unknown kind: a factor is never
//         guessed.
//
// The race's kind (`raceKind`: who flies the balloon, which portrait the
// Character card shows), the first rule that matches wins:
//
//   numenorean  a word "numenor…" or "black" (before Man: a Black
//               Númenórean is a Man)
//   halfelf     "half" and elf, elves or elven ("Half-elf" is two words;
//               the war lists write "Half-elven")
//   elf         elf, elves, elven
//   dwarf       dwarf, dwarves
//   hobbit      hobbit(s)
//   troll       troll(s)
//   beorning    bear(s) and a word "beorn…" (Beorning), with or without a
//               subrace
//   zaugurz     a word "zaug…" (Zaugurz), with or without orc(s)
//   orc         any other orc(s) (Tarkhnarb)
//   human       man, men, human
//   none        anything else, and nothing at all
//
// Words, not substrings: "Dunadan" is no "man", and "human" is matched as
// a word of its own. The prefixes ("numenor", "beorn", "zaug") are the only
// partial matches.

/** The age factors of `help age`. */
export type AgeFactor = 1 | 1.5 | 2 | 2.5 | 3 | 3.5;

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

/** What `raceKind` tells apart (see the file header). */
export type RaceKind = 'numenorean' | 'halfelf' | 'elf' | 'dwarf' | 'hobbit' | 'troll' | 'beorning' | 'zaugurz' | 'orc' | 'human';

/** The race's kind (see the file header), or null for anything else and nothing at all. */
export function raceKind(race: string | null | undefined, subrace?: string | null): RaceKind | null {
  const w = [...raceWords(race), ...raceWords(subrace)];
  const is = (...names: string[]): boolean => w.some((x) => names.includes(x));
  const starts = (p: string): boolean => w.some((x) => x.startsWith(p));
  if (starts('numenor') || is('black')) return 'numenorean';
  const elf = is('elf', 'elves', 'elven');
  if (elf && is('half')) return 'halfelf';
  if (elf) return 'elf';
  if (is('dwarf', 'dwarves')) return 'dwarf';
  if (is('hobbit', 'hobbits')) return 'hobbit';
  if (is('troll', 'trolls')) return 'troll';
  if (is('bear', 'bears') || starts('beorn')) return 'beorning';
  if (starts('zaug')) return 'zaugurz';
  if (is('orc', 'orcs')) return 'orc';
  if (is('man', 'men', 'human')) return 'human';
  return null;
}

/** The other forms of the race names. A Map: the words come from the server. */
const FORMS: ReadonlyMap<string, string> = new Map([
  ['elves', 'elf'],
  ['elven', 'elf'],
  ['dwarves', 'dwarf'],
  ['hobbits', 'hobbit'],
  ['trolls', 'troll'],
  ['orcs', 'orc'],
  ['bears', 'bear'],
  ['men', 'man'],
]);
const nounOf = (word: string): string => FORMS.get(word) ?? word;

const upperFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function isBlackNumenorean(s: string): boolean {
  const w = raceWords(s);
  return w.includes('black') && w.some((x) => x.startsWith('numenor'));
}

/** The race line (see the file header), or null when both fields are empty. */
export function raceLine(race: string | null | undefined, subrace?: string | null): string | null {
  const r = race?.trim() ?? '';
  const s = subrace?.trim() ?? '';
  if (!s || !r) return s || r || null;
  if (isBlackNumenorean(s)) return s;
  if (isBlackNumenorean(r)) return r;
  const own = new Set(raceWords(r).map(nounOf));
  const inSub = new Set(raceWords(s).map(nounOf));
  if (own.size > 0 && [...own].every((w) => inSub.has(w))) {
    const line = s.replace(/[\p{L}\p{M}]+/gu, (w) => (raceWords(w).some((x) => own.has(nounOf(x))) ? w.toLowerCase() : w));
    return upperFirst(line);
  }
  return upperFirst(`${s} ${r.toLowerCase()}`);
}

/** The race's age factor (see the file header), or null when it is not known. */
export function ageFactor(race: string | null | undefined, subrace?: string | null): AgeFactor | null {
  const w = [...raceWords(race), ...raceWords(subrace)].map(nounOf);
  const is = (...names: string[]): boolean => w.some((x) => names.includes(x));
  const starts = (...stems: string[]): boolean => w.some((x) => stems.some((p) => x.startsWith(p)));
  if (starts('numenor', 'dunad', 'duned')) return 1.5;
  if (is('half') && is('elf')) return 2;
  if (starts('noldo')) return 3.5;
  if (starts('sinda')) return 3;
  if (starts('silvan')) return 2.5;
  if (is('elf')) return null;
  if (is('dwarf', 'orc', 'troll')) return 2;
  if (is('hobbit')) return 1.5;
  if (is('bear') || starts('beorn', 'eriador', 'rohir')) return 1;
  return null;
}
