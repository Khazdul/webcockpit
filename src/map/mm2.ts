// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 The WebCockpit Authors
// Derived from MMapper 26.06.0 (https://github.com/MUME/MMapper),
// Copyright (C) 2019-2026 The MMapper Authors. Modified for WebCockpit
// (2026-09-28): rewritten in TypeScript and WebGL2; see
// THIRD_PARTY_NOTICES.md "MMapper-derived code".
//
// MMapper `.mm2` reader, schema versions 17–42 (ADR 0020; research
// notes/research/mmapper-rendering.md §1). Pure: runs in the map worker
// and in Node tests. The inflate step is injectable; the default uses
// `DecompressionStream('deflate')` (zlib-wrapped, as qCompress writes).
//
//   0   i32 BE  magic FF B2 AF 01
//   4   u32 BE  schema version (17 … 42)
//   8   u32 BE  uncompressed length (qCompress header, v ≥ 34 only)
//   …           zlib stream to EOF (v ≥ 25) or the raw payload (v < 25)
//               → the QDataStream payload (big endian)
//
// Payload: u32 rooms, u32 marks, Coordinate selected, rooms × Room,
// marks × Infomark. Strings are QString: u32 byte length (0xFFFFFFFF =
// null) then UTF-16BE. Contents and notes are kept (ADR 0077).
//
// Older schemas are converted to the current MapData exactly as MMapper
// 26.06.0 does on load (ported from src/mapstorage/mapstorage.cpp
// loadRoom / loadExits / loadMark / transformInfomarkOnLoad and
// src/map/WorldBuilder.cpp sanitize; MMapper is GPL-2.0-or-later).

import {
  DIR_COUNT,
  EXIT_FLAG,
  INFOMARK_SCALE,
  INFOMARK_TYPE,
  type Infomarks,
  type MapData,
  OPPOSITE,
  buildIndexes,
} from './model';

export const MM2_MAGIC = 0xffb2af01;
/** The current schema (MMapper 25.05 and later); the writer's default. */
export const MM2_VERSION = 42;
/** The oldest schema MMapper 26.06 (and this reader) can read. */
export const MM2_MIN_VERSION = 17;

/**
 * MMapper's schema versions (mapstorage.cpp `namespace schema`). Every one
 * of these can be read; 37 and anything unlisted cannot (nor can MMapper).
 */
export const MM2_SCHEMA = {
  initial: 17, // 2.0.0 (2006)
  ridable: 24, // + ridable byte
  zlib: 25, // zlib stream without a length prefix
  doorFlags16: 32, // 16-bit door flags; infomark class and angle
  largerFlags: 33, // 16-bit exit flags, 32-bit mob/load flags, sundeath
  qCompress: 34, // qCompress: u32 length + zlib
  discardNoMatch: 35, // NO_MATCH exit flags from 25–34 were corrupt
  newCoords: 36, // 19.10: +y north (was south), infomark offsets dropped
  noInboundLinks: 38, // 25.04: inbound links no longer stored
  removeUpToDate: 39, // upToDate byte dropped
  serverId: 40, // + server room id
  deathFlag: 41, // death terrain (15) → INDOORS + DEATHTRAP load flag
  area: 42, // + area
} as const;
const SUPPORTED: ReadonlySet<number> = new Set(Object.values(MM2_SCHEMA));
const V = MM2_SCHEMA;

/** Inflates a zlib (RFC 1950) stream. */
export type Inflate = (zlib: Uint8Array) => Promise<Uint8Array>;

export class Mm2Error extends Error {
  override name = 'Mm2Error';
}

