// The token library's manifest (stage 80, ADR 0170): `public/tokens/tokens.json`,
// built by scripts/tokens.ts from Sunnyl75's Character-Tokens-v3.0. Pure
// types and constants, imported by the build script too (no DOM, no Vite).

import type { RaceKind } from '../gmcp/race';
import type { Sex } from '../gmcp/sex';

/** What a library picture shows: a character (by race and sex), a single (a shield, a named figure), a mount or a mob. */
export type LibraryGroup = 'character' | 'other' | 'mount' | 'mob';

export interface LibraryEntry {
  /** Lower case with hyphens, from the file name; never changes once shipped (the directory stores it). */
  id: string;
  /** The set's own name for it (`Elf-F-Noldor`). */
  label: string;
  group: LibraryGroup;
  /** A character's race kind (src/gmcp/race.ts), else null. */
  race: RaceKind | null;
  sex: Sex | null;
  /** The descriptor words (class, subrace, age): what the search finds besides the label. */
  tags: string[];
  /**
   * Mounts and mobs: the name words an NPC member matches (looks/match.ts).
   * The last is the head noun and must be in the name; the others score.
   */
  match?: string[];
}

export interface LibraryManifest {
  /** The manifest's format. */
  v: number;
  source: string;
  creator: string;
  tokens: LibraryEntry[];
}

export const LIBRARY_VERSION = 1;

/** A well-formed library id. */
export const TOKEN_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The sizes in public/tokens/: `p/` for the portrait frame, `t/` for tokens and the picker's grid. */
export const PORTRAIT_PX = 256;
export const TOKEN_PX = 128;
