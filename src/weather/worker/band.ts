// The dark band along the left edge (owner items 28, 96, 97, 99): the sky
// fades out toward the left along this curve, and so does every weather
// effect drawn over it (rain, snow, clouds, fog, lightning, stars, day life),
// so the band stays the page background. Sunrise and sunset, the moon, body
// effects and the darkness spell are not weather and reach into it.
//
// One definition: the sky's gradient and deck, and each effect's per-element
// alpha, all read it here, so moving the band moves everything together.

import { clamp } from './env';

/** The sky starts this far in from the left (share of the width): from the background to the sky over it. */
export const LEFT_DARK = 0.735;
/** It stays fully the background up to this share of LEFT_DARK, then comes in smoothly. */
export const LEFT_SOLID = 0.59;

/** How much of the sky the left fade takes back at `x` (share of LEFT_DARK): all up to LEFT_SOLID, then a smootherstep down to none (no kink at either end). */
export function leftDark(x: number): number {
  const u = clamp((x - LEFT_SOLID) / (1 - LEFT_SOLID), 0, 1);
  return 1 - u * u * u * (u * (u * 6 - 15) + 10);
}

/** How much of a weather effect shows at screen x (CSS px) on a screen `W` wide: 0 in the solid band, 1 in the sky, the sky's own curve between. */
export function bandK(x: number, W: number): number {
  return W > 0 ? 1 - leftDark(x / (W * LEFT_DARK)) : 1;
}

/** Where the solid band ends (nothing shows left of it), CSS px. */
export function bandSolid(W: number): number {
  return W * LEFT_DARK * LEFT_SOLID;
}

/** Where the band ends (everything shows right of it), CSS px. */
export function bandEnd(W: number): number {
  return W * LEFT_DARK;
}
