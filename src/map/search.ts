// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 The WebCockpit Authors
// Derived from MMapper 26.06.0 (https://github.com/MUME/MMapper),
// Copyright (C) 2019-2026 The MMapper Authors. Modified for WebCockpit
// (2026-10-05): rewritten in TypeScript over typed arrays; see
// THIRD_PARTY_NOTICES.md "MMapper-derived code".
//
// Map search for scripts (ADR 0077 §B): rooms by a field's text, the
// shortest paths from the player's room, direction text, and a room's
// details. Pure; runs in the map worker (and in Node tests).
//
// Ported from MMapper 26.06.0 (GPL-2.0-or-later):
// - matching: mapdata/roomfilter.cpp `createRegex`, `filter_kind`
//   (substring, case-insensitive unless asked; whitespace in a plain pattern
//   matches any whitespace run; regex on request), and the flag names of
//   parser/AbstractParser-Commands.cpp `getParserCommandName`;
// - path costs: mapdata/shortestpath.cpp `terrain_cost`, `getLength` and
//   the walk rules of `shortestPathSearch` (only exits with the EXIT flag and
//   exactly one target);
// - direction text: parser/abstractparser.cpp `compressDirections`.
//
// Differences (ADR 0077 §B): one Dijkstra over the whole map per player
// room (cached), so every match gets its steps; the direction runs are
// separated by spaces (`3e n 2u`; MMapper writes `3en2u (total: …)`); the
// flags field skips the `exit` flag (every exit has it) and also matches
// the mob and load flags in words (`aggressive mob`); the query and the
// room text are folded to ASCII (ADR 0069, `foldAscii`: every combining
// mark and a few whole letters), so a search ignores diacritics both ways
// (`o` finds `ó`, `Lhûn` finds `Lhun`; the bundled map's text is ASCII).

import {
  DIR_COUNT,
  DIR_NAMES,
  type Dir,
  EXIT_FLAG,
  LOAD_FLAGS,
  MOB_FLAGS,
  RIDABLE,
  TERRAIN,
  type MapData,
  exitTargets,
  foldAscii,
} from './model';

export const SEARCH_FIELDS = ['name', 'desc', 'contents', 'note', 'area', 'exits', 'flags', 'all'] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export interface SearchQuery {
  text: string;
  /** Default `name`. */
  field?: SearchField;
  /** Case sensitive (default false). */
  case?: boolean;
  /** `text` is a regular expression (default false). */
  regex?: boolean;
  /** Most results (default SEARCH_MAX_DEFAULT, at most SEARCH_MAX). */
  max?: number;
}

export const SEARCH_MAX_DEFAULT = 200;
export const SEARCH_MAX = 500;

/** One search result. */
export interface SearchHit {
  id: number;
  name: string;
  area: string;
  note: string;
  /** Moves on the shortest path; null when unreachable or the player's room is unknown. */
  steps: number | null;
  /** Direction text (`3e n 2u`, '' for the player's room); null as `steps`. */
  dirs: string | null;
}

export interface SearchResult {
  results: SearchHit[];
  /** All matches before `max`. */
  total: number;
  /** The player's room the paths start from, or null. */
  here: number | null;
}

/**
 * The query's pattern (MMapper `createRegex`): a plain text is trimmed,
 * escaped, and its whitespace runs match any whitespace run; `regex` takes
 * it as is (JavaScript syntax). Case-insensitive unless `case`. Throws a
 * SyntaxError for a bad regular expression.
 */
export function searchPattern(q: SearchQuery): RegExp {
  const text = foldAscii(q.text ?? '');
  const flags = q.case ? '' : 'i';
  if (q.regex) return new RegExp(text, flags);
  const src = text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(src, flags);
}

// ------------------------------------------------------------ flag names

