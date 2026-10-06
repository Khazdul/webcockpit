// Map tilesets (ADR 0082): the catalogue of bundled alternatives to
// MMapper's default pixmaps, and how a choice resolves to files.
//
// A set lives in `public/map/tilesets/<dir>/` under MMapper's pixmap file
// names and overrides the default `pixmaps/` file by file, as MMapper's
// custom resource folder does: a file the set lacks (`lacks`) comes from
// the default set. Adding a set = its folder + one `TILESETS` entry (+ a
// `TILESET_CHOICES` row); the unit test checks `lacks` against the folder.
//
// A seasonal family (`TILESET_FAMILIES`) is a choice that resolves to one
// of its member sets by MUME's season (`seasonOf`, ADR 0074) at the
// current game month.
//
// Pure apart from `storedClockEpoch` (reads the saved clock).

import { CLOCK_KEY, loadClockState, momentAt } from '../gmcp/clock';
import { type Season, seasonOf } from '../gmcp/gametime';
import type { TilesetOverlay } from './protocol';
export { overlayPath } from './assets';
import { RENDERER_PIXMAPS } from './render/textures';

/** A concrete set of tiles. */
export interface Tileset {
  id: string;
  name: string;
  /** One short line for Options → Mapper. */
  credit: string;
  /** Folder under `map/tilesets/`. */
  dir: string;
  /** Renderer pixmaps (file names under `pixmaps/`) the set does not have: they come from the default set. */
  lacks: readonly string[];
}

/** A choice that follows MUME's season. */
export interface TilesetFamily {
  id: string;
  name: string;
  credit: string;
  /** The member set id for each season. */
  seasons: Readonly<Record<Season, string>>;
}

export const DEFAULT_TILESET = 'default';

const DEFAULT_CREDIT = "MMapper's default tiles";

/** What Shimrod's sets (v0.92) do not draw: walls, doors, the character square and arrows, three load icons, road terrain. */
const SHIMROD_LACKS: readonly string[] = [
  'char-arrows.png',
  'char-room-sel.png',
  'door-down.png',
  'door-east.png',
  'door-north.png',
  'door-south.png',
  'door-up.png',
  'door-west.png',
  'load-darkword.png',
  'load-deathtrap.png',
  'load-whiteword.png',
  'terrain-road.png',
  'wall-east.png',
  'wall-north.png',
  'wall-south.png',
  'wall-west.png',
];
const SHIMROD_CREDIT = 'Tiles by Shimrod (v0.92)';

export const TILESETS: readonly Tileset[] = [
  {
    id: 'desert',
    name: 'Desert',
    credit: "By Khazdul, from Shimrod's tiles",
    dir: 'desert',
    lacks: [...SHIMROD_LACKS, 'terrain-underwater.png'].sort(),
  },
  { id: 'shimrod-spring', name: 'Shimrod Spring', credit: SHIMROD_CREDIT, dir: 'shimrod-spring', lacks: SHIMROD_LACKS },
  { id: 'shimrod-summer', name: 'Shimrod Summer', credit: SHIMROD_CREDIT, dir: 'shimrod-summer', lacks: SHIMROD_LACKS },
  { id: 'shimrod-autumn', name: 'Shimrod Autumn', credit: SHIMROD_CREDIT, dir: 'shimrod-autumn', lacks: SHIMROD_LACKS },
  {
    id: 'shimrod-winter',
    name: 'Shimrod Winter',
    credit: SHIMROD_CREDIT,
    dir: 'shimrod-winter',
    lacks: [...SHIMROD_LACKS, 'terrain-underwater.png'].sort(),
  },
];

export const TILESET_FAMILIES: readonly TilesetFamily[] = [
  {
    id: 'shimrod',
    name: 'Shimrod (alternating)',
    credit: SHIMROD_CREDIT,
    seasons: { spring: 'shimrod-spring', summer: 'shimrod-summer', autumn: 'shimrod-autumn', winter: 'shimrod-winter' },
  },
];

/** A row of Options → Mapper "Tileset", in display order. */
export interface TilesetChoice {
  id: string;
  name: string;
  credit: string;
  /** Set for a seasonal family. */
  family?: TilesetFamily;
}

const setById = (id: string): Tileset | undefined => TILESETS.find((t) => t.id === id);
const familyById = (id: string): TilesetFamily | undefined => TILESET_FAMILIES.find((f) => f.id === id);

function choice(id: string): TilesetChoice {
  if (id === DEFAULT_TILESET) return { id, name: 'Default (MMapper)', credit: DEFAULT_CREDIT };
  const f = familyById(id);
  if (f) return { id, name: f.name, credit: f.credit, family: f };
  const t = setById(id);
  if (!t) throw new Error(`tileset ${id}: not in the catalogue`);
  return { id, name: t.name, credit: t.credit };
}

/** Options → Mapper order. */
export const TILESET_CHOICES: readonly TilesetChoice[] = [
  DEFAULT_TILESET,
  'shimrod',
  'shimrod-spring',
  'shimrod-summer',
  'shimrod-autumn',
  'shimrod-winter',
  'desert',
].map(choice);

export const TILESET_IDS: readonly string[] = TILESET_CHOICES.map((c) => c.id);

/** The choice for a stored id (an unknown id: the default). */
export function tilesetChoice(id: string): TilesetChoice {
  return TILESET_CHOICES.find((c) => c.id === id) ?? TILESET_CHOICES[0]!;
}

/** The set a choice draws in game month `month` (0–11); null: the default pixmaps. */
export function resolveTileset(id: string, month: number): Tileset | null {
  const c = tilesetChoice(id);
  if (c.id === DEFAULT_TILESET) return null;
  if (c.family) return setById(c.family.seasons[seasonOf(month)]) ?? null;
  return setById(c.id) ?? null;
}

/** The asset overlay for a resolved set (undefined: the default pixmaps). */
export function tilesetOverlay(t: Tileset | null): TilesetOverlay | undefined {
  if (!t) return undefined;
  const lacks = new Set(t.lacks);
  const files = RENDERER_PIXMAPS.map((p) => p.slice('pixmaps/'.length)).filter((f) => !lacks.has(f));
  return { dir: `tilesets/${t.dir}/`, files };
}

/** The overlay for a choice in game month `month`. */
export function overlayFor(id: string, month: number): TilesetOverlay | undefined {
  return tilesetOverlay(resolveTileset(id, month));
}

/** The MUME month (0–11) at `nowMs` under clock anchor `epoch` (unix s). */
export function mumeMonth(epoch: number, nowMs: number): number {
  return momentAt(epoch, nowMs / 1000).month;
}

/**
 * The saved clock's anchor (`wc.clock`), or the cold-start estimate when
 * there is none (the live clock saves after every sync, so this is what
 * the cockpit uses).
 */
export function storedClockEpoch(storage: Storage | null, nowMs: number): number {
  let saved: string | null = null;
  try {
    saved = storage?.getItem(CLOCK_KEY) ?? null;
  } catch {
    saved = null;
  }
  return loadClockState(saved, nowMs).epoch;
}

/** `localStorage`, or null where it is blocked. */
export function localStorageOrNull(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The overlay a choice draws now by the saved game clock (the HTML replay
 * export, ADR 0082: the same set the Map pane shows at export time).
 */
export function currentOverlay(id: string, storage: Storage | null = localStorageOrNull(), nowMs = Date.now()): TilesetOverlay | undefined {
  return overlayFor(id, mumeMonth(storedClockEpoch(storage, nowMs), nowMs));
}
