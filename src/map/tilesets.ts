// Map tilesets (ADR 0082): the catalogue of bundled alternatives to
// MMapper's default pixmaps, and how a choice resolves to files.
//
// A set lives in `public/map/tilesets/<dir>/` under MMapper's pixmap file
// names and overrides the default `pixmaps/` file by file, as MMapper's
// custom resource folder does: a file the set lacks (`lacks`) comes from
// the default set. Adding a set = its folder + one `TILESETS` entry (+ a
// `TILESET_CHOICES` row); the unit test checks `lacks` against the folder.
// A set may also draw a file with another of its own (`aliases`), carry
// the background it is drawn for (`background`) and draw its flow marks
// untinted (`streamsAsIs`); ADR 0088.
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
  /**
   * Renderer pixmaps the set draws with another of its own files (ADR 0088):
   * `{ 'terrain-rapids.png': 'terrain-water.png' }` reads rapids from the
   * set's water file. Neither in the folder nor in `lacks`.
   */
  aliases?: Readonly<Record<string, string>>;
  /**
   * The map background the set is drawn for (`#rrggbb`, one of
   * src/map/backgrounds.ts; ADR 0088): choosing the set in Options switches
   * `mapper.background` to it, and leaving it for a set without one
   * restores the user's colour.
   */
  background?: string;
  /** The set's `stream-*` flow marks are drawn as they are, not tinted by the river colour (ADR 0088). */
  streamsAsIs?: boolean;
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

/**
 * What Gefe & Rik (v0.1) does not draw: the character arrows, most load
 * icons, two mobs. Its flow marks are WebCockpit's own (ADR 0088).
 */
const GEFE_RIK_LACKS: readonly string[] = [
  'char-arrows.png',
  'load-armour.png',
  'load-boat.png',
  'load-clock.png',
  'load-coach.png',
  'load-darkword.png',
  'load-deathtrap.png',
  'load-equipment.png',
  'load-ferry.png',
  'load-food.png',
  'load-herb.png',
  'load-horse.png',
  'load-key.png',
  'load-mail.png',
  'load-mule.png',
  'load-pack.png',
  'load-rohirrim.png',
  'load-stable.png',
  'load-trained.png',
  'load-treasure.png',
  'load-warg.png',
  'load-watch.png',
  'load-weapon.png',
  'load-whiteword.png',
  'mob-milkable.png',
  'mob-rattlesnake.png',
];

/**
 * What Gray's Map (v1.1) does not draw: walls, up/down doors and exits,
 * the character square and arrows, several loads and mobs, no-ride,
 * indoors and road terrain. Rapids are its water (an alias); its flow
 * marks are WebCockpit's own (ADR 0088).
 */
const GRAYS_MAP_LACKS: readonly string[] = [
  'char-arrows.png',
  'char-room-sel.png',
  'door-down.png',
  'door-up.png',
  'exit-climb-down.png',
  'exit-climb-up.png',
  'exit-down.png',
  'exit-up.png',
  'load-armour.png',
  'load-attention.png',
  'load-clock.png',
  'load-coach.png',
  'load-darkword.png',
  'load-deathtrap.png',
  'load-equipment.png',
  'load-ferry.png',
  'load-key.png',
  'load-mail.png',
  'load-treasure.png',
  'load-warg.png',
  'load-watch.png',
  'load-water.png',
  'load-weapon.png',
  'load-whiteword.png',
  'mob-elitemob.png',
  'mob-milkable.png',
  'mob-passivemob.png',
  'mob-questmob.png',
  'mob-rattlesnake.png',
  'mob-smob.png',
  'no-ride.png',
  'terrain-indoors.png',
  'terrain-road.png',
  'wall-east.png',
  'wall-north.png',
  'wall-south.png',
  'wall-west.png',
];

/** The background both community sets are drawn for (ADR 0088). */
const WHITE_BG = '#ffffff';

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
  {
    id: 'gefe-rik',
    name: 'Gefe & Rik',
    credit: "Tiles by Octavia, after Gefe & Rik's maps",
    dir: 'gefe-rik',
    lacks: GEFE_RIK_LACKS,
    background: WHITE_BG,
    streamsAsIs: true,
  },
  {
    id: 'grays-map',
    name: "Gray's Map",
    credit: "Tiles by Sunnyl75, after Gray's Mapeditor",
    dir: 'grays-map',
    lacks: GRAYS_MAP_LACKS,
    aliases: { 'terrain-rapids.png': 'terrain-water.png' },
    background: WHITE_BG,
    streamsAsIs: true,
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
  /** The set's recommended map background (`Tileset.background`). */
  background?: string;
}

const setById = (id: string): Tileset | undefined => TILESETS.find((t) => t.id === id);
const familyById = (id: string): TilesetFamily | undefined => TILESET_FAMILIES.find((f) => f.id === id);

function choice(id: string): TilesetChoice {
  if (id === DEFAULT_TILESET) return { id, name: 'Default (MMapper)', credit: DEFAULT_CREDIT };
  const f = familyById(id);
  if (f) return { id, name: f.name, credit: f.credit, family: f };
  const t = setById(id);
  if (!t) throw new Error(`tileset ${id}: not in the catalogue`);
  return { id, name: t.name, credit: t.credit, ...(t.background ? { background: t.background } : {}) };
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
  'gefe-rik',
  'grays-map',
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
  const aliases = t.aliases ?? {};
  const lacks = new Set([...t.lacks, ...Object.keys(aliases)]);
  const files = RENDERER_PIXMAPS.map((p) => p.slice('pixmaps/'.length)).filter((f) => !lacks.has(f));
  return {
    dir: `tilesets/${t.dir}/`,
    files,
    ...(t.aliases ? { aliases: t.aliases } : {}),
    ...(t.streamsAsIs ? { streamsAsIs: true } : {}),
  };
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