/** MMapper's names for the mob flags (bit order). */
const MOB_NAMES = [
  'rent', 'shop', 'weaponshop', 'armourshop', 'foodshop', 'petshop', 'guild', 'scoutguild', 'mageguild', 'clericguild',
  'warriorguild', 'rangerguild', 'aggmob', 'questmob', 'passivemob', 'elitemob', 'smob', 'milkable', 'rattlesnake',
];
/** MMapper's names for the load flags (bit order). */
const LOAD_NAMES = [
  'treasure', 'armour', 'weapon', 'water', 'food', 'herb', 'key', 'mule', 'horse', 'pack', 'trained', 'rohirrim', 'warg',
  'boat', 'attention', 'watch', 'clock', 'mail', 'stable', 'whiteword', 'darkword', 'equipment', 'coach', 'ferry', 'deathtrap',
];
/** MMapper's names for the exit flags (bit order); `exit` is never matched. */
export const EXIT_NAMES = [
  'exit', 'door', 'road', 'climb', 'random', 'special', 'nomatch', 'flow', 'noflee', 'damage', 'fall', 'guarded', 'unmapped',
];
/** MMapper's names for the door flags (bit order). */
export const DOOR_NAMES = [
  'hidden', 'needkey', 'noblock', 'nobreak', 'nopick', 'delayed', 'callable', 'knockable', 'magic', 'action', 'nobash',
];
/** Names of the defined values (index = the MapData ordinal; 0 undefined is never matched). */
const LIGHT_NAMES = ['', 'dark', 'lit'];
const SUNDEATH_NAMES = ['', 'sundeath', 'nosundeath'];
const PORTABLE_NAMES = ['', 'port', 'noport'];
const RIDABLE_NAMES = ['', 'ride', 'noride'];
const ALIGN_NAMES = ['', 'good', 'neutral', 'evil'];

const words = (names: readonly string[]): string[] => names.map((n) => n.replace(/_/g, ' '));
const MOB_WORDS = words(MOB_FLAGS);
const LOAD_WORDS = words(LOAD_FLAGS);

/** Bits of `names` (with their alternative `alt` names) that `re` matches. */
function maskOf(re: RegExp, names: readonly string[], alt?: readonly string[]): number {
  let m = 0;
  for (let i = 0; i < names.length; i++) {
    const n = names[i]!;
    if ((n !== '' && re.test(n)) || (alt && re.test(alt[i]!))) m |= 1 << i;
  }
  return m;
}

interface FlagMasks {
  mob: number;
  load: number;
  exit: number;
  door: number;
  light: number;
  sundeath: number;
  portable: number;
  ridable: number;
  align: number;
}

function flagMasks(re: RegExp): FlagMasks {
  return {
    mob: maskOf(re, MOB_NAMES, MOB_WORDS),
    load: maskOf(re, LOAD_NAMES, LOAD_WORDS),
    exit: maskOf(re, EXIT_NAMES) & ~EXIT_FLAG.EXIT,
    door: maskOf(re, DOOR_NAMES),
    light: maskOf(re, LIGHT_NAMES),
    sundeath: maskOf(re, SUNDEATH_NAMES),
    portable: maskOf(re, PORTABLE_NAMES),
    ridable: maskOf(re, RIDABLE_NAMES),
    align: maskOf(re, ALIGN_NAMES),
  };
}

function flagsMatch(map: MapData, r: number, m: FlagMasks): boolean {
  if (map.mobFlags[r]! & m.mob || map.loadFlags[r]! & m.load) return true;
  if ((1 << map.light[r]!) & m.light || (1 << map.sundeath[r]!) & m.sundeath) return true;
  if ((1 << map.portable[r]!) & m.portable || (1 << map.ridable[r]!) & m.ridable || (1 << map.align[r]!) & m.align) return true;
  if (m.exit === 0 && m.door === 0) return false;
  const s0 = r * DIR_COUNT;
  for (let s = s0; s < s0 + DIR_COUNT; s++) {
    if (map.exitFlags[s]! & m.exit || map.doorFlags[s]! & m.door) return true;
  }
  return false;
}

