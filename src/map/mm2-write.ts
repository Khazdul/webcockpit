// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 The WebCockpit Authors
// Derived from MMapper 26.06.0 (https://github.com/MUME/MMapper),
// Copyright (C) 2019-2026 The MMapper Authors. Modified for WebCockpit
// (2026-09-28): rewritten in TypeScript and WebGL2; see
// THIRD_PARTY_NOTICES.md "MMapper-derived code".
//
// MMapper `.mm2` writer (the inverse of src/map/mm2.ts). Pure; the
// deflate step is injectable. Used by the tests (synthetic maps) and by
// the HTML replay export, which embeds a map subset as `.mm2` bytes
// (ADR 0020 "Package notes"). Contents and notes are written as the map
// holds them (a replay subset keeps notes and empties contents, ADR 0077);
// exits refer to targets by `extId`.
//
// It writes v42 by default. Older schema versions (17 … 41) exist for the
// reader's tests: fields a version lacks are dropped, flags are cut to the
// version's width, and the reader's conversions are inverted (y flip and
// infomark offsets before 36, death terrain before 41, inbound links from
// `inStart/inFrom` before 38). A round trip therefore returns the map
// minus what that version cannot hold.

import { DIR_COUNT, INFOMARK_SCALE, INFOMARK_TYPE, type MapData } from './model';
import { MM2_MAGIC, MM2_SCHEMA as V, MM2_VERSION, mm2Compression } from './mm2';

/** Compresses to a zlib (RFC 1950) stream. */
export type Deflate = (raw: Uint8Array) => Promise<Uint8Array>;

