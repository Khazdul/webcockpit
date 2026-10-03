// The parsed map (ADR 0020 "Modules"): compact typed arrays, one entry
// per room, plus the derived indexes the renderer and the locator need.
// Pure data, no DOM; built by src/map/mm2.ts in the worker (and in Node
// tests).
//
// Rooms are addressed by their index 0 … roomCount-1 (file order). The
// file's own "external" room ids are only kept in `extId`; exits already
// point at room indices.
//
// Exits: every room has seven exit slots, `slot = room * DIR_COUNT + dir`
// with `dir` in the order N, S, E, W, U, D, UNKNOWN (MMapper's
// ExitDirection). Targets use a CSR layout: the targets of `slot` are
// `outTo[outStart[slot] … outStart[slot + 1] - 1]`, likewise `inFrom` /
// `inStart` for the rebuilt incoming links (research §1.3).

/** Exit directions in MMapper's order. */
export const DIR = { N: 0, S: 1, E: 2, W: 3, U: 4, D: 5, UNKNOWN: 6 } as const;
export type Dir = (typeof DIR)[keyof typeof DIR];
/** Exit slots per room. */
export const DIR_COUNT = 7;
/** The opposite direction (UNKNOWN is its own opposite). */
export const OPPOSITE: readonly Dir[] = [1, 0, 3, 2, 5, 4, 6];
/** Direction names as MUME / MMapper write them. */
export const DIR_NAMES = ['north', 'south', 'east', 'west', 'up', 'down', 'unknown'] as const;

/** Terrain ordinals (research §1.4). */
export const TERRAIN = [
  'undefined', 'indoors', 'city', 'field', 'forest', 'hills', 'mountains', 'shallow',
  'water', 'rapids', 'underwater', 'road', 'brush', 'tunnel', 'cavern',
] as const;
export const TERRAIN_ROAD = 11;

/** Light: 0 undefined, 1 dark, 2 lit. */
export const LIGHT = { UNDEFINED: 0, DARK: 1, LIT: 2 } as const;
/** Align: 0 undefined, 1 good, 2 neutral, 3 evil. */
export const ALIGN = { UNDEFINED: 0, GOOD: 1, NEUTRAL: 2, EVIL: 3 } as const;
/** Portable: 0 undefined, 1 portable, 2 not portable. */
export const PORTABLE = { UNDEFINED: 0, PORTABLE: 1, NOT_PORTABLE: 2 } as const;
/** Ridable: 0 undefined, 1 ridable, 2 not ridable. */
export const RIDABLE = { UNDEFINED: 0, RIDABLE: 1, NOT_RIDABLE: 2 } as const;
/** Sundeath: 0 undefined, 1 sundeath, 2 no sundeath. */
export const SUNDEATH = { UNDEFINED: 0, SUNDEATH: 1, NO_SUNDEATH: 2 } as const;

/** Mob flag bits (bit i = ordinal i). */
export const MOB_FLAGS = [
  'rent', 'shop', 'weapon_shop', 'armour_shop', 'food_shop', 'pet_shop', 'guild', 'scout_guild',
  'mage_guild', 'cleric_guild', 'warrior_guild', 'ranger_guild', 'aggressive_mob', 'quest_mob',
  'passive_mob', 'elite_mob', 'super_mob', 'milkable', 'rattlesnake',
] as const;
/** Load flag bits (bit i = ordinal i). */
export const LOAD_FLAGS = [
  'treasure', 'armour', 'weapon', 'water', 'food', 'herb', 'key', 'mule', 'horse', 'pack_horse',
  'trained_horse', 'rohirrim', 'warg', 'boat', 'attention', 'tower', 'clock', 'mail', 'stable',
  'white_word', 'dark_word', 'equipment', 'coach', 'ferry', 'deathtrap',
] as const;

/** Exit flag bits. */
export const EXIT_FLAG = {
  EXIT: 1 << 0,
  DOOR: 1 << 1,
  ROAD: 1 << 2,
  CLIMB: 1 << 3,
  RANDOM: 1 << 4,
  SPECIAL: 1 << 5,
  NO_MATCH: 1 << 6,
  FLOW: 1 << 7,
  NO_FLEE: 1 << 8,
  DAMAGE: 1 << 9,
  FALL: 1 << 10,
  GUARDED: 1 << 11,
  UNMAPPED: 1 << 12,
} as const;

/** Door flag bits. */
export const DOOR_FLAG = {
  HIDDEN: 1 << 0,
  NEED_KEY: 1 << 1,
  NO_BLOCK: 1 << 2,
  NO_BREAK: 1 << 3,
  NO_PICK: 1 << 4,
  DELAYED: 1 << 5,
  CALLABLE: 1 << 6,
  KNOCKABLE: 1 << 7,
  MAGIC: 1 << 8,
  ACTION: 1 << 9,
  NO_BASH: 1 << 10,
} as const;