/** Rooms with a door name `re` matches (MMapper's `exits` field). */
function doorRooms(map: MapData, re: RegExp): Set<number> {
  const out = new Set<number>();
  for (const [slot, name] of map.doorNames) if (re.test(foldAscii(name))) out.add(Math.floor(slot / DIR_COUNT));
  return out;
}

/** The rooms whose `field` matches `re`, in index order. */
export function matchRooms(map: MapData, re: RegExp, field: SearchField): number[] {
  const out: number[] = [];
  const text = (list: readonly string[]) => {
    for (let r = 0; r < map.roomCount; r++) if (re.test(foldAscii(list[r]!))) out.push(r);
  };
  switch (field) {
    case 'name':
      text(map.names);
      return out;
    case 'desc':
      text(map.descs);
      return out;
    case 'contents':
      text(map.contents);
      return out;
    case 'note':
      text(map.notes);
      return out;
    case 'area':
      text(map.areas);
      return out;
    case 'exits':
      return [...doorRooms(map, re)].sort((a, b) => a - b);
    case 'flags': {
      const m = flagMasks(re);
      for (let r = 0; r < map.roomCount; r++) if (flagsMatch(map, r, m)) out.push(r);
      return out;
    }
    case 'all': {
      const m = flagMasks(re);
      const doors = doorRooms(map, re);
      const t = (s: string) => re.test(foldAscii(s));
      for (let r = 0; r < map.roomCount; r++) {
        if (
          t(map.descs[r]!) || t(map.contents[r]!) || t(map.names[r]!) || t(map.notes[r]!) ||
          doors.has(r) || flagsMatch(map, r, m) || t(map.areas[r]!)
        ) out.push(r);
      }
      return out;
    }
  }
}

// ------------------------------------------------------------ paths

/** Movement cost per terrain (MMapper `terrain_cost`, TERRAIN order). */
const TERRAIN_COST = [1, 0.75, 0.75, 1.5, 2.15, 2.45, 2.8, 2.45, 50, 60, 100, 0.85, 1.5, 0.75, 0.75];
const DEATHTRAP = 1 << LOAD_FLAGS.indexOf('deathtrap');

/** The cost of the exit at `slot` from `cur` to `next` (MMapper `getLength`). */
export function exitCost(map: MapData, slot: number, cur: number, next: number): number {
  let cost = TERRAIN_COST[map.terrain[next]!] ?? 1;
  const f = map.exitFlags[slot]!;
  if (f & (EXIT_FLAG.RANDOM | EXIT_FLAG.DAMAGE | EXIT_FLAG.FALL)) cost += 30;
  if (f & EXIT_FLAG.DOOR) cost += 1;
  if (f & EXIT_FLAG.CLIMB) cost += 2;
  if (map.ridable[next] === RIDABLE.NOT_RIDABLE) {
    cost += 3;
    // One non-ridable room means walking two rooms, plus dismount and mount.
    if (map.ridable[cur] !== RIDABLE.NOT_RIDABLE) cost += 4;
  }
  if (f & EXIT_FLAG.ROAD) cost -= 0.1;
  if (map.loadFlags[next]! & DEATHTRAP) cost += 1000;
  return cost;
}

/** Shortest paths from one room to every room. */
export interface PathTree {
  from: number;
  /** Path cost (Infinity: unreachable). */
  cost: Float64Array;
  /** The room before on the path (-1 at `from` and for unreachable rooms). */
  prev: Int32Array;
  /** The direction taken into the room (DIR order). */
  dir: Int8Array;
  /** Moves on the path. */
  steps: Int32Array;
}

/**
 * Dijkstra from `from` over the whole map (MMapper `shortestPathSearch`
 * without its hit limit): only exits with the EXIT flag and exactly one
 * target are walked, in all seven directions.
 */
