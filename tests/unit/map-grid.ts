// A synthetic map for tests: a w × h grid of rooms on layer 0, every room
// linked both ways to its N/S/E/W neighbours. Room i sits at
// (i % w, floor(i / w)); its server id is 1000 + i, its name `Room <i>`
// and its description unique. Used by the unit tests and the e2e (which
// writes it as a `.mm2` with writeMm2).

import { DIR, DIR_COUNT, EXIT_FLAG, type MapData, TERRAIN_ROAD, buildIndexes } from '../../src/map/model';

export interface GridOptions {
  /** Rooms without a server id (index → true). */
  noServerId?: (i: number) => boolean;
  /** Terrain of room i (default field, 3). */
  terrain?: (i: number) => number;
  /** Name / desc of room i. */
  name?: (i: number) => string;
  desc?: (i: number) => string;
  /** Map note of room i (default none). */
  note?: (i: number) => string;
}

export function gridMap(w: number, h: number, o: GridOptions = {}): MapData {
  const n = w * h;
  const slots = n * DIR_COUNT;
  const outStart = new Uint32Array(slots + 1);
  const exitFlags = new Uint16Array(slots);
  const to: number[] = [];
  const terrain = Uint8Array.from({ length: n }, (_, i) => o.terrain?.(i) ?? 3);
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    // y grows northwards (MMapper coordinates).
    const nb: Array<[number, number]> = [
      [DIR.N, y + 1 < h ? i + w : -1],
      [DIR.S, y > 0 ? i - w : -1],
      [DIR.E, x + 1 < w ? i + 1 : -1],
      [DIR.W, x > 0 ? i - 1 : -1],
    ];
    const targets = new Map(nb);
    for (let d = 0; d < DIR_COUNT; d++) {
      const s = i * DIR_COUNT + d;
      outStart[s] = to.length;
      const t = targets.get(d as never) ?? -1;
      if (t < 0) continue;
      exitFlags[s] = EXIT_FLAG.EXIT | (terrain[i] === TERRAIN_ROAD && terrain[t] === TERRAIN_ROAD ? EXIT_FLAG.ROAD : 0);
      to.push(t);
    }
  }
  outStart[slots] = to.length;
  const map: MapData = {
    version: 42,
    roomCount: n,
    selected: { x: 0, y: 0, z: 0 },
    x: Int32Array.from({ length: n }, (_, i) => i % w),
    y: Int32Array.from({ length: n }, (_, i) => Math.floor(i / w)),
    z: new Int32Array(n),
    extId: Uint32Array.from({ length: n }, (_, i) => i + 1),
    serverId: Uint32Array.from({ length: n }, (_, i) => (o.noServerId?.(i) ? 0 : 1000 + i)),
    terrain,
    light: new Uint8Array(n).fill(2),
    align: new Uint8Array(n),
    portable: new Uint8Array(n),
    ridable: new Uint8Array(n),
    sundeath: new Uint8Array(n),
    mobFlags: new Uint32Array(n),
    loadFlags: new Uint32Array(n),
    names: Array.from({ length: n }, (_, i) => o.name?.(i) ?? `Room ${i}`),
    descs: Array.from({ length: n }, (_, i) => o.desc?.(i) ?? `The plain room number ${i}.\n`),
    areas: Array.from({ length: n }, () => ''),
    contents: Array.from({ length: n }, () => ''),
    notes: Array.from({ length: n }, (_, i) => o.note?.(i) ?? ''),
    exitFlags,
    doorFlags: new Uint16Array(slots),
    doorNames: new Map(),
    outStart,
    outTo: Uint32Array.from(to),
    inStart: new Uint32Array(0),
    inFrom: new Uint32Array(0),
    infomarks: {
      count: 0,
      type: new Uint8Array(0),
      cls: new Uint8Array(0),
      angle: new Int32Array(0),
      x1: new Int32Array(0),
      y1: new Int32Array(0),
      z1: new Int32Array(0),
      x2: new Int32Array(0),
      y2: new Int32Array(0),
      z2: new Int32Array(0),
      text: [],
    },
    byServerId: new Map(),
    byNameDesc: new Map(),
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, count: 0 },
    layers: new Map(),
  };
  buildIndexes(map);
  return map;
}

/** A capture line (`<16-digit µs> ESC GMCP <pkg> <json>`). */
export function gmcpLine(us: number, pkg: string, data: unknown): string {
  return `${String(us).padStart(16, '0')} \x1bGMCP ${pkg} ${JSON.stringify(data)}\n`;
}