/** Default deflate: `CompressionStream('deflate')`. */
export const deflateZlib: Deflate = async (raw) => {
  const stream = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

class Writer {
  buf = new Uint8Array(1 << 16);
  dv = new DataView(this.buf.buffer);
  p = 0;
  private room(n: number): void {
    if (this.p + n <= this.buf.length) return;
    let len = this.buf.length * 2;
    while (len < this.p + n) len *= 2;
    const b = new Uint8Array(len);
    b.set(this.buf);
    this.buf = b;
    this.dv = new DataView(b.buffer);
  }
  u8(v: number): void {
    this.room(1);
    this.buf[this.p++] = v;
  }
  u16(v: number): void {
    this.room(2);
    this.dv.setUint16(this.p, v);
    this.p += 2;
  }
  u32(v: number): void {
    this.room(4);
    this.dv.setUint32(this.p, v >>> 0);
    this.p += 4;
  }
  i32(v: number): void {
    this.room(4);
    this.dv.setInt32(this.p, v);
    this.p += 4;
  }
  str(s: string): void {
    this.u32(s.length * 2);
    this.room(s.length * 2);
    for (let i = 0; i < s.length; i++) {
      this.dv.setUint16(this.p, s.charCodeAt(i));
      this.p += 2;
    }
  }
  bytes(): Uint8Array {
    return this.buf.slice(0, this.p);
  }
}

const DEATH_TERRAIN = 15;
const INDOORS = 1;
const LOAD_DEATHTRAP = 1 << 24;

/** The uncompressed payload of `map` in schema `version` (default 42). */
export function encodeMm2Payload(map: MapData, version = MM2_VERSION): Uint8Array {
  const w = new Writer();
  const n = map.roomCount;
  const im = map.infomarks;
  const esu = version < V.newCoords;
  const wide = version >= V.largerFlags;
  const wideDoor = version >= V.doorFlags16;
  const ySign = esu ? -1 : 1;
  w.u32(n);
  w.u32(im.count);
  w.i32(map.selected.x);
  w.i32(map.selected.y * ySign);
  w.i32(map.selected.z);
  for (let r = 0; r < n; r++) {
    if (version >= V.area) w.str(map.areas[r] ?? '');
    w.str(map.names[r] ?? '');
    w.str(map.descs[r] ?? '');
    w.str(map.contents[r] ?? '');
    w.u32(map.extId[r]!);
    if (version >= V.serverId) w.u32(map.serverId[r]!);
    w.str(map.notes[r] ?? '');
    const death = version < V.deathFlag && map.terrain[r] === INDOORS && (map.loadFlags[r]! & LOAD_DEATHTRAP) !== 0;
    w.u8(death ? DEATH_TERRAIN : map.terrain[r]!);
    w.u8(map.light[r]!);
    w.u8(map.align[r]!);
    w.u8(map.portable[r]!);
    if (version >= V.ridable) w.u8(map.ridable[r]!);
    if (wide) {
      w.u8(map.sundeath[r]!);
      w.u32(map.mobFlags[r]!);
      w.u32(map.loadFlags[r]!);
    } else {
      w.u16(map.mobFlags[r]! & 0xffff);
      w.u16(map.loadFlags[r]! & 0xffff);
    }
    if (version < V.removeUpToDate) w.u8(1); // upToDate
    w.i32(map.x[r]!);
    w.i32(map.y[r]! * ySign);
    w.i32(map.z[r]!);
    for (let d = 0; d < DIR_COUNT; d++) {
      const s = r * DIR_COUNT + d;
      if (wide) w.u16(map.exitFlags[s]!);
      else w.u8(map.exitFlags[s]! & 0xff);
      if (wideDoor) w.u16(map.doorFlags[s]!);
      else w.u8(map.doorFlags[s]! & 0xff);
      w.str(map.doorNames.get(s) ?? '');
      if (version < V.noInboundLinks) {
        for (let k = map.inStart[s]!; k < map.inStart[s + 1]!; k++) w.u32(map.extId[map.inFrom[k]!]!);
        w.u32(0xffffffff);
      }
      for (let k = map.outStart[s]!; k < map.outStart[s + 1]!; k++) w.u32(map.extId[map.outTo[k]!]!);
      w.u32(0xffffffff);
    }
  }
  for (let m = 0; m < im.count; m++) {
    const type = im.type[m]!;
    let angle = im.angle[m]!;
    let x1 = im.x1[m]!;
    let y1 = im.y1[m]!;
    let x2 = im.x2[m]!;
    let y2 = im.y2[m]!;
    if (esu) {
      // Inverse of the reader's transformInfomarkOnLoad.
      const H = INFOMARK_SCALE / 2;
      const T = INFOMARK_SCALE / 10;
      y1 = -y1;
      y2 = -y2;
      angle = -angle * INFOMARK_SCALE;
      if (type === INFOMARK_TYPE.TEXT) {
        x1 -= T;
        y1 -= 3 * T;
        x2 -= T;
        y2 -= 3 * T;
      } else if (type === INFOMARK_TYPE.ARROW) {
        y1 -= INFOMARK_SCALE / 20;
        x2 -= T;
        y2 -= T;
      }
      x1 -= H;
      y1 += H;
      x2 -= H;
      y2 += H;
      w.str(''); // name
    }
    w.str(im.text[m] ?? '');
    if (esu) for (let i = 0; i < 9; i++) w.u8(0); // QDateTime
    w.u8(type);
    if (wideDoor) {
      w.u8(im.cls[m]!);
      w.i32(angle);
    }
    w.i32(x1);
    w.i32(y1);
    w.i32(im.z1[m]!);
    w.i32(x2);
    w.i32(y2);
    w.i32(im.z2[m]!);
  }
  return w.bytes();
}

/**
 * Wraps a payload as a `.mm2` file: magic, version, then (by version) a
 * length + zlib stream (≥ 34), a bare zlib stream (25–33) or the raw payload.
 */
export async function wrapMm2(
  payload: Uint8Array,
  deflate: Deflate = deflateZlib,
  version = MM2_VERSION,
): Promise<Uint8Array> {
  const mode = mm2Compression(version);
  const body = mode === 'none' ? payload : await deflate(payload);
  const head = mode === 'qcompress' ? 12 : 8;
  const out = new Uint8Array(head + body.byteLength);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MM2_MAGIC);
  dv.setUint32(4, version);
  if (mode === 'qcompress') dv.setUint32(8, payload.byteLength);
  out.set(body, head);
  return out;
}

/** `map` as a complete `.mm2` file (schema `version`, default 42). */
export function writeMm2(map: MapData, deflate: Deflate = deflateZlib, version = MM2_VERSION): Promise<Uint8Array> {
  return wrapMm2(encodeMm2Payload(map, version), deflate, version);
}