export function shortestPaths(map: MapData, from: number): PathTree {
  const n = map.roomCount;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const dir = new Int8Array(n).fill(-1);
  const steps = new Int32Array(n);
  const done = new Uint8Array(n);
  const tree: PathTree = { from, cost, prev, dir, steps };
  if (from < 0 || from >= n) return tree;
  // A binary heap of (cost, room), lazy deletion.
  let keys = new Float64Array(1024);
  let vals = new Int32Array(1024);
  let size = 0;
  const push = (k: number, v: number) => {
    if (size === keys.length) {
      const k2 = new Float64Array(size * 2);
      k2.set(keys);
      keys = k2;
      const v2 = new Int32Array(size * 2);
      v2.set(vals);
      vals = v2;
    }
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= k) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  };
  const pop = (): number => {
    const top = vals[0]!;
    const k = keys[--size]!;
    const v = vals[size]!;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && keys[c + 1]! < keys[c]!) c++;
      if (keys[c]! >= k) break;
      keys[i] = keys[c]!;
      vals[i] = vals[c]!;
      i = c;
    }
    keys[i] = k;
    vals[i] = v;
    return top;
  };
  cost[from] = 0;
  push(0, from);
  while (size > 0) {
    const r = pop();
    if (done[r]) continue;
    done[r] = 1;
    const base = cost[r]!;
    for (let d = 0; d < DIR_COUNT; d++) {
      const slot = r * DIR_COUNT + d;
      if ((map.exitFlags[slot]! & EXIT_FLAG.EXIT) === 0) continue;
      const a = map.outStart[slot]!;
      if (map.outStart[slot + 1]! - a !== 1) continue;
      const t = map.outTo[a]!;
      if (done[t]) continue;
      const c = base + exitCost(map, slot, r, t);
      if (c < cost[t]!) {
        cost[t] = c;
        prev[t] = r;
        dir[t] = d;
        steps[t] = steps[r]! + 1;
        push(c, t);
      }
    }
  }
  return tree;
}

const TREES = new WeakMap<MapData, PathTree>();

/** `shortestPaths` from `from`, cached per map for the last start room. */
export function pathTree(map: MapData, from: number): PathTree {
  const t = TREES.get(map);
  if (t && t.from === from) return t;
  const n = shortestPaths(map, from);
  TREES.set(map, n);
  return n;
}

const DIR_CHARS = 'nsewud?';

/** Direction letters in runs (MMapper `compressDirections`): `eeenuu` → `3e n 2u`. */
export function compressDirs(letters: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < letters.length) {
    const c = letters[i]!;
    let j = i + 1;
    while (j < letters.length && letters[j] === c) j++;
    out.push(j - i > 1 ? `${j - i}${c}` : c);
    i = j;
  }
  return out.join(' ');
}

/** The path to `room` in `tree`: direction text and moves, or null when unreachable. */
export function pathTo(tree: PathTree, room: number): { dirs: string; steps: number } | null {
  if (room < 0 || room >= tree.cost.length || tree.cost[room] === Infinity) return null;
  const letters: string[] = [];
  let r = room;
  while (r !== tree.from && r >= 0) {
    letters.push(DIR_CHARS[tree.dir[r]!] ?? '?');
    r = tree.prev[r]!;
  }
  return { dirs: compressDirs(letters.reverse().join('')), steps: tree.steps[room]! };
}

/** The player's room if it is a room of `map`, else null. */
const validRoom = (map: MapData, r: number | null): number | null =>
  r !== null && Number.isInteger(r) && r >= 0 && r < map.roomCount ? r : null;

/**
 * Searches `map` (throws a SyntaxError for a bad regex). Order: rooms with
 * a path from `from` by path cost, then the others by straight-line
 * distance (ADR 0057: z weighs 8 rooms); index order without `from`.
 */
