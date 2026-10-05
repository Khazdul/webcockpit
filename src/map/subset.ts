// Map subsets (ADR 0020 "Package notes"): the rooms an HTML replay needs,
// cut from the full map. Pure. Exits to rooms outside the subset are
// dropped (the exit flags stay, so walls and exit icons still draw as in
// the full map); infomarks are kept when either end lies inside the
// subset's bounds on its layer (plus `markMargin` rooms).

import { DIR_COUNT, type Infomarks, INFOMARK_SCALE, type MapData, buildIndexes } from './model';

/** The rooms `rooms` (indices into `map`, any order, duplicates ignored) as a new MapData. */
export function subsetMap(map: MapData, rooms: Iterable<number>, markMargin = 2): MapData {
  const keep = [...new Set(rooms)].filter((r) => r >= 0 && r < map.roomCount).sort((a, b) => a - b);
  const n = keep.length;
  const newIdx = new Int32Array(map.roomCount).fill(-1);
  keep.forEach((r, i) => (newIdx[r] = i));

  const pick = <T extends Int32Array | Uint32Array | Uint8Array>(src: T, make: (n: number) => T): T => {
    const out = make(n);
    for (let i = 0; i < n; i++) out[i] = src[keep[i]!]!;
    return out;
  };
  const slots = n * DIR_COUNT;
  const exitFlags = new Uint16Array(slots);
  const doorFlags = new Uint16Array(slots);
  const doorNames = new Map<number, string>();
  const outStart = new Uint32Array(slots + 1);
  const to: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = keep[i]!;
    for (let d = 0; d < DIR_COUNT; d++) {
      const s = r * DIR_COUNT + d;
      const t = i * DIR_COUNT + d;
      exitFlags[t] = map.exitFlags[s]!;
      doorFlags[t] = map.doorFlags[s]!;
      const name = map.doorNames.get(s);
      if (name !== undefined) doorNames.set(t, name);
      outStart[t] = to.length;
      for (let k = map.outStart[s]!; k < map.outStart[s + 1]!; k++) {
        const j = newIdx[map.outTo[k]!]!;
        if (j >= 0) to.push(j);
      }
    }
  }
  outStart[slots] = to.length;

  const sub: MapData = {
    version: map.version,
    roomCount: n,
    selected: { ...map.selected },
    x: pick(map.x, (k) => new Int32Array(k)),
    y: pick(map.y, (k) => new Int32Array(k)),
    z: pick(map.z, (k) => new Int32Array(k)),
    extId: pick(map.extId, (k) => new Uint32Array(k)),
    serverId: pick(map.serverId, (k) => new Uint32Array(k)),
    terrain: pick(map.terrain, (k) => new Uint8Array(k)),
    light: pick(map.light, (k) => new Uint8Array(k)),
    align: pick(map.align, (k) => new Uint8Array(k)),
    portable: pick(map.portable, (k) => new Uint8Array(k)),
    ridable: pick(map.ridable, (k) => new Uint8Array(k)),
    sundeath: pick(map.sundeath, (k) => new Uint8Array(k)),
    mobFlags: pick(map.mobFlags, (k) => new Uint32Array(k)),
    loadFlags: pick(map.loadFlags, (k) => new Uint32Array(k)),
    names: keep.map((r) => map.names[r]!),
    descs: keep.map((r) => map.descs[r]!),
    areas: keep.map((r) => map.areas[r]!),
    // Contents only feed search (ADR 0077), which a replay does not offer.
    contents: keep.map(() => ''),
    notes: keep.map((r) => map.notes[r]!),
    exitFlags,
    doorFlags,
    doorNames,
    outStart,
    outTo: Uint32Array.from(to),
    inStart: new Uint32Array(0),
    inFrom: new Uint32Array(0),
    infomarks: subsetMarks(map, keep, markMargin),
    byServerId: new Map(),
    byNameDesc: new Map(),
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, count: 0 },
    layers: new Map(),
  };
  buildIndexes(sub);
  return sub;
}

function subsetMarks(map: MapData, keep: number[], margin: number): Infomarks {
  // Per-layer bounds of the kept rooms.
  const box = new Map<number, { x0: number; x1: number; y0: number; y1: number }>();
  for (const r of keep) {
    const z = map.z[r]!;
    const x = map.x[r]!;
    const y = map.y[r]!;
    const b = box.get(z);
    if (!b) box.set(z, { x0: x, x1: x + 1, y0: y, y1: y + 1 });
    else {
      b.x0 = Math.min(b.x0, x);
      b.x1 = Math.max(b.x1, x + 1);
      b.y0 = Math.min(b.y0, y);
      b.y1 = Math.max(b.y1, y + 1);
    }
  }
  const im = map.infomarks;
  const inside = (x: number, y: number, z: number): boolean => {
    const b = box.get(z);
    if (!b) return false;
    const wx = x / INFOMARK_SCALE;
    const wy = y / INFOMARK_SCALE;
    return wx >= b.x0 - margin && wx <= b.x1 + margin && wy >= b.y0 - margin && wy <= b.y1 + margin;
  };
  const sel: number[] = [];
  for (let m = 0; m < im.count; m++) {
    if (inside(im.x1[m]!, im.y1[m]!, im.z1[m]!) || inside(im.x2[m]!, im.y2[m]!, im.z2[m]!)) sel.push(m);
  }
  const k = sel.length;
  const i32 = (src: Int32Array): Int32Array => Int32Array.from(sel, (m) => src[m]!);
  return {
    count: k,
    type: Uint8Array.from(sel, (m) => im.type[m]!),
    cls: Uint8Array.from(sel, (m) => im.cls[m]!),
    angle: i32(im.angle),
    x1: i32(im.x1),
    y1: i32(im.y1),
    z1: i32(im.z1),
    x2: i32(im.x2),
    y2: i32(im.y2),
    z2: i32(im.z2),
    text: sel.map((m) => im.text[m]!),
  };
}

/**
 * `rooms` plus every room within `depth` exit steps of them (outgoing and
 * incoming). A subset written with `writeMm2` and read back turns exits
 * that leave it into UNMAPPED exits (MMapper's load invariant), so an
 * export should include a ring of neighbours around what it shows.
 */
export function neighbourhood(map: MapData, rooms: Iterable<number>, depth = 1): Set<number> {
  const seen = new Set<number>();
  let frontier: number[] = [];
  for (const r of rooms) {
    if (r >= 0 && r < map.roomCount && !seen.has(r)) {
      seen.add(r);
      frontier.push(r);
    }
  }
  for (let step = 0; step < depth && frontier.length > 0; step++) {
    const next: number[] = [];
    const visit = (t: number): void => {
      if (!seen.has(t)) {
        seen.add(t);
        next.push(t);
      }
    };
    for (const r of frontier) {
      const a = r * DIR_COUNT;
      const b = a + DIR_COUNT;
      for (let k = map.outStart[a]!; k < map.outStart[b]!; k++) visit(map.outTo[k]!);
      for (let k = map.inStart[a]!; k < map.inStart[b]!; k++) visit(map.inFrom[k]!);
    }
    frontier = next;
  }
  return seen;
}
