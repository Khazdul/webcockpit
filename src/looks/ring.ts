// The token's ring (stage 80 decision 16, R3): 1 px, the member's hue muted
// 25 % toward grey, with a dark outline outside it. Shared by the Group pane,
// the map and the picker's preview, so they cannot drift. Pure TS.

/** How far the hue is muted toward grey, and the grey. */
export const RING_MUTE = 0.25;
const GREY = 140;

/** The ring's colour for `rgb` (0xRRGGBB), as `[r, g, b]` 0–255. */
export function ringRgb(rgb: number, mute = RING_MUTE): [number, number, number] {
  const c = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255] as const;
  return c.map((v) => Math.round(v * (1 - mute) + GREY * mute)) as [number, number, number];
}

/** The ring's colour for `rgb` as CSS. */
export const ringCss = (rgb: number, mute = RING_MUTE): string => `rgb(${ringRgb(rgb, mute).join(' ')})`;

/** Your own marker's colour on the map (src/map/group.ts `PLAYER_COLOR`), the ring's base for yourself. */
export const SELF_COLOR = 0xffff00;
