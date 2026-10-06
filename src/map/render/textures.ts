// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 The WebCockpit Authors
// Derived from MMapper 26.06.0 (https://github.com/MUME/MMapper),
// Copyright (C) 2019-2026 The MMapper Authors. Modified for WebCockpit
// (2026-09-28): rewritten in TypeScript and WebGL2; see
// THIRD_PARTY_NOTICES.md "MMapper-derived code".
//
// Texture catalogue (research §3.4–§3.5): which pixmap sits in which
// texture array layer, and the generated dotted-wall images. Pure; the
// WebGL side (webgl.ts) loads and uploads what this lists.
//
// MMapper groups its files into 2D texture arrays by size
// (display/Textures.cpp). The grouping does not change the output, so
// here every 128² file shares one array, trails (64²) have their own,
// and doors plus the character square (256²) share a third. Those are
// the default set's sizes; a tileset's (ADR 0082) may differ, and each
// array then takes the size of its largest file (`arraySize`).

/** Texture arrays. */
export const TEX = { A128: 0, A64: 1, A256: 2, DOTTED: 3 } as const;
export type TexArray = (typeof TEX)[keyof typeof TEX];

/** Road/trail suffix by road index (bit N=1, S=2, E=4, W=8; letters in n, e, s, w order). */
export function roadSuffix(mask: number): string {
  if (mask === 0) return 'none';
  if (mask === 15) return 'all';
  return (mask & 1 ? 'n' : '') + (mask & 4 ? 'e' : '') + (mask & 2 ? 's' : '') + (mask & 8 ? 'w' : '');
}

const TERRAIN_FILES = [
  'undefined', 'indoors', 'city', 'field', 'forest', 'hills', 'mountains', 'shallow',
  'water', 'rapids', 'underwater', 'road', 'brush', 'tunnel', 'cavern',
];
/** Mob flag file names in MOB_FLAGS bit order (parser/AbstractParser-Commands.cpp). */
export const MOB_FILES = [
  'rent', 'shop', 'weaponshop', 'armourshop', 'foodshop', 'petshop', 'guild', 'scoutguild',
  'mageguild', 'clericguild', 'warriorguild', 'rangerguild', 'aggmob', 'questmob', 'passivemob',
  'elitemob', 'smob', 'milkable', 'rattlesnake',
];
/** Load flag file names in LOAD_FLAGS bit order. */
export const LOAD_FILES = [
  'treasure', 'armour', 'weapon', 'water', 'food', 'herb', 'key', 'mule', 'horse', 'pack',
  'trained', 'rohirrim', 'warg', 'boat', 'attention', 'watch', 'clock', 'mail', 'stable',
  'whiteword', 'darkword', 'equipment', 'coach', 'ferry', 'deathtrap',
];
const DIR_FILES = ['north', 'south', 'east', 'west', 'up', 'down'];

/** Layer indices in the 128² array. */
export const L128 = {
  terrain: (t: number) => t,
  road: (mask: number) => 15 + mask,
  mob: (bit: number) => 31 + bit,
  load: (bit: number) => 50 + bit,
  noRide: 75,
  exitUp: 76,
  exitDown: 77,
  exitClimbUp: 78,
  exitClimbDown: 79,
  /** dir 0…3 (N S E W). */
  wall: (dir: number) => 80 + dir,
  /** dir 0…5 (N S E W U D). */
  streamIn: (dir: number) => 84 + dir,
  streamOut: (dir: number) => 90 + dir,
} as const;
/** Layer indices in the 256² array. */
export const L256 = {
  /** dir 0…5 (N S E W U D). */
  door: (dir: number) => dir,
  charRoomSel: 6,
} as const;

function files128(): string[] {
  const f: string[] = [];
  for (const t of TERRAIN_FILES) f.push(`terrain-${t}.png`);
  for (let m = 0; m < 16; m++) f.push(`road-${roadSuffix(m)}.png`);
  for (const m of MOB_FILES) f.push(`mob-${m}.png`);
  for (const l of LOAD_FILES) f.push(`load-${l}.png`);
  f.push('no-ride.png', 'exit-up.png', 'exit-down.png', 'exit-climb-up.png', 'exit-climb-down.png');
  for (const d of DIR_FILES.slice(0, 4)) f.push(`wall-${d}.png`);
  for (const d of DIR_FILES) f.push(`stream-in-${d}.png`);
  for (const d of DIR_FILES) f.push(`stream-out-${d}.png`);
  return f;
}

