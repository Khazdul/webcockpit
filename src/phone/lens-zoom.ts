// The map lens's size and its four fixed zoom levels (ADR 0136 §4; ADR 0137's addendum of round 53k).
// Pure: no DOM, no import.
//
// Size (stage 52): the full diameter is a share of the screen's short
// side, 150 px on a 360 px wide phone, within 130 to 190 px. With less
// room the layout shrinks the lens down to `LENS_MIN_PX` and hides it
// below that (src/layout/phone-game.ts); the zoom follows the diameter, so
// the same rooms stay in view.
//
// A level is "about this many rooms across the lens". Four since round
// 53k (the owner: 0.6.1's nearest, three rooms, was too close for a lens):
// z1 5 rooms (0.6.1's middle, the default), z2 10 (0.6.1's far), z3 20 (one
// more step of the same ratio), and z4 44: far beyond a step, the whole
// neighbourhood, a room still a 3.4 px square on a 150 px lens (10 device
// px on a phone's screen). The map worker's zoom is a factor on MMapper's
// projection, in which a room of the player's layer is 44 CSS px wide at
// zoom 1 (src/map/view.ts `pxPerRoom`: 2640 · zoom / 60 on layer 0). So the
// zoom of a level is `lens px / (rooms × 44)`: for a 150 px lens 0.682,
// 0.341, 0.170 and 0.077, all inside the worker's limits (0.04 to 5) at
// every size the lens can have (96 px at z4 is 0.0496). The worker gets it
// as an absolute zoom (`zoomTo`).
//
// The zoom follows the diameter at every size, also one the user set
// (round 53k): a larger lens shows the same rooms larger, and the level is
// what changes how much of the map is in view.

export const LENS_LEVELS = ['z1', 'z2', 'z3', 'z4'] as const;
export type LensLevel = (typeof LENS_LEVELS)[number];

/** Rooms across the lens at each level. */
export const LENS_ROOMS: Readonly<Record<LensLevel, number>> = { z1: 5, z2: 10, z3: 20, z4: 44 };

/** A level's name on the settings page and for a screen reader. */
export const LENS_NAMES: Readonly<Record<LensLevel, string>> = { z1: 'near', z2: 'mid', z3: 'far', z4: 'area' };

/** CSS px per room of the player's layer at zoom 1 (src/map/view.ts). */
export const PX_PER_ROOM = 44;

/** The full diameter's limits, and the least diameter the lens is shown at, CSS px. */
export const LENS_FULL_MIN_PX = 130;
export const LENS_FULL_MAX_PX = 190;
export const LENS_MIN_PX = 96;

/**
 * The lens's full diameter on a screen whose short side is `shortSide` CSS
 * px: the mockups' 150 px at 360, in proportion elsewhere, within the
 * limits. Without a usable number: 150.
 */
export function lensFullPx(shortSide: number): number {
  if (!(shortSide > 0) || !Number.isFinite(shortSide)) return 150;
  return Math.min(LENS_FULL_MAX_PX, Math.max(LENS_FULL_MIN_PX, Math.round((shortSide * 150) / 360)));
}

/** The worker's zoom that shows `LENS_ROOMS[level]` rooms across a lens `px` wide. */
export function lensZoom(level: LensLevel, px: number): number {
  return px / (LENS_ROOMS[level] * PX_PER_ROOM);
}

/** The level a tap steps to: one further out, and from the furthest back to the nearest. */
export function nextLevel(level: LensLevel): LensLevel {
  return LENS_LEVELS[(LENS_LEVELS.indexOf(level) + 1) % LENS_LEVELS.length]!;
}

/** `level` if it is one, else the default (the nearest). */
export function lensLevel(level: string): LensLevel {
  return (LENS_LEVELS as readonly string[]).includes(level) ? (level as LensLevel) : 'z1';
}

/** The lens button's name for a screen reader. */
export function lensLabel(level: LensLevel): string {
  return `Map, ${LENS_NAMES[level]} zoom (${LENS_LEVELS.indexOf(level) + 1} of ${LENS_LEVELS.length}). Tap to zoom`;
}
