// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 The WebCockpit Authors
// Derived from MMapper 26.06.0 (https://github.com/MUME/MMapper),
// Copyright (C) 2019-2026 The MMapper Authors. Modified for WebCockpit
// (2026-09-28): rewritten in TypeScript and WebGL2; see
// THIRD_PARTY_NOTICES.md "MMapper-derived code".
//
// Colours of the map renderer (research §3–§7). Values are MMapper
// 26.06.0's defaults, which the owner's config keeps
// (configuration/configuration.cpp, global/Color.h). Ported from
// MMapper (GPL-2.0-or-later).

/** An RGBA colour, 0…1 per channel. */
export type RGBA = readonly [number, number, number, number];

export const rgb = (hex: number, a = 1): RGBA => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, a];

export const withAlpha = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], a];

export const WHITE = rgb(0xffffff);
export const BLACK = rgb(0x000000);
export const RED = rgb(0xff0000);
/** Colors::gray70. */
export const GRAY70 = rgb(0xb3b3b3);
/** Background (owner config `#2e3436`), the default of Options → Mapper "Background" (ADR 0085). */
export const BACKGROUND = rgb(0x2e3436);

/** A `#rrggbb` colour as RGBA (the map background setting, ADR 0085); anything else: `fallback`. */
export function hexRgba(hex: string, fallback: RGBA = BACKGROUND): RGBA {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  return m ? rgb(parseInt(m[1]!, 16)) : fallback;
}
/**
 * WCAG luminance above which dark ink reads better than white (as
 * src/theme/color.ts `takesDarkInk`). A map background this light (Dark
 * paper, White) gets dark connection and infomark lines
 * (ADR 0085 addendum); every dark background draws as MMapper does.
 */
export const LIGHT_BG_LUMINANCE = 0.1791;

/** WCAG relative luminance of an RGBA colour. */
export function rgbaLuminance(c: RGBA): number {
  const lin = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** Whether the map background `c` is light (dark lines then). */
export function isLightBackground(c: RGBA): boolean {
  return rgbaLuminance(c) >= LIGHT_BG_LUMINANCE;
}

/**
 * On a light background, the share of a line colour's white part taken
 * away (the colour shader's `uInk`): white → #262626, red stays red.
 */
export const LIGHT_BG_INK = 0.85;

/** STREAM and INFOMARK_RIVER ("Malibu"). */
export const WATER = rgb(0x4cd8ff);

/**
 * Named colours referenced by room instances (the `colorId` of an
 * instance, MMapper's `NamedColorEnum` subset the room meshes use).
 */
export const NC = {
  DEFAULT: 0,
  ROOM_DARK: 1,
  ROOM_NO_SUNDEATH: 2,
  WALL_REGULAR_EXIT: 3,
  WALL_NOT_MAPPED: 4,
  WALL_NO_FLEE: 5,
  WALL_RANDOM: 6,
  WALL_FALL_DAMAGE: 7,
  WALL_SPECIAL: 8,
  WALL_CLIMB: 9,
  WALL_GUARDED: 10,
  WALL_NO_MATCH: 11,
  WALL_BUG_WALL_DOOR: 12,
  VERTICAL_CLIMB: 13,
  VERTICAL_REGULAR_EXIT: 14,
} as const;

/** The palette in NC order (uploaded as a uniform array). */
export const NAMED_COLORS: readonly RGBA[] = [
  WHITE, // DEFAULT
  rgb(0xa19494), // ROOM_DARK
  rgb(0xd4c7c7), // ROOM_NO_SUNDEATH
  BLACK, // WALL_REGULAR_EXIT
  rgb(0xff7f00), // WALL_NOT_MAPPED (darkOrange1)
  rgb(0x7b3f00), // WALL_NO_FLEE
  RED, // WALL_RANDOM
  rgb(0x00ffff), // WALL_FALL_DAMAGE (cyan)
  rgb(0xcc19cc), // WALL_SPECIAL
  GRAY70, // WALL_CLIMB
  rgb(0xffff00), // WALL_GUARDED
  rgb(0x0000ff), // WALL_NO_MATCH
  rgb(0x330000), // WALL_BUG_WALL_DOOR (red20)
  rgb(0x808080), // VERTICAL_CLIMB (webGray)
  WHITE, // VERTICAL_REGULAR_EXIT
];

/** Infomark colours by class (display/Infomarks.cpp getInfomarkColor); null = the type default. */
export const INFOMARK_CLASS_COLORS: readonly (RGBA | null)[] = [
  null, // generic
  rgb(0x00ff00), // herb
  WATER, // river
  null, // place
  RED, // mob
  rgb(0xc0c0c0), // comment (gray75)
  rgb(0x8c533a), // road
  rgb(0xffff00), // object
  null, // action
  null, // locality
];

/** MMapper `textColor`: white on dark backgrounds, black on light ones (global/Color.cpp). */
export function textColor(c: RGBA): RGBA {
  const r = c[0] * 255;
  const g = c[1] * 255;
  const b = c[2] * 255;
  const brightness = Math.sqrt((r * r * 241 + g * g * 691 + b * b * 68) / (241 + 691 + 68));
  return (100 * brightness) / 255 < 50 ? WHITE : BLACK;
}