export function searchRooms(map: MapData, q: SearchQuery, from: number | null): SearchResult {
  const re = searchPattern(q);
  const rooms = matchRooms(map, re, q.field ?? 'name');
  const here = validRoom(map, from);
  const tree = here === null ? null : pathTree(map, here);
  if (tree && here !== null) {
    const fx = map.x[here]!;
    const fy = map.y[here]!;
    const fz = map.z[here]!;
    const d2 = (r: number): number => {
      const dx = map.x[r]! - fx;
      const dy = map.y[r]! - fy;
      const dz = (map.z[r]! - fz) * 8;
      return dx * dx + dy * dy + dz * dz;
    };
    const c = tree.cost;
    rooms.sort((a, b) => {
      const ca = c[a]!;
      const cb = c[b]!;
      if (ca !== Infinity || cb !== Infinity) return ca === cb ? a - b : ca - cb;
      return d2(a) - d2(b) || a - b;
    });
  }
  const max = Math.max(1, Math.min(SEARCH_MAX, Math.floor(q.max ?? SEARCH_MAX_DEFAULT)));
  const results = rooms.slice(0, max).map((r): SearchHit => {
    const p = tree ? pathTo(tree, r) : null;
    return { id: r, name: map.names[r]!, area: map.areas[r]!, note: map.notes[r]!, steps: p ? p.steps : null, dirs: p ? p.dirs : null };
  });
  return { results, total: rooms.length, here };
}

/** `mapPath`: the path from `from` to `room`, or null (unknown position, no such room, no path). */
export function roomPath(map: MapData, from: number | null, room: number): { dirs: string; steps: number } | null {
  const here = validRoom(map, from);
  if (here === null || validRoom(map, room) === null) return null;
  return pathTo(pathTree(map, here), room);
}

// ------------------------------------------------------------ details

/** One exit of `mapRoom`. */
export interface RoomExitInfo {
  /** `north` … `down`, `unknown`. */
  dir: string;
  /** The target room when the exit has exactly one. */
  to?: number;
  /** The door's name ('' for a door without one); absent without a door. */
  door?: string;
  /** Exit flags (`road`, `climb` …) and door flags (`hidden`, `needkey` …) in MMapper's words. */
  flags: string[];
}

/** `mapRoom`'s answer. */
export interface RoomDetails {
  id: number;
  name: string;
  area: string;
  desc: string;
  contents: string;
  note: string;
  terrain: string;
  x: number;
  y: number;
  z: number;
  exits: RoomExitInfo[];
  /** Mob and load flags in words (`aggressive mob`, `herb`). */
  flags: string[];
}

const bitsOf = (bits: number, names: readonly string[], skip = 0): string[] =>
  names.filter((_, i) => (bits & ~skip & (1 << i)) !== 0);

/** A room's details, or null for no such room. */
export function roomDetails(map: MapData, room: number): RoomDetails | null {
  if (validRoom(map, room) === null) return null;
  const exits: RoomExitInfo[] = [];
  for (let d = 0; d < DIR_COUNT; d++) {
    const slot = room * DIR_COUNT + d;
    const f = map.exitFlags[slot]!;
    if ((f & EXIT_FLAG.EXIT) === 0) continue;
    const e: RoomExitInfo = { dir: DIR_NAMES[d]!, flags: bitsOf(f, EXIT_NAMES, EXIT_FLAG.EXIT | EXIT_FLAG.DOOR) };
    const t = exitTargets(map, room, d as Dir);
    if (t.length === 1) e.to = t[0]!;
    if (f & EXIT_FLAG.DOOR) {
      e.door = map.doorNames.get(slot) ?? '';
      e.flags.push(...bitsOf(map.doorFlags[slot]!, DOOR_NAMES));
    }
    exits.push(e);
  }
  return {
    id: room,
    name: map.names[room]!,
    area: map.areas[room]!,
    desc: map.descs[room]!,
    contents: map.contents[room]!,
    note: map.notes[room]!,
    terrain: TERRAIN[map.terrain[room]!] ?? 'undefined',
    x: map.x[room]!,
    y: map.y[room]!,
    z: map.z[room]!,
    exits,
    flags: [...bitsOf(map.mobFlags[room]!, MOB_WORDS), ...bitsOf(map.loadFlags[room]!, LOAD_WORDS)],
  };
}