/** Infomark types. */
export const INFOMARK_TYPE = { TEXT: 0, LINE: 1, ARROW: 2 } as const;
/** Infomark classes. */
export const INFOMARK_CLASS = [
  'generic', 'herb', 'river', 'place', 'mob', 'comment', 'road', 'object', 'action', 'locality',
] as const;
/** Infomark positions are in 1/INFOMARK_SCALE rooms (x, y; z is in layers). */
export const INFOMARK_SCALE = 100;

/** Infomarks, one entry per mark (file order). */
export interface Infomarks {
  count: number;
  /** INFOMARK_TYPE. */
  type: Uint8Array;
  /** Index into INFOMARK_CLASS. */
  cls: Uint8Array;
  /** Degrees (MMapper: CCW in y-up screen space). */
  angle: Int32Array;
  /** pos1 / pos2: x, y in 1/100 room, z in layers. */
  x1: Int32Array;
  y1: Int32Array;
  z1: Int32Array;
  x2: Int32Array;
  y2: Int32Array;
  z2: Int32Array;
  /** TEXT marks only ("" for LINE / ARROW). */
  text: string[];
}

/** An axis-aligned box of room coordinates (inclusive). */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Rooms inside. */
  count: number;
}

export interface MapData {
  /** Schema version of the file (always 42 for now). */
  version: number;
  roomCount: number;
  /** The file's stored "last selected" position. */
  selected: { x: number; y: number; z: number };

  // ---- per room (length roomCount)
  x: Int32Array;
  y: Int32Array;
  z: Int32Array;
  /** The file's room id (exits in the file refer to it). */
  extId: Uint32Array;
  /** MUME's room id (GMCP Room.Info.id); 0 = none. */
  serverId: Uint32Array;
  /** Index into TERRAIN. */
  terrain: Uint8Array;
  light: Uint8Array;
  align: Uint8Array;
  portable: Uint8Array;
  ridable: Uint8Array;
  sundeath: Uint8Array;
  /** MOB_FLAGS bits. */
  mobFlags: Uint32Array;
  /** LOAD_FLAGS bits. */
  loadFlags: Uint32Array;
  names: string[];
  descs: string[];
  /** Area name ("" for most rooms). */
  areas: string[];

  // ---- per exit slot (length roomCount * DIR_COUNT)
  /** EXIT_FLAG bits, after MMapper's load invariants (EXIT, UNMAPPED, DOOR). */
  exitFlags: Uint16Array;
  /** DOOR_FLAG bits (0 when the exit has no door). */
  doorFlags: Uint16Array;
  /** Door names by slot; only non-empty names are present. */
  doorNames: Map<number, string>;
  /** CSR offsets into `outTo` (length roomCount * DIR_COUNT + 1). */
  outStart: Uint32Array;
  /** Outgoing target room indices. */
  outTo: Uint32Array;
  /** CSR offsets into `inFrom` (length roomCount * DIR_COUNT + 1). */
  inStart: Uint32Array;
  /** Incoming source room indices (`B.in[opposite(d)] ∋ A` for every `A.out[d] ∋ B`). */
  inFrom: Uint32Array;

  infomarks: Infomarks;

  // ---- derived indexes
  /** Server id → room index (rooms with serverId ≠ 0). */
  byServerId: Map<number, number>;
  /** nameDescHash(name, desc) → room indices (see `roomsByNameDesc`). */
  byNameDesc: Map<number, number[]>;
  /** Whole-map bounds (count = roomCount). */
  bounds: Bounds & { minZ: number; maxZ: number };
  /** Bounds of every layer that has rooms. */
  layers: Map<number, Bounds>;
}

/** Letters NFD does not split into a base letter and a mark. */
const FOLD_EXTRA: Record<string, string> = {
  'Æ': 'AE', 'æ': 'ae', 'Ø': 'O', 'ø': 'o', 'Œ': 'OE', 'œ': 'oe', 'ß': 'ss', 'Ð': 'D', 'ð': 'd', 'Þ': 'Th', 'þ': 'th',
};

/**
 * Folds letters with diacritics to ASCII (`Lhûn` → `Lhun`). MMapper saves
 * room text as ASCII while MUME sends UTF-8 (GMCP and text alike), so the
 * locator compares folded text (ADR 0069). ASCII input is returned as is.
 */
export function foldAscii(s: string): string {
  if (!/[^\x00-\x7f]/.test(s)) return s;
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ÆæØøŒœßÐðÞþ]/g, (c) => FOLD_EXTRA[c]!);
}

/** Folds to ASCII, collapses whitespace runs to one space and trims (ADR 0020 locator, ADR 0069). */
export function normalizeText(s: string): string {
  return foldAscii(s).replace(/\s+/g, ' ').trim();
}

