// What feeds the directory of shared looks from the game (stage 80 part E,
// spec §9, ADR 0173): your character's report and the group members' asks.
// Every hook only notes what changed; the directory sends on idle time.
//
// - Report: when the name and the race are known (the sex may come later,
//   from the info poll), and again when the race, the sex or the stored look
//   changes. The token only for a library look; an automatic look and an own
//   image send null. Race and subrace as kinds (`dirKinds`): a bear stays a
//   Beorning, so a change of form sends nothing new. Not with the switch
//   `character.shareLook` off; turning it off sends the DELETE.
// - Ask: the group's players (never an NPC, never yourself), whenever the
//   group changes; the directory asks only for names without a fresh answer.

import type { GameState } from '../gmcp/state';
import type { Settings } from '../settings/types';
import type { LookDirectory, SelfReport } from './directory';
import { dirKinds } from './resolve';
import type { LooksStore } from './store';

export interface DirectoryFeedOptions {
  game: GameState;
  looks: LooksStore;
  dir: Pick<LookDirectory, 'report' | 'unshare' | 'wantNames' | 'subscribe'>;
  settings: { get(): Readonly<Settings>; subscribe(fn: (next: Readonly<Settings>, prev: Readonly<Settings>) => void): () => void };
}

/** Your character's report as it stands, or null while the name or the race is not known. */
export function selfReport(game: GameState, looks: Pick<LooksStore, 'stored'>): SelfReport | null {
  const name = game.char.name;
  const sv = game.char.statusVars;
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const kinds = dirKinds(str(sv.get('race')), str(sv.get('subrace')));
  if (!name || kinds.race === null) return null;
  const stored = looks.stored(name);
  return { name, race: kinds.race, subrace: kinds.subrace, sex: game.sex, token: stored?.src === 'lib' ? stored.id : null };
}

/** The group's players' names (no NPC, not yourself). */
export function memberNames(game: GameState): string[] {
  const self = game.char.name?.toLowerCase() ?? null;
  return [...game.group.list(), ...game.group.unlabeled()].filter((m) => m.type !== 'npc' && m.name && m.name.toLowerCase() !== self).map((m) => m.name);
}

/** Starts the feed; returns the function that stops it. */
export function attachDirectory(o: DirectoryFeedOptions): () => void {
  const { game, looks, dir, settings } = o;
  // What the report is made of, as GMCP and the store have it: the report is
  // made again only when this changed (a `char` change is mostly vitals).
  let last = '';
  let lastNames = '';
  const report = (): void => {
    if (!settings.get().character.shareLook) return;
    const sv = game.char.statusVars;
    const name = game.char.name;
    const l = looks.stored(name);
    const raw = `${name}|${String(sv.get('race'))}|${String(sv.get('subrace'))}|${game.sex}|${l?.src === 'lib' ? l.id : ''}`;
    if (raw === last) return;
    last = raw;
    const r = selfReport(game, looks);
    if (r) dir.report(r);
  };
  const offs = [
    game.subscribe((part) => {
      if (part === 'char' || part === 'info') report();
      else if (part === 'group') {
        const names = memberNames(game);
        const key = names.join(',');
        if (key === lastNames) return;
        lastNames = key;
        dir.wantNames(names);
      }
    }),
    looks.subscribe(report),
    settings.subscribe((next, prev) => {
      if (next.character.shareLook === prev.character.shareLook) return;
      last = '';
      if (next.character.shareLook) report();
      else dir.unshare();
    }),
    dir.subscribe(() => looks.directoryChanged()),
  ];
  return () => {
    for (const off of offs.splice(0)) off();
  };
}
