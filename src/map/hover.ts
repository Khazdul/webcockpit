// Map pane hover box (ADR 0077 §A): which room lies under a canvas point,
// and what the box says about it. Pure; runs in the map worker (and in
// Node tests).
//
// - Hit test on the current layer only, with the renderer's projection
//   (view.ts `pxPerRoom`: every layer is centred on the view, scaled by its
//   own px per room). A room index by position is built lazily, once per
//   map, on the first hover (a WeakMap, so MapData is unchanged).
// - Minimal: the room name and the note. Full: MMapper's room preview
//   (`map/Map.cpp` `previewRoom`): name, description, contents, the exits
//   line as `displayExits` builds it (without "(emulated)" and without the
//   `enhanceExits` tail, which names flags), then the note. Never the area,
//   the terrain or mob/load flag words (owner decisions 2026-10-05).

import { DIR_NAMES, DIR_COUNT, EXIT_FLAG, SUNDEATH, TERRAIN, TERRAIN_ROAD, type MapData } from './model';
import { type View, pxPerRoom } from './view';

/** What the hover box shows. */
export interface RoomHoverInfo {
  name: string;
  /** The map note ('' for none). */
  note: string;
  /** Full only: the description, the contents (what lay in the room) and the exits line. */
  desc?: string;
  contents?: string;
  exits?: string;
}

/** A room under a point and its square on the canvas (CSS px). */
export interface RoomHit {
  room: number;
  rect: { x: number; y: number; w: number; h: number };
}

const INDEX = new WeakMap<MapData, Map<string, number>>();

function positionIndex(map: MapData): Map<string, number> {
  let ix = INDEX.get(map);
  if (ix) return ix;
  ix = new Map();
  for (let r = 0; r < map.roomCount; r++) {
    const k = `${map.x[r]},${map.y[r]},${map.z[r]}`;
    if (!ix.has(k)) ix.set(k, r);
  }
  INDEX.set(map, ix);
  return ix;
}

/** The room at (px, py) CSS px in a `w` × `h` canvas showing `view`, on the view's layer, or null. */
export function roomAt(map: MapData, view: View, w: number, h: number, px: number, py: number): RoomHit | null {
  const s = pxPerRoom(view.zoom, view.layer);
  if (!(s > 0)) return null;
  const wx = view.x + (px - w / 2) / s;
  const wy = view.y - (py - h / 2) / s;
  const x = Math.floor(wx);
  const y = Math.floor(wy);
  const room = positionIndex(map).get(`${x},${y},${view.layer}`);
  if (room === undefined) return null;
  return { room, rect: { x: w / 2 + (x - view.x) * s, y: h / 2 - (y + 1 - view.y) * s, w: s, h: s } };
}

const WATER = new Set<number>([TERRAIN.indexOf('rapids'), TERRAIN.indexOf('underwater'), TERRAIN.indexOf('water')]);
/** MMapper's sun character in a preview (`previewRoom` passes `*`). */
const SUN = '*';

/**
 * The exits line as MMapper's `displayExits` writes it, without
 * "(emulated)": `Exits: {north}, =east=, -south-, |up|, ~west~, *down*.`
 * (`{}` a door, `||` a climb, `==` a road between roads, `--` a trail, `~~`
 * into water, `*` into sundeath), or `Exits: none.`. North, south, east,
 * west, up, down; an exit's first target decides water, road and sun.
 */
export function exitsText(map: MapData, room: number): string {
  const out: string[] = [];
  const src = map.terrain[room]!;
  for (let d = 0; d < DIR_COUNT - 1; d++) {
    const slot = room * DIR_COUNT + d;
    const f = map.exitFlags[slot]!;
    if ((f & EXIT_FLAG.EXIT) === 0) continue;
    let pre = '';
    let post = '';
    let road = false;
    let swim = false;
    let sun = false;
    const a = map.outStart[slot]!;
    if (map.outStart[slot + 1]! > a) {
      const t = map.outTo[a]!;
      if (map.sundeath[t] === SUNDEATH.SUNDEATH) {
        sun = true;
        pre += SUN;
      }
      if (WATER.has(map.terrain[t]!)) {
        swim = true;
        pre += '~';
      } else if (map.terrain[t] === TERRAIN_ROAD && src === TERRAIN_ROAD) {
        road = true;
        pre += '=';
      }
    }
    let trail = false;
    if (!road && (f & EXIT_FLAG.ROAD) !== 0) {
      if (src === TERRAIN_ROAD) road = true;
      else trail = true;
      pre += road ? '=' : '-';
    }
    if ((f & EXIT_FLAG.DOOR) !== 0) {
      pre += '{';
      post += '}';
    } else if ((f & EXIT_FLAG.CLIMB) !== 0) {
      pre += '|';
      post += '|';
    }
    post += swim ? '~' : road ? '=' : trail ? '-' : '';
    if (sun) post += SUN;
    out.push(`${pre}${DIR_NAMES[d]}${post}`);
  }
  return out.length > 0 ? `Exits: ${out.join(', ')}.` : 'Exits: none.';
}

/** The hover box's content for `room`. */
export function hoverInfo(map: MapData, room: number, full: boolean): RoomHoverInfo {
  const info: RoomHoverInfo = { name: map.names[room] ?? '', note: map.notes[room] ?? '' };
  if (!full) return info;
  info.desc = map.descs[room] ?? '';
  info.contents = map.contents[room] ?? '';
  info.exits = exitsText(map, room);
  return info;
}
