// Builds the token library (stage 80, ADR 0170) from a checkout of
// Sunnyl75's Character-Tokens-v3.0 (https://github.com/Sunnyl75/Character-Tokens-v3.0):
//
//   node scripts/tokens.ts <path to the set's Tokens/ folder>
//
// Writes public/tokens/ (scripts/tokens.md says more):
//
//   p/<id>.webp    256 px, the portrait frame
//   t/<id>.webp    128 px, the tokens and the picker's grid
//   tokens.json    the manifest: id, label, group, race, sex, tags, match
//
// The pictures are untrusted input: they are read by ImageMagick (`magick`,
// with an argument list, never a shell) and nothing else, and each must be
// a 256 × 256 PNG. Ids are made from the file names (lower case, hyphens) and
// never change once shipped (the directory stores them): a renamed file in
// the set is a new id, and an id that leaves the set is kept out of the
// manifest only by a decision (`RETIRED` below is empty).
//
// Runs by hand; nothing in CI or vitest needs it (the manifest's unit test
// reads the committed files, tests/unit/looks-library.test.ts).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type LibraryEntry, type LibraryGroup, type LibraryManifest, LIBRARY_VERSION, TOKEN_ID_RE } from '../src/looks/library-types.ts';

const OUT = fileURLToPath(new URL('../public/tokens/', import.meta.url));
/** WebP quality of the two sizes (the budget: all of public/tokens/ under 4 MB). */
const Q_PORTRAIT = 72;
const Q_TOKEN = 74;

/** Races in the file names → the client's race kinds (src/gmcp/race.ts). */
const RACES: Readonly<Record<string, LibraryEntry['race']>> = {
  human: 'human',
  elf: 'elf',
  dwarf: 'dwarf',
  hobbit: 'hobbit',
  orc: 'orc',
  troll: 'troll',
  bn: 'numenorean',
  bear: 'beorning',
};

/** Words of a file stem that are a subrace: a tag the search finds. */
const SUBRACE_TAGS: Readonly<Record<string, string>> = { noldor: 'noldo', sindar: 'sinda', rohirrim: 'rohirrim', rohir: 'rohirrim', cave: 'cavetroll', hill: 'hilltroll', mountain: 'mountaintroll', mohruuk: 'morruhk' };

/**
 * The name words a mount or a mob matches (looks/match.ts): the last is the
 * head noun and must be in the NPC's name; the others add to the score.
 * Absent: the stem's words after the kind, the species last.
 */
const MATCH: Readonly<Record<string, readonly string[]>> = {
  'mob-cat-black-and-white': ['black', 'white', 'cat'],
  'mount-horse-1': ['horse'],
  'mount-horse-2': ['horse'],
  'mount-horse-3': ['horse'],
  'mount-horse-rohir': ['rohirrim', 'horse'],
  'mount-black-steed': ['black', 'steed'],
  'mount-trained-horse': ['trained', 'horse'],
};

/** Words that are no tag. */
const STOP: ReadonlySet<string> = new Set(['of', 'and', 'the']);

/** Ids that were shipped and left the set (kept out on purpose). None yet. */
const RETIRED: readonly string[] = [];

const idOf = (stem: string): string =>
  stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const upper = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);

/** The label: the file's own name, spaces and underscores made hyphens (`Hobbit-F-Cleric-2`). */
const labelOf = (stem: string): string => upper(stem.trim().replace(/[\s_]+/g, '-'));

function entryOf(stem: string): LibraryEntry {
  const id = idOf(stem);
  const w = id.split('-');
  const head = w[0]!;
  const group: LibraryGroup = head === 'mount' ? 'mount' : head === 'mob' ? 'mob' : RACES[head] !== undefined ? 'character' : 'other';
  const race = group === 'character' ? RACES[head]! : null;
  const sexLetter = group === 'character' ? w[1] : undefined;
  const sex = sexLetter === 'm' ? 'male' : sexLetter === 'f' ? 'female' : null;
  const rest = w.slice(group === 'character' ? (sex ? 2 : 1) : group === 'other' ? 0 : 1).filter((x) => !/^\d+$/.test(x));
  const words = rest.filter((x) => !STOP.has(x));
  const subs = group === 'character' ? words.flatMap((x) => (SUBRACE_TAGS[x] ? [SUBRACE_TAGS[x]] : [])) : [];
  const tags = [...new Set([...words, ...subs])];
  const e: LibraryEntry = { id, label: labelOf(stem), group, race, sex, tags };
  if (group === 'mount' || group === 'mob') {
    // Species first in the stem (`Mob-Rat-Young`): the head noun is the first word, the rest describe it.
    e.match = [...(MATCH[id] ?? [...rest.slice(1), rest[0]!])];
  }
  return e;
}

const GROUP_ORDER: readonly LibraryGroup[] = ['character', 'other', 'mount', 'mob'];

function magick(args: string[]): string {
  return execFileSync('magick', args, { encoding: 'utf8', maxBuffer: 1 << 20 });
}

function main(): void {
  const src = process.argv[2];
  if (!src || !statSync(src).isDirectory()) {
    console.error('usage: node scripts/tokens.ts <Tokens folder of Character-Tokens-v3.0>');
    process.exit(2);
  }
  const files = readdirSync(src).filter((f) => f.toLowerCase().endsWith('.png'));
  const entries = files.map((f) => ({ f, e: entryOf(f.slice(0, -4)) }));
  const seen = new Set<string>();
  for (const { f, e } of entries) {
    if (!TOKEN_ID_RE.test(e.id)) throw new Error(`bad id ${e.id} from ${f}`);
    if (seen.has(e.id)) throw new Error(`two files give the id ${e.id}`);
    if (RETIRED.includes(e.id)) throw new Error(`${e.id} is retired`);
    seen.add(e.id);
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'p'), { recursive: true });
  mkdirSync(join(OUT, 't'), { recursive: true });
  for (const { f, e } of entries) {
    const path = join(src, f);
    const info = magick(['identify', '-format', '%m %w %h', path]).trim();
    if (info !== 'PNG 256 256') throw new Error(`${f}: not a 256 × 256 PNG (${info})`);
    const common = ['-strip', '-define', 'webp:method=6', '-define', 'webp:alpha-quality=90'];
    magick([path, '-resize', '256x256', ...common, '-quality', String(Q_PORTRAIT), join(OUT, 'p', `${e.id}.webp`)]);
    magick([path, '-filter', 'Lanczos', '-resize', '128x128', ...common, '-quality', String(Q_TOKEN), join(OUT, 't', `${e.id}.webp`)]);
  }
  const sorted = entries.map((x) => x.e).sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const manifest: LibraryManifest = {
    v: LIBRARY_VERSION,
    source: 'https://github.com/Sunnyl75/Character-Tokens-v3.0',
    creator: 'Sunnyl75',
    tokens: sorted,
  };
  writeFileSync(join(OUT, 'tokens.json'), JSON.stringify(manifest) + '\n');
  let bytes = 0;
  for (const d of ['p', 't']) for (const f of readdirSync(join(OUT, d))) bytes += statSync(join(OUT, d, f)).size;
  bytes += statSync(join(OUT, 'tokens.json')).size;
  console.log(`${sorted.length} tokens, ${(bytes / 1024).toFixed(0)} KiB in public/tokens/, manifest ${statSync(join(OUT, 'tokens.json')).size} bytes`);
}

main();
