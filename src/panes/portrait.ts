// Which portrait the Character card shows (stage 77 part E, decision 22,
// ADR 0166 addenda 10–12). Pure but for the build-time file list.
//
// - The subrace picks it when it is known (`subraceKind`, src/gmcp/race.ts,
//   ADR 0166 addendum 11: one portrait per subrace, the owner), else the
//   race (`raceKind`, the balloon passengers' matching: one per race, the
//   fallbacks), else the neutral figure: anything else, and nothing at all.
// - Every id is drawn as a man and as a woman (src/panes/portraits/, the
//   portrait pass, addendum 12); the neutral figure is one. The card asks
//   for `male` until the client can tell a character's sex.
// - A raster file `public/portraits/<id>-<sex>.webp` (or `neutral.webp`;
//   public/portraits/README.md) replaces the drawing when it exists: the
//   subrace's own file, else its race's file of the same sex (a real image
//   beats a drawing), else the subrace's own drawing. Never the other sex's
//   file: both sexes are drawn. Which files exist is known at build time:
//   `import.meta.glob` reduced to its keys (Vite drops the imports and
//   bundles no image), so a missing file is never requested. Nothing falls
//   back to `neutral.webp`, which is the neutral figure's only.
// - The replay runtime (`__WC_REPLAY__`: the exported HTML file, ADR
//   0019, and the share frame) has no files beside it and asks for none;
//   it shows no Character pane today, and carries no drawings either
//   (portraits/index.ts).
// - Dev server only: `?portrait=<id or race words>` shows that portrait
//   whatever the race, and `?sex=female` the women (to look at all of
//   them; the stage's test guide).

import { type RaceKind, SUBRACE_RACE, type SubraceKind, raceKind, subraceKind } from '../gmcp/race';
import type { PortraitId, Sex } from './portraits/types';

export type { PortraitId, Sex };

/** The races' portraits (the fallbacks) in the mockup's order, each followed by its subraces', and the neutral figure. */
const RACE_ORDER: readonly RaceKind[] = ['human', 'elf', 'halfelf', 'dwarf', 'hobbit', 'beorning', 'orc', 'troll', 'numenorean'];
export const PORTRAIT_IDS: readonly PortraitId[] = [
  ...RACE_ORDER.flatMap((r): PortraitId[] => [r, ...(Object.keys(SUBRACE_RACE) as SubraceKind[]).filter((s) => SUBRACE_RACE[s] === r)]),
  'neutral',
];

/** The race a subrace's portrait falls back to, or null for a race's own and the neutral one. */
export const portraitRace = (id: PortraitId): RaceKind | null => (Object.hasOwn(SUBRACE_RACE, id) ? SUBRACE_RACE[id as SubraceKind] : null);

export const isPortraitId = (s: string): s is PortraitId => (PORTRAIT_IDS as readonly string[]).includes(s);

declare const __WC_REPLAY__: boolean | undefined;
const IN_REPLAY = typeof __WC_REPLAY__ === 'boolean' && __WC_REPLAY__;

const DIR = '/public/portraits/';

/** A raster file's name without `.webp`: `<id>-<sex>`, or `neutral`. */
export const rasterName = (id: PortraitId, sex: Sex): string => (id === 'neutral' ? 'neutral' : `${id}-${sex}`);

const NAMES: ReadonlySet<string> = new Set(['neutral', ...PORTRAIT_IDS.filter((i) => i !== 'neutral').flatMap((i) => [`${i}-male`, `${i}-female`])]);

/** The raster files the build found, from the glob's keys (`/public/portraits/orc-male.webp`): their names. */
export function rasterIds(files: readonly string[]): ReadonlySet<string> {
  const names = files.filter((f) => f.startsWith(DIR) && f.endsWith('.webp')).map((f) => f.slice(DIR.length, -'.webp'.length));
  return new Set(names.filter((n) => NAMES.has(n)));
}

const BUNDLED: ReadonlySet<string> = IN_REPLAY ? new Set() : rasterIds(Object.keys(import.meta.glob('/public/portraits/*.webp')));
const BASE = (import.meta.env?.BASE_URL as string | undefined) ?? '/';

/** The URL of `id`'s raster file for `sex` (its own, else its race's), or null: show the drawing. */
export function portraitImage(id: PortraitId, sex: Sex = 'male', have: ReadonlySet<string> = BUNDLED, base = BASE): string | null {
  const race = portraitRace(id);
  const own = rasterName(id, sex);
  const file = have.has(own) ? own : race !== null && have.has(rasterName(race, sex)) ? rasterName(race, sex) : null;
  return file === null ? null : `${base}portraits/${file}.webp`;
}

/** The portrait for a race and subrace, with no `?portrait=`. */
function portraitFor(race: string | null | undefined, subrace?: string | null): PortraitId {
  return subraceKind(race, subrace) ?? raceKind(race, subrace) ?? 'neutral';
}

/** The dev server's `?portrait=`, read once. */
const FORCED: PortraitId | null = (() => {
  if (!import.meta.env?.DEV || typeof location === 'undefined') return null;
  const p = new URLSearchParams(location.search).get('portrait');
  if (!p) return null;
  return isPortraitId(p) ? p : portraitFor(p);
})();

/** The portrait for a race and subrace (either may be missing). */
export function portraitOf(race: string | null | undefined, subrace?: string | null): PortraitId {
  return FORCED ?? portraitFor(race, subrace);
}

/** The dev server's `?sex=`, read once: the card's sex until the client can tell it (`male`). */
export const PORTRAIT_SEX: Sex = (() => {
  if (!import.meta.env?.DEV || typeof location === 'undefined') return 'male';
  return new URLSearchParams(location.search).get('sex') === 'female' ? 'female' : 'male';
})();