/** Default inflate: `DecompressionStream('deflate')` (browsers, workers, Node ≥ 18). */
export const inflateZlib: Inflate = async (zlib) => {
  const stream = new Blob([zlib as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** How a schema version stores its payload after the 8-byte magic + version. */
export type Mm2Compression = 'qcompress' | 'zlib' | 'none';

export function mm2Compression(version: number): Mm2Compression {
  return version >= V.qCompress ? 'qcompress' : version >= V.zlib ? 'zlib' : 'none';
}

export interface Mm2Header {
  version: number;
  compression: Mm2Compression;
  /** Uncompressed payload length (qCompress only), else null. */
  length: number | null;
  /** Where the zlib stream or the raw payload starts. */
  offset: number;
}

/** The header of a `.mm2` file, or an error for a version MMapper 26.06 cannot read either. */
export function readMm2Header(bytes: Uint8Array): Mm2Header {
  if (bytes.byteLength < 8) throw new Mm2Error('Not an MMapper map (.mm2): file too short');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0) !== MM2_MAGIC) throw new Mm2Error('Not an MMapper map (.mm2): bad magic number');
  const version = dv.getUint32(4);
  if (!SUPPORTED.has(version)) {
    const why =
      version > MM2_VERSION
        ? 'it is newer than this reader knows. Save it from MMapper 26.06 (or older) instead, or report it.'
        : 'MMapper never released it. Open and save the map in a current MMapper first.';
    throw new Mm2Error(
      `Unsupported MMapper map version ${version}: versions ${MM2_MIN_VERSION}–${MM2_VERSION} ` +
        `(MMapper 2.0 to 26.06, except 37) can be read, and ${why}`,
    );
  }
  const compression = mm2Compression(version);
  if (compression !== 'qcompress') return { version, compression, length: null, offset: 8 };
  if (bytes.byteLength < 12) throw new Mm2Error('Not an MMapper map (.mm2): file too short');
  return { version, compression, length: dv.getUint32(8), offset: 12 };
}

/** Reads a whole `.mm2` file (header, inflate, payload). */
export async function readMm2(bytes: Uint8Array, inflate: Inflate = inflateZlib): Promise<MapData> {
  const { version, compression, length, offset } = readMm2Header(bytes);
  let payload: Uint8Array;
  if (compression === 'none') {
    payload = bytes.subarray(offset);
  } else {
    try {
      payload = await inflate(bytes.subarray(offset));
    } catch (err) {
      throw new Mm2Error(`Damaged MMapper map: decompression failed (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  if (length !== null && payload.byteLength !== length) {
    throw new Mm2Error(`Damaged MMapper map: ${payload.byteLength} bytes after decompression, header says ${length}`);
  }
  return parseMm2Payload(payload, version);
}

const NO_TARGET = 0xffffffff;

// Valid values (MMapper `toEnum` → UNDEFINED, `bitmaskToFlags` masks).
const TERRAIN_MAX = 14;
const DEATH_TERRAIN = 15; // v < 41
const MOB_MASK = (1 << 19) - 1;
const LOAD_MASK = (1 << 25) - 1;
const EXIT_MASK = (1 << 13) - 1;
const DOOR_MASK = (1 << 11) - 1;
const LOAD_DEATHTRAP = 1 << 24;
const clampEnum = (v: number, max: number): number => (v > max ? 0 : v);

/** Parses an inflated payload of schema `version` (17 … 42) into the current MapData. */
export function parseMm2Payload(u: Uint8Array, version = MM2_VERSION): MapData {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const end = u.byteLength;
  const td = new TextDecoder('utf-16be');
  let p = 0;
  const need = (n: number): void => {
    if (p + n > end) throw new Mm2Error(`Damaged MMapper map: unexpected end of data at byte ${p}`);
  };
  const u8 = (): number => {
    need(1);
    return u[p++]!;
  };
  const u16 = (): number => {
    need(2);
    const v = dv.getUint16(p);
    p += 2;
    return v;
  };
  const u32 = (): number => {
    need(4);
    const v = dv.getUint32(p);
    p += 4;
    return v;
  };
  const i32 = (): number => {
    need(4);
    const v = dv.getInt32(p);
    p += 4;
    return v;
  };
  const str = (): string => {
    const n = u32();
    if (n === NO_TARGET || n === 0) return '';
    need(n);
    const s = td.decode(u.subarray(p, p + n));
    p += n;
    return s;
  };
  const skipStr = (): void => {
    const n = u32();
    if (n === NO_TARGET) return;
    need(n);
    p += n;
  };
  const skip = (n: number): void => {
    need(n);
    p += n;
  };

  // Schema switches (see MM2_SCHEMA).
  const hasArea = version >= V.area;
  const hasServerId = version >= V.serverId;
  const deathTerrain = version < V.deathFlag;
  const hasUpToDate = version < V.removeUpToDate;
  const hasInbound = version < V.noInboundLinks;
  const esu = version < V.newCoords; // y grows south: flip to +y north
  const wide = version >= V.largerFlags;
  const wideDoor = version >= V.doorFlags16;
  const hasRidable = version >= V.ridable;
  const dropNoMatch = version >= V.zlib && version < V.discardNoMatch;
  const ySign = esu ? -1 : 1;

  const rooms = u32();
  const marks = u32();
  // Each room takes at least 7 exits × 10 bytes; reject absurd counts early.
  if (rooms > end / 70 || marks > end / 29) throw new Mm2Error('Damaged MMapper map: impossible room or mark count');
  const selected = { x: i32(), y: i32() * ySign, z: i32() };

  const slots = rooms * DIR_COUNT;
  const x = new Int32Array(rooms);
  const y = new Int32Array(rooms);
  const z = new Int32Array(rooms);
  const extId = new Uint32Array(rooms);
  const serverId = new Uint32Array(rooms);
  const terrain = new Uint8Array(rooms);
  const light = new Uint8Array(rooms);
  const align = new Uint8Array(rooms);
  const portable = new Uint8Array(rooms);
  const ridable = new Uint8Array(rooms);
  const sundeath = new Uint8Array(rooms);
  const mobFlags = new Uint32Array(rooms);
  const loadFlags = new Uint32Array(rooms);
  const names: string[] = new Array<string>(rooms);
  const descs: string[] = new Array<string>(rooms);
  const areas: string[] = new Array<string>(rooms);
  const contents: string[] = new Array<string>(rooms);
  const notes: string[] = new Array<string>(rooms);
  const exitFlags = new Uint16Array(slots);
  const doorFlags = new Uint16Array(slots);
  const doorNames = new Map<number, string>();
  const outStart = new Uint32Array(slots + 1);
  // External target ids first; resolved to indices after all rooms are read.
  let ext = new Uint32Array(Math.max(16, rooms * 2));
  let nOut = 0;
  // v < 38: inbound links as (slot, external source id) pairs.
  const inSlot: number[] = [];
  const inExt: number[] = [];

  for (let r = 0; r < rooms; r++) {
    areas[r] = hasArea ? str() : '';
    names[r] = str();
    descs[r] = str();
    contents[r] = str();
    extId[r] = u32();
    serverId[r] = hasServerId ? u32() : 0;
    notes[r] = str();
    const t = u8();
    let death = false;
    if (deathTerrain && t === DEATH_TERRAIN) {
      death = true;
      terrain[r] = 1; // INDOORS
    } else {
      terrain[r] = clampEnum(t, TERRAIN_MAX);
    }
    light[r] = clampEnum(u8(), 2);
    align[r] = clampEnum(u8(), 3);
    portable[r] = clampEnum(u8(), 2);
    ridable[r] = hasRidable ? clampEnum(u8(), 2) : 0;
    sundeath[r] = wide ? clampEnum(u8(), 2) : 0;
    mobFlags[r] = (wide ? u32() : u16()) & MOB_MASK;
    loadFlags[r] = ((wide ? u32() : u16()) & LOAD_MASK) | (death ? LOAD_DEATHTRAP : 0);
    if (hasUpToDate) skip(1);
    x[r] = i32();
    y[r] = i32() * ySign;
    z[r] = i32();
    for (let d = 0; d < DIR_COUNT; d++) {
      const s = r * DIR_COUNT + d;
      let ef = (wide ? u16() : u8()) & EXIT_MASK;
      if (dropNoMatch) ef &= ~EXIT_FLAG.NO_MATCH;
      exitFlags[s] = ef;
      doorFlags[s] = (wideDoor ? u16() : u8()) & DOOR_MASK;
      const door = str();
      if (door !== '') doorNames.set(s, door);
      if (hasInbound) {
        for (let t = u32(); t !== NO_TARGET; t = u32()) {
          inSlot.push(s);
          inExt.push(t);
        }
      }
      outStart[s] = nOut;
      for (let t = u32(); t !== NO_TARGET; t = u32()) {
        if (nOut === ext.length) {
          const grown = new Uint32Array(ext.length * 2);
          grown.set(ext);
          ext = grown;
        }
        ext[nOut++] = t;
      }
    }
  }
  outStart[slots] = nOut;

  const text: string[] = new Array<string>(marks);
  const im: Infomarks = {
    count: marks,
    type: new Uint8Array(marks),
    cls: new Uint8Array(marks),
    angle: new Int32Array(marks),
    x1: new Int32Array(marks),
    y1: new Int32Array(marks),
    z1: new Int32Array(marks),
    x2: new Int32Array(marks),
    y2: new Int32Array(marks),
    z2: new Int32Array(marks),
    text,
  };
  for (let m = 0; m < marks; m++) {
    if (esu) skipStr(); // name
    const t = str();
    if (esu) skip(9); // QDateTime (Qt 4.8 stream: u32 julian day, u32 ms, i8 spec)
    let type = u8();
    if (type > INFOMARK_TYPE.ARROW) type = INFOMARK_TYPE.TEXT;
    let cls = 0;
    let angle = 0;
    if (wideDoor) {
      cls = u8();
      if (cls > 9) cls = 0;
      angle = i32();
      if (esu) angle = Math.trunc(angle / INFOMARK_SCALE);
    }
    let x1 = i32();
    let y1 = i32();
    const z1 = i32();
    let x2 = i32();
    let y2 = i32();
    const z2 = i32();
    if (esu) {
      // transformInfomarkOnLoad: offsets in the old ESU space, then flip y.
      const H = INFOMARK_SCALE / 2;
      const T = INFOMARK_SCALE / 10;
      x1 += H;
      y1 -= H;
      x2 += H;
      y2 -= H;
      if (type === INFOMARK_TYPE.TEXT) {
        x1 += T;
        y1 += 3 * T;
        x2 += T;
        y2 += 3 * T;
      } else if (type === INFOMARK_TYPE.ARROW) {
        y1 += INFOMARK_SCALE / 20;
        x2 += T;
        y2 += T;
      }
      angle = -angle;
      y1 = -y1;
      y2 = -y2;
    }
    im.type[m] = type;
    im.cls[m] = cls;
    im.angle[m] = angle;
    im.x1[m] = x1;
    im.y1[m] = y1;
    im.z1[m] = z1;
    im.x2[m] = x2;
    im.y2[m] = y2;
    im.z2[m] = z2;
    // MMapper loadMark: non-TEXT marks lose their text; empty TEXT gets a default.
    text[m] = type !== INFOMARK_TYPE.TEXT ? '' : t === '' ? 'New Marker' : t;
  }
  if (p !== end) throw new Mm2Error(`Damaged MMapper map: ${end - p} unexpected bytes after the last infomark`);

  const byExt = new Map<number, number>();
  for (let r = 0; r < rooms; r++) byExt.set(extId[r]!, r);

  // v < 38: an inbound link A → B (stored on B) without the matching
  // outgoing link on A adds it (WorldBuilder::sanitize, "missing OUT").
  const added = new Map<number, number[]>(); // slot → target indices
  let nAdded = 0;
  for (let i = 0; i < inSlot.length; i++) {
    const bSlot = inSlot[i]!;
    const from = byExt.get(inExt[i]!);
    if (from === undefined) continue;
    const b = Math.floor(bSlot / DIR_COUNT);
    const aSlot = from * DIR_COUNT + OPPOSITE[bSlot % DIR_COUNT]!;
    const bExt = extId[b]!;
    let has = false;
    for (let j = outStart[aSlot]!; j < outStart[aSlot + 1]! && !has; j++) has = ext[j] === bExt;
    const list = added.get(aSlot);
    if (has || list?.includes(b)) continue;
    if (list) list.push(b);
    else added.set(aSlot, [b]);
    nAdded++;
  }

  // Resolve external ids to indices (dangling targets are dropped) and
  // apply MMapper's exit invariants (RawExit.cpp) on the raw target counts.
  const outTo = new Uint32Array(nOut + nAdded);
  let k = 0;
  for (let s = 0; s < slots; s++) {
    const a = outStart[s]!;
    const b = outStart[s + 1]!;
    outStart[s] = k;
    for (let j = a; j < b; j++) {
      const idx = byExt.get(ext[j]!);
      if (idx !== undefined) outTo[k++] = idx;
    }
    const extra = nAdded > 0 ? added.get(s) : undefined;
    if (extra) for (const t of extra) outTo[k++] = t;
    let f = exitFlags[s]!;
    const hasOut = b > a || extra !== undefined;
    const isExit = (f & EXIT_FLAG.EXIT) !== 0;
    const unmapped = !hasOut && isExit;
    const exit = hasOut || unmapped;
    const door = exit && ((f & EXIT_FLAG.DOOR) !== 0 || doorFlags[s] !== 0 || doorNames.has(s));
    f = exit ? f | EXIT_FLAG.EXIT : f & ~EXIT_FLAG.EXIT;
    f = door ? f | EXIT_FLAG.DOOR : f & ~EXIT_FLAG.DOOR;
    f = unmapped ? f | EXIT_FLAG.UNMAPPED : f & ~EXIT_FLAG.UNMAPPED;
    exitFlags[s] = f;
    if (!door) {
      doorFlags[s] = 0;
      doorNames.delete(s);
    }
  }
  outStart[slots] = k;

  const map: MapData = {
    version,
    roomCount: rooms,
    selected,
    x,
    y,
    z,
    extId,
    serverId,
    terrain,
    light,
    align,
    portable,
    ridable,
    sundeath,
    mobFlags,
    loadFlags,
    names,
    descs,
    areas,
    contents,
    notes,
    exitFlags,
    doorFlags,
    doorNames,
    outStart,
    outTo: k === outTo.length ? outTo : outTo.slice(0, k),
    inStart: new Uint32Array(0),
    inFrom: new Uint32Array(0),
    infomarks: im,
    byServerId: new Map(),
    byNameDesc: new Map(),
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, count: 0 },
    layers: new Map(),
  };
  buildIndexes(map);
  return map;
}

/** Hex SHA-256 prefix of the file bytes: the key learned server ids are stored under (DB `mapIds`). */
export async function mapHash(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  let s = '';
  for (let i = 0; i < 16; i++) s += d[i]!.toString(16).padStart(2, '0');
  return s;
}

