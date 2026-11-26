// Which look a character gets (stage 80 §1, ADR 0169): one pure function
// that the Character pane, the Group pane and the map all ask. None of them
// has rules of its own. Pure TS.
//
// The first row that applies:
//
//   #  for yourself                          for a group member
//   1  your choice for this character        your assignment for that name
//   2  —                                     the directory's library token for the name
//   3  the engraved drawing for your race,   the engraved drawing for the directory's
//      subrace and sex                       race, subrace and sex
//   4  the neutral silhouette (race unknown) an NPC: the library picture its name matches
//   5  —                                     the neutral silhouette (a player), the type
//                                            icon (an NPC with no match)
//
// - A choice of `auto` is "no choice" (a reset to automatic is stored, so
//   that it wins over an older choice on another device): the rows below it
//   apply.
// - A library id the manifest does not have (when it is loaded), or an own
//   image that is not on this device's shelf, falls one row down, silently
//   (row 3 for yourself; row 2 for a member). The stored choice is kept.
//   A picture that then fails to load falls back in the pane the same way.
// - An unknown sex is male. Your own sex is the character's, remembered per
//   name (src/gmcp/sex.ts); a member's comes from the directory.
// - Bear form (yours only: a member's form is not in GMCP): `race` "Bear"
//   gives the bear drawing for your sex at row 3. A chosen look does not
//   change with the form.
// - Where looks are drawn (`mode`): `live` (the game, and the dev feed
//   through the live app: the directory is silent there, which its caller
//   ensures by passing none, part E), `none` (the replay bundle and the
//   in-app log player: no looks at all, so yourself is row 3/4 and a member
//   the type icon, as before stage 80).
// - NPCs have no directory row (row 2 and 3 are for players), and are
//   matched only when the manifest is loaded (`library`); the caller
//   resolves again when it loads (`onLibrary`).

import type { RaceKind, SubraceKind } from '../gmcp/race';
import { SUBRACE_RACE, raceKind, subraceKind } from '../gmcp/race';
import type { Sex } from '../gmcp/sex';
import { portraitFor } from '../panes/portrait';
import type { PortraitId } from '../panes/portraits/types';
import type { Library } from './library';
import { matchNpc } from './match';
import type { LookRef } from './types';

/** A directory row as the client gets it (stage 80 §9, part E): kinds, never MUME's text. */
export interface DirectoryLook {
  race: RaceKind | null;
  subrace: SubraceKind | null;
  sex: Sex | null;
  /** A library id, or null. */
  token: string | null;
}

/** Where the look came from (the picker's line "where the current look comes from"). */
export type LookSource =
  /** Row 1: your choice, or your assignment for the name. */
  | 'choice'
  /** Row 2: shared by the player (the directory's token). */
  | 'shared'
  /** Row 3: the engraved drawing for the race (yours, or the directory's). */
  | 'auto'
  /** Row 4 (yourself) or row 5 (a player): the race is not known. */
  | 'unknown'
  /** Row 4 for an NPC: its name matched a library picture. */
  | 'matched'
  /** Row 5 for an NPC: no match, the type icon. */
  | 'icon';

/** What to draw. */
export type Look =
  | { kind: 'lib'; id: string; from: LookSource }
  | { kind: 'own'; id: string; from: LookSource }
  /** An engraved drawing (`portrait` may be `neutral`: the silhouette) for `sex`. */
  | { kind: 'drawn'; portrait: PortraitId; sex: Sex; from: LookSource }
  /** The marker icon of the member's type (an NPC with no match; every member where no looks are drawn). */
  | { kind: 'icon'; from: LookSource };

export type LookMode = 'live' | 'none';

interface Common {
  mode?: LookMode;
  /** Row 1: the stored choice for this name (`LooksStore.lookFor`), or null. */
  choice?: LookRef | null;
  /** The manifest, once loaded: validates library ids and matches NPCs. Null: ids are trusted, NPCs not matched. */
  library?: Library | null;
  /** The ids of the own images on this device's shelf (part D). Null or absent: none. */
  ownImages?: ReadonlySet<string> | null;
}

/** Your own character: GMCP's race and subrace as sent, and your sex. */
export interface SelfInput extends Common {
  race: string | null | undefined;
  subrace?: string | null | undefined;
  sex: Sex | null | undefined;
}

/** A group member: its type and name (GMCP), and the directory's row for the name (part E). */
export interface MemberInput extends Common {
  name: string | null | undefined;
  npc: boolean;
  dir?: DirectoryLook | null;
}

/** Row 1, if it applies: the choice when its picture is there. */
function chosen(c: Common): Look | null {
  const l = c.choice;
  if (!l || l.src === 'auto') return null;
  if (l.src === 'lib') return !c.library || c.library.has(l.id) ? { kind: 'lib', id: l.id, from: 'choice' } : null;
  return c.ownImages?.has(l.id) ? { kind: 'own', id: l.id, from: 'choice' } : null;
}

/** Your own look. */
export function resolveSelf(i: SelfInput): Look {
  const sex: Sex = i.sex ?? 'male';
  if (i.mode !== 'none') {
    const c = chosen(i);
    if (c) return c;
  }
  const portrait = portraitFor(i.race, i.subrace);
  return { kind: 'drawn', portrait, sex, from: portrait === 'neutral' ? 'unknown' : 'auto' };
}

/** The portrait for a directory row's kinds: the subrace's (when it is the race's), else the race's, else null. */
export function dirPortrait(d: Pick<DirectoryLook, 'race' | 'subrace'>): PortraitId | null {
  if (d.subrace && Object.hasOwn(SUBRACE_RACE, d.subrace) && (d.race === null || SUBRACE_RACE[d.subrace] === d.race)) return d.subrace;
  return d.race ?? null;
}

/** A group member's look. */
export function resolveMember(i: MemberInput): Look {
  if (i.mode === 'none') return { kind: 'icon', from: 'icon' };
  const c = chosen(i);
  if (c) return c;
  if (i.npc) {
    const id = i.library ? matchNpc(i.name, i.library.tokens) : null;
    return id ? { kind: 'lib', id, from: 'matched' } : { kind: 'icon', from: 'icon' };
  }
  const d = i.dir;
  if (d) {
    if (d.token && (!i.library || i.library.has(d.token))) return { kind: 'lib', id: d.token, from: 'shared' };
    const portrait = dirPortrait(d);
    if (portrait) return { kind: 'drawn', portrait, sex: d.sex ?? 'male', from: 'auto' };
  }
  return { kind: 'drawn', portrait: 'neutral', sex: 'male', from: 'unknown' };
}

/** The automatic look (the picker's Automatic card): row 3/4 for yourself, rows 2–5 for a member, ignoring the choice. */
export const autoSelf = (i: SelfInput): Look => resolveSelf({ ...i, choice: null });
export const autoMember = (i: MemberInput): Look => resolveMember({ ...i, choice: null });

/** A directory row's race kinds from GMCP's text (what a report sends, part E): a bear stays a Beorning. */
export function dirKinds(race: string | null | undefined, subrace?: string | null): Pick<DirectoryLook, 'race' | 'subrace'> {
  return { race: raceKind(race, subrace), subrace: subraceKind(race, subrace) };
}

/** Two looks draw the same picture. */
export function sameDrawn(a: Look, b: Look): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'lib' || a.kind === 'own') return a.id === (b as { id: string }).id;
  if (a.kind === 'drawn') return a.portrait === (b as typeof a).portrait && (a.portrait === 'neutral' || a.sex === (b as typeof a).sex);
  return true;
}
