// Map pane hover box (ADR 0077 §A): which room lies under a canvas point,
// and what the box says about it. Pure; runs in the map worker (and in
// Node tests).
//
// - Hit test on the current layer only, with the renderer's projection
//   (view.ts `pxPerRoom`: every layer is centred on the view, scaled by its
//   own px per room). A room index by position is built lazily, once per
//   map, on the first hover (a WeakMap, so MapData is unchanged).
// - Minimal: the room name and the note. Full: also the description, the
//   exits (`Exits: n e [s] u`, a door in brackets as MUME shows it) and the
//   mob and load flags in words. Never the area or the terrain (owner
//   decision 2026-10-05).

import { DIR_COUNT, DIR_NAMES, EXIT_FLAG, LOAD_FLAGS, MOB_FLAGS, type MapData } from './model';
import { type View, pxPerRoom } from './view';

/** What the hover box shows. */
export interface RoomHoverInfo {
  name: string;
  /** The map note ('' for none). */
  note: string;
  /** Full only. */
  desc?: string;
  exits?: string;
  flags?: string;
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

const SHORT = ['n', 's', 'e', 'w', 'u', 'd'];

/** `Exits: n e [s] u` (doors in brackets), or '' when the room has none. */
export function exitsText(map: MapData, room: number): string {
  const out: string[] = [];
  for (let d = 0; d < DIR_COUNT - 1; d++) {
    const f = map.exitFlags[room * DIR_COUNT + d]!;
    if ((f & EXIT_FLAG.EXIT) === 0) continue;
    const n = SHORT[d] ?? DIR_NAMES[d]!;
    out.push((f & EXIT_FLAG.DOOR) !== 0 ? `[${n}]` : n);
  }
  return out.length > 0 ? `Exits: ${out.join(' ')}` : '';
}

/** Mob and load flags in words (`aggressive mob, herb, water`), or ''. */
export function flagsText(map: MapData, room: number): string {
  const words: string[] = [];
  const mob = map.mobFlags[room]!;
  const load = map.loadFlags[room]!;
  MOB_FLAGS.forEach((f, i) => {
    if (mob & (1 << i)) words.push(f.replace(/_/g, ' '));
  });
  LOAD_FLAGS.forEach((f, i) => {
    if (load & (1 << i)) words.push(f.replace(/_/g, ' '));
  });
  return words.join(', ');
}

/** The hover box's content for `room`. */
export function hoverInfo(map: MapData, room: number, full: boolean): RoomHoverInfo {
  const info: RoomHoverInfo = { name: map.names[room] ?? '', note: map.notes[room] ?? '' };
  if (!full) return info;
  info.desc = map.descs[room] ?? '';
  info.exits = exitsText(map, room);
  info.flags = flagsText(map, room);
  return info;
}
