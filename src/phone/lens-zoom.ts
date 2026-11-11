// The map lens's size and its three fixed zoom levels (ADR 0136 §4).
// Pure: no DOM, no import.
//
// Size (stage 52): the full diameter is a share of the screen's short
// side, 150 px on a 360 px wide phone, within 130 to 190 px. With less
// room the layout shrinks the lens down to `LENS_MIN_PX` and hides it
// below that (src/layout/phone-game.ts); the zoom follows the diameter, so
// the same rooms stay in view.
//
// A level is "about this many rooms across the lens": near 3, middle 5
// (the default), far 10. The map worker's zoom is a factor on MMapper's
// projection, in which a room of the player's layer is 44 CSS px wide at
// zoom 1 (src/map/view.ts `pxPerRoom`: 2640 · zoom / 60 on layer 0). So the
// zoom of a level is `lens px / (rooms × 44)`: for a 150 px lens, near
// 1.136, middle 0.682 and far 0.341, all inside the worker's limits
// (0.04 to 5). The worker gets it as an absolute zoom (`zoomTo`).

export const LENS_LEVELS = ['near', 'middle', 'far'] as const;
export type LensLevel = (typeof LENS_LEVELS)[number];

/** Rooms across the lens at each level. */
export const LENS_ROOMS: Readonly<Record<LensLevel, number>> = { near: 3, middle: 5, far: 10 };

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

/** The level a tap steps to: near → middle → far → near. */
export function nextLevel(level: LensLevel): LensLevel {
  return LENS_LEVELS[(LENS_LEVELS.indexOf(level) + 1) % LENS_LEVELS.length]!;
}

/** `level` if it is one, else the default (middle). */
export function lensLevel(level: string): LensLevel {
  return (LENS_LEVELS as readonly string[]).includes(level) ? (level as LensLevel) : 'middle';
}

/** The lens button's name for a screen reader. */
export function lensLabel(level: LensLevel): string {
  return `Map, ${level} zoom. Tap to zoom`;
}