/** The pixmaps of each file-backed array, by layer (paths relative to `pixmaps/`). */
export const ARRAY_FILES: Readonly<Record<'A128' | 'A64' | 'A256', { size: number; files: readonly string[] }>> = {
  A128: { size: 128, files: files128() },
  A64: { size: 64, files: Array.from({ length: 16 }, (_, m) => `trail-${roadSuffix(m)}.png`) },
  A256: { size: 256, files: [...DIR_FILES.map((d) => `door-${d}.png`), 'char-room-sel.png'] },
};

/**
 * Largest texture-array layer edge (ADR 0082). A tileset's bigger files
 * are scaled down to it on decode; it bounds GPU memory (the 128² array
 * at 256² is ~34 MB with mipmaps).
 */
export const MAX_TILE_SIZE = 256;

/**
 * The layer edge of a file-backed array (ADR 0082): the largest decoded
 * file (width or height) in the group, capped at MAX_TILE_SIZE; the
 * nominal size when nothing decoded. Files of another size are scaled to
 * it, so the default set (every file at its nominal size) is uploaded
 * unchanged.
 */
export function arraySize(nominal: number, sizes: ReadonlyArray<{ width: number; height: number } | null>): number {
  let max = 0;
  for (const s of sizes) if (s) max = Math.max(max, s.width, s.height);
  return max === 0 ? nominal : Math.min(max, MAX_TILE_SIZE);
}

/** Mip levels of a square texture of edge `size` (down to 1 px). */
export const mipLevels = (size: number): number => Math.floor(Math.log2(size)) + 1;

/** The off-screen arrow atlas (a plain 2D texture). */
export const CHAR_ARROWS_FILE = 'char-arrows.png';

/** Pixmaps the characters layer draws on any map (the room square, the edge arrows). */
export const CHARACTER_PIXMAPS: readonly string[] = [`pixmaps/${ARRAY_FILES.A256.files[L256.charRoomSel]!}`, `pixmaps/${CHAR_ARROWS_FILE}`];

/** Every pixmap path (relative to the asset root) the renderer loads. */
export const RENDERER_PIXMAPS: readonly string[] = [
  ...ARRAY_FILES.A128.files,
  ...ARRAY_FILES.A64.files,
  ...ARRAY_FILES.A256.files,
  CHAR_ARROWS_FILE,
].map((f) => `pixmaps/${f}`);

/**
 * MMapper's generated dotted-wall mip chain for one direction
 * (display/Textures.cpp createDottedWallImages): 128 → 1 px, RGBA, rows
 * top-down as in the QImage. Uploaded without flipping (as MMapper
 * does), so row 0 lands on the south edge in world space.
 */
export function dottedWallImages(dir: number): Uint8Array<ArrayBuffer>[] {
  const out: Uint8Array<ArrayBuffer>[] = [];
  for (let i = 0; i <= 7; i++) {
    const size = 1 << (7 - i);
    const base = new Uint8Array(size * size * 4);
    const set = (x: number, y: number, a: number) => {
      const o = (y * size + x) * 4;
      base[o] = base[o + 1] = base[o + 2] = 255;
      base[o + 3] = a;
    };
    if (size >= 16) {
      const width = size === 16 ? 1 : size === 32 ? 2 : 4;
      for (let y = 0; y < width; y++) {
        for (let x = 0; x < size; x += 4) {
          set(x, y, 255);
          set(x + 1, y, 255);
        }
      }
    } else if (size === 8) {
      set(1, 0, 255);
      set(5, 0, 255);
    } else if (size === 4) {
      set(0, 0, 128);
      set(2, 0, 128);
    } else if (size === 2) {
      set(0, 0, 64);
      set(1, 0, 64);
    }
    let img = base;
    // East/west: rotate 90° clockwise about the centre (QTransform rotate(90), y down).
    if (dir === 2 || dir === 3) img = remap(img, size, (px, py) => [py, size - 1 - px]);
    // North/west: mirror both axes.
    if (dir === 0 || dir === 3) img = remap(img, size, (px, py) => [size - 1 - px, size - 1 - py]);
    out.push(img);
  }
  return out;
}

/** out(px, py) = in(src(px, py)). */
function remap(src: Uint8Array, size: number, from: (px: number, py: number) => [number, number]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(src.length);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const [sx, sy] = from(px, py);
      const s = (sy * size + sx) * 4;
      const d = (py * size + px) * 4;
      out[d] = src[s]!;
      out[d + 1] = src[s + 1]!;
      out[d + 2] = src[s + 2]!;
      out[d + 3] = src[s + 3]!;
    }
  }
  return out;
}
