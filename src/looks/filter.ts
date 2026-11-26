// The picker's library filter (stage 80 §5): the chips (people, sex,
// mounts, mobs) with their counts, and the search. Pure TS.

import type { Sex } from '../gmcp/sex';
import type { LibraryEntry } from './library-types';

/** The library's people chips: the six races and the rest. */
export type RaceChip = 'all' | 'human' | 'elf' | 'dwarf' | 'hobbit' | 'orc' | 'troll' | 'other';
export const RACE_CHIPS: readonly { id: RaceChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'human', label: 'Men' },
  { id: 'elf', label: 'Elves' },
  { id: 'dwarf', label: 'Dwarves' },
  { id: 'hobbit', label: 'Hobbits' },
  { id: 'orc', label: 'Orcs' },
  { id: 'troll', label: 'Trolls' },
  { id: 'other', label: 'Other' },
];
const SIX = new Set(['human', 'elf', 'dwarf', 'hobbit', 'orc', 'troll']);

export interface LibFilter {
  race: RaceChip;
  sex: Sex | null;
  kind: 'mount' | 'mob' | null;
  q: string;
}

const isPerson = (t: LibraryEntry): boolean => t.group === 'character' || t.group === 'other';

/** Whether `t` is in the people chip `race`. */
export function inRace(t: LibraryEntry, race: RaceChip): boolean {
  if (!isPerson(t)) return false;
  if (race === 'all') return true;
  if (race === 'other') return t.race === null || !SIX.has(t.race);
  return t.race === race;
}

/** The library's entries that the filter shows (pure; the picker's grid). */
export function filterLibrary(tokens: readonly LibraryEntry[], f: LibFilter): LibraryEntry[] {
  const q = f.q.trim().toLowerCase();
  const words = q.split(/[\s-]+/).filter(Boolean);
  return tokens.filter((t) => {
    if (f.kind ? t.group !== f.kind : !inRace(t, f.race)) return false;
    if (f.sex && t.sex !== f.sex) return false;
    if (words.length === 0) return true;
    // Each word starts a word of the id or a tag ("elf f noldor", "hors").
    const hay = [...t.id.split('-'), ...t.tags];
    return words.every((w) => hay.some((h) => h.startsWith(w)));
  });
}

/** The chips' counts: per people chip, per sex, mounts and mobs. */
export function libraryCounts(tokens: readonly LibraryEntry[]): Record<RaceChip | 'male' | 'female' | 'mount' | 'mob', number> {
  const c = { all: 0, human: 0, elf: 0, dwarf: 0, hobbit: 0, orc: 0, troll: 0, other: 0, male: 0, female: 0, mount: 0, mob: 0 };
  for (const t of tokens) {
    if (t.group === 'mount' || t.group === 'mob') c[t.group]++;
    else for (const r of RACE_CHIPS) if (inRace(t, r.id)) c[r.id]++;
    if (t.sex) c[t.sex]++;
  }
  return c;
}
