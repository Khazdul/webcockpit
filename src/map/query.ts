// Room search by text (ADR 0057 "Matching"): which map rooms a room's
// shown text is — its name, optionally description lines and the
// `Exits:` line — nearest to the player first. Pure; runs in the map
// worker (and in Node tests).
//
// - Name: exact (normalised whitespace), else case-insensitive. A lazy
//   index per map is kept in a WeakMap, so MapData is unchanged.
// - Description lines (≥ 20 characters after normalising) narrow by
//   score: the number of them inside the room's description. The best
//   score wins when it is above 0; otherwise every name match stays
//   (brief mode, aura or object lines).
// - Exits: `Exits: north, [south].` as Room.Info bits; rooms whose
//   visible exits equal them are kept when there are any.
// - Order: distance from the player's room (z weighs 8 rooms), else index.

import { visibleExits } from './locate';
import { type MapData, normalizeText } from './model';

export interface RoomQuery {
  name: string;
  /** Lines shown after the name (description, objects, mobs …). */
  lines?: readonly string[];
  /** The `Exits:` line as shown. */
  exits?: string;
  /** Most rooms returned (default 20, at most 50). */
  max?: number;
}

export interface QueryResult {
  rooms: number[];
  /** All matches before `max`. */
  total: number;
}

export const QUERY_MAX_DEFAULT = 20;
export const QUERY_MAX = 50;
/** Description lines shorter than this do not narrow (too common). */
const MIN_LINE = 20;

interface NameIndex {
  exact: Map<string, number[]>;
  lower: Map<string, number[]>;
}

const INDEX = new WeakMap<MapData, NameIndex>();

function nameIndex(map: MapData): NameIndex {
  let ix = INDEX.get(map);
  if (ix) return ix;
  ix = { exact: new Map(), lower: new Map() };
  for (let r = 0; r < map.roomCount; r++) {
    const n = normalizeText(map.names[r]!);
    if (n === '') continue;
    const a = ix.exact.get(n);
    if (a) a.push(r);
    else ix.exact.set(n, [r]);
    const l = n.toLowerCase();
    const b = ix.lower.get(l);
    if (b) b.push(r);
    else ix.lower.set(l, [r]);
  }
  INDEX.set(map, ix);
  return ix;
}

const EXIT_DIRS = ['north', 'south', 'east', 'west', 'up', 'down'];

/** `Exits: north, [south], east.` → Room.Info bits (N S E W U D = 0…5), or null when it is not an exits line. */
export function parseExits(line: string): number | null {
  const m = /^\s*Exits:\s*(.*?)\.?\s*$/i.exec(line);
  if (!m) return null;
  let bits = 0;
  for (const part of m[1]!.split(',')) {
    const w = part.replace(/[[\]()=<>{}*#/\\|-]/g, '').trim().toLowerCase();
    const d = EXIT_DIRS.indexOf(w);
    if (d >= 0) bits |= 1 << d;
  }
  return bits;
}

/** Rooms matching `q`, nearest to `from` (the player's room) first. */
export function findRooms(map: MapData, q: RoomQuery, from: number | null): QueryResult {
  const name = normalizeText(q.name ?? '');
  if (name === '') return { rooms: [], total: 0 };
  const ix = nameIndex(map);
  let cands = ix.exact.get(name) ?? ix.lower.get(name.toLowerCase()) ?? [];
  if (cands.length === 0) return { rooms: [], total: 0 };

  // Description lines.
  const lines = (q.lines ?? []).map(normalizeText).filter((l) => l.length >= MIN_LINE);
  if (cands.length > 1 && lines.length > 0) {
    let best = 0;
    const scored = cands.map((r) => {
      const desc = normalizeText(map.descs[r]!);
      let s = 0;
      for (const l of lines) if (desc.includes(l)) s++;
      if (s > best) best = s;
      return [r, s] as const;
    });
    if (best > 0) cands = scored.filter(([, s]) => s === best).map(([r]) => r);
  }

  // Exits.
  const ex = q.exits ? parseExits(q.exits) : null;
  if (cands.length > 1 && ex !== null) {
    const same = cands.filter((r) => visibleExits(map, r) === ex);
    if (same.length > 0) cands = same;
  }

  // Nearest first.
  const sorted = [...cands];
  if (from !== null && from >= 0 && from < map.roomCount) {
    const fx = map.x[from]!;
    const fy = map.y[from]!;
    const fz = map.z[from]!;
    const d = (r: number): number => {
      const dx = map.x[r]! - fx;
      const dy = map.y[r]! - fy;
      const dz = (map.z[r]! - fz) * 8;
      return dx * dx + dy * dy + dz * dz;
    };
    sorted.sort((a, b) => d(a) - d(b) || a - b);
  }
  const max = Math.max(1, Math.min(QUERY_MAX, Math.floor(q.max ?? QUERY_MAX_DEFAULT)));
  return { rooms: sorted.slice(0, max), total: sorted.length };
}
