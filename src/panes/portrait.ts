// Which portrait the Character card shows (stage 77 part E, decision 22,
// ADR 0166 addendum 10). Pure but for the build-time file list.
//
// - The race picks it: `raceKind` (src/gmcp/race.ts, the balloon
//   passengers' matching), one portrait per race, and the Zaugurz
//   apart from the Tarkhnarb (the owner); anything else, and
//   nothing at all, is the neutral figure.
// - A raster file `public/portraits/<id>.webp` (public/portraits/README.md)
//   replaces the SVG placeholder when it exists. Which files exist is
//   known at build time: `import.meta.glob` reduced to its keys (Vite
//   drops the imports and bundles no image), so a missing file is never
//   requested. A race without its file keeps its own SVG placeholder:
//   it does not fall back to `neutral.webp`.
// - The replay runtime (`__WC_REPLAY__`: the exported HTML file, ADR
//   0019, and the share frame, whose CSP has `img-src data: blob:`) has
//   no files beside it and draws the placeholders only.
// - Dev server only: `?portrait=<id or race words>` shows that portrait
//   whatever the race (to look at all ten; the stage's test guide).

import { type RaceKind, raceKind } from '../gmcp/race';
import type { PortraitId } from './portrait-figures';

export type { PortraitId };

/** The races' portraits, in the mockup's order with the Zaugurz after the orc, and the neutral figure. */
export const PORTRAIT_IDS: readonly PortraitId[] = ['human', 'elf', 'halfelf', 'dwarf', 'hobbit', 'beorning', 'orc', 'zaugurz', 'troll', 'numenorean', 'neutral'];

export const isPortraitId = (s: string): s is PortraitId => (PORTRAIT_IDS as readonly string[]).includes(s);

declare const __WC_REPLAY__: boolean | undefined;
const IN_REPLAY = typeof __WC_REPLAY__ === 'boolean' && __WC_REPLAY__;

const DIR = '/public/portraits/';

/** The ids with a raster file, from the glob's keys (`/public/portraits/orc.webp`). */
export function rasterIds(files: readonly string[]): ReadonlySet<PortraitId> {
  const ids = files.filter((f) => f.startsWith(DIR) && f.endsWith('.webp')).map((f) => f.slice(DIR.length, -'.webp'.length));
  return new Set(ids.filter(isPortraitId));
}

const BUNDLED: ReadonlySet<PortraitId> = IN_REPLAY ? new Set() : rasterIds(Object.keys(import.meta.glob('/public/portraits/*.webp')));
const BASE = (import.meta.env?.BASE_URL as string | undefined) ?? '/';

/** The URL of `id`'s raster file, or null: draw the SVG placeholder. */
export function portraitImage(id: PortraitId, have: ReadonlySet<PortraitId> = BUNDLED, base = BASE): string | null {
  return have.has(id) ? `${base}portraits/${id}.webp` : null;
}

/** The dev server's `?portrait=`, read once. */
const FORCED: PortraitId | null = (() => {
  if (!import.meta.env?.DEV || typeof location === 'undefined') return null;
  const p = new URLSearchParams(location.search).get('portrait');
  if (!p) return null;
  return isPortraitId(p) ? p : (raceKind(p) ?? 'neutral');
})();

/** The portrait for a race and subrace (either may be missing). */
export function portraitOf(race: string | null | undefined, subrace?: string | null): PortraitId {
  if (FORCED) return FORCED;
  const kind: RaceKind | null = raceKind(race, subrace);
  return kind ?? 'neutral';
}
