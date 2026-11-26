// Which library picture an NPC member gets by its name (stage 80 §8, ADR
// 0169 row 4): "a trained horse" → `mount-trained-horse`. Pure TS.
//
// An entry's `match` words (tokens.json, scripts/tokens.ts) end in the head
// noun, which must be one of the name's words; every other match word that
// is in the name adds one. The match with the most words wins; a tie goes to
// the first in the manifest (its order is the build's: characters, singles,
// mounts, mobs, each by id). Words are compared folded (any case,
// diacritics off) and a plural `s` of the head noun counts ("two ponies" is
// not handled: MUME's group names are singular).

import type { LibraryEntry } from './library-types';

/** The words of a name: lower case, diacritics folded, split on anything but letters. */
export function nameWords(s: string | null | undefined): string[] {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** How well `entry` matches the name's words: 0 for no match, else the count of its words in the name. */
export function matchScore(words: ReadonlySet<string>, entry: Pick<LibraryEntry, 'match'>): number {
  const m = entry.match;
  if (!m || m.length === 0) return 0;
  const head = m[m.length - 1]!;
  if (!words.has(head) && !words.has(`${head}s`)) return 0;
  let n = 1;
  for (let i = 0; i < m.length - 1; i++) if (words.has(m[i]!)) n++;
  return n;
}

/** The library id an NPC named `name` matches, or null. */
export function matchNpc(name: string | null | undefined, tokens: readonly Pick<LibraryEntry, 'id' | 'match'>[]): string | null {
  if (!name) return null;
  const words = new Set(nameWords(name));
  if (words.size === 0) return null;
  let best: string | null = null;
  let bestN = 0;
  for (const t of tokens) {
    const n = matchScore(words, t);
    if (n > bestN) {
      best = t.id;
      bestN = n;
    }
  }
  return best;
}