/** True for the characters `\s` matches in `normalizeText` (ASCII and the common Unicode spaces). */
function isSpace(c: number): boolean {
  return c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0xfeff || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000;
}

/** FNV-1a over `s` as `normalizeText(s)` would read, continuing from `h`. */
function hashNormalized(s: string, h: number): number {
  s = foldAscii(s);
  let pending = false;
  let started = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (isSpace(c)) {
      pending = started;
      continue;
    }
    if (pending) {
      h = Math.imul(h ^ 32, 0x01000193);
      pending = false;
    }
    started = true;
    h = Math.imul(h ^ c, 0x01000193);
  }
  return h;
}

/** FNV-1a 32-bit hash of the normalised name and description (no string is built). */
export function nameDescHash(name: string, desc: string): number {
  let h = hashNormalized(name, 0x811c9dc5);
  h = Math.imul(h ^ 10, 0x01000193);
  return hashNormalized(desc, h) >>> 0;
}

/** Rooms whose normalised name and description equal these (hash checked against the text). */
export function roomsByNameDesc(map: MapData, name: string, desc: string): number[] {
  const hit = map.byNameDesc.get(nameDescHash(name, desc));
  if (!hit) return [];
  const n = normalizeText(name);
  const d = normalizeText(desc);
  return hit.filter((i) => normalizeText(map.names[i]!) === n && normalizeText(map.descs[i]!) === d);
}

/** Outgoing target rooms of `room` towards `dir`. */
export function exitTargets(map: MapData, room: number, dir: Dir): Uint32Array {
  const slot = room * DIR_COUNT + dir;
  return map.outTo.subarray(map.outStart[slot]!, map.outStart[slot + 1]!);
}

/** Rooms with an exit towards `room` that arrives from `dir` (i.e. their exit `opposite(dir)`). */
export function exitSources(map: MapData, room: number, dir: Dir): Uint32Array {
  const slot = room * DIR_COUNT + dir;
  return map.inFrom.subarray(map.inStart[slot]!, map.inStart[slot + 1]!);
}

/** Builds the derived indexes (incoming exits, server ids, name hash, bounds) in place. */
export function buildIndexes(map: MapData): void {
  const n = map.roomCount;
  const slots = n * DIR_COUNT;

  // Incoming: count, prefix sum, fill.
  const inCount = new Uint32Array(slots + 1);
  for (let r = 0; r < n; r++) {
    for (let d = 0; d < DIR_COUNT; d++) {
      const s = r * DIR_COUNT + d;
      const opp = OPPOSITE[d]!;
      for (let k = map.outStart[s]!; k < map.outStart[s + 1]!; k++) {
        inCount[map.outTo[k]! * DIR_COUNT + opp]!++;
      }
    }
  }
  const inStart = new Uint32Array(slots + 1);
  for (let s = 0; s < slots; s++) inStart[s + 1] = inStart[s]! + inCount[s]!;
  const inFrom = new Uint32Array(inStart[slots]!);
  const fill = inStart.slice(0, slots);
  for (let r = 0; r < n; r++) {
    for (let d = 0; d < DIR_COUNT; d++) {
      const s = r * DIR_COUNT + d;
      const opp = OPPOSITE[d]!;
      for (let k = map.outStart[s]!; k < map.outStart[s + 1]!; k++) {
        inFrom[fill[map.outTo[k]! * DIR_COUNT + opp]!++] = r;
      }
    }
  }
  map.inStart = inStart;
  map.inFrom = inFrom;

  map.byServerId = new Map();
  map.byNameDesc = new Map();
  map.layers = new Map();
  const b = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, count: n };
  for (let r = 0; r < n; r++) {
    const sid = map.serverId[r]!;
    if (sid !== 0) map.byServerId.set(sid, r);
    const h = nameDescHash(map.names[r]!, map.descs[r]!);
    const list = map.byNameDesc.get(h);
    if (list) list.push(r);
    else map.byNameDesc.set(h, [r]);

    const x = map.x[r]!;
    const y = map.y[r]!;
    const z = map.z[r]!;
    if (r === 0) {
      b.minX = b.maxX = x;
      b.minY = b.maxY = y;
      b.minZ = b.maxZ = z;
    } else {
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;
      if (z < b.minZ) b.minZ = z;
      if (z > b.maxZ) b.maxZ = z;
    }
    const l = map.layers.get(z);
    if (!l) map.layers.set(z, { minX: x, maxX: x, minY: y, maxY: y, count: 1 });
    else {
      if (x < l.minX) l.minX = x;
      if (x > l.maxX) l.maxX = x;
      if (y < l.minY) l.minY = y;
      if (y > l.maxY) l.maxY = y;
      l.count++;
    }
  }
  map.bounds = b;
}
