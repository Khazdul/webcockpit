// The map lens's sizes and its three fixed zoom levels (ADR 0136 §4).
// Pure: no DOM, no import.
//
// A level is "about this many rooms across the lens": near 3, middle 5
// (the default), far 10. The map worker's zoom is a factor on MMapper's
// projection, in which a room of the player's layer is 44 CSS px wide at
// zoom 1 (src/map/view.ts `pxPerRoom`: 2640 · zoom / 60 on layer 0). So the
// zoom of a level is `lens px / (rooms × 44)`: for the 150 px lens, near
// 1.136, middle 0.682 and far 0.341, all inside the worker's limits
// (0.04 to 5). The worker gets it as an absolute zoom (`zoomTo`).

export const LENS_LEVELS = ['near', 'middle', 'far'] as const;
export type LensLevel = (typeof LENS_LEVELS)[number];

/** Rooms across the lens at each level. */
export const LENS_ROOMS: Readonly<Record<LensLevel, number>> = { near: 3, middle: 5, far: 10 };

/** CSS px per room of the player's layer at zoom 1 (src/map/view.ts). */
export const PX_PER_ROOM = 44;

/** The lens's diameter in CSS px by size setting (M is the mockups' 150 px). */
export const LENS_PX = { s: 120, m: 150, l: 180 } as const;
export type LensSize = keyof typeof LENS_PX;

/** The diameter of a size (an unknown one is M). */
export function lensPx(size: string): number {
  return Object.hasOwn(LENS_PX, size) ? LENS_PX[size as LensSize] : LENS_PX.m;
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
